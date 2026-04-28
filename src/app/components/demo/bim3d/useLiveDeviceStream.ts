import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Device } from '@/app/utils/api';
import { Alarm, MOCK_SENSORS, Sensor, Severity } from './mockData';

export type StreamMode = 'connecting' | 'live' | 'mock';

export interface LiveReading {
  sensorId: string;
  device: Device | null;
  metrics: Record<string, number>;
  primary: { label: string; value: number; unit: string; severity: Severity } | null;
  battery: number | null;
  signal: number | null;
  lastSeen: string | null;
  ageSec: number | null;
  online: boolean;
}

export interface DeviceCounts {
  total: number;
  online: number;
  offline: number;
  matched: number;
}

const POLL_MS = 10_000;
const OFFLINE_THRESHOLD_SEC = 5 * 60;

const THRESHOLDS: Record<Sensor['type'], { field: string; warn: number; crit: number; unit: string; label: string }> = {
  'HY108-1': { field: 'sound_level_leq', warn: 70, crit: 85, unit: 'dB', label: 'LAeq' },
  'LD-5R':   { field: 'pm2_5',           warn: 35, crit: 75, unit: 'µg/m³', label: 'PM2.5' },
  'IAQ':     { field: 'co2',             warn: 800, crit: 1000, unit: 'ppm', label: 'CO₂' },
  'Temp':    { field: 'temperature',     warn: 26, crit: 28, unit: '°C', label: 'Temp' },
  'CCTV':    { field: 'pir',             warn: 0.5, crit: 1, unit: '', label: 'Motion' },
  'Lift':    { field: 'pir',             warn: 0.5, crit: 1, unit: '', label: 'Status' },
};

function severityFromValue(type: Sensor['type'], value: number): Severity {
  const t = THRESHOLDS[type];
  if (!t) return 'normal';
  if (value >= t.crit) return 'critical';
  if (value >= t.warn) return 'warning';
  return 'normal';
}

function matchDevice(sensor: Sensor, devices: Device[]): Device | null {
  const hint = sensor.deviceId?.toLowerCase();
  if (hint) {
    const exact = devices.find(d =>
      d.id?.toLowerCase() === hint ||
      d.name?.toLowerCase() === hint ||
      d.serialNumber?.toLowerCase() === hint ||
      d.devEui?.toLowerCase() === hint
    );
    if (exact) return exact;
    const fuzzy = devices.find(d =>
      d.name?.toLowerCase().includes(hint) ||
      d.serialNumber?.toLowerCase().includes(hint)
    );
    if (fuzzy) return fuzzy;
  }
  // Type-based fallback (e.g. any "HY108" device → first HY108-1 sensor)
  const typeKey = sensor.type.toLowerCase().replace(/[-\s]/g, '');
  return devices.find(d => {
    const blob = `${d.type ?? ''} ${d.name ?? ''} ${d.model ?? ''}`.toLowerCase().replace(/[-\s]/g, '');
    return blob.includes(typeKey);
  }) ?? null;
}

function readingFromDevice(sensor: Sensor, device: Device | null, now: number): LiveReading {
  const metrics = (device?.decoded ?? {}) as Record<string, number>;
  const lastSeen = device?.lastSeen ?? device?.lastUpdate ?? device?.decodedAt ?? null;
  const ageSec = lastSeen ? Math.max(0, Math.round((now - new Date(lastSeen).getTime()) / 1000)) : null;
  const online = ageSec !== null && ageSec < OFFLINE_THRESHOLD_SEC && (device?.status ?? 'online') !== 'offline';

  const t = THRESHOLDS[sensor.type];
  let primary: LiveReading['primary'] = null;
  if (t && metrics[t.field] != null && Number.isFinite(metrics[t.field])) {
    const value = Number(metrics[t.field]);
    primary = { label: t.label, value, unit: t.unit, severity: severityFromValue(sensor.type, value) };
  }

  return {
    sensorId: sensor.id,
    device,
    metrics,
    primary,
    battery: typeof device?.battery === 'number' ? device.battery : null,
    signal: typeof device?.signal === 'number' ? device.signal : null,
    lastSeen,
    ageSec,
    online: !!device && online,
  };
}

