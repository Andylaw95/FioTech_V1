// ═══════════════════════════════════════════════════════════
// SEED DATA — Extracted from index.tsx to reduce module
// evaluation time and prevent BOOT_ERROR on cold starts.
// ═══════════════════════════════════════════════════════════

// ── Standard account defaults ────────────────────────────

export const INITIAL_PROPERTIES = [
  { id: "B001", name: "Grand Plaza Tower", location: "Downtown", type: "Commercial", waterSensors: "3/3", status: "Normal", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400" },
  { id: "B002", name: "Harbor View Complex", location: "Harbor", type: "Residential", waterSensors: "1/1", status: "Warning", image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&q=80&w=400" },
  { id: "B003", name: "Westside Logistics", location: "Westside", type: "Industrial", waterSensors: "1/1", status: "Normal", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=400" },
  { id: "B004", name: "Tech Park A", location: "Innovation District", type: "Commercial", waterSensors: "0/0", status: "Normal", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=400" },
];

export const INITIAL_DEVICES = [
  { id: "D001", name: "IAQ Sensor Alpha", type: "IAQ", building: "Grand Plaza Tower", location: "Meeting Room A", lastUpdate: "Just now", battery: 95, status: "online", gateway: "GW001" },
  { id: "D002", name: "Noise Monitor X1", type: "Noise", building: "Tech Park A", location: "Open Workspace", lastUpdate: "2 mins ago", battery: 82, status: "online", gateway: "GW004" },
  { id: "D003", name: "Leak Detector L1", type: "Leakage", building: "Harbor View Complex", location: "Pantry", lastUpdate: "1 hour ago", battery: 15, status: "warning", gateway: "GW002" },
  { id: "D004", name: "IAQ Sensor Beta", type: "IAQ", building: "Grand Plaza Tower", location: "Reception", lastUpdate: "5 mins ago", battery: 100, status: "online", gateway: "GW001" },
  { id: "D005", name: "Smoke Detector S1", type: "Smoke", building: "Harbor View Complex", location: "Server Room", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW002" },
  { id: "D006", name: "Leak Detector L2", type: "Leakage", building: "Harbor View Complex", location: "Restroom 1", lastUpdate: "Offline", battery: 0, status: "offline", gateway: "GW002" },
  { id: "D007", name: "Noise Monitor X2", type: "Noise", building: "Tech Park A", location: "Conference Hall", lastUpdate: "10 mins ago", battery: 60, status: "online", gateway: "GW004" },
  { id: "D008", name: "Fire Alarm Main", type: "Fire", building: "Grand Plaza Tower", location: "Lobby", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW001" },
  { id: "D009", name: "Temp Sensor B1", type: "Temperature", building: "Westside Logistics", location: "Cold Storage", lastUpdate: "1 min ago", battery: 45, status: "online", gateway: "GW003" },
];

export function makeInitialGateways(): any[] {
  return [
    { id: "GW001", name: "Plaza Core Gateway", model: "FioGate Pro 500", protocol: "Zigbee", property: "Grand Plaza Tower", location: "Lobby Server Rack", ipAddress: "192.168.1.10", macAddress: "AA:BB:CC:01:01:01", firmware: "v3.2.1", status: "online", signal: 98, uptime: "45d 12h", lastSeen: new Date().toISOString() },
    { id: "GW002", name: "Harbor Network Hub", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Harbor View Complex", location: "Utility Room B2", ipAddress: "192.168.2.10", macAddress: "AA:BB:CC:02:02:02", firmware: "v3.1.8", status: "online", signal: 85, uptime: "12d 6h", lastSeen: new Date().toISOString() },
    { id: "GW003", name: "Westside Controller", model: "FioGate Pro 500", protocol: "WiFi", property: "Westside Logistics", location: "Control Room", ipAddress: "192.168.3.10", macAddress: "AA:BB:CC:03:03:03", firmware: "v3.2.0", status: "warning", signal: 62, uptime: "3d 18h", lastSeen: new Date(Date.now() - 300000).toISOString() },
    { id: "GW004", name: "Tech Park Router", model: "FioGate Max 800", protocol: "BLE+Zigbee", property: "Tech Park A", location: "Network Closet Floor 2", ipAddress: "192.168.4.10", macAddress: "AA:BB:CC:04:04:04", firmware: "v4.0.0", status: "online", signal: 94, uptime: "90d 4h", lastSeen: new Date().toISOString() },
  ];
}

export function makeInitialAlarms(): any[] {
  return [
    { id: "A001", type: "Water Leakage", location: "Basement - Pump Room", property: "Grand Plaza Tower", severity: "high", time: new Date(Date.now() - 10 * 60000).toISOString(), status: "pending", description: "Water detected on floor sensor S-204." },
    { id: "A002", type: "Smoke Detected", location: "Kitchen", property: "Harbor View Complex", severity: "medium", time: new Date(Date.now() - 45 * 60000).toISOString(), status: "resolved", description: "Smoke sensor triggered. False alarm verified." },
    { id: "A003", type: "High Humidity", location: "Server Room", property: "Tech Park A", severity: "low", time: new Date(Date.now() - 2 * 3600000).toISOString(), status: "resolved", description: "Humidity > 60% for 15 mins." },
    { id: "A004", type: "Device Offline", location: "Lobby", property: "Grand Plaza Tower", severity: "low", time: new Date(Date.now() - 5 * 3600000).toISOString(), status: "pending", description: "Noise sensor lost connectivity." },
    { id: "A005", type: "Water Leakage", location: "Restroom 2", property: "Westside Logistics", severity: "high", time: new Date(Date.now() - 24 * 3600000).toISOString(), status: "resolved", description: "Leak resolved by maintenance." },
    { id: "A006", type: "Temperature", location: "Cold Storage", property: "Westside Logistics", severity: "medium", time: new Date(Date.now() - 30 * 60000).toISOString(), status: "pending", description: "Cold storage temperature exceeding threshold at 8.2C." },
  ];
}

// ── Demo account data ────────────────────────────────────

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

export const DEMO_DEVICES = [
  // Grand Plaza Tower — GW001
  { id: "D001", name: "IAQ Sensor Alpha", type: "IAQ", building: "Grand Plaza Tower", location: "Executive Suite 42F", lastUpdate: "Just now", battery: 95, status: "online", gateway: "GW001" },
  { id: "D002", name: "IAQ Sensor Beta", type: "IAQ", building: "Grand Plaza Tower", location: "Main Lobby", lastUpdate: "2 mins ago", battery: 88, status: "online", gateway: "GW001" },
  { id: "D003", name: "Fire Alarm F1", type: "Fire", building: "Grand Plaza Tower", location: "Server Room B2", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW001" },
  { id: "D004", name: "Smoke Detector S1", type: "Smoke", building: "Grand Plaza Tower", location: "Kitchen 15F", lastUpdate: "5 mins ago", battery: 92, status: "online", gateway: "GW001" },
  { id: "D005", name: "Leak Detector L1", type: "Leakage", building: "Grand Plaza Tower", location: "Basement Pump Room", lastUpdate: "1 min ago", battery: 78, status: "online", gateway: "GW001" },
  { id: "D006", name: "Temp Sensor T1", type: "Temperature", building: "Grand Plaza Tower", location: "Data Center", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW001" },
  // Harbor View — GW002
  { id: "D007", name: "Noise Monitor N1", type: "Noise", building: "Harbor View Residences", location: "Pool Area", lastUpdate: "3 mins ago", battery: 65, status: "online", gateway: "GW002" },
  { id: "D008", name: "Leak Detector L2", type: "Leakage", building: "Harbor View Residences", location: "Unit 12B Bathroom", lastUpdate: "45 mins ago", battery: 42, status: "warning", gateway: "GW002" },
  { id: "D009", name: "Smoke Detector S2", type: "Smoke", building: "Harbor View Residences", location: "Parking P1", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW002" },
  { id: "D010", name: "IAQ Sensor Gamma", type: "IAQ", building: "Harbor View Residences", location: "Common Area 3F", lastUpdate: "10 mins ago", battery: 71, status: "online", gateway: "GW002" },
  // Westside Logistics — GW003
  { id: "D011", name: "Temp Sensor T2", type: "Temperature", building: "Westside Logistics Hub", location: "Cold Storage A", lastUpdate: "1 min ago", battery: 55, status: "online", gateway: "GW003" },
  { id: "D012", name: "Leak Detector L3", type: "Leakage", building: "Westside Logistics Hub", location: "Loading Dock", lastUpdate: "Offline", battery: 0, status: "offline", gateway: "GW003" },
  { id: "D013", name: "Fire Alarm F2", type: "Fire", building: "Westside Logistics Hub", location: "Warehouse C", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW003" },
  // Tech Innovation Park — GW004
  { id: "D014", name: "Noise Monitor N2", type: "Noise", building: "Tech Innovation Park", location: "Open Office Floor 2", lastUpdate: "2 mins ago", battery: 82, status: "online", gateway: "GW004" },
  { id: "D015", name: "IAQ Sensor Delta", type: "IAQ", building: "Tech Innovation Park", location: "Conference Hall A", lastUpdate: "5 mins ago", battery: 90, status: "online", gateway: "GW004" },
  { id: "D016", name: "Temp Sensor T3", type: "Temperature", building: "Tech Innovation Park", location: "Server Room", lastUpdate: "Just now", battery: 97, status: "online", gateway: "GW004" },
  // Metro Mall — GW005
  { id: "D017", name: "IAQ Sensor Epsilon", type: "IAQ", building: "Metro Mall Central", location: "Food Court", lastUpdate: "1 min ago", battery: 85, status: "online", gateway: "GW005" },
  { id: "D018", name: "Fire Alarm F3", type: "Fire", building: "Metro Mall Central", location: "Cinema Level", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW005" },
  // Green Valley — GW006
  { id: "D019", name: "Temp Sensor T4", type: "Temperature", building: "Green Valley Campus", location: "Lab Building A", lastUpdate: "5 mins ago", battery: 73, status: "online", gateway: "GW006" },
  { id: "D020", name: "Leak Detector L4", type: "Leakage", building: "Green Valley Campus", location: "Greenhouse", lastUpdate: "2 hours ago", battery: 12, status: "warning", gateway: "GW006" },
  // Sunrise Residences — GW007
  { id: "D021", name: "Leak Detector L5", type: "Leakage", building: "Sunrise Residences", location: "Laundry Room", lastUpdate: "30 mins ago", battery: 25, status: "warning", gateway: "GW007" },
  { id: "D022", name: "Smoke Detector S3", type: "Smoke", building: "Sunrise Residences", location: "Hallway 2F", lastUpdate: "Just now", battery: 100, status: "online", gateway: "GW007" },
  // Riverside Apartments — GW008
  { id: "D023", name: "Smoke Detector S4", type: "Smoke", building: "Riverside Apartments", location: "Lobby", lastUpdate: "Offline", battery: 5, status: "offline", gateway: "GW008" },
  { id: "D024", name: "Leak Detector L6", type: "Leakage", building: "Riverside Apartments", location: "Basement Utility", lastUpdate: "Offline", battery: 0, status: "offline", gateway: "GW008" },
  { id: "D025", name: "Fire Alarm F4", type: "Fire", building: "Riverside Apartments", location: "Stairwell B", lastUpdate: "1 hour ago", battery: 35, status: "warning", gateway: "GW008" },
];

export function makeDemoGateways(): any[] {
  return [
    { id: "GW001", name: "Plaza Core Gateway", model: "FioGate Pro 500", protocol: "Zigbee", property: "Grand Plaza Tower", location: "Lobby Server Rack", ipAddress: "192.168.1.10", macAddress: "AA:BB:CC:01:01:01", firmware: "v3.2.1", status: "online", signal: 98, uptime: "45d 12h", lastSeen: new Date().toISOString() },
    { id: "GW002", name: "Harbor Network Hub", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Harbor View Residences", location: "Utility Room B2", ipAddress: "192.168.2.10", macAddress: "AA:BB:CC:02:02:02", firmware: "v3.1.8", status: "online", signal: 85, uptime: "12d 6h", lastSeen: new Date().toISOString() },
    { id: "GW003", name: "Westside Controller", model: "FioGate Pro 500", protocol: "WiFi", property: "Westside Logistics Hub", location: "Control Room", ipAddress: "192.168.3.10", macAddress: "AA:BB:CC:03:03:03", firmware: "v3.2.0", status: "online", signal: 76, uptime: "22d 0h", lastSeen: new Date().toISOString() },
    { id: "GW004", name: "Tech Park Router", model: "FioGate Max 800", protocol: "BLE+Zigbee", property: "Tech Innovation Park", location: "Network Closet Floor 2", ipAddress: "192.168.4.10", macAddress: "AA:BB:CC:04:04:04", firmware: "v4.0.0", status: "online", signal: 94, uptime: "90d 4h", lastSeen: new Date().toISOString() },
    { id: "GW005", name: "Mall Central Hub", model: "FioGate Max 800", protocol: "Zigbee", property: "Metro Mall Central", location: "Security Office", ipAddress: "192.168.5.10", macAddress: "AA:BB:CC:05:05:05", firmware: "v4.0.0", status: "online", signal: 91, uptime: "35d 2h", lastSeen: new Date().toISOString() },
    { id: "GW006", name: "Campus Gateway", model: "FioGate Pro 500", protocol: "WiFi", property: "Green Valley Campus", location: "IT Building", ipAddress: "192.168.6.10", macAddress: "AA:BB:CC:06:06:06", firmware: "v3.2.1", status: "warning", signal: 58, uptime: "3d 7h", lastSeen: new Date(Date.now() - 600000).toISOString() },
    { id: "GW007", name: "Sunrise Bridge", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Sunrise Residences", location: "Maintenance Room", ipAddress: "192.168.7.10", macAddress: "AA:BB:CC:07:07:07", firmware: "v3.1.8", status: "online", signal: 72, uptime: "8d 14h", lastSeen: new Date().toISOString() },
    { id: "GW008", name: "Riverside Bridge", model: "FioGate Lite 200", protocol: "LoRaWAN", property: "Riverside Apartments", location: "Basement Panel", ipAddress: "192.168.8.10", macAddress: "AA:BB:CC:08:08:08", firmware: "v3.1.5", status: "offline", signal: 0, uptime: "0d 0h", lastSeen: new Date(Date.now() - 7200000).toISOString() },
  ];
}

export function makeDemoAlarms(): any[] {
  return [
    { id: "A001", type: "Water Leakage", location: "Unit 12B Bathroom", property: "Harbor View Residences", severity: "high", time: new Date(Date.now() - 10 * 60000).toISOString(), status: "pending", description: "Active water leak detected by sensor L2. Flow rate abnormal." },
    { id: "A002", type: "Device Offline", location: "Basement Utility", property: "Riverside Apartments", severity: "high", time: new Date(Date.now() - 30 * 60000).toISOString(), status: "pending", description: "Gateway GW008 and 3 connected devices offline for 2 hours." },
    { id: "A003", type: "Temperature", location: "Cold Storage A", property: "Westside Logistics Hub", severity: "high", time: new Date(Date.now() - 15 * 60000).toISOString(), status: "pending", description: "Temperature exceeding threshold: 12.4C (limit: 4C). Cold chain failure risk." },
    { id: "A004", type: "Water Leakage", location: "Greenhouse", property: "Green Valley Campus", severity: "medium", time: new Date(Date.now() - 2 * 3600000).toISOString(), status: "pending", description: "Moisture level elevated. Sensor L4 battery critical at 12%." },
    { id: "A005", type: "Device Warning", location: "Stairwell B", property: "Riverside Apartments", severity: "medium", time: new Date(Date.now() - 1 * 3600000).toISOString(), status: "pending", description: "Fire Alarm F4 intermittent connectivity. Battery at 35%." },
    { id: "A006", type: "Smoke Detected", location: "Kitchen 15F", property: "Grand Plaza Tower", severity: "medium", time: new Date(Date.now() - 45 * 60000).toISOString(), status: "pending", description: "Smoke sensor S1 triggered. Investigating — possible cooking." },
    { id: "A007", type: "High Humidity", location: "Laundry Room", property: "Sunrise Residences", severity: "low", time: new Date(Date.now() - 3 * 3600000).toISOString(), status: "pending", description: "Humidity at 72% for 30+ minutes. Ventilation check recommended." },
    { id: "A008", type: "Device Offline", location: "Loading Dock", property: "Westside Logistics Hub", severity: "low", time: new Date(Date.now() - 5 * 3600000).toISOString(), status: "pending", description: "Leak Detector L3 offline. Battery depleted." },
    { id: "A009", type: "Fire Alarm", location: "Parking P1", property: "Harbor View Residences", severity: "high", time: new Date(Date.now() - 6 * 3600000).toISOString(), status: "resolved", description: "Fire alarm in parking. False alarm — exhaust fumes. Reset by security." },
    { id: "A010", type: "Water Leakage", location: "Basement Pump Room", property: "Grand Plaza Tower", severity: "high", time: new Date(Date.now() - 12 * 3600000).toISOString(), status: "resolved", description: "Minor pipe condensation. Maintenance confirmed no active leak." },
    { id: "A011", type: "Temperature", location: "Server Room", property: "Tech Innovation Park", severity: "medium", time: new Date(Date.now() - 24 * 3600000).toISOString(), status: "resolved", description: "HVAC temporarily offline. Temperature reached 28C before restored." },
    { id: "A012", type: "Smoke Detected", location: "Food Court", property: "Metro Mall Central", severity: "medium", time: new Date(Date.now() - 36 * 3600000).toISOString(), status: "resolved", description: "Cooking smoke from tenant restaurant. Ventilation improved." },
  ];
}

// ── Settings defaults ────────────────────────────────────

export const DEFAULT_SETTINGS = {
  profile: { name: "Alex Morgan", email: "alex.morgan@fiotech.io", role: "Admin", company: "FioTech Solutions", phone: "+1 (555) 234-5678" },
  notifications: {
    emailAlerts: true, smsAlerts: false, pushNotifications: true,
    alertTypes: { waterLeak: true, smoke: true, deviceOffline: true, highHumidity: false, temperature: false },
    quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00",
  },
  dashboard: { temperatureUnit: "celsius", refreshInterval: 30, compactMode: false, dateFormat: "MM/DD/YYYY", timezone: "America/New_York" },
  security: { twoFactorEnabled: false, sessionTimeout: 30, loginNotifications: true },
};
