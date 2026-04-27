import { X, MapPin, Activity, Link2, Zap, Radio, Battery, Signal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sensor, Alarm, severityColor } from './mockData';
import type { LiveReading } from './useLiveDeviceStream';

interface Props {
  sensor: Sensor | null;
  alarms: Alarm[];
  reading?: LiveReading | null;
  onClose: () => void;
}

function ageLabel(sec: number | null): string {
  if (sec === null) return 'never';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

const METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  sound_level_leq:    { label: 'LAeq',     unit: 'dB' },
  sound_level_lmax:   { label: 'LAFmax',   unit: 'dB' },
  sound_level_lmin:   { label: 'LAFmin',   unit: 'dB' },
  sound_level_inst:   { label: 'LAF',      unit: 'dB' },
  sound_level_lcpeak: { label: 'LCpeak',   unit: 'dB' },
  pm2_5:              { label: 'PM2.5',    unit: 'µg/m³' },
  pm10:               { label: 'PM10',     unit: 'µg/m³' },
  temperature:        { label: 'Temp',     unit: '°C' },
  humidity:           { label: 'Humidity', unit: '%' },
  co2:                { label: 'CO₂',      unit: 'ppm' },
  tvoc:               { label: 'TVOC',     unit: 'ppb' },
  pressure:           { label: 'Pressure', unit: 'hPa' },
  illuminance:        { label: 'Lux',      unit: 'lx' },
};

// Inline (left-column) variant of device detail. Renders collapsible card, not a drawer.
export function DeviceDetailCard({ sensor, alarms, reading, onClose }: Props) {
  const sensorAlarms = sensor ? alarms.filter(a => a.sensorId === sensor.id) : [];
  const activeCount = sensorAlarms.filter(a => !a.resolved).length;

  const liveMetrics = reading?.metrics
    ? Object.entries(reading.metrics)
        .filter(([k, v]) => METRIC_LABEL[k] && Number.isFinite(v))
        .slice(0, 8)
    : [];

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
              {reading?.device && (
                <section>
                  <h4 className="text-[10px] text-emerald-400 uppercase mb-1.5 flex items-center gap-1 font-bold">
                    <Radio size={10} className={reading.online ? 'animate-pulse' : 'opacity-40'} />
                    Live Telemetry
                    <span className={`ml-auto text-[10px] font-mono ${reading.online ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {reading.online ? '● online' : '○ stale'} · {ageLabel(reading.ageSec)}
                    </span>
                  </h4>
                  {reading.primary && (
                    <div
                      className="mb-2 p-2 rounded bg-slate-800/80 border-l-2 flex items-baseline gap-2"
                      style={{ borderColor: severityColor(reading.primary.severity) }}
                    >
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{reading.primary.label}</span>
                      <span className="text-2xl font-bold font-mono text-white">{reading.primary.value.toFixed(1)}</span>
                      <span className="text-[11px] text-slate-400">{reading.primary.unit}</span>
                    </div>
                  )}
                  {liveMetrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
                      {liveMetrics.map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between bg-slate-800/40 rounded px-1.5 py-0.5">
                          <span className="text-slate-500">{METRIC_LABEL[k].label}</span>
                          <span className="text-cyan-300">
                            {Number(v).toFixed(1)}<span className="text-slate-500 ml-0.5">{METRIC_LABEL[k].unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(reading.battery !== null || reading.signal !== null) && (
                    <div className="mt-1.5 flex gap-3 text-[10px] text-slate-400">
                      {reading.battery !== null && (
                        <span className="flex items-center gap-1"><Battery size={10} />{reading.battery}%</span>
                      )}
                      {reading.signal !== null && (
                        <span className="flex items-center gap-1"><Signal size={10} />{reading.signal} dBm</span>
                      )}
                      {reading.device.devEui && (
                        <span className="font-mono text-slate-500 truncate">{reading.device.devEui}</span>
                      )}
                    </div>
                  )}
                </section>
              )}

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
                    <div className="font-mono text-emerald-400 truncate">
                      {reading?.device?.id ?? sensor.deviceId}
                    </div>
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