let alarmCounter = 0;

/**
 * Build a stable alarm id for a (sensor, condition) pair. The dedupe relies
 * on this id remaining identical while the same alarm condition holds, so
 * downstream `resolvedRef` membership and `seenIds` filtering work. Adding
 * a counter or millisecond timestamp here breaks dedupe and turns one
 * sustained alarm into a poll-rate flood.
 */
function liveAlarmId(sensor: Sensor, kind: 'offline' | string, severity?: Severity): string {
  if (kind === 'offline') return `live_off_${sensor.id}`;
  return `live_${sensor.id}_${kind}_${severity ?? 'warning'}`;
}

function deriveAlarm(sensor: Sensor, reading: LiveReading): Alarm | null {
  if (!reading.device) return null;

  if (!reading.online) {
    return {
      id: liveAlarmId(sensor, 'offline'),
      sensorId: sensor.id,
      severity: 'warning',
      subsystem: sensor.subsystem,
      title: sensor.name,
      message: `Device offline (no uplink for ${reading.ageSec ? Math.round(reading.ageSec / 60) : '?'} min)`,
      occurredAt: reading.lastSeen ?? new Date().toISOString(),
      resolved: false,
    };
  }

  const t = THRESHOLDS[sensor.type];
  if (!t || !reading.primary) return null;
  if (reading.primary.severity === 'normal') return null;

  return {
    id: liveAlarmId(sensor, t.field, reading.primary.severity),
    sensorId: sensor.id,
    severity: reading.primary.severity,
    subsystem: sensor.subsystem,
    title: sensor.name,
    message: `${t.label} ${reading.primary.value.toFixed(1)}${t.unit} exceeds ${reading.primary.severity === 'critical' ? 'critical' : 'warning'} threshold (${reading.primary.severity === 'critical' ? t.crit : t.warn}${t.unit})`,
    occurredAt: reading.lastSeen ?? new Date().toISOString(),
    resolved: false,
  };
}

// Mock fallback so the demo always runs
function genMockAlarm(sensorId?: string, sev?: Severity): Alarm {
  const sensor = sensorId
    ? MOCK_SENSORS.find(s => s.id === sensorId)!
    : MOCK_SENSORS[Math.floor(Math.random() * MOCK_SENSORS.length)];
  const severities: Severity[] = ['critical', 'warning', 'warning', 'info', 'info'];
  const severity = sev ?? severities[Math.floor(Math.random() * severities.length)];
  const messages: Record<string, string[]> = {
    'HY108-1': ['LAeq spike (>85 dB)', 'Sustained noise above limit'],
    'LD-5R':   ['PM2.5 anomaly (>75 µg/m³)', 'Filter maintenance due'],
    'IAQ':     ['CO₂ above 1000 ppm', 'Humidity out of range'],
    'Temp':    ['Server room >28°C — cooling alert'],
    'CCTV':    ['Motion detected (after-hours)', 'Video loss'],
    'Lift':    ['Lift overload', 'Door obstruction'],
  };
  const pool = messages[sensor.type] ?? ['Unknown event'];
  return {
    id: `mock_${Date.now()}_${alarmCounter++}`,
    sensorId: sensor.id,
    severity,
    subsystem: sensor.subsystem,
    title: sensor.name,
    message: pool[Math.floor(Math.random() * pool.length)],
    occurredAt: new Date().toISOString(),
    resolved: false,
  };
}

// Generate plausible live readings even in mock mode, so pins always show values
const MOCK_BASELINES: Record<Sensor['type'], { base: number; jitter: number }> = {
  'HY108-1': { base: 58, jitter: 12 },   // dB
  'LD-5R':   { base: 22, jitter: 18 },   // µg/m³
  'IAQ':     { base: 620, jitter: 250 }, // ppm CO₂
  'Temp':    { base: 23, jitter: 4 },    // °C
  'CCTV':    { base: 0, jitter: 1 },
  'Lift':    { base: 0, jitter: 1 },
};

