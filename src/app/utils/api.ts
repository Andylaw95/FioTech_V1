import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from '@/app/utils/AuthContext';
import { handleDemoRequest } from '@/app/utils/demoData';
import { isDemoMode } from '@/app/utils/demoMode';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-4916a0b9`;

// ===============================================================
// COLD-START GRACE PERIOD — for a window after app boot, transient
// 401s are retried instead of triggering destructive sign-out.
// This prevents the cascade: warmup exhausts → first call network
// error → retry gets transient 401 → sign-out.
// ===============================================================

const APP_BOOT_TIME = Date.now();
const COLD_START_GRACE_MS = 90_000; // 90s after module load — covers warmup (30s) + auth probe (20s) + initial data requests (40s)

// Track when the server was last known to be cold-starting (mid-session worker recycle).
// If we see a 502/503/504, we extend the grace period dynamically so that subsequent
// 401s during the same cold-start event are treated as transient, not as real auth failures.
let _lastColdStartSignal = 0;
const MID_SESSION_GRACE_MS = 30_000; // 30s grace after detecting a mid-session cold start

function isInColdStartGrace(): boolean {
  const now = Date.now();
  // Initial boot grace
  if (now - APP_BOOT_TIME < COLD_START_GRACE_MS) return true;
  // Mid-session cold-start grace — extends window after seeing 502/503/504
  if (_lastColdStartSignal > 0 && now - _lastColdStartSignal < MID_SESSION_GRACE_MS) return true;
  return false;
}

// ===============================================================
// SERVER WARMUP — primes the Edge Function cold start with a
// single lightweight /health ping before real requests fire.
// Prevents the thundering-herd of 503s from multiple concurrent
// requests all hitting a cold server simultaneously.
// ===============================================================

let _serverWarmedUp = false;
let _warmupPromise: Promise<'success' | 'exhausted'> | null = null;

// ── Keep-alive pings ─────────────────────────────────────────────
// After warmup succeeds, periodically pings /health to prevent the
// Supabase Edge Function worker from being recycled during the
// initial data-load phase. Without this, the worker frequently
// recycles between warmup success and the first data requests,
// causing the exact timeout storms seen in production.
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (_keepAliveTimer) return;
  const url = `${BASE_URL}/health`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${publicAnonKey}`,
    apikey: publicAnonKey,
  };

  // Ping every 25s for the ENTIRE session — keeps the Edge Function worker
  // alive and avoids cold starts when navigating between pages or idling.
  // Only fires when the tab is visible to avoid wasting resources.
  _keepAliveTimer = setInterval(() => {
    if (!document.hidden) {
      fetch(url, { headers }).catch(() => {});
    }
  }, 25000);

  // Pause/resume on visibility change — no pings when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _keepAliveTimer) {
      // Immediately ping when tab becomes visible again (may have been idle)
      fetch(url, { headers }).catch(() => {});
    }
  });

  console.log('[FioTech] Keep-alive pings started (every 25s, session-long, visibility-aware)');
}

export function stopKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
}

/**
 * Warm up the server by pinging the /health endpoint.
 * Uses faster retry intervals since this is specifically for
 * cold-start priming. Returns 'success' or 'exhausted' so the
 * ServerWarmupGate can decide whether to release or show an error.
 */
export function warmupServer(): Promise<'success' | 'exhausted'> {
  if (_serverWarmedUp) return Promise.resolve('success' as const);
  if (_warmupPromise) return _warmupPromise;

  _warmupPromise = (async (): Promise<'success' | 'exhausted'> => {
    const url = `${BASE_URL}/health`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
    };

    // 12 attempts with 1.5s minimum cycle = 18s window minimum.
    // The health endpoint is now synchronous (zero IO), so responses are
    // instant once the Edge Function is running. The main delay is the
    // Supabase proxy cold-starting the worker (15-30s), during which
    // fetches fail fast with "Failed to fetch". Once the worker is live,
    // health responds in <100ms, so cycles are fast.
    const MAX_ATTEMPTS = 12;
    let consecutiveAlive = 0; // Track consecutive 200 responses
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const attemptStart = Date.now();
      try {
        // 5s timeout — generous for a synchronous endpoint. If it takes
        // longer, the Supabase proxy is still cold-starting the worker.
        const response = await fetchWithTimeout(url, { headers }, 5000);

        if (response.ok) {
          consecutiveAlive++;
          let body: any = null;
          try {
            body = await response.json();
          } catch {
            console.log(`[FioTech] Server warm (could not parse health body) after ${attempt + 1} attempt(s)`);
            _serverWarmedUp = true;
            startKeepAlive();
            return 'success';
          }
          if (body?.schemaReady === true) {
            console.log(`[FioTech] Server fully warm (DB ready) after ${attempt + 1} attempt(s)`);
            _serverWarmedUp = true;
            startKeepAlive();
            return 'success';
          }
          // Server responded 200 but schemaReady not yet true.
          // If it's been alive for 3+ consecutive pings, consider it warm
          // enough — routes may be loaded even if schemaReady flag has
          // a bug, or the server at least handles requests.
          if (consecutiveAlive >= 3) {
            console.log(`[FioTech] Server alive for ${consecutiveAlive} consecutive pings, considering warm (schemaReady=${body?.schemaReady})`);
            _serverWarmedUp = true;
            startKeepAlive();
            return 'success';
          }
          console.log(`[FioTech] Server alive but DB not ready (${consecutiveAlive}/3), retrying...`);
          throw new Error('Schema not ready');
        }

        consecutiveAlive = 0; // Reset on non-200

        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error(`Server returned ${response.status}`);
        }

        // Any other response (e.g., 401, 404) means the server IS running
        console.debug(`[FioTech] Server responded with ${response.status}, considering it warm`);
        _serverWarmedUp = true;
        startKeepAlive();
        return 'success';
      } catch (error) {
        if (attempt < MAX_ATTEMPTS - 1) {
          const elapsed = Date.now() - attemptStart;
          // 1.5s minimum cycle — health is instant so we can probe fast.
          // This lets us detect the moment the server comes alive.
          const delay = Math.max(1500 - elapsed, 300);
          console.debug(
            `[FioTech] Warming up server... attempt ${attempt + 1}/${MAX_ATTEMPTS} (retry in ${Math.round(delay)}ms)`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // Warmup exhausted — do NOT set _serverWarmedUp = true.
    // The gate will show an error/retry UI instead of flooding a cold server.
    console.debug('[FioTech] Server warmup exhausted after 12 attempts');
    return 'exhausted';
  })();

  return _warmupPromise;
}

/**
 * Reset warmup state so it can be retried (e.g., from a "Retry" button).
 */
export function resetWarmup(): void {
  _serverWarmedUp = false;
  _warmupPromise = null;
}

// ===============================================================
// PERFORMANCE: Response cache — prevents duplicate fetches
// ===============================================================

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 2000;
const SLOW_CACHE_TTL = 15000; // properties, settings, widget-layout — rarely change

/** Pick frontend cache TTL — alarm/sensor data stays fast, slow-changing data gets 15s */
function responseCacheTtl(path: string): number {
  if (path.includes('alarm') || path.includes('telemetry') || path.includes('sensor') || path.includes('stats')) return DEFAULT_CACHE_TTL;
  return SLOW_CACHE_TTL;
}

function getCached(key: string): any | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  if (entry) responseCache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttl = DEFAULT_CACHE_TTL) {
  responseCache.set(key, { data, expiresAt: Date.now() + ttl });
}

