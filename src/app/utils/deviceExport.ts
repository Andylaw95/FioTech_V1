/**
 * Generic Device Excel Export
 * Generates per-device or bulk reports for any sensor type.
 */
import * as XLSX from 'xlsx';
import { api } from './api';

export type DeviceExportPeriod = '24h' | '7d' | '30d';

interface ExportableDevice {
  id: string;
  name: string;
  type: string;
  building: string;
  location: string;
  status: string;
  battery: number | null;
  devEui?: string;
  decoded?: Record<string, number>;
}

const PERIOD_LABELS: Record<DeviceExportPeriod, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
};

// ── Metric definitions per device type ──
interface MetricInfo { key: string; label: string; unit: string }

const TYPE_METRICS: Record<string, MetricInfo[]> = {
  Noise: [
    { key: 'sound_level_leq', label: 'LAeq', unit: 'dB(A)' },
    { key: 'sound_level_lmax', label: 'LAFmax', unit: 'dB(A)' },
    { key: 'sound_level_lmin', label: 'LAFmin', unit: 'dB(A)' },
    { key: 'sound_level_inst', label: 'LAF', unit: 'dB(A)' },
    { key: 'sound_level_lcpeak', label: 'LCPeak', unit: 'dB(C)' },
  ],
  'Sound Level Sensor': [
    { key: 'sound_level_leq', label: 'LAeq', unit: 'dB(A)' },
    { key: 'sound_level_lmax', label: 'LAFmax', unit: 'dB(A)' },
    { key: 'sound_level_lmin', label: 'LAFmin', unit: 'dB(A)' },
    { key: 'sound_level_inst', label: 'LAF', unit: 'dB(A)' },
    { key: 'sound_level_lcpeak', label: 'LCPeak', unit: 'dB(C)' },
  ],
  '4G Sensor': [
    { key: 'sound_level_leq', label: 'LAeq', unit: 'dB(A)' },
    { key: 'sound_level_lmax', label: 'LAFmax', unit: 'dB(A)' },
    { key: 'sound_level_lmin', label: 'LAFmin', unit: 'dB(A)' },
    { key: 'sound_level_inst', label: 'LAF', unit: 'dB(A)' },
    { key: 'sound_level_lcpeak', label: 'LCPeak', unit: 'dB(C)' },
  ],
  '4G Sound Level Meter': [
    { key: 'sound_level_leq', label: 'LAeq', unit: 'dB(A)' },
    { key: 'sound_level_lmax', label: 'LAFmax', unit: 'dB(A)' },
    { key: 'sound_level_lmin', label: 'LAFmin', unit: 'dB(A)' },
    { key: 'sound_level_inst', label: 'LAF', unit: 'dB(A)' },
    { key: 'sound_level_lcpeak', label: 'LCPeak', unit: 'dB(C)' },
  ],
  Leakage: [
    { key: 'water_leak', label: 'Leak Status', unit: '' },
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'humidity', label: 'Humidity', unit: '%' },
  ],
  'Water Leakage Sensor': [
    { key: 'water_leak', label: 'Leak Status', unit: '' },
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'humidity', label: 'Humidity', unit: '%' },
  ],
  IAQ: [
    { key: 'co2', label: 'CO₂', unit: 'ppm' },
    { key: 'tvoc', label: 'TVOC', unit: 'ppb' },
    { key: 'pm2_5', label: 'PM2.5', unit: 'μg/m³' },
    { key: 'pm10', label: 'PM10', unit: 'μg/m³' },
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'humidity', label: 'Humidity', unit: '%' },
    { key: 'pressure', label: 'Pressure', unit: 'hPa' },
    { key: 'illuminance', label: 'Light', unit: 'lux' },
  ],
  'Environment Sensor': [
    { key: 'co2', label: 'CO₂', unit: 'ppm' },
    { key: 'tvoc', label: 'TVOC', unit: 'ppb' },
    { key: 'pm2_5', label: 'PM2.5', unit: 'μg/m³' },
    { key: 'pm10', label: 'PM10', unit: 'μg/m³' },
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'humidity', label: 'Humidity', unit: '%' },
    { key: 'pressure', label: 'Pressure', unit: 'hPa' },
    { key: 'illuminance', label: 'Light', unit: 'lux' },
  ],
  Temperature: [
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'humidity', label: 'Humidity', unit: '%' },
  ],
  Smoke: [
    { key: 'pm2_5', label: 'PM2.5', unit: 'μg/m³' },
    { key: 'pm10', label: 'PM10', unit: 'μg/m³' },
    { key: 'co2', label: 'CO₂', unit: 'ppm' },
    { key: 'temperature', label: 'Temperature', unit: '°C' },
  ],
};

