/**
 * BIM zone / area / element label overrides.
 *
 * Each label has its own UUID so a single IFC element (e.g. one big floor mesh)
 * can host MANY labels at different points. Migrated forward from the previous
 * schema which keyed labels by expressId (one per element).
 *
 * Stored in localStorage; schema is Supabase-ready for future cloud sync.
 */

export interface ZoneLabel {
  /** Unique label id (uuid). */
  id: string;
  /** IFC element this label sits on (for highlight + isolation). */
  expressId: number;
  customName?: string;
  customCode?: string;
  zoneType?: 'room' | 'area' | 'zone' | 'asset' | 'other';
  notes?: string;
  color?: string;
  /** World-space anchor for the floor text — required. */
  anchor: { x: number; y: number; z: number };
  /** Sensor IDs (from MOCK_SENSORS) assigned to this zone. */
  assignedDeviceIds?: string[];
  updatedAt: string;
}

type LabelMap = Record<string, ZoneLabel>;

const KEY_PREFIX = 'fiotec.bim.zoneLabels.';
const SCHEMA_KEY = 'fiotec.bim.zoneLabels.schema';
const SCHEMA_VERSION = 2;

function storageKey(modelKey: string) {
  return `${KEY_PREFIX}${modelKey}`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function migrateIfNeeded(modelKey: string, raw: any): LabelMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: LabelMap = {};
  for (const [k, v] of Object.entries<any>(raw)) {
    if (!v) continue;
    // Already v2 (keyed by id, has anchor)
    if (typeof v.id === 'string' && v.anchor) {
      out[v.id] = v as ZoneLabel;
      continue;
    }
    // v1: keyed by expressId, no id, anchor optional
    const id = uuid();
    out[id] = {
      id,
      expressId: typeof v.expressId === 'number' ? v.expressId : Number(k),
      customName: v.customName,
      customCode: v.customCode,
      zoneType: v.zoneType,
      notes: v.notes,
      color: v.color,
      assignedDeviceIds: v.assignedDeviceIds,
      anchor: v.anchor ?? { x: 0, y: 0, z: 0 },
      updatedAt: v.updatedAt ?? new Date().toISOString(),
    };
  }
  saveAll(modelKey, out);
  try { window.localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION)); } catch {}
  return out;
}

function loadAll(modelKey: string): LabelMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(modelKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const schema = Number(window.localStorage.getItem(SCHEMA_KEY) ?? 1);
    if (schema < SCHEMA_VERSION) return migrateIfNeeded(modelKey, parsed);
    return parsed as LabelMap;
  } catch {
    return {};
  }
}

function saveAll(modelKey: string, map: LabelMap) {
  try {
    window.localStorage.setItem(storageKey(modelKey), JSON.stringify(map));
    // Notify same-tab listeners (storage event only fires across tabs)
    try { window.dispatchEvent(new CustomEvent('fiotech.zone-labels-changed')); } catch {}
  } catch (err) {
    console.warn('[zoneLabels] save failed', err);
  }
}

/**
 * Optional cloud sync hook. Bim3DStage installs handlers in a useEffect
 * tied to (propertyId, modelKey). Every local mutation calls these
 * fire-and-forget — local writes stay instant + offline-safe, the cloud
 * just trails. Setting handler to `null` (component unmount, sign-out)
 * disables push without dropping local writes.
 */
export interface CloudSyncHandlers {
  create: (label: ZoneLabel) => void;
  update: (id: string, label: ZoneLabel) => void;
  delete: (id: string) => void;
}
let cloudHandlers: CloudSyncHandlers | null = null;
export function setCloudSyncHandler(h: CloudSyncHandlers | null) {
  cloudHandlers = h;
}

export function getLabelById(modelKey: string, id: string): ZoneLabel | null {
  return loadAll(modelKey)[id] ?? null;
}

export function getLabelsByExpressId(modelKey: string, expressId: number): ZoneLabel[] {
  return Object.values(loadAll(modelKey)).filter((l) => l.expressId === expressId);
}

export function getAllLabels(modelKey: string): ZoneLabel[] {
  return Object.values(loadAll(modelKey));
}

