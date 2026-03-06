# FioTec IoT Dashboard — AI Team Handoff Document

> **Generated**: 2026-02-24  
> **Purpose**: Complete AI collaboration history & project context for new Copilot/AI agents  
> **Owner**: Law Ming Fung (lawmingfung)

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| **App Name** | FioTec (originally FioTec, rebranded) |
| **Type** | IoT Property Management Dashboard |
| **Live URL** | https://fiotech-app.vercel.app |
| **Frontend** | React 18.3.1 + Tailwind CSS v4 + Vite 6.3.5 |
| **Backend** | Supabase Edge Functions (Deno + Hono v4 + KV store) |
| **Supabase Project** | `wjvbojulgpmpblmterfy` |
| **Supabase Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqdmJvanVsZ3BtcGJsbXRlcmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTIzNjYsImV4cCI6MjA4NTk2ODM2Nn0.HQk9BJqz4Qna3qkarsGVLuCCHlGg3iKONBqCzH2yhKI` |
| **Supabase Access Token** | `[REDACTED — see .env.local or 1Password]` |
| **Master Account** | `master@fiotec.io` / `[REDACTED]` |
| **Demo Account** | `demo@fiotec.io` / `[REDACTED]` |
| **Testing Account** | `testing@fiotec.io` / `[REDACTED]` |
| **Workspace Path** | `/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec` |

---

## 2. CRITICAL DEPLOYMENT NOTES

### Frontend (Vercel)
```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec"
npm run build
npx vercel --prod
```
- Outputs to `dist/`
- Production alias: `https://fiotech-app.vercel.app`

### Backend (Supabase Edge Functions)
**⚠️ CRITICAL**: There are TWO copies of the server code:
- `supabase/functions/server/` — **Working/editing copy**
- `supabase/functions/make-server-4916a0b9/` — **Actually deployed copy**

**You MUST copy server → make-server before deploying:**
```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec"
cp supabase/functions/server/routes.tsx supabase/functions/make-server-4916a0b9/routes.tsx
cp supabase/functions/server/index.tsx supabase/functions/make-server-4916a0b9/index.ts
cp supabase/functions/server/seed_data.tsx supabase/functions/make-server-4916a0b9/seed_data.tsx
cp supabase/functions/server/aws_routes.tsx supabase/functions/make-server-4916a0b9/aws_routes.tsx
# kv_store.tsx is PROTECTED — do not edit, but keep in sync
cp supabase/functions/server/kv_store.tsx supabase/functions/make-server-4916a0b9/kv_store.tsx
```

**Deploy command:**
```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1"
npx -y supabase@2.76.14 functions deploy make-server-4916a0b9 --project-ref wjvbojulgpmpblmterfy
```
- Requires Supabase CLI login first (access token above)
- Note: The `index.tsx` in server/ becomes `index.ts` in make-server (Supabase convention)

---

## 3. COMPLETE AI COLLABORATION HISTORY

### Phase 1: AWS IoT Core Integration (2026-02-23)
- **What**: Bidirectional integration with AWS IoT Core + DynamoDB
- **Files created**: `aws_routes.tsx` (backend), `AWSConfigPanel.tsx` (frontend)  
- **Backend**: 11 new routes under `/aws/*` prefix, lazy-loaded via dynamic import
- **Frontend**: New "AWS Cloud" tab in Settings page
- **Status**: ✅ Code complete, waiting for IT team AWS credentials
- **IAM Guide**: Created at `guidelines/AWS_SETUP_GUIDE.md`

### Phase 2: Vercel Deployment Setup (2026-02-23)
- **What**: Configured and deployed frontend to Vercel
- **Status**: ✅ Live at https://fiotech-app.vercel.app

### Phase 3: Testing Account Fix (2026-02-23)
- **What**: Fixed testing account data seeding issues
- **Status**: ✅ Complete

### Phase 4: Server Connectivity Fix (2026-02-23)
- **What**: Fixed cold-start boot errors, implemented two-phase boot architecture
- **Key change**: Split monolithic `index.tsx` into slim boot + deferred `routes.tsx`
- **Status**: ✅ Complete

### Phase 5: Demo Mode Enhancement (2026-02-23)
- **What**: Enhanced demo account with rich sample data (8 properties, 25 devices, 8 gateways)
- **Added**: Quick-login buttons on Login page, simulated gateway heartbeats
- **Status**: ✅ Complete

### Phase 6: Logo & Branding Changes (2026-02-23)
- **What**: Multiple rounds of logo updates
- **Rebranding**: FioTec → FioTec (throughout entire codebase)
- **Logo files**: `src/assets/fiotech-logo.png`, `src/assets/fiotech-applogo.png`
- **Status**: ✅ Complete

### Phase 7: Demo Data Consistency Fix (2026-02-23)
- **What**: Fixed inconsistencies in demo seed data
- **Status**: ✅ Complete

