import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_GROUPS, DISCIPLINES, CATEGORIES_BY_DISCIPLINE, type Discipline } from './IfcModel';
import { ClipPresets, loadClipPresets, saveClipPresets } from './clipPresets';

export interface BimToolsState {
  visibleCats: Set<string>;
  wireframe: boolean;
  edges: boolean;
  ghost: boolean;
  clipHeight: number;
  maxHeight: number;
  rotationPreset: 'A' | 'B' | 'C' | 'D';
}

export function BimToolsPanel({
  state,
  setState,
  categoryCounts,
  onResetView,
  onFitView,
  onIsolateSelected,
  onShowAll,
  hasSelection,
  pickMode,
  onTogglePickMode,
}: {
  state: BimToolsState;
  setState: (s: BimToolsState) => void;
  categoryCounts: Record<string, number>;
  onResetView: () => void;
  onFitView: () => void;
  onIsolateSelected: () => void;
  onShowAll: () => void;
  hasSelection: boolean;
  pickMode: boolean;
  onTogglePickMode: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [section, setSection] = useState<'view' | 'cats' | 'orient'>('view');

  // Editable Y-clip presets (persisted in localStorage). Lets the user dial
  // in their own Roof / Pipe&Wire heights per their building's floor plate.
  const [presets, setPresets] = useState<ClipPresets>(() => loadClipPresets());
  const [editingPresets, setEditingPresets] = useState(false);
  const updatePreset = (k: keyof ClipPresets, v: number) => {
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(0, Math.min(state.maxHeight, v));
    const next = { ...presets, [k]: +clamped.toFixed(2) };
    setPresets(next);
    saveClipPresets(next);
  };

  // Draggable position (top-right by default; offset from right edge)
  const [pos, setPos] = useState<{ top: number; right: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('fiotec.bim.tools.pos');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { top: 12, right: 12 };
  });
  const dragRef = useRef<{ startX: number; startY: number; startTop: number; startRight: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('fiotec.bim.tools.pos', JSON.stringify(pos));
    } catch {}
  }, [pos]);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: pos.top,
      startRight: pos.right,
    };
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      top: Math.max(0, dragRef.current.startTop + dy),
      right: Math.max(0, dragRef.current.startRight - dx),
    });
  };
  const onHeaderPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const toggleCat = (key: string) => {
    const next = new Set(state.visibleCats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setState({ ...state, visibleCats: next });
  };

  const allOn = () => setState({ ...state, visibleCats: new Set(Object.keys(CATEGORY_GROUPS)) });
  const allOff = () => setState({ ...state, visibleCats: new Set() });

  // Discipline toggles flip every category under that discipline at once.
  // Modeled on DDC's discipline-based grouping (Architectural / Structural /
  // MEP). Hiding Architectural removes IFCCOVERING which is the duplicate of
  // the structural IFCSLAB — eliminating coplanar slab z-fighting at the
  // source instead of relying on polygonOffset hacks.
  const disciplineState: Record<Discipline, 'all' | 'some' | 'none'> = useMemo(() => {
    const r: Record<Discipline, 'all' | 'some' | 'none'> = { architectural: 'none', structural: 'none', mep: 'none', common: 'none' };
    for (const d of Object.keys(DISCIPLINES) as Discipline[]) {
      const cats = CATEGORIES_BY_DISCIPLINE[d];
      const visible = cats.filter(c => state.visibleCats.has(c)).length;
      r[d] = visible === 0 ? 'none' : visible === cats.length ? 'all' : 'some';
    }
    return r;
  }, [state.visibleCats]);

  const toggleDiscipline = (d: Discipline) => {
    const cats = CATEGORIES_BY_DISCIPLINE[d];
    const next = new Set(state.visibleCats);
    const allOnNow = cats.every(c => next.has(c));
    if (allOnNow) cats.forEach(c => next.delete(c));
    else cats.forEach(c => next.add(c));
    setState({ ...state, visibleCats: next });
  };

  if (collapsed) {
    return (
      <div className="absolute z-20 flex flex-col gap-1.5 max-sm:!top-3 max-sm:!right-2" style={{ top: pos.top, right: pos.right }}>
        <button
          onClick={() => setCollapsed(false)}
          className="px-3 py-1.5 rounded-md bg-slate-900/85 text-white text-xs font-semibold shadow-lg backdrop-blur-sm hover:bg-slate-800"
        >
          🛠️ Tools
        </button>
        <button
          onClick={onTogglePickMode}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg backdrop-blur-sm transition ${
            pickMode ? 'bg-amber-500 text-slate-900 ring-2 ring-amber-300' : 'bg-slate-900/85 text-white hover:bg-slate-800'
          }`}
        >
          🎯 {pickMode ? 'Pick ON' : 'Pick'}
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute z-20 w-64 max-sm:!w-[calc(100vw-1rem)] max-sm:!left-2 max-sm:!right-2 max-sm:!top-auto max-sm:!bottom-2 max-sm:!max-h-[55vh] max-sm:overflow-y-auto rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-white/10 overflow-hidden"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-move select-none"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className="text-xs font-bold tracking-wider text-cyan-300 flex items-center gap-1.5">
          <span className="text-white/30">⋮⋮</span> 🛠️ BIM TOOLS
        </div>
        <button
          onClick={() => setCollapsed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-white/60 hover:text-white text-xs px-1"
        >−</button>
      </div>

      {/* Pick toggle — always visible at top */}
      <button
        onClick={onTogglePickMode}
        className={`w-full text-[11px] py-1.5 font-semibold transition ${
          pickMode
            ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
            : 'bg-white/5 text-white hover:bg-white/10'
        }`}
      >
        🎯 {pickMode ? 'Pick Mode ON — click element' : 'Enable Pick Mode'}
      </button>

      {/* Tabs */}
      <div className="flex border-b border-t border-white/10 text-[11px] font-semibold">
        {(['view', 'cats', 'orient'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex-1 py-1.5 transition ${section === s ? 'bg-cyan-500/20 text-cyan-200 border-b-2 border-cyan-400' : 'text-white/60 hover:bg-white/5'}`}
          >
            {s === 'view' ? 'View' : s === 'cats' ? 'Layers' : 'Orient'}
          </button>
        ))}
      </div>

      {/* VIEW TAB */}
      {section === 'view' && (
        <div className="p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-white/70 font-semibold">Section (Y clip)</label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-cyan-300">{state.clipHeight.toFixed(1)}m</span>
                <button
                  onClick={() => setEditingPresets(v => !v)}
                  title={editingPresets ? 'Done editing presets' : 'Edit Roof / Pipe&Wire heights'}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${editingPresets ? 'bg-cyan-500/30 text-cyan-100' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {editingPresets ? '✓' : '✎'}
                </button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={state.maxHeight}
              step={0.1}
              value={state.clipHeight}
              onChange={(e) => setState({ ...state, clipHeight: parseFloat(e.target.value) })}
              className="w-full accent-cyan-400"
            />
            <div className="flex gap-1 mt-1 items-stretch">
              <button
                onClick={() => setState({ ...state, clipHeight: state.maxHeight })}
                className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10"
                title="Show entire model"
              >
                All
              </button>
              {(['roof', 'pipeWire'] as const).map((k) => {
                const label = k === 'roof' ? 'Roof' : 'Pipe&Wire';
                const tooltip = k === 'roof'
                  ? 'Architectural floor-plan view'
                  : 'MEP service-level view';
                return editingPresets ? (
                  <div
                    key={k}
                    className="flex-1 flex items-center gap-0.5 text-[10px] bg-white/5 rounded px-1 py-0.5"
                    title={tooltip}
                  >
                    <span className="text-white/60 truncate">{label}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={state.maxHeight}
                      value={presets[k]}
                      onChange={(e) => updatePreset(k, parseFloat(e.target.value))}
                      className="w-full bg-transparent text-cyan-200 font-mono text-[10px] outline-none border border-white/10 rounded px-1"
                    />
                    <span className="text-white/40">m</span>
                    <button
                      onClick={() => updatePreset(k, state.clipHeight)}
                      title="Save current slider value as this preset"
                      className="text-cyan-300/70 hover:text-cyan-200 px-0.5"
                    >
                      ⤒
                    </button>
                  </div>
                ) : (
                  <button
                    key={k}
                    onClick={() => setState({ ...state, clipHeight: presets[k] })}
                    className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10"
                    title={`${tooltip} (${presets[k]}m) — click ✎ to edit`}
                  >
                    {label} <span className="text-white/40 font-mono">{presets[k]}m</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between text-[11px] cursor-pointer">
            <span className="text-white/70 font-semibold">Edges (outline)</span>
            <input
              type="checkbox"
              checked={state.edges}
              onChange={(e) => setState({ ...state, edges: e.target.checked })}
              className="accent-cyan-400 w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between text-[11px] cursor-pointer">
            <span className="text-white/70 font-semibold">Wireframe</span>
            <input
              type="checkbox"
              checked={state.wireframe}
              onChange={(e) => setState({ ...state, wireframe: e.target.checked })}
              className="accent-cyan-400 w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between text-[11px] cursor-pointer">
            <span className="text-white/70 font-semibold">Ghost mode</span>
            <input
              type="checkbox"
              checked={state.ghost}
              onChange={(e) => setState({ ...state, ghost: e.target.checked })}
              className="accent-cyan-400 w-4 h-4"
            />
          </label>

          <div className="flex gap-1.5">
            <button onClick={onFitView} className="flex-1 text-[11px] py-1.5 rounded bg-cyan-500/80 hover:bg-cyan-400 text-slate-900 font-semibold">⊡ Fit</button>
            <button onClick={onResetView} className="flex-1 text-[11px] py-1.5 rounded bg-white/5 hover:bg-white/10 font-semibold">🎥 Reset</button>
            <button
              onClick={onIsolateSelected}
              disabled={!hasSelection}
              className="flex-1 text-[11px] py-1.5 rounded bg-amber-500/80 hover:bg-amber-400 disabled:bg-white/5 disabled:text-white/30 text-slate-900 disabled:cursor-not-allowed font-semibold"
            >
              ⊙ Isolate
            </button>
          </div>
          <button onClick={onShowAll} className="w-full text-[11px] py-1.5 rounded bg-white/5 hover:bg-white/10 font-semibold">👁 Show All</button>
        </div>
      )}

      {/* CATEGORIES TAB — grouped by discipline (DDC pattern) */}
      {section === 'cats' && (
        <div className="p-3 space-y-2">
          <div className="flex gap-1.5">
            <button onClick={allOn} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">All On</button>
            <button onClick={allOff} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">All Off</button>
          </div>
          <div className="text-[10px] text-white/40 leading-tight px-0.5">
            Hide a discipline to remove duplicate-overlapping geometry (e.g. arch floor finish vs structural slab).
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {(Object.keys(DISCIPLINES) as Discipline[]).map((d) => {
              const meta = DISCIPLINES[d];
              const cats = CATEGORIES_BY_DISCIPLINE[d];
              const cnt = cats.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0);
              if (cnt === 0) return null;
              const ds = disciplineState[d];
              return (
                <div key={d} className="rounded border border-white/5 bg-white/[0.02]">
                  <button
                    onClick={() => toggleDiscipline(d)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] ${
                        ds === 'all' ? 'bg-cyan-500 border-cyan-400 text-slate-900' :
                        ds === 'some' ? 'bg-cyan-500/40 border-cyan-400/60 text-white' :
                        'bg-transparent border-white/30'
                      }`}
                    >
                      {ds === 'all' ? '✓' : ds === 'some' ? '–' : ''}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: meta.color }} />
                    <span className="text-[11px] font-semibold flex-1 text-left">{meta.label}</span>
                    <span className="text-[10px] font-mono text-white/40">{cnt}</span>
                  </button>
                  <div className="border-t border-white/5">
                    {cats.map((key) => {
                      const group = CATEGORY_GROUPS[key];
                      const count = categoryCounts[key] ?? 0;
                      if (count === 0) return null;
                      const on = state.visibleCats.has(key);
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 pl-7 pr-2 py-1 cursor-pointer transition ${on ? 'hover:bg-white/5' : 'opacity-50 hover:opacity-80'}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleCat(key)}
                            className="accent-cyan-400 w-3 h-3"
                          />
                          <span className="w-2 h-2 rounded-sm" style={{ background: group.color ?? '#94a3b8' }} />
                          <span className="text-[10.5px] flex-1">{group.label}</span>
                          <span className="text-[10px] font-mono text-white/40">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ORIENT TAB */}
      {section === 'orient' && (
        <div className="p-3 space-y-2">
          <div className="text-[11px] text-white/60">Coordinate system fix (Z-up vs Y-up).</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['A', 'B', 'C', 'D'] as const).map(p => (
              <button
                key={p}
                onClick={() => setState({ ...state, rotationPreset: p })}
                className={`text-[11px] py-2 rounded font-mono font-bold ${state.rotationPreset === p ? 'bg-cyan-500 text-slate-900' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {p === 'A' ? 'A −90°' : p === 'B' ? 'B +90°' : p === 'C' ? 'C 180°' : 'D 0°'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
