# AWS IoT Core Integration — Setup Guide

## Overview

FioTec integrates with AWS IoT Core for **bidirectional** device management:
- **AWS → FioTec**: Import IoT Things, read Device Shadows, query DynamoDB telemetry
- **FioTec → AWS**: Update Device Shadows (desired state), publish MQTT messages, push telemetry

---

## Prerequisites

1. An AWS account with IoT Core enabled
2. IoT devices already registered as "Things" in AWS IoT Core
3. (Optional) A DynamoDB table storing sensor telemetry data
4. The Supabase CLI installed (`npm i -g supabase`)

---

## Step 1: Create IAM User

1. Open **AWS Console → IAM → Users → Create User**
2. Name: `fiotec-iot-integration`
3. Access type: **Programmatic access** (Access Key)
4. Attach the following **custom policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "IoTCoreReadWrite",
      "Effect": "Allow",
      "Action": [
        "iot:ListThings",
        "iot:DescribeThing",
        "iot:ListThingGroupsForThing",
        "iot:GetThingShadow",
        "iot:UpdateThingShadow",
        "iot:Publish"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DynamoDBRead",
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/YOUR_TABLE_NAME*"
    }
  ]
}
```

> **Security Note**: Replace `YOUR_TABLE_NAME` with your actual DynamoDB table name. You can also restrict the IoT `Resource` to specific thing ARNs if needed.

---

## Step 2: Generate Access Keys

1. Go to the IAM user → **Security Credentials**
2. Click **Create Access Key** → Choose **"Third-party service"**
3. Save the **Access Key ID** and **Secret Access Key** securely

---

## Step 3: Set Supabase Secrets

Run these commands with the Supabase CLI:

```bash
supabase secrets set AWS_ACCESS_KEY_ID=AKIA...your-key-id
supabase secrets set AWS_SECRET_ACCESS_KEY=wJal...your-secret-key
supabase secrets set AWS_REGION=ap-east-1
```

Or set them via **Supabase Dashboard → Project Settings → Edge Functions → Secrets**.

After setting secrets, **redeploy the Edge Function** to pick them up:
```bash
supabase functions deploy make-server-4916a0b9
```

---

## Step 4: Get IoT Core Data Endpoint

Run this AWS CLI command to find your IoT Data endpoint:

```bash
aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

This returns something like:
```json
{
  "endpointAddress": "a1b2c3d4e5-ats.iot.ap-east-1.amazonaws.com"
}
```

---

## Step 5: Configure in FioTec

1. Open **FioTec → Settings → AWS Cloud**
2. Set the **AWS Region** (must match your IoT Core region)
3. Paste the **IoT Core Data Endpoint** from Step 4
4. (Optional) Enter your **DynamoDB table name** and key schema
5. Toggle **Enable AWS Integration** to ON
6. Click **Save Configuration**
7. Click **Test Connection** to verify connectivity

---

## Step 6: Sync Devices

1. In the AWS Cloud settings page, click **Sync Now**
2. AWS IoT Things will be imported as FioTec devices
3. Existing matches (by name) are updated; new things are created
4. Synced devices show `source: "aws-iot-core"` in their data

---

## API Endpoints (for developers)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/aws/status` | Check AWS connectivity |
| `GET` | `/aws/config` | Get user's AWS config |
| `PUT` | `/aws/config` | Update AWS config |
| `GET` | `/aws/things` | List IoT Core Things |
| `GET` | `/aws/things/:name` | Get Thing details |
| `GET` | `/aws/things/:name/shadow` | Get Device Shadow |
| `PUT` | `/aws/things/:name/shadow` | Update Device Shadow (desired state) |
| `POST` | `/aws/publish` | Publish MQTT message |
| `GET` | `/aws/telemetry` | Query DynamoDB telemetry |
| `POST` | `/aws/sync-devices` | Sync Things → FioTec devices |
| `POST` | `/aws/push-telemetry` | Push FioTec data → AWS IoT Core |

---

## DynamoDB Table Schema (Expected)

FioTec expects a DynamoDB table with:
- **Partition Key**: Device identifier (default key name: `deviceId`)
- **Sort Key**: Timestamp (default key name: `timestamp`)

You can customize these key names in the AWS Configuration settings.

Example item:
```json
{
  "deviceId": "sensor-001",
  "timestamp": "2026-02-23T10:30:00Z",
  "temperature": 22.5,
  "humidity": 65,
  "battery": 85,
  "rssi": -72
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "AWS credentials not configured" | Set Supabase secrets and redeploy |
| IoT Core connection fails | Verify region matches, IAM policy has `iot:ListThings` |
| Shadow read fails | Ensure IoT endpoint is correct (Data-ATS type) |
| DynamoDB query fails | Check table name, partition/sort key names match |
| CORS errors | Not applicable — all AWS calls go through backend |

---

## Security Considerations

- AWS credentials are stored as **Supabase Edge Function secrets** — never exposed to the frontend
- All AWS API calls are **server-side** through the Supabase Edge Function
- The IAM policy uses **least-privilege** — only the permissions needed
- User-specific config (endpoint, table name) is stored in the KV store per user
