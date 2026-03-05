import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StatCard } from '@/app/components/StatCard';
import { HealthDonut, AlarmBarChart } from '@/app/components/Charts';
import { AirQualityCard } from '@/app/components/AirQualityCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { AddPropertyDialog } from '@/app/components/AddPropertyDialog';
import { DraggableWidget } from '@/app/components/DraggableWidget';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
  Building2, 
  Droplets, 
  Activity, 
  AlertTriangle, 
  CheckCircle2,
  MapPin,
  ArrowRight,
  Zap,
  ThermometerSun,
  Layout,
  ChevronDown,
  Move,
  RotateCcw,
  RefreshCw,
  Loader2,
  WifiOff,
  Link2,
  Router,
  Signal,
  Webhook,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { clsx } from 'clsx';
import { api, type Property, type DashboardStats, type TelemetryResponse, type AlarmChartDay, invalidateCache } from '@/app/utils/api';
import { DeviceGatewayPairingWidget } from '@/app/components/DeviceGatewayPairingWidget';
import { GatewayOverviewWidget } from '@/app/components/GatewayOverviewWidget';
import { SensorDataWidget } from '@/app/components/SensorDataWidget';

// --- Sub-Section Components (now accept props from telemetry) ---

const DataSourceBadge = ({ source }: { source?: 'live' | 'simulated' }) => {
  if (!source) return null;
  const isLive = source === 'live';
  return (
    <span className={clsx(
      "text-xs font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
      isLive
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-50 text-slate-500 border-slate-200"
    )}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
      {isLive ? "Live" : "Simulated"}
    </span>
  );
};

