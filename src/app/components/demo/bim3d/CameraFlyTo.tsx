import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Smoothly moves the camera to focus on a world-space target.
export function CameraFlyTo({ target, enabled }: { target: [number, number, number] | null; enabled: boolean }) {
  const { camera, controls } = useThree() as { camera: THREE.PerspectiveCamera; controls: any };

  useEffect(() => {
    if (!target || !enabled) return;
    const [tx, ty, tz] = target;
    const from = camera.position.clone();
    const lookFrom = controls?.target?.clone() ?? new THREE.Vector3(0, 0, 0);

    // Place camera on an arc 8m out + 6m up
    const offset = new THREE.Vector3(tx + 8, ty + 6, tz + 8);
    const toTarget = new THREE.Vector3(tx, ty, tz);

    let raf = 0;
    const start = performance.now();
    const dur = 900;

    const step = () => {
      const now = performance.now();
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      camera.position.lerpVectors(from, offset, ease);
      if (controls?.target) {
        controls.target.lerpVectors(lookFrom, toTarget, ease);
        controls.update?.();
      }
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, camera, controls]);

  return null;
}
