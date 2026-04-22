import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

let cached: THREE.Group | null = null;
let cachedLoader: any = null;
let cachedModelID: number | null = null;
let loadingPromise: Promise<THREE.Group> | null = null;

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

    // No rotation here — applied at render time so it can be tweaked live.
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 30;
      const scale = targetSize / maxDim;
      group.scale.setScalar(scale);
    }

    // Soft shadows + cleaner materials
    group.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => {
            m.transparent = m.opacity < 1;
            m.side = THREE.DoubleSide;
          });
        }
      }
    });

    cached = group;
    return group;
  })();

  return loadingPromise;
}

export function IfcModel({
  url = '/bim/ccc-17f.ifc',
  rotationX = -Math.PI / 2,
  onLoaded,
  onError,
}: {
  url?: string;
  rotationX?: number;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
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
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Re-center every time rotation changes so the model stays visible + on the floor
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
  }, [group, rotationX]);

  if (error || !group) return null;
  return (
    <group ref={wrapperRef}>
      <primitive object={group} />
    </group>
  );
}
