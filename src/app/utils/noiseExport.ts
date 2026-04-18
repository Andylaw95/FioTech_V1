/**
 * Noise Monitoring Excel Export
 * Generates a professional multi-sheet report with raw data + automated analysis.
 */
import * as XLSX from 'xlsx';
import { api } from './api';

// ── Types ──
interface NoiseDevice {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  leq: number;
  lafmax: number;
  lafmin: number;
  laf: number;
  lcpeak: number;
}

interface HistoryPoint {
  time: string;
  sound_level_leq?: number;
  sound_level_lmax?: number;
  sound_level_lmin?: number;
  sound_level_inst?: number;
  sound_level_lcpeak?: number;
  timeLabel?: string;
}

export type ExportPeriod = '24h' | '7d' | '30d';

const PERIOD_LABELS: Record<ExportPeriod, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
};

const DAY_LIMIT = 75;
const NIGHT_LIMIT = 55;
const NIGHT_START = 23;
const NIGHT_END = 7;

function isNightHour(h: number): boolean {
  return h >= NIGHT_START || h < NIGHT_END;
}

function noiseStatus(leq: number): string {
  if (leq < 55) return 'Good';
  if (leq < 70) return 'Moderate';
  if (leq < 85) return 'Loud';
  return 'Excessive';
}

