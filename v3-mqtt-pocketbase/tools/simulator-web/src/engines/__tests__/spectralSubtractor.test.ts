/**
 * Spectral subtraction — "is it worth it?" measured in-sim.
 *
 * The question (Master, 2026-09-08): the CCTV/far-field mic idea — how does
 * spectral subtraction actually work and does it buy us anything? This test
 * pins the engine's behavior with deterministic numbers: noise attenuation,
 * cough-band preservation, and the honest finding that for a broadband cough
 * in broadband noise subtraction cuts the noise FLOOR but does NOT create
 * spectral contrast (measured: concentration gain ≈ 0 dB).
 *
 * Thresholds are measurement-pinned (measured value minus margin), not
 * aspirational:
 *   - stationary 'first', α=2            → 20.4 dB drop
 *   - stationary 'gated', α=2            → 14.4 dB drop, ~6.9 dB behind first-N
 *   - cough scene, α=1.5 (default)       → 14.1 dB global drop,
 *                                          band drop within 0.2 dB of global
 *   - band concentration gain            → −0.14 dB (≈ 0: no fake contrast)
 */
import { describe, it, expect } from 'vitest';
import { createRng } from '../environment';
import { generateCoughBurst } from '../audioSynthesizer';
import { spectralSubtract, bandPowerDb, enhancementGainDb } from '../spectralSubtractor';

const SR = 8000;

function whiteNoise(seed: number, length: number): Float32Array {
  const rand = createRng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rand() * 2 - 1;
  return out;
}

function mix(clean: Float32Array, noise: Float32Array): Float32Array {
  const out = new Float32Array(clean.length);
  for (let i = 0; i < clean.length; i++) out[i] = clean[i] + noise[i];
  return out;
}

function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / x.length + 1e-12);
}

describe('spectralSubtract — noise suppression primitives', () => {
  it('preserves signal length and is deterministic for a fixed seed', () => {
    const noise = whiteNoise(7, SR); // 1 s
    const a = spectralSubtract(noise, { noiseMode: 'first', noiseFrames: 24 });
    const b = spectralSubtract(noise, { noiseMode: 'first', noiseFrames: 24 });
    expect(a.length).toBe(SR);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('attenuates pure stationary noise by ≥ 8 dB (first-N estimate)', () => {
    // Measured 20.4 dB at the aggressive α the stationary case warrants
    // (fixed-background scenario = standard practice α ≈ 2; default stays 1.5).
    const noise = whiteNoise(7, SR);
    const clean = spectralSubtract(noise, { noiseMode: 'first', noiseFrames: 24, oversubtraction: 2 });
    const drop = rmsDb(noise) - rmsDb(clean);
    expect(drop).toBeGreaterThanOrEqual(8);
  });

  it('gated estimate clears the same bar on stationary noise and does not lag badly', () => {
    const noise = whiteNoise(9, SR);
    const a = rmsDb(spectralSubtract(noise, { noiseMode: 'first', noiseFrames: 24, oversubtraction: 2 }));
    const b = rmsDb(spectralSubtract(noise, { noiseMode: 'gated', oversubtraction: 2 }));
    expect(rmsDb(noise) - b).toBeGreaterThanOrEqual(8); // measured 14.4 dB
    expect(b).toBeLessThan(a + 9); // measured ~6.9 dB behind — intent, not bug
  });
});

describe('spectralSubtract — cough-in-noise A/B (the "worth it?" question)', () => {
  // 0.5 s of pure background, then a 0.7 s cough buried in the same background.
  // First-N frames estimate the noise from the pure-background lead-in.
  function noisyScene(seed: number): { noisy: Float32Array; clean: Float32Array } {
    const lead = 0.5 * SR;
    const bg = whiteNoise(seed, Math.round(lead + 0.7 * SR));
    const cough = generateCoughBurst('INFECTIOUS', 500, SR, createRng(seed + 1));
    const clean = new Float32Array(bg.length);
    clean.set(cough, Math.round(lead + 0.1 * SR));
    return { noisy: mix(clean, bg), clean };
  }

  it('kills background rms (≥ 8 dB) without preferentially damaging the cough band', () => {
    const { noisy } = noisyScene(21);
    const enhanced = spectralSubtract(noisy, { noiseMode: 'first', noiseFrames: 20 });
    const globalDrop = rmsDb(noisy) - rmsDb(enhanced); // measured 14.1 dB
    expect(globalDrop).toBeGreaterThanOrEqual(8);
    // Diagonal check: the 600 Hz cough band must not fall faster than the
    // global floor. Same-dB metrics, so the difference is scale-stable.
    const bandDrop = bandPowerDb(noisy, SR, 600, 400) - bandPowerDb(enhanced, SR, 600, 400);
    expect(bandDrop - globalDrop).toBeLessThanOrEqual(2); // measured 0.14 dB
  });

  it('does NOT fabricate spectral contrast for a broadband cough (the honest finding)', () => {
    const { noisy } = noisyScene(21);
    const enhanced = spectralSubtract(noisy, { noiseMode: 'first', noiseFrames: 20 });
    const gain = enhancementGainDb(noisy, enhanced, SR, 600, 400);
    // Measured −0.14 dB. A broadband cough buried in broadband noise cannot be
    // "revealed" by floor subtraction — the buy is the floor drop, not contrast.
    expect(Math.abs(gain)).toBeLessThanOrEqual(2);
  });
});