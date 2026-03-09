# FioTec IoT Dashboard — Comprehensive Security Audit Report V2

> **Date**: 2025-07-15  
> **Scope**: Full-stack security audit of FioTec React + Supabase IoT platform  
> **Auditor**: GitHub Copilot (Claude Opus 4.6)  
> **Compared Against**: Previous audit dated 2026-02-24 (SECURITY_AUDIT_REPORT.md)

---

## Executive Summary

The FioTec platform has made **significant security improvements** since the previous audit — CORS is now origin-restricted, CSP is present, security headers are deployed, hardcoded testing credentials have been removed from login, and admin password resets require re-authentication. However, **5 critical findings** remain, primarily around leaked secrets in documentation and `/tmp` scripts, plus several high/medium issues requiring attention.

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 5 | 3 new, 2 carried forward |
| 🟠 HIGH | 5 | 2 new, 3 partially fixed |
| 🟡 MEDIUM | 6 | All new |
| 🔵 LOW | 4 | All new/informational |
| ✅ FIXED | 8 | From previous audit |

---

## 🔴 CRITICAL FINDINGS

### C1. Service Role Key Exposed in /tmp Scripts

**Category**: Hardcoded Secrets  
**Files**: `/tmp/diagnose_offline.py:7`, `/tmp/diagnose2.py:3`, `/tmp/diagnose3.py:3`

```
SVC_KEY = "eyJhbGciOiJIUzI1NiIs...cm9sZSIsIm..."
```

The **full Supabase service_role JWT** is hardcoded in three Python diagnostic scripts. This key provides god-mode access to the database — bypasses all RLS, can read/write/delete any data, create/delete users, and manage the entire project.

**Fix**:
1. **Immediately rotate** the service_role key in Supabase Dashboard → Settings → API
2. Delete all `/tmp/diagnose*.py` files: `rm /tmp/diagnose_offline.py /tmp/diagnose2.py /tmp/diagnose3.py`
3. After rotation, update `SUPABASE_SERVICE_ROLE_KEY` in Supabase Edge Function secrets
4. Never hardcode service keys in scripts — use `os.environ.get("SUPABASE_SERVICE_ROLE_KEY")`

---

### C2. Supabase Personal Access Tokens Exposed

**Category**: Hardcoded Secrets  
**Files**:
- `SECURITY_AUDIT_REPORT.md:67` — `sbp_68d4952355f4cd1f0ab08a0546ccf66c5ffabf0e`
- `/tmp/update_fiotech_templates.py:3` — `sbp_88b0feeffa6a977ed46ca582f1357f8050f182b9`
- `/tmp/update_fiotech_templates2.py:3` — same token
- `/tmp/update_fiotec_templates.py:3` — same token

Supabase personal access tokens (`sbp_*`) grant **full management API access**: deploy functions, manage secrets, delete data, modify project settings. Two distinct tokens are exposed.

**Fix**:
1. **Immediately revoke both tokens** at https://supabase.com/dashboard/account/tokens
2. Delete `/tmp/update_fiotech_templates*.py` and `/tmp/update_fiotec_templates.py`
3. Remove the literal token from `SECURITY_AUDIT_REPORT.md` line 67 (replace with `[REDACTED]`)
4. Generate new tokens and store in `.env.local` or a secrets manager

---

### C3. Anon Key Exposed in Git-Tracked Documentation

**Category**: Exposed Sensitive Data  
**Files**:
- `AI_TEAM_HANDOFF.md:19` — full anon key JWT
- `FIOTECH_PROJECT_KNOWLEDGE.txt:41` — full anon key JWT
- `utils/supabase/info.tsx:4` — full anon key JWT (by Supabase design)
- `index.html:11` — project ID in preconnect URL

While the Supabase anon key is architecturally "public," exposing it alongside the project ID in documentation means anyone can:
- Call the Supabase API directly, bypassing Edge Function rate limiting
- Attempt direct signups if Supabase Auth public signups aren't disabled
- Enumerate auth endpoints and attempt credential stuffing

**Fix**:
1. **Disable public signups** in Supabase Dashboard → Auth → Settings (force all signups through `/signup` endpoint)
2. Add `AI_TEAM_HANDOFF.md` and `FIOTECH_PROJECT_KNOWLEDGE.txt` to `.gitignore`
3. Replace credentials in documentation with `[REDACTED — see .env.local]`
4. Enable Auth rate limiting in Supabase Dashboard → Auth → Rate Limits

---

