#!/usr/bin/env python3
"""
BEWIS AS400-1-485 Vibration Sensor Gateway for FioTec
======================================================

Implements the OFFICIAL AS400 binary 0x77 protocol (per AS400_TM.pdf).
Reads triaxial G-values + tilt at 5Hz from RS485 port 1, computes PPV
(peak particle velocity), and uploads to FioTec /telemetry-4g every 30s.

Protocol (default 9600/8/N/1):
  Frame: [0x77][len][addr][cmd][data...][checksum]
  Read G-value: send "77 04 00 54 58", expect 17-byte reply with cmd 0x54
    Each axis = 4 bytes "SXYYYY" (S=sign nibble, X=integer g, Y=4-digit decimal)
    Example reply: 77 10 00 54 10 01 51 00 00 04 47 00 11 05 00 00 27
                   -> X=-0.0151g, Y=+0.0447g, Z=-1.0500g
  Read tilt: send "77 04 00 04 08", expect 17-byte reply with cmd 0x84
    Each axis = 4 bytes "SXXX.YY" (BCD compressed)
  Auto-output @ 5Hz: send "77 05 00 0C 01 12" (one-time setup)
  Save settings:    send "77 04 00 0A 0E"

The gateway:
  1. On startup, requests + parses one G frame to confirm sensor.
  2. Configures the sensor for 5Hz auto-output of G values (response cmd 0x54).
  3. Listens passively, accumulates samples for UPLOAD_INTERVAL_S.
  4. Computes peak G (per axis), estimates PPV, polls one tilt frame.
  5. Uploads to FioTec.

Deploy:
  scp gateway/as400_gateway.py root@192.168.1.100:/opt/
  scp gateway/as400_gateway.conf root@192.168.1.100:/etc/supervisor.d/
  ssh root@192.168.1.100 'supervisorctl reread && supervisorctl update && supervisorctl restart as400_gateway'
  ssh root@192.168.1.100 'tail -F /var/log/as400_gateway.log'

Secrets in /opt/.secrets:
  WEBHOOK_TOKEN=<token from FioTec UI Settings -> Webhook>
  ANON_KEY=<Supabase anon key>
  FIOTECH_URL=https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9
"""

import argparse
import json
import logging
import math
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from logging.handlers import RotatingFileHandler

try:
    import serial
except ImportError:
    print("Missing dep: pip3 install pyserial", file=sys.stderr)
    sys.exit(1)


# ---- Configuration ------------------------------------------------------
SERIAL_PORT = "/dev/tty485_1"
BAUD_RATE = 9600
DEVICE_ID = "AS400-001"
DEVICE_NAME = "AS400-001 Vibration"

UPLOAD_INTERVAL_S = 30
TILT_POLL_INTERVAL_S = 30   # polled, not auto
MAX_BATCH_SAMPLES = 600
ASSUMED_FREQ_HZ = 5.0       # used for PPV estimation when no FFT available

# AS400 binary commands
CMD_READ_G       = bytes.fromhex("7704005458")
CMD_READ_TILT    = bytes.fromhex("7704000408")
CMD_AUTO_5HZ_G   = bytes.fromhex("770500" + "0C" + "01" + "12")  # 5Hz auto, response cmd 0x54
CMD_SAVE         = bytes.fromhex("770400" + "0A" + "0E")
RESP_PREFIX      = 0x77
RESP_LEN_G       = 0x10  # full reply length
RESP_CMD_G       = 0x54
RESP_CMD_TILT    = 0x84

SECRETS_PATH = "/opt/.secrets"
LOG_PATH     = "/var/log/as400_gateway.log"


# ---- Helpers ------------------------------------------------------------
def load_secrets(path=SECRETS_PATH):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, _, v = s.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def setup_logger(debug=False):
    log = logging.getLogger("as400")
    log.setLevel(logging.DEBUG if debug else logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s",
                            datefmt="%Y-%m-%d %H:%M:%S")
    try:
        fh = RotatingFileHandler(LOG_PATH, maxBytes=5 * 1024 * 1024, backupCount=3)
        fh.setFormatter(fmt)
        log.addHandler(fh)
    except Exception as e:
        print("Could not open %s: %s" % (LOG_PATH, e), file=sys.stderr)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)
    return log


