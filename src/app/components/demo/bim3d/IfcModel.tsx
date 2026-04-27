import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import {
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCROOF, IFCWINDOW, IFCDOOR,
  IFCSTAIR, IFCSTAIRFLIGHT, IFCRAILING, IFCCOLUMN, IFCBEAM,
  IFCFURNISHINGELEMENT, IFCSPACE, IFCCOVERING,
  IFCFLOWSEGMENT, IFCFLOWFITTING, IFCFLOWTERMINAL, IFCDISTRIBUTIONELEMENT,
  IFCBUILDINGELEMENTPROXY, IFCPLATE, IFCMEMBER, IFCCURTAINWALL,
} from 'web-ifc';

// Module-level cache (single model, keyed by URL)
let cached: THREE.Group | null = null;
let cachedUrl: string | null = null;
let cachedLoader: any = null;
let cachedModelID: number | null = null;
let loadingPromise: Promise<THREE.Group> | null = null;
let loadingUrl: string | null = null;
let originalMeshes: THREE.Mesh[] = [];
let edgeLines: THREE.LineSegments[] = [];
let edgesEnabled = true;
let allIfcIds: number[] = [];
let isolated = false;
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
  if (cachedLoader && cachedModelID !== null) {
    try { cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE); } catch {}
    try { cachedLoader.ifcManager.removeSubset(cachedModelID, HIGHLIGHT_MAT, SUBSET_HIGHLIGHT); } catch {}
    try { cachedLoader.ifcManager.removeSubset(cachedModelID, GHOST_MAT, SUBSET_GHOST); } catch {}
    try { cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_ISOLATE); } catch {}
    try { cachedLoader.ifcManager.dispose?.(); } catch {}
  }
  originalMeshes.forEach((m) => {
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mt: any) => mt?.dispose?.());
  });
  originalMeshes = [];
  allIfcIds = [];
  categoryIds = {};
  cachedSpatialFlat = null;
  cached = null;
  cachedUrl = null;
  cachedLoader = null;
  cachedModelID = null;
  initialClipApplied = false;
  isolated = false;
}

export function setEdgesVisible(on: boolean) {
  edgesEnabled = on;
  edgeLines.forEach((l) => { l.visible = on; });
}

export function getModelGroup(): THREE.Group | null {
  return cached;
}

export function getExpressIdBoundingBox(expressId: number): THREE.Box3 | null {
  if (!cached || !cachedLoader || cachedModelID === null) return null;
  try {
    const subset = cachedLoader.ifcManager.createSubset({
      modelID: cachedModelID,
      ids: [expressId],
      scene: cached,
      removePrevious: true,
      customID: '__bbox-tmp',
    });
    const box = new THREE.Box3().setFromObject(subset);
    cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, '__bbox-tmp');
    return box;
  } catch {
    return null;
  }
}

// Categories (display name → IFC type IDs grouped together)
export const CATEGORY_GROUPS: Record<string, { label: string; types: number[]; color?: string }> = {
  walls:     { label: 'Walls',     types: [IFCWALL, IFCWALLSTANDARDCASE, IFCCURTAINWALL, IFCMEMBER, IFCPLATE], color: '#94a3b8' },
  slabs:     { label: 'Floors',    types: [IFCSLAB, IFCCOVERING],          color: '#cbd5e1' },
  roof:      { label: 'Roof',      types: [IFCROOF],                       color: '#fbbf24' },
  doors:     { label: 'Doors',     types: [IFCDOOR],                       color: '#a78bfa' },
  windows:   { label: 'Windows',   types: [IFCWINDOW],                     color: '#7dd3fc' },
  stairs:    { label: 'Stairs',    types: [IFCSTAIR, IFCSTAIRFLIGHT, IFCRAILING], color: '#fb923c' },
  structure: { label: 'Structure', types: [IFCCOLUMN, IFCBEAM],            color: '#64748b' },
  furniture: { label: 'Furniture', types: [IFCFURNISHINGELEMENT],          color: '#34d399' },
  mep:       { label: 'MEP',       types: [IFCFLOWSEGMENT, IFCFLOWFITTING, IFCFLOWTERMINAL, IFCDISTRIBUTIONELEMENT], color: '#22d3ee' },
  spaces:    { label: 'Spaces',    types: [IFCSPACE],                      color: '#facc15' },
  other:     { label: 'Other',     types: [IFCBUILDINGELEMENTPROXY],       color: '#f472b6' },
};

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

const HIGHLIGHT_MAT = new THREE.MeshBasicMaterial({
  color: 0xfbbf24, depthTest: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
});
HIGHLIGHT_MAT.clippingPlanes = [clipPlane];

const GHOST_MAT = new THREE.MeshLambertMaterial({
  color: 0x94a3b8,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  side: THREE.DoubleSide,
});
GHOST_MAT.clippingPlanes = [clipPlane];

