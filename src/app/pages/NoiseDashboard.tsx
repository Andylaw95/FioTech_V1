import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  Legend, PieChart, Pie, Cell,
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { StatCard } from '@/app/components/StatCard';
import { useTheme } from '@/app/utils/ThemeContext';
import {
  Volume2, VolumeX, Activity, AlertTriangle, Clock, TrendingUp, TrendingDown,
  ChevronDown, BarChart3, Shield, MapPin, Download, Calendar, Filter,
  Gauge, Radio, CheckCircle2, XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ── Noise level classification ───────────────────────────
function getNoiseStatus(db: number) {
  if (db < 55) return { label: 'Quiet', color: 'emerald', ring: '#10b981', bg: 'bg-emerald-500' };
  if (db < 70) return { label: 'Moderate', color: 'amber', ring: '#f59e0b', bg: 'bg-amber-500' };
  if (db < 85) return { label: 'Loud', color: 'orange', ring: '#f97316', bg: 'bg-orange-500' };
  return { label: 'Hazardous', color: 'red', ring: '#ef4444', bg: 'bg-red-500' };
}

function getComplianceColor(pct: number) {
  if (pct >= 95) return 'text-emerald-500';
  if (pct >= 80) return 'text-amber-500';
  return 'text-red-500';
}

// ── Arc Gauge SVG ────────────────────────────────────────
function NoiseGauge({ value, max = 120, size = 220 }: { value: number; max?: number; size?: number }) {
  const status = getNoiseStatus(value);
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

  // Tick marks
  const ticks = [0, 20, 40, 55, 70, 85, 100, 120];
  const getTickColor = (t: number) => {
    if (t < 55) return '#10b981';
    if (t < 70) return '#f59e0b';
    if (t < 85) return '#f97316';
    return '#ef4444';
  };

  return (
    <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
      {/* Background arc */}
      <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      {/* Colored segments */}
      <path d={arcPath(startAngle, startAngle + (55 / max) * totalAngle)} fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      <path d={arcPath(startAngle + (55 / max) * totalAngle, startAngle + (70 / max) * totalAngle)} fill="none" stroke="#f59e0b" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(startAngle + (70 / max) * totalAngle, startAngle + (85 / max) * totalAngle)} fill="none" stroke="#f97316" strokeWidth="12" opacity="0.3" />
      <path d={arcPath(startAngle + (85 / max) * totalAngle, endAngle)} fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
      {/* Value arc */}
      <path d={arcPath(startAngle, valueAngle)} fill="none" stroke={status.ring} strokeWidth="14" strokeLinecap="round" />
      {/* Tick labels */}
      {ticks.map(t => {
        const angle = startAngle + (t / max) * totalAngle;
        const pos = polarToCartesian(angle);
        const outerPos = { x: cx + (r + 16) * Math.cos((angle * Math.PI) / 180), y: cy + (r + 16) * Math.sin((angle * Math.PI) / 180) };
        return (
          <g key={t}>
            <line x1={pos.x} y1={pos.y} x2={cx + (r - 8) * Math.cos((angle * Math.PI) / 180)} y2={cy + (r - 8) * Math.sin((angle * Math.PI) / 180)} stroke={getTickColor(t)} strokeWidth="2" />
            <text x={outerPos.x} y={outerPos.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#94a3b8" fontWeight="500">{t}</text>
          </g>
        );
      })}
      {/* Center value */}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="36" fontWeight="700" fill={status.ring}>{value.toFixed(1)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="500" fill="#94a3b8">dB(A)</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="11" fontWeight="600" fill={status.ring}>{status.label}</text>
    </svg>
  );
}

// ── Demo data generation ─────────────────────────────────
function generateNoiseData(hours: number, interval: number = 5) {
  const points: any[] = [];
  const now = Date.now();
  const count = (hours * 3600) / interval;
  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * interval * 1000;
    const hour = new Date(t).getHours();
    const base = hour >= 7 && hour < 19 ? 62 : 48;
    const noise = base + Math.random() * 15 - 5 + Math.sin(i / 100) * 8;
    const leq = Math.round(noise * 10) / 10;
    points.push({
      time: new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: t,
      leq,
      lafmax: Math.round((leq + 3 + Math.random() * 8) * 10) / 10,
      lafmin: Math.round((leq - 3 - Math.random() * 5) * 10) / 10,
      laf: Math.round((leq + Math.random() * 4 - 2) * 10) / 10,
    });
  }
  return points;
}

function generateHourlyData(days: number) {
  const points: any[] = [];
  const now = new Date();
  for (let d = days - 1; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(h, 0, 0, 0);
      const isDaytime = h >= 7 && h < 19;
      const base = isDaytime ? 63 : 47;
      const leq = Math.round((base + Math.random() * 12 - 4) * 10) / 10;
      const limit = isDaytime ? 75 : 55;
      points.push({
        label: `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${String(h).padStart(2, '0')}:00`,
        hour: h,
        date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        leq,
        limit,
        isDaytime,
        exceedance: leq > limit,
      });
    }
  }
  return points;
}

