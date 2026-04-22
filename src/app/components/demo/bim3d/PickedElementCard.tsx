import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  ZoneLabel,
  getLabelById,
  getLabelsByExpressId,
  createLabel,
  updateLabel,
  deleteLabelById,
} from './zoneLabels';
import { MOCK_SENSORS } from './mockData';

export interface PickedInfo {
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
  point: THREE.Vector3;
  /** When set, the card edits this existing label instead of creating a new one. */
  editLabelId?: string;
}

const ZONE_TYPES: Array<NonNullable<ZoneLabel['zoneType']>> = [
  'room', 'area', 'zone', 'asset', 'other',
];

const EMPTY_DRAFT: Partial<ZoneLabel> = { zoneType: 'room' };

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
  const [editing, setEditing] = useState<boolean>(!!picked.editLabelId);
  const [draft, setDraft] = useState<Partial<ZoneLabel>>(EMPTY_DRAFT);

  // The label currently being edited (only when picked.editLabelId is set)
  const existingLabel = useMemo<ZoneLabel | null>(
    () => (picked.editLabelId ? getLabelById(modelKey, picked.editLabelId) : null),
    [picked.editLabelId, modelKey],
  );

  // Other labels on the same IFC element (so user knows what's already there)
  const siblingLabels = useMemo<ZoneLabel[]>(
    () => getLabelsByExpressId(modelKey, picked.expressId)
      .filter((l) => l.id !== picked.editLabelId),
    [picked.expressId, modelKey, picked.editLabelId],
  );

  useEffect(() => {
    if (existingLabel) {
      setDraft(existingLabel);
      setEditing(true);
    } else {
      setDraft(EMPTY_DRAFT);
      setEditing(false);
    }
  }, [existingLabel]);

  function save() {
    const patch = {
      customName: draft.customName?.trim() || undefined,
      customCode: draft.customCode?.trim() || undefined,
      zoneType: draft.zoneType,
      notes: draft.notes?.trim() || undefined,
      color: draft.color || undefined,
      assignedDeviceIds: draft.assignedDeviceIds,
    };
    let saved: ZoneLabel | null;
    if (existingLabel) {
      saved = updateLabel(modelKey, existingLabel.id, patch);
    } else {
      saved = createLabel(
        modelKey,
        picked.expressId,
        { x: picked.point.x, y: picked.point.y, z: picked.point.z },
        patch,
      );
    }
    setEditing(false);
    onLabelChange?.(saved);
    onClose();
  }

  function clear() {
    if (!existingLabel) return;
    deleteLabelById(modelKey, existingLabel.id);
    onLabelChange?.(null);
    onClose();
  }

  function toggleDevice(deviceId: string) {
    const current = new Set(draft.assignedDeviceIds ?? []);
    if (current.has(deviceId)) current.delete(deviceId);
    else current.add(deviceId);
    setDraft({ ...draft, assignedDeviceIds: Array.from(current) });
  }

  const displayName = existingLabel?.customName || picked.name || '(unnamed)';
  const isNew = !existingLabel;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[480px] max-w-[92vw] rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-amber-400/50">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
          📌 {displayName}
          {isNew
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">new label</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200">editing</span>}
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-xs">✕</button>
      </div>

      {!editing && (
        <>
          <div className="px-4 py-3 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between"><span className="text-white/60">expressId</span><span className="text-amber-200 font-bold">{picked.expressId}</span></div>
            <div className="flex justify-between"><span className="text-white/60">IFC type</span><span>{picked.ifcType}</span></div>
            <div className="flex justify-between"><span className="text-white/60">IFC name</span><span className="truncate ml-2 text-right">{picked.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">storey</span><span>{picked.storey ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">x, y, z</span><span>{picked.point.x.toFixed(2)}, {picked.point.y.toFixed(2)}, {picked.point.z.toFixed(2)}</span></div>
            {siblingLabels.length > 0 && (
              <div className="pt-1.5 border-t border-white/10 font-sans">
                <div className="text-white/60 text-[10px] uppercase tracking-wider mb-1">
                  📍 {siblingLabels.length} existing label{siblingLabels.length === 1 ? '' : 's'} on this element
                </div>
                <div className="flex flex-wrap gap-1">
                  {siblingLabels.map((l) => (
                    <span key={l.id} className="text-[10px] bg-white/10 rounded px-1.5 py-0.5">
                      {l.customCode ? `${l.customCode} · ` : ''}{l.customName ?? '(unnamed)'}
                    </span>
                  ))}
                </div>
                <div className="text-[9px] text-white/40 mt-1">Click any floating label in the 3D view to edit it.</div>
              </div>
            )}
          </div>
          <div className="px-4 py-2 border-t border-white/10 flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex-1 text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              ➕ Add new label here
            </button>
            <button
              onClick={() => {
                const snippet = `{ expressId: ${picked.expressId}, x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)} },`;
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
                {ZONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
          <div>
            <span className="text-white/60 text-[10px] uppercase tracking-wider">📡 Assign devices to this zone</span>
            <div className="mt-1 max-h-32 overflow-y-auto rounded bg-slate-800/60 border border-white/10 divide-y divide-white/5">
              {MOCK_SENSORS.map((s) => {
                const checked = draft.assignedDeviceIds?.includes(s.id) ?? false;
                return (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDevice(s.id)}
                      className="accent-cyan-400"
                    />
                    <span className="flex-1 text-[11px] truncate">
                      <span className="text-cyan-300 font-mono">{s.type}</span>
                      <span className="text-white/70 ml-1.5">{s.name}</span>
                    </span>
                    <span className="text-[9px] text-white/40">{s.subsystem}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              className="flex-1 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              💾 {existingLabel ? 'Update label' : 'Save new label'}
            </button>
            <button
              onClick={() => {
                if (existingLabel) onClose();
                else { setEditing(false); setDraft(EMPTY_DRAFT); }
              }}
              className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1.5"
            >
              Cancel
            </button>
            {existingLabel && (
              <button
                onClick={clear}
                className="text-xs bg-red-500/80 hover:bg-red-500 rounded px-3 py-1.5"
                title="Delete this label"
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
