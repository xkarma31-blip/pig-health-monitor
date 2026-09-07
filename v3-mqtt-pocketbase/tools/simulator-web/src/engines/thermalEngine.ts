/**
 * 32x24 Thermal Engine & MLX90640 Sensor Model
 * Strictly follows firmware/src/main.cpp:278-301 byte encoding & argMax.
 * Deterministic by default; noise optional via ThermalOptions.noiseSigma.
 */

export interface SimulatedPig {
  id: string;
  name: string;
  x: number; // 0 to 31 (grid coordinates)
  y: number; // 0 to 23
  baseTemp: number; // e.g. 38.5 to 40.5 C
  angleRad: number; // heading direction in radians
  inFov: boolean;
}

export interface ThermalOptions {
  noiseSigma?: number;   // NETD spatial noise (default 0 for deterministic tests)
  mudBlotches?: boolean; // stochastic evaporative cold patches
  tearProb?: number;     // I2C FIFO tear probability
}

export interface FirmwareHotspot {
  maxTemp: number;
  targetX: number;
  targetY: number;
}

export interface EarRoiHotspot {
  roiTemp: number;
  earX: number;
  earY: number;
  confidence: number;
}

const GRID_WIDTH = 32;
const GRID_HEIGHT = 24;
const TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT;

/**
 * Generates a 768-element Float32Array in Celsius.
 * Each pig produces a deterministic thermal body + ear-base hotspot.
 * Ear-base is placed at (pig.x + 1.5*cos(angle), pig.y + 1.5*sin(angle))
 * and carries the pig's baseTemp (fever indicator).
 */
export function generateThermalFrame(
  pigs: SimulatedPig[],
  ambientTemp: number,
  options: ThermalOptions = {}
): Float32Array {
  const frame = new Float32Array(TOTAL_PIXELS);
  frame.fill(ambientTemp); // Start with ambient

  const sigma = options.noiseSigma ?? 0;

  for (const pig of pigs) {
    if (!pig.inFov) continue;

    const bodyTemp = pig.baseTemp - 0.8;
    // Ear-base carries near-core temperature (fever indicator on MLX90640)
    const earTemp = pig.baseTemp;
    const snoutTemp = pig.baseTemp - 2.5;

    const majorRadius = 4.5;
    const minorRadius = 2.8;
    const cosA = Math.cos(pig.angleRad);
    const sinA = Math.sin(pig.angleRad);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const dx = x - pig.x;
        const dy = y - pig.y;
        const rx = dx * cosA + dy * sinA;
        const ry = -dx * sinA + dy * cosA;
        const normalizedDist = (rx * rx) / (majorRadius * majorRadius) + (ry * ry) / (minorRadius * minorRadius);

        if (normalizedDist <= 1.0) {
          const blend = Math.exp(-normalizedDist * 2.0);
          let pixelTemp = ambientTemp + (bodyTemp - ambientTemp) * blend;

          // Ear-base hotspot placed at rx=1.0, ry=0.0 (exact integer pixel, cranial)
          const earDist = Math.hypot(rx - 1.0, ry);
          if (earDist < 1.5) {
            const earBlend = Math.exp(-earDist * earDist * 4.0);
            pixelTemp = ambientTemp + (earTemp - ambientTemp) * earBlend;
          }

          // Snout mucosal artifact
          const snoutDist = Math.hypot(rx - 3.5, ry);
          if (snoutDist < 0.8) {
            pixelTemp = Math.min(pixelTemp, snoutTemp);
          }

          // Evaporative mud cold-spots
          if (options.mudBlotches && Math.sin(x * 1.7) * Math.cos(y * 1.9) > 0.6) {
            pixelTemp = Math.min(pixelTemp, 25.0);
          }

          // Optional Gaussian NETD noise
          if (sigma > 0) {
            const u1 = Math.random() || 0.0001;
            const u2 = Math.random() || 0.0001;
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            pixelTemp += z0 * sigma;
          }

          const idx = y * GRID_WIDTH + x;
          frame[idx] = Math.max(frame[idx], pixelTemp);
        }
      }
    }
  }

  // Simulate I2C FIFO tearing
  if (options.tearProb && Math.random() < options.tearProb) {
    const tearRow = Math.floor(Math.random() * GRID_HEIGHT);
    for (let x = 0; x < GRID_WIDTH; x++) {
      frame[tearRow * GRID_WIDTH + x] = 20.0;
    }
  }

  return frame;
}

/**
 * Firmware Hotspot search matching main.cpp:278-286.
 * Finds the absolute global maxT and its grid coordinates.
 */
export function extractFirmwareHotspot(frame: Float32Array): FirmwareHotspot {
  let targetX = 0;
  let targetY = 0;
  let maxT = -Infinity;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const t = frame[y * GRID_WIDTH + x];
      if (t > maxT) {
        maxT = t;
        targetX = x;
        targetY = y;
      }
    }
  }

  return { maxTemp: maxT, targetX, targetY };
}

/**
 * Pi 5 Compute layer: Extracts cranial vector and 3x3 ear-base ROI.
 * Searches cranial quadrant (rx > 0.5, ry within ±2.5) for the max temperature.
 */
export function extractEarRoiHotspot(frame: Float32Array, pig: SimulatedPig): EarRoiHotspot {
  const cosA = Math.cos(pig.angleRad);
  const sinA = Math.sin(pig.angleRad);

  let bestTemp = 28.0;
  let bestX = pig.x;
  let bestY = pig.y;
  let candidateCount = 0;

  for (let y = Math.max(0, pig.y - 4); y <= Math.min(GRID_HEIGHT - 1, pig.y + 4); y++) {
    for (let x = Math.max(0, pig.x - 4); x <= Math.min(GRID_WIDTH - 1, pig.x + 4); x++) {
      const dx = x - pig.x;
      const dy = y - pig.y;
      const rx = dx * cosA + dy * sinA;
      const ry = -dx * sinA + dy * cosA;

      if (rx > 0.3 && rx < 3.0 && Math.abs(ry) < 3.0) {
        const t = frame[y * GRID_WIDTH + x];
        if (t > bestTemp) {
          bestTemp = t;
          bestX = x;
          bestY = y;
          candidateCount++;
        }
      }
    }
  }

  const confidence = candidateCount > 0 ? Math.min(0.95, 0.5 + candidateCount * 0.05) : 0.2;

  return { roiTemp: bestTemp, earX: bestX, earY: bestY, confidence };
}

/**
 * Encodes 768-pixel Float32Array to canonical Base64 string.
 * Matches main.cpp:289-301: byte = (uint8_t)((t - 20.0f) * 12.75f) clamped [0, 255]
 */
export function encodeBase64Frame(frame: Float32Array): string {
  const byteFrame = new Uint8Array(TOTAL_PIXELS);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    let t = frame[i];
    if (t < 20.0) t = 20.0;
    if (t > 40.0) t = 40.0;
    byteFrame[i] = Math.floor((t - 20.0) * 12.75);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(byteFrame).toString('base64');
  } else {
    let binary = '';
    for (let i = 0; i < byteFrame.byteLength; i++) {
      binary += String.fromCharCode(byteFrame[i]);
    }
    return btoa(binary);
  }
}

/**
 * Decodes canonical Base64 frame back to Float32Array in Celsius.
 */
export function decodeBase64Frame(b64: string): Float32Array {
  let bytes: Uint8Array;
  if (typeof Buffer !== 'undefined') {
    bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  } else {
    const binary = atob(b64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }

  const frame = new Float32Array(TOTAL_PIXELS);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    frame[i] = 20.0 + bytes[i] / 12.75;
  }
  return frame;
}
