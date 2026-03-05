import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import {
  INITIAL_PROPERTIES, INITIAL_DEVICES, makeInitialGateways, makeInitialAlarms,
  DEMO_PROPERTIES, DEMO_DEVICES, makeDemoGateways, makeDemoAlarms,
  DEFAULT_SETTINGS,
} from "./seed_data.tsx";

// ── SUPABASE CLIENT (service role — NEVER expose to frontend) ──
const supabase = (() => {
  try {
    const c = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    console.log("[FioTech Routes] Supabase client created");
    return c;
  } catch (e) {
    console.log("[FioTech Routes] CRITICAL: Failed to create Supabase client:", e);
    return createClient("https://placeholder.supabase.co", "placeholder");
  }
})();

const BUCKET_NAME = "make-4916a0b9-property-images";

// ── SCHEMA CACHE WARMUP ─────────────────────────────────
let schemaCacheReady = false;

(async () => {
  try {
    const MAX = 5;
    for (let i = 0; i < MAX; i++) {
      try {
        await kv.get("__warmup__");
        schemaCacheReady = true;
        console.log(`[FioTech Routes] Schema cache warm after ${i + 1} attempt(s)`);
        supabase.auth.getUser("x").catch(() => {});
        return;
      } catch (e) {
        console.log(`Schema warmup attempt ${i + 1}/${MAX}: ${errorMessage(e)}`);
        if (i < MAX - 1) await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
      }
    }
    console.log("Schema warmup exhausted — requests will retry inline");
  } catch (e) {
    console.log("Schema warmup error:", errorMessage(e));
  }
})();

// Deferred bucket init
setTimeout(async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === BUCKET_NAME);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false, fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      });
      if (error) console.log("Bucket create error:", error.message);
      else console.log(`Bucket '${BUCKET_NAME}' created.`);
    }
  } catch (e) { console.log("Bucket check error:", errorMessage(e)); }
}, 2000);

// ── HELPERS ──────────────────────────────────────────────

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ── AUTH ─────────────────────────────────────────────────

const MASTER_EMAILS = new Set(["master@fiotech.io"]);

async function requireAuth(c: any): Promise<{ userId: string; email: string } | Response> {
  try {
    let token = c.req.header("x-user-token") || "";
    if (!token) {
      const h = (c.req.header("Authorization") || "").replace("Bearer ", "");
      if (h && h.length > 100) {
        try {
          const payload = JSON.parse(atob(h.split(".")[1]));
          if (payload.role === "authenticated" && payload.sub) token = h;
        } catch { /* ignore */ }
      }
    }
    if (!token) return c.json({ error: "Missing authentication token." }, 401);

    const MAX_AUTH = 3;
    let lastError: string | null = null;
    let transient = false;
    for (let attempt = 0; attempt < MAX_AUTH; attempt++) {
      try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user?.id) {
          lastError = error?.message || "No user ID";
          const isT = !!lastError && (
            lastError.includes("fetch") || lastError.includes("network") ||
            lastError.includes("timeout") || lastError.includes("ECONNREFUSED") ||
            lastError.includes("socket") || lastError.includes("AbortError") ||
            lastError.includes("request to") || lastError.includes("ETIMEDOUT")
          );
          if (isT && attempt < MAX_AUTH - 1) {
            transient = true;
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
            continue;
          }
          if (isT) transient = true;
          break;
        }
        return { userId: data.user.id, email: data.user.email || "" };
      } catch (innerErr) {
        lastError = errorMessage(innerErr);
        transient = true;
        if (attempt < MAX_AUTH - 1) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
      }
    }
    if (transient) {
      console.log("Auth service unavailable (503):", lastError);
      return c.json({ error: "Auth service temporarily unavailable." }, 503);
    }
    console.log("Auth failed:", lastError);
    return c.json({ error: "Unauthorized." }, 401);
  } catch (e) {
    console.log("Auth error:", errorMessage(e));
    return c.json({ error: "Authentication error." }, 503);
  }
}

async function requireAdmin(c: any): Promise<{ userId: string; email: string } | Response> {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  if (!MASTER_EMAILS.has(auth.email.toLowerCase())) {
    return c.json({ error: "Forbidden. Admin access required." }, 403);
  }
  return auth;
}

// ── INPUT VALIDATION ─────────────────────────────────────

const MAX_STRING_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, maxLength);
}

function sanitizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().slice(0, MAX_URL_LENGTH);
  if (cleaned && !cleaned.startsWith("http://") && !cleaned.startsWith("https://")) return "";
  return cleaned;
}

function sanitizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeEnum(value: unknown, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value) ? value : fallback;
}

function safeMerge(target: any, source: any, depth = 0): any {
  if (depth > 5) return target;
  if (!source || typeof source !== "object" || Array.isArray(source)) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = safeMerge(result[key] || {}, source[key], depth + 1);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── RATE LIMITER ─────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetAt) rateLimitStore.delete(key);
  }
}, 300000);

function getClientIp(c: any): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s: string) => s.trim()).filter(Boolean);
    // Use the rightmost IP — the last proxy-appended entry is the most trustworthy
    return parts[parts.length - 1] || "unknown";
  }
  return c.req.header("x-real-ip") || "unknown";
}

// ── KV CACHE ─────────────────────────────────────────────

const kvCache = new Map<string, { data: any; expiresAt: number }>();
const KV_CACHE_TTL = 3000;
const kvInflight = new Map<string, Promise<any>>();

async function kvGetWithRetry(key: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await kv.get(key);
    } catch (e) {
      console.log(`KV get '${key}' ${attempt + 1}/${retries + 1}:`, errorMessage(e));
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      else throw e;
    }
  }
}

async function kvSetWithRetry(key: string, data: any, retries = 2): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { await kv.set(key, data); return; } catch (e) {
      console.log(`KV set '${key}' ${attempt + 1}/${retries + 1}:`, errorMessage(e));
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      else throw e;
    }
  }
}

async function cachedKvGet(key: string): Promise<any> {
  const now = Date.now();
  const cached = kvCache.get(key);
  if (cached && now < cached.expiresAt) return cached.data;
  if (kvInflight.has(key)) return kvInflight.get(key)!;
  const promise = kvGetWithRetry(key)
    .then((data) => { kvCache.set(key, { data, expiresAt: Date.now() + KV_CACHE_TTL }); return data; })
    .finally(() => { kvInflight.delete(key); });
  kvInflight.set(key, promise);
  return promise;
}

function invalidateKvCache(key: string) { kvCache.delete(key); }

async function cachedKvSet(key: string, data: any): Promise<void> {
  await kvSetWithRetry(key, data);
  kvCache.set(key, { data, expiresAt: Date.now() + KV_CACHE_TTL });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of kvCache.entries()) {
    if (now > val.expiresAt) kvCache.delete(key);
  }
}, 30000);

// ── USER-SCOPED DATA ─────────────────────────────────────

function uk(userId: string, collection: string): string {
  return `${collection}_${userId}`;
}

const accountTypeCache = new Map<string, string>();

async function getAccountType(userId: string): Promise<string> {
  if (accountTypeCache.has(userId)) return accountTypeCache.get(userId)!;
  try {
    const type = await kvGetWithRetry(`account_type_${userId}`);
    const result = type || "standard";
    accountTypeCache.set(userId, result);
    return result;
  } catch (e) {
    console.log("getAccountType failed:", errorMessage(e));
    accountTypeCache.set(userId, "standard");
    return "standard";
  }
}

function getCollectionDefaults(accountType: string, collection: string): any[] {
  if (accountType === "demo") {
    switch (collection) {
      case "properties": return JSON.parse(JSON.stringify(DEMO_PROPERTIES));
      case "devices": return JSON.parse(JSON.stringify(DEMO_DEVICES));
      case "gateways": return makeDemoGateways();
      case "alarms": return makeDemoAlarms();
      default: return [];
    }
  }
  if (accountType === "testing") return [];
  switch (collection) {
    case "properties": return JSON.parse(JSON.stringify(INITIAL_PROPERTIES));
    case "devices": return JSON.parse(JSON.stringify(INITIAL_DEVICES));
    case "gateways": return makeInitialGateways();
    case "alarms": return makeInitialAlarms();
    default: return [];
  }
}

async function getUserCollection(userId: string, collection: string): Promise<any[]> {
  const key = uk(userId, collection);
  try {
    const data = await cachedKvGet(key);
    if (data && Array.isArray(data)) return data;
  } catch (e) {
    console.log(`getUserCollection(${collection}): KV read failed:`, errorMessage(e));
  }
  const accountType = await getAccountType(userId);
  const defaults = getCollectionDefaults(accountType, collection);
  try { await cachedKvSet(key, defaults); } catch (e) {
    console.log(`getUserCollection(${collection}): KV seed failed:`, errorMessage(e));
    kvCache.set(key, { data: defaults, expiresAt: Date.now() + KV_CACHE_TTL * 5 });
  }
  return defaults;
}

async function getUserSettings(userId: string): Promise<any> {
  const key = uk(userId, "settings");
  try {
    const data = await cachedKvGet(key);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch (e) {
    console.log("getUserSettings: KV read failed:", errorMessage(e));
  }
  const accountType = await getAccountType(userId);
  let defaults;
  if (accountType === "demo") {
    defaults = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, name: "Demo User", email: "demo@fiotech.io", role: "Viewer" } };
  } else if (accountType === "testing") {
    defaults = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, name: "Test Engineer", email: "testing@fiotech.io", role: "Engineer" } };
  } else {
    defaults = { ...DEFAULT_SETTINGS };
  }
  try { await cachedKvSet(key, defaults); } catch (e) {
    console.log("getUserSettings: KV seed failed:", errorMessage(e));
  }
  return defaults;
}

async function autoGenerateAlarm(userId: string, device: any, newStatus: string) {
  try {
    const key = uk(userId, "alarms");
    let alarms = await kvGetWithRetry(key);
    if (!alarms || !Array.isArray(alarms)) alarms = [];
    if (alarms.length >= 1000) {
      const resolved = alarms.filter((a: any) => a.status === "resolved");
      if (resolved.length > 0) alarms = alarms.filter((a: any) => a.status !== "resolved").concat(resolved.slice(Math.max(0, resolved.length - 900)));
    }
    const alarmType = newStatus === "offline" ? "Device Offline" : "Device Warning";
    const severity = newStatus === "offline" ? "high" : "medium";
    const description = `${sanitizeString(device.name)} (${sanitizeString(device.type)}) ${newStatus === "offline" ? "has gone offline" : "is reporting warning status"} in ${sanitizeString(device.location)}.`;
    alarms.unshift({ id: `A${Date.now()}`, type: alarmType, location: sanitizeString(device.location), property: sanitizeString(device.building), severity, time: new Date().toISOString(), status: "pending", description });
    await kvSetWithRetry(key, alarms);
    invalidateKvCache(key);
  } catch (e) { console.log("Auto alarm error:", errorMessage(e)); }
}

