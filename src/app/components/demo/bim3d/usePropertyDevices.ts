import { useEffect, useState } from 'react';
import { api, Device } from '@/app/utils/api';
import type { Sensor, Subsystem } from './mockData';

const POLL_MS = 30_000;

function inferType(d: Device): Sensor['type'] {
  const hay = `${d.type ?? ''} ${d.model ?? ''} ${d.manufacturer ?? ''} ${d.name ?? ''}`.toLowerCase();
  if (hay.includes('hy108') || hay.includes('noise') || hay.includes('sound')) return 'HY108-1';
  if (hay.includes('ld-5r') || hay.includes('ld5r') || hay.includes('dust') || hay.includes('pm')) return 'LD-5R';
  if (hay.includes('iaq') || hay.includes('co2')) return 'IAQ';
  if (hay.includes('temp') || hay.includes('thermo')) return 'Temp';
  if (hay.includes('cctv') || hay.includes('camera')) return 'CCTV';
  if (hay.includes('lift') || hay.includes('elevator')) return 'Lift';
  return 'Temp';
}

function inferSubsystem(t: Sensor['type']): Subsystem {
  switch (t) {
    case 'HY108-1':
    case 'LD-5R':
    case 'IAQ':
    case 'Temp':
      return 'Environment';
    case 'CCTV':
      return 'CCTV';
    case 'Lift':
      return 'Lift';
    default:
      return 'Environment';
  }
}

function deviceMatchesProperty(d: Device, propertyId: string): boolean {
  if (!propertyId) return true;
  const pid = propertyId.toLowerCase();
  const haystack = [
    d.building,
    (d as any).propertyId,
    (d as any).property_id,
    d.location,
  ].filter(Boolean).map((s) => String(s).toLowerCase());
  return haystack.some((h) => h === pid || h.includes(pid));
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
        const all = await api.getDevices();
        if (cancelled) return;
        const filtered = all.filter((d) => deviceMatchesProperty(d, propertyId));
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
