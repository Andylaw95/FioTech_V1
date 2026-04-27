/**
 * Supabase-backed repository for BIM zone labels.
 *
 * Drop-in replacement for the localStorage-only `zoneLabels.ts` once the
 * Phase 1 migration (`20260427_bim_zone_labels_phase1.sql`) is applied.
 *
 * Strategy:
 *   1. If the user is authenticated AND the network call succeeds, use
 *      Supabase as the source of truth.
 *   2. On every read, also write through to localStorage so the demo
 *      keeps working offline / when Supabase is unreachable.
 *   3. On Supabase failure, transparently fall back to the existing
 *      localStorage layer (legacy behavior).
 *
 * Realtime: subscribe with `subscribeToZoneLabels(propertyId, modelKey, cb)`
 * to get push updates when another user edits the same property.
 */

import { supabase } from '@/app/utils/AuthContext';
import {
  type ZoneLabel,
  getAllLabels as lsGetAll,
  createLabel as lsCreate,
  updateLabel as lsUpdate,
  deleteLabelById as lsDelete,
  _localUpsert,
} from '@/app/components/demo/bim3d/zoneLabels';

/**
 * Property/model identifiers are interpolated into PostgREST `filter=` strings
 * for Realtime subscriptions, so we must reject anything that could break out
 * of the filter syntax (commas, operators, dots, quotes…). The id space is
 * controlled by us — we generate them — so a strict character class is safe.
 */
const ID_SAFE = /^[A-Za-z0-9_-]{1,64}$/;
function assertSafeId(label: string, value: string): void {
  if (!ID_SAFE.test(value)) {
    throw new Error(`[zoneLabelsRepo] unsafe ${label}: ${JSON.stringify(value)}`);
  }
}

interface BimZoneLabelRow {
  id: string;
  property_id: string;
  model_key: string;
  express_id: number;
  custom_name: string | null;
  custom_code: string | null;
  zone_type: ZoneLabel['zoneType'] | null;
  notes: string | null;
  color: string | null;
  anchor_x: number;
  anchor_y: number;
  anchor_z: number;
  assigned_device_ids: string[] | null;
  updated_at: string;
}

function rowToLabel(r: BimZoneLabelRow): ZoneLabel {
  return {
    id: r.id,
    expressId: r.express_id,
    customName: r.custom_name ?? undefined,
    customCode: r.custom_code ?? undefined,
    zoneType: r.zone_type ?? undefined,
    notes: r.notes ?? undefined,
    color: r.color ?? undefined,
    anchor: { x: r.anchor_x, y: r.anchor_y, z: r.anchor_z },
    assignedDeviceIds: r.assigned_device_ids ?? [],
    updatedAt: r.updated_at,
  };
}

function labelToRow(propertyId: string, modelKey: string, l: ZoneLabel): Omit<BimZoneLabelRow, 'updated_at'> {
  return {
    id: l.id,
    property_id: propertyId,
    model_key: modelKey,
    express_id: l.expressId,
    custom_name: l.customName ?? null,
    custom_code: l.customCode ?? null,
    zone_type: l.zoneType ?? null,
    notes: l.notes ?? null,
    color: l.color ?? null,
    anchor_x: l.anchor.x,
    anchor_y: l.anchor.y,
    anchor_z: l.anchor.z,
    assigned_device_ids: l.assignedDeviceIds ?? [],
  };
}

async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch { return false; }
}

/* ──────────────── Public API ──────────────── */

export async function fetchAllLabels(propertyId: string, modelKey: string): Promise<ZoneLabel[]> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  if (!(await isAuthenticated())) return lsGetAll(modelKey);
  try {
    const { data, error } = await supabase
      .from('bim_zone_labels')
      .select('*')
      .eq('property_id', propertyId)
      .eq('model_key', modelKey);
    if (error) throw error;
    const labels = (data ?? []).map(rowToLabel);
    // Hydrate localStorage so an offline reload — or a transient network
    // failure on the next call — keeps showing the latest known labels.
    // Use the bypass-the-cloud-handler upsert so this read doesn't echo
    // back to the server as N writes.
    try {
      for (const l of labels) _localUpsert(modelKey, l);
    } catch (cacheErr) {
      console.warn('[zoneLabelsRepo] localStorage hydrate failed', cacheErr);
    }
    return labels;
  } catch (err) {
    console.warn('[zoneLabelsRepo] cloud read failed, falling back to localStorage', err);
    return lsGetAll(modelKey);
  }
}

