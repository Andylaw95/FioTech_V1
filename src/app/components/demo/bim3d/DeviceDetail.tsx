import { X, MapPin, Activity, Link2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sensor, Alarm, severityColor } from './mockData';

interface Props {
  sensor: Sensor | null;
  alarms: Alarm[];
  onClose: () => void;
}

export function DeviceDetail({ sensor, alarms, onClose }: Props) {
  const sensorAlarms = sensor ? alarms.filter(a => a.sensorId === sensor.id) : [];
  const activeCount = sensorAlarms.filter(a => !a.resolved).length;

  return (
    <AnimatePresence>
      {sensor && (
        <motion.div
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute top-4 right-4 bottom-24 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg z-30 overflow-hidden flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Device</div>
              <div className="text-sm font-bold text-white mt-0.5">{sensor.name}</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
            <section>
              <h4 className="text-xs text-slate-400 uppercase mb-2 flex items-center gap-1">
                <MapPin size={12} /> Location
              </h4>
              <div className="text-slate-200 space-y-1">
                <div>Type: <span className="text-cyan-400">{sensor.type}</span></div>
                <div>Subsystem: <span className="text-cyan-400">{sensor.subsystem}</span></div>
                <div>Position: <span className="text-slate-400 text-xs">
                  ({sensor.x.toFixed(1)}, {sensor.y.toFixed(1)}, {sensor.z.toFixed(1)})
                </span></div>
                {sensor.roomId && <div>Room: <span className="text-slate-300">{sensor.roomId}</span></div>}
                {sensor.deviceId && <div>Device ID: <span className="font-mono text-xs text-emerald-400">{sensor.deviceId}</span></div>}
              </div>
            </section>

            <section>
              <h4 className="text-xs text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Activity size={12} /> Live Events ({activeCount} active)
              </h4>
              <div className="space-y-1.5">
                {sensorAlarms.length === 0 && (
                  <div className="text-slate-500 text-xs">No events recorded</div>
                )}
                {sensorAlarms.slice(0, 8).map(a => (
                  <div
                    key={a.id}
                    className="p-2 rounded bg-slate-800/60 border-l-2"
                    style={{ borderColor: severityColor(a.severity) }}
                  >
                    <div className="text-xs font-medium text-white flex items-center gap-1">
                      <Zap size={10} style={{ color: severityColor(a.severity) }} />
                      {a.message}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(a.occurredAt).toLocaleTimeString()} · {a.resolved ? '✓ Resolved' : 'Active'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-xs text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Link2 size={12} /> Linkage
              </h4>
              <div className="space-y-1 text-xs text-slate-300">
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                  <span>→ Open nearest CCTV</span>
                  <span className="text-cyan-400">Configured</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                  <span>→ Generate work order</span>
                  <span className="text-slate-500">Manual</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                  <span>→ Notify on-call</span>
                  <span className="text-cyan-400">Configured</span>
                </div>
              </div>
            </section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
