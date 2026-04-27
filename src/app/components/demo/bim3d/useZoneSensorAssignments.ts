import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllLabels, updateLabel, type ZoneLabel } from './zoneLabels';
import type { Sensor } from './mockData';
import type { SensorPosition, SensorPositionMap } from './useSensorPositions';

export interface ZoneCluster {
  label: ZoneLabel;
  sensors: Sensor[];
}

/**
 * Resolves where each sensor should appear in 3D and groups sensors that
 * share a zone label into clusters.
 *
 * Position precedence per sensor:
 *   1. Assigned to a zone label  → use that label's anchor (with stable
 *      per-sensor offset so multiple devices in one zone don't z-fight)
 *   2. localStorage override     → exact world-coord placement
 *   3. MOCK_SENSORS default      → original hard-coded position
 */
export function useZoneSensorAssignments(
  modelKey: string,
  /** Bumps when labels change in the editor — pass a counter prop. */
  labelsVersion: number,
  sensors: Sensor[],
  positionOverrides: SensorPositionMap,
) {
  const [labels, setLabels] = useState<ZoneLabel[]>(() => getAllLabels(modelKey));

  // Reload when version bumps (parent passes labelsVersion); also listen for
  // direct localStorage changes so the panel stays in sync after assignments.
  useEffect(() => {
    setLabels(getAllLabels(modelKey));
  }, [modelKey, labelsVersion]);

  useEffect(() => {
    const onStorage = () => setLabels(getAllLabels(modelKey));
    window.addEventListener('storage', onStorage);
    window.addEventListener('fiotech.zone-labels-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('fiotech.zone-labels-changed', onStorage);
    };
  }, [modelKey]);

  // Build sensor → label map (a sensor can only belong to ONE label, the most
  // recently updated one if multiple claim it).
  const labelBySensorId = useMemo(() => {
    const out = new Map<string, ZoneLabel>();
    const sorted = [...labels].sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    );
    for (const l of sorted) {
      for (const sid of l.assignedDeviceIds ?? []) out.set(sid, l);
    }
    return out;
  }, [labels]);

  // Build clusters: only labels that have at least one assigned sensor
  const clusters: ZoneCluster[] = useMemo(() => {
    const out: ZoneCluster[] = [];
    for (const l of labels) {
      const ids = l.assignedDeviceIds ?? [];
      if (ids.length === 0) continue;
      const inThisCluster = sensors.filter((s) => ids.includes(s.id));
      if (inThisCluster.length === 0) continue;
      out.push({ label: l, sensors: inThisCluster });
    }
    return out;
  }, [labels, sensors]);

  // Sensors not assigned to any zone label
  const unassigned: Sensor[] = useMemo(
    () => sensors.filter((s) => !labelBySensorId.has(s.id)),
    [sensors, labelBySensorId],
  );

  // Resolve effective rendering position for any sensor (used when an external
  // module needs the world-coord location, e.g. for a fly-to action).
  const positionFor = useCallback(
    (sensor: Sensor): SensorPosition => {
      const label = labelBySensorId.get(sensor.id);
      if (label) {
        return { x: label.anchor.x, y: label.anchor.y + 1.0, z: label.anchor.z };
      }
      const override = positionOverrides[sensor.id];
      if (override) return override;
      return { x: sensor.x, y: sensor.y, z: sensor.z };
    },
    [labelBySensorId, positionOverrides],
  );

  // Mutators that update zoneLabels storage and notify same-tab listeners.
  // Implementation note: each updateLabel call is a read-modify-write against
  // localStorage. We re-read the freshest snapshot for every mutation so a
  // concurrent edit (cross-tab `storage` event, rapid back-to-back calls)
  // cannot make us write back stale assignedDeviceIds.
  const assignSensorToLabel = useCallback((sensorId: string, labelId: string | null) => {
    // Strip the sensor from any label that currently owns it.
    for (const l of getAllLabels(modelKey)) {
      const owners = l.assignedDeviceIds ?? [];
      if (!owners.includes(sensorId)) continue;
      if (labelId && l.id === labelId) continue; // already on the target — no-op
      updateLabel(modelKey, l.id, {
        assignedDeviceIds: owners.filter((id) => id !== sensorId),
      });
    }
    // Add to the new owner (re-read so we don't clobber a parallel edit).
    if (labelId) {
      const target = getAllLabels(modelKey).find((l) => l.id === labelId);
      if (target) {
        const next = Array.from(new Set([...(target.assignedDeviceIds ?? []), sensorId]));
        updateLabel(modelKey, labelId, { assignedDeviceIds: next });
      }
    }
    window.dispatchEvent(new CustomEvent('fiotech.zone-labels-changed'));
    setLabels(getAllLabels(modelKey));
  }, [modelKey]);

  return {
    labels,
    labelBySensorId,
    clusters,
    unassigned,
    positionFor,
    assignSensorToLabel,
  };
}
