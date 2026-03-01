import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft, MapPin, Droplets, Thermometer, Wind, AlertTriangle,
  CheckCircle2, Layers, Search, Activity, Eye, Zap, Sun,
  Loader2, ServerCrash, Plus, Cpu, Pencil, Trash2, MoreHorizontal, Camera,
  LayoutDashboard, BellRing, Gauge, RefreshCw,
  Volume2, Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';
import { StatCard } from '@/app/components/StatCard';
import { EditPropertyDialog } from '@/app/components/EditPropertyDialog';
import { DeletePropertyDialog } from '@/app/components/DeletePropertyDialog';
import { ChangePropertyPhotoDialog } from '@/app/components/ChangePropertyPhotoDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { PropertyDevicePanel } from '@/app/components/PropertyDevicePanel';
import { PropertyBMSPanel } from '@/app/components/PropertyBMSPanel';
import { api, type PropertyDetails, type PropertyTelemetry, type Device, type Alarm } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';

// ── Deterministic pseudo-random ──────────────────────────
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  return function () {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

// ── Chart data generators ────────────────────────────────
function generateChartData(propertyId: string) {
  const rand = seededRandom(propertyId);
  const times = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'];
  return times.map(time => ({
    time,
    waterFlow: Math.round(50 + rand() * 550),
    pressure: Math.round(45 + rand() * 25),
    humidity: Math.round(30 + rand() * 35),
  }));
}

function generateEnvironmentalData(propertyId: string) {
  const rand = seededRandom(propertyId + '-env');
  return {
    temperature: +(18 + rand() * 8).toFixed(1),
    humidity: Math.round(35 + rand() * 30),
    co2: Math.round(350 + rand() * 350),
    aqi: Math.round(20 + rand() * 80),
    noise: Math.round(30 + rand() * 35),
    pressure: Math.round(45 + rand() * 25),
  };
}

function generateZones(type: string, propertyId: string) {
  const rand = seededRandom(propertyId + '-zones');
  const zoneTemplates: Record<string, string[]> = {
    Commercial: ['Lobby & Reception', 'Office Levels 1-10', 'Office Levels 11-20', 'Rooftop & Plant Room', 'Basement Parking'],
    Residential: ['Ground Floor & Amenities', 'Residential Floors 1-5', 'Residential Floors 6-12', 'Rooftop Terrace', 'Underground Parking'],
    Industrial: ['Loading Docks', 'Main Warehouse Floor', 'Cold Storage', 'Admin Offices', 'Utility Room'],
    Retail: ['Ground Floor Retail', 'Upper Level Shopping', 'Food Court', 'Storage & Back-of-house', 'Parking Garage'],
  };
  const zones = zoneTemplates[type] || zoneTemplates['Commercial'];
  return zones.map((name, i) => {
    const r = rand();
    const status = r > 0.8 ? 'warning' : 'normal';
    return {
      id: `Z-${i + 1}`,
      name,
      status,
      sensors: Math.round(5 + rand() * 40),
      alerts: status === 'warning' ? Math.round(1 + rand() * 3) : 0,
    };
  });
}

function generateDescription(property: PropertyDetails) {
  const typeDescriptions: Record<string, string> = {
    Commercial: `A modern commercial property located in ${property.location}. Equipped with comprehensive IoT monitoring for HVAC, water systems, and occupancy tracking across all zones.`,
    Residential: `A residential complex in ${property.location} with smart home IoT integration. Monitors water supply, climate control, and security systems for resident safety and comfort.`,
    Industrial: `An industrial facility in ${property.location} with specialized sensor networks for temperature-controlled environments, leak detection, and equipment monitoring.`,
    Retail: `A retail property in ${property.location} featuring advanced environmental monitoring for customer comfort, energy efficiency, and safety compliance.`,
  };
  return typeDescriptions[property.type] || typeDescriptions['Commercial'];
}

// ── Tab definitions ──────────────────────────────────────
type TabId = 'overview' | 'devices' | 'bms' | 'alarms';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'devices',  label: 'Devices',  icon: Cpu },
  { id: 'bms',      label: 'BMS',      icon: Gauge },
  { id: 'alarms',   label: 'Alarms',   icon: BellRing },
];

// ── Environmental gauge ──────────────────────────────────
function EnvironmentGauge({ label, value, unit, min, max, color, icon: Icon }: {
  label: string; value: number; unit: string; min: number; max: number; color: string; icon: React.ElementType;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-2.5 sm:p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        <div className="p-1 sm:p-1.5 rounded-lg shrink-0" style={{ backgroundColor: color + '15' }}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color }} />
        </div>
        <span className="text-xs sm:text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5 sm:gap-1 mb-1.5 sm:mb-2">
        <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900">{value}</span>
        <span className="text-xs sm:text-sm text-slate-400">{unit}</span>
      </div>
      <div className="h-1 sm:h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between mt-0.5 sm:mt-1">
        <span className="text-[11px] sm:text-xs text-slate-400">{min}</span>
        <span className="text-[11px] sm:text-xs text-slate-400">{max}</span>
      </div>
    </div>
  );
}

