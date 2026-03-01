import React from 'react';
import { Flame } from 'lucide-react';
import { AlarmTypePage, type AlarmTypeConfig } from '@/app/components/AlarmTypePage';

const fireConfig: AlarmTypeConfig = {
  type: 'fire',
  title: 'Fire Alarms',
  subtitle: 'Track fire detection systems, sprinkler status, and emergency response readiness',
  icon: <Flame className="h-7 w-7" />,
  filterFn: (alarm) => {
    const t = alarm.type.toLowerCase();
    return t.includes('fire') || t.includes('heat') || t.includes('sprinkler');
  },
  theme: {
    primary: 'red',
    bg: 'bg-gradient-to-br from-red-50 via-orange-50/50 to-white border-red-100',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    accentGradientFrom: '#ef4444',
    accentGradientTo: '#f97316',
    chartStroke: '#ef4444',
    chartFill: '#ef4444',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    badgeRing: 'ring-red-600/20',
    statusActiveBg: 'bg-red-50',
    statusActiveText: 'text-red-700',
    donutColor: '#ef4444',
  },
};

export function FireAlarms() {
  return <AlarmTypePage config={fireConfig} />;
}
