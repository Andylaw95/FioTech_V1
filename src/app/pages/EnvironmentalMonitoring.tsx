import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF, CircleF, TrafficLayer } from '@react-google-maps/api';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { StatCard } from '@/app/components/StatCard';
import { useTheme } from '@/app/utils/ThemeContext';
import { api } from '@/app/utils/api';
import {
  Volume2, CloudFog, Wind, AlertTriangle, Thermometer, Droplets, Download,
  ChevronDown, Shield, Radio, CheckCircle2, XCircle, Eye, Map as MapIcon,
  BarChart3, Activity, Filter, Layers, Maximize2, Navigation, MapPin, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// ══════════════════════════════════════════════════════════
//  Classification helpers
// ══════════════════════════════════════════════════════════

function getNoiseStatus(db: number) {
  if (db < 55) return { label: 'Quiet', color: 'emerald', hex: '#10b981', bg: 'bg-emerald-500' };
  if (db < 70) return { label: 'Moderate', color: 'amber', hex: '#f59e0b', bg: 'bg-amber-500' };
  if (db < 85) return { label: 'Loud', color: 'orange', hex: '#f97316', bg: 'bg-orange-500' };
  return { label: 'Hazardous', color: 'red', hex: '#ef4444', bg: 'bg-red-500' };
}

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

function getAQI(pm25: number) {
  if (pm25 <= 12) return { value: Math.round(pm25 / 12 * 50), label: 'Good', color: '#10b981' };
  if (pm25 <= 35.4) return { value: Math.round(50 + (pm25 - 12) / 23.4 * 50), label: 'Moderate', color: '#f59e0b' };
  if (pm25 <= 55.4) return { value: Math.round(100 + (pm25 - 35.4) / 20 * 50), label: 'USG', color: '#f97316' };
  return { value: Math.min(500, Math.round(150 + (pm25 - 55.4) / 95 * 50)), label: 'Unhealthy', color: '#ef4444' };
}

// ══════════════════════════════════════════════════════════
//  SVG Gauges
// ══════════════════════════════════════════════════════════

function NoiseGauge({ value, min = 20, max = 140, size = 180 }: { value: number; min?: number; max?: number; size?: number }) {
  const status = getNoiseStatus(value);
  const r = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const startAngle = -210;
  const endAngle = 30;
  const totalAngle = endAngle - startAngle;
  const clamped = Math.max(min, Math.min(value, max));
  const valueAngle = startAngle + ((clamped - min) / (max - min)) * totalAngle;

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

  return (
    <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`}>
      <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#334155" strokeWidth={10} strokeLinecap="round" />
      <path d={arcPath(startAngle, valueAngle)} fill="none" stroke={status.hex} strokeWidth={10} strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" fill={status.hex} fontSize={size * 0.2} fontWeight="bold" fontFamily="system-ui">{value.toFixed(1)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="system-ui">dB(A)</text>
      <text x={cx} y={cy + 26} textAnchor="middle" fill={status.hex} fontSize={10} fontWeight="600" fontFamily="system-ui">{status.label}</text>
    </svg>
  );
}

function DustGauge({ value, max, unit, label, statusColor }: { value: number; max: number; unit: string; label: string; statusColor: string }) {
  const size = 130;
  const r = 48;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct * 0.75);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#334155" strokeWidth={7} strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" transform={`rotate(135, ${cx}, ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={statusColor} strokeWidth={7} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(135, ${cx}, ${cy})`} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="currentColor" fontSize={18} fontWeight="bold" fontFamily="system-ui" className="fill-current">{value.toFixed(0)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="system-ui">{unit}</text>
      </svg>
      <span className="text-[10px] font-semibold -mt-2" style={{ color: statusColor }}>{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  Demo data
// ══════════════════════════════════════════════════════════

type DeviceType = 'noise' | 'dust';

interface SensorDevice {
  id: string;
  name: string;
  type: DeviceType;
  location: string;
  lat: number;
  lng: number;
  status: 'online' | 'offline';
  // Noise fields — matches DB schema (sound_level_*) and IEC 61672
  sound_level_leq?: number | null;    // LAeq: A-weighted equivalent continuous sound level
  sound_level_lmax?: number | null;   // LAFmax: A-weighted fast maximum
  sound_level_lmin?: number | null;   // LAFmin: A-weighted fast minimum
  sound_level_inst?: number | null;   // LAF: A-weighted fast instantaneous
  sound_level_lcpeak?: number | null; // LCPeak: C-weighted peak
  // Dust fields
  pm25?: number;
  pm10?: number;
  tsp?: number;
  temp?: number;
  humidity?: number;
  windSpeed?: number;
  windDir?: string;
}

// Downsample data arrays for chart rendering performance
function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}

// ══════════════════════════════════════════════════════════
//  Geocoding — auto-detect coordinates from property address
// ══════════════════════════════════════════════════════════

const GEOCODE_CACHE_PREFIX = 'fiotec_geocode_';

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = GEOCODE_CACHE_PREFIX + address;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const geocoder = new google.maps.Geocoder();
    const res = await geocoder.geocode({ address });
    if (res.results.length > 0) {
      const loc = res.results[0].geometry.location;
      const coords = { lat: loc.lat(), lng: loc.lng() };
      sessionStorage.setItem(cacheKey, JSON.stringify(coords));
      return coords;
    }
  } catch (e) {
    console.warn('[Geocode] Failed for', address, e);
  }
  return null;
}

function isDeviceRecent(lastSeen: string | undefined): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 10 * 60 * 1000; // 10 minutes
}

// ══════════════════════════════════════════════════════════
//  Google Maps configuration
// ══════════════════════════════════════════════════════════

const GOOGLE_MAPS_KEY = 'AIzaSyBWgKagtVMMD2yysqs0COrolsIRU3K1wVY';
// Note: custom styles array is NOT used — it disables vector rendering and 3D buildings.
// For dark mode + 3D, use cloud-based map styling with a mapId in Google Cloud Console.

// ══════════════════════════════════════════════════════════
//  Main Component
// ══════════════════════════════════════════════════════════

type ViewTab = 'map' | 'noise' | 'dust';

export function EnvironmentalMonitoring() {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<ViewTab>('map');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState<'all' | 'noise' | 'dust'>('all');
  const [noiseTimeRange, setNoiseTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [dustTimeRange, setDustTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [dustMetric, setDustMetric] = useState<'pm25' | 'pm10' | 'tsp'>('pm25');

  // Real data state — start empty, no demo data flash
  const [devices, setDevices] = useState<SensorDevice[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 22.3100, lng: 114.2625 });

  // History data for charts — fetched from real API
  const [noiseHistory, setNoiseHistory] = useState<any[]>([]);
  const [dustHistory, setDustHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const device = selectedDevice ? devices.find(d => d.id === selectedDevice) : null;

  // Google Maps
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');

  // ── Fetch real data from Supabase + geocode property addresses ──
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    async function fetchRealData() {
      try {
        const properties = await api.getProperties();
        if (!properties || properties.length === 0) throw new Error('No properties');

        const realDevices: SensorDevice[] = [];

        for (const prop of properties) {
          const addr = prop.location || prop.name;
          const coords = await geocodeAddress(addr);
          if (!coords) continue;

          try {
            const telemetry = await api.getPropertyTelemetry(prop.id);
            const readings = telemetry.deviceReadings || {};
            let idx = 0;

            for (const [devEUI, reading] of Object.entries(readings)) {
              const dec = reading.decoded || {};
              const hasNoise = dec.sound_level_leq !== undefined;
              const hasDust = dec.pm2_5 !== undefined || dec.pm10 !== undefined;
              const deviceType: DeviceType = hasNoise ? 'noise' : hasDust ? 'dust' : 'noise';

              // Micro-offset so overlapping markers stay clickable (~2m apart)
              const microOffset = idx * 0.00002;

              realDevices.push({
                id: devEUI,
                name: reading.deviceName || devEUI,
                type: deviceType,
                location: `${prop.name} — ${reading.deviceName || devEUI}`,
                lat: coords.lat + microOffset,
                lng: coords.lng + microOffset * 0.7,
                status: isDeviceRecent(reading.receivedAt) ? 'online' : 'offline',
                sound_level_leq: dec.sound_level_leq ?? null,
                sound_level_lmax: dec.sound_level_lmax ?? null,
                sound_level_lmin: dec.sound_level_lmin ?? null,
                sound_level_inst: dec.sound_level_inst ?? null,
                sound_level_lcpeak: dec.sound_level_lcpeak ?? null,
                pm25: dec.pm2_5 ?? dec.pm25,
                pm10: dec.pm10,
                tsp: dec.tsp,
                temp: dec.temperature,
                humidity: dec.humidity,
                windSpeed: dec.wind_speed,
                windDir: dec.wind_direction,
              });
              idx++;
            }

            // If property has no device readings yet, still show property as a marker
            if (Object.keys(readings).length === 0) {
              realDevices.push({
                id: `prop-${prop.id}`,
                name: prop.name,
                type: 'noise',
                location: prop.location || prop.name,
                lat: coords.lat,
                lng: coords.lng,
                status: 'offline',
              });
            }
          } catch {
            // Telemetry fetch failed — still show property marker
            realDevices.push({
              id: `prop-${prop.id}`,
              name: prop.name,
              type: 'noise',
              location: prop.location || prop.name,
              lat: coords.lat,
              lng: coords.lng,
              status: 'offline',
            });
          }
        }

        if (cancelled) return;

        if (realDevices.length > 0) {
          setDevices(realDevices);
          setUsingDemoData(false);
          // Center map on average of all device positions
          const avgLat = realDevices.reduce((s, d) => s + d.lat, 0) / realDevices.length;
          const avgLng = realDevices.reduce((s, d) => s + d.lng, 0) / realDevices.length;
          setMapCenter({ lat: avgLat, lng: avgLng });
        }
      } catch (e) {
        console.warn('[EnvMonitor] Failed to load sensor data —', (e as Error).message);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    fetchRealData();
    return () => { cancelled = true; };
  }, [isLoaded]);

  const filteredDevices = mapFilter === 'all' ? devices : devices.filter(d => d.type === mapFilter);
  const noiseDevices = devices.filter(d => d.type === 'noise');
  const dustDevices = devices.filter(d => d.type === 'dust');
  const onlineNoise = noiseDevices.filter(d => d.status === 'online').length;
  const onlineDust = dustDevices.filter(d => d.status === 'online').length;

  // ── Active device for history fetching ──
  const activeNoiseDevEui = useMemo(() => {
    const nd = devices.filter(d => d.type === 'noise');
    if (selectedDevice) {
      const sel = nd.find(d => d.id === selectedDevice);
      if (sel?.status === 'online') return sel.id;
    }
    return nd.find(d => d.status === 'online')?.id ?? nd[0]?.id ?? null;
  }, [devices, selectedDevice]);

  const activeDustDevEui = useMemo(() => {
    const dd = devices.filter(d => d.type === 'dust');
    if (selectedDevice) {
      const sel = dd.find(d => d.id === selectedDevice);
      if (sel?.status === 'online') return sel.id;
    }
    return dd.find(d => d.status === 'online')?.id ?? dd[0]?.id ?? null;
  }, [devices, selectedDevice]);

  // ── Fetch noise history from real API ──
  useEffect(() => {
    if (!activeNoiseDevEui) { setNoiseHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    api.getDeviceHistory(activeNoiseDevEui, noiseTimeRange)
      .then(res => {
        if (cancelled) return;
        const mapped = (res.points || []).map((p: any) => ({
          time: p.timeLabel || p.time,
          sound_level_leq: p.sound_level_leq,
          sound_level_lmax: p.sound_level_lmax,
          sound_level_lmin: p.sound_level_lmin,
          sound_level_inst: p.sound_level_inst,
          sound_level_lcpeak: p.sound_level_lcpeak,
          _hour: new Date(p.time).getHours(),
        }));
        setNoiseHistory(downsample(mapped, 300));
      })
      .catch(() => { if (!cancelled) setNoiseHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeNoiseDevEui, noiseTimeRange]);

  // ── Fetch dust history from real API ──
  useEffect(() => {
    if (!activeDustDevEui) { setDustHistory([]); return; }
    let cancelled = false;
    api.getDeviceHistory(activeDustDevEui, dustTimeRange)
      .then(res => {
        if (cancelled) return;
        const mapped = (res.points || []).map((p: any) => ({
          time: p.timeLabel || p.time,
          pm25: p.pm2_5,
          pm10: p.pm10,
          tsp: p.tsp ?? null,
        }));
        setDustHistory(downsample(mapped, 300));
      })
      .catch(() => { if (!cancelled) setDustHistory([]); });
    return () => { cancelled = true; };
  }, [activeDustDevEui, dustTimeRange]);

  // Chart data — from real history
  const noiseChartData = noiseHistory;
  const dustChartData = dustHistory;

  // Noise compliance — derived from real history data
  const noiseCompliance = useMemo(() => {
    const total = noiseHistory.length;
    if (total === 0) return { total: 0, exceeded: 0, compliant: 0, pct: 100 };
    const exceeded = noiseHistory.filter((d: any) => {
      const limit = (d._hour >= 7 && d._hour < 19) ? 75 : 55;
      return d.sound_level_leq != null && d.sound_level_leq > limit;
    }).length;
    return { total, exceeded, compliant: total - exceeded, pct: Math.round(((total - exceeded) / total) * 100) };
  }, [noiseHistory]);

  // Dust compliance — derived from real history data
  const dustCompliance = useMemo(() => {
    const total = dustChartData.length;
    if (total === 0) return { total: 0, exceeded: 0, pct: 100 };
    let exceeded = 0;
    dustChartData.forEach((d: any) => {
      if (dustMetric === 'pm25' && d.pm25 != null && d.pm25 > 75) exceeded++;
      if (dustMetric === 'pm10' && d.pm10 != null && d.pm10 > 100) exceeded++;
      if (dustMetric === 'tsp' && d.tsp != null && d.tsp > 260) exceeded++;
    });
    return { total, exceeded, pct: total > 0 ? Math.round(((total - exceeded) / total) * 100) : 100 };
  }, [dustChartData, dustMetric]);

  const dustMetricConfig: Record<string, any> = {
    pm25: { label: 'PM2.5', unit: 'µg/m³', limit: 75, limitLabel: 'AQO (75µg/m³)', color: '#3b82f6', max: 200 },
    pm10: { label: 'PM10', unit: 'µg/m³', limit: 100, limitLabel: 'AQO (100µg/m³)', color: '#8b5cf6', max: 300 },
    tsp: { label: 'TSP', unit: 'µg/m³', limit: 260, limitLabel: 'EPD (260µg/m³)', color: '#f59e0b', max: 600 },
  };
  const mc = dustMetricConfig[dustMetric];

  function getMarkerColor(d: SensorDevice): string {
    if (d.status === 'offline') return '#94a3b8';
    if (d.type === 'noise') return getNoiseStatus(d.sound_level_leq ?? 0).hex;
    return getPM25Status(d.pm25 ?? 0).hex;
  }

  function getMarkerReading(d: SensorDevice): string {
    if (d.status === 'offline') return 'Offline';
    if (d.type === 'noise') return `${d.sound_level_leq?.toFixed(1)} dB(A)`;
    return `PM2.5: ${d.pm25?.toFixed(1)} µg/m³`;
  }

  // Google Maps callbacks
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Fit map to show all sensors
  const fitAllSensors = useCallback(() => {
    if (!mapRef.current || filteredDevices.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    filteredDevices.forEach(d => bounds.extend({ lat: d.lat, lng: d.lng }));
    mapRef.current.fitBounds(bounds, 60);
  }, [filteredDevices]);

  // Fly to selected device
  useEffect(() => {
    if (!mapRef.current || !device) return;
    mapRef.current.panTo({ lat: device.lat, lng: device.lng });
    mapRef.current.setZoom(17);
  }, [selectedDevice]);

  const cardCls = cn("rounded-xl border p-4 lg:p-5", isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-white shadow-sm");
  const headingCls = cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900");
  const subCls = cn("text-xs", isDark ? "text-slate-400" : "text-slate-500");

  const tooltipStyle = {
    borderRadius: '10px',
    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
    backgroundColor: isDark ? '#1e293b' : '#fff',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
    fontSize: '12px',
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={cn("text-xl lg:text-2xl font-bold", isDark ? "text-white" : "text-slate-900")}>
            Environmental Monitoring
          </h2>
          <p className={cn("text-sm mt-0.5 flex items-center gap-2", isDark ? "text-slate-400" : "text-slate-500")}>
            Noise & Dust · Real-time sensor overview · IEC 61672 / HK AQO compliant
            {dataLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-blue-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span>
            ) : devices.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400">NO DATA</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">LIVE</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
            isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        <StatCard title="Noise Sensors" value={`${onlineNoise}/${noiseDevices.length}`} icon={Volume2} status="normal">
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className={subCls}>{onlineNoise} online</span>
          </div>
        </StatCard>
        <StatCard title="Dust Sensors" value={`${onlineDust}/${dustDevices.length}`} icon={CloudFog} status="normal">
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className={subCls}>{onlineDust} online</span>
          </div>
        </StatCard>
        <StatCard title="Noise Compliance" value={`${noiseCompliance.pct}%`} icon={Shield}
          status={noiseCompliance.pct >= 95 ? 'normal' : noiseCompliance.pct >= 80 ? 'warning' : 'critical'}>
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>7-day · {noiseCompliance.exceeded} exceedance{noiseCompliance.exceeded !== 1 ? 's' : ''}</div>
        </StatCard>
        <StatCard title="Dust Compliance" value={`${dustCompliance.pct}%`} icon={Shield}
          status={dustCompliance.pct >= 95 ? 'normal' : dustCompliance.pct >= 80 ? 'warning' : 'critical'}>
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>{dustCompliance.exceeded} exceedance{dustCompliance.exceeded !== 1 ? 's' : ''}</div>
        </StatCard>
        <StatCard title="Active Alerts" value="3" icon={AlertTriangle} status="warning">
          <div className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>1 noise · 2 dust</div>
        </StatCard>
      </div>

      {/* ── Tab Bar ── */}
      <div className={cn("flex rounded-lg border p-1 w-fit", isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50")}>
        {([
          { key: 'map' as const, label: 'Map View', icon: MapIcon },
          { key: 'noise' as const, label: 'Noise Detail', icon: Volume2 },
          { key: 'dust' as const, label: 'Dust Detail', icon: CloudFog },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === t.key
                ? "bg-blue-600 text-white shadow-sm"
                : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
           TAB: MAP VIEW
         ══════════════════════════════════════════════════ */}
      <div style={{ display: activeTab === 'map' ? 'block' : 'none' }}>
        <div className="space-y-4">
          {/* Map + Device Info side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-5">
            {/* Map */}
            <div className={cn("xl:col-span-2 rounded-xl border overflow-hidden", isDark ? "border-slate-800" : "border-slate-200 shadow-sm")}>
              {/* Map toolbar */}
              <div className={cn("flex items-center justify-between px-4 py-2.5 border-b flex-wrap gap-2", isDark ? "border-slate-700 bg-slate-800/80" : "border-slate-100 bg-white")}>
                <div className="flex items-center gap-2">
                  <Layers className={cn("h-4 w-4", isDark ? "text-slate-400" : "text-slate-500")} />
                  <span className={cn("text-sm font-medium", isDark ? "text-white" : "text-slate-700")}>Sensor Map</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Sensor type filter */}
                  <div className={cn("flex rounded-md border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                    {(['all', 'noise', 'dust'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setMapFilter(f)}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded transition-colors capitalize",
                          mapFilter === f
                            ? "bg-blue-600 text-white"
                            : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {f === 'all' ? 'All' : f === 'noise' ? '🔊 Noise' : '💨 Dust'}
                      </button>
                    ))}
                  </div>
                  {/* Map type selector */}
                  <div className={cn("flex rounded-md border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                    {(['roadmap', 'satellite', 'hybrid'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setMapTypeId(t)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize",
                          mapTypeId === t
                            ? "bg-indigo-600 text-white"
                            : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        {t === 'roadmap' ? 'Map' : t === 'satellite' ? 'Sat' : 'Hybrid'}
                      </button>
                    ))}
                  </div>
                  {/* Toggle buttons */}
                  <button
                    onClick={() => setShowTraffic(v => !v)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                      showTraffic
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : isDark ? "text-slate-400 border-slate-700 hover:text-white" : "text-slate-500 border-slate-200 hover:text-slate-700"
                    )}
                    title="Toggle traffic layer"
                  >
                    <Navigation className="h-3 w-3 inline mr-1" />Traffic
                  </button>
                  <button
                    onClick={() => setShowCoverage(v => !v)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                      showCoverage
                        ? "bg-violet-600 text-white border-violet-600"
                        : isDark ? "text-slate-400 border-slate-700 hover:text-white" : "text-slate-500 border-slate-200 hover:text-slate-700"
                    )}
                    title="Toggle sensor coverage radius"
                  >
                    <MapPin className="h-3 w-3 inline mr-1" />Coverage
                  </button>
                  <button
                    onClick={fitAllSensors}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                      isDark ? "text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700" : "text-slate-500 border-slate-200 hover:text-slate-700 hover:bg-slate-50"
                    )}
                    title="Fit all sensors in view"
                  >
                    <Maximize2 className="h-3 w-3 inline mr-1" />Fit All
                  </button>
                </div>
              </div>
              <div className="h-[500px] rounded-lg overflow-hidden">
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={mapCenter}
                    zoom={16}
                    onLoad={onMapLoad}
                    options={{
                      // No custom styles — enables vector rendering + 3D buildings
                      tilt: 60,
                      heading: 320,
                      mapTypeId,
                      gestureHandling: 'greedy',
                      zoomControl: true,
                      mapTypeControl: false,
                      streetViewControl: true,
                      fullscreenControl: true,
                      scaleControl: true,
                    }}
                  >
                    {filteredDevices.map(d => {
                      const color = getMarkerColor(d);
                      const isSelected = d.id === selectedDevice;
                      return (
                        <MarkerF
                          key={d.id}
                          position={{ lat: d.lat, lng: d.lng }}
                          onClick={() => { setSelectedDevice(d.id); setInfoOpen(d.id); }}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: isSelected ? 12 : 8,
                            fillColor: color,
                            fillOpacity: isSelected ? 0.95 : 0.75,
                            strokeColor: '#ffffff',
                            strokeWeight: isSelected ? 3 : 2,
                          }}
                        >
                          {infoOpen === d.id && (
                            <InfoWindowF
                              position={{ lat: d.lat, lng: d.lng }}
                              onCloseClick={() => setInfoOpen(null)}
                            >
                              <div className="min-w-[200px] font-sans p-1">
                                <p className="font-bold text-sm mb-0.5">{d.name}</p>
                                <p className="text-slate-500 text-[11px] mb-1.5">{d.id} · {d.location}</p>
                                <div className="flex items-center gap-1.5 text-xs mb-1">
                                  <span className={cn("h-2 w-2 rounded-full", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                                  <span className="font-medium capitalize">{d.status}</span>
                                </div>
                                {d.status === 'online' && d.type === 'noise' && (
                                  <div className="text-xs space-y-0.5 border-t pt-2 mt-2 leading-relaxed">
                                    <p><span className="text-slate-500">LAeq:</span> <strong>{d.sound_level_leq?.toFixed(1)} dB(A)</strong></p>
                                    <p><span className="text-slate-500">LAFmax:</span> {d.sound_level_lmax?.toFixed(1)} dB(A)</p>
                                    <p><span className="text-slate-500">LAFmin:</span> {d.sound_level_lmin?.toFixed(1)} dB(A)</p>
                                    <p><span className="text-slate-500">LAF:</span> {d.sound_level_inst?.toFixed(1)} dB(A)</p>
                                    <p><span className="text-slate-500">LCPeak:</span> {d.sound_level_lcpeak?.toFixed(1)} dB(C)</p>
                                    <p className="mt-1 font-semibold" style={{ color: getNoiseStatus(d.sound_level_leq ?? 0).hex }}>
                                      {getNoiseStatus(d.sound_level_leq ?? 0).label}
                                    </p>
                                  </div>
                                )}
                                {d.status === 'online' && d.type === 'dust' && (
                                  <div className="text-xs space-y-0.5 border-t pt-2 mt-2 leading-relaxed">
                                    <p><span className="text-slate-500">PM2.5:</span> <strong>{d.pm25?.toFixed(1)} µg/m³</strong></p>
                                    <p><span className="text-slate-500">PM10:</span> {d.pm10?.toFixed(1)} µg/m³</p>
                                    <p><span className="text-slate-500">TSP:</span> {d.tsp} µg/m³</p>
                                    <p><span className="text-slate-500">Temp:</span> {d.temp}°C · Wind: {d.windSpeed}m/s {d.windDir}</p>
                                    <p className="mt-1 font-semibold" style={{ color: getPM25Status(d.pm25 ?? 0).hex }}>
                                      {getPM25Status(d.pm25 ?? 0).label}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </InfoWindowF>
                          )}
                        </MarkerF>
                      );
                    })}
                    {/* Traffic Layer */}
                    {showTraffic && <TrafficLayer />}
                    {/* Coverage radius circles */}
                    {showCoverage && filteredDevices.filter(d => d.status === 'online').map(d => (
                      <CircleF
                        key={`circle-${d.id}`}
                        center={{ lat: d.lat, lng: d.lng }}
                        radius={d.type === 'noise' ? 200 : 300}
                        options={{
                          fillColor: getMarkerColor(d),
                          fillOpacity: 0.1,
                          strokeColor: getMarkerColor(d),
                          strokeOpacity: 0.4,
                          strokeWeight: 1,
                        }}
                      />
                    ))}
                  </GoogleMap>
                ) : (
                  <div className="h-full flex items-center justify-center bg-slate-900/50">
                    <p className="text-slate-400 text-sm">Loading Google Maps...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Device List Panel */}
            <div className={cn("space-y-3 max-h-[490px] overflow-y-auto pr-1")}>
              <h3 className={headingCls}>All Sensors ({filteredDevices.length})</h3>
              {filteredDevices.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDevice(d.id)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3.5 transition-all",
                    d.id === selectedDevice
                      ? isDark ? "border-blue-500/50 bg-blue-950/30 ring-1 ring-blue-500/30" : "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                      : isDark ? "border-slate-800 bg-slate-800/50 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 h-3 w-3 rounded-full flex-shrink-0", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {d.type === 'noise' ? <Volume2 className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" /> : <CloudFog className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />}
                        <p className={cn("text-sm font-semibold truncate", isDark ? "text-white" : "text-slate-900")}>{d.name}</p>
                      </div>
                      <p className={cn("text-[11px] truncate mb-1.5", isDark ? "text-slate-500" : "text-slate-400")}>{d.id} · {d.location}</p>
                      {d.status === 'online' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: getMarkerColor(d) }}>
                            {getMarkerReading(d)}
                          </span>
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                            d.type === 'noise'
                              ? getNoiseStatus(d.sound_level_leq ?? 0).color === 'emerald' ? "bg-emerald-50 text-emerald-600" : getNoiseStatus(d.sound_level_leq ?? 0).color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                              : getPM25Status(d.pm25 ?? 0).color === 'emerald' ? "bg-emerald-50 text-emerald-600" : getPM25Status(d.pm25 ?? 0).color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                          )}>
                            {d.type === 'noise' ? getNoiseStatus(d.sound_level_leq ?? 0).label : getPM25Status(d.pm25 ?? 0).label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Offline</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Overview Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
            {/* Noise mini trend */}
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-blue-400" />
                  <h3 className={headingCls}>Noise Trend (24h)</h3>
                </div>
                <button onClick={() => setActiveTab('noise')} className="text-xs text-blue-500 hover:text-blue-400 font-medium">
                  View Details →
                </button>
              </div>
              <div className="h-[200px] w-full min-w-0">
                <SafeChartContainer>
                  <AreaChart data={noiseChartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <defs>
                      <linearGradient id="noiseGradMap" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[20, 'auto']} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} />
                    <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1} />
                    <Area type="monotone" dataKey="sound_level_leq" name="LAeq" stroke="#8b5cf6" fill="url(#noiseGradMap)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </SafeChartContainer>
              </div>
            </div>

            {/* Dust mini trend */}
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CloudFog className="h-4 w-4 text-amber-400" />
                  <h3 className={headingCls}>PM2.5 Trend (24h)</h3>
                </div>
                <button onClick={() => setActiveTab('dust')} className="text-xs text-blue-500 hover:text-blue-400 font-medium">
                  View Details →
                </button>
              </div>
              <div className="h-[200px] w-full min-w-0">
                <SafeChartContainer>
                  <AreaChart data={dustChartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                    <defs>
                      <linearGradient id="dustGradMap" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} />
                    <Area type="monotone" dataKey="pm25" name="PM2.5" stroke="#f59e0b" fill="url(#dustGradMap)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </SafeChartContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
           TAB: NOISE DETAIL
         ══════════════════════════════════════════════════ */}
      {activeTab === 'noise' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-5">
            {/* Left: Gauge + Stats */}
            <div className="space-y-4">
              {/* Noise gauge for selected or first online */}
              {(() => {
                const nd = (device?.type === 'noise' && device.status === 'online') ? device : noiseDevices.find(d => d.status === 'online') ?? noiseDevices[0];
                if (!nd) return <div className={cardCls}><p className={cn("text-sm text-center py-8", isDark ? "text-slate-500" : "text-slate-400")}>No noise sensors available</p></div>;
                const ns = getNoiseStatus(nd.sound_level_leq ?? 0);
                return (
                  <>
                    {/* Device selector */}
                    <div className={cardCls}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className={headingCls}>Select Sensor</h3>
                      </div>
                      <div className="space-y-1.5">
                        {noiseDevices.map(d => (
                          <button
                            key={d.id}
                            onClick={() => setSelectedDevice(d.id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                              d.id === selectedDevice
                                ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                                : isDark ? "text-slate-300 hover:bg-slate-700/50" : "text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <div className={cn("h-2 w-2 rounded-full flex-shrink-0", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                            <span className="truncate flex-1">{d.name}</span>
                            {d.status === 'online' && <span className="text-xs font-semibold" style={{ color: getNoiseStatus(d.sound_level_leq ?? 0).hex }}>{d.sound_level_leq?.toFixed(1)} dB</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Gauge */}
                    <div className={cardCls}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={headingCls}>Real-time Level</h3>
                        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                          ns.color === 'emerald' ? (isDark ? "bg-emerald-950 text-emerald-400" : "bg-emerald-50 text-emerald-600") :
                          ns.color === 'amber' ? (isDark ? "bg-amber-950 text-amber-400" : "bg-amber-50 text-amber-600") :
                          (isDark ? "bg-red-950 text-red-400" : "bg-red-50 text-red-600")
                        )}>
                          <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", ns.bg)} />
                          {ns.label}
                        </div>
                      </div>
                      <div className="flex justify-center py-1">
                        <NoiseGauge value={nd.sound_level_leq ?? 0} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {[
                          { label: 'LAFmax', value: nd.sound_level_lmax ?? 0 },
                          { label: 'LAFmin', value: nd.sound_level_lmin ?? 0 },
                          { label: 'LAF', value: nd.sound_level_inst ?? 0 },
                          { label: 'LCPeak', value: nd.sound_level_lcpeak ?? 0 },
                        ].map(m => (
                          <div key={m.label} className={cn("rounded-lg p-2 text-center", isDark ? "bg-slate-900/50" : "bg-slate-50 border border-slate-100")}>
                            <p className={cn("text-[10px] font-semibold uppercase tracking-wider mb-0.5", isDark ? "text-slate-500" : "text-slate-400")}>{m.label}</p>
                            <p className={cn("text-base font-bold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{m.value.toFixed(1)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Compliance donut */}
                    <div className={cardCls}>
                      <h3 className={cn(headingCls, "mb-3")}>7-Day Compliance</h3>
                      <div className="flex items-center justify-center mb-2">
                        <div className="relative h-[110px] w-[110px]">
                          <SafeChartContainer>
                            <PieChart>
                              <Pie data={[{ v: noiseCompliance.compliant }, { v: noiseCompliance.exceeded }]} cx="50%" cy="50%" innerRadius={36} outerRadius={48} paddingAngle={3} dataKey="v" stroke="none">
                                <Cell fill="#10b981" />
                                <Cell fill="#ef4444" />
                              </Pie>
                            </PieChart>
                          </SafeChartContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={cn("text-lg font-bold", noiseCompliance.pct >= 95 ? "text-emerald-500" : "text-amber-500")}>{noiseCompliance.pct}%</span>
                            <span className={cn("text-[9px]", isDark ? "text-slate-500" : "text-slate-400")}>Compliant</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Within limit</span>
                          <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>{noiseCompliance.compliant}h</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5"><XCircle className="h-3 w-3 text-red-500" /> Exceedance</span>
                          <span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>{noiseCompliance.exceeded}h</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right: Charts */}
            <div className="xl:col-span-2 space-y-4">
              {/* Noise Trend */}
              <div className={cardCls}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={headingCls}>Noise Level Trend</h3>
                  <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                    {(['1h', '24h', '7d'] as const).map(t => (
                      <button key={t} onClick={() => setNoiseTimeRange(t)} className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                        noiseTimeRange === t ? "bg-blue-600 text-white" : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                      )}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="h-[280px] w-full min-w-0">
                  <SafeChartContainer>
                    <AreaChart data={noiseChartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                      <defs>
                        <linearGradient id="leqGradEnv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={50} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[20, 'auto']} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, marginBottom: 4, color: isDark ? '#e2e8f0' : '#1e293b' }} />
                      <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Day 75dB', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                      <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Night 55dB', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                      <Area type="monotone" dataKey="sound_level_lmax" name="LAFmax" stroke="#a855f7" fill="none" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                      <Area type="monotone" dataKey="sound_level_leq" name="LAeq" stroke="#8b5cf6" fill="url(#leqGradEnv)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="sound_level_lmin" name="LAFmin" stroke="#c084fc" fill="none" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                      <Area type="monotone" dataKey="sound_level_lcpeak" name="LCPeak" stroke="#dc2626" fill="none" strokeWidth={1} strokeDasharray="2 2" dot={false} />
                    </AreaChart>
                  </SafeChartContainer>
                </div>
              </div>

              {/* All Noise Sensors Table */}
              <div className={cardCls}>
                <h3 className={cn(headingCls, "mb-3")}>All Noise Sensors</h3>
                <div className="overflow-x-auto -mx-4 lg:-mx-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={cn("border-b", isDark ? "border-slate-700" : "border-slate-100")}>
                        {['Status', 'Device', 'Location', 'LAeq', 'LAFmax', 'LAFmin', 'LCPeak', 'Level'].map(h => (
                          <th key={h} className={cn("px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {noiseDevices.map(d => {
                        const s = getNoiseStatus(d.sound_level_leq ?? 0);
                        return (
                          <tr key={d.id} onClick={() => setSelectedDevice(d.id)}
                            className={cn("border-b cursor-pointer transition-colors",
                              d.id === selectedDevice ? (isDark ? "bg-blue-950/20" : "bg-blue-50/50") : "",
                              isDark ? "border-slate-800 hover:bg-slate-800/50" : "border-slate-50 hover:bg-slate-50"
                            )}>
                            <td className="px-4 py-3"><div className={cn("h-2.5 w-2.5 rounded-full", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} /></td>
                            <td className="px-4 py-3">
                              <p className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>{d.name}</p>
                              <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{d.id}</p>
                            </td>
                            <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{d.location}</td>
                            <td className={cn("px-4 py-3 font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{d.status === 'online' ? d.sound_level_leq?.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>{d.status === 'online' ? d.sound_level_lmax?.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>{d.status === 'online' ? d.sound_level_lmin?.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-3 tabular-nums text-red-500 font-medium", isDark ? "" : "")}>{d.status === 'online' ? d.sound_level_lcpeak?.toFixed(1) : '—'}</td>
                            <td className="px-4 py-3">
                              {d.status === 'online' ? (
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                  s.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : s.color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                                )}>{s.label}</span>
                              ) : <span className="text-xs text-slate-400">Offline</span>}
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
      )}

      {/* ══════════════════════════════════════════════════
           TAB: DUST DETAIL
         ══════════════════════════════════════════════════ */}
      {activeTab === 'dust' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-5">
            {/* Left: Gauges + Weather */}
            <div className="space-y-4">
              {(() => {
                const dd = (device?.type === 'dust' && device.status === 'online') ? device : dustDevices.find(d => d.status === 'online') ?? dustDevices[0];
                if (!dd) return <div className={cardCls}><p className={cn("text-sm text-center py-8", isDark ? "text-slate-500" : "text-slate-400")}>No dust sensors available</p></div>;
                return (
                  <>
                    {/* Device selector */}
                    <div className={cardCls}>
                      <h3 className={cn(headingCls, "mb-3")}>Select Sensor</h3>
                      <div className="space-y-1.5">
                        {dustDevices.map(d => (
                          <button
                            key={d.id}
                            onClick={() => setSelectedDevice(d.id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                              d.id === selectedDevice
                                ? isDark ? "bg-blue-950/40 text-blue-400" : "bg-blue-50 text-blue-600"
                                : isDark ? "text-slate-300 hover:bg-slate-700/50" : "text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <div className={cn("h-2 w-2 rounded-full flex-shrink-0", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} />
                            <span className="truncate flex-1">{d.name}</span>
                            {d.status === 'online' && <span className="text-xs font-semibold" style={{ color: getPM25Status(d.pm25 ?? 0).hex }}>{d.pm25?.toFixed(1)}</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* PM Gauges */}
                    <div className={cardCls}>
                      <h3 className={cn(headingCls, "mb-3")}>Real-time Levels</h3>
                      <div className="grid grid-cols-3 gap-1">
                        <DustGauge value={dd.pm25 ?? 0} max={200} unit="µg/m³" label="PM2.5" statusColor={getPM25Status(dd.pm25 ?? 0).hex} />
                        <DustGauge value={dd.pm10 ?? 0} max={300} unit="µg/m³" label="PM10" statusColor={getPM10Status(dd.pm10 ?? 0).hex} />
                        <DustGauge value={dd.tsp ?? 0} max={600} unit="µg/m³" label="TSP" statusColor={getTSPStatus(dd.tsp ?? 0).hex} />
                      </div>
                    </div>

                    {/* Weather */}
                    <div className={cardCls}>
                      <h3 className={cn(headingCls, "mb-3")}>Site Conditions</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { icon: Thermometer, label: 'Temp', value: `${dd.temp}°C`, color: 'text-amber-500' },
                          { icon: Droplets, label: 'Humidity', value: `${dd.humidity}%`, color: 'text-blue-500' },
                          { icon: Wind, label: 'Wind', value: `${dd.windSpeed} m/s`, color: 'text-cyan-500' },
                          { icon: Eye, label: 'Direction', value: dd.windDir ?? '—', color: 'text-slate-400' },
                        ].map(w => (
                          <div key={w.label} className={cn("rounded-lg p-2.5", isDark ? "bg-slate-900/50" : "bg-slate-50 border border-slate-100")}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <w.icon className={cn("h-3 w-3", w.color)} />
                              <span className={cn("text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>{w.label}</span>
                            </div>
                            <p className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>{w.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Compliance */}
                    <div className={cardCls}>
                      <h3 className={cn(headingCls, "mb-3")}>Compliance Summary</h3>
                      <div className="flex items-center justify-center mb-2">
                        <div className="relative h-[100px] w-[100px]">
                          <SafeChartContainer>
                            <PieChart>
                              <Pie data={[{ v: dustCompliance.total - dustCompliance.exceeded }, { v: dustCompliance.exceeded }]} cx="50%" cy="50%" innerRadius={32} outerRadius={44} paddingAngle={3} dataKey="v" stroke="none">
                                <Cell fill="#10b981" />
                                <Cell fill="#ef4444" />
                              </Pie>
                            </PieChart>
                          </SafeChartContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={cn("text-lg font-bold", dustCompliance.pct >= 95 ? "text-emerald-500" : "text-amber-500")}>{dustCompliance.pct}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className={subCls}>HK AQO PM2.5 (24h)</span><span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>75 µg/m³</span></div>
                        <div className="flex justify-between"><span className={subCls}>HK AQO PM10 (24h)</span><span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>100 µg/m³</span></div>
                        <div className="flex justify-between"><span className={subCls}>EPD TSP (24h Limit)</span><span className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>260 µg/m³</span></div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right: Charts */}
            <div className="xl:col-span-2 space-y-4">
              {/* Dust trend */}
              <div className={cardCls}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className={headingCls}>Particulate Matter Trend</h3>
                  <div className="flex items-center gap-2">
                    <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                      {(['pm25', 'pm10', 'tsp'] as const).map(m => (
                        <button key={m} onClick={() => setDustMetric(m)} className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                          dustMetric === m ? "bg-blue-600 text-white" : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                        )}>{dustMetricConfig[m].label}</button>
                      ))}
                    </div>
                    <div className={cn("flex rounded-lg border p-0.5", isDark ? "border-slate-700" : "border-slate-200")}>
                      {(['1h', '24h', '7d'] as const).map(t => (
                        <button key={t} onClick={() => setDustTimeRange(t)} className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                          dustTimeRange === t ? "bg-blue-600 text-white" : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700"
                        )}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="h-[280px] w-full min-w-0">
                  <SafeChartContainer>
                    <AreaChart data={dustChartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                      <defs>
                        <linearGradient id="dustGradEnv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={mc.color} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={mc.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={50} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, marginBottom: 4, color: isDark ? '#e2e8f0' : '#1e293b' }} />
                      <ReferenceLine y={mc.limit} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: mc.limitLabel, position: 'right', fontSize: 9, fill: '#ef4444' }} />
                      <Area type="monotone" dataKey={dustMetric} name={mc.label} stroke={mc.color} fill="url(#dustGradEnv)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </SafeChartContainer>
                </div>
              </div>

              {/* Multi-metric comparison */}
              <div className={cardCls}>
                <h3 className={cn(headingCls, "mb-4")}>All Metrics Comparison</h3>
                <div className="h-[220px] w-full min-w-0">
                  <SafeChartContainer>
                    <LineChart data={dustChartData.filter((_: any, i: number) => i % 3 === 0)} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={60} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pm10" name="PM10" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="tsp" name="TSP" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </SafeChartContainer>
                </div>
              </div>

              {/* All Dust Sensors Table */}
              <div className={cardCls}>
                <h3 className={cn(headingCls, "mb-3")}>All Dust Sensors</h3>
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
                      {dustDevices.map(d => {
                        const s = getPM25Status(d.pm25 ?? 0);
                        return (
                          <tr key={d.id} onClick={() => setSelectedDevice(d.id)}
                            className={cn("border-b cursor-pointer transition-colors",
                              d.id === selectedDevice ? (isDark ? "bg-blue-950/20" : "bg-blue-50/50") : "",
                              isDark ? "border-slate-800 hover:bg-slate-800/50" : "border-slate-50 hover:bg-slate-50"
                            )}>
                            <td className="px-4 py-3"><div className={cn("h-2.5 w-2.5 rounded-full", d.status === 'online' ? "bg-emerald-500" : "bg-slate-400")} /></td>
                            <td className="px-4 py-3">
                              <p className={cn("font-medium", isDark ? "text-white" : "text-slate-900")}>{d.name}</p>
                              <p className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{d.id}</p>
                            </td>
                            <td className={cn("px-4 py-3 text-xs max-w-[140px] truncate", isDark ? "text-slate-400" : "text-slate-500")}>{d.location}</td>
                            <td className={cn("px-4 py-3 font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{d.status === 'online' ? d.pm25?.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>{d.status === 'online' ? d.pm10?.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-3 tabular-nums", isDark ? "text-slate-300" : "text-slate-600")}>{d.status === 'online' ? d.tsp : '—'}</td>
                            <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{d.status === 'online' ? `${d.temp}°C` : '—'}</td>
                            <td className={cn("px-4 py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{d.status === 'online' ? `${d.windSpeed}m/s ${d.windDir}` : '—'}</td>
                            <td className="px-4 py-3">
                              {d.status === 'online' ? (
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                  s.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : s.color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                                )}>{s.label}</span>
                              ) : <span className="text-xs text-slate-400">Offline</span>}
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
      )}
    </div>
  );
}
