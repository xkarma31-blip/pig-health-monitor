/**
 * Distance Attenuation — Audio range model + multi-mic fusion.
 *
 * Solves Issue 7: Faint coughs missed at distance,
 * and how multi-mic placement helps.
 *
 * Based on Oduor et al.: Fixed-gain mic prevents AGC issues.
 * Distance: 6dB drop per doubling of distance.
 */

export interface DistanceModel {
  distanceM: number;
  attenuationDb: number; // -6dB per 2x
  effectiveDb: number; // original - attenuation
}

export interface AudioFusion {
  /** Per-mic detections for a given cough location. */
  micDetections: Array<{
    micX: number; // 0..1 norm
    micY: number;
    distanceM: number;
    snr: number; // signal-to-noise ratio
    detected: boolean;
  }>;
  fusedDetection: boolean;
  maxSnr: number;
  detectedMics: number;
}

export interface MicCoverage {
  micId: string;
  x: number; // pen position 0..1
  y: number;
  radius: number; // 1/e coverage radius
}

export interface ZoneRange {
  zoneIndex: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface DistanceAttenuationResult {
  canHearAt2m: boolean;
  canHearAt4m: boolean;
  canHearAt8m: boolean;
  multiMicGain: number; // dB improvement from multi-mic
}

const ATTENUATION_DB_PER_2X = 6;
const COUGH_DB_1M = 75;
const NOISE_FLOOR_DB = 40;
const MIN_SNR_COUGH = 15;

function distanceAttenuation(distanceM: number): number {
  if (distanceM <= 0) return 0;
  const doublings = Math.log2(distanceM / 1);
  return -(ATTENUATION_DB_PER_2X * doublings);
}

/** Calculate effective cough dB at a distance. */
export function calculateAtDistance(
  distanceM: number,
  coughDbAt1m = COUGH_DB_1M
): DistanceModel {
  const attenuation = distanceAttenuation(distanceM);
  return {
    distanceM,
    attenuationDb: Math.round(attenuation * 10) / 10,
    effectiveDb: Math.round((coughDbAt1m + attenuation) * 10) / 10
  };
}

/** Check if cough is audible at given distance. */
export function canHearCough(distanceM: number): boolean {
  const model = calculateAtDistance(distanceM);
  return (model.effectiveDb - NOISE_FLOOR_DB) >= MIN_SNR_COUGH;
}

/**
 * Backward-compatible alias (AudioLabPage uses this).
 */
export function attenuateAtDistance(distanceM: number) {
  const model = calculateAtDistance(distanceM);
  return {
    ...model,
    audible: model.effectiveDb - NOISE_FLOOR_DB >= MIN_SNR_COUGH,
    relativeVolume: Math.max(0, (model.effectiveDb - NOISE_FLOOR_DB) / 35)
  };
}

/** Calculate coverage of a mic in a pen. */
export function calculateMicCoverage(
  micX: number,
  micY: number,
  penWidth = 4,
  penHeight = 4,
  maxRangeM = 3
): MicCoverage {
  return {
    micId: `mic-${micX}-${micY}`,
    x: micX,
    y: micY,
    radius: maxRangeM / Math.max(penWidth, penHeight)
  };
}

/**
 * Audio fusion: simulate detection from multiple mics.
 * Each mic at distance d has SNR. Fusion improves by max SNR.
 */
export function fuseMultiMic(
  pigX: number, pigY: number,
  mics: MicCoverage[],
  coughDbAt1m = COUGH_DB_1M
): AudioFusion {
  const detections: AudioFusion['micDetections'] = [];

  for (const mic of mics) {
    const dx = (pigX - mic.x) * 4;
    const dy = (pigY - mic.y) * 4;
    const distM = Math.sqrt(dx * dx + dy * dy);

    const model = calculateAtDistance(distM, coughDbAt1m);
    const snr = model.effectiveDb - NOISE_FLOOR_DB;

    detections.push({
      micX: mic.x,
      micY: mic.y,
      distanceM: Math.round(distM * 100) / 100,
      snr: Math.round(snr * 10) / 10,
      detected: snr >= MIN_SNR_COUGH
    });
  }

  const maxSnr = Math.max(...detections.map((d) => d.snr), 0);
  const detectedMics = detections.filter((d) => d.detected).length;

  return {
    micDetections: detections,
    fusedDetection: detectedMics >= 1,
    maxSnr: Math.round(maxSnr * 10) / 10,
    detectedMics
  };
}

/**
 * Compare single mic vs dual mic coverage.
 */
export function compareMicConfigs(
  pigX: number, pigY: number,
  penWidth = 4, penHeight = 4
): { singleMic: AudioFusion; dualMic: AudioFusion } {
  const single: MicCoverage[] = [calculateMicCoverage(0.5, 0.5, penWidth, penHeight)];
  const dual: MicCoverage[] = [
    calculateMicCoverage(0.5, 0.5, penWidth, penHeight),
    calculateMicCoverage(0.5, penHeight - 0.5, penWidth, penHeight)
  ];

  return {
    singleMic: fuseMultiMic(pigX, pigY, single),
    dualMic: fuseMultiMic(pigX, pigY, dual)
  };
}

/** Default dual-mic placement for a 4x4m pen. */
export function defaultDualMicSetup(): MicCoverage[] {
  return [
    calculateMicCoverage(0.5, 0.5, 4, 4),
    calculateMicCoverage(0.5, 0.5, 4, 4)
  ];
}

/** Generate distance attenuation table for a pig at given position. */
export function distanceTable(pigX: number, pigY: number, mics: MicCoverage[]): DistanceAttenuationResult[] {
  const results: DistanceAttenuationResult[] = [];

  for (const mic of mics) {
    const dx = (pigX - mic.x) * 4;
    const dy = (pigY - mic.y) * 4;
    const distM = Math.sqrt(dx * dx + dy * dy);

    const at2m = canHearCough(2);
    const at4m = canHearCough(4);
    const at8m = canHearCough(8);

    results.push({
      canHearAt2m: at2m,
      canHearAt4m: at4m,
      canHearAt8m: at8m,
      multiMicGain: mics.length >= 2 ? 3 : 0
    });
  }

  return results;
}