### C4. Hardcoded MASTER_USER_ID Fallback

**Category**: Authorization Bypass  
**File**: `supabase/functions/server/routes.tsx:85`

```typescript
const MASTER_USER_ID = Deno.env.get("MASTER_USER_ID") || "5a386250-7710-4a83-8942-5dc45201303f";
```

If the `MASTER_USER_ID` environment variable is not set (misconfiguration, cold-start issue), any attacker who knows this UUID — now exposed in this audit and in the source code — could potentially register or takeover that UUID to gain admin access. The `requireAdmin()` function checks both email AND user ID, so exploitability requires both to match, but the hardcoded fallback is still a defense-in-depth failure.

**Fix**:
1. Remove the fallback — fail closed if env var is missing:
   ```typescript
   const MASTER_USER_ID = Deno.env.get("MASTER_USER_ID");
   // In requireAdmin(): if (!MASTER_USER_ID) return c.json({ error: "Server misconfigured" }, 500);
   ```
2. Ensure `MASTER_USER_ID` is always set in Supabase Edge Function secrets

---

### C5. Webhook Token Comparison Not Constant-Time

**Category**: Authentication Issues  
**File**: `supabase/functions/server/routes.tsx:2566, 2664`

```typescript
if (storedToken !== token) return c.json({ ... }, 401);
```

String comparison with `!==` is vulnerable to **timing attacks** — an attacker can determine the correct token character-by-character by measuring response times. Webhook tokens are 48 hex chars (192 bits), making brute force impractical, but this is a defense-in-depth failure.

Note: The HMAC comparison at line 2679 (`expected !== provided`) has the **same issue**.

