// BIM IOC helpers — KV access for bim_model / bim_device_map / property_geo
// and Postgres access for safety_alarms / bim_models.
//
// Usage: pass the service-role Supabase client from routes.tsx into init().
import * as kv from "../kv_store.tsx";

type SupabaseLike = any;

let _sb: SupabaseLike | null = null;
export function initBim(sb: SupabaseLike) { _sb = sb; }
function sb(): SupabaseLike {
  if (!_sb) throw new Error("bim_helpers.sb() called before initBim()");
  return _sb;
}

// ── KV PREFIXES ───────────────────────────────────────────────────────
export const KV_BIM_MODEL       = "bim_model:";       // <propertyId>
export const KV_BIM_DEVICE_MAP  = "bim_device_map:";  // <propertyId>:<expressId>
export const KV_PROPERTY_GEO    = "property_geo:";    // <propertyId>

// ── TYPES ─────────────────────────────────────────────────────────────
export interface PropertyGeo {
  propertyId: string;
  lat: number;
  lng: number;
  footprint?: GeoJSON.Polygon | null;
  storeys?: number;
  heightMeters?: number;
  updatedAt?: string;
}

export interface BimDeviceMapping {
  propertyId: string;
  expressId: string;     // BIM element id
  deviceId: string;
  storey?: string;
  x?: number; y?: number; z?: number;
  updatedAt?: string;
}

export interface BimModelRef {
  propertyId: string;
  name: string;
  version: string;
  fragUrl?: string | null;
  ifcUrl?: string | null;
  tilesetUrl?: string | null;
  isDefault: boolean;
  metadata?: Record<string, unknown>;
}

export type SafetyAlarmType = "water" | "fire" | "smoke";
export type SafetyAlarmStatus =
  "pending" | "acknowledged" | "in_progress" | "resolved" | "false_alarm";

export interface SafetyAlarmInsert {
  property_id: string;
  property_name?: string;
  device_id: string;
  device_name?: string;
  alarm_type: SafetyAlarmType;
  severity?: "critical" | "high" | "medium" | "low";
  source_attr?: string;
  spatial_id?: string;
  storey?: string;
  location_text?: string;
  occurred_at?: string;
  raw_payload?: Record<string, unknown>;
}

// ── KV: property_geo ──────────────────────────────────────────────────
export async function getPropertyGeo(propertyId: string): Promise<PropertyGeo | null> {
  const v = await kv.get(KV_PROPERTY_GEO + propertyId);
  return (v as PropertyGeo) || null;
}
export async function setPropertyGeo(geo: PropertyGeo): Promise<void> {
  geo.updatedAt = new Date().toISOString();
  await kv.set(KV_PROPERTY_GEO + geo.propertyId, geo);
}
export async function listPropertyGeos(): Promise<PropertyGeo[]> {
  const rows = await kv.getByPrefix(KV_PROPERTY_GEO);
  return (rows || []).filter(Boolean) as PropertyGeo[];
}

// ── KV: bim_device_map ────────────────────────────────────────────────
export async function setBimDeviceMapping(m: BimDeviceMapping): Promise<void> {
  m.updatedAt = new Date().toISOString();
  await kv.set(`${KV_BIM_DEVICE_MAP}${m.propertyId}:${m.expressId}`, m);
}
export async function getBimDeviceMappingsForProperty(propertyId: string): Promise<BimDeviceMapping[]> {
  const rows = await kv.getByPrefix(`${KV_BIM_DEVICE_MAP}${propertyId}:`);
  return (rows || []).filter(Boolean) as BimDeviceMapping[];
}
export async function getBimDeviceMappingByExpressId(propertyId: string, expressId: string) {
  return (await kv.get(`${KV_BIM_DEVICE_MAP}${propertyId}:${expressId}`)) as BimDeviceMapping | null;
}

// ── Postgres: bim_models ──────────────────────────────────────────────
export async function getDefaultBimModel(propertyId: string): Promise<BimModelRef | null> {
  const { data, error } = await sb()
    .from("bim_models")
    .select("*")
    .eq("property_id", propertyId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn("[BIM] getDefaultBimModel error", error.message); return null; }
  if (!data) return null;
  return {
    propertyId: data.property_id,
    name: data.name,
    version: data.version,
    fragUrl: data.frag_url,
    ifcUrl: data.ifc_url,
    tilesetUrl: data.tileset_url,
    isDefault: !!data.is_default,
    metadata: data.metadata || {},
  };
}

