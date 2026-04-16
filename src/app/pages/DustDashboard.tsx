import React, { useState, useMemo } from 'react';
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
  ChevronDown, Shield, Radio, CheckCircle2, XCircle, Eye, Gauge,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  const r = 60;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct * 0.75);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="24" fontWeight="700" fill={statusColor}>{value.toFixed(0)}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fontWeight="500" fill="#94a3b8">{unit}</text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color: statusColor }}>{label}</p>
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

// ── Demo data ────────────────────────────────────────────
function generateDustData(hours: number) {
  const points: any[] = [];
  const now = Date.now();
  const count = hours * 12; // 5-min intervals
  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * 300000;
    const hour = new Date(t).getHours();
    const isWorkHour = hour >= 8 && hour < 18;
    const basePM25 = isWorkHour ? 38 : 22;
    const basePM10 = isWorkHour ? 65 : 35;
    const baseTSP = isWorkHour ? 180 : 80;
    points.push({
      time: new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: t,
      pm25: Math.round((basePM25 + Math.random() * 25 - 8 + Math.sin(i / 30) * 12) * 10) / 10,
      pm10: Math.round((basePM10 + Math.random() * 40 - 12 + Math.sin(i / 25) * 20) * 10) / 10,
      tsp: Math.round(baseTSP + Math.random() * 100 - 30 + Math.sin(i / 20) * 50),
      temperature: Math.round((28 + Math.sin(i / 80) * 4 + Math.random() * 2) * 10) / 10,
      humidity: Math.round(65 + Math.sin(i / 60) * 12 + Math.random() * 5),
      windSpeed: Math.round((2.5 + Math.random() * 4) * 10) / 10,
      windDir: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
    });
  }
  return points;
}

const DEMO_DUST_DEVICES = [
  { id: 'DUST-001', name: 'Site North - Crusher', location: 'Construction Site A - Crushing Plant', status: 'online' as const, pm25: 42.3, pm10: 78.6, tsp: 195, temp: 29.2, humidity: 62, windSpeed: 3.2, windDir: 'NE' },
  { id: 'DUST-002', name: 'Site East - Boundary', location: 'Construction Site A - East Fence', status: 'online' as const, pm25: 28.1, pm10: 52.4, tsp: 125, temp: 28.8, humidity: 65, windSpeed: 2.8, windDir: 'E' },
  { id: 'DUST-003', name: 'Residential Monitor', location: 'Adjacent Residential - Rooftop', status: 'online' as const, pm25: 18.5, pm10: 36.2, tsp: 88, temp: 28.5, humidity: 68, windSpeed: 3.5, windDir: 'SE' },
  { id: 'DUST-004', name: 'Site South - Stockpile', location: 'Construction Site A - Material Yard', status: 'offline' as const, pm25: 0, pm10: 0, tsp: 0, temp: 0, humidity: 0, windSpeed: 0, windDir: '—' },
];

export function DustDashboard() {
  const { isDark } = useTheme();
  const [selectedDevice, setSelectedDevice] = useState(DEMO_DUST_DEVICES[0].id);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'pm25' | 'pm10' | 'tsp'>('pm25');

  const device = DEMO_DUST_DEVICES.find(d => d.id === selectedDevice) ?? DEMO_DUST_DEVICES[0];

  const chartData = useMemo(() => {
    const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 168;
    const data = generateDustData(hours);
    if (timeRange === '1h') return data;
    if (timeRange === '24h') return data.filter((_, i) => i % 3 === 0);
    return data.filter((_, i) => i % 12 === 0);
  }, [timeRange]);

  const onlineDevices = DEMO_DUST_DEVICES.filter(d => d.status === 'online').length;

  // Compliance calculation
  const compliance = useMemo(() => {
    const total = chartData.length;
    let exceeded = 0;
    chartData.forEach((d: any) => {
      if (activeMetric === 'pm25' && d.pm25 > 75) exceeded++;
      if (activeMetric === 'pm10' && d.pm10 > 100) exceeded++;
      if (activeMetric === 'tsp' && d.tsp > 260) exceeded++;
    });
    return {
      total,
      exceeded,
      pct: total > 0 ? Math.round(((total - exceeded) / total) * 100) : 100,
    };
  }, [chartData, activeMetric]);

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
                {DEMO_DUST_DEVICES.map(d => (
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
        <StatCard title="Active Sensors" value={`${onlineDevices}/${DEMO_DUST_DEVICES.length}`} icon={Radio} status="normal">
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
        <StatCard title="Alerts" value="1" icon={AlertTriangle} status="warning">
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>TSP action level</div>
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
            <div className="grid grid-cols-3 gap-1">
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
                  {DEMO_DUST_DEVICES.map(d => {
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
