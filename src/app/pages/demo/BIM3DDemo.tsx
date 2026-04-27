import { useMemo, useState, useRef, Suspense, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stats } from '@react-three/drei';
import { Building } from '@/app/components/demo/bim3d/Building';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { AlarmPanel } from '@/app/components/demo/bim3d/AlarmPanel';
import { SubsystemDock } from '@/app/components/demo/bim3d/SubsystemDock';
import { DeviceDetailCard } from '@/app/components/demo/bim3d/DeviceDetailCard';
import { ControlPanel } from '@/app/components/demo/bim3d/ControlPanel';
import { CameraFlyTo } from '@/app/components/demo/bim3d/CameraFlyTo';
import { useLiveDeviceStream } from '@/app/components/demo/bim3d/useLiveDeviceStream';
import { LiveStatusBadge } from '@/app/components/demo/bim3d/LiveStatusBadge';
import { MOCK_SENSORS, Alarm, Severity } from '@/app/components/demo/bim3d/mockData';
import { Layers3, Activity, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function resolveSensorSeverity(sensorId: string, alarms: Alarm[]): Severity {
  const active = alarms.filter(a => a.sensorId === sensorId && !a.resolved);
  if (active.length === 0) return 'normal';
  if (active.some(a => a.severity === 'critical')) return 'critical';
  if (active.some(a => a.severity === 'warning')) return 'warning';
  return 'info';
}

export function BIM3DDemo() {
  const { propertyId } = useParams<{ propertyId?: string }>();
  const navigate = useNavigate();
  const { alarms, readings, mode, counts, lastFetch, triggerAlarm, resolveAlarm } = useLiveDeviceStream();
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [filterSubsystem, setFilterSubsystem] = useState<string | null>(null);
  const [showWalls, setShowWalls] = useState(true);
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(null);
  const [toast, setToast] = useState<Alarm | null>(null);

  const selectedSensor = useMemo(
    () => MOCK_SENSORS.find(s => s.id === selectedSensorId) ?? null,
    [selectedSensorId]
  );

  const lastIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast on new critical/warning alarms — driven from effect, not render
  useEffect(() => {
    if (!alarms.length) return;
    const latest = alarms[0];
    if (latest.id === lastIdRef.current) return;
    lastIdRef.current = latest.id;
    if (latest.severity !== 'critical' && latest.severity !== 'warning') return;
    setToast(latest);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, [alarms]);

  // Cleanup any pending timers when the page unmounts
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
  }, []);

  const scheduleFlyClear = () => {
    if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
    flyTimerRef.current = setTimeout(() => setFlyTarget(null), 1000);
  };

  const handleSelectAlarm = (a: Alarm) => {
    setSelectedAlarmId(a.id);
    const sensor = MOCK_SENSORS.find(s => s.id === a.sensorId);
    if (sensor) {
      setSelectedSensorId(sensor.id);
      setFlyTarget([sensor.x, sensor.y, sensor.z]);
      scheduleFlyClear();
    }
  };

  const handleSelectSensor = (id: string) => {
    setSelectedSensorId(prev => prev === id ? null : id);
    const s = MOCK_SENSORS.find(s => s.id === id);
    if (s) {
      setFlyTarget([s.x, s.y, s.z]);
      scheduleFlyClear();
    }
  };

  const resetView = () => {
    setFlyTarget([0, 0, 0]);
    setSelectedSensorId(null);
    setSelectedRoomId(null);
    scheduleFlyClear();
  };

  const visibleSensors = filterSubsystem
    ? MOCK_SENSORS.filter(s => s.subsystem === filterSubsystem)
    : MOCK_SENSORS;

  return (
    <div className="flex bg-slate-950 text-white -m-3 sm:-m-4 lg:-m-6 h-[calc(100vh-4rem)] overflow-hidden">
      <aside className="w-96 flex-shrink-0 flex flex-col border-r border-slate-700 bg-slate-900/95">
        <div className="px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-2">
            {propertyId && (
              <button
                onClick={() => navigate('/digital-twin-v2')}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition flex-shrink-0"
                title="Back to portfolio"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <Layers3 size={18} className="text-cyan-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold">
                {propertyId ? `Digital Twin · ${decodeURIComponent(propertyId)}` : 'Demo · Phase 2'}
              </div>
              <div className="text-sm font-bold text-white truncate">
                CCC Office · Floor 17 · BIM Digital Twin
              </div>
            </div>
          </div>
        </div>

        <ControlPanel
          showWalls={showWalls}
          onToggleWalls={() => setShowWalls(v => !v)}
          onTriggerCritical={() => triggerAlarm(undefined, 'critical')}
          onTriggerWarning={() => triggerAlarm(undefined, 'warning')}
          onResetView={resetView}
        />

        <div className="flex-1 min-h-0">
          <AlarmPanel
            alarms={alarms}
            selectedAlarmId={selectedAlarmId}
            onSelect={handleSelectAlarm}
            onResolve={resolveAlarm}
            filterSubsystem={filterSubsystem}
          />
        </div>

        <DeviceDetailCard
          sensor={selectedSensor}
          alarms={alarms}
          reading={selectedSensor ? readings.get(selectedSensor.id) ?? null : null}
          onClose={() => setSelectedSensorId(null)}
        />
      </aside>

      <div className="flex-1 relative min-w-0">
        <LiveStatusBadge mode={mode} counts={counts} lastFetch={lastFetch} />
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-600/95 border border-red-400 text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 pointer-events-auto cursor-pointer"
              onClick={() => handleSelectAlarm(toast)}
            >
              <Activity size={16} className="animate-pulse" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider">{toast.severity}</div>
                <div className="text-sm">{toast.title}: {toast.message}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Canvas shadows dpr={[1, 2]} style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}>
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

          <ambientLight intensity={0.55} />
          <directionalLight
            position={[15, 20, 10]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <hemisphereLight args={['#60a5fa', '#1e293b', 0.4]} />

          <Grid
            args={[60, 60]}
            position={[0, -0.03, 0]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#334155"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#0891b2"
            fadeDistance={50}
            fadeStrength={1}
            infiniteGrid
          />

          <Suspense fallback={null}>
            <Building
              selectedRoomId={selectedRoomId}
              onRoomClick={(id) => setSelectedRoomId(prev => prev === id ? null : id)}
              wallsVisible={showWalls}
            />

            {visibleSensors.map(sensor => (
              <SensorPin
                key={sensor.id}
                sensor={sensor}
                severity={resolveSensorSeverity(sensor.id, alarms)}
                selected={selectedSensorId === sensor.id}
                onClick={handleSelectSensor}
                online={readings.get(sensor.id)?.online ?? false}
                valueLabel={(() => {
                  const r = readings.get(sensor.id);
                  return r?.primary ? `${r.primary.value.toFixed(1)} ${r.primary.unit}` : null;
                })()}
              />
            ))}

            <CameraFlyTo target={flyTarget} enabled={!!flyTarget} />
          </Suspense>

          {import.meta.env.DEV && <Stats className="!top-auto !bottom-0 !left-auto !right-0" />}
        </Canvas>

        <SubsystemDock
          alarms={alarms}
          selected={filterSubsystem}
          onSelect={setFilterSubsystem}
        />

        <div className="absolute bottom-4 right-4 z-10 text-[11px] text-slate-500 bg-slate-900/70 px-2 py-1 rounded border border-slate-800 pointer-events-none">
          Mock BIM · Ready for IFC 4.0 swap
        </div>
      </div>
    </div>
  );
}
