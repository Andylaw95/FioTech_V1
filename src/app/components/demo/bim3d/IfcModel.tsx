import { useEffect, useState, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';

// IndexedDB cache for parsed Fragments binary so re-loads on the same device
// skip the 5-7s web-ifc parse. Keyed by URL + a schema-version tag.
const FRAG_CACHE_DB = 'fiotec-bim-frag-cache';
const FRAG_CACHE_STORE = 'frags';
const FRAG_CACHE_VERSION = 1;

function openFragCache(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(FRAG_CACHE_DB, FRAG_CACHE_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FRAG_CACHE_STORE)) {
          db.createObjectStore(FRAG_CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getCachedFrag(key: string): Promise<Uint8Array | null> {
  const db = await openFragCache();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FRAG_CACHE_STORE, 'readonly');
      const req = tx.objectStore(FRAG_CACHE_STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        if (v instanceof Uint8Array) resolve(v);
        else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putCachedFrag(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openFragCache();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FRAG_CACHE_STORE, 'readwrite');
      tx.objectStore(FRAG_CACHE_STORE).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Module-level cache (single model, keyed by URL)
let cached: THREE.Group | null = null;
let cachedUrl: string | null = null;
// @thatopen handles
let components: OBC.Components | null = null;
let ifcLoader: OBC.IfcLoader | null = null;
let cachedFragModel: any = null;
let cachedModelId: string | null = null;

let loadingPromise: Promise<THREE.Group> | null = null;
let loadingUrl: string | null = null;
let originalMeshes: THREE.Mesh[] = [];
let edgeLines: THREE.LineSegments[] = [];
let edgesEnabled = true;
let allIfcIds: number[] = [];
let isolated = false;
let ghostOn = false;
let cachedSpatialFlat: Map<number, string | null> | null = null;
let initialClipApplied = false;

function disposeCachedModel() {
  // Free GPU resources so reload / URL switch doesn't leak
  edgeLines.forEach((l) => {
    l.geometry?.dispose?.();
    const mats = Array.isArray(l.material) ? l.material : [l.material];
    mats.forEach((m: any) => m?.dispose?.());
    l.parent?.remove(l);
  });
  edgeLines = [];
  if (cachedFragModel) {
    try { cachedFragModel.dispose?.(); } catch {}
    cachedFragModel = null;
  }
  originalMeshes.forEach((m) => {
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mt: any) => mt?.dispose?.());
  });
  originalMeshes = [];
  allIfcIds = [];
  categoryIds = {};
  bboxCache.clear();
  cachedSpatialFlat = null;
  cached = null;
  cachedUrl = null;
  cachedModelId = null;
  initialClipApplied = false;
  isolated = false;
  ghostOn = false;
  // Tear down the @thatopen Components container too — it owns the
  // FragmentsManager worker and is bound to the previous WebGL context.
  // Without this, navigating away and back leaves stale GPU buffers that
  // crash three.js render with "byteLength of undefined".
  if (components) {
    try { components.dispose?.(); } catch {}
    components = null as any;
  }
  ifcLoader = null as any;
  loadingPromise = null;
  loadingUrl = null;
}

export function setEdgesVisible(on: boolean) {
  edgesEnabled = on;
  edgeLines.forEach((l) => { l.visible = on; });
}

export function getModelGroup(): THREE.Group | null {
  return cached;
}

/** Picker helper: raycasts the FragmentsModel at the given mouse coords and returns
 *  a synthetic THREE.Intersection-like object with `userData.localId` set. PickerOverlay
 *  uses this to bridge the new streaming raycaster into our existing intersection-based
 *  pick info pipeline (`getIfcInfoFromIntersection`). */
export async function pickFragmentsAtMouse(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  mouse: THREE.Vector2,
  dom: HTMLCanvasElement,
): Promise<THREE.Intersection | null> {
  if (!cachedFragModel || !components) return null;
  try {
    const mgr = components.get(OBC.FragmentsManager);
    const result: any = await mgr.raycast({ camera, mouse, dom });
    if (!result || typeof result.localId !== 'number') return null;
    // Pre-warm bbox cache so the subsequent isolate-zoom in Bim3DStage has data.
    void fetchAndCacheBox(result.localId);
    const stub = new THREE.Object3D();
    stub.userData.localId = result.localId;
    return {
      object: stub,
      point: result.point,
      distance: result.distance ?? 0,
    } as unknown as THREE.Intersection;
  } catch (e) {
    console.warn('[IfcModel] pickFragmentsAtMouse failed', e);
    return null;
  }
}

// Cache of expressId → merged bbox (in fragmentsModel local coords). Populated by
// highlightExpressId / pickFragmentsAtMouse so the sync getExpressIdBoundingBox
// caller (Bim3DStage CameraFlyTo) has data ready when isolate fires.
const bboxCache = new Map<number, THREE.Box3>();

async function fetchAndCacheBox(expressId: number): Promise<THREE.Box3 | null> {
  if (!cachedFragModel) return null;
  try {
    const box: THREE.Box3 = await cachedFragModel.getMergedBox([expressId]);
    if (box && !box.isEmpty()) {
      // FragmentsModel.getMergedBox returns coords in the model's local space.
      // The wrapper <group> applies scale/translation/rotation in IfcModel auto-fit;
      // bake those into the box so the camera fly-to lands on the element.
      const obj = cachedFragModel.object as THREE.Object3D | undefined;
      const wrapper = obj?.parent ?? obj;
      if (wrapper) {
        wrapper.updateMatrixWorld(true);
        box.applyMatrix4(wrapper.matrixWorld);
      }
      bboxCache.set(expressId, box);
      return box;
    }
  } catch (e) {
    console.warn('[IfcModel] getMergedBox failed', e);
  }
  return null;
}

export function getExpressIdBoundingBox(expressId: number): THREE.Box3 | null {
  if (!cachedFragModel) return null;
  const cachedBox = bboxCache.get(expressId);
  if (cachedBox) return cachedBox.clone();
  // Kick off async fetch for next-time use; callers that need an immediate fit
  // (Bim3DStage isolate-zoom) will get null on the very first click and a valid
  // box on subsequent ones — acceptable degradation.
  void fetchAndCacheBox(expressId);
  return null;
}

// Categories (display name → IFC type string regexes grouped together).
// Switched from numeric web-ifc IFC* constants to string regexes because
// FragmentsModel.getItemsOfCategories returns category names, not IDs.
//
// Each category is tagged with a `discipline` (architectural / structural /
// mep / common) following DDC's discipline-based BIM grouping. The discipline
// filter in the UI lets users hide e.g. structural to remove duplicate-slab
// z-fighting at the source. Carefully:
//  - IFCSLAB → structural (the concrete deck) — keep visible when user wants
//    a clean floor surface
//  - IFCCOVERING → architectural (floor finish, ceiling tiles) — the duplicate
//    that fights with the slab; toggling architectural off removes the fight
//  - IFCMEMBER / IFCPLATE → structural
//  - IFCWALL family → architectural
export type Discipline = 'architectural' | 'structural' | 'mep' | 'common';
export const DISCIPLINES: Record<Discipline, { label: string; color: string }> = {
  architectural: { label: 'Architectural', color: '#a78bfa' },
  structural:    { label: 'Structural',    color: '#64748b' },
  mep:           { label: 'MEP',           color: '#22d3ee' },
  common:        { label: 'Common',        color: '#facc15' },
};

export const CATEGORY_GROUPS: Record<string, { label: string; types: RegExp[]; color?: string; discipline: Discipline }> = {
  walls:     { label: 'Walls',        types: [/^IFCWALL/, /^IFCCURTAINWALL/],                                            color: '#94a3b8', discipline: 'architectural' },
  coverings: { label: 'Floor Finish', types: [/^IFCCOVERING/],                                                            color: '#cbd5e1', discipline: 'architectural' },
  slabs:     { label: 'Floor Slab',   types: [/^IFCSLAB/],                                                                color: '#9ca3af', discipline: 'structural' },
  roof:      { label: 'Roof',         types: [/^IFCROOF/],                                                                color: '#fbbf24', discipline: 'architectural' },
  doors:     { label: 'Doors',        types: [/^IFCDOOR/],                                                                color: '#a78bfa', discipline: 'architectural' },
  windows:   { label: 'Windows',      types: [/^IFCWINDOW/],                                                              color: '#7dd3fc', discipline: 'architectural' },
  stairs:    { label: 'Stairs',       types: [/^IFCSTAIR/, /^IFCSTAIRFLIGHT/, /^IFCRAILING/],                             color: '#fb923c', discipline: 'architectural' },
  structure: { label: 'Cols/Beams',   types: [/^IFCCOLUMN/, /^IFCBEAM/, /^IFCFOOTING/, /^IFCPILE/],                       color: '#475569', discipline: 'structural' },
  members:   { label: 'Struct Members', types: [/^IFCMEMBER/, /^IFCPLATE/],                                               color: '#52525b', discipline: 'structural' },
  furniture: { label: 'Furniture',    types: [/^IFCFURNISHINGELEMENT/],                                                   color: '#34d399', discipline: 'architectural' },
  mep:       { label: 'MEP',          types: [/^IFCFLOWSEGMENT/, /^IFCFLOWFITTING/, /^IFCFLOWTERMINAL/, /^IFCDISTRIBUTIONELEMENT/], color: '#22d3ee', discipline: 'mep' },
  spaces:    { label: 'Spaces',       types: [/^IFCSPACE/],                                                               color: '#facc15', discipline: 'common' },
  other:     { label: 'Other',        types: [/^IFCBUILDINGELEMENTPROXY/],                                                color: '#f472b6', discipline: 'common' },
};

// Lookup: discipline → list of category keys (for batch toggles).
export const CATEGORIES_BY_DISCIPLINE: Record<Discipline, string[]> = (() => {
  const m: Record<Discipline, string[]> = { architectural: [], structural: [], mep: [], common: [] };
  for (const [key, g] of Object.entries(CATEGORY_GROUPS)) m[g.discipline].push(key);
  return m;
})();

let categoryIds: Record<string, number[]> = {};

// Module-level shared clipping plane (cuts everything ABOVE the height)
export const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 9999);

export function setClipHeight(h: number) {
  clipPlane.constant = h;
}

export function setWireframe(on: boolean) {
  if (!cached) return;
  cached.traverse((obj: any) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: any) => { m.wireframe = on; });
    }
  });
}

