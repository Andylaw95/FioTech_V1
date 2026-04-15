import React from 'react';
import { Droplets } from 'lucide-react';
import { AlarmTypePage, type AlarmTypeConfig } from '@/app/components/AlarmTypePage';

const waterConfig: AlarmTypeConfig = {
  type: 'water',
  title: 'Water Alarms',
  subtitle: 'Monitor water leak detection sensors and pipeline pressure across all properties',
  icon: <Droplets className="h-7 w-7" />,
  filterFn: (alarm) => {
    const t = (alarm.type ?? '').toLowerCase();
    return t.includes('water') || t.includes('leak') || t.includes('flood') || t.includes('moisture');
  },
  theme: {
    primary: 'blue',
    bg: 'bg-gradient-to-br from-blue-50 via-sky-50/50 to-white border-blue-100',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    accentGradientFrom: '#3b82f6',
    accentGradientTo: '#0ea5e9',
    chartStroke: '#3b82f6',
    chartFill: '#3b82f6',
    badgeBg: 'bg-blue-500',
    badgeText: 'text-white',
    badgeRing: 'ring-blue-600/20',
    statusActiveBg: 'bg-blue-50',
    statusActiveText: 'text-blue-700',
    donutColor: '#3b82f6',
  },
};

export function WaterAlarms() {
  return <AlarmTypePage config={waterConfig} />;
}
