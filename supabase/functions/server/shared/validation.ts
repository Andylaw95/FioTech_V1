// Pure validation/sanitization helpers — no runtime dependencies.
// Extracted from routes.tsx for reuse across route modules.

export const MAX_STRING_LENGTH = 500;
export const MAX_URL_LENGTH = 2048;
export const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, maxLength);
}

export function sanitizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().slice(0, MAX_URL_LENGTH);
  if (cleaned && !cleaned.startsWith("http://") && !cleaned.startsWith("https://")) return "";
  return cleaned;
}

export function sanitizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeEnum(value: unknown, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value) ? value : fallback;
}

export const SETTINGS_ALLOWED_KEYS = new Set([
  "profile", "notifications", "dashboard", "security", "theme",
  "language", "timezone", "dateFormat", "displayDensity",
]);

export const PROFILE_ALLOWED_KEYS = new Set([
  "name", "phone", "company", "avatar", "bio", "location",
]);

export function safeMerge(target: any, source: any, depth = 0, allowedKeys?: Set<string>): any {
  if (depth > 5) return target;
  if (!source || typeof source !== "object" || Array.isArray(source)) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      const childAllowed = key === "profile" ? PROFILE_ALLOWED_KEYS : undefined;
      result[key] = safeMerge(result[key] || {}, source[key], depth + 1, childAllowed);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Constant-time string comparison (prevents timing attacks on tokens)
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) result |= bufA[i] ^ bufB[i];
  return result === 0;
}
