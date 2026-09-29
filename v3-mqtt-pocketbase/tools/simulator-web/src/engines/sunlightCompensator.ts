/**
 * Sunlight Compensator — Time-of-day sunlight interference model.
 *
 * Solves Issue 4: Sunlight blinds MLX90640 and causes false positives.
 *
 * Based on:
 * - Lu et al. 2018: Ambient temperature compensation
 * - Wang et al. 2023: IR temperature correction for pig skin
 *
 * Key insight: Sunlight heating is UNIFORM (slow, broad, directional).
 * Pig heat is LOCALIZED (sharp, compact, stationary).
 * This engine models the difference.
 */

export interface SunlightState {
  /** Time of day in seconds (0-86399). */
  timeOfDaySec: number;
  /** Whether sunlight is hitting the sensor. */
  isDirectSunlight: boolean;
  /** Sun azimuth (0-360°). */
  sunAzimuth: number;
  /** Sun elevation (0-90°). */
  sunElevation: number;
  /** Ambient temperature boost from sunlight (°C). */
  ambientBoostC: number;
  /** Which zones are affected by direct sunlight. */
  affectedZones: boolean[]; // per zone
  /** Sunlight intensity (0-1). */
  intensity: number;
}

export interface SunlightCompensation {
  /** Original pixel temperature. */
  rawTemp: number;
  /** Estimated sunlight contribution. */
  sunContribution: number;
  /** Compensated (pig-only) temperature. */
  compensatedTemp: number;
  /** Is this pixel likely heated by sun? */
  isSunHeated: boolean;
  /** Confidence of compensation. */
  confidence: number;
}

export interface SunlightConfig {
  /** Latitude for sun position calc (default: Philippines ~14.6°N). */
  latitude?: number;
  /** Sensor tilt angle (default: 0 = facing down). */
  sensorTiltDeg?: number;
  /** Threshold: patterns above this uniformity ratio = sun, not pig. */
  uniformityThreshold?: number;
  /** Peak sun hours (default: 11-14). */
  peakStartHour?: number;
  peakEndHour?: number;
}

const DEFAULT_CONFIG: Required<SunlightConfig> = {
  latitude: 14.6,
  sensorTiltDeg: 0,
  uniformityThreshold: 0.7,
  peakStartHour: 11,
  peakEndHour: 14
};

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate sun position for a given time of day and latitude.
 * Simplified solar position algorithm (noonsite.com formula).
 */
export function calculateSunPosition(
  timeOfDaySec: number,
  latitudeDeg: number = DEFAULT_CONFIG.latitude,
  dayOfYear: number = 258 // mid-September (PigPulse timeline)
): { azimuth: number; elevation: number } {
  // Day angle
  const dayAngle = (2 * Math.PI * (dayOfYear - 1)) / 365;
  // Solar declination (Spencer 1971 approximation)
  const declination = 0.4093 * Math.sin(dayAngle - 1.4058);

  // Hour angle (15° per hour from solar noon)
  const solarNoon = 12 - (latitudeDeg / 15) * Math.sin(dayAngle) * 0.5; // approx
  const hourAngle = degToRad(((timeOfDaySec / 3600) - solarNoon) * 15);

  // Elevation
  const latRad = degToRad(latitudeDeg);
  const elevation = Math.asin(
    Math.sin(latRad) * Math.sin(declination) +
      Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle)
  );

  // Azimuth
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(declination) * Math.cos(latRad)
  );

  return {
    azimuth: ((azimuth * 180) / Math.PI + 360) % 360,
    elevation: (elevation * 180) / Math.PI
  };
}

export class SunlightCompensator {
  private config: Required<SunlightConfig>;

