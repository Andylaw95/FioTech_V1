import { Wind, Zap, Video, ArrowUpDown, Flame, KeyRound, Lightbulb, Network, Leaf } from 'lucide-react';
import { clsx } from 'clsx';
import { SUBSYSTEMS, Subsystem, Alarm } from './mockData';

const icons: Record<Subsystem, React.ComponentType<{ size?: number }>> = {
  HVAC: Wind,
  Power: Zap,
  CCTV: Video,
  Lift: ArrowUpDown,
  FAS: Flame,
  Access: KeyRound,
  Lighting: Lightbulb,
  Network: Network,
  Environment: Leaf,
};

interface Props {
  alarms: Alarm[];
  selected: string | null;
  onSelect: (subsystem: string | null) => void;
}

export function SubsystemDock({ alarms, selected, onSelect }: Props) {
  const counts = alarms.reduce<Record<string, number>>((acc, a) => {
    if (!a.resolved) acc[a.subsystem] = (acc[a.subsystem] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex gap-1 bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-700 px-2 py-1.5 shadow-2xl">
        <button
          onClick={() => onSelect(null)}
          className={clsx(
            'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
            selected === null ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'
          )}
        >
          All
        </button>
        {SUBSYSTEMS.map(sub => {
          const Icon = icons[sub];
          const isSel = selected === sub;
          const count = counts[sub] ?? 0;
          return (
            <button
              key={sub}
              onClick={() => onSelect(isSel ? null : sub)}
              className={clsx(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                isSel ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'
              )}
              title={sub}
            >
              <Icon size={14} />
              <span className="hidden md:inline">{sub}</span>
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
