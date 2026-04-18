// LoRaWAN payload decoders — Cayenne LPP and Milesight TLV.
// Pure functions, no runtime dependencies.

export const LPP_TYPES: Record<number, { name: string; size: number; divisor: number; signed: boolean }> = {
  0: { name: "digital_input", size: 1, divisor: 1, signed: false },
  1: { name: "digital_output", size: 1, divisor: 1, signed: false },
  2: { name: "analog_input", size: 2, divisor: 100, signed: true },
  3: { name: "analog_output", size: 2, divisor: 100, signed: true },
  101: { name: "illuminance", size: 2, divisor: 1, signed: false },
  102: { name: "presence", size: 1, divisor: 1, signed: false },
  103: { name: "temperature", size: 2, divisor: 10, signed: true },
  104: { name: "relative_humidity", size: 1, divisor: 2, signed: false },
  113: { name: "accelerometer", size: 6, divisor: 1000, signed: true },
  115: { name: "barometric_pressure", size: 2, divisor: 10, signed: false },
  116: { name: "voltage", size: 2, divisor: 100, signed: false },
  117: { name: "current", size: 2, divisor: 1000, signed: false },
  118: { name: "frequency", size: 4, divisor: 1, signed: false },
  120: { name: "percentage", size: 1, divisor: 1, signed: false },
  121: { name: "altitude", size: 2, divisor: 1, signed: true },
  125: { name: "concentration", size: 2, divisor: 1, signed: false },
  128: { name: "power", size: 2, divisor: 1, signed: false },
  130: { name: "distance", size: 4, divisor: 1000, signed: false },
  132: { name: "energy", size: 4, divisor: 1000, signed: false },
  133: { name: "direction", size: 2, divisor: 1, signed: false },
  134: { name: "unix_time", size: 4, divisor: 1, signed: false },
  136: { name: "colour", size: 3, divisor: 1, signed: false },
  142: { name: "switch", size: 1, divisor: 1, signed: false },
};

export const MILESIGHT_TYPES: Record<number, { name: string; size: number; divisor: number; signed: boolean }> = {
  ...LPP_TYPES,
};

export function toSigned16(val: number): number { return val > 0x7FFF ? val - 0x10000 : val; }
export function toSigned32(val: number): number { return val > 0x7FFFFFFF ? val - 0x100000000 : val; }
export function toSigned16LE(val: number): number { return val > 0x7FFF ? val - 0x10000 : val; }

