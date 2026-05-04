import { useEffect, useState } from 'react';
import { api, Device, Property } from '@/app/utils/api';
import type { Sensor, Subsystem } from './mockData';

const POLL_MS = 30_000;

/**
 * Maps a BIM-model slug (used in URLs and zone-label keys) to the property
 * names it represents in the device dataset. `Device.building` stores the
 * Chinese display name, NOT the slug.
 *
 * NOTE: also keep alias spellings here — Sometimes the property is registered
 * as "其士商業中心" and other times as "其士商業大廈". Match either.
 */
const BIM_SLUG_TO_PROPERTY_NAMES: Record<string, string[]> = {
  'ccc-17f': ['其士商業中心', '其士商業大廈', 'ccc'],
};

function inferType(d: Device): Sensor['type'] {
  const caps = ((d as any).capabilities ?? []).map((c: string) => String(c).toLowerCase());
  const hay = `${d.type ?? ''} ${d.model ?? ''} ${d.manufacturer ?? ''} ${d.name ?? ''}`.toLowerCase();
  // CCTV / Lift first (most specific)
  if (hay.includes('cctv') || hay.includes('camera')) return 'CCTV';
  if (hay.includes('lift') || hay.includes('elevator')) return 'Lift';
  // Noise meters
  if (hay.includes('hy108') || hay.includes('ws302') || hay.includes('noise') || hay.includes('sound') || hay.includes('decibel')) return 'HY108-1';
  if (hay.includes('as400') || hay.includes('as-400') || hay.includes('bewis') || hay.includes('vibration') || hay.includes('accelerometer')) return 'AS400';
  if (caps.some((c: string) => c === 'vibration' || c === 'ppv' || c === 'acceleration')) return 'AS400';
  // Dust / particulate
  if (hay.includes('ld-5r') || hay.includes('ld5r') || hay.includes('dust') || hay.includes('particulate')) return 'LD-5R';
  if (caps.some((c: string) => c === 'pm2_5' || c === 'pm10' || c === 'tsp')) return 'LD-5R';
  // Ambience / IAQ — AM308L, multi-gas, CO2 etc.
  if (hay.includes('am308') || hay.includes('ambience') || hay.includes('ambient') || hay.includes('environment') || hay.includes('iaq') || hay.includes('co2') || hay.includes('air quality')) return 'IAQ';
  if (caps.some((c: string) => c === 'co2' || c === 'tvoc' || c === 'hcho')) return 'IAQ';
  // Pure temperature/thermo
  if (hay.includes('thermo') || hay.includes('temperature')) return 'Temp';
  // Default to ambience (closer to reality than Temp for this property)
  return 'IAQ';
}

function inferSubsystem(t: Sensor['type']): Subsystem {
  switch (t) {
    case 'HY108-1':
    case 'LD-5R':
    case 'IAQ':
    case 'Temp':
    case 'AS400':
      return 'Environment';
    case 'CCTV':
      return 'CCTV';
    case 'Lift':
      return 'Lift';
    default:
      return 'Environment';
  }
}

/**
 * Match a device against a property using every plausible signal:
 *   • slug (`ccc-17f`) on `propertyId` / `property_id`
 *   • property name (`其士商業大廈`) on `building` / `location`
 * String comparison is case-insensitive and accepts substring matches so that
 * "其士商業大廈 — 17/F" still resolves to "其士商業大廈".
 */
function deviceMatchesProperty(d: Device, needles: string[]): boolean {
  if (needles.length === 0) return true;
  const haystack = [
    d.building,
    d.location,
    (d as any).propertyId,
    (d as any).property_id,
    (d as any).property,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().trim());
  return haystack.some((h) => needles.some((n) => h === n || h.includes(n) || n.includes(h)));
}

function deviceToSensor(d: Device): Sensor {
  const type = inferType(d);
  return {
    id: d.id,
    name: d.name || d.serialNumber || d.id,
    type,
    subsystem: inferSubsystem(type),
    x: 0, y: 0, z: 0,
    deviceId: d.id,
  };
}

/**
 * Returns the live device list for a given property, polled every 30 s,
 * shaped as the same `Sensor` interface used by the BIM picker UI.
 */
export function usePropertyDevices(propertyId: string) {
  const [devices, setDevices] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        // Build the haystack of names this BIM slug is allowed to match.
        // Order of precedence: explicit slug→names map → exact Property.id
        // match → fall back to a sole property in the workspace (1-property
        // installs are common today) → finally id-only substring match.
        const needles = new Set<string>();
        const mapped = BIM_SLUG_TO_PROPERTY_NAMES[propertyId.toLowerCase()] ?? [];
        mapped.forEach((n) => needles.add(n.toLowerCase().trim()));

        let props: Property[] = [];
        try {
          props = await api.getProperties();
          const exact = props.find((p) => p.id === propertyId);
          if (exact?.name) needles.add(exact.name.toLowerCase().trim());
          // 1-property tenants: if no explicit mapping AND no id match, use the
          // only property — almost always the user's intent.
          if (needles.size === 0 && props.length === 1 && props[0]?.name) {
            needles.add(props[0].name.toLowerCase().trim());
          }
        } catch {
          /* non-fatal */
        }
        // Always include the slug itself as a last-resort substring needle.
        if (propertyId) needles.add(propertyId.toLowerCase().trim());

        const all = await api.getDevices();
        if (cancelled) return;
        const needleArr = Array.from(needles);
        const filtered = all.filter((d) => deviceMatchesProperty(d, needleArr));

        if (filtered.length === 0 && all.length > 0) {
          console.warn('[usePropertyDevices] filter excluded all devices', {
            propertyId,
            needles: needleArr,
            sampleDevice: { building: all[0]?.building, location: all[0]?.location },
            propertiesAvailable: props.map((p) => ({ id: p.id, name: p.name })),
          });
        }

        setDevices(filtered.map(deviceToSensor));
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'fetch failed');
      } finally {
        setLoading(false);
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    };

    setLoading(true);
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [propertyId]);

  return { devices, loading, error };
}
