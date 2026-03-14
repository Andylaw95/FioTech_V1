import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import {
  DEMO_PROPERTIES, DEMO_DEVICES, makeDemoGateways, makeDemoAlarms,
  DEFAULT_SETTINGS,
} from "./seed_data.tsx";

// ── SUPABASE CLIENT (service role — NEVER expose to frontend) ──
// Minimal config: disable session persistence & auto-refresh to reduce memory footprint
// This is the ONLY Supabase client for the entire function — shared with kv_store.tsx.
const supabase = (() => {
  try {
    const c = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 0 } },
      },
    );
    // Share with kv_store — single client for entire function
    kv.init(c);
    console.log("[FioTec Routes] Supabase client created & shared");
    return c;
  } catch (e) {
    console.log("[FioTec Routes] CRITICAL: Failed to create Supabase client:", e);
    return createClient("https://placeholder.supabase.co", "placeholder");
  }
})();

const BUCKET_NAME = "make-4916a0b9-property-images";

// ── LAZY BUCKET INIT — only runs on first upload request ─────
// Moved from a setTimeout(5s) to on-demand to reduce boot overhead.
let _bucketChecked = false;
async function ensureBucket() {
  if (_bucketChecked) return;
  _bucketChecked = true;
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
}

// ── HELPERS ──────────────────────────────────────────────

// Known broken sensor fields — strip these from decoded data everywhere
// AM308L#2 (24e124707e012685): PM2.5 and PM10 sensors are malfunctioning
const BROKEN_SENSOR_FIELDS: Record<string, string[]> = {
  "24e124707e012685": ["pm2_5", "pm10", "pm25"],
};
function stripBrokenFields(eui: string, decoded: Record<string, any> | null): void {
  if (!decoded) return;
  const patterns = BROKEN_SENSOR_FIELDS[eui.toLowerCase()];
  if (!patterns) return;
  for (const k of Object.keys(decoded)) {
    const kl = k.toLowerCase();
    if (patterns.some(p => kl.includes(p))) delete decoded[k];
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ── AUTH ─────────────────────────────────────────────────

// Admin identity from environment variables (fallback to defaults for backward compat)
const MASTER_EMAILS = new Set(
  (Deno.env.get("MASTER_EMAILS") || "andylaw@fsenv.com.hk")
    .split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
);
const MASTER_USER_ID = Deno.env.get("MASTER_USER_ID") || "5a386250-7710-4a83-8942-5dc45201303f";

// ── Realtime Broadcast — push critical alarm alerts instantly to frontend ──
async function broadcastAlarmPush(targetUserId: string, alarm: any) {
  try {
    const rtUrl = `${Deno.env.get("SUPABASE_URL")}/realtime/v1/api/broadcast`;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!rtUrl || !svcKey) return;
    await fetch(rtUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${svcKey}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: `realtime:alarm-push-${targetUserId}`,
          event: "broadcast",
          payload: { type: "broadcast", event: "critical-alarm", payload: { alarm } },
        }],
      }),
    });
    console.log(`[Realtime] Broadcast alarm push to ${targetUserId}: ${alarm.type}`);
  } catch (e) {
    console.log(`[Realtime] Broadcast failed (non-fatal): ${errorMessage(e)}`);
  }
}

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
  // Double-gate: require BOTH matching email AND known master userId
  if (!MASTER_EMAILS.has(auth.email.toLowerCase()) || auth.userId !== MASTER_USER_ID) {
    return c.json({ error: "Forbidden. Admin access required." }, 403);
  }
  return auth;
}

// Resolve target userId — admin can specify ?forUser=<userId> to operate on client data.
// Regular users always get their own userId (forUser is silently ignored).
function resolveTargetUser(auth: { userId: string; email: string }, c: any): string {
  const forUser = sanitizeString(c.req.query("forUser") || "", 50);
  if (forUser && forUser !== auth.userId) {
    if (!MASTER_EMAILS.has(auth.email.toLowerCase()) || auth.userId !== MASTER_USER_ID) return auth.userId;
    return forUser;
  }
  return auth.userId;
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

// Allowed top-level keys for settings merge (prevents injection of arbitrary fields)
const SETTINGS_ALLOWED_KEYS = new Set([
  "profile", "notifications", "dashboard", "security", "theme",
  "language", "timezone", "dateFormat", "displayDensity",
]);
const PROFILE_ALLOWED_KEYS = new Set([
  "name", "phone", "company", "avatar", "bio", "location",
]);

function safeMerge(target: any, source: any, depth = 0, allowedKeys?: Set<string>): any {
  if (depth > 5) return target;
  if (!source || typeof source !== "object" || Array.isArray(source)) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    // At depth 0, enforce whitelist of allowed top-level keys
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      // For profile sub-object, enforce profile-specific whitelist
      const childAllowed = key === "profile" ? PROFILE_ALLOWED_KEYS : undefined;
      result[key] = safeMerge(result[key] || {}, source[key], depth + 1, childAllowed);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── RATE LIMITER ─────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
let _lastRateLimitCleanup = Date.now();

function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  // Lazy cleanup — replaces setInterval to eliminate persistent timer
  if (now - _lastRateLimitCleanup > 60000) {
    _lastRateLimitCleanup = now;
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function getClientIp(c: any): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s: string) => s.trim()).filter(Boolean);
    // Use the leftmost (first) IP — this is the original client IP
    return parts[0] || "unknown";
  }
  return c.req.header("x-real-ip") || "unknown";
}

// ── KV CACHE ─────────────────────────────────────────────

const kvCache = new Map<string, { data: any; expiresAt: number }>();
let _lastKvCacheCleanup = Date.now();
const KV_CACHE_TTL_FAST = 3000;   // alarms, sensor_data — need quick refresh for safety
const KV_CACHE_TTL_SLOW = 30000;  // properties, gateways, devices, settings, widget_layout — rarely change
const kvInflight = new Map<string, Promise<any>>();

/** Pick cache TTL based on key type — alarms & sensor data stay fast, everything else gets longer cache */
function kvCacheTtl(key: string): number {
  if (key.includes("alarm") || key.includes("sensor_data")) return KV_CACHE_TTL_FAST;
  return KV_CACHE_TTL_SLOW;
}

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
  // Lazy cleanup — replaces setInterval to eliminate persistent timer
  if (now - _lastKvCacheCleanup > 30000) {
    _lastKvCacheCleanup = now;
    for (const [k, val] of kvCache.entries()) {
      if (now > val.expiresAt) kvCache.delete(k);
    }
  }
  const cached = kvCache.get(key);
  if (cached && now < cached.expiresAt) return cached.data;
  if (kvInflight.has(key)) return kvInflight.get(key)!;
  const ttl = kvCacheTtl(key);
  const promise = kvGetWithRetry(key)
    .then((data) => { kvCache.set(key, { data, expiresAt: Date.now() + ttl }); return data; })
    .finally(() => { kvInflight.delete(key); });
  kvInflight.set(key, promise);
  return promise;
}

function invalidateKvCache(key: string) { kvCache.delete(key); }

async function cachedKvSet(key: string, data: any): Promise<void> {
  await kvSetWithRetry(key, data);
  const ttl = kvCacheTtl(key);
  kvCache.set(key, { data, expiresAt: Date.now() + ttl });
}

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
  // Standard and testing accounts start empty — no fake seed data
  return [];
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
    kvCache.set(key, { data: defaults, expiresAt: Date.now() + KV_CACHE_TTL_SLOW * 2 });
  }
  return defaults;
}

async function getUserSettings(userId: string): Promise<any> {
  const key = uk(userId, "settings");
  let kvFailed = false;
  try {
    const data = await cachedKvGet(key);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch (e) {
    console.log("getUserSettings: KV read failed:", errorMessage(e));
    kvFailed = true;
  }
  const accountType = await getAccountType(userId);
  let defaults;
  if (accountType === "demo") {
    defaults = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, name: "Demo User", email: "demo@example.com", role: "Viewer" } };
  } else {
    defaults = { ...DEFAULT_SETTINGS };
  }
  // ONLY seed defaults when settings genuinely don't exist (null/empty).
  // Do NOT overwrite on transient KV read failures — that would destroy user's saved profile.
  if (!kvFailed) {
    try { await cachedKvSet(key, defaults); } catch (e) {
      console.log("getUserSettings: KV seed failed:", errorMessage(e));
    }
  }
  return defaults;
}

