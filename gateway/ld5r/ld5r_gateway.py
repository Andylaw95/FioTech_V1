#!/usr/bin/env python3
"""
Sibata LD-5R Digital Dust Indicator — FioTec IoT Gateway
Device: /dev/ttyUSB4 via usbserial_generic (VID 130a, PID 0019)
HaaS506-LD1 IoT gateway, Python 3.10+
"""

import json
import logging
import logging.handlers
import os
import select
import signal
import subprocess
import sys
import termios
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

PORT           = "/dev/ttyUSB4"
BAUD           = termios.B38400
DEVICE_ID      = "LD5R-001"
SECRETS_FILE   = "/opt/.secrets"
LOG_FILE       = "/var/log/ld5r_gateway.log"
UPLOAD_INTERVAL = 5.0   # seconds
BG_PATTERN     = bytes([0x11, 0x60])

VID = "130a"
PID = "0019"

CMD_BG_MODE     = b">49\r\n"
CMD_MANUAL_MODE = b">03,09\r\n"
CMD_START       = b">07\r\n"
CMD_STOP        = b">10\r\n"
CMD_STATUS      = b">42\r\n"
CMD_MODE_QUERY  = b">04\r\n"
CMD_COUNT       = b">09\r\n"

# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────

def _setup_logging() -> logging.Logger:
    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logger = logging.getLogger("ld5r")
    logger.setLevel(logging.INFO)

    fh = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=3
    )
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    return logger


log = _setup_logging()

# ──────────────────────────────────────────────────────────────────────────────
# Secrets loader
# ──────────────────────────────────────────────────────────────────────────────

def load_secrets(path: str = SECRETS_FILE) -> dict:
    cfg: dict[str, str] = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                cfg[key.strip()] = val.strip()
    except OSError as exc:
        log.error("Cannot read secrets file %s: %s", path, exc)
        sys.exit(1)
    for required in ("WEBHOOK_TOKEN", "ANON_KEY", "FIOTECH_URL"):
        if required not in cfg:
            log.error("Missing key %s in %s", required, path)
            sys.exit(1)
    return cfg

# ──────────────────────────────────────────────────────────────────────────────
# Driver binding
# ──────────────────────────────────────────────────────────────────────────────

def ensure_driver_bound(vid: str, pid: str, port: str = PORT, timeout: float = 15.0) -> None:
    if Path(port).exists():
        log.info("Port %s already present — skipping driver bind", port)
        return

    new_id_path = "/sys/bus/usb-serial/drivers/generic/new_id"
    log.info("Port %s absent — binding usbserial_generic for %s:%s", port, vid, pid)
    try:
        with open(new_id_path, "w") as f:
            f.write(f"{vid} {pid}\n")
        log.info("Wrote '%s %s' to %s", vid, pid, new_id_path)
    except OSError as exc:
        log.warning("Could not write new_id (%s) — trying modprobe fallback", exc)
        try:
            subprocess.run(
                ["modprobe", "usbserial", f"vendor=0x{vid}", f"product=0x{pid}"],
                check=True, timeout=10,
            )
        except Exception as mod_exc:
            log.error("modprobe failed: %s", mod_exc)

    deadline = time.monotonic() + timeout
    log.info("Waiting up to %.0fs for %s to appear …", timeout, port)
    while time.monotonic() < deadline:
        if Path(port).exists():
            log.info("Port %s is now available", port)
            time.sleep(0.5)   # let udev settle
            return
        time.sleep(0.5)

    log.error("Port %s did not appear within %.0f seconds — aborting", port, timeout)
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# Low-level serial  (raw fd — PySerial intentionally NOT used)
# ──────────────────────────────────────────────────────────────────────────────

