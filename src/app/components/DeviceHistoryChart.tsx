import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';
import { SafeChartContainer } from './SafeChartContainer';
import { Loader2, Droplets, Wind, Thermometer, Shield, Activity, Zap, Volume2 } from 'lucide-react';
import { api, type DeviceHistoryPoint, type DeviceHistoryResponse } from '@/app/utils/api';
import { clsx } from 'clsx';

// ── Format ISO time to local HH:mm ──────────────────────
function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return iso; }
}

function formatLocalDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

// ── Metric definitions ───────────────────────────────────
interface MetricDef {
  key: keyof DeviceHistoryPoint;
  label: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  description: string;
  domain?: [number, number];
  referenceLines?: { y: number; color: string; label: string }[];
  referenceAreas?: { y1: number; y2: number; color: string; opacity: number }[];
  chartType?: 'area' | 'line' | 'bar';
  // Optional display scale factor: stored value × scale = displayed value.
  // E.g. PPV is stored in mm/s but shown in μm/s (× 1000).
  // referenceLines / referenceAreas / domain values are interpreted in the
  // DISPLAYED unit (already scaled).
  scale?: number;
}

const METRICS: MetricDef[] = [
  {
    key: 'co2', label: 'CO₂', unit: 'ppm', icon: Wind, color: '#10b981',
    description: 'Air quality — lower is better',
    referenceLines: [
      { y: 600, color: '#f59e0b', label: '600 ppm' },
      { y: 800, color: '#ef4444', label: '800 ppm' },
    ],
    referenceAreas: [
      { y1: 0, y2: 600, color: '#dcfce7', opacity: 0.3 },
      { y1: 600, y2: 800, color: '#fef9c3', opacity: 0.3 },
      { y1: 800, y2: 2000, color: '#fee2e2', opacity: 0.3 },
    ],
  },
  {
    key: 'temperature', label: 'Temperature', unit: '°C', icon: Thermometer, color: '#f59e0b',
    description: 'Ambient temperature with comfort zone (20–25 °C)',
    referenceAreas: [{ y1: 20, y2: 25, color: '#dbeafe', opacity: 0.35 }],
    chartType: 'line',
  },
  {
    key: 'humidity', label: 'Humidity', unit: '%', icon: Droplets, color: '#3b82f6',
    description: 'Relative humidity level',
    referenceAreas: [{ y1: 40, y2: 60, color: '#dbeafe', opacity: 0.25 }],
  },
  {
    key: 'tvoc', label: 'TVOC', unit: 'ppb', icon: Wind, color: '#8b5cf6',
    description: 'Total volatile organic compounds',
    referenceLines: [{ y: 500, color: '#f59e0b', label: '500 ppb' }],
  },
  {
    key: 'pm2_5', label: 'PM2.5', unit: 'μg/m³', icon: Shield, color: '#64748b',
    description: 'Fine particle concentration',
    referenceLines: [{ y: 25, color: '#ef4444', label: '25 μg/m³' }],
  },
  {
    key: 'pm10', label: 'PM10', unit: 'μg/m³', icon: Shield, color: '#78716c',
    description: 'Coarse particle concentration',
    referenceLines: [{ y: 50, color: '#ef4444', label: '50 μg/m³' }],
  },
  {
    key: 'pressure', label: 'Pressure', unit: 'hPa', icon: Activity, color: '#06b6d4',
    description: 'Barometric pressure', chartType: 'line',
  },
  {
    key: 'illuminance', label: 'Light', unit: 'lux', icon: Zap, color: '#eab308',
    description: 'Illuminance level',
  },
  {
    key: 'battery', label: 'Battery', unit: '%', icon: Activity, color: '#22c55e',
    description: 'Device battery level', chartType: 'line',
    domain: [0, 100],
  },
  {
    key: 'sound_level_leq', label: 'Sound Leq', unit: 'dB', icon: Volume2, color: '#8b5cf6',
    description: 'Equivalent continuous sound level',
    referenceLines: [{ y: 70, color: '#f59e0b', label: '70 dB' }, { y: 85, color: '#ef4444', label: '85 dB' }],
    referenceAreas: [
      { y1: 0, y2: 55, color: '#dcfce7', opacity: 0.3 },
      { y1: 55, y2: 70, color: '#fef9c3', opacity: 0.3 },
      { y1: 70, y2: 120, color: '#fee2e2', opacity: 0.3 },
    ],
  },
  {
    key: 'sound_level_lmax', label: 'Sound Lmax', unit: 'dB', icon: Volume2, color: '#a855f7',
    description: 'Maximum sound level',
  },
  {
    key: 'sound_level_lmin', label: 'Sound Lmin', unit: 'dB', icon: Volume2, color: '#c084fc',
    description: 'Minimum sound level',
  },
  // ── Vibration (BEWIS AS400 PPV) ───────────────────────
  // Stored as mm/s; displayed as μm/s (× 1000) since hospital/sensitive-equipment
  // thresholds (Lai King AAA = 75/150/300 μm/s) sit in VC-curve territory.
  {
    key: 'ppv_max_mm_s', label: 'PPV Max', unit: 'μm/s', icon: Activity, color: '#a855f7',
    description: 'Peak Particle Velocity (max axis) — AAA: Alert 75 / Alarm 150 / Action 300 μm/s',
    scale: 1000,
    referenceLines: [
      { y: 75, color: '#facc15', label: 'Alert 75' },
      { y: 150, color: '#f97316', label: 'Alarm 150' },
      { y: 300, color: '#ef4444', label: 'Action 300' },
    ],
    referenceAreas: [
      { y1: 0, y2: 75, color: '#dcfce7', opacity: 0.3 },
      { y1: 75, y2: 150, color: '#fef9c3', opacity: 0.3 },
      { y1: 150, y2: 300, color: '#ffedd5', opacity: 0.3 },
      { y1: 300, y2: 5000, color: '#fee2e2', opacity: 0.3 },
    ],
  },
  {
    key: 'ppv_resultant_mm_s', label: 'PPV Resultant', unit: 'μm/s', icon: Activity, color: '#ec4899',
    description: 'Resultant PPV — sqrt(x² + y² + z²)',
    scale: 1000,
  },
  {
    key: 'ppv_x_mm_s', label: 'PPV X', unit: 'μm/s', icon: Activity, color: '#a855f7',
    description: 'PPV on X axis', chartType: 'line', scale: 1000,
  },
  {
    key: 'ppv_y_mm_s', label: 'PPV Y', unit: 'μm/s', icon: Activity, color: '#06b6d4',
    description: 'PPV on Y axis', chartType: 'line', scale: 1000,
  },
  {
    key: 'ppv_z_mm_s', label: 'PPV Z', unit: 'μm/s', icon: Activity, color: '#f43f5e',
    description: 'PPV on Z axis', chartType: 'line', scale: 1000,
  },
  {
    key: 'tilt_x_deg', label: 'Tilt X', unit: '°', icon: Activity, color: '#a855f7',
    description: 'Tilt angle X', chartType: 'line',
  },
  {
    key: 'tilt_y_deg', label: 'Tilt Y', unit: '°', icon: Activity, color: '#06b6d4',
    description: 'Tilt angle Y', chartType: 'line',
  },
  {
    key: 'tilt_z_deg', label: 'Tilt Z', unit: '°', icon: Activity, color: '#f43f5e',
    description: 'Tilt angle Z', chartType: 'line',
  },
];

