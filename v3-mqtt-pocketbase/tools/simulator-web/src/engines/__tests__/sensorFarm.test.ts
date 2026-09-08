import { describe, it, expect } from 'vitest';
import { SensorFarm, resolveWatchedPig, rssiForDistance } from '../sensorFarm';
import { PigActorState } from '../environment';

// Fixed pig states so tests are deterministic regardless of BarnEnvironment rng.
const PIGS: PigActorState[] = [
  { id: 'pig-001', x: 0.2, y: 0.2, coreTemp: 38.5, health: 'HEALTHY' },
  { id: 'pig-002', x: 0.8, y: 0.8, coreTemp: 40.4, health: 'CRITICAL' },
  { id: 'pig-003', x: 0.5, y: 0.5, coreTemp: 38.7, health: 'HEALTHY' }
];

const tickFarm = (farm: SensorFarm, n: number) => {
  let last;
  const telemetry = [];
  const drops = [];
  for (let i = 0; i < n; i++) {
    last = farm.tick(PIGS);
    telemetry.push(...last.telemetry);
    drops.push(...last.drops);
  }
  // Nodes snapshot comes from the final tick; telemetry/drops accumulate
  // across the whole window (the node only publishes every ~8-12 ticks).
  return { ...last!, telemetry, drops };
};

describe('geometry helpers', () => {
  it('rssiForDistance is monotonic with distance and in dBm range', () => {
    const near = rssiForDistance(0.01);
    const mid = rssiForDistance(0.3);
    const far = rssiForDistance(0.8);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(-100);
    expect(near).toBeLessThanOrEqual(-40);
  });

  it('resolveWatchedPig picks the nearest pig inside the radius', () => {
    const node = { x: 0.5, y: 0.5, coverageRadius: 0.5 };
    const r = resolveWatchedPig(node, PIGS);
    expect(r.pigId).toBe('pig-003'); // 0.0 away
    expect(r.dist).toBeCloseTo(0, 5);

    const tight = resolveWatchedPig({ x: 0.1, y: 0.1, coverageRadius: 0.05 }, PIGS);
    expect(tight.pigId).toBeNull(); // nearest pig is 0.14 away > 0.05
  });
});

describe('SensorFarm — hardware lifecycle', () => {
  it('places real device ids and rejects duplicates', () => {
    const farm = new SensorFarm([{ id: 'esp32-001' }, { id: 'esp32-002' }], 42);
    expect(farm.nodeIds.sort()).toEqual(['esp32-001', 'esp32-002']);
    expect(() => farm.addNode({ id: 'esp32-001' })).toThrow(/Duplicate node/);
  });

  it('removes and moves hardware', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.5, y: 0.5 }], 42);
    farm.moveNode('esp32-001', 0.9, 0.9);
    expect(farm.nodeState('esp32-001')!.x).toBe(0.9);
    farm.removeNode('esp32-001');
    expect(farm.nodeState('esp32-001')).toBeUndefined();
    expect(() => farm.moveNode('nope', 0, 0)).toThrow(/Unknown node/);
    expect(() => farm.removeNode('nope')).toThrow(/Unknown node/);
  });

  it('powered-off nodes go offline and produce no telemetry', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.5, y: 0.5 }], 42);
    farm.setPowered('esp32-001', false);
    const res = tickFarm(farm, 20);
    const st = farm.nodeState('esp32-001', PIGS)!;
    expect(st.online).toBe(false);
    expect(res.telemetry).toHaveLength(0);
  });
});

describe('SensorFarm — telemetry with real columns', () => {
  it('publishes 8-column records attributed to the watched pig', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.5, y: 0.5 }], 42);
    const res = tickFarm(farm, 30);
    expect(res.telemetry.length).toBeGreaterThan(0);
    const rec = res.telemetry[0];
    expect(rec.deviceId).toBe('esp32-001');
    expect(rec.pigId).toBe('pig-003'); // nearest pig
    expect(rec.bodyTemp).toBe(38.7);   // env override → watched pig's coreTemp
    for (const k of ['timestamp', 'temperature', 'wifiRssi', 'batteryPct'] as const) {
      expect(typeof rec[k]).toBe('number');
    }
    expect(['NORMAL', 'WARNING', 'CRITICAL']).toContain(rec.status);
    expect(rec.wifiRssi).toBeLessThanOrEqual(-40);
  });

  it('watches the nearest pig and bodyTemp follows the moved geometry', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.5, y: 0.5 }], 42);
    // Move the node right next to pig-002 (CRITICAL, 40.4 C).
    farm.moveNode('esp32-001', 0.8, 0.78);
    const res = tickFarm(farm, 30);
    expect(res.nodes[0].watchedPigId).toBe('pig-002');
    const rec = res.telemetry.find((r) => r.pigId === 'pig-002');
    expect(rec).toBeDefined();
    expect(rec!.bodyTemp).toBe(40.4);
  });

  it('nodes with no pig in coverage stay silent (no telemetry)', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.1, y: 0.1 }], 42);
    farm.setCoverage('esp32-001', 0.02);
    const res = tickFarm(farm, 20);
    expect(res.nodes[0].watchedPigId).toBeNull();
    expect(res.telemetry).toHaveLength(0);
  });

  it('is deterministic for a fixed seed and pig snapshot', () => {
    const make = () => new SensorFarm([{ id: 'esp32-001', x: 0.5, y: 0.5 }], 42);
    const a = make();
    const b = make();
    tickFarm(a, 30);
    tickFarm(b, 30);
    const ta = a.nodeState('esp32-001', PIGS)!;
    const tb = b.nodeState('esp32-001', PIGS)!;
    expect(ta.batteryPct).toBe(tb.batteryPct);
    expect(ta.watchedPigId).toBe(tb.watchedPigId);
  });

  it('surfaces firmware alerts from a feverish watched pig', () => {
    const farm = new SensorFarm([{ id: 'esp32-001', x: 0.8, y: 0.79 }], 42); // next to pig-002 (40.4°C)
    let all = [] as unknown as Array<{ deviceId: string; alert: { type: string; severity: string } }>;
    for (let i = 0; i < 60; i++) all = all.concat(farm.tick(PIGS).alerts);
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].deviceId).toBe('esp32-001');
    expect(all[0].alert.type).toContain('FEVER');
  });
});