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
  ppv_max: 'ppv_max_mm_s',
  ppv_peak: 'ppv_max_mm_s',
  ppv_resultant: 'ppv_resultant_mm_s',
  dominant_freq: 'vibration_dominant_freq_hz',
  dominant_freq_hz: 'vibration_dominant_freq_hz',
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
  ppv_max_mm_s:       { label: 'PPV Max',  unit: 'μm/s' },
  ppv_resultant_mm_s: { label: 'PPV',      unit: 'μm/s' },
  ppv_x_mm_s:         { label: 'PPV X',    unit: 'μm/s' },
  ppv_y_mm_s:         { label: 'PPV Y',    unit: 'μm/s' },
  ppv_z_mm_s:         { label: 'PPV Z',    unit: 'μm/s' },
  tilt_x_deg:         { label: 'Tilt X',   unit: '°' },
  tilt_y_deg:         { label: 'Tilt Y',   unit: '°' },
  tilt_z_deg:         { label: 'Tilt Z',   unit: '°' },
  vibration_dominant_freq_hz: { label: 'Freq', unit: 'Hz' },
};

const SUPPRESSED_KEYS = new Set([
  'battery', 'pir', 'digital_input', 'water_leak',
  'timestamp', 'fport', 'fcnt', 'sample_count', 'sample_rate_hz',
  'lines_in_window', 'window_lines', 'vibration_alarm_level',
  'ppv_raw_peak', 'ppv_raw_unit_um_s',
]);

const ppvDisplayValue = (key: string, value: number) => (
  key.endsWith('_mm_s') && key.startsWith('ppv_') ? value * 1000 : value
);

export function normalizeMetrics(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(raw ?? {})) {
    const v = Number(rawVal);
    if (!Number.isFinite(v)) continue;
    const stripped = rawKey.replace(/_\d+$/, '').toLowerCase();
    const key = ALIASES[stripped] ?? stripped;
    if (SUPPRESSED_KEYS.has(key)) continue;
    if (out[key] === undefined) out[key] = ppvDisplayValue(key, v);
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
