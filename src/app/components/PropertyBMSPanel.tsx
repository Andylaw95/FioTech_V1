import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap, Droplets, Fan, Gauge, Sun, ThermometerSun,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Power, Settings2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { SafeChartContainer } from './SafeChartContainer';

// ── BMS Subsystem Types ──────────────────────────────────
interface BMSSubsystem {
  id: string;
  name: string;
  category: 'hvac' | 'electrical' | 'water' | 'fire' | 'elevator';
  status: 'active' | 'standby' | 'warning' | 'offline';
  load: number;
  consumption: string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  setpoint?: number;
  telemetry: { t: string; v: number }[];
}

// ── Telemetry generator ──────────────────────────────────
function generateTelemetry(seed: string, points: number, base: number, variance: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
  const result = [];
  for (let i = 0; i < points; i++) {
    hash = ((hash * 1103515245) + 12345) & 0x7fffffff;
    const noise = (hash % 1000) / 1000;
    result.push({ t: `${String(i).padStart(2, '0')}:00`, v: +(base + (noise * variance * 2 - variance)).toFixed(1) });
  }
  return result;
}

function generateBMSData(propertyName: string): BMSSubsystem[] {
  const seed = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i); return Math.abs(h); };
  const s = seed(propertyName);
  return [
    {
      id: 'hvac-chiller', name: 'HVAC Central Chiller', category: 'hvac',
      status: (s % 10 > 7) ? 'warning' : 'active', load: 40 + (s % 45),
      consumption: `${300 + (s % 200)}`, unit: 'kWh', trend: 'up', setpoint: 22,
      telemetry: generateTelemetry(`${propertyName}-hvac`, 24, 350, 80),
    },
    {
      id: 'hvac-ahu', name: 'Air Handling Unit', category: 'hvac',
      status: 'active', load: 30 + (s % 35),
      consumption: `${120 + (s % 80)}`, unit: 'kWh', trend: 'stable', setpoint: 23,
      telemetry: generateTelemetry(`${propertyName}-ahu`, 24, 140, 30),
    },
    {
      id: 'elec-main', name: 'Main Power Distribution', category: 'electrical',
      status: 'active', load: 55 + (s % 30),
      consumption: `${450 + (s % 200)}`, unit: 'kWh', trend: 'stable',
      telemetry: generateTelemetry(`${propertyName}-elec`, 24, 500, 100),
    },
    {
      id: 'elec-lighting', name: 'Lighting Control', category: 'electrical',
      status: 'active', load: 20 + (s % 50),
      consumption: `${80 + (s % 60)}`, unit: 'kWh', trend: 'down',
      telemetry: generateTelemetry(`${propertyName}-light`, 24, 100, 25),
    },
    {
      id: 'elec-solar', name: 'Solar Array', category: 'electrical',
      status: (s % 3 === 0) ? 'active' : 'standby', load: 60 + (s % 40),
      consumption: `-${200 + (s % 300)}`, unit: 'kWh', trend: 'up',
      telemetry: generateTelemetry(`${propertyName}-solar`, 24, 280, 100),
    },
    {
      id: 'water-main', name: 'Water Supply & Pumps', category: 'water',
      status: (s % 12 > 9) ? 'warning' : 'active', load: 50 + (s % 30),
      consumption: `${40 + (s % 30)}`, unit: 'PSI', trend: 'stable',
      telemetry: generateTelemetry(`${propertyName}-water`, 24, 55, 10),
    },
    {
      id: 'fire-main', name: 'Fire Suppression', category: 'fire',
      status: 'standby', load: 0,
      consumption: '0', unit: 'kWh', trend: 'stable',
      telemetry: generateTelemetry(`${propertyName}-fire`, 24, 0, 0),
    },
    {
      id: 'elev-bank', name: 'Elevator Bank', category: 'elevator',
      status: 'active', load: 5 + (s % 20),
      consumption: `${30 + (s % 40)}`, unit: 'kWh', trend: 'down',
      telemetry: generateTelemetry(`${propertyName}-elev`, 24, 45, 15),
    },
  ];
}

