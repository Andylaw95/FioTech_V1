import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { getModelGroup, getIfcInfoFromIntersection, pickFragmentsAtMouse } from './IfcModel';
import type { PickedInfo } from './PickedElementCard';

/**
 * Reliable picker that bypasses r3f's event system.
 * - Listens for pointerdown/up on the Canvas DOM element
 * - Distinguishes click from drag (5px threshold)
 * - Delegates the actual hit-test to the @thatopen FragmentsManager raycaster
 *   (which understands streaming LOD tiles), then surfaces a synthetic
 *   THREE.Intersection so the existing pick-info plumbing keeps working.
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
      if (!getModelGroup()) return;
      const mouse = new THREE.Vector2(e.clientX, e.clientY);
      const hit = await pickFragmentsAtMouse(
        camera as THREE.PerspectiveCamera | THREE.OrthographicCamera,
        mouse,
        dom as HTMLCanvasElement,
      );
      if (!hit) {
        console.log('[PickerOverlay] no IFC hit');
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