function genMockReadings(now: number): Map<string, LiveReading> {
  const map = new Map<string, LiveReading>();
  for (const sensor of MOCK_SENSORS) {
    const t = THRESHOLDS[sensor.type];
    const baseline = MOCK_BASELINES[sensor.type] ?? { base: 0, jitter: 1 };
    const value = Math.max(0, baseline.base + (Math.random() - 0.5) * 2 * baseline.jitter);
    const metrics: Record<string, number> = t ? { [t.field]: value } : {};
    // Add a few related metrics for richer detail card
    if (sensor.type === 'HY108-1') {
      metrics.sound_level_lmax = value + Math.random() * 8;
      metrics.sound_level_lmin = Math.max(30, value - Math.random() * 10);
      metrics.sound_level_inst = value + (Math.random() - 0.5) * 4;
      metrics.sound_level_lcpeak = value + Math.random() * 15;
    } else if (sensor.type === 'LD-5R') {
      metrics.pm10 = value * 1.4 + Math.random() * 5;
    } else if (sensor.type === 'IAQ') {
      metrics.humidity = 45 + Math.random() * 15;
      metrics.tvoc = 120 + Math.random() * 80;
    } else if (sensor.type === 'Temp') {
      metrics.humidity = 38 + Math.random() * 8;
    }

    map.set(sensor.id, {
      sensorId: sensor.id,
      device: null,
      metrics,
      primary: t ? { label: t.label, value, unit: t.unit, severity: severityFromValue(sensor.type, value) } : null,
      battery: 80 + Math.floor(Math.random() * 20),
      signal: -65 - Math.floor(Math.random() * 25),
      lastSeen: new Date(now - Math.random() * 30_000).toISOString(),
      ageSec: Math.floor(Math.random() * 30),
      online: true,
    });
  }
  return map;
}

interface Options {
  /** Force mock mode (e.g. for offline screenshots). Default false. */
  forceMock?: boolean;
  /** Poll interval in ms. */
  pollMs?: number;
  /**
   * Allow mock-data fallback when live API is unavailable. Default true.
   * Sensor readings and "current state" still flow when this is on.
   */
  enableMock?: boolean;
  /**
   * Whether the mock loop randomly fabricates new alarms over time.
   * Independent from readings — when false, readings keep updating but
   * no new synthetic alarms spawn. Default true.
   */
  enableAlarmSpawn?: boolean;
}

