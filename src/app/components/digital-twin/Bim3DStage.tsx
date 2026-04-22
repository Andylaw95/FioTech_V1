import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';
import { Building } from '@/app/components/demo/bim3d/Building';
import {
  IfcModel,
  getIfcInfoFromIntersection,
  setVisibleCategories,
  setWireframe,
  setClipHeight,
  highlightExpressId,
  CATEGORY_GROUPS,
} from '@/app/components/demo/bim3d/IfcModel';
import { BimToolsPanel, BimToolsState } from '@/app/components/demo/bim3d/BimToolsPanel';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { MOCK_SENSORS, Severity } from '@/app/components/demo/bim3d/mockData';

interface PickedInfo {
  expressId: number;
  ifcType: string;
  name: string | null;
  storey: string | null;
  point: { x: number; y: number; z: number };
}

const ALL_CATS = new Set(Object.keys(CATEGORY_GROUPS));

function BuildingShell({
  onStatus,
  pickMode,
  onPick,
  rotationX,
  onMetrics,
}: {
  onStatus: (s: 'loading' | 'ready' | 'failed', msg?: string) => void;
  pickMode: boolean;
  onPick: (info: PickedInfo) => void;
  rotationX: number;
  onMetrics: (m: { height: number; categoryCounts: Record<string, number> }) => void;
}) {
  const [ifcFailed, setIfcFailed] = useState(false);
  if (ifcFailed) {
    return <Building selectedRoomId={null} onRoomClick={() => {}} wallsVisible={true} />;
  }
  return (
    <group
      onClick={async (e) => {
        if (!pickMode) return;
        e.stopPropagation();
        const info = await getIfcInfoFromIntersection(e.intersections[0]);
        if (info) {
          onPick({ ...info, point: { x: e.point.x, y: e.point.y, z: e.point.z } });
        }
      }}
    >
      <IfcModel
        rotationX={rotationX}
        onLoaded={() => onStatus('ready')}
        onError={(e) => { onStatus('failed', e.message); setIfcFailed(true); }}
        onMetrics={onMetrics}
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
  zoom?: number;
}

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
    const desiredDist = THREE.MathUtils.clamp(32 / Math.max(zoom, 0.1), 10, 80);
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

/** Imperative reset via ref token; bumps a counter to trigger reset() on controls. */
function CameraResetter({ token }: { token: number }) {
  const { controls } = useThree() as any;
  const last = useRef(0);
  useEffect(() => {
    if (token === 0 || token === last.current) return;
    last.current = token;
    controls?.reset?.();
  }, [token]);
  return null;
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
  const [resetToken, setResetToken] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tools, setTools] = useState<BimToolsState>({
    visibleCats: ALL_CATS,
    wireframe: false,
    clipHeight: 100,
    maxHeight: 100,
    rotationPreset: 'D',
  });

  const ROTATION_MAP: Record<BimToolsState['rotationPreset'], number> = useMemo(() => ({
    A: -Math.PI / 2, B: Math.PI / 2, C: Math.PI, D: 0,
  }), []);
  const rotationX = ROTATION_MAP[tools.rotationPreset];

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  // Apply tool state to module-level helpers
  useEffect(() => {
    if (ifcStatus.state !== 'ready') return;
    setVisibleCategories(tools.visibleCats);
  }, [tools.visibleCats, ifcStatus.state]);

  useEffect(() => {
    if (ifcStatus.state !== 'ready') return;
    setWireframe(tools.wireframe);
  }, [tools.wireframe, ifcStatus.state]);

  useEffect(() => {
    if (ifcStatus.state !== 'ready') return;
    setClipHeight(tools.clipHeight);
  }, [tools.clipHeight, ifcStatus.state]);

  useEffect(() => {
    if (ifcStatus.state !== 'ready') return;
    highlightExpressId(picked?.expressId ?? null);
  }, [picked, ifcStatus.state]);

  const handleStart = () => {
    setUserInteracting(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };
  const handleEnd = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setUserInteracting(false), 3500);
  };

  return (
    <div className="absolute inset-0">
      {ifcStatus.state !== 'ready' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-md bg-slate-900/85 text-white text-xs font-medium shadow-lg backdrop-blur-sm pointer-events-none">
          {ifcStatus.state === 'loading' && '⏳ Loading CCC 17F BIM model (46 MB)…'}
          {ifcStatus.state === 'failed' && `⚠️ IFC failed (${ifcStatus.msg ?? 'unknown'}) — using fallback`}
        </div>
      )}

      {ifcStatus.state === 'ready' && (
        <>
          <BimToolsPanel
            state={tools}
            setState={setTools}
            categoryCounts={categoryCounts}
            onResetView={() => setResetToken(t => t + 1)}
            onIsolateSelected={() => {
              if (!picked) return;
              // Just highlight + auto-frame; full isolation would require subset-by-id which we keep simple.
              highlightExpressId(picked.expressId);
            }}
            onShowAll={() => {
              setTools(s => ({ ...s, visibleCats: new Set(ALL_CATS), clipHeight: s.maxHeight + 0.5 }));
              setPicked(null);
              highlightExpressId(null);
            }}
            hasSelection={!!picked}
          />

          <button
            onClick={() => { setPickMode(p => !p); if (pickMode) setPicked(null); }}
            className={`absolute top-3 right-3 z-20 px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg backdrop-blur-sm transition ${
              pickMode ? 'bg-amber-500 text-slate-900 ring-2 ring-amber-300' : 'bg-slate-900/85 text-white hover:bg-slate-800'
            }`}
          >
            {pickMode ? '🎯 Pick ON — click element' : '🎯 Pick Mode'}
          </button>
        </>
      )}

      {picked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[420px] max-w-[90vw] rounded-lg bg-slate-900/95 text-white shadow-2xl backdrop-blur ring-1 ring-amber-400/50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <div className="text-xs font-semibold text-amber-300">📌 Picked element</div>
            <button onClick={() => { setPicked(null); highlightExpressId(null); }} className="text-white/60 hover:text-white text-xs">✕</button>
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
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          localClippingEnabled: true,
        }}
        style={{ background: 'transparent' }}
        onPointerMissed={onDeselect}
      >
        <fog attach="fog" args={['#e0ecfa', 60, 140]} />

        <PerspectiveCamera makeDefault position={[28, 22, 32]} fov={42} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={8}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2.05}
          minPolarAngle={Math.PI / 8}
          target={[0, 4, 0]}
          autoRotate={!userInteracting && ifcStatus.state === 'ready' && !pickMode}
          autoRotateSpeed={0.3}
          onStart={handleStart}
          onEnd={handleEnd}
        />

        <ambientLight intensity={0.55} />
        <directionalLight
          position={[18, 28, 14]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-18, 14, -12]} intensity={0.4} color="#7dd3fc" />
        <hemisphereLight args={['#bfdbfe', '#1e293b', 0.55]} />

        <Grid
          args={[120, 120]}
          position={[0, -0.02, 0]}
          cellSize={1}
          cellThickness={0.4}
          cellColor="#cbd5e1"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#0891b2"
          fadeDistance={80}
          fadeStrength={1.2}
          infiniteGrid
        />

        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.45}
          scale={70}
          blur={2.6}
          far={12}
          resolution={1024}
          color="#0f172a"
        />

        <Suspense fallback={null}>
          <ZoomDriver zoom={zoom} />
          <CameraResetter token={resetToken} />
          {showStructure && (
            <BuildingShell
              rotationX={rotationX}
              onStatus={(s, m) => setIfcStatus({ state: s, msg: m })}
              onMetrics={(m) => {
                setCategoryCounts(m.categoryCounts);
                setTools(prev => ({
                  ...prev,
                  maxHeight: m.height,
                  clipHeight: m.height + 0.5,
                }));
              }}
              pickMode={pickMode}
              onPick={setPicked}
            />
          )}

          {/* Sensor pins keep the gentle float for a touch of life */}
          <Float speed={0.6} rotationIntensity={0} floatIntensity={0.12}>
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
        </Suspense>
      </Canvas>
    </div>
  );
}
