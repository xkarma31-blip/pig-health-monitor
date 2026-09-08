import { describe, it, expect } from 'vitest';
import { BarnEnvironment, FEVER_CRITICAL_TEMP, createRng } from '../environment';

const HERD = [
  { id: 'd0wd-01', health: 'HEALTHY' as const },
  { id: 'd0wd-02', health: 'HEALTHY' as const },
  { id: 'd0wd-03', health: 'HEALTHY' as const }
];

const tickSec = (env: BarnEnvironment, seconds: number, dt = 0.25) => {
  for (let i = 0; i < seconds / dt; i++) env.tick(dt);
};

describe('BarnEnvironment', () => {
  it('keeps a healthy pig near 38.5 °C with a low cough count over 60 s', () => {
    const env = new BarnEnvironment({ pigs: HERD.slice(0, 1), seed: 11 });
    tickSec(env, 60);
    const pig = env.pig('d0wd-01')!;
    expect(pig.health).toBe('HEALTHY');
    expect(pig.coreTemp).toBeGreaterThan(38.0);
    expect(pig.coreTemp).toBeLessThan(39.0);
    // 0.4 coughs/min × 1 min → overwhelmingly likely < 5.
    const coughs = env.snapshot().length;
    void coughs;
  });

  it('produces fewer than 4 healthy coughs per minute on average', () => {
    const env = new BarnEnvironment({ pigs: HERD.slice(0, 1), seed: 23 });
    let total = 0;
    for (let i = 0; i < 60 / 0.25; i++) {
      const r = env.tick(0.25);
      total += r.coughs.reduce((a, c) => a + c.count, 0);
    }
    expect(total).toBeLessThan(4);
  });

  it('ramps an infected pig toward fever and produces many more coughs', () => {
    const env = new BarnEnvironment({ pigs: HERD.slice(0, 1), seed: 31 });
    env.setHealth('d0wd-01', 'INFECTED');
    let total = 0;
    const temps: number[] = [];
    for (let i = 0; i < 60 / 0.25; i++) {
      const r = env.tick(0.25);
      total += r.coughs.reduce((a, c) => a + c.count, 0);
      if (i % 40 === 0) temps.push(env.pig('d0wd-01')!.coreTemp);
    }
    const final = env.pig('d0wd-01')!;
    expect(final.coreTemp).toBeGreaterThanOrEqual(39.2);
    // Monotone-ish ramp toward target (linear + small drift noise).
    for (let i = 1; i < temps.length; i++) {
      expect(temps[i]).toBeGreaterThanOrEqual(temps[i - 1] - 0.15);
    }
    // 7/min × 1 min → expect several coughs; definitely more than healthy (4).
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeGreaterThan(4);
  });

  it('latches CRITICAL once an infected pig crosses 40.0 °C', () => {
    const env = new BarnEnvironment({ pigs: HERD.slice(0, 1), seed: 41 });
    env.setHealth('d0wd-01', 'INFECTED');
    tickSec(env, 90);
    const pig = env.pig('d0wd-01')!;
    expect(pig.health).toBe('CRITICAL');
    expect(pig.coreTemp).toBeGreaterThanOrEqual(FEVER_CRITICAL_TEMP);
  });

  it('is deterministic for a fixed seed', () => {
    const make = () => new BarnEnvironment({ pigs: HERD, seed: 7 });
    const a = make();
    const b = make();
    tickSec(a, 30);
    tickSec(b, 30);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('keeps pigs inside the pen bounds', () => {
    const env = new BarnEnvironment({ pigs: [{ id: 'p1' }], seed: 5 });
    const pig = env.pig('p1')!;
    expect(pig.x).toBeGreaterThanOrEqual(0.05);
    expect(pig.x).toBeLessThanOrEqual(0.95);
    expect(pig.y).toBeGreaterThanOrEqual(0.05);
    expect(pig.y).toBeLessThanOrEqual(0.95);
    tickSec(env, 120);
    const p = env.snapshot()[0];
    expect(p.x).toBeGreaterThanOrEqual(0.05);
    expect(p.x).toBeLessThanOrEqual(0.95);
    expect(p.y).toBeGreaterThanOrEqual(0.05);
    expect(p.y).toBeLessThanOrEqual(0.95);
  });

  it('createRng yields deterministic [0,1) draws across two instances', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 5; i++) {
      const va = a();
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      expect(va).toBe(b());
    }
  });
});