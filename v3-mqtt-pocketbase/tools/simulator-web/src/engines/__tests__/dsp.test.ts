import { describe, it, expect } from 'vitest';
import {
  fftRadix2,
  stft,
  melFilterbank,
  logMelSpectrogram,
  hzToMel,
  melToHz,
  hannWindow
} from '../dsp';

const SR = 8000;

/** Real sine tone. */
function sine(freqHz: number, n: number, sr: number = SR): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return x;
}

describe('fftRadix2', () => {
  it('rejects non-power-of-two lengths', () => {
    expect(() => fftRadix2(new Float32Array(100), new Float32Array(100))).toThrow(/power of two/);
  });

  it('has DC content = sum of samples for a constant signal', () => {
    const real = new Float32Array(8).fill(0.25);
    const imag = new Float32Array(8);
    fftRadix2(real, imag);
    expect(real[0]).toBeCloseTo(2.0, 5); // 8 samples × 0.25
    expect(imag[0]).toBeCloseTo(0.0, 8);
    // All other bins ~0 for DC signal.
    for (let k = 1; k < 8; k++) {
      expect(Math.abs(real[k])).toBeLessThan(1e-6);
      expect(Math.abs(imag[k])).toBeLessThan(1e-6);
    }
  });

  it('resolves a 1 kHz tone at bin 32 with a 256-point window', () => {
    const x = sine(1000, 256);
    const re = Float32Array.from(x);
    const im = new Float32Array(256);
    fftRadix2(re, im);
    // binHz = k * SR / N → k = 1000 * 256 / 8000 = 32.
    let peak = 0;
    let peakBin = -1;
    for (let k = 1; k < 128; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (mag > peak) {
        peak = mag;
        peakBin = k;
      }
    }
    expect(peakBin).toBe(32);
  });
});

describe('hannWindow', () => {
  it('is symmetric, non-negative, zero at edges, one at center', () => {
    const w = hannWindow(64);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[63]).toBeCloseTo(0, 6);
    expect(w[32]).toBeGreaterThan(0.99);
    expect(w[32]).toBeLessThanOrEqual(1);
    for (let i = 0; i < 32; i++) expect(w[i]).toBeCloseTo(w[63 - i], 6);
  });
});

describe('melFilterbank', () => {
  it('builds 40 triangular area-1 filters over 0..4 kHz', () => {
    const fb = melFilterbank(40, 256, SR);
    expect(fb).toHaveLength(40);
    expect(fb[0]).toHaveLength(129);
    for (const f of fb) {
      const sum = f.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
    // Band centers rise monotonically with band index.
    const centers = fb.map((f) => {
      let best = 0;
      let bestIdx = 0;
      f.forEach((w, j) => {
        if (w > best) {
          best = w;
          bestIdx = j;
        }
      });
      return bestIdx;
    });
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i]).toBeGreaterThan(centers[i - 1]);
    }
  });

  it('is invertible: melToHz(hzToMel(x)) === x', () => {
    expect(melToHz(hzToMel(1000))).toBeCloseTo(1000, 6);
    expect(melToHz(hzToMel(0))).toBeCloseTo(0, 6);
  });
});

describe('stft + logMel', () => {
  it('produces one frame per hop window', () => {
    const frames = stft(sine(1000, 512), 256, 128);
    // (512 - 256)/128 + 1 = 3 frames
    expect(frames).toHaveLength(3);
    expect(frames[0]).toHaveLength(129);
  });

  it('has 1 kHz energy concentrated near mel-bin ~13-17 (not in the lowest bands)', () => {
    const frames = stft(sine(1000, 1024), 256, 128);
    const fb = melFilterbank(40, 256, SR);
    const mel = logMelSpectrogram(frames, fb);
    // Average over frames, find highest-energy band.
    const avg = new Float32Array(40);
    for (const fr of mel) for (let b = 0; b < 40; b++) avg[b] += fr[b];
    for (let b = 0; b < 40; b++) avg[b] /= mel.length;

    let peak = -Infinity;
    let peakBand = -1;
    for (let b = 0; b < 40; b++) {
      if (avg[b] > peak) {
        peak = avg[b];
        peakBand = b;
      }
    }
    // 1 kHz lands in mel band ~15-16 of 40 over 0..4 kHz.
    expect(peakBand).toBeGreaterThanOrEqual(10);
    expect(peakBand).toBeLessThanOrEqual(22);
    // And the band is clearly above the noise floor of log-mel.
    expect(peak).toBeGreaterThan(-4);
  });
});