function generateDistributionData() {
  const ranges = ['<40', '40-45', '45-50', '50-55', '55-60', '60-65', '65-70', '70-75', '75-80', '80-85', '>85'];
  const values = [2, 5, 12, 22, 25, 18, 9, 4, 2, 0.8, 0.2];
  return ranges.map((range, i) => ({
    range,
    percentage: values[i],
    fill: values[i] > 0 ? (
      i <= 3 ? '#10b981' : i <= 6 ? '#f59e0b' : i <= 8 ? '#f97316' : '#ef4444'
    ) : '#e2e8f0',
  }));
}

// ── Demo devices ─────────────────────────────────────────
const DEMO_DEVICES = [
  { id: 'HY108-001', name: 'Site North Gate', location: 'Construction Site A - North', status: 'online' as const, leq: 62.3, lafmax: 78.5, lafmin: 48.2, laf: 64.1 },
  { id: 'HY108-002', name: 'Residential Boundary', location: 'Construction Site A - East Boundary', status: 'online' as const, leq: 54.8, lafmax: 67.2, lafmin: 42.1, laf: 56.3 },
  { id: 'HY108-003', name: 'Site Office', location: 'Construction Site A - Office Block', status: 'online' as const, leq: 71.2, lafmax: 88.9, lafmin: 55.3, laf: 73.6 },
  { id: 'HY108-004', name: 'Community Boundary', location: 'Construction Site A - South', status: 'offline' as const, leq: 0, lafmax: 0, lafmin: 0, laf: 0 },
];

