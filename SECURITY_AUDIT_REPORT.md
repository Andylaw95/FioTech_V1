# FioTec Security Audit Report

**Date**: 2026-02-24  
**Scope**: Full-stack code review — frontend (React), backend (Supabase Edge Functions), auth, API, data flow  
**Target**: https://fiotech-app.vercel.app  
**Methodology**: Static code analysis (whitebox pentest)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 5 |
| MEDIUM   | 6 |
| LOW      | 4 |
| INFO     | 3 |

The application has **solid fundamentals** — input sanitization, rate limiting, prototype pollution protection, and proper auth token separation are all present. However, several **critical credential exposure** and **access control** issues need immediate attention.

---

## CRITICAL Findings

### C1. Hardcoded Testing Credentials in Frontend Bundle (CRITICAL)

**File**: `src/app/pages/Login.tsx` line 59  
**Code**:
```ts
const credentials = { email: 'testing@fiotec.io', password: 'testing123456', name: 'Test Engineer' };
```

**Risk**: The testing account credentials are compiled into the production JavaScript bundle. Anyone who opens DevTools can extract them. Since the testing account is a real Supabase Auth account with full write access, an attacker can:
- Log in as the testing user
- Create/modify/delete devices, properties, alarms, gateways
- Access webhook tokens and sensor data

**Fix**: Remove hardcoded credentials. Instead, use a server-side endpoint that creates/returns a session for the testing account, or move to a token-based quick-login flow.

---

### C2. Supabase Anon Key + Project ID Exposed in Frontend (CRITICAL)

**File**: `utils/supabase/info.tsx`  
```ts
export const projectId = "wjvbojulgpmpblmterfy"
export const publicAnonKey = "eyJhbGciOiJIUzI1NiIs..."
```

**Risk**: While the anon key is *designed* to be public (Supabase architecture), the combination of project ID + anon key allows:
- Unauthenticated signup (supabase.auth.signUp) to create unlimited accounts
- Direct Supabase API calls bypassing your Edge Function rate limiting
- Enumeration of auth users if RLS is misconfigured

**Fix**:
1. Ensure Supabase RLS policies deny all direct table access (only service_role should access KV store)
2. Disable public signups in Supabase Dashboard if not needed (force signups through your `/signup` endpoint)
3. Enable Supabase Auth rate limiting in Dashboard > Auth > Rate Limits

---

### C3. Supabase Access Token in Git-Tracked Files (CRITICAL)

**File**: `AI_TEAM_HANDOFF.md` line 20  
```
sbp_68d4952355f4cd1f0ab08a0546ccf66c5ffabf0e
```
Also in `.github/copilot-instructions.md` line 183.

**Risk**: The Supabase personal access token grants **full management access** to the project — deploying functions, managing secrets, deleting data. If this repo is pushed to any public GitHub, the token is immediately compromised.

**Fix**:
1. **Immediately rotate** the token at https://supabase.com/dashboard/account/tokens
2. Move sensitive credentials to a `.env.local` file added to `.gitignore`
3. Replace plaintext tokens in docs with `[REDACTED — see .env.local]`
4. Add `AI_TEAM_HANDOFF.md` and `.github/copilot-instructions.md` to `.gitignore` if they contain secrets

---

## HIGH Findings

### H1. CORS Allows All Origins (HIGH)

**File**: `supabase/functions/server/index.tsx` line 10  
```ts
app.use("*", cors({ origin: "*" }));
```

**Risk**: Any website can make authenticated requests to the API if the user has an active session. This enables CSRF-like attacks since the browser will include cookies/tokens from the same origin. With `origin: "*"`, a malicious site could use `fetch()` to call the API on behalf of a logged-in user.

**Fix**: Restrict to known origins:
```ts
cors({
  origin: ["https://fiotech-app.vercel.app", "http://localhost:5173"],
  // ... rest of config
})
```

---

### H2. No IDOR Protection — Users Can Access Other Users' Data by Guessing KV Keys (HIGH)

**Analysis**: The backend uses `uk(userId, "collection")` to scope data. This is **correctly implemented** — `userId` comes from `requireAuth()` which extracts it from the validated JWT. However:

**The admin endpoints expose user data without IDOR protection for the user IDs**:
- `GET /admin/users/:id` — any valid UUID returns that user's full data
- `PUT /admin/users/:id` — admin can set any user's password without confirmation
- `DELETE /admin/users/:id` — admin can delete any user

