import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Float, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';
import { Building } from '@/app/components/demo/bim3d/Building';
import {
  IfcModel,
  getIfcInfoFromIntersection,
  setVisibleCategories,
  setWireframe,
  setClipHeight,
  setEdgesVisible,
  setGhostMode,
  isolateExpressIds,
  showAll as ifcShowAll,
  highlightExpressId,
  getModelGroup,
  getExpressIdBoundingBox,
  CATEGORY_GROUPS,
} from '@/app/components/demo/bim3d/IfcModel';
import { BimToolsPanel, BimToolsState } from '@/app/components/demo/bim3d/BimToolsPanel';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { MOCK_SENSORS, Severity, severityColor } from '@/app/components/demo/bim3d/mockData';
import { useMockAlarmStream } from '@/app/components/demo/bim3d/useMockAlarmStream';
import { DeviceDetailCard } from '@/app/components/demo/bim3d/DeviceDetailCard';
import { PickedElementCard, PickedInfo } from '@/app/components/demo/bim3d/PickedElementCard';
import { PickerOverlay } from '@/app/components/demo/bim3d/PickerOverlay';
import { ZoneLabels3D } from '@/app/components/demo/bim3d/ZoneLabels3D';
import { ZoneListSidebar } from '@/app/components/demo/bim3d/ZoneListSidebar';

const MODEL_KEY = 'ccc-17f';

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
          onPick({ ...info, point: e.point.clone() });
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

