import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LucideIcon } from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  trend?: number;
  status?: 'normal' | 'warning' | 'critical';
  children?: React.ReactNode;
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  unit, 
  icon: Icon, 
  trend, 
  status = 'normal', 
  children,
  className 
}: StatCardProps) {
  
  const statusColors = {
    normal: 'text-slate-900',
    warning: 'text-amber-500',
    critical: 'text-red-500',
  };

  const trendColor = trend && trend > 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className={cn("rounded-2xl border border-slate-100 bg-white p-4 sm:p-6 shadow-sm transition-all hover:shadow-md", className)}>
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div>
          <p className="text-xs sm:text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={cn("text-xl sm:text-2xl font-semibold tracking-tight", statusColors[status])}>
              {value}
            </span>
            {unit && <span className="text-xs sm:text-sm font-medium text-slate-400">{unit}</span>}
          </div>
        </div>
        {Icon && (
          <div className={cn("rounded-full p-2 sm:p-2.5", 
            status === 'critical' ? "bg-red-50 text-red-500" : 
            status === 'warning' ? "bg-amber-50 text-amber-500" : 
            "bg-blue-50 text-blue-500"
          )}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        )}
      </div>
      
      {children}

      {trend !== undefined && (
        <div className="mt-4 flex items-center text-xs">
          <span className={cn("font-medium", trendColor)}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          <span className="ml-1 text-slate-400">from last hour</span>
        </div>
      )}
    </div>
  );
}