const HIGHLIGHT_COLOR = new THREE.Color(0xfbbf24);

function modelIdMap(ids: number[]): Record<string, Set<number>> {
  if (!cachedModelId) return {};
  return { [cachedModelId]: new Set(ids) };
}

export async function setVisibleCategories(active: Set<string>) {
  if (!cachedFragModel || !components || !cachedModelId) return;
  const allActive = active.size === Object.keys(CATEGORY_GROUPS).length;

  try {
    const hider = components.get(OBC.Hider);
    if (allActive) {
      await hider.set(true);
      return;
    }
    // Hide everything first
    await hider.set(false);
    const ids: number[] = [];
    active.forEach((cat) => {
      const list = categoryIds[cat];
      if (list) ids.push(...list);
    });
    if (ids.length === 0) return;
    await hider.set(true, modelIdMap(ids));
  } catch (e) {
    console.warn('[IfcModel] setVisibleCategories failed', e);
  }
}

export function highlightExpressId(expressId: number | null) {
  if (!cachedFragModel) return;
  (async () => {
    try {
      if (expressId == null) {
        await cachedFragModel.resetHighlight();
      } else {
        await cachedFragModel.highlight([expressId], {
          color: HIGHLIGHT_COLOR,
          opacity: 1,
          transparent: false,
          renderedFaces: 0,
        });
      }
      await components?.get(OBC.FragmentsManager).core?.update?.(true);
    } catch (e) {
      console.warn('[IfcModel] highlight failed', e);
    }
  })();
}