/** Frames the camera to a Box3 so the entire object fits in view. */
function CameraFitter({ token, box }: { token: number; box?: THREE.Box3 | null }) {
  const { camera, controls } = useThree() as any;
  const last = useRef(0);
  useEffect(() => {
    if (token === 0 || token === last.current) return;
    last.current = token;
    let target: THREE.Box3 | null = box ?? null;
    if (!target) {
      const grp = getModelGroup();
      if (!grp) return;
      target = new THREE.Box3().setFromObject(grp);
    }
    if (!controls || target.isEmpty()) return;
    const center = target.getCenter(new THREE.Vector3());
    const size = target.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;
    const dir = new THREE.Vector3(0.7, 0.55, 0.85).normalize();
    const newPos = center.clone().addScaledVector(dir, distance);
    camera.position.copy(newPos);
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update?.();
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
  const [labelsVersion, setLabelsVersion] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [fitToken, setFitToken] = useState(0);
  const [fitBox, setFitBox] = useState<THREE.Box3 | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tools, setTools] = useState<BimToolsState>({
    visibleCats: ALL_CATS,
    wireframe: false,
    edges: true,
    ghost: false,
    clipHeight: 1.0,
    maxHeight: 100,
    rotationPreset: 'D',
  });

  // Live device status — feed alarm stream into per-sensor severity
  const { alarms, triggerAlarm, resolveAlarm } = useMockAlarmStream(3, 15000);
  const SEV_RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1, normal: 0 };
  const severityById = useMemo(() => {
    const map = new Map<string, Severity>();
    for (const s of MOCK_SENSORS) map.set(s.id, 'normal');
    for (const a of alarms) {
      if (a.resolved) continue;
      const cur = map.get(a.sensorId) ?? 'normal';
      if (SEV_RANK[a.severity] > SEV_RANK[cur]) map.set(a.sensorId, a.severity);
    }
    return map;
  }, [alarms]);

  const statusCounts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, normal: 0 } as Record<Severity, number>;
    for (const sev of severityById.values()) c[sev]++;
    return c;
  }, [severityById]);

  const internalSelectedSensor = useMemo(
    () => MOCK_SENSORS.find(s => s.id === selectedDeviceId) ?? null,
    [selectedDeviceId],
  );

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
    setEdgesVisible(tools.edges);
  }, [tools.edges, ifcStatus.state]);

  useEffect(() => {
    if (ifcStatus.state !== 'ready') return;
    setGhostMode(tools.ghost);
  }, [tools.ghost, ifcStatus.state]);

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
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(180deg, #c5dcef 0%, #dcebf8 35%, #f0f4f7 70%, #e9e2d2 100%)',
      }}
    >
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
            onResetView={() => { setFitBox(null); setResetToken(t => t + 1); }}
            onFitView={() => { setFitBox(null); setFitToken(t => t + 1); }}
            onIsolateSelected={() => {
              if (!picked) return;
              isolateExpressIds([picked.expressId]);
              const box = getExpressIdBoundingBox(picked.expressId);
              if (box && !box.isEmpty()) {
                setFitBox(box);
                setFitToken(t => t + 1);
              }
            }}
            onShowAll={() => {
              ifcShowAll();
              setTools(s => ({ ...s, visibleCats: new Set(ALL_CATS), clipHeight: s.maxHeight + 0.5, ghost: false }));
              setPicked(null);
              setFitBox(null);
            }}
            hasSelection={!!picked}
            pickMode={pickMode}
            onTogglePickMode={() => { setPickMode(p => !p); if (pickMode) setPicked(null); }}
          />
        </>
      )}

      {picked && (
        <PickedElementCard
          picked={picked}
          modelKey={MODEL_KEY}
          onClose={() => { setPicked(null); highlightExpressId(null); }}
          onLabelChange={() => setLabelsVersion(v => v + 1)}
        />
      )}

      {ifcStatus.state === 'ready' && (
        <ZoneListSidebar
          modelKey={MODEL_KEY}
          version={labelsVersion}
          onSelect={(label) => {
            setPicked({
              expressId: label.expressId,
              ifcType: 'IFCLABEL',
              name: label.customName ?? null,
              storey: null,
              point: new THREE.Vector3(label.anchor.x, label.anchor.y, label.anchor.z),
              editLabelId: label.id,
            });
          }}
          onFlyTo={(anchor) => {
            const box = new THREE.Box3().setFromCenterAndSize(
              anchor,
              new THREE.Vector3(8, 4, 8),
            );
            setFitBox(box);
            setFitToken(t => t + 1);
          }}
          onDeleted={() => {
            setLabelsVersion(v => v + 1);
            if (picked) setPicked(null);
          }}
        />
      )}

      {ifcStatus.state === 'ready' && showDevices && (
        <div className="absolute top-3 right-[110px] z-20 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/85 border border-slate-700 backdrop-blur shadow-lg pointer-events-auto">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mr-1">Devices</span>
            {(['critical','warning','info','normal'] as Severity[]).map(sev => (
              <button
                key={sev}
                onClick={() => {
                  // Pick a random sensor and trigger a fake alarm of this severity (or resolve all if normal)
                  if (sev === 'normal') {
                    alarms.filter(a => !a.resolved).forEach(a => resolveAlarm(a.id));
                  } else {
                    const s = MOCK_SENSORS[Math.floor(Math.random() * MOCK_SENSORS.length)];
                    triggerAlarm(s.id, sev);
                  }
                }}
                title={sev === 'normal' ? 'Resolve all alarms' : `Inject ${sev} alarm`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: severityColor(sev), boxShadow: `0 0 6px ${severityColor(sev)}` }}
                />
                <span className="text-[11px] font-mono text-slate-200 tabular-nums">{statusCounts[sev]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {internalSelectedSensor && (
        <div className="absolute bottom-3 right-3 z-20 w-[320px] rounded-lg overflow-hidden shadow-2xl border border-cyan-500/40">
          <DeviceDetailCard
            sensor={internalSelectedSensor}
            alarms={alarms}
            onClose={() => onDeselect?.()}
          />
        </div>
      )}


      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        className="absolute inset-0"
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          localClippingEnabled: true,
          logarithmicDepthBuffer: true,
          alpha: true,
        }}
        style={{ background: 'transparent' }}
        onPointerMissed={onDeselect}
      >
        <PerspectiveCamera makeDefault position={[28, 22, 32]} fov={42} near={0.5} far={500} />
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
          args={[160, 160]}
          position={[0, -0.5, 0]}
          cellSize={1}
          cellThickness={0.4}
          cellColor="#cbd5e1"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#0891b2"
          fadeDistance={90}
          fadeStrength={1.5}
          followCamera={false}
          infiniteGrid
        />

        <ContactShadows
          position={[0, -0.48, 0]}
          opacity={0.4}
          scale={70}
          blur={2.8}
          far={14}
          resolution={1024}
          color="#0f172a"
        />

        <Suspense fallback={null}>
          <ZoomDriver zoom={zoom} />
          <CameraResetter token={resetToken} />
          <CameraFitter token={fitToken} box={fitBox} />
          {showStructure && (
            <BuildingShell
              rotationX={rotationX}
              onStatus={(s, m) => setIfcStatus({ state: s, msg: m })}
              onMetrics={(m) => {
                setCategoryCounts(m.categoryCounts);
                setTools(prev => ({
                  ...prev,
                  maxHeight: m.height,
                  // Default to 1.0 m floor-plan view on first load
                  clipHeight: prev.clipHeight === 1.0 ? 1.0 : prev.clipHeight,
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
                severity={severityById.get(sensor.id) ?? 'normal'}
                selected={selectedDeviceId === sensor.id}
                onClick={(id) => onSelectDevice?.(id)}
              />
            ))}
          </Float>
        </Suspense>

        <PickerOverlay enabled={pickMode} onPick={setPicked} />

        <ZoneLabels3D
          modelKey={MODEL_KEY}
          version={labelsVersion}
          onEdit={(label) => {
            setPicked({
              expressId: label.expressId,
              ifcType: 'IFCLABEL',
              name: label.customName ?? null,
              storey: null,
              point: new THREE.Vector3(label.anchor.x, label.anchor.y, label.anchor.z),
              editLabelId: label.id,
            });
          }}
        />

        {/* Autodesk-style navigation cube — click faces/edges to snap orientation */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewcube
            color="#1e293b"
            textColor="#fef3c7"
            strokeColor="#fbbf24"
            hoverColor="#0891b2"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