export function NoiseDashboard() {
  const { isDark } = useTheme();
  const [selectedDevice, setSelectedDevice] = useState(DEMO_DEVICES[0].id);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('1h');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);

  const device = DEMO_DEVICES.find(d => d.id === selectedDevice) ?? DEMO_DEVICES[0];
  const status = getNoiseStatus(device.leq);

  // Generate chart data based on time range
  const realtimeData = useMemo(() => {
    if (timeRange === '1h') return generateNoiseData(1, 5).filter((_, i) => i % 6 === 0);
    if (timeRange === '24h') return generateNoiseData(24, 60);
    return generateHourlyData(7);
  }, [timeRange]);

  const hourlyData = useMemo(() => generateHourlyData(7), []);
  const distributionData = useMemo(() => generateDistributionData(), []);

  // Statistics
  const stats = useMemo(() => {
    const values = realtimeData.map((d: any) => d.leq).filter(Boolean).sort((a: number, b: number) => a - b);
    if (values.length === 0) return { l10: 0, l50: 0, l90: 0, leq: 0, lmax: 0, lmin: 0 };
    return {
      l10: values[Math.floor(values.length * 0.9)]?.toFixed(1) ?? '—',
      l50: values[Math.floor(values.length * 0.5)]?.toFixed(1) ?? '—',
      l90: values[Math.floor(values.length * 0.1)]?.toFixed(1) ?? '—',
      leq: (values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(1),
      lmax: Math.max(...values).toFixed(1),
      lmin: Math.min(...values).toFixed(1),
    };
  }, [realtimeData]);

  // Compliance
  const compliance = useMemo(() => {
    const total = hourlyData.length;
    const exceeded = hourlyData.filter((d: any) => d.exceedance).length;
    return {
      total,
      exceeded,
      compliant: total - exceeded,
      pct: total > 0 ? Math.round(((total - exceeded) / total) * 100) : 100,
    };
  }, [hourlyData]);

  const onlineDevices = DEMO_DEVICES.filter(d => d.status === 'online').length;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={cn("text-xl lg:text-2xl font-bold", isDark ? "text-white" : "text-slate-900")}>
            Noise Monitoring
          </h2>
          <p className={cn("text-sm mt-0.5", isDark ? "text-slate-400" : "text-slate-500")}>
            Real-time sound level monitoring · IEC 61672 compliant
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Device selector */}
          <div className="relative">
            <button
              onClick={() => setShowDeviceDropdown(!showDeviceDropdown)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                isDark ? "border-slate-700 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <Radio className="h-3.5 w-3.5 text-emerald-500" />
              <span className="max-w-[160px] truncate">{device.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {showDeviceDropdown && (
              <div className={cn(
                "absolute right-0 top-full mt-1 w-72 rounded-lg border shadow-lg z-50 py-1",
                isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
              )}>
                {DEMO_DEVICES.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { setSelectedDevice(d.id); setShowDeviceDropdown(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left",
                      d.id === selectedDevice
                        ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                        : isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className={cn("h-2 w-2 rounded-full", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{d.name}</p>
                      <p className={cn("text-xs truncate", isDark ? "text-slate-500" : "text-slate-400")}>{d.id} · {d.location}</p>
                    </div>
                    {d.status === 'online' && (
                      <span className={cn("text-xs font-semibold", getNoiseStatus(d.leq).color === 'emerald' ? 'text-emerald-500' : getNoiseStatus(d.leq).color === 'amber' ? 'text-amber-500' : getNoiseStatus(d.leq).color === 'orange' ? 'text-orange-500' : 'text-red-500')}>
                        {d.leq} dB
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
            isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Active Sensors" value={`${onlineDevices}/${DEMO_DEVICES.length}`} icon={Radio} status="normal">
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{onlineDevices} online</span>
          </div>
        </StatCard>
        <StatCard title="Current LAeq" value={device.leq.toFixed(1)} unit="dB(A)" icon={Volume2} status={status.color === 'red' ? 'critical' : status.color === 'amber' || status.color === 'orange' ? 'warning' : 'normal'} />
        <StatCard title="7-Day Compliance" value={`${compliance.pct}%`} icon={Shield} status={compliance.pct >= 95 ? 'normal' : compliance.pct >= 80 ? 'warning' : 'critical'}>
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
            {compliance.exceeded} exceedance{compliance.exceeded !== 1 ? 's' : ''}
          </div>
        </StatCard>
        <StatCard title="Pending Alerts" value="2" icon={AlertTriangle} status="warning">
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>1 high severity</div>
        </StatCard>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Left: Gauge + Metrics (1 col) */}
        <div className="space-y-4">
          {/* Real-time Gauge Card */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Real-time Level</h3>
              <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                status.color === 'emerald' ? (isDark ? "bg-emerald-950 text-emerald-400" : "bg-emerald-50 text-emerald-600 border border-emerald-200") :
                status.color === 'amber' ? (isDark ? "bg-amber-950 text-amber-400" : "bg-amber-50 text-amber-600 border border-amber-200") :
                status.color === 'orange' ? (isDark ? "bg-orange-950 text-orange-400" : "bg-orange-50 text-orange-600 border border-orange-200") :
                (isDark ? "bg-red-950 text-red-400" : "bg-red-50 text-red-600 border border-red-200")
              )}>
                <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", status.bg)} />
                {status.label}
              </div>
            </div>

            <div className="flex justify-center py-2">
              <NoiseGauge value={device.leq} />
            </div>

            {/* LAF metrics grid */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: 'LAFmax', value: device.lafmax, desc: 'Maximum' },
                { label: 'LAFmin', value: device.lafmin, desc: 'Minimum' },
                { label: 'LAF', value: device.laf, desc: 'Instantaneous' },
              ].map(m => (
                <div key={m.label} className={cn("rounded-lg p-2.5 text-center", isDark ? "bg-slate-900/50" : "bg-slate-50 border border-slate-100")}>
                  <p className={cn("text-[10px] font-semibold uppercase tracking-wider mb-0.5", isDark ? "text-slate-500" : "text-slate-400")}>{m.label}</p>
                  <p className={cn("text-lg font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{m.value.toFixed(1)}</p>
                  <p className={cn("text-[10px]", isDark ? "text-slate-600" : "text-slate-400")}>{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Statistics Card */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-3", isDark ? "text-white" : "text-slate-900")}>Noise Statistics</h3>
            <div className="space-y-2.5">
              {[
                { label: 'L₁₀ (10th percentile)', value: stats.l10, desc: 'Exceeded 10% of time' },
                { label: 'L₅₀ (median)', value: stats.l50, desc: 'Exceeded 50% of time' },
                { label: 'L₉₀ (90th percentile)', value: stats.l90, desc: 'Background level' },
                { label: 'Leq (equivalent)', value: stats.leq, desc: 'Energy-average level' },
                { label: 'Lmax', value: stats.lmax, desc: 'Maximum recorded' },
                { label: 'Lmin', value: stats.lmin, desc: 'Minimum recorded' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div>
                    <p className={cn("text-xs font-medium", isDark ? "text-slate-300" : "text-slate-700")}>{s.label}</p>
                    <p className={cn("text-[10px]", isDark ? "text-slate-600" : "text-slate-400")}>{s.desc}</p>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{s.value} <span className={cn("text-[10px] font-normal", isDark ? "text-slate-500" : "text-slate-400")}>dB(A)</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Charts (2 cols) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Real-time Trend Chart */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Noise Level Trend</h3>
              <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                {(['1h', '24h', '7d'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTimeRange(t)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      timeRange === t
                        ? isDark ? "bg-blue-600 text-white" : "bg-blue-600 text-white"
                        : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[280px] w-full min-w-0">
              <SafeChartContainer>
                <AreaChart data={realtimeData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="leqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[30, 100]} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '10px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
                      fontSize: '12px',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4, color: isDark ? '#e2e8f0' : '#1e293b' }}
                  />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Day Limit 75dB', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                  <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Night Limit 55dB', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                  <Area type="monotone" dataKey="lafmax" name="LAFmax" stroke="#f59e0b" fill="none" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                  <Area type="monotone" dataKey="leq" name="LAeq" stroke="#3b82f6" fill="url(#leqGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="lafmin" name="LAFmin" stroke="#10b981" fill="none" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                </AreaChart>
              </SafeChartContainer>
            </div>
          </div>

          {/* Compliance & Distribution Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Compliance Summary */}
            <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
              <h3 className={cn("text-sm font-semibold mb-4", isDark ? "text-white" : "text-slate-900")}>7-Day Compliance</h3>
              <div className="flex items-center justify-center mb-4">
                <div className="relative h-[140px] w-[140px]">
                  <SafeChartContainer>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Compliant', value: compliance.compliant },
                          { name: 'Exceeded', value: compliance.exceeded },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={60}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                    </PieChart>
                  </SafeChartContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn("text-2xl font-bold", getComplianceColor(compliance.pct))}>{compliance.pct}%</span>
                    <span className={cn("text-[10px] font-medium", isDark ? "text-slate-500" : "text-slate-400")}>Compliant</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className={cn("text-xs", isDark ? "text-slate-300" : "text-slate-600")}>Within limit</span>
                  </div>
                  <span className={cn("text-xs font-semibold", isDark ? "text-white" : "text-slate-900")}>{compliance.compliant} hours</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <span className={cn("text-xs", isDark ? "text-slate-300" : "text-slate-600")}>Exceedance</span>
                  </div>
                  <span className={cn("text-xs font-semibold", isDark ? "text-white" : "text-slate-900")}>{compliance.exceeded} hours</span>
                </div>
              </div>
              <div className={cn("mt-3 pt-3 border-t text-xs", isDark ? "border-slate-700 text-slate-500" : "border-slate-100 text-slate-400")}>
                Limits: Day (07:00–19:00) 75 dB(A) · Night 55 dB(A)
              </div>
            </div>

            {/* Distribution Histogram */}
            <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
              <h3 className={cn("text-sm font-semibold mb-4", isDark ? "text-white" : "text-slate-900")}>Level Distribution</h3>
              <div className="h-[200px] w-full min-w-0">
                <SafeChartContainer>
                  <AreaChart data={distributionData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(v: number) => [`${v}%`, 'Occurrence']}
                    />
                    <defs>
                      <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="percentage" stroke="#8b5cf6" fill="url(#distGrad)" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                  </AreaChart>
                </SafeChartContainer>
              </div>
              <p className={cn("text-[10px] mt-2 text-center", isDark ? "text-slate-600" : "text-slate-400")}>
                dB(A) range distribution over selected period
              </p>
            </div>
          </div>

          {/* Device Status Table */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-3", isDark ? "text-white" : "text-slate-900")}>All Noise Sensors</h3>
            <div className="overflow-x-auto -mx-4 lg:-mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", isDark ? "border-slate-700" : "border-slate-100")}>
                    {['Status', 'Device', 'Location', 'LAeq', 'LAFmax', 'LAFmin', 'LAF', 'Level'].map(h => (
                      <th key={h} className={cn("px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_DEVICES.map(d => {
                    const s = getNoiseStatus(d.leq);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDevice(d.id)}
                        className={cn(
                          "border-b cursor-pointer transition-colors",
                          d.id === selectedDevice ? (isDark ? "bg-blue-950/20" : "bg-blue-50/50") : "",
                          isDark ? "border-slate-800 hover:bg-slate-800/50" : "border-slate-50 hover:bg-slate-50"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className={cn("h-2.5 w-2.5 rounded-full", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                        </td>
                        <td className="px-4 py-3">
                          <p className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>{d.name}</p>
                          <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{d.id}</p>
                        </td>
                        <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{d.location}</td>
                        <td className={cn("px-4 py-3 font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>
                          {d.status === 'online' ? `${d.leq.toFixed(1)}` : '—'}
                        </td>
                        <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>
                          {d.status === 'online' ? d.lafmax.toFixed(1) : '—'}
                        </td>
                        <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>
                          {d.status === 'online' ? d.lafmin.toFixed(1) : '—'}
                        </td>
                        <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>
                          {d.status === 'online' ? d.laf.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {d.status === 'online' ? (
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              s.color === 'emerald' ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                              s.color === 'amber' ? "bg-amber-50 text-amber-600 border border-amber-200" :
                              s.color === 'orange' ? "bg-orange-50 text-orange-600 border border-orange-200" :
                              "bg-red-50 text-red-600 border border-red-200"
                            )}>
                              {s.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">Offline</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