// ── Column auto-width helper ──
function autoWidth(ws: XLSX.WorkSheet, data: (string | number | null | undefined)[][]): void {
  const colWidths = data[0].map((_, ci) =>
    Math.min(40, Math.max(10, ...data.map(row => String(row[ci] ?? '').length + 2)))
  );
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

// ══════════════════════════════════════════════════════════
//  Main export function
// ══════════════════════════════════════════════════════════
export async function exportNoiseReport(
  devices: NoiseDevice[],
  period: ExportPeriod,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const wb = XLSX.utils.book_new();
  const report = (msg: string) => onProgress?.(msg);

  // ── 1. Fetch history for ALL devices ──
  report('Fetching sensor data…');
  const allHistory: Map<string, HistoryPoint[]> = new Map();
  const apiPeriod = period === '30d' ? '7d' : period; // API may not support 30d — use 7d

  for (const d of devices) {
    try {
      report(`Fetching ${d.name}…`);
      const res: any = await api.getDeviceHistory(d.id, apiPeriod);
      allHistory.set(d.id, res.points || []);
    } catch {
      allHistory.set(d.id, []);
    }
  }

  // ── 2. SHEET 1: Summary ──
  report('Building summary…');
  const summaryRows: any[][] = [
    ['FioTech Noise Monitoring Report'],
    ['Period', PERIOD_LABELS[period]],
    ['Generated', new Date().toLocaleString('en-HK', { dateStyle: 'full', timeStyle: 'medium' })],
    ['Total Sensors', devices.length],
    ['Online', devices.filter(d => d.status === 'online').length],
    [],
    ['Sensor', 'Location', 'Status', 'LAeq (dB)', 'LAFmax (dB)', 'LAFmin (dB)', 'LAF (dB)', 'LCPeak (dB)', 'Rating', 'Data Points'],
  ];
  for (const d of devices) {
    const pts = allHistory.get(d.id) || [];
    summaryRows.push([
      d.name, d.location, d.status, d.leq, d.lafmax, d.lafmin, d.laf, d.lcpeak,
      noiseStatus(d.leq), pts.length,
    ]);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  autoWidth(wsSummary, summaryRows);
  wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── 3. SHEET 2: Raw Data (all devices, all points) ──
  report('Building raw data…');
  const rawHeader = ['Timestamp', 'Date', 'Time', 'Hour', 'Sensor', 'Location',
    'LAeq (dB)', 'LAFmax (dB)', 'LAFmin (dB)', 'LAF (dB)', 'LCPeak (dB)',
    'Day/Night', 'Limit (dB)', 'Exceeded?', 'Status'];
  const rawRows: any[][] = [rawHeader];

  for (const d of devices) {
    const pts = allHistory.get(d.id) || [];
    for (const p of pts) {
      const dt = new Date(p.time);
      const h = dt.getHours();
      const night = isNightHour(h);
      const limit = night ? NIGHT_LIMIT : DAY_LIMIT;
      const leq = p.sound_level_leq ?? 0;
      rawRows.push([
        dt.toISOString(),
        dt.toLocaleDateString('en-HK'),
        dt.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        h,
        d.name,
        d.location,
        leq,
        p.sound_level_lmax ?? '',
        p.sound_level_lmin ?? '',
        p.sound_level_inst ?? '',
        p.sound_level_lcpeak ?? '',
        night ? 'Night' : 'Day',
        limit,
        leq > limit ? 'YES' : 'No',
        noiseStatus(leq),
      ]);
    }
  }

  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  autoWidth(wsRaw, rawRows);
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Data');

  // ── 4. SHEET 3: Hourly Analysis ──
  report('Analysing patterns…');
  const hourBuckets: { [hour: number]: number[] } = {};
  for (let i = 0; i < 24; i++) hourBuckets[i] = [];

  const allPoints: { time: Date; leq: number; device: string; location: string }[] = [];

  for (const d of devices) {
    for (const p of allHistory.get(d.id) || []) {
      const leq = p.sound_level_leq;
      if (leq == null || leq <= 0) continue;
      const dt = new Date(p.time);
      hourBuckets[dt.getHours()].push(leq);
      allPoints.push({ time: dt, leq, device: d.name, location: d.location });
    }
  }

  const hourlyHeader = ['Hour', 'Period', 'Avg LAeq (dB)', 'Max LAeq (dB)', 'Min LAeq (dB)', 'Samples', 'Limit (dB)', 'Exceedances', 'Exceedance Rate'];
  const hourlyRows: any[][] = [
    ['Hourly Noise Analysis'],
    [],
    hourlyHeader,
  ];
  for (let h = 0; h < 24; h++) {
    const vals = hourBuckets[h];
    const night = isNightHour(h);
    const limit = night ? NIGHT_LIMIT : DAY_LIMIT;
    if (vals.length === 0) {
      hourlyRows.push([`${String(h).padStart(2, '0')}:00`, night ? 'Night' : 'Day', '—', '—', '—', 0, limit, 0, '—']);
      continue;
    }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const exceeded = vals.filter(v => v > limit).length;
    hourlyRows.push([
      `${String(h).padStart(2, '0')}:00`,
      night ? 'Night' : 'Day',
      +avg.toFixed(1),
      +Math.max(...vals).toFixed(1),
      +Math.min(...vals).toFixed(1),
      vals.length,
      limit,
      exceeded,
      `${((exceeded / vals.length) * 100).toFixed(1)}%`,
    ]);
  }

  const wsHourly = XLSX.utils.aoa_to_sheet(hourlyRows);
  autoWidth(wsHourly, [hourlyHeader, ...hourlyRows]);
  wsHourly['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  XLSX.utils.book_append_sheet(wb, wsHourly, 'Hourly Analysis');

  // ── 5. SHEET 4: Automated Insights ──
  report('Generating insights…');
  const insightRows: any[][] = [
    ['Automated Noise Behaviour Analysis'],
    [],
  ];

  // Sort all points by time
  allPoints.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Find worst hour
  let worstHour = 0;
  let worstAvg = 0;
  for (let h = 0; h < 24; h++) {
    const vals = hourBuckets[h];
    if (vals.length === 0) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > worstAvg) { worstAvg = avg; worstHour = h; }
  }

  // Find top 10 loudest readings
  const sorted = [...allPoints].sort((a, b) => b.leq - a.leq);
  const top10 = sorted.slice(0, 10);

  // Find longest exceedance streak
  let maxStreak = 0;
  let streakStart = '';
  let streakEnd = '';
  let cur = 0;
  let curStart = '';
  for (const p of allPoints) {
    const night = isNightHour(p.time.getHours());
    const limit = night ? NIGHT_LIMIT : DAY_LIMIT;
    if (p.leq > limit) {
      if (cur === 0) curStart = p.time.toLocaleString('en-HK');
      cur++;
      if (cur > maxStreak) {
        maxStreak = cur;
        streakStart = curStart;
        streakEnd = p.time.toLocaleString('en-HK');
      }
    } else {
      cur = 0;
    }
  }

  // Per-sensor stats
  const sensorStats: { name: string; avg: number; max: number; exceedances: number; total: number }[] = [];
  for (const d of devices) {
    const pts = (allHistory.get(d.id) || []).map(p => p.sound_level_leq).filter((v): v is number => v != null && v > 0);
    if (pts.length === 0) continue;
    const exceeded = pts.filter(v => v > DAY_LIMIT).length;
    sensorStats.push({
      name: d.name,
      avg: +(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1),
      max: +Math.max(...pts).toFixed(1),
      exceedances: exceeded,
      total: pts.length,
    });
  }
  sensorStats.sort((a, b) => b.avg - a.avg);

  // Overall stats
  const allLeq = allPoints.map(p => p.leq);
  const totalExceedDay = allPoints.filter(p => !isNightHour(p.time.getHours()) && p.leq > DAY_LIMIT).length;
  const totalExceedNight = allPoints.filter(p => isNightHour(p.time.getHours()) && p.leq > NIGHT_LIMIT).length;

  insightRows.push(
    ['── OVERALL STATISTICS ──'],
    ['Total Data Points', allPoints.length],
    ['Overall Average LAeq', allLeq.length > 0 ? +(allLeq.reduce((a, b) => a + b, 0) / allLeq.length).toFixed(1) : '—', 'dB(A)'],
    ['Overall Maximum', allLeq.length > 0 ? +Math.max(...allLeq).toFixed(1) : '—', 'dB(A)'],
    ['Overall Minimum', allLeq.length > 0 ? +Math.min(...allLeq).toFixed(1) : '—', 'dB(A)'],
    ['Daytime Exceedances (>75 dB)', totalExceedDay],
    ['Nighttime Exceedances (>55 dB)', totalExceedNight],
    [],
    ['── WORST NOISE PERIOD ──'],
    ['Noisiest Hour', `${String(worstHour).padStart(2, '0')}:00 – ${String(worstHour + 1).padStart(2, '0')}:00`],
    ['Average LAeq at Worst Hour', `${worstAvg.toFixed(1)} dB(A)`],
    [],
    ['── LONGEST EXCEEDANCE STREAK ──'],
    ['Consecutive Readings Exceeded', maxStreak],
    ['Streak Start', streakStart || '—'],
    ['Streak End', streakEnd || '—'],
    [],
    ['── TOP 10 LOUDEST READINGS ──'],
    ['Rank', 'Timestamp', 'LAeq (dB)', 'Sensor', 'Location'],
  );
  top10.forEach((p, i) => {
    insightRows.push([i + 1, p.time.toLocaleString('en-HK'), +p.leq.toFixed(1), p.device, p.location]);
  });

  insightRows.push(
    [],
    ['── PER-SENSOR RANKING (by avg LAeq) ──'],
    ['Sensor', 'Avg LAeq (dB)', 'Max LAeq (dB)', 'Exceedances', 'Total Points', 'Exceedance Rate'],
  );
  for (const s of sensorStats) {
    insightRows.push([s.name, s.avg, s.max, s.exceedances, s.total, `${((s.exceedances / s.total) * 100).toFixed(1)}%`]);
  }

  // Noise behaviour pattern
  insightRows.push(
    [],
    ['── NOISE BEHAVIOUR PATTERN ──'],
    ['Time Block', 'Description'],
    ['00:00 – 07:00 (Night)', describeBlock(hourBuckets, 0, 7)],
    ['07:00 – 12:00 (Morning)', describeBlock(hourBuckets, 7, 12)],
    ['12:00 – 14:00 (Lunch)', describeBlock(hourBuckets, 12, 14)],
    ['14:00 – 18:00 (Afternoon)', describeBlock(hourBuckets, 14, 18)],
    ['18:00 – 23:00 (Evening)', describeBlock(hourBuckets, 18, 23)],
    ['23:00 – 00:00 (Late Night)', describeBlock(hourBuckets, 23, 24)],
  );

  const wsInsights = XLSX.utils.aoa_to_sheet(insightRows);
  autoWidth(wsInsights, insightRows);
  wsInsights['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, wsInsights, 'Analysis & Insights');

  // ── Save file ──
  report('Saving file…');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `FioTech_Noise_Report_${period}_${dateStr}.xlsx`);
  report('Done');
}

function describeBlock(buckets: { [h: number]: number[] }, from: number, to: number): string {
  const vals: number[] = [];
  for (let h = from; h < to; h++) vals.push(...(buckets[h] || []));
  if (vals.length === 0) return 'No data available';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const exceeded = vals.filter(v => v > (isNightHour(from) ? NIGHT_LIMIT : DAY_LIMIT)).length;
  const rate = ((exceeded / vals.length) * 100).toFixed(1);
  let desc = `Avg ${avg.toFixed(1)} dB, Range ${min.toFixed(1)}–${max.toFixed(1)} dB`;
  if (exceeded > 0) desc += `, ${exceeded} exceedances (${rate}%)`;
  else desc += ', No exceedances';
  if (avg < 50) desc += ' — Very quiet';
  else if (avg < 60) desc += ' — Quiet';
  else if (avg < 70) desc += ' — Moderate activity';
  else if (avg < 80) desc += ' — Noisy';
  else desc += ' — ⚠️ Excessively loud';
  return desc;
}
