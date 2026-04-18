import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { StatCard } from '@/app/components/StatCard';
import { useTheme } from '@/app/utils/ThemeContext';
import {
  CloudFog, Wind, AlertTriangle, Thermometer, Droplets, Download,
  ChevronDown, Shield, Radio, CheckCircle2, XCircle, Eye, Gauge, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '@/app/utils/api';
import { exportDustReport, type DustExportPeriod } from '@/app/utils/dustExport';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ── AQI / PM classification ─────────────────────────────
function getPM25Status(val: number) {
  if (val <= 35) return { label: 'Good', color: 'emerald', hex: '#10b981' };
  if (val <= 75) return { label: 'Moderate', color: 'amber', hex: '#f59e0b' };
  if (val <= 115) return { label: 'Unhealthy (SG)', color: 'orange', hex: '#f97316' };
  if (val <= 150) return { label: 'Unhealthy', color: 'red', hex: '#ef4444' };
  return { label: 'Hazardous', color: 'purple', hex: '#a855f7' };
}

function getPM10Status(val: number) {
  if (val <= 50) return { label: 'Good', color: 'emerald', hex: '#10b981' };
  if (val <= 100) return { label: 'Moderate', color: 'amber', hex: '#f59e0b' };
  if (val <= 250) return { label: 'Unhealthy', color: 'orange', hex: '#f97316' };
  return { label: 'Hazardous', color: 'red', hex: '#ef4444' };
}

function getTSPStatus(val: number) {
  if (val <= 260) return { label: 'Within Limit', color: 'emerald', hex: '#10b981' };
  if (val <= 500) return { label: 'Action Level', color: 'amber', hex: '#f59e0b' };
  return { label: 'Exceeded', color: 'red', hex: '#ef4444' };
}

function getAQI(pm25: number): { value: number; label: string; color: string } {
  if (pm25 <= 12) return { value: Math.round(pm25 / 12 * 50), label: 'Good', color: '#10b981' };
  if (pm25 <= 35.4) return { value: Math.round(50 + (pm25 - 12) / 23.4 * 50), label: 'Moderate', color: '#f59e0b' };
  if (pm25 <= 55.4) return { value: Math.round(100 + (pm25 - 35.4) / 20 * 50), label: 'USG', color: '#f97316' };
  if (pm25 <= 150.4) return { value: Math.round(150 + (pm25 - 55.4) / 95 * 50), label: 'Unhealthy', color: '#ef4444' };
  return { value: Math.min(500, Math.round(200 + (pm25 - 150.4) / 100 * 100)), label: 'Hazardous', color: '#a855f7' };
}

// ── Circular Gauge SVG ───────────────────────────────────
function DustGauge({ value, max, unit, label, statusColor }: { value: number; max: number; unit: string; label: string; statusColor: string }) {
  const size = 160;
  const r = 56;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct * 0.75);

  return (
    <div className="flex flex-col items-center min-w-0">
      <svg className="w-full h-auto max-w-[180px]" viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={-circumference * 0.125}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
        />
        {/* Value ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={statusColor} strokeWidth="12"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={offset - circumference * 0.125}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="36" fontWeight="700" fill={statusColor}>{value.toFixed(0)}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="16" fontWeight="500" fill="#94a3b8">{unit}</text>
      </svg>
      <p className="text-sm font-semibold mt-1" style={{ color: statusColor }}>{label}</p>
    </div>
  );
}

// ── AQI Ring ─────────────────────────────────────────────
function AQIRing({ pm25 }: { pm25: number }) {
  const aqi = getAQI(pm25);
  const size = 120;
  const r = 45;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(aqi.value / 500, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={aqi.color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill={aqi.color}>{aqi.value}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fontWeight="500" fill="#94a3b8">AQI</text>
      </svg>
      <span className="text-xs font-semibold mt-0.5" style={{ color: aqi.color }}>{aqi.label}</span>
    </div>
  );
}

// ── Dust device type ─────────────────────────────────────
interface DustDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  pm25: number;
  pm10: number;
  tsp: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  windDir: string;
}

export function DustDashboard() {
  const { isDark } = useTheme();
  const [devices, setDevices] = useState<DustDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'pm25' | 'pm10' | 'tsp'>('pm25');
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Fetch real dust devices from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const properties = await api.getProperties();
        const dd: DustDevice[] = [];
        for (const p of properties) {
          try {
            const tel = await api.getPropertyTelemetry(p.id);
            for (const [devEUI, reading] of Object.entries((tel as any).deviceReadings || {})) {
              const dec = (reading as any).decoded || {};
              if (dec.pm2_5 === undefined && dec.pm10 === undefined) continue;
              const recent = (reading as any).receivedAt && (Date.now() - new Date((reading as any).receivedAt).getTime()) < 600000;
              dd.push({
                id: devEUI,
                name: (reading as any).deviceName || devEUI,
                location: `${p.name}${p.location ? ' — ' + p.location : ''}`,
                status: recent ? 'online' : 'offline',
                pm25: dec.pm2_5 ?? 0,
                pm10: dec.pm10 ?? 0,
                tsp: dec.tsp ?? 0,
                temp: dec.temperature ?? 0,
                humidity: dec.humidity ?? 0,
                windSpeed: dec.wind_speed ?? 0,
                windDir: dec.wind_direction ?? '—',
              });
            }
          } catch {}
        }
        if (!cancelled) {
          setDevices(dd);
          if (dd.length > 0) setSelectedDevice(dd[0].id);
        }
      } catch (e) { console.warn('[DustDashboard]', e); }
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
          pm25: p.pm2_5 ?? p.pm25,
          pm10: p.pm10,
          tsp: p.tsp,
          temperature: p.temperature,
          humidity: p.humidity,
          windSpeed: p.wind_speed,
          windDir: p.wind_direction,
        })));
      })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDevice, timeRange]);

  const device = devices.find(d => d.id === selectedDevice) ?? devices[0];

  const onlineDevices = devices.filter(d => d.status === 'online').length;

  // Compliance calculation
  const compliance = useMemo(() => {
    const total = chartData.length;
    if (total === 0) return { total: 0, exceeded: 0, pct: 100 };
    let exceeded = 0;
    chartData.forEach((d: any) => {
      if (activeMetric === 'pm25' && d.pm25 > 75) exceeded++;
      if (activeMetric === 'pm10' && d.pm10 > 100) exceeded++;
      if (activeMetric === 'tsp' && d.tsp > 260) exceeded++;
    });
    return { total, exceeded, pct: total > 0 ? Math.round(((total - exceeded) / total) * 100) : 100 };
  }, [chartData, activeMetric]);

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
        No dust sensors detected
      </div>
    );
  }

  const metricConfig = {
    pm25: { label: 'PM2.5', unit: 'µg/m³', limit: 75, limitLabel: 'AQO Daily (75µg/m³)', color: '#3b82f6', max: 200 },
    pm10: { label: 'PM10', unit: 'µg/m³', limit: 100, limitLabel: 'AQO Daily (100µg/m³)', color: '#8b5cf6', max: 300 },
    tsp: { label: 'TSP', unit: 'µg/m³', limit: 260, limitLabel: 'EPD 24h Limit (260µg/m³)', color: '#f59e0b', max: 600 },
  };
  const mc = metricConfig[activeMetric];

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={cn("text-xl lg:text-2xl font-bold", isDark ? "text-white" : "text-slate-900")}>
            Dust Monitoring
          </h2>
          <p className={cn("text-sm mt-0.5", isDark ? "text-slate-400" : "text-slate-500")}>
            Particulate matter monitoring · PM2.5 / PM10 / TSP
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
                      <p className={cn("text-xs truncate", isDark ? "text-slate-500" : "text-slate-400")}>{d.id}</p>
                    </div>
                    {d.status === 'online' && (
                      <span className={cn("text-xs font-semibold")} style={{ color: getPM25Status(d.pm25).hex }}>
                        {d.pm25} µg/m³
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
                {(['24h', '7d', '30d'] as DustExportPeriod[]).map(p => (
                  <button
                    key={p}
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExporting(true);
                      try {
                        await exportDustReport(devices, p, m => setExportMsg(m));
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
        <StatCard title="Current PM2.5" value={device.pm25.toFixed(1)} unit="µg/m³" icon={CloudFog}
          status={device.pm25 > 75 ? 'critical' : device.pm25 > 35 ? 'warning' : 'normal'} />
        <StatCard title="Compliance Rate" value={`${compliance.pct}%`} icon={Shield}
          status={compliance.pct >= 95 ? 'normal' : compliance.pct >= 80 ? 'warning' : 'critical'}>
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
            {compliance.exceeded} exceedance{compliance.exceeded !== 1 ? 's' : ''}
          </div>
        </StatCard>
        <StatCard title="Alerts" value="0" icon={AlertTriangle} status="normal">
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>No active alerts</div>
        </StatCard>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Left Column: Gauges + Weather */}
        <div className="space-y-4">
          {/* PM Gauges Card */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Real-time Levels</h3>
              <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                getPM25Status(device.pm25).color === 'emerald' ? (isDark ? "bg-emerald-950 text-emerald-400" : "bg-emerald-50 text-emerald-600 border border-emerald-200") :
                getPM25Status(device.pm25).color === 'amber' ? (isDark ? "bg-amber-950 text-amber-400" : "bg-amber-50 text-amber-600 border border-amber-200") :
                (isDark ? "bg-red-950 text-red-400" : "bg-red-50 text-red-600 border border-red-200")
              )}>
                <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse",
                  getPM25Status(device.pm25).color === 'emerald' ? "bg-emerald-500" :
                  getPM25Status(device.pm25).color === 'amber' ? "bg-amber-500" : "bg-red-500"
                )} />
                {getPM25Status(device.pm25).label}
              </div>
            </div>

            {/* AQI Ring */}
            <div className="flex justify-center mb-3">
              <AQIRing pm25={device.pm25} />
            </div>

            {/* Three PM gauges */}
            <div className="grid grid-cols-3 gap-2 min-w-0 overflow-hidden">
              <DustGauge value={device.pm25} max={200} unit="µg/m³" label="PM2.5" statusColor={getPM25Status(device.pm25).hex} />
              <DustGauge value={device.pm10} max={300} unit="µg/m³" label="PM10" statusColor={getPM10Status(device.pm10).hex} />
              <DustGauge value={device.tsp} max={600} unit="µg/m³" label="TSP" statusColor={getTSPStatus(device.tsp).hex} />
            </div>
          </div>

          {/* Weather Conditions Card */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-3", isDark ? "text-white" : "text-slate-900")}>Site Conditions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Thermometer, label: 'Temperature', value: `${device.temp}°C`, color: 'text-amber-500' },
                { icon: Droplets, label: 'Humidity', value: `${device.humidity}%`, color: 'text-blue-500' },
                { icon: Wind, label: 'Wind Speed', value: `${device.windSpeed} m/s`, color: 'text-cyan-500' },
                { icon: Eye, label: 'Wind Dir', value: device.windDir, color: 'text-slate-500' },
              ].map(w => (
                <div key={w.label} className={cn("rounded-lg p-3", isDark ? "bg-slate-900/50" : "bg-slate-50 border border-slate-100")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <w.icon className={cn("h-3.5 w-3.5", w.color)} />
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>{w.label}</span>
                  </div>
                  <p className={cn("text-base font-bold", isDark ? "text-white" : "text-slate-900")}>{w.value}</p>
                </div>
              ))}
            </div>
            <p className={cn("text-[10px] mt-3 text-center", isDark ? "text-slate-600" : "text-slate-400")}>
              Wind conditions affect dust dispersion and monitoring readings
            </p>
          </div>

          {/* Compliance Card */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-3", isDark ? "text-white" : "text-slate-900")}>Compliance Summary</h3>
            <div className="flex items-center justify-center mb-3">
              <div className="relative h-[120px] w-[120px]">
                <SafeChartContainer>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Compliant', value: compliance.total - compliance.exceeded },
                        { name: 'Exceeded', value: compliance.exceeded },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={52}
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
                  <span className={cn("text-xl font-bold", compliance.pct >= 95 ? "text-emerald-500" : compliance.pct >= 80 ? "text-amber-500" : "text-red-500")}>{compliance.pct}%</span>
                  <span className={cn("text-[9px]", isDark ? "text-slate-500" : "text-slate-400")}>Compliant</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className={cn(isDark ? "text-slate-400" : "text-slate-500")}>HK AQO PM2.5 (24h)</span>
                <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>75 µg/m³</span>
              </div>
              <div className="flex justify-between">
                <span className={cn(isDark ? "text-slate-400" : "text-slate-500")}>HK AQO PM10 (24h)</span>
                <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>100 µg/m³</span>
              </div>
              <div className="flex justify-between">
                <span className={cn(isDark ? "text-slate-400" : "text-slate-500")}>EPD TSP (1h Action)</span>
                <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>500 µg/m³</span>
              </div>
              <div className="flex justify-between">
                <span className={cn(isDark ? "text-slate-400" : "text-slate-500")}>EPD TSP (24h Limit)</span>
                <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>260 µg/m³</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Charts (2 cols) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Trend Chart */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Particulate Matter Trend</h3>
              <div className="flex items-center gap-2">
                {/* Metric selector */}
                <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                  {(['pm25', 'pm10', 'tsp'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setActiveMetric(m)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                        activeMetric === m
                          ? "bg-blue-600 text-white"
                          : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {metricConfig[m].label}
                    </button>
                  ))}
                </div>
                {/* Time range */}
                <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                  {(['1h', '24h', '7d'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTimeRange(t)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                        timeRange === t
                          ? "bg-blue-600 text-white"
                          : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full min-w-0">
              <SafeChartContainer>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="dustGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={mc.color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={mc.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
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
                  <ReferenceLine y={mc.limit} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5}
                    label={{ value: mc.limitLabel, position: 'right', fontSize: 9, fill: '#ef4444' }} />
                  <Area type="monotone" dataKey={activeMetric} name={mc.label} stroke={mc.color} fill="url(#dustGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </SafeChartContainer>
            </div>
          </div>

          {/* Multi-metric comparison */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-4", isDark ? "text-white" : "text-slate-900")}>All Metrics Comparison</h3>
            <div className="h-[250px] w-full min-w-0">
              <SafeChartContainer>
                <LineChart data={chartData.filter((_: any, i: number) => i % 3 === 0)} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={60} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '10px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pm10" name="PM10" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tsp" name="TSP" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </SafeChartContainer>
            </div>
          </div>

          {/* All Dust Sensors Table */}
          <div className={cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm")}>
            <h3 className={cn("text-sm font-semibold mb-3", isDark ? "text-white" : "text-slate-900")}>All Dust Sensors</h3>
            <div className="overflow-x-auto -mx-4 lg:-mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", isDark ? "border-slate-700" : "border-slate-100")}>
                    {['Status', 'Device', 'Location', 'PM2.5', 'PM10', 'TSP', 'Temp', 'Wind', 'Level'].map(h => (
                      <th key={h} className={cn("px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => {
                    const s = getPM25Status(d.pm25);
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
                        <td className={cn("px-4 py-3 text-xs max-w-[150px] truncate", isDark ? "text-slate-400" : "text-slate-500")}>{d.location}</td>
                        <td className={cn("px-4 py-3 font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>
                          {d.status === 'online' ? d.pm25.toFixed(1) : '—'}
                        </td>
                        <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>
                          {d.status === 'online' ? d.pm10.toFixed(1) : '—'}
                        </td>
                        <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>
                          {d.status === 'online' ? d.tsp : '—'}
                        </td>
                        <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                          {d.status === 'online' ? `${d.temp}°C` : '—'}
                        </td>
                        <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                          {d.status === 'online' ? `${d.windSpeed}m/s ${d.windDir}` : '—'}
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