/** Invalidate cache entries matching a prefix (e.g., after a write) */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

// ===============================================================
// STABILITY: Request deduplication — prevents concurrent
// identical requests (e.g., rapid polling overlap)
// ===============================================================

const inflightRequests = new Map<string, Promise<any>>();

// ===============================================================
// Auth token management
// ===============================================================

function isJwtExpired(token: string, bufferMs = 60000): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    return payload.exp * 1000 < Date.now() + bufferMs;
  } catch {
    return true;
  }
}

// Module-level guards to prevent cascading 401 errors and
// concurrent refresh races.
let signingOut = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Single-flight refresh: ensures only one refreshSession() call
 * happens at a time across all concurrent API requests.
 */
function singleFlightRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data?.session?.access_token) {
        console.debug('[FioTech] Token refresh failed:', error?.message ?? 'no session returned');
        return null;
      }
      const t = data.session.access_token;
      return isJwtExpired(t, 5000) ? null : t;
    } catch (e) {
      console.debug('[FioTech] Token refresh exception:', e);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Returns the current user's access token, or empty string if none.
 *
 * The user JWT is sent via the custom `x-user-token` header so it
 * never reaches the Supabase Edge Function gateway's JWT validator.
 * The gateway only sees the anon key in the standard `Authorization`
 * header.
 */
async function getUserToken(): Promise<string> {
  if (signingOut) return '';

  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return '';

    if (!isJwtExpired(token)) return token;

    // Token expired / near-expiry — refresh
    console.debug('Access token near-expiry, refreshing proactively...');
    const freshToken = await singleFlightRefresh();
    if (freshToken) return freshToken;

    // Unrecoverable — sign out
    signingOut = true;
    await supabase.auth.signOut();
    signingOut = false;
    return '';
  } catch (e) {
    console.debug('Failed to get user token:', e);
    return '';
  }
}

// ===============================================================
// Core fetch with auth, retry, dedup, and caching
//
// ARCHITECTURE:
// The Supabase Edge Function gateway validates the JWT in the
// `Authorization` header *before* our Hono server code runs.
// Stale/rotated user JWTs cause {"code":401,"message":"Invalid JWT"}
// at the gateway level — our server code never executes.
//
// Fix: ALWAYS send `Authorization: Bearer <anon_key>` (gateway
// always accepts). The real user JWT travels in `x-user-token`,
// which our backend's requireAuth() reads and validates via
// supabase.auth.getUser(token).
// ===============================================================

/** Custom error for cold start / proxy 502/503/504 responses */
class ColdStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColdStartError';
  }
}

/** Custom error for transient auth failures during cold-start.
 *  Unlike a real 401, these are retryable and should NOT trigger sign-out. */
class TransientAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientAuthError';
  }
}

/** Fetch with per-request timeout via AbortController.
 *  Converts timeout (AbortError) into retryable ColdStartError so the
 *  retry loop in doFetchWithRetry automatically handles it. */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .then((res) => { clearTimeout(timeoutId); return res; })
    .catch((err) => {
      clearTimeout(timeoutId);
      // Robust AbortError detection — not all browsers/runtimes use DOMException
      if (err?.name === 'AbortError') {
        throw new ColdStartError(`Request timed out after ${timeoutMs}ms`);
      }
      throw err;
    });
}