const SUBSET_VISIBLE = 'visible-cats';
const SUBSET_HIGHLIGHT = 'highlight-pick';
const SUBSET_GHOST = 'ghost-all';
const SUBSET_ISOLATE = 'isolated';

function patchSubsetMaterials(mesh: THREE.Object3D | undefined) {
  if (!mesh) return;
  mesh.traverse((obj: any) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: any) => {
        m.clippingPlanes = [clipPlane];
        m.clipShadows = true;
        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 1;
        m.needsUpdate = true;
      });
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

export async function setVisibleCategories(active: Set<string>) {
  if (!cachedLoader || cachedModelID === null || !cached) return;
  const allActive = active.size === Object.keys(CATEGORY_GROUPS).length;

  if (allActive) {
    originalMeshes.forEach((m) => { m.visible = true; });
    cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE);
    return;
  }

  // Hide each original mesh individually (so subset which is a child of `cached` stays visible)
  originalMeshes.forEach((m) => { m.visible = false; });

  const ids: number[] = [];
  active.forEach((cat) => {
    const list = categoryIds[cat];
    if (list) ids.push(...list);
  });

  cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE);
  if (ids.length === 0) return;

  const subset = cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids,
    scene: cached, // parent = the IFC group itself → inherits all wrapper transforms
    removePrevious: true,
    customID: SUBSET_VISIBLE,
  });
  patchSubsetMaterials(subset);
}

export function highlightExpressId(expressId: number | null) {
  if (!cachedLoader || cachedModelID === null || !cached) return;
  cachedLoader.ifcManager.removeSubset(cachedModelID, HIGHLIGHT_MAT, SUBSET_HIGHLIGHT);
  if (expressId == null) return;
  cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids: [expressId],
    scene: cached, // parent = IFC group → inherits transforms
    removePrevious: true,
    material: HIGHLIGHT_MAT,
    customID: SUBSET_HIGHLIGHT,
  });
}

/** Ghost mode: dim everything to translucent grey so highlighted/picked element pops. */
export function setGhostMode(on: boolean) {
  if (!cachedLoader || cachedModelID === null || !cached) return;
  cachedLoader.ifcManager.removeSubset(cachedModelID, GHOST_MAT, SUBSET_GHOST);
  if (!on || allIfcIds.length === 0 || isolated) {
    if (!isolated) originalMeshes.forEach((m) => { m.visible = true; });
    return;
  }
  originalMeshes.forEach((m) => { m.visible = false; });
  cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids: allIfcIds,
    scene: cached,
    removePrevious: true,
    material: GHOST_MAT,
    customID: SUBSET_GHOST,
  });
}

/** True isolate: hide everything except the given expressIds. */
export function isolateExpressIds(ids: number[] | null) {
  if (!cachedLoader || cachedModelID === null || !cached) return;
  cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_ISOLATE);
  cachedLoader.ifcManager.removeSubset(cachedModelID, GHOST_MAT, SUBSET_GHOST);
  if (!ids || ids.length === 0) {
    isolated = false;
    originalMeshes.forEach((m) => { m.visible = true; });
    return;
  }
  isolated = true;
  originalMeshes.forEach((m) => { m.visible = false; });
  const subset = cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids,
    scene: cached,
    removePrevious: true,
    customID: SUBSET_ISOLATE,
  });
  patchSubsetMaterials(subset);
}

/** Restore everything: clears isolate, ghost, highlight, category subset; shows all originals. */
export function showAll() {
  if (!cachedLoader || cachedModelID === null || !cached) return;
  cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_ISOLATE);
  cachedLoader.ifcManager.removeSubset(cachedModelID, GHOST_MAT, SUBSET_GHOST);
  cachedLoader.ifcManager.removeSubset(cachedModelID, HIGHLIGHT_MAT, SUBSET_HIGHLIGHT);
  cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE);
  isolated = false;
  originalMeshes.forEach((m) => { m.visible = true; });
}

