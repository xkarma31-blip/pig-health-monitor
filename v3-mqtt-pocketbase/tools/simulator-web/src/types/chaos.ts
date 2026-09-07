/**
 * Chaos Engine Injection Parameters
 */

export interface ChaosSettings {
  packetLossRate: number;        // 0.0 to 1.0 (probability of dropped packet)
  i2cLockupTrigger: boolean;     // Simulates SDA stuck low
  forceBrownout: boolean;        // Drops battery below 2.8V
  ambientTempDrift: number;      // Celsius (e.g. 26 to 35 C for Cebu)
  simulatedMudBlotches: boolean; // Cold evaporative patches on pigs
  tinRoofRainNoise: boolean;     // Torrential rain acoustic masking
  metalFeederNoise: boolean;     // Metal banging bursts
  epochId: number;               // Monotonic increment to cancel mid-flight async jobs
}

export const DEFAULT_CHAOS_SETTINGS: ChaosSettings = {
  packetLossRate: 0.0,
  i2cLockupTrigger: false,
  forceBrownout: false,
  ambientTempDrift: 28.5,
  simulatedMudBlotches: true,
  tinRoofRainNoise: false,
  metalFeederNoise: false,
  epochId: 1
};