# ---- Protocol parsers ---------------------------------------------------
def _checksum_ok(frame: bytes) -> bool:
    """Per manual: checksum = sum of bytes from len through last data, mod 0x100."""
    if len(frame) < 5:
        return False
    body = frame[1:-1]
    s = sum(body) & 0xFF
    return s == frame[-1]


def parse_g_axis(b4: bytes) -> float:
    """
    Parse one 4-byte AS400 G-value field: "SXYYYY" (compressed BCD).
    Layout per manual example:
       byte0 = S(high nibble)  X(low nibble)   sign + integer-g
       byte1, byte2, byte3 = decimal portion (4 BCD digits)
    Example: 10 01 51 00  -> X=-0.0151g (S=1, X=0, decimal=0151)
             00 04 47 00  -> Y=+0.0447g (S=0, X=0, decimal=0447)
             11 05 00 00  -> Z=-1.0500g (S=1, X=1, decimal=0500)
    """
    if len(b4) != 4:
        return 0.0
    s_nibble = (b4[0] >> 4) & 0x0F
    int_nibble = b4[0] & 0x0F
    # Decimal: 4 BCD digits across bytes 1..3
    # bytes 1,2 = decimal high pair; byte3 reserved (often 00)
    # Example "01 51 00" -> "0151" -> 0.0151
    d1 = (b4[1] >> 4) & 0x0F
    d2 = b4[1] & 0x0F
    d3 = (b4[2] >> 4) & 0x0F
    d4 = b4[2] & 0x0F
    decimal = (d1 * 1000 + d2 * 100 + d3 * 10 + d4) / 10000.0
    val = float(int_nibble) + decimal
    if s_nibble & 0x01:
        val = -val
    return val


def parse_tilt_axis(b4: bytes) -> float:
    """
    Tilt is BCD compressed "SXXX.YY":
      byte0 high nibble = sign, byte0 low nibble + byte1 = integer (3 BCD digits)
      bytes 2,3 = decimal (4 BCD digits)
    Example "00 03 99 67" -> +003.9967 deg
    """
    if len(b4) != 4:
        return 0.0
    s = (b4[0] >> 4) & 0x0F
    i1 = b4[0] & 0x0F
    i2 = (b4[1] >> 4) & 0x0F
    i3 = b4[1] & 0x0F
    integer = i1 * 100 + i2 * 10 + i3
    d1 = (b4[2] >> 4) & 0x0F
    d2 = b4[2] & 0x0F
    d3 = (b4[3] >> 4) & 0x0F
    d4 = b4[3] & 0x0F
    decimal = (d1 * 1000 + d2 * 100 + d3 * 10 + d4) / 10000.0
    val = float(integer) + decimal
    if s & 0x01:
        val = -val
    return val


def parse_response(frame: bytes):
    """Returns ('g', (x,y,z)) or ('tilt', (x,y,z)) or (None, None)."""
    if len(frame) < 5 or frame[0] != RESP_PREFIX:
        return None, None
    if not _checksum_ok(frame):
        return None, None
    cmd = frame[3]
    data = frame[4:-1]
    if cmd == RESP_CMD_G and len(data) == 12:
        return "g", (parse_g_axis(data[0:4]), parse_g_axis(data[4:8]), parse_g_axis(data[8:12]))
    if cmd == RESP_CMD_TILT and len(data) == 12:
        return "tilt", (parse_tilt_axis(data[0:4]), parse_tilt_axis(data[4:8]), parse_tilt_axis(data[8:12]))
    return None, None