/** Ghost mode: dim everything to translucent so highlighted/picked element pops. */
export function setGhostMode(on: boolean) {
  if (!cachedFragModel) return;
  ghostOn = on;
  (async () => {
    try {
      if (on) {
        await cachedFragModel.setOpacity(undefined, 0.15);
      } else {
        await cachedFragModel.resetOpacity(undefined);
      }
      await components?.get(OBC.FragmentsManager).core?.update?.(true);
    } catch (e) {
      console.warn('[IfcModel] ghost mode toggle failed', e);
    }
  })();
}

/** True isolate: hide everything except the given expressIds. */
export function isolateExpressIds(ids: number[] | null) {
  if (!cachedFragModel || !components || !cachedModelId) return;
  (async () => {
    try {
      const hider = components!.get(OBC.Hider);
      if (!ids || ids.length === 0) {
        isolated = false;
        await hider.set(true);
      } else {
        isolated = true;
        await hider.isolate(modelIdMap(ids));
      }
      await components!.get(OBC.FragmentsManager).core?.update?.(true);
    } catch (e) {
      console.warn('[IfcModel] isolate failed', e);
    }
  })();
}

/** Restore everything: clears isolate, ghost, highlight; shows all originals. */
export function showAll() {
  if (!cachedFragModel || !components) return;
  (async () => {
    try {
      const hider = components!.get(OBC.Hider);
      await hider.set(true);
      await cachedFragModel.resetHighlight();
      if (ghostOn) {
        await cachedFragModel.resetOpacity(undefined);
        ghostOn = false;
      }
      isolated = false;
      await components!.get(OBC.FragmentsManager).core?.update?.(true);
    } catch (e) {
      console.warn('[IfcModel] showAll failed', e);
    }
  })();
}

