import { useEffect, useState, useCallback } from 'react';
import { Alarm, Severity, MOCK_SENSORS } from './mockData';

let counter = 0;
const genAlarm = (sensorId?: string, sev?: Severity): Alarm => {
  const sensor = sensorId
    ? MOCK_SENSORS.find(s => s.id === sensorId)!
    : MOCK_SENSORS[Math.floor(Math.random() * MOCK_SENSORS.length)];
  const severities: Severity[] = ['critical', 'warning', 'warning', 'info', 'info'];
  const severity = sev ?? severities[Math.floor(Math.random() * severities.length)];
  const templates: Record<string, string[]> = {
    'HY108-1': ['Noise level exceeded threshold (>85 dB)', 'LAF spike detected', 'Sensor offline 30s'],
    'LD-5R': ['PM2.5 > 75 µg/m³', 'Dust concentration anomaly', 'Filter maintenance due'],
    'IAQ': ['CO2 > 1000 ppm', 'Humidity out of range'],
    'Temp': ['Server room temp > 28°C — cooling alert', 'Temp anomaly detected'],
    'CCTV': ['Motion detected (after-hours)', 'Video loss', 'Camera tampering'],
    'Lift': ['Lift overload', 'Door obstruction'],
  };
  const pool = templates[sensor.type] ?? ['Unknown event'];
  const msg = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: `alarm_${Date.now()}_${counter++}`,
    sensorId: sensor.id,
    severity,
    subsystem: sensor.subsystem,
    title: sensor.name,
    message: msg,
    occurredAt: new Date().toISOString(),
    resolved: false,
  };
};

export function useMockAlarmStream(initialCount = 4, intervalMs = 12000) {
  const [alarms, setAlarms] = useState<Alarm[]>(() =>
    Array.from({ length: initialCount }, () => genAlarm())
  );

  useEffect(() => {
    const t = setInterval(() => {
      setAlarms(prev => [genAlarm(), ...prev].slice(0, 50));
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  const triggerAlarm = useCallback((sensorId?: string, sev?: Severity) => {
    setAlarms(prev => [genAlarm(sensorId, sev), ...prev].slice(0, 50));
  }, []);

  const resolveAlarm = useCallback((id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  }, []);

  const clearAll = useCallback(() => {
    setAlarms(prev => prev.map(a => ({ ...a, resolved: true })));
  }, []);

  return { alarms, triggerAlarm, resolveAlarm, clearAll };
}
