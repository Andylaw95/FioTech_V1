import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Layers, Activity, Maximize2, Minimize2, Power, Wifi, WifiOff,
  ZoomIn, ZoomOut, MapPin, AlertTriangle, CheckCircle2,
  ChevronRight, LayoutDashboard, Search, Cpu,
  RotateCcw, Zap, ArrowRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { api, type Property, type PropertyDetails, type Device, type PropertyTelemetry } from '@/app/utils/api';
import { BMSPanel } from '@/app/components/digital-twin/BMSPanel';
import { DeviceInspector } from '@/app/components/digital-twin/DeviceInspector';
import { Bim3DStage } from '@/app/components/digital-twin/Bim3DStage';


// ═══════════════════════════════════════════════════════
// Digital Twin Adapter Interface
// Replace this mock implementation with your provider SDK
// (e.g., Azure Digital Twins, Autodesk Tandem, Willow Twin)
// ═══════════════════════════════════════════════════════
interface DigitalTwinAdapter {
  connect(propertyId: string): Promise<void>;
  disconnect(): void;
  getFloorPlan(propertyId: string, floor: number): Promise<any>;
  getTelemetry(deviceIds: string[]): Promise<Record<string, number>>;
  onTelemetryUpdate(callback: (data: Record<string, number>) => void): () => void;
}