export function decodeCayenneLPP(base64Data: string): Record<string, number> | null {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const result: Record<string, number> = {};
    let pos = 0;

    while (pos < bytes.length - 1) {
      const channel = bytes[pos++];
      if (pos >= bytes.length) break;
      const typeId = bytes[pos++];

      const typeDef = LPP_TYPES[typeId];
      if (!typeDef) break;
      if (pos + typeDef.size > bytes.length) break;

      const fieldName = `${typeDef.name}_${channel}`;

      if (typeId === 113) {
        const x = toSigned16(bytes[pos] << 8 | bytes[pos + 1]) / typeDef.divisor;
        const y = toSigned16(bytes[pos + 2] << 8 | bytes[pos + 3]) / typeDef.divisor;
        const z = toSigned16(bytes[pos + 4] << 8 | bytes[pos + 5]) / typeDef.divisor;
        result[`accelerometer_x_${channel}`] = Math.round(x * 1000) / 1000;
        result[`accelerometer_y_${channel}`] = Math.round(y * 1000) / 1000;
        result[`accelerometer_z_${channel}`] = Math.round(z * 1000) / 1000;
        pos += 6;
        continue;
      }

      let rawValue = 0;
      for (let b = 0; b < typeDef.size; b++) {
        rawValue = (rawValue << 8) | bytes[pos + b];
      }
      pos += typeDef.size;

      if (typeDef.signed && typeDef.size === 2) rawValue = toSigned16(rawValue);
      else if (typeDef.signed && typeDef.size === 4) rawValue = toSigned32(rawValue);

      result[fieldName] = Math.round((rawValue / typeDef.divisor) * 100) / 100;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function decodeMilesightPayload(base64Data: string): Record<string, number> | null {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const result: Record<string, number> = {};
    let pos = 0;

    while (pos < bytes.length - 1) {
      const ch = bytes[pos++];
      if (pos >= bytes.length) break;
      const typeId = bytes[pos++];

      if (ch === 0xFF) {
        const configSizes: Record<number, number> = {
          0x01: 1, 0x09: 2, 0x0A: 2, 0x0B: 4, 0x0F: 1,
          0x11: 1, 0x14: 1, 0x15: 2, 0x16: 8, 0x17: 4,
          0x03: 2, 0x04: 2,
        };
        const skip = configSizes[typeId];
        if (skip !== undefined) { pos += skip; continue; }
        break;
      }

      switch (typeId) {
        case 0x67: {
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`temperature_${ch}`] = toSigned16LE(raw) / 10;
          pos += 2;
          break;
        }
        case 0x68: {
          if (pos + 1 > bytes.length) return result;
          result[`relative_humidity_${ch}`] = bytes[pos] / 2;
          pos += 1;
          break;
        }
        case 0x73: {
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`barometric_pressure_${ch}`] = raw / 10;
          pos += 2;
          break;
        }
        case 0x65: {
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          result[`illuminance_${ch}`] = raw;
          pos += 2;
          break;
        }
        case 0x00: {
          if (pos + 1 > bytes.length) return result;
          result[`digital_input_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x01: {
          if (pos + 1 > bytes.length) return result;
          result[`digital_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x7D: {
          if (pos + 2 > bytes.length) return result;
          const raw = bytes[pos] | (bytes[pos + 1] << 8);
          if (raw === 0xFFFF) { pos += 2; break; }
          if (ch === 7) result[`co2_${ch}`] = raw;
          else if (ch === 8) result[`tvoc_${ch}`] = raw;
          else if (ch === 9 || ch === 11) result[`pm2_5_${ch}`] = raw;
          else if (ch === 12) result[`pm10_${ch}`] = raw;
          else if (ch > 12) result[`pm10_${ch}`] = raw;
          else result[`concentration_${ch}`] = raw;
          pos += 2;
          break;
        }
        case 0x75: {
          if (pos + 1 > bytes.length) return result;
          result[`battery`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0xCB: {
          if (pos + 1 > bytes.length) return result;
          result[`pir_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x5B: {
          if (pos + 7 > bytes.length) return result;
          const weighting = bytes[pos];
          const leq = (bytes[pos + 1] | (bytes[pos + 2] << 8)) / 10;
          const lmin = (bytes[pos + 3] | (bytes[pos + 4] << 8)) / 10;
          const lmax = (bytes[pos + 5] | (bytes[pos + 6] << 8)) / 10;
          result[`sound_level_leq`] = leq;
          result[`sound_level_lmin`] = lmin;
          result[`sound_level_lmax`] = lmax;
          result[`sound_level_weighting`] = weighting;
          pos += 7;
          break;
        }
        case 0xE7: {
          if (pos + 1 > bytes.length) return result;
          result[`door_status_${ch}`] = bytes[pos];
          pos += 1;
          break;
        }
        case 0x71: {
          if (pos + 1 > bytes.length) return result;
          result[`water_leak`] = bytes[pos];
          pos += 1;
          break;
        }
        default: {
          if (typeId < 0x10) { pos += 1; break; }
          if (typeId >= 0xD0 && typeId <= 0xDF) { pos += 2; break; }
          return Object.keys(result).length > 0 ? result : null;
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Known broken sensor fields — strip these from decoded data everywhere
// AM308L#2 (24e124707e012685): PM2.5 and PM10 sensors are malfunctioning
export const BROKEN_SENSOR_FIELDS: Record<string, string[]> = {
  "24e124707e012685": ["pm2_5", "pm10", "pm25"],
};

export function stripBrokenFields(eui: string, decoded: Record<string, any> | null): void {
  if (!decoded) return;
  const patterns = BROKEN_SENSOR_FIELDS[eui.toLowerCase()];
  if (!patterns) return;
  for (const k of Object.keys(decoded)) {
    const kl = k.toLowerCase();
    if (patterns.some(p => kl.includes(p))) delete decoded[k];
  }
}
