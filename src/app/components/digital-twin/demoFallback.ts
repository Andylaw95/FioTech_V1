import type { Property, PropertyDetails, Device, PropertyTelemetry } from '@/app/utils/api';

/**
 * Demo-mode fallback data used when the live backend is unreachable
 * (offline, not signed-in, or API error). The shapes match the live
 * API exactly so the existing Overview / BMS UI renders identically.
 */

export const DEMO_PROPERTY: Property = {
  id: 'demo-fse-cck',
  name: '其士商業中心 (Demo)',
  location: '宏開道8號',
  type: 'Commercial',
  waterSensors: '5',
  status: 'normal',
  image: '',
  deviceCount: 5,
  onlineDevices: 4,
  offlineDevices: 1,
  warningDevices: 0,
};

const DEMO_DEVICES: Device[] = [
  {
    id: 'demo-hy108-andy',
    name: 'Sound Level (HY108-1)',
    type: 'Noise',
    building: '其士商業中心',
    location: "Andy's Table",
    lastUpdate: new Date().toISOString(),
    battery: 92,
    status: 'online',
    gateway: 'LD1-001',
    devEui: 'demo-hy108-andy',
    serialNumber: 'HY108-DEMO-A',
    manufacturer: 'Hwa Yao',
    model: 'HY108-1',
    capabilities: ['sound_level_leq', 'sound_level_lmax', 'sound_level_lmin'],
    signal: -78,
    decoded: { sound_level_leq: 47.1, sound_level_lmax: 62.4, sound_level_lmin: 38.2 },
    decodedAt: new Date().toISOString(),
  },
  {
    id: 'demo-am308-andy',
    name: 'AM308L Ambience',
    type: 'IAQ',
    building: '其士商業中心',
    location: "Andy's Table",
    lastUpdate: new Date().toISOString(),
    battery: 85,
    status: 'online',
    gateway: 'LD1-001',
    devEui: 'demo-am308-andy',
    serialNumber: 'AM308L-DEMO',
    manufacturer: 'Milesight',
    model: 'AM308L',
    capabilities: ['temperature', 'humidity', 'co2', 'pm2_5'],
    signal: -72,
    decoded: { temperature: 22.9, humidity: 55.0, co2: 1564, pm2_5: 12.0 },
    decodedAt: new Date().toISOString(),
  },
  {
    id: 'demo-env-charles',
    name: 'Environment (LD-5R)',
    type: 'Dust',
    building: '其士商業中心',
    location: "Charles's Table",
    lastUpdate: new Date().toISOString(),
    battery: 78,
    status: 'online',
    gateway: 'LD1-001',
    devEui: 'demo-env-charles',
    serialNumber: 'LD5R-DEMO',
    manufacturer: 'Sibata',
    model: 'LD-5R',
    capabilities: ['pm2_5', 'pm10', 'tsp'],
    signal: -75,
    decoded: { pm2_5: 12.0, pm10: 18.5, tsp: 57.0 },
    decodedAt: new Date().toISOString(),
  },
  {
    id: 'demo-iaq-david',
    name: 'IAQ Probe',
    type: 'IAQ',
    building: '其士商業中心',
    location: "David's Table",
    lastUpdate: new Date().toISOString(),
    battery: 64,
    status: 'online',
    gateway: 'LD1-001',
    devEui: 'demo-iaq-david',
    serialNumber: 'AM319-DEMO',
    manufacturer: 'Milesight',
    model: 'AM319',
    capabilities: ['temperature', 'humidity', 'co2'],
    signal: -80,
    decoded: { temperature: 23.4, humidity: 53.1, co2: 1208 },
    decodedAt: new Date().toISOString(),
  },
  {
    id: 'demo-pir-andy',
    name: 'PIR Occupancy',
    type: 'PIR',
    building: '其士商業中心',
    location: "Andy's Table",
    lastUpdate: new Date(Date.now() - 7 * 60_000).toISOString(),
    battery: 12,
    status: 'offline',
    gateway: 'LD1-001',
    devEui: 'demo-pir-andy',
    serialNumber: 'WS101-DEMO',
    manufacturer: 'Milesight',
    model: 'WS101',
    capabilities: ['pir'],
    signal: -95,
    decoded: { pir: 0 },
    decodedAt: new Date(Date.now() - 7 * 60_000).toISOString(),
  },
];

