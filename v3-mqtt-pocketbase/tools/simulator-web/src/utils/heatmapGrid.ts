/**
 * Converts a 32x24 raw thermal frame into a 32x24 RGBA buffer ready for
 * canvas ImageData — the hot path invoked every animation frame.
 *
 * Dead pixels (NaN) become fully-transparent black.
 */

export const THERMAL_MIN = 20.0;
export const THERMAL_MAX = 42.0;
export const GRID_W = 32;
export const GRID_H = 24;

import { cmapIndex } from './colormaps';

export function buildHeatmapGrid(
  frame: Float32Array,
  lut: Uint8ClampedArray,
  width: number = GRID_W,
  height: number = GRID_H,
  minT: number = THERMAL_MIN,
  maxT: number = THERMAL_MAX
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = cmapIndex(frame[i], minT, maxT);
    const o = i * 4;
    if (idx < 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0; // dead pixel → transparent
      continue;
    }
    const lo = idx * 4;
    out[o] = lut[lo];
    out[o + 1] = lut[lo + 1];
    out[o + 2] = lut[lo + 2];
    out[o + 3] = 255;
  }
  return out;
}