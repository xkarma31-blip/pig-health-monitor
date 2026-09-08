/**
 * Spectral subtraction — noise reduction for far-field / CCTV mics.
 *
 * Question it answers (Master, 2026-09-08): "how do we actually do spectral
 * subtraction, and is it worth it?" This is the canonical recipe:
 *
 *   1. Windowed complex STFT (Hann, 50 % hop).
 *   2. Estimate the noise spectrum — either from the first N frames of the
 *      signal ('first', classic "lead-in of background" case) or via an
 *      energy-gated running estimate ('gated', robust when noise varies).
 *   3. Per frame, per bin:   cleaned = max(|X| − α·N, β·|X|)
 *      α = oversubtraction factor, β = spectral floor (guards musical noise).
 *   4. Keep the original phase, inverse-FFT, overlap-add (COLA Hann).
 *
 * β is relative to the OBSERVED magnitude rather than the noise estimate —
 * stale estimates can't pump pure musical noise into the output. The guard
 * ratios are the same knobs the DSP front-ends use (ViVo/GMM noise reduction,
 * RNNoise rest). Numeric behaviour is pinned by spectralSubtractor.test.ts so
 * "worth it?" is measured, not asserted.
 */

import { hannWindow, fftRadix2 } from './dsp';

export interface SpectralSubtractOptions {
  fftSize?: number;
  hopSize?: number;
  /** Oversubtraction factor α (default 1.5; ~2-3 for stationary noise). */
  oversubtraction?: number;
  /** Spectral floor β relative to the observed magnitude (default 0.02). */
  floor?: number;
  /** 'first' = first noiseFrames frames; 'gated' = energy-gated running est. */
  noiseMode?: 'first' | 'gated';
  noiseFrames?: number;
  /** Gated-mode: skip updating the estimate while frame energy > gate × peak. */
  gateFraction?: number;
}

interface StftFrame {
  re: Float32Array;
  im: Float32Array;
}

function complexStft(
  samples: Float32Array,
  fftSize: number,
  hopSize: number
): StftFrame[] {
  const window = hannWindow(fftSize);
  const nFrames =
    samples.length < fftSize ? 0 : Math.floor((samples.length - fftSize) / hopSize) + 1;
  const frames: StftFrame[] = [];
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < nFrames; f++) {
    const start = f * hopSize;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) re[i] = samples[start + i] * window[i];
    fftRadix2(re, im);
    frames.push({ re: new Float32Array(re), im: new Float32Array(im) });
  }
  return frames;
}

/** Estimate the stationary noise magnitude spectrum (bins 0..fftSize/2). */
function estimateNoiseSpectrum(
  frames: StftFrame[],
  fftSize: number,
  opts: Required<Pick<SpectralSubtractOptions, 'noiseMode' | 'noiseFrames' | 'gateFraction'>>
): Float32Array {
  const bins = fftSize / 2 + 1;
  const noise = new Float32Array(bins);
  if (frames.length === 0) return noise;

  if (opts.noiseMode === 'first') {
    const n = Math.max(1, Math.min(opts.noiseFrames, frames.length));
    for (let f = 0; f < n; f++) {
      for (let b = 0; b < bins; b++) {
        noise[b] += Math.hypot(frames[f].re[b], frames[f].im[b]) / fftSize;
      }
    }
    for (let b = 0; b < bins; b++) noise[b] /= n;
    return noise;
  }

  // Gated running estimate: seed from the first frames, then only frames
  // below gate × running-peak energy update the per-bin estimate. The seed is
  // essential — on stationary noise every frame passes the "energy" gate only
  // if the estimate starts near the truth (a zero-seeded EMA learns only the
  // quietest frames and underestimates the noise floor by a large margin).
  // The peak DECAYS each frame (× 0.995) so the gate tracks a *recent* floor:
  // it adapts to a changed background level, while real speech bursts (energy
  // ≫ gate × recent peak) still get excluded from the estimate.
  let peak = 1e-9;
  const gate = opts.gateFraction;
  const seedN = Math.max(1, Math.min(opts.noiseFrames, frames.length));
  for (let f = 0; f < seedN; f++) {
    for (let b = 0; b < bins; b++) {
      noise[b] += Math.hypot(frames[f].re[b], frames[f].im[b]) / fftSize;
    }
  }
  for (let b = 0; b < bins; b++) noise[b] /= seedN;
  for (const frame of frames) {
    let energy = 0;
    for (let b = 0; b < bins; b++) {
      const m = Math.hypot(frame.re[b], frame.im[b]) / fftSize;
      energy += m * m;
    }
    peak = Math.max(energy, peak * 0.995);
    const update = energy <= gate * peak;
    for (let b = 0; b < bins; b++) {
      const m = Math.hypot(frame.re[b], frame.im[b]) / fftSize;
      noise[b] = update ? 0.9 * noise[b] + 0.1 * m : noise[b];
    }
  }
  return noise;
}