const FALLBACK_METRICS: MetricInfo[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'co2', label: 'CO₂', unit: 'ppm' },
];

function getMetricsForType(type: string): MetricInfo[] {
  return TYPE_METRICS[type] || FALLBACK_METRICS;
}

function autoWidth(ws: XLSX.WorkSheet, data: (string | number | null | undefined)[][]): void {
  if (!data[0]) return;
  const colWidths = data[0].map((_, ci) =>
    Math.min(40, Math.max(10, ...data.map(row => String(row[ci] ?? '').length + 2)))
  );
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

// ══════════════════════════════════════════════════════════
//  Export a SINGLE device
// ══════════════════════════════════════════════════════════
export async function exportDeviceReport(
  device: ExportableDevice,
  period: DeviceExportPeriod,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const wb = XLSX.utils.book_new();
  const report = (msg: string) => onProgress?.(msg);
  const metrics = getMetricsForType(device.type);
  const apiPeriod = period === '30d' ? '7d' : period;

  // Fetch history
  report(`Fetching ${device.name}…`);
  let points: any[] = [];
  if (device.devEui) {
    try {
      const res: any = await api.getDeviceHistory(device.devEui, apiPeriod);
      points = res.points || [];
    } catch { /* empty */ }
  }

  // ── Sheet 1: Device Info ──
  const infoRows: any[][] = [
    ['FioTech Device Report'],
    [],
    ['Device Name', device.name],
    ['Device Type', device.type],
    ['DevEUI', device.devEui || '—'],
    ['Property', device.building],
    ['Location', device.location],
    ['Status', device.status],
    ['Battery', device.battery !== null ? `${device.battery}%` : 'AC Powered'],
    ['Period', PERIOD_LABELS[period]],
    ['Generated', new Date().toLocaleString('en-HK', { dateStyle: 'full', timeStyle: 'medium' })],
    ['Data Points', points.length],
  ];

  // Current readings from decoded
  if (device.decoded && Object.keys(device.decoded).length > 0) {
    infoRows.push([], ['── CURRENT READINGS ──']);
    for (const m of metrics) {
      const v = device.decoded[m.key];
      if (v !== undefined) {
        infoRows.push([m.label, typeof v === 'number' ? +v.toFixed(2) : v, m.unit]);
      }
    }
  }

  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
  autoWidth(wsInfo, infoRows);
  wsInfo['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Device Info');

  // ── Sheet 2: Raw Data ──
  report('Building data…');
  const rawHeader = ['Timestamp', 'Date', 'Time', ...metrics.map(m => `${m.label} (${m.unit})`)];
  const rawRows: any[][] = [rawHeader];

  for (const p of points) {
    const dt = new Date(p.time);
    const row: any[] = [
      dt.toISOString(),
      dt.toLocaleDateString('en-HK'),
      dt.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    ];
    for (const m of metrics) {
      const v = p[m.key];
      row.push(v !== undefined && v !== null ? (typeof v === 'number' ? +v.toFixed(2) : v) : '');
    }
    rawRows.push(row);
  }

  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  autoWidth(wsRaw, rawRows);
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Data');

  // ── Sheet 3: Analysis ──
  report('Analysing…');
  const analysisRows: any[][] = [
    ['Automated Analysis'],
    [],
  ];

  for (const m of metrics) {
    const vals = points.map((p: any) => p[m.key]).filter((v: any) => typeof v === 'number' && v > 0);
    if (vals.length === 0) continue;

    const sorted = [...vals].sort((a: number, b: number) => a - b);
    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];

    analysisRows.push(
      [`── ${m.label} (${m.unit}) ──`],
      ['Samples', vals.length],
      ['Average', +avg.toFixed(2)],
      ['Median', +median.toFixed(2)],
      ['Maximum', +max.toFixed(2)],
      ['Minimum', +min.toFixed(2)],
      ['Std Dev', +Math.sqrt(vals.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / vals.length).toFixed(2)],
    );

    // Hourly pattern
    const hourBuckets: Record<number, number[]> = {};
    for (const p of points) {
      const v = p[m.key];
      if (typeof v !== 'number' || v <= 0) continue;
      const h = new Date(p.time).getHours();
      (hourBuckets[h] ??= []).push(v);
    }
    let worstH = 0, worstAvg = 0;
    for (let h = 0; h < 24; h++) {
      const hv = hourBuckets[h];
      if (!hv || hv.length === 0) continue;
      const hAvg = hv.reduce((a, b) => a + b, 0) / hv.length;
      if (hAvg > worstAvg) { worstAvg = hAvg; worstH = h; }
    }
    analysisRows.push(
      ['Peak Hour', `${String(worstH).padStart(2, '0')}:00 (avg ${worstAvg.toFixed(1)} ${m.unit})`],
      [],
    );
  }

  // Leakage-specific: count leak events
  if (device.type.toLowerCase().includes('leak') || device.type === 'Water Leakage Sensor') {
    const leakEvents = points.filter((p: any) => p.water_leak === 1 || p.water_leak === true || (typeof p.water_leak === 'number' && p.water_leak > 0));
    analysisRows.push(
      ['── LEAKAGE EVENTS ──'],
      ['Total Leak Detections', leakEvents.length],
    );
    if (leakEvents.length > 0) {
      analysisRows.push(['First Detected', new Date(leakEvents[0].time).toLocaleString('en-HK')]);
      analysisRows.push(['Last Detected', new Date(leakEvents[leakEvents.length - 1].time).toLocaleString('en-HK')]);
    }
    analysisRows.push([]);
  }

  const wsAnalysis = XLSX.utils.aoa_to_sheet(analysisRows);
  autoWidth(wsAnalysis, analysisRows);
  wsAnalysis['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  XLSX.utils.book_append_sheet(wb, wsAnalysis, 'Analysis');

  // Save
  report('Saving…');
  const safeName = device.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FioTech_${safeName}_${period}_${dateStr}.xlsx`);
  report('Done');
}

// ══════════════════════════════════════════════════════════
//  Bulk export ALL devices (for the Devices page Export btn)
// ══════════════════════════════════════════════════════════
export async function exportAllDevicesReport(
  devices: ExportableDevice[],
  period: DeviceExportPeriod,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const wb = XLSX.utils.book_new();
  const report = (msg: string) => onProgress?.(msg);

  // ── Sheet 1: Inventory ──
  report('Building inventory…');
  const invHeader = ['Device Name', 'Type', 'Property', 'Location', 'Status', 'Battery', 'DevEUI'];
  const invRows: any[][] = [
    ['FioTech Device Inventory'],
    ['Generated', new Date().toLocaleString('en-HK', { dateStyle: 'full', timeStyle: 'medium' })],
    ['Total Devices', devices.length],
    ['Online', devices.filter(d => d.status === 'online').length],
    [],
    invHeader,
  ];
  for (const d of devices) {
    invRows.push([d.name, d.type, d.building, d.location, d.status, d.battery !== null ? `${d.battery}%` : 'AC', d.devEui || '—']);
  }
  const wsInv = XLSX.utils.aoa_to_sheet(invRows);
  autoWidth(wsInv, invRows);
  wsInv['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  XLSX.utils.book_append_sheet(wb, wsInv, 'Inventory');

  // ── Per-type summary sheets ──
  const byType = new Map<string, ExportableDevice[]>();
  for (const d of devices) {
    const arr = byType.get(d.type) || [];
    arr.push(d);
    byType.set(d.type, arr);
  }

  const apiPeriod = period === '30d' ? '7d' : period;
  let sheetIdx = 0;

  for (const [type, typeDevices] of byType) {
    const metrics = getMetricsForType(type);
    const sheetName = type.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25) || `Type_${++sheetIdx}`;

    report(`Fetching ${type} data…`);
    const header = ['Timestamp', 'Date', 'Time', 'Device', 'Location', ...metrics.map(m => `${m.label} (${m.unit})`)];
    const rows: any[][] = [header];

    for (const d of typeDevices) {
      if (!d.devEui) continue;
      try {
        const res: any = await api.getDeviceHistory(d.devEui, apiPeriod);
        for (const p of (res.points || [])) {
          const dt = new Date(p.time);
          const row: any[] = [
            dt.toISOString(),
            dt.toLocaleDateString('en-HK'),
            dt.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            d.name,
            d.location,
          ];
          for (const m of metrics) {
            const v = p[m.key];
            row.push(v !== undefined && v !== null ? (typeof v === 'number' ? +v.toFixed(2) : v) : '');
          }
          rows.push(row);
        }
      } catch { /* skip */ }
    }

    if (rows.length > 1) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      autoWidth(ws, rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  report('Saving…');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FioTech_All_Devices_${period}_${dateStr}.xlsx`);
  report('Done');
}
