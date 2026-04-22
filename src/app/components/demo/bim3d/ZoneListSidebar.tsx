import { useEffect, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ZoneLabel, getAllLabels, deleteLabelById } from './zoneLabels';
import { MOCK_SENSORS } from './mockData';

const ZONE_DOT: Record<NonNullable<ZoneLabel['zoneType']>, string> = {
  room:  'bg-sky-400',
  area:  'bg-emerald-400',
  zone:  'bg-amber-400',
  asset: 'bg-violet-400',
  other: 'bg-slate-400',
};

export function ZoneListSidebar({
  modelKey,
  version,
  onSelect,
  onFlyTo,
  onDeleted,
}: {
  modelKey: string;
  version: number;
  /** Open the edit card for this zone. */
  onSelect: (label: ZoneLabel) => void;
  /** Frame the camera on this zone. */
  onFlyTo: (anchor: THREE.Vector3) => void;
  /** Notify parent so 3D labels refresh. */
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | NonNullable<ZoneLabel['zoneType']>>('all');
  const [search, setSearch] = useState('');
  const [labels, setLabels] = useState<ZoneLabel[]>([]);

  const reload = useCallback(() => {
    setLabels(getAllLabels(modelKey).sort((a, b) => (a.customName ?? '').localeCompare(b.customName ?? '')));
  }, [modelKey]);

  useEffect(() => { reload(); }, [reload, version]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labels.filter((l) => {
      if (filter !== 'all' && l.zoneType !== filter) return false;
      if (!q) return true;
      return (
        (l.customName ?? '').toLowerCase().includes(q) ||
        (l.customCode ?? '').toLowerCase().includes(q) ||
        (l.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [labels, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: labels.length, room: 0, area: 0, zone: 0, asset: 0, other: 0 };
    labels.forEach((l) => { c[l.zoneType ?? 'other']++; });
    return c;
  }, [labels]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-20 bg-slate-900/90 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-md shadow-lg ring-1 ring-cyan-400/40"
      >
        🗂 Zones ({labels.length})
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-3 bottom-3 z-20 w-[280px] flex flex-col rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-cyan-400/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="text-xs font-semibold text-cyan-300 flex items-center gap-2">
          🗂 Zone List <span className="text-white/50 font-normal">({labels.length})</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-xs" title="Collapse">✕</button>
      </div>

      <div className="px-3 py-2 border-b border-white/10 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code, notes…"
          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 focus:border-cyan-400 outline-none text-xs"
        />
        <div className="flex flex-wrap gap-1 text-[10px]">
          {(['all', 'room', 'area', 'zone', 'asset', 'other'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-2 py-0.5 rounded ${
                filter === t
                  ? 'bg-cyan-500 text-slate-900 font-semibold'
                  : 'bg-white/5 hover:bg-white/15 text-white/70'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              <span className="ml-1 opacity-70">{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/40">
            {labels.length === 0
              ? 'No zones yet. Use Pick Mode to add one.'
              : 'No matches.'}
          </div>
        )}
        {filtered.map((l) => {
          const dot = ZONE_DOT[l.zoneType ?? 'other'];
          const devCount = l.assignedDeviceIds?.length ?? 0;
          return (
            <div key={l.id} className="px-3 py-2 hover:bg-white/5 group">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{l.customName || '(unnamed)'}</div>
                  {l.customCode && <div className="text-[10px] font-mono text-white/50 truncate">{l.customCode}</div>}
                </div>
                <button
                  onClick={() => onFlyTo(new THREE.Vector3(l.anchor.x, l.anchor.y, l.anchor.z))}
                  title="Fly to"
                  className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-cyan-500 hover:text-slate-900 opacity-0 group-hover:opacity-100 transition"
                >
                  🎯
                </button>
                <button
                  onClick={() => onSelect(l)}
                  title="Edit"
                  className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-cyan-500 hover:text-slate-900 opacity-0 group-hover:opacity-100 transition"
                >
                  ✏️
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${l.customName ?? 'this label'}"?`)) {
                      deleteLabelById(modelKey, l.id);
                      onDeleted();
                    }
                  }}
                  title="Delete"
                  className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-500 opacity-0 group-hover:opacity-100 transition"
                >
                  🗑
                </button>
              </div>
              {devCount > 0 && (
                <div className="mt-1 ml-4 flex flex-wrap gap-1">
                  {l.assignedDeviceIds!.slice(0, 3).map((id) => {
                    const s = MOCK_SENSORS.find((x) => x.id === id);
                    return (
                      <span key={id} className="text-[9px] bg-emerald-500/20 text-emerald-200 rounded px-1.5 py-0.5">
                        {s ? s.type : id}
                      </span>
                    );
                  })}
                  {devCount > 3 && (
                    <span className="text-[9px] text-white/50">+{devCount - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/40 text-center">
        Tip: Pick Mode → click floor → name area
      </div>
    </div>
  );
}
