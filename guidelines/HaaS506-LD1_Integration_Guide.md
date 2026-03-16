# HaaS506-LD1 Sound Level Meter — FioTec Integration Guide

## Overview

This document describes how to configure a **HaaS506-LD1** (4G panel) to send sound level meter data to the **FioTec IoT Platform**. The LD1 posts sensor readings directly over HTTP/HTTPS via its 4G cellular connection — it does **not** use LoRaWAN.

---

## 1. Architecture

```
┌──────────────┐     4G / HTTP POST      ┌───────────────────┐     KV Store     ┌──────────────┐
│  Sound Level │  ─────────────────────>  │  FioTec Backend   │  ────────────>   │  Dashboard   │
│  Meter + LD1 │                          │  /telemetry-4g    │                  │  (Frontend)  │
└──────────────┘                          └───────────────────┘                  └──────────────┘
```

- The LD1 panel collects readings from the sound level meter via RS-485/analog input.
- The LD1 sends periodic HTTP POST requests to the FioTec backend over 4G.
- FioTec stores the data, auto-registers the device, and displays it in the dashboard.

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

### 3.1 Recommended Format (Flat)

```json
{
  "device_id": "LD1-001",
  "device_name": "HaaS506-LD1 Sound Meter Floor 3",
  "sound_level_leq": 65.2,
  "sound_level_lmax": 78.4,
  "sound_level_lmin": 42.1,
  "battery": 85,
  "timestamp": "2025-01-15T08:30:00Z"
}
```

### 3.2 Alternative Format (Nested)

```json
{
  "device_id": "LD1-001",
  "device_name": "HaaS506-LD1 Sound Meter Floor 3",
  "data": {
    "sound_level_leq": 65.2,
    "sound_level_lmax": 78.4,
    "sound_level_lmin": 42.1
  },
  "battery": 85,
  "timestamp": "2025-01-15T08:30:00Z"
}
```

### 3.3 Shorthand Format (dB values only)

```json
{
  "device_id": "LD1-001",
  "leq": 65.2,
  "lmax": 78.4,
  "lmin": 42.1
}
```

### Field Reference

| Field               | Type     | Required | Description                                               |
|---------------------|----------|----------|-----------------------------------------------------------|
| `device_id`         | string   | **Yes**  | Unique device identifier. Also accepts `serial`, `sn`, `deviceId` |
| `device_name`       | string   | No       | Human-readable name. Defaults to `4G-<last6chars>`        |
| `sound_level_leq`   | number   | No*      | Equivalent continuous sound level (dB). Also accepts `leq` or `la` |
| `sound_level_lmax`  | number   | No*      | Maximum sound level (dB). Also accepts `lmax`             |
| `sound_level_lmin`  | number   | No*      | Minimum sound level (dB). Also accepts `lmin`             |
| `battery`           | number   | No       | Battery percentage (0–100)                                |
| `temperature`       | number   | No       | Temperature in °C (if sensor supports it)                 |
| `timestamp`         | string   | No       | ISO 8601 timestamp. Defaults to server receive time       |
| `application`       | string   | No       | Application / project name for grouping                   |

> *At least one sensor reading field is required.

---

## 4. LD1 Panel Configuration

### 4.1 HTTP Client Setup

On the HaaS506-LD1 panel (via its web interface or AT commands):

1. **Protocol**: HTTP / HTTPS
2. **Method**: POST
3. **URL**: `https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g?token=YOUR_TOKEN`
4. **Content-Type**: `application/json`
5. **Reporting Interval**: Set to desired interval (e.g., 60 seconds, 300 seconds)

> **Tip**: Using the `?token=` query parameter is simpler for most 4G panels. If the panel supports custom headers, use `X-Webhook-Token` header instead for better security.

### 4.2 Data Mapping

Map the sound level meter's Modbus/analog registers to JSON fields:

| Meter Register / Signal  | JSON Field           | Unit  |
|--------------------------|----------------------|-------|
| Leq (A-weighted)         | `sound_level_leq`   | dB(A) |
| Lmax                     | `sound_level_lmax`   | dB    |
| Lmin                     | `sound_level_lmin`   | dB    |
| Battery voltage → %      | `battery`            | %     |

### 4.3 Lua Script (if LD1 supports scripting)

If the HaaS506-LD1 supports custom Lua scripts for data formatting:

```lua
-- Example Lua script for HaaS506-LD1
local json = require("json")

-- Read sound level meter values from Modbus/serial
local leq = read_register(0x0001)   -- Adjust register addresses
local lmax = read_register(0x0002)
local lmin = read_register(0x0003)

local payload = json.encode({
    device_id = "LD1-001",
    device_name = "HaaS506-LD1 Sound Meter",
    sound_level_leq = leq / 10.0,
    sound_level_lmax = lmax / 10.0,
    sound_level_lmin = lmin / 10.0,
    battery = get_battery_percent(),
    timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
})

-- POST to FioTec
http_post(
    "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g?token=YOUR_TOKEN",
    payload,
    { ["Content-Type"] = "application/json" }
)
```

> **Note**: Adjust register addresses and scaling factors based on your specific sound level meter's Modbus map.

---

## 5. Testing with cURL

### Quick Test (verify connectivity)

```bash
curl -X POST \
  "https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9/telemetry-4g" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmJvanVsZ3BtcGJsbXRlcmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTIzNjYsImV4cCI6MjA4NTk2ODM2Nn0.HQk9BJqz4Qna3qkarsGVLuCCHlGg3iKONBqCzH2yhKI" \
  -H "X-Webhook-Token: YOUR_WEBHOOK_TOKEN" \
  -d '{
    "device_id": "LD1-TEST-001",
    "device_name": "HaaS506-LD1 Test",
    "sound_level_leq": 55.3,
    "sound_level_lmax": 72.1,
    "sound_level_lmin": 38.5,
    "battery": 90
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

1. **Auto-Registration**: The first time a `device_id` is seen, FioTec automatically creates a device entry with type "Sound Level Sensor" and model "HaaS506-LD1".

2. **Dashboard Display**: The device appears on the dashboard with:
   - Violet-themed card showing Leq, Lmax, Lmin readings
   - Historical chart with reference lines at 70 dB and 85 dB
   - Battery indicator

3. **Alarms**: If `sound_level_leq` exceeds **85 dB**, an automatic "High Noise" alarm is generated.

4. **Property Assignment**: After auto-registration, assign the device to a property and set its location via the dashboard's device panel.

---

## 7. Supported Additional Sensors

The 4G endpoint accepts any numeric sensor data. If the LD1 panel connects to additional sensors, include their readings in the same payload:

```json
{
  "device_id": "LD1-001",
  "sound_level_leq": 65.2,
  "sound_level_lmax": 78.4,
  "sound_level_lmin": 42.1,
  "temperature": 24.5,
  "humidity": 62,
  "battery": 85
}
```

All numeric fields are automatically stored and charted.

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
| Stale readings           | Check LD1 reporting interval; verify 4G SIM has active data plan      |
| "Rate limited" error     | Reduce POST frequency (max 120/min); increase reporting interval      |