// ── Category configs ─────────────────────────────────────
const categoryIcons: Record<string, React.ElementType> = {
  hvac: Fan, electrical: Zap, water: Droplets, fire: ThermometerSun, elevator: Gauge,
};
const categoryColors: Record<string, { bg: string; text: string; fill: string; light: string }> = {
  hvac:       { bg: 'bg-cyan-50',   text: 'text-cyan-600',   fill: '#06b6d4', light: 'bg-cyan-100' },
  electrical: { bg: 'bg-amber-50',  text: 'text-amber-600',  fill: '#f59e0b', light: 'bg-amber-100' },
  water:      { bg: 'bg-blue-50',   text: 'text-blue-600',   fill: '#3b82f6', light: 'bg-blue-100' },
  fire:       { bg: 'bg-red-50',    text: 'text-red-600',    fill: '#ef4444', light: 'bg-red-100' },
  elevator:   { bg: 'bg-violet-50', text: 'text-violet-600', fill: '#8b5cf6', light: 'bg-violet-100' },
};

const tooltipStyle = {
  borderRadius: '10px', border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12,
};

// ── Full-size BMS Panel for Property Page ────────────────
interface PropertyBMSPanelProps {
  propertyName: string;
}

export function PropertyBMSPanel({ propertyName }: PropertyBMSPanelProps) {
  const [subsystems, setSubsystems] = useState<BMSSubsystem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    setSubsystems(generateBMSData(propertyName));
    setExpandedId(null);
    setCategoryFilter('all');
  }, [propertyName]);

  // Live telemetry tick
  useEffect(() => {
    const interval = setInterval(() => {
      setSubsystems(prev => prev.map(sys => ({
        ...sys,
        load: Math.max(0, Math.min(100, sys.load + (Math.random() * 4 - 2))),
        telemetry: [
          ...sys.telemetry.slice(1),
          { t: `${Date.now()}`, v: sys.telemetry[sys.telemetry.length - 1].v + (Math.random() * 8 - 4) },
        ],
      })));
    }, 4000);
    return () => clearInterval(interval);
  }, [propertyName]);

  const totalConsumption = subsystems
    .filter(s => s.category !== 'water' && parseFloat(s.consumption) > 0)
    .reduce((sum, s) => sum + parseFloat(s.consumption), 0);

  const generating = subsystems
    .filter(s => parseFloat(s.consumption) < 0)
    .reduce((sum, s) => sum + Math.abs(parseFloat(s.consumption)), 0);

  const netConsumption = totalConsumption - generating;

  const activeWarnings = subsystems.filter(s => s.status === 'warning').length;
  const systemsOnline = subsystems.filter(s => s.status === 'active' || s.status === 'standby').length;

  const categories = useMemo(() => {
    const cats = new Set(subsystems.map(s => s.category));
    return ['all', ...Array.from(cats).sort()];
  }, [subsystems]);

  const filteredSystems = categoryFilter === 'all'
    ? subsystems
    : subsystems.filter(s => s.category === categoryFilter);

  // Hourly energy consumption bar chart data
  const energyBarData = useMemo(() => {
    const nonWaterSystems = subsystems.filter(s => s.category !== 'water' && s.category !== 'fire');
    return Array.from({ length: 24 }, (_, h) => {
      let total = 0;
      nonWaterSystems.forEach(sys => {
        if (sys.telemetry[h]) total += Math.abs(sys.telemetry[h].v);
      });
      return { hour: `${String(h).padStart(2, '0')}`, value: Math.round(total) };
    });
  }, [subsystems]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Consumption</p>
          <p className="text-2xl font-bold font-mono mt-1">{Math.round(netConsumption)}</p>
          <p className="text-xs text-slate-400">kWh total</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 text-white">
          <p className="text-xs font-medium text-emerald-200 uppercase tracking-wider">Generating</p>
          <p className="text-2xl font-bold font-mono mt-1">{Math.round(generating)}</p>
          <p className="text-xs text-emerald-200">kWh (solar)</p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Systems Online</p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">{systemsOnline}/{subsystems.length}</p>
          <p className="text-xs text-emerald-600 font-medium">Operational</p>
        </div>
        <div className={clsx(
          "rounded-xl border p-4",
          activeWarnings > 0 ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"
        )}>
          <p className={clsx("text-xs font-medium uppercase tracking-wider", activeWarnings > 0 ? "text-amber-600" : "text-blue-600")}>
            Active Alerts
          </p>
          <p className={clsx("text-2xl font-bold font-mono mt-1", activeWarnings > 0 ? "text-amber-700" : "text-blue-700")}>
            {activeWarnings}
          </p>
          <p className={clsx("text-xs font-medium", activeWarnings > 0 ? "text-amber-500" : "text-blue-500")}>
            {activeWarnings > 0 ? 'Needs attention' : 'All clear'}
          </p>
        </div>
      </div>

      {/* Energy consumption chart */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Energy Consumption (24h)</h4>
            <p className="text-xs text-slate-500">Combined load across all electrical systems</p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
        <div className="h-[200px] w-full">
          <SafeChartContainer>
            <BarChart data={energyBarData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} kWh`, 'Total Load']} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={10}>
                {energyBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.value > 800 ? '#ef4444' : entry.value > 500 ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </SafeChartContainer>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors capitalize",
              categoryFilter === cat ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Subsystem cards */}
      <div className="space-y-3">
        {filteredSystems.map(sys => {
          const Icon = categoryIcons[sys.category] || Zap;
          const colors = categoryColors[sys.category] || categoryColors.electrical;
          const isExpanded = expandedId === sys.id;
          const isGenerating = parseFloat(sys.consumption) < 0;

          return (
            <div key={sys.id} className={clsx(
              "rounded-xl border bg-white transition-all overflow-hidden",
              isExpanded ? "border-blue-200 shadow-lg ring-1 ring-blue-100" : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
              sys.status === 'warning' && "border-l-4 border-l-amber-400"
            )}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : sys.id)}
                className="w-full text-left p-4 flex items-center gap-4"
              >
                <div className={clsx("p-2.5 rounded-xl shrink-0", colors.bg, colors.text)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{sys.name}</p>
                    <span className={clsx(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      sys.status === 'active' ? "bg-emerald-50 text-emerald-700" :
                      sys.status === 'standby' ? "bg-blue-50 text-blue-700" :
                      sys.status === 'warning' ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-600"
                    )}>
                      {sys.status === 'active' && <CheckCircle2 className="h-3 w-3" />}
                      {sys.status === 'warning' && <AlertTriangle className="h-3 w-3" />}
                      {sys.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 capitalize mt-0.5">{sys.category}</p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="flex items-center gap-1 justify-end">
                    <span className={clsx("text-lg font-bold font-mono", isGenerating ? "text-emerald-600" : "text-slate-900")}>
                      {sys.consumption}
                    </span>
                    <span className="text-xs text-slate-400">{sys.unit}</span>
                    {sys.trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-red-400 ml-1" />}
                    {sys.trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-emerald-400 ml-1" />}
                    {sys.trend === 'stable' && <Minus className="h-3.5 w-3.5 text-slate-300 ml-1" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 justify-end">
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx("h-full rounded-full transition-all duration-1000",
                          sys.status === 'warning' ? "bg-amber-400" : isGenerating ? "bg-emerald-500" : "bg-blue-500"
                        )}
                        style={{ width: `${Math.min(100, sys.load)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400 w-7 text-right">{Math.round(sys.load)}%</span>
                  </div>
                </div>
                <div className="shrink-0 text-slate-400">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-6 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                  {/* Mobile stats */}
                  <div className="sm:hidden flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                    <div>
                      <span className={clsx("text-lg font-bold font-mono", isGenerating ? "text-emerald-600" : "text-slate-900")}>
                        {sys.consumption}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{sys.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={clsx("h-full rounded-full", sys.status === 'warning' ? "bg-amber-400" : "bg-blue-500")} style={{ width: `${Math.min(100, sys.load)}%` }} />
                      </div>
                      <span className="text-xs font-mono text-slate-500">{Math.round(sys.load)}%</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap gap-2">
                    {sys.status !== 'standby' && sys.category !== 'fire' && (
                      <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors">
                        <Power className="h-3.5 w-3.5" />
                        {sys.status === 'active' ? 'Set Standby' : 'Activate'}
                      </button>
                    )}
                    {sys.setpoint !== undefined && (
                      <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-white border border-slate-200">
                        <ThermometerSun className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-slate-600">Setpoint:</span>
                        <span className="font-bold text-slate-900">{sys.setpoint}°C</span>
                        <button className="text-blue-600 hover:text-blue-800 text-xs font-medium ml-1">Adjust</button>
                      </div>
                    )}
                    <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                      <Settings2 className="h-3.5 w-3.5" />
                      Configure
                    </button>
                  </div>

                  {/* Telemetry chart */}
                  <div className="rounded-xl bg-white border border-slate-200 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      24h Telemetry — {sys.name}
                    </p>
                    <div className="h-32 w-full">
                      <SafeChartContainer>
                        <AreaChart data={sys.telemetry} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                          <defs>
                            <linearGradient id={`bms-detail-${sys.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={colors.fill} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={colors.fill} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${Math.round(v)} ${sys.unit}`, sys.name]} />
                          <Area type="monotone" dataKey="v" stroke={colors.fill} strokeWidth={2} fill={`url(#bms-detail-${sys.id})`} dot={false} />
                        </AreaChart>
                      </SafeChartContainer>
                    </div>
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
