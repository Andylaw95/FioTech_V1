import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  CheckCircle,
  Clock,
  Loader2,
  Trash2,
  Building2,
  MoreVertical,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Cpu,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, type Alarm, type AlarmZone, type AlarmTrendPoint } from '@/app/utils/api';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { SafeChartContainer } from './SafeChartContainer';

// --- Types ---
export interface AlarmTypeConfig {
  type: 'water' | 'fire' | 'smoke';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  filterFn: (alarm: Alarm) => boolean;
  theme: {
    primary: string;       // e.g. 'blue'
    bg: string;            // hero bg
    iconBg: string;        // icon container bg
    iconColor: string;     // icon color class
    accentGradientFrom: string;
    accentGradientTo: string;
    chartStroke: string;
    chartFill: string;
    badgeBg: string;
    badgeText: string;
    badgeRing: string;
    statusActiveBg: string;
    statusActiveText: string;
    donutColor: string;
  };
}

function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)} min ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)} hour${Math.round(diffMs / 3600000) !== 1 ? 's' : ''} ago`;
  if (diffMs < 604800000) return `${Math.round(diffMs / 86400000)} day${Math.round(diffMs / 86400000) !== 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleDateString('en-GB', { timeZone: 'Asia/Hong_Kong' });
}

type FilterType = 'all' | 'pending' | 'resolved';

