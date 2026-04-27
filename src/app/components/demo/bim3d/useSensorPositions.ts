import { useCallback, useEffect, useMemo, useState } from 'react';
import { MOCK_SENSORS, type Sensor } from './mockData';

const LS_KEY = 'fiotech.sensor-positions.v1';

export type SensorPosition = { x: number; y: number; z: number };
export type SensorPositionMap = Record<string, SensorPosition>;

function loadPositions(): SensorPositionMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return {};
    return parsed as SensorPositionMap;
  } catch {
    return {};
  }
}

function savePositions(map: SensorPositionMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('fiotech.sensor-positions-changed'));
  } catch {
    /* quota / private browsing */
  }
}

/**
 * Returns MOCK_SENSORS with localStorage-saved position overrides applied,
 * plus mutators to set / reset positions and notify observers.
 */
export function useSensorPositions() {
  const [overrides, setOverrides] = useState<SensorPositionMap>(() => loadPositions());

  // Cross-tab + same-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) setOverrides(loadPositions());
    };
    const onLocal = () => setOverrides(loadPositions());
    window.addEventListener('storage', onStorage);
    window.addEventListener('fiotech.sensor-positions-changed', onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('fiotech.sensor-positions-changed', onLocal);
    };
  }, []);

  const sensors: Sensor[] = useMemo(
    () =>
      MOCK_SENSORS.map((s) => {
        const o = overrides[s.id];
        return o ? { ...s, x: o.x, y: o.y, z: o.z } : s;
      }),
    [overrides],
  );

  const setPosition = useCallback((id: string, pos: SensorPosition) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: pos };
      savePositions(next);
      return next;
    });
  }, []);

  const clearPosition = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      savePositions(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    savePositions({});
    setOverrides({});
  }, []);

  const isCustom = useCallback((id: string) => Object.hasOwn(overrides, id), [overrides]);

  return { sensors, overrides, setPosition, clearPosition, resetAll, isCustom };
}
