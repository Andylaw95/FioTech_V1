import React, { useState, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { SafeChartContainer } from './SafeChartContainer';
import { api, type AlarmChartDay } from '@/app/utils/api';

// --- Donut Chart for System Health ---
const COLORS = ['#3b82f6', '#e2e8f0']; // blue-500, slate-200

export function HealthDonut({ online = 95, offline = 5 }: { online?: number; offline?: number }) {
  const dynamicData = [
    { name: 'Online', value: online },
    { name: 'Offline', value: offline },
  ];

  return (
    <div className="h-[200px] w-full relative flex items-center justify-center min-w-0">
      <SafeChartContainer>
        <PieChart>
          <Pie
            data={dynamicData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {dynamicData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
        </PieChart>
      </SafeChartContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-slate-900">{online}%</span>
        <span className="text-xs text-slate-500 font-medium">Online</span>
      </div>
    </div>
  );
}

// --- Alarm Bar Chart (now fetches from backend) ---
const FALLBACK_ALARM_DATA = [
  { name: 'Mon', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Tue', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Wed', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Thu', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Fri', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Sat', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
  { name: 'Sun', water: 0, smoke: 0, temperature: 0, deviceOffline: 0 },
];

export function AlarmBarChart({ data: externalData }: { data?: AlarmChartDay[] | null }) {
  const [internalData, setInternalData] = useState<AlarmChartDay[]>(FALLBACK_ALARM_DATA);

  // Use external data from Dashboard waterfall when provided.
  // Only fetch independently if rendered outside the Dashboard context.
  const data = externalData ?? internalData;

  useEffect(() => {
    // Skip internal fetch when Dashboard provides data via prop
    if (externalData !== undefined) return;
    api.getAlarmChartData()
      .then(setInternalData)
      .catch(err => {
        console.debug('Failed to fetch alarm chart data:', err);
      });
  }, [externalData]);

  return (
    <div className="h-[300px] w-full min-w-0">
      <SafeChartContainer>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="water" name="Water Leak" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="smoke" name="Smoke/Fire" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="temperature" name="Temperature" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="deviceOffline" name="Device Offline" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={16} />
        </BarChart>
      </SafeChartContainer>
    </div>
  );
}