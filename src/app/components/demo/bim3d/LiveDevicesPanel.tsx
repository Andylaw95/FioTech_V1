import { useState } from 'react';
import { Radio, RotateCcw, X, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { type Sensor, severityColor, type Severity } from './mockData';
import type { LiveReading } from './useLiveDeviceStream';
import type { ZoneLabel } from './zoneLabels';

interface Props {
  sensors: Sensor[];
  severityById: Map<string, Severity>;
  readings: Map<string, LiveReading>;
  selectedId?: string | null;
  customIds: Set<string>;
  placementId: string | null;
  onSelect: (id: string) => void;
  onStartPlace: (id: string) => void;
  onCancelPlace: () => void;
  onClearPlace: (id: string) => void;
  onResetAll: () => void;
  /** When true, render as a normal flow block (for embedding in a sidebar). Default false = floating overlay. */
  inline?: boolean;
  /** Override theme for embedding on a light background. */
  theme?: 'dark' | 'light';
  /** Available zone labels (used by the "Assign to zone" dropdown). */
  zones?: ZoneLabel[];
  /** Map of sensor id → assigned zone label (if any). */
  zoneBySensorId?: Map<string, ZoneLabel>;
  /** Called when a sensor is assigned to a zone (or unassigned with null). */
  onAssignZone?: (sensorId: string, zoneId: string | null) => void;
}

export function LiveDevicesPanel({
  sensors,
  severityById,
  readings,
  selectedId,
  customIds,
  placementId,
  onSelect,
  onStartPlace,
  onCancelPlace,
  onClearPlace,
  onResetAll,
  inline = false,
  theme = 'dark',
  zones = [],
  zoneBySensorId,
  onAssignZone,
}: Props) {
  const [open, setOpen] = useState(true);
  const isLight = theme === 'light';

  if (!inline && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute z-30 top-1/2 right-3 -translate-y-1/2 px-2 py-3 rounded-l-lg
                   bg-slate-900/90 border border-slate-700 text-white shadow-lg backdrop-blur
                   hover:bg-slate-800 transition pointer-events-auto"
        title="Show devices"
      >
        <Radio className="h-4 w-4" />
      </button>
    );
  }

  const containerClass = inline
    ? `rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/92 border-slate-700 backdrop-blur-md'} shadow-sm flex flex-col ${isLight ? 'text-slate-800' : 'text-white'}`
    : `absolute z-30 top-16 right-3 bottom-3 w-[280px] rounded-xl
       bg-slate-900/92 border border-slate-700 backdrop-blur-md shadow-2xl
       flex flex-col text-white pointer-events-auto`;

  return (
    <div
      className={containerClass}
      style={inline ? { maxHeight: 480 } : undefined}
      onPointerDown={inline ? undefined : (e) => e.stopPropagation()}
      onWheel={inline ? undefined : (e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${isLight ? 'border-slate-200' : 'border-slate-700/60'}`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-3.5 w-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
          <span className="text-[12px] font-semibold tracking-wide">Live Devices</span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{sensors.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onResetAll}
            disabled={customIds.size === 0}
            className={`p-1 rounded ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'} disabled:opacity-30 disabled:hover:bg-transparent`}
            title="Reset all sensor positions to defaults"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          {!inline && (
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-slate-800"
              title="Hide panel"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {sensors.map((s) => {
          const r = readings.get(s.id);
          const sev = severityById.get(s.id) ?? 'normal';
          const color = severityColor(sev);
          const isSel = selectedId === s.id;
          const isCustom = customIds.has(s.id);
          const online = r?.online ?? false;
          const rowSelClass = isLight
            ? (isSel ? 'bg-cyan-50 border-cyan-400' : 'border-transparent hover:bg-slate-50')
            : (isSel ? 'bg-cyan-500/15 border-cyan-400' : 'border-transparent hover:bg-slate-800/60');
          return (
            <div
              key={s.id}
              className={`group px-3 py-2 border-l-2 cursor-pointer transition ${rowSelClass}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold truncate">{s.type}</span>
                    {online ? (
                      <Wifi className={`h-2.5 w-2.5 flex-shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                    ) : (
                      <WifiOff className={`h-2.5 w-2.5 flex-shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{s.name}</div>
                  {zoneBySensorId?.get(s.id) && (
                    <div
                      className={`text-[10px] truncate font-medium ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}
                      title={`Assigned to ${zoneBySensorId.get(s.id)?.customName}`}
                    >
                      📍 {zoneBySensorId.get(s.id)?.customName}
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span
                      className="text-[12px] font-mono tabular-nums"
                      style={{ color: online ? color : (isLight ? '#94a3b8' : '#64748b') }}
                    >
                      {r?.primary
                        ? `${r.primary.value.toFixed(1)} ${r.primary.unit}`
                        : online
                          ? '—'
                          : 'offline'}
                    </span>
                    <ChevronRight className={`h-3 w-3 ${isLight ? 'text-slate-300 group-hover:text-slate-600' : 'text-slate-600 group-hover:text-slate-300'}`} />
                  </div>
                </div>
              </div>
              {(onAssignZone && zones.length > 0) || isCustom ? (
                <div className="mt-1 ml-4 flex items-center gap-2 text-[10px] flex-wrap">
                  {onAssignZone && zones.length > 0 && (
                    <select
                      value={zoneBySensorId?.get(s.id)?.id ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        const v = e.target.value;
                        onAssignZone(s.id, v === '' ? null : v);
                      }}
                      className={`text-[10px] py-0.5 px-1 rounded border outline-none ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                      }`}
                      title="Assign device to a zone label"
                    >
                      <option value="">— No zone —</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.customName ?? `Zone ${z.id.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {isCustom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearPlace(s.id);
                      }}
                      className={`underline ${isLight ? 'text-slate-500 hover:text-amber-600' : 'text-slate-500 hover:text-amber-300'}`}
                      title="Reset to default position"
                    >
                      reset position
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