  constructor(config: SunlightConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current sunlight state for a given time.
   */
  getState(timeOfDaySec: number, dayOfYear: number = 258): SunlightState {
    const sun = calculateSunPosition(timeOfDaySec, this.config.latitude, dayOfYear);

    const isDaytime = sun.elevation > 0;
    const hour = timeOfDaySec / 3600;
    const isPeakSun = hour >= this.config.peakStartHour && hour <= this.config.peakEndHour;

    // Intensity: peaks at noon, drops at morning/evening
    let intensity = 0;
    if (isDaytime) {
      const peakCenter = ((this.config.peakStartHour + this.config.peakEndHour) / 2) * 3600;
      const distFromPeak = Math.abs(timeOfDaySec - peakCenter);
      intensity = Math.max(0, 1 - distFromPeak / (4 * 3600));
      intensity *= Math.max(0, Math.sin((sun.elevation / 90) * Math.PI)); // low at dawn/dusk
    }
    void isPeakSun;

    // Determine affected zones (simplified: sun from one direction)
    const sunAzimuthDeg = sun.azimuth;
    const affectedZones = this.getAffectedZones(sunAzimuthDeg, intensity);

    return {
      timeOfDaySec,
      isDirectSunlight: isDaytime && intensity > 0.1,
      sunAzimuth: sun.azimuth,
      sunElevation: sun.elevation,
      ambientBoostC: intensity * 3.5, // up to 3.5°C boost at peak
      affectedZones,
      intensity
    };
  }

  private getAffectedZones(sunAzimuthDeg: number, intensity: number): boolean[] {
    if (intensity < 0.1) return [false, false, false, false];

    // Simplified: sun affects the zone facing the sun direction
    // Zone 0 = top-left, Zone 1 = top-right, Zone 2 = bottom-left, Zone 3 = bottom-right
    const zoneFacing: Record<number, { start: number; end: number }> = {
      0: { start: 0, end: 90 },      // top-left faces NE
      1: { start: 270, end: 360 },   // top-right faces NW  
      2: { start: 180, end: 270 },   // bottom-left faces SW
      3: { start: 90, end: 180 }     // bottom-right faces SE
    };

    const zones = [false, false, false, false];
    for (let i = 0; i < 4; i++) {
      const facing = zoneFacing[i];
      if (sunAzimuthDeg >= facing.start && sunAzimuthDeg < facing.end) {
        zones[i] = true;
      }
    }
    return zones;
  }

  /**
   * Compensate a single temperature reading for sunlight.
   * Uses spatial uniformity analysis: sun = broad/uniform, pig = sharp/localized.
   */
  compensate(reading: {
    rawTemp: number;
    zoneIndex: number;
    neighborTemps: number[];
    sunlightState: SunlightState;
  }): SunlightCompensation {
    const { rawTemp, zoneIndex, neighborTemps, sunlightState } = reading;

    if (!sunlightState.isDirectSunlight) {
      return {
        rawTemp,
        sunContribution: 0,
        compensatedTemp: rawTemp,
        isSunHeated: false,
        confidence: 1.0
      };
    }

    // Calculate spatial uniformity of this region
    const regionTemp = neighborTemps.length > 0
      ? neighborTemps.reduce((a, b) => a + b, 0) / neighborTemps.length
      : rawTemp;

    const variance = neighborTemps.length > 0
      ? Math.sqrt(
          neighborTemps.reduce((sum, t) => sum + (t - regionTemp) ** 2, 0) / neighborTemps.length
        )
      : 0;

    // Low variance + high intensity = likely sun (uniform heating)
    // High variance + high intensity = likely pig (localized heat)
    const uniformity = 1 - Math.min(1, variance / 3); // 0..1 (1 = perfectly uniform)

    // Sun contribution scales with intensity and uniformity
    const sunContribution = sunlightState.intensity * (1 - uniformity) * 3.0;
    const isSunHeated = uniformity > this.config.uniformityThreshold && sunlightState.intensity > 0.3;
    const compensatedTemp = rawTemp - (isSunHeated ? sunContribution : 0);
    const confidence = isSunHeated ? 0.8 + sunlightState.intensity * 0.15 : 0.95;

    return {
      rawTemp,
      sunContribution,
      compensatedTemp,
      isSunHeated,
      confidence
    };
  }

  /**
   * Batch compensate a full 32×24 frame.
   * Returns compensated frame + per-pixel sun/heated flags.
   */
  compensateFrame(
    frame: Float32Array,
    sunlightState: SunlightState,
    zoneMap: number[] // zone index per pixel (32×24)
  ): { compensated: Float32Array; sunFlags: boolean[] } {
    const compensated = new Float32Array(frame.length);
    const sunFlags: boolean[] = [];

    // Group pixels by zone for neighbor analysis
    const zonePixels: Map<number, number[]> = new Map();
    for (let i = 0; i < zoneMap.length; i++) {
      const z = zoneMap[i];
      if (!zonePixels.has(z)) zonePixels.set(z, []);
      zonePixels.get(z)!.push(i);
    }

    for (let i = 0; i < frame.length; i++) {
      const zoneIdx = zoneMap[i];
      const zoneIndices = zonePixels.get(zoneIdx) || [i];
      const neighborTemps = zoneIndices
        .filter((j) => j !== i)
        .map((j) => frame[j]);

      const result = this.compensate({
        rawTemp: frame[i],
        zoneIndex: zoneIdx,
        neighborTemps,
        sunlightState
      });

      void zoneIdx;
      compensated[i] = result.compensatedTemp;
      sunFlags.push(result.isSunHeated);
    }

    return { compensated, sunFlags };
  }
}
