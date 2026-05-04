import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Wifi, WifiOff, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryWarning,
  Droplets, Wind, Thermometer, Flame, Volume2, Cpu, AlertTriangle, CheckCircle2, Clock, MapPin,
  ArrowLeft, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import type { Device } from '@/app/utils/api';
import { MiniDeviceChart, DeviceHistoryChart } from '@/app/components/DeviceHistoryChart';
import { normalizeMetrics, METRIC_LABEL, buildMetricSlides } from '@/app/components/demo/bim3d/metricUtils';

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
  AS400: { icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Vibration Sensor' },
  Vibration: { icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Vibration Sensor' },
  'Vibration Sensor': { icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Vibration Sensor' },
  Accelerometer: { icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Vibration Sensor' },
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
    Noise: { base: 45, variance: 15, unit: 'dB(A)', label: 'LAF' },
    'Sound Level Sensor': { base: 45, variance: 15, unit: 'dB(A)', label: 'LAF' },
    AS400: { base: 65, variance: 35, unit: 'μm/s', label: 'PPV Max' },
    Vibration: { base: 65, variance: 35, unit: 'μm/s', label: 'PPV Max' },
    'Vibration Sensor': { base: 65, variance: 35, unit: 'μm/s', label: 'PPV Max' },
    Accelerometer: { base: 65, variance: 35, unit: 'μm/s', label: 'PPV Max' },
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
  const [historyPeriod, setHistoryPeriod] = useState<string>('3d');
  const PERIOD_OPTIONS = [
    { value: '12h', label: '12 H' },
    { value: '24h', label: '24 H' },
    { value: '48h', label: '48 H' },
    { value: '3d',  label: '3 Day' },
  ] as const;

  // Use real live data if available, otherwise fall back to generated.
  // Normalize so Cayenne LPP suffixes (temperature_3, co2_7, pm2_5_11, ...) become
  // canonical keys before any UI consumer touches them.
  const normalizedLive = useMemo(
    () => normalizeMetrics(liveSensorData ?? null),
    [liveSensorData],
  );
  const hasLiveData = Object.keys(normalizedLive).length > 0;

  // Pick the primary metric key per device type so the prominent block opens
  // on the most relevant reading.
  const primaryKey = useMemo<string | null>(() => {
    const order: Record<string, string[]> = {
      IAQ: ['co2', 'tvoc', 'pm2_5', 'temperature'],
      Temperature: ['temperature'],
      Leakage: ['humidity'],
      Noise: ['sound_level_leq', 'sound_level_inst'],
      'Sound Level Sensor': ['sound_level_leq', 'sound_level_inst'],
      AS400: ['ppv_max_mm_s', 'ppv_resultant_mm_s'],
      Vibration: ['ppv_max_mm_s', 'ppv_resultant_mm_s'],
      'Vibration Sensor': ['ppv_max_mm_s', 'ppv_resultant_mm_s'],
      Accelerometer: ['ppv_max_mm_s', 'ppv_resultant_mm_s'],
      Smoke: ['pm2_5', 'pm10'],
      Fire: ['temperature'],
    };
    const candidates = order[device.type] ?? Object.keys(normalizedLive);
    return candidates.find(k => normalizedLive[k] != null) ?? null;
  }, [device.type, normalizedLive]);

  // Build slideshow of all live metrics, ordered with primaryKey first.
  const slides = useMemo(
    () => buildMetricSlides(normalizedLive, primaryKey),
    [normalizedLive, primaryKey],
  );

  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setSlideIdx(0); }, [device.id]);
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const currentReading = useMemo(() => {
    if (slides.length > 0) {
      const slide = slides[slideIdx % slides.length];
      return { value: slide.value, unit: slide.unit, label: slide.label, isLive: true };
    }
    return {
      value: generatedTelemetry.points[generatedTelemetry.points.length - 1].value,
      unit: generatedTelemetry.unit,
      label: generatedTelemetry.label,
      isLive: false,
    };
  }, [slides, slideIdx, generatedTelemetry]);

  // ─── HISTORY VIEW ─────────────────────────────────────
  if (showHistory) {
    return (
      <div className="flex flex-col min-w-0 overflow-hidden gap-3">
        {/* Header bar */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowHistory(false)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors rounded-lg px-2 py-1.5 hover:bg-slate-100">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Device identity card */}
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-2.5 shrink-0">
          <div className={clsx("p-2 rounded-lg", meta.bg, meta.color)}>
            <TypeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 truncate">{device.name}</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate">{device.devEui ? `EUI: ${device.devEui}` : device.id}</p>
          </div>
          <History className="h-4 w-4 text-slate-300 shrink-0" />
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mr-1">Period</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setHistoryPeriod(opt.value)}
              className={clsx(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                historyPeriod === opt.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Full history chart — constrained to panel width */}
        <div className="min-w-0 overflow-hidden flex-1">
          {device.devEui ? (
            <DeviceHistoryChart
              deviceId={device.id}
              deviceType={device.type}
              devEui={device.devEui}
              period={historyPeriod}
              compact
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">No history available</p>
              <p className="text-xs text-slate-400 mt-1">This device has no EUI — history requires real sensor uplinks.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── DEFAULT DETAIL VIEW ─────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className={clsx("p-2 rounded-xl", meta.bg, meta.color)}>
            <TypeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 truncate">{device.name}</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate">{device.id}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          device.status === 'online' ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
          device.status === 'warning' ? "bg-amber-50 text-amber-700 ring-amber-200" :
          "bg-red-50 text-red-700 ring-red-200"
        )}>
          {device.status === 'online' ? <Wifi className="h-2.5 w-2.5" /> : device.status === 'offline' ? <WifiOff className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
          {device.status === 'online' ? 'Online' : device.status === 'warning' ? 'Warning' : 'Offline'}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium truncate">{meta.label}</span>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <MapPin className="h-2.5 w-2.5 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-500">Location</span>
          </div>
          <p className="text-xs font-semibold text-slate-900 truncate">{device.location}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <BatteryIcon level={device.battery} />
            <span className="text-[10px] font-medium text-slate-500">Battery</span>
          </div>
          <p className={clsx("text-xs font-semibold font-mono", device.battery <= 20 ? "text-red-600" : "text-slate-900")}>{device.battery}%</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock className="h-2.5 w-2.5 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-500">Last Update</span>
          </div>
          <p className="text-xs font-semibold text-slate-900 truncate">{device.lastUpdate}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Cpu className="h-2.5 w-2.5 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-500">Type</span>
          </div>
          <p className="text-xs font-semibold text-slate-900">{device.type}</p>
        </div>
      </div>

      {/* Current Reading — auto-rotates every 5s when there are multiple metrics */}
      <div
        className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-3 text-white"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex items-center justify-between mb-0.5">
          <AnimatePresence mode="wait">
            <motion.span
              key={currentReading.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[10px] font-semibold text-slate-200 uppercase tracking-wider"
            >
              {currentReading.label}
            </motion.span>
          </AnimatePresence>
          <span className={clsx('text-[10px] flex items-center gap-1 font-semibold', currentReading.isLive ? 'text-emerald-400' : 'text-slate-400')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', currentReading.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
            {currentReading.isLive ? 'Live' : 'Simulated'}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentReading.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex items-baseline gap-1"
          >
            <span className="text-2xl font-bold font-mono text-white">
              {typeof currentReading.value === 'number' ? currentReading.value.toFixed(1) : currentReading.value}
            </span>
            <span className="text-xs text-slate-300 font-semibold">{currentReading.unit}</span>
          </motion.div>
        </AnimatePresence>
        {slides.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => { setSlideIdx(i); setPaused(true); }}
                  title={s.label}
                  className={clsx(
                    'h-1.5 rounded-full transition-all',
                    i === slideIdx ? 'w-4 bg-cyan-400' : 'w-1.5 bg-slate-600 hover:bg-slate-400'
                  )}
                />
              ))}
            </div>
            <span className="ml-auto text-[9px] text-slate-300 font-mono font-semibold">
              {paused ? 'paused' : `${slideIdx + 1}/${slides.length} · 5s`}
            </span>
          </div>
        )}
        {liveDataTime && currentReading.isLive && (
          <p className="text-[10px] text-slate-300 mt-1 font-medium">
            Last received: {new Date(liveDataTime).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong' })}
          </p>
        )}
      </div>

      {/* Live Sensor Readings (all metrics) */}
      {hasLiveData && (
        <div>
          <p className="text-[10px] font-medium text-slate-500 uppercase mb-1.5">All Sensor Readings</p>
          <div className="space-y-1">
            {Object.entries(normalizedLive)
              .filter(([key]) => !['battery', 'pir', 'digital_input', 'water_leak'].includes(key))
              .map(([key, val]) => {
              const meta = METRIC_LABEL[key];
              if (!meta) return null;
              const label = meta.label;
              const unit = meta.unit;
              return (
                <div key={key} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[11px] text-slate-600 font-medium">{label}</span>
                  <span className="text-xs font-semibold font-mono text-slate-900">
                    {val.toFixed(1)}{unit && <span className="text-slate-500 ml-0.5">{unit}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Telemetry Chart */}
      <div>
        <p className="text-[10px] font-medium text-slate-500 uppercase mb-1.5">
          {device.type.toLowerCase().includes('vibration') || device.type.toLowerCase().includes('as400')
            ? '3-Day Demo History'
            : '24h Telemetry'} — {currentReading.label}
        </p>
        <div className="h-24 w-full rounded-lg bg-slate-50 border border-slate-100 p-1.5">
          <MiniDeviceChart deviceId={device.id} deviceType={device.type} devEui={device.devEui} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        <button className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          Configure
        </button>
        <button onClick={() => setShowHistory(true)}
          className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1">
          <History className="h-3 w-3" />
          View History
        </button>
      </div>
    </div>
  );
}
