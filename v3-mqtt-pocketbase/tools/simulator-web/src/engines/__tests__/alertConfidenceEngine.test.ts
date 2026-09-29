import { describe, it, expect } from 'vitest';
import { AlertConfidenceEngine } from '../alertConfidenceEngine';

describe('AlertConfidenceEngine', () => {
  it('should not alert on normal readings', () => {
    const engine = new AlertConfidenceEngine();
    const result = engine.processTick({
      timeSec: 0,
      zoneIndex: 0,
      coughRate: 1.5,
      feverTemp: 38.5,
      feverConfidence: 0.3,
      cctvConfirmed: false,
      pigIds: [],
      baselineCoughRate: 1.0,
      baselineStd: 0.5
    });

    expect(result.alert).toBeNull();
  });

  it('should alert on fever with thermal + cctv confirmation', () => {
    const engine = new AlertConfidenceEngine();
    // Add baseline readings
    for (let i = 0; i < 10; i++) {
      engine.processTick({
        timeSec: i,
        zoneIndex: 0,
        coughRate: 1.0,
        feverTemp: 38.0,
        feverConfidence: 0.3,
        cctvConfirmed: false,
        pigIds: [],
        baselineCoughRate: 1.0,
        baselineStd: 0.5
      });
    }

    // Fever reading with thermal + cctv confirmation
    const result = engine.processTick({
      timeSec: 100,
      zoneIndex: 0,
      coughRate: 1.0,
      feverTemp: 40.2,
      feverConfidence: 0.9,
      cctvConfirmed: true,
      pigIds: ['pig-1'],
      baselineCoughRate: 1.0,
      baselineStd: 0.5
    });

    expect(result.alert).not.toBeNull();
    expect(result.alert!.type).toBe('FEVER');
    expect(result.alert!.severity).toBe('CRITICAL');
    expect(result.alert!.triggered).toBe(true);
    expect(result.alert!.modalConfirmations.thermal).toBe(true);
    expect(result.alert!.modalConfirmations.cctv).toBe(true);
  });

  it('should not alert with only 1 modality', () => {
    const engine = new AlertConfidenceEngine();
    for (let i = 0; i < 10; i++) {
      engine.processTick({
        timeSec: i,
        zoneIndex: 0,
        coughRate: 1.0,
        feverTemp: 38.0,
        feverConfidence: 0.3,
        cctvConfirmed: false,
        pigIds: [],
        baselineCoughRate: 1.0,
        baselineStd: 0.5
      });
    }

    const result = engine.processTick({
      timeSec: 100,
      zoneIndex: 0,
      coughRate: 1.0,
      feverTemp: 40.2,
      feverConfidence: 0.9,
      cctvConfirmed: false,
      pigIds: [],
      baselineCoughRate: 1.0,
      baselineStd: 0.5
    });

    expect(result.alert).toBeNull(); // Only 1 modality (thermal)
  });

  it('should alert on cough cluster', () => {
    const engine = new AlertConfidenceEngine();
    for (let i = 0; i < 10; i++) {
      engine.processTick({
        timeSec: i,
        zoneIndex: 0,
        coughRate: 1.0,
        feverTemp: 38.0,
        feverConfidence: 0.3,
        cctvConfirmed: false,
        pigIds: [],
        baselineCoughRate: 1.0,
        baselineStd: 0.5
      });
    }

    const result = engine.processTick({
      timeSec: 100,
      zoneIndex: 0,
      coughRate: 12,
      feverTemp: 38.0,
      feverConfidence: 0.3,
      cctvConfirmed: true,
      pigIds: [],
      baselineCoughRate: 1.0,
      baselineStd: 0.5
    });

    expect(result.alert).not.toBeNull();
    expect(result.alert!.type).toBe('COUGH_CLUSTER');
  });

  it('should return baseline stats', () => {
    const engine = new AlertConfidenceEngine();
    engine.processTick({
      timeSec: 0, zoneIndex: 0, coughRate: 2.0, feverTemp: 39.0,
      feverConfidence: 0.5, cctvConfirmed: false, pigIds: [],
      baselineCoughRate: 1.0, baselineStd: 0.5
    });

    const baseline = engine.getBaseline();
    expect(baseline.coughRate).toBeCloseTo(2.0, 1);
  });
});
