// Fallback coordinates for properties that don't yet have a property_geo row.
import type { Property, PropertyGeo } from '@/app/utils/api';

const HK_CENTER = { lat: 22.3193, lng: 114.1694 };

const FALLBACKS: Record<string, { lat: number; lng: number }> = {
  B001: { lat: 22.2819, lng: 114.1577 },
  B002: { lat: 22.2940, lng: 114.1724 },
  B003: { lat: 22.3374, lng: 114.1743 },
  B004: { lat: 22.3964, lng: 114.1095 },
  B005: { lat: 22.3019, lng: 114.1772 },
  B006: { lat: 22.4500, lng: 114.0166 },
  B007: { lat: 22.3857, lng: 114.1953 },
  B008: { lat: 22.2476, lng: 114.1881 },
  'FSE HQ': { lat: 22.3193, lng: 114.2163 },
  'FSE Lifestyle HQ': { lat: 22.3193, lng: 114.2163 },
};

function hashToOffset(s: string): { dLat: number; dLng: number } {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const dLat = (((h >>> 0) % 3000) / 3000 - 0.5) * 0.3;
  const dLng = ((((h >>> 8) >>> 0) % 3000) / 3000 - 0.5) * 0.3;
  return { dLat, dLng };
}

export function resolvePropertyLatLng(
  prop: Pick<Property, 'id' | 'name'>,
  geos: PropertyGeo[] | null | undefined,
): { lat: number; lng: number; source: 'geo' | 'fallback' | 'hashed' } {
  const match = geos?.find((g) => g.propertyId === prop.id);
  if (match && Number.isFinite(match.lat) && Number.isFinite(match.lng)) {
    return { lat: match.lat, lng: match.lng, source: 'geo' };
  }
  const byId = FALLBACKS[prop.id];
  if (byId) return { ...byId, source: 'fallback' };
  const byName = FALLBACKS[prop.name];
  if (byName) return { ...byName, source: 'fallback' };
  const off = hashToOffset(prop.id || prop.name || 'unknown');
  return {
    lat: HK_CENTER.lat + off.dLat,
    lng: HK_CENTER.lng + off.dLng,
    source: 'hashed',
  };
}

export const HK_MAP_DEFAULTS = {
  center: HK_CENTER,
  zoom: 11,
};
