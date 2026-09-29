/**
 * False Positive Filter — Sun-heated floor vs pig detection.
 *
 * Solves Issue 8: Sun-heated floor causing false fever alerts.
 *
 * Research basis:
 * - Lu et al. 2018: Ambient temperature compensation for outdoor thermal
 * - Wang et al. 2023: IR temperature correction for pig skin
 * - Cook et al. 2014: IRT detects fever even with environmental variation
 *
 * Key insight: Sunlight heats surfaces UNIFORMLY (slow gradient).
 * A pig is a LOCALIZED heat blob (sharp edges, compact).
 * A pig that is FEVERING is HOTTER than its surroundings by 1.5°C+.
 * A sun-heated floor is the SAME temperature as the sunlit ground around it.
 */

export interface FalsePositiveCheck {
  zoneIndex: number;
  rawMaxTemp: number;
  baselineTemp: number; // 7-day rolling average
  isLocalBlob: boolean; // is the heat localized (pig) or uniform (sun)?
  isFever: boolean; // raw threshold check
  falsePositiveRisk: boolean;
  compensatedFever: boolean; // after filtering
  confidence: number;
  reason: string;
}

export interface ThermalBlob {
  /** Center X (grid coords 0-31) */
  centerX: number;
  /** Center Y (grid coords 0-23) */
  centerY: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Temperature at center */
  peakTemp: number;
  /** Average temperature in blob area */
  avgTemp: number;
  /** Edge gradient (how sharp) */
  edgeGradient: number;
}

export interface FeverCheckConfig {
  /** Fever threshold (°C). Matches firmware FEVER_WARNING = 39.5 */
  feverWarningThreshold?: number;
  /** Critical fever threshold (°C). Matches firmware FEVER_CRITICAL = 40.0 */
  feverCriticalThreshold?: number;
  /** Deviation from baseline for rule-based fever */
  feverDeviationC?: number;
  /** Minimum blob size (pixels) to be considered a pig */
  minBlobSize: number;
  /** Maximum blob width in pixels */
  maxBlobWidth: number;
  /** Minimum edge gradient for a pig blob (sharp = pig) */
  minPigGradient: number;
  /** Uniformity threshold for sun detection (>0.8 = uniform = sun) */
  sunUniformityThreshold: number;
  /** Baseline window seconds (sim time, not real time) */
  baselineWindowSec: number;
}

const DEFAULT_CONFIG: Required<FeverCheckConfig> = {
  feverWarningThreshold: 39.5,
  feverCriticalThreshold: 40.0,
  feverDeviationC: 1.5,
  minBlobSize: 4,
  maxBlobWidth: 20,
  minPigGradient: 0.3,
  sunUniformityThreshold: 0.8,
  baselineWindowSec: 7 * 3600 // 7 days in sim time
};

function computeGradient(frame: Float32Array, width: number, x: number, y: number): number {
  let gradient = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < 24) {
        gradient += Math.abs(frame[y * width + x] - frame[ny * width + nx]);
        count++;
      }
    }
  }
  return count > 0 ? gradient / count : 0;
}

export class FalsePositiveFilter {
  private config: Required<FeverCheckConfig>;
  private baselineCache: Map<number, number[]> = new Map(); // zone → temp array

  constructor(config: Partial<FeverCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update baseline for a zone (simulated 7-day rolling average).
   */
  updateBaseline(zoneIndex: number, baselineTemps: number[]): void {
    this.baselineCache.set(zoneIndex, baselineTemps);
  }

  /**
   * Get baseline for a zone.
   */
  getBaseline(zoneIndex: number): number[] {
    return this.baselineCache.get(zoneIndex) || [];
  }

  /**
   * Detect a thermal blob in the 32×24 frame.
   * Returns blob properties for shape analysis.
   */
  detectBlob(frame: Float32Array, zoneIndex: number): ThermalBlob | null {
    const baselineTemps = this.baselineCache.get(zoneIndex) || [];
    const baseline = baselineTemps.length > 0
      ? baselineTemps.reduce((a, b) => a + b, 0) / baselineTemps.length
      : 28.0; // default ambient

    // Find all pixels exceeding fever threshold above baseline
    const hotPixels: Array<{ x: number; y: number; temp: number }> = [];
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        const temp = frame[y * 32 + x];
        if (temp > baseline + 1.5) { // at least 1.5°C above baseline
          hotPixels.push({ x, y, temp });
        }
      }
    }

