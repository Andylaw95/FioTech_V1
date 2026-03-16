# HaaS506-LD1 + HY108-1 Sound Level Meter — FioTec Integration Guide

## Overview

This document describes how the **HaaS506-LD1** (4G RTU panel) sends **HY108-1** sound level meter data to the **FioTec IoT Platform**. The LD1 reads the HY108-1 via RS232 (reverse-engineered proprietary protocol), then uploads readings over 4G HTTP POST. It does **not** use LoRaWAN.

---

## 1. Architecture

```
┌──────────────────────────┐
│   HY108-1 Sound Meter    │
│   (RS232 DB9, 9600 8N1)  │
└──────────┬───────────────┘
           │ RS232 (TX/RX/GND)
┌──────────▼───────────────┐
│   HaaS506-LD1 RTU        │
│   MicroPython firmware    │
│   • HY108-1 decoder      │
│   • 4 commands/cycle      │
│   • Checksum verify       │
│   • HTTP POST upload      │
│   EC200U 4G module        │
└──────────┬───────────────┘
           │ 4G Cellular (HTTPS POST)
┌──────────▼───────────────┐
│   FioTec Backend          │
│   POST /telemetry-4g      │
│   • Auto-registers device │
│   • Maps noise_* fields   │
│   • Stores & charts data  │
│   • 85 dB alarm threshold │
└──────────────────────────┘
```

- The LD1 reads LP (Leq), Lmax, Lmin, and Instantaneous dB from the HY108-1 every cycle
- The LD1 firmware POSTs JSON to the FioTec `/telemetry-4g` endpoint over 4G
- FioTec auto-maps `noise_lp` → `sound_level_leq`, etc., stores data, and displays charts

---

## 2. Endpoint

| Item            | Value                                                                                |
|-----------------|--------------------------------------------------------------------------------------|
| **URL**         | `https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g` |
| **Method**      | `POST`                                                                               |
| **Content-Type**| `application/json`                                                                   |
| **Auth Header** | `X-Webhook-Token: <your_webhook_token>`                                              |
| **Gateway Auth**| `Authorization: Bearer <anon_key>` (required by Supabase gateway)                     |
| **Alt Auth**    | Query param: `?token=<your_webhook_token>`                                           |
| **Rate Limit**  | 120 requests per minute per IP                                                       |

### Getting Your Webhook Token

1. Log into the FioTec dashboard at `https://fiotech-app.vercel.app`
2. Go to **Settings → Webhook Configuration**
3. Copy the **Webhook Token** shown there (or generate a new one)
4. This same token is used for both LoRaWAN and 4G devices

---

## 3. Payload Format

### 3.1 HY108-1 Native Format (from LD1 firmware `main.py`)

This is the **actual payload** sent by the LD1 firmware:

```json
{
  "device_id": "HY108-001",
  "timestamp": 1742104800,
  "noise_lp": 52.7,
  "noise_lmax": 71.3,
  "noise_lmin": 51.1,
  "noise_inst": 23.3
}
```

The backend **automatically maps** these to FioTec's standard field names:

| LD1 Firmware Field | → FioTec Internal Field | Description |
|--------------------|-------------------------|-------------|
| `noise_lp`         | `sound_level_leq`      | LP (Leq) — equivalent continuous sound level |
| `noise_lmax`       | `sound_level_lmax`     | Maximum level since last reset |
| `noise_lmin`       | `sound_level_lmin`     | Minimum level since last reset |
| `noise_inst`       | `sound_level_inst`     | Instantaneous (real-time) level |
| `timestamp` (int)  | ISO 8601 string        | Unix epoch → auto-converted |

### 3.2 Alternative Format (FioTec-native field names)

You can also use FioTec's standard field names directly:

```json
{
  "device_id": "HY108-001",
  "device_name": "HaaS506-LD1 Sound Meter Floor 3",
  "sound_level_leq": 52.7,
  "sound_level_lmax": 71.3,
  "sound_level_lmin": 51.1,
  "sound_level_inst": 23.3,
  "battery": 85,
  "timestamp": "2026-03-16T08:30:00Z"
}
```

### 3.3 Shorthand Format (dB values only)

```json
{
  "device_id": "HY108-001",
  "leq": 52.7,
  "lmax": 71.3,
  "lmin": 51.1
}
```

### Field Reference

