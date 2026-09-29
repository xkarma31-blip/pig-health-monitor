import { describe, it, expect } from 'vitest';
import { FalsePositiveFilter } from '../falsePositiveFilter';

describe('FalsePositiveFilter', () => {
  it('should detect fever in localized blob', () => {
    const filter = new FalsePositiveFilter();
    filter.updateBaseline(0, [28, 28.2, 27.8, 28.1, 28.3]);

    // Create a pig blob (localized hot spot)
    const frame = new Float32Array(32 * 24).fill(28);
    // Add a small hot blob (pig)
    for (let y = 10; y < 13; y++) {
      for (let x = 14; x < 17; x++) {
        frame[y * 32 + x] = 40.5; // fever temp
      }
    }

    const result = filter.checkZone(frame, 0, 0);
    expect(result.isLocalBlob).toBe(true);
    expect(result.compensatedFever).toBe(true);
    expect(result.falsePositiveRisk).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should detect sun-heated as false positive', () => {
    const filter = new FalsePositiveFilter();
    filter.updateBaseline(0, [28, 28.2, 28, 28.1, 28]);

    // Create a uniform heating (sun)
    const frame = new Float32Array(32 * 24);
    // Sun heats a wide area uniformly — fill ALL pixels to 30
    frame.fill(30);

    const result = filter.checkZone(frame, 0, 0);
    // Wide area = likely sun (false positive)
    expect(result.falsePositiveRisk).toBe(true);
  });

  it('should not alarm on normal pig', () => {
    const filter = new FalsePositiveFilter();
    filter.updateBaseline(0, [28, 28.2, 28, 28.1, 28.3]);

    const frame = new Float32Array(32 * 24).fill(28);
    // Normal pig body heat (just below fever)
    for (let y = 10; y < 12; y++) {
      for (let x = 14; x < 16; x++) {
        frame[y * 32 + x] = 38.5;
      }
    }

    const result = filter.checkZone(frame, 0, 0);
    expect(result.isFever).toBe(false);
    expect(result.compensatedFever).toBe(false);
  });

  it('should handle empty baseline', () => {
    const filter = new FalsePositiveFilter();
    // No baseline set

    const frame = new Float32Array(32 * 24).fill(30);
    const result = filter.checkZone(frame, 0, 0);
    expect(result).toBeDefined();
    expect(result.baselineTemp).toBe(28.0);
  });

  it('should check all zones', () => {
    const filter = new FalsePositiveFilter();
    filter.updateBaseline(0, [28, 28.2, 28]);
    filter.updateBaseline(1, [28, 28, 28]);

    const frames = [
      new Float32Array(32 * 24).fill(28),
      new Float32Array(32 * 24).fill(30)
    ];

    const results = filter.checkAllZones(frames, [0, 1]);
    expect(results.length).toBe(2);
  });
});
