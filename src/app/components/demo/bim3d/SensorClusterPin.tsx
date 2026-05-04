import { useState, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { type Sensor, type Severity, severityColor } from './mockData';
import type { ZoneLabel } from './zoneLabels';
import type { LiveReading } from './useLiveDeviceStream';
import { buildMetricSlides } from './metricUtils';

interface Props {
  label: ZoneLabel;
  sensors: Sensor[];
  worstSeverity: Severity;
  severityById: Map<string, Severity>;
  readings: Map<string, LiveReading>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TYPE_ICON: Record<string, string> = {
  HY108: '🔊',
  'LD-5R': '💨',
  IAQ: '🌡️',
  CCTV: '📷',
  PIR: '👁️',
  Door: '🚪',
  Power: '⚡',
  Water: '💧',
  Smoke: '🔥',
  AS400: '📳',
  Vibration: '📳',
};

function iconFor(sensor: Sensor): string {
  const t = sensor.type ?? '';
  for (const key of Object.keys(TYPE_ICON)) {
    if (t.toUpperCase().includes(key.toUpperCase())) return TYPE_ICON[key];
  }
  return '📡';
}

/**
 * Floating info-card above a zone label, showing all assigned devices and
 * their live readings. Replaces the previous sphere + expand-popup design.
 */
export function SensorClusterPin({
  label,
  sensors,
  worstSeverity,
  severityById,
  readings,
  selectedId,
  onSelect,
}: Props) {
  const { x, y, z } = label.anchor;
  const stemHeight = 1.4;
  // Offset card diagonally so it doesn't sit directly above the floor zone-label
  const offsetX = 0.9;
  const offsetZ = 0.9;
  const cardX = x + offsetX;
  const cardY = y + stemHeight;
  const cardZ = z + offsetZ;
  const headerColor = severityColor(worstSeverity);
  const [expanded, setExpanded] = useState(false);

  // 5s shared slideshow ticker for rotating multi-metric values per device row.
  const [slideTick, setSlideTick] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const id = setInterval(() => setSlideTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [expanded]);

  // Memoized stem geometry — a thin cylinder rotated/positioned to span (x,y,z) → (cardX,cardY,cardZ)
  const stem = useMemo(() => {
    const start = new THREE.Vector3(x, y + 0.05, z);
    const end = new THREE.Vector3(cardX, cardY, cardZ);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    const euler = new THREE.Euler().setFromQuaternion(quat);
    return {
      position: [mid.x, mid.y, mid.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      length,
    };
  }, [x, y, z, cardX, cardY, cardZ]);

  return (
    <group>
      {/* Diagonal stem from floor anchor to card */}
      <mesh position={stem.position} rotation={stem.rotation}>
        <cylinderGeometry args={[0.012, 0.012, stem.length, 6]} />
        <meshBasicMaterial color={headerColor} transparent opacity={0.55} />
      </mesh>
      {/* Connector dot at the card end */}
      <mesh position={[cardX, cardY, cardZ]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshBasicMaterial color={headerColor} />
      </mesh>

      {/* HTML info card */}
      <group position={[cardX, cardY, cardZ]}>
        <Html
          distanceFactor={9}
          position={[0, 0.25, 0]}
          center
          zIndexRange={[120, 50]}
          occlude={false}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(15,23,42,0.94)',
              border: `1px solid ${headerColor}66`,
              borderRadius: 10,
              boxShadow: `0 8px 22px rgba(0,0,0,0.45), 0 0 14px ${headerColor}33`,
              color: '#fff',
              fontFamily: 'system-ui, sans-serif',
              minWidth: expanded ? 180 : 120,
              maxWidth: 240,
              fontSize: 11,
              overflow: 'hidden',
              userSelect: 'none',
              cursor: 'default',
            }}
          >
            {/* Header — click toggles expanded state */}
            <div
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              style={{
                padding: '5px 9px',
                background: `linear-gradient(90deg, ${headerColor}33, transparent)`,
                borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
              }}
              title={expanded ? 'Click to collapse' : 'Click to expand device list'}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: headerColor,
                    boxShadow: `0 0 6px ${headerColor}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 11.5,
                    letterSpacing: '0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label.customName ?? 'Zone'}
                </span>
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#0f172a',
                  background: headerColor,
                  borderRadius: 999,
                  padding: '1px 6px',
                  minWidth: 16,
                  textAlign: 'center',
                  lineHeight: '13px',
                }}
              >
                {sensors.length}{expanded ? '' : ' ▾'}
              </span>
            </div>

            {/* Device rows — only when expanded */}
            {expanded && (
              <div style={{ padding: '3px 0' }}>
                {sensors.map((s) => {
                const sev = severityById.get(s.id) ?? 'normal';
                const c = severityColor(sev);
                const r = readings.get(s.id);
                const isSel = selectedId === s.id;
                const online = r?.online ?? false;
                const slides = r ? buildMetricSlides(r.metrics ?? {}, null) : [];
                const slide = slides.length > 0 ? slides[slideTick % slides.length] : null;
                const display = slide
                  ? `${slide.value.toFixed(1)} ${slide.unit}`
                  : r?.primary
                    ? `${r.primary.value.toFixed(1)} ${r.primary.unit}`
                    : online ? '—' : '⊘';
                const showCount = slides.length > 1;
                return (
                  <div
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
                    style={{
                      padding: '4px 9px',
                      cursor: 'pointer',
                      borderLeft: `2px solid ${isSel ? '#22d3ee' : 'transparent'}`,
                      background: isSel ? 'rgba(34,211,238,0.12)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      opacity: 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{iconFor(s)}</span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name || s.type}
                      {slide && (
                        <span style={{ marginLeft: 6, color: '#94a3b8', fontWeight: 500 }}>
                          {slide.label}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: c,
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {display}
                    </span>
                    {showCount && (
                      <span style={{ fontSize: 9, color: '#64748b', flexShrink: 0 }}>
                        {(slideTick % slides.length) + 1}/{slides.length}
                      </span>
                    )}
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: c,
                        boxShadow: `0 0 6px ${c}`,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </Html>
      </group>
    </group>
  );
}