async function updatePropertySensorCounts(userId: string, buildingName: string) {
  try {
    if (!buildingName || buildingName === "Unassigned") return;
    const [properties, devices] = await Promise.all([kvGetWithRetry(uk(userId, "properties")), kvGetWithRetry(uk(userId, "devices"))]);
    if (!Array.isArray(properties) || !Array.isArray(devices)) return;
    const idx = properties.findIndex((p: any) => p.name === buildingName);
    if (idx === -1) return;
    const assigned = devices.filter((d: any) => d.building === buildingName);
    const online = assigned.filter((d: any) => d.status === "online").length;
    properties[idx] = { ...properties[idx], waterSensors: `${online}/${assigned.length}` };
    await kvSetWithRetry(uk(userId, "properties"), properties);
    invalidateKvCache(uk(userId, "properties"));
  } catch (e) { console.log("Sensor count update error:", errorMessage(e)); }
}

// ── GATEWAY STATUS ───────────────────────────────────────

const GW_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const GW_WARNING_THRESHOLD_MS = 15 * 60 * 1000;

const GW_OPTIONAL_FIELDS: ReadonlyArray<readonly [string, number]> = [
  ["imei", 20], ["apn", 100], ["simIccid", 25], ["ssid", 100],
  ["devEui", 24], ["panId", 10], ["channel", 5], ["frequencyBand", 20],
  ["bleAddress", 17], ["serialNumber", 30],
];

function deriveGatewayStatus(gw: any): any {
  if (!gw.lastSeen) return { ...gw, status: "offline", signal: 0 };
  const ageMs = Date.now() - new Date(gw.lastSeen).getTime();
  let status: string;
  let signal = gw.signal ?? 0;
  if (ageMs <= GW_ONLINE_THRESHOLD_MS) {
    status = "online";
    if (signal <= 0) signal = 75;
  } else if (ageMs <= GW_WARNING_THRESHOLD_MS) {
    status = "warning";
    const degradeFactor = 1 - ((ageMs - GW_ONLINE_THRESHOLD_MS) / (GW_WARNING_THRESHOLD_MS - GW_ONLINE_THRESHOLD_MS));
    signal = Math.max(10, Math.round(signal * degradeFactor));
  } else {
    status = "offline";
    signal = 0;
  }
  return { ...gw, status, signal };
}

function simulateDemoHeartbeats(gateways: any[]): any[] {
  const now = Date.now();
  return gateways.map((gw) => {
    if (gw.id === "GW008") return { ...gw, lastSeen: new Date(now - 2 * 3600000).toISOString(), signal: 0 };
    if (gw.id === "GW006") {
      const warningAge = 6 * 60 * 1000 + Math.random() * 8 * 60 * 1000;
      return { ...gw, lastSeen: new Date(now - warningAge).toISOString(), signal: Math.round(45 + Math.random() * 20) };
    }
    const jitterMs = Math.floor(Math.random() * 120000);
    return { ...gw, lastSeen: new Date(now - jitterMs).toISOString() };
  });
}

async function getGatewaysWithLiveStatus(userId: string): Promise<any[]> {
  const gateways = await getUserCollection(userId, "gateways");
  const accountType = await getAccountType(userId);
  let processed: any[];
  if (accountType === "demo") {
    processed = simulateDemoHeartbeats(gateways);
    const key = uk(userId, "gateways");
    cachedKvSet(key, processed).catch((e: unknown) => {
      console.log("Non-fatal: demo heartbeats persist failed:", errorMessage(e));
    });
  } else {
    processed = gateways;
  }
  return processed.map(deriveGatewayStatus);
}

function deriveDeviceStatuses(devices: any[], gatewayStatuses: Map<string, string>): any[] {
  return devices.map((d: any) => {
    if (!d.gateway || d.gateway === "Unassigned") return d;
    const gwStatus = gatewayStatuses.get(d.gateway);
    if (gwStatus === "offline") return { ...d, status: "offline", lastUpdate: "Gateway offline" };
    if (gwStatus === "warning" && d.status === "online") return { ...d, status: "warning", lastUpdate: "Gateway unstable" };
    return d;
  });
}

async function getEnrichedDevicesAndGateways(userId: string) {
  const [rawDevices, gateways] = await Promise.all([
    getUserCollection(userId, "devices"),
    getGatewaysWithLiveStatus(userId),
  ]);
  const gwStatusMap = new Map<string, string>();
  gateways.forEach((gw: any) => gwStatusMap.set(gw.id, gw.status));
  return { devices: deriveDeviceStatuses(rawDevices, gwStatusMap), gateways, gwStatusMap };
}

function countStatuses(devices: any[]) {
  return {
    total: devices.length,
    online: devices.filter((d: any) => d.status === "online").length,
    offline: devices.filter((d: any) => d.status === "offline").length,
    warning: devices.filter((d: any) => d.status === "warning").length,
  };
}

// ── TELEMETRY HELPERS ────────────────────────────────────

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash |= 0; }
  const timeBucket = Math.floor(Date.now() / 300000);
  hash = ((hash << 5) - hash) + timeBucket; hash |= 0;
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

function buildRealTelemetry(sensorData: any[], properties: any[], devices: any[]): any {
  const now = new Date();
  const latestByDevice = new Map<string, any>();
  for (const entry of sensorData) {
    if (!entry.devEUI || entry.devEUI.startsWith("TEST")) continue;
    if (entry.eventType === "join" || entry.eventType === "ack") continue;
    if (!latestByDevice.has(entry.devEUI)) latestByDevice.set(entry.devEUI, entry);
  }
  const airQuality: any[] = [];
  const waterZones: any[] = [];
  const bmsItems: any[] = [];
  const devicePropertyMap = new Map<string, string>();
  for (const d of devices) {
    if (d.building && d.building !== "Unassigned") devicePropertyMap.set((d.name || "").toLowerCase(), d.building);
  }
  const findVal = (decoded: any, allKeys: string[], patterns: string[]): number | null => {
    for (const k of allKeys) {
      const kl = k.toLowerCase();
      for (const p of patterns) {
        if (kl === p || kl.includes(p)) { const v = decoded[k]; return typeof v === "number" ? v : null; }
      }
    }
    return null;
  };
  for (const [devEUI, entry] of latestByDevice) {
    const decoded = entry.decodedData;
    if (!decoded || typeof decoded !== "object") continue;
    const keys = Object.keys(decoded);
    const lowerKeys = keys.map((k) => k.toLowerCase());
    const sensorName = entry.deviceName || devEUI;
    const matchedProperty = devicePropertyMap.get(sensorName.toLowerCase()) || entry.applicationName || "LoRaWAN Sensor";

    const hasAirFields = lowerKeys.some((k: string) =>
      k.includes("temperature") || k.includes("temp") || k.includes("humidity") || k.includes("humid") ||
      k.includes("co2") || k.includes("pm2") || k.includes("pm25") || k.includes("pm10") ||
      k.includes("tvoc") || k.includes("voc") || k.includes("hcho") || k.includes("light")
    );
    if (hasAirFields) {
      const temp = findVal(decoded, keys, ["temperature", "temp"]);
      const humidity = findVal(decoded, keys, ["humidity", "humid"]);
      const co2 = findVal(decoded, keys, ["co2"]);
      const pm25 = findVal(decoded, keys, ["pm2_5", "pm25"]);
      const voc = findVal(decoded, keys, ["tvoc", "voc"]);
      let aqi: number | null = null;
      if (pm25 !== null) aqi = Math.min(500, Math.round(pm25 <= 12 ? pm25 * (50 / 12) : 50 + (pm25 - 12) * 2));
      else if (co2 !== null) aqi = Math.min(200, Math.round(Math.max(0, (co2 - 400) / 8)));
      let trend: string | null = null;
      const olderEntries = sensorData.filter((e: any) => e.devEUI === devEUI && e.id !== entry.id && e.decodedData);
      if (olderEntries.length > 0 && aqi !== null) {
        const older = olderEntries[0].decodedData;
        const olderPm = older?.pm2_5 ?? older?.pm25 ?? null;
        const olderCo2 = older?.co2 ?? null;
        const compareVal = olderPm !== null ? olderPm : olderCo2;
        const currentVal = pm25 !== null ? pm25 : co2;
        if (compareVal !== null && currentVal !== null) {
          const delta = currentVal - compareVal;
          trend = delta > 2 ? "up" : delta < -2 ? "down" : "stable";
        }
      }
      airQuality.push({
        propertyId: devEUI, propertyName: `${sensorName} — ${matchedProperty}`,
        aqi, co2, pm25, voc, temperature: temp, humidity, trend, sensorCount: 1, sensorsOnline: 1,
      });
    }

    const hasWaterFields = lowerKeys.some((k: string) => k.includes("leak") || k.includes("water") || k.includes("moisture") || k.includes("flood"));
    if (hasWaterFields) {
      const leakVal = findVal(decoded, keys, ["water_leak", "leak_status", "leak", "flood"]) ?? 0;
      const pressure = findVal(decoded, keys, ["pressure", "water_pressure"]);
      const flow = findVal(decoded, keys, ["flow", "water_flow"]);
      const isLeaking = leakVal > 0;
      waterZones.push({ id: devEUI, zone: `${sensorName} — ${matchedProperty}`, pressure: pressure ?? (isLeaking ? 15 : 55), flow: flow ?? 0, status: isLeaking ? "warning" : "normal", leakDetected: isLeaking });
    }

    const hasBmsFields = lowerKeys.some((k: string) => k.includes("power") || k.includes("energy") || k.includes("voltage") || k.includes("current") || k.includes("watt") || k.includes("kwh"));
    if (hasBmsFields) {
      const findStrVal = (patterns: string[], unit: string): string => {
        for (const k of keys) { const kl = k.toLowerCase(); for (const p of patterns) { if (kl === p || kl.includes(p)) { const v = decoded[k]; if (typeof v === "number") return `${v} ${unit}`; } } }
        return "\u2014";
      };
      const consumption = findStrVal(["power", "watt"], "W");
      const load = findStrVal(["energy", "kwh"], "kWh");
      const voltage = findStrVal(["voltage"], "V");
      bmsItems.push({ id: `BMS-${devEUI}`, system: `${sensorName} — ${matchedProperty}`, consumption: consumption !== "\u2014" ? consumption : load, load: voltage, status: "active" });
    }
  }
  return { airQuality, waterZones, bmsItems, generatedAt: now.toISOString(), source: "live" };
}

function generateWebhookToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "whk_";
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// ══════════════════════════════════════════════════════════
// REGISTER ROUTES — called by index.tsx after Deno.serve()
// ══════════════════════════════════════════════════════════

export function registerRoutes(app: any) {
  const MAX_BODY_SIZE = 1 * 1024 * 1024;

  // Rate limiting middleware
  app.use("/make-server-4916a0b9/*", async (c: any, next: any) => {
    if (c.req.method === "OPTIONS") return next();
    const ip = getClientIp(c);
    if (!rateLimit(ip + ":global", 120, 60000)) return c.json({ error: "Too many requests." }, 429);
    if (["POST", "PUT", "DELETE"].includes(c.req.method)) {
      if (!rateLimit(ip + ":write", 30, 60000)) return c.json({ error: "Too many write requests." }, 429);
    }
    return next();
  });

  // Body size guard
  app.use("/make-server-4916a0b9/*", async (c: any, next: any) => {
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      const cl = c.req.header("content-length");
      if (cl && parseInt(cl) > MAX_BODY_SIZE) return c.json({ error: "Payload too large." }, 413);
    }
    return next();
  });

  // ─── QUICK LOGIN (server-side only — no passwords in frontend) ─────

  const QUICK_LOGIN_ACCOUNTS: Record<string, { email: string; name: string; accountType: string }> = {
    testing: { email: "testing@fiotech.io", name: "Test Engineer", accountType: "testing" },
  };

  app.post("/make-server-4916a0b9/quick-login", async (c: any) => {
    const ip = getClientIp(c);
    if (!rateLimit(ip, 5, 15 * 60 * 1000)) return c.json({ error: "Too many quick-login attempts." }, 429);
    try {
      const body = await c.req.json();
      const type = sanitizeString(body.type, 20);
      const account = QUICK_LOGIN_ACCOUNTS[type];
      if (!account) return c.json({ error: "Invalid account type." }, 400);

      // Ensure user exists (ignore "already registered" error)
      await supabase.auth.admin.createUser({
        email: account.email,
        password: crypto.randomUUID(), // random password — login via OTP only
        user_metadata: { name: account.name, accountType: account.accountType },
        email_confirm: true,
      }).catch(() => {});

      // Generate a magic-link OTP (no email sent, server-side only)
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: account.email,
      });
      if (linkError) {
        console.log("Quick-login generateLink error:", linkError.message);
        return c.json({ error: "Quick login unavailable." }, 500);
      }

      return c.json({ email: account.email, otp: linkData.properties.email_otp });
    } catch (e) {
      console.log("Quick-login error:", errorMessage(e));
      return c.json({ error: "Quick login error." }, 500);
    }
  });

  // ─── SIGNUP ──────────────────────────────────────────────

  app.post("/make-server-4916a0b9/signup", async (c: any) => {
    const ip = getClientIp(c);
    if (!rateLimit(ip, 10, 15 * 60 * 1000)) return c.json({ error: "Too many signup attempts." }, 429);
    try {
      const body = await c.req.json();
      const email = sanitizeString(body.email, 254);
      const password = typeof body.password === "string" ? body.password : "";
      const name = sanitizeString(body.name, 100);
      const accountType = sanitizeEnum(body.accountType, ["demo", "testing", "standard"], "standard");
      if (!email || !password) return c.json({ error: "Email and password are required." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "Invalid email." }, 400);
      if (password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
      if (password.length > 128) return c.json({ error: "Password too long." }, 400);
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, user_metadata: { name: name || email.split("@")[0], accountType }, email_confirm: true,
      });
      if (error) {
        if (error.message?.includes("already been registered")) return c.json({ success: true, userId: "existing", accountType });
        console.log("Signup error:", error.message);
        return c.json({ error: "Signup failed." }, 400);
      }
      const userId = data.user.id;
      await kvSetWithRetry(`account_type_${userId}`, accountType);
      accountTypeCache.set(userId, accountType);
      const profileDefaults = accountType === "demo"
        ? { name: name || "Demo User", email, role: "Viewer", company: "FioTech Solutions", phone: "" }
        : accountType === "testing"
        ? { name: name || "Test Engineer", email, role: "Engineer", company: "FioTech Solutions", phone: "" }
        : { name: name || email.split("@")[0], email, role: "Admin", company: "FioTech Solutions", phone: "" };
      await kvSetWithRetry(uk(userId, "settings"), { ...DEFAULT_SETTINGS, profile: profileDefaults });
      const defaults = (col: string) => getCollectionDefaults(accountType, col);
      await Promise.all([
        kvSetWithRetry(uk(userId, "properties"), defaults("properties")),
        kvSetWithRetry(uk(userId, "devices"), defaults("devices")),
        kvSetWithRetry(uk(userId, "gateways"), defaults("gateways")),
        kvSetWithRetry(uk(userId, "alarms"), defaults("alarms")),
      ]);
      return c.json({ success: true, userId, accountType });
    } catch (e) {
      console.log("Signup error:", errorMessage(e));
      return c.json({ error: "Signup error." }, 500);
    }
  });

  // ─── ACCOUNT TYPE ────────────────────────────────────────

  app.get("/make-server-4916a0b9/account-type", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const type = await getAccountType(auth.userId);
    return c.json({ accountType: type });
  });

  // ─── PROPERTIES ──────────────────────────────────────────

  app.get("/make-server-4916a0b9/properties", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const [properties, { devices }] = await Promise.all([
        getUserCollection(userId, "properties"),
        getEnrichedDevicesAndGateways(userId),
      ]);
      const enriched = properties.map((p: any) => {
        const assigned = devices.filter((d: any) => d.building === p.name);
        const s = countStatuses(assigned);
        return { ...p, waterSensors: `${s.online}/${s.total}`, deviceCount: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning };
      });
      return c.json(enriched);
    } catch (e) {
      console.log("Error fetching properties:", errorMessage(e));
      console.log("Properties fetch error:", errorMessage(e));
      return c.json({ error: "Failed to fetch properties." }, 500);
    }
  });

  app.get("/make-server-4916a0b9/properties/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const [properties, { devices }] = await Promise.all([
        getUserCollection(userId, "properties"),
        getEnrichedDevicesAndGateways(userId),
      ]);
      const property = properties.find((p: any) => p.id === id);
      if (!property) return c.json({ error: "Property not found." }, 404);
      const assigned = devices.filter((d: any) => d.building === property.name);
      const s = countStatuses(assigned);
      return c.json({ ...property, devices: assigned, deviceCount: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning });
    } catch (e) {
      console.log("Error fetching property:", errorMessage(e));
      return c.json({ error: "Failed to fetch property." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/properties", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const name = sanitizeString(body.name, 200);
      const location = sanitizeString(body.location, 200);
      const type = sanitizeEnum(body.type, ["Commercial", "Residential", "Industrial", "Mixed"], "Commercial");
      if (!name) return c.json({ error: "Property name is required." }, 400);
      if (!location) return c.json({ error: "Property location is required." }, 400);
      const key = uk(userId, "properties");
      const properties = await getUserCollection(userId, "properties");
      if (properties.length >= 100) return c.json({ error: "Maximum property limit (100) reached." }, 400);
      const newProperty = {
        id: `B${Date.now()}`, name, location, type, waterSensors: "0/0", status: "Normal",
        image: sanitizeUrl(body.image) || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400",
      };
      properties.push(newProperty);
      await cachedKvSet(key, properties);
      return c.json(newProperty);
    } catch (e) {
      console.log("Error adding property:", errorMessage(e));
      return c.json({ error: "Failed to add property." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/properties/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const body = await c.req.json();
      const key = uk(userId, "properties");
      const properties = await getUserCollection(userId, "properties");
      const index = properties.findIndex((p: any) => p.id === id);
      if (index === -1) return c.json({ error: "Property not found." }, 404);
      const updates: any = {};
      if (body.name !== undefined) updates.name = sanitizeString(body.name, 200);
      if (body.location !== undefined) updates.location = sanitizeString(body.location, 200);
      if (body.type !== undefined) updates.type = sanitizeEnum(body.type, ["Commercial", "Residential", "Industrial", "Mixed"], properties[index].type);
      if (body.image !== undefined) updates.image = sanitizeUrl(body.image) || properties[index].image;
      if (body.status !== undefined) updates.status = sanitizeEnum(body.status, ["Normal", "Warning", "Critical"], properties[index].status);
      properties[index] = { ...properties[index], ...updates, id };
      await cachedKvSet(key, properties);
      return c.json(properties[index]);
    } catch (e) {
      console.log("Error updating property:", errorMessage(e));
      return c.json({ error: "Failed to update property." }, 500);
    }
  });

  app.delete("/make-server-4916a0b9/properties/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const key = uk(userId, "properties");
      const properties = await getUserCollection(userId, "properties");
      const filtered = properties.filter((p: any) => p.id !== id);
      if (filtered.length === properties.length) return c.json({ error: "Property not found." }, 404);
      await cachedKvSet(key, filtered);
      return c.json({ success: true, message: "Property deleted." });
    } catch (e) {
      console.log("Error deleting property:", errorMessage(e));
      return c.json({ error: "Failed to delete property." }, 500);
    }
  });

  // ─── DEVICES ─────────────────────────────────────────────

  app.get("/make-server-4916a0b9/devices", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const { devices } = await getEnrichedDevicesAndGateways(auth.userId);
      return c.json(devices);
    } catch (e) {
      console.log("Error fetching devices:", errorMessage(e));
      return c.json({ error: "Failed to fetch devices." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/devices", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const name = sanitizeString(body.name, 200);
      const type = sanitizeString(body.type, 50);
      if (!name || !type) return c.json({ error: "Device name and type are required." }, 400);
      const key = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      if (devices.length >= 500) return c.json({ error: "Maximum device limit (500) reached." }, 400);
      const newDevice = {
        id: `D${Date.now()}`, name, type,
        building: sanitizeString(body.building, 200) || "Unassigned",
        location: sanitizeString(body.location, 200) || "Not specified",
        lastUpdate: "Just now", battery: sanitizeNumber(body.battery, 0, 100, 100),
        status: sanitizeEnum(body.status, ["online", "offline", "warning"], "online"),
        gateway: sanitizeString(body.gateway, 50) || "Unassigned",
      };
      devices.push(newDevice);
      await cachedKvSet(key, devices);
      if (newDevice.building !== "Unassigned") await updatePropertySensorCounts(userId, newDevice.building);
      return c.json(newDevice);
    } catch (e) {
      console.log("Error adding device:", errorMessage(e));
      return c.json({ error: "Failed to add device." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/devices/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const body = await c.req.json();
      const key = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      const index = devices.findIndex((d: any) => d.id === id);
      if (index === -1) return c.json({ error: "Device not found." }, 404);
      const old = devices[index];
      const updates: any = { lastUpdate: "Just now" };
      if (body.name !== undefined) updates.name = sanitizeString(body.name, 200);
      if (body.type !== undefined) updates.type = sanitizeString(body.type, 50);
      if (body.building !== undefined) updates.building = sanitizeString(body.building, 200);
      if (body.location !== undefined) updates.location = sanitizeString(body.location, 200);
      if (body.battery !== undefined) updates.battery = sanitizeNumber(body.battery, 0, 100, old.battery);
      if (body.status !== undefined) updates.status = sanitizeEnum(body.status, ["online", "offline", "warning"], old.status);
      if (body.gateway !== undefined) updates.gateway = sanitizeString(body.gateway, 50);
      devices[index] = { ...old, ...updates, id };
      await cachedKvSet(key, devices);
      if (updates.status && updates.status !== old.status && (updates.status === "offline" || updates.status === "warning")) {
        autoGenerateAlarm(userId, devices[index], updates.status).catch(() => {});
      }
      if (old.building !== updates.building && updates.building) {
        await updatePropertySensorCounts(userId, old.building);
        await updatePropertySensorCounts(userId, updates.building);
      }
      return c.json(devices[index]);
    } catch (e) {
      console.log("Error updating device:", errorMessage(e));
      return c.json({ error: "Failed to update device." }, 500);
    }
  });

  app.delete("/make-server-4916a0b9/devices/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const key = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      const device = devices.find((d: any) => d.id === id);
      if (!device) return c.json({ error: "Device not found." }, 404);
      const filtered = devices.filter((d: any) => d.id !== id);
      await cachedKvSet(key, filtered);
      if (device.building && device.building !== "Unassigned") await updatePropertySensorCounts(userId, device.building);
      return c.json({ success: true, message: "Device deleted." });
    } catch (e) {
      console.log("Error deleting device:", errorMessage(e));
      return c.json({ error: "Failed to delete device." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/devices/:id/assign", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const { building } = await c.req.json();
      const sanitizedBuilding = sanitizeString(building, 200);
      const key = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      const index = devices.findIndex((d: any) => d.id === id);
      if (index === -1) return c.json({ error: "Device not found." }, 404);
      const oldBuilding = devices[index].building;
      devices[index] = { ...devices[index], building: sanitizedBuilding };
      await cachedKvSet(key, devices);
      if (oldBuilding !== sanitizedBuilding) {
        await updatePropertySensorCounts(userId, oldBuilding);
        await updatePropertySensorCounts(userId, sanitizedBuilding);
      }
      return c.json(devices[index]);
    } catch (e) {
      console.log("Error assigning device:", errorMessage(e));
      return c.json({ error: "Failed to assign device." }, 500);
    }
  });

  // ─── SETTINGS ────────────────────────────────────────────

  app.get("/make-server-4916a0b9/settings", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const settings = await getUserSettings(auth.userId);
      return c.json(settings);
    } catch (e) {
      console.log("Error fetching settings:", errorMessage(e));
      console.log("Settings fetch error:", errorMessage(e));
      return c.json({ error: "Failed to fetch settings." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/settings", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const current = await getUserSettings(userId);
      const updated = safeMerge(current, body);
      const key = uk(userId, "settings");
      await kvSetWithRetry(key, updated);
      invalidateKvCache(key);
      return c.json(updated);
    } catch (e) {
      console.log("Error updating settings:", errorMessage(e));
      return c.json({ error: "Failed to update settings." }, 500);
    }
  });

  // ─── UPLOAD ────────────────────────────────────────────

  app.post("/make-server-4916a0b9/upload", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) return c.json({ error: "No file provided." }, 400);
      const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) return c.json({ error: `Invalid file type '${file.type}'.` }, 400);
      if (file.size > 10 * 1024 * 1024) return c.json({ error: "File exceeds 10MB." }, 400);
      const extMap: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
      const fileName = `property-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extMap[file.type] || "jpg"}`;
      const arrayBuffer = await file.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(fileName, arrayBuffer, { contentType: file.type, upsert: false });
      if (uploadError) { console.log("Upload error:", uploadError.message); return c.json({ error: "Upload failed." }, 500); }
      const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(fileName, 365 * 24 * 3600);
      if (signedError) { console.log("Signed URL error:", signedError.message); return c.json({ error: "Failed to create URL." }, 500); }
      return c.json({ url: signedData.signedUrl, path: uploadData.path, fileName });
    } catch (e) {
      console.log("Upload error:", errorMessage(e));
      return c.json({ error: "Upload failed." }, 500);
    }
  });

  // ─── DATA MANAGEMENT ───────────────────────────────────

  app.post("/make-server-4916a0b9/reset-data", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const accountType = await getAccountType(userId);
      const defaults = (col: string) => getCollectionDefaults(accountType, col);
      await Promise.all([
        cachedKvSet(uk(userId, "properties"), defaults("properties")),
        cachedKvSet(uk(userId, "devices"), defaults("devices")),
        cachedKvSet(uk(userId, "gateways"), defaults("gateways")),
        cachedKvSet(uk(userId, "alarms"), defaults("alarms")),
      ]);
      const profileDefaults = accountType === "demo"
        ? { ...DEFAULT_SETTINGS.profile, name: "Demo User", email: "demo@fiotech.io", role: "Viewer" }
        : accountType === "testing"
        ? { ...DEFAULT_SETTINGS.profile, name: "Test Engineer", email: "testing@fiotech.io", role: "Engineer" }
        : { ...DEFAULT_SETTINGS.profile };
      await kvSetWithRetry(uk(userId, "settings"), { ...DEFAULT_SETTINGS, profile: profileDefaults });
      invalidateKvCache(uk(userId, "settings"));
      invalidateKvCache(uk(userId, "widget_layout"));
      return c.json({ success: true, message: "All data reset to defaults." });
    } catch (e) {
      console.log("Error resetting data:", errorMessage(e));
      return c.json({ error: "Failed to reset data." }, 500);
    }
  });

  app.get("/make-server-4916a0b9/export", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const [properties, devices, settings, alarms, gateways] = await Promise.all([
        getUserCollection(userId, "properties"),
        getUserCollection(userId, "devices"),
        getUserSettings(userId),
        getUserCollection(userId, "alarms"),
        getUserCollection(userId, "gateways"),
      ]);
      return c.json({ exportedAt: new Date().toISOString(), properties, devices, settings, alarms, gateways });
    } catch (e) {
      console.log("Error exporting:", errorMessage(e));
      return c.json({ error: "Failed to export." }, 500);
    }
  });

  // ─── ALARMS ────────────────────────────────────────────

  app.get("/make-server-4916a0b9/alarms", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const alarms = await getUserCollection(auth.userId, "alarms");
      return c.json(alarms);
    } catch (e) {
      console.log("Error fetching alarms:", errorMessage(e));
      console.log("Alarms fetch error:", errorMessage(e));
      return c.json({ error: "Failed to fetch alarms." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/alarms/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const body = await c.req.json();
      const key = uk(userId, "alarms");
      const alarms = await getUserCollection(userId, "alarms");
      const index = alarms.findIndex((a: any) => a.id === id);
      if (index === -1) return c.json({ error: "Alarm not found." }, 404);
      const updates: any = {};
      if (body.status !== undefined) updates.status = sanitizeEnum(body.status, ["pending", "resolved", "dismissed"], alarms[index].status);
      if (body.description !== undefined) updates.description = sanitizeString(body.description);
      alarms[index] = { ...alarms[index], ...updates, id };
      await cachedKvSet(key, alarms);
      return c.json(alarms[index]);
    } catch (e) {
      console.log("Error updating alarm:", errorMessage(e));
      return c.json({ error: "Failed to update alarm." }, 500);
    }
  });

  app.delete("/make-server-4916a0b9/alarms/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const key = uk(userId, "alarms");
      const alarms = await getUserCollection(userId, "alarms");
      const filtered = alarms.filter((a: any) => a.id !== id);
      if (filtered.length === alarms.length) return c.json({ error: "Alarm not found." }, 404);
      await cachedKvSet(key, filtered);
      return c.json({ success: true });
    } catch (e) {
      console.log("Error deleting alarm:", errorMessage(e));
      return c.json({ error: "Failed to delete alarm." }, 500);
    }
  });

  // ─── STATS ─────────────────────────────────────────────

  app.get("/make-server-4916a0b9/stats", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const [properties, alarms, { devices }] = await Promise.all([
        getUserCollection(userId, "properties"),
        getUserCollection(userId, "alarms"),
        getEnrichedDevicesAndGateways(userId),
      ]);
      const ds = countStatuses(devices);
      const onlinePercent = ds.total > 0 ? Math.round((ds.online / ds.total) * 100) : 0;
      const pending = alarms.filter((a: any) => a.status === "pending");
      const waterLeaks = pending.filter((a: any) => a.type?.includes("Water") || a.type?.includes("Leak")).length;
      const leakDevices = devices.filter((d: any) => d.type === "Leakage");
      const leakWarnings = leakDevices.filter((d: any) => d.status === "warning" || d.status === "offline").length;
      return c.json({
        properties: { total: properties.length, images: properties.slice(0, 4).map((p: any) => p.image) },
        devices: { ...ds, onlinePercent },
        alarms: { totalPending: pending.length, highSeverity: pending.filter((a: any) => a.severity === "high").length, waterLeaks, systemWarnings: pending.length - waterLeaks },
        water: { status: leakWarnings > 0 ? "Warning" : "Safe", leakWarnings },
      });
    } catch (e) {
      console.log("Error computing stats:", errorMessage(e));
      console.log("Stats compute error:", errorMessage(e));
      return c.json({ error: "Failed to compute stats." }, 500);
    }
  });

  // ─── WIDGET LAYOUT ─────────────────────────────────────

  app.get("/make-server-4916a0b9/widget-layout", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const defaultLayout = { order: ["environmental", "water", "bms", "alerts", "health"], active: ["environmental", "alerts", "health"] };
    try {
      const key = uk(auth.userId, "widget_layout");
      const layout = await cachedKvGet(key);
      if (!layout) return c.json(defaultLayout);
      return c.json(layout);
    } catch (e) {
      console.log("Error fetching widget layout:", errorMessage(e));
      return c.json(defaultLayout);
    }
  });

  app.put("/make-server-4916a0b9/widget-layout", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const body = await c.req.json();
      if (!body.order || !Array.isArray(body.order) || !body.active || !Array.isArray(body.active)) return c.json({ error: "Invalid layout." }, 400);
      if (body.order.length > 20 || body.active.length > 20) return c.json({ error: "Layout too large." }, 400);
      const sanitized = {
        order: body.order.map((s: any) => sanitizeString(s, 50)).filter(Boolean),
        active: body.active.map((s: any) => sanitizeString(s, 50)).filter(Boolean),
      };
      const key = uk(auth.userId, "widget_layout");
      await cachedKvSet(key, sanitized);
      return c.json(sanitized);
    } catch (e) {
      console.log("Error saving widget layout:", errorMessage(e));
      return c.json({ error: "Failed to save widget layout." }, 500);
    }
  });

  // ─── NOTIFICATIONS ─────────────────────────────────────

  app.get("/make-server-4916a0b9/notifications", async (c: any) => {
    try {
      const auth = await requireAuth(c);
      if (auth instanceof Response) return auth;
      let alarms: any[] = [];
      try {
        alarms = await getUserCollection(auth.userId, "alarms");
      } catch (kvErr) {
        console.log("Notifications: alarm fetch failed:", errorMessage(kvErr));
        return c.json({ notifications: [], unreadCount: 0 });
      }
      const pending = alarms
        .filter((a: any) => a.status === "pending")
        .sort((a: any, b: any) => {
          const ta = new Date(b.time).getTime();
          const tb = new Date(a.time).getTime();
          if (isNaN(ta)) return 1;
          if (isNaN(tb)) return -1;
          return ta - tb;
        })
        .slice(0, 20)
        .map((a: any) => ({ id: a.id, type: a.type, property: a.property, location: a.location, severity: a.severity, time: a.time, description: a.description, read: false }));
      return c.json({ notifications: pending, unreadCount: pending.length });
    } catch (e) {
      console.log("Notifications error:", errorMessage(e));
      return c.json({ notifications: [], unreadCount: 0 });
    }
  });

  // ─── TELEMETRY ─────────────────────────────────────────

  app.get("/make-server-4916a0b9/telemetry", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const accountType = await getAccountType(userId);
      const [properties, devices] = await Promise.all([
        getUserCollection(userId, "properties"),
        getUserCollection(userId, "devices"),
      ]);

      if (accountType !== "demo") {
        let sensorData: any[] = [];
        try {
          const raw = await cachedKvGet(`sensor_data_${userId}`);
          if (Array.isArray(raw)) sensorData = raw;
        } catch (e) {
          console.log("telemetry: sensor data read failed:", errorMessage(e));
        }
        if (sensorData.length > 0) return c.json(buildRealTelemetry(sensorData, properties, devices));
        if (accountType === "testing") {
          return c.json({ airQuality: [], waterZones: [], bmsItems: [], generatedAt: new Date().toISOString(), source: "live" });
        }
      }

      // Synthetic telemetry for demo/standard-without-sensor-data
      const airQuality = properties
        .filter((prop: any) => devices.filter((d: any) => d.building === prop.name).some((d: any) => d.type === "IAQ"))
        .map((prop: any) => {
          const assigned = devices.filter((d: any) => d.building === prop.name);
          const iaqDevices = assigned.filter((d: any) => d.type === "IAQ");
          const hasOnlineIAQ = iaqDevices.some((d: any) => d.status === "online");
          const r = seededRandom(prop.id + "aq"), r2 = seededRandom(prop.id + "co2"), r3 = seededRandom(prop.id + "pm");
          const r4 = seededRandom(prop.id + "voc"), r5 = seededRandom(prop.id + "temp"), r6 = seededRandom(prop.id + "hum");
          return {
            propertyId: prop.id, propertyName: prop.name,
            aqi: hasOnlineIAQ ? 15 + Math.round(r * 60) : null,
            co2: hasOnlineIAQ ? 350 + Math.round(r2 * 300) : null,
            pm25: hasOnlineIAQ ? 5 + Math.round(r3 * 20) : null,
            voc: hasOnlineIAQ ? 1 + Math.round(r4 * 30) : null,
            temperature: hasOnlineIAQ ? 20 + Math.round(r5 * 80) / 10 : null,
            humidity: hasOnlineIAQ ? 35 + Math.round(r6 * 30) : null,
            trend: hasOnlineIAQ ? (r > 0.6 ? "up" : r > 0.3 ? "stable" : "down") : null,
            sensorCount: iaqDevices.length,
            sensorsOnline: iaqDevices.filter((d: any) => d.status === "online").length,
          };
        });
      const leakDevices = devices.filter((d: any) => d.type === "Leakage");
      const waterZones = leakDevices.map((d: any) => {
        const r1 = seededRandom(d.id + "psi"), r2 = seededRandom(d.id + "flow");
        const isOk = d.status === "online";
        return {
          id: d.id, zone: `${d.location} — ${d.building}`,
          pressure: isOk ? 45 + Math.round(r1 * 25) : 10 + Math.round(r1 * 20),
          flow: isOk ? 30 + Math.round(r2 * 200) : 0,
          status: d.status === "online" ? "normal" : d.status === "warning" ? "warning" : "offline",
          leakDetected: d.status === "warning",
        };
      });
      const bmsItems: any[] = [];
      const bmsDeviceTypes = ["HVAC", "Lighting", "Elevator", "Solar", "Energy"];
      const systemTypeMap: Record<string, string> = { "HVAC": "HVAC System", "Lighting": "Main Lighting", "Elevator": "Elevator Bank", "Solar": "Solar Array", "Energy": "Energy Meter" };
      properties.forEach((prop: any) => {
        const assigned = devices.filter((d: any) => d.building === prop.name);
        const bmsDevs = assigned.filter((d: any) => bmsDeviceTypes.includes(d.type));
        if (bmsDevs.length === 0) return;
        const seenTypes = new Set<string>();
        bmsDevs.forEach((d: any) => {
          if (seenTypes.has(d.type)) return;
          seenTypes.add(d.type);
          const isSolar = d.type === "Solar";
          const r = seededRandom(prop.id + d.type), r2 = seededRandom(prop.id + d.type + "load");
          const isOnline = d.status === "online";
          const consumption = isOnline ? (isSolar ? -Math.round(200 + r * 400) : Math.round(50 + r * 500)) : 0;
          const load = isOnline ? Math.round(10 + r2 * 90) : 0;
          bmsItems.push({
            id: `BMS-${prop.id}-${d.type}`,
            system: `${systemTypeMap[d.type] || d.type} — ${prop.name.split(" ")[0]}`,
            consumption: isOnline ? `${consumption} kWh` : "\u2014",
            load: isOnline ? `${load}%` : "\u2014",
            status: !isOnline ? "offline" : isSolar ? "generating" : load > 70 ? "active" : "standby",
          });
        });
      });
      return c.json({ airQuality, waterZones, bmsItems, generatedAt: new Date().toISOString(), source: "simulated" });
    } catch (e) {
      console.log("Error generating telemetry:", errorMessage(e));
      console.log("Telemetry generate error:", errorMessage(e));
      return c.json({ error: "Failed to generate telemetry." }, 500);
    }
  });

  // ─── CHART DATA ────────────────────────────────────────

  app.get("/make-server-4916a0b9/alarm-chart-data", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const alarms = await getUserCollection(auth.userId, "alarms");
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const now = new Date();
      const days: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        days.push({ name: dayNames[d.getDay()], date: d.toISOString().slice(0, 10), water: 0, smoke: 0, temperature: 0, deviceOffline: 0 });
      }
      for (const alarm of alarms) {
        try {
          const parsed = new Date(alarm.time);
          if (isNaN(parsed.getTime())) continue;
          const dateStr = parsed.toISOString().slice(0, 10);
          const day = days.find((d) => d.date === dateStr);
          if (!day) continue;
          const t = (alarm.type || "").toLowerCase();
          if (t.includes("water") || t.includes("leak")) day.water++;
          else if (t.includes("smoke") || t.includes("fire")) day.smoke++;
          else if (t.includes("temperature") || t.includes("humidity")) day.temperature++;
          else day.deviceOffline++;
        } catch { continue; }
      }
      return c.json(days.map((d) => ({ name: d.name, water: d.water, smoke: d.smoke, temperature: d.temperature, deviceOffline: d.deviceOffline })));
    } catch (e) {
      console.log("Error generating chart data:", errorMessage(e));
      return c.json({ error: "Failed to generate chart data." }, 500);
    }
  });

  // ─── GATEWAYS ──────────────────────────────────────────

  app.get("/make-server-4916a0b9/gateways", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const { devices, gateways } = await getEnrichedDevicesAndGateways(auth.userId);
      const enriched = gateways.map((gw: any) => {
        const connected = devices.filter((d: any) => d.gateway === gw.id);
        const s = countStatuses(connected);
        return { ...gw, connectedDevices: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning, devices: connected.map((d: any) => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) };
      });
      return c.json(enriched);
    } catch (e) {
      console.log("Error fetching gateways:", errorMessage(e));
      console.log("Gateways fetch error:", errorMessage(e));
      return c.json({ error: "Failed to fetch gateways." }, 500);
    }
  });

  app.get("/make-server-4916a0b9/gateways/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const { devices, gateways } = await getEnrichedDevicesAndGateways(auth.userId);
      const gateway = gateways.find((gw: any) => gw.id === id);
      if (!gateway) return c.json({ error: "Gateway not found." }, 404);
      const connected = devices.filter((d: any) => d.gateway === id);
      const s = countStatuses(connected);
      return c.json({ ...gateway, connectedDevices: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning, devices: connected });
    } catch (e) {
      console.log("Error fetching gateway:", errorMessage(e));
      return c.json({ error: "Failed to fetch gateway." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/gateways", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const name = sanitizeString(body.name, 200);
      const protocol = sanitizeString(body.protocol, 50);
      if (!name || !protocol) return c.json({ error: "Gateway name and protocol are required." }, 400);
      const key = uk(userId, "gateways");
      const gateways = await getUserCollection(userId, "gateways");
      if (gateways.length >= 100) return c.json({ error: "Maximum gateway limit (100) reached." }, 400);
      const newGateway: any = {
        id: `GW${Date.now()}`, name, protocol,
        model: sanitizeString(body.model, 100) || "FioGate Lite 200",
        property: sanitizeString(body.property, 200) || "Unassigned",
        location: sanitizeString(body.location, 200) || "Not specified",
        ipAddress: sanitizeString(body.ipAddress, 45) || "",
        macAddress: sanitizeString(body.macAddress, 17) || "",
        firmware: sanitizeString(body.firmware, 50) || "",
        status: sanitizeEnum(body.status, ["online", "offline", "warning"], "online"),
        signal: sanitizeNumber(body.signal, 0, 100, 80),
        uptime: "0d 0h", lastSeen: new Date().toISOString(),
      };
      for (const [field, maxLen] of GW_OPTIONAL_FIELDS) {
        const val = sanitizeString(body[field], maxLen);
        if (val) newGateway[field] = val;
      }
      gateways.push(newGateway);
      await cachedKvSet(key, gateways);
      return c.json(newGateway);
    } catch (e) {
      console.log("Error adding gateway:", errorMessage(e));
      return c.json({ error: "Failed to add gateway." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/gateways/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const body = await c.req.json();
      const key = uk(userId, "gateways");
      const gateways = await getUserCollection(userId, "gateways");
      const index = gateways.findIndex((gw: any) => gw.id === id);
      if (index === -1) return c.json({ error: "Gateway not found." }, 404);
      const old = gateways[index];
      const updates: any = {};
      if (body.name !== undefined) updates.name = sanitizeString(body.name, 200);
      if (body.model !== undefined) updates.model = sanitizeString(body.model, 100);
      if (body.protocol !== undefined) updates.protocol = sanitizeString(body.protocol, 50);
      if (body.property !== undefined) updates.property = sanitizeString(body.property, 200);
      if (body.location !== undefined) updates.location = sanitizeString(body.location, 200);
      if (body.ipAddress !== undefined) updates.ipAddress = sanitizeString(body.ipAddress, 45);
      if (body.macAddress !== undefined) updates.macAddress = sanitizeString(body.macAddress, 17);
      if (body.firmware !== undefined) updates.firmware = sanitizeString(body.firmware, 50);
      if (body.status !== undefined) updates.status = sanitizeEnum(body.status, ["online", "offline", "warning"], old.status);
      if (body.signal !== undefined) updates.signal = sanitizeNumber(body.signal, 0, 100, old.signal);
      for (const [field, maxLen] of GW_OPTIONAL_FIELDS) {
        if (body[field] !== undefined) updates[field] = sanitizeString(body[field], maxLen);
      }
      gateways[index] = { ...old, ...updates, id };
      await cachedKvSet(key, gateways);
      return c.json(gateways[index]);
    } catch (e) {
      console.log("Error updating gateway:", errorMessage(e));
      return c.json({ error: "Failed to update gateway." }, 500);
    }
  });

  app.delete("/make-server-4916a0b9/gateways/:id", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const key = uk(userId, "gateways");
      const gateways = await getUserCollection(userId, "gateways");
      const filtered = gateways.filter((gw: any) => gw.id !== id);
      if (filtered.length === gateways.length) return c.json({ error: "Gateway not found." }, 404);
      await cachedKvSet(key, filtered);
      const devKey = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      let devChanged = false;
      const updatedDevices = devices.map((d: any) => {
        if (d.gateway === id) { devChanged = true; return { ...d, gateway: "Unassigned" }; }
        return d;
      });
      if (devChanged) await cachedKvSet(devKey, updatedDevices);
      return c.json({ success: true, message: "Gateway deleted." });
    } catch (e) {
      console.log("Error deleting gateway:", errorMessage(e));
      return c.json({ error: "Failed to delete gateway." }, 500);
    }
  });

  // ─── GATEWAY HEARTBEAT ─────────────────────────────────

  app.post("/make-server-4916a0b9/gateway-heartbeat", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const gatewayId = sanitizeString(body.gatewayId, 50);
      if (!gatewayId) return c.json({ error: "gatewayId is required." }, 400);
      const key = uk(userId, "gateways");
      const gateways = await getUserCollection(userId, "gateways");
      const index = gateways.findIndex((gw: any) => gw.id === gatewayId);
      if (index === -1) return c.json({ error: "Gateway not found." }, 404);
      const now = new Date();
      const updates: any = { lastSeen: now.toISOString() };
      if (body.signal !== undefined) updates.signal = sanitizeNumber(body.signal, 0, 100, gateways[index].signal);
      if (body.firmware !== undefined) updates.firmware = sanitizeString(body.firmware, 20);
      if (body.ipAddress !== undefined) updates.ipAddress = sanitizeString(body.ipAddress, 45);
      const createdAt = gateways[index].createdAt || gateways[index].lastSeen || now.toISOString();
      if (!gateways[index].createdAt) updates.createdAt = createdAt;
      const uptimeMs = now.getTime() - new Date(createdAt).getTime();
      updates.uptime = `${Math.floor(uptimeMs / 86400000)}d ${Math.floor((uptimeMs % 86400000) / 3600000)}h`;
      gateways[index] = { ...gateways[index], ...updates };
      await cachedKvSet(key, gateways);
      const live = deriveGatewayStatus(gateways[index]);
      return c.json({ success: true, status: live.status, signal: live.signal, lastSeen: live.lastSeen });
    } catch (e) {
      console.log("Error processing gateway heartbeat:", errorMessage(e));
      return c.json({ error: "Heartbeat processing failed." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/gateway-heartbeat-batch", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const heartbeats: any[] = Array.isArray(body.heartbeats) ? body.heartbeats : [];
      if (heartbeats.length === 0) return c.json({ error: "heartbeats array is required." }, 400);
      if (heartbeats.length > 50) return c.json({ error: "Max 50 heartbeats per batch." }, 400);
      const key = uk(userId, "gateways");
      const gateways = await getUserCollection(userId, "gateways");
      const now = new Date();
      const results: any[] = [];
      for (const hb of heartbeats) {
        const gatewayId = sanitizeString(hb.gatewayId, 50);
        if (!gatewayId) continue;
        const index = gateways.findIndex((gw: any) => gw.id === gatewayId);
        if (index === -1) { results.push({ gatewayId, error: "not found" }); continue; }
        gateways[index].lastSeen = now.toISOString();
        if (hb.signal !== undefined) gateways[index].signal = sanitizeNumber(hb.signal, 0, 100, gateways[index].signal);
        const live = deriveGatewayStatus(gateways[index]);
        results.push({ gatewayId, status: live.status, signal: live.signal });
      }
      await cachedKvSet(key, gateways);
      return c.json({ success: true, results });
    } catch (e) {
      console.log("Error processing batch heartbeat:", errorMessage(e));
      return c.json({ error: "Batch heartbeat failed." }, 500);
    }
  });

  // ─── ASSIGN/UNASSIGN DEVICES ───────────────────────────

  app.put("/make-server-4916a0b9/gateway-assign-devices", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const gatewayId = sanitizeString(body.gatewayId, 50);
      const deviceIds: string[] = Array.isArray(body.deviceIds) ? body.deviceIds.map((id: any) => sanitizeString(id, 50)) : [];
      if (!gatewayId) return c.json({ error: "Gateway ID is required." }, 400);
      const gateways = await getUserCollection(userId, "gateways");
      if (!gateways.find((g: any) => g.id === gatewayId)) return c.json({ error: "Gateway not found." }, 404);
      const devKey = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      let changed = false;
      const updated = devices.map((d: any) => {
        if (deviceIds.includes(d.id) && d.gateway !== gatewayId) { changed = true; return { ...d, gateway: gatewayId }; }
        return d;
      });
      if (changed) await cachedKvSet(devKey, updated);
      return c.json({ success: true, message: `${deviceIds.length} device(s) assigned to gateway.` });
    } catch (e) {
      console.log("Error assigning devices:", errorMessage(e));
      return c.json({ error: "Failed to assign devices." }, 500);
    }
  });

  app.put("/make-server-4916a0b9/gateway-unassign-device", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const deviceId = sanitizeString(body.deviceId, 50);
      if (!deviceId) return c.json({ error: "Device ID is required." }, 400);
      const devKey = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      const index = devices.findIndex((d: any) => d.id === deviceId);
      if (index === -1) return c.json({ error: "Device not found." }, 404);
      devices[index] = { ...devices[index], gateway: "Unassigned" };
      await cachedKvSet(devKey, devices);
      return c.json({ success: true, message: "Device unassigned from gateway." });
    } catch (e) {
      console.log("Error unassigning device:", errorMessage(e));
      return c.json({ error: "Failed to unassign device." }, 500);
    }
  });

  // ─── ALARM TELEMETRY ───────────────────────────────────

  app.get("/make-server-4916a0b9/alarm-telemetry", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const type = sanitizeEnum(c.req.query("type") || "", ["water", "fire", "smoke"], "water");
      const [devices, alarms, properties] = await Promise.all([
        getUserCollection(userId, "devices"),
        getUserCollection(userId, "alarms"),
        getUserCollection(userId, "properties"),
      ]);
      const matchAlarm = (alarm: any): boolean => {
        const t = (alarm.type || "").toLowerCase();
        switch (type) {
          case "water": return t.includes("water") || t.includes("leak") || t.includes("flood") || t.includes("moisture");
          case "fire": return t.includes("fire") || t.includes("heat") || t.includes("sprinkler");
          case "smoke": return t.includes("smoke") || t.includes("air quality") || t.includes("ventilation");
          default: return false;
        }
      };
      const matchDevice = (device: any): boolean => {
        const dt = (device.type || "").toLowerCase();
        switch (type) {
          case "water": return dt.includes("leak") || dt === "leakage" || dt.includes("water") || dt.includes("moisture");
          case "fire": return dt.includes("fire") || dt.includes("heat") || dt.includes("sprinkler");
          case "smoke": return dt.includes("smoke") || dt.includes("iaq") || dt.includes("air");
          default: return false;
        }
      };
      const relevantDevices = devices.filter(matchDevice);
      const relevantAlarms = alarms.filter(matchAlarm);
      const zones: any[] = [];
      const locationGroups = new Map<string, any[]>();
      for (const d of relevantDevices) {
        const loc = d.location && d.building ? `${d.location} — ${d.building}` : d.location || d.building || "Unknown";
        if (!locationGroups.has(loc)) locationGroups.set(loc, []);
        locationGroups.get(loc)!.push(d);
      }
      for (const [location, devGroup] of locationGroups.entries()) {
        const hasOffline = devGroup.some((d: any) => d.status === "offline");
        const hasWarning = devGroup.some((d: any) => d.status === "warning");
        const hasPendingAlarm = relevantAlarms.some((a: any) => a.status === "pending" && (a.location === devGroup[0].location || a.property === devGroup[0].building));
        let status: string;
        if (hasOffline || (hasPendingAlarm && devGroup.some((d: any) => d.status !== "online"))) status = "alert";
        else if (hasWarning || hasPendingAlarm) status = "warning";
        else status = "normal";
        zones.push({ name: location, status });
      }
      if (zones.length === 0) {
        for (const p of properties.slice(0, 4)) {
          const hasAlarm = relevantAlarms.some((a: any) => a.status === "pending" && a.property === p.name);
          zones.push({ name: p.name, status: hasAlarm ? "warning" : "normal" });
        }
      }
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const now = new Date();
      const trendData: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayAlarms = relevantAlarms.filter((a: any) => {
          try { const parsed = new Date(a.time); if (isNaN(parsed.getTime())) return false; return parsed.toISOString().slice(0, 10) === dateStr; } catch { return false; }
        });
        trendData.push({ name: dayNames[d.getDay()], count: dayAlarms.length });
      }
      return c.json({ zones, trendData, totalRelevantDevices: relevantDevices.length, totalRelevantAlarms: relevantAlarms.length });
    } catch (e) {
      console.log("Error generating alarm telemetry:", errorMessage(e));
      return c.json({ error: "Failed to generate alarm telemetry." }, 500);
    }
  });

  // ─── WEBHOOK CONFIG ────────────────────────────────────

  app.get("/make-server-4916a0b9/webhook-config", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      let token: string | null = null;
      try { token = await kvGetWithRetry(`webhook_token_${userId}`); } catch { /* no token */ }
      const baseUrl = Deno.env.get("SUPABASE_URL") || `https://${c.req.header("host")}`;
      const webhookUrl = token ? `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook?token=${token}` : null;
      let lastReceived: string | null = null;
      try {
        const sensorData = await cachedKvGet(`sensor_data_${userId}`);
        if (Array.isArray(sensorData) && sensorData.length > 0) lastReceived = sensorData[0].receivedAt || null;
      } catch { /* ignore */ }
      return c.json({ token: token || null, webhookUrl, hasToken: !!token, lastReceived });
    } catch (e) {
      console.log("Error fetching webhook config:", errorMessage(e));
      return c.json({ token: null, webhookUrl: null, hasToken: false, lastReceived: null });
    }
  });

  app.post("/make-server-4916a0b9/webhook-config", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      try {
        const oldToken = await kvGetWithRetry(`webhook_token_${userId}`);
        if (oldToken) await kv.del(`webhook_lookup_${oldToken}`).catch(() => {});
      } catch { /* ignore */ }
      const newToken = generateWebhookToken();
      await kvSetWithRetry(`webhook_token_${userId}`, newToken, 3);
      try { await kvSetWithRetry(`webhook_lookup_${newToken}`, userId, 3); } catch { /* non-fatal */ }
      const baseUrl = Deno.env.get("SUPABASE_URL") || `https://${c.req.header("host")}`;
      const webhookUrl = `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook?token=${newToken}`;
      console.log(`Webhook token generated for user ${userId}`);
      return c.json({ token: newToken, webhookUrl, hasToken: true, lastReceived: null });
    } catch (e) {
      console.log("Error generating webhook token:", errorMessage(e));
      console.log("Webhook token error:", errorMessage(e));
      return c.json({ error: "Failed to generate webhook token." }, 500);
    }
  });

  // ─── WEBHOOK TEST ──────────────────────────────────────

  app.post("/make-server-4916a0b9/webhook-test", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const token = await kvGetWithRetry(`webhook_token_${userId}`);
      if (!token) return c.json({ success: false, error: "No webhook token configured." }, 400);
      const baseUrl = Deno.env.get("SUPABASE_URL") || `https://${c.req.header("host")}`;
      const webhookUrl = `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook?token=${token}`;
      const testPayload = {
        devEUI: "TEST000000000000", deviceName: "FioTech Test Ping", applicationName: "FioTech Webhook Test",
        fPort: 0, fCnt: 0, data: "",
        object: { _test: true, message: "Webhook connectivity test from FioTech dashboard" },
        rxInfo: [{ gatewayID: "TEST_GATEWAY", rssi: -50, loRaSNR: 10.0 }],
        txInfo: { frequency: 868100000 }, time: new Date().toISOString(),
      };
      const startMs = Date.now();
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
        body: JSON.stringify(testPayload),
      });
      const latencyMs = Date.now() - startMs;
      if (!resp.ok) {
        const errText = await resp.text();
        return c.json({ success: false, status: resp.status, latencyMs, error: `Endpoint returned ${resp.status}: ${errText.slice(0, 200)}` });
      }
      const result = await resp.json();
      return c.json({ success: true, latencyMs, entryId: result.id || null });
    } catch (e) {
      console.log("Webhook test error:", errorMessage(e));
      return c.json({ success: false, error: `Test failed: ${errorMessage(e)}` }, 500);
    }
  });

  // ─── TELEMETRY WEBHOOK (PUBLIC) ────────────────────────

  app.post("/make-server-4916a0b9/telemetry-webhook", async (c: any) => {
    const ip = getClientIp(c);
    if (!rateLimit(ip + ":webhook", 60, 60000)) return c.json({ error: "Rate limited." }, 429);
    try {
      const token = c.req.query("token") || "";
      if (!token || token.length < 10) return c.json({ error: "Missing or invalid webhook token." }, 401);
      const userId = await kvGetWithRetry(`webhook_lookup_${token}`);
      if (!userId) return c.json({ error: "Invalid webhook token." }, 401);
      const storedToken = await kvGetWithRetry(`webhook_token_${userId}`);
      if (storedToken !== token) return c.json({ error: "Webhook token revoked." }, 401);

      const body = await c.req.json();
      const isJoinEvent = !!(body.devAddr && !body.data && !body.fCnt && !body.object);
      const isErrorEvent = !!(body.error || body.type === "error" || body.errorMsg);
      const isAckEvent = !!(body.acknowledged !== undefined || body.type === "ack");
      const eventType = isJoinEvent ? "join" : isErrorEvent ? "error" : isAckEvent ? "ack" : "uplink";

      const devEUI = sanitizeString(body.devEUI || body.devEui || body.dev_eui || "", 24);
      const deviceName = sanitizeString(body.deviceName || body.device_name || "Unknown Device", 200);
      const applicationName = sanitizeString(body.applicationName || body.application_name || "", 200);
      const fPort = typeof body.fPort === "number" ? body.fPort : (typeof body.fport === "number" ? body.fport : 0);
      const fCnt = typeof body.fCnt === "number" ? body.fCnt : (typeof body.fcnt === "number" ? body.fcnt : 0);
      const rawData = sanitizeString(body.data || "", 2000);
      const decodedData = (body.object && typeof body.object === "object" && !Array.isArray(body.object)) ? body.object : null;
      const uplinkTime = sanitizeString(body.time || body.timestamp || new Date().toISOString(), 50);

      let gatewayEUI = "", rssi = -999, snr = 0, frequency = 0;
      if (Array.isArray(body.rxInfo) && body.rxInfo.length > 0) {
        const rx = body.rxInfo[0];
        gatewayEUI = sanitizeString(rx.gatewayID || rx.gateway_id || rx.gatewayId || "", 24);
        rssi = typeof rx.rssi === "number" ? rx.rssi : -999;
        snr = typeof rx.loRaSNR === "number" ? rx.loRaSNR : (typeof rx.snr === "number" ? rx.snr : 0);
      }
      if (body.txInfo && typeof body.txInfo === "object") frequency = typeof body.txInfo.frequency === "number" ? body.txInfo.frequency : 0;

      const entry: any = {
        id: `SD${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        eventType, devEUI, deviceName, applicationName, gatewayEUI, rssi,
        snr: Math.round(snr * 10) / 10, frequency, fPort, fCnt, rawData, decodedData,
        receivedAt: new Date().toISOString(), uplinkTime,
      };
      if (isErrorEvent) entry.errorMessage = sanitizeString(body.error || body.errorMsg || "Unknown error", 500);

      const sdKey = `sensor_data_${userId}`;
      let sensorData: any[] = [];
      try { const existing = await kvGetWithRetry(sdKey); if (Array.isArray(existing)) sensorData = existing; } catch { /* start fresh */ }
      sensorData.unshift(entry);
      if (sensorData.length > 500) sensorData = sensorData.slice(0, 500);
      await kvSetWithRetry(sdKey, sensorData);

      // Auto-heartbeat gateway
      if (gatewayEUI) {
        const gateways = await getUserCollection(userId, "gateways");
        const gwIdx = gateways.findIndex((gw: any) =>
          (gw.devEui || "").toLowerCase() === gatewayEUI.toLowerCase() ||
          (gw.macAddress || "").replace(/:/g, "").toLowerCase() === gatewayEUI.toLowerCase()
        );
        if (gwIdx !== -1) {
          gateways[gwIdx].lastSeen = new Date().toISOString();
          if (rssi > -999) gateways[gwIdx].signal = Math.max(0, Math.min(100, 2 * (rssi + 100)));
          await cachedKvSet(uk(userId, "gateways"), gateways);
        }
      }

      // Auto-generate alarms from decoded data
      if (decodedData) {
        const alarmChecks = [
          { field: "smoke_status", threshold: 0, type: "Smoke Detected", desc: "Smoke detected by sensor", above: true },
          { field: "fire_status", threshold: 0, type: "Fire Alarm", desc: "Fire detected by sensor", above: true },
          { field: "temperature", threshold: 50, type: "Temperature", desc: "Temperature exceeding 50C threshold", above: true },
          { field: "humidity", threshold: 85, type: "High Humidity", desc: "Humidity exceeding 85% threshold", above: true },
          { field: "water_leak", threshold: 0, type: "Water Leakage", desc: "Water leak detected by sensor", above: true },
        ];
        for (const check of alarmChecks) {
          const val = decodedData[check.field];
          if (typeof val === "number" && ((check.above && val > check.threshold) || (!check.above && val < check.threshold))) {
            const alarmKey = uk(userId, "alarms");
            let alarms = await kvGetWithRetry(alarmKey);
            if (!Array.isArray(alarms)) alarms = [];
            const recentDupe = alarms.find((a: any) => a.type === check.type && a.status === "pending" && (Date.now() - new Date(a.time).getTime()) < 300000);
            if (!recentDupe) {
              alarms.unshift({
                id: `A${Date.now()}`, type: check.type, location: deviceName,
                property: applicationName || "LoRaWAN Sensor",
                severity: check.type.includes("Fire") || check.type.includes("Smoke") ? "high" : "medium",
                time: new Date().toISOString(), status: "pending",
                description: `${check.desc}: ${deviceName} reported ${check.field}=${val}`,
              });
              if (alarms.length > 1000) alarms = alarms.slice(0, 1000);
              await kvSetWithRetry(alarmKey, alarms);
              invalidateKvCache(alarmKey);
            }
          }
        }
      }

      return c.json({ success: true, id: entry.id, message: "Uplink data received." });
    } catch (e) {
      console.log("Webhook error:", errorMessage(e));
      return c.json({ error: "Failed to process webhook data." }, 500);
    }
  });

  // ─── SENSOR DATA ───────────────────────────────────────

  app.get("/make-server-4916a0b9/sensor-data", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const limitParam = c.req.query("limit");
      const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam) || 50)) : 50;
      const sdKey = `sensor_data_${userId}`;
      let sensorData: any[] = [];
      try { const raw = await cachedKvGet(sdKey); if (Array.isArray(raw)) sensorData = raw; } catch { /* empty */ }
      const data = sensorData.slice(0, limit);
      const deviceMap = new Map<string, any>();
      for (const entry of sensorData) {
        if (!entry.devEUI) continue;
        if (!deviceMap.has(entry.devEUI)) {
          deviceMap.set(entry.devEUI, {
            devEUI: entry.devEUI, deviceName: entry.deviceName, applicationName: entry.applicationName,
            lastSeen: entry.receivedAt, uplinkCount: 0, lastRssi: entry.rssi, lastSnr: entry.snr, lastDecodedData: entry.decodedData,
          });
        }
        deviceMap.get(entry.devEUI)!.uplinkCount++;
      }
      return c.json({ entries: data, totalEntries: sensorData.length, devices: Array.from(deviceMap.values()), totalDevices: deviceMap.size });
    } catch (e) {
      console.log("Error fetching sensor data:", errorMessage(e));
      console.log("Sensor data error:", errorMessage(e));
      return c.json({ error: "Failed to fetch sensor data." }, 500);
    }
  });

  // ─── ADMIN: Check if current user is admin ───────────────

  app.get("/make-server-4916a0b9/admin/check", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    return c.json({ isAdmin: MASTER_EMAILS.has(auth.email.toLowerCase()) });
  });

  console.log("[FioTech Routes] All route handlers registered.");

  // ─── ADMIN: List all users ───────────────────────────────
  // Fast single-try KV read (no retries) for enrichment — missing keys return null silently.
  async function kvGetFast(key: string): Promise<any> {
    try { return await kv.get(key); } catch { return null; }
  }

  app.get("/make-server-4916a0b9/admin/users", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    try {
      const page = parseInt(c.req.query("page") || "1");
      const perPage = Math.min(100, parseInt(c.req.query("perPage") || "50"));
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.log("Admin listUsers error:", error.message);
        return c.json({ error: "Failed to list users." }, 500);
      }
      // Batch all KV reads in parallel (2 per user: account_type + settings)
      const userList = data.users || [];
      const kvKeys = userList.flatMap((u: any) => [`account_type_${u.id}`, uk(u.id, "settings")]);
      const kvResults = await Promise.all(kvKeys.map(kvGetFast));
      const users = userList.map((u: any, i: number) => {
        const accountType = kvResults[i * 2] || "standard";
        const settings = kvResults[i * 2 + 1];
        return {
          id: u.id,
          email: u.email || "",
          name: u.user_metadata?.name || u.email?.split("@")[0] || "",
          accountType,
          role: settings?.profile?.role || "Unknown",
          company: settings?.profile?.company || "",
          phone: settings?.profile?.phone || "",
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at,
          emailConfirmed: !!u.email_confirmed_at,
          isMaster: MASTER_EMAILS.has((u.email || "").toLowerCase()),
        };
      });
      return c.json({ users, total: userList.length, page, perPage });
    } catch (e) {
      console.log("Admin listUsers error:", errorMessage(e));
      return c.json({ error: "Failed to list users." }, 500);
    }
  });

  // ─── ADMIN: Get single user details ──────────────────────

  app.get("/make-server-4916a0b9/admin/users/:id", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    const targetId = sanitizeString(c.req.param("id"), 50);
    try {
      const { data, error } = await supabase.auth.admin.getUserById(targetId);
      if (error || !data?.user) return c.json({ error: "User not found." }, 404);
      const u = data.user;
      // Parallel KV reads — fast, no retries
      const [rawAccType, settings, rawProps, rawDevs] = await Promise.all([
        kvGetFast(`account_type_${u.id}`),
        kvGetFast(uk(u.id, "settings")),
        kvGetFast(uk(u.id, "properties")),
        kvGetFast(uk(u.id, "devices")),
      ]);
      const accountType = rawAccType || "standard";
      const propertyCount = Array.isArray(rawProps) ? rawProps.length : 0;
      const deviceCount = Array.isArray(rawDevs) ? rawDevs.length : 0;
      return c.json({
        id: u.id,
        email: u.email || "",
        name: u.user_metadata?.name || u.email?.split("@")[0] || "",
        accountType,
        profile: settings?.profile || null,
        notifications: settings?.notifications || null,
        dashboard: settings?.dashboard || null,
        security: settings?.security || null,
        propertyCount,
        deviceCount,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
        emailConfirmed: !!u.email_confirmed_at,
        isMaster: MASTER_EMAILS.has((u.email || "").toLowerCase()),
      });
    } catch (e) {
      console.log("Admin getUser error:", errorMessage(e));
      return c.json({ error: "Failed to fetch user." }, 500);
    }
  });

  // ─── ADMIN: Update user profile/settings ─────────────────

  app.put("/make-server-4916a0b9/admin/users/:id", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    const targetId = sanitizeString(c.req.param("id"), 50);
    try {
      const body = await c.req.json();

      // Update Supabase Auth user (email, password, user_metadata)
      const authUpdates: any = {};
      if (body.email) authUpdates.email = sanitizeString(body.email, 254);
      if (body.password) {
        if (typeof body.password !== "string" || body.password.length < 8) {
          return c.json({ error: "Password must be at least 8 characters." }, 400);
        }
        if (body.password.length > 128) {
          return c.json({ error: "Password too long." }, 400);
        }
        authUpdates.password = body.password;
      }
      if (body.name) authUpdates.user_metadata = { name: sanitizeString(body.name, 100) };
      if (Object.keys(authUpdates).length > 0) {
        const { error } = await supabase.auth.admin.updateUserById(targetId, authUpdates);
        if (error) {
          console.log("Admin updateUser auth error:", error.message);
          return c.json({ error: `Failed to update auth: ${error.message}` }, 400);
        }
      }

      // Update KV settings (profile fields)
      if (body.profile || body.phone || body.company || body.role) {
        const key = uk(targetId, "settings");
        let settings: any = {};
        try { settings = await kvGetWithRetry(key) || {}; } catch { /* ignore */ }
        if (!settings.profile) settings.profile = {};
        if (body.profile) {
          settings.profile = { ...settings.profile, ...body.profile };
        }
        if (body.phone !== undefined) settings.profile.phone = sanitizeString(body.phone, 20);
        if (body.company !== undefined) settings.profile.company = sanitizeString(body.company, 200);
        if (body.role !== undefined) settings.profile.role = sanitizeEnum(body.role, ["Admin", "Manager", "Technician", "Viewer", "Engineer"], settings.profile.role || "Viewer");
        if (body.email) settings.profile.email = body.email;
        if (body.name) settings.profile.name = body.name;
        await kvSetWithRetry(key, settings);
        invalidateKvCache(key);
      }

      // Update account type
      if (body.accountType) {
        const type = sanitizeEnum(body.accountType, ["demo", "testing", "standard"], "standard");
        await kvSetWithRetry(`account_type_${targetId}`, type);
        accountTypeCache.delete(targetId);
      }

      return c.json({ success: true, message: "User updated." });
    } catch (e) {
      console.log("Admin updateUser error:", errorMessage(e));
      return c.json({ error: "Failed to update user." }, 500);
    }
  });

  // ─── ADMIN: Delete user ──────────────────────────────────

  app.delete("/make-server-4916a0b9/admin/users/:id", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    const targetId = sanitizeString(c.req.param("id"), 50);
    try {
      // Prevent deleting self
      if (targetId === admin.userId) return c.json({ error: "Cannot delete your own account." }, 400);
      // Delete from Supabase Auth
      const { error } = await supabase.auth.admin.deleteUser(targetId);
      if (error) {
        console.log("Admin deleteUser error:", error.message);
        return c.json({ error: `Failed to delete user: ${error.message}` }, 400);
      }
      // Clean up KV data
      const collections = ["properties", "devices", "gateways", "alarms", "settings", "widget_layout"];
      for (const col of collections) {
        try { await kv.del(uk(targetId, col)); } catch { /* ignore */ }
      }
      try { await kv.del(`account_type_${targetId}`); } catch { /* ignore */ }
      try { await kv.del(`sensor_data_${targetId}`); } catch { /* ignore */ }
      try { await kv.del(`webhook_token_${targetId}`); } catch { /* ignore */ }
      accountTypeCache.delete(targetId);
      return c.json({ success: true, message: "User deleted." });
    } catch (e) {
      console.log("Admin deleteUser error:", errorMessage(e));
      return c.json({ error: "Failed to delete user." }, 500);
    }
  });

  // ── AWS IoT Core Integration (deferred import) ──────────
  // Dynamically imports AWS routes to avoid adding AWS SDK
  // weight to the main route module's load time.
  (async () => {
    try {
      const { registerAWSRoutes } = await import("./aws_routes.tsx");
      registerAWSRoutes(app, requireAuth, cachedKvGet, cachedKvSet, uk);
      console.log("[FioTech Routes] AWS routes loaded.");
    } catch (e) {
      console.log("[FioTech Routes] AWS routes skipped (SDK not available or import error):", errorMessage(e));
    }
  })();
}
