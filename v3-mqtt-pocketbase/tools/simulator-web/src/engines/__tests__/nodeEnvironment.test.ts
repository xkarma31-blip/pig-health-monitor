import { describe, it, expect } from 'vitest';
import { VirtualEsp32Node, VirtualTickResult } from '../virtualEsp32';

/** Tick until a telemetry publish happens (node boots through IDLE first). */
function runUntilTelemetry(node: VirtualEsp32Node, maxTicks = 60): {
  telem: NonNullable<VirtualTickResult['telemetry']>;
  last: VirtualTickResult;
} {
  let last: VirtualTickResult = node.tick();
  for (let i = 0; i < maxTicks; i++) {
    last = node.tick();
    if (last.telemetry) return { telem: last.telemetry, last };
  }
  throw new Error(`No telemetry emitted within ${maxTicks} ticks`);
}

describe('VirtualEsp32Node.setEnvironment', () => {
  it('drives bodyTemp and fires a CRITICAL fever alert at 40.2 °C', () => {
    const node = new VirtualEsp32Node({ seed: 1 });
    node.setEnvironment({ bodyTemp: 40.2 });
    const { telem, last } = runUntilTelemetry(node);
    expect(telem.bodyTemp).toBe(40.2);
    expect(last.alert).toBeDefined();
    const fever = last.alert!.find((a) => a.type.includes('FEVER'));
    expect(fever).toBeDefined();
    expect(fever!.severity).toBe('CRITICAL');
    expect(telem.status).toBe('CRITICAL');
  });

  it('drives coughRate and trend directly', () => {
    const node = new VirtualEsp32Node({ seed: 2 });
    node.setEnvironment({ coughRate: 13, trend: 'CLUSTER' });
    const { telem } = runUntilTelemetry(node);
    expect(telem.coughRate).toBe(13);
    expect(telem.healthTrend).toBe('CLUSTER');
    expect(telem.coughCluster).toBe(true);
  });

  it('moves the thermal hotspot when position is overridden', () => {
    const node = new VirtualEsp32Node({ seed: 3 });
    node.setEnvironment({ position: { x: 0.05, y: 0.05 } });
    const { telem } = runUntilTelemetry(node);
    // Default pig sits at (16,12); a corner position must pull the hotspot
    // toward the low corner (allowing small hotspot-extraction noise).
    expect(telem.targetX).toBeLessThan(10);
    expect(telem.targetY).toBeLessThan(10);
  });

  it('persists overrides across ticks', () => {
    const node = new VirtualEsp32Node({ seed: 4 });
    node.setEnvironment({ bodyTemp: 39.8 });
    for (let t = 0; t < 6; t++) {
      const last = node.tick();
      if (last.telemetry) expect(last.telemetry.bodyTemp).toBe(39.8);
    }
  });

  it('falls back to the original random model with no override (no regression)', () => {
    const node = new VirtualEsp32Node({ seed: 5 });
    const { telem } = runUntilTelemetry(node);
    expect(telem.bodyTemp).toBeGreaterThanOrEqual(38.2);
    expect(telem.bodyTemp).toBeLessThanOrEqual(39.0);
    expect(['STABLE', 'ELEVATED', 'CLUSTER']).toContain(telem.healthTrend);
  });
});