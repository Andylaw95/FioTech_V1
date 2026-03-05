import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  RefreshCcw,
  Loader2,
  Signal,
  Thermometer,
  Droplets,
  Wind,
  Flame,
  Clock,
  ChevronDown,
  ChevronUp,
  Webhook,
  Activity,
  Database,
  Volume2,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  api,
  type SensorDataResponse,
  type SensorDataEntry,
  type SensorDevice,
} from '@/app/utils/api';
import { motion, AnimatePresence } from 'motion/react';

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function formatFrequency(hz: number): string {
  if (!hz) return '—';
  return `${(hz / 1000000).toFixed(1)} MHz`;
}

function getDecodedIcon(key: string) {
  const lower = key.toLowerCase();
  if (lower.includes('temp')) return <Thermometer className="h-3.5 w-3.5 text-orange-500" />;
  if (lower.includes('humid')) return <Droplets className="h-3.5 w-3.5 text-blue-500" />;
  if (lower.includes('smoke') || lower.includes('fire')) return <Flame className="h-3.5 w-3.5 text-red-500" />;
  if (lower.includes('co2') || lower.includes('voc') || lower.includes('pm')) return <Wind className="h-3.5 w-3.5 text-teal-500" />;
  if (lower.includes('sound') || lower.includes('noise') || lower.includes('leq') || lower.includes('lmin') || lower.includes('lmax')) return <Volume2 className="h-3.5 w-3.5 text-violet-500" />;
  if (lower.includes('water_leak') || lower.includes('leak')) return <Droplets className="h-3.5 w-3.5 text-blue-500" />;
  return <Activity className="h-3.5 w-3.5 text-slate-400" />;
}

function formatDecodedValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  const lower = key.toLowerCase();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (lower.includes('temp')) return `${value.toFixed(1)}°C`;
    if (lower.includes('humid')) return `${value.toFixed(1)}%`;
    if (lower.includes('battery')) return `${value}%`;
    if (lower.includes('pressure')) return `${value.toFixed(1)} hPa`;
    if (lower.includes('sound') || lower.includes('leq') || lower.includes('lmin') || lower.includes('lmax')) return `${value.toFixed(1)} dB`;
    if (lower.includes('water_leak') || lower.includes('leak')) return value > 0 ? 'LEAK!' : 'Dry';
    return String(value);
  }
  return String(value);
}

// ─── Device Summary Card ─────────────────────────────────