export async function createLabelCloud(
  propertyId: string,
  modelKey: string,
  expressId: number,
  anchor: { x: number; y: number; z: number },
  patch: Partial<Omit<ZoneLabel, 'id' | 'expressId' | 'anchor' | 'updatedAt'>>,
): Promise<ZoneLabel> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  // Always write locally first (instant UI, offline-safe).
  const local = lsCreate(modelKey, expressId, anchor, patch);
  if (!(await isAuthenticated())) return local;
  try {
    const row = labelToRow(propertyId, modelKey, local);
    const { data, error } = await supabase
      .from('bim_zone_labels')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    const cloud = rowToLabel(data as BimZoneLabelRow);
    // Sync server-authoritative fields (timestamps, server-side defaults) back to localStorage.
    lsUpdate(modelKey, cloud.id, cloud);
    return cloud;
  } catch (err) {
    console.warn('[zoneLabelsRepo] cloud insert failed, kept local copy', err);
    return local;
  }
}

export async function updateLabelCloud(
  propertyId: string,
  modelKey: string,
  id: string,
  patch: Partial<Omit<ZoneLabel, 'id' | 'updatedAt'>>,
): Promise<ZoneLabel | null> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  const local = lsUpdate(modelKey, id, patch);
  if (!local || !(await isAuthenticated())) return local;
  try {
    const row = labelToRow(propertyId, modelKey, local);
    const { data, error } = await supabase
      .from('bim_zone_labels')
      .update(row)
      .eq('id', id)
      // Defense-in-depth: scope the WHERE so an id collision can never touch
      // another property's row even if RLS were temporarily disabled.
      .eq('property_id', propertyId)
      .select()
      .single();
    if (error) throw error;
    const cloud = rowToLabel(data as BimZoneLabelRow);
    lsUpdate(modelKey, cloud.id, cloud);
    return cloud;
  } catch (err) {
    console.warn('[zoneLabelsRepo] cloud update failed, kept local copy', err);
    return local;
  }
}

export async function deleteLabelCloud(propertyId: string, modelKey: string, id: string): Promise<void> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  lsDelete(modelKey, id);
  if (!(await isAuthenticated())) return;
  try {
    const { error } = await supabase
      .from('bim_zone_labels')
      .delete()
      .eq('id', id)
      .eq('property_id', propertyId);
    if (error) throw error;
  } catch (err) {
    console.warn('[zoneLabelsRepo] cloud delete failed (local copy already removed)', err);
  }
}

/* ──────────────── Push-only cloud writers ──────────────── *
 *
 * Used by the `setCloudSyncHandler` plumbing in `zoneLabels.ts`. They are
 * called AFTER the localStorage layer has already persisted, so they MUST
 * NOT call back into the local layer (would recurse) — they only push the
 * already-saved row up to Supabase.
 */
export async function pushCreate(propertyId: string, modelKey: string, label: ZoneLabel): Promise<void> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  if (!(await isAuthenticated())) return;
  try {
    const row = labelToRow(propertyId, modelKey, label);
    const { error } = await supabase.from('bim_zone_labels').insert(row);
    if (error) throw error;
  } catch (err) {
    console.warn('[zoneLabelsRepo] pushCreate failed (local copy preserved)', err);
  }
}

export async function pushUpdate(propertyId: string, modelKey: string, id: string, label: ZoneLabel): Promise<void> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  assertSafeId('id', id);
  if (!(await isAuthenticated())) return;
  try {
    const row = labelToRow(propertyId, modelKey, label);
    const { error } = await supabase
      .from('bim_zone_labels')
      .update(row)
      .eq('id', id)
      .eq('property_id', propertyId);
    if (error) throw error;
  } catch (err) {
    console.warn('[zoneLabelsRepo] pushUpdate failed (local copy preserved)', err);
  }
}

