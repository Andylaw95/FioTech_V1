# FioTec Gateway Firmware

IoT gateway firmware running on the **HaaS506-LD1** RTU (RISC-V 64-bit, CPython 3.10.1).  
Sensors connect via USB-RS232/RS232C and upload telemetry to FioTec via 4G.

```
Sensor → USB-RS232 → HaaS506-LD1 (/opt/main.py) → 4G → FioTec Supabase
```

---

## hy108/ — HY108-1 Noise Sensor Gateway

**Status**: ✅ Production (running on LD1 at 192.168.1.100)

| File | Purpose |
|------|---------|
| `main.py` | Gateway firmware — reads HY108-1 via RS232, uploads to FioTec every 5s |
| `S99gateway` | BusyBox init script — auto-starts on every LD1 boot with watchdog |

### Deploy to LD1

```bash
# Copy firmware
scp gateway/hy108/main.py root@192.168.1.100:/opt/main.py

# Copy init script (first time only)
scp gateway/hy108/S99gateway root@192.168.1.100:/etc/init.d/S99gateway
ssh root@192.168.1.100 "chmod +x /etc/init.d/S99gateway"

# Restart gateway
ssh root@192.168.1.100 "/etc/init.d/S99gateway restart"

# Check status
ssh root@192.168.1.100 "/etc/init.d/S99gateway status"
```

### Recovery Behaviour (tested 2026-04)

| Event | Recovery |
|-------|----------|
| main.py crash (any cause) | Watchdog restarts in 10s |
| HY108-1 sensor repower | 5 consecutive "No data" → serial port reopen → auto-recover in ~15s |
| LD1 reboot | S99gateway starts on boot automatically |
| HY108 disconnected for a week | `open_serial()` retries forever (every 5s) — recovers when reconnected |

### Secrets on LD1 (`/opt/.secrets`, chmod 600)

```
FIOTEC_URL=https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g
WEBHOOK_TOKEN=<token>
ANON_KEY=<supabase-anon-key>
DEVICE_ID=HY108-001
```

---

## ld5r/ — Sibata LD-5R Dust Sensor Gateway

**Status**: ⏸️ Paused — waiting for RS232C cable

| File | Purpose |
|------|---------|
| `ld5r_gateway.py` | Gateway firmware — reads LD-5R via RS232C, uploads CPM/COUNT to FioTec |

### Hardware Notes

- LD-5R has both USB and RS232C (DB9) ports
- **USB port**: proprietary Sibata protocol for offline log download only — NOT usable for real-time data
- **RS232C port**: real-time ASCII protocol (Chapter 10 of manual) — use this
- Firmware: ver1.02, Interface setting: USB (must change to RS232C before cable arrives)

### RS232C Setup (when cable arrives)

1. On LD-5R device: Basic Settings → Item 9 "Interface" → change **USB → RS232C**
2. Connect LD-5R DB9 → LD1 `/dev/tty232_1` (16550A UART on HaaS506)
3. Edit `ld5r_gateway.py`: change `SERIAL_PORT` to `/dev/tty232_1`
4. Protocol: 38400 8N1, ASCII, `\r\n` terminated
5. Start stream: `>49\r\n` then `>07\r\n`
6. Auto-start: `>34,01\r\n`; 1s logging cycle: `>18,00,01\r\n`

### Why USB failed (diagnosis 2026-04)

- LD-5R contains FTDI FT232RL (VID 130a:0019 — Sibata custom VID/PID)
- `0x11 0x60` pattern seen via `usbserial_generic` = FTDI MSR/LSR status headers (idle, no RX data)
- `ftdi_sio` driver strips headers → 0 bytes (correct, no data from device)
- Manual states: *"Special LD-5R USB driver and USB cable required"* — Windows-only proprietary protocol
- All baud rates (9600/19200/38400/115200) + parities tested, all returned 0 bytes
- Active 2-minute measurement also returned 0 bytes
- **Conclusion**: USB = offline log download only; RS232C = real-time data

---

## LD1 Hardware Reference

| Property | Value |
|----------|-------|
| Model | HaaS506 (Alibaba Cloud IoT RTU) |
| CPU | T-Head RISC-V rv64gcxthead @ 600MHz |
| RAM | 115MB total, ~17MB available |
| Storage | 109.6MB UBI flash |
| OS | Linux 5.10.44 (BusyBox init) |
| Python | CPython 3.10.1 |
| Connectivity | 4G (ML307R modem, eth0 RNDIS) + WiFi (aic8800) |
| SSH | root@192.168.1.100 (WiFi/LAN) |
| Built-in UART | /dev/tty232_1 (16550A, RS232C DB9) |
| USB Serial | /dev/ttyUSB0 (PL2303 USB-RS232 adapter) |