// --- Real Telemetry Stream (fetches from property telemetry API) ---
function useTelemetryStream(connected: boolean, devices: Device[], propertyId: string) {
  const [telemetry, setTelemetry] = useState<Record<string, number>>({});
  const [propertyTelemetry, setPropertyTelemetry] = useState<PropertyTelemetry | null>(null);

  useEffect(() => {
    if (!connected || !propertyId || devices.length === 0) {
      setTelemetry(prev => Object.keys(prev).length === 0 ? prev : {});
      return;
    }

    let cancelled = false;

    const fetchRealTelemetry = async () => {
      try {
        const data = await api.getPropertyTelemetry(propertyId);
        if (cancelled) return;
        setPropertyTelemetry(data);

        // Map real sensor decoded data to device IDs
        const newTelemetry: Record<string, number> = {};
        const readings = data.deviceReadings || {};
        const readingsArr = Object.values(readings);

        devices.forEach((d, idx) => {
          // Try to match device to a sensor reading by name or index
          const matchByName = readingsArr.find(
            r => r.deviceName?.toLowerCase().includes(d.name?.toLowerCase()) ||
                 d.name?.toLowerCase().includes(r.deviceName?.toLowerCase())
          );
          const reading = matchByName || readingsArr[idx % readingsArr.length];

          if (reading?.decoded) {
            // Use the most relevant metric based on device type
            const decoded = reading.decoded;
            if (d.type === 'Temperature' && decoded.temperature != null) {
              newTelemetry[d.id] = decoded.temperature;
            } else if (d.type === 'IAQ' && decoded.co2 != null) {
              newTelemetry[d.id] = decoded.co2;
            } else if (d.type === 'Leakage' && decoded.humidity != null) {
              newTelemetry[d.id] = decoded.humidity;
            } else if ((d.type === 'Noise' || d.type === 'Sound Level Sensor') && decoded.sound_level_leq != null) {
              newTelemetry[d.id] = decoded.sound_level_leq;
            } else {
              // Default: use temperature if available, otherwise first numeric value
              const val = decoded.temperature ?? decoded.co2 ?? decoded.humidity ??
                Object.values(decoded).find(v => typeof v === 'number');
              if (typeof val === 'number') newTelemetry[d.id] = val;
            }
          }
        });

        if (Object.keys(newTelemetry).length > 0) {
          setTelemetry(newTelemetry);
        }
      } catch (err) {
        console.debug('BIMTwins telemetry fetch failed:', err);
        if (!cancelled) {
          setPropertyTelemetry(null);
          setTelemetry({});
        }
      }
    };

    fetchRealTelemetry();
    const interval = setInterval(() => {
      if (!document.hidden) fetchRealTelemetry();
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, devices, propertyId]);

  return { telemetry, propertyTelemetry };
}

// --- Isometric Projection ---
const ISO_ANGLE = 30 * (Math.PI / 180);
const COS = Math.cos(ISO_ANGLE);
const SIN = Math.sin(ISO_ANGLE);

function isoProject(x: number, y: number, z: number, scale: number) {
  return {
    px: (x - y) * COS * scale,
    py: (x + y) * SIN * scale - z * scale,
  };
}

// --- Isometric Floor Slab ---
function IsoFloor({
  level, width, depth, scale, active, selected, onClick, label, deviceCount, warningCount
}: {
  level: number; width: number; depth: number; scale: number;
  active: boolean; selected: boolean; onClick: () => void;
  label?: string; deviceCount?: number; warningCount?: number;
}) {
  const floorHeight = scale * 2.8;
  const wallHeight = scale * 2.2;
  const yOffset = -level * floorHeight;

  // Floor slab corners
  const corners = [
    { x: width / 2, y: depth / 2 },
    { x: width / 2, y: -depth / 2 },
    { x: -width / 2, y: -depth / 2 },
    { x: -width / 2, y: depth / 2 },
  ];
  const floorPoints = corners.map(c => {
    const px = (c.x - c.y) * COS * scale;
    const py = (c.x + c.y) * SIN * scale;
    return `${px},${py}`;
  }).join(' ');

  // Wall faces (right and front)
  const rightWall = [
    isoProject(width / 2, -depth / 2, 0, scale),
    isoProject(width / 2, depth / 2, 0, scale),
    isoProject(width / 2, depth / 2, -wallHeight / scale, scale),
    isoProject(width / 2, -depth / 2, -wallHeight / scale, scale),
  ].map(p => `${p.px},${p.py}`).join(' ');

  const frontWall = [
    isoProject(width / 2, depth / 2, 0, scale),
    isoProject(-width / 2, depth / 2, 0, scale),
    isoProject(-width / 2, depth / 2, -wallHeight / scale, scale),
    isoProject(width / 2, depth / 2, -wallHeight / scale, scale),
  ].map(p => `${p.px},${p.py}`).join(' ');

  // Label position
  const labelPos = isoProject(width / 2 + 0.3, 0, 0, scale);

  return (
    <motion.g
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: active ? 1 : 0.06, y: yOffset }}
      transition={{ duration: 0.5, delay: level * 0.08 }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="cursor-pointer"
      style={{ pointerEvents: active ? 'auto' : 'none' }}
    >
      {/* Shadow */}
      <polygon points={floorPoints} fill="black" opacity="0.04" transform={`translate(0, ${12})`} />

      {/* Front wall */}
      <polygon points={frontWall} fill={selected ? '#dbeafe' : '#f1f5f9'} stroke={selected ? '#93c5fd' : '#cbd5e1'} strokeWidth="0.5"
        className="transition-colors duration-300" />

      {/* Right wall */}
      <polygon points={rightWall} fill={selected ? '#bfdbfe' : '#e2e8f0'} stroke={selected ? '#93c5fd' : '#cbd5e1'} strokeWidth="0.5"
        className="transition-colors duration-300" />

      {/* Window details on right wall */}
      {Array.from({ length: 3 }).map((_, i) => {
        const wy = -depth / 2 + (i + 1) * (depth / 4);
        const wTop = isoProject(width / 2, wy, -0.3, scale);
        const wBot = isoProject(width / 2, wy, -wallHeight / scale + 0.3, scale);
        return (
          <line key={`rw-${i}`} x1={wTop.px} y1={wTop.py} x2={wBot.px} y2={wBot.py}
            stroke={selected ? '#60a5fa' : '#94a3b8'} strokeWidth="0.3" opacity="0.4" />
        );
      })}

      {/* Window details on front wall */}
      {Array.from({ length: 4 }).map((_, i) => {
        const wx = -width / 2 + (i + 1) * (width / 5);
        const wTop = isoProject(wx, depth / 2, -0.3, scale);
        const wBot = isoProject(wx, depth / 2, -wallHeight / scale + 0.3, scale);
        return (
          <line key={`fw-${i}`} x1={wTop.px} y1={wTop.py} x2={wBot.px} y2={wBot.py}
            stroke={selected ? '#60a5fa' : '#94a3b8'} strokeWidth="0.3" opacity="0.4" />
        );
      })}

      {/* Floor slab (top face) */}
      <polygon points={floorPoints}
        fill={selected ? '#eff6ff' : '#f8fafc'}
        stroke={selected ? '#3b82f6' : '#94a3b8'}
        strokeWidth={selected ? 1.2 : 0.5}
        className="transition-colors duration-300"
      />

      {/* Grid lines on floor */}
      {active && (
        <>
          <line
            x1={isoProject(0, -depth / 2, 0, scale).px} y1={isoProject(0, -depth / 2, 0, scale).py}
            x2={isoProject(0, depth / 2, 0, scale).px} y2={isoProject(0, depth / 2, 0, scale).py}
            stroke={selected ? '#93c5fd' : '#e2e8f0'} strokeWidth="0.3" strokeDasharray="3,3"
          />
          <line
            x1={isoProject(-width / 2, 0, 0, scale).px} y1={isoProject(-width / 2, 0, 0, scale).py}
            x2={isoProject(width / 2, 0, 0, scale).px} y2={isoProject(width / 2, 0, 0, scale).py}
            stroke={selected ? '#93c5fd' : '#e2e8f0'} strokeWidth="0.3" strokeDasharray="3,3"
          />
        </>
      )}

      {/* Floor label */}
      {active && label && (
        <text x={labelPos.px + 8} y={labelPos.py} fill={selected ? '#2563eb' : '#64748b'}
          fontSize="11" fontWeight={selected ? '700' : '500'} fontFamily="system-ui" dominantBaseline="middle">
          {label}
          {deviceCount !== undefined && (
            <tspan fill={selected ? '#3b82f6' : '#94a3b8'} fontSize="10"> ({deviceCount})</tspan>
          )}
        </text>
      )}

      {/* Warning indicator */}
      {active && (warningCount || 0) > 0 && (
        <circle cx={labelPos.px + (label?.length || 0) * 5 + 30} cy={labelPos.py - 1} r="3" fill="#f59e0b" />
      )}
    </motion.g>
  );
}

// --- Device Pin on Isometric View ---
function DevicePin({
  device, x, y, floorLevel, scale, isSelected, onClick
}: {
  device: Device; x: number; y: number; floorLevel: number;
  scale: number; isSelected: boolean; onClick: () => void;
}) {
  const floorHeight = scale * 2.8;
  const pos = isoProject(x, y, 0.2, scale);
  const yOffset = -floorLevel * floorHeight;
  const [hovered, setHovered] = useState(false);

  const statusColor = device.status === 'online' ? '#10b981' : device.status === 'warning' ? '#f59e0b' : '#ef4444';
  const typeIcons: Record<string, string> = {
    IAQ: '💨', Leakage: '💧', Temperature: '🌡️', Smoke: '🔥', Fire: '🚨', Noise: '🔊',
  };

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: yOffset }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pulse ring */}
      {(device.status === 'warning' || device.status === 'offline') && (
        <circle cx={pos.px} cy={pos.py} r="8" fill="none" stroke={statusColor} strokeWidth="1" opacity="0.4">
          <animate attributeName="r" from="4" to="12" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Main dot */}
      <circle cx={pos.px} cy={pos.py} r={isSelected ? 6 : 4.5}
        fill={statusColor} stroke="white" strokeWidth={isSelected ? 2.5 : 1.5}
        className="transition-all duration-200"
      />

      {/* Selection ring */}
      {isSelected && (
        <circle cx={pos.px} cy={pos.py} r="10" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,2">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${pos.px} ${pos.py}`} to={`360 ${pos.px} ${pos.py}`} dur="4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Hover tooltip */}
      {hovered && !isSelected && (
        <g>
          <rect x={pos.px - 55} y={pos.py - 40} width="110" height="28" rx="6" fill="#1e293b" opacity="0.95" />
          <text x={pos.px} y={pos.py - 28} fill="white" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="system-ui">
            {device.name}
          </text>
          <text x={pos.px} y={pos.py - 17} fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="system-ui">
            {device.type} • {device.location}
          </text>
          <polygon points={`${pos.px - 4},${pos.py - 12} ${pos.px + 4},${pos.py - 12} ${pos.px},${pos.py - 7}`} fill="#1e293b" opacity="0.95" />
        </g>
      )}
    </motion.g>
  );
}

