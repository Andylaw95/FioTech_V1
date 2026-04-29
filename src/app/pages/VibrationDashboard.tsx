import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { useTheme } from '@/app/utils/ThemeContext';
import {
  Activity, AlertTriangle, ChevronDown, Radio, Loader2, Gauge, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '@/app/utils/api';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ── AAA threshold defaults (Lai King Hospital reference, mm/s PPV) ──
const AAA = { alert: 0.075, alarm: 0.15, action: 0.30 };
const PPV_GAUGE_MAX = 0.5; // mm/s — covers the Action band

// ── Vibration status classification ──
function getVibrationStatus(ppv: number) {
  if (ppv >= AAA.action) return { label: 'Action', color: 'red', ring: '#ef4444', bg: 'bg-red-500' };
  if (ppv >= AAA.alarm)  return { label: 'Alarm',  color: 'orange', ring: '#f97316', bg: 'bg-orange-500' };
  if (ppv >= AAA.alert)  return { label: 'Alert',  color: 'amber',  ring: '#f59e0b', bg: 'bg-amber-500' };
  return { label: 'Normal', color: 'emerald', ring: '#10b981', bg: 'bg-emerald-500' };
}

// ── Arc gauge SVG ──
function VibrationGauge({ value, size = 220 }: { value: number; size?: number }) {
  const status = getVibrationStatus(value);
  const max = PPV_GAUGE_MAX;
  const r = (size - 24) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const startAngle = -210;
  const endAngle = 30;
  const totalAngle = endAngle - startAngle;
  const valueAngle = startAngle + (Math.min(value, max) / max) * totalAngle;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arcPath = (from: number, to: number) => {
    const s = polarToCartesian(from);
    const e = polarToCartesian(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const ticks = [0, AAA.alert, AAA.alarm, AAA.action, max];
  const tickColor = (t: number) => {
    if (t >= AAA.action) return '#ef4444';
    if (t >= AAA.alarm) return '#f97316';
    if (t >= AAA.alert) return '#f59e0b';
    return '#10b981';
  };

  return (
    <svg className="w-full h-auto max-w-[280px] mx-auto" viewBox={`0 0 ${size} ${size}`}>
      <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      <path d={arcPath(startAngle, startAngle + (AAA.alert / max) * totalAngle)} fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      <path d={arcPath(startAngle + (AAA.alert / max) * totalAngle, startAngle + (AAA.alarm / max) * totalAngle)} fill="none" stroke="#f59e0b" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(startAngle + (AAA.alarm / max) * totalAngle, startAngle + (AAA.action / max) * totalAngle)} fill="none" stroke="#f97316" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(startAngle + (AAA.action / max) * totalAngle, endAngle)} fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      <path d={arcPath(startAngle, valueAngle)} fill="none" stroke={status.ring} strokeWidth="14" strokeLinecap="round" />
      {ticks.map(t => {
        const angle = startAngle + (t / max) * totalAngle;
        const inner = polarToCartesian(angle);
        const outer = { x: cx + (r + 16) * Math.cos((angle * Math.PI) / 180), y: cy + (r + 16) * Math.sin((angle * Math.PI) / 180) };
        return (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={cx + (r - 8) * Math.cos((angle * Math.PI) / 180)} y2={cy + (r - 8) * Math.sin((angle * Math.PI) / 180)} stroke={tickColor(t)} strokeWidth="2" />
            <text x={outer.x} y={outer.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8" fontWeight="600">{t}</text>
          </g>
        );
      })}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="38" fontWeight="700" fill={status.ring}>{value.toFixed(3)}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="14" fontWeight="500" fill="#94a3b8">mm/s PPV</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="14" fontWeight="600" fill={status.ring}>{status.label}</text>
    </svg>
  );
}

// ── Mini metric card ──
function MetricCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  const { isDark } = useTheme();
  return (
    <div className={cn(
      "rounded-xl p-3 border",
      isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"
    )}>
      <div className={cn("text-xs font-medium mb-1", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-lg font-bold tabular-nums", accent || (isDark ? "text-white" : "text-slate-900"))}>{value}</span>
        <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{unit}</span>
      </div>
    </div>
  );
}

// ── Vibration device shape ──
interface VibrationDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  ppvMax: number;
  ppvX: number;
  ppvY: number;
  ppvZ: number;
  ppvResultant: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  dominantFreq: number;
  alarmLevel: number;
  ppvSource: string;
  lastSeen: string;
}

// Vibration is more time-critical than noise/dust; use a tighter offline threshold.
const OFFLINE_THRESHOLD_MS = 120 * 1000; // 120s

const num = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function VibrationDashboard() {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState<VibrationDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeRange, setTimeRange] = useState<'12h' | '24h' | '48h' | '3d'>('24h');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Discover vibration devices across all properties
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const properties = await api.getProperties();
        const vd: VibrationDevice[] = [];
        for (const p of properties) {
          try {
            const tel = await api.getPropertyTelemetry(p.id);
            for (const [devEUI, reading] of Object.entries((tel as any).deviceReadings || {})) {
              const dec = (reading as any).decoded || {};
              const isVibration = dec.ppv_max_mm_s !== undefined
                || dec.ppv_x_mm_s !== undefined
                || dec.accel_x_g !== undefined
                || dec.tilt_x_deg !== undefined;
              if (!isVibration) continue;
              const recent = (reading as any).receivedAt
                && (Date.now() - new Date((reading as any).receivedAt).getTime()) < OFFLINE_THRESHOLD_MS;
              vd.push({
                id: devEUI,
                name: (reading as any).deviceName || devEUI,
                location: `${p.name}${p.location ? ' — ' + p.location : ''}`,
                status: recent ? 'online' : 'offline',
                ppvMax: num(dec.ppv_max_mm_s),
                ppvX: num(dec.ppv_x_mm_s),
                ppvY: num(dec.ppv_y_mm_s),
                ppvZ: num(dec.ppv_z_mm_s),
                ppvResultant: num(dec.ppv_resultant_mm_s),
                accelX: num(dec.accel_x_g),
                accelY: num(dec.accel_y_g),
                accelZ: num(dec.accel_z_g),
                tiltX: num(dec.tilt_x_deg),
                tiltY: num(dec.tilt_y_deg),
                tiltZ: num(dec.tilt_z_deg),
                dominantFreq: num(dec.vibration_dominant_freq_hz),
                alarmLevel: num(dec.vibration_alarm_level),
                ppvSource: (dec.ppv_source as string) || 'unknown',
                lastSeen: (reading as any).receivedAt || '',
              });
            }
          } catch { /* skip property */ }
        }
        if (!cancelled) {
          setDevices(vd);
          if (vd.length > 0) setSelectedDevice(vd[0].id);
        }
      } catch (e) { console.warn('[VibrationDashboard]', e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Chart history for selected device
  useEffect(() => {
    if (!selectedDevice) return;
    let cancelled = false;
    setChartLoading(true);
    api.getDeviceHistory(selectedDevice, timeRange)
      .then((res: any) => {
        if (cancelled) return;
        setChartData((res.points || []).map((p: any) => ({
          time: p.timeLabel || new Date(p.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
          ppvMax: p.ppv_max_mm_s,
          ppvX: p.ppv_x_mm_s,
          ppvY: p.ppv_y_mm_s,
          ppvZ: p.ppv_z_mm_s,
        })));
      })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, timeRange]);

  const device = devices.find(d => d.id === selectedDevice) ?? devices[0];
  const status = device ? getVibrationStatus(device.ppvMax || device.ppvResultant) : getVibrationStatus(0);
  const onlineDevices = devices.filter(d => d.status === 'online').length;

  const stats = useMemo(() => {
    const values = chartData.map((d: any) => d.ppvMax).filter((v: any) => v != null && v > 0);
    if (values.length === 0) return { peak: '—', avg: '—', exceedances: 0 };
    return {
      peak: Math.max(...values).toFixed(3),
      avg: (values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(3),
      exceedances: values.filter((v: number) => v >= AAA.alert).length,
    };
  }, [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className={cn("ml-3 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading vibration sensors...</span>
      </div>
    );
  }
  if (!device) {
    return (
      <div className={cn("text-center py-20 px-4", isDark ? "text-slate-400" : "text-slate-500")}>
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <div className="text-base font-medium mb-1">No vibration sensors detected</div>
        <div className="text-sm">
          Connect a BEWIS AS400-4G or compatible accelerometer to start monitoring.<br />
          Once the sensor's first uplink arrives, it will appear here automatically.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={cn("text-xl lg:text-2xl font-bold", isDark ? "text-white" : "text-slate-900")}>
            Vibration Monitoring
          </h2>
          <p className={cn("text-sm mt-0.5", isDark ? "text-slate-400" : "text-slate-500")}>
            Real-time PPV monitoring · BEWIS AS400 / 3-axis MEMS · AAA thresholds
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range */}
          <div className={cn("inline-flex rounded-lg p-0.5 border", isDark ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
            {(['12h', '24h', '48h', '3d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  timeRange === r
                    ? (isDark ? "bg-purple-600 text-white" : "bg-white text-purple-700 shadow-sm")
                    : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                )}
              >{r}</button>
            ))}
          </div>
          {/* Device dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDeviceDropdown(s => !s)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium",
                isDark ? "bg-slate-800 border-slate-700 text-white hover:bg-slate-750" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              <Radio className="h-4 w-4 text-purple-500" />
              <span className="max-w-[160px] truncate">{device.name}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {showDeviceDropdown && (
              <div className={cn(
                "absolute right-0 top-full mt-1 w-72 rounded-lg shadow-lg border z-30",
                isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}>
                <div className="max-h-72 overflow-y-auto py-1">
                  {devices.map(d => (
                    <button
                      key={d.id}
                      onClick={() => { setSelectedDevice(d.id); setShowDeviceDropdown(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-purple-500/10 flex items-center justify-between gap-2",
                        selectedDevice === d.id && (isDark ? "bg-slate-700" : "bg-purple-50")
                      )}
                    >
                      <div className="min-w-0">
                        <div className={cn("text-sm font-medium truncate", isDark ? "text-white" : "text-slate-900")}>{d.name}</div>
                        <div className={cn("text-xs truncate", isDark ? "text-slate-400" : "text-slate-500")}>{d.location}</div>
                      </div>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0",
                        d.status === 'online'
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-slate-500/15 text-slate-500"
                      )}>{d.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top row: gauge + summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gauge */}
        <div className={cn(
          "rounded-xl p-4 lg:p-6 border",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"
        )}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Live PPV</div>
              <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Peak Particle Velocity</div>
            </div>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold",
              device.status === 'online' ? "bg-emerald-500/15 text-emerald-500" : "bg-slate-500/15 text-slate-500"
            )}>● {device.status}</span>
          </div>
          <VibrationGauge value={device.ppvMax || device.ppvResultant} />
          <div className={cn("text-center text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
            Source: <span className="font-mono">{device.ppvSource}</span>
            {device.dominantFreq > 0 && <> · Dom. freq <span className="font-mono">{device.dominantFreq.toFixed(1)} Hz</span></>}
          </div>
        </div>

        {/* Per-axis PPV + summary */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="PPV-X" value={device.ppvX.toFixed(3)} unit="mm/s" accent="text-purple-500" />
          <MetricCard label="PPV-Y" value={device.ppvY.toFixed(3)} unit="mm/s" accent="text-purple-500" />
          <MetricCard label="PPV-Z" value={device.ppvZ.toFixed(3)} unit="mm/s" accent="text-purple-500" />
          <MetricCard label="Accel X" value={device.accelX.toFixed(4)} unit="g" />
          <MetricCard label="Accel Y" value={device.accelY.toFixed(4)} unit="g" />
          <MetricCard label="Accel Z" value={device.accelZ.toFixed(4)} unit="g" />
          <MetricCard label="Tilt X" value={device.tiltX.toFixed(2)} unit="°" />
          <MetricCard label="Tilt Y" value={device.tiltY.toFixed(2)} unit="°" />
          <MetricCard label="Tilt Z" value={device.tiltZ.toFixed(2)} unit="°" />
        </div>
      </div>

      {/* AAA threshold reference + period stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-amber-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Alert</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.alert} mm/s</div>
          </div>
        </div>
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-orange-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Alarm</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.alarm} mm/s</div>
          </div>
        </div>
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-red-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Action</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.action} mm/s</div>
          </div>
        </div>
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <Zap className={cn("h-8 w-8", stats.exceedances > 0 ? "text-amber-500" : "text-emerald-500")} />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Exceedances ({timeRange})</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{stats.exceedances}</div>
          </div>
        </div>
      </div>

      {/* PPV time series */}
      <div className={cn(
        "rounded-xl p-4 lg:p-6 border",
        isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>PPV Time Series</div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
              Peak {stats.peak} · Avg {stats.avg} mm/s · {chartData.length} points
            </div>
          </div>
          {chartLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
        </div>
        <SafeChartContainer height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ppvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
            <XAxis dataKey="time" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
            <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} domain={[0, (dataMax: number) => Math.max(dataMax * 1.2, AAA.action * 1.2)]} />
            <Tooltip contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={AAA.alert} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Alert', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
            <ReferenceLine y={AAA.alarm} stroke="#f97316" strokeDasharray="3 3" label={{ value: 'Alarm', fill: '#f97316', fontSize: 10, position: 'right' }} />
            <ReferenceLine y={AAA.action} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Action', fill: '#ef4444', fontSize: 10, position: 'right' }} />
            <Area type="monotone" dataKey="ppvMax" name="PPV max" stroke="#8b5cf6" strokeWidth={2} fill="url(#ppvFill)" />
          </AreaChart>
        </SafeChartContainer>
      </div>

      {/* Footer info */}
      <div className={cn("rounded-xl p-3 border text-xs flex items-start gap-2",
        isDark ? "bg-slate-800/30 border-slate-700 text-slate-400" : "bg-blue-50/50 border-blue-100 text-slate-600")}>
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          AAA thresholds shown are the Lai King Hospital reference values (0.075 / 0.15 / 0.30 mm/s PPV).
          Per-property override, sensor grouping, alarm dedupe and notifications are coming in Phase 2.
          {onlineDevices < devices.length && (
            <> · <span className="text-amber-500 font-medium">{devices.length - onlineDevices} offline</span> (no data &gt; 120s)</>
          )}
        </div>
      </div>
    </div>
  );
}

export default VibrationDashboard;
