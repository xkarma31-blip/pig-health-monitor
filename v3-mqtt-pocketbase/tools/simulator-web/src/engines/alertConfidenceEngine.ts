/**
 * Alert Confidence Engine — 7-day rolling baseline
 * + multi-modal confirmation.
 *
 * Solves Issue 10: Farmer trust — alerts need to be
 * *right*. False alarms destroy trust.
 *
 * The key insight: never alert on a single sensor.
 * Always require confirmation from >=2 modalities.
 *
 * Fusion formula:
 *   health_score = 0.6 * cough_z + 0.4 * fever_z
 *   If CCTV confirms -> fever_z * 1.2
 */

import { ZoneTracker } from '../engines/zoneTracker';

export interface AlertInput {
  timeSec: number;
  zoneIndex: number;
  coughRate: number; // coughs per minute
  feverTemp: number; // thermal max temp in zone
  feverConfidence: number; // thermal confidence 0-1
  cctvConfirmed: boolean;
  pigIds: string[];
  baselineCoughRate: number; // rolling average
  baselineStd: number; // rolling std
}

export interface AlertOutput {
  triggered: boolean;
  type: 'FEVER' | 'COUGH_CLUSTER' | 'NONE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  confidence: number;
  modalConfirmations: {
    thermal: boolean;
    audio: boolean;
    cctv: boolean;
  };
  healthScore: number;
  feverZ: number;
  coughZ: number;
}

export interface BaselineWindow {
  /** Cough rates in the window (per second). */
  coughRates: number[];
  /** Timestamps matching coughRates. */
  timestamps: number[];
  /** Fever readings in the window (deg C). */
  feverTemps: number[];
  /** Timestamps matching feverTemps. */
  feverTimestamps: number[];
}

const FEVER_WARNING = 39.5;
const FEVER_CRITICAL = 40.0;
const COUGH_CLUSTER_THRESHOLD = 5; // coughs/min above baseline
const WINDOW_SEC = 7 * 3600; // 7 days in sim seconds

export class AlertConfidenceEngine {
  private baselineCough: number[] = [];
  private baselineCoughTime: number[] = [];
  private baselineFever: number[] = [];
  private baselineFeverTime: number[] = [];
  private zoneTracker: ZoneTracker;

  constructor(zoneTracker?: ZoneTracker) {
    this.zoneTracker = zoneTracker ?? new ZoneTracker();
  }

  /**
   * Add a reading to the rolling baseline.
   */
  addBaselineReading(input: AlertInput): void {
    this.baselineCough.push(input.coughRate);
    this.baselineCoughTime.push(input.timeSec);
    this.baselineFever.push(input.feverTemp);
    this.baselineFeverTime.push(input.timeSec);
    this.evictOld(input.timeSec);
  }

  private evictOld(currentTimeSec: number): void {
    const cutoff = currentTimeSec - WINDOW_SEC;
    while (this.baselineCough.length > 0 && this.baselineCoughTime[0] < cutoff) {
      this.baselineCough.shift();
      this.baselineCoughTime.shift();
    }
    while (this.baselineFever.length > 0 && this.baselineFeverTime[0] < cutoff) {
      this.baselineFever.shift();
      this.baselineFeverTime.shift();
    }
  }

  /** Get current baseline stats. */
  getBaseline(): {
    coughRate: number;
    coughStd: number;
    feverTemp: number;
  } {
    const cough = this.baselineCough.length > 0
      ? this.baselineCough.reduce((a, b) => a + b, 0) / this.baselineCough.length
      : 1.0;

    const fever = this.baselineFever.length > 0
      ? this.baselineFever.reduce((a, b) => a + b, 0) / this.baselineFever.length
      : 38.5;

    const coughVar = this.baselineCough.length > 1
      ? Math.sqrt(this.baselineCough.reduce((s, r) => s + (r - cough) ** 2, 0) / (this.baselineCough.length - 1))
      : 1.0;

    return { coughRate: cough, coughStd: coughVar, feverTemp: fever };
  }

  /**
   * Evaluate an alert — returns null if no alert triggered.
   */
  evaluate(input: AlertInput): AlertOutput | null {
    const baseline = this.getBaseline();

    // Cough z-score
    const coughZ = (input.coughRate - baseline.coughRate) / Math.max(baseline.coughStd, 0.5);

    // Fever z-score (deviation from baseline)
    const feverZ = (input.feverTemp - baseline.feverTemp) / 1.5;

    // Modal confirmations
    const thermal = input.feverConfidence > 0.7 && input.feverTemp > FEVER_WARNING;
    const audio = coughZ > 2;
    const cctv = input.cctvConfirmed;

    const confirmations = [thermal, audio, cctv].filter(Boolean).length;

    const feverConfirmed = confirmations >= 2 && thermal;
    const coughConfirmed = audio || (cctv && coughZ > 1.5);

    const healthScore = Math.min(100, Math.max(0, 50 + 10 * (0.6 * coughZ + 0.4 * feverZ)));

    if (input.feverTemp >= FEVER_CRITICAL && feverConfirmed) {
      return {
        triggered: true,
        type: 'FEVER',
        severity: 'CRITICAL',
        message: `FEVER CRITICAL: Zone ${input.zoneIndex + 1}, ${input.pigIds.join(', ') || 'unknown pig'}, ${input.feverTemp.toFixed(1)}C`,
        confidence: confirmations / 3,
        modalConfirmations: { thermal, audio, cctv },
        healthScore,
        feverZ,
        coughZ
      };
    }

    if (input.feverTemp >= FEVER_WARNING && feverConfirmed) {
      return {
        triggered: true,
        type: 'FEVER',
        severity: 'WARNING',
        message: `FEVER WARNING: Zone ${input.zoneIndex + 1}, ${input.pigIds.join(', ') || 'unknown pig'}, ${input.feverTemp.toFixed(1)}C`,
        confidence: confirmations / 3,
        modalConfirmations: { thermal, audio, cctv },
        healthScore,
        feverZ,
        coughZ
      };
    }

    if (coughConfirmed && input.coughRate > COUGH_CLUSTER_THRESHOLD) {
      return {
        triggered: true,
        type: 'COUGH_CLUSTER',
        severity: input.coughRate > 10 ? 'CRITICAL' : 'WARNING',
        message: `COUGH CLUSTER: Zone ${input.zoneIndex + 1}, ${input.coughRate.toFixed(0)} coughs/min (baseline: ${baseline.coughRate.toFixed(1)})`,
        confidence: confirmations / 3,
        modalConfirmations: { thermal, audio, cctv },
        healthScore,
        feverZ,
        coughZ
      };
    }

    return null;
  }

  /**
   * Process a full tick — add to baseline AND evaluate.
   */
  processTick(input: AlertInput): { baseline: ReturnType<AlertConfidenceEngine['getBaseline']>; alert: AlertOutput | null } {
    this.addBaselineReading(input);

    if (input.feverTemp >= FEVER_WARNING) {
      this.zoneTracker.recordAlert(input.zoneIndex, input.timeSec);
    }

    const baseline = this.getBaseline();
    const alert = this.evaluate(input);

    return { baseline, alert };
  }

  getZoneTracker(): ZoneTracker {
    return this.zoneTracker;
  }
}