export async function pushDelete(propertyId: string, id: string): Promise<void> {
  assertSafeId('propertyId', propertyId);
  assertSafeId('id', id);
  if (!(await isAuthenticated())) return;
  try {
    const { error } = await supabase
      .from('bim_zone_labels')
      .delete()
      .eq('id', id)
      .eq('property_id', propertyId);
    if (error) throw error;
  } catch (err) {
    console.warn('[zoneLabelsRepo] pushDelete failed (local copy already removed)', err);
  }
}

/**
 * Subscribe to realtime changes for a given (property, model). Returns an
 * unsubscribe function.
 *
 * MUST be used inside a useEffect cleanup to avoid leaking the channel:
 *   useEffect(() => {
 *     const unsub = subscribeToZoneLabels(propertyId, modelKey, reload);
 *     return unsub;
 *   }, [propertyId, modelKey]);
 */
export function subscribeToZoneLabels(
  propertyId: string,
  modelKey: string,
  onChange: () => void,
): () => void {
  assertSafeId('propertyId', propertyId);
  assertSafeId('modelKey', modelKey);
  const channel = supabase
    .channel(`bim_zone_labels:${propertyId}:${modelKey}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bim_zone_labels',
        // Realtime filter param only supports a single eq predicate, so we
        // scope by property and check the model client-side. Property-level
        // filtering is what matters for cost; model collisions inside one
        // property cause at most a redundant reload.
        filter: `property_id=eq.${propertyId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as { model_key?: string } | null;
        if (row && row.model_key && row.model_key !== modelKey) return;
        onChange();
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); }
    catch (err) { console.warn('[zoneLabelsRepo] channel cleanup failed', err); }
  };
}

/**
 * Resolve the IFC URL for a (property, model). Tries to mint a short-lived
 * signed URL from Supabase Storage (the `bim-models` bucket is private as of
 * Phase 1.1). Falls back in order: `frag_url` → `ifc_url` registered on the
 * model → `bundledFallback` (the asset bundled with the app).
 *
 * Object keys are conventionally `<property_id>/<filename>` and `ifc_url`
 * may either be a full https URL (legacy / external) or just the storage
 * key. We only sign storage keys; full URLs are returned as-is.
 *
 * NOTE: signed URLs expire after 1 hour. Callers should re-resolve before
 * triggering a model reload (e.g. on hot-swap). The IfcModel component
 * holds the loaded geometry in memory so an expiring URL only bites if
 * the same file is fetched again.
 */
export async function resolveIfcUrl(
  propertyId: string,
  bundledFallback: string,
): Promise<string> {
  assertSafeId('propertyId', propertyId);
  try {
    const { data, error } = await supabase
      .from('bim_models')
      .select('ifc_url, frag_url')
      .eq('property_id', propertyId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const candidate = data?.frag_url || data?.ifc_url;
    if (!candidate) return bundledFallback;

    // External / already-signed URL → return verbatim.
    if (/^https?:\/\//i.test(candidate)) return candidate;

    // Storage key → mint a 1-hour signed URL.
    const { data: signed, error: signErr } = await supabase
      .storage
      .from('bim-models')
      .createSignedUrl(candidate, 3600);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error('no signed url');
    return signed.signedUrl;
  } catch {
    return bundledFallback;
  }
}

/**
 * Wipe locally-cached zone labels for ALL models. Call from the auth
 * sign-out handler so a shared / kiosk machine doesn't leak the previous
 * tenant's zone names + notes to the next user.
 */
export function clearLocalLabelCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const prefix = 'fiotec.bim.zoneLabels.';
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToDelete.push(k);
    }
    keysToDelete.forEach((k) => window.localStorage.removeItem(k));
  } catch (err) {
    console.warn('[zoneLabelsRepo] failed to clear local label cache', err);
  }
}