/** Look up the IFC ExpressID + property name for a Three.js intersection on the IFC model.
 *  PickerOverlay attaches `userData.localId` (and optionally `userData.fragmentsModel`) to a
 *  synthetic intersection.object after running `FragmentsManager.raycast`. We read it back here.
 */
export async function getIfcInfoFromIntersection(intersection: THREE.Intersection): Promise<{
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
} | null> {
  if (!cachedFragModel) return null;
  const ud: any = (intersection.object as any)?.userData ?? {};
  const expressId: number | undefined = ud.localId;
  if (expressId == null) return null;
  try {
    const item = cachedFragModel.getItem(expressId);
    const ifcType = (await item.getCategory()) || 'unknown';
    let name: string | null = null;
    try {
      const dataArr = await cachedFragModel.getItemsData([expressId]);
      const d = dataArr?.[0] ?? {};
      name = (d.Name?.value as string) ?? (d.LongName?.value as string) ?? null;
    } catch {}
    let storey: string | null = null;
    try {
      if (!cachedSpatialFlat) {
        const struct: any = await cachedFragModel.getSpatialStructure();
        const flat = new Map<number, string | null>();
        const walk = (node: any, currentStorey: string | null) => {
          const cat = node?.category ?? node?.type;
          const ns = cat === 'IFCBUILDINGSTOREY'
            ? (node?.name ?? node?.Name?.value ?? `Storey ${node?.localId ?? node?.expressID}`)
            : currentStorey;
          const id = node?.localId ?? node?.expressID;
          if (typeof id === 'number') flat.set(id, ns);
          for (const c of node?.children ?? []) walk(c, ns);
        };
        walk(struct, null);
        cachedSpatialFlat = flat;
      }
      storey = cachedSpatialFlat.get(expressId) ?? null;
    } catch (e) {
      console.warn('[IfcModel] spatial structure lookup failed', e);
    }
    return { expressId, ifcType, name, storey };
  } catch (e) {
    console.warn('[IfcModel] getInfo failed', e);
    return null;
  }
}

