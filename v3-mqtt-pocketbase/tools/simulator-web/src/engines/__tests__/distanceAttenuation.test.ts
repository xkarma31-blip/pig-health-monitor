import { describe, it, expect } from 'vitest';
import {
  calculateMicCoverage,
  fuseMultiMic,
  defaultDualMicSetup,
  calculateAtDistance,
  canHearCough,
  compareMicConfigs,
  attenuateAtDistance,
  type MicCoverage
} from '../distanceAttenuation';

describe('DistanceAttenuation', () => {
  it('should attenuate 6dB per doubling', () => {
    const d1 = calculateAtDistance(1);
    const d2 = calculateAtDistance(2);
    const d4 = calculateAtDistance(4);

    // Attenuation is NEGATIVE (loss), but magnitude should be 6, 12
    expect(Math.abs(d2.attenuationDb)).toBeCloseTo(6, 0);
    expect(Math.abs(d4.attenuationDb)).toBeCloseTo(12, 0);
    expect(Math.abs(d1.attenuationDb)).toBeCloseTo(0, 0);
  });

  it('should be audible at 1m', () => {
    expect(canHearCough(1)).toBe(true);
  });

  it('should be audible at 4m', () => {
    expect(canHearCough(4)).toBe(true);
  });

  it('should not be audible at 16m', () => {
    expect(canHearCough(16)).toBe(false);
  });

  it('should calculate mic coverage', () => {
    const mic = calculateMicCoverage(0.5, 0.5);
    expect(mic).toBeDefined();
    expect(mic.radius).toBeGreaterThan(0);
  });

  it('should fuse multi-mic detections', () => {
    const mics: MicCoverage[] = [
      { micId: 'mic-1', x: 0.25, y: 0.5, radius: 0.75 },
      { micId: 'mic-2', x: 0.75, y: 0.5, radius: 0.75 }
    ];
    const result = fuseMultiMic(0.5, 0.5, mics);

    expect(result.detectedMics).toBeGreaterThanOrEqual(1);
    expect(result.maxSnr).toBeGreaterThan(0);
  });

  it('should handle single mic', () => {
    const mics: MicCoverage[] = [{ micId: 'mic-1', x: 0.5, y: 0.5, radius: 0.75 }];
    const result = fuseMultiMic(0.5, 0.5, mics);
    expect(result.detectedMics).toBe(1);
  });

  it('should handle no mics', () => {
    const result = fuseMultiMic(0.5, 0.5, []);
    expect(result.detectedMics).toBe(0);
  });

  it('should create default dual mic setup', () => {
    const mics = defaultDualMicSetup();
    expect(mics.length).toBe(2);
  });

  it('should compare mic configs', () => {
    const result = compareMicConfigs(0.5, 0.5);
    expect(result.dualMic.maxSnr).toBeGreaterThanOrEqual(result.singleMic.maxSnr);
  });

  it('should attenuate via backward-compatible alias', () => {
    const result = attenuateAtDistance(2);
    expect(result.effectiveDb).toBeLessThan(75);
    expect(result.attenuationDb).not.toBe(0);
  });
});
