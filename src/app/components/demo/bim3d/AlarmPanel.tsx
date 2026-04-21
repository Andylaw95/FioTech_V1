import { AlertTriangle, CheckCircle2, Info, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Alarm, severityColor } from './mockData';
import { clsx } from 'clsx';

interface Props {
  alarms: Alarm[];
  selectedAlarmId: string | null;
  onSelect: (alarm: Alarm) => void;
  onResolve: (id: string) => void;
  filterSubsystem: string | null;
}

const sevIcon = (sev: string) => {
  if (sev === 'critical') return <Zap size={14} />;
  if (sev === 'warning') return <AlertTriangle size={14} />;
  if (sev === 'info') return <Info size={14} />;
  return <CheckCircle2 size={14} />;
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

export function AlarmPanel({ alarms, selectedAlarmId, onSelect, onResolve, filterSubsystem }: Props) {
  const filtered = filterSubsystem
    ? alarms.filter(a => a.subsystem === filterSubsystem)
    : alarms;
  const active = filtered.filter(a => !a.resolved);
  const resolved = filtered.filter(a => a.resolved);

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-white border-r border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">Live Alarms</h3>
          <span className="text-xs text-slate-400">
            {active.length} active / {alarms.length} total
          </span>
        </div>
        {filterSubsystem && (
          <div className="mt-2 text-xs text-cyan-400">
            Filtered: {filterSubsystem}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {active.map((a) => {
            const color = severityColor(a.severity);
            const isSel = selectedAlarmId === a.id;
            return (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={clsx(
                  'px-3 py-2 border-b border-slate-800 cursor-pointer transition-colors',
                  isSel ? 'bg-slate-700' : 'hover:bg-slate-800'
                )}
                onClick={() => onSelect(a)}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5" style={{ color }}>{sevIcon(a.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color }}>
                      {a.title}
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                      {a.message}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-200 font-medium">
                          {a.subsystem}
                        </span>
                        <span className="text-slate-500">{timeAgo(a.occurredAt)}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onResolve(a.id); }}
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded hover:bg-emerald-500/10 border border-emerald-600/40 flex items-center gap-1"
                      >
                        <CheckCircle2 size={10} /> Resolve
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {active.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No active alarms
          </div>
        )}

        {resolved.length > 0 && (
          <div className="px-3 py-2 border-t border-slate-800 mt-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Resolved ({resolved.length})
            </div>
            {resolved.slice(0, 5).map(a => (
              <div key={a.id} className="text-[11px] text-slate-500 truncate py-0.5">
                ✓ {a.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