/** Create a brand-new label. Returns the saved label with id. */
export function createLabel(
  modelKey: string,
  expressId: number,
  anchor: { x: number; y: number; z: number },
  patch: Partial<Omit<ZoneLabel, 'id' | 'expressId' | 'anchor' | 'updatedAt'>>,
): ZoneLabel {
  const map = loadAll(modelKey);
  const id = uuid();
  const next: ZoneLabel = {
    id,
    expressId,
    anchor,
    customName: patch.customName,
    customCode: patch.customCode,
    zoneType: patch.zoneType,
    notes: patch.notes,
    color: patch.color,
    assignedDeviceIds: patch.assignedDeviceIds,
    updatedAt: new Date().toISOString(),
  };
  map[id] = next;
  saveAll(modelKey, map);
  try { cloudHandlers?.create(next); } catch (err) { console.warn('[zoneLabels] cloud create failed', err); }
  return next;
}
export function updateLabel(
  modelKey: string,
  id: string,
  patch: Partial<Omit<ZoneLabel, 'id' | 'updatedAt'>>,
): ZoneLabel | null {
  const map = loadAll(modelKey);
  const existing = map[id];
  if (!existing) return null;
  const next: ZoneLabel = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  map[id] = next;
  saveAll(modelKey, map);
  try { cloudHandlers?.update(id, next); } catch (err) { console.warn('[zoneLabels] cloud update failed', err); }
  return next;
}

export function deleteLabelById(modelKey: string, id: string) {
  const map = loadAll(modelKey);
  delete map[id];
  saveAll(modelKey, map);
  try { cloudHandlers?.delete(id); } catch (err) { console.warn('[zoneLabels] cloud delete failed', err); }
}

/**
 * Local-only upsert used by the cloud → local hydration path. Skips the
 * cloud sync handler so a hydrate (server → client) doesn't echo back as
 * a write (client → server) and cause an infinite loop / spurious updates.
 */
export function _localUpsert(modelKey: string, label: ZoneLabel) {
  const map = loadAll(modelKey);
  map[label.id] = label;
  saveAll(modelKey, map);
}
export function _localDelete(modelKey: string, id: string) {
  const map = loadAll(modelKey);
  if (!(id in map)) return;
  delete map[id];
  saveAll(modelKey, map);
}

export function clearAllLabels(modelKey: string) {
  saveAll(modelKey, {});
}

export function exportLabels(modelKey: string): string {
  return JSON.stringify(loadAll(modelKey), null, 2);
}

/**
 * Import a JSON blob produced by `exportLabels`. The input is treated as
 * UNTRUSTED — we validate every row before persisting so a hand-crafted
 * payload can't pollute localStorage with arbitrary fields.
 */
export function importLabels(modelKey: string, json: string) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('importLabels: payload must be an object map');
  }
  const allowedZoneTypes = new Set(['room', 'area', 'zone', 'asset', 'other']);
  const out: LabelMap = {};
  for (const [k, raw] of Object.entries<any>(parsed)) {
    if (!raw || typeof raw !== 'object') continue;
    if (typeof raw.id !== 'string' || raw.id !== k) continue;
    if (typeof raw.expressId !== 'number' || !Number.isFinite(raw.expressId)) continue;
    const a = raw.anchor;
    if (!a || typeof a.x !== 'number' || typeof a.y !== 'number' || typeof a.z !== 'number') continue;
    out[raw.id] = {
      id: raw.id,
      expressId: raw.expressId,
      customName: typeof raw.customName === 'string' ? raw.customName.slice(0, 200) : undefined,
      customCode: typeof raw.customCode === 'string' ? raw.customCode.slice(0, 64)  : undefined,
      zoneType:   allowedZoneTypes.has(raw.zoneType) ? raw.zoneType : undefined,
      notes:      typeof raw.notes === 'string'      ? raw.notes.slice(0, 2000)     : undefined,
      color:      typeof raw.color === 'string'      ? raw.color.slice(0, 32)       : undefined,
      anchor:     { x: a.x, y: a.y, z: a.z },
      assignedDeviceIds: Array.isArray(raw.assignedDeviceIds)
        ? raw.assignedDeviceIds.filter((s: unknown) => typeof s === 'string').slice(0, 200)
        : undefined,
      updatedAt:  typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  }
  saveAll(modelKey, out);
}
