// ══════════════════════════════════════════════════════════════
// Seer Platform (SenseLive by Aura Labs) Integration Routes
// Lazy-loaded from routes.tsx to avoid impacting boot time.
// Connects to the Kong API Gateway on cloud.fiotec.com.hk
// for K11 IT Office building sensors (Milesight devices).
//
// ⚠ PREPARED BUT NOT WIRED — this file is NOT imported anywhere
// yet. To activate, add a dynamic import block in routes.tsx
// similar to the AWS routes pattern.
// ══════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────

interface SeerConfig {
  host: string;           // e.g. "cloud.fiotec.com.hk"
  gatewayPrefix: string;  // e.g. "/fiotec-gateway"
  email: string;          // Seer platform login email
  // password is stored encrypted in env var SEER_PASSWORD
  enabled: boolean;
  syncInterval: number;   // minutes, 0 = manual only
  lastSyncAt: string | null;
}

const DEFAULT_SEER_CONFIG: SeerConfig = {
  host: "cloud.fiotec.com.hk",
  gatewayPrefix: "/fiotec-gateway",
  email: "",
  enabled: false,
  syncInterval: 0,
  lastSyncAt: null,
};

interface SeerToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // Unix ms when accessToken expires
  workspaceId: string;
  workspaceName: string;
}

interface SeerDevice {
  id: string;
  name: string;
  shortName: string;
  type: string;            // IAQ, WATER_LEAK_DETECTOR_MINI, MAGNETIC_CONTACT_SWITCH, GATEWAY
  decoder: string | null;  // e.g. "AM100" for Milesight AM100
  extName: string;
  timeout: number;
  enableAlert: boolean;
  zoneName: string | null;
  zoneId: string | null;
  zoneType: string | null;
  location: string | null;
  workspace: string;
}

interface SeerZone {
  id: string;
  name: string;
  zoneType: string;        // building, floor, SERVER_ROOM
  address: string | null;
  imageUrl: string | null;
  workspace: string;
  deviceCount: number;
}

interface SeerAnalyticsPoint {
  time: string;
  [key: string]: any;      // Sensor-specific fields (temperature, humidity, co2, etc.)
}

// ── Token Management ────────────────────────────────────

let _seerToken: SeerToken | null = null;

function isSeerTokenValid(): boolean {
  if (!_seerToken) return false;
  // Refresh 60s before expiry
  return Date.now() < (_seerToken.expiresAt - 60_000);
}

// ── HTTP Client ─────────────────────────────────────────

