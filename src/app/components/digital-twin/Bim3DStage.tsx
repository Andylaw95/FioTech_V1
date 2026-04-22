import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';
import { Building } from '@/app/components/demo/bim3d/Building';
import { IfcModel, getIfcInfoFromIntersection } from '@/app/components/demo/bim3d/IfcModel';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { MOCK_SENSORS, Severity } from '@/app/components/demo/bim3d/mockData';

interface PickedInfo {
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
  point: { x: number; y: number; z: number };
}

/** Tries to load real IFC; falls back to procedural Building if it fails. */
function BuildingShell({
  wallsVisible,
  onStatus,
  pickMode,
  onPick,
  rotationX,
}: {
  wallsVisible: boolean;
  onStatus: (s: 'loading' | 'ready' | 'failed', msg?: string) => void;
  pickMode: boolean;
  onPick: (info: PickedInfo) => void;
  rotationX: number;
}) {
  const [ifcFailed, setIfcFailed] = useState(false);
  if (ifcFailed) {
    return <Building selectedRoomId={null} onRoomClick={() => {}} wallsVisible={wallsVisible} />;
  }
  return (
    <group
      onClick={async (e) => {
        if (!pickMode) return;
        e.stopPropagation();
        const info = await getIfcInfoFromIntersection(e.intersections[0]);
        if (info) {
          onPick({
            ...info,
            point: { x: e.point.x, y: e.point.y, z: e.point.z },
          });
        }
      }}
    >
      <IfcModel
        rotationX={rotationX}
        onLoaded={() => onStatus('ready')}
        onError={(e) => {
          onStatus('failed', e.message);
          setIfcFailed(true);
        }}
      />
    </group>
  );
}

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
  const [ifcStatus, setIfcStatus] = useState<{ state: 'loading' | 'ready' | 'failed'; msg?: string }>({ state: 'loading' });
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<PickedInfo | null>(null);
  const [rotationPreset, setRotationPreset] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ROTATION_MAP: Record<typeof rotationPreset, number> = {
    A: -Math.PI / 2,  // standard Z-up → Y-up
    B:  Math.PI / 2,  // flipped
    C:  Math.PI,      // 180°
    D:  0,            // none
  };
  const rotationX = ROTATION_MAP[rotationPreset];

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
    <div className="absolute inset-0">
      {ifcStatus.state !== 'ready' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-md bg-slate-900/85 text-white text-xs font-medium shadow-lg backdrop-blur-sm pointer-events-none">
          {ifcStatus.state === 'loading' && '⏳ Loading CCC 17F BIM model (46 MB)…'}
          {ifcStatus.state === 'failed' && `⚠️ IFC failed (${ifcStatus.msg ?? 'unknown'}) — using fallback`}
        </div>
      )}

      {ifcStatus.state === 'ready' && (
        <>
          <button
            onClick={() => { setPickMode(p => !p); if (pickMode) setPicked(null); }}
            className={`absolute top-3 right-3 z-10 px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg backdrop-blur-sm transition ${
              pickMode
                ? 'bg-amber-500 text-slate-900 ring-2 ring-amber-300'
                : 'bg-slate-900/85 text-white hover:bg-slate-800'
            }`}
          >
            {pickMode ? '🎯 Pick Mode ON — click any element' : '🎯 Pick Mode'}
          </button>

          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-slate-900/85 text-white text-xs rounded-md shadow-lg backdrop-blur-sm px-2 py-1">
            <span className="text-white/60 mr-1">Orient:</span>
            {(['A', 'B', 'C', 'D'] as const).map(p => (
              <button
                key={p}
                onClick={() => setRotationPreset(p)}
                className={`px-2 py-0.5 rounded font-mono ${rotationPreset === p ? 'bg-cyan-500 text-slate-900 font-bold' : 'hover:bg-white/10'}`}
                title={p === 'A' ? '-90° (Z-up→Y-up)' : p === 'B' ? '+90°' : p === 'C' ? '180°' : '0°'}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}

      {picked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[420px] max-w-[90vw] rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-amber-400/50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <div className="text-xs font-semibold text-amber-300">📌 Picked element</div>
            <button onClick={() => setPicked(null)} className="text-white/60 hover:text-white text-xs">✕</button>
          </div>
          <div className="px-4 py-3 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between"><span className="text-white/60">expressId</span><span className="text-amber-200 font-bold">{picked.expressId}</span></div>
            <div className="flex justify-between"><span className="text-white/60">type</span><span>{picked.ifcType}</span></div>
            <div className="flex justify-between"><span className="text-white/60">name</span><span className="truncate ml-2 text-right">{picked.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">storey</span><span>{picked.storey ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-white/60">x, y, z</span><span>{picked.point.x.toFixed(2)}, {picked.point.y.toFixed(2)}, {picked.point.z.toFixed(2)}</span></div>
          </div>
          <div className="px-4 py-2 border-t border-white/10 flex gap-2">
            <button
              onClick={() => {
                const snippet = `{ id: 'sensor-${picked.expressId}', roomId: 'room-${picked.expressId}', x: ${picked.point.x.toFixed(2)}, y: ${picked.point.y.toFixed(2)}, z: ${picked.point.z.toFixed(2)}, expressId: ${picked.expressId} },`;
                navigator.clipboard.writeText(snippet);
              }}
              className="flex-1 text-xs bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded px-3 py-1.5"
            >
              📋 Copy mockData snippet
            </button>
          </div>
        </div>
      )}

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
            {showStructure && <BuildingShell wallsVisible={true} onStatus={(s, m) => setIfcStatus({ state: s, msg: m })} pickMode={pickMode} onPick={setPicked} rotationX={rotationX} />}

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
    </div>
  );
}

