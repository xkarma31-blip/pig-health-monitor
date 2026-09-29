/**
 * AGC Comparison — Fixed gain vs Automatic Gain Control.
 *
 * Solves Issue 6: Audio "deafened" by loud noises.
 *
 * Based on Oduor et al.: Fixed-gain mode prevents
 * AGC from reducing sensitivity during loud events.
 */

export interface AgcReading {
  timeSec: number;
  micInputLevel: number; // dB
  agcGain: number; // current gain setting (0.0 - 1.0)
  outputLevel: number; // dB after AGC processing
  coughDetected: boolean;
}

export interface AgcComparisonResult {
  timeSec: number;
  fixedGainOutput: number;
  agcOutput: number;
  fixedGainCoughDetected: boolean;
  agcCoughDetected: boolean;
  coughSavedByFixedGain: boolean; // cough present but AGC missed it, fixed gain caught
  gainReductionPct: number; // how much AGC reduced gain
}

const FIXED_GAIN = 1.0; // No AGC adjustment
const AGC_HYSTERESIS = 0.15; // 15% change to trigger AGC adjustment
const AGC_RECOVERY_TIME_SEC = 1.5; // 1.5s recovery
const COUGH_THRESHOLD_DB = -45; // dB below peak — cough detection threshold
const COUGH_SNR_MIN = 10; // minimum SNR for cough detection

export class AgcComparison {
  private agcGain: number = 1.0;
  private lastLoudTimeSec: number = -10;
  private readings: AgcReading[] = [];

  /**
   * Simulate one time step for both AGC and fixed-gain.
   */
  compare(
    timeSec: number,
    micInputDb: number,
    backgroundNoiseDb: number,
    isCoughEvent: boolean
  ): AgcComparisonResult {
    // Fixed gain: no change, direct amplification
    const fixedGainOutput = micInputDb + 30; // 30dB preamp
    const fixedGainCoughDetected = isCoughEvent &&
      (micInputDb - backgroundNoiseDb) > COUGH_SNR_MIN;

    // AGC simulation
    const isLoud = micInputDb > -20; // dB SPL threshold for "loud"

    if (isLoud) {
      this.lastLoudTimeSec = timeSec;
      // Reduce gain to prevent clipping
      const targetGain = Math.max(0.1, 1.0 - (micInputDb + 20) * 0.02);
      this.agcGain = targetGain;
    } else if (timeSec - this.lastLoudTimeSec < AGC_RECOVERY_TIME_SEC) {
      // Recovery period — AGC still reducing gain
      void timeSec; // recovery timer still running
    } else {
      // Recover to fixed gain
      this.agcGain = Math.min(1.0, this.agcGain + 0.05);
    }

    const agcOutput = micInputDb * this.agcGain + 30; // with AGC applied
    const agcSnr = agcOutput - (backgroundNoiseDb + 30);
    const agcCoughDetected = isCoughEvent && agcSnr > COUGH_SNR_MIN;

    const result: AgcComparisonResult = {
      timeSec,
      fixedGainOutput,
      agcOutput,
      fixedGainCoughDetected,
      agcCoughDetected,
      coughSavedByFixedGain: isCoughEvent && !agcCoughDetected && fixedGainCoughDetected,
      gainReductionPct: (1.0 - this.agcGain) * 100
    };

    this.readings.push({
      timeSec,
      micInputLevel: micInputDb,
      agcGain: this.agcGain,
      outputLevel: agcOutput,
      coughDetected: agcCoughDetected
    });

    return result;
  }

  /** Get total missed coughs due to AGC. */
  getMissedCoughCount(): number {
    return this.readings.filter((r) => !r.coughDetected && r.micInputLevel > -40).length;
  }

  /** Get current AGC gain. */
  getCurrentGain(): number {
    return this.agcGain;
  }

  /** Reset AGC state. */
  reset(): void {
    this.agcGain = 1.0;
    this.lastLoudTimeSec = -10;
    this.readings = [];
  }
}
