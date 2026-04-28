// Persistable Y-clip presets for the BIM viewer's "Section (Y clip)" tool.
// Each user may want to dial these in for their specific building geometry,
// so the values live in localStorage instead of being hardcoded.

export interface ClipPresets {
  roof: number;
  pipeWire: number;
}

const KEY = 'bim-clip-presets-v1';
export const DEFAULT_CLIP_PRESETS: ClipPresets = { roof: 0.9, pipeWire: 1.3 };

export function loadClipPresets(): ClipPresets {
  if (typeof window === 'undefined') return { ...DEFAULT_CLIP_PRESETS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CLIP_PRESETS };
    const parsed = JSON.parse(raw);
    return {
      roof: Number.isFinite(parsed?.roof) ? Number(parsed.roof) : DEFAULT_CLIP_PRESETS.roof,
      pipeWire: Number.isFinite(parsed?.pipeWire) ? Number(parsed.pipeWire) : DEFAULT_CLIP_PRESETS.pipeWire,
    };
  } catch {
    return { ...DEFAULT_CLIP_PRESETS };
  }
}

export function saveClipPresets(p: ClipPresets) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