/** Build the standard headers for every request. */
function buildHeaders(
  userToken: string,
  isBodyRequest: boolean,
  extra?: Record<string, string>,
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${publicAnonKey}`,
    apikey: publicAnonKey,
  };
  if (isBodyRequest) h['Content-Type'] = 'application/json';
  if (extra) Object.assign(h, extra);
  if (userToken) h['x-user-token'] = userToken;
  return h;
}

async function fetchWithAuth(path: string, options: RequestInit = {}) {
  // ── Demo mode bypass — serve from static data, no network ──
  if (isDemoMode()) {
    return handleDemoRequest(path, options);
  }

  const method = options.method || 'GET';
  const isRead = method === 'GET';
  const isBodyRequest = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const dedupeKey = isRead ? `${method}:${path}` : '';

  // Response cache (GET only)
  if (isRead) {
    const cached = getCached(path);
    if (cached) return cached;
  }

  // Deduplicate concurrent GET requests
  if (isRead && inflightRequests.has(dedupeKey)) {
    return inflightRequests.get(dedupeKey)!;
  }

  const doFetch = async () => {
    const userToken = await getUserToken();
    const headers = buildHeaders(
      userToken,
      isBodyRequest,
      options.headers as Record<string, string> | undefined,
    );
    const url = `${BASE_URL}${path}`;

    try {
      // 20s timeout — the warmup gate + auth probe guarantees the server is
      // fully ready before data requests fire. A 20s timeout is generous for
      // a warm server. The previous 35s timeout was counterproductive: a
      // request hanging for 35s wastes time that could be spent retrying
      // (which pokes the server and is more likely to succeed on a recycled
      // worker). With 5 retries × 20s, total worst-case is ~100s, but most
      // requests succeed within 2-5s on a warm server.
      const response = await fetchWithTimeout(url, { ...options, headers }, 20000);

      // ─── Handle 502/503/504 (cold start / proxy errors) ──
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        console.debug(`[FioTech] Server cold-start ${response.status} on ${method} ${path}`);
        // Signal mid-session cold start so subsequent 401s are treated as transient
        _lastColdStartSignal = Date.now();
        throw new ColdStartError(`Server returned ${response.status}`);
      }

      // ─── Handle 401 ───────────────────────────────────────
      if (response.status === 401) {
        if (signingOut) {
          throw new Error('Session expired. Please sign in again.');
        }

        console.debug(`[FioTech] API 401 ${method} ${path}: user token rejected.`);

        // During cold-start grace period, a 401 is likely transient
        // (backend auth service not ready) — skip the destructive
        // refresh→sign-out cascade and let the retry loop handle it.
        if (isInColdStartGrace()) {
          console.debug(`[FioTech] 401 during cold-start grace for ${method} ${path} — treating as transient`);
          throw new TransientAuthError(`Transient 401 on ${method} ${path}`);
        }

        // Single-flight refresh
        const freshToken = await singleFlightRefresh();

        if (freshToken) {
          const retryHeaders = buildHeaders(
            freshToken,
            isBodyRequest,
            options.headers as Record<string, string> | undefined,
          );
          const retryResponse = await fetchWithTimeout(url, { ...options, headers: retryHeaders }, 15000);

          if (!retryResponse.ok) {
            const errorText = await retryResponse.text();
            console.error(`API Retry ${retryResponse.status} ${method} ${path}`);
            if (retryResponse.status === 401) {
              console.error('Persistent 401 after refresh — signing out.');
              signingOut = true;
              await supabase.auth.signOut();
              signingOut = false;
            }
            throw new Error(`API Error ${retryResponse.status}: ${retryResponse.statusText}`);
          }

          const data = await retryResponse.json();
          if (isRead) setCache(path, data, responseCacheTtl(path));
          return data;
        }

        // Refresh failed — sign out only outside cold-start window
        console.error('Refresh returned no valid token — signing out.');
        signingOut = true;
        await supabase.auth.signOut();
        signingOut = false;
        throw new Error('Session expired. Please sign in again.');
      }

      // ─── Handle 429 ───────────────────────────────────────
      if (response.status === 429) {
        console.debug(`[FioTech] Rate limited on ${method} ${path}`);
        throw new Error('Too many requests. Please wait a moment.');
      }

      // ─── Other errors ─────────────────────────────────────
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${response.status}] ${method} ${path}`);
        // Parse detail from error body if available
        let detailMsg = '';
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.detail) detailMsg = ` (${parsed.detail})`;
        } catch { /* not JSON */ }
        throw new Error(`API Error ${response.status}: ${response.statusText}${detailMsg}`);
      }

      const data = await response.json();

      if (isRead) setCache(path, data, responseCacheTtl(path));

      // Invalidate relevant caches after writes
      if (!isRead) {
        if (path.startsWith('/properties')) invalidateCache('/properties');
        if (path.startsWith('/devices')) {
          invalidateCache('/devices');
          invalidateCache('/stats');
          invalidateCache('/properties');
        }
        if (path.startsWith('/alarms')) {
          invalidateCache('/alarms');
          invalidateCache('/notifications');
          invalidateCache('/alarm-chart-data');
          invalidateCache('/stats');
        }
        if (path.startsWith('/gateways')) {
          invalidateCache('/gateways');
          invalidateCache('/devices');
        }
        if (path.startsWith('/gateway-assign')) {
          invalidateCache('/gateways');
          invalidateCache('/devices');
          invalidateCache('/stats');
        }
        if (path.startsWith('/gateway-unassign')) {
          invalidateCache('/gateways');
          invalidateCache('/devices');
          invalidateCache('/stats');
        }
        if (path.startsWith('/gateway-heartbeat')) {
          invalidateCache('/gateways');
          invalidateCache('/devices');
          invalidateCache('/stats');
        }
        if (path.startsWith('/webhook-config') || path.startsWith('/webhook-test')) {
          invalidateCache('/webhook-config');
          invalidateCache('/sensor-data');
        }
        if (path.startsWith('/sensor-data')) {
          invalidateCache('/sensor-data');
        }
        if (path.startsWith('/settings')) invalidateCache('/settings');
        if (path.startsWith('/widget-layout')) invalidateCache('/widget-layout');
        if (path.startsWith('/reset-data')) invalidateCache();
        if (path.startsWith('/admin/users')) {
          invalidateCache('/admin/users');
        }
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.debug(`[FioTech] Network error fetching ${url}. CORS or connectivity issue.`);
        // Network errors during an active session often signal a worker recycle
        _lastColdStartSignal = Date.now();
      }
      throw error;
    }
  };

  /** Wrap doFetch with automatic retries on cold-start / network / transient auth errors.
   *  Since the ServerWarmupGate ensures the server is alive before any
   *  data-fetching component mounts, retries here are for transient
   *  platform hiccups (momentary 502/503 without CORS on concurrent bursts,
   *  or transient 401 when the backend auth service isn't ready yet).
   *  Backoff: 800ms → 1.6s → 3.2s → 4s × 4  (capped at 4s to recover
   *  faster — total wait budget ~21.6s across 7 retries). */
  const doFetchWithRetry = async () => {
    const MAX_NETWORK_RETRIES = 7;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
      try {
        return await doFetch();
      } catch (error) {
        lastError = error;
        const isRetryable =
          (error instanceof TypeError && error.message === 'Failed to fetch') ||
          (error instanceof ColdStartError) ||
          (error instanceof TransientAuthError);
        if (!isRetryable || attempt >= MAX_NETWORK_RETRIES) {
          throw error;
        }
        const errorType = error instanceof ColdStartError ? 'cold-start'
          : error instanceof TransientAuthError ? 'transient-auth'
          : 'network';
        // Cap backoff at 4s to keep recovery fast after cold-start
        const delay = Math.min(4000, 800 * Math.pow(2, attempt));
        console.debug(
          `[FioTech] Retry ${attempt + 1}/${MAX_NETWORK_RETRIES} for ${method} ${path} — ${errorType} error, waiting ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  };

  if (isRead) {
    const promise = doFetchWithRetry().finally(() => inflightRequests.delete(dedupeKey));
    inflightRequests.set(dedupeKey, promise);
    return promise;
  }

  return doFetchWithRetry();
}

// ===============================================================
// Type definitions
// ===============================================================

export interface Property {
  id: string;
  name: string;
  location: string;
  type: string;
  waterSensors: string;
  status: string;
  image: string;
  deviceCount?: number;
  onlineDevices?: number;
  offlineDevices?: number;
  warningDevices?: number;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  building: string;
  location: string;
  lastUpdate: string;
  battery: number;
  status: string;
  gateway?: string;
  devEui?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  capabilities?: string[];
  lastSeen?: string;
  signal?: number;
}

export interface AppSettings {
  profile: {
    name: string;
    email: string;
    role: string;
    company: string;
    phone: string;
    avatar?: string;
  };
  notifications: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    pushNotifications: boolean;
    alertTypes: {
      waterLeak: boolean;
      smoke: boolean;
      deviceOffline: boolean;
      highHumidity: boolean;
      temperature: boolean;
    };
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
  dashboard: {
    temperatureUnit: 'celsius' | 'fahrenheit';
    refreshInterval: number;
    compactMode: boolean;
    dateFormat: string;
    timezone: string;
  };
  security: {
    twoFactorEnabled: boolean;
    sessionTimeout: number;
    loginNotifications: boolean;
  };
}

export interface UploadResponse {
  url: string;
  path: string;
  fileName: string;
}

// ── Admin types ────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  accountType: string;
  role: string;
  company: string;
  phone: string;
  createdAt: string;
  lastSignIn: string | null;
  emailConfirmed: boolean;
  isMaster: boolean;
}

export interface AdminUserDetail extends AdminUser {
  profile: {
    name?: string;
    email?: string;
    role?: string;
    company?: string;
    phone?: string;
  } | null;
  notifications: any;
  dashboard: any;
  security: any;
  propertyCount: number;
  deviceCount: number;
}

export interface DashboardStats {
  properties: { total: number; images: string[] };
  devices: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    onlinePercent: number;
  };
  alarms: {
    totalPending: number;
    highSeverity: number;
    waterLeaks: number;
    systemWarnings: number;
  };
  water: { status: string; leakWarnings: number };
}

export interface WidgetLayout {
  order: string[];
  active: string[];
}

export interface PropertyDetails extends Property {
  devices: Device[];
  deviceCount: number;
  onlineDevices: number;
  offlineDevices: number;
  warningDevices: number;
}

export interface Alarm {
  id: string;
  type: string;
  location: string;
  property: string;
  severity: 'high' | 'medium' | 'low';
  time: string;
  status: 'pending' | 'resolved';
  description: string;
}

export interface Notification {
  id: string;
  type: string;
  property: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  time: string;
  description: string;
  read: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export interface AirQualityReading {
  propertyId: string;
  propertyName: string;
  aqi: number | null;
  co2: number | null;
  pm25: number | null;
  voc: number | null;
  temperature: number | null;
  humidity: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  sensorCount: number;
  sensorsOnline?: number;
}

export interface WaterZone {
  id: string;
  zone: string;
  pressure: number;
  flow: number;
  status: string;
  leakDetected: boolean;
}

export interface BMSItem {
  id: string;
  system: string;
  consumption: string;
  load: string;
  status: string;
}

export interface TelemetryResponse {
  airQuality: AirQualityReading[];
  waterZones: WaterZone[];
  bmsItems: BMSItem[];
  generatedAt: string;
  /** "live" when data comes from real webhook sensor uplinks; "simulated" for demo/synthetic */
  source?: 'live' | 'simulated';
}

export interface AlarmChartDay {
  name: string;
  water: number;
  smoke: number;
  temperature: number;
  deviceOffline: number;
}

export interface GatewayDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  battery: number;
}

export interface Gateway {
  id: string;
  name: string;
  model: string;
  protocol: string;
  property: string;
  location: string;
  ipAddress: string;
  macAddress: string;
  firmware: string;
  status: 'online' | 'offline' | 'warning';
  signal: number;
  uptime: string;
  lastSeen: string;
  connectedDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  warningDevices: number;
  devices: GatewayDevice[];
  // Protocol-specific optional fields
  imei?: string;
  apn?: string;
  simIccid?: string;
  ssid?: string;
  devEui?: string;
  panId?: string;
  channel?: string;
  frequencyBand?: string;
  bleAddress?: string;
  // Serial number (e.g. Milesight UG65 S/N)
  serialNumber?: string;
}

export interface AlarmZone {
  name: string;
  status: 'normal' | 'warning' | 'alert';
}

export interface AlarmTrendPoint {
  name: string;
  count: number;
}

export interface AlarmTelemetryResponse {
  zones: AlarmZone[];
  trendData: AlarmTrendPoint[];
  totalRelevantDevices: number;
  totalRelevantAlarms: number;
}

export interface WebhookConfig {
  token: string | null;
  webhookUrl: string | null;
  hasToken: boolean;
  lastReceived: string | null;
}

export interface WebhookTestResult {
  success: boolean;
  latencyMs?: number;
  entryId?: string | null;
  error?: string;
  status?: number;
}

export interface SensorDataEntry {
  id: string;
  eventType: 'uplink' | 'join' | 'ack' | 'error';
  devEUI: string;
  deviceName: string;
  applicationName: string;
  gatewayEUI: string;
  rssi: number;
  snr: number;
  frequency: number;
  fPort: number;
  fCnt: number;
  rawData: string;
  decodedData: Record<string, any> | null;
  receivedAt: string;
  uplinkTime: string;
  errorMessage?: string;
}

export interface SensorDevice {
  devEUI: string;
  deviceName: string;
  applicationName: string;
  lastSeen: string;
  uplinkCount: number;
  lastRssi: number;
  lastSnr: number;
  lastDecodedData: Record<string, any> | null;
}

export interface SensorDataResponse {
  entries: SensorDataEntry[];
  totalEntries: number;
  devices: SensorDevice[];
  totalDevices: number;
}

// ── Property-level live telemetry ─────────────────────────
export interface PropertyTelemetry {
  source: 'live' | 'none';
  sensorCount: number;
  environment: {
    temperature: number | null;
    humidity: number | null;
    co2: number | null;
    tvoc: number | null;
    pm2_5: number | null;
    pm10: number | null;
    barometric_pressure: number | null;
    illuminance: number | null;
    pir: number | null;
    sound_level_leq: number | null;
    sound_level_lmin: number | null;
    sound_level_lmax: number | null;
    water_leak: number | null;
  };
  zones: {
    id: string;
    name: string;
    status: string;
    sensors: number;
    alerts: number;
    devices: string[];
  }[];
  sensorList: {
    devEUI: string;
    deviceName: string;
  }[];
  deviceReadings: Record<string, {
    devEUI: string;
    deviceName: string;
    receivedAt: string;
    fCnt: number;
    rssi: number;
    decoded: Record<string, number>;
  }>;
  history: {
    _m: number;
    devEUI: string;
    deviceName: string;
    time: string;
    temperature: number | null;
    humidity: number | null;
    co2: number | null;
    tvoc: number | null;
    pm2_5: number | null;
    pm10: number | null;
    pressure: number | null;
    illuminance: number | null;
    sound_level_leq: number | null;
    sound_level_lmin: number | null;
    sound_level_lmax: number | null;
    water_leak: number | null;
  }[];
}

// ── Per-device history ───────────────────────────────────
export interface DeviceHistoryPoint {
  time: string;
  timeLabel: string;
  dateLabel: string;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  tvoc: number | null;
  pm2_5: number | null;
  pm10: number | null;
  pressure: number | null;
  illuminance: number | null;
  pir: number | null;
  battery: number | null;
  sound_level_leq: number | null;
  sound_level_lmin: number | null;
  sound_level_lmax: number | null;
  water_leak: number | null;
}

export interface DeviceHistoryResponse {
  devEui: string;
  totalEntries: number;
  points: DeviceHistoryPoint[];
}

// ===============================================================
// AWS IoT Core Integration Types
// ===============================================================

export interface AWSConfig {
  iotEndpoint: string;
  region: string;
  dynamoTableName: string;
  dynamoSortKey: string;
  dynamoPartitionKey: string;
  enabled: boolean;
  syncInterval: number;
  lastSyncAt: string | null;
  credentialsConfigured?: boolean;
}

export interface AWSStatus {
  configured: boolean;
  credentialsSet: boolean;
  iotCoreConnected: boolean;
  dynamoDBConnected: boolean;
  region: string;
  iotEndpoint: string;
  dynamoTableName: string;
  enabled: boolean;
  lastSyncAt: string | null;
  missingSecrets: string[];
}

export interface AWSIoTThing {
  thingName: string;
  thingArn?: string;
  thingId?: string;
  thingTypeName: string | null;
  attributes: Record<string, string>;
  version?: number;
  groups?: string[];
}

export interface AWSThingsResponse {
  things: AWSIoTThing[];
  nextToken: string | null;
  total: number;
}

export interface AWSDeviceShadow {
  thingName: string;
  shadow: any;
  state: {
    desired?: Record<string, any>;
    reported?: Record<string, any>;
    delta?: Record<string, any>;
  };
  metadata?: any;
  version?: number;
  timestamp?: number;
  message?: string;
}

export interface AWSSyncResult {
  success: boolean;
  summary: {
    awsThingsFound: number;
    created: number;
    updated: number;
    skipped: number;
    totalFioTechDevices: number;
  };
  syncedAt: string;
}

export interface AWSTelemetryResponse {
  source: string;
  tableName: string;
  items: Record<string, any>[];
  count: number;
  queryParams: {
    deviceId: string | null;
    hoursBack: number;
    limit: number;
  };
}

// ===============================================================
// Helpers
// ===============================================================

/** Append ?forUser=<userId> to a path (handles existing query strings). */
function withForUser(path: string, forUser?: string): string {
  if (!forUser) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}forUser=${encodeURIComponent(forUser)}`;
}

// ===============================================================
// API methods
// ===============================================================

export const api = {
  signup: (data: {
    email: string;
    password: string;
    name: string;
    accountType?: string;
  }): Promise<{ success: boolean; userId: string; accountType: string }> =>
    fetchWithAuth('/signup', { method: 'POST', body: JSON.stringify(data) }),

  // Properties
  getProperties: (): Promise<Property[]> => fetchWithAuth('/properties'),
  getProperty: (id: string): Promise<PropertyDetails> =>
    fetchWithAuth(`/properties/${id}`),
  addProperty: (data: Partial<Property>): Promise<Property> =>
    fetchWithAuth('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProperty: (id: string, data: Partial<Property>): Promise<Property> =>
    fetchWithAuth(`/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updatePropertyPhoto: (id: string, image: string): Promise<Property> =>
    fetchWithAuth(`/properties/${id}/photo`, {
      method: 'PUT',
      body: JSON.stringify({ image }),
    }),
  deleteProperty: (
    id: string,
  ): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(`/properties/${id}`, { method: 'DELETE' }),

  // Devices
  getDevices: (): Promise<Device[]> => fetchWithAuth('/devices'),
  addDevice: (data: Partial<Device>): Promise<Device> =>
    fetchWithAuth('/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDevice: (id: string, data: Partial<Device>): Promise<Device> =>
    fetchWithAuth(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDevice: (
    id: string,
  ): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(`/devices/${id}`, { method: 'DELETE' }),
  assignDevice: (deviceId: string, buildingName: string): Promise<Device> =>
    fetchWithAuth(`/devices/${deviceId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ building: buildingName }),
    }),

  // Stats
  getStats: (): Promise<DashboardStats> => fetchWithAuth('/stats'),

  // Settings
  getSettings: (): Promise<AppSettings> => fetchWithAuth('/settings'),
  updateSettings: (data: Partial<AppSettings>): Promise<AppSettings> =>
    fetchWithAuth('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  resetData: (): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth('/reset-data', { method: 'POST' }),
  exportData: (): Promise<any> => fetchWithAuth('/export'),
  healthCheck: (): Promise<{ status: string }> => fetchWithAuth('/health'),

  // Widget Layout
  getWidgetLayout: (): Promise<WidgetLayout> =>
    fetchWithAuth('/widget-layout'),
  saveWidgetLayout: (data: WidgetLayout): Promise<WidgetLayout> =>
    fetchWithAuth('/widget-layout', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Alarms
  getAlarms: (): Promise<Alarm[]> => fetchWithAuth('/alarms'),
  updateAlarm: (id: string, data: Partial<Alarm>): Promise<Alarm> =>
    fetchWithAuth(`/alarms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteAlarm: (id: string): Promise<{ success: boolean }> =>
    fetchWithAuth(`/alarms/${id}`, { method: 'DELETE' }),
  bulkResolveAlarms: (): Promise<{ success: boolean; resolved: number }> =>
    fetchWithAuth('/alarms/bulk-resolve', { method: 'POST' }),
  bulkDismissAlarms: (): Promise<{ success: boolean; dismissed: number }> =>
    fetchWithAuth('/alarms/bulk-dismiss', { method: 'POST' }),

  // Notifications
  getNotifications: (): Promise<NotificationsResponse> =>
    fetchWithAuth('/notifications'),

  // Telemetry
  getTelemetry: (): Promise<TelemetryResponse> => fetchWithAuth('/telemetry'),

  // Chart data
  getAlarmChartData: (): Promise<AlarmChartDay[]> =>
    fetchWithAuth('/alarm-chart-data'),

  // Dashboard bundle — single request for all Dashboard data (properties + stats + telemetry + alarmChart + layout + settings)
  getDashboardBundle: (): Promise<{
    properties: Property[];
    stats: DashboardStats;
    telemetry: TelemetryResponse | null;
    alarmChartData: AlarmChartDay[];
    widgetLayout: WidgetLayout;
    settings: AppSettings;
    generatedAt: string;
  }> => fetchWithAuth('/dashboard-bundle'),

  // Gateways
  getGateways: (): Promise<Gateway[]> => fetchWithAuth('/gateways'),
  getGateway: (id: string): Promise<Gateway> =>
    fetchWithAuth(`/gateways/${id}`),
  addGateway: (data: Partial<Gateway>): Promise<Gateway> =>
    fetchWithAuth('/gateways', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateGateway: (id: string, data: Partial<Gateway>): Promise<Gateway> =>
    fetchWithAuth(`/gateways/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteGateway: (
    id: string,
  ): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(`/gateways/${id}`, { method: 'DELETE' }),

  // Assign devices to a gateway in batch
  assignDevicesToGateway: (
    gatewayId: string,
    deviceIds: string[],
  ): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth('/gateway-assign-devices', {
      method: 'PUT',
      body: JSON.stringify({ gatewayId, deviceIds }),
    }),

  // Unassign a single device from its gateway
  unassignDeviceFromGateway: (
    deviceId: string,
  ): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth('/gateway-unassign-device', {
      method: 'PUT',
      body: JSON.stringify({ deviceId }),
    }),

  // Gateway heartbeat — real gateways call this periodically to report they are alive
  gatewayHeartbeat: (
    gatewayId: string,
    data?: { signal?: number; firmware?: string; ipAddress?: string },
  ): Promise<{ success: boolean; status: string; signal: number; lastSeen: string }> =>
    fetchWithAuth('/gateway-heartbeat', {
      method: 'POST',
      body: JSON.stringify({ gatewayId, ...data }),
    }),

  // Batch gateway heartbeat
  gatewayHeartbeatBatch: (
    heartbeats: Array<{ gatewayId: string; signal?: number }>,
  ): Promise<{ success: boolean; results: any[] }> =>
    fetchWithAuth('/gateway-heartbeat-batch', {
      method: 'POST',
      body: JSON.stringify({ heartbeats }),
    }),

  // Alarm telemetry (zones + trend data from real backend data)
  getAlarmTelemetry: (
    type: 'water' | 'fire' | 'smoke',
  ): Promise<AlarmTelemetryResponse> =>
    fetchWithAuth(`/alarm-telemetry?type=${type}`),

  // Webhook config for Milesight gateway integration
  getWebhookConfig: (): Promise<WebhookConfig> =>
    fetchWithAuth('/webhook-config'),
  generateWebhookToken: (): Promise<WebhookConfig> =>
    fetchWithAuth('/webhook-config', { method: 'POST' }),
  testWebhookConnection: (): Promise<WebhookTestResult> =>
    fetchWithAuth('/webhook-test', { method: 'POST' }),

  // Sensor data from webhook uplinks
  getSensorData: (limit = 50): Promise<SensorDataResponse> =>
    fetchWithAuth(`/sensor-data?limit=${limit}`),

  // Per-device historical data (supports period: 24h, 3d)
  getDeviceHistory: (devEui: string, period = '24h'): Promise<DeviceHistoryResponse> =>
    fetchWithAuth(`/device-history/${encodeURIComponent(devEui)}?period=${period}`),

  // Property-level live telemetry (real sensor data)
  getPropertyTelemetry: (propertyId: string): Promise<PropertyTelemetry> =>
    fetchWithAuth(`/properties/${propertyId}/telemetry`),

  // Account type
  getAccountType: (): Promise<{ accountType: string }> =>
    fetchWithAuth('/account-type'),

  // ── AWS IoT Core Integration ──────────────────────────

  // AWS status & configuration
  getAWSStatus: (): Promise<AWSStatus> => fetchWithAuth('/aws/status'),
  getAWSConfig: (): Promise<AWSConfig> => fetchWithAuth('/aws/config'),
  updateAWSConfig: (data: Partial<AWSConfig>): Promise<{ success: boolean; config: AWSConfig }> =>
    fetchWithAuth('/aws/config', { method: 'PUT', body: JSON.stringify(data) }),

  // AWS IoT Things
  getAWSThings: (limit = 50, nextToken?: string): Promise<AWSThingsResponse> =>
    fetchWithAuth(`/aws/things?limit=${limit}${nextToken ? `&nextToken=${nextToken}` : ''}`),
  getAWSThing: (thingName: string): Promise<AWSIoTThing> =>
    fetchWithAuth(`/aws/things/${encodeURIComponent(thingName)}`),

  // Device Shadows (read + bidirectional control)
  getAWSThingShadow: (thingName: string, shadowName?: string): Promise<AWSDeviceShadow> =>
    fetchWithAuth(`/aws/things/${encodeURIComponent(thingName)}/shadow${shadowName ? `?shadowName=${shadowName}` : ''}`),
  updateAWSThingShadow: (thingName: string, desired: Record<string, any>): Promise<{ success: boolean; thingName: string; shadow: any }> =>
    fetchWithAuth(`/aws/things/${encodeURIComponent(thingName)}/shadow`, {
      method: 'PUT',
      body: JSON.stringify({ state: { desired } }),
    }),

  // MQTT publish (bidirectional control)
  publishAWSMessage: (topic: string, payload: any, qos: 0 | 1 = 1): Promise<{ success: boolean; topic: string }> =>
    fetchWithAuth('/aws/publish', {
      method: 'POST',
      body: JSON.stringify({ topic, payload, qos }),
    }),

  // AWS DynamoDB telemetry
  getAWSTelemetry: (deviceId?: string, hours = 24, limit = 50): Promise<AWSTelemetryResponse> =>
    fetchWithAuth(`/aws/telemetry?${deviceId ? `deviceId=${encodeURIComponent(deviceId)}&` : ''}hours=${hours}&limit=${limit}`),

  // Sync AWS Things → FioTech devices
  syncAWSDevices: (): Promise<AWSSyncResult> =>
    fetchWithAuth('/aws/sync-devices', { method: 'POST' }),

  // Push FioTech telemetry → AWS IoT Core
  pushTelemetryToAWS: (deviceName?: string, topic?: string): Promise<{ success: boolean; topic: string; entriesPushed: number }> =>
    fetchWithAuth('/aws/push-telemetry', {
      method: 'POST',
      body: JSON.stringify({ deviceName, topic }),
    }),

  // ── Admin / System Master ─────────────────────────────

  // Check if current user is admin
  checkAdmin: (): Promise<{ isAdmin: boolean }> =>
    fetchWithAuth('/admin/check'),

  // List all users (admin only)
  adminListUsers: (page = 1, perPage = 50): Promise<{ users: AdminUser[]; total: number; page: number; perPage: number }> =>
    fetchWithAuth(`/admin/users?page=${page}&perPage=${perPage}`),

  // Get single user details (admin only)
  adminGetUser: (id: string): Promise<AdminUserDetail> =>
    fetchWithAuth(`/admin/users/${id}`),

  // Update user profile/settings/password/email (admin only)
  adminUpdateUser: (id: string, data: Record<string, any>): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Delete user (admin only)
  adminDeleteUser: (id: string): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(`/admin/users/${id}`, { method: 'DELETE' }),

  // Upload image to Supabase Storage via server
  uploadImage: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const userToken = await getUserToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
    };
    if (userToken) {
      headers['x-user-token'] = userToken;
    }

    const url = `${BASE_URL}/upload`;
    return fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `API Error [${response.status}] POST /upload:`,
          errorText,
        );
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      return response.json();
    });
  },

  // ── Admin: manage resources for a specific user (forUser) ──

  adminGetUserProperties: (forUser: string): Promise<Property[]> =>
    fetchWithAuth(withForUser('/properties', forUser)),
  adminAddProperty: (forUser: string, data: Partial<Property>): Promise<Property> =>
    fetchWithAuth(withForUser('/properties', forUser), {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdateProperty: (forUser: string, id: string, data: Partial<Property>): Promise<Property> =>
    fetchWithAuth(withForUser(`/properties/${id}`, forUser), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  adminDeleteProperty: (forUser: string, id: string): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(withForUser(`/properties/${id}`, forUser), { method: 'DELETE' }),

  adminGetUserDevices: (forUser: string): Promise<Device[]> =>
    fetchWithAuth(withForUser('/devices', forUser)),
  adminAddDevice: (forUser: string, data: Partial<Device>): Promise<Device> =>
    fetchWithAuth(withForUser('/devices', forUser), {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdateDevice: (forUser: string, id: string, data: Partial<Device>): Promise<Device> =>
    fetchWithAuth(withForUser(`/devices/${id}`, forUser), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  adminDeleteDevice: (forUser: string, id: string): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(withForUser(`/devices/${id}`, forUser), { method: 'DELETE' }),
  adminAssignDevice: (forUser: string, deviceId: string, buildingName: string): Promise<Device> =>
    fetchWithAuth(withForUser(`/devices/${deviceId}/assign`, forUser), {
      method: 'PUT',
      body: JSON.stringify({ building: buildingName }),
    }),

  adminGetUserGateways: (forUser: string): Promise<Gateway[]> =>
    fetchWithAuth(withForUser('/gateways', forUser)),
  adminAddGateway: (forUser: string, data: Partial<Gateway>): Promise<Gateway> =>
    fetchWithAuth(withForUser('/gateways', forUser), {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdateGateway: (forUser: string, id: string, data: Partial<Gateway>): Promise<Gateway> =>
    fetchWithAuth(withForUser(`/gateways/${id}`, forUser), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  adminDeleteGateway: (forUser: string, id: string): Promise<{ success: boolean; message: string }> =>
    fetchWithAuth(withForUser(`/gateways/${id}`, forUser), { method: 'DELETE' }),

  /** Assign (copy/transfer) a property + its linked devices from admin to another user */
  adminAssignPropertyToUser: (
    propertyId: string,
    targetUserId: string,
    options?: { includeDevices?: boolean; removeFromSource?: boolean }
  ): Promise<{
    success: boolean;
    message: string;
    property: Property;
    devicesCopied: number;
    devicesRemoved: number;
    targetUserEmail: string;
  }> =>
    fetchWithAuth('/admin/assign-property', {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        targetUserId,
        includeDevices: options?.includeDevices ?? true,
        removeFromSource: options?.removeFromSource ?? false,
      }),
    }),
};