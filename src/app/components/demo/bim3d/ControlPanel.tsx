import { Zap, RotateCcw, Maximize2, Eye, EyeOff } from 'lucide-react';

interface Props {
  showWalls: boolean;
  onToggleWalls: () => void;
  onTriggerCritical: () => void;
  onTriggerWarning: () => void;
  onResetView: () => void;
}

// Compact control panel that lives in the left sidebar header area.
export function ControlPanel({
  showWalls, onToggleWalls, onTriggerCritical, onTriggerWarning, onResetView,
}: Props) {
  return (
    <div className="px-4 py-3 border-b border-slate-700 bg-slate-900/60 space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
        Controls
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={onTriggerCritical}
          className="col-span-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 shadow transition-colors"
          title="Trigger mock critical alarm"
        >
          <Zap size={14} /> Trigger Critical Alarm
        </button>
        <button
          onClick={onTriggerWarning}
          className="px-2 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium rounded flex items-center justify-center gap-1 transition-colors"
        >
          <Zap size={12} /> Warning
        </button>
        <button
          onClick={onResetView}
          className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded flex items-center justify-center gap-1 transition-colors border border-slate-600"
        >
          <RotateCcw size={12} /> Reset View
        </button>
        <button
          onClick={onToggleWalls}
          className="col-span-2 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
        >
          {showWalls ? <EyeOff size={12} /> : <Eye size={12} />}
          {showWalls ? 'Hide Building Wireframe' : 'Show Building Wireframe'}
        </button>
      </div>
    </div>
  );
}