**Fix**:
```typescript
// Use Deno's constant-time comparison
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

---

## 🟠 HIGH FINDINGS

### H1. In-Memory Rate Limiter Resets on Cold Start

**Category**: Rate Limiting  
**File**: `supabase/functions/server/routes.tsx:249`

```typescript
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
```

Supabase Edge Functions recycle after ~30s of inactivity. Each cold start resets the Map, allowing attackers to burst requests by timing them around cold starts. This applies to all rate limits (global, write, webhook).

**Fix**:
1. Persist rate-limit counters in KV store (with short TTL)
2. Or use Supabase's built-in Auth rate limiting for auth endpoints
3. Consider Cloudflare/Vercel rate limiting at the edge

---

### H2. No Dedicated Signup Rate Limit

**Category**: Rate Limiting  
**File**: `supabase/functions/server/routes.tsx:1004`

The signup endpoint is gated by `requireAdmin()` (only admins can create accounts), which mitigates mass-signup abuse. However, there is no dedicated rate limit for signup — it shares the global 120 req/min limit. A compromised admin account could rapidly create accounts.

**Fix**:
```typescript
app.post("/make-server-4916a0b9/signup", async (c: any) => {
  const ip = getClientIp(c);
  if (!rateLimit(ip + ":signup", 5, 900000)) // 5 per 15 min
    return c.json({ error: "Too many signup attempts." }, 429);
  // ...existing code
});
```

---

### H3. X-Forwarded-For IP Extraction Uses Rightmost Entry

**Category**: Rate Limiting  
**File**: `supabase/functions/server/routes.tsx:277`

```typescript
return parts[parts.length - 1] || "unknown";
```

Using the **rightmost** IP in `X-Forwarded-For` is correct for some proxy chains (Cloudflare → Vercel → Supabase), but incorrect for others. The correct entry depends on which proxy you trust. On Supabase Edge Functions, the **first untrusted** IP (typically `parts[0]`) is usually the real client. Using the rightmost means the rate limiter may be keying on a proxy IP shared by all users, or an attacker can inject a fake leftmost IP.

**Fix**:
1. Verify the proxy chain for Supabase Edge Functions
2. Document which position is the real client IP
3. Consider using `cf-connecting-ip` or `x-real-ip` as primary

---

### H4. CSP Allows 'unsafe-inline' for Scripts

**Category**: CORS / CSP  
**File**: `index.html:7`

```html
script-src 'self' 'unsafe-inline';
```

`unsafe-inline` allows inline `<script>` tags and event handlers, which significantly weakens CSP's XSS protection. If an attacker can inject HTML, they can execute arbitrary JavaScript.

**Fix**:
1. Remove `'unsafe-inline'` from `script-src`
2. Use nonce-based CSP: `script-src 'self' 'nonce-<random>'`
3. If Vite requires inline scripts during dev, use a separate dev CSP

---

### H5. MASTER_EMAILS Hardcoded Fallback

**Category**: Authorization  
**File**: `supabase/functions/server/routes.tsx:80`

```typescript
const MASTER_EMAILS = new Set(
  (Deno.env.get("MASTER_EMAILS") || "master@fiotec.io")
    .split(",").map(...)
);
```

If the env var is unset, only `master@fiotec.io` is admin. This is a known email that could be targeted for credential stuffing.

**Fix**: Same as C4 — fail closed if env var is missing rather than falling back.

---

## 🟡 MEDIUM FINDINGS

### M1. Documentation Files Not in .gitignore

**Category**: Exposed Sensitive Data  
**File**: `.gitignore`

The following files contain sensitive project details (credentials, architecture, API keys) and are NOT excluded from version control:
- `AI_TEAM_HANDOFF.md`
- `FIOTECH_PROJECT_KNOWLEDGE.txt`
- `SECURITY_AUDIT_REPORT.md`
- `.github/copilot-instructions.md`

**Fix**:
```gitignore
# Sensitive documentation
AI_TEAM_HANDOFF.md
FIOTECH_PROJECT_KNOWLEDGE.txt
SECURITY_AUDIT_REPORT*.md
```

---

### M2. No Audit Logging for Admin Operations

**Category**: Authentication / Authorization  
**File**: `supabase/functions/server/routes.tsx` (throughout)

Admin actions (creating users, resetting passwords, deleting accounts) produce `console.log` entries but no structured audit trail. If an admin account is compromised, there's no way to trace what was done.

**Fix**:
1. Persist admin action logs to KV: `{ action, adminId, targetUserId, timestamp, ip }`
2. Add an admin-only `/audit-log` endpoint to review actions

---

### M3. safeMerge Allows Deep Key Injection

**Category**: Input Validation  
**File**: `supabase/functions/server/routes.tsx` (safeMerge function)

While `safeMerge` blocks `__proto__`, `constructor`, and `prototype` at the top level, and enforces a depth limit of 5, it allows **arbitrary nested keys** within allowed top-level keys. An attacker could inject unexpected nested properties into settings or profile objects.

**Fix**: Add a whitelist of allowed nested keys for critical objects (settings, profile).

---

### M4. Webhook HMAC Comparison Not Constant-Time

**Category**: Webhook Security  
**File**: `supabase/functions/server/routes.tsx:2679`

```typescript
if (expected !== provided) {
```

Same timing-attack issue as C5, but specifically for HMAC signature verification. This is particularly concerning because HMAC secrets may have lower entropy than webhook tokens.

**Fix**: Use the same `safeCompare()` function recommended in C5.

---

### M5. Error Messages May Leak Internal Details

**Category**: Input Validation  
**File**: `supabase/functions/server/routes.tsx:2553`

```typescript
return c.json({ success: false, ..., error: `Endpoint returned ${resp.status}: ${errText.slice(0, 200)}` });
```

The webhook test endpoint returns upstream error text (truncated to 200 chars) to the client. This could leak internal infrastructure details.

**Fix**: Return a generic error message; log details server-side only.

---

### M6. Webhook Debug Log Shared Across Users

**Category**: Webhook Security  
**File**: `supabase/functions/server/routes.tsx:2640-2650`

```typescript
WEBHOOK_DEBUG_LOG.unshift(debugEntry);
// ...
await kvSetWithRetry("webhook_debug_log", log);
```

The webhook debug log is stored in a single global KV key `webhook_debug_log`, not namespaced per user. If the debug log endpoint is accessible, one user could see another user's webhook data.

**Fix**: Namespace debug logs per user: `webhook_debug_log_${userId}`

---

## 🔵 LOW FINDINGS

### L1. dangerouslySetInnerHTML in Charts (NOT Exploitable)

**Category**: XSS  
**File**: `src/app/components/Charts.tsx:88`

`dangerouslySetInnerHTML` is used to inject CSS from a hardcoded `THEMES` object. Since the content is not user-controlled, this is **not exploitable** but should be noted for future reference.

**Status**: Acceptable — no action needed.

---

### L2. Demo Mode Uses Known Token

**Category**: Authentication  
**File**: `src/app/utils/AuthContext.tsx:53, 276`

```typescript
access_token: 'demo-token',
```

The demo mode uses a hardcoded `demo-token` string. This is purely client-side (demo mode serves static data from `demoData.ts`), so there is no real security risk.

**Status**: Acceptable — document that demo mode is client-side only.

---

### L3. Project ID in HTML Source

**Category**: Exposed Sensitive Data  
**File**: `index.html:11`

```html
<link rel="preconnect" href="https://wjvbojulgpmpblmterfy.supabase.co" crossorigin />
```

The Supabase project ID is visible in the HTML source. This is inherent to the architecture but exposes the API endpoint.

**Status**: Low risk; mitigated by RLS and auth requirements.

---

### L4. JWT Expiry Buffer of 60 Seconds

**Category**: Authentication  
**File**: `src/app/utils/api.ts`

The token refresh logic uses a 60-second buffer before expiry. A narrow window exists where an expired token might be used.

**Status**: Acceptable — standard practice.

---

## ✅ FIXED SINCE PREVIOUS AUDIT

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| F1 | Hardcoded testing credentials in Login.tsx (`Master2025`, `testing123`) | ✅ FIXED | `Login.tsx` only has demo login (offline mode) |
| F2 | CORS wildcard `*` | ✅ FIXED | `index.tsx` restricts to `PROD_ORIGINS` + `DEV_ORIGINS` |
| F3 | Missing CSP | ✅ FIXED | `index.html` has comprehensive CSP meta tag |
| F4 | Missing HSTS / Security Headers | ✅ FIXED | `vercel.json` has HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| F5 | Admin password reset without re-auth | ✅ FIXED | `routes.tsx:3335` requires `signInWithPassword` before password change |
| F6 | No password length validation on admin update | ✅ FIXED | `routes.tsx` enforces 8-128 char range |
| F7 | Supabase access token in `AI_TEAM_HANDOFF.md` | ✅ FIXED | Token is now `[REDACTED — see .env.local or 1Password]` |
| F8 | X-Forwarded-For used leftmost (spoofable) | ✅ PARTIALLY FIXED | Now uses rightmost entry (see H3) |

---

## ✅ POSITIVE SECURITY CONTROLS

| Control | Status | Location |
|---------|--------|----------|
| Input sanitization (string, URL, number, enum) | ✅ | `routes.tsx` — `sanitizeString`, `sanitizeUrl`, `sanitizeNumber`, `sanitizeEnum` |
| Prototype pollution protection | ✅ | `routes.tsx` — `safeMerge` blocks `__proto__`, `constructor`, `prototype` |
| Auth token separation (anon + user JWT) | ✅ | `api.ts`, `routes.tsx` |
| Rate limiting (global/write/webhook) | ✅ | `routes.tsx` — 120/min global, 30/min writes, 60/min webhook |
| Body size guard (1 MB) | ✅ | `routes.tsx:981` |
| Collection limits | ✅ | 100 properties, 500 devices, 100 gateways |
| No SQL injection surface | ✅ | KV store (no raw SQL) |
| File upload validation | ✅ | Type whitelist, 10 MB limit |
| User data isolation | ✅ | `uk(userId, collection)` — all data namespaced |
| Admin double-gate | ✅ | `MASTER_EMAILS` + `MASTER_USER_ID` both required |
| Webhook token entropy | ✅ | `whk_` + 24 random bytes (192 bits) |
| CORS restricted | ✅ | Only production + dev origins allowed |
| CSP present | ✅ | Comprehensive policy (minus `unsafe-inline`) |
| HSTS enabled | ✅ | 2 years, includeSubDomains, preload |
| Service role key server-only | ✅ | Only accessed via `Deno.env.get()` in Edge Functions |

---

## Priority Action Plan

### Immediate (Do Now)
1. **Rotate service_role key** — Supabase Dashboard → Settings → API → Regenerate
2. **Revoke both sbp_ tokens** — https://supabase.com/dashboard/account/tokens
3. **Delete /tmp scripts** — `rm /tmp/diagnose*.py /tmp/update_fio*.py`
4. **Redact token in SECURITY_AUDIT_REPORT.md** line 67

### This Week
5. Add documentation files to `.gitignore`
6. Remove hardcoded fallbacks for `MASTER_USER_ID` and `MASTER_EMAILS`
7. Implement constant-time comparison for webhook tokens and HMAC
8. Disable public signups in Supabase Auth settings

### This Month
9. Remove `'unsafe-inline'` from CSP `script-src`
10. Persist rate-limit counters in KV or add edge-level rate limiting
11. Namespace webhook debug logs per user
12. Add structured audit logging for admin operations

---

*End of Security Audit Report V2*
