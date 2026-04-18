-- ═══════════════════════════════════════════════════════════════════════
-- BIM IOC Phase 0 — Schema, RLS, Realtime
--
-- Adds two new Postgres tables:
--   1. safety_alarms  — real-time life-safety alarms (water / fire / smoke)
--                       published over Supabase Realtime
--   2. bim_models     — registry of BIM .frag / .ifc assets per property
--
-- Everything else (devices, non-safety alarms, BIM↔device mapping, property
-- geo) stays in the existing kv_store_4916a0b9 KV table (free-tier friendly).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. SAFETY ALARMS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_alarms (
  id              BIGSERIAL PRIMARY KEY,
  property_id     TEXT NOT NULL,
  property_name   TEXT,
  device_id       TEXT NOT NULL,
  device_name     TEXT,
  alarm_type      TEXT NOT NULL CHECK (alarm_type IN ('water','fire','smoke')),
  severity        TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('critical','high','medium','low')),
  source_attr     TEXT,
  spatial_id      TEXT,
  storey          TEXT,
  location_text   TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','in_progress','resolved','false_alarm')),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_alarms_property_status_idx
  ON public.safety_alarms (property_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS safety_alarms_status_idx
  ON public.safety_alarms (status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS safety_alarms_type_idx
  ON public.safety_alarms (alarm_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_alarms_touch ON public.safety_alarms;
CREATE TRIGGER safety_alarms_touch
  BEFORE UPDATE ON public.safety_alarms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 2. BIM MODELS REGISTRY ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_models (
  id            BIGSERIAL PRIMARY KEY,
  property_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  version       TEXT NOT NULL DEFAULT 'v1',
  frag_url      TEXT,
  ifc_url       TEXT,
  tileset_url   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, name, version)
);

CREATE INDEX IF NOT EXISTS bim_models_property_default_idx
  ON public.bim_models (property_id, is_default DESC, created_at DESC);

DROP TRIGGER IF EXISTS bim_models_touch ON public.bim_models;
CREATE TRIGGER bim_models_touch
  BEFORE UPDATE ON public.bim_models
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 3. ROW LEVEL SECURITY ──────────────────────────────────────────────
ALTER TABLE public.safety_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bim_models    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_alarms_read_authenticated" ON public.safety_alarms;
CREATE POLICY "safety_alarms_read_authenticated"
  ON public.safety_alarms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "bim_models_read_authenticated" ON public.bim_models;
CREATE POLICY "bim_models_read_authenticated"
  ON public.bim_models FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "safety_alarms_update_authenticated" ON public.safety_alarms;
CREATE POLICY "safety_alarms_update_authenticated"
  ON public.safety_alarms FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 4. REALTIME PUBLICATION ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'safety_alarms'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_alarms';
  END IF;
END $$;
