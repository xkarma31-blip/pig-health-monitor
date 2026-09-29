import { describe, it, expect } from 'vitest';
import { superResolve, extractSharpenedPoints, extractEarRoiFromUpscaled } from '../superResolution';

describe('SuperResolutionEngine', () => {
  it('should upscale 32×24 to 128×96', () => {
    const lowRes = new Float32Array(32 * 24).fill(30);
    lowRes[24 * 32 + 16] = 41;
    const result = superResolve({ lowRes });

    expect(result.width).toBe(128);
    expect(result.height).toBe(96);
    expect(result.highRes.length).toBe(12288);
    expect(result.confidenceMap.length).toBe(12288);
    expect(result.method).toBe('bilinear+simulated-gan');
    expect(result.psnrBoostDb).toBe(15.0);
  });

  it('should have higher confidence at pixel centers than corners', () => {
    const lowRes = new Float32Array(32 * 24).fill(28);
    const result = superResolve({ lowRes });

    const centerIdx = 48 * 128 + 64;
    const cornerIdx = 0;
    expect(result.confidenceMap[centerIdx]).toBeGreaterThan(result.confidenceMap[cornerIdx]);
  });

  it('should support custom upscale factors', () => {
    const lowRes = new Float32Array(32 * 24).fill(28);
    const result = superResolve({ lowRes, upscaleFactor: 2 });
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
  });

  it('extractSharpenedPoints should return original grid size', () => {
    const lowRes = new Float32Array(32 * 24).fill(28);
    const highRes = superResolve({ lowRes }).highRes;
    const sharpened = extractSharpenedPoints(highRes, 32, 24);
    expect(sharpened.length).toBe(32 * 24);
  });

  it('extractEarRoiFromUpscaled should find ear ROI', () => {
    const lowRes = new Float32Array(32 * 24).fill(28);
    lowRes[12 * 32 + 16] = 41;
    lowRes[12 * 32 + 17] = 40.5;

    const highRes = superResolve({ lowRes, upscaleFactor: 4 }).highRes;
    const roi = extractEarRoiFromUpscaled(highRes, 128, 96, 16, 12, 0);

    expect(roi.roiTemp).toBeGreaterThanOrEqual(39);
    expect(roi.confidence).toBeGreaterThan(0);
  });
});