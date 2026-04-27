import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { getModelGroup } from './IfcModel';

/**
 * Captures the next click on the IFC model and reports the world-space point.
 * Used to reposition sensor pins. Bypasses r3f event system for reliability.
 */
export function SensorPlacementOverlay({
  enabled,
  onPlace,
  onCancel,
}: {
  enabled: boolean;
  onPlace: (point: THREE.Vector3) => void;
  onCancel?: () => void;
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

    const onUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.hypot(dx, dy) > 5) return;
      if (performance.now() - downT > 600) return;
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
      const hit = hits.find((h) => (h.object as any)?.isMesh && h.faceIndex != null);
      if (!hit) return;
      // Lift the pin a touch above the surface so it's visible
      const p = hit.point.clone();
      p.y += 0.4;
      onPlace(p);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.();
    };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    dom.style.cursor = 'crosshair';
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      dom.style.cursor = '';
    };
  }, [enabled, gl, camera, onPlace, onCancel]);

  return null;
}