export function AlarmTypePage({ config }: { config: AlarmTypeConfig }) {
  const navigate = useNavigate();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Backend-driven telemetry
  const [zones, setZones] = useState<AlarmZone[]>([]);
  const [trendData, setTrendData] = useState<AlarmTrendPoint[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [deviceCount, setDeviceCount] = useState(0);

  const fetchAlarms = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAlarms();
      setAlarms(data.filter(config.filterFn));
    } catch (err) {
      console.debug(`Failed to fetch ${config.type} alarms:`, err);
      toast.error(`Failed to load ${config.type} alarms`);
    } finally {
      setLoading(false);
    }
  }, [config.filterFn, config.type]);

  const fetchTelemetry = useCallback(async () => {
    try {
      setTelemetryLoading(true);
      const data = await api.getAlarmTelemetry(config.type);
      setZones(data.zones);
      setTrendData(data.trendData);
      setDeviceCount(data.totalRelevantDevices);
    } catch (err) {
      console.debug(`Failed to fetch ${config.type} alarm telemetry:`, err);
      // Don't toast here — the alarm data is more important
    } finally {
      setTelemetryLoading(false);
    }
  }, [config.type]);

  useEffect(() => {
    fetchAlarms();
    fetchTelemetry();
  }, [fetchAlarms, fetchTelemetry]);

  const handleResolve = async (alarm: Alarm) => {
    try {
      await api.updateAlarm(alarm.id, { status: 'resolved' });
      setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, status: 'resolved' } : a));
      toast.success(`Alarm "${alarm.type}" resolved`);
      fetchTelemetry(); // refresh zones after status change
    } catch (err) {
      console.error('Failed to resolve alarm:', err);
      toast.error('Failed to resolve alarm');
    }
  };

  const handleReopen = async (alarm: Alarm) => {
    try {
      await api.updateAlarm(alarm.id, { status: 'pending' });
      setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, status: 'pending' } : a));
      toast.info(`Alarm "${alarm.type}" reopened`);
      fetchTelemetry();
    } catch (err) {
      console.error('Failed to reopen alarm:', err);
      toast.error('Failed to update alarm');
    }
  };

  const handleDelete = async (alarm: Alarm) => {
    try {
      await api.deleteAlarm(alarm.id);
      setAlarms(prev => prev.filter(a => a.id !== alarm.id));
      toast.success('Alarm dismissed');
      fetchTelemetry();
    } catch (err) {
      console.error('Failed to delete alarm:', err);
      toast.error('Failed to delete alarm');
    }
  };

  const stats = useMemo(() => {
    const pending = alarms.filter(a => a.status === 'pending');
    const high = pending.filter(a => a.severity === 'high');
    const medium = pending.filter(a => a.severity === 'medium');
    const resolved = alarms.filter(a => a.status === 'resolved');
    return { pending: pending.length, high: high.length, medium: medium.length, resolved: resolved.length, total: alarms.length };
  }, [alarms]);

  const filteredAlarms = useMemo(() => {
    let result = alarms;
    if (filter !== 'all') result = result.filter(a => a.status === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.type.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.property.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
  }, [alarms, filter, searchQuery]);

  const overallStatus = stats.high > 0 ? 'critical' : stats.pending > 0 ? 'warning' : 'normal';
  const donutData = [
    { name: 'Active', value: stats.pending || 0 },
    { name: 'Resolved', value: stats.resolved || 0 },
  ];
  // Ensure at least some data for visual
  if (stats.total === 0) {
    donutData[0].value = 0;
    donutData[1].value = 1; // show empty resolved as full circle
  }

  // Compute trend direction from real data
  const trendDirection = useMemo(() => {
    if (trendData.length < 2) return 'stable';
    const recent = trendData.slice(-3).reduce((sum, d) => sum + d.count, 0);
    const earlier = trendData.slice(0, 3).reduce((sum, d) => sum + d.count, 0);
    if (recent > earlier) return 'increasing';
    if (recent < earlier) return 'decreasing';
    return 'stable';
  }, [trendData]);

  const t = config.theme;

  return (
    <div className="space-y-5">
      {/* Back button + title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        <button
          onClick={() => navigate('/alarms')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Alarms
        </button>
      </motion.div>

      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className={clsx(
          "rounded-2xl border p-5 sm:p-6 shadow-sm",
          t.bg,
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className={clsx("rounded-2xl p-3.5", t.iconBg)}>
              <div className={t.iconColor}>{config.icon}</div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{config.title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{config.subtitle}</p>
              <div className="flex items-center gap-2 mt-2.5">
                <span className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  overallStatus === 'critical' ? 'bg-red-100 text-red-700' :
                  overallStatus === 'warning' ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700'
                )}>
                  {overallStatus === 'critical' ? <ShieldAlert className="h-3.5 w-3.5" /> :
                   overallStatus === 'warning' ? <AlertTriangle className="h-3.5 w-3.5" /> :
                   <ShieldCheck className="h-3.5 w-3.5" />}
                  {overallStatus === 'critical' ? 'Critical' : overallStatus === 'warning' ? 'Warning' : 'All Clear'}
                </span>
                {!loading && (
                  <span className="text-xs text-slate-400">
                    Last checked {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' })}
                  </span>
                )}
                {deviceCount > 0 && (
                  <span className="text-xs text-slate-400 flex items-center gap-1 ml-1">
                    <Cpu className="h-3 w-3" />
                    {deviceCount} sensor{deviceCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: stats.total, icon: Activity, color: 'text-slate-600' },
              { label: 'Active', value: stats.pending, icon: Clock, color: 'text-amber-600' },
              { label: 'High', value: stats.high, icon: AlertTriangle, color: 'text-red-600' },
              { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-white/80 backdrop-blur-sm border border-white/60 px-4 py-3 text-center shadow-sm">
                <s.icon className={clsx("h-4 w-4 mx-auto mb-1", s.color)} />
                <p className="text-xl font-bold text-slate-900">{loading ? '—' : s.value}</p>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Charts & Zones Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid gap-5 lg:grid-cols-3"
      >
        {/* Trend Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Weekly Trend</h3>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              {trendDirection === 'increasing' ? (
                <>
                  <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-red-500 font-medium">Increasing</span>
                </>
              ) : trendDirection === 'decreasing' ? (
                <>
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-500 font-medium">Decreasing</span>
                </>
              ) : (
                <span className="text-slate-400 font-medium">Stable</span>
              )}
            </div>
          </div>
          <div className="h-[200px] w-full min-w-0">
            {telemetryLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : (
              <SafeChartContainer>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`gradient-${config.type}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={t.chartFill} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={t.chartFill} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value, 'Alarms']}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={t.chartStroke}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#gradient-${config.type})`}
                  />
                </AreaChart>
              </SafeChartContainer>
            )}
          </div>
        </div>

        {/* Status Donut + Zones */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Resolution Rate</h3>
          <div className="h-[140px] w-full relative flex items-center justify-center min-w-0">
            <SafeChartContainer>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={58}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={t.donutColor} />
                  <Cell fill="#e2e8f0" />
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </SafeChartContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900">
                {stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 100}%
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Resolved</span>
            </div>
          </div>

          {/* Zone Status — from backend telemetry */}
          <div className="mt-auto pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Zone Status</p>
            {telemetryLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
              </div>
            ) : zones.length > 0 ? (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {zones.map((zone, idx) => (
                  <div key={`${zone.name}-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium truncate mr-2">{zone.name}</span>
                    <span className={clsx(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium shrink-0",
                      zone.status === 'normal' ? 'bg-emerald-50 text-emerald-700' :
                      zone.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    )}>
                      <span className={clsx(
                        "h-1.5 w-1.5 rounded-full",
                        zone.status === 'normal' ? 'bg-emerald-500' :
                        zone.status === 'warning' ? 'bg-amber-500' :
                        'bg-red-500'
                      )} />
                      {zone.status === 'normal' ? 'Normal' : zone.status === 'warning' ? 'Warning' : 'Alert'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">No sensors deployed for this alarm type</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Alarm Records Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      >
        <div className="border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h3 className="font-semibold text-slate-900 text-sm shrink-0">{config.title} Records</h3>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {([['all', 'All'], ['pending', 'Pending'], ['resolved', 'Resolved']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={clsx(
                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                    filter === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {label}
                  {key === 'pending' && stats.pending > 0 && (
                    <span className={clsx(
                      "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-xs font-bold text-white",
                      t.badgeBg.includes('bg-') ? t.badgeBg : 'bg-red-500'
                    )}>
                      {stats.pending}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full sm:w-56 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : filteredAlarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CheckCircle className="h-10 w-10 mb-3 text-emerald-300" />
            <p className="text-sm font-medium text-slate-500">
              {filter === 'pending' ? 'No pending alarms' : filter === 'resolved' ? 'No resolved alarms' : `No ${config.type} alarms found`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery ? 'Try a different search term' : 'System is operating normally'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAlarms.map((alarm) => (
                <div key={alarm.id} className={clsx(
                  "px-4 py-3",
                  alarm.status === 'pending' && alarm.severity === 'high' && "bg-red-50/30"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-medium text-slate-900 text-sm truncate">{alarm.type}</p>
                        <span className={clsx(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset shrink-0",
                          alarm.severity === 'high' ? "bg-red-50 text-red-700 ring-red-600/20" :
                          alarm.severity === 'medium' ? "bg-amber-50 text-amber-700 ring-amber-600/20" :
                          "bg-blue-50 text-blue-700 ring-blue-600/20"
                        )}>{alarm.severity.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">{alarm.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                        <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{alarm.property}</span>
                        <span>·</span>
                        <span>{formatTimeAgo(alarm.time)}</span>
                        <span>·</span>
                        {alarm.status === 'resolved' ? (
                          <span className="text-emerald-600 font-medium flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" />Resolved</span>
                        ) : (
                          <span className="text-amber-600 font-medium flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />Pending</span>
                        )}
                      </div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="end">
                        {alarm.status === 'pending' ? (
                          <button onClick={() => handleResolve(alarm)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors">
                            <CheckCircle className="h-3.5 w-3.5" /> Resolve
                          </button>
                        ) : (
                          <button onClick={() => handleReopen(alarm)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors">
                            <Clock className="h-3.5 w-3.5" /> Reopen
                          </button>
                        )}
                        <div className="my-1 border-t border-slate-100" />
                        <button onClick={() => handleDelete(alarm)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" /> Dismiss
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Property</th>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">Time</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAlarms.map((alarm) => (
                    <tr key={alarm.id} className={clsx(
                      "group hover:bg-slate-50 transition-colors",
                      alarm.status === 'pending' && alarm.severity === 'high' && "bg-red-50/30"
                    )}>
                      <td className="px-6 py-4 font-medium text-slate-900">{alarm.type}</td>
                      <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={alarm.description}>{alarm.description}</td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1 text-xs text-slate-600">
                          <Building2 className="h-3 w-3" />
                          {alarm.property}
                        </span>
                        <span className="text-xs text-slate-400">{alarm.location}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                          alarm.severity === 'high' ? "bg-red-50 text-red-700 ring-red-600/20" :
                          alarm.severity === 'medium' ? "bg-amber-50 text-amber-700 ring-amber-600/20" :
                          "bg-blue-50 text-blue-700 ring-blue-600/20"
                        )}>
                          {alarm.severity.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">{formatTimeAgo(alarm.time)}</td>
                      <td className="px-6 py-4">
                        {alarm.status === 'resolved' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs">
                            <CheckCircle className="h-3 w-3" /> Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-xs">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-44 p-1" align="end">
                            {alarm.status === 'pending' ? (
                              <button
                                onClick={() => handleResolve(alarm)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors"
                              >
                                <CheckCircle className="h-3.5 w-3.5" /> Resolve
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReopen(alarm)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                <Clock className="h-3.5 w-3.5" /> Reopen
                              </button>
                            )}
                            <div className="my-1 border-t border-slate-100" />
                            <button
                              onClick={() => handleDelete(alarm)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Dismiss
                            </button>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}