// ── Exported mapping: reading label → metric key ─────────
// Used by PropertyDevicePanel to map live reading labels to chart metric keys
export const LABEL_TO_METRIC_KEY: Record<string, string> = {
  'Temperature': 'temperature',
  'Temp': 'temperature',
  'Humidity': 'humidity',
  'CO₂': 'co2',
  'CO2': 'co2',
  'TVOC': 'tvoc',
  'PM2.5': 'pm2_5',
  'PM10': 'pm10',
  'Pressure': 'pressure',
  'Light': 'illuminance',
  'PIR': 'pir',
  'Sound Leq': 'sound_level_leq',
  'Sound Lmax': 'sound_level_lmax',
  'Sound Lmin': 'sound_level_lmin',
  'Leq': 'sound_level_leq',
  'Noise': 'sound_level_leq',
  'PPV': 'ppv_max_mm_s',
  'PPV Max': 'ppv_max_mm_s',
  'PPV Resultant': 'ppv_resultant_mm_s',
  'PPV X': 'ppv_x_mm_s',
  'PPV Y': 'ppv_y_mm_s',
  'PPV Z': 'ppv_z_mm_s',
  'Tilt X': 'tilt_x_deg',
  'Tilt Y': 'tilt_y_deg',
  'Tilt Z': 'tilt_z_deg',
  'Battery': 'battery',
};

