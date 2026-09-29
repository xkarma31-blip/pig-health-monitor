import { describe, it, expect } from 'vitest';
import { AgcComparison } from '../agcComparison';

describe('AgcComparison', () => {
  it('should detect cough with fixed gain', () => {
    const engine = new AgcComparison();
    const result = engine.compare(0, -30, -50, true); // cough event

    expect(result.fixedGainCoughDetected).toBe(true);
  });

  it('should miss cough with AGC when loud noise present', () => {
    const engine = new AgcComparison();
    // Loud noise event first
    engine.compare(0, -10, -50, false); // loud noise
    // Then cough during AGC recovery
    const result = engine.compare(0.5, -30, -45, true); // cough

    // AGC may miss it during recovery
    expect(result.coughSavedByFixedGain).toBeDefined();
  });

  it('should recover after loud event', () => {
    const engine = new AgcComparison();
    engine.compare(0, -10, -50, false); // loud noise at t=0
    // After recovery period
    const result = engine.compare(3, -30, -50, true); // cough after recovery

    expect(result.agcCoughDetected).toBe(true);
  });

  it('should report gain reduction', () => {
    const engine = new AgcComparison();
    engine.compare(0, -5, -50, false); // very loud
    const result = engine.compare(0.1, -30, -50, true);

    expect(result.gainReductionPct).toBeGreaterThan(0);
  });

  it('should reset', () => {
    const engine = new AgcComparison();
    engine.compare(0, -10, -50, false);
    engine.reset();
    expect(engine.getMissedCoughCount()).toBe(0);
    expect(engine.getCurrentGain()).toBe(1.0);
  });
});
