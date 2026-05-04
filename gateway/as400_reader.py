#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AS400 NOVOX-CSV Vibration Reader (in-process plugin for HY108 main.py)
=====================================================================
Runs as a background thread inside the existing /opt/main.py gateway so
that we share a single Python interpreter, one `requests` import, and
one TLS stack — required because the HaaS506-LD1 only has ~6-18MB free
RAM and a second standalone Python process gets OOM-killed.

Wire format observed on /dev/tty485_1 @ 9600 8N1 (NOVOX customised firmware):
    863866042288045,000.031,000.073,...,000.000\r\n
    └─ 15-digit IMEI/serial   └─ 64 floats = PPV samples

Public entry point:
    start_as400_thread(upload_fn, port="/dev/tty485_1", baud=9600,
                       device_id="AS400-001",
                       device_name="AS400-001 Vibration",
                       upload_window_s=10)

`upload_fn(payload_dict)` is the host gateway's existing FioTec upload
function (e.g. main.upload_to_fiotech). The thread peak-holds within
upload_window_s and posts a flat dict mirroring HY108's payload shape.
Default 10s upload is the Free-plan demo idle mode: realtime-ish latest values
without exceeding Supabase Free too quickly.
"""

import time
import threading

try:
    import serial  # already imported by main.py
except ImportError:
    serial = None

# AAA thresholds (Lai King Hospital reference) — mm/s PPV
ALERT_MM_S  = 0.075
ALARM_MM_S  = 0.150
ACTION_MM_S = 0.300
SAMPLE_RATE_HZ = 16.0
CSV_SAMPLE_COUNT = 64
CSV_UM_S_AUTODETECT_THRESHOLD = 10.0
CSV_DECIMAL_VALUES_ARE_UM_S = False


def _alarm_level(ppv):
    if ppv >= ACTION_MM_S:
        return 3
    if ppv >= ALARM_MM_S:
        return 2
    if ppv >= ALERT_MM_S:
        return 1
    return 0


def _parse_csv_line(line):
    """Parse `IMEI,v0,v1,...,vN` -> (serial, [floats]). Returns (None, [])
    if the line is not a valid sample line."""
    if not line:
        return None, []
    parts = line.strip().split(",")
    if len(parts) < 2:
        return None, []
    serial_id = parts[0].strip()
    if not serial_id or not serial_id[:1].isdigit():
        return None, []
    vals = []
    for tok in parts[1:1 + CSV_SAMPLE_COUNT]:
        tok = tok.strip()
        if not tok:
            continue
        try:
            vals.append(float(tok))
        except ValueError:
            break
    return serial_id, vals


def _normalise_ppv_values(vals):
    """Return (values_in_mm_s, raw_unit).

    Current confirmed behavior: decimal values like `000.336` are treated as
    mm/s by the gateway. Only large whole-number values like `098.000` are
    treated as μm/s and divided by 1000.

    FioTec canonical fields remain `*_mm_s`; the frontend displays μm/s.
    """
    if not vals:
        return [], "unknown"
    raw_peak = max(abs(v) for v in vals)
    if CSV_DECIMAL_VALUES_ARE_UM_S or raw_peak >= CSV_UM_S_AUTODETECT_THRESHOLD:
        return [v / 1000.0 for v in vals], "um/s"
    return vals, "mm/s"


def _build_payload(device_id, device_name, serial_id, peak, raw_peak, raw_unit,
                   peak_n, line_count):
    if peak is None:
        return None
    abs_peak = abs(peak)
    return {
        "device_id":             device_id,
        "device_name":           device_name,
        "timestamp":             int(time.time()),
        # Vibration decoded fields (top-level, mirrors HY108 pattern)
        "ppv_max_mm_s":          round(abs_peak, 4),
        "ppv_resultant_mm_s":    round(abs_peak, 4),
        "vibration_alarm_level": _alarm_level(abs_peak),
        "vibration_dominant_freq_hz": None,
        "ppv_source":            "device",
        "ppv_raw_peak":          round(abs(raw_peak), 4),
        "ppv_raw_unit_um_s":     1 if raw_unit == "um/s" else 0,
        "sample_rate_hz":        SAMPLE_RATE_HZ,
        "sample_count":          peak_n,
        "lines_in_window":       line_count,
        "sensor_serial":         serial_id,
        "manufacturer":          "BEWIS",
        "model":                 "AS400",
        # Per-axis not available on this single-channel firmware
        "ppv_x_mm_s":            None,
        "ppv_y_mm_s":            None,
        "ppv_z_mm_s":            None,
    }


def _reader_loop(upload_fn, port, baud, device_id, device_name,
                 upload_window_s, log):
    if serial is None:
        log("[AS400] pyserial not available — thread exiting")
        return

    ser = None
    backoff = 1
    window_start = time.time()
    peak = None
    raw_peak = 0.0
    peak_raw_unit = "unknown"
    peak_n = 0
    last_serial = ""
    line_count = 0

    while True:
        try:
            if ser is None:
                ser = serial.Serial(port=port, baudrate=baud,
                                    bytesize=serial.EIGHTBITS,
                                    parity=serial.PARITY_NONE,
                                    stopbits=serial.STOPBITS_ONE,
                                    timeout=2.0)
                log("[AS400] Serial open: %s @ %d" % (port, baud))
                backoff = 1

            raw = ser.readline()
            if raw:
                try:
                    line = raw.decode("ascii", "ignore")
                except Exception:
                    line = ""
                sid, vals = _parse_csv_line(line)
                if sid and vals:
                    last_serial = sid
                    line_count += 1
                    normalised_vals, raw_unit = _normalise_ppv_values(vals)
                    if not normalised_vals:
                        continue
                    line_max = max(abs(v) for v in normalised_vals)
                    if peak is None or line_max > peak:
                        peak = line_max
                        raw_peak = max(abs(v) for v in vals)
                        peak_raw_unit = raw_unit
                        peak_n = len(normalised_vals)

            now = time.time()
            if now - window_start >= upload_window_s:
                if peak is not None:
                    payload = _build_payload(device_id, device_name,
                                             last_serial, peak, raw_peak,
                                             peak_raw_unit, peak_n, line_count)
                    try:
                        upload_fn(payload)
                        log("[AS400] upload ppv_max=%.4f mm/s raw_peak=%.3f %s alarm=%d lines=%d"
                            % (peak, raw_peak, peak_raw_unit, _alarm_level(peak), line_count))
                    except Exception as e:
                        log("[AS400] upload error: %s" % e)
                else:
                    log("[AS400] no data in last %ds window" % upload_window_s)
                window_start = now
                peak = None
                raw_peak = 0.0
                peak_raw_unit = "unknown"
                peak_n = 0
                line_count = 0

        except Exception as e:
            log("[AS400] reader error: %s — reopening in %ds" % (e, backoff))
            try:
                if ser is not None:
                    ser.close()
            except Exception:
                pass
            ser = None
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)


def start_as400_thread(upload_fn,
                       port="/dev/tty485_1",
                       baud=9600,
                       device_id="AS400-001",
                       device_name="AS400-001 Vibration",
                       upload_window_s=10,
                       log=None):
    if log is None:
        log = print
    t = threading.Thread(
        target=_reader_loop,
        args=(upload_fn, port, baud, device_id, device_name,
              upload_window_s, log),
        name="as400-reader",
        daemon=True,
    )
    t.start()
    log("[AS400] reader thread started (port=%s window=%ds)"
        % (port, upload_window_s))
    return t
