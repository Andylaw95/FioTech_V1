import React from 'react';
import { Wind } from 'lucide-react';
import { AlarmTypePage, type AlarmTypeConfig } from '@/app/components/AlarmTypePage';

const smokeConfig: AlarmTypeConfig = {
  type: 'smoke',
  title: 'Smoke Alarms',
  subtitle: 'Monitor smoke detection sensors, air quality alerts, and ventilation system warnings',
  icon: <Wind className="h-7 w-7" />,
  filterFn: (alarm) => {
    const t = (alarm.type ?? '').toLowerCase();
    return t.includes('smoke') || t.includes('air quality') || t.includes('ventilation');
  },
  theme: {
    primary: 'slate',
    bg: 'bg-gradient-to-br from-slate-100 via-gray-50/50 to-white border-slate-200',
    iconBg: 'bg-slate-200',
    iconColor: 'text-slate-700',
    accentGradientFrom: '#64748b',
    accentGradientTo: '#94a3b8',
    chartStroke: '#64748b',
    chartFill: '#64748b',
    badgeBg: 'bg-slate-500',
    badgeText: 'text-white',
    badgeRing: 'ring-slate-600/20',
    statusActiveBg: 'bg-slate-50',
    statusActiveText: 'text-slate-700',
    donutColor: '#64748b',
  },
};

export function SmokeAlarms() {
  return <AlarmTypePage config={smokeConfig} />;
}