// Map device types to preferred metrics
const TYPE_METRIC_PRIORITY: Record<string, string[]> = {
  IAQ:         ['co2', 'tvoc', 'pm2_5', 'pm10', 'temperature', 'humidity', 'pressure', 'illuminance', 'battery'],
  Temperature: ['temperature', 'humidity', 'co2', 'pressure', 'battery'],
  Noise:       ['sound_level_leq', 'sound_level_lmax', 'sound_level_lmin', 'battery'],
  'Sound Level Sensor': ['sound_level_leq', 'sound_level_lmax', 'sound_level_lmin', 'battery'],
  Leakage:     ['temperature', 'humidity', 'battery'],
  'Water Leakage Sensor': ['temperature', 'humidity', 'battery'],
  'Environment Sensor': ['co2', 'tvoc', 'pm2_5', 'pm10', 'temperature', 'humidity', 'pressure', 'illuminance', 'battery'],
  Smoke:       ['pm2_5', 'pm10', 'co2', 'temperature', 'battery'],
  Fire:        ['temperature', 'humidity', 'co2', 'battery'],
  'Door/Window Sensor': ['battery'],
  Vibration:            ['ppv_max_mm_s', 'ppv_resultant_mm_s', 'ppv_x_mm_s', 'ppv_y_mm_s', 'ppv_z_mm_s', 'tilt_x_deg', 'tilt_y_deg', 'tilt_z_deg', 'battery'],
  'Vibration Sensor':   ['ppv_max_mm_s', 'ppv_resultant_mm_s', 'ppv_x_mm_s', 'ppv_y_mm_s', 'ppv_z_mm_s', 'tilt_x_deg', 'tilt_y_deg', 'tilt_z_deg', 'battery'],
  Accelerometer:        ['ppv_max_mm_s', 'ppv_resultant_mm_s', 'ppv_x_mm_s', 'ppv_y_mm_s', 'ppv_z_mm_s', 'tilt_x_deg', 'tilt_y_deg', 'tilt_z_deg', 'battery'],
  AS400:                ['ppv_max_mm_s', 'ppv_resultant_mm_s', 'ppv_x_mm_s', 'ppv_y_mm_s', 'ppv_z_mm_s', 'tilt_x_deg', 'tilt_y_deg', 'tilt_z_deg', 'battery'],
};

// ── Tooltip styles ───────────────────────────────────────
const tooltipStyle = {
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 13,
};

function metricDisplayValue(metric: MetricDef, raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw * (metric.scale ?? 1) : null;
}

// ── Custom tooltip that shows local date + time ──────────
function ChartTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const v = payload[0]?.value;
  return (
    <div style={tooltipStyle} className="bg-white px-3 py-2">
      <p className="text-xs text-slate-500 mb-1">{point?.localDate} {point?.localTime}</p>
      <p className="text-sm font-semibold" style={{ color: metric?.color }}>
        {typeof v === 'number' ? v.toFixed(1) : v} {metric?.unit}
      </p>
    </div>
  );
}

