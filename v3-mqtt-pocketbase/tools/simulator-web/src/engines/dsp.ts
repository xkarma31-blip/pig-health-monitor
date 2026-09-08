/**
 * DSP primitives — the SAME math the firmware's neural front-end performs,
 * implemented in TS so the classifier stage consumes real spectral features.
 *
 * Pipeline: samples → Hamming/Hann windowed STFT (radix-2 FFT) → magnitude
 * spectrum → Mel filterbank (40 triangular bands) → log-mel frames.
 */

export const DEFAULT_FFT_SIZE = 256;
export const DEFAULT_HOP_SIZE = 128;
export const DEFAULT_MEL_BINS = 40;

/** Hz → Mel scale. */
export function hzToMel(hz: number): number {
  return 1127.01048 * Math.log(1 + hz / 700);
}

/** Mel → Hz scale (inverse of hzToMel). */
export function melToHz(mel: number): number {
  return 700 * (Math.exp(mel / 1127.01048) - 1);
}

export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * Iterative radix-2 Cooley–Tukey FFT, in place. Length must be a power of two.
 * real/imag are both modified.
 */
export function fftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('fftRadix2: length must be a non-zero power of two');
  }
  if (imag.length !== n) throw new Error('fftRadix2: real/imag length mismatch');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wReal = Math.cos(ang);
    const wImag = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + half] * curR - imag[i + k + half] * curI;
        const vI = real[i + k + half] * curI + imag[i + k + half] * curR;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;
        const nextR = curR * wReal - curI * wImag;
        curI = curR * wImag + curI * wReal;
        curR = nextR;
      }
    }
  }
}

/**
 * Magnitude spectra via windowed STFT.
 * Returns one Float32Array per frame: bins 0..fftSize/2 (DC → Nyquist).
 * Magnitudes are normalized by fftSize so bin energy is amplitude-scale-ish.
 */
export function stft(
  samples: Float32Array,
  fftSize: number = DEFAULT_FFT_SIZE,
  hopSize: number = DEFAULT_HOP_SIZE
): Float32Array[] {
  const window = hannWindow(fftSize);
  const bins = fftSize / 2 + 1;
  const nFrames = samples.length < fftSize ? 0 : Math.floor((samples.length - fftSize) / hopSize) + 1;
  const frames: Float32Array[] = [];

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < nFrames; f++) {
    const start = f * hopSize;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[start + i] * window[i];
    }
    fftRadix2(re, im);
    const mag = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      mag[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]) / fftSize;
    }
    frames.push(mag);
  }
  return frames;
}

/**
 * Triangular Mel filterbank over [0..Nyquist]. Each filter is normalized so
 * its coefficients sum to 1 (area-1), matching common front-end practice.
 */
export function melFilterbank(
  numMelBins: number = DEFAULT_MEL_BINS,
  fftSize: number = DEFAULT_FFT_SIZE,
  sampleRate: number = 8000
): Float32Array[] {
  const bins = fftSize / 2 + 1;
  const nyquist = sampleRate / 2;
  const melLow = hzToMel(0);
  const melHigh = hzToMel(nyquist);
  const filters: Float32Array[] = [];

  for (let b = 0; b < numMelBins; b++) {
    const melLeft = melLow + ((melHigh - melLow) * b) / (numMelBins + 1);
    const melCenter = melLow + ((melHigh - melLow) * (b + 1)) / (numMelBins + 1);
    const melRight = melLow + ((melHigh - melLow) * (b + 2)) / (numMelBins + 1);
    const hzLeft = melToHz(melLeft);
    const hzCenter = melToHz(melCenter);
    const hzRight = melToHz(melRight);

    const fb = new Float32Array(bins);
    let sum = 0;
    for (let j = 0; j < bins; j++) {
      const hz = (j * sampleRate) / fftSize;
      let w = 0;
      if (hz >= hzLeft && hz <= hzCenter) {
        w = hzCenter > hzLeft ? (hz - hzLeft) / (hzCenter - hzLeft) : 1;
      } else if (hz > hzCenter && hz <= hzRight) {
        w = hzRight > hzCenter ? (hzRight - hz) / (hzRight - hzCenter) : 0;
      }
      fb[j] = w;
      sum += w;
    }
    if (sum > 0) for (let j = 0; j < bins; j++) fb[j] /= sum;
    filters.push(fb);
  }
  return filters;
}

/** Log-mel frames: one 40-dim vector per STFT frame. */
export function logMelSpectrogram(
  frames: Float32Array[],
  filterbank: Float32Array[],
  eps: number = 1e-6
): Float32Array[] {
  const numBins = filterbank.length;
  return frames.map((frame) => {
    const mel = new Float32Array(numBins);
    for (let b = 0; b < numBins; b++) {
      const fb = filterbank[b];
      let s = 0;
      for (let j = 0; j < frame.length; j++) s += frame[j] * fb[j];
      mel[b] = Math.log10(s + eps);
    }
    return mel;
  });
}