function overlapAdd(
  frames: StftFrame[],
  fftSize: number,
  hopSize: number,
  totalLength: number
): Float32Array {
  const window = hannWindow(fftSize);
  const out = new Float32Array(totalLength);
  const norm = new Float32Array(totalLength);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < frames.length; f++) {
    const start = f * hopSize;
    // IFFT via conjugate FFT.
    for (let i = 0; i < fftSize; i++) {
      re[i] = frames[f].re[i];
      im[i] = -frames[f].im[i];
    }
    fftRadix2(re, im);
    for (let i = 0; i < fftSize; i++) {
      const s = re[i] / fftSize; // windowed-analysis domain already
      const idx = start + i;
      if (idx < totalLength) {
        out[idx] += s;
        // Hann + 50 % hop satisfies w[i] + w[i+N/2] == 1, so dividing by the
        // accumulated window SUM (not sum of squares!) is the COLA-correct
        // reconstruction. Sum-of-squares shrinks the interior (1.5x) and
        // explodes at single-frame edges where w^2 -> 0.
        norm[idx] += window[i];
      }
    }
  }
  for (let i = 0; i < totalLength; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
}

/**
 * Reduce stationary noise in a signal. Same length in, same length out.
 * The signal is zero-padded by one fftSize on each side before processing
 * and trimmed back afterwards: the first/last fftSize samples are covered by
 * a single (weak-windowed) frame, and dividing by the window sum there
 * amplifies spectral leakage. Padding keeps every output sample interior.
 */
export function spectralSubtract(
  samples: Float32Array,
  opts: SpectralSubtractOptions = {}
): Float32Array {
  const fftSize = opts.fftSize ?? 256;
  const hopSize = opts.hopSize ?? fftSize / 2;
  const alpha = opts.oversubtraction ?? 1.5;
  const floor = opts.floor ?? 0.02;
  const noiseMode = opts.noiseMode ?? 'first';
  const noiseFrames = opts.noiseFrames ?? 6;
  const gateFraction = opts.gateFraction ?? 0.8;

  const padded = new Float32Array(samples.length + 2 * fftSize);
  padded.set(samples, fftSize);

  const frames = complexStft(padded, fftSize, hopSize);
  if (frames.length === 0) return new Float32Array(samples);
  const noise = estimateNoiseSpectrum(frames, fftSize, {
    noiseMode,
    noiseFrames,
    gateFraction
  });

  const cleaned: StftFrame[] = frames.map((frame) => {
    const re = new Float32Array(frame.re);
    const im = new Float32Array(frame.im);
    // Loop over ALL bins — the real FFT's conjugate half (b > fftSize/2) must
    // get the SAME gain as its mirror, via noise[(fftSize - b)] — otherwise
    // the untouched half leaks through at full energy (saturates ~ -6 dB no
    // matter how high α goes).
    for (let b = 0; b < fftSize; b++) {
      const nb = Math.min(b, fftSize - b); // 0..fftSize/2, mirror-symmetric
      const mag = Math.hypot(frame.re[b], frame.im[b]) / fftSize;
      const clean = Math.max(mag - alpha * noise[nb], floor * mag);
      if (mag > 1e-12) {
        const g = clean / mag;
        re[b] = frame.re[b] * g;
        im[b] = frame.im[b] * g;
      } else {
        re[b] = 0;
        im[b] = 0;
      }
    }
    return { re, im };
  });

  const rebuilt = overlapAdd(cleaned, fftSize, hopSize, padded.length);
  return rebuilt.slice(fftSize, fftSize + samples.length);
}

// ── "Worth it?" metrics ──────────────────────────────────────────────────────

function wholeSignalSpectrum(
  samples: Float32Array,
  fftSize: number
): Float32Array {
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const win = hannWindow(fftSize);
  const n = Math.min(samples.length, fftSize);
  for (let i = 0; i < n; i++) re[i] = samples[i] * win[i];
  fftRadix2(re, im);
  const mag = new Float32Array(fftSize / 2 + 1);
  for (let b = 0; b < mag.length; b++) {
    mag[b] = Math.hypot(re[b], im[b]) / fftSize;
  }
  return mag;
}

/** Energy (dB) inside [centerHz − widthHz/2, centerHz + widthHz/2]. */
export function bandPowerDb(
  samples: Float32Array,
  sampleRate: number,
  centerHz: number,
  widthHz: number
): number {
  const fftSize = 1 << 15; // 32768 — long enough to resolve 400 Hz bands at 8 kHz
  const mag = wholeSignalSpectrum(samples, fftSize);
  const hzPerBin = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor((centerHz - widthHz / 2) / hzPerBin));
  const hi = Math.min(mag.length - 1, Math.ceil((centerHz + widthHz / 2) / hzPerBin));
  let e = 1e-12;
  for (let b = lo; b <= hi; b++) e += mag[b] * mag[b];
  return 10 * Math.log10(e);
}

/**
 * Band-concentration gain (dB): how much more of the enhanced signal sits in
 * the target band vs the noisy input. Positive = the subtraction concentrated
 * cough-band energy — the proxy for "SNR buy" we can measure in-sim.
 */
export function enhancementGainDb(
  noisy: Float32Array,
  enhanced: Float32Array,
  sampleRate: number,
  centerHz: number,
  widthHz: number
): number {
  const band = (x: Float32Array) => bandPowerDb(x, sampleRate, centerHz, widthHz);
  const bandE = (x: Float32Array) => Math.pow(10, band(x) / 10);
  let totalNoisy = 1e-12;
  let totalEnhanced = 1e-12;
  for (let i = 0; i < noisy.length; i++) totalNoisy += noisy[i] * noisy[i];
  for (let i = 0; i < enhanced.length; i++) totalEnhanced += enhanced[i] * enhanced[i];
  const before = bandE(noisy) / totalNoisy;
  const after = bandE(enhanced) / totalEnhanced;
  return 10 * Math.log10(after / before);
}