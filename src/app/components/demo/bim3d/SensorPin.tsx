import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Sensor, Severity, severityColor, severityGlow } from './mockData';

interface Props {
  sensor: Sensor;
  severity: Severity;
  selected: boolean;
  onClick: (id: string) => void;
  showLabel?: boolean;
}

export function SensorPin({ sensor, severity, selected, onClick, showLabel = true }: Props) {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ringRef.current) {
      const scale = 1 + Math.sin(t * (severity === 'critical' ? 5 : 2.5)) * 0.3;
      ringRef.current.scale.set(scale, scale, scale);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + Math.sin(t * 3) * 0.15;
    }
    if (coreRef.current && selected) {
      coreRef.current.position.y = sensor.y + Math.sin(t * 3) * 0.08;
    }
  });

  const color = severityColor(severity);
  const intensity = severityGlow(severity);

  return (
    <group position={[sensor.x, sensor.y, sensor.z]} onClick={(e) => { e.stopPropagation(); onClick(sensor.id); }}>
      {/* Vertical stem */}
      <mesh position={[0, -sensor.y / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, sensor.y, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
      {/* Core sphere */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
      </mesh>
      {/* Pulse ring (only for non-normal) */}
      {severity !== 'normal' && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.55, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Outer selected halo */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.8, 32]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* HTML label */}
      {showLabel && (
        <Html distanceFactor={12} position={[0, 0.6, 0]} center zIndexRange={[10, 0]}>
          <div style={{
            padding: '2px 8px',
            background: 'rgba(15,23,42,0.85)',
            color: '#fff',
            fontSize: 11,
            borderRadius: 4,
            border: `1px solid ${color}`,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontFamily: 'system-ui, sans-serif',
            fontWeight: 600,
          }}>
            {sensor.type}
          </div>
        </Html>
      )}
    </group>
  );
}