function DeviceCard({ device }: { device: SensorDevice }) {
  const [expanded, setExpanded] = useState(false);
  const rssiPercent = device.lastRssi > -999 
    ? Math.max(0, Math.min(100, 2 * (device.lastRssi + 100))) 
    : 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="p-1.5 bg-violet-50 rounded-md">
          <Radio className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{device.deviceName}</p>
          <p className="text-[11px] text-slate-500 font-mono truncate">{device.devEUI}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="hidden sm:inline">{device.uplinkCount} uplinks</span>
          <span>{formatTimeAgo(device.lastSeen)}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/50 space-y-3">
              {/* Signal Info */}
              <div className="flex flex-wrap gap-3 sm:gap-4 text-xs">
                <div>
                  <span className="text-slate-500">RSSI:</span>{' '}
                  <span className="font-medium text-slate-800">{device.lastRssi > -999 ? `${device.lastRssi} dBm` : '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Signal:</span>{' '}
                  <span className="font-medium text-slate-800">{rssiPercent}%</span>
                </div>
                <div>
                  <span className="text-slate-500">SNR:</span>{' '}
                  <span className="font-medium text-slate-800">{device.lastSnr} dB</span>
                </div>
              </div>

              {/* Last decoded data */}
              {device.lastDecodedData && Object.keys(device.lastDecodedData).length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-600 mb-1.5">Last Sensor Readings</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(device.lastDecodedData).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1.5 bg-white rounded-md border border-slate-100 px-2 py-1.5">
                        {getDecodedIcon(key)}
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-500 truncate">{key}</p>
                          <p className="text-xs font-medium text-slate-800">{formatDecodedValue(key, value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {device.applicationName && (
                <p className="text-[11px] text-slate-500">
                  Application: <span className="font-medium">{device.applicationName}</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Uplink Entry Row ────────────────────────────────────

function UplinkRow({ entry }: { entry: SensorDataEntry }) {
  const [expanded, setExpanded] = useState(false);

  const eventBadge = entry.eventType && entry.eventType !== 'uplink' ? (
    <span className={clsx(
      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase shrink-0',
      entry.eventType === 'join' ? 'bg-blue-50 text-blue-700' :
      entry.eventType === 'error' ? 'bg-red-50 text-red-700' :
      entry.eventType === 'ack' ? 'bg-slate-100 text-slate-600' :
      'bg-slate-100 text-slate-600'
    )}>
      {entry.eventType}
    </span>
  ) : null;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50/50 transition-colors text-xs"
      >
        <div className={clsx(
          'w-1.5 h-1.5 rounded-full shrink-0',
          entry.eventType === 'error' ? 'bg-red-500' :
          entry.eventType === 'join' ? 'bg-blue-500' :
          entry.decodedData ? 'bg-emerald-500' : 'bg-slate-300'
        )} />
        <span className="font-medium text-slate-800 truncate min-w-0 flex-1">{entry.deviceName}</span>
        {eventBadge}
        <span className="text-slate-500 font-mono hidden sm:inline">{entry.devEUI ? `${entry.devEUI.slice(0, 8)}...` : '—'}</span>
        {entry.eventType !== 'join' && entry.eventType !== 'error' && (
          <span className="text-slate-400 hidden md:inline">fCnt:{entry.fCnt}</span>
        )}
        {entry.rssi > -999 && (
          <span className="text-slate-500">{entry.rssi} dBm</span>
        )}
        <span className="text-slate-400 shrink-0">{formatTimeAgo(entry.receivedAt)}</span>
        {expanded ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 bg-slate-50/50 space-y-2 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-500">Frequency:</span>{' '}
                  <span className="font-medium">{formatFrequency(entry.frequency)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Port:</span>{' '}
                  <span className="font-medium">{entry.fPort}</span>
                </div>
                <div>
                  <span className="text-slate-500">SNR:</span>{' '}
                  <span className="font-medium">{entry.snr} dB</span>
                </div>
                <div>
                  <span className="text-slate-500">Gateway:</span>{' '}
                  <span className="font-mono font-medium">{entry.gatewayEUI.slice(0, 8) || '—'}...</span>
                </div>
              </div>
              {entry.decodedData && Object.keys(entry.decodedData).length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1">Decoded Data:</p>
                  <div className="bg-white rounded-md border border-slate-200 p-2 font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.decodedData, null, 2)}
                  </div>
                </div>
              )}
              {entry.rawData && !entry.decodedData && (
                <div>
                  <p className="text-slate-500 mb-1">Raw Data (Base64):</p>
                  <div className="bg-white rounded-md border border-slate-200 p-2 font-mono text-[11px] text-slate-700 break-all">
                    {entry.rawData}
                  </div>
                </div>
              )}
              {entry.errorMessage && (
                <div>
                  <p className="text-red-500 mb-1">Error:</p>
                  <div className="bg-red-50 rounded-md border border-red-200 p-2 text-[11px] text-red-700">
                    {entry.errorMessage}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Widget ─────────────────────────────────────────

export function SensorDataWidget() {
  const [data, setData] = useState<SensorDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'devices' | 'uplinks'>('devices');

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const result = await api.getSensorData(50);
      setData(result);
    } catch (e) {
      console.debug('Failed to fetch sensor data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          <span className="text-sm text-slate-500">Loading sensor data...</span>
        </div>
      </div>
    );
  }

  const hasData = data && data.totalEntries > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Live Sensor Data</h3>
            <p className="text-xs text-slate-500">
              {hasData
                ? `${data.totalDevices} device${data.totalDevices !== 1 ? 's' : ''} / ${data.totalEntries} uplinks`
                : 'No uplink data received yet'}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          title="Refresh"
        >
          <RefreshCcw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {!hasData ? (
        <div className="px-5 pb-6 text-center py-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <Database className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-600 font-medium mb-1">No sensor data yet</p>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Configure the webhook integration on your Milesight gateway to start receiving live sensor data.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-slate-100 px-5">
            <button
              onClick={() => setTab('devices')}
              className={clsx(
                'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                tab === 'devices'
                  ? 'border-violet-500 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              Devices ({data.totalDevices})
            </button>
            <button
              onClick={() => setTab('uplinks')}
              className={clsx(
                'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                tab === 'uplinks'
                  ? 'border-violet-500 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              Recent Uplinks ({data.entries.length})
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {tab === 'devices' ? (
              <div className="p-4 space-y-2">
                {data.devices.map((device) => (
                  <DeviceCard key={device.devEUI} device={device} />
                ))}
              </div>
            ) : (
              <div>
                {data.entries.map((entry) => (
                  <UplinkRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}