class LD5RSerial:
    def __init__(self, port: str = PORT) -> None:
        self.port = port
        self.fd: int = -1

    # ── open ──────────────────────────────────────────────────────────────────

    def open(self) -> None:
        log.info("Opening %s (raw fd, B38400 8N1)", self.port)
        self.fd = os.open(
            self.port,
            os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK,
        )
        self._configure_termios()
        log.info("Port opened (fd=%d)", self.fd)

    def _configure_termios(self) -> None:
        attrs = termios.tcgetattr(self.fd)
        # iflag — ignore break / parity errors, no software flow control
        attrs[0] = termios.IGNBRK | termios.IGNPAR
        # oflag — raw output
        attrs[1] = 0
        # cflag — 8 data bits, enable receiver, ignore modem control lines
        attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
        # lflag — raw mode (not canonical, no echo, no signals)
        attrs[3] = 0
        # ispeed / ospeed
        attrs[4] = BAUD
        attrs[5] = BAUD
        # cc — non-blocking: return immediately with whatever bytes are ready
        attrs[6][termios.VMIN]  = 0
        attrs[6][termios.VTIME] = 0
        termios.tcsetattr(self.fd, termios.TCSANOW, attrs)
        termios.tcflush(self.fd, termios.TCIOFLUSH)
        log.debug("termios configured (B38400 8N1 raw)")

    # ── send ──────────────────────────────────────────────────────────────────

    def send_cmd(self, cmd: bytes, post_delay: float = 0.4) -> None:
        if self.fd < 0:
            raise OSError("Port not open")
        log.debug("TX → %r", cmd)
        total = len(cmd)
        sent  = 0
        while sent < total:
            _, writable, _ = select.select([], [self.fd], [], 2.0)
            if not writable:
                raise OSError("Timeout waiting for fd to become writable")
            n     = os.write(self.fd, cmd[sent:])
            sent += n
        time.sleep(post_delay)

    # ── receive ───────────────────────────────────────────────────────────────

    def recv(self, timeout: float = 1.0) -> bytes:
        if self.fd < 0:
            raise OSError("Port not open")
        readable, _, _ = select.select([self.fd], [], [], timeout)
        if not readable:
            return b""
        try:
            chunk = os.read(self.fd, 4096)
        except BlockingIOError:
            return b""
        log.debug("RX ← %r", chunk)
        return chunk

    def drain(self, timeout: float = 0.5) -> None:
        """Discard all bytes currently in the receive buffer."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            chunk = self.recv(timeout=0.05)
            if not chunk:
                break

    # ── readline ───────────────────────────────────────────────────────────────

    def readline(self, timeout: float = 3.0) -> bytes:
        """Read bytes until \\n is seen or timeout expires."""
        buf      = b""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            chunk = self.recv(timeout=min(remaining, 0.1))
            if chunk:
                buf += chunk
                if b"\n" in buf:
                    line, _, _ = buf.partition(b"\n")
                    return line + b"\n"
        return buf   # partial / empty on timeout

    # ── measurement lifecycle ─────────────────────────────────────────────────

    def start_measurement(self) -> None:
        """
        Startup sequence per Sibata manual ch.10:
          1. >49  — return to BG mode (enables command reception)
          2. >03,09 — switch to manual measurement mode
          3. >07  — start measurement
        """
        log.info("Startup sequence: BG mode → manual mode → start")
        self.drain()
        self.send_cmd(CMD_BG_MODE,     post_delay=0.6)  # step 1
        self.drain()
        self.send_cmd(CMD_MANUAL_MODE, post_delay=0.6)  # step 2
        self.drain()
        self.send_cmd(CMD_START,       post_delay=0.4)  # step 3
        log.info("Measurement started")

    def stop_measurement(self) -> None:
        log.info("Stop sequence: >10 stop → >49 BG mode")
        try:
            self.send_cmd(CMD_STOP,    post_delay=0.4)
            self.drain()
            self.send_cmd(CMD_BG_MODE, post_delay=0.4)
        except OSError as exc:
            log.warning("Error during stop_measurement: %s", exc)

    # ── status query ──────────────────────────────────────────────────────────

    def query_status(self) -> dict | None:
        """
        Send >42, parse response: >42,V.VV,AA.A,PPP,RRRR
        Returns dict with voltage/ld_ma/pump_ma/pump_rpm or None on failure.
        """
        try:
            self.drain(timeout=0.2)
            self.send_cmd(CMD_STATUS, post_delay=0.5)
            raw = self.readline(timeout=2.0).strip()
            if not raw.startswith(b">42,"):
                log.warning("Unexpected status response: %r", raw)
                return None
            parts = raw[4:].split(b",")
            if len(parts) < 4:
                return None
            return {
                "voltage":  float(parts[0]),
                "ld_ma":    float(parts[1]),
                "pump_ma":  float(parts[2]),
                "pump_rpm": int(parts[3]),
            }
        except (OSError, ValueError) as exc:
            log.warning("query_status error: %s", exc)
            return None

    # ── close ─────────────────────────────────────────────────────────────────

    def close(self) -> None:
        if self.fd >= 0:
            try:
                os.close(self.fd)
            except OSError:
                pass
            self.fd = -1
            log.info("Port closed")

# ──────────────────────────────────────────────────────────────────────────────
# Parsing helpers
# ──────────────────────────────────────────────────────────────────────────────

def parse_line(line: bytes) -> dict | None:
    """
    Parse a measurement CSV line:
        YYYY/MM/DD HH:MM:SS,CPM,COUNT,MM:SS\\r\\n
    Returns a reading dict or None if the line is not valid measurement data.
    """
    try:
        text = line.decode("ascii", errors="replace").strip()
    except Exception:
        return None

    parts = text.split(",")
    if len(parts) != 4:
        return None

    ts_str, cpm_str, count_str, cycle_str = parts

    if "/" not in ts_str or " " not in ts_str:
        return None

    try:
        datetime.strptime(ts_str, "%Y/%m/%d %H:%M:%S")
        cpm   = int(cpm_str)
        count = int(count_str)
    except ValueError:
        return None

    cycle_parts = cycle_str.split(":")
    if len(cycle_parts) != 2:
        return None
    try:
        int(cycle_parts[0])
        int(cycle_parts[1])
    except ValueError:
        return None

    return {
        "timestamp": ts_str,
        "cpm":       cpm,
        "count":     count,
        "log_cycle": cycle_str,
    }


def is_bg_mode_data(data: bytes) -> bool:
    """Return True if data contains the BG mode binary heartbeat (0x11 0x60)."""
    return BG_PATTERN in data

# ──────────────────────────────────────────────────────────────────────────────
# Upload
# ──────────────────────────────────────────────────────────────────────────────

def upload(cfg: dict, readings: list[dict]) -> bool:
    if not readings:
        return True

    payload = {
        "device_id": DEVICE_ID,
        "readings":  readings,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url=cfg["FIOTECH_URL"],
        data=body,
        method="POST",
        headers={
            "Content-Type":    "application/json",
            "Authorization":   f"Bearer {cfg['ANON_KEY']}",
            "X-Webhook-Token": cfg["WEBHOOK_TOKEN"],
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            if status in (200, 201, 204):
                log.info("Uploaded %d reading(s) → HTTP %d", len(readings), status)
                return True
            log.warning("Upload HTTP %d: %s", status, resp.read(256))
            return False
    except urllib.error.HTTPError as exc:
        log.warning("Upload HTTPError %d: %s", exc.code, exc.reason)
        return False
    except urllib.error.URLError as exc:
        log.warning("Upload URLError: %s", exc.reason)
        return False
    except OSError as exc:
        log.warning("Upload OSError: %s", exc)
        return False

# ──────────────────────────────────────────────────────────────────────────────
# Main loop
# ──────────────────────────────────────────────────────────────────────────────

_running = True


def _handle_signal(signum, frame) -> None:
    global _running
    log.info("Signal %d received — shutting down …", signum)
    _running = False


def main() -> None:
    global _running

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT,  _handle_signal)

    log.info("LD-5R gateway starting up (device_id=%s)", DEVICE_ID)

    cfg    = load_secrets()
    ensure_driver_bound(VID, PID)

    serial      = LD5RSerial(port=PORT)
    pending:    list[dict] = []
    last_upload = time.monotonic()
    line_buf    = b""

    def open_and_start() -> bool:
        try:
            serial.open()
            serial.start_measurement()
            return True
        except OSError as exc:
            log.error("open_and_start failed: %s", exc)
            serial.close()
            return False

    while _running and not open_and_start():
        log.info("Retrying port open in 5 s …")
        time.sleep(5.0)

    while _running:
        try:
            chunk = serial.recv(timeout=0.2)

            if chunk:
                # Detect BG mode heartbeat — device fell back out of measurement
                if is_bg_mode_data(chunk):
                    log.warning(
                        "BG mode heartbeat detected (0x11 0x60) — device left "
                        "measurement state. Restarting measurement in 3 s …"
                    )
                    time.sleep(3.0)
                    serial.start_measurement()
                    line_buf = b""
                    continue

                line_buf += chunk

                # Consume all complete lines in the accumulated buffer
                while b"\n" in line_buf:
                    raw_line, _, line_buf = line_buf.partition(b"\n")
                    raw_line = raw_line.rstrip(b"\r")

                    if not raw_line:
                        continue

                    reading = parse_line(raw_line + b"\n")
                    if reading:
                        log.info(
                            "Reading: ts=%s  cpm=%d  count=%d  cycle=%s",
                            reading["timestamp"], reading["cpm"],
                            reading["count"],     reading["log_cycle"],
                        )
                        pending.append(reading)
                    else:
                        log.debug("Non-data line ignored: %r", raw_line)

            # Periodic upload every UPLOAD_INTERVAL seconds
            now = time.monotonic()
            if now - last_upload >= UPLOAD_INTERVAL:
                if pending:
                    if upload(cfg, pending):
                        pending.clear()
                    # On failure, keep readings and retry next cycle
                last_upload = now

        except OSError as exc:
            log.error("OS error in main loop: %s — reconnecting in 5 s …", exc)
            serial.close()
            time.sleep(5.0)
            ensure_driver_bound(VID, PID)
            line_buf = b""
            while _running and not open_and_start():
                log.info("Retrying port open in 5 s …")
                time.sleep(5.0)

    # ── graceful shutdown ──────────────────────────────────────────────────────
    log.info("Stopping measurement …")
    try:
        serial.stop_measurement()
    except OSError:
        pass

    if pending:
        log.info("Flushing %d buffered reading(s) before exit …", len(pending))
        upload(cfg, pending)

    serial.close()
    log.info("LD-5R gateway stopped cleanly")


if __name__ == "__main__":
    main()
