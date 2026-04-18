import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type SafetyAlarm } from '@/app/utils/api';
import { supabase } from '@/app/utils/AuthContext';

export interface PropertyAlarmSummary {
  propertyId: string;
  propertyName?: string | null;
  pending: number;
  inProgress: number;
  hasCritical: boolean;
  latest?: SafetyAlarm;
}

export interface PortfolioStream {
  alarms: SafetyAlarm[];
  summaryByProperty: Record<string, PropertyAlarmSummary>;
  globalPending: number;
  globalCritical: number;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

const MAX_FEED = 200;

function summarize(alarms: SafetyAlarm[]): Record<string, PropertyAlarmSummary> {
  const out: Record<string, PropertyAlarmSummary> = {};
  for (const a of alarms) {
    const key = a.property_id;
    if (!out[key]) {
      out[key] = {
        propertyId: key,
        propertyName: a.property_name,
        pending: 0,
        inProgress: 0,
        hasCritical: false,
        latest: a,
      };
    }
    const s = out[key];
    if (a.status === 'pending') s.pending++;
    else if (a.status === 'acknowledged' || a.status === 'in_progress') s.inProgress++;
    if (
      a.severity === 'critical' &&
      (a.status === 'pending' || a.status === 'acknowledged' || a.status === 'in_progress')
    ) {
      s.hasCritical = true;
    }
    if (!s.latest || new Date(a.occurred_at) > new Date(s.latest.occurred_at)) {
      s.latest = a;
      s.propertyName = a.property_name ?? s.propertyName;
    }
  }
  return out;
}

export function usePortfolioStream(options: { propertyId?: string } = {}): PortfolioStream {
  const [alarms, setAlarms] = useState<SafetyAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const filterPropertyId = options.propertyId;
  const mountedRef = useRef(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const { alarms: rows } = await api.listSafetyAlarms({
        propertyId: filterPropertyId,
        limit: MAX_FEED,
      });
      if (!mountedRef.current) return;
      setAlarms(rows || []);
      setError(undefined);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPropertyId]);

  useEffect(() => {
    const channelName = filterPropertyId
      ? `safety_alarms:${filterPropertyId}`
      : 'safety_alarms:portfolio';
    const channel = supabase.channel(channelName);
    const filter = filterPropertyId ? `property_id=eq.${filterPropertyId}` : undefined;

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'safety_alarms', filter },
        (payload: { new: SafetyAlarm }) => {
          const row = payload.new;
          if (!row) return;
          setAlarms((prev) => {
            if (prev.find((a) => a.id === row.id)) return prev;
            return [row, ...prev].slice(0, MAX_FEED);
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'safety_alarms', filter },
        (payload: { new: SafetyAlarm }) => {
          const row = payload.new;
          if (!row) return;
          setAlarms((prev) => prev.map((a) => (a.id === row.id ? row : a)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'safety_alarms', filter },
        (payload: { old: SafetyAlarm }) => {
          const old = payload.old;
          if (!old) return;
          setAlarms((prev) => prev.filter((a) => a.id !== old.id));
        },
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[PortfolioStream] subscription issue:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterPropertyId]);

  const summaryByProperty = useMemo(() => summarize(alarms), [alarms]);
  const globalPending = useMemo(
    () => alarms.filter((a) => a.status === 'pending').length,
    [alarms],
  );
  const globalCritical = useMemo(
    () =>
      alarms.filter(
        (a) =>
          a.severity === 'critical' &&
          (a.status === 'pending' ||
            a.status === 'acknowledged' ||
            a.status === 'in_progress'),
      ).length,
    [alarms],
  );

  return {
    alarms,
    summaryByProperty,
    globalPending,
    globalCritical,
    loading,
    error,
    refresh,
  };
}
