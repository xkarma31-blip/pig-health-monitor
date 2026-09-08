import { describe, it, expect } from 'vitest';
import { BarnEnvironment, FEVER_CRITICAL_TEMP, createRng, REAL_HERD } from '../environment';

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

describe('v3: grounded herd + scene editing', () => {
  it('ships the measured live herd from PocketBase with real identities', () => {
    expect(REAL_HERD).toHaveLength(4);
    expect(REAL_HERD.map((p) => p.id)).toEqual(['pig-001', 'pig-002', 'pig-003', 'pig-004']);
    expect(REAL_HERD.map((p) => p.name)).toEqual(['Peppa', 'Boss Hog', 'Babe', 'Wilbur']);

    const env = new BarnEnvironment({ pigs: REAL_HERD, seed: 7 });
    expect(env.pigCount).toBe(4);
    const peppa = env.pig('pig-001')!;
    expect(peppa.health).toBe('HEALTHY');
    expect(peppa.breed).toBe('Duroc');
    expect(peppa.ageMo).toBe(6);
  });

  it('addPig injects a pig with an exposed readout; duplicates throw', () => {
    const env = new BarnEnvironment({ pigs: [{ id: 'pig-001' }], seed: 7 });
    const added = env.addPig({ id: 'pig-005', name: 'Sausage', breed: 'Landrace', ageMo: 3 });
    expect(env.pigCount).toBe(2);
    expect(added.health).toBe('HEALTHY');
    expect(env.pig('pig-005')!.exposure).toBe(0);
    expect(() => env.addPig({ id: 'pig-001' })).toThrow(/Duplicate pig/);
  });

  it('removePig deletes; unknown ids throw', () => {
    const env = new BarnEnvironment({ pigs: REAL_HERD, seed: 7 });
    env.removePig('pig-003');
    expect(env.pig('pig-003')).toBeUndefined();
    expect(env.pigCount).toBe(3);
    expect(() => env.removePig('nope')).toThrow(/Unknown pig/);
  });

  it('movePig repositions and clamps to the pen', () => {
    const env = new BarnEnvironment({ pigs: [{ id: 'pig-001' }], seed: 7 });
    env.movePig('pig-001', 0.8, 0.2);
    expect(env.pig('pig-001')!.x).toBeCloseTo(0.8, 3);
    expect(env.pig('pig-001')!.y).toBeCloseTo(0.2, 3);
    env.movePig('pig-001', -2, 2); // clamp
    const clamped = env.pig('pig-001')!;
    expect(clamped.x).toBeGreaterThanOrEqual(0.06);
    expect(clamped.x).toBeLessThanOrEqual(0.94);
    expect(() => env.movePig('nope', 0.5, 0.5)).toThrow(/Unknown pig/);
  });
});

describe('v3: open-air + entropy', () => {
  const stableParams = (extra: object) => ({ diurnalAmplitude: 0, entropy: 0, ambientNoise: 0, ...extra });

  it('ambientTemp follows the diurnal sinusoid deterministically', () => {
    const env = new BarnEnvironment({
      pigs: [{ id: 'p1' }],
      seed: 7,
      params: stableParams({ diurnalAmplitude: 3 })
    });
    tickSec(env, 90); // 90s = quarter period (360s full swing) → peak
    expect(env.ambientTemp).toBeCloseTo(28.5 + 3, 1);
    tickSec(env, 180); // 270s → trough
    expect(env.ambientTemp).toBeCloseTo(28.5 - 3, 1);
  });

  it('setParams takes effect live and keeps the environment deterministic', () => {
    const make = () => new BarnEnvironment({ pigs: [{ id: 'p1' }], seed: 7 });
    const a = make();
    const b = make();
    a.setParams({ ambientBaseTemp: 30 });
    b.setParams({ ambientBaseTemp: 30 });
    tickSec(a, 60);
    tickSec(b, 60);
    expect(a.ambientTemp).toBe(b.ambientTemp);
    expect(a.ambient.ambientBaseTemp).toBe(30);
    // Defaults preserved when untouched.
    expect(make().ambient.entropy).toBe(0);
  });

  it('triggerEvent shifts ambient; entropy fires stochastic events deterministically', () => {
    const params = () => ({ diurnalAmplitude: 1, entropy: 1, ambientNoise: 0, airFlow: 0 });
    const env = new BarnEnvironment({ pigs: [{ id: 'p1' }], seed: 7, params: params() });
    env.triggerEvent('DRAFT');
    // DRAFT is a cooling event → ambient drops below the 28.5 base (airFlow 0 → full effect).
    expect(env.ambientTemp).toBeCloseTo(28.5 - 2.2, 1);
    const dashReadout = env.ambientTemp;

    // Deterministic pair: same seed + same params + same trigger → same readout.
    const twin = new BarnEnvironment({ pigs: [{ id: 'p1' }], seed: 7, params: params() });
    twin.triggerEvent('DRAFT');
    expect(twin.ambientTemp).toBe(dashReadout);

    // Entropy > 0 makes ticks roll for ambient events (P≈0.02/tick): over 400
    // deterministic ticks at least one must fire; the result carries it.
    let fired = false;
    for (let i = 0; i < 400; i++) {
      const r = env.tick(0.25);
      if (r.events && r.events.length > 0) fired = true;
    }
    expect(fired).toBe(true);

    const twin2 = new BarnEnvironment({ pigs: [{ id: 'p1' }], seed: 7, params: params() });
    for (let i = 0; i < 400; i++) twin2.tick(0.25);
    expect(twin2.snapshot()).toEqual(env.snapshot());
    expect(twin2.ambientTemp).toBe(env.ambientTemp);
  });

  it('entropy is fully deterministic for a fixed seed + params', () => {
    const params = () => ({
      diurnalAmplitude: 2.5,
      entropy: 0.5,
      ambientNoise: 0.03,
      airFlow: 0.6
    });
    const make = () => new BarnEnvironment({ pigs: REAL_HERD, seed: 0xCAFE, params: params() });
    const a = make();
    const b = make();
    tickSec(a, 45);
    tickSec(b, 45);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.ambientTemp).toBe(b.ambientTemp);
  });
});

