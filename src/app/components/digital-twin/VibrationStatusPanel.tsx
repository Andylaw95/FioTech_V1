import React, { useMemo } from 'react';
import { Activity, AlertTriangle, ShieldCheck, BatteryLow, Compass, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';
import type { Device, PropertyTelemetry } from '@/app/utils/api';

// Lai King Hospital AAA defaults (mm/s PPV)
const PPV_ALERT  = 0.075;
const PPV_ALARM  = 0.15;
const PPV_ACTION = 0.30;

type ComplianceLevel = 'normal' | 'alert' | 'alarm' | 'action' | 'unknown';

function classifyPpv(ppv: number | null | undefined): ComplianceLevel {
  if (typeof ppv !== 'number') return 'unknown';
  if (ppv >= PPV_ACTION) return 'action';
  if (ppv >= PPV_ALARM) return 'alarm';
  if (ppv >= PPV_ALERT) return 'alert';
  return 'normal';
}

const levelStyle: Record<ComplianceLevel, { label: string; bg: string; text: string; ring: string; bar: string }> = {
  normal:  { label: 'Normal',    bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', bar: 'bg-emerald-500' },
  alert:   { label: 'Alert',     bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   bar: 'bg-amber-500' },
  alarm:   { label: 'Alarm',     bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-200',  bar: 'bg-orange-500' },
  action:  { label: 'STOP WORK', bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-300',     bar: 'bg-red-600' },
  unknown: { label: 'No Data',   bg: 'bg-slate-50',   text: 'text-slate-500',   ring: 'ring-slate-200',   bar: 'bg-slate-300' },
};

function isVibrationDevice(d: Device): boolean {
  const t = (d.type ?? '').toLowerCase();
  const n = (d.name ?? '').toLowerCase();
  return t.includes('vibration') || t.includes('accelerometer') || t.includes('as400') || t.includes('as-400') || t.includes('bewis')
      || n.includes('vibration') || n.includes('as400') || n.includes('as-400') || n.includes('bewis');
}

export { isVibrationDevice };

interface VibrationReading {
  device: Device;
  ppv: number | null;
  tiltX: number | null;
  tiltY: number | null;
  tiltZ: number | null;
  battery: number | null;
  receivedAt: string | null;
  ppvSource: string | null;
}

function matchReading(device: Device, telemetry: PropertyTelemetry | null): VibrationReading {
  const empty: VibrationReading = {
    device, ppv: null, tiltX: null, tiltY: null, tiltZ: null, battery: null,
    receivedAt: null, ppvSource: null,
  };
  if (!telemetry?.deviceReadings) return empty;
  const entries = Object.entries(telemetry.deviceReadings);
  const dn = (device.name ?? '').trim().toLowerCase();
  const did = (device.id ?? '').trim().toLowerCase();
  const dEui = ((device as any).devEui ?? (device as any).devEUI ?? '').toString().trim().toLowerCase();

  // 1) Exact match on devEUI / id (key in deviceReadings is devEUI)
  let match = entries.find(([eui, r]) => {
    const k = eui.toLowerCase();
    const re = (r.devEUI ?? '').toLowerCase();
    return (dEui && (k === dEui || re === dEui)) || (did && (k === did || re === did));
  })?.[1];

  // 2) Exact name match (case + trim normalised)
  if (!match && dn) {
    match = entries.find(([, r]) => (r.deviceName ?? '').trim().toLowerCase() === dn)?.[1];
  }

  // 3) Unambiguous fuzzy substring match — only when EXACTLY one matches
  if (!match && dn) {
    const fuzzy = entries.filter(([, r]) => {
      const rn = (r.deviceName ?? '').trim().toLowerCase();
      return rn && (rn.includes(dn) || dn.includes(rn));
    });
    if (fuzzy.length === 1) match = fuzzy[0][1];
  }

  if (!match?.decoded) return empty;
  const d = match.decoded as Record<string, number | string | null | undefined>;
  const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
  return {
    device,
    ppv:    numOrNull(d.ppv_max_mm_s) ?? numOrNull(d.ppv_resultant_mm_s),
    tiltX:  numOrNull(d.tilt_x_deg),
    tiltY:  numOrNull(d.tilt_y_deg),
    tiltZ:  numOrNull(d.tilt_z_deg),
    battery: numOrNull(d.battery),
    receivedAt: match.receivedAt ?? null,
    ppvSource: typeof d.ppv_source === 'string' ? d.ppv_source : null,
  };
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

interface VibrationStatusPanelProps {
  devices: Device[];
  telemetry: PropertyTelemetry | null;
}

export function VibrationStatusPanel({ devices, telemetry }: VibrationStatusPanelProps) {
  const vibDevices = useMemo(() => devices.filter(isVibrationDevice), [devices]);
  const readings = useMemo(() => vibDevices.map(d => matchReading(d, telemetry)), [vibDevices, telemetry]);

  if (vibDevices.length === 0) return null;

  // Worst-case compliance: ignore 'unknown' if any sensor has a real reading,
  // but show 'No Data' if ALL sensors are unknown (avoids falsely showing Normal during loading).
  const levels = readings.map(r => classifyPpv(r.ppv));
  const order: ComplianceLevel[] = ['normal', 'alert', 'alarm', 'action'];
  const knownLevels = levels.filter((l): l is Exclude<ComplianceLevel, 'unknown'> => l !== 'unknown');
  const worstLevel: ComplianceLevel = knownLevels.length === 0
    ? 'unknown'
    : knownLevels.reduce<ComplianceLevel>((acc, lvl) =>
        order.indexOf(lvl) > order.indexOf(acc as Exclude<ComplianceLevel, 'unknown'>) ? lvl : acc, 'normal');
  const worstStyle = levelStyle[worstLevel];

  const onlineCount = readings.filter(r => r.device.status === 'online').length;
  const offlineCount = readings.filter(r => r.device.status === 'offline').length;
  const lowBatt = readings.filter(r => typeof r.battery === 'number' && r.battery < 10).length;

  return (
    <div className="space-y-3">
      {/* Header banner */}
      <div className={clsx(
        'rounded-xl border p-3 ring-1',
        worstLevel === 'action' ? 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50 ring-red-200'
          : worstLevel === 'alarm' ? 'border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 ring-orange-200'
          : worstLevel === 'alert' ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 ring-amber-200'
          : 'border-purple-100 bg-gradient-to-br from-purple-50 via-fuchsia-50/50 to-white ring-purple-100'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={clsx('p-1.5 rounded-lg', worstStyle.bg, worstStyle.text)}>
              {worstLevel === 'action' || worstLevel === 'alarm'
                ? <AlertTriangle className="h-4 w-4" />
                : <Activity className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Vibration Compliance</p>
              <p className="text-xs text-slate-500">Lai King Hospital AAA · {vibDevices.length} sensor{vibDevices.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div className={clsx('px-2.5 py-1 rounded-full text-xs font-bold', worstStyle.bg, worstStyle.text, 'ring-1', worstStyle.ring)}>
            {worstStyle.label}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/60 p-2">
            <p className="text-[10px] uppercase font-medium text-slate-500">Online</p>
            <p className="text-sm font-bold text-emerald-600 font-mono">{onlineCount}/{vibDevices.length}</p>
          </div>
          <div className="rounded-lg bg-white/60 p-2">
            <p className="text-[10px] uppercase font-medium text-slate-500">Offline</p>
            <p className={clsx('text-sm font-bold font-mono', offlineCount > 0 ? 'text-red-600' : 'text-slate-400')}>{offlineCount}</p>
          </div>
          <div className="rounded-lg bg-white/60 p-2">
            <p className="text-[10px] uppercase font-medium text-slate-500">Low Batt</p>
            <p className={clsx('text-sm font-bold font-mono', lowBatt > 0 ? 'text-amber-600' : 'text-slate-400')}>{lowBatt}</p>
          </div>
        </div>
      </div>

      {/* Threshold legend */}
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
        <p className="text-[10px] uppercase font-semibold text-slate-500 mb-1.5">PPV Thresholds (mm/s)</p>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div className="rounded bg-amber-100 text-amber-800 px-1.5 py-1 text-center font-mono">≥{PPV_ALERT} Alert</div>
          <div className="rounded bg-orange-100 text-orange-800 px-1.5 py-1 text-center font-mono">≥{PPV_ALARM} Alarm</div>
          <div className="rounded bg-red-100 text-red-800 px-1.5 py-1 text-center font-mono">≥{PPV_ACTION} Action</div>
        </div>
      </div>

      {/* Per-sensor cards */}
      <div className="space-y-2">
        {readings.map(r => {
          const lvl = classifyPpv(r.ppv);
          const style = levelStyle[lvl];
          const offline = r.device.status === 'offline';
          const ppvPct = typeof r.ppv === 'number' ? Math.min(100, (r.ppv / PPV_ACTION) * 100) : 0;
          return (
            <div key={r.device.id}
              className={clsx(
                'rounded-xl border p-3 bg-white',
                offline ? 'border-red-200 border-l-2 border-l-red-500'
                  : lvl === 'action' ? 'border-red-200 border-l-2 border-l-red-600'
                  : lvl === 'alarm' ? 'border-orange-200 border-l-2 border-l-orange-500'
                  : lvl === 'alert' ? 'border-amber-200 border-l-2 border-l-amber-500'
                  : 'border-slate-100'
              )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.device.name}</p>
                    {offline && <WifiOff className="h-3 w-3 text-red-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{r.device.location || r.device.type}</p>
                </div>
                <div className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', style.bg, style.text)}>
                  {style.label}
                </div>
              </div>

              {/* PPV value */}
              <div className="mt-2.5 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">PPV</span>
                  {r.ppvSource === 'edge_estimated' && (
                    <span className="ml-1 text-[9px] text-slate-400">(est.)</span>
                  )}
                </div>
                <div>
                  <span className={clsx('text-lg font-bold font-mono', style.text)}>
                    {typeof r.ppv === 'number' ? r.ppv.toFixed(3) : '—'}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">mm/s</span>
                </div>
              </div>

              {/* PPV bar with threshold markers */}
              <div className="mt-1 relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={clsx('h-full rounded-full transition-all duration-700', style.bar)}
                  style={{ width: `${ppvPct}%` }} />
                {/* threshold ticks */}
                <div className="absolute top-0 h-full w-px bg-amber-400/60" style={{ left: `${(PPV_ALERT / PPV_ACTION) * 100}%` }} />
                <div className="absolute top-0 h-full w-px bg-orange-500/60" style={{ left: `${(PPV_ALARM / PPV_ACTION) * 100}%` }} />
              </div>

              {/* Tilt + Battery row (X / Y / Z / Batt) */}
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[10px]">
                <div className="rounded bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Compass className="h-2.5 w-2.5" /> X°
                  </div>
                  <p className="font-mono font-semibold text-slate-800">
                    {typeof r.tiltX === 'number' ? r.tiltX.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="rounded bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Compass className="h-2.5 w-2.5" /> Y°
                  </div>
                  <p className="font-mono font-semibold text-slate-800">
                    {typeof r.tiltY === 'number' ? r.tiltY.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="rounded bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Compass className="h-2.5 w-2.5" /> Z°
                  </div>
                  <p className="font-mono font-semibold text-slate-800">
                    {typeof r.tiltZ === 'number' ? r.tiltZ.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="rounded bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center gap-1 text-slate-500">
                    {typeof r.battery === 'number' && r.battery < 10
                      ? <BatteryLow className="h-2.5 w-2.5 text-amber-500" />
                      : <ShieldCheck className="h-2.5 w-2.5" />}
                    Batt
                  </div>
                  <p className={clsx('font-mono font-semibold',
                    typeof r.battery === 'number' && r.battery < 10 ? 'text-amber-600' : 'text-slate-800')}>
                    {typeof r.battery === 'number' ? `${r.battery}%` : '—'}
                  </p>
                </div>
              </div>

              {(() => {
                const seen = relativeTime(r.receivedAt);
                const fallback = seen === '—' ? (r.device.lastUpdate || '—') : seen;
                return <p className="mt-1.5 text-[10px] text-slate-400">Last seen: {fallback}</p>;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
