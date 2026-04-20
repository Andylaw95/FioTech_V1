#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HY108-1 Sound Level Meter → FioTec Cloud Gateway
HY108-1 噪声计 → FioTec云端网关
=================================================
Decoder for HY108-1 running on HaaS506-LD1 RTU (CPython 3.10).
HaaS506-LD1 RTU上运行的HY108-1解码器 (CPython 3.10)。

Hardware 硬件: HaaS506-LD1 (Alibaba Cloud IoT RTU)
Sensor 传感器: HY108-1 Digital Sound Level Meter (湖南声仪 HY108-1)
Interface 接口: USB-RS232 (PL2303, /dev/ttyUSB0), 9600 baud, 8N1
Protocol 协议: Proprietary command-response (reverse-engineered / 逆向工程)

Data Flow / 数据流:
  HY108-1 → RS232 → PL2303 USB → HaaS506 /dev/ttyUSB0 → WiFi → HTTP POST → FioTec /telemetry-4g

Protocol Specification (Reverse-Engineered):
  Commands (single ASCII byte):    'M' (0x4D) → LAFmax (max A-weighted Fast)                → 9-byte response
    'P' (0x50) → LCPeak (C-weighted Peak level)              → 9-byte response
    'L' (0x4C) → LAF (instantaneous A-weighted Fast)         → 9-byte response
    'N' (0x4E) → LAFmin (min A-weighted Fast)                → 9-byte response
    'S' (0x53) → Status query                                → 6-byte response

  9-byte command response frame:
    [0x01] [5×ASCII dB] [0x00] [SUM(bytes 1..5) & 0xFF] [0xFF]

  6-byte status frame:
    [0x01] [b1] [b2] [b3] [b4] [0xFF]
