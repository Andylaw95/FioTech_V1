import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { useTheme } from '@/app/utils/ThemeContext';
import {
  Activity, AlertTriangle, ChevronDown, Radio, Loader2, Gauge, Zap, RefreshCw, Clock, Waves,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '@/app/utils/api';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ── AAA threshold defaults (Lai King Hospital reference, displayed in μm/s PPV) ──
// API/storage fields stay in mm/s; the dashboard converts PPV display values ×1000.
const AAA = { alert: 75, alarm: 150, action: 300 };
const PPV_DISPLAY_SCALE = 1000;
const LIVE_REFRESH_MS = 10_000;

// Adaptive gauge max — keeps small-amplitude readings legible
function gaugeMaxFor(value: number): number {
  if (value >= 300) return 500;  // beyond Action band
  if (value >= 150) return 400;  // Alarm
  if (value >= 50) return 200;   // Alert range
  return 100;                    // Quiet — zoom in
}

// ── Vibration status classification ──
function getVibrationStatus(ppv: number) {
  if (ppv >= AAA.action) return { label: 'Action', color: 'red',     ring: '#ef4444', bg: 'bg-red-500'     };
  if (ppv >= AAA.alarm)  return { label: 'Alarm',  color: 'orange',  ring: '#f97316', bg: 'bg-orange-500'  };
  if (ppv >= AAA.alert)  return { label: 'Alert',  color: 'amber',   ring: '#f59e0b', bg: 'bg-amber-500'   };
  return                       { label: 'Normal', color: 'emerald', ring: '#10b981', bg: 'bg-emerald-500' };
}

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 5_000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// ── Arc gauge SVG ──
function VibrationGauge({ value, size = 220 }: { value: number; size?: number }) {
  const status = getVibrationStatus(value);
  const max = gaugeMaxFor(value);
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

  // Only render threshold ticks that fall within current gauge max
  const candidates = [0, AAA.alert, AAA.alarm, AAA.action, max];
  const ticks = Array.from(new Set(candidates.filter(t => t <= max)));
  const tickColor = (t: number) => {
    if (t >= AAA.action) return '#ef4444';
    if (t >= AAA.alarm) return '#f97316';
    if (t >= AAA.alert) return '#f59e0b';
    return '#10b981';
  };

  // Threshold band stops, clamped to current max
  const stop = (v: number) => startAngle + (Math.min(v, max) / max) * totalAngle;

  return (
    <svg className="w-full h-auto max-w-[280px] mx-auto" viewBox={`0 0 ${size} ${size}`}>
      <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      <path d={arcPath(startAngle, stop(AAA.alert))} fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      <path d={arcPath(stop(AAA.alert), stop(AAA.alarm))} fill="none" stroke="#f59e0b" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(stop(AAA.alarm), stop(AAA.action))} fill="none" stroke="#f97316" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(stop(AAA.action), endAngle)} fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      <path d={arcPath(startAngle, valueAngle)} fill="none" stroke={status.ring} strokeWidth="14" strokeLinecap="round" />
      {ticks.map(t => {
        const angle = startAngle + (t / max) * totalAngle;
        const inner = polarToCartesian(angle);
        const outer = { x: cx + (r + 16) * Math.cos((angle * Math.PI) / 180), y: cy + (r + 16) * Math.sin((angle * Math.PI) / 180) };
        return (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={cx + (r - 8) * Math.cos((angle * Math.PI) / 180)} y2={cy + (r - 8) * Math.sin((angle * Math.PI) / 180)} stroke={tickColor(t)} strokeWidth="2" />
            <text x={outer.x} y={outer.y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#94a3b8" fontWeight="600">{t.toFixed(0)}</text>
          </g>
        );
      })}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="36" fontWeight="700" fill={status.ring}>{value < 100 ? value.toFixed(1) : value.toFixed(0)}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="14" fontWeight="500" fill="#94a3b8">μm/s PPV</text>
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
  status: string;
  ppvMax: number;
  ppvX: number | null;
  ppvY: number | null;
  ppvZ: number | null;
  ppvResultant: number;
  accelX: number | null;
  accelY: number | null;
  accelZ: number | null;
  accelRms: number | null;
  tiltX: number | null;
  tiltY: number | null;
  tiltZ: number | null;
  dominantFreq: number;
  alarmLevel: number;
  ppvSource: string;
  sampleCount: number;
  lastSeen: string;
}

const num = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ppvUm = (v: any): number => num(v) * PPV_DISPLAY_SCALE;
const ppvUmOrNull = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v * PPV_DISPLAY_SCALE : null);
const fmt = (v: number | null, digits: number) => (v == null ? 'N/A' : v.toFixed(digits));

