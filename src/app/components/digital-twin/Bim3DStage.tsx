import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';
import { Building } from '@/app/components/demo/bim3d/Building';
import {
  IfcModel,
  setVisibleCategories,
  setWireframe,
  setClipHeight,
  setEdgesVisible,
  setGhostMode,
  isolateExpressIds,
  showAll as ifcShowAll,
  highlightExpressId,
  getExpressIdBoundingBox,
  CATEGORY_GROUPS,
} from '@/app/components/demo/bim3d/IfcModel';
import { Severity } from '@/app/components/demo/bim3d/mockData';
import { useSensorPositions } from '@/app/components/demo/bim3d/useSensorPositions';
import { useZoneSensorAssignments } from '@/app/components/demo/bim3d/useZoneSensorAssignments';
import { useLiveDeviceStream } from '@/app/components/demo/bim3d/useLiveDeviceStream';
import { ZoneLabels3D } from '@/app/components/demo/bim3d/ZoneLabels3D';
import { BimToolsPanel, BimToolsState } from '@/app/components/demo/bim3d/BimToolsPanel';
import { PickerOverlay } from '@/app/components/demo/bim3d/PickerOverlay';
import { PickedElementCard, PickedInfo } from '@/app/components/demo/bim3d/PickedElementCard';
import { ZoneListSidebar } from '@/app/components/demo/bim3d/ZoneListSidebar';
import { setCloudSyncHandler } from '@/app/components/demo/bim3d/zoneLabels';
import {
  fetchAllLabels,
  pushCreate,
  pushUpdate,
  pushDelete,
  subscribeToZoneLabels,
  resolveIfcUrl,
} from '@/app/lib/bim/zoneLabelsRepo';

const DEFAULT_PROPERTY_ID = 'ccc-17f';
const FALLBACK_IFC_URL = '/bim/ccc-17f.ifc';

function BuildingShell({
  onStatus,
  onMetrics,
  url,
}: {
  onStatus: (s: 'loading' | 'ready' | 'failed', msg?: string) => void;
  onMetrics: (m: { height: number; categoryCounts: Record<string, number> }) => void;
  url?: string;
}) {
  const [ifcFailed, setIfcFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  // Reset failure latch when the underlying IFC URL changes (e.g. property
  // switch or signed-URL refresh). Otherwise a single transient failure
  // permanently downgrades to the procedural placeholder for the session.
  useEffect(() => {
    setIfcFailed(false);
  }, [url]);
  if (ifcFailed) {
    return <Building selectedRoomId={null} onRoomClick={() => {}} wallsVisible={true} />;
  }
  return (
    <IfcModel
      key={`${url ?? 'default'}#${retryToken}`}
      url={url}
      rotationX={0}
      onLoaded={() => onStatus('ready')}
      onError={(e) => {
        // Single automatic retry before latching — covers transient signed-URL / network blips.
        if (retryToken === 0) {
          console.warn('[BuildingShell] IFC load failed, retrying once:', e.message);
          setRetryToken(1);
          return;
        }
        onStatus('failed', e.message);
        setIfcFailed(true);
      }}
      onMetrics={onMetrics}
    />
  );
}

interface Bim3DStageProps {
  showStructure?: boolean;
  showDevices?: boolean;
  selectedDeviceId?: string | null;
  onSelectDevice?: (id: string) => void;
  onDeselect?: () => void;
  zoom?: number;
  /** Optional id of a sensor to highlight from a parent's external panel. */
  externalSelectedSensorId?: string | null;
  /**
   * Tenant scope. Maps to a row in `bim_properties` and is also used as the
   * model_key (1:1 for now). Falls back to the bundled demo property.
   */
  propertyId?: string;
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

/** Smoothly flies camera to focus on a world-space point (used when a device is selected). */
function CameraFocuser({ target }: { target: THREE.Vector3 | null }) {
  const { camera, controls } = useThree() as any;
  const animating = useRef(false);
  const goalTarget = useRef(new THREE.Vector3());
  const goalCamPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!target || !controls) return;
    goalTarget.current.copy(target);
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (dir.lengthSq() < 0.001) dir.set(0.7, 0.55, 0.85).normalize();
    const desiredDist = 14;
    goalCamPos.current.copy(target).addScaledVector(dir, desiredDist);
    animating.current = true;
  }, [target]);

  useFrame(() => {
    if (!controls || !animating.current) return;
    const t = controls.target as THREE.Vector3;
    t.lerp(goalTarget.current, 0.12);
    camera.position.lerp(goalCamPos.current, 0.12);
    controls.update?.();
    if (t.distanceTo(goalTarget.current) < 0.05 && camera.position.distanceTo(goalCamPos.current) < 0.05) {
      animating.current = false;
    }
  });
  return null;
}

