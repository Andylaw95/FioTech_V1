# FioTec IoT Dashboard — AI Team Agent Instructions

> **Project**: FioTec IoT Property Management Dashboard  
> **Last Updated**: 2026-02-24  
> **Owner**: Law Ming Fung

---

## ONBOARDING — READ THESE FIRST

Before doing ANY work on this project, read these two files IN ORDER:

1. **`FIOTECH_PROJECT_KNOWLEDGE.txt`** — Full technical architecture, data models, API routes, boot sequence (798 lines)
2. **`AI_TEAM_HANDOFF.md`** — Complete AI collaboration history, 11 completed phases, deployment guides, credentials

---

## AI TEAM ROLES

This project is managed by a virtual AI team. Each role has specific responsibilities and domain expertise. When working on a task, identify which role(s) apply and follow their protocols.

### 🏗️ ARCHITECT — System Design & Backend
**Domain**: `supabase/functions/server/`, API design, data models, auth, KV store  
**Protocols**:
- Edit backend code in `supabase/functions/server/` (working copy)
- MUST copy to `supabase/functions/make-server-4916a0b9/` before deploying
- Follow two-phase boot architecture (index.tsx = slim, routes.tsx = heavy)
- Use `cachedKvGet` / `cachedKvSet` for all KV operations
- Auth pattern: `const auth = await requireAuth(c); if (auth instanceof Response) return auth;`
- User-scoped keys: `uk(userId, "collection")` → `"collection_{userId}"`
- Rate limiting: Global 120/min, Writes 30/min, Webhooks 60/min, Signup 10/15min
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend
- Protected files: **kv_store.tsx** — NEVER modify