// ── Device type donut ────────────────────────────────────
const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

function DeviceTypeDonut({ devices }: { devices: Device[] }) {
  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [devices]);

  if (typeData.length === 0) return null;

  return (
    <div className="h-[180px] w-full relative flex items-center justify-center">
      <SafeChartContainer>
        <PieChart>
          <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
            {typeData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 13 }} />
        </PieChart>
      </SafeChartContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-slate-900">{devices.length}</span>
        <span className="text-xs text-slate-500">Total</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export function BuildingDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('24h');
  const [sensorSearch, setSensorSearch] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [telemetry, setTelemetry] = useState<PropertyTelemetry | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<string>('all');
  const [selectedOverviewSensor, setSelectedOverviewSensor] = useState<string>('all');
  const [selectedTrendCategory, setSelectedTrendCategory] = useState<string>('air_quality');

  const fetchProperty = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getProperty(id);
      setProperty(data);
    } catch (err: any) {
      console.debug(`Failed to load property ${id}:`, err);
      setError(err.message || 'Failed to load property details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchAllDevices = useCallback(async () => {
    try {
      const devices = await api.getDevices();
      setAllDevices(devices);
    } catch (err) {
      console.debug('Failed to load devices for assignment:', err);
    }
  }, []);

  const fetchTelemetry = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getPropertyTelemetry(id);
      setTelemetry(data);
    } catch (err) {
      console.debug('Failed to load property telemetry:', err);
    }
  }, [id]);

  const fetchAlarms = useCallback(async () => {
    if (!property) return;
    setAlarmsLoading(true);
    try {
      const all = await api.getAlarms();
      setAlarms(all.filter(a => a.property === property.name));
    } catch (err) {
      console.error('Failed to load alarms:', err);
    } finally {
      setAlarmsLoading(false);
    }
  }, [property]);

  useEffect(() => { fetchProperty(); fetchAllDevices(); fetchTelemetry(); }, [fetchProperty, fetchAllDevices, fetchTelemetry]);
  useEffect(() => { if (property) fetchAlarms(); }, [property, fetchAlarms]);

  // Auto-refresh every 30s (only when tab is visible)
  useEffect(() => {
    const silentRefresh = () => {
      if (!document.hidden && id) {
        api.getProperty(id).then(setProperty).catch(() => {});
        api.getDevices().then(setAllDevices).catch(() => {});
        api.getPropertyTelemetry(id).then(setTelemetry).catch(() => {});
      }
    };
    const timer = setInterval(silentRefresh, 30000);
    document.addEventListener('visibilitychange', silentRefresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', silentRefresh); };
  }, [id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProperty(), fetchAllDevices(), fetchAlarms(), fetchTelemetry()]);
    setRefreshing(false);
  };

  // Use real telemetry if available, fall back to demo data for demo properties
  const isLive = telemetry?.source === 'live';

  // Sensor list for per-sensor filtering
  const sensorList = useMemo(() => telemetry?.sensorList ?? [], [telemetry]);

  const chartData = useMemo(() => {
    if (isLive && telemetry?.history && telemetry.history.length > 0) {
      const raw = telemetry.history;
      // Filter by selected sensor
      if (selectedSensor !== 'all') {
        return raw.filter((p: any) => (p.devEUI || '').toLowerCase() === selectedSensor.toLowerCase());
      }
      return raw;
    }
    return id ? generateChartData(id) : [];
  }, [id, isLive, telemetry, selectedSensor]);

  const envData = useMemo(() => {
    if (isLive && telemetry) {
      // Per-sensor view: show that sensor's readings directly
      if (selectedOverviewSensor !== 'all' && telemetry.deviceReadings) {
        const reading = telemetry.deviceReadings[selectedOverviewSensor.toLowerCase()];
        if (reading?.decoded) {
          const d = reading.decoded;
          return {
            temperature: d.temperature ?? null,
            humidity: d.humidity ?? null,
            co2: d.co2 ?? null,
            tvoc: d.tvoc ?? null,
            pm2_5: d.pm2_5 ?? null,
            pm10: d.pm10 ?? null,
            barometric_pressure: d.barometric_pressure ?? null,
            illuminance: d.illuminance ?? null,
            pir: d.pir ?? null,
            sound_level_leq: d.sound_level_leq ?? null,
            sound_level_lmax: d.sound_level_lmax ?? null,
            sound_level_lmin: d.sound_level_lmin ?? null,
            water_leak: d.water_leak ?? null,
          };
        }
      }
      // All sensors: show aggregated (default)
      if (telemetry.environment) {
        const e = telemetry.environment;
        return {
          temperature: e.temperature,
          humidity: e.humidity,
          co2: e.co2,
          tvoc: e.tvoc,
          pm2_5: e.pm2_5,
          pm10: e.pm10,
          barometric_pressure: e.barometric_pressure,
          illuminance: e.illuminance,
          pir: e.pir,
          sound_level_leq: e.sound_level_leq,
          sound_level_lmax: e.sound_level_lmax,
          sound_level_lmin: e.sound_level_lmin,
          water_leak: e.water_leak,
        };
      }
    }
    // Demo fallback
    if (!id) return null;
    const fake = generateEnvironmentalData(id);
    return { ...fake, tvoc: null, pm2_5: null, pm10: null, barometric_pressure: null, illuminance: null, pir: null, sound_level_leq: null, sound_level_lmax: null, sound_level_lmin: null, water_leak: null };
  }, [id, isLive, telemetry, selectedOverviewSensor]);

  const zones = useMemo(() => {
    if (isLive && telemetry?.zones && telemetry.zones.length > 0) return telemetry.zones;
    return property ? generateZones(property.type, property.id) : [];
  }, [property, isLive, telemetry]);
  const description = useMemo(() => property ? generateDescription(property) : '', [property]);

  const waterParts = useMemo(() => {
    if (!property) return { active: 0, total: 0 };
    const parts = (property.waterSensors || '0/0').split('/');
    return { active: parseInt(parts[0]) || 0, total: parseInt(parts[1]) || 0 };
  }, [property]);

  const statusLabel = property?.status?.toLowerCase() || 'normal';
  const isNormal = statusLabel === 'normal';

  const unassignedDevices = useMemo(() => allDevices.filter(d => !d.building || d.building === 'Unassigned'), [allDevices]);

  const pendingAlarms = useMemo(() => alarms.filter(a => a.status === 'pending'), [alarms]);
  const resolvedAlarms = useMemo(() => alarms.filter(a => a.status === 'resolved'), [alarms]);

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="text-slate-500 text-sm">Loading property details...</p>
      </div>
    );
  }

  // --- Error ---
  if (error || !property) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <ServerCrash className="h-14 w-14 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-700">Property Not Found</h2>
        <p className="text-sm text-slate-500 max-w-md text-center">
          {error || `The property with ID "${id}" could not be found.`}
        </p>
        <Link to="/buildings" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back to Properties
        </Link>
      </div>
    );
  }

  const heroImage = property.image?.replace('w=100', 'w=1200') || property.image;

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* ═══ Hero Header ═══ */}
      <div className="relative h-40 sm:h-48 lg:h-56 w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-900 shadow-lg">
        <img src={heroImage} alt={property.name} className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

        <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
          <Link to="/buildings" className="flex items-center gap-1.5 sm:gap-2 text-white/80 hover:text-white transition-colors backdrop-blur-sm bg-black/20 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium">
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Back to Properties</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>

        <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight truncate">{property.name}</h1>
              <span className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                property.type === 'Commercial' ? "bg-blue-500/20 text-blue-200 backdrop-blur-sm" :
                property.type === 'Residential' ? "bg-emerald-500/20 text-emerald-200 backdrop-blur-sm" :
                property.type === 'Industrial' ? "bg-amber-500/20 text-amber-200 backdrop-blur-sm" :
                "bg-purple-500/20 text-purple-200 backdrop-blur-sm"
              )}>
                {property.type}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-slate-200">
              <span className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-4 w-4" /> {property.location}
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-400 md:block" />
              <span className="flex items-center gap-1.5 text-sm">
                {isNormal
                  ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> System Operational</>
                  : <><AlertTriangle className="h-4 w-4 text-amber-400" /> Attention Required</>}
              </span>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => setShowPhotoDialog(true)}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-md hover:bg-white/20 transition-all flex items-center gap-1.5"
              title="Change Photo"
            >
              <Camera className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Photo</span>
            </button>
            <button
              onClick={handleRefresh}
              className="rounded-xl bg-white/10 p-2 text-white backdrop-blur-md hover:bg-white/20 transition-all"
              title="Refresh"
            >
              <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
            </button>
            {isAdmin && (
              <>
                <button onClick={() => setShowEditDialog(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md hover:bg-white/20 transition-all flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="rounded-xl bg-white/10 p-2 text-white backdrop-blur-md hover:bg-white/20 transition-all">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    <button
                      onClick={() => navigate(`/devices?building=${encodeURIComponent(property.name)}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <Cpu className="h-4 w-4" /> Manage All Devices
                    </button>
                    <button
                      onClick={() => setShowDeleteDialog(true)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" /> Delete Property
                    </button>
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Description ═══ */}
      <p className="text-xs sm:text-sm text-slate-500 max-w-3xl leading-relaxed">{description}</p>

      {/* ═══ Stats Grid ═══ */}
      <div className="grid gap-2.5 sm:gap-5 grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Devices" value={String(property.deviceCount)} icon={Cpu}>
          <p className="mt-4 text-xs text-slate-500">{property.onlineDevices} online, {property.offlineDevices} offline</p>
        </StatCard>
        <StatCard title="Active Alerts" value={String(pendingAlarms.length)} unit={pendingAlarms.length > 0 ? "Pending" : "None"} icon={AlertTriangle} status={pendingAlarms.length > 0 ? 'warning' : 'normal'}>
          <p className={clsx("mt-4 text-xs font-medium", pendingAlarms.length > 0 ? "text-amber-600" : "text-emerald-600")}>
            {pendingAlarms.length > 0 ? 'Attention needed' : 'All systems healthy'}
          </p>
        </StatCard>
        <StatCard title="Avg. Temperature" value={String(envData?.temperature ?? '--')} unit="°C" icon={Thermometer} trend={isLive ? undefined : -0.5}>
          <p className="mt-4 text-xs text-slate-500">{isLive ? 'Live sensor data' : 'Demo data'}</p>
        </StatCard>
        <StatCard title="Device Status" value={`${waterParts.active}/${waterParts.total}`} icon={Droplets} status={waterParts.active < waterParts.total ? 'warning' : 'normal'}>
          <p className="mt-4 text-xs text-slate-500">
            {waterParts.total > 0 ? `${Math.round((waterParts.active / waterParts.total) * 100)}% online` : 'No devices assigned'}
          </p>
        </StatCard>
      </div>

      {/* ═══ Tab Navigation ═══ */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto -mb-px" aria-label="Tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount = tab.id === 'alarms' ? pendingAlarms.length :
                               tab.id === 'devices' ? property.deviceCount : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                )}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {tab.label}
                {badgeCount > 0 && (
                  <span className={clsx(
                    "ml-0.5 sm:ml-1 inline-flex h-4 sm:h-5 min-w-[16px] sm:min-w-[20px] items-center justify-center rounded-full px-1 sm:px-1.5 text-xs sm:text-xs font-bold",
                    isActive ? "bg-blue-100 text-blue-700" :
                    tab.id === 'alarms' && pendingAlarms.length > 0 ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-600"
                  )}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ═══ Tab Content ═══ */}
      <div className="animate-in fade-in duration-300">

        {/* ───── OVERVIEW TAB ───── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Environmental gauges */}
            {/* Environmental gauges - real metrics when live, demo when not */}
            {envData && (
              <div>
                {isLive && (
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-medium text-emerald-600">Live Sensor Data</span>
                      <span className="text-xs text-slate-400">({telemetry?.sensorCount ?? 0} sensor{(telemetry?.sensorCount ?? 0) !== 1 ? 's' : ''})</span>
                    </div>
                    {sensorList.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 -mb-1 scrollbar-thin">
                        <button
                          onClick={() => setSelectedOverviewSensor('all')}
                          className={clsx(
                            "rounded-full px-2.5 sm:px-3 py-1 text-xs sm:text-xs font-medium transition-all whitespace-nowrap shrink-0",
                            selectedOverviewSensor === 'all'
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          All (Avg)
                        </button>
                        {sensorList.map((s: { devEUI: string; deviceName: string }) => (
                          <button
                            key={s.devEUI}
                            onClick={() => setSelectedOverviewSensor(s.devEUI)}
                            className={clsx(
                              "rounded-full px-2.5 sm:px-3 py-1 text-xs sm:text-xs font-medium transition-all whitespace-nowrap shrink-0",
                              selectedOverviewSensor === s.devEUI
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            {s.deviceName || s.devEUI.slice(-6)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
                  {envData.temperature !== null && envData.temperature !== undefined && (
                    <EnvironmentGauge label="Temperature" value={envData.temperature} unit="°C" min={10} max={40} color="#f59e0b" icon={Thermometer} />
                  )}
                  {envData.humidity !== null && envData.humidity !== undefined && (
                    <EnvironmentGauge label="Humidity" value={envData.humidity} unit="%" min={0} max={100} color="#3b82f6" icon={Droplets} />
                  )}
                  {envData.co2 !== null && envData.co2 !== undefined && (
                    <EnvironmentGauge label="CO₂" value={envData.co2} unit="ppm" min={300} max={2000} color={envData.co2 > 1000 ? '#ef4444' : envData.co2 > 800 ? '#f59e0b' : '#10b981'} icon={Wind} />
                  )}
                  {envData.tvoc !== null && envData.tvoc !== undefined && (
                    <EnvironmentGauge label="TVOC" value={envData.tvoc} unit="ppb" min={0} max={1000} color={envData.tvoc > 500 ? '#ef4444' : envData.tvoc > 250 ? '#f59e0b' : '#10b981'} icon={Activity} />
                  )}
                  {envData.pm2_5 !== null && envData.pm2_5 !== undefined && (
                    <EnvironmentGauge label="PM2.5" value={envData.pm2_5} unit="μg/m³" min={0} max={150} color={envData.pm2_5 > 55 ? '#ef4444' : envData.pm2_5 > 35 ? '#f59e0b' : '#10b981'} icon={Wind} />
                  )}
                  {envData.pm10 !== null && envData.pm10 !== undefined && (
                    <EnvironmentGauge label="PM10" value={envData.pm10} unit="μg/m³" min={0} max={300} color={envData.pm10 > 150 ? '#ef4444' : envData.pm10 > 75 ? '#f59e0b' : '#10b981'} icon={Wind} />
                  )}
                  {envData.barometric_pressure !== null && envData.barometric_pressure !== undefined && (
                    <EnvironmentGauge label="Pressure" value={envData.barometric_pressure} unit="hPa" min={950} max={1060} color="#06b6d4" icon={Gauge} />
                  )}
                  {envData.illuminance !== null && envData.illuminance !== undefined && (
                    <EnvironmentGauge label="Light" value={envData.illuminance} unit="lux" min={0} max={1000} color="#eab308" icon={Sun} />
                  )}
                  {envData.pir !== null && envData.pir !== undefined && (
                    <EnvironmentGauge label="PIR" value={envData.pir} unit="" min={0} max={1} color={envData.pir > 0 ? '#8b5cf6' : '#64748b'} icon={Eye} />
                  )}
                  {envData.sound_level_leq !== null && envData.sound_level_leq !== undefined && (
                    <EnvironmentGauge label="Noise Leq" value={envData.sound_level_leq} unit="dB" min={20} max={100} color={envData.sound_level_leq > 85 ? '#ef4444' : envData.sound_level_leq > 70 ? '#f59e0b' : '#8b5cf6'} icon={Volume2} />
                  )}
                  {envData.sound_level_lmax !== null && envData.sound_level_lmax !== undefined && (
                    <EnvironmentGauge label="Noise Lmax" value={envData.sound_level_lmax} unit="dB" min={20} max={120} color={envData.sound_level_lmax > 85 ? '#ef4444' : '#a855f7'} icon={Volume2} />
                  )}
                  {envData.sound_level_lmin !== null && envData.sound_level_lmin !== undefined && (
                    <EnvironmentGauge label="Noise Lmin" value={envData.sound_level_lmin} unit="dB" min={20} max={100} color="#06b6d4" icon={Volume2} />
                  )}
                  {envData.water_leak !== null && envData.water_leak !== undefined && (
                    <EnvironmentGauge label="Water Leak" value={envData.water_leak} unit="" min={0} max={1} color={envData.water_leak > 0 ? '#ef4444' : '#10b981'} icon={Droplets} />
                  )}
                  {/* Demo-only fallback gauges */}
                  {!isLive && (
                    <>
                      <EnvironmentGauge label="AQI" value={(envData as any).aqi ?? 0} unit="" min={0} max={150} color={(envData as any).aqi > 100 ? '#ef4444' : (envData as any).aqi > 50 ? '#f59e0b' : '#10b981'} icon={Activity} />
                      <EnvironmentGauge label="Noise" value={(envData as any).noise ?? 0} unit="dB" min={0} max={90} color="#8b5cf6" icon={Volume2} />
                      <EnvironmentGauge label="Pressure" value={(envData as any).pressure ?? 0} unit="PSI" min={30} max={80} color="#06b6d4" icon={Gauge} />
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-3">
              {/* Sensor trend chart */}
              <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-3 sm:p-6 shadow-sm">
                {(() => {
                  // ── Trend category definitions ──
                  const trendCategories: { key: string; label: string; subtitle: string; metrics: { dataKey: string; name: string; stroke: string; yAxisId: string }[] }[] = [
                    {
                      key: 'air_quality',
                      label: 'Air Quality',
                      subtitle: 'Temperature, Humidity, CO₂ & PM2.5',
                      metrics: [
                        { dataKey: 'temperature', name: 'Temperature (°C)', stroke: '#f59e0b', yAxisId: 'left' },
                        { dataKey: 'humidity', name: 'Humidity (%)', stroke: '#3b82f6', yAxisId: 'left' },
                        { dataKey: 'co2', name: 'CO₂ (ppm)', stroke: '#10b981', yAxisId: 'right' },
                        { dataKey: 'pm2_5', name: 'PM2.5 (µg/m³)', stroke: '#8b5cf6', yAxisId: 'left' },
                      ],
                    },
                    {
                      key: 'sound',
                      label: 'Sound Level',
                      subtitle: 'Leq, Lmax & Lmin noise measurements',
                      metrics: [
                        { dataKey: 'sound_level_leq', name: 'Leq (dB)', stroke: '#8b5cf6', yAxisId: 'left' },
                        { dataKey: 'sound_level_lmax', name: 'Lmax (dB)', stroke: '#ef4444', yAxisId: 'left' },
                        { dataKey: 'sound_level_lmin', name: 'Lmin (dB)', stroke: '#06b6d4', yAxisId: 'left' },
                      ],
                    },
                    {
                      key: 'environment',
                      label: 'Environment',
                      subtitle: 'TVOC, Barometric Pressure & Light',
                      metrics: [
                        { dataKey: 'tvoc', name: 'TVOC (ppb)', stroke: '#f97316', yAxisId: 'left' },
                        { dataKey: 'pressure', name: 'Pressure (hPa)', stroke: '#06b6d4', yAxisId: 'right' },
                        { dataKey: 'illuminance', name: 'Light (lux)', stroke: '#eab308', yAxisId: 'left' },
                      ],
                    },
                  ];

                  // Auto-detect which categories have data
                  const availableCategories = isLive && chartData.length > 0
                    ? trendCategories.filter(cat =>
                        cat.metrics.some(m =>
                          chartData.some((d: any) => d[m.dataKey] !== null && d[m.dataKey] !== undefined)
                        )
                      )
                    : trendCategories.slice(0, 1); // demo: show air quality only

                  const activeCat = availableCategories.find(c => c.key === selectedTrendCategory)
                    || availableCategories[0]
                    || trendCategories[0];

                  return (
                    <>
                      <div className="mb-4 sm:mb-6 flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                              {isLive ? 'Sensor Trend (24h)' : 'Water Consumption & Pressure'}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-500">
                              {isLive ? `${activeCat.subtitle} from live sensors` : 'Demo telemetry data'}
                            </p>
                          </div>
                          {isLive && sensorList.length > 1 && (
                            <select
                              value={selectedSensor}
                              onChange={e => setSelectedSensor(e.target.value)}
                              className="self-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="all">All Sensors ({sensorList.length})</option>
                              {sensorList.map((s: { devEUI: string; deviceName: string }) => (
                                <option key={s.devEUI} value={s.devEUI}>
                                  {s.deviceName || s.devEUI}
                                </option>
                              ))}
                            </select>
                          )}
                          {!isLive && (
                            <div className="flex rounded-lg bg-slate-100 p-1 self-start">
                              {['12h', '24h', '7d', '30d'].map((period) => (
                                <button
                                  key={period}
                                  onClick={() => setSelectedPeriod(period)}
                                  className={clsx(
                                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                                    selectedPeriod === period ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                                  )}
                                >
                                  {period.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Category tabs - only show when live and multiple categories available */}
                        {isLive && availableCategories.length > 1 && (
                          <div className="flex rounded-lg bg-slate-100 p-1 self-start overflow-x-auto max-w-full">
                            {availableCategories.map(cat => (
                              <button
                                key={cat.key}
                                onClick={() => setSelectedTrendCategory(cat.key)}
                                className={clsx(
                                  "rounded-md px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-xs font-medium transition-all whitespace-nowrap shrink-0",
                                  activeCat.key === cat.key
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-900"
                                )}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="h-[220px] sm:h-[280px] w-full">
                        {isLive && chartData.length > 0 ? (
                          <SafeChartContainer>
                            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                              <defs>
                                {activeCat.metrics.map(m => (
                                  <linearGradient key={m.dataKey} id={`color-${m.dataKey}-${id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={m.stroke} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={m.stroke} stopOpacity={0} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis
                                dataKey="_m"
                                type="number"
                                domain={[0, 1440]}
                                ticks={[0, 240, 480, 720, 960, 1200, 1440]}
                                tickFormatter={(m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
                                axisLine={false} tickLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                dy={10}
                              />
                              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                              {activeCat.metrics.some(m => m.yAxisId === 'right') && (
                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                              )}
                              <Tooltip
                                labelFormatter={(m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 13 }}
                              />
                              {activeCat.metrics.map(m => (
                                <Area
                                  key={m.dataKey}
                                  yAxisId={m.yAxisId}
                                  type="monotone"
                                  dataKey={m.dataKey}
                                  stroke={m.stroke}
                                  strokeWidth={2}
                                  fillOpacity={1}
                                  fill={`url(#color-${m.dataKey}-${id})`}
                                  name={m.name}
                                  connectNulls
                                />
                              ))}
                              {/* Reference lines for sound level thresholds */}
                              {activeCat.key === 'sound' && (
                                <>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                </>
                              )}
                            </AreaChart>
                          </SafeChartContainer>
                        ) : isLive ? (
                          <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Activity className="h-8 w-8 mb-2" />
                            <p className="text-sm">Waiting for sensor history data...</p>
                            <p className="text-xs text-slate-400 mt-1">Data will appear after multiple uplinks</p>
                          </div>
                        ) : (
                          <SafeChartContainer>
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`colorFlow-${id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id={`colorPress-${id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                              <Area type="monotone" dataKey="waterFlow" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill={`url(#colorFlow-${id})`} name="Water Flow (L)" />
                              <Area type="monotone" dataKey="pressure" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill={`url(#colorPress-${id})`} name="Pressure (PSI)" />
                            </AreaChart>
                          </SafeChartContainer>
                        )}
                      </div>
                      {/* Metric legend for active category */}
                      {isLive && chartData.length > 0 && (
                        <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1">
                          {activeCat.metrics.map(m => {
                            const hasData = chartData.some((d: any) => d[m.dataKey] !== null && d[m.dataKey] !== undefined);
                            return (
                              <div key={m.dataKey} className={clsx("flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs", hasData ? "text-slate-600" : "text-slate-300")}>
                                <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full shrink-0" style={{ backgroundColor: hasData ? m.stroke : '#cbd5e1' }} />
                                {m.name}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Multi-sensor info bar */}
                      {isLive && sensorList.length > 0 && (
                        <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-xs text-slate-500">
                          <span className="font-medium text-slate-600">{sensorList.length} sensor{sensorList.length !== 1 ? 's' : ''} reporting</span>
                          {sensorList.map((s: { devEUI: string; deviceName: string }, i: number) => (
                            <button
                              key={s.devEUI}
                              onClick={() => setSelectedSensor(selectedSensor === s.devEUI ? 'all' : s.devEUI)}
                              className={clsx(
                                "flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-all",
                                selectedSensor === s.devEUI
                                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                  : "hover:bg-slate-50"
                              )}
                            >
                              <div className={clsx("h-2 w-2 rounded-full", selectedSensor === s.devEUI ? "bg-blue-500" : "bg-slate-300")} />
                              {s.deviceName || `Sensor ${i + 1}`}
                            </button>
                          ))}
                          {selectedSensor !== 'all' && (
                            <button onClick={() => setSelectedSensor('all')} className="text-blue-600 hover:text-blue-800 font-medium">
                              Show all
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Sidebar column */}
              <div className="space-y-6">
                {/* Device type breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900 mb-3 text-sm">Device Breakdown</h3>
                  {property.devices && property.devices.length > 0 ? (
                    <>
                      <DeviceTypeDonut devices={property.devices} />
                      <div className="flex flex-wrap gap-2 mt-3 justify-center">
                        {Array.from(new Set(property.devices.map(d => d.type))).map((type, i) => (
                          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                            {type}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-6">No devices assigned</p>
                  )}
                </div>

                {/* Quick device status */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900 mb-3 text-sm">Quick Status</h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Online
                      </div>
                      <span className="text-sm font-bold text-slate-900">{property.onlineDevices}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Warning
                      </div>
                      <span className="text-sm font-bold text-slate-900">{property.warningDevices}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500" /> Offline
                      </div>
                      <span className="text-sm font-bold text-slate-900">{property.offlineDevices}</span>
                    </div>
                    <hr className="border-slate-100" />
                    <button
                      onClick={() => setActiveTab('devices')}
                      className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-800 py-1"
                    >
                      View all devices →
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Zone overview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                  {isLive ? 'Device Location Zones' : 'Zone Status Breakdown'}
                </h3>
                {isLive && (
                  <span className="text-xs sm:text-xs text-slate-400">Based on assigned device locations</span>
                )}
              </div>
              {zones.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {zones.map((zone) => (
                    <div key={zone.id} className="flex items-center justify-between p-2.5 sm:p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={clsx(
                          "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg shrink-0",
                          zone.status === 'normal' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{zone.name}</p>
                          <p className="text-xs sm:text-xs text-slate-500">{zone.sensors} Device{zone.sensors !== 1 ? 's' : ''}</p>
                          {isLive && 'devices' in zone && (zone as any).devices?.length > 0 && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {(zone as any).devices.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      {zone.status !== 'normal' ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600 border border-amber-100">
                          <AlertTriangle className="h-3 w-3" /> {zone.alerts}
                        </span>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Layers className="h-8 w-8 mb-2" />
                  <p className="text-sm">No device zones</p>
                  <p className="text-xs mt-1">Assign devices with locations to see zone status</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───── DEVICES TAB ───── */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            {/* Header with search + assign */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search devices by name, type, or location..."
                  value={sensorSearch}
                  onChange={(e) => setSensorSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <div className="flex gap-2">
                {isAdmin && unassignedDevices.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                        <Plus className="h-4 w-4" /> Assign Device
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b border-slate-100">
                        <h4 className="text-sm font-semibold text-slate-900">Assign Unassigned Device</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{unassignedDevices.length} available</p>
                      </div>
                      <div className="max-h-56 overflow-y-auto p-1.5">
                        {unassignedDevices.map(device => (
                          <button
                            key={device.id}
                            onClick={async () => {
                              try {
                                await api.assignDevice(device.id, property.name);
                                fetchProperty();
                                fetchAllDevices();
                              } catch (err) {
                                console.error('Failed to assign device:', err);
                              }
                            }}
                            className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 transition-colors"
                          >
                            <Cpu className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-700 text-sm truncate">{device.name}</p>
                              <p className="text-xs text-slate-400">{device.type} · {device.location}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Interactive device list */}
            {property.devices && property.devices.length > 0 ? (
              <PropertyDevicePanel
                devices={property.devices}
                propertyName={property.name}
                onDeviceChange={() => { fetchProperty(); fetchAllDevices(); }}
                searchQuery={sensorSearch}
                deviceReadings={telemetry?.deviceReadings}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
                <Cpu className="h-12 w-12 mb-4 text-slate-300" />
                <p className="text-base font-medium text-slate-500">No devices assigned</p>
                <p className="text-sm text-slate-400 mt-1">Assign devices from the Devices page to start monitoring.</p>
                <button
                  onClick={() => navigate('/devices')}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Go to Devices
                </button>
              </div>
            )}
          </div>
        )}

        {/* ───── BMS TAB ───── */}
        {activeTab === 'bms' && (
          <PropertyBMSPanel propertyName={property.name} />
        )}

        {/* ───── ALARMS TAB ───── */}
        {activeTab === 'alarms' && (
          <div className="space-y-6">
            {/* Pending Alarms */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Pending Alarms
                {pendingAlarms.length > 0 && (
                  <span className="bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-xs font-bold">{pendingAlarms.length}</span>
                )}
                {pendingAlarms.length > 1 && (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm(`Resolve all ${pendingAlarms.length} pending alarms?`)) return;
                        try {
                          await api.bulkResolveAlarms();
                          fetchAlarms();
                        } catch (err) { console.error('Failed to bulk resolve:', err); }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Resolve All
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Dismiss all ${pendingAlarms.length} pending alarms? This cannot be undone.`)) return;
                        try {
                          await api.bulkDismissAlarms();
                          fetchAlarms();
                        } catch (err) { console.error('Failed to bulk dismiss:', err); }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
                    >
                      Dismiss All
                    </button>
                  </div>
                )}
              </h3>

              {alarmsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : pendingAlarms.length === 0 ? (
                <div className="flex items-center gap-3 p-5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">No pending alarms</p>
                    <p className="text-xs text-emerald-600 mt-0.5">All systems operating normally for this property.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingAlarms.map(alarm => (
                    <div key={alarm.id} className={clsx(
                      "flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border bg-white transition-all hover:shadow-sm",
                      alarm.severity === 'high' ? "border-red-200 bg-red-50/30" :
                      alarm.severity === 'medium' ? "border-amber-200 bg-amber-50/30" :
                      "border-slate-200"
                    )}>
                      <div className={clsx(
                        "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                        alarm.severity === 'high' ? "bg-red-100 text-red-600" :
                        alarm.severity === 'medium' ? "bg-amber-100 text-amber-600" :
                        "bg-blue-100 text-blue-600"
                      )}>
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{alarm.type}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{alarm.description}</p>
                        <div className="flex items-center gap-2 sm:gap-3 mt-1.5 flex-wrap">
                          <span className="text-xs sm:text-xs text-slate-400 flex items-center gap-1 truncate max-w-[160px] sm:max-w-none"><MapPin className="h-3 w-3 shrink-0" />{alarm.location}</span>
                          <span className="text-xs sm:text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{alarm.time}</span>
                          <span className={clsx(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                            alarm.severity === 'high' ? "bg-red-50 text-red-700 ring-red-600/10" :
                            alarm.severity === 'medium' ? "bg-amber-50 text-amber-700 ring-amber-600/10" :
                            "bg-blue-50 text-blue-700 ring-blue-600/10"
                          )}>{alarm.severity}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 sm:shrink-0">
                        <button
                          onClick={async () => {
                            try {
                              await api.updateAlarm(alarm.id, { status: 'resolved' });
                              fetchAlarms();
                            } catch (err) {
                              console.error('Failed to resolve alarm:', err);
                            }
                          }}
                          className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                        >
                          <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Resolve
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await api.deleteAlarm(alarm.id);
                              fetchAlarms();
                            } catch (err) {
                              console.error('Failed to dismiss alarm:', err);
                            }
                          }}
                          className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resolved Alarms */}
            {resolvedAlarms.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Recently Resolved
                  <span className="text-xs text-slate-400 font-normal">({resolvedAlarms.length})</span>
                </h3>
                <div className="space-y-2">
                  {resolvedAlarms.slice(0, 5).map(alarm => (
                    <div key={alarm.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600">{alarm.type}</p>
                        <p className="text-xs text-slate-400">{alarm.location} · {alarm.time}</p>
                      </div>
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Resolved</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Dialogs ═══ */}
      <EditPropertyDialog property={property} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={fetchProperty} />
      <DeletePropertyDialog property={{ ...property, deviceCount: property.deviceCount }} open={showDeleteDialog} onOpenChange={setShowDeleteDialog} onSuccess={() => navigate('/buildings')} />
      <ChangePropertyPhotoDialog propertyId={property.id} currentImage={property.image} open={showPhotoDialog} onOpenChange={setShowPhotoDialog} onSuccess={fetchProperty} />
    </div>
  );
}