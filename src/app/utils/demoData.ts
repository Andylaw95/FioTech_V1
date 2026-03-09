// ═══════════════════════════════════════════════════════════
// DEMO DATA — Static client-side data for the demo account.
// No database or backend connection required.
// ═══════════════════════════════════════════════════════════

// ── Properties ───────────────────────────────────────────

export const DEMO_PROPERTIES = [
  { id: "B001", name: "Grand Plaza Tower", location: "Downtown Financial District", type: "Commercial", waterSensors: "5/6", status: "Normal", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400" },
  { id: "B002", name: "Harbor View Residences", location: "Marina Bay Waterfront", type: "Residential", waterSensors: "2/3", status: "Warning", image: "https://images.unsplash.com/photo-1601630164609-af849e05b776?auto=format&fit=crop&q=80&w=400" },
  { id: "B003", name: "Westside Logistics Hub", location: "Industrial Park West", type: "Industrial", waterSensors: "1/2", status: "Normal", image: "https://images.unsplash.com/photo-1761195696518-6384573549ea?auto=format&fit=crop&q=80&w=400" },
  { id: "B004", name: "Tech Innovation Park", location: "Silicon Quarter", type: "Commercial", waterSensors: "3/3", status: "Normal", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=400" },
  { id: "B005", name: "Metro Mall Central", location: "City Center", type: "Commercial", waterSensors: "2/2", status: "Normal", image: "https://images.unsplash.com/photo-1559329187-324b79e997b0?auto=format&fit=crop&q=80&w=400" },
  { id: "B006", name: "Green Valley Campus", location: "Suburban Tech Zone", type: "Mixed", waterSensors: "0/1", status: "Warning", image: "https://images.unsplash.com/photo-1664273891579-22f28332f3c4?auto=format&fit=crop&q=80&w=400" },
  { id: "B007", name: "Sunrise Residences", location: "East Hills Suburb", type: "Residential", waterSensors: "1/2", status: "Normal", image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&q=80&w=400" },
  { id: "B008", name: "Riverside Apartments", location: "Riverside District", type: "Residential", waterSensors: "0/2", status: "Critical", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=400" },
];

// ── Devices ──────────────────────────────────────────────

export const DEMO_DEVICES = [
  { id: "D001", name: "IAQ Sensor Alpha", type: "IAQ", building: "Grand Plaza Tower", location: "Executive Suite 42F", lastUpdate: "Just now", battery: 95, status: "online", gateway: "GW001" },
  { id: "D002", name: "IAQ Sensor Beta", type: "IAQ", building: "Grand Plaza Tower", location: "Main Lobby", lastUpdate: "2 mins ago", battery: 88, status: "online", gateway: "GW001" },
  { id: "D003", name: "Fire Alarm F1", type: "Fire", building: "Grand Plaza Tower", location: "Server Room B2", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW001" },
  { id: "D004", name: "Smoke Detector S1", type: "Smoke", building: "Grand Plaza Tower", location: "Kitchen 15F", lastUpdate: "5 mins ago", battery: 92, status: "online", gateway: "GW001" },
  { id: "D005", name: "Leak Detector L1", type: "Leakage", building: "Grand Plaza Tower", location: "Basement Pump Room", lastUpdate: "1 min ago", battery: 78, status: "online", gateway: "GW001" },
  { id: "D006", name: "Temp Sensor T1", type: "Temperature", building: "Grand Plaza Tower", location: "Data Center", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW001" },
  { id: "D007", name: "Noise Monitor N1", type: "Noise", building: "Harbor View Residences", location: "Pool Area", lastUpdate: "3 mins ago", battery: 65, status: "online", gateway: "GW002" },
  { id: "D008", name: "Leak Detector L2", type: "Leakage", building: "Harbor View Residences", location: "Unit 12B Bathroom", lastUpdate: "45 mins ago", battery: 42, status: "warning", gateway: "GW002" },
  { id: "D009", name: "Smoke Detector S2", type: "Smoke", building: "Harbor View Residences", location: "Parking P1", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW002" },
  { id: "D010", name: "IAQ Sensor Gamma", type: "IAQ", building: "Harbor View Residences", location: "Common Area 3F", lastUpdate: "10 mins ago", battery: 71, status: "online", gateway: "GW002" },
  { id: "D011", name: "Temp Sensor T2", type: "Temperature", building: "Westside Logistics Hub", location: "Cold Storage A", lastUpdate: "1 min ago", battery: 55, status: "online", gateway: "GW003" },
  { id: "D012", name: "Leak Detector L3", type: "Leakage", building: "Westside Logistics Hub", location: "Loading Dock", lastUpdate: "Offline", battery: 0, status: "offline", gateway: "GW003" },
  { id: "D013", name: "Fire Alarm F2", type: "Fire", building: "Westside Logistics Hub", location: "Warehouse C", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW003" },
  { id: "D014", name: "Noise Monitor N2", type: "Noise", building: "Tech Innovation Park", location: "Open Office Floor 2", lastUpdate: "2 mins ago", battery: 82, status: "online", gateway: "GW004" },
  { id: "D015", name: "IAQ Sensor Delta", type: "IAQ", building: "Tech Innovation Park", location: "Conference Hall A", lastUpdate: "5 mins ago", battery: 90, status: "online", gateway: "GW004" },
  { id: "D016", name: "Temp Sensor T3", type: "Temperature", building: "Tech Innovation Park", location: "Server Room", lastUpdate: "Just now", battery: 97, status: "online", gateway: "GW004" },
  { id: "D017", name: "IAQ Sensor Epsilon", type: "IAQ", building: "Metro Mall Central", location: "Food Court", lastUpdate: "1 min ago", battery: 85, status: "online", gateway: "GW005" },
  { id: "D018", name: "Fire Alarm F3", type: "Fire", building: "Metro Mall Central", location: "Cinema Level", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW005" },
  { id: "D019", name: "Temp Sensor T4", type: "Temperature", building: "Green Valley Campus", location: "Lab Building A", lastUpdate: "5 mins ago", battery: 73, status: "online", gateway: "GW006" },
  { id: "D020", name: "Leak Detector L4", type: "Leakage", building: "Green Valley Campus", location: "Greenhouse", lastUpdate: "2 hours ago", battery: 12, status: "warning", gateway: "GW006" },
  { id: "D021", name: "Leak Detector L5", type: "Leakage", building: "Sunrise Residences", location: "Laundry Room", lastUpdate: "30 mins ago", battery: 25, status: "warning", gateway: "GW007" },
  { id: "D022", name: "Smoke Detector S3", type: "Smoke", building: "Sunrise Residences", location: "Hallway 2F", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW007" },
  { id: "D023", name: "Smoke Detector S4", type: "Smoke", building: "Riverside Apartments", location: "Lobby", lastUpdate: "Offline", battery: 5, status: "offline", gateway: "GW008" },
  { id: "D024", name: "Leak Detector L6", type: "Leakage", building: "Riverside Apartments", location: "Basement Utility", lastUpdate: "Offline", battery: 0, status: "offline", gateway: "GW008" },
  { id: "D025", name: "Fire Alarm F4", type: "Fire", building: "Riverside Apartments", location: "Stairwell B", lastUpdate: "1 hour ago", battery: 35, status: "warning", gateway: "GW008" },
];

// ── Gateways ─────────────────────────────────────────────

function _now() { return new Date().toISOString(); }

export const DEMO_GATEWAYS = [
  { id: "GW001", name: "Plaza Core Gateway", model: "FioGate Pro 500", protocol: "Zigbee", property: "Grand Plaza Tower", location: "Lobby Server Rack", ipAddress: "192.168.1.10", macAddress: "AA:BB:CC:01:01:01", firmware: "v3.2.1", status: "online" as const, signal: 98, uptime: "45d 12h", lastSeen: _now(), connectedDevices: 6, onlineDevices: 6, offlineDevices: 0, warningDevices: 0, devices: DEMO_DEVICES.filter(d => d.gateway === "GW001").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW002", name: "Harbor Network Hub", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Harbor View Residences", location: "Utility Room B2", ipAddress: "192.168.2.10", macAddress: "AA:BB:CC:02:02:02", firmware: "v3.1.8", status: "online" as const, signal: 85, uptime: "12d 6h", lastSeen: _now(), connectedDevices: 4, onlineDevices: 3, offlineDevices: 0, warningDevices: 1, devices: DEMO_DEVICES.filter(d => d.gateway === "GW002").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW003", name: "Westside Controller", model: "FioGate Pro 500", protocol: "WiFi", property: "Westside Logistics Hub", location: "Control Room", ipAddress: "192.168.3.10", macAddress: "AA:BB:CC:03:03:03", firmware: "v3.2.0", status: "online" as const, signal: 76, uptime: "22d 0h", lastSeen: _now(), connectedDevices: 3, onlineDevices: 2, offlineDevices: 1, warningDevices: 0, devices: DEMO_DEVICES.filter(d => d.gateway === "GW003").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW004", name: "Tech Park Router", model: "FioGate Max 800", protocol: "BLE+Zigbee", property: "Tech Innovation Park", location: "Network Closet Floor 2", ipAddress: "192.168.4.10", macAddress: "AA:BB:CC:04:04:04", firmware: "v4.0.0", status: "online" as const, signal: 94, uptime: "90d 4h", lastSeen: _now(), connectedDevices: 3, onlineDevices: 3, offlineDevices: 0, warningDevices: 0, devices: DEMO_DEVICES.filter(d => d.gateway === "GW004").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW005", name: "Mall Central Hub", model: "FioGate Max 800", protocol: "Zigbee", property: "Metro Mall Central", location: "Security Office", ipAddress: "192.168.5.10", macAddress: "AA:BB:CC:05:05:05", firmware: "v4.0.0", status: "online" as const, signal: 91, uptime: "35d 2h", lastSeen: _now(), connectedDevices: 2, onlineDevices: 2, offlineDevices: 0, warningDevices: 0, devices: DEMO_DEVICES.filter(d => d.gateway === "GW005").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW006", name: "Campus Gateway", model: "FioGate Pro 500", protocol: "WiFi", property: "Green Valley Campus", location: "IT Building", ipAddress: "192.168.6.10", macAddress: "AA:BB:CC:06:06:06", firmware: "v3.2.1", status: "warning" as const, signal: 58, uptime: "3d 7h", lastSeen: new Date(Date.now() - 600000).toISOString(), connectedDevices: 2, onlineDevices: 1, offlineDevices: 0, warningDevices: 1, devices: DEMO_DEVICES.filter(d => d.gateway === "GW006").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW007", name: "Sunrise Bridge", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Sunrise Residences", location: "Maintenance Room", ipAddress: "192.168.7.10", macAddress: "AA:BB:CC:07:07:07", firmware: "v3.1.8", status: "online" as const, signal: 72, uptime: "8d 14h", lastSeen: _now(), connectedDevices: 2, onlineDevices: 1, offlineDevices: 0, warningDevices: 1, devices: DEMO_DEVICES.filter(d => d.gateway === "GW007").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
  { id: "GW008", name: "Riverside Bridge", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Riverside Apartments", location: "Basement Panel", ipAddress: "192.168.8.10", macAddress: "AA:BB:CC:08:08:08", firmware: "v3.1.5", status: "offline" as const, signal: 0, uptime: "0d 0h", lastSeen: new Date(Date.now() - 7200000).toISOString(), connectedDevices: 3, onlineDevices: 0, offlineDevices: 2, warningDevices: 1, devices: DEMO_DEVICES.filter(d => d.gateway === "GW008").map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, battery: d.battery })) },
];

// ── Alarms ───────────────────────────────────────────────

export const DEMO_ALARMS = [
  { id: "A001", type: "Water Leakage", location: "Unit 12B Bathroom", property: "Harbor View Residences", severity: "high" as const, time: new Date(Date.now() - 10 * 60000).toISOString(), status: "pending" as const, description: "Active water leak detected by sensor L2. Flow rate abnormal." },
  { id: "A002", type: "Device Offline", location: "Basement Utility", property: "Riverside Apartments", severity: "high" as const, time: new Date(Date.now() - 30 * 60000).toISOString(), status: "pending" as const, description: "Gateway GW008 and 3 connected devices offline for 2 hours." },
  { id: "A003", type: "Temperature", location: "Cold Storage A", property: "Westside Logistics Hub", severity: "high" as const, time: new Date(Date.now() - 15 * 60000).toISOString(), status: "pending" as const, description: "Temperature exceeding threshold: 12.4°C (limit: 4°C). Cold chain failure risk." },
  { id: "A004", type: "Water Leakage", location: "Greenhouse", property: "Green Valley Campus", severity: "medium" as const, time: new Date(Date.now() - 2 * 3600000).toISOString(), status: "pending" as const, description: "Moisture level elevated. Sensor L4 battery critical at 12%." },
  { id: "A005", type: "Device Warning", location: "Stairwell B", property: "Riverside Apartments", severity: "medium" as const, time: new Date(Date.now() - 1 * 3600000).toISOString(), status: "pending" as const, description: "Fire Alarm F4 intermittent connectivity. Battery at 35%." },
  { id: "A006", type: "Smoke Detected", location: "Kitchen 15F", property: "Grand Plaza Tower", severity: "medium" as const, time: new Date(Date.now() - 45 * 60000).toISOString(), status: "pending" as const, description: "Smoke sensor S1 triggered. Investigating — possible cooking." },
  { id: "A007", type: "High Humidity", location: "Laundry Room", property: "Sunrise Residences", severity: "low" as const, time: new Date(Date.now() - 3 * 3600000).toISOString(), status: "pending" as const, description: "Humidity at 72% for 30+ minutes. Ventilation check recommended." },
  { id: "A008", type: "Device Offline", location: "Loading Dock", property: "Westside Logistics Hub", severity: "low" as const, time: new Date(Date.now() - 5 * 3600000).toISOString(), status: "pending" as const, description: "Leak Detector L3 offline. Battery depleted." },
  { id: "A009", type: "Fire Alarm", location: "Parking P1", property: "Harbor View Residences", severity: "high" as const, time: new Date(Date.now() - 6 * 3600000).toISOString(), status: "resolved" as const, description: "Fire alarm in parking. False alarm — exhaust fumes. Reset by security." },
  { id: "A010", type: "Water Leakage", location: "Basement Pump Room", property: "Grand Plaza Tower", severity: "high" as const, time: new Date(Date.now() - 12 * 3600000).toISOString(), status: "resolved" as const, description: "Minor pipe condensation. Maintenance confirmed no active leak." },
  { id: "A011", type: "Temperature", location: "Server Room", property: "Tech Innovation Park", severity: "medium" as const, time: new Date(Date.now() - 24 * 3600000).toISOString(), status: "resolved" as const, description: "HVAC temporarily offline. Temperature reached 28°C before restored." },
  { id: "A012", type: "Smoke Detected", location: "Food Court", property: "Metro Mall Central", severity: "medium" as const, time: new Date(Date.now() - 36 * 3600000).toISOString(), status: "resolved" as const, description: "Cooking smoke from tenant restaurant. Ventilation improved." },
];

// ── Dashboard Stats ──────────────────────────────────────

const onlineCount = DEMO_DEVICES.filter(d => d.status === "online").length;
const offlineCount = DEMO_DEVICES.filter(d => d.status === "offline").length;
const warningCount = DEMO_DEVICES.filter(d => d.status === "warning").length;
const pendingAlarms = DEMO_ALARMS.filter(a => a.status === "pending");

export const DEMO_STATS = {
  properties: {
    total: DEMO_PROPERTIES.length,
    images: DEMO_PROPERTIES.map(p => p.image),
  },
  devices: {
    total: DEMO_DEVICES.length,
    online: onlineCount,
    offline: offlineCount,
    warning: warningCount,
    onlinePercent: Math.round((onlineCount / DEMO_DEVICES.length) * 100),
  },
  alarms: {
    totalPending: pendingAlarms.length,
    highSeverity: pendingAlarms.filter(a => a.severity === "high").length,
    waterLeaks: pendingAlarms.filter(a => a.type === "Water Leakage").length,
    systemWarnings: pendingAlarms.filter(a => a.type === "Device Offline" || a.type === "Device Warning").length,
  },
  water: {
    status: "Warning",
    leakWarnings: pendingAlarms.filter(a => a.type === "Water Leakage").length,
  },
};

// ── Telemetry ────────────────────────────────────────────

export const DEMO_TELEMETRY = {
  airQuality: [
    { propertyId: "B001", propertyName: "Grand Plaza Tower", aqi: 42, co2: 520, pm25: 12, voc: 0.3, temperature: 23.2, humidity: 45, trend: "stable" as const, sensorCount: 2, sensorsOnline: 2 },
    { propertyId: "B002", propertyName: "Harbor View Residences", aqi: 58, co2: 680, pm25: 18, voc: 0.5, temperature: 24.8, humidity: 62, trend: "up" as const, sensorCount: 1, sensorsOnline: 1 },
    { propertyId: "B004", propertyName: "Tech Innovation Park", aqi: 35, co2: 410, pm25: 8, voc: 0.2, temperature: 22.0, humidity: 40, trend: "down" as const, sensorCount: 1, sensorsOnline: 1 },
    { propertyId: "B005", propertyName: "Metro Mall Central", aqi: 65, co2: 780, pm25: 22, voc: 0.8, temperature: 25.5, humidity: 55, trend: "up" as const, sensorCount: 1, sensorsOnline: 1 },
  ],
  waterZones: [
    { id: "WZ1", zone: "Downtown District", pressure: 4.2, flow: 120, status: "Normal", leakDetected: false },
    { id: "WZ2", zone: "Marina Bay", pressure: 3.8, flow: 95, status: "Warning", leakDetected: true },
    { id: "WZ3", zone: "Industrial Park", pressure: 4.0, flow: 110, status: "Normal", leakDetected: false },
    { id: "WZ4", zone: "Silicon Quarter", pressure: 4.1, flow: 105, status: "Normal", leakDetected: false },
  ],
  bmsItems: [
    { id: "BMS1", system: "HVAC", consumption: "245 kWh", load: "72%", status: "Normal" },
    { id: "BMS2", system: "Lighting", consumption: "89 kWh", load: "45%", status: "Normal" },
    { id: "BMS3", system: "Elevators", consumption: "156 kWh", load: "88%", status: "Warning" },
    { id: "BMS4", system: "Fire Safety", consumption: "12 kWh", load: "5%", status: "Normal" },
  ],
  generatedAt: new Date().toISOString(),
  source: "simulated" as const,
};

// ── Alarm Chart Data ─────────────────────────────────────

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DEMO_ALARM_CHART = days.map(name => ({
  name,
  water: Math.floor(Math.random() * 5),
  smoke: Math.floor(Math.random() * 3),
  temperature: Math.floor(Math.random() * 4),
  deviceOffline: Math.floor(Math.random() * 6),
}));

// ── Notifications ────────────────────────────────────────

export const DEMO_NOTIFICATIONS = {
  notifications: DEMO_ALARMS.filter(a => a.status === "pending").slice(0, 6).map((a, i) => ({
    id: `N${String(i + 1).padStart(3, "0")}`,
    type: a.type,
    property: a.property,
    location: a.location,
    severity: a.severity,
    time: a.time,
    description: a.description,
    read: i >= 3,
  })),
  unreadCount: 3,
};

// ── Settings ─────────────────────────────────────────────

export const DEMO_SETTINGS = {
  profile: { name: "Demo User", email: "demo@fiotec.io", role: "Admin", company: "FioTec Demo", phone: "+1 (555) 000-0000" },
  notifications: {
    emailAlerts: true, smsAlerts: false, pushNotifications: true,
    alertTypes: { waterLeak: true, smoke: true, deviceOffline: true, highHumidity: false, temperature: false },
    quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00",
  },
  dashboard: { temperatureUnit: "celsius" as const, refreshInterval: 30, compactMode: false, dateFormat: "DD/MM/YYYY", timezone: "Asia/Hong_Kong" },
  security: { twoFactorEnabled: false, sessionTimeout: 30, loginNotifications: true },
};

// ── Widget Layout ────────────────────────────────────────

export const DEMO_WIDGET_LAYOUT = {
  order: ["environmental", "water", "bms", "alerts", "health"],
  active: ["environmental", "alerts", "health"],
};

// ── Webhook Config ───────────────────────────────────────

export const DEMO_WEBHOOK_CONFIG = {
  token: null,
  webhookUrl: null,
  hasToken: false,
  lastReceived: null,
};

// ── Alarm Telemetry ──────────────────────────────────────

export function getDemoAlarmTelemetry(type: string) {
  const zoneNames = type === "Water Leakage"
    ? ["Zone A - Pump Room", "Zone B - Restrooms", "Zone C - Kitchen", "Zone D - Utility"]
    : type === "Fire Alarm"
    ? ["Floor 1", "Floor 2", "Floor 3", "Parking"]
    : type === "Smoke Detected"
    ? ["Kitchen Area", "Server Room", "Parking P1", "Lobby"]
    : ["Zone 1", "Zone 2", "Zone 3", "Zone 4"];

  return {
    zones: zoneNames.map((name, i) => ({
      name,
      status: (i === 1 ? "warning" : i === 0 ? "alert" : "normal") as 'normal' | 'warning' | 'alert',
    })),
    trendData: days.map(name => ({ name, count: Math.floor(Math.random() * 8) })),
    totalRelevantDevices: 6,
    totalRelevantAlarms: DEMO_ALARMS.filter(a => a.type === type).length,
  };
}

// ── Sensor Data ──────────────────────────────────────────

export const DEMO_SENSOR_DATA = {
  entries: [] as any[],
  totalEntries: 0,
  devices: [] as any[],
  totalDevices: 0,
};

// ── AWS (demo shows "not configured") ────────────────────

export const DEMO_AWS_STATUS = {
  configured: false, credentialsSet: false,
  iotCoreConnected: false, dynamoDBConnected: false,
  region: "", iotEndpoint: "", dynamoTableName: "",
  enabled: false, lastSyncAt: null, missingSecrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
};

export const DEMO_AWS_CONFIG = {
  iotEndpoint: "", region: "us-east-1", dynamoTableName: "",
  dynamoSortKey: "timestamp", dynamoPartitionKey: "deviceId",
  enabled: false, syncInterval: 300, lastSyncAt: null,
  credentialsConfigured: false,
};

// ═══════════════════════════════════════════════════════════
// DEMO REQUEST HANDLER — intercepts fetchWithAuth calls when
// demo mode is active. Returns cloned data so in-memory
// mutations (add/delete) work within the session.
// ═══════════════════════════════════════════════════════════

// Mutable copies for the current demo session
let _properties = structuredClone(DEMO_PROPERTIES);
let _devices = structuredClone(DEMO_DEVICES);
let _gateways = structuredClone(DEMO_GATEWAYS);
let _alarms = structuredClone(DEMO_ALARMS);
let _settings = structuredClone(DEMO_SETTINGS);
let _widgetLayout = structuredClone(DEMO_WIDGET_LAYOUT);

/** Reset mutable session state (e.g., on "reset data") */
function resetDemoSession() {
  _properties = structuredClone(DEMO_PROPERTIES);
  _devices = structuredClone(DEMO_DEVICES);
  _gateways = structuredClone(DEMO_GATEWAYS);
  _alarms = structuredClone(DEMO_ALARMS);
  _settings = structuredClone(DEMO_SETTINGS);
  _widgetLayout = structuredClone(DEMO_WIDGET_LAYOUT);
}

function computeStats() {
  const online = _devices.filter(d => d.status === "online").length;
  const offline = _devices.filter(d => d.status === "offline").length;
  const warning = _devices.filter(d => d.status === "warning").length;
  const pending = _alarms.filter(a => a.status === "pending");
  return {
    properties: { total: _properties.length, images: _properties.map(p => p.image) },
    devices: { total: _devices.length, online, offline, warning, onlinePercent: Math.round((online / (_devices.length || 1)) * 100) },
    alarms: {
      totalPending: pending.length,
      highSeverity: pending.filter(a => a.severity === "high").length,
      waterLeaks: pending.filter(a => a.type === "Water Leakage").length,
      systemWarnings: pending.filter(a => a.type === "Device Offline" || a.type === "Device Warning").length,
    },
    water: { status: pending.some(a => a.type === "Water Leakage") ? "Warning" : "Normal", leakWarnings: pending.filter(a => a.type === "Water Leakage").length },
  };
}

/** Simulate a tiny network delay for realism (10-40ms) */
const tick = () => new Promise(r => setTimeout(r, 10 + Math.random() * 30));

/**
 * Handle a demo-mode API request.
 * @param path  The API path (e.g., "/properties", "/devices/D001")
 * @param options  The RequestInit options
 * @returns The response data (already parsed JSON)
 */
export async function handleDemoRequest(path: string, options: RequestInit = {}): Promise<any> {
  await tick();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};

  // ── Health ────────────────────────────────────────────
  if (path === "/health") return { status: "ok", schemaReady: true, demo: true };

  // ── Properties ────────────────────────────────────────
  if (path === "/properties" && method === "GET") {
    // Enrich each property with device counts computed from _devices
    return _properties.map(p => {
      const devs = _devices.filter(d => d.building === p.name);
      return {
        ...p,
        deviceCount: devs.length,
        onlineDevices: devs.filter(d => d.status === "online").length,
        offlineDevices: devs.filter(d => d.status === "offline").length,
        warningDevices: devs.filter(d => d.status === "warning").length,
      };
    });
  }
  if (path === "/properties" && method === "POST") {
    const id = `B${String(_properties.length + 1).padStart(3, "0")}`;
    const p = { id, ...body, waterSensors: "0/0", status: "Normal", image: body.image || DEMO_PROPERTIES[0].image };
    _properties.push(p);
    return p;
  }
  const propMatch = path.match(/^\/properties\/([^/]+)$/);
  if (propMatch) {
    const id = propMatch[1];
    if (method === "GET") {
      const p = _properties.find(x => x.id === id);
      if (!p) return { error: "Not found" };
      const devs = _devices.filter(d => d.building === p.name);
      return { ...p, devices: devs, deviceCount: devs.length, onlineDevices: devs.filter(d => d.status === "online").length, offlineDevices: devs.filter(d => d.status === "offline").length, warningDevices: devs.filter(d => d.status === "warning").length };
    }
    if (method === "PUT") {
      const idx = _properties.findIndex(x => x.id === id);
      if (idx >= 0) { _properties[idx] = { ..._properties[idx], ...body }; return _properties[idx]; }
    }
    if (method === "DELETE") {
      _properties = _properties.filter(x => x.id !== id);
      return { success: true, message: "Deleted" };
    }
  }

  // ── Devices ───────────────────────────────────────────
  if (path === "/devices" && method === "GET") return _devices;
  if (path === "/devices" && method === "POST") {
    const id = `D${String(_devices.length + 1).padStart(3, "0")}`;
    const d = { id, ...body, lastUpdate: "Just now", battery: 100, status: "online" };
    _devices.push(d);
    return d;
  }
  const devMatch = path.match(/^\/devices\/([^/]+)$/);
  if (devMatch) {
    const id = devMatch[1];
    if (method === "PUT") {
      const idx = _devices.findIndex(x => x.id === id);
      if (idx >= 0) { _devices[idx] = { ..._devices[idx], ...body }; return _devices[idx]; }
    }
    if (method === "DELETE") {
      _devices = _devices.filter(x => x.id !== id);
      return { success: true, message: "Deleted" };
    }
  }
  const devAssignMatch = path.match(/^\/devices\/([^/]+)\/assign$/);
  if (devAssignMatch && method === "PUT") {
    const idx = _devices.findIndex(x => x.id === devAssignMatch[1]);
    if (idx >= 0) { _devices[idx].building = body.building; return _devices[idx]; }
  }

  // ── Gateways ──────────────────────────────────────────
  if (path === "/gateways" && method === "GET") return _gateways;
  if (path === "/gateways" && method === "POST") {
    const id = `GW${String(_gateways.length + 1).padStart(3, "0")}`;
    const g = { id, ...body, status: "online" as const, signal: 90, uptime: "0d 0h", lastSeen: new Date().toISOString(), connectedDevices: 0, onlineDevices: 0, offlineDevices: 0, warningDevices: 0, devices: [] };
    _gateways.push(g);
    return g;
  }
  const gwMatch = path.match(/^\/gateways\/([^/]+)$/);
  if (gwMatch) {
    const id = gwMatch[1];
    if (method === "GET") return _gateways.find(x => x.id === id) || { error: "Not found" };
    if (method === "PUT") {
      const idx = _gateways.findIndex(x => x.id === id);
      if (idx >= 0) { _gateways[idx] = { ..._gateways[idx], ...body }; return _gateways[idx]; }
    }
    if (method === "DELETE") {
      _gateways = _gateways.filter(x => x.id !== id);
      return { success: true, message: "Deleted" };
    }
  }
  if (path === "/gateway-assign-devices" && method === "PUT") {
    return { success: true, message: `Assigned ${body.deviceIds?.length || 0} devices` };
  }
  if (path === "/gateway-unassign-device" && method === "PUT") {
    return { success: true, message: "Unassigned" };
  }
  if (path === "/gateway-heartbeat" && method === "POST") {
    return { success: true, status: "online", signal: body.signal || 95, lastSeen: new Date().toISOString() };
  }
  if (path === "/gateway-heartbeat-batch" && method === "POST") {
    return { success: true, results: (body.heartbeats || []).map(() => ({ success: true })) };
  }

  // ── Alarms ────────────────────────────────────────────
  if (path === "/alarms" && method === "GET") return _alarms;
  const alarmMatch = path.match(/^\/alarms\/([^/]+)$/);
  if (alarmMatch) {
    const id = alarmMatch[1];
    if (method === "PUT") {
      const idx = _alarms.findIndex(x => x.id === id);
      if (idx >= 0) { _alarms[idx] = { ..._alarms[idx], ...body }; return _alarms[idx]; }
    }
    if (method === "DELETE") {
      _alarms = _alarms.filter(x => x.id !== id);
      return { success: true };
    }
  }

  // ── Stats ─────────────────────────────────────────────
  if (path === "/stats") return computeStats();

  // ── Telemetry ─────────────────────────────────────────
  if (path === "/telemetry") return DEMO_TELEMETRY;

  // ── Alarm chart data ──────────────────────────────────
  if (path === "/alarm-chart-data") return DEMO_ALARM_CHART;

  // ── Alarm telemetry ───────────────────────────────────
  if (path.startsWith("/alarm-telemetry")) {
    const t = new URLSearchParams(path.split("?")[1] || "").get("type") || "water";
    const typeMap: Record<string, string> = { water: "Water Leakage", fire: "Fire Alarm", smoke: "Smoke Detected" };
    return getDemoAlarmTelemetry(typeMap[t] || t);
  }

  // ── Notifications ─────────────────────────────────────
  if (path === "/notifications") return DEMO_NOTIFICATIONS;

  // ── Settings ──────────────────────────────────────────
  if (path === "/settings" && method === "GET") return _settings;
  if (path === "/settings" && method === "PUT") {
    _settings = { ..._settings, ...body };
    return _settings;
  }

  // ── Widget Layout ─────────────────────────────────────
  if (path === "/widget-layout" && method === "GET") return _widgetLayout;
  if (path === "/widget-layout" && method === "PUT") {
    _widgetLayout = { ..._widgetLayout, ...body };
    return _widgetLayout;
  }

  // ── Webhook Config ────────────────────────────────────
  if (path === "/webhook-config" && method === "GET") return DEMO_WEBHOOK_CONFIG;
  if (path === "/webhook-config" && method === "POST") return { ...DEMO_WEBHOOK_CONFIG, token: "demo-webhook-token", hasToken: true, webhookUrl: "https://demo.fiotec.io/webhook/demo-webhook-token" };
  if (path === "/webhook-test" && method === "POST") return { success: true, latencyMs: 42, entryId: null };

  // ── Sensor Data ───────────────────────────────────────
  if (path.startsWith("/sensor-data")) return DEMO_SENSOR_DATA;

  // ── Account type ──────────────────────────────────────
  if (path === "/account-type") return { accountType: "demo" };

  // ── Export / Reset ────────────────────────────────────
  if (path === "/export") return { properties: _properties, devices: _devices, gateways: _gateways, alarms: _alarms, settings: _settings };
  if (path === "/reset-data" && method === "POST") { resetDemoSession(); return { success: true, message: "Demo data reset" }; }

  // ── AWS ───────────────────────────────────────────────
  if (path === "/aws/status") return DEMO_AWS_STATUS;
  if (path === "/aws/config" && method === "GET") return DEMO_AWS_CONFIG;
  if (path === "/aws/config" && method === "PUT") return { success: true, config: { ...DEMO_AWS_CONFIG, ...body } };
  if (path.startsWith("/aws/things")) return { things: [], nextToken: null, total: 0 };
  if (path.startsWith("/aws/telemetry")) return { source: "demo", tableName: "", items: [], count: 0, queryParams: { deviceId: null, hoursBack: 24, limit: 50 } };
  if (path === "/aws/sync-devices" && method === "POST") return { success: true, summary: { awsThingsFound: 0, created: 0, updated: 0, skipped: 0, totalFioTecDevices: _devices.length }, syncedAt: new Date().toISOString() };
  if (path === "/aws/push-telemetry" && method === "POST") return { success: true, topic: "demo", entriesPushed: 0 };
  if (path === "/aws/publish" && method === "POST") return { success: true, topic: body.topic || "demo" };

  // ── Upload (no-op in demo) ────────────────────────────
  if (path === "/upload") return { url: DEMO_PROPERTIES[0].image, path: "demo/image.jpg", fileName: "image.jpg" };

  // ── Admin ─────────────────────────────────────────────
  if (path === "/admin/check") return { isAdmin: true };
  if (path === "/admin/users" && method === "GET") return {
    users: [
      { id: "demo-user", email: "demo@fiotec.io", name: "Demo User", accountType: "demo", role: "Admin", company: "FioTec Demo", phone: "+852 0000 0000", createdAt: "2025-01-15T10:00:00Z", lastSignIn: new Date().toISOString(), emailConfirmed: true, isMaster: false },
      { id: "user-001", email: "john@example.com", name: "John Smith", accountType: "standard", role: "Manager", company: "Acme Corp", phone: "+1 555 1234", createdAt: "2025-02-01T08:30:00Z", lastSignIn: "2025-06-10T14:20:00Z", emailConfirmed: true, isMaster: false },
      { id: "user-002", email: "sarah@example.com", name: "Sarah Chen", accountType: "standard", role: "Engineer", company: "TechBuild", phone: "+44 20 7946 0958", createdAt: "2025-03-10T12:00:00Z", lastSignIn: "2025-06-11T09:15:00Z", emailConfirmed: true, isMaster: false },
      { id: "master-001", email: "master@fiotec.io", name: "System Admin", accountType: "standard", role: "Admin", company: "FioTec", phone: "+852 9876 5432", createdAt: "2025-01-01T00:00:00Z", lastSignIn: new Date().toISOString(), emailConfirmed: true, isMaster: true },
    ],
    total: 4, page: 1, perPage: 50,
  };
  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) {
    const uid = adminUserMatch[1];
    if (method === "GET") {
      return { id: uid, email: uid === "demo-user" ? "demo@fiotec.io" : "user@example.com", name: uid === "demo-user" ? "Demo User" : "User", accountType: "standard", role: "Manager", company: "Example Corp", phone: "+1 555 0000", profile: { name: "User", email: "user@example.com", role: "Manager", company: "Example Corp", phone: "+1 555 0000" }, notifications: null, dashboard: null, security: null, propertyCount: 3, deviceCount: 12, createdAt: "2025-02-01T08:30:00Z", lastSignIn: "2025-06-10T14:20:00Z", emailConfirmed: true, isMaster: false };
    }
    if (method === "PUT") return { success: true, message: "User updated (demo)" };
    if (method === "DELETE") return { success: true, message: "User deleted (demo)" };
  }

  // ── Signup (no-op in demo) ────────────────────────────
  if (path === "/signup") return { success: true, userId: "demo-user" };

  // ── Fallback ──────────────────────────────────────────
  console.warn(`[Demo] Unhandled request: ${method} ${path}`);
  return {};
}