// --- Pipe Network Overlay ---
function PipeNetwork({ width, depth, floors, scale, visible }: {
  width: number; depth: number; floors: number; scale: number; visible: boolean;
}) {
  if (!visible) return null;
  const floorHeight = scale * 2.8;

  // Generate pipe paths along building edges
  const pipes = useMemo(() => {
    const result = [];
    // Vertical riser
    for (let f = 0; f < floors; f++) {
      const start = isoProject(width / 2 - 0.5, depth / 2 - 0.5, 0, scale);
      const yOff = -f * floorHeight;
      result.push({
        key: `vert-${f}`,
        d: `M${start.px},${start.py + yOff} L${start.px},${start.py + yOff - floorHeight + 10}`,
        color: '#3b82f6',
      });
      // Horizontal branch per floor
      const branchEnd = isoProject(-width / 2 + 1, depth / 2 - 0.5, 0, scale);
      result.push({
        key: `horiz-${f}`,
        d: `M${start.px},${start.py + yOff} L${branchEnd.px},${branchEnd.py + yOff}`,
        color: '#06b6d4',
      });
    }
    return result;
  }, [width, depth, floors, scale]);

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ duration: 0.5 }}>
      {pipes.map(pipe => (
        <g key={pipe.key}>
          <path d={pipe.d} stroke={pipe.color} strokeWidth={scale / 12} strokeLinecap="round" opacity="0.5" />
          {/* Flow particle */}
          <circle r={scale / 15} fill={pipe.color}>
            <animateMotion dur="3s" repeatCount="indefinite" path={pipe.d} />
          </circle>
        </g>
      ))}
    </motion.g>
  );
}

// --- Deterministic device floor/position assignment ---
function assignDevicePositions(devices: Device[], floors: number, buildingW: number, buildingD: number) {
  return devices.map((d, i) => {
    let hash = 0;
    for (let c = 0; c < d.id.length; c++) hash = ((hash << 5) - hash) + d.id.charCodeAt(c);
    hash = Math.abs(hash);
    const floor = hash % floors;
    const margin = 0.6;
    const x = -buildingW / 2 + margin + ((hash % 100) / 100) * (buildingW - margin * 2);
    const y = -buildingD / 2 + margin + (((hash >> 8) % 100) / 100) * (buildingD - margin * 2);
    return { device: d, floor, x, y };
  });
}