/** Snap camera back to default home pose. */
function CameraResetter({ token }: { token: number }) {
  const { camera, controls } = useThree() as any;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!controls) return;
    camera.position.set(28, 22, 32);
    (controls.target as THREE.Vector3).set(0, 4, 0);
    controls.update?.();
  }, [token]);
  return null;
}

/** Frame the camera onto a Box3 (used for fit-view / isolate-and-frame). */
function CameraFitter({ token, box }: { token: number; box: THREE.Box3 | null }) {
  const { camera, controls } = useThree() as any;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!controls) return;
    const target = new THREE.Vector3();
    let radius = 20;
    if (box && !box.isEmpty()) {
      box.getCenter(target);
      const size = new THREE.Vector3();
      box.getSize(size);
      radius = Math.max(size.x, size.y, size.z) * 1.1;
    } else {
      target.set(0, 4, 0);
    }
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (dir.lengthSq() < 0.001) dir.set(0.7, 0.55, 0.85).normalize();
    camera.position.copy(target).addScaledVector(dir, Math.max(radius, 10));
    (controls.target as THREE.Vector3).copy(target);
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
  externalSelectedSensorId = null,
  propertyId = DEFAULT_PROPERTY_ID,
}: Bim3DStageProps) {
  // 1:1 mapping for now — every property has exactly one BIM model. If we
  // ever support multiple models per property, lift this into a prop.
  const modelKey = propertyId;
  const [userInteracting, setUserInteracting] = useState(false);
  const [ifcStatus, setIfcStatus] = useState<{ state: 'loading' | 'ready' | 'failed'; msg?: string }>({ state: 'loading' });
  const [labelsVersion, setLabelsVersion] = useState(0);
  const [ifcUrl, setIfcUrl] = useState<string | null>(null);
  // Bump labelsVersion when zone-label storage changes (e.g. via assignment dropdown)
  useEffect(() => {
    const onChange = () => setLabelsVersion(v => v + 1);
    // Same-tab edits dispatch this custom event.
    window.addEventListener('fiotech.zone-labels-changed', onChange);
    // Cross-tab: the browser fires `storage` when localStorage changes in
    // another tab/window. Filter to our keyspace to avoid noisy reloads.
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('fiotec.bim.zoneLabels.')) onChange();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('fiotech.zone-labels-changed', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  // ── Cloud cutover: install sync handler, hydrate labels from Supabase,
  // resolve a signed IFC URL, and listen for realtime label changes.
  // All side-effects re-run when propertyId changes (multi-property switch).
  useEffect(() => {
    let cancelled = false;
    setCloudSyncHandler({
      create: (l) => pushCreate(propertyId, modelKey, l),
      update: (id, l) => pushUpdate(propertyId, modelKey, id, l),
      delete: (id) => pushDelete(propertyId, id),
    });
    // Resolve signed URL for the private IFC asset (falls back to bundled demo).
    resolveIfcUrl(propertyId, FALLBACK_IFC_URL)
      .then((url) => { if (!cancelled) setIfcUrl(url); })
      .catch(() => { if (!cancelled) setIfcUrl(FALLBACK_IFC_URL); });
    // Initial hydrate from cloud → localStorage → trigger render.
    fetchAllLabels(propertyId, modelKey)
      .then(() => { if (!cancelled) setLabelsVersion((v) => v + 1); })
      .catch((err) => console.warn('[Bim3DStage] initial label fetch failed', err));
    // Realtime: re-hydrate on any server-side change.
    const unsubscribe = subscribeToZoneLabels(propertyId, modelKey, () => {
      if (cancelled) return;
      fetchAllLabels(propertyId, modelKey)
        .then(() => { if (!cancelled) setLabelsVersion((v) => v + 1); })
        .catch(() => {});
    });
    // Reset expanded card state when switching property (stale ids).
    setExpandedZoneIds(new Set());
    return () => {
      cancelled = true;
      setCloudSyncHandler(null);
      try { unsubscribe(); } catch {}
    };
  }, [propertyId, modelKey]);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layer / view tools — wireframe, ghost, edges, clip, category visibility
  const ALL_CATS = useMemo(() => Object.keys(CATEGORY_GROUPS), []);
  const [tools, setTools] = useState<BimToolsState>({
    visibleCats: new Set(ALL_CATS),
    wireframe: false,
    edges: false,
    ghost: false,
    clipHeight: 100,
    maxHeight: 100,
    rotationPreset: 'A',
  });
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  useEffect(() => { setVisibleCategories(tools.visibleCats); }, [tools.visibleCats]);
  useEffect(() => { setWireframe(tools.wireframe); }, [tools.wireframe]);
  useEffect(() => { setEdgesVisible(tools.edges); }, [tools.edges]);
  useEffect(() => { setGhostMode(tools.ghost); }, [tools.ghost]);
  useEffect(() => { setClipHeight(tools.clipHeight); }, [tools.clipHeight]);

  // IFC element picking — for editing zone labels
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<PickedInfo | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [fitToken, setFitToken] = useState(0);
  const [fitBox, setFitBox] = useState<THREE.Box3 | null>(null);

  // Toggleable side panels (collapsed by default so view is unobstructed)
  const [showTools, setShowTools] = useState(false);
  const [showZones, setShowZones] = useState(false);

  // Multi-expand state for zone status cards (lifted out of ZoneLabels3D so the
  // bulk Expand/Collapse pill can live OUTSIDE the R3F Canvas tree).
  // Reset is driven by the cloud-sync useEffect above when propertyId changes.
  const [expandedZoneIds, setExpandedZoneIds] = useState<Set<string>>(new Set());
  const toggleZoneExpanded = (id: string) => {
    setExpandedZoneIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // "Auto" toggle — controls auto-rotate camera AND demo-data auto-spawn together.
  const AUTO_PREF_KEY = 'fiotech.bim.autoOn';
  const [autoOn, setAutoOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(AUTO_PREF_KEY);
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(AUTO_PREF_KEY, autoOn ? '1' : '0'); } catch {}
  }, [autoOn]);

  // Live device telemetry — readings always flow; "Auto" only gates random alarm spawns + camera rotate
  const { alarms, readings } = useLiveDeviceStream({ enableAlarmSpawn: false, enableMock: false });
  // Sensor positions with localStorage overrides (drag-to-place fallback)
  const { sensors: liveSensors, overrides: positionOverrides } = useSensorPositions();
  // Zone-label-driven clustering
  const { clusters, labelBySensorId } = useZoneSensorAssignments(
    modelKey,
    labelsVersion,
    liveSensors,
    positionOverrides,
  );
  const SEV_RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1, normal: 0 };
  const severityById = useMemo(() => {
    const map = new Map<string, Severity>();
    for (const s of liveSensors) {
      const r = readings.get(s.id);
      map.set(s.id, r?.primary?.severity ?? 'normal');
    }
    for (const a of alarms) {
      if (a.resolved) continue;
      const cur = map.get(a.sensorId) ?? 'normal';
      if (SEV_RANK[a.severity] > SEV_RANK[cur]) map.set(a.sensorId, a.severity);
    }
    return map;
  }, [alarms, readings]);

  const internalSelectedSensor = useMemo(
    () => liveSensors.find(s => s.id === (externalSelectedSensorId || selectedDeviceId)) ?? null,
    [liveSensors, selectedDeviceId, externalSelectedSensorId],
  );

  /** World-space focus target for the camera when a device is selected.
   *  Prefer the assigned zone label anchor (so the camera frames the table),
   *  fall back to the sensor's own position. */
  const focusTarget = useMemo<THREE.Vector3 | null>(() => {
    if (!internalSelectedSensor) return null;
    const lbl = labelBySensorId.get(internalSelectedSensor.id);
    if (lbl?.anchor) return new THREE.Vector3(lbl.anchor.x, lbl.anchor.y + 0.4, lbl.anchor.z);
    return new THREE.Vector3(internalSelectedSensor.x, internalSelectedSensor.y, internalSelectedSensor.z);
  }, [internalSelectedSensor, labelBySensorId]);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

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

      {/* Top-left: tiny toggle pills for tools / zones */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={() => setShowTools(v => !v)}
          title="Layers, wireframe, edges, ghost mode, clip slider, fit/reset/isolate view"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-lg backdrop-blur transition border ${
            showTools
              ? 'bg-cyan-500/90 hover:bg-cyan-500 text-slate-900 border-cyan-300'
              : 'bg-slate-900/80 hover:bg-slate-900 text-slate-200 border-slate-700'
          }`}
        >
          🛠 Layers
        </button>
        <button
          onClick={() => setShowZones(v => !v)}
          title="List, rename, delete, fly-to zone labels"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-lg backdrop-blur transition border ${
            showZones
              ? 'bg-cyan-500/90 hover:bg-cyan-500 text-slate-900 border-cyan-300'
              : 'bg-slate-900/80 hover:bg-slate-900 text-slate-200 border-slate-700'
          }`}
        >
          🏷 Zones
        </button>
        <button
          onClick={() => { setPickMode(p => !p); if (pickMode) setPicked(null); }}
          title="Pick mode: click an IFC element to inspect / attach as a zone label"
          disabled={ifcStatus.state !== 'ready'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-lg backdrop-blur transition border disabled:opacity-40 ${
            pickMode
              ? 'bg-amber-500/90 hover:bg-amber-500 text-slate-900 border-amber-300'
              : 'bg-slate-900/80 hover:bg-slate-900 text-slate-200 border-slate-700'
          }`}
        >
          🎯 {pickMode ? 'Pick: ON' : 'Pick'}
        </button>
      </div>

      {showTools && ifcStatus.state === 'ready' && (
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
      )}

      {showZones && ifcStatus.state === 'ready' && (
        <ZoneListSidebar
          modelKey={modelKey}
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

      {picked && (
        <PickedElementCard
          picked={picked}
          modelKey={modelKey}
          onClose={() => { setPicked(null); highlightExpressId(null); }}
          onLabelChange={() => setLabelsVersion(v => v + 1)}
        />
      )}

      {/* "Auto" toggle — controls camera auto-rotate + demo-data auto-spawn */}
      <button
        onClick={() => setAutoOn(v => !v)}
        title={autoOn
          ? 'Auto ON — camera auto-rotates and synthetic alarms spawn over time. Readings stay live either way. Click to turn OFF.'
          : 'Auto OFF — camera holds still and no new alarms auto-spawn. Sensor readings still update live. Click to turn ON.'}
        className={`absolute z-30 top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-lg backdrop-blur transition pointer-events-auto ${
          autoOn
            ? 'bg-amber-500/90 hover:bg-amber-500 text-slate-900 border border-amber-300'
            : 'bg-slate-900/80 hover:bg-slate-900 text-slate-300 border border-slate-700'
        }`}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${autoOn ? 'bg-slate-900 animate-pulse' : 'bg-slate-500'}`}
        />
        Auto: {autoOn ? 'ON' : 'OFF'}
      </button>

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
        <PerspectiveCamera makeDefault position={[28, 22, 32]} fov={42} near={0.1} far={1000} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={1.5}
          maxDistance={120}
          maxPolarAngle={Math.PI / 2.05}
          minPolarAngle={Math.PI / 8}
          target={[0, 4, 0]}
          autoRotate={autoOn && !userInteracting && ifcStatus.state === 'ready' && !pickMode}
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
          <CameraFocuser target={focusTarget} />
          {showStructure && (
            <BuildingShell
              url={ifcUrl ?? undefined}
              onStatus={(s, m) => setIfcStatus({ state: s, msg: m })}
              onMetrics={(m) => {
                setCategoryCounts(m.categoryCounts);
                setTools(prev => ({
                  ...prev,
                  maxHeight: m.height,
                  clipHeight: prev.maxHeight === 100 ? Math.min(1.0, m.height) : prev.clipHeight,
                }));
              }}
            />
          )}

          {/* Sensors assigned to a zone label render inside that label's chip (clean look).
              Sensors WITHOUT a zone are intentionally not drawn in 3D — they remain selectable
              from the Overview / Inspector sidebar, and can be placed into a zone via Pick mode. */}
        </Suspense>

        <PickerOverlay enabled={pickMode} onPick={setPicked} />

        <ZoneLabels3D
          modelKey={modelKey}
          version={labelsVersion}
          clusters={showDevices ? clusters.map(({ label, sensors }) => {
            let worst: Severity = 'normal';
            for (const s of sensors) {
              const sev = severityById.get(s.id) ?? 'normal';
              if (SEV_RANK[sev] > SEV_RANK[worst]) worst = sev;
            }
            return { labelId: label.id, sensors, worstSeverity: worst };
          }) : []}
          readings={readings}
          severityById={severityById}
          selectedSensorId={externalSelectedSensorId ?? selectedDeviceId ?? null}
          onSelectSensor={(id) => onSelectDevice?.(id)}
          expandedIds={expandedZoneIds}
          onToggleExpanded={toggleZoneExpanded}
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

        {/* Navigation cube — click faces/edges to snap orientation */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewcube
            color="#1e293b"
            textColor="#fef3c7"
            strokeColor="#fbbf24"
            hoverColor="#0891b2"
          />
        </GizmoHelper>
      </Canvas>

      {/* Bulk Expand/Collapse all zone status cards (rendered OUTSIDE Canvas so it
          uses the React DOM reconciler, not R3F's three.js reconciler). */}
      {showDevices && clusters.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={() => {
              if (expandedZoneIds.size >= clusters.length) {
                setExpandedZoneIds(new Set());
              } else {
                setExpandedZoneIds(new Set(clusters.map(c => c.label.id)));
              }
            }}
            className="px-3 py-1 rounded-full text-[11px] font-semibold shadow-lg backdrop-blur bg-slate-900/85 hover:bg-slate-900 text-slate-100 border border-slate-700"
            title={expandedZoneIds.size >= clusters.length ? 'Collapse all zone cards' : 'Expand all zone cards'}
          >
            {expandedZoneIds.size >= clusters.length ? '▴ Collapse all' : '▾ Expand all'}
          </button>
        </div>
      )}
    </div>
  );
}