export function useLiveDeviceStream(options: Options = {}) {
  const { forceMock = false, pollMs = POLL_MS, enableMock = true, enableAlarmSpawn = true } = options;

  const [mode, setMode] = useState<StreamMode>(forceMock ? 'mock' : 'connecting');
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [readings, setReadings] = useState<Map<string, LiveReading>>(() => new Map());
  const [counts, setCounts] = useState<DeviceCounts>({ total: 0, online: 0, offline: 0, matched: 0 });
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const resolvedRef = useRef<Set<string>>(new Set());
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enableAlarmSpawnRef = useRef(enableAlarmSpawn);
  useEffect(() => { enableAlarmSpawnRef.current = enableAlarmSpawn; }, [enableAlarmSpawn]);

  const startMock = useCallback(() => {
    if (!enableMock) return;
    setMode('mock');
    setReadings(genMockReadings(Date.now()));
    setCounts({ total: MOCK_SENSORS.length, matched: MOCK_SENSORS.length, online: MOCK_SENSORS.length, offline: 0 });
    setLastFetch(new Date());
    setAlarms(prev => prev.length > 0 ? prev : (enableAlarmSpawnRef.current ? Array.from({ length: 3 }, () => genMockAlarm()) : []));
    if (mockTimerRef.current) return;
    mockTimerRef.current = setInterval(() => {
      const now = Date.now();
      setReadings(genMockReadings(now));
      setLastFetch(new Date(now));
      // Only fabricate new alarms when alarm-spawn is enabled
      if (enableAlarmSpawnRef.current && Math.random() < 0.4) {
        setAlarms(prev => [genMockAlarm(), ...prev].slice(0, 50));
      }
    }, 4_000);
  }, [enableMock]);

  const stopMock = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  }, []);

  // When mock fallback is fully disabled, stop spawner and clear synthetic state
  useEffect(() => {
    if (enableMock) return;
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    if (mode === 'mock') {
      setMode(forceMock ? 'mock' : 'connecting');
      setReadings(new Map());
      setAlarms([]);
      setCounts({ total: 0, online: 0, offline: 0, matched: 0 });
    }
  }, [enableMock, forceMock, mode]);

  // Polling loop for live devices
  useEffect(() => {
    console.info('[FioTec/LiveStream] hook mounted, forceMock=', forceMock);
    if (forceMock) {
      startMock();
      return () => stopMock();
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const devices = await api.getDevices();
        if (cancelled) return;

        stopMock();
        const now = Date.now();
        const newReadings = new Map<string, LiveReading>();
        const derived: Alarm[] = [];
        const liveIdsThisTick = new Set<string>();
        let matched = 0;
        let online = 0;

        for (const sensor of MOCK_SENSORS) {
          const device = matchDevice(sensor, devices);
          if (device) matched++;
          const reading = readingFromDevice(sensor, device, now);
          if (reading.online) online++;
          newReadings.set(sensor.id, reading);
          // Also publish under the real device id so consumers driven by
          // real propertyDevices (zone clusters, picker overlay) can find
          // the reading. The mock-keyed entry stays for legacy consumers.
          if (device?.id && device.id !== sensor.id) {
            newReadings.set(device.id, reading);
          }
          const alarm = deriveAlarm(sensor, reading);
          if (alarm) {
            liveIdsThisTick.add(alarm.id);
            if (!resolvedRef.current.has(alarm.id)) derived.push(alarm);
          }
        }

        // Cover real devices that aren't in the MOCK_SENSORS list (e.g. the
        // newly added HY108-1 unit). Synthesize a minimal reading from the
        // device's own currentReading so zone cards still show a value.
        for (const device of devices) {
          if (newReadings.has(device.id)) continue;
          const reading = readingFromDevice(
            { id: device.id, name: device.name, type: 'Temp', subsystem: 'Environment', x: 0, y: 0, z: 0 } as any,
            device,
            now,
          );
          if (reading.online) online++;
          matched++;
          newReadings.set(device.id, reading);
        }

        // GC resolvedRef: once a `live_*` condition clears, free its entry so
        // a recurrence later fires normally and resolvedRef stays bounded.
        for (const id of Array.from(resolvedRef.current)) {
          if (id.startsWith('live_') && !liveIdsThisTick.has(id)) {
            resolvedRef.current.delete(id);
          }
        }

        setMode('live');
        setReadings(newReadings);
        setCounts({ total: devices.length, matched, online, offline: devices.length - online });
        setLastFetch(new Date());
        console.info(`[FioTec/LiveStream] live · ${matched}/${devices.length} matched · ${online} online`);

        // Merge derived alarms with existing (preserve user-injected mocks + resolution state)
        setAlarms(prev => {
          const seenIds = new Set(prev.map(a => a.id));
          const fresh = derived.filter(a => !seenIds.has(a.id));
          const merged = [...fresh, ...prev].slice(0, 50);
          return merged.map(a => resolvedRef.current.has(a.id) ? { ...a, resolved: true } : a);
        });
      } catch (err) {
        if (cancelled) return;
        console.warn('[useLiveDeviceStream] live fetch failed:', err);
        if (enableMock) {
          startMock();
        } else {
          setMode('connecting');
        }
      } finally {
        if (!cancelled) timer = setTimeout(tick, pollMs);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopMock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceMock, pollMs]);

  const triggerAlarm = useCallback((sensorId?: string, sev?: Severity) => {
    setAlarms(prev => [genMockAlarm(sensorId, sev), ...prev].slice(0, 50));
  }, []);

  const resolveAlarm = useCallback((id: string) => {
    resolvedRef.current.add(id);
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  }, []);

  const clearAll = useCallback(() => {
    setAlarms(prev => {
      prev.forEach(a => resolvedRef.current.add(a.id));
      return prev.map(a => ({ ...a, resolved: true }));
    });
  }, []);

  return { alarms, readings, mode, counts, lastFetch, triggerAlarm, resolveAlarm, clearAll };
}