| Field               | Type     | Required | Description                                               |
|---------------------|----------|----------|-----------------------------------------------------------|
| `device_id`         | string   | **Yes**  | Unique device identifier. Also accepts `serial`, `sn`, `deviceId` |
| `device_name`       | string   | No       | Human-readable name. Defaults to `4G-<last6chars>`        |
| `noise_lp`          | number   | No*      | LP (Leq) from HY108-1 (dB). Auto-mapped to `sound_level_leq` |
| `noise_lmax`        | number   | No*      | Lmax from HY108-1 (dB). Auto-mapped to `sound_level_lmax` |
| `noise_lmin`        | number   | No*      | Lmin from HY108-1 (dB). Auto-mapped to `sound_level_lmin` |
| `noise_inst`        | number   | No*      | Instantaneous from HY108-1 (dB). Auto-mapped to `sound_level_inst` |
| `sound_level_leq`   | number   | No*      | FioTec-native Leq field. Also accepts `leq` or `la`      |
| `sound_level_lmax`  | number   | No*      | FioTec-native Lmax field. Also accepts `lmax`             |
| `sound_level_lmin`  | number   | No*      | FioTec-native Lmin field. Also accepts `lmin`             |
| `sound_level_inst`  | number   | No*      | FioTec-native Instantaneous field                         |
| `battery`           | number   | No       | Battery percentage (0–100)                                |
| `timestamp`         | int/str  | No       | Unix epoch (seconds) or ISO 8601. Defaults to server time |
| `application`       | string   | No       | Application / project name for grouping                   |

> *At least one sensor reading field is required. Any field may be `null` if the HY108-1 didn't respond.

---

## 4. LD1 Firmware Configuration

### 4.1 Parameters in `main.py`

Update these constants in the LD1's `main.py` before flashing:

```python
# ═══ MUST CHANGE ═══

# FioTec webhook token (from Settings → Webhook Configuration)
WEBHOOK_TOKEN = "YOUR_WEBHOOK_TOKEN"

# FioTec 4G endpoint URL
FIOTECH_URL = "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g"

# Supabase anon key (for Authorization header)
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmJvanVsZ3BtcGJsbXRlcmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTIzNjYsImV4cCI6MjA4NTk2ODM2Nn0.HQk9BJqz4Qna3qkarsGVLuCCHlGg3iKONBqCzH2yhKI"

# Device identifier (unique per physical HY108-1 installation)
DEVICE_ID = "HY108-001"

# ═══ OPTIONAL ═══
UPLOAD_INTERVAL = 5  # seconds between readings (2-60)
RETRY_COUNT = 3
```

### 4.2 Upload Function in Firmware

The firmware's `upload_to_fiotech()` function should POST to the `/telemetry-4g` endpoint:

```python
def upload_to_fiotech(data):
    """Upload HY108-1 readings to FioTec platform."""
    import ujson
    import urequests
    
    url = FIOTECH_URL + "?token=" + WEBHOOK_TOKEN
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ANON_KEY
    }
    payload = ujson.dumps({
        "device_id": DEVICE_ID,
        "timestamp": int(utime.time()),
        "noise_lp": data.get("lp"),
        "noise_lmax": data.get("lmax"),
        "noise_lmin": data.get("lmin"),
        "noise_inst": data.get("inst")
    })
    
    for attempt in range(RETRY_COUNT):
        try:
            resp = urequests.post(url, data=payload, headers=headers)
            if resp.status_code == 200:
                print("[OK] FioTech upload success")
                resp.close()
                return True
            else:
                print("[ERR] FioTech HTTP", resp.status_code)
                resp.close()
        except Exception as e:
            print("[ERR] FioTech upload:", e)
    return False
```

### 4.3 Hardware Wiring (HY108-1 → LD1)

```
HY108-1 (DB9 Male)          HaaS506-LD1 (Terminal Block)
──────────────────           ──────────────────────────
Pin 2 (TX)  ───────────────→  serial2 RX
Pin 3 (RX)  ←───────────────  serial2 TX
Pin 5 (GND) ────────────────  GND
```

RS232 levels (±12V) — LD1's serial2 has built-in level conversion.

---

## 5. Testing with cURL

### Quick Test (HY108-1 native format)

```bash
curl -X POST \
  "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmJvanVsZ3BtcGJsbXRlcmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTIzNjYsImV4cCI6MjA4NTk2ODM2Nn0.HQk9BJqz4Qna3qkarsGVLuCCHlGg3iKONBqCzH2yhKI" \
  -H "X-Webhook-Token: YOUR_WEBHOOK_TOKEN" \
  -d '{
    "device_id": "HY108-TEST",
    "timestamp": 1742104800,
    "noise_lp": 52.7,
    "noise_lmax": 71.3,
    "noise_lmin": 51.1,
    "noise_inst": 23.3
  }'
```

### Expected Response

