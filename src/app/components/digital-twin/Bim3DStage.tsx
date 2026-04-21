import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';
import { Building } from '@/app/components/demo/bim3d/Building';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { MOCK_SENSORS, Severity } from '@/app/components/demo/bim3d/mockData';

interface Bim3DStageProps {
  showStructure?: boolean;
  showDevices?: boolean;
  selectedDeviceId?: string | null;
  onSelectDevice?: (id: string) => void;
  onDeselect?: () => void;
  /** Zoom level (BIMTwins passes its existing zoom state; 1 = default, >1 = closer, <1 = farther). */
  zoom?: number;
}

/** Drives camera distance only when the external `zoom` prop changes; otherwise leaves OrbitControls (mouse wheel) alone. */
function ZoomDriver({ zoom }: { zoom: number }) {
  const { camera, controls } = useThree() as any;
  const lastZoom = useRef(zoom);
  const animating = useRef(false);
  useEffect(() => {
    if (zoom !== lastZoom.current) {
      lastZoom.current = zoom;
      animating.current = true;
    }
  }, [zoom]);
  useFrame(() => {
    if (!controls || !animating.current) return;
    const target = controls.target as THREE.Vector3;
    const dir = new THREE.Vector3().subVectors(camera.position, target);
    const currentDist = dir.length();
    const desiredDist = THREE.MathUtils.clamp(32 / Math.max(zoom, 0.1), 10, 55);
    if (Math.abs(currentDist - desiredDist) < 0.05) {
      animating.current = false;
      return;
    }
    const newDist = THREE.MathUtils.lerp(currentDist, desiredDist, 0.15);
    dir.setLength(newDist);
    camera.position.copy(target).add(dir);
    controls.update?.();
  });
  return null;
}

/** Animates the building in from below with a soft ease-out on first mount. */
function IntroGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  useFrame((state) => {
    if (!ref.current) return;
    if (t0.current === null) t0.current = state.clock.elapsedTime;
    const t = Math.min((state.clock.elapsedTime - t0.current) / 1.4, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    ref.current.position.y = THREE.MathUtils.lerp(-4, 0, eased);
    ref.current.scale.setScalar(THREE.MathUtils.lerp(0.6, 1, eased));
    const mat = ref.current as any;
    mat.__opacity = eased;
  });
  return <group ref={ref}>{children}</group>;
}

export function Bim3DStage({
  showStructure = true,
  showDevices = true,
  selectedDeviceId,
  onSelectDevice,
  onDeselect,
  zoom = 1,
}: Bim3DStageProps) {
  const [userInteracting, setUserInteracting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const handleStart = () => {
    setUserInteracting(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };
  const handleEnd = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setUserInteracting(false), 2500);
  };

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      className="absolute inset-0"
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ background: 'transparent' }}
      onPointerMissed={onDeselect}
    >
      <fog attach="fog" args={['#e0ecfa', 35, 90]} />

      <PerspectiveCamera makeDefault position={[22, 16, 24]} fov={40} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={55}
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={Math.PI / 6}
        target={[0, 1.5, 0]}
        autoRotate={!userInteracting}
        autoRotateSpeed={0.45}
        onStart={handleStart}
        onEnd={handleEnd}
      />

      {/* Key + fill + rim lighting for readable volumes */}
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[14, 22, 10]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-15, 12, -10]} intensity={0.4} color="#7dd3fc" />
      <hemisphereLight args={['#bfdbfe', '#1e293b', 0.55]} />

      <Grid
        args={[80, 80]}
        position={[0, -0.02, 0]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#cbd5e1"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#0891b2"
        fadeDistance={55}
        fadeStrength={1.2}
        infiniteGrid
      />

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.55}
        scale={50}
        blur={2.4}
        far={10}
        resolution={1024}
        color="#0f172a"
      />

      <Suspense fallback={null}>
        <ZoomDriver zoom={zoom} />
        <IntroGroup>
          <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.15}>
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
          </Float>
        </IntroGroup>
      </Suspense>
    </Canvas>
  );
}

