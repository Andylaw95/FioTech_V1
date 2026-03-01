// ══════════════════════════════════════════════════════════════
// AWS IoT Core Integration Routes
// Lazy-loaded from routes.tsx to avoid impacting boot time.
// Uses AWS SDK v3 via npm: specifiers for Deno compatibility.
// ══════════════════════════════════════════════════════════════

import { IoTClient, ListThingsCommand, DescribeThingCommand, ListThingGroupsForThingCommand } from "npm:@aws-sdk/client-iot@3.750.0";
import { IoTDataPlaneClient, GetThingShadowCommand, UpdateThingShadowCommand, PublishCommand } from "npm:@aws-sdk/client-iot-data-plane@3.750.0";
import { DynamoDBClient, QueryCommand, ScanCommand, DescribeTableCommand } from "npm:@aws-sdk/client-dynamodb@3.750.0";
import { unmarshall } from "npm:@aws-sdk/util-dynamodb@3.750.0";

// ── Types ──────────────────────────────────────────────────

interface AWSConfig {
  iotEndpoint: string;       // e.g. "a1b2c3d4e5f6g7-ats.iot.ap-east-1.amazonaws.com"
  region: string;            // e.g. "ap-east-1"
  dynamoTableName: string;   // e.g. "iot-sensor-data"
  dynamoSortKey: string;     // e.g. "timestamp"
  dynamoPartitionKey: string;// e.g. "deviceId"
  enabled: boolean;
  syncInterval: number;      // minutes, 0 = manual only
  lastSyncAt: string | null;
}

const DEFAULT_AWS_CONFIG: AWSConfig = {
  iotEndpoint: "",
  region: "",
  dynamoTableName: "",
  dynamoSortKey: "timestamp",
  dynamoPartitionKey: "deviceId",
  enabled: false,
  syncInterval: 0,
  lastSyncAt: null,
};

// ── Lazy AWS Client Initialization ──────────────────────

let _iotClient: IoTClient | null = null;
let _iotDataClient: IoTDataPlaneClient | null = null;
let _dynamoClient: DynamoDBClient | null = null;
let _awsConfigured = false;
let _awsConfigError: string | null = null;

function getAWSCredentials(): { accessKeyId: string; secretAccessKey: string; region: string } | null {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_REGION");

  if (!accessKeyId || !secretAccessKey || !region) {
    return null;
  }
  return { accessKeyId, secretAccessKey, region };
}

function getIoTClient(regionOverride?: string): IoTClient {
  const creds = getAWSCredentials();
  if (!creds) throw new Error("AWS credentials not configured");
  const region = regionOverride || creds.region;

  if (_iotClient && !regionOverride) return _iotClient;

  const client = new IoTClient({
    region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });
  if (!regionOverride) _iotClient = client;
  return client;
}

function getIoTDataClient(endpoint: string, regionOverride?: string): IoTDataPlaneClient {
  const creds = getAWSCredentials();
  if (!creds) throw new Error("AWS credentials not configured");
  const region = regionOverride || creds.region;

  // Always recreate if endpoint changes
  const client = new IoTDataPlaneClient({
    region,
    endpoint: endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });
  _iotDataClient = client;
  return client;
}

function getDynamoClient(regionOverride?: string): DynamoDBClient {
  const creds = getAWSCredentials();
  if (!creds) throw new Error("AWS credentials not configured");
  const region = regionOverride || creds.region;

  if (_dynamoClient && !regionOverride) return _dynamoClient;

  const client = new DynamoDBClient({
    region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });
  if (!regionOverride) _dynamoClient = client;
  return client;
}

// ── Helpers ─────────────────────────────────────────────

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function sanitizeString(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, maxLength);
}

// ── Route Registration ──────────────────────────────────

