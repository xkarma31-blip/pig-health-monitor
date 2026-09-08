import { describe, it, expect } from 'vitest';
import {
  cmapIndex,
  buildIronBowLut,
  buildPlasmaLut,
  getColormap,
  LUT_SIZE
} from '../colormaps';

describe('cmapIndex', () => {
  it('maps cold temps to 0 and hot temps to 255', () => {
    expect(cmapIndex(20.0, 20, 42)).toBe(0);
    expect(cmapIndex(42.0, 20, 42)).toBe(255);
  });

  it('clamps values outside [min, max]', () => {
    expect(cmapIndex(10, 20, 42)).toBe(0);
    expect(cmapIndex(60, 20, 42)).toBe(255);
  });

  it('scales intermediates linearly', () => {
    expect(cmapIndex(31, 20, 42)).toBe(127); // midpoint 22° span
    expect(cmapIndex(21, 20, 42)).toBe(11); // 1/22 → ~11.6
  });

  it('returns -1 for NaN (dead pixel sentinel)', () => {
    expect(cmapIndex(NaN, 20, 42)).toBe(-1);
    expect(cmapIndex(Infinity, 20, 42)).toBe(255);
  });
});

describe('colormap LUTs', () => {
  it('builds 256-entry RGBA LUTs with full alpha', () => {
    for (const lut of [buildIronBowLut(), buildPlasmaLut()]) {
      expect(lut).toHaveLength(LUT_SIZE * 4);
      expect(lut[3]).toBe(255); // first alpha
      expect(lut[(LUT_SIZE - 1) * 4 + 3]).toBe(255); // last alpha
    }
  });

  it('ironbow goes dark-navy → warm; luminance monotonically rises', () => {
    const lut = buildIronBowLut();
    const lum = (i: number) => {
      const o = i * 4;
      return 0.2126 * lut[o] + 0.7152 * lut[o + 1] + 0.0722 * lut[o + 2];
    };
    expect(lum(0)).toBeLessThan(lum(127));
    expect(lum(127)).toBeLessThan(lum(255));
    let last = -1;
    for (let i = 0; i < LUT_SIZE; i++) {
      const l = lum(i);
      expect(l).toBeGreaterThanOrEqual(last - 2); // nearly monotonic
      last = l;
    }
  });

  it('plasma sweeps deep purple → bright yellow; endpoints distinct', () => {
    const lut = buildPlasmaLut();
    const o0 = 0;
    const o1 = (LUT_SIZE - 1) * 4;
    expect(lut[o0] + lut[o0 + 1] + lut[o0 + 2]).toBeLessThan(
      lut[o1] + lut[o1 + 1] + lut[o1 + 2]
    );
    expect(lut[o1] > 200 && lut[o1 + 1] > 150).toBe(true); // bright yellow-ish tail
  });

  it('getColormap returns the same LUT instance per name', () => {
    expect(getColormap('ironbow')).toBe(getColormap('ironbow'));
    expect(getColormap('plasma')).not.toBe(getColormap('ironbow'));
  });
});