    if (hotPixels.length < this.config.minBlobSize) return null;

    // Calculate blob bounds
    const xs = hotPixels.map((p) => p.x);
    const ys = hotPixels.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    if (width > this.config.maxBlobWidth) return null; // too wide = sun-heated

    const peakTemp = Math.max(...hotPixels.map((p) => p.temp));
    const avgTemp = hotPixels.reduce((a, p) => a + p.temp, 0) / hotPixels.length;

    // Calculate edge gradient (sharpness)
    let gradientSum = 0;
    let gradientCount = 0;
    for (const p of hotPixels) {
      const g = computeGradient(frame, 32, p.x, p.y);
      gradientSum += g;
      gradientCount++;
    }
    const edgeGradient = gradientCount > 0 ? gradientSum / gradientCount : 0;

    return {
      centerX: Math.round((minX + maxX) / 2),
      centerY: Math.round((minY + maxY) / 2),
      width,
      height,
      peakTemp,
      avgTemp,
      edgeGradient
    };
  }

  /**
   * Check if a zone reading is a true fever or false positive.
   */
  checkZone(
    frame: Float32Array,
    zoneIndex: number,
    timeSec: number // for future time-based analysis
  ): FalsePositiveCheck {
    void timeSec;
    const baselineTemps = this.baselineCache.get(zoneIndex) || [];
    const baseline = baselineTemps.length > 0
      ? baselineTemps.reduce((a, b) => a + b, 0) / baselineTemps.length
      : 28.0;

    const blob = this.detectBlob(frame, zoneIndex);

    // Raw threshold check (firmware rule)
    const zoneFrame = Array.from(frame).filter((_, i) => {
      const x = i % 32; const y = Math.floor(i / 32);
      const col = x < 16 ? 0 : 1;
      const row = y < 12 ? 0 : 1;
      return row * 2 + col === zoneIndex;
    });
    const maxTemp = blob ? blob.peakTemp :
      (zoneFrame.length > 0 ? Math.max(...zoneFrame) : baseline);

    const isLocalBlob = blob !== null;
    const isFever = maxTemp > this.config.feverWarningThreshold;
    const isSunHeated = blob ? blob.width > this.config.maxBlobWidth * 0.7 : false;

    // Sun heated = uniform heat spread across many pixels
    // Check if ALL frame pixels exceed baseline significantly
    const allHot = frame.every((temp) => temp > baseline + 1.5);
    const falsePositiveRisk = isSunHeated || allHot;

    let compensatedFever = false;
    let confidence = 0.5;
    let reason = '';

    if (!isFever) {
      // No fever detected
      reason = 'Temperature below fever threshold';
      confidence = 0.9;
    } else if (falsePositiveRisk) {
      // Fever reading but likely sun
      reason = '⚠️ SUN HEATING — not localized pig heat. Skipping alert.';
      confidence = 0.3; // low confidence it's real fever
      compensatedFever = false;
    } else if (isLocalBlob && blob) {
      // Real localized heat (pig)
      const deviation = maxTemp - baseline;
      if (deviation > this.config.feverCriticalThreshold - baseline) {
        reason = `🔴 FEVER CRITICAL: ${maxTemp.toFixed(1)}°C (${deviation.toFixed(1)}°C above baseline)`;
        confidence = 0.95;
        compensatedFever = true;
      } else if (deviation > this.config.feverDeviationC) {
        reason = `🟡 FEVER WARNING: ${maxTemp.toFixed(1)}°C (${deviation.toFixed(1)}°C above baseline)`;
        confidence = 0.85;
        compensatedFever = true;
      } else {
        reason = 'Normal pig body heat';
        confidence = 0.7;
        compensatedFever = false;
      }
    } else {
      reason = 'Cannot determine — insufficient data';
      confidence = 0.2;
    }

    return {
      zoneIndex,
      rawMaxTemp: maxTemp,
      baselineTemp: baseline,
      isLocalBlob,
      isFever,
      falsePositiveRisk,
      compensatedFever,
      confidence,
      reason
    };
  }

  /**
   * Batch check all 4 zones.
   */
  checkAllZones(
    frames: Float32Array[], // one frame per zone, 32×24 each
    times: number[]
  ): FalsePositiveCheck[] {
    return frames.map((frame, i) => this.checkZone(frame, i, times[i]));
  }
}
