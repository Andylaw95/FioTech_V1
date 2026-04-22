import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { getModelGroup, getIfcInfoFromIntersection } from './IfcModel';
import type { PickedInfo } from './PickedElementCard';

/**
 * Reliable picker that bypasses r3f's event system.
 * - Listens for pointerdown/up on the Canvas DOM element
 * - Distinguishes click from drag (5px threshold)
 * - Manually raycasts against the IFC model group
 *
 * This avoids issues where IFCMesh children don't bubble r3f events
 * cleanly to wrapper groups, and where OrbitControls' tiny drags
 * suppress the click event.
 */
export function PickerOverlay({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (info: PickedInfo) => void;
}) {
  const { gl, camera } = useThree();

  useEffect(() => {
    if (!enabled) return;
    const dom = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downT = 0;

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    };

    const onUp = async (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.hypot(dx, dy) > 5) return; // drag, not click
      if (performance.now() - downT > 600) return; // too slow
      const grp = getModelGroup();
      if (!grp) return;
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(grp, true);
      // Only consider Mesh hits with valid IFC geometry; skip edge LineSegments
      const hit = hits.find((h) => {
        const obj = h.object as any;
        if (!obj?.isMesh) return false;
        if (h.faceIndex == null) return false;
        const geom = obj.geometry;
        // IFC subset meshes have an `expressID` attribute; edge meshes don't
        if (!geom?.attributes?.expressID && !geom?.index) return false;
        return true;
      });
      if (!hit) {
        console.log('[PickerOverlay] no IFC hit', { hitCount: hits.length });
        return;
      }
      let info;
      try {
        info = await getIfcInfoFromIntersection(hit);
      } catch (err) {
        console.warn('[PickerOverlay] getInfo threw', err);
        return;
      }
      if (info) {
        onPick({ ...info, point: hit.point.clone() });
      } else {
        console.log('[PickerOverlay] hit but no IFC info', hit);
      }
    };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.style.cursor = 'crosshair';
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      dom.style.cursor = '';
    };
  }, [enabled, gl, camera, onPick]);

  return null;
}
