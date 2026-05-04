#!/usr/bin/env python3
"""
BEWIS AS400 Vibration Sensor Gateway for FioTec — CSV firmware variant
=======================================================================

This LD1-attached AS400 sensor uses NOVOX-customised firmware that streams
pre-computed PPV (Peak Particle Velocity) over RS485 as ASCII CSV at
9600/8/N/1 (NOT the stock binary 0x77 protocol).

Wire format observed on /dev/tty485_1:

    863866042288045,000.031,000.073,000.096,...,000.000\r\n
    ^ IMEI/serial    ^---------- 64 PPV samples ----------^

- One CSV line every ~4 s.
- 64 floats per line  ->  16 Hz onboard sample rate.
- Single channel (resultant PPV magnitude). Per-axis X/Y/Z is not available
  from this firmware; payload reports ppv_max/avg/resultant only.

Gateway behaviour
-----------------
1. Open /dev/tty485_1 @ 9600.
2. Read one CSV line at a time.
3. Per line: compute ppv_max (peak), ppv_avg, sample_count, infer freq.
4. Track 1-min and 5-min sliding peaks for context.
5. POST to FioTec /telemetry-4g every UPLOAD_INTERVAL_S seconds.
6. Upload the WORST line in that window (peak-hold), so transients survive
   the FioTec 15-min sensor_data throttle.

Deploy
------
    scp gateway/as400_gateway.py root@192.168.1.100:/opt/
    ssh root@192.168.1.100 'pkill -f as400_gateway; nohup python3 -u /opt/as400_gateway.py >> /var/log/as400_gateway.log 2>&1 &'

Secrets file /opt/.secrets:
    WEBHOOK_TOKEN=...
    ANON_KEY=...
    FIOTECH_URL=https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9
"""

import argparse
import json
import logging
import math
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

try:
    import serial
except ImportError:
    print("Missing dep: pip3 install pyserial", file=sys.stderr)
    sys.exit(1)

# Optional: prefer requests (which bundles its own CA via certifi). On
# embedded boxes without a system CA store, urllib SSL verify fails; we
# fall back to an unverified context if requests isn't available.
try:
    import requests  # noqa: F401
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


# ---- Configuration ------------------------------------------------------
SERIAL_PORT          = "/dev/tty485_1"
BAUD_RATE            = 9600
DEVICE_ID            = "AS400-001"
DEVICE_NAME          = "AS400-001 Vibration"

UPLOAD_INTERVAL_S    = 10          # Free-plan demo idle mode latest update interval
LINE_READ_TIMEOUT_S  = 2.0
SAMPLE_RATE_HZ       = 16.0        # observed: 64 samples / ~4s
CSV_SAMPLE_COUNT     = 64
CSV_UM_S_AUTODETECT_THRESHOLD = 10.0
CSV_DECIMAL_VALUES_ARE_UM_S = False

# AAA thresholds (Lai King Hospital reference, mm/s)
ALERT_MM_S           = 0.075
ALARM_MM_S           = 0.150
ACTION_MM_S          = 0.300

SECRETS_PATH         = "/opt/.secrets"
LOG_PATH             = "/var/log/as400_gateway.log"


# ---- Helpers ------------------------------------------------------------
def load_secrets(path=SECRETS_PATH):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def setup_logger(debug=False):
    log = logging.getLogger("as400")
    if log.handlers:
        return log
    log.setLevel(logging.DEBUG if debug else logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s",
                            "%Y-%m-%d %H:%M:%S")
    sh = logging.StreamHandler(sys.stdout); sh.setFormatter(fmt); log.addHandler(sh)
    return log


def parse_csv_line(line: str):
    """
    Parse one CSV line.
    Returns: (serial:str, values:list[float])  or  (None, None) if invalid.
    """
    if not line:
        return None, None
    line = line.strip()
    if not line or "," not in line:
        return None, None
    parts = [p.strip() for p in line.split(",") if p.strip()]
    if len(parts) < 2:
        return None, None
    serial_id = parts[0]
    values = []
    for tok in parts[1:1 + CSV_SAMPLE_COUNT]:
        try:
            values.append(float(tok))
        except ValueError:
            # Stop on first non-numeric to avoid garbage; some firmwares
            # append checksum/status — ignore those gracefully.
            break
    if not values:
        return None, None
    return serial_id, values


