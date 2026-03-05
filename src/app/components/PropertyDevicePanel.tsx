import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp,
  Wifi, WifiOff, Battery, BatteryLow, BatteryMedium,
  AlertTriangle, CheckCircle2, Clock, Cpu, Unplug,
  Droplets, Wind, Thermometer, Flame, Volume2, Shield,
  MapPin, Pencil, Check, X, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { type Device, api } from '@/app/utils/api';
import { DeviceHistoryChart, LABEL_TO_METRIC_KEY } from './DeviceHistoryChart';

// ── Format lastUpdate (ISO → relative time) ──────────────
function formatLastUpdate(raw: string | undefined): string {
  if (!raw) return 'Unknown';
  // If it's already human-readable (e.g. "Just now", "5 min ago"), return as-is
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  try {
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return raw;
    const diffMs = Date.now() - dt.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return raw; }
}

// ── Device type metadata ─────────────────────────────────
const deviceMeta: Record<string, { icon: React.ElementType; bg: string; color: string; label: string }> = {
  IAQ:         { icon: Wind,        bg: 'bg-emerald-50',  color: 'text-emerald-600', label: 'Air Quality' },
  Temperature: { icon: Thermometer, bg: 'bg-amber-50',    color: 'text-amber-600',   label: 'Temperature' },
  Leakage:     { icon: Droplets,    bg: 'bg-blue-50',     color: 'text-blue-600',     label: 'Water Leak' },
  'Water Leakage Sensor': { icon: Droplets, bg: 'bg-blue-50', color: 'text-blue-600', label: 'Water Leak' },
  Noise:       { icon: Volume2,     bg: 'bg-violet-50',   color: 'text-violet-600',   label: 'Noise' },
  'Sound Level Sensor': { icon: Volume2, bg: 'bg-violet-50', color: 'text-violet-600', label: 'Sound Level' },
  Smoke:       { icon: Shield,      bg: 'bg-slate-100',   color: 'text-slate-600',    label: 'Smoke Detector' },
  Fire:        { icon: Flame,       bg: 'bg-red-50',      color: 'text-red-600',      label: 'Fire Alarm' },
  'Environment Sensor': { icon: Wind, bg: 'bg-emerald-50', color: 'text-emerald-600', label: 'Environment' },
  'Door/Window Sensor': { icon: Shield, bg: 'bg-slate-100', color: 'text-slate-600', label: 'Door/Window' },
};

// ── Simulated live readings (fallback for demo) ──────────
function getSimulatedReading(device: Device) {
  let h = 0;
  for (let i = 0; i < device.id.length; i++) h = ((h << 5) - h) + device.id.charCodeAt(i);
  h = Math.abs(h);

  switch (device.type) {
    case 'IAQ':         return { value: (380 + (h % 350)).toString(), unit: 'ppm', label: 'CO₂' };
    case 'Temperature': return { value: (19 + (h % 80) / 10).toFixed(1), unit: '°C', label: 'Temp' };
    case 'Leakage':     return { value: h % 5 === 0 ? 'LEAK' : 'DRY', unit: '', label: 'Status' };
    case 'Noise':
    case 'Sound Level Sensor': return { value: (30 + (h % 45)).toString(), unit: 'dB', label: 'Leq' };
    case 'Water Leakage Sensor': return { value: h % 5 === 0 ? 'LEAK' : 'DRY', unit: '', label: 'Status' };
    case 'Smoke':       return { value: (0.05 + (h % 30) / 100).toFixed(2), unit: 'μg/m³', label: 'Particles' };
    case 'Fire':        return { value: (20 + (h % 40) / 10).toFixed(1), unit: '°C', label: 'Heat' };
    default:            return { value: '--', unit: '', label: 'Reading' };
  }
}

