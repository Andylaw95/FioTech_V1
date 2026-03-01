import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlarmBarChart } from '@/app/components/Charts';
import { 
  Filter, 
  Search, 
  AlertTriangle, 
  Droplets, 
  Flame, 
  Wind,
  Thermometer,
  WifiOff,
  MoreVertical,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  Building2,
  ArrowRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, type Alarm } from '@/app/utils/api';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';

function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)} min ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)} hour${Math.round(diffMs / 3600000) !== 1 ? 's' : ''} ago`;
  if (diffMs < 604800000) return `${Math.round(diffMs / 86400000)} day${Math.round(diffMs / 86400000) !== 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleDateString();
}

function getAlarmIcon(type: string) {
  if (type.includes('Water') || type.includes('Leak')) return <Droplets className="h-4 w-4 text-blue-500" />;
  if (type.includes('Smoke')) return <Wind className="h-4 w-4 text-slate-500" />;
  if (type.includes('Fire')) return <Flame className="h-4 w-4 text-red-500" />;
  if (type.includes('Temperature') || type.includes('Humidity')) return <Thermometer className="h-4 w-4 text-orange-500" />;
  if (type.includes('Offline')) return <WifiOff className="h-4 w-4 text-slate-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

type FilterType = 'all' | 'pending' | 'resolved';

export function Alarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const fetchAlarms = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAlarms();
      setAlarms(data);
    } catch (err) {
      console.debug('Failed to fetch alarms:', err);
      toast.error('Failed to load alarms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlarms();
  }, [fetchAlarms]);

  // Auto-refresh every 30s (only when tab is visible)
  useEffect(() => {
    const silentRefresh = () => {
      if (!document.hidden) {
        api.getAlarms().then(setAlarms).catch(() => {});
      }
    };
    const timer = setInterval(silentRefresh, 30000);
    document.addEventListener('visibilitychange', silentRefresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', silentRefresh); };
  }, []);

  const handleResolve = async (alarm: Alarm) => {
    try {
      await api.updateAlarm(alarm.id, { status: 'resolved' });
      setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, status: 'resolved' } : a));
      toast.success(`Alarm "${alarm.type}" resolved`);
    } catch (err) {
      console.debug('Failed to resolve alarm:', err);
      toast.error('Failed to resolve alarm');
    }
  };

  const handleReopen = async (alarm: Alarm) => {
    try {
      await api.updateAlarm(alarm.id, { status: 'pending' });
      setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, status: 'pending' } : a));
      toast.info(`Alarm "${alarm.type}" reopened`);
    } catch (err) {
      console.debug('Failed to reopen alarm:', err);
      toast.error('Failed to update alarm');
    }
  };

  const handleDelete = async (alarm: Alarm) => {
    try {
      await api.deleteAlarm(alarm.id);
      setAlarms(prev => prev.filter(a => a.id !== alarm.id));
      toast.success('Alarm dismissed');
    } catch (err) {
      console.debug('Failed to delete alarm:', err);
      toast.error('Failed to delete alarm');
    }
  };

  // Stats
  const stats = useMemo(() => {
    const pending = alarms.filter(a => a.status === 'pending');
    const high = pending.filter(a => a.severity === 'high');
    const medium = pending.filter(a => a.severity === 'medium');
    const resolved = alarms.filter(a => a.status === 'resolved');
    return { pending: pending.length, high: high.length, medium: medium.length, resolved: resolved.length, total: alarms.length };
  }, [alarms]);

  // Filtered + searched alarms
  const filteredAlarms = useMemo(() => {
    let result = alarms;
    if (filter !== 'all') result = result.filter(a => a.status === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        (a.type ?? '').toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.location ?? '').toLowerCase().includes(q) ||
        (a.property ?? '').toLowerCase().includes(q)
      );
    }
    // Sort: pending first, then by time desc
    return result.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
  }, [alarms, filter, searchQuery]);

  // Compute type-specific counts for the nav cards
  const typeCounts = useMemo(() => {
    const water = alarms.filter(a => {
      const t = a.type.toLowerCase();
      return t.includes('water') || t.includes('leak') || t.includes('flood') || t.includes('moisture');
    });
    const fire = alarms.filter(a => {
      const t = a.type.toLowerCase();
      return t.includes('fire') || t.includes('heat') || t.includes('sprinkler');
    });
    const smoke = alarms.filter(a => {
      const t = a.type.toLowerCase();
      return t.includes('smoke') || t.includes('air quality') || t.includes('ventilation');
    });
    return {
      water: { total: water.length, pending: water.filter(a => a.status === 'pending').length },
      fire: { total: fire.length, pending: fire.filter(a => a.status === 'pending').length },
      smoke: { total: smoke.length, pending: smoke.filter(a => a.status === 'pending').length },
    };
  }, [alarms]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Type-specific quick navigation */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            key: 'water',
            label: 'Water Alarms',
            desc: 'Leak detection & pipeline monitoring',
            icon: Droplets,
            path: '/alarms/water',
            counts: typeCounts.water,
            gradient: 'from-blue-500 to-sky-400',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            borderColor: 'border-blue-100',
            hoverBg: 'hover:border-blue-200',
          },
          {
            key: 'fire',
            label: 'Fire Alarms',
            desc: 'Fire detection & sprinkler systems',
            icon: Flame,
            path: '/alarms/fire',
            counts: typeCounts.fire,
            gradient: 'from-red-500 to-orange-400',
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            borderColor: 'border-red-100',
            hoverBg: 'hover:border-red-200',
          },
          {
            key: 'smoke',
            label: 'Smoke Alarms',
            desc: 'Smoke sensors & air quality',
            icon: Wind,
            path: '/alarms/smoke',
            counts: typeCounts.smoke,
            gradient: 'from-slate-500 to-gray-400',
            iconBg: 'bg-slate-200',
            iconColor: 'text-slate-700',
            borderColor: 'border-slate-200',
            hoverBg: 'hover:border-slate-300',
          },
        ].map((item, index) => (
          <motion.button
            key={item.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            onClick={() => navigate(item.path)}
            className={clsx(
              "relative rounded-2xl border bg-white p-5 shadow-sm text-left transition-all group",
              item.borderColor,
              item.hoverBg,
              "hover:shadow-md"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={clsx("rounded-xl p-2.5", item.iconBg)}>
                  <item.icon className={clsx("h-5 w-5", item.iconColor)} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{item.label}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
              <div>
                <span className="text-lg font-bold text-slate-900">{loading ? '—' : item.counts.total}</span>
                <span className="text-xs text-slate-500 ml-1">total</span>
              </div>
              {item.counts.pending > 0 && (
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs font-medium text-amber-600">{item.counts.pending} active</span>
                </div>
              )}
              {item.counts.pending === 0 && !loading && (
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600">All clear</span>
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Chart Section */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <h3 className="mb-4 text-base sm:text-lg font-semibold text-slate-900">Alarm Frequency</h3>
          <AlarmBarChart />
        </div>

        {/* Summary Stats */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-4">
               <div className="rounded-full bg-red-100 p-3 text-red-600 shrink-0">
                 <AlertTriangle className="h-6 w-6" />
               </div>
               <div>
                 <p className="text-sm font-medium text-slate-600">Active Alerts</p>
                 <p className="text-3xl font-bold text-slate-900">
                   {loading ? '—' : stats.pending}
                 </p>
                 {!loading && stats.high > 0 && (
                   <p className="text-xs text-red-600 font-medium mt-1">{stats.high} high severity</p>
                 )}
               </div>
             </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-4">
               <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 shrink-0">
                 <CheckCircle className="h-6 w-6" />
               </div>
               <div>
                 <p className="text-sm font-medium text-slate-600">Resolved</p>
                 <p className="text-3xl font-bold text-slate-900">
                   {loading ? '—' : stats.resolved}
                 </p>
                 <p className="text-xs text-slate-500 mt-1">{stats.total} total alarms</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h3 className="font-semibold text-slate-900 text-base sm:text-lg shrink-0">Alarm Records</h3>
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
                    <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                      {stats.pending}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-3">
             {stats.pending > 0 && (filter === 'all' || filter === 'pending') && (
               <>
                 <button
                   onClick={async () => {
                     if (!confirm(`Resolve all ${stats.pending} pending alarms?`)) return;
                     try {
                       await api.bulkResolveAlarms();
                       fetchAlarms();
                       toast.success(`Resolved ${stats.pending} alarms`);
                     } catch (err) {
                       console.error('Failed to bulk resolve:', err);
                       toast.error('Failed to resolve alarms');
                     }
                   }}
                   className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shrink-0"
                 >
                   <CheckCircle2 className="h-3.5 w-3.5" /> Resolve All
                 </button>
                 <button
                   onClick={async () => {
                     if (!confirm(`Dismiss all ${stats.pending} pending alarms? This cannot be undone.`)) return;
                     try {
                       await api.bulkDismissAlarms();
                       fetchAlarms();
                       toast.success(`Dismissed ${stats.pending} alarms`);
                     } catch (err) {
                       console.error('Failed to bulk dismiss:', err);
                       toast.error('Failed to dismiss alarms');
                     }
                   }}
                   className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors shrink-0"
                 >
                   <Trash2 className="h-3.5 w-3.5" /> Dismiss All
                 </button>
               </>
             )}
             <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search alarms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full sm:w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-blue-500"
                />
              </div>
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredAlarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CheckCircle className="h-10 w-10 mb-3 text-emerald-300" />
            <p className="text-sm font-medium text-slate-500">
              {filter === 'pending' ? 'No pending alarms' : filter === 'resolved' ? 'No resolved alarms' : 'No alarms found'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery ? 'Try a different search term' : 'All systems are running smoothly'}
            </p>
          </div>
        ) : (
        <>
        {/* Mobile: Card layout */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredAlarms.map((alarm) => (
            <div key={alarm.id} className={clsx(
              "px-4 py-3",
              alarm.status === 'pending' && alarm.severity === 'high' && "bg-red-50/30"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">{getAlarmIcon(alarm.type)}</div>
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

        {/* Desktop: Table layout */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm">
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
                   <td className="px-6 py-4 font-medium text-slate-900">
                     <span className="flex items-center gap-2">
                       {getAlarmIcon(alarm.type)}
                       {alarm.type}
                     </span>
                   </td>
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
                             <CheckCircle className="h-3.5 w-3.5" />
                             Resolve
                           </button>
                         ) : (
                           <button
                             onClick={() => handleReopen(alarm)}
                             className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                           >
                             <Clock className="h-3.5 w-3.5" />
                             Reopen
                           </button>
                         )}
                         <div className="my-1 border-t border-slate-100" />
                         <button
                           onClick={() => handleDelete(alarm)}
                           className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                         >
                           <Trash2 className="h-3.5 w-3.5" />
                           Dismiss
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
      </div>
    </div>
  );
}