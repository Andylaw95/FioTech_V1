import { useEffect, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { getAllLabels, ZoneLabel } from './zoneLabels';
import { type Sensor, type Severity, severityColor } from './mockData';
import type { LiveReading } from './useLiveDeviceStream';

const ZONE_BG: Record<NonNullable<ZoneLabel['zoneType']>, string> = {
  room:  'bg-sky-500/85 ring-sky-200',
  area:  'bg-emerald-500/85 ring-emerald-200',
  zone:  'bg-amber-500/85 ring-amber-100',
  asset: 'bg-violet-500/85 ring-violet-200',
  other: 'bg-slate-600/85 ring-slate-200',
};

const TYPE_ICON: Record<string, string> = {
  HY108: '🔊', 'LD-5R': '💨', IAQ: '🌡️', CCTV: '📷',
  PIR: '👁️', Door: '🚪', Power: '⚡', Water: '💧', Smoke: '🔥',
};
function iconFor(sensor: Sensor): string {
  const t = sensor.type ?? '';
  for (const key of Object.keys(TYPE_ICON)) {
    if (t.toUpperCase().includes(key.toUpperCase())) return TYPE_ICON[key];
  }
  return '📡';
}

interface ZoneCluster {
  labelId: string;
  sensors: Sensor[];
  worstSeverity: Severity;
}

/**
 * Renders all saved zone labels FLAT ON THE FLOOR using `<Html transform>`.
 * Each card always shows a compact roster of every assigned device's live
 * reading — no expand/collapse, so the BIM map gives a holistic view at a glance.
 */
export function ZoneLabels3D({
  modelKey,
  version,
  onEdit,
  clusters,
  readings,
  severityById,
  selectedSensorId,
  onSelectSensor,
  expandedIds: controlledExpandedIds,
  onToggleExpanded,
}: {
  modelKey: string;
  version: number;
  onEdit?: (label: ZoneLabel) => void;
  clusters?: ZoneCluster[];
  readings?: Map<string, LiveReading>;
  severityById?: Map<string, Severity>;
  selectedSensorId?: string | null;
  onSelectSensor?: (id: string) => void;
  expandedIds?: Set<string>;
  onToggleExpanded?: (id: string) => void;
}) {
  const [labels, setLabels] = useState<ZoneLabel[]>([]);
  // Multiple zones can be expanded at once. State is controlled by parent (Bim3DStage)
  // so the bulk Expand/Collapse pill can live OUTSIDE the R3F Canvas tree.
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(new Set());
  const expandedIds = controlledExpandedIds ?? internalExpandedIds;
  const toggleExpanded = useCallback((id: string) => {
    if (onToggleExpanded) { onToggleExpanded(id); return; }
    setInternalExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [onToggleExpanded]);

  const reload = useCallback(() => {
    setLabels(getAllLabels(modelKey).filter((l) => l.customName && l.anchor));
  }, [modelKey]);

  useEffect(() => { reload(); }, [reload, version]);

  // Auto-expand the zone that owns the externally-selected sensor.
  // Uses functional updates + idempotent toggle so stale closures don't cause loops.
  useEffect(() => {
    if (!selectedSensorId || !clusters) return;
    const owner = clusters.find((c) => c.sensors.some((s) => s.id === selectedSensorId));
    if (!owner) return;
    if (onToggleExpanded) {
      // Parent owns the Set; only toggle if currently collapsed (idempotent).
      if (!expandedIds.has(owner.labelId)) onToggleExpanded(owner.labelId);
    } else {
      setInternalExpandedIds((prev) => {
        if (prev.has(owner.labelId)) return prev;
        const next = new Set(prev);
        next.add(owner.labelId);
        return next;
      });
    }
  }, [selectedSensorId, clusters, expandedIds, onToggleExpanded]);

  const clusterByLabelId = new Map<string, ZoneCluster>(
    (clusters ?? []).map((c) => [c.labelId, c]),
  );

  return (
    <>
      {labels.map((l) => {
        const baseBg = ZONE_BG[l.zoneType ?? 'other'];
        const cluster = clusterByLabelId.get(l.id);
        const isExpanded = expandedIds.has(l.id) && !!cluster;
        const sevColor = cluster ? severityColor(cluster.worstSeverity) : null;
        const ownsSelected = !!(cluster && selectedSensorId && cluster.sensors.some((s) => s.id === selectedSensorId));
        // Lift expanded/selected cards higher so they don't sit inside the collapsed-pin layer.
        const cardY = l.anchor.y + (isExpanded || ownsSelected ? 1.6 : 0.4);

        return (
          <Html
            key={l.id}
            position={[l.anchor.x, cardY, l.anchor.z]}
            center
            occlude={false}
            zIndexRange={isExpanded || ownsSelected ? [120, 60] : [40, 20]}
            wrapperClass="zone-label-wrapper"
          >
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className={`${baseBg} text-white rounded-lg shadow-2xl ring-2 select-none transition-all`}
              style={{
                minWidth: isExpanded ? 220 : undefined,
                maxWidth: isExpanded ? 280 : undefined,
                overflow: 'hidden',
                boxShadow: sevColor
                  ? `0 8px 22px rgba(0,0,0,0.45), 0 0 16px ${sevColor}55`
                  : undefined,
              }}
            >
              {/* Header: compact pin when collapsed, full label when expanded */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (cluster) toggleExpanded(l.id);
                  else onEdit?.(l);
                }}
                className={`cursor-pointer hover:brightness-110 transition text-center ${isExpanded ? 'px-3 py-1.5' : 'px-2 py-1'}`}
                title={cluster ? (isExpanded ? 'Click to collapse' : 'Click to expand') : 'Click to edit zone'}
              >
                {isExpanded && l.customCode && (
                  <div className="text-[11px] font-mono opacity-80 leading-tight">{l.customCode}</div>
                )}
                <div className={`font-bold leading-tight flex items-center justify-center gap-1.5 ${isExpanded ? 'text-base' : 'text-[11px]'}`}>
                  {sevColor && (
                    <span
                      style={{
                        width: isExpanded ? 9 : 7, height: isExpanded ? 9 : 7, borderRadius: 999,
                        background: sevColor, boxShadow: `0 0 6px ${sevColor}`,
                        display: 'inline-block', flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{l.customName}</span>
                  {cluster && !isExpanded && (
                    <span className="ml-1 px-1 rounded bg-black/30 text-[10px] font-mono">{cluster.sensors.length}</span>
                  )}
                </div>
                {cluster && isExpanded && (
                  <div className="text-[10px] mt-0.5 bg-black/30 rounded-full px-2 py-0.5 inline-block">
                    📡 {cluster.sensors.length} device{cluster.sensors.length === 1 ? '' : 's'} ▴
                  </div>
                )}
              </div>

              {/* Expanded device readings */}
              {isExpanded && cluster && (
                <div className="bg-slate-900/90 border-t border-white/10">
                  {cluster.sensors.map((s) => {
                    const sev = severityById?.get(s.id) ?? 'normal';
                    const c = severityColor(sev);
                    const r = readings?.get(s.id);
                    const isSel = selectedSensorId === s.id;
                    const online = r?.online ?? false;
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); onSelectSensor?.(s.id); }}
                        className="flex items-center gap-2 px-2.5 py-1 cursor-pointer transition"
                        style={{
                          borderLeft: `3px solid ${isSel ? '#22d3ee' : 'transparent'}`,
                          background: isSel ? 'rgba(34,211,238,0.16)' : 'transparent',
                          opacity: online ? 1 : 0.5,
                        }}
                      >
                        <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{iconFor(s)}</span>
                        <span
                          className="flex-1 text-left"
                          style={{
                            fontSize: 11, fontWeight: 600, color: '#e2e8f0',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {s.name || s.type}
                        </span>
                        <span
                          style={{
                            fontSize: 11.5, fontWeight: 700,
                            color: online ? c : '#64748b',
                            fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                          }}
                        >
                          {r?.primary
                            ? `${r.primary.value.toFixed(1)} ${r.primary.unit}`
                            : online ? '—' : '⊘'}
                        </span>
                        <span
                          style={{
                            width: 6, height: 6, borderRadius: 999,
                            background: c, boxShadow: `0 0 6px ${c}`, flexShrink: 0,
                          }}
                        />
                      </div>
                    );
                  })}
                  <div
                    onClick={(e) => { e.stopPropagation(); onEdit?.(l); }}
                    className="px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer border-t border-white/5 text-center"
                  >
                    ⚙️ Edit zone
                  </div>
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}