```json
{
  "success": true,
  "id": "SD1736935800000_abc123",
  "message": "4G telemetry data received."
}
```

### Error Responses

| HTTP Code | Body                                      | Cause                        |
|-----------|-------------------------------------------|------------------------------|
| 400       | `{"error": "Invalid JSON body."}`         | Malformed JSON               |
| 400       | `{"error": "Missing device_id..."}`       | No `device_id` field         |
| 400       | `{"error": "No sensor readings found..."}` | No numeric data fields       |
| 401       | `{"error": "Missing or invalid..."}`      | Bad or missing webhook token |
| 429       | `{"error": "Rate limited."}`              | Exceeded 120 req/min         |

---

## 6. What Happens After Data Arrives

1. **Auto-Registration**: The first time a `device_id` containing "HY108" or "HY-108" is seen, FioTec auto-creates a device with:
   - **Type**: "4G Sound Level Meter"
   - **Model**: "HY108-1"
   - **Manufacturer**: "Hunan Shengyi"
   - Other `device_id` patterns create generic "4G Sensor" type

2. **Field Mapping**: The backend translates HY108-1 firmware field names:
   - `noise_lp` → `sound_level_leq` (LP/Leq equivalent continuous level)
   - `noise_lmax` → `sound_level_lmax` (maximum level)
   - `noise_lmin` → `sound_level_lmin` (minimum level)
   - `noise_inst` → `sound_level_inst` (instantaneous level)
   - `timestamp` (Unix epoch int) → ISO 8601 string

3. **Dashboard Display**: The device appears with:
   - Violet-themed card showing Leq, Lmax, Lmin, and Inst readings
   - Historical chart with all 4 metrics plotted
   - Reference lines at 70 dB and 85 dB

4. **Alarms**: If `sound_level_leq` exceeds **85 dB**, an automatic "High Noise" alarm is generated.

5. **Property Assignment**: After auto-registration, assign the device to a property and set its location via the dashboard.

---

## 7. HY108-1 Protocol Reference

The HY108-1 uses a proprietary binary/ASCII hybrid protocol over RS232 (9600 baud, 8N1):

### Commands (single byte)

| Command | Byte | Response            |
|---------|------|---------------------|
| M       | 0x4D | LP (Leq) reading    |
| P       | 0x50 | Lmax reading        |
| L       | 0x4C | Lmin reading        |
| N       | 0x4E | Instantaneous level |
| S       | 0x53 | Status/model info   |

### Response Frame (9 bytes)

```
[0x01] [5 ASCII chars = dB value] [0x00] [checksum] [0xFF]
```

- Bytes 1–5: ASCII decimal digits (e.g., `"052.7"` → 52.7 dB)
- Checksum: `SUM(bytes[1..5]) & 0xFF`
- Example: `01 30 35 32 2E 37 00 CB FF` → 52.7 dB

### Timing

- Inter-command delay: ≥50 ms
- Response timeout: 100–200 ms per command
- LD1 firmware polls all 4 commands per cycle (~0.8s per full read)

---

## 8. Differences from LoRaWAN Webhook

| Feature               | LoRaWAN (`/telemetry-webhook`)            | 4G (`/telemetry-4g`)                  |
|-----------------------|-------------------------------------------|----------------------------------------|
| Device identifier     | `devEUI` (from gateway)                   | `device_id` (from payload)             |
| Connectivity          | LoRaWAN gateway → network server → HTTP   | Direct 4G HTTP POST                    |
| Payload encoding      | Base64-encoded TLV / Cayenne LPP          | Plain JSON                             |
| Gateway info          | Included (rxInfo, txInfo)                 | Not applicable                         |
| Signal strength       | From LoRa RSSI                            | Always 100% (direct connection)        |
| Auto-detect           | By devEUI prefix + device name            | By device name + payload content       |

---

## 9. Troubleshooting

| Symptom                  | Check                                                                 |
|--------------------------|-----------------------------------------------------------------------|
| 401 Unauthorized         | Verify webhook token in Settings → Webhook Configuration              |
| Device not appearing     | Ensure `device_id` is non-empty and consistent across POSTs           |
| No chart data            | Confirm at least one numeric sensor field is present in payload       |
| Stale readings           | Check LD1 upload interval; verify 4G SIM has active data plan         |
| "Rate limited" error     | Reduce POST frequency (max 120/min); increase `UPLOAD_INTERVAL`       |
| Some fields null         | HY108-1 may not respond to a command — check RS232 wiring & baud rate |
| Checksum mismatch        | Verify `SUM(bytes[1..5]) & 0xFF` matches byte 7 in response frame     |
