import React from 'react';
import { Volume2, WifiOff, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router';

interface SoundLevelMeterCardProps {
  id: string;
  deviceName: string;
  property: string;
  propertyId: string;
  leq: number | null;
  lmax: number | null;
  lmin: number | null;
  inst: number | null;
  lcpeak: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  receivedAt: string;
}

/** Noise-level status — IEC 61672 thresholds for environmental monitoring */
function getNoiseStatus(leq: number | null) {
  if (leq == null) return { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Offline' };
  if (leq <= 55) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Quiet' };
  if (leq <= 70) return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Moderate' };
  if (leq <= 85) return { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Loud' };
  return { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Hazardous' };
}

export function SoundLevelMeterCard({
  id,
  deviceName,
  property,
  propertyId,
  leq,
  lmax,
  lmin,
  inst,
  lcpeak,
  trend,
  receivedAt,
}: SoundLevelMeterCardProps) {
  const freshMs = Date.now() - new Date(receivedAt).getTime();
  const isFresh = freshMs < 120_000; // 2 min
  const isOffline = (leq == null && lmax == null && lmin == null && inst == null) || freshMs > 300_000; // 5 min = offline
  const status = getNoiseStatus(isOffline ? null : leq);

  const trendEl = () => {
    if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
    if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
    return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  };

  const metricColor = (db: number | null) => {
    if (db == null) return 'text-slate-400';
    if (db > 85) return 'text-red-600';
    if (db > 70) return 'text-orange-600';
    if (db > 55) return 'text-amber-600';
    return 'text-slate-900';
  };

  return (
    <div className={clsx(
      "rounded-2xl border bg-white p-5 shadow-sm transition-shadow",
      isOffline ? "border-slate-200 opacity-75" : "border-slate-200 hover:shadow-md"
    )}>
      {/* Header: device name + status badge */}
      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900 line-clamp-1" title={deviceName}>{deviceName}</h4>
          <p className="text-xs text-slate-500 truncate" title={property}>{property}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={clsx('h-2 w-2 rounded-full', isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
          <span className={clsx("px-2.5 py-0.5 rounded-full text-xs font-medium border", status.bg, status.text, status.border)}>
            {status.label}
          </span>
        </div>
      </div>

      {isOffline ? (
        <div className="flex flex-col items-center justify-center py-4 mb-2">
          <WifiOff className="h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-500">Sensor Offline</p>
          <p className="text-xs text-slate-400 mt-0.5">No sound level data received</p>
        </div>
      ) : (
        <>
          {/* Hero metric: LAeq */}
          <div className="flex items-end gap-2 mb-5">
            <span className={clsx("text-4xl font-bold tracking-tight", status.text)}>
              {leq != null ? leq.toFixed(1) : '—'}
            </span>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm text-slate-400 font-medium">dBA LAeq</span>
              {trend && trendEl()}
            </div>
          </div>

          {/* 4-metric grid */}
          <div className="grid grid-cols-4 gap-2.5">
            {/* LAFmax */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Volume2 className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">LAFmax</span>
              </div>
              <div className={clsx("text-sm font-bold font-mono", metricColor(lmax))}>
                {lmax != null ? lmax.toFixed(1) : '—'}
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">dBA</span>
              </div>
            </div>

            {/* LAFmin */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Volume2 className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">LAFmin</span>
              </div>
              <div className={clsx("text-sm font-bold font-mono", metricColor(lmin))}>
                {lmin != null ? lmin.toFixed(1) : '—'}
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">dBA</span>
              </div>
            </div>

            {/* LAF (instantaneous) */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Volume2 className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">LAF</span>
              </div>
              <div className={clsx("text-sm font-bold font-mono", metricColor(inst))}>
                {inst != null ? inst.toFixed(1) : '—'}
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">dBA</span>
              </div>
            </div>

            {/* LCPeak */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Volume2 className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">LCPeak</span>
              </div>
              <div className={clsx("text-sm font-bold font-mono", lcpeak != null && lcpeak > 135 ? 'text-red-600' : lcpeak != null && lcpeak > 120 ? 'text-orange-600' : 'text-slate-900')}>
                {lcpeak != null ? lcpeak.toFixed(1) : '—'}
                <span className="text-[10px] text-slate-400 font-normal ml-0.5">dBC</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer link */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <Link
          to={`/buildings/${propertyId}`}
          className="flex items-center justify-between text-xs font-medium text-slate-500 hover:text-violet-600 transition-colors group"
        >
          <span>Sound Level Meter · {isFresh ? 'Live' : 'Stale'}</span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