While these are admin-only (protected by `requireAdmin`), the admin check is **email-based** (`MASTER_EMAILS.has(email)`). If an attacker gains access to `master@fiotec.io`, they have god-mode access to all user data.

**Fix**:
1. Implement MFA for the master account
2. Consider adding an admin password/PIN on top of the session
3. Log all admin actions with IP + timestamp for audit trail

---

### H3. Webhook Token Brute-Force Possible (HIGH)

**File**: `routes.tsx` telemetry-webhook handler  
**Analysis**: Webhook tokens are `whk_` + 32 random alphanumeric characters (36^32 entropy = ~166 bits). This is strong. However:
- Rate limit is 60/min per IP, but the token lookup still runs for invalid tokens
- No lockout after N failed attempts
- No constant-time comparison (uses `storedToken !== token`)

**Risk**: While 166 bits of entropy makes brute-force impractical, timing attacks on the string comparison could leak token characters.

**Fix**:
1. Use constant-time comparison: `crypto.subtle.timingSafeEqual()` or equivalent
2. Add a failed-attempt counter per token that disables the endpoint temporarily

---

### H4. Admin Password Change Has No Minimum Length Check (HIGH)

**File**: `routes.tsx` — `PUT /admin/users/:id`  
```ts
if (body.password) authUpdates.password = body.password;
```

The password is passed directly to `supabase.auth.admin.updateUserById()` without any length/complexity validation. Supabase's default minimum is 6 characters, but this is lower than the 8-character minimum enforced on signup.

**Fix**: Add validation:
```ts
if (body.password) {
  if (body.password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
  if (body.password.length > 128) return c.json({ error: "Password too long." }, 400);
  authUpdates.password = body.password;
}
```

---

### H5. Frontend Admin Check Can Be Bypassed (HIGH)

**File**: `src/app/utils/AuthContext.tsx` line 9  
```ts
const MASTER_EMAILS = new Set(["master@fiotec.io"]);
```

**File**: `src/app/App.tsx` — Route for `/admin` likely uses `isAdmin` from context.  

**Risk**: The `isAdmin` check is a frontend-only gate. The backend separately enforces admin via `requireAdmin()`, which is correct. But the frontend `MASTER_EMAILS` set is visible in the bundle, revealing which emails have admin access.

**Impact**: Low (backend is properly protected), but information disclosure.

**Fix**: Don't hardcode admin emails in frontend. Instead, call `GET /admin/check` and use the response to determine admin status after login.

---

## MEDIUM Findings

### M1. No Content Security Policy (CSP) Header (MEDIUM)

**File**: `index.html` — No CSP meta tag or server header.

**Risk**: Without CSP, any XSS vulnerability becomes fully exploitable — inline scripts, external script loading, data exfiltration.

