import { useEffect, useState, useCallback, useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { getAllLabels, ZoneLabel } from './zoneLabels';

const ZONE_COLOR: Record<NonNullable<ZoneLabel['zoneType']>, string> = {
  room:  '#0ea5e9',
  area:  '#10b981',
  zone:  '#f59e0b',
  asset: '#a855f7',
  other: '#94a3b8',
};

/**
 * Renders all saved zone labels as flat text on the floor at their
 * anchor point. Re-reads localStorage on demand via the `version`
 * prop so a save / delete in PickedElementCard updates immediately.
 *
 * Click a label to edit it (calls onEdit with the label id + anchor).
 */
export function ZoneLabels3D({
  modelKey,
  version,
  onEdit,
}: {
  modelKey: string;
  version: number;
  onEdit?: (label: ZoneLabel) => void;
}) {
  const [labels, setLabels] = useState<ZoneLabel[]>([]);

  const reload = useCallback(() => {
    setLabels(getAllLabels(modelKey).filter((l) => l.customName && l.anchor));
  }, [modelKey]);

  useEffect(() => { reload(); }, [reload, version]);

  // Lay text flat on the floor: rotate -90° around X so it reads from above.
  const flatRotation = useMemo<[number, number, number]>(() => [-Math.PI / 2, 0, 0], []);

  return (
    <>
      {labels.map((l) => {
        const color = ZONE_COLOR[l.zoneType ?? 'other'];
        const text = l.customCode ? `${l.customCode}\n${l.customName}` : (l.customName ?? '');
        const subText = l.assignedDeviceIds && l.assignedDeviceIds.length > 0
          ? `📡 ${l.assignedDeviceIds.length} device${l.assignedDeviceIds.length === 1 ? '' : 's'}`
          : null;
        // Lift slightly above the picked surface to avoid z-fighting with the floor mesh.
        const y = l.anchor.y + 0.05;
        return (
          <group key={l.id} position={[l.anchor.x, y, l.anchor.z]}>
            {/* Subtle disc behind the text so it stays readable on busy floors */}
            <mesh rotation={flatRotation} position={[0, 0.001, 0]} renderOrder={998}>
              <circleGeometry args={[1.4, 32]} />
              <meshBasicMaterial
                color="#0f172a"
                transparent
                opacity={0.55}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <Text
              rotation={flatRotation}
              fontSize={0.42}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.04}
              outlineColor="#000"
              outlineOpacity={0.9}
              depthOffset={-2}
              renderOrder={999}
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(l);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => { document.body.style.cursor = ''; }}
            >
              {text}
            </Text>
            {subText && (
              <Text
                rotation={flatRotation}
                position={[0, 0.001, 0.55]}
                fontSize={0.22}
                color="#fbbf24"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.025}
                outlineColor="#000"
                outlineOpacity={0.9}
                depthOffset={-2}
                renderOrder={999}
              >
                {subText}
              </Text>
            )}
          </group>
        );
      })}
    </>
  );
}
