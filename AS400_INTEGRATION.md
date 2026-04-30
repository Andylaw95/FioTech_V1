# AS400 Vibration Sensor Integration

## Overview
BEWIS AS400-1 3-axis MEMS accelerometer connected to LD1 RS485 port 1 for real-time vibration monitoring.

## Hardware
- **Sensor**: BEWIS AS400-1 (0x77 Modbus slave)
- **Connection**: LD1 RS485 port 1 (`/dev/tty485_1`)
- **Baud Rate**: 9600, 8N1
- **Output Format**: 18-field CSV at 6.7 Hz (150ms per frame)

## Files
- `gateway/as400_gateway.py` — LD1 gateway (read from serial, upload to FioTec)
- `gateway/as400_gateway.conf` — supervisor config (auto-start on reboot)

## Deployment on LD1

### Step 1: Copy gateway script
```bash
scp gateway/as400_gateway.py root@192.168.1.100:/opt/
ssh root@192.168.1.100 "chmod +x /opt/as400_gateway.py"
```

### Step 2: Copy supervisor config
```bash
scp gateway/as400_gateway.conf root@192.168.1.100:/etc/supervisor.d/
ssh root@192.168.1.100 "supervisorctl reread && supervisorctl update as400_gateway"
```

### Step 3: Start gateway
```bash
ssh root@192.168.1.100 "supervisorctl start as400_gateway"
```

### Step 4: Verify
```bash
ssh root@192.168.1.100 "supervisorctl status as400_gateway && tail -20 /var/log/as400_gateway.log"
```

## Data Fields
Each reading uploaded to FioTec contains:
- `device_id` — AS400-001
- `timestamp` — ISO 8601 UTC
- `accel_x_g` — X-axis acceleration (g)
- `accel_y_g` — Y-axis acceleration (g)
- `accel_z_g` — Z-axis acceleration (g)
- `temperature_c` — Sensor temperature
- `velocity_x`, `velocity_y`, `velocity_z` — Extended metrics
- `raw` — First 100 chars of raw frame

## Webhook
Readings are uploaded to `FIOTECH_URL/webhooks/vibration` in batches of 10 or every 5 seconds.

## Logs
- Local: `/var/log/as400_gateway.log` (rotating, 10MB max)
- Check: `ssh root@192.168.1.100 "tail -f /var/log/as400_gateway.log"`

## Status (2026-04-30 11:48 UTC)
- ✅ Gateway running on LD1
- ✅ 100+ readings uploaded successfully
- ✅ 0 frame loss, <1s latency
- ✅ Auto-start configured