export function buildDemoPropertyDetails(): PropertyDetails {
  const onlineCount = DEMO_DEVICES.filter(d => d.status === 'online').length;
  const warnCount = DEMO_DEVICES.filter(d => d.status === 'warning').length;
  return {
    ...DEMO_PROPERTY,
    devices: DEMO_DEVICES,
    deviceCount: DEMO_DEVICES.length,
    onlineDevices: onlineCount,
    offlineDevices: DEMO_DEVICES.length - onlineCount - warnCount,
    warningDevices: warnCount,
  };
}

/**
 * Generate live-shaped mock telemetry. Adds gentle sinusoidal jitter so the
 * Overview panel and Live Telemetry feed look "alive" in demo mode.
 */
export function buildDemoPropertyTelemetry(now = Date.now()): PropertyTelemetry {
  const t = now / 1000;
  const jitter = (base: number, amp: number, phase = 0) =>
    base + Math.sin(t / 12 + phase) * amp;

  const tempVal = jitter(22.9, 0.4);
  const humVal = jitter(55.0, 1.2, 1.1);
  const co2Val = Math.round(jitter(1564, 35, 0.4));
  const pm25Val = jitter(12.0, 0.6, 2.0);
  const pm10Val = jitter(18.5, 0.8, 2.5);
  const soundLeq = jitter(47.1, 1.4, 0.7);

  const deviceReadings: PropertyTelemetry['deviceReadings'] = {};
  DEMO_DEVICES.forEach((d, idx) => {
    if (d.status !== 'online') return;
    const decoded: Record<string, number> = {};
    if (d.id === 'demo-hy108-andy') {
      decoded.sound_level_leq = soundLeq;
      decoded.sound_level_lmax = soundLeq + 14.5;
      decoded.sound_level_lmin = soundLeq - 9.2;
    } else if (d.id === 'demo-am308-andy') {
      decoded.temperature = tempVal;
      decoded.humidity = humVal;
      decoded.co2 = co2Val;
      decoded.pm2_5 = pm25Val;
    } else if (d.id === 'demo-env-charles') {
      decoded.pm2_5 = pm25Val;
      decoded.pm10 = pm10Val;
      decoded.tsp = jitter(57.0, 1.5, 1.5);
    } else if (d.id === 'demo-iaq-david') {
      decoded.temperature = jitter(23.4, 0.3, 1.8);
      decoded.humidity = jitter(53.1, 1.0, 0.9);
      decoded.co2 = Math.round(jitter(1208, 30, 1.3));
    }
    deviceReadings[d.devEui ?? d.id] = {
      devEUI: d.devEui ?? d.id,
      deviceName: d.name,
      receivedAt: new Date(now - idx * 1000).toISOString(),
      fCnt: 1000 + idx,
      rssi: d.signal ?? -80,
      decoded,
    };
  });

  return {
    source: 'live',
    sensorCount: DEMO_DEVICES.filter(d => d.status === 'online').length,
    environment: {
      temperature: tempVal,
      humidity: humVal,
      co2: co2Val,
      tvoc: 320,
      pm2_5: pm25Val,
      pm10: pm10Val,
      barometric_pressure: 1013,
      illuminance: 350,
      pir: 0,
      sound_level_leq: soundLeq,
      sound_level_lmin: soundLeq - 9.2,
      sound_level_lmax: soundLeq + 14.5,
      sound_level_inst: soundLeq + 0.6,
      sound_level_lcpeak: soundLeq + 26,
      water_leak: 0,
    },
    zones: [
      { id: 'andy', name: "Andy's Table", status: 'normal', sensors: 3, alerts: 0, devices: ['demo-hy108-andy', 'demo-am308-andy', 'demo-pir-andy'] },
      { id: 'charles', name: "Charles's Table", status: 'normal', sensors: 1, alerts: 0, devices: ['demo-env-charles'] },
      { id: 'david', name: "David's Table", status: 'normal', sensors: 1, alerts: 0, devices: ['demo-iaq-david'] },
    ],
    sensorList: DEMO_DEVICES.map(d => ({ devEUI: d.devEui ?? d.id, deviceName: d.name })),
    deviceReadings,
    history: [],
  };
}

/** Map device id → primary numeric reading for the Live Telemetry feed. */
export function buildDemoTelemetryMap(now = Date.now()): Record<string, number> {
  const tel = buildDemoPropertyTelemetry(now);
  const map: Record<string, number> = {};
  for (const d of DEMO_DEVICES) {
    if (d.status !== 'online') continue;
    const decoded = tel.deviceReadings[d.devEui ?? d.id]?.decoded ?? {};
    const val = decoded.sound_level_leq ?? decoded.temperature ?? decoded.co2 ?? decoded.pm2_5 ?? decoded.tsp;
    if (typeof val === 'number') map[d.id] = val;
  }
  return map;
}
