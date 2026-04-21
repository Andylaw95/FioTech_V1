import { useMemo, useState, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Environment, Stats } from '@react-three/drei';
import { Building } from '@/app/components/demo/bim3d/Building';
import { SensorPin } from '@/app/components/demo/bim3d/SensorPin';
import { AlarmPanel } from '@/app/components/demo/bim3d/AlarmPanel';
import { SubsystemDock } from '@/app/components/demo/bim3d/SubsystemDock';
import { DeviceDetail } from '@/app/components/demo/bim3d/DeviceDetail';
import { CameraFlyTo } from '@/app/components/demo/bim3d/CameraFlyTo';
import { useMockAlarmStream } from '@/app/components/demo/bim3d/useMockAlarmStream';
import { MOCK_SENSORS, Sensor, Alarm, Severity } from '@/app/components/demo/bim3d/mockData';
import { Zap, Layers3, RotateCcw, Maximize2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Determines current severity for a sensor based on active (unresolved) alarms.
function resolveSensorSeverity(sensorId: string, alarms: Alarm[]): Severity {
  const active = alarms.filter(a => a.sensorId === sensorId && !a.resolved);
  if (active.length === 0) return 'normal';
  if (active.some(a => a.severity === 'critical')) return 'critical';
  if (active.some(a => a.severity === 'warning')) return 'warning';
  return 'info';
}

export function BIM3DDemo() {
  const { alarms, triggerAlarm, resolveAlarm } = useMockAlarmStream();
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

  // Show toast for each new critical alarm (fades after 4s).
  const lastIdRef = useRef<string | null>(null);
  if (alarms.length && alarms[0].id !== lastIdRef.current) {
    lastIdRef.current = alarms[0].id;
    if (alarms[0].severity === 'critical' || alarms[0].severity === 'warning') {
      setTimeout(() => setToast(alarms[0]), 0);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const handleSelectAlarm = (a: Alarm) => {
    setSelectedAlarmId(a.id);
    const sensor = MOCK_SENSORS.find(s => s.id === a.sensorId);
    if (sensor) {
      setSelectedSensorId(sensor.id);
      setFlyTarget([sensor.x, sensor.y, sensor.z]);
      setTimeout(() => setFlyTarget(null), 1000);
    }
  };

  const handleSelectSensor = (id: string) => {
    setSelectedSensorId(prev => prev === id ? null : id);
    const s = MOCK_SENSORS.find(s => s.id === id);
    if (s) {
      setFlyTarget([s.x, s.y, s.z]);
      setTimeout(() => setFlyTarget(null), 1000);
    }
  };

  const resetView = () => {
    setFlyTarget([0, 0, 0]);
    setSelectedSensorId(null);
    setSelectedRoomId(null);
    setTimeout(() => setFlyTarget(null), 1000);
  };

  const visibleSensors = filterSubsystem
    ? MOCK_SENSORS.filter(s => s.subsystem === filterSubsystem)
    : MOCK_SENSORS;

  return (
    <div className="fixed inset-0 flex bg-slate-950 text-white" style={{ top: 0 }}>
      {/* Left sidebar: alarm panel */}
      <div className="w-80 flex-shrink-0">
        <AlarmPanel
          alarms={alarms}
          selectedAlarmId={selectedAlarmId}
          onSelect={handleSelectAlarm}
          onResolve={resolveAlarm}
          filterSubsystem={filterSubsystem}
        />
      </div>

      {/* 3D canvas area */}
      <div className="flex-1 relative">
        {/* Top bar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-lg px-4 py-2 pointer-events-auto">
            <div className="flex items-center gap-2">
              <Layers3 size={16} className="text-cyan-400" />
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Demo · Phase 2</div>
                <div className="text-sm font-bold">CCC Office · Floor 17 · BIM Digital Twin</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => triggerAlarm(undefined, 'critical')}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center gap-1.5 shadow-lg"
              title="Trigger a critical mock alarm"
            >
              <Zap size={14} /> Trigger Critical
            </button>
            <button
              onClick={() => setShowWalls(v => !v)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded flex items-center gap-1.5 border border-slate-700"
            >
              <Maximize2 size={14} /> {showWalls ? 'Hide' : 'Show'} Walls
            </button>
            <button
              onClick={resetView}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded flex items-center gap-1.5 border border-slate-700"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Alarm toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-red-600/95 border border-red-400 text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 pointer-events-auto cursor-pointer"
              onClick={() => handleSelectAlarm(toast)}
            >
              <Activity size={16} className="animate-pulse" />
              <div>
                <div className="text-xs font-bold uppercase">{toast.severity}</div>
                <div className="text-sm">{toast.title}: {toast.message}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* R3F Canvas */}
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

          {/* Lighting */}
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[15, 20, 10]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <hemisphereLight args={['#60a5fa', '#1e293b', 0.4]} />

          {/* Grid floor */}
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
              />
            ))}

            <CameraFlyTo target={flyTarget} enabled={!!flyTarget} />
            <Environment preset="city" />
          </Suspense>

          {import.meta.env.DEV && <Stats className="!top-auto !bottom-0 !left-auto !right-0" />}
        </Canvas>

        {/* Subsystem dock */}
        <SubsystemDock
          alarms={alarms}
          selected={filterSubsystem}
          onSelect={setFilterSubsystem}
        />

        {/* Device detail drawer */}
        <DeviceDetail
          sensor={selectedSensor}
          alarms={alarms}
          onClose={() => setSelectedSensorId(null)}
        />

        {/* Footer hint */}
        <div className="absolute bottom-4 right-4 z-10 text-[11px] text-slate-500 bg-slate-900/70 px-2 py-1 rounded border border-slate-800">
          Mock BIM · Ready for IFC 4.0 swap
        </div>
      </div>
    </div>
  );
}