### Phase 8: Border Alignment Fix (2026-02-23)
- **What**: Sidebar logo border-line and header border-line not aligned on smaller screens
- **Root cause**: Missing `shrink-0` on sidebar header / main header
- **Fix**: Added `shrink-0` to sidebar logo area, main header, sidebar bottom toggle; added `overflow-y-auto` to sidebar nav
- **Status**: ✅ Complete & deployed

### Phase 9: System Master Admin Account (2026-02-23)
- **What**: Implemented `master@fiotec.io` as system master admin
- **Credentials**: `master@fiotec.io` / `[REDACTED]`
- **Status**: ✅ Complete

### Phase 10: Performance Optimization (2026-02-23)
- **What**: Multiple performance improvements
- **Changes**:
  - `kvGetFast` — optimized KV reads
  - Parallel admin reads
  - Dashboard batch loading
  - AdminPanel `previewData` optimization
- **Status**: ✅ Complete

### Phase 11: Comprehensive Small-Screen Responsive Fix (2026-02-24)
- **What**: Fixed all responsive alignment issues across 9 files for smaller window screens
- **Audit**: Full 14-file responsive audit (including sub-agent scan of 8 files)
- **Files modified & fixes applied**:

| File | Fixes |
|------|-------|
| `Dashboard.tsx` | Section headers: `flex-wrap`, icon `shrink-0`, padding `p-4 sm:p-6` |
| `GatewayOverviewWidget.tsx` | Stats grid `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`, footer `flex-wrap`, responsive padding |
| `Alarms.tsx` | Stat card icons `shrink-0`, responsive padding, fixed `<td>` flex display conflict |
| `Devices.tsx` | Chart container `min-w-[600px]` → `sm:min-w-[600px]`, responsive padding |
| `SensorDataWidget.tsx` | DevEUI `truncate`, signal info `flex-wrap`, header responsive padding |
| `DeviceGatewayPairingWidget.tsx` | Container responsive padding, device chip name truncate widened |
| `Gateways.tsx` | 4× dialog form grids → `grid-cols-1 sm:grid-cols-2`, subtitle `flex-wrap`, filter tabs `overflow-x-auto`, topology gateway name `truncate` |
| `Settings.tsx` | Quiet Hours padding responsive, Export/Reset/Health rows → `flex-col sm:flex-row` |
| `BuildingDetails.tsx` | Hero info `flex-wrap`, zone card `min-w-0` + `truncate`, alarm metadata `flex-wrap` |

- **Common patterns applied**:
  1. `shrink-0` on icon containers to prevent squishing
  2. `p-4 sm:p-6` responsive padding (instead of fixed `p-6`)
  3. `grid-cols-1 sm:grid-cols-2` (instead of fixed `grid-cols-2`)
  4. `flex-wrap` on rows that can overflow
  5. `truncate` + `min-w-0` on text that can overflow
  6. `overflow-x-auto` on scrollable filter tabs
- **Status**: ✅ Complete & deployed to Vercel

---

## 4. ARCHITECTURE QUICK REFERENCE

### Three-Tier System
```
Frontend (React SPA on Vercel)
    ↓ HTTPS
Supabase Edge Function (Hono server on Deno)
    ↓ PostgREST
Supabase Postgres (KV store table: kv_store_4916a0b9)
```

### Auth Flow
- `Authorization` header: always `Bearer <anon_key>` (for Supabase gateway)
- `x-user-token` header: actual user JWT (bypasses gateway JWT validator)
- Backend validates user JWT via `supabase.auth.getUser(token)`

### Two-Phase Boot (Edge Function)
1. **Phase 1** (`index.tsx`): Slim boot — Hono + CORS + `/health` → `Deno.serve()` immediately
2. **Phase 2** (`routes.tsx`): Deferred via `setTimeout` + dynamic `import()` → all heavy routes

### Cold-Start Resilience (Frontend)
1. `ServerWarmupGate` — polls `/health` before releasing app
2. `warmupServer()` — 12 attempts with 1.5s cycle
3. `fetchWithAuth` — 7 retries with exponential backoff
4. Keep-alive pings — every 15s for 60s after warmup

### Account Types
| Type | Seed Data | Login |
|------|-----------|-------|
| standard | 4 properties, 9 devices, 4 gateways | Regular signup |
| demo | 8 properties, 25 devices, 8 gateways | `demo@fiotec.io` / `[REDACTED]` |
| testing | Empty (clean slate) | `testing@fiotec.io` / `[REDACTED]` |
| master | Full admin | `master@fiotec.io` / `[REDACTED]` |

---

## 5. KEY FILE MAP