export function registerAWSRoutes(
  app: any,
  requireAuth: (c: any) => Promise<{ userId: string } | Response>,
  cachedKvGet: (key: string) => Promise<any>,
  cachedKvSet: (key: string, data: any) => Promise<void>,
  uk: (userId: string, collection: string) => string,
) {
  const PREFIX = "/make-server-4916a0b9";

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/status — Check AWS connectivity & configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/status`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    const hasCredentials = !!creds;
    let iotReachable = false;
    let dynamoReachable = false;

    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };

    if (hasCredentials && userConfig.region) {
      // Test IoT Core connectivity
      try {
        const iot = getIoTClient(userConfig.region);
        await iot.send(new ListThingsCommand({ maxResults: 1 }));
        iotReachable = true;
      } catch (e) {
        console.log("AWS IoT connectivity test failed:", errorMessage(e));
      }

      // Test DynamoDB connectivity (only if table configured)
      if (userConfig.dynamoTableName) {
        try {
          const dynamo = getDynamoClient(userConfig.region);
          await dynamo.send(new DescribeTableCommand({ TableName: userConfig.dynamoTableName }));
          dynamoReachable = true;
        } catch (e) {
          console.log("AWS DynamoDB connectivity test failed:", errorMessage(e));
        }
      }
    }

    return c.json({
      configured: hasCredentials,
      credentialsSet: hasCredentials,
      iotCoreConnected: iotReachable,
      dynamoDBConnected: dynamoReachable,
      region: userConfig.region || creds?.region || "",
      iotEndpoint: userConfig.iotEndpoint || "",
      dynamoTableName: userConfig.dynamoTableName || "",
      enabled: userConfig.enabled,
      lastSyncAt: userConfig.lastSyncAt,
      missingSecrets: !hasCredentials ? ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] : [],
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/config — Get user's AWS configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/config`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const config: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    const creds = getAWSCredentials();

    return c.json({
      ...config,
      region: config.region || creds?.region || "",
      credentialsConfigured: !!creds,
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUT /aws/config — Update user's AWS configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.put(`${PREFIX}/aws/config`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const body = await c.req.json();
    const existing: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };

    const updated: AWSConfig = {
      iotEndpoint: sanitizeString(body.iotEndpoint ?? existing.iotEndpoint, 256),
      region: sanitizeString(body.region ?? existing.region, 30),
      dynamoTableName: sanitizeString(body.dynamoTableName ?? existing.dynamoTableName, 256),
      dynamoSortKey: sanitizeString(body.dynamoSortKey ?? existing.dynamoSortKey, 128),
      dynamoPartitionKey: sanitizeString(body.dynamoPartitionKey ?? existing.dynamoPartitionKey, 128),
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
      syncInterval: typeof body.syncInterval === "number" ? Math.min(1440, Math.max(0, body.syncInterval)) : existing.syncInterval,
      lastSyncAt: existing.lastSyncAt,
    };

    await cachedKvSet(uk(auth.userId, "aws_config"), updated);
    return c.json({ success: true, config: updated });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/things — List IoT Core Things
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/things`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION as Supabase secrets." }, 503);

    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    const region = userConfig.region || creds.region;

    try {
      const iot = getIoTClient(region);
      const nextToken = c.req.query("nextToken") || undefined;
      const maxResults = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));

      const result = await iot.send(new ListThingsCommand({
        maxResults,
        nextToken,
      }));

      const things = (result.things || []).map((t: any) => ({
        thingName: t.thingName,
        thingArn: t.thingArn,
        thingTypeName: t.thingTypeName || null,
        attributes: t.attributes || {},
        version: t.version,
      }));

      return c.json({
        things,
        nextToken: result.nextToken || null,
        total: things.length,
      });
    } catch (e) {
      console.log("AWS ListThings error:", errorMessage(e));
      return c.json({ error: "Failed to list AWS IoT things.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/things/:thingName — Get Thing details
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/things/:thingName`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const thingName = c.req.param("thingName");
    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    const region = userConfig.region || creds.region;

    try {
      const iot = getIoTClient(region);
      const thing = await iot.send(new DescribeThingCommand({ thingName }));

      // Try to get thing groups
      let groups: string[] = [];
      try {
        const groupResult = await iot.send(new ListThingGroupsForThingCommand({ thingName }));
        groups = (groupResult.thingGroups || []).map((g: any) => g.groupName).filter(Boolean);
      } catch { /* ignore */ }

      return c.json({
        thingName: thing.thingName,
        thingId: thing.thingId,
        thingArn: thing.thingArn,
        thingTypeName: thing.thingTypeName || null,
        attributes: thing.attributes || {},
        version: thing.version,
        groups,
      });
    } catch (e) {
      console.log("AWS DescribeThing error:", errorMessage(e));
      return c.json({ error: `Failed to describe thing '${thingName}'.`, detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/things/:thingName/shadow — Get Device Shadow
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/things/:thingName/shadow`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const thingName = c.req.param("thingName");
    const shadowName = c.req.query("shadowName") || undefined; // named shadow support
    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };

    if (!userConfig.iotEndpoint) {
      return c.json({ error: "IoT Data endpoint not configured. Set it in AWS Configuration settings." }, 400);
    }

    try {
      const iotData = getIoTDataClient(userConfig.iotEndpoint, userConfig.region || creds.region);
      const result = await iotData.send(new GetThingShadowCommand({
        thingName,
        ...(shadowName ? { shadowName } : {}),
      }));

      const payload = result.payload ? new TextDecoder().decode(result.payload) : "{}";
      const shadow = JSON.parse(payload);

      return c.json({
        thingName,
        shadow,
        state: shadow.state || {},
        metadata: shadow.metadata || {},
        version: shadow.version,
        timestamp: shadow.timestamp,
      });
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("No shadow exists")) {
        return c.json({ thingName, shadow: null, state: {}, message: "No shadow exists for this thing." });
      }
      console.log("AWS GetThingShadow error:", msg);
      return c.json({ error: `Failed to get shadow for '${thingName}'.`, detail: msg }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUT /aws/things/:thingName/shadow — Update Device Shadow (bidirectional control)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.put(`${PREFIX}/aws/things/:thingName/shadow`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const thingName = c.req.param("thingName");
    const body = await c.req.json();
    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };

    if (!userConfig.iotEndpoint) {
      return c.json({ error: "IoT Data endpoint not configured." }, 400);
    }

    // The body should contain desired state: { state: { desired: { ... } } }
    const shadowUpdate = body.state ? body : { state: { desired: body.desired || body } };

    try {
      const iotData = getIoTDataClient(userConfig.iotEndpoint, userConfig.region || creds.region);
      const result = await iotData.send(new UpdateThingShadowCommand({
        thingName,
        payload: new TextEncoder().encode(JSON.stringify(shadowUpdate)),
      }));

      const payload = result.payload ? new TextDecoder().decode(result.payload) : "{}";
      const updatedShadow = JSON.parse(payload);

      return c.json({
        success: true,
        thingName,
        shadow: updatedShadow,
      });
    } catch (e) {
      console.log("AWS UpdateThingShadow error:", errorMessage(e));
      return c.json({ error: `Failed to update shadow for '${thingName}'.`, detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /aws/publish — Publish MQTT message (bidirectional control)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.post(`${PREFIX}/aws/publish`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const body = await c.req.json();
    const topic = sanitizeString(body.topic, 512);
    const message = body.payload || body.message;
    const qos = body.qos === 0 ? 0 : 1;

    if (!topic) return c.json({ error: "MQTT topic is required." }, 400);

    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    if (!userConfig.iotEndpoint) {
      return c.json({ error: "IoT Data endpoint not configured." }, 400);
    }

    try {
      const iotData = getIoTDataClient(userConfig.iotEndpoint, userConfig.region || creds.region);
      await iotData.send(new PublishCommand({
        topic,
        payload: new TextEncoder().encode(typeof message === "string" ? message : JSON.stringify(message)),
        qos,
      }));

      return c.json({ success: true, topic, qos });
    } catch (e) {
      console.log("AWS Publish error:", errorMessage(e));
      return c.json({ error: "Failed to publish MQTT message.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /aws/telemetry — Read telemetry from DynamoDB
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/aws/telemetry`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const userConfig: AWSConfig = (await cachedKvGet(uk(auth.userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };

    if (!userConfig.dynamoTableName) {
      return c.json({ error: "DynamoDB table not configured. Set it in AWS Configuration settings." }, 400);
    }

    const deviceId = c.req.query("deviceId");
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
    const hoursBack = Math.min(168, Math.max(1, parseInt(c.req.query("hours") || "24", 10)));

    const sinceTimestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    try {
      const dynamo = getDynamoClient(userConfig.region || creds.region);

      let items: any[] = [];

      if (deviceId) {
        // Query by device (partition key)
        const result = await dynamo.send(new QueryCommand({
          TableName: userConfig.dynamoTableName,
          KeyConditionExpression: `${userConfig.dynamoPartitionKey} = :deviceId AND ${userConfig.dynamoSortKey} >= :since`,
          ExpressionAttributeValues: {
            ":deviceId": { S: deviceId },
            ":since": { S: sinceTimestamp },
          },
          Limit: limit,
          ScanIndexForward: false, // newest first
        }));
        items = (result.Items || []).map((item: any) => unmarshall(item));
      } else {
        // Scan recent items (less efficient, but works without device ID)
        const result = await dynamo.send(new ScanCommand({
          TableName: userConfig.dynamoTableName,
          FilterExpression: `${userConfig.dynamoSortKey} >= :since`,
          ExpressionAttributeValues: {
            ":since": { S: sinceTimestamp },
          },
          Limit: limit,
        }));
        items = (result.Items || []).map((item: any) => unmarshall(item));
      }

      return c.json({
        source: "aws-dynamodb",
        tableName: userConfig.dynamoTableName,
        items,
        count: items.length,
        queryParams: { deviceId: deviceId || null, hoursBack, limit },
      });
    } catch (e) {
      console.log("AWS DynamoDB query error:", errorMessage(e));
      return c.json({ error: "Failed to query DynamoDB.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /aws/sync-devices — Sync AWS IoT Things → FioTech Devices
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.post(`${PREFIX}/aws/sync-devices`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const userConfig: AWSConfig = (await cachedKvGet(uk(userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    const region = userConfig.region || creds.region;

    try {
      const iot = getIoTClient(region);

      // Fetch all things (paginated, up to 200)
      let allThings: any[] = [];
      let nextToken: string | undefined;
      do {
        const result: any = await iot.send(new ListThingsCommand({ maxResults: 100, nextToken }));
        allThings = [...allThings, ...(result.things || [])];
        nextToken = result.nextToken;
      } while (nextToken && allThings.length < 200);

      // Get existing FioTech devices
      const existingDevices: any[] = (await cachedKvGet(uk(userId, "devices"))) || [];

      // Track sync results
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const thing of allThings) {
        const awsThingName = thing.thingName;
        const existing = existingDevices.find((d: any) =>
          d.awsThingName === awsThingName || d.name === awsThingName
        );

        if (existing) {
          // Update existing device with AWS link
          existing.awsThingName = awsThingName;
          existing.awsThingArn = thing.thingArn;
          existing.awsThingType = thing.thingTypeName || null;
          existing.awsAttributes = thing.attributes || {};
          existing.awsSyncedAt = new Date().toISOString();
          updated++;
        } else {
          // Create new FioTech device from AWS Thing
          const deviceType = thing.thingTypeName || thing.attributes?.type || "sensor";
          const newDevice = {
            id: `aws-${awsThingName}-${Date.now().toString(36)}`,
            name: awsThingName,
            type: mapAWSTypeToFioTechType(deviceType),
            building: thing.attributes?.building || thing.attributes?.location || "Unassigned",
            location: thing.attributes?.location || thing.attributes?.room || "AWS IoT Core",
            lastUpdate: new Date().toISOString(),
            battery: 100,
            status: "online",
            source: "aws-iot-core",
            awsThingName,
            awsThingArn: thing.thingArn,
            awsThingType: thing.thingTypeName || null,
            awsAttributes: thing.attributes || {},
            awsSyncedAt: new Date().toISOString(),
          };
          existingDevices.push(newDevice);
          created++;
        }
      }

      // Save updated devices
      await cachedKvSet(uk(userId, "devices"), existingDevices);

      // Update sync timestamp
      userConfig.lastSyncAt = new Date().toISOString();
      await cachedKvSet(uk(userId, "aws_config"), userConfig);

      return c.json({
        success: true,
        summary: {
          awsThingsFound: allThings.length,
          created,
          updated,
          skipped,
          totalFioTechDevices: existingDevices.length,
        },
        syncedAt: userConfig.lastSyncAt,
      });
    } catch (e) {
      console.log("AWS sync-devices error:", errorMessage(e));
      return c.json({ error: "Failed to sync AWS devices.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /aws/push-telemetry — Push FioTech sensor data to AWS IoT Core
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.post(`${PREFIX}/aws/push-telemetry`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const creds = getAWSCredentials();
    if (!creds) return c.json({ error: "AWS credentials not configured." }, 503);

    const userConfig: AWSConfig = (await cachedKvGet(uk(userId, "aws_config"))) || { ...DEFAULT_AWS_CONFIG };
    if (!userConfig.iotEndpoint) {
      return c.json({ error: "IoT Data endpoint not configured." }, 400);
    }

    const body = await c.req.json();
    const deviceName = sanitizeString(body.deviceName || body.thingName, 256);
    const topic = sanitizeString(body.topic || `fiotech/devices/${deviceName}/telemetry`, 512);

    // Get latest sensor data for this device
    const sensorData: any[] = (await cachedKvGet(uk(userId, "sensor_data"))) || [];
    const deviceData = deviceName
      ? sensorData.filter((s: any) => s.deviceName === deviceName).slice(0, 10)
      : sensorData.slice(0, 20);

    if (deviceData.length === 0) {
      return c.json({ error: "No sensor data to push.", deviceName }, 400);
    }

    try {
      const iotData = getIoTDataClient(userConfig.iotEndpoint, userConfig.region || creds.region);

      const payload = {
        source: "fiotech",
        deviceName,
        timestamp: new Date().toISOString(),
        readings: deviceData.map((d: any) => ({
          receivedAt: d.receivedAt,
          decodedData: d.decodedData,
          rssi: d.rssi,
          snr: d.snr,
        })),
      };

      await iotData.send(new PublishCommand({
        topic,
        payload: new TextEncoder().encode(JSON.stringify(payload)),
        qos: 1,
      }));

      return c.json({ success: true, topic, entriesPushed: deviceData.length });
    } catch (e) {
      console.log("AWS push-telemetry error:", errorMessage(e));
      return c.json({ error: "Failed to push telemetry to AWS.", detail: errorMessage(e) }, 500);
    }
  });

  console.log("[FioTech AWS] All AWS route handlers registered.");
}

// ── Type Mapping Helper ──────────────────────────────────

function mapAWSTypeToFioTechType(awsType: string): string {
  const type = (awsType || "").toLowerCase();
  if (type.includes("temperature") || type.includes("temp")) return "Temperature Sensor";
  if (type.includes("humidity")) return "Humidity Sensor";
  if (type.includes("smoke")) return "Smoke Detector";
  if (type.includes("fire")) return "Fire Detector";
  if (type.includes("water") || type.includes("leak")) return "Water Leakage Sensor";
  if (type.includes("air") || type.includes("iaq")) return "IAQ Monitor";
  if (type.includes("noise")) return "Noise Sensor";
  if (type.includes("motion") || type.includes("pir")) return "Motion Sensor";
  if (type.includes("door") || type.includes("contact")) return "Door Sensor";
  if (type.includes("gateway")) return "Gateway";
  return "IoT Sensor";
}
