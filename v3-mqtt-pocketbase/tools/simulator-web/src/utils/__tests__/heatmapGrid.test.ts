import { describe, it, expect } from 'vitest';
import { buildHeatmapGrid, THERMAL_MIN, THERMAL_MAX } from '../heatmapGrid';
import { buildIronBowLut } from '../colormaps';

const W = 32;
const H = 24;

function makeFrame(fill: number, width = W * H): Float32Array {
  return new Float32Array(width).fill(fill);
}

describe('buildHeatmapGrid', () => {
  it('emits RGBA for every pixel of a 32x24 frame', () => {
    const out = buildHeatmapGrid(makeFrame(30), buildIronBowLut(), W, H);
    expect(out).toHaveLength(W * H * 4);
  });

  it('paints cold frames with the LUT cold end and hot frames with the hot end', () => {
    const lut = buildIronBowLut();
    const cold = buildHeatmapGrid(makeFrame(THERMAL_MIN), lut, W, H);
    expect(cold[0]).toBe(lut[0]);
    expect(cold[1]).toBe(lut[1]);
    expect(cold[2]).toBe(lut[2]);

    const hot = buildHeatmapGrid(makeFrame(THERMAL_MAX), lut, W, H);
    const o = (W * H - 1) * 4;
    expect(hot[o]).toBe(lut[(255) * 4]);
    expect(hot[o + 1]).toBe(lut[(255) * 4 + 1]);
    expect(hot[o + 2]).toBe(lut[(255) * 4 + 2]);
  });

  it('clamps out-of-range temperatures to the LUT ends', () => {
    const lut = buildIronBowLut();
    const below = buildHeatmapGrid(makeFrame(-5), lut, W, H);
    const above = buildHeatmapGrid(makeFrame(90), lut, W, H);
    expect(below[0]).toBe(lut[0]);
    const o = (W * H - 1) * 4;
    expect(above[o]).toBe(lut[255 * 4]);
  });

  it('renders dead (NaN) pixels as fully transparent', () => {
    const frame = makeFrame(30);
    frame[0] = NaN; // dead pixel
    const out = buildHeatmapGrid(frame, buildIronBowLut(), W, H);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
    // neighbor pixel intact
    expect(out[4 + 3]).toBe(255);
  });

  it('produces high frame-rate, allocation-friendly output (no shared state)', () => {
    const frame = makeFrame(31);
    const a = buildHeatmapGrid(frame, buildIronBowLut(), W, H);
    const b = buildHeatmapGrid(frame, buildIronBowLut(), W, H);
    expect(a).not.toBe(b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});