def read_one_frame(ser, timeout_s=2.0):
    """Read one valid 0x77 frame from serial. Resyncs on prefix byte."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        b = ser.read(1)
        if not b:
            continue
        if b[0] != RESP_PREFIX:
            continue
        # Read length byte
        ln = ser.read(1)
        if not ln:
            continue
        total_len = ln[0]  # length includes itself through checksum
        rest = ser.read(total_len - 1)  # rest after length
        if len(rest) != total_len - 1:
            continue
        frame = bytes([RESP_PREFIX, total_len]) + rest
        if _checksum_ok(frame):
            return frame
    return None


# ---- PPV computation ----------------------------------------------------
def compute_payload(g_samples, tilt_latest):
    """
    g_samples: list of (x_g, y_g, z_g) tuples
    tilt_latest: (x_deg, y_deg, z_deg) or None
    Returns FioTec-canonical decoded dict.
    """
    decoded = {}
    if g_samples:
        xs = [s[0] for s in g_samples]
        ys = [s[1] for s in g_samples]
        zs = [s[2] for s in g_samples]
        # Peak (signed peak preserves direction)
        decoded["accel_x_g"] = round(max(xs, key=abs), 4)
        decoded["accel_y_g"] = round(max(ys, key=abs), 4)
        decoded["accel_z_g"] = round(max(zs, key=abs), 4)
        # PPV estimate (no FFT available -- use assumed dominant freq)
        # PPV_mm_s = |peak_g| * 9810 / (2 pi f)
        f = ASSUMED_FREQ_HZ
        ppv_x = abs(decoded["accel_x_g"]) * 9810.0 / (2 * math.pi * f)
        ppv_y = abs(decoded["accel_y_g"]) * 9810.0 / (2 * math.pi * f)
        # AS400 Z-axis usually = gravity (~1g). Subtract 1g before estimating PPV.
        z_dyn = max((abs(z) - 1.0 for z in zs), default=0.0)
        ppv_z = max(z_dyn, 0.0) * 9810.0 / (2 * math.pi * f)
        decoded["ppv_x_mm_s"]        = round(ppv_x, 4)
        decoded["ppv_y_mm_s"]        = round(ppv_y, 4)
        decoded["ppv_z_mm_s"]        = round(ppv_z, 4)
        decoded["ppv_max_mm_s"]      = round(max(ppv_x, ppv_y, ppv_z), 4)
        decoded["ppv_resultant_mm_s"] = round(math.sqrt(ppv_x * ppv_x + ppv_y * ppv_y + ppv_z * ppv_z), 4)
        decoded["vibration_dominant_freq_hz"] = ASSUMED_FREQ_HZ
        decoded["ppv_source"] = "edge_estimated"
        decoded["sample_count"] = len(g_samples)
        # RMS (useful diagnostic)
        decoded["accel_rms_g"] = round(math.sqrt(statistics.fmean([
            x * x + y * y + (z - 1.0) * (z - 1.0)
            for x, y, z in g_samples
        ])), 4)
    if tilt_latest is not None:
        tx, ty, tz = tilt_latest
        decoded["tilt_x_deg"] = round(tx, 3)
        decoded["tilt_y_deg"] = round(ty, 3)
        decoded["tilt_z_deg"] = round(tz, 3)
    decoded["battery"] = 100  # AS400-1 is line-powered
    return decoded


# ---- Uploader -----------------------------------------------------------
class FioTecUploader(object):
    def __init__(self, base_url, token, anon_key, log):
        self.url = "%s/telemetry-4g?token=%s" % (base_url.rstrip("/"), token)
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer %s" % anon_key,
            "User-Agent": "FioTec-AS400-Gateway/3.0",
        }
        self.log = log
        self.ok = 0
        self.fail = 0

    def send(self, decoded):
        if not decoded:
            return False
        body = {
            "device_id": DEVICE_ID,
            "device_name": DEVICE_NAME,
            "timestamp": int(time.time()),
            "application": "AS400 Vibration",
            "data": decoded,
        }
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.url, data=payload, headers=self.headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if 200 <= resp.status < 300:
                    self.ok += 1
                    self.log.info(
                        "OK upload (status=%d, ppv_max=%.4f mm/s, n=%d, ok/fail=%d/%d)",
                        resp.status,
                        decoded.get("ppv_max_mm_s", 0.0),
                        decoded.get("sample_count", 0),
                        self.ok, self.fail,
                    )
                    return True
                self.log.warning("Non-2xx response: %d", resp.status)
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
                    help="Print parsed frames; do not upload")
    ap.add_argument("--port", default=SERIAL_PORT)
    ap.add_argument("--baud", type=int, default=BAUD_RATE)
    ap.add_argument("--no-config", action="store_true",
                    help="Skip auto-output configuration; just listen")
    args = ap.parse_args()

    log = setup_logger(args.debug)
    log.info("=" * 60)
    log.info("BEWIS AS400 Gateway v3.0 start (port=%s baud=%d device=%s)",
             args.port, args.baud, DEVICE_ID)

    secrets = load_secrets()
    base_url = secrets.get("FIOTECH_URL",
                           "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9")
    token = secrets.get("WEBHOOK_TOKEN")
    anon = secrets.get("ANON_KEY")
    if not args.debug and (not token or not anon):
        log.error("Missing WEBHOOK_TOKEN or ANON_KEY in %s", SECRETS_PATH)
        sys.exit(1)

    uploader = None if args.debug else FioTecUploader(base_url, token, anon, log)

    # Open serial with retry
    ser = None
    while ser is None:
        try:
            ser = serial.Serial(args.port, args.baud, timeout=1)
            log.info("Serial open: %s @ %d", args.port, args.baud)
        except Exception as e:
            log.error("Serial open failed: %s -- retry in 5s", e)
            time.sleep(5)

    # Probe sensor
    log.info("Probing sensor (one G read)...")
    ser.reset_input_buffer()
    ser.write(CMD_READ_G)
    ser.flush()
    frame = read_one_frame(ser, timeout_s=2.0)
    if frame:
        kind, vals = parse_response(frame)
        if kind == "g":
            log.info("Sensor OK. G-values: X=%+.4fg Y=%+.4fg Z=%+.4fg", *vals)
        else:
            log.warning("Got frame but not G-response: %s", frame.hex())
    else:
        log.warning("No response to G-read probe; sensor may be in auto-output mode already")

    # Configure 5Hz auto-output of G values
    if not args.no_config:
        log.info("Setting auto-output 5Hz G values...")
        ser.reset_input_buffer()
        ser.write(CMD_AUTO_5HZ_G)
        ser.flush()
        time.sleep(0.3)
        # Drain ack frame
        try:
            ack = read_one_frame(ser, timeout_s=1.0)
            if ack:
                log.info("Auto-config ack: %s", ack.hex())
        except Exception:
            pass

    samples = []          # list of (x_g, y_g, z_g)
    tilt_latest = None
    last_upload = time.time()
    last_tilt_poll = 0.0

    try:
        while True:
            # Poll one tilt reading periodically (interrupts auto-output briefly)
            if time.time() - last_tilt_poll >= TILT_POLL_INTERVAL_S:
                ser.write(CMD_READ_TILT)
                ser.flush()
                tf = read_one_frame(ser, timeout_s=1.0)
                if tf:
                    kind, vals = parse_response(tf)
                    if kind == "tilt":
                        tilt_latest = vals
                        if args.debug:
                            log.debug("tilt %+.3f %+.3f %+.3f deg", *vals)
                last_tilt_poll = time.time()

            # Read one auto-output frame
            frame = read_one_frame(ser, timeout_s=1.0)
            if frame:
                kind, vals = parse_response(frame)
                if kind == "g":
                    samples.append(vals)
                    if len(samples) > MAX_BATCH_SAMPLES:
                        samples = samples[-MAX_BATCH_SAMPLES:]
                    if args.debug:
                        log.debug("g %+.4f %+.4f %+.4f", *vals)
                elif kind == "tilt":
                    tilt_latest = vals

            now = time.time()
            if now - last_upload >= UPLOAD_INTERVAL_S:
                if samples or tilt_latest is not None:
                    decoded = compute_payload(samples, tilt_latest)
                    if args.debug:
                        log.info("DEBUG decoded=%s", json.dumps(decoded))
                    elif uploader is not None:
                        uploader.send(decoded)
                    samples = []  # tilt_latest persists across windows
                else:
                    log.warning("No samples in last %ds -- sensor silent?", UPLOAD_INTERVAL_S)
                last_upload = now

    except KeyboardInterrupt:
        log.info("Interrupted; flushing")
        if uploader is not None and (samples or tilt_latest is not None):
            uploader.send(compute_payload(samples, tilt_latest))
    finally:
        try:
            if ser:
                ser.close()
        except Exception:
            pass
        log.info("AS400 Gateway stopped")


if __name__ == "__main__":
    main()
