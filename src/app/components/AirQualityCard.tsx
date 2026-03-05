import React from 'react';
import { 
  Wind, 
  CloudFog, 
  Thermometer, 
  Droplets, 
  WifiOff,
  ArrowRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router';

interface AirQualityProps {
  propertyId: string;
  propertyName: string;
  aqi: number | null;
  co2: number | null;
  pm25: number | null;
  voc: number | null;
  temperature: number | null;
  humidity: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  sensorCount?: number;
  sensorsOnline?: number;
}

export function AirQualityCard({ 
  propertyId,
  propertyName, 
  aqi, 
  co2, 
  pm25, 
  voc, 
  temperature, 
  humidity,
  trend,
  sensorCount,
  sensorsOnline,
}: AirQualityProps) {
  
  // Sensor is offline only if ALL readings are null (not just AQI)
  const isOffline = aqi == null && co2 == null && pm25 == null && temperature == null && humidity == null;

  // AQI Color Logic
  const getStatusColor = (val: number) => {
    if (val <= 50) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Good' };
    if (val <= 100) return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Moderate' };
    return { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Unhealthy' };
  };

  const status = isOffline
    ? { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Offline' }
    : getStatusColor(aqi);

  return (
    <div className={clsx(
      "rounded-2xl border bg-white p-5 shadow-sm transition-shadow",
      isOffline ? "border-slate-200 opacity-75" : "border-slate-200 hover:shadow-md"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-semibold text-slate-900 line-clamp-1">{propertyName}</h4>
          <p className="text-xs text-slate-500">Air Quality Index</p>
        </div>
        <div className={clsx("px-2.5 py-0.5 rounded-full text-xs font-medium border", status.bg, status.text, status.border)}>
          {status.label}
        </div>
      </div>

      {isOffline ? (
        <div className="flex flex-col items-center justify-center py-4 mb-2">
          <WifiOff className="h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-500">Sensors Offline</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {sensorCount ?? 0} IAQ sensor{(sensorCount ?? 0) !== 1 ? 's' : ''} &middot; 0 online
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-6">
            <span className={clsx("text-4xl font-bold tracking-tight", status.text)}>{aqi}</span>
            <span className="text-sm text-slate-400 mb-1 font-medium">US AQI</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* CO2 */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Wind className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wide">CO2</span>
              </div>
              <div className="text-sm font-semibold text-slate-900">{co2 ?? '—'} <span className="text-xs text-slate-400 font-normal">ppm</span></div>
            </div>

            {/* PM2.5 */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <CloudFog className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wide">PM2.5</span>
              </div>
              <div className="text-sm font-semibold text-slate-900">{pm25 ?? '—'} <span className="text-xs text-slate-400 font-normal">µg/m³</span></div>
            </div>

            {/* Temp */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Thermometer className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wide">Temp</span>
              </div>
              <div className="text-sm font-semibold text-slate-900">{temperature != null ? `${temperature}°C` : '—'}</div>
            </div>

            {/* Humidity */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Droplets className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wide">Hum</span>
              </div>
              <div className="text-sm font-semibold text-slate-900">{humidity != null ? `${humidity}%` : '—'}</div>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100">
         <Link to={`/buildings/${propertyId}`} className="flex items-center justify-between text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors group">
            <span>
              {sensorCount ?? 0} IAQ Sensor{(sensorCount ?? 0) !== 1 ? 's' : ''}
              {sensorsOnline != null && ` · ${sensorsOnline} online`}
            </span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
         </Link>
      </div>
    </div>
  );
}