// ── Real reading from decoded sensor data ────────────────
function getRealReading(decoded: Record<string, number>): { primary: { value: string; unit: string; label: string }; all: { label: string; value: string; unit: string }[] } {
  const all: { label: string; value: string; unit: string }[] = [];
  if (decoded.temperature !== undefined) all.push({ label: 'Temperature', value: decoded.temperature.toFixed(1), unit: '°C' });
  if (decoded.humidity !== undefined) all.push({ label: 'Humidity', value: Math.round(decoded.humidity).toString(), unit: '%' });
  if (decoded.co2 !== undefined) all.push({ label: 'CO₂', value: Math.round(decoded.co2).toString(), unit: 'ppm' });
  if (decoded.tvoc !== undefined) all.push({ label: 'TVOC', value: Math.round(decoded.tvoc).toString(), unit: 'ppb' });
  if (decoded.pm2_5 !== undefined) all.push({ label: 'PM2.5', value: decoded.pm2_5.toFixed(1), unit: 'μg/m³' });
  if (decoded.pm10 !== undefined) all.push({ label: 'PM10', value: decoded.pm10.toFixed(1), unit: 'μg/m³' });
  if (decoded.barometric_pressure !== undefined) all.push({ label: 'Pressure', value: decoded.barometric_pressure.toFixed(1), unit: 'hPa' });
  if (decoded.illuminance !== undefined) all.push({ label: 'Light', value: Math.round(decoded.illuminance).toString(), unit: 'lux' });
  if (decoded.pir !== undefined) all.push({ label: 'PIR', value: decoded.pir > 0 ? 'Motion' : 'Clear', unit: '' });
  if (decoded.sound_level_leq !== undefined) all.push({ label: 'Leq', value: decoded.sound_level_leq.toFixed(1), unit: 'dB' });
  if (decoded.sound_level_lmax !== undefined) all.push({ label: 'Lmax', value: decoded.sound_level_lmax.toFixed(1), unit: 'dB' });
  if (decoded.sound_level_lmin !== undefined) all.push({ label: 'Lmin', value: decoded.sound_level_lmin.toFixed(1), unit: 'dB' });
  if (decoded.water_leak !== undefined) all.push({ label: 'Leak', value: decoded.water_leak > 0 ? 'LEAK!' : 'Dry', unit: '' });
  const primary = all[0] || { value: '--', unit: '', label: 'No Data' };
  return { primary, all };
}

// ── Device Card (compact row in list) ────────────────────
interface DeviceCardProps {
  device: Device;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (deviceId: string, newStatus: string) => void;
  liveReading?: { devEUI: string; deviceName: string; receivedAt: string; fCnt: number; rssi: number; decoded: Record<string, number> };
}

