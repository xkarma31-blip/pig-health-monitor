import { describe, it, expect } from 'vitest';
import {
  SunlightCompensator,
  calculateSunPosition,
  type SunlightState
} from '../sunlightCompensator';

describe('SunlightCompensator', () => {
  it('should calculate sun position', () => {
    const sun = calculateSunPosition(43200); // noon
    expect(sun.elevation).toBeGreaterThan(0);
    expect(sun.azimuth).toBeGreaterThanOrEqual(0);
    expect(sun.azimuth).toBeLessThan(360);
  });

  it('should have low elevation at dawn', () => {
    const sun = calculateSunPosition(3600); // 1 AM (night)
    // elevation may be negative at night
    expect(sun.elevation).toBeLessThan(45);
  });

  it('should have higher elevation at noon', () => {
    const morning = calculateSunPosition(43200); // noon
    const evening = calculateSunPosition(64800); // 6 PM
    expect(morning.elevation).toBeGreaterThanOrEqual(evening.elevation);
  });

  it('should create compensator with defaults', () => {
    const comp = new SunlightCompensator();
    expect(comp).toBeDefined();
  });

  it('should create compensator with custom config', () => {
    const comp = new SunlightCompensator({ latitude: 10, peakStartHour: 10, peakEndHour: 16 });
    expect(comp).toBeDefined();
  });

  it('should get sunlight state at noon', () => {
    const comp = new SunlightCompensator();
    const state = comp.getState(43200); // noon
    expect(state.timeOfDaySec).toBe(43200);
    expect(state.intensity).toBeGreaterThan(0);
    expect(state.ambientBoostC).toBeGreaterThanOrEqual(0);
  });

  it('should detect no sunlight at night', () => {
    const comp = new SunlightCompensator();
    const state = comp.getState(0); // midnight
    expect(state.isDirectSunlight).toBe(false);
    expect(state.intensity).toBe(0);
  });

  it('should compensate temperature readings', () => {
    const comp = new SunlightCompensator();
    const sunlightState: SunlightState = {
      timeOfDaySec: 43200,
      isDirectSunlight: true,
      sunAzimuth: 180,
      sunElevation: 60,
      ambientBoostC: 3.0,
      affectedZones: [true, true, true, true],
      intensity: 0.9
    };

    const result = comp.compensate({
      rawTemp: 38.5,
      zoneIndex: 0,
      neighborTemps: [38.4, 38.6, 38.3, 38.5],
      sunlightState
    });

    expect(result.rawTemp).toBe(38.5);
    expect(result.compensatedTemp).toBeLessThanOrEqual(38.5);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should detect sun-heated readings', () => {
    const comp = new SunlightCompensator();
    const sunlightState: SunlightState = {
      timeOfDaySec: 43200,
      isDirectSunlight: true,
      sunAzimuth: 180,
      sunElevation: 60,
      ambientBoostC: 3.0,
      affectedZones: [true, true, true, true],
      intensity: 0.9
    };

    // Very uniform readings + high intensity = sun heated
    const result = comp.compensate({
      rawTemp: 35.0,
      zoneIndex: 0,
      neighborTemps: [34.9, 35.1, 35.0, 35.0], // very uniform
      sunlightState
    });

    expect(result.isSunHeated).toBe(true);
    expect(result.compensatedTemp).toBeLessThan(35.0);
  });

  it('should not compensate when no sunlight', () => {
    const comp = new SunlightCompensator();
    const sunlightState: SunlightState = {
      timeOfDaySec: 0,
      isDirectSunlight: false,
      sunAzimuth: 0,
      sunElevation: -30,
      ambientBoostC: 0,
      affectedZones: [false, false, false, false],
      intensity: 0
    };

    const result = comp.compensate({
      rawTemp: 38.5,
      zoneIndex: 0,
      neighborTemps: [],
      sunlightState
    });

    expect(result.isSunHeated).toBe(false);
    expect(result.sunContribution).toBe(0);
    expect(result.compensatedTemp).toBe(38.5);
    expect(result.confidence).toBe(1.0);
  });

  it('should compensate frame batch', () => {
    const comp = new SunlightCompensator();
    const frame = new Float32Array(32 * 24).fill(30);
    const sunlightState: SunlightState = {
      timeOfDaySec: 43200,
      isDirectSunlight: true,
      sunAzimuth: 180,
      sunElevation: 60,
      ambientBoostC: 3.0,
      affectedZones: [true, true, false, false],
      intensity: 0.8
    };

    const zoneMap = new Array(32 * 24).fill(0);
    const result = comp.compensateFrame(frame, sunlightState, zoneMap);
    expect(result.compensated.length).toBe(32 * 24);
    expect(result.sunFlags.length).toBe(32 * 24);
  });
});
