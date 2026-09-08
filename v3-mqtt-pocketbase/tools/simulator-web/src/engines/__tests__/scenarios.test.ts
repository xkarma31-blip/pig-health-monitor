import { describe, it, expect } from 'vitest';
import { PipelineTracer } from '../pipelineTrace';
import { runScenario, SCENARIOS } from '../scenarios';
import { TraceStage } from '../pipelineTrace';

describe('PipelineTracer', () => {
  it('keeps insertion order and caps the ring buffer', () => {
    const t = new PipelineTracer(8);
    for (let i = 0; i < 12; i++) t.push('SENSOR', i, `evt${i}`);
    const snap = t.snapshot();
    expect(snap).toHaveLength(8);
    expect(snap[0].label).toBe('evt4');
    expect(snap[7].label).toBe('evt11');
    expect(t.count('SENSOR')).toBe(8);
    expect(t.last('SENSOR')!.label).toBe('evt11');
  });

  it('traces every canonical stage during an outbreak', () => {
    const v = runScenario(SCENARIOS[1]);
    const stages = new Set(v.trace.snapshot().map((e) => e.stage));
    for (const s of Object.values(TraceStage)) {
      expect(stages.has(s)).toBe(true);
    }
  });
});

describe('Scenario: healthy baseline', () => {
  const def = SCENARIOS[0];

  it('runs green: no alerts, STABLE trend, temp below fever', () => {
    const v = runScenario(def);
    expect(def.infectAtSec).toBeUndefined();
    expect(v.passed).toBe(true);
    expect(v.alerts).toHaveLength(0);
    expect(v.finalHealth).toBe('HEALTHY');
    expect(v.finalCoreTemp).toBeLessThan(39.5);
    for (const c of v.checks) expect(c.passed).toBe(true);
  });

  it('is deterministic for the fixed seed', () => {
    const a = runScenario(def);
    const b = runScenario(def);
    expect(a.alerts).toEqual(b.alerts);
    expect(a.trendSamples).toEqual(b.trendSamples);
    expect(a.finalHealth).toBe(b.finalHealth);
  });
});

describe('Scenario: influenza outbreak', () => {
  const def = SCENARIOS[1];

  it('proves the causal loop: sick pig → fever → CLUSTER → CRITICAL', () => {
    const v = runScenario(def);
    expect(v.passed).toBe(true);
    for (const c of v.checks) expect(c.passed).toBe(true);

    // The mechanism, made explicit:
    const fever = v.alerts.find((a) => a.type.includes('FEVER'));
    expect(fever).toBeDefined();                       // firmware raised an alert
    expect(fever!.value).toBeGreaterThanOrEqual(39.5); // threshold crossed

    const postInfect = v.trendSamples.filter((s) => s.tSec > def.infectAtSec!);
    expect(postInfect.some((s) => s.trend === 'CLUSTER')).toBe(true); // AI read the outbreak

    expect(v.finalHealth).toBe('CRITICAL');            // pig latched critical
    expect(v.finalCoreTemp).toBeGreaterThanOrEqual(40.0);
  });

  it('escalates only AFTER the scripted infection (no false positive)', () => {
    const v = runScenario(def);
    const preInfect = v.trendSamples.filter((s) => s.tSec <= def.infectAtSec!);
    // Pre-infection windows must not read CLUSTER.
    for (const s of preInfect) expect(s.trend).not.toBe('CLUSTER');
  });
});