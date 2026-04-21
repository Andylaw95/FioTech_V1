import { X, MapPin, Activity, Link2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sensor, Alarm, severityColor } from './mockData';

interface Props {
  sensor: Sensor | null;
  alarms: Alarm[];
  onClose: () => void;
}

// Inline (left-column) variant of device detail. Renders collapsible card, not a drawer.
export function DeviceDetailCard({ sensor, alarms, onClose }: Props) {
  const sensorAlarms = sensor ? alarms.filter(a => a.sensorId === sensor.id) : [];
  const activeCount = sensorAlarms.filter(a => !a.resolved).length;

  return (
    <AnimatePresence>
      {sensor && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="border-t-2 border-cyan-500/50 bg-slate-900 overflow-hidden"
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold">
                  Device Details
                </div>
                <div className="text-sm font-bold text-white mt-0.5 truncate max-w-[260px]">
                  {sensor.name}
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <section>
                <h4 className="text-[10px] text-slate-500 uppercase mb-1.5 flex items-center gap-1 font-bold">
                  <MapPin size={10} /> Location
                </h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300">
                  <div className="text-slate-500">Type</div>
                  <div className="text-cyan-400 font-medium">{sensor.type}</div>
                  <div className="text-slate-500">Subsystem</div>
                  <div className="text-cyan-400 font-medium">{sensor.subsystem}</div>
                  <div className="text-slate-500">Position</div>
                  <div className="font-mono text-[11px]">
                    ({sensor.x.toFixed(1)}, {sensor.y.toFixed(1)}, {sensor.z.toFixed(1)})
                  </div>
                  {sensor.roomId && (<>
                    <div className="text-slate-500">Room</div>
                    <div>{sensor.roomId}</div>
                  </>)}
                  {sensor.deviceId && (<>
                    <div className="text-slate-500">Device ID</div>
                    <div className="font-mono text-emerald-400 truncate">{sensor.deviceId}</div>
                  </>)}
                </div>
              </section>

              <section>
                <h4 className="text-[10px] text-slate-500 uppercase mb-1.5 flex items-center gap-1 font-bold">
                  <Activity size={10} /> Live Events
                  <span className="text-amber-400 ml-1">({activeCount} active)</span>
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {sensorAlarms.length === 0 && (
                    <div className="text-slate-600 text-[11px] italic">No events recorded</div>
                  )}
                  {sensorAlarms.slice(0, 6).map(a => (
                    <div
                      key={a.id}
                      className="p-1.5 rounded bg-slate-800/60 border-l-2"
                      style={{ borderColor: severityColor(a.severity) }}
                    >
                      <div className="text-[11px] text-white flex items-center gap-1">
                        <Zap size={9} style={{ color: severityColor(a.severity) }} />
                        {a.message}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        {new Date(a.occurredAt).toLocaleTimeString()} · {a.resolved ? '✓ Resolved' : 'Active'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-[10px] text-slate-500 uppercase mb-1.5 flex items-center gap-1 font-bold">
                  <Link2 size={10} /> Linkage
                </h4>
                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                    <span>→ Open nearest CCTV</span>
                    <span className="text-cyan-400 text-[10px]">Configured</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                    <span>→ Generate work order</span>
                    <span className="text-slate-500 text-[10px]">Manual</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/40">
                    <span>→ Notify on-call</span>
                    <span className="text-cyan-400 text-[10px]">Configured</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
