import { useEffect, useState } from 'react';
import * as THREE from 'three';
import {
  ZoneLabel,
  getLabel,
  upsertLabel,
  deleteLabel,
} from './zoneLabels';

export interface PickedInfo {
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
  point: THREE.Vector3;
}

const ZONE_TYPES: Array<NonNullable<ZoneLabel['zoneType']>> = [
  'room', 'area', 'zone', 'asset', 'other',
];

export function PickedElementCard({
  picked,
  modelKey,
  onClose,
  onLabelChange,
}: {
  picked: PickedInfo;
  modelKey: string;
  onClose: () => void;
  onLabelChange?: (label: ZoneLabel | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState<ZoneLabel | null>(null);
  const [draft, setDraft] = useState<Partial<ZoneLabel>>({});

  useEffect(() => {
    const l = getLabel(modelKey, picked.expressId);
    setLabel(l);
    setDraft(l ?? { zoneType: 'room' });
    setEditing(false);
  }, [picked.expressId, modelKey]);

  const displayName = label?.customName || picked.name || '(unnamed)';
  const displayCode = label?.customCode;

  function save() {
    const saved = upsertLabel(modelKey, picked.expressId, {
      customName: draft.customName?.trim() || undefined,
      customCode: draft.customCode?.trim() || undefined,
      zoneType: draft.zoneType,
      notes: draft.notes?.trim() || undefined,
      color: draft.color || undefined,
    });
    setLabel(saved);
    setEditing(false);
    onLabelChange?.(saved);
  }

  function clear() {
    deleteLabel(modelKey, picked.expressId);
    setLabel(null);
    setDraft({ zoneType: 'room' });
    setEditing(false);
    onLabelChange?.(null);
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[460px] max-w-[92vw] rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-amber-400/50">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
          📌 {displayName}
          {label && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200">labeled</span>}
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-xs">✕</button>
      </div>

      {!editing && (
        <>
          <div className="px-4 py-3 space-y-1.5 text-xs font-mono">
            {displayCode && (
              <div className="flex justify-between"><span className="text-white/60">code</span><span className="text-cyan-200">{displayCode}</span></div>
            )}
            {label?.zoneType && (
              <div className="flex justify-between"><span className="text-white/60">type</span><span>{label.zoneType}</span></div>
            )}
            <div className="flex justify-between"><span className="text-white/60">expressId</span><span className="text-amber-200 font-bold">{picked.expressId}</span></div>
            <div className="flex justify-between"><span className="text-white/60">IFC type</span><span>{picked.ifcType}</span></div>
            <div className="flex justify-between"><span className="text-white/60">IFC name</span><span className="truncate ml-2 text-right">{picked.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">storey</span><span>{picked.storey ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">x, y, z</span><span>{picked.point.x.toFixed(2)}, {picked.point.y.toFixed(2)}, {picked.point.z.toFixed(2)}</span></div>
            {label?.notes && (
              <div className="pt-1.5 border-t border-white/10 text-white/80 font-sans text-[11px] leading-snug whitespace-pre-wrap">
                {label.notes}
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-white/10 flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex-1 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              ✏️ {label ? 'Edit label' : 'Add label'}
            </button>
            <button
              onClick={() => {
                const snippet = `{ id: 'sensor-${picked.expressId}', roomId: 'room-${picked.expressId}', x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}, expressId: ${picked.expressId} },`;
                navigator.clipboard.writeText(snippet);
              }}
              className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1.5"
              title="Copy mockData snippet"
            >
              📋
            </button>
          </div>
        </>
      )}

      {editing && (
        <div className="px-4 py-3 space-y-2 text-xs">
          <label className="block">
            <span className="text-white/60 text-[10px] uppercase tracking-wider">Custom name</span>
            <input
              autoFocus
              value={draft.customName ?? ''}
              onChange={(e) => setDraft({ ...draft, customName: e.target.value })}
              placeholder={picked.name ?? 'e.g. Server Room A'}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-800 border border-white/10 focus:border-cyan-400 outline-none text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-white/60 text-[10px] uppercase tracking-wider">Code</span>
              <input
                value={draft.customCode ?? ''}
                onChange={(e) => setDraft({ ...draft, customCode: e.target.value })}
                placeholder="17F-MEP-01"
                className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-800 border border-white/10 focus:border-cyan-400 outline-none text-white font-mono"
              />
            </label>
            <label className="block">
              <span className="text-white/60 text-[10px] uppercase tracking-wider">Type</span>
              <select
                value={draft.zoneType ?? 'room'}
                onChange={(e) => setDraft({ ...draft, zoneType: e.target.value as ZoneLabel['zoneType'] })}
                className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-800 border border-white/10 focus:border-cyan-400 outline-none text-white"
              >
                {ZONE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-white/60 text-[10px] uppercase tracking-wider">Notes</span>
            <textarea
              value={draft.notes ?? ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-800 border border-white/10 focus:border-cyan-400 outline-none text-white resize-none"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              className="flex-1 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              💾 Save
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(label ?? { zoneType: 'room' }); }}
              className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1.5"
            >
              Cancel
            </button>
            {label && (
              <button
                onClick={clear}
                className="text-xs bg-red-500/80 hover:bg-red-500 rounded px-3 py-1.5"
                title="Delete label"
              >
                🗑
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
