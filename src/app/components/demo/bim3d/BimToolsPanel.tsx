import { useEffect, useRef, useState } from 'react';
import { CATEGORY_GROUPS } from './IfcModel';

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

  if (collapsed) {
    return (
      <div className="absolute z-20 flex flex-col gap-1.5" style={{ top: pos.top, right: pos.right }}>
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
      className="absolute z-20 w-64 rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-white/10 overflow-hidden"
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
              <span className="text-[10px] font-mono text-cyan-300">{state.clipHeight.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min={0}
              max={state.maxHeight + 0.5}
              step={0.1}
              value={state.clipHeight}
              onChange={(e) => setState({ ...state, clipHeight: parseFloat(e.target.value) })}
              className="w-full accent-cyan-400"
            />
            <div className="flex gap-1 mt-1">
              <button onClick={() => setState({ ...state, clipHeight: state.maxHeight + 0.5 })} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">All</button>
              <button onClick={() => setState({ ...state, clipHeight: state.maxHeight * 0.7 })} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">−Roof</button>
              <button onClick={() => setState({ ...state, clipHeight: state.maxHeight * 0.4 })} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">Half</button>
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

      {/* CATEGORIES TAB */}
      {section === 'cats' && (
        <div className="p-3 space-y-2">
          <div className="flex gap-1.5">
            <button onClick={allOn} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">All On</button>
            <button onClick={allOff} className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10">All Off</button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {Object.entries(CATEGORY_GROUPS).map(([key, group]) => {
              const count = categoryCounts[key] ?? 0;
              const on = state.visibleCats.has(key);
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition ${on ? 'bg-white/5 hover:bg-white/10' : 'opacity-50 hover:opacity-80'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleCat(key)}
                    disabled={count === 0}
                    className="accent-cyan-400 w-3.5 h-3.5"
                  />
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: group.color ?? '#94a3b8' }} />
                  <span className="text-[11px] flex-1">{group.label}</span>
                  <span className="text-[10px] font-mono text-white/40">{count}</span>
                </label>
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