function DeviceCard({ device, isExpanded, onToggleExpand, onStatusChange, liveReading }: DeviceCardProps) {
  const meta = deviceMeta[device.type] || deviceMeta.IAQ;
  const Icon = meta.icon;
  const hasLive = liveReading && liveReading.decoded && Object.keys(liveReading.decoded).length > 0;
  const realData = hasLive ? getRealReading(liveReading!.decoded) : null;
  const reading = useMemo(() => realData ? realData.primary : getSimulatedReading(device), [device, realData]);

  const isOnline = device.status === 'online';
  const isWarning = device.status === 'warning';

  // ── Focus metric for chart (from clicking live reading boxes) ──
  const [focusMetric, setFocusMetric] = useState<string | undefined>(undefined);

  // ── Location editing state ──
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationValue, setLocationValue] = useState(device.location || '');
  const [locationSaving, setLocationSaving] = useState(false);

  const handleLocationSave = async () => {
    const trimmed = locationValue.trim() || 'Not specified';
    if (trimmed === device.location) { setEditingLocation(false); return; }
    setLocationSaving(true);
    try {
      await api.updateDevice(device.id, { location: trimmed });
      onStatusChange(device.id, device.status); // triggers parent refresh
      setEditingLocation(false);
    } catch (err) {
      console.error('Failed to update location:', err);
    } finally {
      setLocationSaving(false);
    }
  };

  const handleLocationCancel = () => {
    setLocationValue(device.location || '');
    setEditingLocation(false);
  };

  return (
    <div className={clsx(
      "rounded-xl border bg-white transition-all overflow-hidden",
      isExpanded ? "border-blue-200 shadow-lg ring-1 ring-blue-100" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>
      {/* Header row */}
      <div className="w-full text-left p-4 flex items-center gap-4">
        {/* Icon + expand toggle */}
        <button onClick={onToggleExpand} className="p-2.5 rounded-xl shrink-0 cursor-pointer" style={{ background: 'transparent' }}>
          <div className={clsx("p-2.5 rounded-xl", meta.bg, meta.color)}>
            <Icon className="h-5 w-5" />
          </div>
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0" onClick={editingLocation ? undefined : onToggleExpand} role="button" tabIndex={-1}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate cursor-pointer">{device.name}</p>
            {/* Inline-editable location */}
            {editingLocation ? (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <MapPin className="h-3 w-3 text-blue-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={locationValue}
                  onChange={(e) => setLocationValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLocationSave(); if (e.key === 'Escape') handleLocationCancel(); }}
                  placeholder="e.g. Floor 17, Andy Seat"
                  className="h-6 w-40 sm:w-52 rounded border border-blue-300 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                  disabled={locationSaving}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleLocationSave(); }}
                  disabled={locationSaving}
                  className="flex items-center justify-center h-6 w-6 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                >
                  {locationSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleLocationCancel(); }}
                  disabled={locationSaving}
                  className="flex items-center justify-center h-6 w-6 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setLocationValue(device.location || ''); setEditingLocation(true); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors group shrink-0"
              >
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{device.location && device.location !== 'Not specified' ? device.location : 'Set location'}</span>
                <Pencil className="h-2.5 w-2.5 text-slate-300 group-hover:text-blue-400" />
              </button>
            )}
            <span className={clsx(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              isOnline ? "bg-emerald-50 text-emerald-700" :
              isWarning ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-600"
            )}>
              {isOnline ? <Wifi className="h-3 w-3" /> : isWarning ? <AlertTriangle className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {device.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 cursor-pointer">{meta.label}</p>
        </div>

        {/* Live reading */}
        <button onClick={onToggleExpand} className="text-right hidden sm:block shrink-0 cursor-pointer bg-transparent border-none">
          <p className="text-lg font-bold font-mono text-slate-900">
            {reading.value}
            {reading.unit && <span className="text-xs font-normal text-slate-400 ml-0.5">{reading.unit}</span>}
          </p>
          <p className="text-xs text-slate-400">{reading.label}</p>
        </button>

        {/* Battery */}
        <div className={clsx(
          "hidden md:flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5",
          device.battery <= 15 && "bg-red-50 border border-red-200",
          device.battery > 15 && device.battery <= 30 && "bg-amber-50 border border-amber-100"
        )}>
          {device.battery > 50 ? <Battery className="h-4 w-4 text-emerald-500" /> :
           device.battery > 20 ? <BatteryMedium className="h-4 w-4 text-amber-500" /> :
           <BatteryLow className={clsx("h-4 w-4 text-red-500", device.battery <= 10 && "animate-pulse")} />}
          <span className={clsx(
            "text-xs font-medium",
            device.battery <= 15 ? "text-red-600 font-bold" :
            device.battery <= 30 ? "text-amber-600" : "text-slate-600"
          )}>{device.battery}%</span>
        </div>

        {/* Expand indicator */}
        <button onClick={onToggleExpand} className="shrink-0 text-slate-400 cursor-pointer bg-transparent border-none">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 sm:p-6 space-y-5">
            {/* Real-time multi-reading panel (only for live devices) */}
            {hasLive && realData && realData.all.length > 1 && (
              <div className="rounded-xl bg-white border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-600">Live Sensor Readings</span>
                  {liveReading && (
                    <span className="text-xs text-slate-400 ml-auto">
                      fCnt: {liveReading.fCnt} · RSSI: {liveReading.rssi} dBm
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {realData.all.map((r) => {
                    const metricKey = LABEL_TO_METRIC_KEY[r.label];
                    const isSelected = focusMetric === metricKey;
                    return (
                      <button
                        key={r.label}
                        onClick={() => metricKey && setFocusMetric(metricKey)}
                        className={clsx(
                          "rounded-lg p-2.5 text-left transition-all border-2 cursor-pointer",
                          isSelected
                            ? "border-blue-500 bg-blue-50/60 shadow-sm"
                            : "border-transparent bg-slate-50 hover:bg-slate-100 hover:border-slate-200"
                        )}
                      >
                        <p className={clsx("text-xs mb-0.5", isSelected ? "text-blue-600 font-medium" : "text-slate-500")}>{r.label}</p>
                        <p className="text-base font-bold font-mono text-slate-900">
                          {r.value}
                          {r.unit && <span className="text-xs font-normal text-slate-400 ml-0.5">{r.unit}</span>}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2 text-center">Click a reading to view its history chart below</p>
              </div>
            )}

            {/* Mobile reading (simulated fallback) */}
            {!hasLive && (
              <div className="sm:hidden flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-sm text-slate-600">{reading.label}</span>
                <span className="text-lg font-bold font-mono text-slate-900">
                  {reading.value} <span className="text-xs font-normal text-slate-400">{reading.unit}</span>
                </span>
              </div>
            )}

            {/* Control bar */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api.assignDevice(device.id, 'Unassigned');
                    onStatusChange(device.id, '__unassigned__');
                  } catch (err) {
                    console.error('Failed to unassign device:', err);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
              >
                <Unplug className="h-3.5 w-3.5" />
                Unassign
              </button>
            </div>

            {/* Device info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={clsx(
                "rounded-lg bg-white border p-3",
                device.battery <= 15 ? "border-red-300 bg-red-50" :
                device.battery <= 30 ? "border-amber-200 bg-amber-50" : "border-slate-200"
              )}>
                <p className="text-xs text-slate-500 mb-1">Battery</p>
                <div className="flex items-center gap-1.5">
                  {device.battery > 50 ? <Battery className="h-4 w-4 text-emerald-500" /> :
                   device.battery > 20 ? <BatteryMedium className="h-4 w-4 text-amber-500" /> :
                   <BatteryLow className={clsx("h-4 w-4 text-red-500", device.battery <= 10 && "animate-pulse")} />}
                  <span className={clsx("text-sm font-bold", device.battery <= 15 ? "text-red-600" : "text-slate-900")}>{device.battery}%</span>
                </div>
                {device.battery <= 15 && (
                  <p className="text-[10px] text-red-500 mt-1 font-medium">
                    {device.battery === 0 ? '⚠ Battery dead — replace immediately' : '⚠ Low battery — replace soon'}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500 mb-1">Signal</p>
                <div className="flex items-center gap-1.5">
                  {isOnline ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-red-400" />}
                  <span className="text-sm font-bold text-slate-900">{isOnline ? 'Strong' : 'None'}</span>
                </div>
              </div>
              <div className="rounded-lg bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500 mb-1">Last Update</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{formatLastUpdate(device.lastUpdate)}</span>
                </div>
              </div>
              <div className="rounded-lg bg-white border border-slate-200 p-3">
                <p className="text-xs text-slate-500 mb-1">Device ID</p>
                <span className="text-sm font-mono text-slate-700 truncate block">{device.id}</span>
              </div>
            </div>

            {/* Type-specific history chart */}
            <div className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5">
              <DeviceHistoryChart deviceId={device.id} deviceType={device.type} devEui={device.devEui} focusMetric={focusMetric} hideMetricCards={!!(hasLive && realData && realData.all.length > 1)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────
interface PropertyDevicePanelProps {
  devices: Device[];
  propertyName: string;
  onDeviceChange: () => void;
  searchQuery?: string;
  deviceReadings?: Record<string, { devEUI: string; deviceName: string; receivedAt: string; fCnt: number; rssi: number; decoded: Record<string, number> }>;
}

export function PropertyDevicePanel({ devices, propertyName, onDeviceChange, searchQuery = '', deviceReadings }: PropertyDevicePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localDevices, setLocalDevices] = useState<Device[]>(devices);
  const [typeFilter, setTypeFilter] = useState<string>('All');

  // Sync with parent props
  React.useEffect(() => { setLocalDevices(devices); }, [devices]);

  const deviceTypes = useMemo(() => {
    const types = new Set(localDevices.map(d => d.type));
    return ['All', ...Array.from(types).sort()];
  }, [localDevices]);

  const filteredDevices = useMemo(() => {
    let result = localDevices;
    if (typeFilter !== 'All') result = result.filter(d => d.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        d.location.toLowerCase().includes(q)
      );
    }
    return result;
  }, [localDevices, typeFilter, searchQuery]);

  const handleStatusChange = (deviceId: string, newStatus: string) => {
    if (newStatus === '__unassigned__') {
      setLocalDevices(prev => prev.filter(d => d.id !== deviceId));
      onDeviceChange();
      return;
    }
    setLocalDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: newStatus } : d));
    onDeviceChange();
  };

  // Summary counts
  const onlineCount = localDevices.filter(d => d.status === 'online').length;
  const warningCount = localDevices.filter(d => d.status === 'warning').length;
  const offlineCount = localDevices.filter(d => d.status === 'offline').length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-3 py-1.5">
          <Wifi className="h-3 w-3" /> {onlineCount} Online
        </div>
        {warningCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-3 py-1.5">
            <AlertTriangle className="h-3 w-3" /> {warningCount} Warning
          </div>
        )}
        {offlineCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-full px-3 py-1.5">
            <WifiOff className="h-3 w-3" /> {offlineCount} Offline
          </div>
        )}
        <div className="flex-1" />
        {/* Type filter chips */}
        <div className="flex gap-1.5 overflow-x-auto">
          {deviceTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={clsx(
                "rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                typeFilter === type
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Device cards */}
      {filteredDevices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Cpu className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium text-slate-500">No devices found</p>
          <p className="text-xs text-slate-400 mt-1">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDevices.map(device => {
            // Match device to real sensor readings
            let liveReading: any = undefined;
            if (deviceReadings) {
              // Strategy 1: Exact match by devEui (most reliable)
              if (device.devEui) {
                const devEuiLower = device.devEui.toLowerCase();
                for (const [eui, rd] of Object.entries(deviceReadings)) {
                  if (eui.toLowerCase() === devEuiLower) {
                    liveReading = rd;
                    break;
                  }
                }
              }
              // Strategy 2: Match by device name
              if (!liveReading) {
                for (const [eui, rd] of Object.entries(deviceReadings)) {
                  const rdName = (rd.deviceName || '').toLowerCase();
                  const dName = (device.name || '').toLowerCase();
                  if (rdName && dName && (rdName === dName || dName.includes(rdName) || rdName.includes(dName))) {
                    liveReading = rd;
                    break;
                  }
                }
              }
              // Strategy 3: If only one reading exists, auto-match
              if (!liveReading && Object.keys(deviceReadings).length === 1) {
                liveReading = Object.values(deviceReadings)[0];
              }
            }
            return (
              <DeviceCard
                key={device.id}
                device={device}
                isExpanded={expandedId === device.id}
                onToggleExpand={() => setExpandedId(expandedId === device.id ? null : device.id)}
                onStatusChange={handleStatusChange}
                liveReading={liveReading}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}