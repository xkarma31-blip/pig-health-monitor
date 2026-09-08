/**
 * v3.1 — SoundTalks-style respiratory index (simulation-grade).
 *
 * Mirrors the real SoundTalks logic loop that drives the Respiration Health
 * Score for the research literature (PMC10251864):
 *   - RDI (Respiratory Disease Index) = average coughs per head per day.
 *   - ReHS (Respiration Health Score) 0..100: GREEN ≥ 60 / YELLOW 40..59 /
 *     RED < 40, with alarms from history + short-window variation.
 *
 * The simulator squashes a real day into SIM_DAY_SEC (360 s) of sim time:
 * one bin = BIN_SEC (15 s) = one simulated hour, 24 bins = one sim day.
 * The engine is deliberately dt-robust: any dtSec jump advances the clock,
 * prunes bins that fell out of the 24-bin window, and never throws.
 */
export const SIM_DAY_SEC = 360;
export const ROLLING_BINS = 24;
export const BIN_SEC = 15;

export interface SoundTalksCalibration {
  /** Number of pigs in the monitored pen (used to normalise RDI). */
  headCount: number;
  /** Factory baseline: coughs per head per 24 h (per sim day). */
  baselineCoughsPerHeadDay: number;
  /** Alert sensitivity 0.25..4 — higher = alarms earlier (trend threshold divider). */
  sensitivity: number;
  /** How far above the hourly baseline a short-window spike must rise to trip trend. */
  alarmDelta: number;
  /** ReHS at/above this is GREEN. */
  greenFloor: number;
  /** ReHS below this is RED. */
  redCeiling: number;
  /** When true, rebaseline from the recent day total automatically. */
  autoBaseline: boolean;
}

export type HealthBand = 'GREEN' | 'YELLOW' | 'RED';

export interface SoundTalksState {
  /** Coughs per head per sim-day across the rolling window. */
  rdi: number;
  /** 0..100 respiration health score. */
  rehs: number;
  band: HealthBand;
  /** True on RED or on an armed short-window spike. */
  alarm: boolean;
  /** True when the last 3 bins spike above baseline + alarmDelta/sensitivity. */
  trend: boolean;
  /** 24 hourly bins, oldest → newest (0 = silent bin). */
  hourlyCoughs: number[];
  baselineLearned: boolean;
  calibration: SoundTalksCalibration;
}

export const DEFAULT_CALIBRATION: SoundTalksCalibration = {
  headCount: 4,
  baselineCoughsPerHeadDay: 12,
  sensitivity: 1,
  alarmDelta: 8,
  greenFloor: 60,
  redCeiling: 40,
  autoBaseline: false
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class SoundTalks {
  private calibration: SoundTalksCalibration;
  private baselineLearned = false;
  private timeSec = 0;
  /** Rolling bins: {idx (15 s epoch counter), count}. Pruned to the last 24. */
  private bins: { idx: number; count: number }[] = [];
  private lastAutoDay = -1;

  constructor(initial: SoundTalksCalibration = DEFAULT_CALIBRATION) {
    this.calibration = { ...DEFAULT_CALIBRATION, ...initial };
  }

  /** Advance the internal clock dtSec and drop bins outside the 24-bin window. */
  private advance(dtSec: number): void {
    this.timeSec += dtSec;
    const curIdx = Math.floor(this.timeSec / BIN_SEC);
    if (curIdx - this.lastEpoch() >= ROLLING_BINS) {
      this.bins = [];
    } else {
      this.bins = this.bins.filter((b) => curIdx - b.idx < ROLLING_BINS);
    }
  }

  private lastEpoch(): number {
    return this.bins.length ? Math.max(...this.bins.map((b) => b.idx)) : -1;
  }

  private curIdx(): number {
    return Math.floor(this.timeSec / BIN_SEC);
  }

  /** Total coughs across every bin still inside the rolling window. */
  private dayTotal(): number {
    return this.bins.reduce((sum, b) => sum + b.count, 0);
  }

  private baselineDay(): number {
    return Math.max(1, this.calibration.baselineCoughsPerHeadDay * this.calibration.headCount);
  }

  private maybeAutoLearn(): void {
    if (!this.calibration.autoBaseline) return;
    const day = Math.floor(this.curIdx() / ROLLING_BINS);
    if (this.curIdx() >= 2 * ROLLING_BINS && day > this.lastAutoDay) {
      this.lastAutoDay = day;
      this.calibrateNow();
    }
  }

  /** Record coughCount coughs, advancing the clock by dtSec. */
  record(coughCount: number, dtSec = 1): void {
    this.advance(dtSec);
    const idx = this.curIdx();
    const hit = this.bins.find((b) => b.idx === idx);
    if (hit) hit.count += coughCount;
    else this.bins.push({ idx, count: coughCount });
    this.maybeAutoLearn();
  }

  /** Advance the clock without new coughs (virtual observation). */
  observe(dtSec = 1): void {
    this.advance(dtSec);
    this.maybeAutoLearn();
  }

  /** Merge a partial calibration live and re-clamp the sane ranges. */
  setCalibration(partial: Partial<SoundTalksCalibration>): void {
    this.calibration = { ...this.calibration, ...partial };
    this.calibration.headCount = Math.max(1, Math.round(this.calibration.headCount));
    this.calibration.sensitivity = clamp(this.calibration.sensitivity, 0.25, 4);
    if (partial.baselineCoughsPerHeadDay !== undefined) this.baselineLearned = true;
  }

  /** Relearn the baseline from the recent day total (coughs / head / day). */
  calibrateNow(): void {
    const total = this.dayTotal();
    if (total <= 0) {
      this.calibration.baselineCoughsPerHeadDay = Math.max(1, this.calibration.baselineCoughsPerHeadDay);
    } else {
      this.calibration.baselineCoughsPerHeadDay = Math.max(
        1,
        Math.round(total / Math.max(1, this.calibration.headCount))
      );
    }
    this.baselineLearned = true;
  }

  /** Restore the factory baseline and forget the learner flag. */
  resetBaseline(): void {
    this.calibration.baselineCoughsPerHeadDay = DEFAULT_CALIBRATION.baselineCoughsPerHeadDay;
    this.baselineLearned = false;
  }

  get state(): SoundTalksState {
    const day = this.dayTotal();
    const head = Math.max(1, this.calibration.headCount);
    const base = this.baselineDay();
    const rise = Math.max(0, day - base);
    const rehs = Math.max(0, Math.min(100, 100 - (40 * rise) / base));

    const band: HealthBand = rehs >= this.calibration.greenFloor
      ? 'GREEN'
      : rehs < this.calibration.redCeiling
        ? 'RED'
        : 'YELLOW';

    // Short-window trend: average of the last 3 bins vs baseline + alarmDelta/sensitivity.
    const cur = this.curIdx();
    const recent = this.bins.filter((b) => cur - b.idx < 3);
    let trend = false;
    if (recent.length >= 3) {
      const avg = recent.reduce((s, b) => s + b.count, 0) / recent.length;
      const hourlyBaseline = base / ROLLING_BINS;
      trend = avg > hourlyBaseline + this.calibration.alarmDelta / this.calibration.sensitivity;
    }

    const hourlyCoughs = new Array<number>(ROLLING_BINS).fill(0);
    for (const b of this.bins) hourlyCoughs[b.idx % ROLLING_BINS] = b.count;

    return {
      rdi: day / head,
      rehs,
      band,
      alarm: band === 'RED' || trend,
      trend,
      hourlyCoughs,
      baselineLearned: this.baselineLearned,
      calibration: { ...this.calibration }
    };
  }
}