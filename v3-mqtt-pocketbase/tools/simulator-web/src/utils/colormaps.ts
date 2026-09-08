/**
 * Colormap LUTs for the thermal heatmap (IronBow / Plasma).
 *
 * Each LUT is 256 RGBA entries (Uint8ClampedArray, alpha=255) so the
 * 60 FPS canvas renderer just indexes — no per-pixel math at draw time.
 */

export const LUT_SIZE = 256;

export type ColormapName = 'ironbow' | 'plasma';

const luts = new Map<ColormapName, Uint8ClampedArray>();

/** Maps a temperature to a 0..255 LUT index; NaN → -1 (dead-pixel sentinel). */
export function cmapIndex(value: number, min = 20, max = 42): number {
  if (Number.isNaN(value)) return -1;
  if (!Number.isFinite(value)) return value > 0 ? 255 : 0;
  const t = (value - min) / (max - min);
  const c = Math.floor(Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1));
  return c;
}

/** IronBow: navy → steel blue → orange → white-hot. */
export function buildIronBowLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const o = i * 4;
    // cold: #131a36, mid1: #3b4fa0, mid2: #e87722(orange), hot: #f6f7f8
    let r: number, g: number, b: number;
    if (t < 0.33) {
      const u = t / 0.33;
      r = lerp(0x13, 0x3b, u);
      g = lerp(0x1a, 0x4f, u);
      b = lerp(0x36, 0xa0, u);
    } else if (t < 0.66) {
      const u = (t - 0.33) / 0.33;
      r = lerp(0x3b, 0xe8, u);
      g = lerp(0x4f, 0x77, u);
      b = lerp(0xa0, 0x22, u);
    } else {
      const u = (t - 0.66) / 0.34;
      r = lerp(0xe8, 0xf6, u);
      g = lerp(0x77, 0xf7, u);
      b = lerp(0x22, 0xf8, u);
    }
    lut[o] = r;
    lut[o + 1] = g;
    lut[o + 2] = b;
    lut[o + 3] = 255;
  }
  return lut;
}

/** Plasma: deep purple → magenta → bright yellow. */
export function buildPlasmaLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const o = i * 4;
    // avg-luminance rising sweep; endpoints mimic matplotlib plasma
    let r: number, g: number, b: number;
    if (t < 0.25) {
      const u = t / 0.25;
      r = lerp(13, 126, u);
      g = lerp(8, 3, u);
      b = lerp(135, 168, u);
    } else if (t < 0.5) {
      const u = (t - 0.25) / 0.25;
      r = lerp(126, 221, u);
      g = lerp(3, 53, u);
      b = lerp(168, 147, u);
    } else if (t < 0.75) {
      const u = (t - 0.5) / 0.25;
      r = lerp(221, 252, u);
      g = lerp(53, 178, u);
      b = lerp(147, 89, u);
    } else {
      const u = (t - 0.75) / 0.25;
      r = lerp(252, 240, u);
      g = lerp(178, 249, u);
      b = lerp(89, 33, u);
    }
    lut[o] = r;
    lut[o + 1] = g;
    lut[o + 2] = b;
    lut[o + 3] = 255;
  }
  return lut;
}

export function getColormap(name: ColormapName): Uint8ClampedArray {
  let lut = luts.get(name);
  if (!lut) {
    lut = name === 'plasma' ? buildPlasmaLut() : buildIronBowLut();
    luts.set(name, lut);
  }
  return lut;
}

function lerp(a: number, b: number, u: number): number {
  return Math.round(a + (b - a) * u);
}