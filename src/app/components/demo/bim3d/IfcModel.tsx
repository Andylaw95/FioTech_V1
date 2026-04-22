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

// Module-level cache (single model)
let cached: THREE.Group | null = null;
let cachedLoader: any = null;
let cachedModelID: number | null = null;
let cachedScene: THREE.Scene | null = null;
let loadingPromise: Promise<THREE.Group> | null = null;

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

const SUBSET_VISIBLE = 'visible-cats';
const SUBSET_HIGHLIGHT = 'highlight-pick';

export async function setVisibleCategories(active: Set<string>) {
  if (!cachedLoader || cachedModelID === null || !cachedScene || !cached) return;
  const allActive = active.size === Object.keys(CATEGORY_GROUPS).length;

  if (allActive) {
    // Show full model, drop subset
    cached.visible = true;
    cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE);
    return;
  }

  cached.visible = false;
  const ids: number[] = [];
  active.forEach((cat) => {
    const list = categoryIds[cat];
    if (list) ids.push(...list);
  });

  cachedLoader.ifcManager.removeSubset(cachedModelID, undefined, SUBSET_VISIBLE);
  if (ids.length === 0) return;

  cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids,
    scene: cachedScene,
    removePrevious: true,
    customID: SUBSET_VISIBLE,
  });
}

export function highlightExpressId(expressId: number | null) {
  if (!cachedLoader || cachedModelID === null || !cachedScene) return;
  cachedLoader.ifcManager.removeSubset(cachedModelID, HIGHLIGHT_MAT, SUBSET_HIGHLIGHT);
  if (expressId == null) return;
  cachedLoader.ifcManager.createSubset({
    modelID: cachedModelID,
    ids: [expressId],
    scene: cachedScene,
    removePrevious: true,
    material: HIGHLIGHT_MAT,
    customID: SUBSET_HIGHLIGHT,
  });
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
    const props: any = await cachedLoader.ifcManager.getItemProperties(cachedModelID, expressId, true);
    const ifcType = (await cachedLoader.ifcManager.getIfcType(cachedModelID, expressId)) || 'unknown';
    const name = props?.Name?.value ?? props?.LongName?.value ?? null;
    let storey: string | null = null;
    try {
      const struct = await cachedLoader.ifcManager.getSpatialStructure(cachedModelID, true);
      const findStorey = (node: any, eid: number, currentStorey: string | null): string | null => {
        if (node.expressID === eid) return currentStorey;
        const ns = node.type === 'IFCBUILDINGSTOREY' ? (node.Name?.value ?? `Storey ${node.expressID}`) : currentStorey;
        for (const c of node.children ?? []) {
          const r = findStorey(c, eid, ns);
          if (r) return r;
        }
        return null;
      };
      storey = findStorey(struct, expressId, null);
    } catch {}
    return { expressId, ifcType, name, storey };
  } catch (e) {
    console.warn('[IfcModel] getInfo failed', e);
    return null;
  }
}

async function loadIfc(url: string): Promise<THREE.Group> {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log('[IfcModel] loading', url);
    const t0 = performance.now();
    const loader = new IFCLoader();
    await loader.ifcManager.setWasmPath('/wasm/');

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
        reject,
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

    // Apply shared clipping plane + soft shadows to all materials
    group.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => {
            m.transparent = m.opacity < 1;
            m.side = THREE.DoubleSide;
            m.clippingPlanes = [clipPlane];
            m.clipShadows = true;
            m.needsUpdate = true;
          });
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
    console.log('[IfcModel] indexed categories:', Object.fromEntries(
      Object.entries(categoryIds).map(([k, v]) => [k, v.length])
    ));

    cached = group;
    return group;
  })();

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
    cachedScene = wrapper.parent as THREE.Scene | null;
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
    // Reset clip to top so nothing is hidden initially
    setClipHeight(height + 0.5);
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