function isVibrationDeviceRecord(device: any, decoded: Record<string, any>): boolean {
  const text = `${device.type || ''} ${device.name || ''} ${device.model || ''} ${device.manufacturer || ''}`.toLowerCase();
  return text.includes('vibration')
    || text.includes('accelerometer')
    || text.includes('as400')
    || text.includes('as-400')
    || text.includes('bewis')
    || decoded.ppv_max_mm_s !== undefined
    || decoded.ppv_resultant_mm_s !== undefined
    || decoded.ppv_x_mm_s !== undefined
    || decoded.accel_x_g !== undefined
    || decoded.tilt_x_deg !== undefined;
}

function normalizeNovoxAs400Decoded(device: any, decoded: Record<string, any>): Record<string, any> {
  const text = `${device.id || ''} ${device.name || ''} ${device.type || ''} ${device.model || ''} ${device.manufacturer || ''}`.toUpperCase();
  const rawPeak = decoded.ppv_raw_peak;
  const ppvMax = decoded.ppv_max_mm_s;
  const alreadyNormalized = decoded.ppv_raw_unit_um_s === 1 || decoded.ppv_unit_normalized_from === 'novox_decimal_um_s';
  const isAs400 = /AS400|AS-400|BEWIS|BWS400|VIBRATION/.test(text);
  if (!isAs400 || alreadyNormalized || typeof rawPeak !== 'number' || typeof ppvMax !== 'number') return decoded;
  if (rawPeak <= 0 || rawPeak >= 10 || Math.abs(Math.abs(rawPeak) - Math.abs(ppvMax)) >= 0.0001) return decoded;

  const fixed = { ...decoded };
  for (const key of ['ppv_max_mm_s', 'ppv_resultant_mm_s', 'ppv_avg_mm_s', 'ppv_min_mm_s', 'ppv_rms_mm_s', 'ppv_x_mm_s', 'ppv_y_mm_s', 'ppv_z_mm_s']) {
    if (typeof fixed[key] === 'number' && Number.isFinite(fixed[key])) fixed[key] = fixed[key] / 1000;
  }
  fixed.ppv_raw_unit_um_s = 1;
  fixed.ppv_unit_normalized_from = 'novox_decimal_um_s_client';
  const fixedPpv = fixed.ppv_max_mm_s ?? fixed.ppv_resultant_mm_s;
  if (typeof fixedPpv === 'number') fixed.vibration_alarm_level = fixedPpv >= 0.30 ? 3 : fixedPpv >= 0.15 ? 2 : fixedPpv >= 0.075 ? 1 : 0;
  return fixed;
}