### Frontend
| File | Purpose | Lines |
|------|---------|-------|
| `src/app/App.tsx` | Root: AuthProvider > AuthGate > ServerWarmupGate > Theme > Profile > Router |  |
| `src/app/utils/api.ts` | Centralized API client, fetch, auth, retry, cache, warmup | ~1082 |
| `src/app/utils/AuthContext.tsx` | Supabase auth context |  |
| `src/app/components/Layout.tsx` | App shell: sidebar + header + outlet | ~386 |
| `src/app/pages/Dashboard.tsx` | Main dashboard with widgets | ~1064 |
| `src/app/pages/Buildings.tsx` | Properties list | ~388 |
| `src/app/pages/BuildingDetails.tsx` | Single property detail | ~771 |
| `src/app/pages/Devices.tsx` | Devices CRUD | ~550 |
| `src/app/pages/Gateways.tsx` | Gateways management | ~1640 |
| `src/app/pages/Alarms.tsx` | All alarms | ~511 |
| `src/app/pages/Settings.tsx` | Settings (profile, notif, security, AWS, system) | ~1071 |
| `src/app/pages/Login.tsx` | Login/signup with demo quick-login |  |

### Backend (edit in `server/`, deploy from `make-server-4916a0b9/`)
| File | Purpose | Lines |
|------|---------|-------|
| `index.tsx` | Slim boot entry, health endpoint, deferred route loading | ~65 |
| `routes.tsx` | ALL route handlers, auth, KV cache, rate limiting | ~1830 |
| `aws_routes.tsx` | AWS IoT Core integration (lazy-loaded) |  |
| `seed_data.tsx` | Seed data factories for all account types |  |
| `kv_store.tsx` | **PROTECTED** — KV store utility |  |

---

## 6. PROTECTED FILES (DO NOT MODIFY)

- `/src/app/components/figma/ImageWithFallback.tsx`
- `/supabase/functions/server/kv_store.tsx`
- `/utils/supabase/info.tsx`

---

## 7. COMMON OPERATIONS

### Build & Deploy Frontend
```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec"
npm run build && npx vercel --prod
```

### Deploy Backend (Edge Functions)
```bash
# 1. Copy edited files to deploy directory
cp supabase/functions/server/routes.tsx supabase/functions/make-server-4916a0b9/routes.tsx
# (repeat for other changed files)

# 2. Deploy
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1"
npx -y supabase@2.76.14 functions deploy make-server-4916a0b9 --project-ref wjvbojulgpmpblmterfy
```

### Frontend API Usage
```typescript
import { api } from '@/app/utils/api';
const properties = await api.getProperties();
const devices = await api.getDevices();
```

### Backend Route Pattern
```typescript
app.get("/make-server-4916a0b9/route", async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  // ...
});
```

### KV Store Usage (Backend)
```typescript
const data = await cachedKvGet(uk(userId, "properties"));
await cachedKvSet(uk(userId, "properties"), data);
```

---

## 8. KNOWN ISSUES & PENDING WORK

| # | Issue | Status | Priority |
|---|-------|--------|----------|
| 1 | AWS Integration — waiting for IT team AWS credentials | Pending | Medium |
| 2 | ProfileProvider 15s delay before showing real profile name | By design | Low |
| 3 | Two-phase boot — needs verification via Supabase Edge Function logs | Needs check | Medium |
| 4 | Chunk size warning (1.68MB JS bundle) — could benefit from code-splitting | Enhancement | Low |

---

## 9. RESPONSIVE DESIGN PATTERNS (Established)

When making UI changes, follow these patterns established in Phase 11:

```
/* Icon containers */
<div className="... shrink-0">  /* Always add shrink-0 to icon wrappers */

/* Padding */
className="p-4 sm:p-6"         /* Not fixed p-6 */

/* Grids */
className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"  /* Always start mobile-first */

/* Flex rows that may overflow */
className="flex flex-wrap items-center gap-2"  /* Add flex-wrap */

/* Text that can overflow */
<div className="min-w-0">
  <p className="truncate">...</p>
</div>

/* Filter/tab bars */
className="overflow-x-auto"    /* Allow horizontal scroll on mobile */
```

---

## 10. AI AGENT INSTRUCTIONS

When continuing work on this project:

1. **Read `FIOTECH_PROJECT_KNOWLEDGE.txt`** for full technical details (747 lines)
2. **Read this file** for collaboration history and recent changes
3. **Always test builds** before deploying: `npm run build`
4. **Always deploy to Vercel** after frontend changes: `npx vercel --prod`
5. **For backend changes**: Edit in `server/`, copy to `make-server-4916a0b9/`, then deploy
6. **Never modify** protected files (kv_store.tsx, ImageWithFallback.tsx, info.tsx)
7. **Follow responsive patterns** in Section 9 for any new UI work
8. **Keep this document updated** with any new phases of work

---

*This document was created to facilitate AI team handoff. The previous AI agent completed 11 phases of work on this project spanning AWS integration, deployment, performance optimization, responsive design, and branding.*
