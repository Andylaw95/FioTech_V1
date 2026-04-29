import React from 'react';
import { Activity } from 'lucide-react';
import { AlarmTypePage, type AlarmTypeConfig } from '@/app/components/AlarmTypePage';

const vibrationConfig: AlarmTypeConfig = {
  type: 'vibration',
  title: 'Vibration Alarms',
  subtitle:
    'PPV / tilt / structural-movement compliance — Lai King Hospital AAA defaults (Alert 0.075 / Alarm 0.15 / Action 0.30 mm/s)',
  icon: <Activity className="h-7 w-7" />,
  filterFn: (alarm) => {
    const t = (alarm.type ?? '').toLowerCase();
    return (
      t.includes('vibration') ||
      t.includes('ppv') ||
      t.includes('tilt shift') ||
      t.includes('acceleration')
    );
  },
  theme: {
    primary: 'purple',
    bg: 'bg-gradient-to-br from-purple-50 via-fuchsia-50/50 to-white border-purple-100',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    accentGradientFrom: '#a855f7',
    accentGradientTo: '#d946ef',
    chartStroke: '#a855f7',
    chartFill: '#a855f7',
    badgeBg: 'bg-purple-500',
    badgeText: 'text-white',
    badgeRing: 'ring-purple-600/20',
    statusActiveBg: 'bg-purple-50',
    statusActiveText: 'text-purple-700',
    donutColor: '#a855f7',
  },
};

export function VibrationAlarms() {
  return <AlarmTypePage config={vibrationConfig} />;
}
