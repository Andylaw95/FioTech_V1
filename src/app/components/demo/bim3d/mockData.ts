// Mock BIM data for CCC 17F demo. Replace with IFC express_id mapping when RVT→IFC export available.
export type Severity = 'critical' | 'warning' | 'info' | 'normal';
export type Subsystem = 'HVAC' | 'Power' | 'CCTV' | 'Lift' | 'FAS' | 'Access' | 'Lighting' | 'Network' | 'Environment';

export interface Room {
  id: string;
  name: string;
  // Floor-plan coordinates in meters (x, z). Center + size.
  x: number; z: number; w: number; d: number;
  color?: string;
}

export interface Sensor {
  id: string;
  name: string;
  type: 'HY108-1' | 'LD-5R' | 'Temp' | 'IAQ' | 'CCTV' | 'Lift';
  subsystem: Subsystem;
  // World-space position relative to building origin
  x: number; y: number; z: number;
  roomId?: string;
  deviceId?: string; // links to Supabase device
}

export interface Alarm {
  id: string;
  sensorId: string;
  severity: Severity;
  subsystem: Subsystem;
  title: string;
  message: string;
  occurredAt: string;
  resolved: boolean;
}

// CCC 17F plausible layout (16m x 24m floor, reception + open office + meeting + server + pantry)
export const FLOOR_SIZE = { width: 26, depth: 18, height: 3.2 };

export const MOCK_ROOMS: Room[] = [
  { id: 'reception',  name: 'Reception',      x: -10, z:  6, w: 6, d: 5, color: '#a5b4fc' },
  { id: 'open_1',     name: 'Open Office A',  x: -2,  z:  6, w: 8, d: 5, color: '#93c5fd' },
  { id: 'open_2',     name: 'Open Office B',  x:  8,  z:  6, w: 7, d: 5, color: '#93c5fd' },
  { id: 'meeting_1',  name: 'Meeting Room 1', x: -10, z: -2, w: 5, d: 4, color: '#fde68a' },
  { id: 'meeting_2',  name: 'Meeting Room 2', x: -3,  z: -2, w: 5, d: 4, color: '#fde68a' },
  { id: 'server',     name: 'Server Room',    x:  4,  z: -2, w: 4, d: 4, color: '#fca5a5' },
  { id: 'pantry',     name: 'Pantry',         x:  10, z: -2, w: 4, d: 4, color: '#86efac' },
  { id: 'corridor',   name: 'Main Corridor',  x:  0,  z:  2, w: 24, d: 2, color: '#e5e7eb' },
  { id: 'lift_core',  name: 'Lift Core',      x: -12, z:  0, w: 2, d: 4, color: '#c4b5fd' },
];

export const MOCK_SENSORS: Sensor[] = [
  { id: 's_hy108_01', name: 'HY108-1 Noise (Reception)', type: 'HY108-1', subsystem: 'Environment',
    x: -10, y: 2.6, z: 6, roomId: 'reception', deviceId: 'hy108-ld1' },
  { id: 's_hy108_02', name: 'HY108-1 Noise (Open Office A)', type: 'HY108-1', subsystem: 'Environment',
    x: -2, y: 2.6, z: 6, roomId: 'open_1', deviceId: 'hy108' },
  { id: 's_ld5r_01', name: 'LD-5R Dust (Open Office B)', type: 'LD-5R', subsystem: 'Environment',
    x: 8, y: 1.5, z: 6, roomId: 'open_2', deviceId: 'ld5r' },
  { id: 's_iaq_01', name: 'IAQ Sensor (Meeting 1)', type: 'IAQ', subsystem: 'HVAC',
    x: -10, y: 2.8, z: -2, roomId: 'meeting_1', deviceId: 'iaq' },
  { id: 's_temp_01', name: 'Server Temp', type: 'Temp', subsystem: 'HVAC',
    x: 4, y: 2.8, z: -2, roomId: 'server', deviceId: 'temp' },
  { id: 's_cctv_01', name: 'CCTV Camera (Corridor)', type: 'CCTV', subsystem: 'CCTV',
    x: 0, y: 2.9, z: 2, roomId: 'corridor' },
  { id: 's_lift_01', name: 'Lift Status', type: 'Lift', subsystem: 'Lift',
    x: -12, y: 1.6, z: 0, roomId: 'lift_core' },
];

export const SUBSYSTEMS: Subsystem[] = [
  'HVAC', 'Power', 'CCTV', 'Lift', 'FAS', 'Access', 'Lighting', 'Network', 'Environment',
];

export const severityColor = (s: Severity): string => {
  switch (s) {
    case 'critical': return '#ef4444';
    case 'warning':  return '#f59e0b';
    case 'info':     return '#3b82f6';
    case 'normal':
    default:         return '#10b981';
  }
};

export const severityGlow = (s: Severity): number => {
  switch (s) {
    case 'critical': return 2.5;
    case 'warning':  return 1.5;
    case 'info':     return 0.8;
    default:         return 0.2;
  }
};