**Fix**: Add to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://*.supabase.co; font-src 'self';">
```

---

### M2. Password Minimum Mismatch: Frontend vs Backend (MEDIUM)

| Location | Minimum |
|----------|---------|
| Backend signup (`/signup`) | 8 characters |
| Frontend AdminPanel | 6 characters (warning only) |
| Backend admin update | No check (Supabase default: 6) |

**Fix**: Enforce 8-character minimum consistently everywhere.

---

### M3. Sensitive Error Details Leaked to Client (MEDIUM)

Multiple routes return `detail: errorMessage(e)` to the client:
```ts
return c.json({ error: "Failed to fetch properties.", detail: errorMessage(e) }, 500);
```

**Risk**: Stack traces or internal error messages may reveal system internals.

**Fix**: Only return `detail` in development mode. In production, return only generic error messages.

---

### M4. No Request ID / Audit Log (MEDIUM)

There is no logging of user actions with timestamps, IPs, or request IDs. Admin operations (create/delete users, password changes) happen silently.

**Fix**: Add an audit log middleware that records: `{ timestamp, userId, action, targetId, ip }` to KV store.

---

### M5. `safeMerge` Settings Update — Deep Object Injection (MEDIUM)

**File**: `routes.tsx` — `PUT /settings`
```ts
const updated = safeMerge(current, body);
```

While `safeMerge` blocks `__proto__`, `constructor`, and `prototype`, it still allows arbitrary deep keys to be set. An attacker could inject unexpected settings fields that the frontend later reads as trusted.

**Fix**: Validate settings structure against a schema before merging.

---

### M6. Demo Mode Bypass Allows Offline Data Manipulation (MEDIUM)

**File**: `src/app/utils/demoData.ts`  
Demo mode runs entirely client-side with fake data. A user can enter demo mode, observe the UI structure and API paths, then use that knowledge against the real API with the testing account credentials.

**Impact**: Low — the real API has proper auth. But combined with C1 (hardcoded testing credentials), an attacker gets a complete attack map.

---

## LOW Findings

### L1. JWT Expiry Check Buffer Is Only 60 Seconds (LOW)

**File**: `api.ts` — `isJwtExpired(token, 60000)`  

A 60-second buffer means tokens could expire between the check and the server processing. This is handled by retry logic, but could cause unnecessary 401s.

---

### L2. Rate Limiter Is In-Memory Only (LOW)

**File**: `routes.tsx` — rate limit stored in `Map<string, ...>`

Rate limits reset when the Edge Function cold-starts/recycles. An attacker can wait for the idle timeout (~30s) and get a fresh rate limit window.

**Fix**: Persist rate limit counters in KV store (performance trade-off to consider).

---

### L3. Missing `Strict-Transport-Security` Header (LOW)

Vercel provides HTTPS, but there's no HSTS header to prevent downgrade attacks.

**Fix**: Add in Vercel config (`vercel.json`):
```json
{
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" }
    ]}
  ]
}
```

---

### L4. X-Forwarded-For Spoofing (LOW)

**File**: `routes.tsx`  
```ts
function getClientIp(c: any): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || ...
}
```

The `x-forwarded-for` header can be spoofed by clients. Rate limiting based on this header allows bypass by rotating the header value.

**Fix**: Supabase Edge Functions run behind a proxy — use the last entry in `x-forwarded-for` (set by the proxy) rather than the first (set by the client).

---

## INFO Findings

### I1. `dangerouslySetInnerHTML` Usage (INFO)

**File**: `src/app/components/ui/chart.tsx` line 88  
Used only for chart theme CSS injection with hardcoded values (no user input). **Not exploitable**.

### I2. No `robots.txt` or `sitemap.xml` (INFO)

Minor — not a security risk but the absence of `robots.txt` means search engines may index API error pages.

### I3. Build Output in Repository (INFO)

The `dist/` folder appears to be in the repository. This increases surface area and may expose source maps.

**Fix**: Add `dist/` to `.gitignore`.

---

## Positive Security Controls (What's Done Well)

| Control | Implementation |
|---------|---------------|
| **Input Sanitization** | `sanitizeString()`, `sanitizeUrl()`, `sanitizeNumber()`, `sanitizeEnum()` on all inputs |
| **Prototype Pollution Protection** | `safeMerge()` blocks `__proto__`, `constructor`, `prototype` |
| **Auth Token Separation** | Anon key in `Authorization`, user JWT in `x-user-token` — prevents gateway JWT validation issues |
| **Rate Limiting** | Global 120/min, writes 30/min, webhooks 60/min, signups 10/15min |
| **Body Size Guard** | 1MB max request body |
| **Collection Limits** | 100 properties, 500 devices, 100 gateways |
| **SQL Injection** | N/A — uses KV store, no raw SQL |
| **File Upload Validation** | Type whitelist (png/jpeg/webp/gif), 10MB limit |
| **User Data Isolation** | All data is scoped by `uk(userId, collection)` |
| **Cold-Start Resilience** | 7 retries with exponential backoff, grace period logic |
| **Token Refresh** | Single-flight refresh prevents race conditions |
| **Admin Protection** | Backend `requireAdmin()` enforces server-side |

---

## Recommended Fix Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | C3: Rotate and remove Supabase access token from git | 30 min |
| 2 | C1: Remove hardcoded testing credentials from Login.tsx | 1 hour |
| 3 | H1: Restrict CORS to known origins | 15 min |
| 4 | C2: Disable direct signups in Supabase Dashboard | 15 min |
| 5 | H4: Add password length check in admin update | 15 min |
| 6 | M1: Add CSP header | 30 min |
| 7 | L3: Add HSTS header via vercel.json | 15 min |
| 8 | H5: Fetch admin status from server instead of hardcoded emails | 1 hour |
| 9 | H3: Use constant-time token comparison | 30 min |
| 10 | M3: Remove error details from production responses | 1 hour |

---

*Report generated by code-level static analysis. No live exploitation was performed.*