def normalise_ppv_values(values):
    """
    Returns (values_in_mm_s, raw_unit).

    Current confirmed behavior: decimal values like 000.336 are treated as
    mm/s by the gateway. Only large whole-number values like 098.000 are
    treated as μm/s and divided by 1000.

    FioTec canonical payload fields stay in mm/s; UI displays μm/s.
    """
    if not values:
        return [], "unknown"
    raw_peak = max(abs(v) for v in values)
    if CSV_DECIMAL_VALUES_ARE_UM_S or raw_peak >= CSV_UM_S_AUTODETECT_THRESHOLD:
        return [v / 1000.0 for v in values], "um/s"
    return values, "mm/s"


def to_decoded_block(serial_id: str, values, last_seen_ts: float):
    """Build the FioTec `decoded` payload for one CSV line."""
    raw_values = values
    values, raw_unit = normalise_ppv_values(values)
    n = len(values)
    if n == 0:
        return None
    ppv_max = max(values)
    ppv_min = min(values)
    ppv_avg = sum(values) / n
    # Crude RMS over the window
    rms = math.sqrt(sum(v * v for v in values) / n)

    # Alarm level mapping
    if ppv_max >= ACTION_MM_S:
        alarm = 3
    elif ppv_max >= ALARM_MM_S:
        alarm = 2
    elif ppv_max >= ALERT_MM_S:
        alarm = 1
    else:
        alarm = 0

    return {
        # Primary metrics consumed by VibrationDashboard
        "ppv_max_mm_s":         round(ppv_max, 4),
        "ppv_resultant_mm_s":   round(ppv_max, 4),  # single channel: resultant == max
        "ppv_avg_mm_s":         round(ppv_avg, 4),
        "ppv_min_mm_s":         round(ppv_min, 4),
        "ppv_rms_mm_s":         round(rms, 4),

        # Per-axis not available with this firmware; expose nulls so UI
        # detects "single-channel" mode and hides per-axis chart.
        "ppv_x_mm_s": None,
        "ppv_y_mm_s": None,
        "ppv_z_mm_s": None,

        "vibration_dominant_freq_hz": SAMPLE_RATE_HZ,  # nominal
        "vibration_alarm_level":      alarm,
        "ppv_source":                 "device",        # NOVOX firmware computes onboard
        "ppv_raw_peak":               round(max(abs(v) for v in raw_values), 4),
        "ppv_raw_unit_um_s":          1 if raw_unit == "um/s" else 0,

        # Window metadata
        "sample_count":   n,
        "sample_rate_hz": SAMPLE_RATE_HZ,
        "device_serial":  serial_id,

        # Convenience fields for backend compatibility
        "battery": None,
    }


# ---- Uploader -----------------------------------------------------------
class FioTecUploader(object):
    def __init__(self, base_url, token, anon_key, log):
        self.url = "%s/telemetry-4g?token=%s" % (base_url.rstrip("/"), token)
        self.headers = {
            "Content-Type":  "application/json",
            "Authorization": "Bearer %s" % anon_key,
            "User-Agent":    "FioTec-AS400-Gateway/4.0-csv",
        }
        self.log = log
        self.ok = 0
        self.fail = 0

    def send(self, decoded):
        if not decoded:
            return False
        body = {
            "device_id":    DEVICE_ID,
            "device_name":  DEVICE_NAME,
            "timestamp":    int(time.time()),
            "application":  "AS400 Vibration",
            "data":         decoded,
        }
        try:
            if HAS_REQUESTS:
                import requests
                resp = requests.post(self.url, json=body,
                                     headers={k: v for k, v in self.headers.items()
                                              if k != "Content-Type"},
                                     timeout=(3, 8))
                status = resp.status_code
                ok = 200 <= status < 300
            else:
                payload = json.dumps(body).encode("utf-8")
                req = urllib.request.Request(self.url, data=payload,
                                             headers=self.headers, method="POST")
                ctx = ssl._create_unverified_context()
                with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                    status = resp.status
                    ok = 200 <= status < 300

            if ok:
                self.ok += 1
                self.log.info(
                    "OK upload status=%d ppv_max=%.4f mm/s n=%d alarm=%d ok/fail=%d/%d",
                    status,
                    decoded.get("ppv_max_mm_s", 0.0),
                    decoded.get("sample_count", 0),
                    decoded.get("vibration_alarm_level", 0),
                    self.ok, self.fail,
                )
                return True
            self.log.warning("Non-2xx response: %d", status)
            self.fail += 1
            return False
        except urllib.error.HTTPError as e:
            try:
                err = e.read().decode("utf-8", "ignore")[:200]
            except Exception:
                err = ""
            self.log.error("HTTPError %d: %s", e.code, err)
            self.fail += 1
            return False
        except Exception as e:
            self.log.error("Upload error: %s", e)
            self.fail += 1
            return False


