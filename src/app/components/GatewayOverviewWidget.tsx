import React, { useState, useEffect, useCallback } from 'react';
import { Router, Signal, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router';
import { api, type Gateway } from '@/app/utils/api';

function SignalBars({ signal }: { signal: number }) {
  const bars = signal >= 80 ? 4 : signal >= 60 ? 3 : signal >= 40 ? 2 : 1;
  const color = signal >= 80 ? 'bg-emerald-500' : signal >= 60 ? 'bg-blue-500' : signal >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-end gap-0.5" title={`${signal}% signal`}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={clsx('w-1 rounded-full transition-colors', i < bars ? color : 'bg-slate-200')}
          style={{ height: `${[6, 9, 12, 16][i]}px` }}
        />
      ))}
    </div>
  );
}

function formatTimeSince(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return `${Math.round(diffMs / 86400000)}d ago`;
}

export function GatewayOverviewWidget() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGateways = useCallback(async () => {
    try {
      const data = await api.getGateways();
      setGateways(data);
    } catch (err) {
      console.debug('GatewayOverviewWidget: failed to fetch gateways', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  const online = gateways.filter(g => g.status === 'online').length;
  const warning = gateways.filter(g => g.status === 'warning').length;
  const offline = gateways.filter(g => g.status === 'offline').length;
  const totalDevices = gateways.reduce((sum, g) => sum + g.connectedDevices, 0);
  const avgSignal = gateways.length > 0
    ? Math.round(gateways.filter(g => g.status !== 'offline').reduce((sum, g) => sum + g.signal, 0) / Math.max(1, gateways.filter(g => g.status !== 'offline').length))
    : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600 shrink-0">
            <Router className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Gateway Status</h3>
            <p className="text-sm text-slate-500">Live connectivity across all gateways</p>
          </div>
        </div>
        <Link to="/gateways" className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Manage <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : gateways.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Router className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">No gateways registered</p>
          <p className="text-xs text-slate-400">Add gateways in the Gateways page</p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-xl font-bold text-slate-900">{gateways.length}</p>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{online}</p>
              <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Online</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{warning}</p>
              <p className="text-[10px] font-medium text-amber-600 uppercase tracking-wider">Warning</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <p className="text-xl font-bold text-slate-500">{offline}</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Offline</p>
            </div>
          </div>

          {/* Individual gateway cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gateways.slice(0, 6).map(gw => (
              <div
                key={gw.id}
                className={clsx(
                  'rounded-xl border p-3.5 transition-all hover:shadow-md',
                  gw.status === 'online' ? 'border-emerald-100 bg-white' :
                  gw.status === 'warning' ? 'border-amber-100 bg-amber-50/30' :
                  'border-slate-200 bg-slate-50/50'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className={clsx(
                      'h-9 w-9 rounded-lg flex items-center justify-center',
                      gw.status === 'online' ? 'bg-emerald-100' :
                      gw.status === 'warning' ? 'bg-amber-100' :
                      'bg-slate-100'
                    )}>
                      <Router className={clsx(
                        'h-4 w-4',
                        gw.status === 'online' ? 'text-emerald-600' :
                        gw.status === 'warning' ? 'text-amber-600' :
                        'text-slate-400'
                      )} />
                    </div>
                    <span className={clsx(
                      'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white',
                      gw.status === 'online' ? 'bg-emerald-500' :
                      gw.status === 'warning' ? 'bg-amber-500 animate-pulse' :
                      'bg-slate-400'
                    )} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{gw.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{gw.model} · {gw.protocol}</p>
                  </div>

                  {gw.status !== 'offline' && <SignalBars signal={gw.signal} />}
                </div>

                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>{gw.connectedDevices} device{gw.connectedDevices !== 1 ? 's' : ''}</span>
                    {gw.status !== 'offline' && <span>{gw.signal}% signal</span>}
                  </div>
                  <span className="text-[10px] text-slate-400">{formatTimeSince(gw.lastSeen)}</span>
                </div>
              </div>
            ))}
          </div>

          {gateways.length > 6 && (
            <div className="mt-3 text-center">
              <Link to="/gateways" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                View all {gateways.length} gateways
              </Link>
            </div>
          )}

          {/* Aggregate footer */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="flex items-center gap-1.5">
                <Signal className="h-3.5 w-3.5 text-slate-400" />
                Avg Signal: <strong className="text-slate-700">{avgSignal}%</strong>
              </span>
              <span>
                Total Devices: <strong className="text-slate-700">{totalDevices}</strong>
              </span>
            </div>
            {warning > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {warning} need{warning === 1 ? 's' : ''} attention
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}