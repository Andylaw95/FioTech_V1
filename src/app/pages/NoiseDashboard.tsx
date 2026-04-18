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
  Gauge, Radio, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '@/app/utils/api';
import { exportNoiseReport, type ExportPeriod } from '@/app/utils/noiseExport';

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
    <svg className="w-full h-auto max-w-[280px] mx-auto" viewBox={`0 0 ${size} ${size}`}>
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
            <text x={outerPos.x} y={outerPos.y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#94a3b8" fontWeight="600">{t}</text>
          </g>
        );
      })}
      {/* Center value */}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="44" fontWeight="700" fill={status.ring}>{value.toFixed(1)}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="16" fontWeight="500" fill="#94a3b8">dB(A)</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="14" fontWeight="600" fill={status.ring}>{status.label}</text>
    </svg>
  );
}

// ── Noise device type ────────────────────────────────────
interface NoiseDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  leq: number;
  lafmax: number;
  lafmin: number;
  laf: number;
  lcpeak: number;
}

export function NoiseDashboard() {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState<NoiseDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('1h');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Fetch real noise devices from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const properties = await api.getProperties();
        const nd: NoiseDevice[] = [];
        for (const p of properties) {
          try {
            const tel = await api.getPropertyTelemetry(p.id);
            for (const [devEUI, reading] of Object.entries((tel as any).deviceReadings || {})) {
              const dec = (reading as any).decoded || {};
              if (dec.sound_level_leq === undefined) continue;
              const recent = (reading as any).receivedAt && (Date.now() - new Date((reading as any).receivedAt).getTime()) < 600000;
              nd.push({
                id: devEUI,
                name: (reading as any).deviceName || devEUI,
                location: `${p.name}${p.location ? ' — ' + p.location : ''}`,
                status: recent ? 'online' : 'offline',
                leq: dec.sound_level_leq ?? 0,
                lafmax: dec.sound_level_lmax ?? 0,
                lafmin: dec.sound_level_lmin ?? 0,
                laf: dec.sound_level_inst ?? 0,
                lcpeak: dec.sound_level_lcpeak ?? 0,
              });
            }
          } catch {}
        }
        if (!cancelled) {
          setDevices(nd);
          if (nd.length > 0) setSelectedDevice(nd[0].id);
        }
      } catch (e) { console.warn('[NoiseDashboard]', e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch chart history for selected device
  useEffect(() => {
    if (!selectedDevice) return;
    let cancelled = false;
    setChartLoading(true);
    api.getDeviceHistory(selectedDevice, timeRange)
      .then((res: any) => {
        if (cancelled) return;
        setChartData((res.points || []).map((p: any) => ({
          time: p.timeLabel || new Date(p.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
          leq: p.sound_level_leq,
          lafmax: p.sound_level_lmax,
          lafmin: p.sound_level_lmin,
          laf: p.sound_level_inst,
          _hour: new Date(p.time).getHours(),
        })));
      })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, timeRange]);

  const device = devices.find(d => d.id === selectedDevice) ?? devices[0];
  const status = device ? getNoiseStatus(device.leq) : getNoiseStatus(0);

  const stats = useMemo(() => {
    const values = chartData.map((d: any) => d.leq).filter((v: any) => v != null && v > 0).sort((a: number, b: number) => a - b);
    if (values.length === 0) return { l10: '—', l50: '—', l90: '—', leq: '—', lmax: '—', lmin: '—' };
    return {
      l10: values[Math.floor(values.length * 0.9)]?.toFixed(1) ?? '—',
      l50: values[Math.floor(values.length * 0.5)]?.toFixed(1) ?? '—',
      l90: values[Math.floor(values.length * 0.1)]?.toFixed(1) ?? '—',
      leq: (values.reduce((a: number, b: number) => a + b, 0) / values.length).toFixed(1),
      lmax: Math.max(...values).toFixed(1),
      lmin: Math.min(...values).toFixed(1),
    };
  }, [chartData]);

  const compliance = useMemo(() => {
    if (chartData.length === 0) return { total: 0, exceeded: 0, compliant: 0, pct: 100 };
    const total = chartData.length;
    const exceeded = chartData.filter((d: any) => {
      const h = d._hour ?? 12;
      const limit = (h >= 7 && h < 19) ? 75 : 55;
      return d.leq > limit;
    }).length;
    return { total, exceeded, compliant: total - exceeded, pct: Math.round(((total - exceeded) / total) * 100) };
  }, [chartData]);

  const distributionData = useMemo(() => {
    const ranges = ['<40', '40-45', '45-50', '50-55', '55-60', '60-65', '65-70', '70-75', '75-80', '80-85', '>85'];
    const bins = new Array(11).fill(0);
    const values = chartData.map((d: any) => d.leq).filter((v: any) => v != null && v > 0);
    values.forEach((v: number) => {
      if (v < 40) bins[0]++; else if (v < 45) bins[1]++; else if (v < 50) bins[2]++;
      else if (v < 55) bins[3]++; else if (v < 60) bins[4]++; else if (v < 65) bins[5]++;
      else if (v < 70) bins[6]++; else if (v < 75) bins[7]++; else if (v < 80) bins[8]++;
      else if (v < 85) bins[9]++; else bins[10]++;
    });
    const total = values.length || 1;
    return ranges.map((range, i) => ({
      range,
      percentage: Math.round(bins[i] / total * 1000) / 10,
      fill: i <= 3 ? '#10b981' : i <= 6 ? '#f59e0b' : i <= 8 ? '#f97316' : '#ef4444',
    }));
  }, [chartData]);

  const onlineDevices = devices.filter(d => d.status === 'online').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className={cn("ml-3 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Loading sensors...</span>
      </div>
    );
  }
  if (!device) {
    return (
      <div className={cn("text-center py-20 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
        No noise sensors detected
      </div>
    );
  }

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
                {devices.map(d => (
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
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(p => !p)}
              disabled={exporting || devices.length === 0}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                exporting ? "opacity-60 cursor-wait" : "",
                isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{exporting ? exportMsg : 'Export'}</span>
              {!exporting && <ChevronDown className="h-3 w-3 opacity-50" />}
            </button>
            {showExportMenu && !exporting && (
              <div className={cn(
                "absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border shadow-lg py-1",
                isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}>
                {(['24h', '7d', '30d'] as ExportPeriod[]).map(p => (
                  <button
                    key={p}
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExporting(true);
                      try {
                        await exportNoiseReport(devices, p, m => setExportMsg(m));
                      } catch (e) { console.error('[Export]', e); }
                      finally { setExporting(false); setExportMsg(''); }
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors",
                      isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {p === '24h' ? '📊 Last 24 Hours' : p === '7d' ? '📊 Last 7 Days' : '📊 Last 30 Days'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Active Sensors" value={`${onlineDevices}/${devices.length}`} icon={Radio} status="normal">
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
        <StatCard title="Pending Alerts" value="0" icon={AlertTriangle} status="normal">
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>No active alerts</div>
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
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
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
                  {devices.map(d => {
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
