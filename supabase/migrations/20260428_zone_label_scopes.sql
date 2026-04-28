-- ─────────────────────────────────────────────────────────────────────
-- Zone Label Scopes (Admin global / User private)
-- 2026-04-28 — Phase 2 of bim_zone_labels
--
-- Adds:
--   • scope:       'global' (admin only)  |  'private' (per-user)
--   • created_by:  uid of the user who created the label
--   • admin_emails table  +  is_admin() helper used by RLS
--
-- Visibility rule:  user sees   scope='global'   ∪   created_by = auth.uid()
-- Write rule:       admin can write 'global';  any user can write own 'private'.
-- ─────────────────────────────────────────────────────────────────────

-- 1.  ADMIN EMAILS REGISTRY (mirror of Edge Function MASTER_EMAILS env var)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.admin_emails (email) VALUES ('andylaw@fsenv.com.hk')
ON CONFLICT (email) DO NOTHING;

-- 2.  is_admin()  helper, callable from RLS policies
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_emails ae
    JOIN auth.users u ON lower(u.email) = lower(ae.email)
    WHERE u.id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3.  Add columns to bim_zone_labels
ALTER TABLE public.bim_zone_labels
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE public.bim_zone_labels
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global','private'));

-- Default created_by to the current authenticated user on INSERT.
ALTER TABLE public.bim_zone_labels
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 4.  Backfill: existing rows are global, owned by the first admin
UPDATE public.bim_zone_labels
SET scope = 'global',
    created_by = COALESCE(
      created_by,
      (SELECT u.id FROM auth.users u
       JOIN public.admin_emails ae ON lower(u.email) = lower(ae.email)
       LIMIT 1)
    )
WHERE scope IS NULL OR created_by IS NULL;

CREATE INDEX IF NOT EXISTS bim_zone_labels_scope_user_idx
  ON public.bim_zone_labels (property_id, model_key, scope, created_by);

-- 5.  RLS policies (replace any existing select/insert/update/delete)
ALTER TABLE public.bim_zone_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bzl_select_all_authenticated  ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_insert_authenticated      ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_update_authenticated      ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_delete_authenticated      ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_select                    ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_insert                    ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_update                    ON public.bim_zone_labels;
DROP POLICY IF EXISTS bzl_delete                    ON public.bim_zone_labels;
-- Drop legacy property-scoped policies from the prior phase; they were OR'ed
-- with the new scope policies, which made every label visible to every user.
DROP POLICY IF EXISTS bim_zone_labels_read_scoped   ON public.bim_zone_labels;
DROP POLICY IF EXISTS bim_zone_labels_insert_scoped ON public.bim_zone_labels;
DROP POLICY IF EXISTS bim_zone_labels_update_scoped ON public.bim_zone_labels;
DROP POLICY IF EXISTS bim_zone_labels_delete_scoped ON public.bim_zone_labels;

CREATE POLICY bzl_select ON public.bim_zone_labels
  FOR SELECT TO authenticated
  USING (scope = 'global' OR created_by = auth.uid());

CREATE POLICY bzl_insert ON public.bim_zone_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'private' AND created_by = auth.uid())
    OR (scope = 'global' AND public.is_admin())
  );

CREATE POLICY bzl_update ON public.bim_zone_labels
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (
    (scope = 'private' AND created_by = auth.uid())
    OR (scope = 'global' AND public.is_admin())
  );

CREATE POLICY bzl_delete ON public.bim_zone_labels
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- 6.  Realtime publication (idempotent — keep it on the table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bim_zone_labels'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bim_zone_labels';
  END IF;
END $$;