export function VibrationDashboard() {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState<VibrationDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeRange, setTimeRange] = useState<'12h' | '24h' | '48h' | '3d'>('3d');
  const [chartMode, setChartMode] = useState<'ppvMax' | 'ppvAxes' | 'accel'>('ppvMax');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Use the same latest device records shown in Devices, so live data/status stay consistent.
  const refreshDevices = useCallback(async () => {
    try {
      setRefreshing(true);
      const deviceRows = await api.getDevices();
      const vd: VibrationDevice[] = deviceRows.flatMap((d: any) => {
        const dec = normalizeNovoxAs400Decoded(d, d.decoded || {});
        if (!isVibrationDeviceRecord(d, dec)) return [];
        const deviceKey = d.devEui || d.serialNumber || d.id;
        return [{
          id: deviceKey,
          name: d.name || deviceKey,
          location: [d.building, d.location].filter(Boolean).join(' — ') || 'Unassigned',
          status: d.status || 'offline',
          ppvMax: ppvUm(dec.ppv_max_mm_s ?? dec.ppv_resultant_mm_s),
          ppvX: ppvUmOrNull(dec.ppv_x_mm_s),
          ppvY: ppvUmOrNull(dec.ppv_y_mm_s),
          ppvZ: ppvUmOrNull(dec.ppv_z_mm_s),
          ppvResultant: ppvUm(dec.ppv_resultant_mm_s ?? dec.ppv_max_mm_s),
          accelX: numOrNull(dec.accel_x_g),
          accelY: numOrNull(dec.accel_y_g),
          accelZ: numOrNull(dec.accel_z_g),
          accelRms: numOrNull(dec.accel_rms_g),
          tiltX: numOrNull(dec.tilt_x_deg),
          tiltY: numOrNull(dec.tilt_y_deg),
          tiltZ: numOrNull(dec.tilt_z_deg),
          dominantFreq: num(dec.vibration_dominant_freq_hz),
          alarmLevel: num(dec.vibration_alarm_level),
          ppvSource: (dec.ppv_source as string) || 'unknown',
          sampleCount: num(dec.sample_count),
          lastSeen: d.decodedAt || d.lastSeen || d.lastUpdate || '',
        }];
      });
      setDevices(vd);
      setLastRefresh(Date.now());
      // Keep current selection if still present, otherwise pick first
      setSelectedDevice(prev => (vd.some(d => d.id === prev) ? prev : (vd[0]?.id ?? '')));
    } catch (e) {
      console.warn('[VibrationDashboard]', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshDevices();
    const id = window.setInterval(() => { if (!cancelled) void refreshDevices(); }, LIVE_REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [refreshDevices]);

  // Chart history for selected device — also auto-refresh on tick
  useEffect(() => {
    if (!selectedDevice) return;
    let cancelled = false;
    setChartLoading(true);
    api.getDeviceHistory(selectedDevice, timeRange)
      .then((res: any) => {
        if (cancelled) return;
        setChartData((res.points || []).map((p: any) => ({
          time: p.timeLabel || new Date(p.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          ppvMax: ppvUmOrNull(p.ppv_max_mm_s) ?? ppvUmOrNull(p.ppv_resultant_mm_s),
          ppvX: ppvUmOrNull(p.ppv_x_mm_s),
          ppvY: ppvUmOrNull(p.ppv_y_mm_s),
          ppvZ: ppvUmOrNull(p.ppv_z_mm_s),
          accelX: p.accel_x_g,
          accelY: p.accel_y_g,
          accelZ: p.accel_z_g,
        })));
      })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, timeRange, lastRefresh]);

  const device = devices.find(d => d.id === selectedDevice) ?? devices[0];
  const isSingleChannel = !!device && device.ppvMax > 0 && device.ppvX == null && device.ppvY == null && device.ppvZ == null;
  const status = device ? getVibrationStatus(device.ppvMax || device.ppvResultant) : getVibrationStatus(0);
  const onlineDevices = devices.filter(d => d.status === 'online').length;

  const stats = useMemo(() => {
    const values = chartData.map((d: any) => d.ppvMax).filter((v: any) => v != null && v > 0);
    if (values.length === 0) return { peak: '—', avg: '—', exceedances: 0 };
    return {
      peak: Math.max(...values).toFixed(1),
      avg: (values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(1),
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
            Demo idle mode · 10s latest refresh · 30s history sample · 3-day retention
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Manual refresh */}
          <button
            onClick={() => void refreshDevices()}
            disabled={refreshing}
             title={`Last refresh ${relativeTime(new Date(lastRefresh).toISOString())} · auto every 10s`}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium",
              isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
              refreshing && "opacity-60 cursor-wait"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
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
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                device.ppvSource === 'device'
                  ? "bg-emerald-500/15 text-emerald-500"
                  : device.ppvSource === 'edge_estimated'
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-slate-500/15 text-slate-500"
              )}>
                PPV: {device.ppvSource === 'device' ? 'on-device' : device.ppvSource === 'edge_estimated' ? 'edge est.' : device.ppvSource}
              </span>
              {device.dominantFreq > 0 && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1",
                  isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                )}>
                  <Waves className="h-3 w-3" /> {device.dominantFreq.toFixed(1)} Hz
                </span>
              )}
              {device.sampleCount > 0 && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                  isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                )}>
                  n={device.sampleCount}
                </span>
              )}
            </div>
            <div className={cn("flex items-center gap-1 text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>
              <Clock className="h-3 w-3" /> Last seen {relativeTime(device.lastSeen)}
            </div>
          </div>
        </div>

        {/* Per-axis PPV + summary */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="PPV-X" value={fmt(device.ppvX, 1)} unit={device.ppvX == null ? '' : 'μm/s'} accent="text-purple-500" />
          <MetricCard label="PPV-Y" value={fmt(device.ppvY, 1)} unit={device.ppvY == null ? '' : 'μm/s'} accent="text-purple-500" />
          <MetricCard label="PPV-Z" value={fmt(device.ppvZ, 1)} unit={device.ppvZ == null ? '' : 'μm/s'} accent="text-purple-500" />
          <MetricCard label="Accel X" value={fmt(device.accelX, 4)} unit={device.accelX == null ? '' : 'g'} />
          <MetricCard label="Accel Y" value={fmt(device.accelY, 4)} unit={device.accelY == null ? '' : 'g'} />
          <MetricCard label="Accel Z" value={fmt(device.accelZ, 4)} unit={device.accelZ == null ? '' : 'g'} />
          <MetricCard label="Tilt X" value={fmt(device.tiltX, 2)} unit={device.tiltX == null ? '' : '°'} />
          <MetricCard label="Tilt Y" value={fmt(device.tiltY, 2)} unit={device.tiltY == null ? '' : '°'} />
          <MetricCard label="Tilt Z" value={fmt(device.tiltZ, 2)} unit={device.tiltZ == null ? '' : '°'} />
          <MetricCard label="PPV resultant" value={device.ppvResultant.toFixed(1)} unit="μm/s" accent="text-fuchsia-500" />
          <MetricCard label="Accel RMS" value={fmt(device.accelRms, 4)} unit={device.accelRms == null ? '' : 'g'} />
          <MetricCard label="Dom. Freq" value={device.dominantFreq > 0 ? device.dominantFreq.toFixed(1) : '—'} unit="Hz" />
        </div>
      </div>
      {isSingleChannel && (
        <div className={cn(
          "rounded-xl border px-4 py-3 text-sm",
          isDark ? "bg-purple-950/20 border-purple-900/40 text-purple-200" : "bg-purple-50 border-purple-100 text-purple-700"
        )}>
          This NOVOX AS400 demo unit streams single-channel resultant PPV only; per-axis PPV, acceleration and tilt are unavailable for this firmware.
        </div>
      )}

      {/* AAA threshold reference + period stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-amber-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Alert</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.alert} μm/s</div>
          </div>
        </div>
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-orange-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Alarm</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.alarm} μm/s</div>
          </div>
        </div>
        <div className={cn("rounded-xl p-3 border flex items-center gap-3",
          isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200")}>
          <div className="w-2 h-10 rounded-full bg-red-500" />
          <div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Action</div>
            <div className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{AAA.action} μm/s</div>
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

      {/* Time series chart with mode toggle */}
      <div className={cn(
        "rounded-xl p-4 lg:p-6 border",
        isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
              {chartMode === 'accel' ? 'Acceleration Time Series' : chartMode === 'ppvAxes' ? 'Per-Axis PPV Time Series' : 'PPV Time Series'}
            </div>
            <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
              Peak {stats.peak} · Avg {stats.avg} μm/s · {chartData.length} points · {timeRange}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {chartLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
            <div className={cn("inline-flex rounded-lg p-0.5 border", isDark ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
              {([
                { k: 'ppvMax',  label: 'PPV-Max' },
                { k: 'ppvAxes', label: 'X / Y / Z' },
                { k: 'accel',   label: 'Accel (g)' },
              ] as const).map(opt => (
                <button
                  key={opt.k}
                  onClick={() => setChartMode(opt.k)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                    chartMode === opt.k
                      ? (isDark ? "bg-purple-600 text-white" : "bg-white text-purple-700 shadow-sm")
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  )}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>

        {chartData.length === 0 && !chartLoading ? (
          <div className={cn(
            "h-[300px] rounded-lg border border-dashed flex flex-col items-center justify-center text-center px-6",
            isDark ? "border-slate-700 bg-slate-900/30 text-slate-400" : "border-slate-200 bg-slate-50/50 text-slate-500"
          )}>
            <Activity className="h-10 w-10 opacity-30 mb-2" />
            <div className="text-sm font-medium">No history yet</div>
            <div className="text-xs mt-1 max-w-md">
              Demo mode stores one history point every ~30&nbsp;s for 3 days. Time-series will populate after
              the next stored sample. Live values above refresh every 10&nbsp;s.
            </div>
          </div>
        ) : chartMode === 'ppvAxes' && isSingleChannel ? (
          <div className={cn(
            "h-[300px] rounded-lg border border-dashed flex flex-col items-center justify-center text-center px-6",
            isDark ? "border-slate-700 bg-slate-900/30 text-slate-400" : "border-slate-200 bg-slate-50/50 text-slate-500"
          )}>
            <Activity className="h-10 w-10 opacity-30 mb-2" />
            <div className="text-sm font-medium">Per-axis data unavailable</div>
            <div className="text-xs mt-1 max-w-md">
              This AS400 CSV firmware reports a single resultant PPV channel. Use PPV-Max for the live compliance trend.
            </div>
          </div>
        ) : (
          <SafeChartContainer className="h-[300px]">
            {chartMode === 'ppvMax' ? (
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
                <Area type="monotone" dataKey="ppvMax" name="PPV max (μm/s)" stroke="#8b5cf6" strokeWidth={2} fill="url(#ppvFill)" connectNulls />
              </AreaChart>
            ) : chartMode === 'ppvAxes' ? (
              <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="time" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
                <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} domain={[0, (dataMax: number) => Math.max(dataMax * 1.2, AAA.action * 1.2)]} />
                <Tooltip contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={AAA.alert} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine y={AAA.alarm} stroke="#f97316" strokeDasharray="3 3" />
                <ReferenceLine y={AAA.action} stroke="#ef4444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="ppvX" name="PPV-X" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="ppvY" name="PPV-Y" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="ppvZ" name="PPV-Z" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="time" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
                <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
                <Tooltip contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="accelX" name="Accel-X (g)" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="accelY" name="Accel-Y (g)" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="accelZ" name="Accel-Z (g)" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            )}
          </SafeChartContainer>
        )}
      </div>

      {/* Footer info */}
      <div className={cn("rounded-xl p-3 border text-xs flex items-start gap-2",
        isDark ? "bg-slate-800/30 border-slate-700 text-slate-400" : "bg-blue-50/50 border-blue-100 text-slate-600")}>
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          AAA thresholds shown are the Lai King Hospital reference values (75 / 150 / 300 μm/s PPV).
          Current demo profile keeps 10s latest values and 30s sampled history for 3 days on the Free-plan preview.
          {onlineDevices < devices.length && (
            <> · <span className="text-amber-500 font-medium">{devices.length - onlineDevices} offline</span> (no data &gt; 120s)</>
          )}
        </div>
      </div>
    </div>
  );
}

export default VibrationDashboard;