async function ensureThatOpenLoader(): Promise<OBC.IfcLoader> {
  if (ifcLoader) return ifcLoader;
  console.log('[IfcModel] initializing @thatopen components…');
  const tInit = performance.now();
  components = new OBC.Components();
  const fragmentsManager = components.get(OBC.FragmentsManager);
  try {
    const workerURL = '/wasm/fragments-worker.mjs';
    await fragmentsManager.init(workerURL);
    console.log(`[IfcModel] fragments worker ready in ${Math.round(performance.now() - tInit)}ms`);
  } catch (e) {
    console.warn('[IfcModel] local fragments worker failed, falling back to unpkg', e);
    const workerURL = await OBC.FragmentsManager.getWorker();
    await fragmentsManager.init(workerURL);
  }
  ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: '/wasm/v77/', absolute: true },
  } as any);
  console.log(`[IfcModel] IfcLoader setup complete in ${Math.round(performance.now() - tInit)}ms`);
  return ifcLoader;
}

async function loadIfc(url: string): Promise<THREE.Group> {
  if (cached && cachedUrl === url) return cached;
  if (loadingPromise && loadingUrl === url) return loadingPromise;

  // URL changed → drop the previous model and start fresh
  if (cached || cachedUrl) disposeCachedModel();

  loadingUrl = url;
  loadingPromise = (async () => {
    console.log('[IfcModel] loading', url);
    const t0 = performance.now();

    const loader = await ensureThatOpenLoader();
    const fragsManager = components!.get(OBC.FragmentsManager);
    console.log(`[IfcModel] loader ready in ${Math.round(performance.now() - t0)}ms`);

    let fragModel: any = null;
    const cacheKey = `frag::v2::${url}`;

    // Fast path: try IndexedDB-cached Fragments binary first.
    // Wrapped in a 5s timeout so a corrupt cache can't hang the loader.
    try {
      const cachedFrag = await getCachedFrag(cacheKey);
      if (cachedFrag && cachedFrag.byteLength > 1024) {
        const tHydrate = performance.now();
        const loadPromise = fragsManager.core.load(cachedFrag.buffer, { modelId: 'main' });
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('hydrate timeout')), 5000),
        );
        fragModel = await Promise.race([loadPromise, timeout]);
        console.log(`[IfcModel] hydrated from IndexedDB cache (${(cachedFrag.byteLength / 1024 / 1024).toFixed(1)} MB) in ${Math.round(performance.now() - tHydrate)}ms`);
      }
    } catch (e) {
      console.warn('[IfcModel] frag cache hydrate failed, falling back to IFC', e);
      fragModel = null;
      // Drop the bad cache entry.
      try { await putCachedFrag(cacheKey, new Uint8Array(0)); } catch {}
    }

    if (!fragModel) {
      // Slow path: download IFC and parse via web-ifc.
      const tFetch = performance.now();
      const resp = await fetch(url, { cache: 'force-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        throw new Error(`${url} returned HTML (${ct}) — file likely missing on the server`);
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength < 1024) {
        throw new Error(`${url} too small (${buf.byteLength} bytes) — not a valid IFC`);
      }
      const head = new TextDecoder().decode(buf.subarray(0, 16));
      if (!head.startsWith('ISO-10303')) {
        throw new Error(`${url} is not an IFC (header="${head}")`);
      }
      console.log(`[IfcModel] fetched ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB in ${Math.round(performance.now() - tFetch)}ms`);

      const tParse = performance.now();
      fragModel = await loader.load(buf, true, 'main');
      console.log(`[IfcModel] parsed in ${Math.round(performance.now() - tParse)}ms (total ${Math.round(performance.now() - t0)}ms)`);

      // Persist parsed Fragments binary so future loads skip the parse.
      try {
        const exported = await fragModel.getBuffer(false);
        const bytes = exported instanceof Uint8Array ? exported : new Uint8Array(exported);
        if (bytes.byteLength > 1024) {
          await putCachedFrag(cacheKey, bytes);
          console.log(`[IfcModel] cached fragments (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB) to IndexedDB`);
        }
      } catch (e) {
        console.warn('[IfcModel] could not persist fragments cache', e);
      }
    }

    cachedFragModel = fragModel;
    cachedModelId = fragModel?.modelId ?? 'main';
    // Wire shared clipping plane into the FragmentsModel pipeline so the
    // streaming tile materials respect setClipHeight() like the legacy meshes did.
    try {
      fragModel.getClippingPlanesEvent = () => [clipPlane];
    } catch {}

    // FragmentsModel exposes its rendered Object3D via `.object`
    const obj: THREE.Object3D = (fragModel.object ?? fragModel) as THREE.Object3D;
    const group = new THREE.Group();
    group.add(obj);

    group.updateMatrixWorld(true);
    // Note: do NOT compute bbox/scale here — @thatopen streams geometry in
    // tiles, so at parse time fragModel.object has no children yet. The
    // per-frame auto-fit in IfcModel handles scaling once tiles arrive.

    // Apply shared clipping plane + soft shadows to all materials, capture original meshes.
    // NOTE: tiles stream in over time, so this only catches what's already mounted; the
    // FragmentsModel's internal materials honour `getClippingPlanesEvent` instead.
    originalMeshes = [];
    edgeLines = [];
    group.traverse((obj: any) => {
      if (obj.isMesh) {
        originalMeshes.push(obj);
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => {
            const isTransparent = m.opacity < 1;
            m.transparent = isTransparent;
            m.side = isTransparent ? THREE.DoubleSide : THREE.FrontSide;
            m.clippingPlanes = [clipPlane];
            m.clipShadows = true;
            m.polygonOffset = true;
            m.polygonOffsetFactor = 1;
            m.polygonOffsetUnits = 1;
            m.flatShading = false;
            if (m.map) m.map.anisotropy = 8;
            m.needsUpdate = true;
          });
        }
        // Edge generation skipped for streaming Fragments tiles — the geometry
        // is instanced LOD and EdgesGeometry on it produces nothing useful, plus
        // tiles mount/unmount continuously. setEdgesVisible() becomes a no-op.
      }
    });

    // Index categories by IFC type via FragmentsModel.getItemsOfCategories.
    // Done lazily after streaming so the worker has the data ready. Fire and forget.
    (async () => {
      try {
        const allRegexes: RegExp[] = [];
        for (const key of Object.keys(CATEGORY_GROUPS)) {
          allRegexes.push(...CATEGORY_GROUPS[key].types);
        }
        const byCat: Record<string, number[]> = await fragModel.getItemsOfCategories(allRegexes);
        const next: Record<string, number[]> = {};
        const accAll = new Set<number>();
        for (const key of Object.keys(CATEGORY_GROUPS)) {
          const ids: number[] = [];
          for (const [cat, list] of Object.entries(byCat)) {
            if (CATEGORY_GROUPS[key].types.some((re) => re.test(cat))) {
              ids.push(...list);
            }
          }
          next[key] = ids;
          ids.forEach((i) => accAll.add(i));
        }
        categoryIds = next;
        allIfcIds = Array.from(accAll);
        console.log('[IfcModel] categories indexed', Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.length])));
      } catch (e) {
        console.warn('[IfcModel] category indexing failed', e);
        for (const key of Object.keys(CATEGORY_GROUPS)) categoryIds[key] = [];
        allIfcIds = [];
      }
    })();

    cached = group;
    cachedUrl = url;
    return group;
  })();

  // Reset loadingPromise on failure so the next attempt can retry from scratch
  loadingPromise.catch(() => {
    loadingPromise = null;
    loadingUrl = null;
  });

  return loadingPromise;
}