async function seerFetch(
  config: SeerConfig,
  method: string,
  path: string,
  body?: Record<string, any>,
  token?: string,
): Promise<{ status: number; data: any }> {
  const url = `https://${config.host}${config.gatewayPrefix}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Host": config.host,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    return { status: resp.status, data };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function seerLogin(config: SeerConfig): Promise<SeerToken> {
  const password = Deno.env.get("SEER_PASSWORD");
  if (!password) throw new Error("SEER_PASSWORD not configured as Supabase secret");
  if (!config.email) throw new Error("Seer email not configured");

  const { status, data } = await seerFetch(config, "POST", "/iam/v1/auth/login", {
    email: config.email,
    password,
  });

  if (status !== 200 && status !== 201) {
    const msg = typeof data === "object" ? (data.message || JSON.stringify(data)) : String(data);
    throw new Error(`Seer login failed (${status}): ${msg}`);
  }

  const d = data.data || data;
  const token: SeerToken = {
    accessToken: d.accessToken,
    refreshToken: d.refreshToken,
    // JWT HS384 — exp claim is in seconds, convert to ms
    expiresAt: Date.now() + 10 * 60 * 1000, // Conservative 10min (actual is in JWT)
    workspaceId: d.workspaceId,
    workspaceName: (d.workspace?.[0]?.name) || "Unknown",
  };

  _seerToken = token;
  return token;
}

async function seerRefresh(config: SeerConfig): Promise<SeerToken> {
  if (!_seerToken?.refreshToken) throw new Error("No refresh token available");

  const { status, data } = await seerFetch(config, "POST", "/iam/v1/auth/refresh", undefined, _seerToken.accessToken);

  if (status !== 200 && status !== 201) {
    // Refresh failed — try full re-login
    _seerToken = null;
    return seerLogin(config);
  }

  const d = data.data || data;
  _seerToken = {
    ..._seerToken,
    accessToken: d.accessToken || _seerToken.accessToken,
    refreshToken: d.refreshToken || _seerToken.refreshToken,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return _seerToken;
}

/** Get a valid Seer access token, refreshing/re-logging as needed */
async function getSeerToken(config: SeerConfig): Promise<string> {
  if (isSeerTokenValid()) return _seerToken!.accessToken;
  if (_seerToken?.refreshToken) {
    try {
      const t = await seerRefresh(config);
      return t.accessToken;
    } catch { /* fall through to full login */ }
  }
  const t = await seerLogin(config);
  return t.accessToken;
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

export function registerSeerRoutes(
  app: any,
  requireAuth: (c: any) => Promise<{ userId: string } | Response>,
  cachedKvGet: (key: string) => Promise<any>,
  cachedKvSet: (key: string, data: any) => Promise<void>,
  uk: (userId: string, collection: string) => string,
) {
  const PREFIX = "/make-server-4916a0b9";

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/status — Check Seer platform connectivity
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/status`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    const hasPassword = !!Deno.env.get("SEER_PASSWORD");

    let apiReachable = false;
    let apiVersion = "";
    let authenticated = false;
    let workspaceName = "";

    // 1. Test API reachability (no auth needed)
    try {
      const { status, data } = await seerFetch(userConfig, "GET", "/../entry/v1");
      if (status === 200 && data?.sCode === 0) {
        apiReachable = true;
        apiVersion = data.version || "";
      }
    } catch { /* API unreachable */ }

    // 2. Test authentication (if configured)
    if (apiReachable && hasPassword && userConfig.email) {
      try {
        const token = await getSeerToken(userConfig);
        authenticated = !!token;
        workspaceName = _seerToken?.workspaceName || "";
      } catch { /* auth failed */ }
    }

    return c.json({
      configured: hasPassword && !!userConfig.email,
      apiReachable,
      apiVersion,
      authenticated,
      host: userConfig.host,
      workspaceName,
      enabled: userConfig.enabled,
      lastSyncAt: userConfig.lastSyncAt,
      missingSecrets: !hasPassword ? ["SEER_PASSWORD"] : [],
      missingConfig: !userConfig.email ? ["email"] : [],
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/config — Get Seer configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/config`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const config: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    return c.json({
      ...config,
      passwordConfigured: !!Deno.env.get("SEER_PASSWORD"),
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUT /seer/config — Update Seer configuration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.put(`${PREFIX}/seer/config`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const body = await c.req.json();
    const existing: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };

    const updated: SeerConfig = {
      host: sanitizeString(body.host ?? existing.host, 256),
      gatewayPrefix: sanitizeString(body.gatewayPrefix ?? existing.gatewayPrefix, 128),
      email: sanitizeString(body.email ?? existing.email, 256),
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
      syncInterval: typeof body.syncInterval === "number" ? Math.min(1440, Math.max(0, body.syncInterval)) : existing.syncInterval,
      lastSyncAt: existing.lastSyncAt,
    };

    // Clear cached token when config changes (force re-login)
    _seerToken = null;

    await cachedKvSet(uk(auth.userId, "seer_config"), updated);
    return c.json({ success: true, config: updated });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/zones — List buildings/floors/rooms
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/zones`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(c.req.query("offset") || "0", 10));
      const zoneType = c.req.query("type"); // building, floor, SERVER_ROOM

      let path = `/device/v1/zones/paginate?limit=${limit}&offset=${offset}`;
      if (zoneType) path += `&zoneType=${encodeURIComponent(zoneType)}`;

      const { status, data } = await seerFetch(userConfig, "GET", path, undefined, token);

      if (status === 401) {
        // Token expired mid-request — retry once
        _seerToken = null;
        const newToken = await getSeerToken(userConfig);
        const retry = await seerFetch(userConfig, "GET", path, undefined, newToken);
        if (retry.status !== 200) throw new Error(`Seer zones returned ${retry.status}`);
        return c.json(formatZonesResponse(retry.data));
      }

      if (status !== 200) throw new Error(`Seer zones returned ${status}`);
      return c.json(formatZonesResponse(data));
    } catch (e) {
      console.log("Seer zones error:", errorMessage(e));
      return c.json({ error: "Failed to fetch Seer zones.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/devices — List all devices
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/devices`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(c.req.query("offset") || "0", 10));

      const path = `/device/v1/devices/paginate?limit=${limit}&offset=${offset}`;
      const { status, data } = await seerFetch(userConfig, "GET", path, undefined, token);

      if (status === 401) {
        _seerToken = null;
        const newToken = await getSeerToken(userConfig);
        const retry = await seerFetch(userConfig, "GET", path, undefined, newToken);
        if (retry.status !== 200) throw new Error(`Seer devices returned ${retry.status}`);
        return c.json(formatDevicesResponse(retry.data));
      }

      if (status !== 200) throw new Error(`Seer devices returned ${status}`);
      return c.json(formatDevicesResponse(data));
    } catch (e) {
      console.log("Seer devices error:", errorMessage(e));
      return c.json({ error: "Failed to fetch Seer devices.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/devices/:deviceId/data — Get device sensor data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/devices/:deviceId/data`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    const deviceId = c.req.param("deviceId");
    // Date range — defaults to last 24 hours
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const defaultTo = now.toISOString().split("T")[0];
    const from = sanitizeString(c.req.query("from") || defaultFrom, 20);
    const to = sanitizeString(c.req.query("to") || defaultTo, 20);

    try {
      const token = await getSeerToken(userConfig);

      // Try rawDataByDate first (most detailed)
      let path = `/device/v1/analytics/rawDataByDate?from=${from}&to=${to}&id=${encodeURIComponent(deviceId)}`;
      let { status, data } = await seerFetch(userConfig, "GET", path, undefined, token);

      if (status === 401) {
        _seerToken = null;
        const newToken = await getSeerToken(userConfig);
        const retry = await seerFetch(userConfig, "GET", path, undefined, newToken);
        status = retry.status;
        data = retry.data;
      }

      const rawRecords = data?.data || [];

      // Also get processedData (latest known state for all devices)
      const procPath = `/device/v1/analytics/processedData?deviceId=${encodeURIComponent(deviceId)}`;
      const proc = await seerFetch(userConfig, "GET", procPath, undefined, _seerToken?.accessToken || token);
      const processedRecords = proc.data?.data || [];

      return c.json({
        deviceId,
        from,
        to,
        rawData: Array.isArray(rawRecords) ? rawRecords : [],
        rawCount: Array.isArray(rawRecords) ? rawRecords.length : 0,
        processedData: Array.isArray(processedRecords) ? processedRecords : [],
        processedCount: Array.isArray(processedRecords) ? processedRecords.length : 0,
      });
    } catch (e) {
      console.log("Seer device data error:", errorMessage(e));
      return c.json({ error: `Failed to fetch data for device '${deviceId}'.`, detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/devices/:deviceId/history — Get time-series data
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/devices/:deviceId/history`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    const deviceId = c.req.param("deviceId");
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const defaultTo = now.toISOString().split("T")[0];
    const from = sanitizeString(c.req.query("from") || defaultFrom, 20);
    const to = sanitizeString(c.req.query("to") || defaultTo, 20);

    try {
      const token = await getSeerToken(userConfig);
      const path = `/device/v1/analytics/data-value-over-time?deviceId=${encodeURIComponent(deviceId)}&from=${from}&to=${to}`;
      const { status, data } = await seerFetch(userConfig, "GET", path, undefined, token);

      if (status === 401) {
        _seerToken = null;
        const newToken = await getSeerToken(userConfig);
        const retry = await seerFetch(userConfig, "GET", path, undefined, newToken);
        if (retry.status !== 200) throw new Error(`Seer history returned ${retry.status}`);
        return c.json({ deviceId, from, to, data: retry.data?.data || [] });
      }

      if (status !== 200) throw new Error(`Seer history returned ${status}`);
      return c.json({ deviceId, from, to, data: data?.data || [] });
    } catch (e) {
      console.log("Seer history error:", errorMessage(e));
      return c.json({ error: `Failed to fetch history for device '${deviceId}'.`, detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/alerts — Get alert summary
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/alerts`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(c.req.query("offset") || "0", 10));

      // Get both summary and paginated alerts
      const [summaryRes, alertsRes] = await Promise.all([
        seerFetch(userConfig, "GET", "/alert/v1/alerts/summary", undefined, token),
        seerFetch(userConfig, "GET", `/alert/v1/alerts/paginate?limit=${limit}&offset=${offset}`, undefined, token),
      ]);

      return c.json({
        summary: summaryRes.data?.data || {},
        alerts: alertsRes.data?.data?.items || [],
        meta: alertsRes.data?.data?.meta || { totalItems: 0 },
      });
    } catch (e) {
      console.log("Seer alerts error:", errorMessage(e));
      return c.json({ error: "Failed to fetch Seer alerts.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/tasks — Get tasks (incidents/work orders)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/tasks`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(c.req.query("offset") || "0", 10));

      const [tasksRes, summaryRes] = await Promise.all([
        seerFetch(userConfig, "GET", `/task/v1/task/paginate?limit=${limit}&offset=${offset}`, undefined, token),
        seerFetch(userConfig, "GET", "/task/v1/task/summary", undefined, token),
      ]);

      return c.json({
        tasks: tasksRes.data?.data?.items || [],
        meta: tasksRes.data?.data?.meta || { totalItems: 0 },
        summary: summaryRes.data?.data || {},
      });
    } catch (e) {
      console.log("Seer tasks error:", errorMessage(e));
      return c.json({ error: "Failed to fetch Seer tasks.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POST /seer/sync-devices — Import Seer devices into FioTec
  // Maps Seer device types to FioTec sensor categories.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.post(`${PREFIX}/seer/sync-devices`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);

      // Fetch all devices from Seer
      const { status, data } = await seerFetch(
        userConfig, "GET", "/device/v1/devices/paginate?limit=100&offset=0", undefined, token,
      );
      if (status !== 200) throw new Error(`Failed to fetch Seer devices (${status})`);

      const seerDevices = data?.data?.items || [];
      const zones = new Map<string, string>(); // zoneId → zoneName

      // Build zone lookup
      for (const dev of seerDevices) {
        if (dev.zones?.[0]) {
          zones.set(dev.zones[0].id, dev.zones[0].name);
        }
      }

      // Map Seer device types to FioTec categories
      const TYPE_MAP: Record<string, string> = {
        "IAQ": "environment",
        "IAQ_3_IN_1": "environment",
        "WATER_LEAK_DETECTOR_MINI": "water",
        "MAGNETIC_CONTACT_SWITCH": "security",
        "FLOW_DETECTOR": "water",
        "GATEWAY": "gateway",
      };

      const mapped = seerDevices.map((dev: any) => ({
        seerDeviceId: dev.id,
        name: dev.name || dev.shortName,
        type: dev.type,
        fiotecCategory: TYPE_MAP[dev.type] || "other",
        decoder: dev.decoder || null,
        zone: dev.floorName?.[0] || null,
        zoneId: dev.floor?.[0] || null,
        location: dev.extra?.location || null,
        timeout: dev.timeout,
        alertEnabled: dev.enableAlert,
        workspace: dev.workspace,
      }));

      // Store the mapping for future reference
      await cachedKvSet(uk(auth.userId, "seer_device_map"), {
        devices: mapped,
        syncedAt: new Date().toISOString(),
        totalSeer: seerDevices.length,
      });

      // Update lastSyncAt
      userConfig.lastSyncAt = new Date().toISOString();
      await cachedKvSet(uk(auth.userId, "seer_config"), userConfig);

      return c.json({
        success: true,
        seerDevicesFound: seerDevices.length,
        mapped: mapped.length,
        byCategory: mapped.reduce((acc: Record<string, number>, d: any) => {
          acc[d.fiotecCategory] = (acc[d.fiotecCategory] || 0) + 1;
          return acc;
        }, {}),
        zones: Object.fromEntries(zones),
        syncedAt: userConfig.lastSyncAt,
      });
    } catch (e) {
      console.log("Seer sync error:", errorMessage(e));
      return c.json({ error: "Failed to sync Seer devices.", detail: errorMessage(e) }, 500);
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GET /seer/webhooks — List configured webhooks
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  app.get(`${PREFIX}/seer/webhooks`, async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;

    const userConfig: SeerConfig = (await cachedKvGet(uk(auth.userId, "seer_config"))) || { ...DEFAULT_SEER_CONFIG };
    if (!userConfig.enabled) return c.json({ error: "Seer integration is not enabled." }, 400);

    try {
      const token = await getSeerToken(userConfig);
      const { status, data } = await seerFetch(userConfig, "GET", `/hook/v1/hook`, undefined, token);

      if (status !== 200) throw new Error(`Seer webhooks returned ${status}`);
      return c.json({ webhooks: data?.data || [] });
    } catch (e) {
      console.log("Seer webhooks error:", errorMessage(e));
      return c.json({ error: "Failed to fetch Seer webhooks.", detail: errorMessage(e) }, 500);
    }
  });

  console.log("[FioTec Seer] Routes registered: /seer/status, /seer/config, /seer/zones, /seer/devices, /seer/devices/:id/data, /seer/devices/:id/history, /seer/alerts, /seer/tasks, /seer/sync-devices, /seer/webhooks");
}

// ── Response Formatters ─────────────────────────────────

function formatZonesResponse(data: any): { zones: SeerZone[]; meta: any } {
  const items = data?.data?.items || [];
  const zones: SeerZone[] = items.map((z: any) => ({
    id: z.id,
    name: z.name,
    zoneType: z.zoneType,
    address: z.address || null,
    imageUrl: z.imageUrl || null,
    workspace: z.workspace,
    deviceCount: z.devices?.length || 0,
  }));
  return { zones, meta: data?.data?.meta || { totalItems: zones.length } };
}

function formatDevicesResponse(data: any): { devices: SeerDevice[]; meta: any } {
  const items = data?.data?.items || [];
  const devices: SeerDevice[] = items.map((d: any) => ({
    id: d.id,
    name: d.name,
    shortName: d.shortName,
    type: d.type,
    decoder: d.decoder || null,
    extName: d.extName || "",
    timeout: d.timeout || 0,
    enableAlert: d.enableAlert || false,
    zoneName: d.floorName?.[0] || null,
    zoneId: d.floor?.[0] || null,
    zoneType: d.zones?.[0]?.zoneType || null,
    location: d.extra?.location || null,
    workspace: d.workspace,
  }));
  return { devices, meta: data?.data?.meta || { totalItems: devices.length } };
}
