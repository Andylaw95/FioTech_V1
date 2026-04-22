/**
 * BIM zone / area / element label overrides.
 *
 * Stores user-edited names for IFC elements without modifying the .ifc file.
 * Currently uses localStorage (per-browser). Schema is Supabase-ready for
 * future cloud sync — see `bim_zone_labels` migration plan.
 */

export interface ZoneLabel {
  expressId: number;
  customName?: string;
  customCode?: string;
  zoneType?: 'room' | 'area' | 'zone' | 'asset' | 'other';
  notes?: string;
  color?: string;
  updatedAt: string;
}

type LabelMap = Record<string, ZoneLabel>;

const KEY_PREFIX = 'fiotec.bim.zoneLabels.';

function storageKey(modelKey: string) {
  return `${KEY_PREFIX}${modelKey}`;
}

function loadAll(modelKey: string): LabelMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(modelKey));
    return raw ? (JSON.parse(raw) as LabelMap) : {};
  } catch {
    return {};
  }
}

function saveAll(modelKey: string, map: LabelMap) {
  try {
    window.localStorage.setItem(storageKey(modelKey), JSON.stringify(map));
  } catch (err) {
    console.warn('[zoneLabels] save failed', err);
  }
}

export function getLabel(modelKey: string, expressId: number): ZoneLabel | null {
  const map = loadAll(modelKey);
  return map[String(expressId)] ?? null;
}

export function getAllLabels(modelKey: string): ZoneLabel[] {
  return Object.values(loadAll(modelKey));
}

export function upsertLabel(
  modelKey: string,
  expressId: number,
  patch: Partial<Omit<ZoneLabel, 'expressId' | 'updatedAt'>>,
): ZoneLabel {
  const map = loadAll(modelKey);
  const existing = map[String(expressId)] ?? { expressId, updatedAt: new Date().toISOString() };
  const next: ZoneLabel = {
    ...existing,
    ...patch,
    expressId,
    updatedAt: new Date().toISOString(),
  };
  map[String(expressId)] = next;
  saveAll(modelKey, map);
  return next;
}

export function deleteLabel(modelKey: string, expressId: number) {
  const map = loadAll(modelKey);
  delete map[String(expressId)];
  saveAll(modelKey, map);
}

export function clearAllLabels(modelKey: string) {
  saveAll(modelKey, {});
}

/** Export current overrides as JSON (so user can back up / sync to cloud later). */
export function exportLabels(modelKey: string): string {
  return JSON.stringify(loadAll(modelKey), null, 2);
}

export function importLabels(modelKey: string, json: string) {
  const parsed = JSON.parse(json) as LabelMap;
  saveAll(modelKey, parsed);
}
