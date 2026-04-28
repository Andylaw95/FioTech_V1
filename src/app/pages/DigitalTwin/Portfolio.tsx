// Portfolio map — Leaflet-backed map of all properties with per-pin alarm KPIs.
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router';
import { AlertTriangle, Activity, Flame, Droplets, Cloud, RefreshCw } from 'lucide-react';
import { api, type Property, type PropertyGeo } from '@/app/utils/api';
import { resolvePropertyLatLng, HK_MAP_DEFAULTS } from './propertyCoords';
import { usePortfolioStream, type PropertyAlarmSummary } from './usePortfolioStream';

function makePinIcon(summary?: PropertyAlarmSummary): L.DivIcon {
  const hasCritical = summary?.hasCritical;
  const pending = summary?.pending ?? 0;
  const color = hasCritical ? '#ef4444' : pending > 0 ? '#f59e0b' : '#10b981';
  const badge =
    pending > 0
      ? `<span style="position:absolute;top:-6px;right:-6px;background:${color};color:white;border-radius:999px;min-width:18px;height:18px;padding:0 5px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.4);">${pending}</span>`
      : '';
  const ring = hasCritical
    ? 'box-shadow:0 0 0 4px rgba(239,68,68,0.35),0 4px 8px rgba(0,0,0,0.4);animation:pin-pulse 1.4s ease-in-out infinite;'
    : 'box-shadow:0 4px 8px rgba(0,0,0,0.4);';
  const html = `
    <div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;${ring}"></div>
      ${badge}
    </div>`;
  return L.divIcon({
    html,
    className: 'portfolio-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

if (typeof document !== 'undefined' && !document.getElementById('portfolio-pin-style')) {
  const s = document.createElement('style');
  s.id = 'portfolio-pin-style';
  s.textContent = `
    @keyframes pin-pulse {
      0%,100% { box-shadow:0 0 0 4px rgba(239,68,68,0.35),0 4px 8px rgba(0,0,0,0.4); }
      50%     { box-shadow:0 0 0 10px rgba(239,68,68,0),0 4px 8px rgba(0,0,0,0.4); }
    }
    .portfolio-pin { background:transparent !important; border:none !important; }
  `;
  document.head.appendChild(s);
}

function FitToProperties({ positions }: { positions: L.LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, positions]);
  return null;
}

function AlarmIcon({ type, className }: { type?: string; className?: string }) {
  if (type === 'water') return <Droplets className={className} />;
  if (type === 'fire') return <Flame className={className} />;
  if (type === 'smoke') return <Cloud className={className} />;
  return <AlertTriangle className={className} />;
}

export function Portfolio() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [geos, setGeos] = useState<PropertyGeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const stream = usePortfolioStream();
  // Phone: bottom-sheet alarms collapsed by default; desktop: always shown.
  const [alarmsOpen, setAlarmsOpen] = useState(false);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const [props, geoResp] = await Promise.all([
        api.getProperties(),
        api.getPropertyGeos().catch(() => ({ geos: [] as PropertyGeo[] })),
      ]);
      setProperties(Array.isArray(props) ? props : []);
      setGeos(geoResp?.geos || []);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProperties();
  }, []);

  const placed = useMemo(() => {
    return properties.map((p) => {
      const { lat, lng, source } = resolvePropertyLatLng(p, geos);
      const summary = stream.summaryByProperty[p.id];
      return { property: p, lat, lng, source, summary };
    });
  }, [properties, geos, stream.summaryByProperty]);

  const positions: L.LatLngExpression[] = useMemo(
    () => placed.map((x) => [x.lat, x.lng] as [number, number]),
    [placed],
  );

  const feed = stream.alarms.slice(0, 8);

  return (
    <div className="relative h-[calc(100vh-5rem)] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="absolute left-0 right-0 top-0 z-[500] flex items-center justify-between gap-2 sm:gap-4 bg-gradient-to-b from-slate-950/95 to-transparent px-3 sm:px-5 py-2 sm:py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-lg font-semibold text-white truncate">Intelligent Operations Centre</h1>
          <p className="text-[10px] sm:text-xs text-slate-400 truncate">
            {properties.length} properties · {stream.globalPending} pending
            {stream.globalCritical > 0 && (
              <span className="ml-1.5 rounded bg-red-600/20 px-1.5 py-0.5 text-red-400">
                {stream.globalCritical} critical
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            loadProperties();
            stream.refresh();
          }}
          className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 sm:px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <MapContainer
        center={[HK_MAP_DEFAULTS.center.lat, HK_MAP_DEFAULTS.center.lng]}
        zoom={HK_MAP_DEFAULTS.zoom}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: '#0b1220' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitToProperties positions={positions} />
        {placed.map((x) => (
          <Marker
            key={x.property.id}
            position={[x.lat, x.lng]}
            icon={makePinIcon(x.summary)}
            eventHandlers={{
              click: () => navigate(`/digital-twin-v2/${encodeURIComponent(x.property.id)}`),
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95} className="!bg-slate-900 !text-white !border-slate-700">
              <div className="min-w-[180px]">
                <div className="text-sm font-semibold">{x.property.name}</div>
                <div className="text-xs text-slate-300">{x.property.location || x.property.type || ''}</div>
                <div className="mt-1 text-xs">
                  <span className="text-slate-400">Pending: </span>
                  <span className="font-medium text-white">{x.summary?.pending ?? 0}</span>
                  {x.summary?.hasCritical && (
                    <span className="ml-2 rounded bg-red-600/30 px-1.5 py-0.5 text-red-300">critical</span>
                  )}
                </div>
                {x.source !== 'geo' && (
                  <div className="mt-1 text-[10px] text-slate-500">coord: {x.source}</div>
                )}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Alarms panel: floating right card on desktop, collapsible bottom sheet on phone */}
      <div className="absolute z-[500]
        right-4 top-16 w-[320px]
        max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-2 max-sm:w-auto">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm shadow-lg">
          <button
            onClick={() => setAlarmsOpen(o => !o)}
            className="flex w-full items-center gap-2 border-b border-slate-800 px-3 sm:px-4 py-2 text-left sm:cursor-default"
          >
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold text-white">Live Safety Alarms</span>
            <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
              {stream.loading && <span>loading…</span>}
              <span className="sm:hidden">{alarmsOpen ? '▾' : '▸'}</span>
            </span>
          </button>
          <div className={`max-h-[50vh] max-sm:max-h-[35vh] overflow-y-auto divide-y divide-slate-800 ${alarmsOpen ? '' : 'hidden sm:block'}`}>
            {feed.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                No safety alarms — all clear ✓
              </div>
            )}
            {feed.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  navigate(
                    `/digital-twin-v2/${encodeURIComponent(a.property_id)}?alarm=${a.id}`,
                  )
                }
                className="w-full px-3 sm:px-4 py-2 text-left hover:bg-slate-800/60"
              >
                <div className="flex items-start gap-2">
                  <AlarmIcon
                    type={a.alarm_type}
                    className={`mt-0.5 h-4 w-4 ${
                      a.alarm_type === 'fire'
                        ? 'text-red-400'
                        : a.alarm_type === 'smoke'
                        ? 'text-amber-400'
                        : 'text-sky-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white capitalize">
                        {a.alarm_type}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          a.status === 'pending'
                            ? 'bg-red-600/20 text-red-300'
                            : a.status === 'resolved'
                            ? 'bg-emerald-600/20 text-emerald-300'
                            : 'bg-amber-600/20 text-amber-300'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-slate-300">
                      {a.property_name || a.property_id}
                    </div>
                    <div className="truncate text-[10px] text-slate-500">
                      {a.location_text || a.device_name || a.device_id} ·{' '}
                      {new Date(a.occurred_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="absolute bottom-4 left-4 z-[500] rounded-md border border-red-800 bg-red-900/70 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      {loading && properties.length === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-950/80 text-sm text-slate-400">
          Loading portfolio…
        </div>
      )}
    </div>
  );
}

export default Portfolio;