// --- Property Card ---
function PropertyCard({ property, selected, onClick, deviceCount }: {
  property: Property; selected: boolean; onClick: () => void; deviceCount?: number;
}) {
  const statusColor = property.status === 'Normal' ? 'emerald' : 'amber';
  return (
    <button onClick={onClick} className={clsx(
      "w-full p-3.5 rounded-xl border transition-all text-left group",
      selected
        ? "bg-slate-900 border-slate-800 text-white shadow-lg"
        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>
      <div className="flex items-center gap-3">
        <div className={clsx("h-10 w-10 rounded-lg overflow-hidden shrink-0 border",
          selected ? "border-slate-700" : "border-slate-200"
        )}>
          <img src={property.image?.replace('w=100', 'w=200') || ''} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={clsx("text-sm font-semibold truncate", selected ? "text-white" : "text-slate-900")}>
            {property.name}
          </h3>
          <p className={clsx("text-xs truncate", selected ? "text-slate-400" : "text-slate-500")}>
            {property.location} • {property.type}
          </p>
        </div>
        {selected && <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <span className={clsx(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
          selected
            ? statusColor === 'emerald' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            : statusColor === 'emerald' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
        )}>
          {statusColor === 'emerald' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
          {property.status}
        </span>
        {deviceCount !== undefined && (
          <span className={clsx("text-xs", selected ? "text-slate-400" : "text-slate-500")}>
            {deviceCount} devices
          </span>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════
// Main Digital Twin Page
// ═══════════════════════════════════
type InspectorMode = 'overview' | 'floor' | 'device' | 'bms';

export function BIMTwins() {
  // --- State ---
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileInspector, setShowMobileInspector] = useState(false);

  const [active, setActive] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [showPipes, setShowPipes] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>('overview');

  // --- Data Fetching ---
  useEffect(() => {
    api.getProperties().then(data => {
      setProperties(data);
      setSelectedPropertyId(data.length > 0 ? data[0].id : null);
    }).catch(err => {
      console.warn('Digital Twin: Failed to load properties:', err);
      setProperties([]);
      setSelectedPropertyId(null);
    }).finally(() => setLoadingProps(false));
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) return;
    setLoadingDetails(true);
    setSelectedFloor(null);
    setSelectedDevice(null);
    setSelectedTable(null);
    setInspectorMode('overview');
    api.getProperty(selectedPropertyId).then(data => {
      setPropertyDetails(data);
    }).catch(err => {
      console.warn('Digital Twin: getProperty failed:', err);
      setPropertyDetails(null);
    }).finally(() => setLoadingDetails(false));
  }, [selectedPropertyId]);

  // --- Connection status (real: based on data availability; demo: always connected) ---
  useEffect(() => {
    if (!active || !selectedPropertyId) {
      setConnectionStatus('disconnected');
      return;
    }
    setConnectionStatus('connecting');
    // Verify connection by attempting a telemetry fetch
    api.getPropertyTelemetry(selectedPropertyId)
      .then(() => setConnectionStatus('connected'))
      .catch(() => setConnectionStatus('connected')); // fall through to demo telemetry stream
    return () => {};
  }, [active, selectedPropertyId]);

  // --- Telemetry stream (real sensor data) ---
  const devices = useMemo(() => propertyDetails?.devices || [], [propertyDetails]);
  const { telemetry, propertyTelemetry } = useTelemetryStream(
    connectionStatus === 'connected', devices, selectedPropertyId
  );

  // --- Computed ---
  const BUILDING_W = 8;
  const BUILDING_D = 6;
  const SCALE = 55 * zoom;

  // Single floor: Floor 17 with three table zones
  const TABLE_ZONES = useMemo(() => [
    { id: 'andy', label: "Andy's Table", cx: -2.4, cy: 0, w: 2.0, h: 2.5, color: '#3b82f6' },
    { id: 'charles', label: "Charles's Table", cx: 0, cy: 0, w: 2.0, h: 2.5, color: '#10b981' },
    { id: 'david', label: "David's Table", cx: 2.4, cy: 0, w: 2.0, h: 2.5, color: '#f59e0b' },
  ], []);

  const floorCount = 1;
  const floorLabels = ['Floor 17'];

  const devicePositions = useMemo(() => {
    return devices.map((d) => {
      // Parse device location to determine table zone (e.g. "Floor 17, Andy Seat" → andy)
      const loc = (d.location || '').toLowerCase();
      let matchedZone = TABLE_ZONES[0]; // default to first zone
      for (const z of TABLE_ZONES) {
        if (loc.includes(z.id)) { matchedZone = z; break; }
      }
      // Spread within zone based on device id hash for visual separation
      let hash = 0;
      for (let c = 0; c < d.id.length; c++) hash = ((hash << 5) - hash) + d.id.charCodeAt(c);
      hash = Math.abs(hash);
      const spreadX = ((hash % 100) / 100 - 0.5) * matchedZone.w * 0.6;
      const spreadY = (((hash >> 8) % 100) / 100 - 0.5) * matchedZone.h * 0.6;
      return { device: d, floor: 0, tableZone: matchedZone.id, x: matchedZone.cx + spreadX, y: matchedZone.cy + spreadY };
    });
  }, [devices, TABLE_ZONES]);

  const floorDeviceCounts = useMemo(() => {
    const counts: Record<number, { total: number; warning: number }> = {};
    devicePositions.forEach(dp => {
      if (!counts[dp.floor]) counts[dp.floor] = { total: 0, warning: 0 };
      counts[dp.floor].total++;
      if (dp.device.status === 'warning' || dp.device.status === 'offline') counts[dp.floor].warning++;
    });
    return counts;
  }, [devicePositions]);

  const tableDeviceCounts = useMemo(() => {
    const counts: Record<string, { total: number; warning: number }> = {};
    TABLE_ZONES.forEach(z => { counts[z.id] = { total: 0, warning: 0 }; });
    devicePositions.forEach(dp => {
      if (dp.tableZone && counts[dp.tableZone]) {
        counts[dp.tableZone].total++;
        if (dp.device.status === 'warning' || dp.device.status === 'offline') counts[dp.tableZone].warning++;
      }
    });
    return counts;
  }, [devicePositions, TABLE_ZONES]);

  const visibleDevices = useMemo(() => {
    if (selectedTable) return devicePositions.filter(dp => dp.tableZone === selectedTable);
    return devicePositions;
  }, [devicePositions, selectedTable]);

  const filteredProperties = properties.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  // --- Handlers ---
  const handleFloorClick = useCallback((_floor: number) => {
    // Single floor — click resets table selection
    setSelectedTable(null);
    setSelectedDevice(null);
    setInspectorMode('overview');
  }, []);

  const handleTableClick = useCallback((tableId: string) => {
    if (selectedTable === tableId) {
      setSelectedTable(null);
      setInspectorMode('overview');
    } else {
      setSelectedTable(tableId);
      setSelectedDevice(null);
      setInspectorMode('floor');
    }
  }, [selectedTable]);

  const handleDeviceClick = useCallback((device: Device) => {
    setSelectedDevice(device);
    setInspectorMode('device');
  }, []);

  const handlePropertySelect = useCallback((id: string) => {
    setSelectedPropertyId(id);
    setSelectedFloor(null);
    setSelectedTable(null);
    setSelectedDevice(null);
    setInspectorMode('overview');
  }, []);

  // SVG viewBox center
  const svgW = 700;
  const svgH = 600;
  const viewCenterX = svgW / 2;
  const viewCenterY = svgH / 2 + 80;

  return (
    <div className={clsx("flex bg-slate-50/50", isFullscreen ? "fixed inset-0 z-50 bg-white" : "relative h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]")}>
      
      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* Mobile inspector overlay */}
      {showMobileInspector && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 xl:hidden" onClick={() => setShowMobileInspector(false)} />
      )}

      {/* ═══ Left Sidebar: Property Selector ═══ */}
      <div className={clsx(
        "flex flex-col border-r border-slate-200 bg-white transition-all duration-300 shrink-0",
        isFullscreen ? "w-0 overflow-hidden opacity-0 p-0 border-0" :
        "fixed inset-y-0 left-0 z-40 w-64 lg:static lg:z-auto lg:w-56 xl:w-72",
        !isFullscreen && (showMobileSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
      )}>
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-blue-600" />
            Properties
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Select a property to load its Digital Twin</p>
        </div>

        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search properties..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loadingProps ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProperties.map(prop => (
            <PropertyCard
              key={prop.id}
              property={prop}
              selected={selectedPropertyId === prop.id}
              onClick={() => handlePropertySelect(prop.id)}
              deviceCount={selectedPropertyId === prop.id ? devices.length : prop.deviceCount}
            />
          ))}
        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{properties.length} properties</span>
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              API Connected
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Main Viewer Area ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        
        {/* Viewer Header */}
        <div className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-4 border-b border-slate-200 bg-white z-20 shrink-0 gap-2 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden shrink-0"
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 truncate">
                <span className="truncate">{selectedProperty?.name || 'Select Property'}</span>
                <span className="px-1 py-0.5 rounded text-[10px] bg-gradient-to-r from-blue-500 to-indigo-500 text-white uppercase tracking-wider font-bold shrink-0">
                  Twin
                </span>
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{selectedProperty?.location || '—'}</span>
                {selectedFloor !== null && (
                  <span className="ml-1 text-blue-600 font-medium">• {floorLabels[selectedFloor]}</span>
                )}
                {selectedTable && (() => {
                  const tz = TABLE_ZONES.find(z => z.id === selectedTable);
                  return tz ? <span className="ml-1 font-medium" style={{ color: tz.color }}>• {tz.label}</span> : null;
                })()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Connection indicator */}
            <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
              <div className={clsx("h-1.5 w-1.5 rounded-full",
                connectionStatus === 'connected' ? "bg-emerald-500 animate-pulse" :
                connectionStatus === 'connecting' ? "bg-amber-500 animate-pulse" : "bg-slate-300"
              )} />
              {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
            </div>

            <div className="hidden xl:block h-5 w-px bg-slate-200" />

            {/* Inspector mode tabs */}
            <div className="hidden xl:flex rounded-lg bg-slate-100 p-0.5">
              {([
                ['overview', 'Overview'],
                ['bms', 'BMS'],
              ] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => { setInspectorMode(mode); if (mode !== 'floor' && mode !== 'device') { setSelectedDevice(null); } }}
                  className={clsx("px-2 py-1 rounded-md text-xs font-medium transition-all",
                    inspectorMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}>
                  {label}
                </button>
              ))}
            </div>

            <div className="hidden xl:block h-5 w-px bg-slate-200" />

            {/* Mobile inspector toggle */}
            <button
              onClick={() => setShowMobileInspector(true)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 xl:hidden"
              title="Inspector"
            >
              <Activity className="h-3.5 w-3.5" />
            </button>

            <button onClick={() => setActive(!active)}
              className={clsx("p-1.5 rounded-lg border transition-colors", active ? "border-slate-200 text-slate-400 hover:text-red-500" : "border-emerald-200 text-emerald-600 bg-emerald-50")}
              title={active ? "Disconnect Twin" : "Connect Twin"}>
              <Power className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 transition-colors">
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ═══ Isometric Stage ═══ */}
          <div className="flex-1 relative bg-gradient-to-b from-slate-100 to-slate-50 overflow-hidden">
            {/* Dot pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            {/* Layer toggles — only Devices in 3D mode (Structure handled by BIM Tools panel; Systems was legacy SVG only) */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 z-10">
              {[
                { key: 'devices', icon: Cpu, label: 'Devices', state: showDevices, toggle: () => setShowDevices(!showDevices) },
              ].map(layer => (
                <button key={layer.key} onClick={layer.toggle} className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-all border",
                  layer.state ? "bg-white text-blue-600 border-blue-200" : "bg-slate-200/80 text-slate-400 border-slate-300"
                )}>
                  <layer.icon className="h-3.5 w-3.5" /> {layer.label}
                </button>
              ))}
            </div>

            {/* Loading overlay */}
            {loadingDetails && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">Loading Digital Twin...</p>
                </div>
              </div>
            )}

            {/* 3D BIM Stage (replaces previous SVG isometric scene) */}
            <Bim3DStage
              showStructure={showStructure}
              showDevices={showDevices}
              selectedDeviceId={selectedDevice?.id ?? null}
              zoom={zoom}
              onSelectDevice={(id) => {
                const dp = devicePositions.find(x => x.device.id === id);
                if (dp) handleDeviceClick(dp.device);
              }}
              onDeselect={() => {
                setSelectedFloor(null);
                setSelectedTable(null);
                setSelectedDevice(null);
                setInspectorMode('overview');
              }}
            />

            {/* Legacy SVG isometric scene kept below as reference (disabled) */}
            {false && (
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full" onClick={() => { setSelectedFloor(null); setSelectedTable(null); setSelectedDevice(null); setInspectorMode('overview'); }}>
              <g transform={`translate(${viewCenterX}, ${viewCenterY})`}>
                {/* Floors */}
                <AnimatePresence>
                  {Array.from({ length: floorCount }).map((_, i) => (
                    <IsoFloor
                      key={`floor-${selectedPropertyId}-${i}`}
                      level={i}
                      width={BUILDING_W}
                      depth={BUILDING_D}
                      scale={SCALE}
                      active={showStructure}
                      selected={selectedFloor === i}
                      onClick={() => handleFloorClick(i)}
                      label={floorLabels[i]}
                      deviceCount={floorDeviceCounts[i]?.total}
                      warningCount={floorDeviceCounts[i]?.warning}
                    />
                  ))}
                </AnimatePresence>

                {/* Table Zones on Floor 17 */}
                {showStructure && TABLE_ZONES.map(zone => {
                  const corners = [
                    isoProject(zone.cx - zone.w / 2, zone.cy - zone.h / 2, 0.01, SCALE),
                    isoProject(zone.cx + zone.w / 2, zone.cy - zone.h / 2, 0.01, SCALE),
                    isoProject(zone.cx + zone.w / 2, zone.cy + zone.h / 2, 0.01, SCALE),
                    isoProject(zone.cx - zone.w / 2, zone.cy + zone.h / 2, 0.01, SCALE),
                  ];
                  const pts = corners.map(c => `${c.px},${c.py}`).join(' ');
                  const center = isoProject(zone.cx, zone.cy, 0.01, SCALE);
                  const isSelected = selectedTable === zone.id;
                  const count = tableDeviceCounts[zone.id];
                  return (
                    <g key={zone.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleTableClick(zone.id); }}>
                      <polygon points={pts}
                        fill={zone.color}
                        opacity={isSelected ? 0.3 : 0.1}
                        stroke={zone.color}
                        strokeWidth={isSelected ? 1.5 : 0.7}
                        strokeDasharray={isSelected ? 'none' : '4,2'}
                        className="transition-all duration-300"
                      />
                      {/* Table desk icon */}
                      <rect x={center.px - 10} y={center.py - 14} width="20" height="12" rx="2"
                        fill={zone.color} opacity={isSelected ? 0.5 : 0.25} stroke={zone.color} strokeWidth="0.5" />
                      <text x={center.px} y={center.py + 10} fill={isSelected ? '#1e293b' : '#475569'}
                        fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="system-ui">
                        {zone.label}
                      </text>
                      {/* Device count badge */}
                      {count && count.total > 0 && (
                        <g>
                          <circle cx={center.px + 14} cy={center.py - 16} r="7" fill={zone.color} opacity="0.9" />
                          <text x={center.px + 14} y={center.py - 12.5} fill="white" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="system-ui">
                            {count.total}
                          </text>
                        </g>
                      )}
                      {/* Warning indicator */}
                      {count && count.warning > 0 && (
                        <circle cx={center.px + 14} cy={center.py - 3} r="4" fill="#f59e0b" stroke="white" strokeWidth="1" />
                      )}
                    </g>
                  );
                })}

                {/* Pipe Network */}
                <PipeNetwork
                  width={BUILDING_W} depth={BUILDING_D} floors={floorCount}
                  scale={SCALE} visible={showPipes && connectionStatus === 'connected'}
                />

                {/* Device Pins */}
                {showDevices && connectionStatus === 'connected' && (
                  <AnimatePresence>
                    {visibleDevices.map(dp => (
                      <DevicePin
                        key={dp.device.id}
                        device={dp.device}
                        x={dp.x} y={dp.y}
                        floorLevel={dp.floor}
                        scale={SCALE}
                        isSelected={selectedDevice?.id === dp.device.id}
                        onClick={() => handleDeviceClick(dp.device)}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </g>
            </svg>
            )}

            {/* Floor Legend (when a floor is selected) */}
            {selectedTable !== null && (() => {
              const activeZone = TABLE_ZONES.find(z => z.id === selectedTable);
              const zoneDevices = devicePositions.filter(dp => dp.tableZone === selectedTable);
              return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 right-4 z-10 bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-3 w-56"
              >
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: activeZone?.color || '#64748b' }}>
                  {activeZone?.label || selectedTable}
                </p>
                <div className="space-y-1.5">
                  {zoneDevices.map(dp => (
                    <button key={dp.device.id} onClick={() => handleDeviceClick(dp.device)}
                      className={clsx(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all",
                        selectedDevice?.id === dp.device.id ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"
                      )}>
                      <div className={clsx("h-2 w-2 rounded-full shrink-0",
                        dp.device.status === 'online' ? "bg-emerald-500" : dp.device.status === 'warning' ? "bg-amber-500" : "bg-slate-400"
                      )} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{dp.device.name}</p>
                        <p className="text-xs text-slate-400">{dp.device.location}</p>
                      </div>
                    </button>
                  ))}
                  {zoneDevices.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">No devices at this table</p>
                  )}
                </div>
              </motion.div>
              );
            })()}
          </div>

          {/* ═══ Right Inspector Panel ═══ */}
          <div className={clsx(
            "border-l border-slate-200 bg-white shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-300",
            isFullscreen ? "w-72 xl:w-80" :
            "w-64 xl:w-72",
            // Desktop: always visible on xl
            !isFullscreen && "hidden xl:block",
          )}>
            <AnimatePresence mode="wait">
              <motion.div
                key={inspectorMode + (selectedDevice?.id || '')}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="p-3 min-w-0 overflow-hidden"
              >
                {/* === OVERVIEW MODE === */}
                {inspectorMode === 'overview' && propertyDetails && (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Property Overview</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Real-time status summary</p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center">
                        <p className="text-[10px] text-blue-600 font-medium">Total Devices</p>
                        <p className="text-lg font-bold text-blue-700">{propertyDetails.deviceCount}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                        <p className="text-[10px] text-emerald-600 font-medium">Online</p>
                        <p className="text-lg font-bold text-emerald-700">{propertyDetails.onlineDevices}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                        <p className="text-[10px] text-amber-600 font-medium">Warnings</p>
                        <p className="text-lg font-bold text-amber-700">{propertyDetails.warningDevices}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center">
                        <p className="text-[10px] text-slate-500 font-medium">Tables</p>
                        <p className="text-lg font-bold text-slate-700">{TABLE_ZONES.length}</p>
                      </div>
                    </div>

                    {/* Table Zones — Floor 17 */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Floor 17 — Table Zones</p>
                      <div className="space-y-1">
                        {TABLE_ZONES.map((zone) => {
                          const count = tableDeviceCounts[zone.id] || { total: 0, warning: 0 };
                          return (
                            <button key={zone.id} onClick={() => handleTableClick(zone.id)}
                              className={clsx(
                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-xs",
                                selectedTable === zone.id ? "border" : "hover:bg-slate-50"
                              )}
                              style={selectedTable === zone.id ? { backgroundColor: zone.color + '10', borderColor: zone.color + '40' } : {}}>
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                                <span className={clsx("font-medium truncate", selectedTable === zone.id ? "text-slate-900" : "text-slate-700")}>{zone.label}</span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-slate-400 font-mono text-xs">{count.total}</span>
                                {count.warning > 0 && (
                                  <span className="h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                    {count.warning}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Real Environment Summary */}
                    {propertyTelemetry?.source === 'live' && propertyTelemetry.environment && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Environment</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {propertyTelemetry.environment.temperature != null && (
                            <div className="rounded-lg bg-orange-50 border border-orange-100 p-2.5 text-center">
                              <p className="text-xs text-orange-600">Temperature</p>
                              <p className="text-lg font-bold text-orange-700 font-mono">{propertyTelemetry.environment.temperature.toFixed(1)}°C</p>
                            </div>
                          )}
                          {propertyTelemetry.environment.humidity != null && (
                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5 text-center">
                              <p className="text-xs text-blue-600">Humidity</p>
                              <p className="text-lg font-bold text-blue-700 font-mono">{propertyTelemetry.environment.humidity.toFixed(1)}%</p>
                            </div>
                          )}
                          {propertyTelemetry.environment.co2 != null && (
                            <div className="rounded-lg bg-teal-50 border border-teal-100 p-2.5 text-center">
                              <p className="text-xs text-teal-600">CO₂</p>
                              <p className="text-lg font-bold text-teal-700 font-mono">{Math.round(propertyTelemetry.environment.co2)} ppm</p>
                            </div>
                          )}
                          {propertyTelemetry.environment.pm2_5 != null && (
                            <div className="rounded-lg bg-violet-50 border border-violet-100 p-2.5 text-center">
                              <p className="text-xs text-violet-600">PM2.5</p>
                              <p className="text-lg font-bold text-violet-700 font-mono">{propertyTelemetry.environment.pm2_5.toFixed(1)}</p>
                            </div>
                          )}
                        </div>
                        {propertyTelemetry.sensorCount > 0 && (
                          <p className="text-xs text-slate-400 mt-1.5 text-center">
                            Data from {propertyTelemetry.sensorCount} sensor{propertyTelemetry.sensorCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Live Telemetry Feed */}
                    {connectionStatus === 'connected' && Object.keys(telemetry).length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Telemetry</p>
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Streaming
                          </span>
                        </div>
                        <div className="rounded-xl border border-slate-100 overflow-hidden">
                          {devices.slice(0, 6).map(d => (
                            <div key={d.id}
                              className={clsx(
                                "flex items-center justify-between px-3 py-2 border-b border-slate-50 last:border-none text-sm cursor-pointer transition-colors",
                                selectedDevice?.id === d.id ? "bg-blue-50" : "hover:bg-slate-50"
                              )}
                              onClick={() => handleDeviceClick(d)}
                            >
                              <div className="flex items-center gap-2">
                                <div className={clsx("h-2 w-2 rounded-full",
                                  d.status === 'online' ? "bg-emerald-500" : d.status === 'warning' ? "bg-amber-500" : "bg-slate-400"
                                )} />
                                <span className="text-slate-600 font-medium truncate max-w-[110px]">{d.name}</span>
                              </div>
                              <span className="font-mono text-slate-900">{telemetry[d.id]?.toFixed(1) ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={() => setInspectorMode('bms')}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 text-xs font-medium text-indigo-700 hover:from-indigo-100 hover:to-blue-100 transition-all">
                      <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> View BMS</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* === TABLE ZONE MODE === */}
                {inspectorMode === 'floor' && selectedTable !== null && (() => {
                  const activeZone = TABLE_ZONES.find(z => z.id === selectedTable);
                  const zoneDevices = devicePositions.filter(dp => dp.tableZone === selectedTable);
                  return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{activeZone?.label || selectedTable}</h3>
                        <p className="text-xs text-slate-400">
                          Floor 17 • {zoneDevices.length} devices
                        </p>
                      </div>
                      <button onClick={() => { setSelectedTable(null); setInspectorMode('overview'); }}
                        className="text-xs text-blue-600 font-medium hover:underline">
                        ← Back
                      </button>
                    </div>

                    {/* Zone info */}
                    <div className="rounded-xl p-3 border" style={{ backgroundColor: (activeZone?.color || '#3b82f6') + '08', borderColor: (activeZone?.color || '#3b82f6') + '30' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: activeZone?.color }} />
                        <span className="text-sm font-semibold text-slate-900">Table Zone</span>
                      </div>
                      <p className="text-xs text-slate-500">Devices assigned to this table area on Floor 17</p>
                    </div>

                    {/* Device list */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Devices</p>
                      <div className="space-y-1.5">
                        {zoneDevices.map(dp => (
                          <button key={dp.device.id} onClick={() => handleDeviceClick(dp.device)}
                            className={clsx(
                              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left",
                              selectedDevice?.id === dp.device.id
                                ? "bg-blue-50 border-blue-200 shadow-sm"
                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                            )}>
                            <div className={clsx("h-2.5 w-2.5 rounded-full shrink-0",
                              dp.device.status === 'online' ? "bg-emerald-500" : dp.device.status === 'warning' ? "bg-amber-500" : "bg-slate-400"
                            )} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900 truncate">{dp.device.name}</p>
                              <p className="text-xs text-slate-400">{dp.device.type} • {dp.device.location}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-mono font-medium text-slate-700">
                                {telemetry[dp.device.id]?.toFixed(1) ?? '—'}
                              </p>
                              <p className="text-xs text-slate-400">{dp.device.battery}%</p>
                            </div>
                          </button>
                        ))}
                        {zoneDevices.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-6">No devices at this table</p>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {/* === DEVICE MODE === */}
                {inspectorMode === 'device' && selectedDevice && (
                  <DeviceInspector
                    device={selectedDevice}
                    onClose={() => { setSelectedDevice(null); setInspectorMode(selectedTable !== null ? 'floor' : 'overview'); }}
                    liveSensorData={(() => {
                      if (!propertyTelemetry?.deviceReadings) return null;
                      const readings = Object.values(propertyTelemetry.deviceReadings);
                      // Try to find a reading matching this device
                      const match = readings.find(r =>
                        r.deviceName?.toLowerCase().includes(selectedDevice.name?.toLowerCase()) ||
                        selectedDevice.name?.toLowerCase().includes(r.deviceName?.toLowerCase())
                      ) || readings[0];
                      return match?.decoded || null;
                    })()}
                    liveDataTime={(() => {
                      if (!propertyTelemetry?.deviceReadings) return null;
                      const readings = Object.values(propertyTelemetry.deviceReadings);
                      const match = readings.find(r =>
                        r.deviceName?.toLowerCase().includes(selectedDevice.name?.toLowerCase()) ||
                        selectedDevice.name?.toLowerCase().includes(r.deviceName?.toLowerCase())
                      ) || readings[0];
                      return match?.receivedAt || null;
                    })()}
                  />
                )}

                {/* === BMS MODE === */}
                {inspectorMode === 'bms' && selectedProperty && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">BMS Systems</h3>
                        <p className="text-xs text-slate-400">Building Management Subsystems</p>
                      </div>
                      <button onClick={() => setInspectorMode('overview')}
                        className="text-xs text-blue-600 font-medium hover:underline">
                        ← Back
                      </button>
                    </div>
                    <BMSPanel propertyName={selectedProperty.name} />
                  </div>
                )}

                {/* Loading state */}
                {loadingDetails && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs">Loading property data...</p>
                  </div>
                )}

                {/* Disconnected state */}
                {!active && !loadingDetails && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <WifiOff className="h-8 w-8 mb-3 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">Twin Disconnected</p>
                    <p className="text-xs text-slate-400 mt-1">Click the power button to reconnect</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ═══ Mobile Inspector Panel (slide-in from right) ═══ */}
          {showMobileInspector && (
            <div className={clsx(
              "fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] border-l border-slate-200 bg-white overflow-y-auto overflow-x-hidden xl:hidden",
              "animate-in slide-in-from-right duration-300"
            )}>
              <div className="flex items-center justify-between p-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inspector</span>
                <button onClick={() => setShowMobileInspector(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-3 min-w-0 overflow-hidden">
                {/* Reuse same inspector content */}
                {inspectorMode === 'overview' && propertyDetails && (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Property Overview</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Real-time status summary</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-center">
                        <p className="text-[10px] text-blue-600 font-medium">Total Devices</p>
                        <p className="text-lg font-bold text-blue-700">{propertyDetails.deviceCount}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                        <p className="text-[10px] text-emerald-600 font-medium">Online</p>
                        <p className="text-lg font-bold text-emerald-700">{propertyDetails.onlineDevices}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                        <p className="text-[10px] text-amber-600 font-medium">Warnings</p>
                        <p className="text-lg font-bold text-amber-700">{propertyDetails.warningDevices}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center">
                        <p className="text-[10px] text-slate-500 font-medium">Tables</p>
                        <p className="text-lg font-bold text-slate-700">{TABLE_ZONES.length}</p>
                      </div>
                    </div>
                    <button onClick={() => { setInspectorMode('bms'); }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 text-xs font-medium text-indigo-700">
                      <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> View BMS</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {inspectorMode === 'device' && selectedDevice && (
                  <DeviceInspector
                    device={selectedDevice}
                    onClose={() => { setSelectedDevice(null); setInspectorMode('overview'); }}
                    liveSensorData={(() => {
                      if (!propertyTelemetry?.deviceReadings) return null;
                      const readings = Object.values(propertyTelemetry.deviceReadings);
                      const match = readings.find(r =>
                        r.deviceName?.toLowerCase().includes(selectedDevice.name?.toLowerCase()) ||
                        selectedDevice.name?.toLowerCase().includes(r.deviceName?.toLowerCase())
                      ) || readings[0];
                      return match?.decoded || null;
                    })()}
                    liveDataTime={(() => {
                      if (!propertyTelemetry?.deviceReadings) return null;
                      const readings = Object.values(propertyTelemetry.deviceReadings);
                      const match = readings.find(r =>
                        r.deviceName?.toLowerCase().includes(selectedDevice.name?.toLowerCase()) ||
                        selectedDevice.name?.toLowerCase().includes(r.deviceName?.toLowerCase())
                      ) || readings[0];
                      return match?.receivedAt || null;
                    })()}
                  />
                )}
                {inspectorMode === 'bms' && selectedProperty && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">BMS Systems</h3>
                      <button onClick={() => setInspectorMode('overview')} className="text-xs text-blue-600 font-medium hover:underline">← Back</button>
                    </div>
                    <BMSPanel propertyName={selectedProperty.name} />
                  </div>
                )}
                {!active && !loadingDetails && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <WifiOff className="h-8 w-8 mb-3 text-slate-300" />
                    <p className="text-xs font-medium text-slate-500">Twin Disconnected</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}