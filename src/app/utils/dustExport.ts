/**
 * Dust Monitoring Excel Export
 * Generates a professional multi-sheet report for dust/PM sensor data.
 */
import * as XLSX from 'xlsx';
import { api } from './api';

export type DustExportPeriod = '24h' | '7d' | '30d';

interface DustDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  pm25: number;
  pm10: number;
  tsp: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  windDir: string;
}

const PERIOD_LABELS: Record<DustExportPeriod, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
};

const PM25_LIMIT = 75;
const PM10_LIMIT = 150;

function pm25Status(v: number): string {
  if (v <= 35) return 'Good';
  if (v <= 75) return 'Moderate';
  if (v <= 115) return 'Unhealthy (Sensitive)';
  if (v <= 150) return 'Unhealthy';
  return 'Hazardous';
}

function autoWidth(ws: XLSX.WorkSheet, data: (string | number | null | undefined)[][]): void {
  if (!data[0]) return;
  const colWidths = data[0].map((_, ci) =>
    Math.min(40, Math.max(10, ...data.map(row => String(row[ci] ?? '').length + 2)))
  );
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

export async function exportDustReport(
  devices: DustDevice[],
  period: DustExportPeriod,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const wb = XLSX.utils.book_new();
  const report = (msg: string) => onProgress?.(msg);
  const apiPeriod = period === '30d' ? '7d' : period;

  // Fetch history
  report('Fetching sensor data…');
  const allHistory = new Map<string, any[]>();
  for (const d of devices) {
    try {
      report(`Fetching ${d.name}…`);
      const res: any = await api.getDeviceHistory(d.id, apiPeriod);
      allHistory.set(d.id, res.points || []);
    } catch { allHistory.set(d.id, []); }
  }

  // ── Sheet 1: Summary ──
  report('Building summary…');
  const summaryRows: any[][] = [
    ['FioTech Dust / PM Monitoring Report'],
    ['Period', PERIOD_LABELS[period]],
    ['Generated', new Date().toLocaleString('en-HK', { dateStyle: 'full', timeStyle: 'medium' })],
    ['Total Sensors', devices.length],
    ['Online', devices.filter(d => d.status === 'online').length],
    [],
    ['Sensor', 'Location', 'Status', 'PM2.5 (μg/m³)', 'PM10 (μg/m³)', 'TSP', 'Temp (°C)', 'Humidity (%)', 'AQI Rating', 'Data Points'],
  ];
  for (const d of devices) {
    const pts = allHistory.get(d.id) || [];
    summaryRows.push([d.name, d.location, d.status, d.pm25, d.pm10, d.tsp, d.temp, d.humidity, pm25Status(d.pm25), pts.length]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  autoWidth(wsSummary, summaryRows);
  wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Raw Data ──
  report('Building raw data…');
  const rawHeader = ['Timestamp', 'Date', 'Time', 'Sensor', 'Location',
    'PM2.5 (μg/m³)', 'PM10 (μg/m³)', 'TSP', 'Temp (°C)', 'Humidity (%)',
    'PM2.5 Exceeded?', 'PM10 Exceeded?', 'AQI Rating'];
  const rawRows: any[][] = [rawHeader];

  for (const d of devices) {
    for (const p of allHistory.get(d.id) || []) {
      const dt = new Date(p.time);
      const pm25 = p.pm2_5 ?? 0;
      const pm10 = p.pm10 ?? 0;
      rawRows.push([
        dt.toISOString(),
        dt.toLocaleDateString('en-HK'),
        dt.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        d.name, d.location,
        pm25, pm10, p.tsp ?? '', p.temperature ?? '', p.humidity ?? '',
        pm25 > PM25_LIMIT ? 'YES' : 'No',
        pm10 > PM10_LIMIT ? 'YES' : 'No',
        pm25Status(pm25),
      ]);
    }
  }
  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  autoWidth(wsRaw, rawRows);
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Data');

  // ── Sheet 3: Hourly Analysis ──
  report('Analysing…');
  const hourBuckets25: Record<number, number[]> = {};
  const hourBuckets10: Record<number, number[]> = {};
  for (let i = 0; i < 24; i++) { hourBuckets25[i] = []; hourBuckets10[i] = []; }

  for (const d of devices) {
    for (const p of allHistory.get(d.id) || []) {
      const h = new Date(p.time).getHours();
      if (typeof p.pm2_5 === 'number' && p.pm2_5 > 0) hourBuckets25[h].push(p.pm2_5);
      if (typeof p.pm10 === 'number' && p.pm10 > 0) hourBuckets10[h].push(p.pm10);
    }
  }

  const hourlyRows: any[][] = [
    ['Hourly PM Analysis'],
    [],
    ['Hour', 'PM2.5 Avg', 'PM2.5 Max', 'PM10 Avg', 'PM10 Max', 'Samples'],
  ];
  for (let h = 0; h < 24; h++) {
    const v25 = hourBuckets25[h];
    const v10 = hourBuckets10[h];
    const samples = Math.max(v25.length, v10.length);
    if (samples === 0) {
      hourlyRows.push([`${String(h).padStart(2, '0')}:00`, '—', '—', '—', '—', 0]);
      continue;
    }
    hourlyRows.push([
      `${String(h).padStart(2, '0')}:00`,
      v25.length > 0 ? +(v25.reduce((a, b) => a + b, 0) / v25.length).toFixed(1) : '—',
      v25.length > 0 ? +Math.max(...v25).toFixed(1) : '—',
      v10.length > 0 ? +(v10.reduce((a, b) => a + b, 0) / v10.length).toFixed(1) : '—',
      v10.length > 0 ? +Math.max(...v10).toFixed(1) : '—',
      samples,
    ]);
  }
  const wsHourly = XLSX.utils.aoa_to_sheet(hourlyRows);
  autoWidth(wsHourly, hourlyRows);
  wsHourly['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, wsHourly, 'Hourly Analysis');

  // ── Sheet 4: Insights ──
  const allPm25: { time: Date; val: number; device: string; location: string }[] = [];
  for (const d of devices) {
    for (const p of allHistory.get(d.id) || []) {
      if (typeof p.pm2_5 === 'number' && p.pm2_5 > 0) {
        allPm25.push({ time: new Date(p.time), val: p.pm2_5, device: d.name, location: d.location });
      }
    }
  }
  allPm25.sort((a, b) => b.val - a.val);

  const insightRows: any[][] = [
    ['Automated Dust Behaviour Analysis'],
    [],
    ['── OVERALL ──'],
    ['Total PM2.5 Readings', allPm25.length],
  ];

  if (allPm25.length > 0) {
    const avg = allPm25.reduce((s, p) => s + p.val, 0) / allPm25.length;
    const exceeded = allPm25.filter(p => p.val > PM25_LIMIT).length;
    insightRows.push(
      ['Average PM2.5', `${avg.toFixed(1)} μg/m³`],
      ['Peak PM2.5', `${allPm25[0].val.toFixed(1)} μg/m³`],
      ['Exceedances (>75)', exceeded],
      ['Exceedance Rate', `${((exceeded / allPm25.length) * 100).toFixed(1)}%`],
      [],
      ['── TOP 10 WORST PM2.5 READINGS ──'],
      ['Rank', 'Timestamp', 'PM2.5 (μg/m³)', 'Sensor', 'Location'],
    );
    allPm25.slice(0, 10).forEach((p, i) => {
      insightRows.push([i + 1, p.time.toLocaleString('en-HK'), +p.val.toFixed(1), p.device, p.location]);
    });
  }

  const wsInsights = XLSX.utils.aoa_to_sheet(insightRows);
  autoWidth(wsInsights, insightRows);
  wsInsights['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, wsInsights, 'Analysis & Insights');

  // Save
  report('Saving…');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FioTech_Dust_Report_${period}_${dateStr}.xlsx`);
  report('Done');
}