/** Look up the IFC ExpressID + property name for a Three.js intersection on the IFC model. */
export async function getIfcInfoFromIntersection(intersection: THREE.Intersection): Promise<{
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
} | null> {
  if (!cachedLoader || cachedModelID === null) return null;
  const faceIndex = intersection.faceIndex;
  const geometry = (intersection.object as THREE.Mesh).geometry;
  if (faceIndex == null || !geometry) return null;
  try {
    const expressId = cachedLoader.ifcManager.getExpressId(geometry, faceIndex);
    const props: any = await cachedLoader.ifcManager.getItemProperties(cachedModelID, expressId, false);
    const ifcType = (await cachedLoader.ifcManager.getIfcType(cachedModelID, expressId)) || 'unknown';
    const name = props?.Name?.value ?? props?.LongName?.value ?? null;
    let storey: string | null = null;
    try {
      if (!cachedSpatialFlat) {
        // Build flat expressId → storey lookup once (heavy call, do it lazily on first pick)
        const struct = await cachedLoader.ifcManager.getSpatialStructure(cachedModelID, false);
        const flat = new Map<number, string | null>();
        const walk = (node: any, currentStorey: string | null) => {
          const ns = node.type === 'IFCBUILDINGSTOREY'
            ? (node.Name?.value ?? `Storey ${node.expressID}`)
            : currentStorey;
          flat.set(node.expressID, ns);
          for (const c of node.children ?? []) walk(c, ns);
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

async function loadIfc(url: string): Promise<THREE.Group> {
  if (cached && cachedUrl === url) return cached;
  if (loadingPromise && loadingUrl === url) return loadingPromise;

  // URL changed → drop the previous model and start fresh
  if (cached || cachedUrl) disposeCachedModel();

  loadingUrl = url;
  loadingPromise = (async () => {
    console.log('[IfcModel] loading', url);
    const t0 = performance.now();
    const loader = new IFCLoader();
    await loader.ifcManager.setWasmPath('/wasm/');
    // Tune web-ifc for large models (48MB+ IFC files OOM with defaults).
    try {
      loader.ifcManager.applyWebIfcConfig({
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
        OPTIMIZE_PROFILES: true,
        // Higher initial WASM heap so big buildings don't crash on parse.
        MEMORY_LIMIT: 2 * 1024 * 1024 * 1024,
      } as any);
    } catch (e) {
      console.warn('[IfcModel] applyWebIfcConfig failed', e);
    }

    const model: any = await new Promise((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (p) => {
          if (p.lengthComputable) {
            const pct = Math.round((p.loaded / p.total) * 100);
            if (pct % 20 === 0) console.log(`[IfcModel] download ${pct}%`);
          }
        },
        (err: any) => {
          console.error('[IfcModel] load failed url=', url, 'err=', err);
          reject(err);
        },
      );
    });

    console.log(`[IfcModel] parsed in ${Math.round(performance.now() - t0)}ms`);
    const group: THREE.Group = model;
    cachedLoader = loader;
    cachedModelID = (model as any).modelID ?? 0;

    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 30;
      const scale = targetSize / maxDim;
      group.scale.setScalar(scale);
    }

    // Apply shared clipping plane + soft shadows to all materials, capture original meshes
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
        // Generate crisp edge lines (Autodesk-style outline) per mesh
        try {
          const edgeGeo = new THREE.EdgesGeometry(obj.geometry, 30);
          const edgeMat = new THREE.LineBasicMaterial({
            color: 0x1e293b,
            transparent: true,
            opacity: 0.55,
            clippingPlanes: [clipPlane],
          });
          const lines = new THREE.LineSegments(edgeGeo, edgeMat);
          lines.visible = edgesEnabled;
          obj.add(lines);
          edgeLines.push(lines);
        } catch (e) {
          console.warn('[IfcModel] edge generation failed for mesh', obj.name, e);
        }
      }
    });

    // Index categories by IFC type
    for (const [key, group_] of Object.entries(CATEGORY_GROUPS)) {
      const ids: number[] = [];
      for (const t of group_.types) {
        try {
          const list = await loader.ifcManager.getAllItemsOfType(cachedModelID!, t, false);
          ids.push(...list);
        } catch {}
      }
      categoryIds[key] = ids;
    }
    allIfcIds = Array.from(new Set(Object.values(categoryIds).flat()));
    console.log('[IfcModel] indexed categories:', Object.fromEntries(
      Object.entries(categoryIds).map(([k, v]) => [k, v.length])
    ));

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

  useEffect(() => {
    let cancelled = false;
    // On (re)mount: reset cross-mount UI state. Module globals like `isolated`
    // survive React unmounts; without this reset, reopening the viewer with
    // a stale isolate selection leaves the building partially hidden.
    if (cached && cachedLoader && cachedModelID !== null && isolated) {
      try { showAll(); } catch {}
    }
    loadIfc(url)
      .then((g) => {
        if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [url]);

  // Re-center every time rotation changes; expose height via onMetrics
  useEffect(() => {
    if (!group || !wrapperRef.current) return;
    const wrapper = wrapperRef.current;
    wrapper.rotation.set(rotationX, 0, 0);
    wrapper.position.set(0, 0, 0);
    wrapper.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrapper);
    const center = box.getCenter(new THREE.Vector3());
    wrapper.position.x -= center.x;
    wrapper.position.z -= center.z;
    wrapper.position.y -= box.min.y;
    wrapper.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(wrapper);
    const height = finalBox.max.y - finalBox.min.y;
    // Only set the clip on first load — don't clobber user-driven slider on subsequent rotations
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