export async function upsertBimModel(m: BimModelRef) {
  const row = {
    property_id: m.propertyId,
    name: m.name,
    version: m.version,
    frag_url: m.fragUrl ?? null,
    ifc_url: m.ifcUrl ?? null,
    tileset_url: m.tilesetUrl ?? null,
    is_default: m.isDefault,
    metadata: m.metadata || {},
  };
  const { data, error } = await sb()
    .from("bim_models")
    .upsert(row, { onConflict: "property_id,name,version" })
    .select()
    .single();
  if (error) throw new Error(`upsertBimModel: ${error.message}`);
  return data;
}

// ── Postgres: safety_alarms (realtime) ────────────────────────────────
export async function insertSafetyAlarm(a: SafetyAlarmInsert) {
  const { data, error } = await sb()
    .from("safety_alarms")
    .insert({
      property_id: a.property_id,
      property_name: a.property_name ?? null,
      device_id: a.device_id,
      device_name: a.device_name ?? null,
      alarm_type: a.alarm_type,
      severity: a.severity ?? "high",
      source_attr: a.source_attr ?? null,
      spatial_id: a.spatial_id ?? null,
      storey: a.storey ?? null,
      location_text: a.location_text ?? null,
      occurred_at: a.occurred_at ?? new Date().toISOString(),
      raw_payload: a.raw_payload ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(`insertSafetyAlarm: ${error.message}`);
  return data;
}

export async function listSafetyAlarms(opts: {
  propertyId?: string;
  status?: SafetyAlarmStatus | SafetyAlarmStatus[];
  alarmType?: SafetyAlarmType;
  limit?: number;
} = {}) {
  let q = sb().from("safety_alarms").select("*").order("occurred_at", { ascending: false });
  if (opts.propertyId) q = q.eq("property_id", opts.propertyId);
  if (opts.alarmType) q = q.eq("alarm_type", opts.alarmType);
  if (opts.status) {
    q = Array.isArray(opts.status) ? q.in("status", opts.status) : q.eq("status", opts.status);
  }
  q = q.limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  const { data, error } = await q;
  if (error) throw new Error(`listSafetyAlarms: ${error.message}`);
  return data || [];
}

export async function updateSafetyAlarmStatus(
  id: number,
  status: SafetyAlarmStatus,
  actor: { id: string; email?: string },
  notes?: string,
) {
  const patch: Record<string, unknown> = { status };
  if (status === "acknowledged") {
    patch.acknowledged_by = actor.email || actor.id;
    patch.acknowledged_at = new Date().toISOString();
  } else if (status === "resolved" || status === "false_alarm") {
    patch.resolved_by = actor.email || actor.id;
    patch.resolved_at = new Date().toISOString();
  }
  if (typeof notes === "string") patch.notes = notes;
  const { data, error } = await sb()
    .from("safety_alarms")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateSafetyAlarmStatus: ${error.message}`);
  return data;
}

// ── Helper: auto-mirror legacy water/fire/smoke alarm into safety_alarms ──
// Returns true iff a new realtime row was inserted.
export async function mirrorLegacyAlarmToSafety(alarm: {
  id: string;
  type: string;        // e.g. "Water Leakage", "Smoke Detected", "Fire"
  property?: string;
  propertyId?: string;
  device_id?: string;
  deviceId?: string;
  device?: string;
  location?: string;
  severity?: string;
  description?: string;
}): Promise<boolean> {
  const t = (alarm.type || "").toLowerCase();
  let kind: SafetyAlarmType | null = null;
  if (t.includes("water") || t.includes("leak")) kind = "water";
  else if (t.includes("smoke")) kind = "smoke";
  else if (t.includes("fire")) kind = "fire";
  if (!kind) return false;
  try {
    await insertSafetyAlarm({
      property_id: alarm.propertyId || alarm.property || "unknown",
      property_name: alarm.property,
      device_id: alarm.deviceId || alarm.device_id || alarm.device || alarm.id,
      device_name: alarm.device,
      alarm_type: kind,
      severity: (alarm.severity as any) || "high",
      source_attr: alarm.description,
      location_text: alarm.location,
      raw_payload: alarm as unknown as Record<string, unknown>,
    });
    return true;
  } catch (e) {
    console.warn("[BIM] mirrorLegacyAlarmToSafety failed:", (e as Error).message);
    return false;
  }
}
