// Shared metric helpers for BIM viewer + DeviceInspector.
// LoRa decoders (Cayenne LPP, ChirpStack JS codecs) emit channel-suffixed
// keys like `temperature_3`, `co2_7`, `pm2_5_11`. We normalize once here
// so every UI consumer sees clean canonical keys.

const ALIASES: Record<string, string> = {
  relative_humidity: 'humidity',
  rh: 'humidity',
  barometric_pressure: 'pressure',
  baro_pressure: 'pressure',
  temp: 'temperature',
  pm25: 'pm2_5',
  pm_25: 'pm2_5',
  laeq: 'sound_level_leq',
  leq: 'sound_level_leq',
  lafmax: 'sound_level_lmax',
  lafmin: 'sound_level_lmin',
  laf: 'sound_level_inst',
  lcpeak: 'sound_level_lcpeak',
};

export const METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  sound_level_leq:    { label: 'LAeq',     unit: 'dB' },
  sound_level_lmax:   { label: 'LAFmax',   unit: 'dB' },
  sound_level_lmin:   { label: 'LAFmin',   unit: 'dB' },
  sound_level_inst:   { label: 'LAF',      unit: 'dB' },
  sound_level_lcpeak: { label: 'LCpeak',   unit: 'dB' },
  pm2_5:              { label: 'PM2.5',    unit: 'µg/m³' },
  pm10:               { label: 'PM10',     unit: 'µg/m³' },
  tsp:                { label: 'TSP',      unit: 'µg/m³' },
  temperature:        { label: 'Temp',     unit: '°C' },
  humidity:           { label: 'Humidity', unit: '%' },
  co2:                { label: 'CO₂',      unit: 'ppm' },
  tvoc:               { label: 'TVOC',     unit: 'ppb' },
  hcho:               { label: 'HCHO',     unit: 'mg/m³' },
  pressure:           { label: 'Pressure', unit: 'hPa' },
  illuminance:        { label: 'Lux',      unit: 'lx' },
};

const SUPPRESSED_KEYS = new Set(['battery', 'pir', 'digital_input', 'water_leak']);

export function normalizeMetrics(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(raw ?? {})) {
    const v = Number(rawVal);
    if (!Number.isFinite(v)) continue;
    const stripped = rawKey.replace(/_\d+$/, '').toLowerCase();
    const key = ALIASES[stripped] ?? stripped;
    if (out[key] === undefined) out[key] = v;
  }
  return out;
}

export interface MetricSlide {
  key: string;
  label: string;
  unit: string;
  value: number;
}

/**
 * Build the slide list for the rotating "primary" metric block. Filters to
 * metrics we have a label for, drops housekeeping fields (battery, pir),
 * and orders so the caller's preferred primary key (if present) lands in
 * slot 0 — keeping first-impression UI stable across data updates.
 */
export function buildMetricSlides(
  metrics: Record<string, number>,
  primaryKey?: string | null,
): MetricSlide[] {
  const slides: MetricSlide[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (SUPPRESSED_KEYS.has(key)) continue;
    const meta = METRIC_LABEL[key];
    if (!meta) continue;
    slides.push({ key, label: meta.label, unit: meta.unit, value });
  }
  if (primaryKey) {
    const idx = slides.findIndex(s => s.key === primaryKey);
    if (idx > 0) {
      const [p] = slides.splice(idx, 1);
      slides.unshift(p);
    }
  }
  return slides;
}
