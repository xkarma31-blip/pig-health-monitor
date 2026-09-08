import { describe, it, expect } from 'vitest';
import { generateSpectrogramColumn, SPECTROGRAM_H } from '../AudioSpectrogram';

describe('generateSpectrogramColumn (pure spectral logic)', () => {
  // Deterministic RNG so spectral assertions are stable.
  const seeded = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it('produces one value per frequency bin', () => {
    const col = generateSpectrogramColumn({
      height: SPECTROGRAM_H,
      sampleRate: 8000,
      rand: seeded(1)
    });
    expect(col).toHaveLength(SPECTROGRAM_H);
  });

  it('keeps every bin within [0, 1]', () => {
    const col = generateSpectrogramColumn({
      height: SPECTROGRAM_H,
      sampleRate: 8000,
      formantHz: 600,
      rand: seeded(1)
    });
    for (const v of col) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('centers a cough energy band on the infectious formant (600 Hz)', () => {
    const rand = seeded(42);
    const col = generateSpectrogramColumn({
      height: SPECTROGRAM_H,
      sampleRate: 8000,
      formantHz: 600,
      rand
    });
    // Display spans 0..Nyquist (4000 Hz) → 600 Hz is at 15% of the bins.
    const bandCenter = Math.round((600 / 4000) * (SPECTROGRAM_H - 1));
    const highFreq = Math.round((3200 / 4000) * (SPECTROGRAM_H - 1));
    const bandW = 8;
    const bandMean =
      col.slice(bandCenter - bandW, bandCenter + bandW + 1).reduce((a, b) => a + b, 0) /
      (bandW * 2 + 1);
    const highMean =
      col.slice(highFreq - bandW, highFreq + bandW + 1).reduce((a, b) => a + b, 0) /
      (bandW * 2 + 1);
    expect(bandMean).toBeGreaterThan(highMean * 2);
  });

  it('has no cough band when formantHz is 0 (noise floor only)', () => {
    const col = generateSpectrogramColumn({
      height: SPECTROGRAM_H,
      sampleRate: 8000,
      formantHz: 0,
      rand: seeded(7)
    });
    const low = col.slice(0, Math.round(SPECTROGRAM_H * 0.2));
    const high = col.slice(Math.round(SPECTROGRAM_H * 0.8));
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    // Noise-only: no band, and the high end (3.2-4 kHz) stays near the floor.
    expect(mean(high)).toBeLessThan(0.2);
    expect(mean(low)).toBeLessThan(0.2);
    expect(col.every((v) => v > 0)).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateSpectrogramColumn({ height: 64, sampleRate: 8000, formantHz: 600, rand: seeded(9) });
    const b = generateSpectrogramColumn({ height: 64, sampleRate: 8000, formantHz: 600, rand: seeded(9) });
    expect(a).toEqual(b);
  });
});