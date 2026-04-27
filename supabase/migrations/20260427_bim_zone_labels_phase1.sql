-- ═══════════════════════════════════════════════════════════════════════
-- BIM IOC Phase 1 — Zone labels, sensor mapping, IFC storage (HARDENED)
--
-- Single self-contained migration. Replaces the two-step Phase 1 +
-- Phase 1.1 pair so operators can never accidentally ship the open
-- placeholder policies.
--
-- What this enables:
--   • Persistent zone labels survive across browsers / users / devices
--   • Multi-property: every label is keyed by property_id + model_id
--   • Per-property RLS — gated by `bim_property_members` membership table
--   • IFC files served via Supabase Storage (CDN-cached, private bucket,
--     short-lived signed URLs minted by the React layer)
--   • Sensor-to-zone mapping queryable from any client
--   • Realtime sync (RLS-aware)
--
-- Builds on Phase 0 (`safety_alarms`, `bim_models`, `touch_updated_at`).
--
-- IMPORTANT — fail-closed: an empty `bim_property_members` table means NO
-- ONE can read or write zone data. Backfill the membership rows IMMEDIATELY
-- after applying this migration (see supabase/BIM_DEPLOYMENT.md § 3a).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. PROPERTY MEMBERSHIP (source of truth for "who sees what") ──────
CREATE TABLE IF NOT EXISTS public.bim_property_members (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,                                  -- '*' = all properties
  role        TEXT NOT NULL DEFAULT 'editor'
              CHECK (role IN ('viewer', 'editor', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS bim_property_members_property_idx
  ON public.bim_property_members (property_id);

ALTER TABLE public.bim_property_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bim_property_members_self_read" ON public.bim_property_members;
CREATE POLICY "bim_property_members_self_read"
  ON public.bim_property_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 2. ACCESS-CHECK HELPERS (SECURITY DEFINER, search_path locked) ────
CREATE OR REPLACE FUNCTION public.bim_user_can_read(p_property_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bim_property_members m
    WHERE m.user_id = auth.uid()
      AND (m.property_id = p_property_id OR m.property_id = '*')
  );
$$;

CREATE OR REPLACE FUNCTION public.bim_user_can_write(p_property_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bim_property_members m
    WHERE m.user_id = auth.uid()
      AND (m.property_id = p_property_id OR m.property_id = '*')
      AND m.role IN ('editor', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.bim_user_can_read(TEXT)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bim_user_can_write(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bim_user_can_read(TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bim_user_can_write(TEXT) TO authenticated;

-- ── 3. ZONE LABELS TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_zone_labels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         TEXT NOT NULL,
  model_id            BIGINT REFERENCES public.bim_models(id) ON DELETE CASCADE,
  -- The model_key used by the React layer (e.g. 'ccc-17f'). Kept alongside
  -- model_id so the front-end can scope queries without joining.
  model_key           TEXT NOT NULL,
  -- IFC element this label sits on (used for highlight + isolate).
  express_id          INTEGER NOT NULL,
  custom_name         TEXT,
  custom_code         TEXT,
  zone_type           TEXT CHECK (zone_type IN ('room','area','zone','asset','other')),
  notes               TEXT,
  color               TEXT,
  -- World-space anchor (matches three.js Vector3 used by ZoneLabels3D).
  anchor_x            DOUBLE PRECISION NOT NULL,
  anchor_y            DOUBLE PRECISION NOT NULL,
  anchor_z            DOUBLE PRECISION NOT NULL,
  -- Sensor IDs assigned to this zone (kv_store device.id values).
  assigned_device_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Audit columns are server-stamped; clients cannot spoof them.
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Defense-in-depth bounds. Reserve '*' for the super-admin sentinel.
  CONSTRAINT bim_zone_labels_property_id_not_wildcard
    CHECK (property_id <> '*' AND length(property_id) BETWEEN 1 AND 64),
  CONSTRAINT bim_zone_labels_text_bounds
    CHECK (
      coalesce(length(custom_name), 0) <= 200
      AND coalesce(length(custom_code), 0) <= 64
      AND coalesce(length(notes), 0)       <= 2000
      AND coalesce(length(color), 0)       <= 32
      AND length(model_key) BETWEEN 1 AND 64
    ),
  CONSTRAINT bim_zone_labels_devices_bounds
    CHECK (
      array_length(assigned_device_ids, 1) IS NULL
      OR array_length(assigned_device_ids, 1) <= 200
    )
);

CREATE INDEX IF NOT EXISTS bim_zone_labels_property_model_idx
  ON public.bim_zone_labels (property_id, model_key);
CREATE INDEX IF NOT EXISTS bim_zone_labels_express_idx
  ON public.bim_zone_labels (model_key, express_id);
CREATE INDEX IF NOT EXISTS bim_zone_labels_devices_gin
  ON public.bim_zone_labels USING GIN (assigned_device_ids);

-- updated_at trigger (reuses Phase 0 helper).
DROP TRIGGER IF EXISTS bim_zone_labels_touch ON public.bim_zone_labels;
CREATE TRIGGER bim_zone_labels_touch
  BEFORE UPDATE ON public.bim_zone_labels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- created_by / updated_by stamping. Clients cannot override the actor;
-- created_by is immutable once set.
CREATE OR REPLACE FUNCTION public.bim_zone_labels_stamp_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bim_zone_labels_stamp ON public.bim_zone_labels;
CREATE TRIGGER bim_zone_labels_stamp
  BEFORE INSERT OR UPDATE ON public.bim_zone_labels
  FOR EACH ROW EXECUTE FUNCTION public.bim_zone_labels_stamp_audit();

-- ── 4. ZONE-SENSOR LOOKUP VIEW (security_invoker — inherits caller RLS) ──
DROP VIEW IF EXISTS public.bim_zone_sensors;
CREATE VIEW public.bim_zone_sensors
WITH (security_invoker = true) AS
SELECT
  z.id            AS zone_label_id,
  z.property_id,
  z.model_key,
  z.custom_name,
  z.zone_type,
  z.anchor_x,
  z.anchor_y,
  z.anchor_z,
  unnest(z.assigned_device_ids) AS sensor_id
FROM public.bim_zone_labels z;

-- ── 5. ROW LEVEL SECURITY (per-property scope, fail closed) ───────────
ALTER TABLE public.bim_zone_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bim_zone_labels_read"           ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_insert"         ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_update"         ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_delete"         ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_read_scoped"    ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_insert_scoped"  ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_update_scoped"  ON public.bim_zone_labels;
DROP POLICY IF EXISTS "bim_zone_labels_delete_scoped"  ON public.bim_zone_labels;

CREATE POLICY "bim_zone_labels_read_scoped"
  ON public.bim_zone_labels FOR SELECT
  TO authenticated
  USING (public.bim_user_can_read(property_id));

CREATE POLICY "bim_zone_labels_insert_scoped"
  ON public.bim_zone_labels FOR INSERT
  TO authenticated
  WITH CHECK (public.bim_user_can_write(property_id));

CREATE POLICY "bim_zone_labels_update_scoped"
  ON public.bim_zone_labels FOR UPDATE
  TO authenticated
  USING      (public.bim_user_can_write(property_id))
  WITH CHECK (public.bim_user_can_write(property_id));

CREATE POLICY "bim_zone_labels_delete_scoped"
  ON public.bim_zone_labels FOR DELETE
  TO authenticated
  USING (public.bim_user_can_write(property_id));

-- ── 6. REALTIME PUBLICATION (RLS-aware) ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'bim_zone_labels'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bim_zone_labels';
  END IF;
END $$;

-- ── 7. PRIVATE STORAGE BUCKET FOR IFC / FRAG FILES ────────────────────
-- IFC models leak building geometry / MEP layouts so the bucket is
-- private. The React layer mints short-lived signed URLs via
-- `resolveIfcUrl()` in src/app/lib/bim/zoneLabelsRepo.ts.
-- DO NOTHING so re-runs never silently rewrite a bucket whose settings
-- have been tuned in prod.
--
-- file_size_limit = 50 MB. Supabase enforces a project-tier-wide ceiling on
-- this value (50 MB on Free, larger on Pro/Team) — values above the
-- account ceiling are rejected with HTTP 413 at bucket-creation time. If a
-- bigger ceiling is needed, raise this AND your project's tier limit
-- together. Compressed IFC / fragmented (.frag) typically fits well under.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bim-models',
  'bim-models',
  false,                                      -- PRIVATE
  52428800,                                   -- 50 MB upload cap (free tier)
  ARRAY['model/ifc', 'application/x-step', 'application/vnd.ifc', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Path-prefix RLS: object key MUST be `<property_id>/<filename>`. Files
-- with no folder fall through (`storage.foldername(name)[1]` is NULL,
-- which makes the membership check return false). That's intentional.
DROP POLICY IF EXISTS "bim-models read public"           ON storage.objects;
DROP POLICY IF EXISTS "bim-models write authenticated"   ON storage.objects;
DROP POLICY IF EXISTS "bim-models update authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "bim-models delete authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "bim-models read scoped"           ON storage.objects;
DROP POLICY IF EXISTS "bim-models write scoped"          ON storage.objects;
DROP POLICY IF EXISTS "bim-models update scoped"         ON storage.objects;
DROP POLICY IF EXISTS "bim-models delete scoped"         ON storage.objects;

CREATE POLICY "bim-models read scoped"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bim-models'
    AND public.bim_user_can_read((storage.foldername(name))[1])
  );

CREATE POLICY "bim-models write scoped"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bim-models'
    AND public.bim_user_can_write((storage.foldername(name))[1])
  );

CREATE POLICY "bim-models update scoped"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'bim-models'
    AND public.bim_user_can_write((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'bim-models'
    AND public.bim_user_can_write((storage.foldername(name))[1])
  );

CREATE POLICY "bim-models delete scoped"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bim-models'
    AND public.bim_user_can_write((storage.foldername(name))[1])
  );

-- ── 8. SEED: register the existing CCC 17F model ─────────────────────
-- Stores the storage key (not a public URL) — the bucket is private and
-- resolveIfcUrl() mints a signed URL on demand.
INSERT INTO public.bim_models (property_id, name, version, ifc_url, is_default, metadata)
VALUES (
  'ccc-17f',
  'CCC 17F MEP, ARC & STR',
  '2024',
  'ccc-17f/CCC 17F MEP, ARC & STR (2024).ifc',
  true,
  jsonb_build_object(
    'discipline', ARRAY['MEP','ARC','STR'],
    'storey',     '17F',
    'units',      'm',
    'note',       'Upload the .ifc file to the bim-models bucket under ccc-17f/ before this URL works.'
  )
)
ON CONFLICT (property_id, name, version) DO NOTHING;
