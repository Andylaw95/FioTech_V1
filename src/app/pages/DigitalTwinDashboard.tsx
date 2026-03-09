import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sun, Moon, Building2, Thermometer, Droplets, Wind, Activity,
  Router, Signal, AlertTriangle, CheckCircle2, Zap, Radio,
  RefreshCw, Loader2, Layers, ChevronRight,
  WifiOff, TrendingUp, TrendingDown, Minus,
  Shield, Bell, Gauge, Clock, ChevronDown, MapPin, X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '@/app/utils/ThemeContext';
import {
  api,
  type DashboardStats,
  type TelemetryResponse,
  type Gateway,
  type Property,
  type Device,
  type SensorDataResponse,
  type PropertyTelemetry,
  type Alarm,
} from '@/app/utils/api';
import { Link } from 'react-router';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';

// ═══════════════════════════════════════════════════════
// Theme Toggle Button
// ═══════════════════════════════════════════════════════

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-500 border',
        isDark
          ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
      )}
    >
      <motion.div
        key={isDark ? 'moon' : 'sun'}
        initial={{ rotate: -90, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        exit={{ rotate: 90, scale: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-amber-500" />}
      </motion.div>
      <span>{isDark ? 'Night Mode' : 'Day Mode'}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// Floor 17 — Table Zone Plan View (synced with Digital Twin)
// ═══════════════════════════════════════════════════════

const TABLE_ZONES = [
  { id: 'andy', label: "Andy's Table", color: '#3b82f6' },
  { id: 'charles', label: "Charles's Table", color: '#10b981' },
  { id: 'david', label: "David's Table", color: '#f59e0b' },
];

// Parse device location string into a table zone ID
// e.g. "Floor 17, Andy Seat" → 'andy', "Floor 17, David Seat" → 'david'
function parseDeviceZone(location: string | undefined | null): string | null {
  if (!location) return null;
  const loc = location.toLowerCase();
  for (const zone of TABLE_ZONES) {
    // Match zone id in location (e.g. 'andy' in 'floor 17, andy seat')
    if (loc.includes(zone.id)) return zone.id;
  }
  return null;
}

interface TableZoneData {
  id: string;
  label: string;
  color: string;
  sensors: number;
  online: number;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  soundLevel: number | null;      // Leq (average) dB
  soundLevelMax: number | null;    // Lmax dB
  soundLevelMin: number | null;    // Lmin dB
  deviceType: 'iaq' | 'sound' | 'mixed' | null;
  alerts: number;
}

function FloorPlanView({
  zones,
  selectedTable,
  onSelectTable,
  sensorData,
  allDevices,
}: {
  zones: TableZoneData[];
  selectedTable: string | null;
  onSelectTable: (id: string) => void;
  sensorData?: SensorDataResponse | null;
  allDevices?: Device[];
}) {
  const { isDark } = useTheme();

  // Count devices per zone from sensorData, using device location mapping
  const devicesByZone = useMemo(() => {
    const map: Record<string, number> = { andy: 0, charles: 0, david: 0 };
    if (sensorData?.devices) {
      sensorData.devices.forEach((d) => {
        // Look up the device's location from the full devices list
        const devInfo = allDevices?.find(dev =>
          dev.devEui?.toLowerCase() === d.devEUI?.toLowerCase() ||
          dev.name?.toLowerCase() === d.deviceName?.toLowerCase()
        );
        const zone = parseDeviceZone(devInfo?.location);
        if (zone && map[zone] !== undefined) {
          map[zone]++;
        } else {
          // Unassigned device — put in first zone with fewest devices
          const minZone = TABLE_ZONES.reduce((a, b) => (map[a.id] <= map[b.id] ? a : b));
          map[minZone.id]++;
        }
      });
    }
    return map;
  }, [sensorData, allDevices]);

  return (
    <svg viewBox="0 0 380 220" className="w-full h-full" style={{ maxHeight: 280 }}>
      {/* Floor background */}
      <rect x="10" y="10" width="360" height="200" rx="16"
        fill={isDark ? '#0f172a' : '#f8fafc'}
        stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="1.5"
      />
      {/* Floor label */}
      <text x="190" y="32" textAnchor="middle"
        fill={isDark ? '#94a3b8' : '#64748b'}
        className="text-[12px] font-bold"
      >Floor 17</text>

      {/* Table zones */}
      {zones.map((zone, i) => {
        const x = 30 + i * 118;
        const y = 48;
        const w = 100;
        const h = 148;
        const isSel = selectedTable === zone.id;
        const hasAlerts = zone.alerts > 0;

        return (
          <g key={zone.id} onClick={() => onSelectTable(zone.id)} className="cursor-pointer">
            {/* Zone background */}
            <rect x={x} y={y} width={w} height={h} rx="10"
              fill={isSel
                ? isDark ? `${zone.color}22` : `${zone.color}18`
                : isDark ? '#1e293b' : '#ffffff'}
              stroke={isSel ? zone.color : isDark ? '#475569' : '#cbd5e1'}
              strokeWidth={isSel ? 2 : 1}
              opacity={selectedTable === null || isSel ? 1 : 0.35}
            />
            {/* Table icon (desk shape) */}
            <rect x={x + 25} y={y + 30} width={50} height={30} rx="4"
              fill={isDark ? '#334155' : '#e2e8f0'}
              stroke={zone.color} strokeWidth="1"
              opacity={selectedTable === null || isSel ? 0.8 : 0.3}
            />
            {/* Chair shapes */}
            <circle cx={x + 50} cy={y + 72} r={6}
              fill={isDark ? '#475569' : '#cbd5e1'} opacity={0.5} />
            {/* Zone label */}
            <text x={x + w / 2} y={y + 96}
              textAnchor="middle"
              fill={isSel ? zone.color : isDark ? '#e2e8f0' : '#334155'}
              className="text-[11px] font-bold"
            >{zone.label}</text>
            {/* Sensor count */}
            <text x={x + w / 2} y={y + 114}
              textAnchor="middle"
              fill={isDark ? '#94a3b8' : '#64748b'}
              className="text-[10px] font-medium"
            >{zone.sensors > 0 ? `${zone.online}/${zone.sensors} sensors` : `${devicesByZone[zone.id] || 0} devices`}</text>
            {/* Primary metric: Sound Level for sound zones, Temperature for IAQ */}
            {zone.deviceType === 'sound' && zone.soundLevel !== null ? (
              <text x={x + w / 2} y={y + 130}
                textAnchor="middle"
                fill={zone.soundLevel > 70 ? '#ef4444' : isDark ? '#a78bfa' : '#7c3aed'}
                className="text-[10px] font-mono font-medium"
              >{zone.soundLevel.toFixed(1)} dB</text>
            ) : zone.temperature !== null ? (
              <text x={x + w / 2} y={y + 130}
                textAnchor="middle"
                fill={isDark ? '#f97316' : '#ea580c'}
                className="text-[10px] font-mono font-medium"
              >{zone.temperature.toFixed(1)}°C</text>
            ) : null}
            {/* Alert indicator */}
            {hasAlerts && (
              <circle cx={x + w - 12} cy={y + 12} r={5} fill="#f59e0b">
                <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Status dot */}
            <circle cx={x + 14} cy={y + 14} r={4}
              fill={zone.online > 0 ? '#10b981' : '#94a3b8'}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// Stat Micro-Card
// ═══════════════════════════════════════════════════════

function MicroStat({
  icon: Icon,
  label,
  value,
  unit,
  trend,
  color = 'blue',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  color?: string;
}) {
  const { isDark } = useTheme();
  const colorMap: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', darkBg: 'bg-blue-950/40', darkText: 'text-blue-400' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', darkBg: 'bg-orange-950/40', darkText: 'text-orange-400' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-600', darkBg: 'bg-teal-950/40', darkText: 'text-teal-400' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', darkBg: 'bg-violet-950/40', darkText: 'text-violet-400' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', darkBg: 'bg-emerald-950/40', darkText: 'text-emerald-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', darkBg: 'bg-amber-950/40', darkText: 'text-amber-400' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', darkBg: 'bg-rose-950/40', darkText: 'text-rose-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-xl p-4 border transition-all duration-500',
        isDark
          ? 'bg-slate-800/60 border-slate-700/50 backdrop-blur-sm'
          : 'bg-white border-slate-200/80 shadow-sm'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('p-2 rounded-lg', isDark ? c.darkBg : c.bg)}>
          <Icon className={clsx('h-4 w-4', isDark ? c.darkText : c.text)} />
        </div>
        {trend && (
          <div className={clsx(
            'flex items-center gap-0.5 text-[11px] font-medium rounded-full px-1.5 py-0.5',
            trend === 'up'
              ? isDark ? 'text-emerald-400 bg-emerald-950/40' : 'text-emerald-600 bg-emerald-50'
              : trend === 'down'
                ? isDark ? 'text-amber-400 bg-amber-950/40' : 'text-amber-600 bg-amber-50'
                : isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-100'
          )}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> :
             trend === 'down' ? <TrendingDown className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
          </div>
        )}
      </div>
      <p className={clsx('text-xs lg:text-sm font-medium mb-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className={clsx('text-2xl lg:text-3xl font-bold tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
          {value}
        </span>
        {unit && (
          <span className={clsx('text-sm font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>
            {unit}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// Gateway Status Card
// ═══════════════════════════════════════════════════════

function GatewayCard({ gw }: { gw: Gateway }) {
  const { isDark } = useTheme();
  const isOnline = gw.status === 'online';
  const isWarning = gw.status === 'warning';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        'rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02]',
        isDark
          ? 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
          : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={clsx(
            'p-2 rounded-lg',
            isOnline
              ? isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'
              : isWarning
                ? isDark ? 'bg-amber-950/40' : 'bg-amber-50'
                : isDark ? 'bg-slate-700' : 'bg-slate-100'
          )}>
            <Router className={clsx(
              'h-4 w-4',
              isOnline
                ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                : isWarning
                  ? isDark ? 'text-amber-400' : 'text-amber-600'
                  : isDark ? 'text-slate-500' : 'text-slate-400'
            )} />
          </div>
          <div>
            <p className={clsx('text-sm font-semibold truncate', isDark ? 'text-white' : 'text-slate-900')}>
              {gw.name}
            </p>
            <p className={clsx('text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {gw.protocol} &middot; {gw.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            'h-2 w-2 rounded-full',
            isOnline ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : 'bg-slate-400'
          )} />
          <span className={clsx(
            'text-[11px] font-medium capitalize',
            isOnline
              ? isDark ? 'text-emerald-400' : 'text-emerald-600'
              : isWarning
                ? isDark ? 'text-amber-400' : 'text-amber-600'
                : isDark ? 'text-slate-500' : 'text-slate-400'
          )}>
            {gw.status}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Signal bars */}
          <div className="flex items-end gap-0.5" title={`${gw.signal}%`}>
            {[0, 1, 2, 3].map((i) => {
              const bars = gw.signal >= 80 ? 4 : gw.signal >= 60 ? 3 : gw.signal >= 40 ? 2 : 1;
              const barColor = gw.signal >= 80 ? 'bg-emerald-500' : gw.signal >= 60 ? 'bg-blue-500' : gw.signal >= 40 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div
                  key={i}
                  className={clsx('w-1 rounded-full', i < bars ? barColor : isDark ? 'bg-slate-700' : 'bg-slate-200')}
                  style={{ height: `${[5, 8, 11, 15][i]}px` }}
                />
              );
            })}
          </div>
          <span className={clsx('text-xs font-mono', isDark ? 'text-slate-400' : 'text-slate-500')}>
            {gw.signal}%
          </span>
        </div>
        <span className={clsx('text-[11px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
          {gw.connectedDevices ?? 0} devices
        </span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// Alarm Feed Item
// ═══════════════════════════════════════════════════════

function AlarmItem({ alarm }: { alarm: Alarm }) {
  const { isDark } = useTheme();
  const severityColors: Record<string, string> = {
    high: 'text-red-500',
    medium: 'text-amber-500',
    low: 'text-blue-500',
  };

  return (
    <div className={clsx(
      'flex items-center gap-3 px-4 py-3 border-b last:border-0 transition-colors',
      isDark ? 'border-slate-700/50 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-slate-50'
    )}>
      <div className={clsx(
        'p-1.5 rounded-lg shrink-0',
        alarm.severity === 'high'
          ? isDark ? 'bg-red-950/40' : 'bg-red-50'
          : alarm.severity === 'medium'
            ? isDark ? 'bg-amber-950/40' : 'bg-amber-50'
            : isDark ? 'bg-blue-950/40' : 'bg-blue-50'
      )}>
        <AlertTriangle className={clsx('h-3.5 w-3.5', severityColors[alarm.severity] || 'text-slate-400')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-xs font-semibold truncate', isDark ? 'text-white' : 'text-slate-900')}>
          {alarm.type}
        </p>
        <p className={clsx('text-[11px] truncate', isDark ? 'text-slate-500' : 'text-slate-400')}>
          {alarm.location} &middot; {alarm.property}
        </p>
      </div>
      <span className={clsx(
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize shrink-0',
        alarm.severity === 'high'
          ? isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-100 text-red-700'
          : alarm.severity === 'medium'
            ? isDark ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-100 text-amber-700'
            : isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-100 text-blue-700'
      )}>
        {alarm.severity}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Mini Sparkline Chart
// ═══════════════════════════════════════════════════════

// Stable unique ID counter for sparkline gradients
let sparklineIdCounter = 0;

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const { isDark } = useTheme();
  const chartData = data.map((v, i) => ({ i, v }));
  const [gradientId] = useState(() => `spark-${++sparklineIdCounter}`);

  return (
    <div className="h-12 w-full min-w-0">
      <SafeChartContainer>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
            fill={`url(#${gradientId})`} dot={false} />
        </AreaChart>
      </SafeChartContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Sensor Live Reading Card
// ═══════════════════════════════════════════════════════

function SensorLiveCard({
  icon: Icon,
  label,
  value,
  unit,
  sparkData,
  color,
  status,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit: string;
  sparkData: number[];
  color: string;
  status?: 'normal' | 'warning' | 'critical';
}) {
  const { isDark } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-xl border p-4 transition-all duration-500 relative overflow-hidden group',
        isDark
          ? 'bg-slate-800/60 border-slate-700/50 backdrop-blur-sm hover:border-slate-600'
          : 'bg-white border-slate-200/80 shadow-sm hover:shadow-md'
      )}
    >
      {status === 'warning' && (
        <div className="absolute top-0 right-0 w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-amber-400" />
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" style={{ color }} />
          <span className={clsx('text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
            {label}
          </span>
        </div>
        <span className={clsx(
          'h-1.5 w-1.5 rounded-full',
          status === 'warning' ? 'bg-amber-500' : status === 'critical' ? 'bg-red-500' : 'bg-emerald-500'
        )} />
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className={clsx('text-2xl lg:text-3xl font-bold tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
          {value}
        </span>
        <span className={clsx('text-sm lg:text-base font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>
          {unit}
        </span>
      </div>

      <Sparkline data={sparkData} color={color} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
// Generate mock sparkline data
// ═══════════════════════════════════════════════════════

function generateSparkline(base: number, variance: number, points = 20): number[] {
  const data: number[] = [];
  let current = base;
  for (let i = 0; i < points; i++) {
    current += (Math.random() - 0.5) * variance;
    data.push(+(current.toFixed(1)));
  }
  return data;
}

// ═══════════════════════════════════════════════════════
// Main Digital Twin Dashboard
// ═══════════════════════════════════════════════════════

export function DigitalTwinDashboard() {
  const { isDark } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [sensorData, setSensorData] = useState<SensorDataResponse | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propertyTelemetry, setPropertyTelemetry] = useState<PropertyTelemetry | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('fiotec_selected_property') || null;
    } catch { return null; }
  });

  const selectedProperty = useMemo(
    () => selectedPropertyId ? properties.find(p => p.id === selectedPropertyId) ?? null : null,
    [selectedPropertyId, properties]
  );

  // Persist selected property to localStorage for cross-page sync
  useEffect(() => {
    try {
      if (selectedPropertyId) {
        localStorage.setItem('fiotec_selected_property', selectedPropertyId);
      } else {
        localStorage.removeItem('fiotec_selected_property');
      }
    } catch { /* localStorage unavailable */ }
  }, [selectedPropertyId]);

  // ── Scoped data when a building is selected ──
  const scopedGateways = useMemo(() => {
    if (!selectedProperty) return gateways;
    return gateways.filter(g => g.property === selectedProperty.name);
  }, [gateways, selectedProperty]);

  const scopedAlarms = useMemo(() => {
    if (!selectedProperty) return alarms;
    return alarms.filter(a => a.property === selectedProperty.name);
  }, [alarms, selectedProperty]);

  const scopedTelemetry = useMemo<TelemetryResponse | null>(() => {
    if (!telemetry) return null;
    if (!selectedProperty) return telemetry;
    return {
      ...telemetry,
      airQuality: telemetry.airQuality.filter(a => a.propertyName === selectedProperty.name),
    };
  }, [telemetry, selectedProperty]);

  const scopedStats = useMemo<DashboardStats | null>(() => {
    if (!stats) return null;
    if (!selectedProperty) return stats;
    const dc = selectedProperty.deviceCount ?? 0;
    const on = selectedProperty.onlineDevices ?? 0;
    const off = selectedProperty.offlineDevices ?? 0;
    const warn = selectedProperty.warningDevices ?? 0;
    const pct = dc > 0 ? Math.round((on / dc) * 100) : 0;
    return {
      properties: { total: 1, images: [selectedProperty.image] },
      devices: { total: dc, online: on, offline: off, warning: warn, onlinePercent: pct },
      alarms: {
        totalPending: scopedAlarms.filter(a => a.status === 'pending').length,
        highSeverity: scopedAlarms.filter(a => a.severity === 'high' && a.status === 'pending').length,
        waterLeaks: 0,
        systemWarnings: warn,
      },
      water: stats.water,
    };
  }, [stats, selectedProperty, scopedAlarms]);

  // Reset table selection when changing property
  useEffect(() => { setSelectedTable(null); }, [selectedPropertyId]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Use allSettled so partial failures don't block the entire dashboard
      const results = await Promise.allSettled([
        api.getStats(),
        api.getTelemetry(),
        api.getGateways(),
        api.getProperties(),
        api.getSensorData(20),
        api.getAlarms(),
        api.getDevices(),
      ]);
      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setTelemetry(results[1].value);
      if (results[2].status === 'fulfilled') setGateways(results[2].value);
      if (results[3].status === 'fulfilled') setProperties(results[3].value);
      if (results[4].status === 'fulfilled') setSensorData(results[4].value);
      if (results[5].status === 'fulfilled') setAlarms(results[5].value);
      if (results[6].status === 'fulfilled') setAllDevices(results[6].value);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`DigitalTwinDashboard: ${failures.length}/${results.length} API calls failed`);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('DigitalTwinDashboard: fetch error', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Fetch per-property telemetry (real sensor data with history)
  useEffect(() => {
    if (!selectedPropertyId) { setPropertyTelemetry(null); return; }
    let cancelled = false;
    const fetchPropTelemetry = async () => {
      try {
        const data = await api.getPropertyTelemetry(selectedPropertyId);
        if (!cancelled) {
          setPropertyTelemetry(data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.debug('DigitalTwinDashboard: property telemetry fetch failed', err);
      }
    };
    fetchPropTelemetry();
    const iv = setInterval(fetchPropTelemetry, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selectedPropertyId]);

  // Build table zone data from properties and sensor data (Floor 17 layout)
  const tableZoneData = useMemo<TableZoneData[]>(() => {
    const deviceCount = selectedProperty?.deviceCount ?? (stats?.devices?.total ?? 0);
    const onlineDevices = selectedProperty?.onlineDevices ?? (stats?.devices?.online ?? 0);
    const totalAlerts = selectedProperty?.warningDevices ?? (stats?.alarms?.totalPending ?? 0);

    // Assign AM308L#2 to David's table; distribute others evenly
    const devicesPerZone = Math.max(1, Math.round(deviceCount / TABLE_ZONES.length));
    const onlinePerZone = Math.max(0, Math.round(onlineDevices / TABLE_ZONES.length));

    // Try to get per-device readings from sensorData, using device location to map to zones
    const deviceReadings: Record<string, any> = {};
    if (sensorData?.devices) {
      for (const d of sensorData.devices) {
        // Match to registered device by devEUI or name to get location
        const devInfo = allDevices?.find(dev =>
          dev.devEui?.toLowerCase() === d.devEUI?.toLowerCase() ||
          dev.name?.toLowerCase() === d.deviceName?.toLowerCase()
        );
        const zone = parseDeviceZone(devInfo?.location);
        const zoneId = zone || TABLE_ZONES[0].id; // default to first zone if no location set
        if (!deviceReadings[zoneId]) deviceReadings[zoneId] = [];
        deviceReadings[zoneId].push(d.lastDecodedData);
      }
    }

    return TABLE_ZONES.map((zone, i) => {
      const readings = deviceReadings[zone.id] || [];
      const temps = readings.map((r: any) => r?.temperature).filter((t: any): t is number => typeof t === 'number');
      const hums = readings.map((r: any) => r?.humidity).filter((h: any): h is number => typeof h === 'number');
      const co2s = readings.map((r: any) => {
        if (!r) return null;
        // Find any co2 key
        for (const k of Object.keys(r)) {
          if (k.toLowerCase().includes('co2') && typeof r[k] === 'number') return r[k];
        }
        return null;
      }).filter((c: any): c is number => c !== null);

      // Extract sound level data (WS302 Sound Level Sensor)
      const soundLeqs = readings.map((r: any) => r?.sound_level_leq).filter((v: any): v is number => typeof v === 'number');
      const soundMaxs = readings.map((r: any) => r?.sound_level_lmax).filter((v: any): v is number => typeof v === 'number');
      const soundMins = readings.map((r: any) => r?.sound_level_lmin).filter((v: any): v is number => typeof v === 'number');

      // Determine device type for this zone
      const hasIAQ = temps.length > 0 || hums.length > 0 || co2s.length > 0;
      const hasSound = soundLeqs.length > 0;
      const deviceType: 'iaq' | 'sound' | 'mixed' | null = hasIAQ && hasSound ? 'mixed' : hasSound ? 'sound' : hasIAQ ? 'iaq' : null;

      const aq = telemetry?.airQuality?.[i];

      return {
        ...zone,
        sensors: devicesPerZone,
        online: onlinePerZone,
        temperature: temps.length > 0
          ? temps.reduce((a: number, b: number) => a + b, 0) / temps.length
          : aq?.temperature ?? null,
        humidity: hums.length > 0
          ? hums.reduce((a: number, b: number) => a + b, 0) / hums.length
          : aq?.humidity ?? null,
        co2: co2s.length > 0
          ? Math.round(co2s.reduce((a: number, b: number) => a + b, 0) / co2s.length)
          : null,
        soundLevel: soundLeqs.length > 0
          ? Math.round(soundLeqs.reduce((a: number, b: number) => a + b, 0) / soundLeqs.length * 10) / 10
          : null,
        soundLevelMax: soundMaxs.length > 0
          ? Math.round(soundMaxs.reduce((a: number, b: number) => a + b, 0) / soundMaxs.length * 10) / 10
          : null,
        soundLevelMin: soundMins.length > 0
          ? Math.round(soundMins.reduce((a: number, b: number) => a + b, 0) / soundMins.length * 10) / 10
          : null,
        deviceType,
        alerts: i === 0 ? totalAlerts : 0,
      };
    });
  }, [properties, telemetry, stats, selectedProperty, sensorData, allDevices]);

  const selectedTableData = selectedTable !== null
    ? tableZoneData.find(z => z.id === selectedTable) || null
    : null;

  // Build sparkline data from real property telemetry history, fallback to generated
  const sparklines = useMemo(() => {
    const hist = propertyTelemetry?.history;
    if (hist && hist.length >= 3) {
      // Use real time-series data (most recent points)
      const sorted = [...hist].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      const last = sorted.slice(-20);
      return {
        temp: last.map(h => h.temperature).filter((v): v is number => v != null),
        humidity: last.map(h => h.humidity).filter((v): v is number => v != null),
        co2: last.map(h => h.co2).filter((v): v is number => v != null),
        pm25: last.map(h => h.pm2_5).filter((v): v is number => v != null),
        energy: [],
        noise: [],
      };
    }
    return {
      temp: [],
      humidity: [],
      co2: [],
      pm25: [],
      energy: [],
      noise: [],
    };
  }, [propertyTelemetry]);

  // Donut data (scoped)
  const donutData = useMemo(() => {
    const online = scopedStats?.devices?.online ?? 0;
    const offline = scopedStats?.devices?.offline ?? 0;
    const warning = scopedStats?.devices?.warning ?? 0;
    return [
      { name: 'Online', value: online, color: '#10b981' },
      { name: 'Warning', value: warning, color: '#f59e0b' },
      { name: 'Offline', value: offline, color: '#94a3b8' },
    ].filter(d => d.value > 0);
  }, [scopedStats]);

  const pendingAlarms = useMemo(() =>
    scopedAlarms.filter(a => a.status === 'pending').slice(0, 6),
    [scopedAlarms]
  );

  const onlineGateways = scopedGateways.filter(g => g.status === 'online').length;
  const totalGateways = scopedGateways.length;

  // Sensor readings — prefer property telemetry (real live sensor data) → webhook data → scoped telemetry → fallback
  const avgTemp = useMemo(() => {
    // 1. Property telemetry (real sensor data)
    if (propertyTelemetry?.environment?.temperature != null) {
      return propertyTelemetry.environment.temperature.toFixed(1);
    }
    // 2. Webhook sensor data (all devices)
    if (!selectedProperty && sensorData?.devices?.length) {
      const temps = sensorData.devices
        .map(d => d.lastDecodedData?.temperature)
        .filter((t): t is number => typeof t === 'number');
      if (temps.length) return (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    }
    // 3. Scoped telemetry
    const aqTemps = scopedTelemetry?.airQuality?.map(a => a.temperature).filter((t): t is number => typeof t === 'number') ?? [];
    if (aqTemps.length) return (aqTemps.reduce((a, b) => a + b, 0) / aqTemps.length).toFixed(1);
    return '—';
  }, [propertyTelemetry, sensorData, scopedTelemetry, selectedProperty]);

  const avgHumidity = useMemo(() => {
    if (propertyTelemetry?.environment?.humidity != null) {
      return propertyTelemetry.environment.humidity.toFixed(1);
    }
    if (!selectedProperty && sensorData?.devices?.length) {
      const hums = sensorData.devices
        .map(d => d.lastDecodedData?.humidity)
        .filter((h): h is number => typeof h === 'number');
      if (hums.length) return (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1);
    }
    const aqHums = scopedTelemetry?.airQuality?.map(a => a.humidity).filter((h): h is number => typeof h === 'number') ?? [];
    if (aqHums.length) return (aqHums.reduce((a, b) => a + b, 0) / aqHums.length).toFixed(1);
    return '—';
  }, [propertyTelemetry, sensorData, scopedTelemetry, selectedProperty]);

  const avgCo2 = useMemo(() => {
    if (propertyTelemetry?.environment?.co2 != null) {
      return Math.round(propertyTelemetry.environment.co2);
    }
    const aqCo2 = scopedTelemetry?.airQuality?.map(a => a.co2).filter((c): c is number => typeof c === 'number') ?? [];
    if (aqCo2.length) return Math.round(aqCo2.reduce((a, b) => a + b, 0) / aqCo2.length);
    return '—';
  }, [propertyTelemetry, scopedTelemetry]);

  const avgPm25 = useMemo(() => {
    if (propertyTelemetry?.environment?.pm2_5 != null) {
      return propertyTelemetry.environment.pm2_5.toFixed(1);
    }
    return scopedTelemetry?.airQuality?.[0]?.pm25?.toFixed(1) ?? '—';
  }, [propertyTelemetry, scopedTelemetry]);

  if (loading) {
    return (
      <div className={clsx(
        'flex items-center justify-center h-[70vh] transition-colors duration-500',
        isDark ? 'bg-slate-900' : 'bg-slate-50'
      )}>
        <div className="flex flex-col items-center gap-4">
          <div className={clsx(
            'h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-xl',
            isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
          )}>
            F
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className={clsx('h-4 w-4 animate-spin', isDark ? 'text-slate-400' : 'text-slate-500')} />
            <span className={clsx('text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
              Loading Digital Twin...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('min-h-screen transition-colors duration-500 -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8',
      isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-slate-50 via-white to-blue-50/30'
    )}>
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className={clsx(
              'p-2 rounded-xl',
              isDark ? 'bg-blue-950/40' : 'bg-blue-50'
            )}>
              <Building2 className={clsx('h-5 w-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
            </div>
            <h1 className={clsx(
              'text-2xl lg:text-3xl font-bold tracking-tight',
              isDark ? 'text-white' : 'text-slate-900'
            )}>
              {selectedProperty ? selectedProperty.name : 'Digital Twin Dashboard'}
            </h1>
          </div>
          <p className={clsx('text-sm lg:text-base ml-[52px]', isDark ? 'text-slate-500' : 'text-slate-500')}>
            {selectedProperty
              ? `${selectedProperty.type} · ${selectedProperty.location} · ${selectedProperty.deviceCount ?? 0} sensors`
              : <>Floor 17 — Real-time building intelligence &middot; {properties.length} properties &middot; {stats?.devices?.total ?? 0} sensors</>}
            {lastUpdated && (
              <span className={clsx('ml-2 text-xs', isDark ? 'text-slate-600' : 'text-slate-400')}>
                · Updated {lastUpdated.toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Building Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={clsx(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all',
                selectedProperty
                  ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                  : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
              )}>
                <Building2 className="h-4 w-4" />
                <span className="max-w-[140px] truncate hidden sm:inline">
                  {selectedProperty ? selectedProperty.name : 'All Properties'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className={clsx(
                'p-3 border-b',
                isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/50'
              )}>
                <h4 className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                  Select Building
                </h4>
                <p className={clsx('text-xs mt-0.5', isDark ? 'text-slate-500' : 'text-slate-500')}>
                  Focus twin on a specific property
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                <button
                  onClick={() => setSelectedPropertyId(null)}
                  className={clsx(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                    !selectedPropertyId
                      ? isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-700'
                      : isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                  )}
                >
                  <div className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                    !selectedPropertyId
                      ? isDark ? 'bg-blue-950/60 text-blue-400' : 'bg-blue-100 text-blue-600'
                      : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                  )}>
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">All Properties</p>
                    <p className={clsx('text-xs', isDark ? 'text-slate-600' : 'text-slate-400')}>Portfolio-wide view</p>
                  </div>
                  {!selectedPropertyId && <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 ml-auto" />}
                </button>
                <div className={clsx('border-t my-1', isDark ? 'border-slate-700' : 'border-slate-100')} />
                {properties.map(p => {
                  const isSel = selectedPropertyId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPropertyId(isSel ? null : p.id)}
                      className={clsx(
                        'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                        isSel
                          ? isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-700'
                          : isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                      )}
                    >
                      <div className="h-8 w-8 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className={clsx('text-xs flex items-center gap-1', isDark ? 'text-slate-600' : 'text-slate-400')}>
                          <MapPin className="h-2.5 w-2.5" />{p.location}
                        </p>
                      </div>
                      {isSel && <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Active filter chip */}
          {selectedProperty && (
            <button
              onClick={() => setSelectedPropertyId(null)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isDark
                  ? 'bg-blue-950/40 text-blue-400 border border-blue-800 hover:bg-blue-950/60'
                  : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100'
              )}
            >
              <Building2 className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{selectedProperty.name}</span>
              <X className="h-3 w-3 ml-0.5" />
            </button>
          )}

          <ThemeToggle />
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className={clsx(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all',
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
            )}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Top Stats Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
        <MicroStat icon={Building2} label={selectedProperty ? "Property" : "Properties"} value={scopedStats?.properties?.total ?? 0} unit={selectedProperty ? selectedProperty.type : undefined} trend="stable" color="blue" />
        <MicroStat icon={Activity} label="Active Sensors" value={scopedStats?.devices?.online ?? 0} unit={`/ ${scopedStats?.devices?.total ?? 0}`} trend="up" color="emerald" />
        <MicroStat icon={Router} label="Gateways Online" value={onlineGateways} unit={`/ ${totalGateways}`} trend={onlineGateways === totalGateways ? 'up' : 'down'} color="violet" />
        <MicroStat icon={Bell} label="Active Alerts" value={scopedStats?.alarms?.totalPending ?? 0} trend={scopedStats?.alarms?.totalPending ? 'down' : 'stable'} color={scopedStats?.alarms?.totalPending ? 'amber' : 'emerald'} />
      </div>

      {/* ─── Main Grid: Building Twin + Sensors ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 mb-6 lg:mb-8">
        {/* Building Twin (left) */}
        <div className={clsx(
          'xl:col-span-5 rounded-2xl border p-5 transition-all duration-500 relative overflow-hidden',
          isDark
            ? 'bg-slate-800/40 border-slate-700/50 backdrop-blur-sm'
            : 'bg-white border-slate-200 shadow-sm'
        )}>
          {/* Ambient glow for night mode */}
          {isDark && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-violet-500/5 rounded-full blur-3xl" />
            </div>
          )}

          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <Layers className={clsx('h-5 w-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
              <h3 className={clsx('text-base lg:text-lg font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                {selectedProperty ? `${selectedProperty.name} — Floor 17` : 'Floor 17 — Table Zones'}
              </h3>
            </div>
            {selectedTable !== null && (
              <button
                onClick={() => setSelectedTable(null)}
                className={clsx(
                  'text-xs font-medium px-2 py-1 rounded-lg transition-colors',
                  isDark ? 'text-blue-400 hover:bg-blue-950/40' : 'text-blue-600 hover:bg-blue-50'
                )}
              >
                Show All Tables
              </button>
            )}
          </div>

          <div className="relative z-10">
            <FloorPlanView
              zones={tableZoneData}
              selectedTable={selectedTable}
              onSelectTable={(id) => setSelectedTable(prev => prev === id ? null : id)}
              sensorData={sensorData}
              allDevices={allDevices}
            />
          </div>

          {/* Selected Table Details */}
          <AnimatePresence mode="wait">
            {selectedTableData && (
              <motion.div
                key={selectedTableData.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="relative z-10 overflow-hidden"
              >
                <div className={clsx(
                  'mt-4 rounded-xl border p-4',
                  isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                )}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedTableData.color }} />
                    <p className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                      {selectedTableData.label}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Sensors</p>
                      <p className={clsx('text-base font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                        {selectedTableData.online}/{selectedTableData.sensors}
                      </p>
                    </div>
                    {selectedTableData.deviceType === 'sound' ? (
                      <>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Sound Level (Leq)</p>
                          <p className={clsx('text-base font-bold', selectedTableData.soundLevel && selectedTableData.soundLevel > 70 ? 'text-amber-500' : isDark ? 'text-violet-400' : 'text-violet-600')}>
                            {selectedTableData.soundLevel !== null ? `${selectedTableData.soundLevel.toFixed(1)} dB` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Peak (Lmax)</p>
                          <p className={clsx('text-base font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                            {selectedTableData.soundLevelMax !== null ? `${selectedTableData.soundLevelMax.toFixed(1)} dB` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Min (Lmin)</p>
                          <p className={clsx('text-base font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                            {selectedTableData.soundLevelMin !== null ? `${selectedTableData.soundLevelMin.toFixed(1)} dB` : '—'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Temperature</p>
                          <p className={clsx('text-base font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                            {selectedTableData.temperature !== null ? `${selectedTableData.temperature.toFixed(1)}°C` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>Humidity</p>
                          <p className={clsx('text-base font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                            {selectedTableData.humidity !== null ? `${selectedTableData.humidity.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className={clsx('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>CO2</p>
                          <p className={clsx('text-base font-bold', selectedTableData.co2 && selectedTableData.co2 > 800 ? 'text-amber-500' : isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                            {selectedTableData.co2 !== null ? `${selectedTableData.co2} ppm` : '—'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sensor Readings (right) */}
        <div className="xl:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className={clsx('h-5 w-5', isDark ? 'text-violet-400' : 'text-violet-600')} />
              <h3 className={clsx('text-base lg:text-lg font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                Live Sensor Readings
              </h3>
            </div>
            {sensorData && sensorData.totalDevices > 0 && (
              <span className={clsx(
                'text-xs font-medium px-2 py-1 rounded-full',
                isDark ? 'bg-violet-950/40 text-violet-400' : 'bg-violet-50 text-violet-600'
              )}>
                {sensorData.totalDevices} device{sensorData.totalDevices !== 1 ? 's' : ''} reporting
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            <SensorLiveCard
              icon={Thermometer}
              label="Temperature"
              value={avgTemp}
              unit="°C"
              sparkData={sparklines.temp}
              color="#f97316"
              status={parseFloat(avgTemp) > 35 ? 'warning' : 'normal'}
            />
            <SensorLiveCard
              icon={Droplets}
              label="Humidity"
              value={avgHumidity}
              unit="%"
              sparkData={sparklines.humidity}
              color="#3b82f6"
              status={parseFloat(avgHumidity) > 80 ? 'warning' : 'normal'}
            />
            <SensorLiveCard
              icon={Wind}
              label="CO2 Level"
              value={avgCo2}
              unit="ppm"
              sparkData={sparklines.co2}
              color="#14b8a6"
              status={avgCo2 > 800 ? 'warning' : 'normal'}
            />
            <SensorLiveCard
              icon={Activity}
              label="PM2.5"
              value={avgPm25}
              unit="μg/m³"
              sparkData={sparklines.pm25}
              color="#8b5cf6"
            />
            <SensorLiveCard
              icon={Zap}
              label="Energy Usage"
              value={scopedTelemetry?.bmsItems?.[0]?.consumption ?? '—'}
              unit="kWh"
              sparkData={sparklines.energy}
              color="#eab308"
            />
            <SensorLiveCard
              icon={Gauge}
              label="Water Leak Status"
              value={scopedTelemetry?.waterZones?.some(z => z.leakDetected) ? 'Leak!' : (scopedTelemetry?.waterZones?.length ? 'Normal' : '—')}
              unit=""
              sparkData={sparklines.noise}
              color="#06b6d4"
              status={scopedTelemetry?.waterZones?.some(z => z.leakDetected) ? 'warning' : 'normal'}
            />
          </div>
        </div>
      </div>

      {/* ─── Bottom Grid: Gateways + Device Health + Alarms ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6">
        {/* Gateway Status */}
        <div className={clsx(
          'xl:col-span-5 rounded-2xl border p-5 transition-all duration-500',
          isDark
            ? 'bg-slate-800/40 border-slate-700/50 backdrop-blur-sm'
            : 'bg-white border-slate-200 shadow-sm'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Router className={clsx('h-4 w-4', isDark ? 'text-emerald-400' : 'text-emerald-600')} />
              <h3 className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                Gateway Network
              </h3>
            </div>
            <Link
              to="/gateways"
              className={clsx(
                'text-[11px] font-medium flex items-center gap-1 transition-colors',
                isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
              )}
            >
              View All <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Summary bar */}
          <div className={clsx(
            'flex items-center gap-4 mb-4 p-3 rounded-xl',
            isDark ? 'bg-slate-900/50' : 'bg-slate-50'
          )}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className={clsx('text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>
                {onlineGateways} Online
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className={clsx('text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>
                {scopedGateways.filter(g => g.status === 'warning').length} Warning
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span className={clsx('text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>
                {scopedGateways.filter(g => g.status === 'offline').length} Offline
              </span>
            </div>
          </div>

          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {scopedGateways.length === 0 ? (
              <div className={clsx('text-center py-8', isDark ? 'text-slate-500' : 'text-slate-400')}>
                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{selectedProperty ? 'No gateways for this property' : 'No gateways registered'}</p>
              </div>
            ) : (
              scopedGateways.slice(0, 6).map(gw => <GatewayCard key={gw.id} gw={gw} />)
            )}
          </div>
        </div>

        {/* Device Health Donut */}
        <div className={clsx(
          'xl:col-span-3 rounded-2xl border p-5 transition-all duration-500',
          isDark
            ? 'bg-slate-800/40 border-slate-700/50 backdrop-blur-sm'
            : 'bg-white border-slate-200 shadow-sm'
        )}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className={clsx('h-5 w-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
            <h3 className={clsx('text-base lg:text-lg font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
              System Health
            </h3>
          </div>

          <div className="h-[180px] relative">
            <SafeChartContainer>
              <PieChart>
                <Pie
                  data={donutData.length > 0 ? donutData : [{ name: 'No Data', value: 1, color: isDark ? '#334155' : '#e2e8f0' }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={donutData.length > 1 ? 4 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {(donutData.length > 0 ? donutData : [{ name: 'No Data', value: 1, color: isDark ? '#334155' : '#e2e8f0' }]).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#e2e8f0' : '#1e293b',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </SafeChartContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={clsx('text-2xl font-bold', isDark ? 'text-white' : 'text-slate-900')}>
                {scopedStats?.devices?.onlinePercent ?? 0}%
              </span>
              <span className={clsx('text-[11px] font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>
                Uptime
              </span>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            {[
              { label: 'Online', count: scopedStats?.devices?.online ?? 0, color: 'bg-emerald-500' },
              { label: 'Warning', count: scopedStats?.devices?.warning ?? 0, color: 'bg-amber-500' },
              { label: 'Offline', count: scopedStats?.devices?.offline ?? 0, color: 'bg-slate-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className={clsx('h-2 w-2 rounded-full', item.color)} />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{item.label}</span>
                </span>
                <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alert Feed */}
        <div className={clsx(
          'xl:col-span-4 rounded-2xl border transition-all duration-500 overflow-hidden',
          isDark
            ? 'bg-slate-800/40 border-slate-700/50 backdrop-blur-sm'
            : 'bg-white border-slate-200 shadow-sm'
        )}>
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={clsx('h-5 w-5', isDark ? 'text-amber-400' : 'text-amber-600')} />
              <h3 className={clsx('text-base lg:text-lg font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                Active Alerts
              </h3>
            </div>
            <Link
              to="/alarms"
              className={clsx(
                'text-[11px] font-medium flex items-center gap-1 transition-colors',
                isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
              )}
            >
              View All <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {pendingAlarms.length === 0 ? (
              <div className={clsx('text-center py-12 px-5', isDark ? 'text-slate-500' : 'text-slate-400')}>
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className={clsx('text-sm font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  All Clear
                </p>
                <p className={clsx('text-[11px] mt-1', isDark ? 'text-slate-600' : 'text-slate-400')}>
                  No pending alerts at this time
                </p>
              </div>
            ) : (
              pendingAlarms.map(alarm => <AlarmItem key={alarm.id} alarm={alarm} />)
            )}
          </div>

          {pendingAlarms.length > 0 && (
            <div className={clsx(
              'px-5 py-3 border-t',
              isDark ? 'border-slate-700/50 bg-slate-900/30' : 'border-slate-100 bg-slate-50/50'
            )}>
              <div className="flex items-center justify-between text-[11px]">
                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                  {scopedStats?.alarms?.highSeverity ?? 0} critical &middot; {scopedStats?.alarms?.totalPending ?? 0} total
                </span>
                <Clock className={clsx('h-3 w-3', isDark ? 'text-slate-600' : 'text-slate-300')} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Live Webhook Sensor Data (if available) ─── */}
      {sensorData && sensorData.totalDevices > 0 && (
        <div className={clsx(
          'mt-6 lg:mt-8 rounded-2xl border p-5 transition-all duration-500',
          isDark
            ? 'bg-slate-800/40 border-slate-700/50 backdrop-blur-sm'
            : 'bg-white border-slate-200 shadow-sm'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className={clsx('h-5 w-5', isDark ? 'text-violet-400' : 'text-violet-600')} />
              <div>
                <h3 className={clsx('text-base lg:text-lg font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                  Webhook Sensor Devices
                </h3>
                <p className={clsx('text-xs lg:text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>
                  {sensorData.totalDevices} device{sensorData.totalDevices !== 1 ? 's' : ''} &middot; {sensorData.totalEntries} total uplinks
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sensorData.devices.map(device => {
              const rssiPct = device.lastRssi > -999
                ? Math.max(0, Math.min(100, 2 * (device.lastRssi + 100)))
                : 0;

              return (
                <motion.div
                  key={device.devEUI}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={clsx(
                    'rounded-xl border p-4 transition-all duration-300',
                    isDark
                      ? 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={clsx(
                      'p-1.5 rounded-lg',
                      isDark ? 'bg-violet-950/40' : 'bg-violet-50'
                    )}>
                      <Radio className={clsx('h-3.5 w-3.5', isDark ? 'text-violet-400' : 'text-violet-600')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={clsx('text-xs font-semibold truncate', isDark ? 'text-white' : 'text-slate-900')}>
                        {device.deviceName}
                      </p>
                      <p className={clsx('text-[10px] font-mono truncate', isDark ? 'text-slate-600' : 'text-slate-400')}>
                        {device.devEUI}
                      </p>
                    </div>
                  </div>

                  {/* Last decoded values */}
                  {device.lastDecodedData && Object.keys(device.lastDecodedData).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {Object.entries(device.lastDecodedData).slice(0, 4).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-[11px]">
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className={clsx('font-medium font-mono', isDark ? 'text-slate-300' : 'text-slate-700')}>
                            {typeof val === 'number' ? val.toFixed(1) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1">
                      <Signal className={clsx('h-3 w-3', rssiPct > 60 ? 'text-emerald-500' : rssiPct > 30 ? 'text-amber-500' : 'text-red-500')} />
                      <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{rssiPct}%</span>
                    </div>
                    <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>
                      {device.uplinkCount} uplinks
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}