"""

import time
import json
import os
import math
import collections
import serial
import requests

# ═══════════════════════════════════════════════════════════════
# Secrets Loading / 密钥加载
# ═══════════════════════════════════════════════════════════════
# Secrets are loaded from /opt/.secrets (chmod 600, root-only).
# Fallback: environment variables. Hardcoded values are NOT used.
# See SECURITY_AUDIT_REPORT.md §1.2 for rationale.

SECRETS_PATH = "/opt/.secrets"

def _load_secrets(path):
    """Load KEY=VALUE pairs from secrets file."""
    secrets = {}
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    secrets[k.strip()] = v.strip()
    except FileNotFoundError:
        print("[WARN] Secrets file not found: %s — using environment variables" % path)
    except PermissionError:
        print("[ERR] Cannot read secrets file: %s — check permissions" % path)
    return secrets

_secrets = _load_secrets(SECRETS_PATH)

def _get_secret(name, default=""):
    """Get secret from file, then env, then default."""
    return _secrets.get(name, os.environ.get(name, default))

# ═══════════════════════════════════════════════════════════════
# Configuration / 配置参数
# ═══════════════════════════════════════════════════════════════

# Serial port — PL2303 USB-to-RS232 adapter
SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 9600

# FioTec credentials — loaded from /opt/.secrets (NOT hardcoded)
FIOTECH_URL   = _get_secret("FIOTECH_URL")
WEBHOOK_TOKEN = _get_secret("WEBHOOK_TOKEN")
ANON_KEY      = _get_secret("ANON_KEY")
DEVICE_ID     = _get_secret("DEVICE_ID", "HY108-001")

# ═══════════════════════════════════════════════════════════════
# Optional / 可选参数
# ═══════════════════════════════════════════════════════════════

UPLOAD_INTERVAL = 5   # seconds between readings (2-60)
RETRY_COUNT = 2

# ── Adaptive upload (AI smart sampling) ─────────────────────────
INTERVAL_NORMAL  = 60   # seconds between uploads in quiet mode
INTERVAL_ANOMALY = 1    # seconds between uploads during anomaly burst
ANOMALY_ZSCORE   = 2.0  # standard deviations above rolling mean → anomaly
ANOMALY_SPIKE    = 10.0 # dB sudden jump from last reading → anomaly
ANOMALY_HOLDOFF  = 30   # extra cycles to stay in anomaly mode after event clears
ROLLING_WINDOW   = 20   # readings kept for rolling mean/stddev calculation

# ═══════════════════════════════════════════════════════════════
# Input Validation / 输入验证
# ═══════════════════════════════════════════════════════════════
# Reject sensor readings outside physically possible ranges.
# See SECURITY_AUDIT_REPORT.md §2.3 for rationale.

VALID_RANGES = {
    "noise_laf":     (20.0, 140.0),   # dB(A) A-weighted Fast instantaneous
    "noise_lafmax":  (20.0, 140.0),   # dB(A) A-weighted Fast maximum
    "noise_lafmin":  (20.0, 140.0),   # dB(A) A-weighted Fast minimum
    "noise_lcpeak":  (20.0, 150.0),   # dB(C) C-weighted Peak (can be higher)
    "noise_leq":     (20.0, 140.0),   # dB(A) equivalent continuous
    "noise_lp":      (20.0, 140.0),   # legacy alias
    "noise_lmax":    (20.0, 140.0),   # legacy alias
    "noise_lmin":    (20.0, 140.0),   # legacy alias
    "noise_inst":    (20.0, 140.0),   # legacy alias
}


def validate_reading(value, field):
    """Validate a noise reading is within physically possible range.
    Returns the value if valid, None if out of range or not a number."""
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        print("[WARN] %s: non-numeric value '%s' rejected" % (field, value))
        return None
    low, high = VALID_RANGES.get(field, (0.0, 200.0))
    if value < low or value > high:
        print("[WARN] %s=%.1f out of valid range [%.0f, %.0f] — rejected" % (field, value, low, high))
        return None
    return value

# ═══════════════════════════════════════════════════════════════
# HY108-1 Protocol Constants / 协议常量
# ═══════════════════════════════════════════════════════════════

SOH = 0x01              # Start of frame / 帧头
EOF = 0xFF              # End of frame / 帧尾

# Command mapping (verified against physical meter display 2026-03-20):
#   M (0x4D) → LAFmax  (A-weighted Fast maximum)
#   P (0x50) → LCPeak  (C-weighted Peak)
#   L (0x4C) → LAF     (instantaneous A-weighted Fast level)
#   N (0x4E) → LAFmin  (A-weighted Fast minimum)
#   S (0x53) → Status  (weighting + time constant flags)
CMD_MAX      = 0x4D     # 'M' → LAFmax (A-weighted Fast maximum)
CMD_LCPEAK   = 0x50     # 'P' → LCPeak (C-weighted Peak level)
CMD_INSTANT  = 0x4C     # 'L' → LAF (instantaneous A-weighted Fast)
CMD_MIN      = 0x4E     # 'N' → LAFmin (A-weighted Fast minimum)
CMD_STATUS   = 0x53     # 'S' → Status (weighting + time constant)

RESP_LEN_CMD    = 9     # Command response length / 命令响应长度
RESP_LEN_STATUS = 6     # Status response length / 状态响应长度


# ═══════════════════════════════════════════════════════════════
# Protocol Functions / 协议函数
# ═══════════════════════════════════════════════════════════════

def send_command(ser, cmd_byte):
    """
    Send single command byte, read response.
    发送单字节命令，读取响应。
    """
    ser.reset_input_buffer()
    ser.write(bytes([cmd_byte]))
    time.sleep(0.2)
    resp = ser.read(20)
    if resp is None or len(resp) == 0:
        return None
    return resp


def parse_cmd_response(data):
    """
    Parse 9-byte command response.
    解析9字节命令响应。

    Frame: [0x01][5×ASCII dB][0x00][checksum][0xFF]
    Checksum: SUM(bytes 1..5) & 0xFF
    """
    if data is None or len(data) < RESP_LEN_CMD:
        return None

    for i in range(len(data) - RESP_LEN_CMD + 1):
        if data[i] == SOH and data[i + 8] == EOF:
            frame = data[i:i + RESP_LEN_CMD]
            try:
                db_str = ""
                for j in range(1, 6):
                    db_str += chr(frame[j])
                db_val = float(db_str)
            except (ValueError, IndexError):
                continue

            calc_sum = 0
            for j in range(1, 6):
                calc_sum += frame[j]
            calc_sum = calc_sum & 0xFF

            return {
                "db": db_val,
                "checksum_ok": calc_sum == frame[7]
            }
    return None


def parse_status(data):
    """
    Parse 6-byte status frame.
    解析6字节状态帧。

    Frame: [0x01][b1][b2][b3][b4][0xFF]
    """
    if data is None or len(data) < RESP_LEN_STATUS:
        return None

    for i in range(len(data) - RESP_LEN_STATUS + 1):
        if data[i] == SOH and data[i + 5] == EOF:
            frame = data[i:i + RESP_LEN_STATUS]
            return [frame[1], frame[2], frame[3], frame[4]]
    return None


def read_measurement(ser, cmd_byte, label):
    """Send command and return dB value or None."""
    resp = send_command(ser, cmd_byte)
    result = parse_cmd_response(resp)
    if result is None:
        print("  [WARN] %s: no response" % label)
        return None
    if not result["checksum_ok"]:
        print("  [WARN] %s: checksum mismatch" % label)
    return result["db"]


# ═══════════════════════════════════════════════════════════════
# Mode Detection / 模式检测
# ═══════════════════════════════════════════════════════════════
# The HY108-1 physical buttons set: Weighting (A/C) + Time constant (Fast/Slow).
# The M/P/L/N commands return values in whatever mode is active on the meter.
# The S command status bytes encode the current mode.
#
# Status bytes observed:
#   [01 00 00 01] = default mode (A-weighting, Fast)
#
# Standard sound level meter modes:
#   LAF  = A-weighted, Fast time constant
#   LAS  = A-weighted, Slow time constant
#   LCF  = C-weighted, Fast time constant
#   LCS  = C-weighted, Slow time constant
#
# We decode b1 and b4 as mode indicators.
# b1=0x01, b4=0x01 → A-Fast (LAF) — most common default
# Further values to be confirmed by physical testing.

# Mode lookup: (b1, b4) → (weighting_letter, time_constant_letter)
MODE_MAP = {
    (0x01, 0x01): ("A", "F"),   # A-weighting, Fast → LAF
    (0x01, 0x02): ("A", "S"),   # A-weighting, Slow → LAS  (tentative)
    (0x02, 0x01): ("C", "F"),   # C-weighting, Fast → LCF  (tentative)
    (0x02, 0x02): ("C", "S"),   # C-weighting, Slow → LCS  (tentative)
}

def detect_mode(ser):
    """
    Query HY108-1 status and return mode string.
    返回当前模式字符串 (e.g. "LAF", "LAS", "LCF", "LCS").

    Returns: tuple (mode_prefix, weighting, time_const, status_bytes)
        e.g. ("LAF", "A", "F", [1, 0, 0, 1])
    """
    resp = send_command(ser, CMD_STATUS)
    status = parse_status(resp)
    if status is None:
        print("[WARN] Cannot read status, defaulting to LAF")
        return ("LAF", "A", "F", None)

    b1, b2, b3, b4 = status
    key = (b1, b4)
    if key in MODE_MAP:
        w, tc = MODE_MAP[key]
    else:
        # Unknown combination — log it and default to A-Fast
        print("[WARN] Unknown status mode b1=0x%02X b4=0x%02X, defaulting to LAF" % (b1, b4))
        w, tc = ("A", "F")

    mode = "L%s%s" % (w, tc)
    print("[MODE] Meter mode: %s (weighting=%s, time=%s) status=[%02X %02X %02X %02X]"
          % (mode, w, "Fast" if tc == "F" else "Slow", b1, b2, b3, b4))
    return (mode, w, tc, status)


def poll_all(ser, mode_prefix="LAF"):
    """
    Poll all HY108-1 measurements.
    轮询所有HY108-1测量值。    Command → Value mapping (verified against physical meter 2026-03-20):
      M (0x4D) → LAFmax  (max A-weighted Fast since last reset)
      P (0x50) → LCPeak  (C-weighted Peak level)
      L (0x4C) → LAF     (instantaneous A-weighted Fast)
      N (0x4E) → LAFmin  (min A-weighted Fast since last reset)

    Returns: dict with noise_laf, noise_lafmax, noise_lafmin, noise_lcpeak, mode
    """
    reading = {}
    mp = mode_prefix.lower()  # e.g. "laf", "las", "lcf", "lcs"

    for label, cmd, key in [
        ("%smax"   % mode_prefix,  CMD_MAX,     "noise_%smax" % mp),
        ("LCPeak",                 CMD_LCPEAK,  "noise_lcpeak"),
        ("%smin"   % mode_prefix,  CMD_MIN,     "noise_%smin" % mp),
        (mode_prefix,              CMD_INSTANT,  "noise_%s" % mp),
    ]:
        val = read_measurement(ser, cmd, label)
        val = validate_reading(val, key)
        if val is not None:
            reading[key] = val
        time.sleep(0.1)

    # Status
    resp = send_command(ser, CMD_STATUS)
    status = parse_status(resp)
    if status:
        reading["status_bytes"] = status

    # Include mode metadata
    reading["mode"] = mode_prefix  # e.g. "LAF", "LAS", "LCF", "LCS"

    # Generic aliases for backend compatibility
    # Backend expects: noise_lp (level), noise_lmax, noise_lmin, noise_inst
    reading["noise_lp"]   = reading.get("noise_%s" % mp)       # LAF instantaneous
    reading["noise_lmax"] = reading.get("noise_%smax" % mp)    # LAFmax
    reading["noise_lmin"] = reading.get("noise_%smin" % mp)    # LAFmin
    reading["noise_inst"] = reading.get("noise_%s" % mp)       # same as noise_lp

    return reading


# ═══════════════════════════════════════════════════════════════
# Upload / 上传
# ═══════════════════════════════════════════════════════════════

def upload_to_fiotech(data):
    """POST reading to FioTec /telemetry-4g endpoint."""
    if not WEBHOOK_TOKEN or WEBHOOK_TOKEN == "YOUR_WEBHOOK_TOKEN":
        print("[SKIP] FioTec upload: WEBHOOK_TOKEN not set")
        return False
    if not FIOTECH_URL:
        print("[SKIP] FioTec upload: FIOTECH_URL not set")
        return False

    # Token sent via BOTH header AND URL query string for backward compatibility.
    # FioTec backend currently reads from ?token= (query string).
    # X-Webhook-Token header is the secure replacement (see SECURITY_AUDIT_REPORT.md §2.2).
    # Once FioTec backend is updated to read from header, remove ?token= from URL.
    url = FIOTECH_URL + "?token=" + WEBHOOK_TOKEN
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ANON_KEY,
        "X-Webhook-Token": WEBHOOK_TOKEN,
    }

    for attempt in range(RETRY_COUNT):
        try:
            resp = requests.post(url, json=data, headers=headers, timeout=(3, 7))
            if resp.status_code == 200:
                print("[OK] FioTec upload success")
                return True
            else:
                print("[WARN] FioTec HTTP %d (attempt %d)" % (resp.status_code, attempt + 1))
        except Exception as e:
            print("[ERR] FioTec: %s (attempt %d)" % (str(e), attempt + 1))
        time.sleep(2)

    return False



# ═══════════════════════════════════════════════════════════════
# Serial Port Helper / 串口助手
# ═══════════════════════════════════════════════════════════════

def open_serial(port, baud, retry_interval=5):
    """
    Open serial port, retrying forever until the device appears.
    Handles USB hot-plug: if the adapter is not yet connected at
    startup (or is reconnected mid-run), this will wait patiently.
    """
    attempt = 0
    while True:
        try:
            ser = serial.Serial(
                port=port,
                baudrate=baud,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.5,
            )
            if attempt > 0:
                print("[OK] Serial reconnected (%s) after %d attempt(s)" % (port, attempt))
            else:
                print("[OK] Serial initialized (%s, %d baud)" % (port, baud))
            return ser
        except serial.SerialException as e:
            attempt += 1
            if attempt == 1:
                print("[WAIT] Serial port %s not ready — waiting for USB device... (%s)" % (port, e))
            elif attempt % 12 == 0:
                print("[WAIT] Still waiting for %s (%d attempts)..." % (port, attempt))
            time.sleep(retry_interval)


# ═══════════════════════════════════════════════════════════════
# Main Loop / 主循环
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 50)
    print("HY108-1 Sound Level Gateway")
    print("HY108-1 噪声计网关 (HaaS506-LD1)")
    print("Port %s @ %d 8N1 | Interval %ds" % (SERIAL_PORT, BAUD_RATE, UPLOAD_INTERVAL))
    print("Device: %s" % DEVICE_ID)
    print("=" * 50)

    # open_serial retries until USB-RS232 adapter is present
    ser = open_serial(SERIAL_PORT, BAUD_RATE)

    # Detect meter mode (weighting + time constant)
    mode_prefix, weighting, time_const, status_bytes = detect_mode(ser)
    print("[OK] Meter mode: %s (weighting=%s, time=%s)"
          % (mode_prefix, weighting, "Fast" if time_const == "F" else "Slow"))

    cycle = 0
    errors = 0
    window   = collections.deque(maxlen=ROLLING_WINDOW)  # rolling LAF values
    holdoff  = 0        # cycles remaining in anomaly mode
    prev_laf = None     # previous reading for spike detection
    interval = INTERVAL_NORMAL

    while True:
        cycle += 1
        print("\n--- Cycle %d [%s] ---" % (cycle, mode_prefix))

        try:
            reading = poll_all(ser, mode_prefix)
        except serial.SerialException as e:
            print("[ERR] Serial error: %s — reconnecting..." % e)
            try:
                ser.close()
            except Exception:
                pass
            ser = open_serial(SERIAL_PORT, BAUD_RATE)
            mode_prefix, weighting, time_const, status_bytes = detect_mode(ser)
            errors += 1
            time.sleep(UPLOAD_INTERVAL)
            continue

        mp = mode_prefix.lower()
        k_laf    = "noise_%s" % mp         # LAF (instantaneous)
        k_max    = "noise_%smax" % mp      # LAFmax
        k_min    = "noise_%smin" % mp      # LAFmin
        k_lcpeak = "noise_lcpeak"          # LCPeak (always C-weighted)

        if not reading or not any(k in reading for k in (k_laf, k_max, k_min)):
            errors += 1
            print("[ERR] No data (errors: %d)" % errors)
            # After 5 consecutive failures, reopen serial port to recover
            # from sensor repower / boot garbage state
            if errors % 5 == 0:
                print("[RECOVERY] %d consecutive errors — reopening serial port..." % errors)
                try:
                    ser.close()
                except Exception:
                    pass
                ser = open_serial(SERIAL_PORT, BAUD_RATE)
                mode_prefix, weighting, time_const, status_bytes = detect_mode(ser)
                print("[RECOVERY] Serial reopened, mode=%s" % mode_prefix)
            else:
                time.sleep(min(UPLOAD_INTERVAL * 2, 30))
            continue

        # Re-detect mode periodically (every 60 cycles ≈ 5 min)
        if cycle % 60 == 0:
            new_mode, weighting, time_const, status_bytes = detect_mode(ser)
            if new_mode != mode_prefix:
                print("[MODE] Mode changed: %s -> %s" % (mode_prefix, new_mode))
                mode_prefix = new_mode
                mp = mode_prefix.lower()

        print("  %s:     %.1f dB" % (mode_prefix, reading.get(k_laf, 0)))
        print("  %smax:  %.1f dB" % (mode_prefix, reading.get(k_max, 0)))
        print("  %smin:  %.1f dB" % (mode_prefix, reading.get(k_min, 0)))
        print("  LCPeak:  %.1f dB" % reading.get(k_lcpeak, 0))

        # Build payload with validated readings only
        v_laf    = validate_reading(reading.get(k_laf), k_laf)
        v_max    = validate_reading(reading.get(k_max), k_max)
        v_min    = validate_reading(reading.get(k_min), k_min)
        v_lcpeak = validate_reading(reading.get(k_lcpeak), k_lcpeak)

        payload = {
            "device_id": DEVICE_ID,
            "timestamp": int(time.time()),
            "mode": mode_prefix,
            "weighting": weighting,
            "time_constant": time_const,
            # Correct labels
            k_laf:    v_laf,
            k_max:    v_max,
            k_min:    v_min,
            k_lcpeak: v_lcpeak,
            # Legacy / generic aliases for backward compatibility
            "noise_leq":    v_laf,
            "noise_lafmax": v_max,
            "noise_lafmin": v_min,
            "noise_laf":    v_laf,
            "noise_lcpeak": v_lcpeak,
        }

        # ── Adaptive upload: anomaly detection ──────────────────
        anomaly = False
        if v_laf is not None:
            window.append(v_laf)
            if len(window) >= 5:
                mean = sum(window) / len(window)
                variance = sum((x - mean) ** 2 for x in window) / len(window)
                stddev = math.sqrt(variance) if variance > 0 else 0.0
                z = (v_laf - mean) / stddev if stddev > 0.5 else 0.0
                spike = abs(v_laf - prev_laf) >= ANOMALY_SPIKE if prev_laf is not None else False
                if z >= ANOMALY_ZSCORE or spike:
                    anomaly = True
                    holdoff = ANOMALY_HOLDOFF
                    reason = ("spike +%.1fdB" % abs(v_laf - prev_laf)) if spike else ("z=%.1f" % z)
                    print("[ANOMALY] Detected: %s (%.1f dB, mean=%.1f, σ=%.1f)" % (reason, v_laf, mean, stddev))
            prev_laf = v_laf

        if holdoff > 0:
            holdoff -= 1
            interval = INTERVAL_ANOMALY
        else:
            interval = INTERVAL_NORMAL

        mode_tag = "ANOMALY" if (holdoff > 0 or anomaly) else "normal"
        payload["anomaly"]  = anomaly
        payload["interval"] = interval
        # ─────────────────────────────────────────────────────────

        upload_to_fiotech(payload)

        errors = 0
        print("[%s] Next upload in %ds..." % (mode_tag.upper(), interval))
        time.sleep(interval)


if __name__ == "__main__":
    main()
