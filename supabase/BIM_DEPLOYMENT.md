# BIM Digital-Twin — Online Deployment Guide

This is the bring-online checklist for the BIM 3D digital twin (the
Environmental Monitoring → BIM Twins tab).

The demo currently runs **fully on the client** (localStorage + bundled IFC
asset). After applying Phase 1, it becomes multi-user, multi-property, and
serves IFC files from Supabase Storage CDN.

---

## 1. What's already in place (Phase 0 — applied)

`20260418_bim_ioc_phase0.sql`

- `public.safety_alarms` — life-safety alarms over Realtime
- `public.bim_models` — registry of BIM assets per property
- `touch_updated_at()` trigger function
- RLS + Realtime publication for `safety_alarms`

## 2. New in Phase 1 — apply this

`20260427_bim_zone_labels_phase1.sql` — single self-contained migration
(Phase 1.1 hardening was folded in so operators cannot accidentally ship
the wide-open placeholder policies).

| Object | Purpose |
|---|---|
| `public.bim_property_members` | Per-user, per-property access (`property_id='*'` = super-admin) |
| `public.bim_user_can_read/_write()` | SECURITY DEFINER access-check helpers |
| `public.bim_zone_labels` | Persistent zone labels (replaces localStorage) |
| `public.bim_zone_sensors` (view, security_invoker) | Flattened (zone, sensor) pairs |
| Storage bucket `bim-models` | **PRIVATE**, 50 MB cap (Free tier; raise on Pro/Team), IFC MIME allow-list |
| RLS policies | Per-property scoped via membership table; fail closed when empty |
| Audit-stamp trigger | Server-stamps `created_by` / `updated_by`; clients cannot spoof |
| Realtime publication | Push edits to all open browsers (RLS-aware) |
| Seed `bim_models` row | Registers the existing CCC 17F MEP/ARC/STR 2024 model |

### Apply

```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1"
npx -y supabase@2.76.14 db push --project-ref wjvbojulgpmpblmterfy
```

Or paste `20260427_bim_zone_labels_phase1.sql` into the Supabase SQL editor.

## 3. Upload the IFC file to Storage

The seed row references this object path:
`bim-models/ccc-17f/CCC 17F MEP, ARC & STR (2024).ifc`

```bash
cd "/Users/lawmingfung/Library/CloudStorage/OneDrive-Personal/FSE Life style/FioTech_V1"
npx -y supabase@2.76.14 storage cp \
  "BIM  MEP/CCC 17F MEP, ARC & STR (2024).ifc" \
  "supabase://bim-models/ccc-17f/CCC 17F MEP, ARC & STR (2024).ifc" \
  --project-ref wjvbojulgpmpblmterfy
```

Or upload via the Supabase dashboard → Storage → `bim-models`.

The bucket is **private**, so plain public URLs do not work — `resolveIfcUrl()`
mints a short-lived signed URL (1h) on demand.

## 3a. Backfill membership (CRITICAL — fail-closed)

RLS fails closed: an empty `bim_property_members` table means **no one** can
read or write zone data. Run this immediately after applying the migration:

```sql
-- Grant Ming super-admin access to every property
INSERT INTO public.bim_property_members (user_id, property_id, role)
SELECT id, '*', 'admin'
FROM auth.users
WHERE email = 'bloodline19951117@gmail.com'
ON CONFLICT DO NOTHING;

-- Grant per-property editor access to a tenant user
INSERT INTO public.bim_property_members (user_id, property_id, role)
SELECT id, 'ccc-17f', 'editor'
FROM auth.users
WHERE email = 'tenant@example.com'
ON CONFLICT DO NOTHING;
```

Roles: `viewer` (read only), `editor` (read + write), `admin` (reserved
for future ops). All write operations require `editor` or `admin`.

## 4. Wire the frontend

`src/app/lib/bim/zoneLabelsRepo.ts` is the new repository module. It is a
**superset** of the existing `zoneLabels.ts`:

- When the user is signed in **and** Supabase responds → cloud is source of truth
- Otherwise → falls back to localStorage (current demo behavior)

Migration steps when ready to flip the BIM stage to cloud:

1. In `Bim3DStage.tsx`, replace the imports:
   ```ts
   // OLD
   import { getAllLabels, createLabel, updateLabel, deleteLabelById } from '@/components/demo/bim3d/zoneLabels';
   // NEW
   import {
     fetchAllLabels as getAllLabels,
     createLabelCloud as createLabel,
     updateLabelCloud as updateLabel,
     deleteLabelCloud as deleteLabelById,
     subscribeToZoneLabels,
     resolveIfcUrl,
   } from '@/lib/bim/zoneLabelsRepo';
   ```
2. Add `propertyId: string` as a prop to `Bim3DStage` (currently `MODEL_KEY` is hardcoded). Pass through every call.
3. In the load effect, call `subscribeToZoneLabels(propertyId, modelKey, reload)` and store the unsubscribe in cleanup.
4. Call `resolveIfcUrl(modelKey, bundledFallbackUrl)` instead of the hardcoded asset path so the IFC file streams from Supabase Storage.

## 5. Schema reference

```sql
bim_zone_labels (
  id                  UUID PK
  property_id         TEXT     -- matches kv_store property name/id
  model_id            BIGINT   -- → bim_models.id (CASCADE delete)
  model_key           TEXT     -- 'ccc-17f' etc.
  express_id          INTEGER  -- IFC element id this label sits on
  custom_name         TEXT
  custom_code         TEXT
  zone_type           TEXT     -- room|area|zone|asset|other
  notes               TEXT
  color               TEXT
  anchor_x/y/z        DOUBLE   -- world-space three.js anchor
  assigned_device_ids TEXT[]   -- sensor IDs from KV device store
  created_by          TEXT     -- user email/id (set by Edge Function)
  updated_by          TEXT
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ  -- auto-updated by trigger
)
```

Indexes:
- `(property_id, model_key)` — list a property's zones
- `(model_key, express_id)` — find labels on a clicked IFC element
- GIN on `assigned_device_ids` — "which zone owns sensor X?"

## 6. Future extension points

- `bim_zone_sensors` view can become a real table once devices migrate out of KV.
- Add `created_by`/`updated_by` enforcement in an Edge Function trigger using `auth.uid()`.
- Add per-property RLS by joining against a `property_members` table (currently RLS is permissive — gate at app layer).
- Subscribe to `bim_zone_labels` Realtime on the BMS / mobile clients — same channel format `bim_zone_labels:${propertyId}:${modelKey}`.

## 7. Rollback

```sql
DROP VIEW IF EXISTS public.bim_zone_sensors;
DROP TABLE IF EXISTS public.bim_zone_labels;
DELETE FROM storage.buckets WHERE id = 'bim-models';
DROP POLICY IF EXISTS "bim-models read public" ON storage.objects;
DROP POLICY IF EXISTS "bim-models write authenticated" ON storage.objects;
DROP POLICY IF EXISTS "bim-models update authenticated" ON storage.objects;
DROP POLICY IF EXISTS "bim-models delete authenticated" ON storage.objects;
```
