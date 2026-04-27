const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', 'node_modules', 'web-ifc-three', 'node_modules', 'web-ifc'),
  path.join(__dirname, '..', 'node_modules', 'web-ifc'),
];

const src = candidates.find((p) => fs.existsSync(path.join(p, 'web-ifc.wasm')));
if (!src) {
  console.error('[sync-web-ifc-wasm] no web-ifc package found in', candidates);
  process.exit(1);
}

const dst = path.join(__dirname, '..', 'public', 'wasm');
fs.mkdirSync(dst, { recursive: true });

// Always sync the *top-level* web-ifc 0.0.77 wasm (used by @thatopen/components)
// alongside the legacy nested 0.0.39 (used by web-ifc-three for IFC type constants).
// We name the new one with a prefix so /wasm/web-ifc.wasm stays the legacy file
// the old IfcLoader expects, and @thatopen reads from /wasm/v77/.
const topLevelSrc = path.join(__dirname, '..', 'node_modules', 'web-ifc');
if (fs.existsSync(path.join(topLevelSrc, 'web-ifc.wasm'))) {
  const v77Dir = path.join(dst, 'v77');
  fs.mkdirSync(v77Dir, { recursive: true });
  for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm']) {
    const from = path.join(topLevelSrc, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(v77Dir, f));
  }
  console.log('[sync-web-ifc-wasm] synced web-ifc 0.0.77 → public/wasm/v77/');
}

// Fragments worker for @thatopen/fragments — copy locally so we don't depend
// on unpkg at runtime (CSP/network reliability).
const fragWorker = path.join(__dirname, '..', 'node_modules', '@thatopen', 'fragments', 'dist', 'Worker', 'worker.mjs');
if (fs.existsSync(fragWorker)) {
  fs.copyFileSync(fragWorker, path.join(dst, 'fragments-worker.mjs'));
  console.log('[sync-web-ifc-wasm] synced fragments worker → public/wasm/fragments-worker.mjs');
}

for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm']) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) {
    console.warn('[sync-web-ifc-wasm] missing', from);
    continue;
  }
  fs.copyFileSync(from, path.join(dst, f));
}
console.log('[sync-web-ifc-wasm] synced legacy web-ifc-three wasm from', src);

