import { useEffect, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { getAllLabels, ZoneLabel } from './zoneLabels';

const ZONE_BG: Record<NonNullable<ZoneLabel['zoneType']>, string> = {
  room:  'bg-sky-500/85 ring-sky-200',
  area:  'bg-emerald-500/85 ring-emerald-200',
  zone:  'bg-amber-500/85 ring-amber-100',
  asset: 'bg-violet-500/85 ring-violet-200',
  other: 'bg-slate-600/85 ring-slate-200',
};

/**
 * Renders all saved zone labels FLAT ON THE FLOOR using `<Html transform>`.
 * We use HTML (not drei <Text>) on purpose — <Text> lazily loads a font
 * file and SUSPENDS the surrounding tree, which restarts IfcModel and
 * causes an infinite-load loop on this 46 MB IFC.
 *
 * Re-reads labels on demand via the `version` prop.
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

  return (
    <>
      {labels.map((l) => {
        const bg = ZONE_BG[l.zoneType ?? 'other'];
        const deviceCount = l.assignedDeviceIds?.length ?? 0;
        return (
          <Html
            key={l.id}
            position={[l.anchor.x, l.anchor.y + 0.06, l.anchor.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            transform
            occlude={false}
            distanceFactor={6}
            zIndexRange={[20, 0]}
            sprite={false}
            wrapperClass="zone-label-wrapper"
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(l);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${bg} text-white rounded-lg px-3 py-1.5 shadow-2xl ring-2 whitespace-nowrap select-none cursor-pointer hover:scale-105 transition-transform text-center`}
              title="Click to edit this zone"
            >
              {l.customCode && (
                <div className="text-[10px] font-mono opacity-80 leading-tight">{l.customCode}</div>
              )}
              <div className="text-base font-bold leading-tight">{l.customName}</div>
              {deviceCount > 0 && (
                <div className="text-[10px] mt-0.5 bg-black/30 rounded-full px-2 py-0.5 inline-block">
                  📡 {deviceCount} device{deviceCount === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}
