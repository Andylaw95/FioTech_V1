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
for (const f of ['web-ifc.wasm', 'web-ifc-mt.wasm']) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) {
    console.warn('[sync-web-ifc-wasm] missing', from);
    continue;
  }
  fs.copyFileSync(from, path.join(dst, f));
}
console.log('[sync-web-ifc-wasm] synced from', src);
