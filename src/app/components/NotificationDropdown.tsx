import React, { useState, useEffect, useCallback } from 'react';
import { BellRing, AlertTriangle, Droplets, Wind, Thermometer, WifiOff, Flame, Clock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { clsx } from 'clsx';
import { api, type Notification } from '@/app/utils/api';
import { Link } from 'react-router';

function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return `${Math.round(diffMs / 86400000)}d ago`;
}

function getNotificationIcon(type: string) {
  if (type.includes('Water') || type.includes('Leak')) return <Droplets className="h-4 w-4 text-blue-500" />;
  if (type.includes('Smoke')) return <Wind className="h-4 w-4 text-slate-500" />;
  if (type.includes('Fire')) return <Flame className="h-4 w-4 text-red-500" />;
  if (type.includes('Temperature') || type.includes('Humidity')) return <Thermometer className="h-4 w-4 text-orange-500" />;
  if (type.includes('Offline')) return <WifiOff className="h-4 w-4 text-slate-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

function getSeverityDot(severity: string) {
  if (severity === 'high') return 'bg-red-500';
  if (severity === 'medium') return 'bg-amber-500';
  return 'bg-blue-500';
}

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const isFetchingRef = React.useRef(false);

  const fetchNotifications = useCallback(async () => {
    // STABILITY: concurrency guard — prevents overlapping polls
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setLoading(true);
      const data = await api.getNotifications();
      setNotifications(data?.notifications ?? []);
      setUnreadCount(data?.unreadCount ?? 0);
    } catch (err) {
      console.debug('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // STABILITY: Visibility-aware polling — pauses when tab hidden.
  // Initial fetch is delayed 20s to fire well AFTER the Dashboard's sequential
  // waterfall (widgetLayout → properties → stats → telemetry → alarmChart ≈ 5-15s)
  // and after ProfileContext's settings fetch at 15s.
  // Uses 45s interval (not 30s) to avoid synchronizing with Dashboard's
  // 30s auto-refresh cycle — synchronized polls create 4+ concurrent
  // requests that can overwhelm the Edge Function worker.
  useEffect(() => {
    const initialDelay = setTimeout(() => fetchNotifications(), 20000);
    const interval = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, 45000);
    return () => { clearTimeout(initialDelay); clearInterval(interval); };
  }, [fetchNotifications]);

  // Instant badge refresh when AlarmAlertMonitor detects new alarms
  useEffect(() => {
    const handler = () => fetchNotifications();
    window.addEventListener('fiotec-new-alarm', handler);
    return () => window.removeEventListener('fiotec-new-alarm', handler);
  }, [fetchNotifications]);

  // Refetch when popover opens (debounced — won't fire if already fetching)
  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-full bg-slate-50 p-2 text-slate-500 hover:bg-slate-100 transition-colors">
          <BellRing className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Notifications</h4>
            <p className="text-[11px] text-slate-500">
              {unreadCount > 0 ? `${unreadCount} pending alert${unreadCount !== 1 ? 's' : ''}` : 'No active alerts'}
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-100 px-1.5 text-[11px] font-bold text-red-700">
              {unreadCount}
            </span>
          )}
        </div>

        {/* Notification List */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <CheckCircle className="h-8 w-8 text-emerald-300 mb-2" />
              <p className="text-sm font-medium text-slate-500">All clear</p>
              <p className="text-xs text-slate-400 mt-0.5">No pending alerts right now</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={clsx(
                    'flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-default',
                    notif.severity === 'high' && 'bg-red-50/30'
                  )}
                >
                  <div className="relative mt-0.5 shrink-0">
                    <div className={clsx(
                      'flex h-9 w-9 items-center justify-center rounded-full',
                      notif.severity === 'high' ? 'bg-red-50' : notif.severity === 'medium' ? 'bg-amber-50' : 'bg-blue-50'
                    )}>
                      {getNotificationIcon(notif.type)}
                    </div>
                    <span className={clsx(
                      'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white',
                      getSeverityDot(notif.severity)
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 leading-snug">{notif.type}</p>
                      <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimeAgo(notif.time)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.description}</p>
                    <p className="text-xs text-slate-400 mt-1">{notif.property} &middot; {notif.location}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
            <Link
              to="/alarms"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all alarms
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}