export function IfcModel({
  url = '/bim/ccc-17f.ifc',
  rotationX = 0,
  onLoaded,
  onError,
  onMetrics,
}: {
  url?: string;
  rotationX?: number;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
  /** Called once after model is positioned: provides total Y-height in world units. */
  onMetrics?: (m: { height: number; categoryCounts: Record<string, number> }) => void;
}) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const wrapperRef = useRef<THREE.Group>(null);
  const { camera, controls } = useThree() as any;
  const cameraBoundRef = useRef(false);
  const fittedRef = useRef(false);
  const stableFramesRef = useRef(0);
  const lastBoxSizeRef = useRef(0);

  // Tick the @thatopen Fragments streaming culler every frame so tiles load
  // and the building actually appears. Without this, parsing finishes but
  // FragmentsModel.object stays empty.
  useFrame(() => {
    if (!components || !cachedFragModel) return;
    try {
      const mgr = components.get(OBC.FragmentsManager);
      mgr.core?.update?.();
    } catch {}

    // Apply polygonOffset + explicit clipPlane to streamed Fragment materials
    // to combat z-fighting on coplanar IFC walls (architectural + structural
    // overlap is common). NOTE: do NOT force DoubleSide here — the streamed
    // Fragments already have correct face winding, and forcing DoubleSide on
    // thin walls causes the front/back faces to fight each other at nearly
    // the same depth (visible as stippled noise on white surfaces).
    const wrapperForPatch = wrapperRef.current;
    if (wrapperForPatch) {
      wrapperForPatch.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!(mesh as any).isMesh) return;
        // Disable shadow on streamed tiles — shadow sampling on near-coplanar
        // IFC slabs (architectural + structural overlap) amplifies z-fighting
        // into the shattered triangulated noise visible on floor surfaces.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          // Per-mesh stable jitter on polygonOffsetUnits breaks the depth tie
          // between two perfectly coplanar surfaces. With a single shared
          // offset, both surfaces still fight; with different offsets one
          // wins consistently.
          const jitter = 1 + ((mesh.id & 7));
          if ((m as any).__zPatchVer === 2 && (m as any).polygonOffsetUnits === jitter) continue;
          (m as any).polygonOffset = true;
          (m as any).polygonOffsetFactor = 4;
          (m as any).polygonOffsetUnits = jitter;
          (m as any).clippingPlanes = [clipPlane];
          (m as any).clipShadows = true;
          (m as any).needsUpdate = true;
          (m as any).__zPatchVer = 2;
        }
      });
    }

    // Streaming auto-fit: once the bbox stabilises, rescale + recenter the
    // wrapper and frame the camera. The IFC arrives at real-world scale and
    // origin (often hundreds of meters from 0,0,0) — without this you stare
    // into empty space. After the initial fit we keep watching for any
    // significant bbox growth (e.g. a late floor slab tile) and re-fit.
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const box = new THREE.Box3().setFromObject(wrapper);
    if (!isFinite(box.min.x) || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim <= 0) return;

    if (fittedRef.current) {
      // Already fitted. Watch for >5% bbox growth and re-fit if so.
      const grewRatio = maxDim / Math.max(0.0001, lastBoxSizeRef.current);
      if (grewRatio > 1.05 || grewRatio < 0.95) {
        fittedRef.current = false;
        stableFramesRef.current = 0;
        lastBoxSizeRef.current = maxDim;
        // Reset wrapper transform so next pass measures un-scaled bbox.
        wrapper.scale.setScalar(1);
        wrapper.position.set(0, 0, 0);
        wrapper.updateMatrixWorld(true);
      }
      return;
    }

    if (Math.abs(maxDim - lastBoxSizeRef.current) < 0.01) {
      stableFramesRef.current++;
    } else {
      stableFramesRef.current = 0;
      lastBoxSizeRef.current = maxDim;
    }
    if (stableFramesRef.current < 20) return;

    // Stable bbox — fit it.
    const targetSize = 30;
    const scale = targetSize / maxDim;
    wrapper.scale.setScalar(scale);
    wrapper.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(wrapper);
    const center = scaled.getCenter(new THREE.Vector3());
    wrapper.position.sub(center);
    wrapper.position.y -= scaled.min.y - center.y;
    wrapper.updateMatrixWorld(true);

    const final = new THREE.Box3().setFromObject(wrapper);
    const fSize = final.getSize(new THREE.Vector3());
    const fCenter = final.getCenter(new THREE.Vector3());
    const radius = Math.max(fSize.x, fSize.y, fSize.z) * 0.6 || 30;
    const dir = new THREE.Vector3(1, 0.7, 1).normalize();
    camera.position.copy(fCenter).addScaledVector(dir, radius * 2);
    if (controls?.target) {
      (controls.target as THREE.Vector3).copy(fCenter);
      controls.update?.();
    }
    // Tight near/far for max depth precision (fixes z-fighting on coplanar walls).
    (camera as any).near = Math.max(0.05, radius / 50);
    (camera as any).far = radius * 20;
    (camera as any).updateProjectionMatrix?.();
    fittedRef.current = true;
    // Remember post-fit bbox size so the growth check runs in scaled units.
    lastBoxSizeRef.current = Math.max(fSize.x, fSize.y, fSize.z);
    console.log('[IfcModel] fitted to bbox', { size: fSize.toArray(), center: fCenter.toArray() });
  });

  useEffect(() => {
    let cancelled = false;
    // On (re)mount: reset cross-mount UI state. Module globals like `isolated`
    // survive React unmounts; without this reset, reopening the viewer with
    // a stale isolate selection leaves the building partially hidden.
    if (cached && cachedFragModel && isolated) {
      try { showAll(); } catch {}
    }
    loadIfc(url)
      .then((g) => {
        if (cancelled) return;
        // Bind the R3F camera to the streaming culler so tiles get fetched.
        if (cachedFragModel && !cameraBoundRef.current) {
          try {
            cachedFragModel.useCamera?.(camera as any);
            cameraBoundRef.current = true;
          } catch (e) {
            console.warn('[IfcModel] useCamera failed', e);
          }
        }
        setGroup(g);
        onLoaded?.();
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('[IfcModel] load failed:', err);
        setError(err);
        onError?.(err);
      });
    return () => {
      cancelled = true;
      // The cached FragmentsModel + meshes are tied to this Canvas's WebGL
      // context. When the user navigates away, the renderer is destroyed
      // and the GPU buffers become invalid — leaving them in the module
      // cache makes the next mount crash with "byteLength of undefined" in
      // three.js render. Dispose everything so the next mount loads clean.
      try { disposeCachedModel(); } catch {}
      cameraBoundRef.current = false;
      fittedRef.current = false;
      stableFramesRef.current = 0;
      lastBoxSizeRef.current = 0;
    };
  }, [url]);

  // Re-center every time rotation changes; expose height via onMetrics.
  // Skipped on initial mount because the streaming bbox is empty until tiles
  // arrive — the per-frame auto-fit handles that.
  useEffect(() => {
    if (!group || !wrapperRef.current) return;
    if (!fittedRef.current) return;
    const wrapper = wrapperRef.current;
    wrapper.rotation.set(rotationX, 0, 0);
    wrapper.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(wrapper);
    if (!isFinite(finalBox.min.x) || finalBox.isEmpty()) return;
    const height = finalBox.max.y - finalBox.min.y;
    if (!initialClipApplied) {
      setClipHeight(height + 0.5);
      initialClipApplied = true;
    }
    onMetrics?.({
      height,
      categoryCounts: Object.fromEntries(Object.entries(categoryIds).map(([k, v]) => [k, v.length])),
    });
  }, [group, rotationX]);

  if (error || !group) return null;
  return (
    <group ref={wrapperRef}>
      <primitive object={group} />
    </group>
  );
}
