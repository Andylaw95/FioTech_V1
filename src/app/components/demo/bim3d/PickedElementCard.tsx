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
import { Sensor } from './mockData';

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
  devices,
  isAdmin = false,
  currentUserId,
}: {
  picked: PickedInfo;
  modelKey: string;
  onClose: () => void;
  onLabelChange?: (label: ZoneLabel | null) => void;
  /** Real property devices (live, scoped to current property). */
  devices?: Sensor[];
  /** When true, user can save labels with scope='global' (visible to everyone).
   *  Non-admins are forced to scope='private' (visible only to themselves). */
  isAdmin?: boolean;
  /** Current authenticated user id; stamped onto new private labels. */
  currentUserId?: string;
}) {
  const [editing, setEditing] = useState<boolean>(!!picked.editLabelId);
  const [draft, setDraft] = useState<Partial<ZoneLabel>>(() => ({
    ...EMPTY_DRAFT,
    scope: isAdmin ? 'global' : 'private',
  }));
  const [saving, setSaving] = useState(false);

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

  // Permissions on the existing label
  const canEditExisting = !existingLabel
    ? true
    : isAdmin || existingLabel.createdBy === currentUserId;

  useEffect(() => {
    if (existingLabel) {
      setDraft(existingLabel);
      setEditing(true);
    } else {
      setDraft({ ...EMPTY_DRAFT, scope: isAdmin ? 'global' : 'private' });
      setEditing(false);
    }
  }, [existingLabel, isAdmin]);

  function save() {
    if (saving) return;
    if (!canEditExisting) return;
    setSaving(true);
    // Non-admins can NEVER write a global label, regardless of draft state.
    const requestedScope: ZoneLabel['scope'] = draft.scope ?? (isAdmin ? 'global' : 'private');
    const finalScope: ZoneLabel['scope'] = isAdmin ? requestedScope : 'private';
    const patch = {
      customName: draft.customName?.trim() || undefined,
      customCode: draft.customCode?.trim() || undefined,
      zoneType: draft.zoneType,
      notes: draft.notes?.trim() || undefined,
      color: draft.color || undefined,
      assignedDeviceIds: draft.assignedDeviceIds,
      scope: finalScope,
      createdBy: existingLabel?.createdBy ?? currentUserId,
    };
    let saved: ZoneLabel | null;
    try {
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
    } finally {
      setSaving(false);
    }
    setEditing(false);
    onLabelChange?.(saved);
    onClose();
  }

  function clear() {
    if (!existingLabel) return;
    if (!canEditExisting) return;
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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] w-[480px] max-w-[92vw] rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-amber-400/50">
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
            <span className="text-white/60 text-[10px] uppercase tracking-wider">
              📡 Assign devices to this zone {devices && devices.length > 0 && (
                <span className="text-white/40 normal-case">({devices.length} in property)</span>
              )}
            </span>
            <div className="mt-1 max-h-32 overflow-y-auto rounded bg-slate-800/60 border border-white/10 divide-y divide-white/5">
              {(() => {
                const list = devices ?? [];
                if (list.length === 0) {
                  return (
                    <div className="px-2 py-3 text-[11px] text-white/40 text-center">
                      No devices found in this property yet.
                    </div>
                  );
                }
                return list.map((s) => {
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
                        <span className="text-white/90 font-medium">{s.name}</span>
                        <span className="ml-1.5 text-[9px] text-cyan-300/80 font-mono uppercase">{s.type}</span>
                      </span>
                      <span className="text-[9px] text-white/40">{s.subsystem}</span>
                    </label>
                  );
                });
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 px-2 py-1.5 rounded bg-slate-800/60 border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Visibility</span>
            {isAdmin ? (
              <div className="flex gap-1 ml-auto">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, scope: 'global' })}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    (draft.scope ?? 'global') === 'global'
                      ? 'bg-emerald-500 text-slate-900 font-semibold'
                      : 'bg-white/10 hover:bg-white/20 text-white/80'
                  }`}
                  title="Visible to everyone"
                >
                  🌐 Public
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, scope: 'private' })}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    draft.scope === 'private'
                      ? 'bg-amber-400 text-slate-900 font-semibold'
                      : 'bg-white/10 hover:bg-white/20 text-white/80'
                  }`}
                  title="Visible only to you"
                >
                  👤 Private
                </button>
              </div>
            ) : (
              <span className="ml-auto text-[11px] text-amber-300">👤 Private (only you)</span>
            )}
          </div>
          {!canEditExisting && (
            <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
              🔒 This is a public label created by an admin. You can't edit it.
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving || !canEditExisting}
              className="flex-1 text-xs bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              💾 {saving ? 'Saving…' : existingLabel ? 'Update label' : 'Save new label'}
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
            {existingLabel && canEditExisting && (
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
