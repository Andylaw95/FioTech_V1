import { useEffect, useState } from 'react';
import type { StreamMode, DeviceCounts } from './useLiveDeviceStream';

interface Props {
  mode: StreamMode;
  counts: DeviceCounts;
  lastFetch: Date | null;
}

function ageLabel(date: Date | null): string {
  if (!date) return '—';
  const sec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

export function LiveStatusBadge({ mode, counts, lastFetch }: Props) {
  // Tick every 2s so the "Xs ago" label refreshes
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const palette =
    mode === 'live'
      ? { dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]', text: 'text-emerald-300', label: 'LIVE' }
      : mode === 'connecting'
        ? { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', label: 'CONNECTING' }
        : { dot: 'bg-orange-400 animate-pulse', text: 'text-orange-300', label: 'DEMO DATA' };

  return (
    <div
      className="absolute z-30 top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full
                 bg-slate-900/85 backdrop-blur ring-1 ring-white/10 shadow-lg text-[11px] font-mono text-white"
      title={
        mode === 'live'
          ? `Connected to FioTech backend · ${counts.matched}/${counts.total} devices matched · ${counts.online} online`
          : mode === 'mock'
            ? 'Sign in to see live device telemetry — showing simulated values that match real sensor patterns'
            : 'Connecting to FioTech backend…'
      }
    >
      <span className={`w-2 h-2 rounded-full ${palette.dot}`} />
      <span className={`font-bold ${palette.text}`}>{palette.label}</span>
      {mode !== 'connecting' && (
        <>
          <span className="text-white/30">·</span>
          <span className="text-white/70">{counts.matched}/{counts.total} dev</span>
          <span className="text-white/30">·</span>
          <span className={counts.offline === 0 ? 'text-emerald-400' : 'text-amber-300'}>
            {counts.online} online
          </span>
          <span className="text-white/30">·</span>
          <span className="text-white/50">{ageLabel(lastFetch)}</span>
        </>
      )}
    </div>
  );
}