async function autoGenerateAlarm(userId: string, device: any, newStatus: string) {
  try {
    const key = uk(userId, "alarms");
    let alarms = await kvGetWithRetry(key);
    if (!alarms || !Array.isArray(alarms)) alarms = [];
    if (alarms.length >= 1000) {
      // Keep all pending/dismissed, trim oldest resolved to stay under 800 total
      const pending = alarms.filter((a: any) => a.status !== "resolved");
      const resolved = alarms.filter((a: any) => a.status === "resolved");
      const maxResolved = Math.max(0, 800 - pending.length);
      alarms = pending.concat(resolved.slice(0, maxResolved));
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
    const [properties, rawDevices, gateways] = await Promise.all([
      kvGetWithRetry(uk(userId, "properties")),
      kvGetWithRetry(uk(userId, "devices")),
      getGatewaysWithLiveStatus(userId),
    ]);
    if (!Array.isArray(properties) || !Array.isArray(rawDevices)) return;
    const idx = properties.findIndex((p: any) => p.name === buildingName);
    if (idx === -1) return;
    // Derive statuses with staleness / battery / gateway checks so that
    // the stored waterSensors value is accurate (not just raw status).
    const gwMap = new Map<string, string>();
    gateways.forEach((gw: any) => { gwMap.set(gw.id, gw.status); if (gw.devEui) gwMap.set(gw.devEui.toLowerCase(), gw.status); });
    const enriched = deriveDeviceStatuses(rawDevices, gwMap);
    const assigned = enriched.filter((d: any) => d.building === buildingName);
    const s = countStatuses(assigned);
    properties[idx] = { ...properties[idx], waterSensors: `${s.online}/${s.total}`, deviceCount: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning };
    await kvSetWithRetry(uk(userId, "properties"), properties);
    invalidateKvCache(uk(userId, "properties"));
  } catch (e) { console.log("Sensor count update error:", errorMessage(e)); }
}

// ── GATEWAY STATUS ───────────────────────────────────────

const GW_ONLINE_THRESHOLD_MS = 15 * 60 * 1000;   // 15 min — matches typical LoRaWAN uplink interval
const GW_WARNING_THRESHOLD_MS = 45 * 60 * 1000;  // 45 min — generous buffer before offline

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
    // Don't fabricate signal — show 0 if no real signal data available
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

/** Convert an ISO timestamp to a human-friendly relative string. */
function friendlyAge(iso: string, now: number): string {
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return iso; // not a valid date, pass through
  const diffMs = now - ts;
  if (diffMs < 0) return "Just now"; // clock skew / future timestamp
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function deriveDeviceStatuses(devices: any[], gatewayStatuses: Map<string, string>): any[] {
  const now = Date.now();
  const STALE_OFFLINE = 60 * 60 * 1000; // 1 hour without uplink → offline
  const STALE_WARNING = 30 * 60 * 1000; // 30 min without uplink → warning

  return devices.map((d: any) => {
    let status = d.status || "online";
    let lastUpdate = d.lastUpdate;
    let battery = typeof d.battery === "number" ? d.battery : 100;

    // Staleness-based status: if no uplink for a while, mark offline/warning
    if (d.lastSeen) {
      const age = now - new Date(d.lastSeen).getTime();
      if (age > STALE_OFFLINE) {
        status = "offline";
        const hrs = Math.round(age / (60 * 60 * 1000));
        lastUpdate = hrs >= 24 ? `Offline ${Math.round(hrs / 24)}d ago` : `Offline ${hrs}h ago`;
        // If last-known battery was already low, the device likely died from
        // a depleted battery — show 0% so the UI doesn't mislead with a stale value.
        if (battery <= 15) battery = 0;
      } else if (age > STALE_WARNING && status === "online") {
        status = "warning";
        lastUpdate = `Last seen ${Math.round(age / (60 * 1000))}m ago`;
      }
    }

    // Battery-based status derivation (can worsen status further)
    if (battery === 0) {
      status = "offline";
      lastUpdate = "Battery dead";
    } else if (battery <= 15 && status === "online") {
      status = "warning";
      lastUpdate = d.lastUpdate || "Low battery";
    }

    // Gateway-based status derivation (overrides to worse status only)
    if (d.gateway && d.gateway !== "Unassigned") {
      const gwStatus = gatewayStatuses.get(d.gateway);
      if (gwStatus === "offline") { status = "offline"; lastUpdate = "Gateway offline"; }
      else if (gwStatus === "warning" && status === "online") { status = "warning"; lastUpdate = "Gateway unstable"; }
    }

    // Convert any remaining raw ISO timestamps to friendly relative text
    if (lastUpdate && /^\d{4}-\d{2}-\d{2}T/.test(lastUpdate)) {
      lastUpdate = friendlyAge(lastUpdate, now);
    }

    return { ...d, status, lastUpdate, battery };
  });
}

async function getEnrichedDevicesAndGateways(userId: string) {
  const [rawDevices, gateways] = await Promise.all([
    getUserCollection(userId, "devices"),
    getGatewaysWithLiveStatus(userId),
  ]);
  const gwStatusMap = new Map<string, string>();
  gateways.forEach((gw: any) => {
    gwStatusMap.set(gw.id, gw.status);
    // Also index by devEui (lowercase) so auto-registered devices with EUI-based gateway field work
    if (gw.devEui) gwStatusMap.set(gw.devEui.toLowerCase(), gw.status);
  });
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
  const STALE_CUTOFF = 60 * 60 * 1000; // 1 hour — ignore entries older than this for dashboard display
  const latestByDevice = new Map<string, any>();
  for (const entry of sensorData) {
    if (!entry.devEUI || entry.devEUI.startsWith("TEST")) continue;
    if (entry.eventType === "join" || entry.eventType === "ack") continue;
    // Skip stale data — device is offline if no uplink in the last hour
    const entryAge = now.getTime() - new Date(entry.receivedAt).getTime();
    if (entryAge > STALE_CUTOFF) continue;
    if (!latestByDevice.has(entry.devEUI)) latestByDevice.set(entry.devEUI, entry);
  }
  const airQuality: any[] = [];
  const waterZones: any[] = [];
  const bmsItems: any[] = [];
  const devicePropertyMap = new Map<string, string>();
  const devicePropertyIdMap = new Map<string, string>();  // devEUI → property ID
  const deviceEuiPropertyMap = new Map<string, string>(); // devEUI → property name
  for (const d of devices) {
    if (d.building && d.building !== "Unassigned") {
      devicePropertyMap.set((d.name || "").toLowerCase(), d.building);
      // Map devEui to the actual property ID and name for correct linking
      if (d.devEui) {
        const euiLower = d.devEui.toLowerCase();
        deviceEuiPropertyMap.set(euiLower, d.building);
        const prop = properties.find((p: any) => p.name === d.building);
        if (prop) devicePropertyIdMap.set(euiLower, prop.id);
      }
    }
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
    // Strip known broken sensor fields for dashboard AQI
    stripBrokenFields(devEUI, decoded);
    const keys = Object.keys(decoded);
    const lowerKeys = keys.map((k) => k.toLowerCase());
    const sensorName = entry.deviceName || devEUI;
    const matchedProperty = deviceEuiPropertyMap.get(devEUI.toLowerCase()) || devicePropertyMap.get(sensorName.toLowerCase()) || entry.applicationName || "LoRaWAN Sensor";

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
      else if (temp !== null) {
        // Comfort-index fallback: ideal 20-26°C → AQI ~15, each °C outside adds ~8
        const deviation = temp < 20 ? 20 - temp : temp > 26 ? temp - 26 : 0;
        aqi = Math.min(150, Math.round(15 + deviation * 8));
      }
      let trend: string | null = null;
      const olderEntries = sensorData.filter((e: any) => e.devEUI === devEUI && e.id !== entry.id && e.decodedData);
      if (olderEntries.length > 0 && aqi !== null) {
        const older = olderEntries[0].decodedData;
        stripBrokenFields(devEUI, older);
        const olderPm = older ? findVal(older, Object.keys(older), ["pm2_5", "pm25"]) : null;
        const olderCo2 = older ? findVal(older, Object.keys(older), ["co2"]) : null;
        const olderTemp = older ? findVal(older, Object.keys(older), ["temperature", "temp"]) : null;
        const compareVal = olderPm ?? olderCo2 ?? olderTemp;
        const currentVal = pm25 ?? co2 ?? temp;
        if (compareVal !== null && currentVal !== null) {
          const delta = currentVal - compareVal;
          trend = delta > 2 ? "up" : delta < -2 ? "down" : "stable";
        }
      }
      // Use the actual property ID for the link, falling back to devEUI if no property assigned
      const realPropertyId = devicePropertyIdMap.get(devEUI.toLowerCase()) || devEUI;
      airQuality.push({
        propertyId: realPropertyId, propertyName: `${sensorName} — ${matchedProperty}`,
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
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "whk_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

// ══════════════════════════════════════════════════════════
// CAYENNE LPP DECODER — decodes base64/hex LoRaWAN payloads
// ══════════════════════════════════════════════════════════

const LPP_TYPES: Record<number, { name: string; size: number; divisor: number; signed: boolean }> = {
  0: { name: "digital_input", size: 1, divisor: 1, signed: false },
  1: { name: "digital_output", size: 1, divisor: 1, signed: false },
  2: { name: "analog_input", size: 2, divisor: 100, signed: true },
  3: { name: "analog_output", size: 2, divisor: 100, signed: true },
  101: { name: "illuminance", size: 2, divisor: 1, signed: false },
  102: { name: "presence", size: 1, divisor: 1, signed: false },
  103: { name: "temperature", size: 2, divisor: 10, signed: true },
  104: { name: "relative_humidity", size: 1, divisor: 2, signed: false },
  113: { name: "accelerometer", size: 6, divisor: 1000, signed: true },
  115: { name: "barometric_pressure", size: 2, divisor: 10, signed: false },
  116: { name: "voltage", size: 2, divisor: 100, signed: false },
  117: { name: "current", size: 2, divisor: 1000, signed: false },
  118: { name: "frequency", size: 4, divisor: 1, signed: false },
  120: { name: "percentage", size: 1, divisor: 1, signed: false },
  121: { name: "altitude", size: 2, divisor: 1, signed: true },
  125: { name: "concentration", size: 2, divisor: 1, signed: false },
  128: { name: "power", size: 2, divisor: 1, signed: false },
  130: { name: "distance", size: 4, divisor: 1000, signed: false },
  132: { name: "energy", size: 4, divisor: 1000, signed: false },
  133: { name: "direction", size: 2, divisor: 1, signed: false },
  134: { name: "unix_time", size: 4, divisor: 1, signed: false },
  136: { name: "colour", size: 3, divisor: 1, signed: false },
  142: { name: "switch", size: 1, divisor: 1, signed: false },
};

// Milesight AM308L extended types (vendor-specific on fPort 85)
const MILESIGHT_TYPES: Record<number, { name: string; size: number; divisor: number; signed: boolean }> = {
  ...LPP_TYPES,
  // Override/add Milesight-specific sensor IDs
  // Channel 3 = temperature (0x67), Channel 4 = humidity (0x68), etc.
};

function decodeCayenneLPP(base64Data: string): Record<string, number> | null {
  try {
    // Decode base64 to byte array
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const result: Record<string, number> = {};
    let pos = 0;

    while (pos < bytes.length - 1) {
      const channel = bytes[pos++];
      if (pos >= bytes.length) break;
      const typeId = bytes[pos++];

      const typeDef = LPP_TYPES[typeId];
      if (!typeDef) {
        // Unknown type — try to skip intelligently or break
        break;
      }
      if (pos + typeDef.size > bytes.length) break;

      const fieldName = `${typeDef.name}_${channel}`;

      if (typeId === 113) {
        // Accelerometer: 3x int16
        const x = toSigned16(bytes[pos] << 8 | bytes[pos + 1]) / typeDef.divisor;
        const y = toSigned16(bytes[pos + 2] << 8 | bytes[pos + 3]) / typeDef.divisor;
        const z = toSigned16(bytes[pos + 4] << 8 | bytes[pos + 5]) / typeDef.divisor;
        result[`accelerometer_x_${channel}`] = Math.round(x * 1000) / 1000;
        result[`accelerometer_y_${channel}`] = Math.round(y * 1000) / 1000;
        result[`accelerometer_z_${channel}`] = Math.round(z * 1000) / 1000;
        pos += 6;
        continue;
      }

      let rawValue = 0;
      for (let b = 0; b < typeDef.size; b++) {
        rawValue = (rawValue << 8) | bytes[pos + b];
      }
      pos += typeDef.size;

      if (typeDef.signed && typeDef.size === 2) rawValue = toSigned16(rawValue);
      else if (typeDef.signed && typeDef.size === 4) rawValue = toSigned32(rawValue);

      result[fieldName] = Math.round((rawValue / typeDef.divisor) * 100) / 100;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function toSigned16(val: number): number { return val > 0x7FFF ? val - 0x10000 : val; }
function toSigned32(val: number): number { return val > 0x7FFFFFFF ? val - 0x100000000 : val; }

// Milesight multi-sensor decoder (fPort 85) — proprietary TLV format
// Supports: AM308L, AM307, EM300, WS301, WS302, WS50x, VS121 and more
function decodeMilesightPayload(base64Data: string): Record<string, number> | null {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const result: Record<string, number> = {};
    let pos = 0;

    while (pos < bytes.length - 1) {
      const ch = bytes[pos++]; // channel
      if (pos >= bytes.length) break;
      const typeId = bytes[pos++]; // data type

      // ── 0xFF channel: Milesight device config/info responses ──
      if (ch === 0xFF) {
        // Config responses are not sensor data — skip them gracefully
        const configSizes: Record<number, number> = {
          0x01: 1, 0x09: 2, 0x0A: 2, 0x0B: 4, 0x0F: 1,
          0x11: 1, 0x14: 1, 0x15: 2, 0x16: 8, 0x17: 4,
          0x03: 2, 0x04: 2,
        };
        const skip = configSizes[typeId];
        if (skip !== undefined) { pos += skip; continue; }
        // Unknown 0xFF sub-type — can't determine size, stop parsing
        break;
      }

      // Milesight uses Cayenne-like encoding but with specific channel/type combos
      switch (typeId) {
        case 0x67: { // Temperature (int16 LE, /10)
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`temperature_${ch}`] = toSigned16LE(raw) / 10;
          pos += 2;
          break;
        }
        case 0x68: { // Humidity (uint8, /2)
          if (pos + 1 > bytes.length) return result;
          result[`relative_humidity_${ch}`] = bytes[pos] / 2;
          pos += 1;
          break;
        }
        case 0x73: { // Barometric Pressure (uint16 LE, /10)
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`barometric_pressure_${ch}`] = raw / 10;
          pos += 2;
          break;
        }
        case 0x65: { // Illuminance (uint16 LE)
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`illuminance_${ch}`] = raw;
          pos += 2;
          break;
        }
        case 0x00: { // Digital input — PIR / water leak / generic (uint8)
          if (pos + 1 > bytes.length) return result;
          result[`digital_input_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x01: { // Digital output / leak status (uint8)
          if (pos + 1 > bytes.length) return result;
          result[`digital_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x7D: { // CO2 / TVOC / PM2.5 / PM10 — uint16 LE
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          // 0xFFFF (65535) is a Milesight sensor error/warmup sentinel — skip it
          if (raw === 0xFFFF) { pos += 2; break; }
          // Channel mapping for AM308L:
          // Ch 7 = CO2, Ch 8 = TVOC, Ch 9 = PM2.5 (some FW), Ch 11 = PM2.5, Ch 12 = PM10
          if (ch === 7) result[`co2_${ch}`] = raw;
          else if (ch === 8) result[`tvoc_${ch}`] = raw;
          else if (ch === 9 || ch === 11) result[`pm2_5_${ch}`] = raw;
          else if (ch === 12) result[`pm10_${ch}`] = raw;
          else if (ch > 12) result[`pm10_${ch}`] = raw;
          else result[`concentration_${ch}`] = raw;
          pos += 2;
          break;
        }
        case 0x75: { // Battery (uint8, percentage)
          if (pos + 1 > bytes.length) return result;
          result[`battery`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0xCB: { // Milesight PIR (uint8)
          if (pos + 1 > bytes.length) return result;
          result[`pir_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x5B: { // WS302 Sound Level Sensor data (7 bytes)
          // Format: weighting(1) + Leq(2 LE) + Lmin(2 LE) + Lmax(2 LE), all dB values /10
          if (pos + 7 > bytes.length) return result;
          const weighting = bytes[pos]; // 0=A, 1=C, 2=Z
          const leq = (bytes[pos + 1] | (bytes[pos + 2] << 8)) / 10;
          const lmin = (bytes[pos + 3] | (bytes[pos + 4] << 8)) / 10;
          const lmax = (bytes[pos + 5] | (bytes[pos + 6] << 8)) / 10;
          result[`sound_level_leq`] = leq;
          result[`sound_level_lmin`] = lmin;
          result[`sound_level_lmax`] = lmax;
          result[`sound_level_weighting`] = weighting; // 0=A, 1=C, 2=Z
          pos += 7;
          break;
        }
        case 0xE7: { // WS30x Door/Window status (1 byte)
          if (pos + 1 > bytes.length) return result;
          result[`door_status_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x71: { // Water leak (uint8) — used by EM300-SLD, WS50x
          if (pos + 1 > bytes.length) return result;
          result[`water_leak`] = bytes[pos];
          pos += 1;
          break;
        }
        default: {
          // Unknown type — try common sizes or skip
          if (typeId < 0x10) { pos += 1; break; }
          if (typeId >= 0xD0 && typeId <= 0xDF) { pos += 2; break; } // Common 2-byte extended types
          // Give up — can't determine size
          return Object.keys(result).length > 0 ? result : null;
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function toSigned16LE(val: number): number { return val > 0x7FFF ? val - 0x10000 : val; }

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

  // ─── LOGIN (rate-limited proxy to Supabase Auth) ─────────────

  app.post("/make-server-4916a0b9/login", async (c: any) => {
    const ip = getClientIp(c);
    try {
      const body = await c.req.json();
      const email = typeof body.email === "string" ? body.email.trim().slice(0, 254).toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) return c.json({ error: "Email and password are required." }, 400);

      // Rate limit by IP (10/hour) and by email (10/hour) — KV-persisted across isolates
      const windowMs = 60 * 60 * 1000;
      const maxAttempts = 10;
      const rlIpKey = `rl:login:ip:${ip}`;
      const rlEmailKey = `rl:login:em:${email.replace(/[^a-z0-9@._-]/g, "")}`;
      try {
        const [ipData, emData] = await kv.mget([rlIpKey, rlEmailKey]) as [
          { count: number; resetAt: number } | null,
          { count: number; resetAt: number } | null
        ];
        const now = Date.now();
        if (ipData && now < ipData.resetAt && ipData.count >= maxAttempts) {
          return c.json({ error: "Too many login attempts. Please try again later." }, 429);
        }
        if (emData && now < emData.resetAt && emData.count >= maxAttempts) {
          return c.json({ error: "Too many login attempts for this account. Please try again later." }, 429);
        }
        const ipCount = (ipData && now < ipData.resetAt) ? ipData.count + 1 : 1;
        const ipReset = (ipData && now < ipData.resetAt) ? ipData.resetAt : now + windowMs;
        const emCount = (emData && now < emData.resetAt) ? emData.count + 1 : 1;
        const emReset = (emData && now < emData.resetAt) ? emData.resetAt : now + windowMs;
        await kv.mset([rlIpKey, rlEmailKey], [
          { count: ipCount, resetAt: ipReset },
          { count: emCount, resetAt: emReset },
        ]);
      } catch { /* KV failure — don't block login, fall through */ }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": supabaseAnonKey },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      return c.json(data, res.status);
    } catch (e) {
      console.log("Login proxy error:", errorMessage(e));
      return c.json({ error: "Login failed." }, 500);
    }
  });

  // ─── SIGNUP (Admin-only account creation) ─────────────

  app.post("/make-server-4916a0b9/signup", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
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
      if (!/[A-Z]/.test(password)) return c.json({ error: "Password must contain an uppercase letter." }, 400);
      if (!/[a-z]/.test(password)) return c.json({ error: "Password must contain a lowercase letter." }, 400);
      if (!/[0-9]/.test(password)) return c.json({ error: "Password must contain a number." }, 400);
      if (!/[^A-Za-z0-9]/.test(password)) return c.json({ error: "Password must contain a special character." }, 400);
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, user_metadata: { name: name || email.split("@")[0], accountType }, email_confirm: false,
      });
      if (error) {
        if (error.message?.includes("already been registered")) return c.json({ success: true, userId: "existing", accountType });
        console.log("Signup error:", error.message);
        return c.json({ error: "Signup failed." }, 400);
      }
      const userId = data.user.id;

      // Send confirmation email so the user can verify before signing in.
      // admin.createUser does NOT send emails — we trigger it via GoTrue resend API.
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
        await fetch(`${supabaseUrl}/auth/v1/resend`, {
          method: "POST",
          headers: { "apikey": anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "signup", email }),
        });
      } catch (emailErr) {
        console.log("Confirmation email send failed (non-fatal):", errorMessage(emailErr));
      }
      await kvSetWithRetry(`account_type_${userId}`, accountType);
      accountTypeCache.set(userId, accountType);
      const profileDefaults = accountType === "demo"
        ? { name: name || "Demo User", email, role: "Viewer", company: "FioTec Solutions", phone: "" }
        : accountType === "testing"
        ? { name: name || "Test Engineer", email, role: "Engineer", company: "FioTec Solutions", phone: "" }
        : { name: name || email.split("@")[0], email, role: "Admin", company: "FioTec Solutions", phone: "" };
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
    const userId = resolveTargetUser(auth, c);
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
    const userId = resolveTargetUser(auth, c);
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
      return c.json({ ...property, devices: assigned, waterSensors: `${s.online}/${s.total}`, deviceCount: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning });
    } catch (e) {
      console.log("Error fetching property:", errorMessage(e));
      return c.json({ error: "Failed to fetch property." }, 500);
    }
  });

  // ─── PROPERTY LIVE TELEMETRY (real sensor data for a specific property) ───
  app.get("/make-server-4916a0b9/properties/:id/telemetry", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const [properties, { devices }] = await Promise.all([
        getUserCollection(userId, "properties"),
        getEnrichedDevicesAndGateways(userId),
      ]);
      const property = properties.find((p: any) => p.id === id);
      if (!property) return c.json({ error: "Property not found." }, 404);
      const assigned = devices.filter((d: any) => d.building === property.name);

      // Read sensor data from KV
      const sdKey = `sensor_data_${userId}`;
      let sensorData: any[] = [];
      try { const raw = await cachedKvGet(sdKey); if (Array.isArray(raw)) sensorData = raw; } catch { /* empty */ }

      // Match sensor data to assigned devices by devEui or deviceName
      const deviceNames = new Set(assigned.map((d: any) => (d.name || "").toLowerCase()));
      const deviceEUIs = new Set<string>();
      for (const d of assigned) {
        // Use devEui (camelCase, as stored by auto-register / manual add)
        if (d.devEui) deviceEUIs.add(d.devEui.toLowerCase());
        if (d.serialNumber) deviceEUIs.add(d.serialNumber.toLowerCase());
      }

      // Determine if we should filter by device assignment or show all user data
      // If the property has assigned devices → only show data from those devices
      // If no devices assigned but user has sensor data → show all (user likely hasn't assigned yet)
      const hasAssignment = assigned.length > 0 && deviceEUIs.size > 0;

      // Get latest sensor entry per device — merge decoded data from recent entries
      // so that partial uplinks (e.g. AM308L sending only CO2) don't wipe out
      // earlier complete readings (temp, humidity, TVOC, PM2.5, etc.)
      const latestByDevice = new Map<string, any>();
      const mergedDecoded = new Map<string, Record<string, any>>();
      const MERGE_WINDOW = 30 * 60 * 1000; // merge data from last 30 minutes
      const STALE_CUTOFF = 60 * 60 * 1000; // ignore entries older than 1 hour
      const staleNow = Date.now();
      for (const entry of sensorData) {
        if (!entry.devEUI) continue;
        if (entry.eventType === "join" || entry.eventType === "ack") continue;
        // Skip stale data — device is offline if no uplink in the last hour
        if (staleNow - new Date(entry.receivedAt).getTime() > STALE_CUTOFF) continue;
        const eui = entry.devEUI.toLowerCase();
        const eName = (entry.deviceName || "").toLowerCase();

        // If we have specific device assignments, only include matching data
        if (hasAssignment) {
          const matchesDevice = deviceEUIs.has(eui) || deviceNames.has(eName);
          if (!matchesDevice) continue;
        }
        // If no assignments, include all user sensor data (they likely have one property)

        if (!latestByDevice.has(eui) || new Date(entry.receivedAt) > new Date(latestByDevice.get(eui).receivedAt)) {
          latestByDevice.set(eui, entry);
        }

        // Merge decoded data from entries within the merge window
        if (entry.decodedData && typeof entry.decodedData === "object") {
          const ts = new Date(entry.receivedAt).getTime();
          const latestTs = latestByDevice.has(eui) ? new Date(latestByDevice.get(eui).receivedAt).getTime() : ts;
          if (latestTs - ts <= MERGE_WINDOW) {
            if (!mergedDecoded.has(eui)) mergedDecoded.set(eui, {});
            const merged = mergedDecoded.get(eui)!;
            // Only fill in fields that aren't already set (latest values take priority)
            for (const [k, v] of Object.entries(entry.decodedData)) {
              if (!(k in merged)) merged[k] = v;
            }
          }
        }
      }

      // Apply merged decoded data back to latestByDevice entries
      for (const [eui, entry] of latestByDevice) {
        if (mergedDecoded.has(eui)) {
          entry.decodedData = { ...mergedDecoded.get(eui), ...(entry.decodedData || {}) };
        }
        // Strip known broken sensor fields (e.g. AM308L#2 PM sensors)
        stripBrokenFields(eui, entry.decodedData);
      }

      // Build aggregated environment from all latest readings
      const fv = (decoded: any, patterns: string[]): number | null => {
        if (!decoded || typeof decoded !== "object") return null;
        for (const k of Object.keys(decoded)) {
          const kl = k.toLowerCase();
          for (const p of patterns) {
            if (kl === p || kl.includes(p)) { const v = decoded[k]; return typeof v === "number" ? v : null; }
          }
        }
        return null;
      };

      // Aggregate environment data from all matched sensor readings
      let temperature: number | null = null;
      let humidity: number | null = null;
      let co2: number | null = null;
      let tvoc: number | null = null;
      let pm2_5: number | null = null;
      let pm10: number | null = null;
      let barometric_pressure: number | null = null;
      let illuminance: number | null = null;
      let pir: number | null = null;
      let sound_level_leq: number | null = null;
      let sound_level_lmin: number | null = null;
      let sound_level_lmax: number | null = null;
      let water_leak: number | null = null;
      let count = 0;
      const tempSum: number[] = [];
      const humSum: number[] = [];

      // Per-device readings map (devEUI -> decoded readings)
      const deviceReadings: Record<string, any> = {};

      for (const [eui, entry] of latestByDevice) {
        const decoded = entry.decodedData;
        if (!decoded) continue;
        count++;

        const t = fv(decoded, ["temperature", "temp"]);
        const h = fv(decoded, ["humidity", "humid"]);
        const c2 = fv(decoded, ["co2"]);
        const tv = fv(decoded, ["tvoc", "voc"]);
        const pm25 = fv(decoded, ["pm2_5", "pm25"]);
        const p10 = fv(decoded, ["pm10"]);
        const bp = fv(decoded, ["barometric_pressure", "pressure", "baro"]);
        const lux = fv(decoded, ["illuminance", "light", "lux"]);
        const motion = fv(decoded, ["pir", "occupancy", "motion"]);
        const sleq = fv(decoded, ["sound_level_leq", "leq"]);
        const slmin = fv(decoded, ["sound_level_lmin", "lmin"]);
        const slmax = fv(decoded, ["sound_level_lmax", "lmax"]);
        const wleak = fv(decoded, ["water_leak", "digital_input"]);
        if (t !== null) { temperature = t; tempSum.push(t); }
        if (h !== null) { humidity = h; humSum.push(h); }
        if (c2 !== null) co2 = c2;
        if (tv !== null) tvoc = tv;
        if (pm25 !== null) pm2_5 = pm25;
        if (p10 !== null) pm10 = p10;
        if (bp !== null) barometric_pressure = bp;
        if (lux !== null) illuminance = lux;
        if (motion !== null) pir = motion;
        if (sleq !== null) sound_level_leq = sleq;
        if (slmin !== null) sound_level_lmin = slmin;
        if (slmax !== null) sound_level_lmax = slmax;
        if (wleak !== null) water_leak = wleak;

        // Build per-device reading
        deviceReadings[eui] = {
          devEUI: eui,
          deviceName: entry.deviceName,
          receivedAt: entry.receivedAt,
          fCnt: entry.fCnt,
          rssi: entry.rssi,
          decoded: {
            ...(t !== null && { temperature: t }),
            ...(h !== null && { humidity: h }),
            ...(c2 !== null && { co2: c2 }),
            ...(tv !== null && { tvoc: tv }),
            ...(pm25 !== null && { pm2_5: pm25 }),
            ...(p10 !== null && { pm10: p10 }),
            ...(bp !== null && { barometric_pressure: bp }),
            ...(lux !== null && { illuminance: lux }),
            ...(motion !== null && { pir: motion }),
            ...(sleq !== null && { sound_level_leq: sleq }),
            ...(slmin !== null && { sound_level_lmin: slmin }),
            ...(slmax !== null && { sound_level_lmax: slmax }),
            ...(wleak !== null && { water_leak: wleak }),
          },
        };
      }

      // Average temperature/humidity if multiple sensors
      if (tempSum.length > 1) temperature = +(tempSum.reduce((a, b) => a + b, 0) / tempSum.length).toFixed(1);
      if (humSum.length > 1) humidity = Math.round(humSum.reduce((a, b) => a + b, 0) / humSum.length);

      // Build zone breakdown from assigned devices grouped by location
      const locationGroups = new Map<string, { devices: any[]; online: number; warning: number; offline: number }>();
      for (const d of assigned) {
        const loc = d.location || "Unspecified Zone";
        if (!locationGroups.has(loc)) locationGroups.set(loc, { devices: [], online: 0, warning: 0, offline: 0 });
        const g = locationGroups.get(loc)!;
        g.devices.push(d);
        if (d.status === "online") g.online++;
        else if (d.status === "warning") g.warning++;
        else g.offline++;
      }

      const zones = Array.from(locationGroups.entries()).map(([name, g], i) => ({
        id: `Z-${i + 1}`,
        name,
        status: g.warning > 0 || g.offline > 0 ? "warning" : "normal",
        sensors: g.devices.length,
        alerts: g.warning + g.offline,
        devices: g.devices.map((d: any) => d.name),
      }));

      // Build sensor list for the frontend (per-device filter in trend chart)
      const sensorList = Array.from(latestByDevice.entries()).map(([eui, entry]) => ({
        devEUI: eui,
        deviceName: entry.deviceName || eui,
      }));

      // Historical data points from sensor_data — today 00:00 to now (HK TZ, UTC+8)
      const nowMs = Date.now();
      const HK_OFFSET = 8 * 60 * 60 * 1000;
      const hkNow = new Date(nowMs + HK_OFFSET);
      const startOfDayUTC = Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate()) - HK_OFFSET;
      const historyPoints: any[] = [];
      for (const entry of sensorData) {
        if (!entry.decodedData || !entry.receivedAt) continue;
        if (!entry.devEUI) continue;
        if (entry.eventType === "join" || entry.eventType === "ack") continue;
        const eui = entry.devEUI.toLowerCase();
        const eName = (entry.deviceName || "").toLowerCase();
        // Filter by device assignment (same logic as environment section)
        if (hasAssignment) {
          const matchesDevice = deviceEUIs.has(eui) || deviceNames.has(eName);
          if (!matchesDevice) continue;
        }
        const ts = new Date(entry.receivedAt).getTime();
        if (ts < startOfDayUTC || ts > nowMs) continue;
        const d = entry.decodedData;
        const minutesSinceMidnight = Math.max(0, Math.min(1440, Math.round((ts - startOfDayUTC) / 60000)));
        // Strip broken sensor fields from history data too
        const histDecoded = d ? { ...d } : {};
        stripBrokenFields(eui, histDecoded);
        historyPoints.push({
          _m: minutesSinceMidnight,
          devEUI: entry.devEUI,
          deviceName: entry.deviceName || entry.devEUI,
          temperature: fv(histDecoded, ["temperature", "temp"]),
          humidity: fv(histDecoded, ["humidity", "humid"]),
          co2: fv(histDecoded, ["co2"]),
          tvoc: fv(histDecoded, ["tvoc", "voc"]),
          pm2_5: fv(histDecoded, ["pm2_5", "pm25"]),
          pm10: fv(histDecoded, ["pm10"]),
          pressure: fv(d, ["barometric_pressure", "pressure", "baro"]),
          illuminance: fv(d, ["illuminance", "light", "lux"]),
          sound_level_leq: fv(d, ["sound_level_leq", "leq"]),
          sound_level_lmin: fv(d, ["sound_level_lmin", "lmin"]),
          sound_level_lmax: fv(d, ["sound_level_lmax", "lmax"]),
          water_leak: fv(d, ["water_leak", "digital_input"]),
        });
      }
      // Per-device fair sampling — ensure every sensor gets adequate representation
      // Group history points by device, sample each independently, then merge
      const byDeviceHist = new Map<string, any[]>();
      for (const p of historyPoints) {
        const eui = (p.devEUI || "").toLowerCase();
        if (!byDeviceHist.has(eui)) byDeviceHist.set(eui, []);
        byDeviceHist.get(eui)!.push(p);
      }
      const maxPerDevice = 48;
      const sampled: any[] = [];
      for (const [, pts] of byDeviceHist) {
        pts.sort((a: any, b: any) => a._m - b._m);
        if (pts.length > maxPerDevice) {
          const step = Math.ceil(pts.length / maxPerDevice);
          for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
        } else {
          sampled.push(...pts);
        }
      }
      sampled.sort((a, b) => a._m - b._m);

      return c.json({
        source: count > 0 ? "live" : "none",
        sensorCount: count,
        environment: {
          temperature, humidity, co2, tvoc, pm2_5, pm10,
          barometric_pressure, illuminance, pir,
          sound_level_leq, sound_level_lmin, sound_level_lmax, water_leak,
        },
        zones,
        sensorList,
        deviceReadings,
        history: sampled.map((p: any) => ({
          _m: p._m,
          devEUI: p.devEUI,
          deviceName: p.deviceName,
          time: `${String(Math.floor(p._m / 60)).padStart(2, "0")}:${String(p._m % 60).padStart(2, "0")}`,
          temperature: p.temperature,
          humidity: p.humidity,
          co2: p.co2,
          tvoc: p.tvoc,
          pm2_5: p.pm2_5,
          pm10: p.pm10,
          pressure: p.pressure,
          illuminance: p.illuminance,
          sound_level_leq: p.sound_level_leq,
          sound_level_lmin: p.sound_level_lmin,
          sound_level_lmax: p.sound_level_lmax,
          water_leak: p.water_leak,
        })),
      });
    } catch (e) {
      console.log("Error fetching property telemetry:", errorMessage(e));
      return c.json({ error: "Failed to fetch property telemetry." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/properties", async (c: any) => {
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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

  // Update property photo — available to ALL authenticated users (not admin-only)
  app.put("/make-server-4916a0b9/properties/:id/photo", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const id = sanitizeString(c.req.param("id"), 50);
      const body = await c.req.json();
      const image = sanitizeUrl(body.image);
      if (!image) return c.json({ error: "Valid image URL is required." }, 400);
      const key = uk(userId, "properties");
      const properties = await getUserCollection(userId, "properties");
      const index = properties.findIndex((p: any) => p.id === id);
      if (index === -1) return c.json({ error: "Property not found." }, 404);
      properties[index].image = image;
      await cachedKvSet(key, properties);
      return c.json(properties[index]);
    } catch (e) {
      console.log("Error updating property photo:", errorMessage(e));
      return c.json({ error: "Failed to update property photo." }, 500);
    }
  });

  app.delete("/make-server-4916a0b9/properties/:id", async (c: any) => {
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
      const userId = resolveTargetUser(auth, c);
      const { devices } = await getEnrichedDevicesAndGateways(userId);
      return c.json(devices);
    } catch (e) {
      console.log("Error fetching devices:", errorMessage(e));
      return c.json({ error: "Failed to fetch devices." }, 500);
    }
  });

  app.post("/make-server-4916a0b9/devices", async (c: any) => {
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const body = await c.req.json();
      const name = sanitizeString(body.name, 200);
      const type = sanitizeString(body.type, 50);
      if (!name || !type) return c.json({ error: "Device name and type are required." }, 400);
      const key = uk(userId, "devices");
      const devices = await getUserCollection(userId, "devices");
      if (devices.length >= 500) return c.json({ error: "Maximum device limit (500) reached." }, 400);
      const newDevice: any = {
        id: `D${Date.now()}`, name, type,
        building: sanitizeString(body.building, 200) || "Unassigned",
        location: sanitizeString(body.location, 200) || "Not specified",
        lastUpdate: "Just now", battery: sanitizeNumber(body.battery, 0, 100, 100),
        status: sanitizeEnum(body.status, ["online", "offline", "warning"], "online"),
        gateway: sanitizeString(body.gateway, 50) || "Unassigned",
      };
      // Optional LoRaWAN / IoT fields
      if (body.model) newDevice.model = sanitizeString(body.model, 100);
      if (body.manufacturer) newDevice.manufacturer = sanitizeString(body.manufacturer, 100);
      if (body.serialNumber) newDevice.serialNumber = sanitizeString(body.serialNumber, 100);
      if (body.devEui) newDevice.devEui = sanitizeString(body.devEui, 24);
      if (body.appKey) newDevice.appKey = sanitizeString(body.appKey, 64);
      if (body.gatewayId) newDevice.gatewayId = sanitizeString(body.gatewayId, 50);
      if (Array.isArray(body.capabilities)) newDevice.capabilities = body.capabilities.slice(0, 30).map((c: string) => sanitizeString(c, 50));
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
    const userId = resolveTargetUser(auth, c);
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
      // Optional LoRaWAN / IoT fields
      if (body.model !== undefined) updates.model = sanitizeString(body.model, 100);
      if (body.manufacturer !== undefined) updates.manufacturer = sanitizeString(body.manufacturer, 100);
      if (body.serialNumber !== undefined) updates.serialNumber = sanitizeString(body.serialNumber, 100);
      if (body.devEui !== undefined) updates.devEui = sanitizeString(body.devEui, 24);
      if (body.appKey !== undefined) updates.appKey = sanitizeString(body.appKey, 64);
      if (body.gatewayId !== undefined) updates.gatewayId = sanitizeString(body.gatewayId, 50);
      if (Array.isArray(body.capabilities)) updates.capabilities = body.capabilities.slice(0, 30).map((c: string) => sanitizeString(c, 50));
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
      const userId = resolveTargetUser(auth, c);
      const settings = await getUserSettings(userId);
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
    const userId = resolveTargetUser(auth, c);
    try {
      const body = await c.req.json();
      // Security: strip immutable fields that users must not self-modify
      if (body?.profile) {
        delete body.profile.role;   // role is admin-assigned only
        delete body.profile.email;  // email is managed by Supabase Auth
      }
      const current = await getUserSettings(userId);
      const updated = safeMerge(current, body, 0, SETTINGS_ALLOWED_KEYS);
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
      await ensureBucket();
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
      // Signed URL valid for 7 days (not 365 days) — reduces leak exposure window
      const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(fileName, 7 * 24 * 3600);
      if (signedError) { console.log("Signed URL error:", signedError.message); return c.json({ error: "Failed to create URL." }, 500); }
      return c.json({ url: signedData.signedUrl, path: uploadData.path, fileName });
    } catch (e) {
      console.log("Upload error:", errorMessage(e));
      return c.json({ error: "Upload failed." }, 500);
    }
  });

  // ─── DATA MANAGEMENT ───────────────────────────────────

  app.post("/make-server-4916a0b9/reset-data", async (c: any) => {
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
        ? { ...DEFAULT_SETTINGS.profile, name: "Demo User", email: "demo@example.com", role: "Viewer" }
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
    const userId = resolveTargetUser(auth, c);
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
      const userId = resolveTargetUser(auth, c);
      const alarms = await getUserCollection(userId, "alarms");
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
    const userId = resolveTargetUser(auth, c);
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
    const userId = resolveTargetUser(auth, c);
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

  // Bulk resolve all pending alarms
  app.post("/make-server-4916a0b9/alarms/bulk-resolve", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const key = uk(userId, "alarms");
      const alarms = await getUserCollection(userId, "alarms");
      let count = 0;
      for (const a of alarms) {
        if (a.status === "pending") { a.status = "resolved"; count++; }
      }
      if (count > 0) await cachedKvSet(key, alarms);
      return c.json({ success: true, resolved: count });
    } catch (e) {
      console.log("Error bulk resolving alarms:", errorMessage(e));
      return c.json({ error: "Failed to bulk resolve alarms." }, 500);
    }
  });

  // Bulk dismiss (delete) all pending alarms
  app.post("/make-server-4916a0b9/alarms/bulk-dismiss", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const key = uk(userId, "alarms");
      const alarms = await getUserCollection(userId, "alarms");
      const kept = alarms.filter((a: any) => a.status !== "pending");
      const removed = alarms.length - kept.length;
      await cachedKvSet(key, kept);
      return c.json({ success: true, dismissed: removed });
    } catch (e) {
      console.log("Error bulk dismissing alarms:", errorMessage(e));
      return c.json({ error: "Failed to bulk dismiss alarms." }, 500);
    }
  });

  // ─── DASHBOARD BUNDLE (single request for all Dashboard data) ──────

  app.get("/make-server-4916a0b9/dashboard-bundle", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      // Parallel fetch of ALL data the Dashboard needs in one roundtrip
      const [propertiesRaw, alarmsRaw, { devices, gateways }, accountType, layoutRaw, settingsRaw] = await Promise.all([
        getUserCollection(userId, "properties"),
        getUserCollection(userId, "alarms"),
        getEnrichedDevicesAndGateways(userId),
        getAccountType(userId),
        cachedKvGet(uk(auth.userId, "widget_layout")).catch(() => null),
        cachedKvGet(uk(auth.userId, "settings")).catch(() => null),
      ]);

      // ── Properties (enriched with device counts) ──
      const properties = propertiesRaw.map((p: any) => {
        const assigned = devices.filter((d: any) => d.building === p.name);
        const s = countStatuses(assigned);
        return { ...p, waterSensors: `${s.online}/${s.total}`, deviceCount: s.total, onlineDevices: s.online, offlineDevices: s.offline, warningDevices: s.warning };
      });

      // ── Stats ──
      const ds = countStatuses(devices);
      const onlinePercent = ds.total > 0 ? Math.round((ds.online / ds.total) * 100) : 0;
      const pending = alarmsRaw.filter((a: any) => a.status === "pending");
      const waterLeaks = pending.filter((a: any) => a.type?.includes("Water") || a.type?.includes("Leak")).length;
      const leakDevices = devices.filter((d: any) => d.type === "Leakage");
      // Only count devices actively reporting a leak (status === "warning"), NOT offline devices
      const leakWarnings = leakDevices.filter((d: any) => d.status === "warning").length;
      const stats = {
        properties: { total: propertiesRaw.length, images: propertiesRaw.slice(0, 4).map((p: any) => p.image) },
        devices: { ...ds, onlinePercent },
        alarms: { totalPending: pending.length, highSeverity: pending.filter((a: any) => a.severity === "high").length, waterLeaks, systemWarnings: pending.length - waterLeaks },
        water: { status: leakWarnings > 0 ? "Warning" : "Safe", leakWarnings },
      };

      // ── Telemetry ──
      let telemetry: any = null;
      if (accountType !== "demo") {
        let sensorData: any[] = [];
        try { const raw = await cachedKvGet(`sensor_data_${userId}`); if (Array.isArray(raw)) sensorData = raw; } catch {}
        if (sensorData.length > 0) telemetry = buildRealTelemetry(sensorData, propertiesRaw, devices);
      }

      // ── Alarm chart data (last 7 days) ──
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const now = new Date();
      const days: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        days.push({ name: dayNames[d.getDay()], date: d.toISOString().slice(0, 10), water: 0, smoke: 0, temperature: 0, deviceOffline: 0 });
      }
      for (const alarm of alarmsRaw) {
        try {
          const parsed = new Date(alarm.time);
          if (isNaN(parsed.getTime())) continue;
          const dateStr = parsed.toISOString().slice(0, 10);
          const day = days.find((d: any) => d.date === dateStr);
          if (!day) continue;
          const t = (alarm.type || "").toLowerCase();
          if (t.includes("water") || t.includes("leak")) day.water++;
          else if (t.includes("smoke") || t.includes("fire")) day.smoke++;
          else if (t.includes("temperature") || t.includes("humidity")) day.temperature++;
          else day.deviceOffline++;
        } catch { continue; }
      }
      const alarmChartData = days.map((d) => ({ name: d.name, water: d.water, smoke: d.smoke, temperature: d.temperature, deviceOffline: d.deviceOffline }));

      // ── Widget layout ──
      const defaultLayout = { order: ["environmental", "water", "bms", "alerts", "health"], active: ["environmental", "alerts", "health"] };
      const widgetLayout = layoutRaw || defaultLayout;

      // ── Settings ──
      const settings = settingsRaw || {};

      return c.json({ properties, stats, telemetry, alarmChartData, widgetLayout, settings, generatedAt: new Date().toISOString() });
    } catch (e) {
      console.log("Error generating dashboard bundle:", errorMessage(e));
      return c.json({ error: "Failed to generate dashboard bundle." }, 500);
    }
  });

  // ─── STATS ─────────────────────────────────────────────

  app.get("/make-server-4916a0b9/stats", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
      // Only count devices actively reporting a leak (status === "warning"), NOT offline devices
      const leakWarnings = leakDevices.filter((d: any) => d.status === "warning").length;
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
    const userId = resolveTargetUser(auth, c);
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
        // No sensor data — return empty result (no fake/simulated data for real accounts)
        return c.json({ airQuality: [], waterZones: [], bmsItems: [], generatedAt: new Date().toISOString(), source: "none" });
      }

      // Demo account — return empty with simulated source tag
      return c.json({ airQuality: [], waterZones: [], bmsItems: [], generatedAt: new Date().toISOString(), source: "simulated" });
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
      const userId = resolveTargetUser(auth, c);
      const alarms = await getUserCollection(userId, "alarms");
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
      const userId = resolveTargetUser(auth, c);
      const { devices, gateways } = await getEnrichedDevicesAndGateways(userId);
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
      const userId = resolveTargetUser(auth, c);
      const { devices, gateways } = await getEnrichedDevicesAndGateways(userId);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const userId = resolveTargetUser(auth, c);
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
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const auth = await requireAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
    const userId = resolveTargetUser(auth, c);
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
      const webhookBaseUrl = `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook`;
      // Legacy URL (token in query param, backward compat)
      const webhookUrl = token ? `${webhookBaseUrl}?token=${token}` : null;
      // Recommended URL (clean URL, token via X-Webhook-Token header)
      const webhookUrlClean = token ? webhookBaseUrl : null;
      let lastReceived: string | null = null;
      try {
        const sensorData = await cachedKvGet(`sensor_data_${userId}`);
        if (Array.isArray(sensorData) && sensorData.length > 0) lastReceived = sensorData[0].receivedAt || null;
      } catch { /* ignore */ }
      let hasHmac = false;
      try { hasHmac = !!(await kvGetWithRetry(`webhook_hmac_${userId}`)); } catch { /* ignore */ }
      return c.json({ token: token || null, webhookUrl, webhookUrlClean, hasToken: !!token, lastReceived, hasHmac });
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
      const webhookBaseUrl = `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook`;
      const webhookUrl = `${webhookBaseUrl}?token=${newToken}`;
      const webhookUrlClean = webhookBaseUrl;
      console.log(`Webhook token generated for user ${userId}`);
      return c.json({ token: newToken, webhookUrl, webhookUrlClean, hasToken: true, lastReceived: null });
    } catch (e) {
      console.log("Error generating webhook token:", errorMessage(e));
      console.log("Webhook token error:", errorMessage(e));
      return c.json({ error: "Failed to generate webhook token." }, 500);
    }
  });

  // ─── WEBHOOK HMAC SECRET (optional payload signing) ─────
  app.put("/make-server-4916a0b9/webhook-config", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    try {
      const body = await c.req.json();
      const hmacSecret = sanitizeString(body.hmacSecret, 128);
      if (hmacSecret) {
        await kvSetWithRetry(`webhook_hmac_${userId}`, hmacSecret);
      } else {
        // Clear HMAC secret
        try { await kv.del(`webhook_hmac_${userId}`); } catch { /* ignore */ }
      }
      return c.json({ success: true, hasHmac: !!hmacSecret });
    } catch (e) {
      console.log("Error updating webhook HMAC:", errorMessage(e));
      return c.json({ error: "Failed to update HMAC secret." }, 500);
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
      const webhookUrl = `${baseUrl}/functions/v1/make-server-4916a0b9/telemetry-webhook`;
      const testPayload = {
        devEUI: "TEST000000000000", deviceName: "FioTec Test Ping", applicationName: "FioTec Webhook Test",
        fPort: 0, fCnt: 0, data: "",
        object: { _test: true, message: "Webhook connectivity test from FioTec dashboard" },
        rxInfo: [{ gatewayID: "TEST_GATEWAY", rssi: -50, loRaSNR: 10.0 }],
        txInfo: { frequency: 868100000 }, time: new Date().toISOString(),
      };
      const startMs = Date.now();
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Token": token, Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
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

  // ─── GATEWAY CONNECTIVITY TEST (PUBLIC) ─────────────────

  app.get("/make-server-4916a0b9/telemetry-webhook", async (c: any) => {
    const ip = getClientIp(c);
    if (!rateLimit(ip + ":webhook-ping", 30, 60000)) return c.json({ error: "Rate limited." }, 429);
    try {
      const token = c.req.header("X-Webhook-Token") || c.req.query("token") || "";
      if (!token || token.length < 10) return c.json({ status: "error", message: "Missing or invalid webhook token." }, 401);
      const userId = await kvGetWithRetry(`webhook_lookup_${token}`);
      if (!userId) return c.json({ status: "error", message: "Invalid webhook token." }, 401);
      const storedToken = await kvGetWithRetry(`webhook_token_${userId}`);
      if (storedToken !== token) return c.json({ status: "error", message: "Webhook token revoked." }, 401);

      // Token valid — record this ping as a gateway heartbeat
      const gateways = await getUserCollection(userId, "gateways");
      const now = new Date().toISOString();
      let matchedGw: any = null;
      // Prefer matching by query param ?gw=<id>, then by model/name containing "ug65" or "milesight"
      const gwHint = (c.req.query("gw") || "").toLowerCase();
      for (const gw of gateways) {
        const id = (gw.id || "").toLowerCase();
        const model = (gw.model || "").toLowerCase();
        const name = (gw.name || "").toLowerCase();
        if (gwHint && (id === gwHint || name.includes(gwHint))) { matchedGw = gw; break; }
        if (!gwHint && (model.includes("ug65") || model.includes("milesight") || name.includes("milesight"))) { matchedGw = gw; break; }
      }
      // Fallback: pick first LoRaWAN gateway if no specific match
      if (!matchedGw && !gwHint) {
        for (const gw of gateways) {
          if ((gw.protocol || "").toLowerCase().includes("lorawan")) { matchedGw = gw; break; }
        }
      }
      if (matchedGw) {
        matchedGw.lastSeen = now;
        matchedGw.status = "online";
        await cachedKvSet(uk(userId, "gateways"), gateways);
        invalidateKvCache(uk(userId, "gateways"));
      }

      return c.json({
        status: "ok",
        message: "FioTec webhook endpoint is reachable. Your gateway can connect to the platform.",
        timestamp: now,
        gateway: matchedGw ? { id: matchedGw.id, name: matchedGw.name, status: "online" } : null,
        hint: "POST sensor uplink data to this same URL to start receiving telemetry.",
      });
    } catch (e) {
      return c.json({ status: "error", message: "Ping failed: " + errorMessage(e) }, 500);
    }
  });

  // ─── WEBHOOK DEBUG LOG ────────────────────────────────
  // In-memory circular buffer for recent webhook requests (max 50)
  const WEBHOOK_DEBUG_LOG: any[] = [];
  const MAX_DEBUG_LOG = 50;

  // GET debug log — requires admin auth
  app.get("/make-server-4916a0b9/webhook-debug", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    if (!MASTER_EMAILS.has(((auth as any).email || "").toLowerCase()) || auth.userId !== MASTER_USER_ID) return c.json({ error: "Admin only." }, 403);
    // Also check persisted debug log from KV
    let persistedLog: any[] = [];
    try { const stored = await kvGetWithRetry("webhook_debug_log"); if (Array.isArray(stored)) persistedLog = stored; } catch {}
    return c.json({ memoryLog: WEBHOOK_DEBUG_LOG, persistedLog, total: persistedLog.length });
  });

  // ─── TELEMETRY WEBHOOK (PUBLIC) ────────────────────────

  app.post("/make-server-4916a0b9/telemetry-webhook", async (c: any) => {
    const ip = getClientIp(c);
    if (!rateLimit(ip + ":webhook", 60, 60000)) return c.json({ error: "Rate limited." }, 429);

    // Debug: capture raw request info
    let rawBody: any = null;
    try { rawBody = await c.req.json(); } catch { rawBody = "PARSE_ERROR"; }
    // Debug: redact sensitive fields, keep only structural info
    const debugEntry = {
      time: new Date().toISOString(),
      method: "POST",
      tokenVia: c.req.header("X-Webhook-Token") ? "header" : (c.req.query("token") ? "query" : "none"),
      bodyKeys: rawBody && typeof rawBody === "object" ? Object.keys(rawBody) : typeof rawBody,
      devEUI: rawBody?.devEUI || rawBody?.devEui || rawBody?.dev_eui || "N/A",
      eventType: rawBody?.data ? "uplink" : (rawBody?.devAddr ? "join" : "other"),
    };
    WEBHOOK_DEBUG_LOG.unshift(debugEntry);
    if (WEBHOOK_DEBUG_LOG.length > MAX_DEBUG_LOG) WEBHOOK_DEBUG_LOG.length = MAX_DEBUG_LOG;
    // Persist to KV (async, non-blocking)
    (async () => {
      try {
        let log: any[] = [];
        try { const stored = await kvGetWithRetry("webhook_debug_log"); if (Array.isArray(stored)) log = stored; } catch {}
        log.unshift(debugEntry);
        if (log.length > 100) log = log.slice(0, 100);
        await kvSetWithRetry("webhook_debug_log", log);
      } catch { /* best effort */ }
    })();

    // Re-parse body (since we already consumed it)
    const body = rawBody;
    if (!body || typeof body !== "object") return c.json({ error: "Invalid JSON body." }, 400);

    try {
      // Prefer X-Webhook-Token header; fall back to query param for backward compat
      const token = c.req.header("X-Webhook-Token") || c.req.query("token") || "";
      if (!token || token.length < 10) return c.json({ error: "Missing or invalid webhook token." }, 401);
      const tokenOwner = await kvGetWithRetry(`webhook_lookup_${token}`);
      if (!tokenOwner) return c.json({ error: "Invalid webhook token." }, 401);
      const storedToken = await kvGetWithRetry(`webhook_token_${tokenOwner}`);
      if (storedToken !== token) return c.json({ error: "Webhook token revoked." }, 401);

      // ── Optional HMAC payload verification (ChirpStack / Milesight gateways can sign payloads) ──
      const hmacHeader = c.req.header("X-Signature-SHA256") || c.req.header("X-Signature") || "";
      if (hmacHeader) {
        // Retrieve per-user HMAC secret (set via webhook-config PUT)
        const hmacSecret = await kvGetWithRetry(`webhook_hmac_${tokenOwner}`).catch(() => null);
        if (hmacSecret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey("raw", encoder.encode(hmacSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(body)));
          const expected = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
          const provided = hmacHeader.replace(/^sha256=/, "").toLowerCase();
          if (expected !== provided) {
            console.log(`[HMAC] Signature mismatch for user ${tokenOwner}`);
            return c.json({ error: "HMAC signature verification failed." }, 401);
          }
          console.log(`[HMAC] Signature verified for user ${tokenOwner}`);
        }
      }

      // Write data to the token owner's own KV namespace (no centralized master write)
      const userId = tokenOwner;

      // body already parsed above in debug section
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
      let decodedData = (body.object && typeof body.object === "object" && !Array.isArray(body.object)) ? body.object : null;

      // If no decoded data from gateway, try decoding the raw payload ourselves
      if (!decodedData && rawData) {
        // Try Milesight proprietary format first (fPort 85 is common for Milesight sensors)
        const milesightDecoded = decodeMilesightPayload(rawData);
        if (milesightDecoded && Object.keys(milesightDecoded).length >= 1) {
          decodedData = milesightDecoded;
          console.log(`[Decoder] Milesight decode OK: ${Object.keys(milesightDecoded).length} fields from ${devEUI || "unknown"}`);
        } else {
          // Fallback: try standard Cayenne LPP
          const cayenneDecoded = decodeCayenneLPP(rawData);
          if (cayenneDecoded && Object.keys(cayenneDecoded).length >= 1) {
            decodedData = cayenneDecoded;
            console.log(`[Decoder] Cayenne LPP decode OK: ${Object.keys(cayenneDecoded).length} fields from ${devEUI || "unknown"}`);
          } else {
            console.log(`[Decoder] Could not decode payload from ${devEUI || "unknown"}: ${rawData.slice(0, 40)}...`);
          }
        }
      }

      const uplinkTime = sanitizeString(body.time || body.timestamp || new Date().toISOString(), 50);

      let gatewayEUI = "", rssi = -999, snr = 0, frequency = 0;
      if (Array.isArray(body.rxInfo) && body.rxInfo.length > 0) {
        const rx = body.rxInfo[0];
        gatewayEUI = sanitizeString(rx.gatewayID || rx.gateway_id || rx.gatewayId || rx.mac || "", 24);
        rssi = typeof rx.rssi === "number" ? rx.rssi : -999;
        snr = typeof rx.loRaSNR === "number" ? rx.loRaSNR : (typeof rx.snr === "number" ? rx.snr : 0);
      }
      if (body.txInfo && typeof body.txInfo === "object") {
        frequency = typeof body.txInfo.frequency === "number" ? body.txInfo.frequency : 0;
        if (!frequency && body.txInfo.dataRate && typeof body.txInfo.dataRate.frequency === "number") frequency = body.txInfo.dataRate.frequency;
      }

      const entry: any = {
        id: `SD${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        eventType, devEUI, deviceName, applicationName, gatewayEUI, rssi,
        snr: Math.round(snr * 10) / 10, frequency, fPort, fCnt, rawData, decodedData,
        receivedAt: new Date().toISOString(), uplinkTime,
      };
      if (isErrorEvent) entry.errorMessage = sanitizeString(body.error || body.errorMsg || "Unknown error", 500);

      // Only store sensor data for entries with a valid devEUI (skip Unknown Device / empty EUI)
      if (devEUI) {
        const sdKey = `sensor_data_${userId}`;
        let sensorData: any[] = [];
        try { const existing = await kvGetWithRetry(sdKey); if (Array.isArray(existing)) sensorData = existing; } catch { /* start fresh */ }
        sensorData.unshift(entry);
        // Prune entries older than 3 days to save KV storage
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        const pruneCutoff = Date.now() - THREE_DAYS;
        sensorData = sensorData.filter((e: any) => new Date(e.receivedAt).getTime() > pruneCutoff);
        if (sensorData.length > 1000) sensorData = sensorData.slice(0, 1000);
        await kvSetWithRetry(sdKey, sensorData);
      } else {
        console.log(`[Webhook] Skipping sensor_data storage for entry without devEUI (deviceName: ${deviceName})`);
      }

      // Auto-heartbeat gateway — multi-strategy matching:
      // 1) Match by devEui / macAddress (original)
      // 2) If no match, match via the device's assigned gateway field
      // 3) Auto-link: if gateway has no devEui yet, save the webhook gatewayEUI for future matching
      {
        const gwKey = uk(userId, "gateways");
        const gateways = await getUserCollection(userId, "gateways");
        let gwIdx = -1;
        const nowIso = new Date().toISOString();

        // Strategy 1: match by devEui / macAddress (works if user filled those fields)
        if (gatewayEUI) {
          gwIdx = gateways.findIndex((gw: any) =>
            (gw.devEui || "").toLowerCase() === gatewayEUI.toLowerCase() ||
            (gw.macAddress || "").replace(/:/g, "").toLowerCase() === gatewayEUI.toLowerCase()
          );
        }

        // Strategy 2: match via the device's assigned gateway
        // When device data arrives through the webhook, the gateway is clearly working
        if (gwIdx === -1 && devEUI) {
          const devices = await getUserCollection(userId, "devices");
          const dev = devices.find((d: any) => (d.devEui || "").toLowerCase() === devEUI.toLowerCase());
          if (dev && dev.gateway && dev.gateway !== "Unassigned" && dev.gateway !== "Unknown") {
            gwIdx = gateways.findIndex((gw: any) => gw.id === dev.gateway);
          }
          // Fallback: if only 1 non-demo gateway exists, it must be the one relaying data
          if (gwIdx === -1 && gateways.length === 1) {
            gwIdx = 0;
          }
        }

        if (gwIdx !== -1) {
          gateways[gwIdx].lastSeen = nowIso;
          if (rssi > -999) gateways[gwIdx].signal = Math.max(0, Math.min(100, 2 * (rssi + 100)));
          // Strategy 3: auto-link gateway EUI for future direct matching
          if (gatewayEUI && !gateways[gwIdx].devEui) {
            gateways[gwIdx].devEui = gatewayEUI;
            console.log(`[GW Auto-Link] Saved gatewayEUI ${gatewayEUI} to gateway ${gateways[gwIdx].id} (${gateways[gwIdx].name})`);
          }
          await cachedKvSet(gwKey, gateways);
          console.log(`[GW Heartbeat] Updated gateway ${gateways[gwIdx].id} lastSeen via webhook uplink`);
        }
      }

      // Auto-heartbeat device (update lastSeen, signal, auto-register if missing)
      if (devEUI) {
        const devKey = uk(userId, "devices");
        const devices = await getUserCollection(userId, "devices");
        const devIdx = devices.findIndex((d: any) =>
          (d.devEui || "").toLowerCase() === devEUI.toLowerCase()
        );
        if (devIdx !== -1) {
          devices[devIdx].lastSeen = new Date().toISOString();
          devices[devIdx].lastUpdate = new Date().toISOString();
          devices[devIdx].status = "online";
          if (rssi > -999) devices[devIdx].signal = Math.max(0, Math.min(100, 2 * (rssi + 100)));
          // Enrich with manufacturer/model if not set
          if (!devices[devIdx].manufacturer && devEUI.toUpperCase().startsWith("24E124")) {
            devices[devIdx].manufacturer = "Milesight";
          }
          if (decodedData && typeof decodedData.battery === "number") {
            devices[devIdx].battery = decodedData.battery;
          }
          // Re-classify generic "LoRaWAN Sensor" devices on subsequent uplinks
          if (devices[devIdx].type === "LoRaWAN Sensor") {
            const nUp = (deviceName || "").toUpperCase();
            if (nUp.includes("AM308") || nUp.includes("AM-308")) {
              devices[devIdx].type = "Environment Sensor"; devices[devIdx].model = "AM308L";
              devices[devIdx].capabilities = ["temperature", "humidity", "co2", "tvoc", "barometric_pressure", "illuminance", "pir", "pm2_5", "pm10", "battery"];
            } else if (nUp.includes("AM307")) {
              devices[devIdx].type = "Environment Sensor"; devices[devIdx].model = "AM307";
              devices[devIdx].capabilities = ["temperature", "humidity", "co2", "tvoc", "barometric_pressure", "illuminance", "pir", "battery"];
            } else if (nUp.includes("ENVIRONMENT MONITORING") || nUp.includes("WATER LEAK") || nUp.includes("WS50") || nUp.includes("WS52")) {
              devices[devIdx].type = "Water Leakage Sensor"; devices[devIdx].model = "EM300-SLD";
              devices[devIdx].capabilities = ["water_leak", "temperature", "humidity", "battery"];
            } else if (nUp.includes("WS302") || nUp.includes("SOUND LEVEL")) {
              devices[devIdx].type = "Sound Level Sensor"; devices[devIdx].model = "WS302";
              devices[devIdx].capabilities = ["sound_level", "battery"];
            } else if (nUp.includes("WS301") || (nUp.includes("WS30") && !nUp.includes("WS302"))) {
              devices[devIdx].type = "Door/Window Sensor"; devices[devIdx].model = "WS301";
              devices[devIdx].capabilities = ["door_status", "battery"];
            } else if (nUp.includes("VS121")) {
              devices[devIdx].type = "People Counter"; devices[devIdx].model = "VS121";
              devices[devIdx].capabilities = ["people_count", "battery"];
            }
          }
          await cachedKvSet(devKey, devices);
        } else {
          // Auto-register new LoRaWAN device with smart detection
          const isMilesight = devEUI.toUpperCase().startsWith("24E124");
          // Infer model from device name or DevEUI
          let inferredModel = "";
          let inferredManufacturer = isMilesight ? "Milesight" : "";
          let inferredType = "LoRaWAN Sensor";
          let inferredCapabilities: string[] = [];
          const nameUpper = (deviceName || "").toUpperCase();
          if (isMilesight || nameUpper.includes("AM308")) {
            if (nameUpper.includes("AM308") || nameUpper.includes("AM-308")) {
              inferredModel = "AM308L";
              inferredCapabilities = ["temperature", "humidity", "co2", "tvoc", "barometric_pressure", "illuminance", "pir", "pm2_5", "pm10", "battery"];
              inferredType = "Environment Sensor";
            } else if (nameUpper.includes("AM307")) {
              inferredModel = "AM307";
              inferredCapabilities = ["temperature", "humidity", "co2", "tvoc", "barometric_pressure", "illuminance", "pir", "battery"];
              inferredType = "Environment Sensor";
            } else if (nameUpper.includes("EM300") || nameUpper.includes("EM-300")) {
              if (nameUpper.includes("SLD") || nameUpper.includes("LEAK")) {
                inferredModel = "EM300-SLD";
                inferredCapabilities = ["water_leak", "temperature", "humidity", "battery"];
                inferredType = "Water Leakage Sensor";
              } else {
                inferredModel = "EM300-TH";
                inferredCapabilities = ["temperature", "humidity", "battery"];
                inferredType = "Temperature & Humidity Sensor";
              }
            } else if (nameUpper.includes("ENVIRONMENT MONITORING") || nameUpper.includes("WATER LEAK") || nameUpper.includes("WS50") || nameUpper.includes("WS52")) {
              // Milesight Environment Monitoring Sensor / Water Leakage Sensors (WS50x, WS52x, EM300-SLD)
              inferredModel = "EM300-SLD";
              inferredCapabilities = ["water_leak", "temperature", "humidity", "battery"];
              inferredType = "Water Leakage Sensor";
            } else if (nameUpper.includes("VS121")) {
              inferredModel = "VS121";
              inferredCapabilities = ["people_count", "battery"];
              inferredType = "People Counter";
            } else if (nameUpper.includes("WS302") || nameUpper.includes("SOUND LEVEL")) {
              inferredModel = "WS302";
              inferredCapabilities = ["sound_level", "battery"];
              inferredType = "Sound Level Sensor";
            } else if (nameUpper.includes("WS301") || (nameUpper.includes("WS30") && !nameUpper.includes("WS302"))) {
              inferredModel = "WS301";
              inferredCapabilities = ["door_status", "battery"];
              inferredType = "Door/Window Sensor";
            }
          }
          // Infer capabilities from decoded data if no model matched
          if (inferredCapabilities.length === 0 && decodedData) {
            const dataKeys = Object.keys(decodedData);
            const capMap: Record<string, string> = {
              temperature: "temperature", humidity: "humidity", co2: "co2",
              tvoc: "tvoc", pressure: "barometric_pressure", barometric_pressure: "barometric_pressure",
              illuminance: "illuminance", light: "illuminance", pir: "pir",
              pm2_5: "pm2_5", pm10: "pm10", battery: "battery",
              water_leak: "water_leak", sound_level: "sound_level",
            };
            for (const k of dataKeys) {
              const cap = capMap[k];
              if (cap && !inferredCapabilities.includes(cap)) inferredCapabilities.push(cap);
            }
          }
          // Extract battery from decoded data
          const batteryVal = decodedData && typeof decodedData.battery === "number" ? decodedData.battery : 100;

          // Resolve gateway platform ID from EUI for correct status derivation
          let resolvedGateway = gatewayEUI || "Unknown";
          if (gatewayEUI) {
            const gwKey2 = uk(userId, "gateways");
            const userGateways = await getUserCollection(userId, "gateways");
            const matchedGw = userGateways.find((gw: any) =>
              (gw.devEui || "").toLowerCase() === gatewayEUI.toLowerCase()
            );
            if (matchedGw) resolvedGateway = matchedGw.id;
          }
          const newDevice: any = {
            id: `D${Date.now()}`, name: deviceName || `${inferredModel || "Sensor"}-${devEUI.slice(-4)}`,
            type: inferredType, devEui: devEUI, gateway: resolvedGateway,
            building: "Unassigned", location: "Auto-registered",
            status: "online", battery: batteryVal,
            lastUpdate: new Date().toISOString(), lastSeen: new Date().toISOString(),
            signal: rssi > -999 ? Math.max(0, Math.min(100, 2 * (rssi + 100))) : 0,
          };
          if (inferredManufacturer) newDevice.manufacturer = inferredManufacturer;
          if (inferredModel) newDevice.model = inferredModel;
          if (inferredCapabilities.length > 0) newDevice.capabilities = inferredCapabilities;
          newDevice.serialNumber = devEUI;

          devices.push(newDevice);
          await cachedKvSet(devKey, devices);
          console.log(`[Auto-Register] New device: ${newDevice.name} (${inferredModel || "unknown model"}) EUI=${devEUI}`);
        }
      }

      // ── Fan-out: sync live data to other users who have copies of this device ──
      // When the admin's webhook receives data, update matching devices (by devEui)
      // in other users' accounts so they see real-time status and charts.
      if (devEUI) {
        try {
          const fanoutIndex: Record<string, string[]> = (await cachedKvGet("device_fanout_index")) || {};
          const subscriberUserIds: string[] = fanoutIndex[devEUI.toLowerCase()] || [];
          const nowIso = new Date().toISOString();
          for (const subUserId of subscriberUserIds) {
            if (subUserId === userId) continue; // skip source user (already updated above)
            try {
              // Update device lastSeen/status/battery/signal
              const subDevKey = uk(subUserId, "devices");
              const subDevices = await getUserCollection(subUserId, "devices");
              let devChanged = false;
              for (let i = 0; i < subDevices.length; i++) {
                if ((subDevices[i].devEui || "").toLowerCase() === devEUI.toLowerCase()) {
                  subDevices[i].lastSeen = nowIso;
                  subDevices[i].lastUpdate = nowIso;
                  subDevices[i].status = "online";
                  if (rssi > -999) subDevices[i].signal = Math.max(0, Math.min(100, 2 * (rssi + 100)));
                  if (decodedData && typeof decodedData.battery === "number") {
                    subDevices[i].battery = decodedData.battery;
                  }
                  devChanged = true;
                }
              }
              if (devChanged) await cachedKvSet(subDevKey, subDevices);

              // Update gateway lastSeen if subscriber has a matching gateway
              if (gatewayEUI) {
                const subGwKey = uk(subUserId, "gateways");
                const subGateways = await getUserCollection(subUserId, "gateways");
                const subGwIdx = subGateways.findIndex((gw: any) =>
                  (gw.devEui || "").toLowerCase() === gatewayEUI.toLowerCase()
                );
                if (subGwIdx !== -1) {
                  subGateways[subGwIdx].lastSeen = nowIso;
                  if (rssi > -999) subGateways[subGwIdx].signal = Math.max(0, Math.min(100, 2 * (rssi + 100)));
                  await cachedKvSet(subGwKey, subGateways);
                }
              }

              // Copy sensor data entry to subscriber
              const subSdKey = `sensor_data_${subUserId}`;
              let subSensorData: any[] = [];
              try { const existing = await cachedKvGet(subSdKey); if (Array.isArray(existing)) subSensorData = existing; } catch { /* fresh */ }
              subSensorData.unshift(entry);
              const THREE_DAYS_FAN = 3 * 24 * 60 * 60 * 1000;
              const pruneFan = Date.now() - THREE_DAYS_FAN;
              subSensorData = subSensorData.filter((e: any) => new Date(e.receivedAt).getTime() > pruneFan);
              if (subSensorData.length > 1000) subSensorData = subSensorData.slice(0, 1000);
              await cachedKvSet(subSdKey, subSensorData);
            } catch (fanErr) {
              console.log(`[Fanout] Error syncing to ${subUserId}: ${errorMessage(fanErr)}`);
            }
          }
        } catch (fanErr) {
          console.log(`[Fanout] Index read failed (non-fatal): ${errorMessage(fanErr)}`);
        }
      }

      // Auto-generate alarms from decoded data (supports Milesight native, Cayenne LPP, and custom codec fields)
      if (decodedData) {
        // Strip known broken sensor fields before alarm evaluation
        stripBrokenFields(devEUI, decodedData);

        // Detect device type from name for context-aware normalization
        const nameUpper = (deviceName || "").toUpperCase();
        const isWaterLeakDevice = /WATER|LEAK|EM300|EM500|ENVIRONMENT.MONITORING|WS50|WS52/.test(nameUpper);
        const isSmokeFireDevice = /SMOKE|FIRE|WS55[89]|EM310/.test(nameUpper);

        // Normalize: flatten Cayenne LPP field names (e.g. "temperature_1" → also accessible as "temperature")
        const normalized: Record<string, number> = {};
        for (const [key, val] of Object.entries(decodedData)) {
          if (typeof val === "number") {
            normalized[key] = val;
            // Strip Cayenne LPP channel suffix: "temperature_1" → "temperature"
            const base = key.replace(/_\d+$/, "");
            if (base !== key && !(base in normalized)) normalized[base] = val;
            // Map Cayenne LPP names to Milesight-style names
            if (base === "relative_humidity" && !("humidity" in normalized)) normalized["humidity"] = val;
            // Digital input: route based on device type
            // - Water leak devices: digital_input > 0 → water_leak
            // - Smoke/fire devices: digital_input > 0 → smoke_status
            // - All other devices (AM308L etc.): ignore digital_input (it's just GPIO/PIR)
            if (base === "digital_input" && val > 0) {
              if (isWaterLeakDevice) {
                if (!("water_leak" in normalized)) normalized["water_leak"] = val;
              } else if (isSmokeFireDevice) {
                if (!("smoke_status" in normalized)) normalized["smoke_status"] = val;
              }
              // else: ignore — AM308L, WS302, etc. use digital_input for general GPIO
            }
            if (base === "analog_input" || base === "analog_output") normalized[base] = val;
            // AM308L Cayenne LPP mappings
            if (base === "barometric_pressure" && !("pressure" in normalized)) normalized["pressure"] = val;
            if (base === "illuminance" && !("light" in normalized)) normalized["light"] = val;
            if (base === "luminosity" && !("light" in normalized)) normalized["light"] = val;
            if ((key === "pir" || base === "presence") && !("activity" in normalized)) normalized["activity"] = val;
            // WS302 Sound Level Sensor mappings
            if (key === "sound_level_leq" && !("sound_level" in normalized)) normalized["sound_level"] = val;
          }
        }
        const alarmChecks = [
          { field: "smoke_status", threshold: 0, type: "Smoke Detected", desc: "Smoke detected by sensor", above: true },
          { field: "fire_status", threshold: 0, type: "Fire Alarm", desc: "Fire detected by sensor", above: true },
          { field: "temperature", threshold: 50, type: "Temperature", desc: "Temperature exceeding 50C threshold", above: true },
          { field: "humidity", threshold: 85, type: "High Humidity", desc: "Humidity exceeding 85% threshold", above: true },
          { field: "water_leak", threshold: 0, type: "Water Leakage", desc: "Water leak detected by sensor", above: true },
          { field: "co2", threshold: 1000, type: "High CO2", desc: "CO2 exceeding 1000ppm threshold", above: true },
          { field: "tvoc", threshold: 500, type: "High TVOC", desc: "TVOC exceeding 500 threshold", above: true },
          { field: "pm2_5", threshold: 75, type: "High PM2.5", desc: "PM2.5 exceeding 75μg/m³ threshold", above: true },
          { field: "pm10", threshold: 150, type: "High PM10", desc: "PM10 exceeding 150μg/m³ threshold", above: true },
          { field: "light", threshold: 1000, type: "High Illuminance", desc: "Illuminance exceeding 1000 lux", above: true },
          { field: "sound_level", threshold: 85, type: "High Noise", desc: "Sound level exceeding 85dB threshold", above: true },
          { field: "pressure", threshold: 900, type: "Pressure Alert", desc: "Barometric pressure below 900 hPa", above: false },
          { field: "battery", threshold: 10, type: "Low Battery", desc: "Sensor battery below 10%", above: false },
        ];
        for (const check of alarmChecks) {
          const val = normalized[check.field] ?? (typeof decodedData[check.field] === "number" ? decodedData[check.field] : undefined);
          if (typeof val === "number" && ((check.above && val > check.threshold) || (!check.above && val < check.threshold))) {
            const alarmKey = uk(userId, "alarms");
            let alarms = await kvGetWithRetry(alarmKey);
            if (!Array.isArray(alarms)) alarms = [];
            const recentDupe = alarms.find((a: any) => a.type === check.type && a.status === "pending" && (Date.now() - new Date(a.time).getTime()) < 300000);
            if (!recentDupe) {
              const newAlarm = {
                id: `A${Date.now()}`, type: check.type, location: deviceName,
                property: applicationName || "LoRaWAN Sensor",
                severity: check.type.includes("Fire") || check.type.includes("Smoke") || check.type.includes("Water") ? "high" : "medium",
                time: new Date().toISOString(), status: "pending",
                description: `${check.desc}: ${deviceName} reported ${check.field}=${val}`,
              };
              alarms.unshift(newAlarm);
              if (alarms.length > 1000) alarms = alarms.slice(0, 1000);
              await kvSetWithRetry(alarmKey, alarms);
              invalidateKvCache(alarmKey);
              // Push critical alarms instantly via Realtime Broadcast
              if (/Fire|Smoke|Water/i.test(check.type)) {
                broadcastAlarmPush(userId, newAlarm).catch(() => {});
              }
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

  // ─── DEVICE HISTORY (per-device time-series from sensor_data) ───

  app.get("/make-server-4916a0b9/device-history/:devEui", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
    try {
      const devEui = sanitizeString(c.req.param("devEui"), 50).toLowerCase();
      if (!devEui) return c.json({ error: "devEui is required." }, 400);

      // Support period query param: 24h (default) or 3d (max stored)
      const periodParam = (c.req.query("period") || "24h").toLowerCase();
      const periodHours: Record<string, number> = { "12h": 12, "24h": 24, "48h": 48, "3d": 72 };
      const hours = periodHours[periodParam] || 24;
      const maxPoints: Record<string, number> = { "12h": 48, "24h": 96, "48h": 96, "3d": 144 };
      const maxPts = maxPoints[periodParam] || 96;

      const sdKey = `sensor_data_${userId}`;
      let sensorData: any[] = [];
      try { const raw = await cachedKvGet(sdKey); if (Array.isArray(raw)) sensorData = raw; } catch { /* empty */ }

      // Filter to this device's uplink entries within the requested period
      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      let entries = sensorData.filter((e: any) => {
        if (!e.devEUI || e.eventType === "join" || e.eventType === "ack") return false;
        if (e.devEUI.toLowerCase() !== devEui) return false;
        const ts = new Date(e.receivedAt).getTime();
        return ts > cutoff;
      });

      // Fallback: if user has no sensor data for this devEui, return empty
      // (no cross-account data fallback — each account only sees its own data)

      // Build time-series points with ALL decoded fields
      // Use includes-based matching so Milesight channel-suffixed keys like
      // "temperature_3", "relative_humidity_4", "co2_7" etc. are found.
      const fv = (decoded: any, patterns: string[]): number | null => {
        if (!decoded) return null;
        for (const k of Object.keys(decoded)) {
          const kl = k.toLowerCase();
          for (const p of patterns) {
            if (kl === p || kl.includes(p)) { const v = decoded[k]; if (typeof v === "number") return v; }
          }
        }
        return null;
      };
      const points = entries.map((e: any) => {
        const d = e.decodedData ? { ...e.decodedData } : {};
        // Strip known broken sensor fields (e.g. AM308L#2 PM sensors)
        stripBrokenFields(devEui, d);
        return {
          time: e.receivedAt,
          temperature: fv(d, ["temperature", "temp"]),
          humidity: fv(d, ["humidity", "humid"]),
          co2: fv(d, ["co2"]),
          tvoc: fv(d, ["tvoc", "voc"]),
          pm2_5: fv(d, ["pm2_5", "pm25"]),
          pm10: fv(d, ["pm10"]),
          pressure: fv(d, ["barometric_pressure", "pressure", "baro"]),
          illuminance: fv(d, ["illuminance", "light", "lux"]),
          pir: fv(d, ["pir", "occupancy", "motion"]),
          battery: fv(d, ["battery"]),
          sound_level_leq: fv(d, ["sound_level_leq", "leq"]),
          sound_level_lmin: fv(d, ["sound_level_lmin", "lmin"]),
          sound_level_lmax: fv(d, ["sound_level_lmax", "lmax"]),
          water_leak: fv(d, ["water_leak"]),
        };
      }).reverse(); // oldest first

      // Sample down to max points based on period
      let sampled = points;
      if (points.length > maxPts) {
        sampled = points.filter((_: any, i: number) => i % Math.ceil(points.length / maxPts) === 0);
      }

      // Format time for chart labels
      const formatted = sampled.map((p: any) => ({
        ...p,
        timeLabel: new Date(p.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong" }),
        dateLabel: new Date(p.time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Hong_Kong" }),
      }));

      return c.json({ devEui, period: periodParam, totalEntries: entries.length, points: formatted });
    } catch (e) {
      console.log("Error fetching device history:", errorMessage(e));
      return c.json({ error: "Failed to fetch device history." }, 500);
    }
  });

  // ─── SENSOR DATA ───────────────────────────────────────

  app.get("/make-server-4916a0b9/sensor-data", async (c: any) => {
    const auth = await requireAuth(c);
    if (auth instanceof Response) return auth;
    const userId = resolveTargetUser(auth, c);
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
          // Strip known broken sensor fields from lastDecodedData
          const cleanDecoded = entry.decodedData ? { ...entry.decodedData } : null;
          if (cleanDecoded) stripBrokenFields(entry.devEUI, cleanDecoded);
          deviceMap.set(entry.devEUI, {
            devEUI: entry.devEUI, deviceName: entry.deviceName, applicationName: entry.applicationName,
            lastSeen: entry.receivedAt, uplinkCount: 0, lastRssi: entry.rssi, lastSnr: entry.snr, lastDecodedData: cleanDecoded,
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
    return c.json({ isAdmin: MASTER_EMAILS.has(auth.email.toLowerCase()) && auth.userId === MASTER_USER_ID });
  });

  console.log("[FioTec Routes] All route handlers registered.");

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
        // ── Security: require admin re-authentication before resetting any user's password ──
        if (!body.adminPassword || typeof body.adminPassword !== "string") {
          return c.json({ error: "Admin password required to reset user password." }, 403);
        }
        // Verify admin's own password via signInWithPassword
        const anonUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
        const verifyResp = await fetch(`${anonUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": anonKey },
          body: JSON.stringify({ email: admin.email, password: body.adminPassword }),
        });
        if (!verifyResp.ok) {
          return c.json({ error: "Admin re-authentication failed. Incorrect password." }, 403);
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

  // ─── ADMIN: Assign property (+ linked devices) to another user ──

  app.post("/make-server-4916a0b9/admin/assign-property", async (c: any) => {
    const admin = await requireAdmin(c);
    if (admin instanceof Response) return admin;
    try {
      const body = await c.req.json();
      const propertyId = sanitizeString(body.propertyId, 50);
      const targetUserId = sanitizeString(body.targetUserId, 50);
      const includeDevices = body.includeDevices !== false; // default true
      const removeFromSource = body.removeFromSource === true; // default false (copy)

      if (!propertyId || !targetUserId) {
        return c.json({ error: "propertyId and targetUserId are required." }, 400);
      }

      // Source = admin's own account
      const sourceUserId = admin.userId;
      if (sourceUserId === targetUserId) {
        return c.json({ error: "Cannot assign property to yourself." }, 400);
      }

      // Verify target user exists
      const { data: targetUser, error: userErr } = await supabase.auth.admin.getUserById(targetUserId);
      if (userErr || !targetUser?.user) {
        return c.json({ error: "Target user not found." }, 404);
      }

      // Get source property
      const srcPropsKey = uk(sourceUserId, "properties");
      const srcProps = await getUserCollection(sourceUserId, "properties");
      const srcProperty = srcProps.find((p: any) => p.id === propertyId);
      if (!srcProperty) {
        return c.json({ error: "Property not found in your account." }, 404);
      }

      // Get target properties and check for name conflict
      const tgtPropsKey = uk(targetUserId, "properties");
      const tgtProps = await getUserCollection(targetUserId, "properties");
      if (tgtProps.length >= 100) {
        return c.json({ error: "Target user has reached the maximum property limit (100)." }, 400);
      }
      const nameConflict = tgtProps.some((p: any) => p.name.toLowerCase() === srcProperty.name.toLowerCase());
      if (nameConflict) {
        return c.json({ error: `Target user already has a property named "${srcProperty.name}".` }, 400);
      }

      // Copy property with new ID
      const newProperty = {
        ...srcProperty,
        id: `B${Date.now()}`,
        waterSensors: "0/0", // will be recalculated
      };
      tgtProps.push(newProperty);
      await cachedKvSet(tgtPropsKey, tgtProps);

      // Copy linked devices if requested
      let devicesCopied = 0;
      let devicesRemoved = 0;
      let gatewaysCopied = 0;
      if (includeDevices) {
        const srcDevsKey = uk(sourceUserId, "devices");
        const srcDevs = await getUserCollection(sourceUserId, "devices");
        const linkedDevices = srcDevs.filter((d: any) => d.building === srcProperty.name);

        if (linkedDevices.length > 0) {
          const tgtDevsKey = uk(targetUserId, "devices");
          const tgtDevs = await getUserCollection(targetUserId, "devices");
          if (tgtDevs.length + linkedDevices.length > 500) {
            // Rollback property
            const rolledBack = tgtProps.filter((p: any) => p.id !== newProperty.id);
            await cachedKvSet(tgtPropsKey, rolledBack);
            return c.json({ error: `Target user would exceed the device limit (500). They have ${tgtDevs.length} devices and this property has ${linkedDevices.length} linked devices.` }, 400);
          }

          // Collect unique gateway IDs referenced by the linked devices
          const referencedGwIds = new Set<string>();
          for (const dev of linkedDevices) {
            if (dev.gateway && dev.gateway !== "Unassigned" && dev.gateway !== "Unknown") {
              referencedGwIds.add(dev.gateway);
            }
          }

          // Copy referenced gateways to target user (skip if already exists by devEui or id)
          if (referencedGwIds.size > 0) {
            const srcGateways = await getUserCollection(sourceUserId, "gateways");
            const tgtGwKey = uk(targetUserId, "gateways");
            const tgtGateways = await getUserCollection(targetUserId, "gateways");
            const tgtGwIds = new Set(tgtGateways.map((g: any) => g.id));
            const tgtGwEuis = new Set(tgtGateways.map((g: any) => (g.devEui || "").toLowerCase()).filter(Boolean));
            const gwIdMap = new Map<string, string>(); // old ID -> new ID

            for (const gwId of referencedGwIds) {
              const srcGw = srcGateways.find((g: any) => g.id === gwId);
              if (!srcGw) continue;
              // Skip if target already has this gateway (by devEui match)
              const srcEui = (srcGw.devEui || "").toLowerCase();
              if (srcEui && tgtGwEuis.has(srcEui)) {
                // Find existing target gateway for ID remapping
                const existing = tgtGateways.find((g: any) => (g.devEui || "").toLowerCase() === srcEui);
                if (existing) gwIdMap.set(gwId, existing.id);
                continue;
              }
              if (tgtGwIds.has(gwId)) {
                gwIdMap.set(gwId, gwId); // same ID already exists
                continue;
              }
              const newGwId = `GW${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const newGw = { ...srcGw, id: newGwId, sourceGateway: gwId, sourceUser: sourceUserId };
              tgtGateways.push(newGw);
              gwIdMap.set(gwId, newGwId);
              tgtGwIds.add(newGwId);
              if (srcEui) tgtGwEuis.add(srcEui);
              gatewaysCopied++;
            }
            if (gatewaysCopied > 0) {
              await cachedKvSet(tgtGwKey, tgtGateways);
            }

            // Copy devices with remapped gateway IDs
            for (const dev of linkedDevices) {
              const newGwId = gwIdMap.get(dev.gateway) || dev.gateway;
              const newDev = {
                ...dev,
                id: `D${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                gateway: newGwId,
                sourceDevice: dev.id,
                sourceUser: sourceUserId,
              };
              tgtDevs.push(newDev);
              devicesCopied++;
            }
          } else {
            // No gateways referenced — copy devices as-is
            for (const dev of linkedDevices) {
              const newDev = {
                ...dev,
                id: `D${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sourceDevice: dev.id,
                sourceUser: sourceUserId,
              };
              tgtDevs.push(newDev);
              devicesCopied++;
            }
          }
          await cachedKvSet(tgtDevsKey, tgtDevs);

          // Copy recent sensor data so target user gets charts immediately
          if (devicesCopied > 0) {
            const srcSdKey = `sensor_data_${sourceUserId}`;
            const tgtSdKey = `sensor_data_${targetUserId}`;
            try {
              const srcSensorData: any[] = (await cachedKvGet(srcSdKey)) || [];
              const linkedEuis = new Set(linkedDevices.map((d: any) => (d.devEui || "").toLowerCase()).filter(Boolean));
              if (linkedEuis.size > 0) {
                const relevantEntries = srcSensorData.filter((e: any) =>
                  linkedEuis.has((e.devEUI || "").toLowerCase())
                );
                if (relevantEntries.length > 0) {
                  let tgtSensorData: any[] = (await cachedKvGet(tgtSdKey)) || [];
                  // Avoid duplicates by checking receivedAt + devEUI
                  const existing = new Set(tgtSensorData.map((e: any) => `${e.devEUI}_${e.receivedAt}`));
                  const newEntries = relevantEntries.filter((e: any) => !existing.has(`${e.devEUI}_${e.receivedAt}`));
                  tgtSensorData = [...newEntries, ...tgtSensorData].sort(
                    (a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
                  ).slice(0, 1000);
                  await cachedKvSet(tgtSdKey, tgtSensorData);
                  console.log(`[Assign] Copied ${newEntries.length} sensor data entries to target user.`);
                }
              }
            } catch (e) {
              console.log("[Assign] Sensor data copy failed (non-fatal):", errorMessage(e));
            }
          }

          // Update device fan-out index so webhook data is synced to this user
          try {
            const fanoutIndex: Record<string, string[]> = (await cachedKvGet("device_fanout_index")) || {};
            let indexChanged = false;
            for (const dev of linkedDevices) {
              const eui = (dev.devEui || "").toLowerCase();
              if (!eui) continue;
              if (!fanoutIndex[eui]) fanoutIndex[eui] = [];
              if (!fanoutIndex[eui].includes(targetUserId)) {
                fanoutIndex[eui].push(targetUserId);
                indexChanged = true;
              }
              // Also ensure source user is in the index
              if (!fanoutIndex[eui].includes(sourceUserId)) {
                fanoutIndex[eui].push(sourceUserId);
                indexChanged = true;
              }
            }
            if (indexChanged) {
              await cachedKvSet("device_fanout_index", fanoutIndex);
              console.log(`[Assign] Updated device fan-out index for ${linkedDevices.filter((d: any) => d.devEui).length} devices.`);
            }
          } catch (e) {
            console.log("[Assign] Fan-out index update failed (non-fatal):", errorMessage(e));
          }

          // Remove from source if transfer mode
          if (removeFromSource) {
            const linkedIds = new Set(linkedDevices.map((d: any) => d.id));
            const remaining = srcDevs.filter((d: any) => !linkedIds.has(d.id));
            await cachedKvSet(srcDevsKey, remaining);
            devicesRemoved = linkedDevices.length;
          }
        }
      }

      // Remove property from source if transfer mode
      if (removeFromSource) {
        const remaining = srcProps.filter((p: any) => p.id !== propertyId);
        await cachedKvSet(srcPropsKey, remaining);
      }

      // Update sensor counts on target
      await updatePropertySensorCounts(targetUserId, newProperty.name);

      // Update sensor counts on source (if devices were removed)
      if (removeFromSource && devicesRemoved > 0) {
        await updatePropertySensorCounts(sourceUserId, srcProperty.name);
      }

      return c.json({
        success: true,
        message: `Property "${srcProperty.name}" ${removeFromSource ? 'transferred' : 'assigned'} to ${targetUser.user.email}.`,
        property: newProperty,
        devicesCopied,
        gatewaysCopied,
        devicesRemoved: removeFromSource ? devicesRemoved : 0,
        targetUserEmail: targetUser.user.email,
      });
    } catch (e) {
      console.log("Admin assign-property error:", errorMessage(e));
      return c.json({ error: "Failed to assign property." }, 500);
    }
  });

  // ── AWS IoT Core Integration (deferred import) ──────────
  // Dynamically imports AWS routes to avoid adding AWS SDK
  // weight to the main route module's load time.
  (async () => {
    try {
      const { registerAWSRoutes } = await import("./aws_routes.tsx");
      registerAWSRoutes(app, requireAuth, cachedKvGet, cachedKvSet, uk);
      console.log("[FioTec Routes] AWS routes loaded.");
    } catch (e) {
      console.log("[FioTec Routes] AWS routes skipped (SDK not available or import error):", errorMessage(e));
    }
  })();
}
