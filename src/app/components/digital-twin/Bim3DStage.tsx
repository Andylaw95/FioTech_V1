import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { Building } from '@/app/components/demo/bim3d/Building';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { MOCK_SENSORS, Severity } from '@/app/components/demo/bim3d/mockData';

interface Bim3DStageProps {
  showStructure?: boolean;
  showDevices?: boolean;
  selectedDeviceId?: string | null;
  onSelectDevice?: (id: string) => void;
  onDeselect?: () => void;
}

export function Bim3DStage({
  showStructure = true,
  showDevices = true,
  selectedDeviceId,
  onSelectDevice,
  onDeselect,
}: Bim3DStageProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      className="absolute inset-0"
      style={{ background: 'transparent' }}
      onPointerMissed={onDeselect}
    >
      <PerspectiveCamera makeDefault position={[20, 18, 22]} fov={45} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 1.5, 0]}
      />

      <ambientLight intensity={0.65} />
      <directionalLight
        position={[15, 20, 10]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#60a5fa', '#e2e8f0', 0.5]} />

      <Grid
        args={[60, 60]}
        position={[0, -0.03, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#cbd5e1"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#0891b2"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid
      />

      <Suspense fallback={null}>
        {showStructure && (
          <Building selectedRoomId={null} onRoomClick={() => {}} wallsVisible={true} />
        )}

        {showDevices && MOCK_SENSORS.map(sensor => (
          <SensorPin
            key={sensor.id}
            sensor={sensor}
            severity={'normal' as Severity}
            selected={selectedDeviceId === sensor.id}
            onClick={(id) => onSelectDevice?.(id)}
          />
        ))}
      </Suspense>
    </Canvas>
  );
}
