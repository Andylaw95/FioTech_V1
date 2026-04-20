// ═══════════════════════════════════════════════════════════
// SEED DATA — Minimal defaults for new accounts.
// All accounts start empty — real data comes from IoT devices.
// ═══════════════════════════════════════════════════════════

// ── Settings defaults ────────────────────────────────────

export const DEFAULT_SETTINGS = {
  profile: { name: "Admin", email: "", role: "Admin", company: "FioTec Solutions", phone: "", avatar: "" },
  notifications: {
    emailAlerts: true, smsAlerts: false, pushNotifications: true,
    alertTypes: { waterLeak: true, smoke: true, deviceOffline: true, highHumidity: false, temperature: false },
    quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00",
  },
  dashboard: { temperatureUnit: "celsius", refreshInterval: 30, compactMode: false, dateFormat: "DD/MM/YYYY", timezone: "Asia/Hong_Kong" },
  security: { twoFactorEnabled: false, sessionTimeout: 30, loginNotifications: true },
};