const WaterMonitoringSection = ({ data }: { data: TelemetryResponse | null }) => {
  const waterZones = data?.waterZones || [];
  const allNormal = waterZones.every(z => z.status === 'normal');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600 shrink-0">
            <Droplets className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg lg:text-2xl font-bold text-slate-900">Water Leak & Pressure Monitoring</h3>
            <p className="text-sm lg:text-base text-slate-500">
              {data?.source === 'live' ? 'Live sensor data' : 'Real-time hydraulic status'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={data?.source} />
          <span className={clsx(
            "text-xs font-medium px-2 py-1 rounded-full border",
            allNormal 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            {allNormal ? 'System Normal' : 'Attention Needed'}
          </span>
        </div>
      </div>
      {waterZones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Droplets className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">No leak sensors deployed</p>
          <p className="text-xs text-slate-400">
            {data?.source === 'live'
              ? 'Configure leak sensors on your gateway to see monitoring data'
              : 'Add Leakage-type devices to see monitoring data'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {waterZones.map((item) => (
            <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase line-clamp-1">{item.zone}</span>
                <div className={clsx(
                  "h-2 w-2 rounded-full shrink-0",
                  item.status === 'normal' ? "bg-emerald-500" : item.status === 'warning' ? "bg-amber-500" : "bg-slate-400"
                )} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Pressure</span>
                  <span className="font-mono font-bold text-slate-900 text-base lg:text-lg">{item.pressure} PSI</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Flow</span>
                  <span className="font-mono font-bold text-slate-900 text-base lg:text-lg">{item.flow} L/m</span>
                </div>
              </div>
              {item.leakDetected && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <AlertTriangle className="h-3 w-3" /> Leak warning
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BMSMonitoringSection = ({ data }: { data: TelemetryResponse | null }) => {
  const bmsItems = data?.bmsItems || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg lg:text-2xl font-bold text-slate-900">BMS & Energy Overview</h3>
            <p className="text-sm lg:text-base text-slate-500">
              {data?.source === 'live' ? 'Live energy data from sensors' : 'Power consumption and mechanical systems'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={data?.source} />
          <Link to="/bim" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">View Schematics</Link>
        </div>
      </div>
      {bmsItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Zap className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">No BMS data available</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bmsItems.map((item) => (
            <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all relative overflow-hidden group">
              {item.status === 'generating' && (
                <div className="absolute top-0 right-0 p-1 bg-green-500 rounded-bl-lg">
                  <Zap className="h-3 w-3 text-white fill-white" />
                </div>
              )}
              <h4 className="font-medium text-slate-900 text-sm mb-3 line-clamp-1">{item.system}</h4>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500">Usage</p>
                  <p className={clsx("text-lg font-bold font-mono", item.status === 'generating' ? "text-green-600" : "text-slate-900")}>
                    {item.consumption}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Load</p>
                  <p className="text-sm font-medium text-slate-700">{item.load}</p>
                </div>
              </div>
              <div className="mt-3 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={clsx("h-full rounded-full", item.status === 'generating' ? "bg-green-500" : "bg-indigo-500")} 
                  style={{ width: item.load }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EnvironmentalSection = ({ data }: { data: TelemetryResponse | null }) => {
  const airQuality = data?.airQuality || [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg lg:text-2xl font-bold text-slate-900">Environmental Monitoring</h3>
          <p className="text-sm lg:text-base text-slate-500">
            {data?.source === 'live' ? 'Real sensor data from webhook uplinks.' : 'Air quality indices across properties.'}
          </p>
        </div>
        <DataSourceBadge source={data?.source} />
      </div>
      {airQuality.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center text-slate-400">
          <ThermometerSun className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">No environmental data yet</p>
          <p className="text-xs text-slate-400">
            {data?.source === 'live'
              ? 'Configure your gateway webhook to start receiving sensor data'
              : 'Add properties and IAQ sensors to see readings'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {airQuality.map(data => (
            <AirQualityCard key={data.propertyId} {...data} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Available Widgets Config ---

type WidgetId = 'environmental' | 'water' | 'bms' | 'alerts' | 'health' | 'pairing' | 'gateways' | 'sensors';

const ALL_WIDGET_IDS: WidgetId[] = ['environmental', 'water', 'bms', 'alerts', 'health', 'pairing', 'gateways', 'sensors'];

const WIDGETS: { id: WidgetId; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'environmental', label: 'Environmental Monitoring', icon: ThermometerSun, description: 'Air quality, CO2, and Temperature sensors' },
  { id: 'water', label: 'Water Leak Monitoring', icon: Droplets, description: 'Leak detection, pressure, and flow rates' },
  { id: 'bms', label: 'BMS Systems', icon: Zap, description: 'Energy usage, HVAC, and mechanical status' },
  { id: 'alerts', label: 'Alert Trends', icon: AlertTriangle, description: 'Historical alert frequency chart' },
  { id: 'health', label: 'Portfolio Health', icon: Activity, description: 'Device connectivity summary' },
  { id: 'pairing', label: 'Device-Gateway Pairing', icon: Link2, description: 'Quick pair devices to gateways' },
  { id: 'gateways', label: 'Gateway Status', icon: Router, description: 'Live gateway connectivity and signal overview' },
  { id: 'sensors', label: 'Live Sensor Data', icon: Webhook, description: 'Real-time uplinks from LoRaWAN sensors via webhook' },
];

// Widget content renderer — health widget receives dynamic stats
function HealthWidget({ stats }: { stats: DashboardStats | null }) {
  const online = stats?.devices.online ?? 0;
  const offline = stats?.devices.offline ?? 0;
  const onlinePct = stats?.devices.onlinePercent ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900 mb-2">Portfolio Health</h3>
          <p className="text-sm text-slate-500 mb-6">Device connectivity status</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span> Online
              </span>
              <span className="font-medium text-slate-900">{online}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-slate-200"></span> Offline
              </span>
              <span className="font-medium text-slate-900">{offline}</span>
            </div>
          </div>
        </div>
        <div className="w-full md:w-64 flex-shrink-0">
          <HealthDonut online={onlinePct} offline={100 - onlinePct} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...ALL_WIDGET_IDS]);
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>(['environmental', 'alerts', 'health']);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [alarmChartData, setAlarmChartData] = useState<AlarmChartDay[] | null>(null);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('fiotech_selected_property') || null;
    } catch { return null; }
  });
  const refreshTimerRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false); // STABILITY: concurrency guard
  const lastRefreshRef = useRef<number>(Date.now()); // Ref for visibility staleness check
  const initialLoadDoneRef = useRef(false); // Tracks whether first successful load completed

  const selectedProperty = useMemo(
    () => selectedPropertyId ? properties.find(p => p.id === selectedPropertyId) ?? null : null,
    [selectedPropertyId, properties]
  );

  // Persist selected property to localStorage for cross-page sync
  useEffect(() => {
    try {
      if (selectedPropertyId) {
        localStorage.setItem('fiotech_selected_property', selectedPropertyId);
      } else {
        localStorage.removeItem('fiotech_selected_property');
      }
    } catch { /* localStorage unavailable */ }
  }, [selectedPropertyId]);

  // Filtered telemetry scoped to the selected property
  // Live data uses "SensorName — PropertyName" format; simulated uses "PropertyName"
  const scopedTelemetry = useMemo<TelemetryResponse | null>(() => {
    if (!telemetry) return null;
    if (!selectedProperty) return telemetry;
    const isLive = telemetry.source === 'live';
    return {
      ...telemetry,
      airQuality: telemetry.airQuality.filter(a =>
        isLive
          ? a.propertyName.includes(selectedProperty.name)
          : a.propertyName === selectedProperty.name
      ),
      waterZones: isLive
        ? telemetry.waterZones.filter(w => w.zone.includes(selectedProperty.name))
        : telemetry.waterZones,
      bmsItems: isLive
        ? telemetry.bmsItems.filter(b => b.system.includes(selectedProperty.name))
        : telemetry.bmsItems,
    };
  }, [telemetry, selectedProperty]);

  // Scoped stats: when a building is selected, derive stats from property data
  const scopedStats = useMemo<DashboardStats | null>(() => {
    if (!stats) return null;
    if (!selectedProperty) return stats;
    const deviceCount = selectedProperty.deviceCount ?? 0;
    const onlineDevices = selectedProperty.onlineDevices ?? 0;
    const offlineDevices = selectedProperty.offlineDevices ?? 0;
    const warningDevices = selectedProperty.warningDevices ?? 0;
    const onlinePct = deviceCount > 0 ? Math.round((onlineDevices / deviceCount) * 100) : 0;
    const waterParts = (selectedProperty.waterSensors || '0/0').split('/');
    const waterActive = parseInt(waterParts[0]) || 0;
    const waterTotal = parseInt(waterParts[1]) || 0;
    const hasWaterWarning = waterActive < waterTotal;
    return {
      properties: { total: 1, images: [selectedProperty.image] },
      devices: { total: deviceCount, online: onlineDevices, offline: offlineDevices, warning: warningDevices, onlinePercent: onlinePct },
      alarms: { totalPending: warningDevices, highSeverity: 0, waterLeaks: hasWaterWarning ? 1 : 0, systemWarnings: warningDevices },
      water: { status: hasWaterWarning ? 'Warning' : 'Normal', leakWarnings: hasWaterWarning ? waterTotal - waterActive : 0 },
    };
  }, [stats, selectedProperty]);

  const fetchProperties = useCallback(async () => {
    const isInitial = !initialLoadDoneRef.current;
    try {
      // Only show loading state on initial load or manual refresh — NOT during
      // background auto-refresh. This prevents the UI from flashing "Loading..."
      // and error banners every 30s when a transient failure occurs.
      if (isInitial) {
        setLoading(true);
        setError(null);
      }
      const data = await api.getProperties();
      setProperties(data);
      if (isInitial) initialLoadDoneRef.current = true;
      // Clear any stale error on successful refresh
      setError(null);
    } catch (err) {
      console.debug("Failed to fetch properties", err);
      if (isInitial) {
        // Only show error UI on initial load — users need to know if first load fails
        setError(err instanceof Error ? err.message : 'Failed to load properties');
      }
      // During auto-refresh, keep stale data and silently log — don't flash errors
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (err) {
      console.debug("Failed to fetch dashboard stats", err);
    }
  }, []);

  // Fetch telemetry data
  const fetchTelemetry = useCallback(async () => {
    try {
      const data = await api.getTelemetry();
      setTelemetry(data);
    } catch (err) {
      console.debug("Failed to fetch telemetry", err);
    }
  }, []);

  // Load widget layout from backend
  const fetchWidgetLayout = useCallback(async () => {
    try {
      const layout = await api.getWidgetLayout();
      if (layout?.order && Array.isArray(layout.order)) {
        const validOrder = layout.order.filter((id: string) => ALL_WIDGET_IDS.includes(id as WidgetId)) as WidgetId[];
        const missing = ALL_WIDGET_IDS.filter(id => !validOrder.includes(id));
        setWidgetOrder([...validOrder, ...missing]);
      }
      if (layout?.active && Array.isArray(layout.active)) {
        setActiveWidgets(layout.active.filter((id: string) => ALL_WIDGET_IDS.includes(id as WidgetId)) as WidgetId[]);
      }
    } catch (err) {
      console.debug("Failed to fetch widget layout, using defaults", err);
    } finally {
      setLayoutLoaded(true);
    }
  }, []);

  // STABILITY: Refresh all with concurrency guard — prevents request pile-up
  const refreshAll = useCallback(async (showSpinner = true) => {
    // Prevent overlapping refreshes (auto-timer vs manual click vs interval overlap)
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    if (showSpinner) setRefreshing(true);
    // Manual refresh: allow error/loading state to appear
    if (showSpinner && initialLoadDoneRef.current) {
      initialLoadDoneRef.current = false;
    }
    try {
      await Promise.all([
        fetchProperties(),
        fetchStats(),
        fetchTelemetry(),
      ]);
      lastRefreshRef.current = Date.now();
    } catch (err) {
      console.debug("Dashboard refresh error:", err);
    } finally {
      if (showSpinner) setRefreshing(false);
      isRefreshingRef.current = false;
      // Re-mark as loaded so next auto-refresh is silent again
      if (!initialLoadDoneRef.current) initialLoadDoneRef.current = true;
    }
  }, [fetchProperties, fetchStats, fetchTelemetry]);

  // Initial load — SINGLE REQUEST via dashboard-bundle endpoint.
  // One HTTP roundtrip replaces 5 sequential batches, cutting load time by ~70%.
  // Falls back to individual fetches if bundle fails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bundle = await api.getDashboardBundle();
        if (cancelled) return;

        // Hydrate all Dashboard state from the single response
        setProperties(bundle.properties);
        setStats(bundle.stats);
        if (bundle.telemetry) setTelemetry(bundle.telemetry);
        setAlarmChartData(bundle.alarmChartData);

        // Widget layout
        if (bundle.widgetLayout?.order && Array.isArray(bundle.widgetLayout.order)) {
          const validOrder = bundle.widgetLayout.order.filter((id: string) => ALL_WIDGET_IDS.includes(id as WidgetId)) as WidgetId[];
          const missing = ALL_WIDGET_IDS.filter(id => !validOrder.includes(id));
          setWidgetOrder([...validOrder, ...missing]);
        }
        if (bundle.widgetLayout?.active && Array.isArray(bundle.widgetLayout.active)) {
          setActiveWidgets(bundle.widgetLayout.active.filter((id: string) => ALL_WIDGET_IDS.includes(id as WidgetId)) as WidgetId[]);
        }

        initialLoadDoneRef.current = true;
        setError(null);
      } catch (err) {
        console.debug('Dashboard bundle failed, falling back to individual fetches:', err);
        // Fallback: original sequential batches
        await Promise.all([fetchWidgetLayout(), fetchProperties()]);
        if (cancelled) return;
        await Promise.all([fetchStats(), fetchTelemetry()]);
        if (cancelled) return;
        try {
          const chartData = await api.getAlarmChartData();
          if (!cancelled) setAlarmChartData(chartData);
        } catch (e) { console.debug('Failed to fetch alarm chart data:', e); }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLayoutLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fetchProperties, fetchStats, fetchTelemetry, fetchWidgetLayout]);

  // STABILITY: Auto-refresh with page visibility awareness
  // Pauses polling when tab is hidden — prevents background request build-up
  useEffect(() => {
    let intervalMs = 30000; // default
    let mounted = true;

    const setupAutoRefresh = async () => {
      try {
        const settings = await api.getSettings();
        if (!mounted) return;
        const seconds = settings?.dashboard?.refreshInterval;
        // Clamp to sane range: minimum 10s, maximum 300s
        intervalMs = Math.max(10, Math.min(300, seconds || 30)) * 1000;
      } catch (err) {
        console.debug("Failed to get refresh interval, using 30s default");
      }

      // Clear existing timer
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setInterval(() => {
        // Only refresh when page is visible — prevents phantom request storms
        if (!document.hidden) {
          refreshAll(false);
        }
      }, intervalMs);
    };

    // Delay setupAutoRefresh well past the sequential waterfall.
    // The waterfall (widgetLayout → properties → stats → telemetry → alarmChart)
    // takes 5-15s. A 20s delay ensures the settings request fires after the
    // waterfall completes, preventing concurrent requests during initial load.
    const setupTimer = setTimeout(() => setupAutoRefresh(), 20000);

    // Refresh immediately when user returns to the tab (if stale > 10s)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const staleness = Date.now() - lastRefreshRef.current;
        if (staleness > 10000) {
          // Clear stale cache so we get fresh data (e.g., photo updated on another device)
          invalidateCache();
          refreshAll(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearTimeout(setupTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [refreshAll]);

  // STABILITY: Debounced widget layout save — prevents rapid-fire saves during drag
  const saveTimerRef = useRef<number | null>(null);
  const saveLayout = useCallback((order: WidgetId[], active: WidgetId[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      api.saveWidgetLayout({ order, active }).catch(err => {
        console.debug("Failed to save widget layout:", err);
      });
    }, 500); // Debounce 500ms
  }, []);

  const toggleWidget = (id: WidgetId) => {
    setActiveWidgets(prev => {
      const next = prev.includes(id) 
        ? prev.filter(w => w !== id) 
        : [...prev, id];
      saveLayout(widgetOrder, next);
      return next;
    });
  };

  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgetOrder(prev => {
      const visibleWidgets = prev.filter(id => activeWidgets.includes(id));
      const hiddenWidgets = prev.filter(id => !activeWidgets.includes(id));
      
      const updated = [...visibleWidgets];
      const [removed] = updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, removed);
      
      return [...updated, ...hiddenWidgets];
    });
  }, [activeWidgets]);

  const handleDropEnd = useCallback(() => {
    setWidgetOrder(current => {
      saveLayout(current, activeWidgets);
      return current;
    });
  }, [activeWidgets, saveLayout]);

  const resetLayout = useCallback(() => {
    const defaultOrder = [...ALL_WIDGET_IDS];
    const defaultActive: WidgetId[] = ['environmental', 'alerts', 'health'];
    setWidgetOrder(defaultOrder);
    setActiveWidgets(defaultActive);
    saveLayout(defaultOrder, defaultActive);
  }, [saveLayout]);

  // Visible widgets in their current order
  const visibleWidgets = widgetOrder.filter(id => activeWidgets.includes(id));

  // PERFORMANCE: Memoized widget content map — prevents re-creation & unmount/remount on every render
  const WidgetContentMap = useMemo<Record<WidgetId, React.FC>>(() => ({
    environmental: () => <EnvironmentalSection data={scopedTelemetry} />,
    water: () => <WaterMonitoringSection data={scopedTelemetry} />,
    bms: () => <BMSMonitoringSection data={scopedTelemetry} />,
    alerts: () => (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Weekly Alert Trends</h3>
            <p className="text-sm text-slate-500">Aggregated from actual alarm records (last 7 days)</p>
          </div>
        </div>
        <AlarmBarChart data={alarmChartData} />
      </div>
    ),
    health: () => <HealthWidget stats={scopedStats} />,
    pairing: () => <DeviceGatewayPairingWidget />,
    gateways: () => <GatewayOverviewWidget />,
    sensors: () => <SensorDataWidget />,
  }), [scopedTelemetry, scopedStats, alarmChartData]);

  // Format last refresh time
  const formatLastRefresh = () => {
    const now = new Date();
    const diff = now.getTime() - lastRefreshRef.current;
    if (diff < 5000) return 'Just now';
    if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
    return `${Math.round(diff / 60000)}m ago`;
  };

  return (
    <DndProvider backend={HTML5Backend}>
    <div className="space-y-6 lg:space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
              {selectedProperty ? selectedProperty.name : 'Portfolio Overview'}
            </h2>
            <p className="text-base lg:text-lg text-slate-500 mt-1">
              {selectedProperty
                ? `Monitoring ${selectedProperty.type} property in ${selectedProperty.location}`
                : 'Real-time insights across your managed properties.'}
            </p>
          </div>

          {/* Building Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={clsx(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-all border shrink-0",
                selectedProperty
                  ? "bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}>
                <Building2 className="h-4 w-4" />
                <span className="max-w-[160px] truncate text-base lg:text-lg font-semibold">
                  {selectedProperty ? selectedProperty.name : 'All Properties'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <h4 className="text-sm font-semibold text-slate-900">Select Building</h4>
                <p className="text-xs text-slate-500 mt-0.5">Focus dashboard on a specific property</p>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {/* All Properties option */}
                <button
                  onClick={() => setSelectedPropertyId(null)}
                  className={clsx(
                    "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                    !selectedPropertyId ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    !selectedPropertyId ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  )}>
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">All Properties</p>
                    <p className="text-xs text-slate-400">Portfolio-wide view</p>
                  </div>
                  {!selectedPropertyId && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 ml-auto" />}
                </button>

                {/* Divider */}
                <div className="border-t border-slate-100 my-1" />

                {/* Individual properties */}
                {properties.map(p => {
                  const isSelected = selectedPropertyId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPropertyId(isSelected ? null : p.id)}
                      className={clsx(
                        "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="h-8 w-8 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />{p.location}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter indicator */}
        {selectedProperty && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs font-medium text-blue-700">
              <Building2 className="h-3 w-3" />
              Filtered: {selectedProperty.name}
              <button
                onClick={() => setSelectedPropertyId(null)}
                className="ml-0.5 p-0.5 rounded-full hover:bg-blue-100 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live status + refresh info */}
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
               <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-emerald-700">Live</span>
                <span className="text-xs text-emerald-500 hidden sm:inline">&middot; {formatLastRefresh()}</span>
            </div>

            {/* Manual refresh */}
            <button
              onClick={() => refreshAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <AddPropertyDialog onSuccess={() => { fetchProperties(); fetchStats(); }} />

            {/* Customize Dashboard Button */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                  <Layout className="h-4 w-4 text-slate-500" />
                  <span className="hidden sm:inline">Customize View</span>
                  <span className="sm:hidden">Widgets</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                   <h4 className="font-semibold text-slate-900">Dashboard Widgets</h4>
                   <p className="text-xs text-slate-500">Select monitoring modules to display</p>
                </div>
                <div className="p-2">
                  {WIDGETS.map(widget => {
                    const isActive = activeWidgets.includes(widget.id);
                    const Icon = widget.icon;
                    return (
                      <div 
                        key={widget.id} 
                        onClick={() => toggleWidget(widget.id)}
                        className={clsx(
                          "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1 last:mb-0",
                          isActive ? "bg-blue-50 border border-blue-100" : "hover:bg-slate-50 border border-transparent"
                        )}
                      >
                        <div className={clsx(
                          "p-2 rounded-md",
                          isActive ? "bg-white text-blue-600 shadow-sm" : "bg-slate-100 text-slate-500"
                        )}>
                           <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={clsx("text-sm font-medium", isActive ? "text-blue-900" : "text-slate-700")}>
                              {widget.label}
                            </span>
                            {isActive && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{widget.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Move className="h-3 w-3" />
                    Drag to reorder
                  </p>
                  <button
                    onClick={resetLayout}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Layout
                  </button>
                </div>
              </PopoverContent>
            </Popover>
        </div>
      </div>

      {/* Stats Grid — Dynamic */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title={selectedProperty ? "Property" : "Managed Properties"} 
          value={scopedStats?.properties.total?.toString() ?? properties.length.toString()} 
          unit={selectedProperty ? selectedProperty.type : "Buildings"} 
          icon={Building2} 
          trend={0}
        >
          <div className="mt-4 flex -space-x-2 overflow-hidden">
             {(scopedStats?.properties.images ?? properties.slice(0, 3).map(p => p.image))?.slice(0, 3).map((img, i) => (
               <img key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white object-cover" src={img} alt="" />
             ))}
             {!selectedProperty && (scopedStats?.properties.total ?? properties.length) > 3 && (
               <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 ring-2 ring-white text-xs font-medium text-slate-500">
                 +{(scopedStats?.properties.total ?? properties.length) - 3}
               </div>
             )}
          </div>
        </StatCard>
        
        <StatCard 
          title="Active Alerts" 
          value={scopedStats?.alarms.totalPending?.toString() ?? '—'} 
          unit={scopedStats?.alarms.highSeverity ? `${scopedStats.alarms.highSeverity} Critical` : 'Pending'} 
          icon={AlertTriangle} 
          status={scopedStats?.alarms.totalPending && scopedStats.alarms.totalPending > 0 ? "warning" : "normal"}
        >
          <div className="mt-4 flex flex-col gap-2">
             <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600"><Droplets className="h-3 w-3 text-blue-500" /> Water Leaks</span>
                <span className="font-semibold text-slate-900">{scopedStats?.alarms.waterLeaks ?? 0}</span>
             </div>
             <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600"><AlertTriangle className="h-3 w-3 text-amber-500" /> System Warnings</span>
                <span className="font-semibold text-slate-900">{scopedStats?.alarms.systemWarnings ?? 0}</span>
             </div>
          </div>
        </StatCard>
        
        <StatCard 
          title="Total Sensors" 
          value={scopedStats?.devices.total?.toString() ?? '—'} 
          unit="Devices" 
          icon={Activity} 
        >
           <div className="mt-4 text-xs text-slate-500">
             <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
               <div 
                 className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                 style={{ width: `${scopedStats?.devices.onlinePercent ?? 0}%` }}
               ></div>
             </div>
             <span>{scopedStats?.devices.onlinePercent ?? 0}% Online Status</span>
          </div>
        </StatCard>
        
        <StatCard 
          title="Water Monitoring" 
          value={scopedStats?.water.status ?? '—'} 
          icon={Droplets} 
          status={scopedStats?.water.status === 'Warning' ? 'warning' : 'normal'}
        >
           <div className="mt-4 flex items-center gap-3">
             <div className={clsx(
               "flex h-10 w-10 items-center justify-center rounded-full",
               scopedStats?.water.status === 'Warning' ? "bg-amber-50" : "bg-blue-50"
             )}>
               {scopedStats?.water.status === 'Warning' 
                 ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                 : <CheckCircle2 className="h-5 w-5 text-blue-600" />
               }
             </div>
             <div>
               <p className="text-xs font-medium text-slate-900">
                 {scopedStats?.water.status === 'Warning' 
                   ? `${scopedStats.water.leakWarnings} sensor${scopedStats.water.leakWarnings !== 1 ? 's' : ''} need attention`
                   : 'All Systems Normal'
                 }
               </p>
               <p className="text-xs text-slate-500">Updated {formatLastRefresh()}</p>
             </div>
           </div>
        </StatCard>
      </div>

      {/* --- Dynamic Draggable Widget Area --- */}
      <div className="space-y-6 min-h-[400px]">
        {visibleWidgets.length === 0 && layoutLoaded && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Layout className="h-10 w-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No widgets enabled</p>
            <p className="text-xs text-slate-400 mt-1">Use "Customize View" to add monitoring widgets</p>
          </div>
        )}
        {visibleWidgets.map((widgetId, index) => {
          const WidgetContent = WidgetContentMap[widgetId];
          return (
            <DraggableWidget
              key={widgetId}
              id={widgetId}
              index={index}
              moveWidget={moveWidget}
              onDropEnd={handleDropEnd}
            >
              <WidgetContent />
            </DraggableWidget>
          );
        })}
      </div>

      {/* Buildings at a Glance (Always Visible) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Property Status</h3>
          <Link to="/buildings" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile: Card layout */}
        <div className="divide-y divide-slate-100 md:hidden">
          {loading ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">Loading properties...</div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-slate-700 font-medium">Unable to load</p>
              <button onClick={fetchProperties} className="mt-2 text-sm text-blue-600 hover:underline">Try Again</button>
            </div>
          ) : properties.map(property => (
            <div key={property.id} className={clsx(
              "flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer",
              selectedPropertyId === property.id && "bg-blue-50 border-l-4 border-l-blue-500"
            )} onClick={() => navigate(`/buildings/${property.id}`)}>
              <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                <img src={property.image} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm truncate">{property.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{property.location}</span>
                  <span className={clsx(
                    "text-xs font-medium px-1.5 py-0.5 rounded-full",
                    property.status === 'Normal' ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}>{property.status}</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
            </div>
          ))}
        </div>

        {/* Desktop: Table layout */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3">Property Name</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Devices</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading properties...</td>
                </tr>
              ) : error ? (
                <tr>
                   <td colSpan={5} className="px-6 py-8 text-center">
                     <div className="flex flex-col items-center gap-2">
                       <AlertTriangle className="h-6 w-6 text-amber-500" />
                       <p className="text-sm text-slate-700 font-medium">Unable to load properties</p>
                       <p className="text-xs text-slate-500">{error}</p>
                       <button onClick={fetchProperties} className="mt-2 text-sm text-blue-600 hover:underline">Try Again</button>
                     </div>
                   </td>
                </tr>
              ) : properties.map(property => (
                <tr key={property.id} className={clsx(
                  "group hover:bg-slate-50 transition-colors cursor-pointer",
                  selectedPropertyId === property.id && "bg-blue-50/60 ring-1 ring-inset ring-blue-200"
                )} onClick={() => navigate(`/buildings/${property.id}`)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden">
                         <img src={property.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{property.name}</p>
                        <p className="text-xs text-slate-500">{property.type}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {property.location}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div 
                          className={clsx("h-1.5 rounded-full", "bg-blue-500")}
                          style={{ width: (() => {
                            const total = property.deviceCount ?? 0;
                            const online = property.onlineDevices ?? 0;
                            return total > 0 ? `${Math.round((online / total) * 100)}%` : '0%';
                          })() }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-600">{property.onlineDevices ?? 0}/{property.deviceCount ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      property.status === 'Normal' 
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" 
                        : "bg-amber-50 text-amber-700 ring-amber-600/20"
                    )}>
                      {property.status === 'Normal' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} 
                      {property.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/buildings/${property.id}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center justify-end gap-1">
                      View <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </DndProvider>
  );
}