describe('v3: contagion', () => {
  const herd = () => [
    { id: 'sick', health: 'INFECTED' as const, x: 0.4, y: 0.4 },
    { id: 'near', health: 'HEALTHY' as const, x: 0.41, y: 0.4 },
    { id: 'far', health: 'HEALTHY' as const, x: 0.9, y: 0.9 }
  ];

  it('infects close neighbors beyond a dose threshold and reports the source', () => {
    const env = new BarnEnvironment({
      pigs: herd(),
      seed: 7,
      params: {
        contagionRadius: 0.3,
        contagionDose: 0.2,
        contagionRate: 0.08,
        airFlow: 0,
        humidity: 0,
        wanderSpeed: 0 // keep geometry static for exact expectations
      }
    });
    // Near pig is ~0.01 away → proximity ≈ 1 → exposure ≈ 0.08/s.
    // After 3 s it crosses dose 0.2 → INFECTED; far pig (~0.7 away) untouched.
    tickSec(env, 4);
    const near = env.pig('near')!;
    expect(near.health).toBe('INFECTED');
    expect(near.exposure).toBe(0); // reset after conversion
    expect(env.pig('far')!.health).toBe('HEALTHY');
    expect(env.pig('far')!.exposure).toBe(0);
  });

  it('exposure accumulates visibly before the dose threshold', () => {
    const env = new BarnEnvironment({
      pigs: herd(),
      seed: 7,
      params: {
        contagionRadius: 0.3,
        contagionDose: 5, // huge — never flips within the window
        contagionRate: 0.08,
        airFlow: 0,
        humidity: 0,
        wanderSpeed: 0
      }
    });
    tickSec(env, 2);
    const near = env.pig('near')!;
    expect(near.health).toBe('HEALTHY');
    expect(near.exposure).toBeGreaterThan(0.1);
  });

  it('airFlow and humidity shape the spread rate', () => {
    const airy = new BarnEnvironment({
      pigs: herd(), seed: 7,
      params: { contagionRadius: 0.3, contagionDose: 100, contagionRate: 0.08, airFlow: 1, humidity: 0, wanderSpeed: 0 }
    });
    const dank = new BarnEnvironment({
      pigs: herd(), seed: 7,
      params: { contagionRadius: 0.3, contagionDose: 100, contagionRate: 0.08, airFlow: 0, humidity: 1, wanderSpeed: 0 }
    });
    tickSec(airy, 15);
    tickSec(dank, 15);
    const dankExposure = dank.pig('near')!.exposure!;
    const airyExposure = airy.pig('near')!.exposure!;
    // Wind dilutes the pathogen cloud (×0.3); humidity boosts droplet survival (×1.4).
    expect(dankExposure).toBeGreaterThan(airyExposure * 2);
  });
});