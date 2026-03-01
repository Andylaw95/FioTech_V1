// ═══════════════════════════════════════════════════════════
// Demo mode flag — shared between AuthContext and api.ts
// without creating circular dependencies.
// ═══════════════════════════════════════════════════════════

let _demoMode = false;

export function setDemoMode(active: boolean) {
  _demoMode = active;
}

export function isDemoMode(): boolean {
  return _demoMode;
}
