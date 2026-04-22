import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

let cached: THREE.Group | null = null;
let loadingPromise: Promise<THREE.Group> | null = null;

async function loadIfc(url: string): Promise<THREE.Group> {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const loader = new IFCLoader();
    await loader.ifcManager.setWasmPath('/wasm/');

    const model: any = await new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    const group: THREE.Group = model;

    // Revit IFC default orientation: Z-up. Three.js is Y-up.
    group.rotation.x = -Math.PI / 2;

    // Compute bounding box AFTER rotation by updating world matrix
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Center horizontally, sit on floor (y=0)
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= box.min.y;

    // Normalize scale so longest horizontal dim ≈ 30 units (matches mock building scale)
    const maxHoriz = Math.max(size.x, size.z);
    if (maxHoriz > 0) {
      const targetSize = 30;
      const scale = targetSize / maxHoriz;
      group.scale.setScalar(scale);
      group.position.multiplyScalar(scale);
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
  onLoaded,
  onError,
}: {
  url?: string;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
}) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<Error | null>(null);

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

  if (error || !group) return null;
  return <primitive object={group} />;
}
