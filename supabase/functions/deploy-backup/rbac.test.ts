/**
 * RBAC Authorization Tests
 *
 * Validates that server-side role-based access control is enforced correctly.
 * Run against the live or staging endpoint using:
 *   SUPABASE_URL=<url> ANON_KEY=<key> VIEWER_TOKEN=<jwt> ADMIN_TOKEN=<jwt> deno test rbac.test.ts
 *
 * These tests verify the security fixes for:
 *   - CVE: Broken access control on /webhook-config (High)
 *   - CVE: Broken access control on /export (Medium)
 *   - CVE: Operational metadata leakage on /health (Low)
 */

const BASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("ANON_KEY") || "";
const VIEWER_TOKEN = Deno.env.get("VIEWER_TOKEN") || "";
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "";

const API_PATH = "/functions/v1/make-server-4916a0b9";

function headers(userToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey": ANON_KEY,
  };
  if (userToken) h["x-user-token"] = userToken;
  return h;
}

async function apiCall(
  method: string,
  path: string,
  userToken?: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${BASE_URL}${API_PATH}${path}`;
  const opts: RequestInit = {
    method,
    headers: headers(userToken),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── /health — should not leak internal state ──

Deno.test("/health returns minimal payload (no schemaReady)", async () => {
  const { status, data } = await apiCall("GET", "/health");
  if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  const d = data as Record<string, unknown>;
  if (d.schemaReady !== undefined) {
    throw new Error("Health endpoint should not expose schemaReady");
  }
  if (d.status !== "ok") throw new Error("Expected status 'ok'");
});

// ── /webhook-config — must be admin-only ──

Deno.test("GET /webhook-config — unauthenticated → 401", async () => {
  const { status } = await apiCall("GET", "/webhook-config");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("GET /webhook-config — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return; // skip if no viewer token provided
  const { status } = await apiCall("GET", "/webhook-config", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("GET /webhook-config — Admin → 200", async () => {
  if (!ADMIN_TOKEN) return;
  const { status } = await apiCall("GET", "/webhook-config", ADMIN_TOKEN);
  if (status !== 200) throw new Error(`Expected 200, got ${status}`);
});

Deno.test("POST /webhook-config — unauthenticated → 401", async () => {
  const { status } = await apiCall("POST", "/webhook-config");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("POST /webhook-config — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/webhook-config", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("PUT /webhook-config — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("PUT", "/webhook-config", VIEWER_TOKEN, { hmacSecret: "test" });
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

// ── /webhook-test — must be admin-only ──

Deno.test("POST /webhook-test — unauthenticated → 401", async () => {
  const { status } = await apiCall("POST", "/webhook-test");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("POST /webhook-test — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/webhook-test", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

// ── /webhook-debug — must be admin-only ──

Deno.test("GET /webhook-debug — unauthenticated → 401", async () => {
  const { status } = await apiCall("GET", "/webhook-debug");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("GET /webhook-debug — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("GET", "/webhook-debug", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

// ── /export — must be admin-only ──

Deno.test("GET /export — unauthenticated → 401", async () => {
  const { status } = await apiCall("GET", "/export");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("GET /export — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("GET", "/export", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("GET /export — Admin → 200", async () => {
  if (!ADMIN_TOKEN) return;
  const { status } = await apiCall("GET", "/export", ADMIN_TOKEN);
  if (status !== 200) throw new Error(`Expected 200, got ${status}`);
});

// ── /reset-data — must be admin-only ──

Deno.test("POST /reset-data — unauthenticated → 401", async () => {
  const { status } = await apiCall("POST", "/reset-data");
  if (status !== 401) throw new Error(`Expected 401, got ${status}`);
});

Deno.test("POST /reset-data — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/reset-data", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

// ── /device-history — unknown devEui should return 404 ──

Deno.test("GET /device-history/FFFFFFFFFFFFFFFF — should return 404", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("GET", "/device-history/FFFFFFFFFFFFFFFF?period=24h", VIEWER_TOKEN);
  if (status !== 404) throw new Error(`Expected 404, got ${status}`);
});

// ── Admin routes that should already work ──

Deno.test("GET /admin/users — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("GET", "/admin/users", VIEWER_TOKEN);
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("POST /admin/assign-property — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/admin/assign-property", VIEWER_TOKEN, {});
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("POST /properties — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/properties", VIEWER_TOKEN, {});
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("POST /devices — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/devices", VIEWER_TOKEN, {});
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});

Deno.test("POST /gateways — Viewer → 403", async () => {
  if (!VIEWER_TOKEN) return;
  const { status } = await apiCall("POST", "/gateways", VIEWER_TOKEN, {});
  if (status !== 403) throw new Error(`Expected 403, got ${status}`);
});