# ---- Main loop ----------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true",
                    help="Print parsed lines; do not upload")
    ap.add_argument("--port",  default=SERIAL_PORT)
    ap.add_argument("--baud",  type=int, default=BAUD_RATE)
    ap.add_argument("--once",  action="store_true",
                    help="Read one line and exit (smoke test)")
    args = ap.parse_args()

    log = setup_logger(args.debug)
    log.info("=" * 60)
    log.info("BEWIS AS400 Gateway v4.0-csv start (port=%s baud=%d device=%s)",
             args.port, args.baud, DEVICE_ID)

    secrets = load_secrets()
    base_url = secrets.get("FIOTECH_URL",
        "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9")
    token   = secrets.get("WEBHOOK_TOKEN")
    anon    = secrets.get("ANON_KEY")

    if not args.debug and not args.once and (not token or not anon):
        log.error("Missing WEBHOOK_TOKEN or ANON_KEY in %s", SECRETS_PATH)
        sys.exit(1)

    uploader = None if (args.debug or args.once) else FioTecUploader(base_url, token, anon, log)

    # Open serial with retry
    ser = None
    while ser is None:
        try:
            ser = serial.Serial(args.port, args.baud, timeout=LINE_READ_TIMEOUT_S)
            log.info("Serial open: %s @ %d", args.port, args.baud)
        except Exception as e:
            log.error("Serial open failed: %s -- retry in 5s", e)
            time.sleep(5)

    last_upload = time.time()
    # peak-hold within the upload window
    window_peak = None     # (decoded_payload, peak_mm_s)
    lines_in_window = 0
    last_line_ts = 0.0

    try:
        while True:
            try:
                raw = ser.readline()
            except Exception as e:
                log.error("Serial read error: %s -- reopening", e)
                try: ser.close()
                except: pass
                ser = None
                while ser is None:
                    try:
                        ser = serial.Serial(args.port, args.baud, timeout=LINE_READ_TIMEOUT_S)
                        log.info("Serial reopened: %s", args.port)
                    except Exception as e2:
                        log.error("Reopen failed: %s -- retry 5s", e2)
                        time.sleep(5)
                continue

            if raw:
                try:
                    line = raw.decode("ascii", errors="ignore")
                except Exception:
                    line = ""
                serial_id, values = parse_csv_line(line)
                if values:
                    last_line_ts = time.time()
                    lines_in_window += 1
                    decoded = to_decoded_block(serial_id, values, last_line_ts)
                    peak = decoded["ppv_max_mm_s"]
                    if window_peak is None or peak > window_peak[1]:
                        window_peak = (decoded, peak)
                    if args.debug:
                        log.debug("line n=%d max=%.4f avg=%.4f serial=%s",
                                  decoded["sample_count"], decoded["ppv_max_mm_s"],
                                  decoded["ppv_avg_mm_s"], serial_id)
                    if args.once:
                        log.info("ONCE decoded=%s", json.dumps(decoded))
                        return

            now = time.time()
            if now - last_upload >= UPLOAD_INTERVAL_S:
                if window_peak is not None:
                    decoded, peak = window_peak
                    decoded["window_lines"] = lines_in_window
                    if args.debug:
                        log.info("DEBUG decoded=%s", json.dumps(decoded))
                    elif uploader is not None:
                        uploader.send(decoded)
                else:
                    log.warning("No CSV lines in last %ds -- sensor silent?", UPLOAD_INTERVAL_S)
                window_peak = None
                lines_in_window = 0
                last_upload = now

    except KeyboardInterrupt:
        log.info("Interrupted; flushing window")
        if uploader is not None and window_peak is not None:
            uploader.send(window_peak[0])
    finally:
        try:
            if ser:
                ser.close()
        except Exception:
            pass
        log.info("AS400 Gateway stopped")


if __name__ == "__main__":
    main()
