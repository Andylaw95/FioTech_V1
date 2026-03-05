import React, { useState, useEffect } from 'react';
import { Zap, Droplets, Wind, ThermometerSun, Fan, Sun, Gauge, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { SafeChartContainer } from '@/app/components/SafeChartContainer';

// --- BMS Subsystem Types ---
// This interface mirrors what a Digital Twin provider API would return
export interface BMSSubsystem {
  id: string;
  name: string;
  category: 'hvac' | 'electrical' | 'water' | 'fire' | 'elevator';
  status: 'active' | 'standby' | 'warning' | 'offline';
  load: number; // 0-100
  consumption: string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  telemetry: { t: string; v: number }[];
}

// Deterministic seed generator for simulated telemetry
function generateTelemetry(seed: string, points: number, base: number, variance: number): { t: string; v: number }[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
  const result = [];
  for (let i = 0; i < points; i++) {
    hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
    const noise = (hash % 1000) / 1000;
    result.push({ t: `${i}`, v: base + (noise * variance * 2 - variance) });
  }
  return result;
}

// Generate BMS data seeded from property name (simulates what the Twin provider API returns)
export function generateBMSData(propertyName: string): BMSSubsystem[] {
  const seed = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i); return Math.abs(h); };
  const s = seed(propertyName);
  return [
    {
      id: 'bms-hvac-1', name: 'HVAC Chiller', category: 'hvac',
      status: (s % 10 > 7) ? 'warning' : 'active',
      load: 40 + (s % 45), consumption: `${300 + (s % 200)}`, unit: 'kWh', trend: 'up',
      telemetry: generateTelemetry(`${propertyName}-hvac`, 20, 350, 80),
    },
    {
      id: 'bms-hvac-2', name: 'Air Handling Unit', category: 'hvac',
      status: 'active',
      load: 30 + (s % 35), consumption: `${120 + (s % 80)}`, unit: 'kWh', trend: 'stable',
      telemetry: generateTelemetry(`${propertyName}-ahu`, 20, 140, 30),
    },
    {
      id: 'bms-elec-1', name: 'Main Lighting', category: 'electrical',
      status: 'active',
      load: 20 + (s % 50), consumption: `${80 + (s % 60)}`, unit: 'kWh', trend: 'down',
      telemetry: generateTelemetry(`${propertyName}-light`, 20, 100, 25),
    },
    {
      id: 'bms-elec-2', name: 'Solar Array', category: 'electrical',
      status: (s % 3 === 0) ? 'active' : 'standby',
      load: 60 + (s % 40), consumption: `-${200 + (s % 300)}`, unit: 'kWh', trend: 'up',
      telemetry: generateTelemetry(`${propertyName}-solar`, 20, 280, 100),
    },
    {
      id: 'bms-water-1', name: 'Water Supply', category: 'water',
      status: (s % 12 > 9) ? 'warning' : 'active',
      load: 50 + (s % 30), consumption: `${40 + (s % 30)}`, unit: 'PSI', trend: 'stable',
      telemetry: generateTelemetry(`${propertyName}-water`, 20, 55, 10),
    },
    {
      id: 'bms-elev-1', name: 'Elevator Bank', category: 'elevator',
      status: 'active',
      load: 5 + (s % 20), consumption: `${30 + (s % 40)}`, unit: 'kWh', trend: 'down',
      telemetry: generateTelemetry(`${propertyName}-elev`, 20, 45, 15),
    },
  ];
}

const categoryIcons: Record<string, React.ElementType> = {
  hvac: Fan, electrical: Zap, water: Droplets, fire: Wind, elevator: Gauge,
};
const categoryColors: Record<string, { bg: string; text: string; ring: string; fill: string }> = {
  hvac: { bg: 'bg-cyan-50', text: 'text-cyan-600', ring: 'ring-cyan-200', fill: '#06b6d4' },
  electrical: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-200', fill: '#f59e0b' },
  water: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-200', fill: '#3b82f6' },
  fire: { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200', fill: '#ef4444' },
  elevator: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-200', fill: '#8b5cf6' },
};

function MiniSparkline({ data, color }: { data: { t: string; v: number }[]; color: string }) {
  return (
    <div className="h-10 w-full">
      <SafeChartContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`bms-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#bms-grad-${color.replace('#', '')})`} />
        </AreaChart>
      </SafeChartContainer>
    </div>
  );
}

interface BMSPanelProps {
  propertyName: string;
}