// ── Generic metric chart (uses local time formatting) ────
function MetricChart({ data, metric, period = '24h' }: { data: DeviceHistoryPoint[]; metric: MetricDef; period?: string }) {
  const values = data
    .map((d) => metricDisplayValue(metric, d[metric.key]))
    .filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max((maxV - minV) * 0.15, 1);
  const domain = metric.domain || [Math.floor(minV - pad), Math.ceil(maxV + pad)];
  const chartType = metric.chartType || 'area';
  const isLongPeriod = period === '3d' || period === '7d' || period === '30d';

  // Format time labels in the browser's LOCAL timezone
  const chartData = data
    .filter((d) => metricDisplayValue(metric, d[metric.key]) != null)
    .map((d) => ({
      localTime: formatLocalTime(d.time),
      localDate: formatLocalDate(d.time),
      time: isLongPeriod ? `${formatLocalDate(d.time)} ${formatLocalTime(d.time)}` : formatLocalTime(d.time),
      value: metricDisplayValue(metric, d[metric.key]),
    }));

  const tooltipContent = <ChartTooltip metric={metric} />;

  if (chartType === 'line') {
    return (
      <SafeChartContainer debounce={200}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} />
          <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
          {metric.referenceAreas?.map((ra, i) => (
            <ReferenceArea key={i} y1={ra.y1} y2={ra.y2} fill={ra.color} fillOpacity={ra.opacity} />
          ))}
          {metric.referenceLines?.map((rl, i) => (
            <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="4 4" strokeWidth={1}
              label={{ value: rl.label, position: 'right', fill: rl.color, fontSize: 11 }} />
          ))}
          <Tooltip content={tooltipContent} />
          <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2.5}
            dot={{ r: 3, fill: metric.color, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }} />
        </LineChart>
      </SafeChartContainer>
    );
  }

  if (chartType === 'bar') {
    return (
      <SafeChartContainer debounce={200}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} />
          <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
          {metric.referenceLines?.map((rl, i) => (
            <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="4 4" strokeWidth={1}
              label={{ value: rl.label, position: 'right', fill: rl.color, fontSize: 11 }} />
          ))}
          <Tooltip content={tooltipContent} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={14} fill={metric.color} />
        </BarChart>
      </SafeChartContainer>
    );
  }

  // Default: area chart
  const gradientId = `grad-${metric.key}`;
  return (
    <SafeChartContainer debounce={200}>
      <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={metric.color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={metric.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} />
        <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
        {metric.referenceAreas?.map((ra, i) => (
          <ReferenceArea key={i} y1={ra.y1} y2={ra.y2} fill={ra.color} fillOpacity={ra.opacity} />
        ))}
        {metric.referenceLines?.map((rl, i) => (
          <ReferenceLine key={i} y={rl.y} stroke={rl.color} strokeDasharray="4 4" strokeWidth={1}
            label={{ value: rl.label, position: 'right', fill: rl.color, fontSize: 11 }} />
        ))}
        <Tooltip content={tooltipContent} />
        <Area type="monotone" dataKey="value" stroke={metric.color} strokeWidth={2.5}
          fill={`url(#${gradientId})`} dot={false}
          activeDot={{ r: 5, fill: metric.color, stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </SafeChartContainer>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN EXPORT — Full-size chart with clickable metric cards
// ══════════════════════════════════════════════════════════
interface DeviceHistoryChartProps {
  deviceId: string;
  deviceType: string;
  devEui?: string;
  /** External control: set which metric to show (e.g. from clicking a live sensor reading box) */
  focusMetric?: string;
  /** Hide the built-in metric selector cards (when parent already provides a selector, e.g. Live Sensor Readings) */
  hideMetricCards?: boolean;
  /** Time period for history data: '12h' | '24h' | '48h' | '3d' */
  period?: string;
  /** Compact layout for narrow panels (e.g. side inspector) */
  compact?: boolean;
}

export function DeviceHistoryChart({ deviceId, deviceType, devEui, focusMetric, hideMetricCards, period = '24h', compact }: DeviceHistoryChartProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DeviceHistoryPoint[]>([]);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    if (!devEui) {
      setLoading(false);
      setError('No devEui — cannot fetch sensor history.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res: DeviceHistoryResponse = await api.getDeviceHistory(devEui, period);
      setData(res.points || []);
    } catch (e: any) {
      console.error('Failed to fetch device history:', e);
      setError(e?.message || 'Failed to load sensor history.');
    } finally {
      setLoading(false);
    }
  }, [devEui, period]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Determine which metrics have data
  const availableMetrics = useMemo(() => {
    if (data.length === 0) return [];
    return METRICS.filter((m) => data.some((d) => d[m.key] != null));
  }, [data]);

  // Sort by device type priority
  const sortedMetrics = useMemo(() => {
    const priority = TYPE_METRIC_PRIORITY[deviceType] || TYPE_METRIC_PRIORITY.IAQ;
    return [...availableMetrics].sort((a, b) => {
      const aIdx = priority.indexOf(a.key as string);
      const bIdx = priority.indexOf(b.key as string);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [availableMetrics, deviceType]);

  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('');

  // Auto-select the first metric when data loads, or follow focusMetric
  useEffect(() => {
    if (focusMetric && sortedMetrics.find(m => m.key === focusMetric)) {
      setSelectedMetricKey(focusMetric);
    } else if (sortedMetrics.length > 0 && !sortedMetrics.find(m => m.key === selectedMetricKey)) {
      setSelectedMetricKey(sortedMetrics[0].key as string);
    }
  }, [sortedMetrics, focusMetric]);

  // Respond to external focusMetric changes
  useEffect(() => {
    if (focusMetric && sortedMetrics.find(m => m.key === focusMetric)) {
      setSelectedMetricKey(focusMetric);
    }
  }, [focusMetric, sortedMetrics]);

  const selectedMetric = sortedMetrics.find(m => m.key === selectedMetricKey) || sortedMetrics[0];

  // Get latest value for each metric (last non-null reading)
  const latestValues = useMemo(() => {
    const vals: Record<string, number> = {};
    if (data.length === 0) return vals;
    for (const m of METRICS) {
      for (let i = data.length - 1; i >= 0; i--) {
        const v = data[i][m.key];
        const displayValue = metricDisplayValue(m, v);
        if (displayValue != null) { vals[m.key as string] = displayValue; break; }
      }
    }
    return vals;
  }, [data]);

  // Data time range for display
  const timeRange = useMemo(() => {
    if (data.length === 0) return '';
    const first = data[0]?.time;
    const last = data[data.length - 1]?.time;
    if (!first || !last) return '';
    return `${formatLocalDate(first)} ${formatLocalTime(first)} — ${formatLocalDate(last)} ${formatLocalTime(last)}`;
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mb-2" />
        <p className="text-sm">Loading sensor history…</p>
      </div>
    );
  }

  if (error || sortedMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Activity className="h-8 w-8 mb-2" />
        <p className="text-sm font-medium text-slate-500">
          {error || 'No sensor data available yet'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {!devEui
            ? 'This device has no devEui configured.'
            : deviceType.toLowerCase().includes('vibration') || deviceType.toLowerCase().includes('as400')
              ? 'Demo history stores one vibration point every ~30s and keeps the last 3 days.'
              : 'History will appear once sensor uplinks are received.'}
        </p>
      </div>
    );
  }

  const Icon = selectedMetric?.icon || Activity;

  return (
    <div>
      {/* Clickable metric cards — show latest value + act as selector (hidden when parent provides its own) */}
      {!hideMetricCards && (
        <div className={clsx(
          "grid gap-2 mb-4",
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        )}>
          {sortedMetrics.map((m) => {
            const MIcon = m.icon;
            const isActive = m.key === selectedMetricKey;
            const latest = latestValues[m.key as string];
            return (
              <button
                key={m.key as string}
                onClick={() => setSelectedMetricKey(m.key as string)}
                className={clsx(
                  "relative rounded-xl text-left transition-all border-2 cursor-pointer group",
                  compact ? "p-2" : "p-3",
                  isActive
                    ? "border-blue-500 bg-blue-50/60 shadow-sm"
                    : "border-transparent bg-slate-50 hover:bg-slate-100 hover:border-slate-200"
                )}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <MIcon className={clsx(compact ? "h-3 w-3" : "h-3.5 w-3.5")} style={{ color: m.color }} />
                  <span className={clsx(
                    compact ? "text-[10px]" : "text-xs",
                    "font-medium truncate",
                    isActive ? "text-blue-700" : "text-slate-500"
                  )}>{m.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={clsx(
                    "font-bold font-mono",
                    compact ? "text-sm" : "text-lg",
                    isActive ? "text-blue-900" : "text-slate-900"
                  )}>
                    {latest !== undefined ? (Number.isInteger(latest) ? latest : latest.toFixed(1)) : '—'}
                  </span>
                  <span className={clsx(compact ? "text-[10px]" : "text-xs", "text-slate-400")}>{m.unit}</span>
                </div>
                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart header + time range */}
      {selectedMetric && (
        <>
          <div className={clsx("flex items-center gap-2 mb-1 min-w-0", compact && "flex-wrap")}>
            <Icon className={clsx(compact ? "h-3.5 w-3.5" : "h-4 w-4")} style={{ color: selectedMetric.color }} />
            <span className={clsx(compact ? "text-xs" : "text-sm", "font-semibold text-slate-700 truncate")}>{selectedMetric.label}</span>
            {selectedMetric.unit && <span className={clsx(compact ? "text-[10px]" : "text-xs", "text-slate-400")}>({selectedMetric.unit})</span>}
            {!compact && <span className="ml-auto text-xs text-slate-400 shrink-0">{data.length} pts · {timeRange}</span>}
          </div>
          {compact ? (
            <p className="text-[10px] text-slate-400 mb-2 truncate">
              {data.length} data points · {deviceType.toLowerCase().includes('vibration') || deviceType.toLowerCase().includes('as400') ? '30s sampled · 3-day demo history' : '3-day history'}
            </p>
          ) : (
            <p className="text-xs text-slate-400 mb-3">{selectedMetric.description}</p>
          )}

          {/* Chart */}
          <div className={clsx(compact ? "h-[200px]" : "h-[280px]", "w-full min-w-0")}>
            <MetricChart data={data} metric={selectedMetric} period={period} />
          </div>
        </>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// COMPACT EXPORT — Mini chart for DeviceInspector (DT panel)
// ══════════════════════════════════════════════════════════
interface MiniDeviceChartProps {
  deviceId: string;
  deviceType: string;
  devEui?: string;
}

export function MiniDeviceChart({ deviceId, deviceType, devEui }: MiniDeviceChartProps) {
  const [data, setData] = useState<DeviceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!devEui) { setLoading(false); return; }
    const period = deviceType.toLowerCase().includes('vibration') || deviceType.toLowerCase().includes('as400') ? '3d' : '24h';
    api.getDeviceHistory(devEui, period)
      .then((res) => setData(res.points || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [devEui, deviceType]);

  // Pick the primary metric for this device type
  const primaryKey = useMemo(() => {
    const priority = TYPE_METRIC_PRIORITY[deviceType] || TYPE_METRIC_PRIORITY.IAQ;
    for (const k of priority) {
      if (data.some((d) => d[k as keyof DeviceHistoryPoint] != null)) return k;
    }
    for (const m of METRICS) {
      if (data.some((d) => d[m.key] != null)) return m.key as string;
    }
    return null;
  }, [data, deviceType]);

  const metric = primaryKey ? METRICS.find(m => m.key === primaryKey) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!metric || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-slate-400">
        No data yet
      </div>
    );
  }

  // Use local time formatting
  const chartData = data
    .filter((d) => d[metric.key] != null)
    .map((d) => ({ time: formatLocalTime(d.time), value: metricDisplayValue(metric, d[metric.key]) }));

  const gradientId = `mini-${metric.key}-${deviceId.slice(0, 6)}`;

  return (
    <SafeChartContainer>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={metric.color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={metric.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
          formatter={(v: number) => [`${typeof v === 'number' ? v.toFixed(1) : v} ${metric.unit}`, metric.label]}
        />
        <Area type="monotone" dataKey="value" stroke={metric.color} strokeWidth={1.5}
          fill={`url(#${gradientId})`} dot={false} />
      </AreaChart>
    </SafeChartContainer>
  );
}