### 🎨 UI ENGINEER — Frontend & Responsive Design
**Domain**: `src/app/pages/`, `src/app/components/`, Tailwind CSS, responsive layout  
**Protocols**:
- Mobile-first responsive: Always start with base → `sm:` → `md:` → `lg:` → `xl:`
- Icon containers: Always add `shrink-0`
- Padding: Use `p-4 sm:p-6` (never fixed `p-6`)
- Grids: Start `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Flex rows: Add `flex-wrap` on rows that may overflow
- Text overflow: `min-w-0` on flex children + `truncate` on text
- Filter/tab bars: Add `overflow-x-auto`
- Components: Use shadcn/ui from `src/app/components/ui/`
- Icons: Use `lucide-react`
- Animation: Use `motion` (import from `"motion/react"`)
- Toast: Use `sonner` (`toast.success()`, `toast.error()`)
- Build check: ALWAYS `npm run build` after changes

### 🔌 INTEGRATION ENGINEER — APIs, Webhooks, AWS
**Domain**: `api.ts`, webhook pipeline, AWS IoT Core, LoRaWAN  
**Protocols**:
- Frontend API: All calls via `api.*` methods in `src/app/utils/api.ts`
- Auth headers: `Authorization: Bearer <anon_key>`, `x-user-token: <user_jwt>`
- Cold-start handling: `fetchWithAuth` has 7 retries with exponential backoff
- Webhook flow: Token-based auth, POST to `/telemetry-webhook?token=whk_...`
- AWS routes: Lazy-loaded from `aws_routes.tsx`, all under `/aws/*` prefix
- AWS status: Code complete, waiting for IT team credentials

### 🧪 QA ENGINEER — Testing & Validation
**Domain**: Build verification, cross-device testing, error checking  
**Protocols**:
- Run `npm run build` after EVERY code change
- Check for TypeScript errors before deploying
- Test accounts: demo@fiotec.io / [REDACTED], testing@fiotec.io / [REDACTED]
- Master admin: master@fiotec.io / [REDACTED]
- Verify responsive at 375px (mobile), 768px (tablet), 1024px+ (desktop)
- Check dark mode compatibility when modifying theme-aware components

### 🚀 DEVOPS — Build & Deployment
**Domain**: Vercel, Supabase Edge Functions, CI/CD  
**Protocols**:

**Frontend deployment:**
```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec"
npm run build && npx vercel --prod
```

**Backend deployment:**
```bash
# Step 1: Copy edited server files to deploy directory
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1/FioTec"
cp supabase/functions/server/routes.tsx supabase/functions/make-server-4916a0b9/routes.tsx
cp supabase/functions/server/index.tsx supabase/functions/make-server-4916a0b9/index.ts
cp supabase/functions/server/seed_data.tsx supabase/functions/make-server-4916a0b9/seed_data.tsx
cp supabase/functions/server/aws_routes.tsx supabase/functions/make-server-4916a0b9/aws_routes.tsx
cp supabase/functions/server/kv_store.tsx supabase/functions/make-server-4916a0b9/kv_store.tsx

# Step 2: Deploy
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1"
npx -y supabase@2.76.14 functions deploy make-server-4916a0b9 --project-ref wjvbojulgpmpblmterfy
```

**⚠️ CRITICAL**: Backend has TWO copies — edit in `server/`, deploy from `make-server-4916a0b9/`. Forgetting to copy will deploy stale code.

---

## WORKFLOW RULES

### Before Starting Any Task
1. Identify which AI team role(s) the task falls under
2. Read the relevant source files to understand current state
3. Plan changes before implementing
4. For multi-file changes, use `multi_replace_string_in_file` for efficiency

### During Implementation
1. Follow existing code patterns and naming conventions
2. Keep the same code style (2-space indent, single quotes, Tailwind class ordering)
3. Never modify protected files: `kv_store.tsx`, `ImageWithFallback.tsx`, `info.tsx`
4. For new pages: Register route in `App.tsx`, add sidebar link in `Layout.tsx`
5. For new API routes: Add to `routes.tsx` (backend), add method to `api` object in `api.ts` (frontend)

### After Implementation
1. **ALWAYS** run `npm run build` to verify no errors
2. **ALWAYS** deploy frontend: `npx vercel --prod`
3. If backend changed: copy server → make-server, then deploy
4. Update `AI_TEAM_HANDOFF.md` with new phase number and summary

### Commit Message Convention
Use format: `Phase N: Short description of what was done`

---

## TECHNICAL CONSTRAINTS

| Constraint | Detail |
|-----------|--------|
| Bundle size | 1.68MB JS (warning but acceptable) |
| Edge Function boot | Must complete < 10s (two-phase boot solves this) |
| KV store | No `.list()` method — use `getByPrefix()` for scanning |
| Auth | Anon key in Authorization, user JWT in x-user-token |
| File uploads | Max 10MB, types: png/jpeg/webp/gif |
| Rate limit | 120 req/min global, 30 writes/min |
| Tailwind | v4 — CSS-based config, NO tailwind.config.js |
| React Router | v7 — imports from `react-router` (not `react-router-dom`) |
| Animation | `motion` library — import from `"motion/react"` |

---

## PROJECT STATUS DASHBOARD

| Area | Status | Notes |
|------|--------|-------|
| Frontend | ✅ Live | https://fiotech-app.vercel.app |
| Backend | ✅ Running | Supabase Edge Functions |
| Auth | ✅ Working | Email/password + master admin |
| Properties CRUD | ✅ Complete | 4 types: Commercial, Residential, Industrial, Mixed |
| Devices CRUD | ✅ Complete | 6+ sensor types |
| Gateways | ✅ Complete | LoRaWAN, Zigbee, WiFi, BLE, Cellular, Z-Wave |
| Alarms | ✅ Complete | Water, Fire, Smoke + auto-generation |
| Webhook Pipeline | ✅ Complete | Milesight LoRaWAN gateway integration |
| Dashboard Widgets | ✅ Complete | Drag-and-drop, 8 widget types |
| Digital Twin 3D | ✅ Complete | react-three-fiber visualization |
| AWS IoT Core | ⏳ Code ready | Waiting for IT team credentials |
| Admin Panel | ✅ Complete | Master admin user management |
| Responsive Design | ✅ Complete | Full audit across 14 files |
| Dark Mode | ✅ Complete | CSS custom properties |
| Performance | ✅ Optimized | kvGetFast, parallel reads, batch loading |

---

## PENDING ROADMAP

| Priority | Task | Role |
|----------|------|------|
| 🔴 High | Verify two-phase boot via Supabase logs | Architect + DevOps |
| 🟡 Medium | Activate AWS integration when credentials arrive | Integration Engineer |
| 🟡 Medium | Code-split bundle (dynamic imports for heavy pages) | UI Engineer + DevOps |
| 🟢 Low | Reduce ProfileProvider 15s delay | Architect |
| 🟢 Low | Add E2E tests with Playwright | QA Engineer |
| 🟢 Low | PWA support (service worker, offline mode) | UI Engineer |

---

## KEY CREDENTIALS (for AI agents only — do not commit to public repos)

| Service | Value |
|---------|-------|
| Supabase Project | `wjvbojulgpmpblmterfy` |
| Supabase Anon Key | `eyJhbGciOiJIUzI1NiIs...` (see AI_TEAM_HANDOFF.md) |
| Supabase Access Token | `[REDACTED — see .env.local or 1Password]` |
| Vercel Production | https://fiotech-app.vercel.app |
| Master Login | `master@fiotec.io` / `[REDACTED]` |

---

*This file is read automatically by GitHub Copilot. Keep it updated with every significant change.*
