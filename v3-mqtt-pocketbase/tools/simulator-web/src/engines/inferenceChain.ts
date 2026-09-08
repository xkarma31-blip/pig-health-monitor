/**
 * Inference chain — the "AI layer" of the simulator.
 *
 * Consumes real Mel-spectral features (from dsp.ts) plus a cough-event count
 * and produces a 3-class health readout: STABLE / ELEVATED / CLUSTER.
 *
 * HONESTY NOTE (documented in README): the classifier here is a fixed-weight
 * linear readout + softmax — a stand-in for the firmware's TFLite CNN-LSTM.
 * The FEATURE PIPELINE (STFT → Mel → log-mel) is the real DSP math the edge
 * model consumes; only the scoring head is simplified, because sim has no
 * trained weights. Trend and confidence are derived, not learned.
 */

import { stft, melFilterbank, logMelSpectrogram } from './dsp';

export interface ClassifierScores {
  stable: number;
  elevated: number;
  cluster: number;
}

export type TrendLabel = 'STABLE' | 'ELEVATED' | 'CLUSTER';

export interface InferenceFeatures {
  meanLogMel: number;
  peakLogMel: number;
  coughCount: number;
}

export interface InferenceResult {
  melFrames: Float32Array[];
  features: InferenceFeatures;
  scores: ClassifierScores;
  trend: TrendLabel;
  confidence: number;
}

export const MEL_BINS = 40;
export const FFT_SIZE = 256;
export const HOP_SIZE = 128;
export const CLASSIFIER_SAMPLE_RATE = 8000;

// ── Feature extraction ────────────────────────────────────────────────────────

export function extractFeatures(
  melFrames: Float32Array[],
  coughCount: number
): InferenceFeatures {
  let sum = 0;
  let peak = -Infinity;
  let n = 0;
  for (const frame of melFrames) {
    for (let b = 0; b < frame.length; b++) {
      sum += frame[b];
      if (frame[b] > peak) peak = frame[b];
      n++;
    }
  }
  return {
    meanLogMel: n > 0 ? sum / n : -6,
    peakLogMel: n > 0 ? peak : -6,
    coughCount
  };
}

// ── Scoring head (fixed-weight linear readout + softmax) ─────────────────────
//
// Energy: log-mel of silence ≈ −6 (log10(1e-6)); a synthetic cough burst
// lands around −4…−2.5 depending on depth. Map to [0,1].
function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function energyNorm(meanLogMel: number): number {
  return clamp01((meanLogMel + 6) / 3);
}

export function classifyFeatures(f: InferenceFeatures): {
  scores: ClassifierScores;
  trend: TrendLabel;
  confidence: number;
} {
  const energy = energyNorm(f.meanLogMel);
  const countN = clamp01(f.coughCount / 10);

  // Raw (un-normalized) class scores — hand-tuned so:
  //   silence / sparse coughs → STABLE dominates
  //   loud, dense bursts      → CLUSTER dominates
  //
  // Cough COUNT is the primary cluster signal (PRRS surveillance is built on
  // cough-rate windowing; the audio energy corroborates it, it is not a gate).
  const raw = {
    stable: 0.5 * (1 - energy) + 0.8 * (1 - countN),
    elevated: energy * 0.9 * 1.2 * countN,
    cluster: countN * countN * (0.8 + 0.2 * energy) * 3.2
  };

  const total = raw.stable + raw.elevated + raw.cluster;
  const scores: ClassifierScores = {
    stable: total > 0 ? raw.stable / total : 1,
    elevated: total > 0 ? raw.elevated / total : 0,
    cluster: total > 0 ? raw.cluster / total : 0
  };

  const entries: Array<[TrendLabel, number]> = [
    ['STABLE', scores.stable],
    ['ELEVATED', scores.elevated],
    ['CLUSTER', scores.cluster]
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const trend = entries[0][0];
  const confidence = Math.max(0, entries[0][1] - entries[1][1]);
  return { scores, trend, confidence };
}

// ── Full chain ────────────────────────────────────────────────────────────────

export function runInferenceChain(
  samples: Float32Array,
  coughCount: number,
  sampleRate: number = CLASSIFIER_SAMPLE_RATE
): InferenceResult {
  const frames = stft(samples, FFT_SIZE, HOP_SIZE);
  const filterbank = melFilterbank(MEL_BINS, FFT_SIZE, sampleRate);
  const melFrames = logMelSpectrogram(frames, filterbank);
  const features = extractFeatures(melFrames, coughCount);
  const { scores, trend, confidence } = classifyFeatures(features);
  return { melFrames, features, scores, trend, confidence };
}