export function BMSPanel({ propertyName }: BMSPanelProps) {
  const [subsystems, setSubsystems] = useState<BMSSubsystem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Replace with external Digital Twin API call
    // e.g., await digitalTwinProvider.getBMSData(propertyId)
    const data = generateBMSData(propertyName);
    setSubsystems(data);
    setSelectedSystem(null);
  }, [propertyName]);

  // Live telemetry simulation (would be WebSocket in real provider)
  useEffect(() => {
    const interval = setInterval(() => {
      setSubsystems(prev => prev.map(sys => ({
        ...sys,
        load: Math.max(0, Math.min(100, sys.load + (Math.random() * 6 - 3))),
        telemetry: [
          ...sys.telemetry.slice(1),
          { t: `${Date.now()}`, v: sys.telemetry[sys.telemetry.length - 1].v + (Math.random() * 10 - 5) }
        ],
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, [propertyName]);

  const totalConsumption = subsystems
    .filter(s => s.category !== 'water')
    .reduce((sum, s) => sum + Math.abs(parseFloat(s.consumption)), 0);

  const generating = subsystems.filter(s => parseFloat(s.consumption) < 0)
    .reduce((sum, s) => sum + Math.abs(parseFloat(s.consumption)), 0);

  const activeWarnings = subsystems.filter(s => s.status === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
          <p className="text-xs font-medium text-slate-500 uppercase">Consumption</p>
          <p className="text-lg font-bold text-slate-900 font-mono">{Math.round(totalConsumption)}</p>
          <p className="text-xs text-slate-400">kWh</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
          <p className="text-xs font-medium text-emerald-600 uppercase">Generating</p>
          <p className="text-lg font-bold text-emerald-700 font-mono">{Math.round(generating)}</p>
          <p className="text-xs text-emerald-500">kWh</p>
        </div>
        <div className={clsx(
          "rounded-xl border p-3 text-center col-span-2",
          activeWarnings > 0 ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"
        )}>
          <div className="flex items-center justify-between px-2">
            <div className="text-left">
              <p className={clsx("text-xs font-medium uppercase", activeWarnings > 0 ? "text-amber-600" : "text-blue-600")}>Alerts</p>
              <p className={clsx("text-xs", activeWarnings > 0 ? "text-amber-500" : "text-blue-400")}>{activeWarnings > 0 ? 'Action Required' : 'All Systems Normal'}</p>
            </div>
            <p className={clsx("text-2xl font-bold font-mono", activeWarnings > 0 ? "text-amber-700" : "text-blue-700")}>{activeWarnings}</p>
          </div>
        </div>
      </div>

      {/* Subsystem Cards */}
      <div className="space-y-2">
        {subsystems.map(sys => {
          const Icon = categoryIcons[sys.category] || Zap;
          const colors = categoryColors[sys.category] || categoryColors.electrical;
          const isSelected = selectedSystem === sys.id;
          const isGenerating = parseFloat(sys.consumption) < 0;

          return (
            <div key={sys.id}>
              <button
                onClick={() => setSelectedSystem(isSelected ? null : sys.id)}
                className={clsx(
                  "w-full rounded-xl border p-3 text-left transition-all",
                  isSelected ? "bg-white border-slate-300 shadow-md ring-1 ring-slate-200" : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm",
                  sys.status === 'warning' && "border-l-2 border-l-amber-400"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={clsx("p-1.5 rounded-lg", colors.bg, colors.text)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{sys.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{sys.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <span className={clsx("text-sm font-bold font-mono", isGenerating ? "text-emerald-600" : "text-slate-900")}>
                        {sys.consumption}
                      </span>
                      <span className="text-xs text-slate-400">{sys.unit}</span>
                      {sys.trend === 'up' && <TrendingUp className="h-3 w-3 text-red-400" />}
                      {sys.trend === 'down' && <TrendingDown className="h-3 w-3 text-emerald-400" />}
                    </div>
                  </div>
                </div>

                {/* Load Bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={clsx("h-full rounded-full transition-all duration-1000",
                        sys.status === 'warning' ? "bg-amber-400" : isGenerating ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${Math.min(100, sys.load)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(sys.load)}%</span>
                </div>
              </button>

              {/* Expanded telemetry */}
              {isSelected && (
                <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Telemetry (Last 20 intervals)</p>
                  <MiniSparkline data={sys.telemetry} color={colors.fill} />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Status: <span className={clsx(
                      "font-medium",
                      sys.status === 'active' ? "text-emerald-600" : sys.status === 'warning' ? "text-amber-600" : "text-slate-500"
                    )}>{sys.status}</span></span>
                    <span>Live data</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}