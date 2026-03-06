import React, { useMemo, useState } from 'react';
import {
  X, Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryWarning,
  Droplets, Wind, Thermometer, Flame, Volume2, Cpu, AlertTriangle, CheckCircle2, Clock, MapPin,
  ArrowLeft, History
} from 'lucide-react';
import { clsx } from 'clsx';
import type { Device } from '@/app/utils/api';
import { MiniDeviceChart, DeviceHistoryChart } from '@/app/components/DeviceHistoryChart';

// Device type → icon + color
const DEVICE_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  IAQ: { icon: Wind, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Indoor Air Quality' },
  Leakage: { icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Water Leak Detector' },
  'Water Leakage Sensor': { icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Water Leak Detector' },
  Temperature: { icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Temperature Sensor' },
  Smoke: { icon: Flame, color: 'text-red-600', bg: 'bg-red-50', label: 'Smoke Detector' },
  Fire: { icon: Flame, color: 'text-red-600', bg: 'bg-red-50', label: 'Fire Alarm' },
  Noise: { icon: Volume2, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Noise Monitor' },
  'Sound Level Sensor': { icon: Volume2, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Sound Level Sensor' },
  'Environment Sensor': { icon: Wind, color: 'text-teal-600', bg: 'bg-teal-50', label: 'Environment Sensor' },
  'Door/Window Sensor': { icon: Cpu, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Door/Window Sensor' },
};

function getDeviceMeta(type: string) {
  return DEVICE_META[type] || { icon: Cpu, color: 'text-slate-600', bg: 'bg-slate-50', label: type };
}

function BatteryIcon({ level }: { level: number }) {
  if (level <= 0) return <BatteryWarning className="h-4 w-4 text-red-500" />;
  if (level <= 20) return <BatteryLow className="h-4 w-4 text-red-400" />;
  if (level <= 60) return <BatteryMedium className="h-4 w-4 text-amber-500" />;
  return <BatteryFull className="h-4 w-4 text-emerald-500" />;
}

// Generate deterministic telemetry for a device
function generateDeviceTelemetry(deviceId: string, type: string) {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) hash = ((hash << 5) - hash) + deviceId.charCodeAt(i);
  
  const baseValues: Record<string, { base: number; variance: number; unit: string; label: string }> = {
    IAQ: { base: 420, variance: 80, unit: 'ppm', label: 'CO₂ Level' },
    Temperature: { base: 22, variance: 3, unit: '°C', label: 'Temperature' },
    Leakage: { base: 55, variance: 8, unit: 'PSI', label: 'Water Pressure' },
    Noise: { base: 45, variance: 15, unit: 'dB', label: 'Noise Level' },
    'Sound Level Sensor': { base: 45, variance: 15, unit: 'dB', label: 'Sound Level (Leq)' },
    Smoke: { base: 0.3, variance: 0.2, unit: 'μg/m³', label: 'Particle Density' },
    Fire: { base: 24, variance: 2, unit: '°C', label: 'Ambient Temp' },
  };
  
  const config = baseValues[type] || { base: 50, variance: 10, unit: '', label: 'Reading' };
  const points = [];
  for (let i = 0; i < 24; i++) {
    hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
    const noise = (hash % 1000) / 1000;
    points.push({
      time: `${String(i).padStart(2, '0')}:00`,
      value: +(config.base + (noise * config.variance * 2 - config.variance)).toFixed(1),
    });
  }
  return { points, ...config };
}

interface DeviceInspectorProps {
  device: Device;
  onClose: () => void;
  /** Real decoded sensor data from property telemetry API */
  liveSensorData?: Record<string, number> | null;
  /** When the live data was last received */
  liveDataTime?: string | null;
}

export function DeviceInspector({ device, onClose, liveSensorData, liveDataTime }: DeviceInspectorProps) {
  const meta = getDeviceMeta(device.type);
  const TypeIcon = meta.icon;
  const generatedTelemetry = useMemo(() => generateDeviceTelemetry(device.id, device.type), [device.id, device.type]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<string>('24h');

  // Use real live data if available, otherwise fall back to generated
  const hasLiveData = liveSensorData && Object.keys(liveSensorData).length > 0;
  
  const currentReading = useMemo(() => {
    if (hasLiveData && liveSensorData) {
      // Pick the most relevant metric based on device type
      const typeMetrics: Record<string, { keys: string[]; unit: string; label: string }> = {
        IAQ: { keys: ['co2', 'tvoc'], unit: 'ppm', label: 'CO₂ Level' },
        Temperature: { keys: ['temperature'], unit: '°C', label: 'Temperature' },
        Leakage: { keys: ['humidity', 'water_leak'], unit: '%', label: 'Humidity' },
        Noise: { keys: ['sound_level_leq', 'sound_level_lmax', 'sound_level_lmin'], unit: 'dB', label: 'Sound Level (Leq)' },
        'Sound Level Sensor': { keys: ['sound_level_leq', 'sound_level_lmax', 'sound_level_lmin'], unit: 'dB', label: 'Sound Level (Leq)' },
        Smoke: { keys: ['pm2_5', 'pm10'], unit: 'μg/m³', label: 'PM2.5' },
        Fire: { keys: ['temperature'], unit: '°C', label: 'Temperature' },
      };
      const config = typeMetrics[device.type] || { keys: Object.keys(liveSensorData).slice(0, 1), unit: '', label: 'Reading' };
      for (const key of config.keys) {
        if (liveSensorData[key] != null) {
          return { value: liveSensorData[key], unit: config.unit, label: config.label, isLive: true };
        }
      }
      // Fallback to first available metric
      const firstKey = Object.keys(liveSensorData)[0];
      if (firstKey) {
        return { value: liveSensorData[firstKey], unit: '', label: firstKey.replace(/_/g, ' '), isLive: true };
      }
    }
    return {
      value: generatedTelemetry.points[generatedTelemetry.points.length - 1].value,
      unit: generatedTelemetry.unit,
      label: generatedTelemetry.label,
      isLive: false,
    };
  }, [hasLiveData, liveSensorData, device.type, generatedTelemetry]);

  // ─── HISTORY VIEW ─────────────────────────────────────
  if (showHistory) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setShowHistory(false)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Device title */}
        <div className="flex items-center gap-3">
          <div className={clsx("p-2 rounded-xl", meta.bg, meta.color)}>
            <TypeIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{device.name}</h3>
            <p className="text-xs text-slate-400">{device.devEui ? `EUI: ${device.devEui}` : device.id}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1.5 bg-slate-100 rounded-lg p-1">
          {['24h', '7d', '30d'].map((p) => (
            <button key={p} onClick={() => setHistoryPeriod(p)}
              className={clsx(
                "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                historyPeriod === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}>
              {p === '24h' ? '24 Hours' : p === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>

        {/* Full history chart */}
        {device.devEui ? (
          <DeviceHistoryChart
            deviceId={device.id}
            deviceType={device.type}
            devEui={device.devEui}
            period={historyPeriod}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No history available</p>
            <p className="text-xs text-slate-400 mt-1">This device has no EUI — history requires real sensor uplinks.</p>
          </div>
        )}
      </div>
    );
  }

  // ─── DEFAULT DETAIL VIEW ─────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx("p-2.5 rounded-xl", meta.bg, meta.color)}>
            <TypeIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{device.name}</h3>
            <p className="text-xs text-slate-400 font-mono">{device.id}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <span className={clsx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
          device.status === 'online' ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
          device.status === 'warning' ? "bg-amber-50 text-amber-700 ring-amber-200" :
          "bg-red-50 text-red-700 ring-red-200"
        )}>
          {device.status === 'online' ? <Wifi className="h-3 w-3" /> : device.status === 'offline' ? <WifiOff className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {device.status === 'online' ? 'Online' : device.status === 'warning' ? 'Warning' : 'Offline'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{meta.label}</span>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Location</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{device.location}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <BatteryIcon level={device.battery} />
            <span className="text-xs font-medium text-slate-500">Battery</span>
          </div>
          <p className={clsx("text-sm font-semibold font-mono", device.battery <= 20 ? "text-red-600" : "text-slate-900")}>{device.battery}%</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="h-3 w-3 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Last Update</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{device.lastUpdate}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Cpu className="h-3 w-3 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Type</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{device.type}</p>
        </div>
      </div>

      {/* Current Reading */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{currentReading.label}</span>
          <span className={clsx('text-xs flex items-center gap-1', currentReading.isLive ? 'text-emerald-400' : 'text-slate-500')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', currentReading.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
            {currentReading.isLive ? 'Live' : 'Simulated'}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold font-mono">{typeof currentReading.value === 'number' ? currentReading.value.toFixed(1) : currentReading.value}</span>
          <span className="text-sm text-slate-400">{currentReading.unit}</span>
        </div>
        {liveDataTime && currentReading.isLive && (
          <p className="text-xs text-slate-500 mt-1">
            Last received: {new Date(liveDataTime).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Live Sensor Readings (all metrics) */}
      {hasLiveData && liveSensorData && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase mb-2">All Sensor Readings</p>
          <div className="space-y-1.5">
            {Object.entries(liveSensorData).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="text-sm font-semibold font-mono text-slate-900">
                  {typeof val === 'number' ? val.toFixed(1) : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telemetry Chart */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase mb-2">24h Telemetry — {currentReading.label}</p>
        <div className="h-28 w-full rounded-xl bg-slate-50 border border-slate-100 p-2">
          <MiniDeviceChart deviceId={device.id} deviceType={device.type} devEui={device.devEui} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button className="flex-1 text-sm font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          Configure
        </button>
        <button onClick={() => setShowHistory(true)}
          className="flex-1 text-sm font-medium py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          View History
        </button>
      </div>
    </div>
  );
}