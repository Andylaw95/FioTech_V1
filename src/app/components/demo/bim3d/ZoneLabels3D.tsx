import { useEffect, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { getAllLabels, ZoneLabel } from './zoneLabels';

const ZONE_COLORS: Record<NonNullable<ZoneLabel['zoneType']>, string> = {
  room:  'bg-blue-500',
  area:  'bg-emerald-500',
  zone:  'bg-amber-500',
  asset: 'bg-violet-500',
  other: 'bg-slate-500',
};

/**
 * Renders all saved zone labels as floating 3D pills above their
 * anchor point. Re-reads localStorage on demand via the `version`
 * prop so a save/delete in PickedElementCard updates immediately.
 */
export function ZoneLabels3D({
  modelKey,
  version,
  onClick,
}: {
  modelKey: string;
  version: number; // bump to force reload
  onClick?: (expressId: number) => void;
}) {
  const [labels, setLabels] = useState<ZoneLabel[]>([]);

  const reload = useCallback(() => {
    setLabels(getAllLabels(modelKey).filter((l) => l.customName && l.anchor));
  }, [modelKey]);

  useEffect(() => { reload(); }, [reload, version]);

  return (
    <>
      {labels.map((l) => {
        const color = ZONE_COLORS[l.zoneType ?? 'other'];
        return (
          <Html
            key={l.expressId}
            position={[l.anchor!.x, l.anchor!.y + 0.6, l.anchor!.z]}
            center
            distanceFactor={12}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: onClick ? 'auto' : 'none' }}
          >
            <div
              onClick={() => onClick?.(l.expressId)}
              className={`${color} text-white px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-lg ring-2 ring-white/40 whitespace-nowrap select-none ${
                onClick ? 'cursor-pointer hover:scale-110 transition-transform' : ''
              }`}
              title={l.customCode ? `${l.customName} · ${l.customCode}` : l.customName}
            >
              {l.customCode ? `${l.customCode} · ${l.customName}` : l.customName}
              {l.assignedDeviceIds && l.assignedDeviceIds.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center bg-white/30 rounded-full px-1.5 text-[9px]">
                  {l.assignedDeviceIds.length}📡
                </span>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}
