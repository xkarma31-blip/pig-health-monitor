/**
 * Barn environment — the reality layer the sensor pipeline consumes.
 *
 * Each pig is an actor with a health state that DRIVES its biology:
 *   HEALTHY  → low cough rate, core temp ~38.5 °C
 *   INFECTED → rising cough rate (7/min), fever ramping toward 39.7 °C
 *   CRITICAL → high cough rate (13/min), fever toward 40.8 °C (auto-latches
 *              at the FEVER_CRITICAL threshold of 40.0 °C)
 *
 * Deterministic by seed; `setHealth` lets scenarios script infections.
 * This is the SOURCE of causality: nothing downstream produces a cough or a
 * fever on its own — it only senses, classifies, and publishes what the
 * environment generates.
 */

export type PigHealthState = 'HEALTHY' | 'INFECTED' | 'CRITICAL';

export interface PigConfig {
  id: string;
  x?: number; // 0..1 pen position
  y?: number;
  health?: PigHealthState;
  coreTemp?: number;
}

export interface PigActorState {
  id: string;
  x: number;
  y: number;
  coreTemp: number;
  health: PigHealthState;
}

export interface EnvTickResult {
  timeSec: number;
  pigs: PigActorState[];
  /** Cough events emitted during this tick (pigId, count). */
  coughs: Array<{ pigId: string; count: number }>;
}

export interface EnvironmentOptions {
  pigs: PigConfig[];
  seed?: number;
  ambientTemp?: number;
}

// Per-state biological parameters (events/min, fever target °C).
// INFECTED fevers ramp THROUGH 40.0 toward 40.8: crossing the critical
// threshold latches the pig to CRITICAL (the state machine own the same rule).
const HEALTH_TABLE: Record<PigHealthState, { coughPerMin: number; tempTarget: number }> = {
  HEALTHY: { coughPerMin: 0.4, tempTarget: 38.5 },
  INFECTED: { coughPerMin: 7.0, tempTarget: 40.8 },
  CRITICAL: { coughPerMin: 13.0, tempTarget: 40.8 }
};

export const FEVER_CRITICAL_TEMP = 40.0;
/** Linear °C/sec toward target (from 39.0 to 40.0 in ~17 s — visible fever). */
export const TEMP_RAMP_PER_SEC = 0.06;
const TEMP_DRIFT_AMP = 0.012; // °C per second of measurement drift
const MIN_POS = 0.06;
const MAX_POS = 0.94;

interface InternalPig {
  id: string;
  x: number;
  y: number;
  coreTemp: number;
  health: PigHealthState;
  nextCoughAtSec: number;
  tempTarget: number;
}

/** mulberry32 — small deterministic PRNG, seeded per environment. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INITIAL_TEMP: Record<PigHealthState, number> = {
  HEALTHY: 38.5,
  INFECTED: 39.2,
  CRITICAL: 40.0
};

export class BarnEnvironment {
  private rng: () => number;
  private pigs: InternalPig[];
  private elapsedSec = 0;
  readonly ambientTemp: number;

  constructor(opts: EnvironmentOptions) {
    this.rng = createRng(opts.seed ?? 0xB0BA5EED);
    this.ambientTemp = opts.ambientTemp ?? 28.5;
    this.pigs = opts.pigs.map((cfg) => {
      const health: PigHealthState = cfg.health ?? 'HEALTHY';
      return {
        id: cfg.id,
        x: cfg.x ?? 0.3 + this.rng() * 0.4,
        y: cfg.y ?? 0.3 + this.rng() * 0.4,
        coreTemp: cfg.coreTemp ?? INITIAL_TEMP[health],
        health,
        tempTarget: HEALTH_TABLE[health].tempTarget,
        nextCoughAtSec: this.rng() * (60 / HEALTH_TABLE[health].coughPerMin)
      };
    });
  }

  get timeSec(): number {
    return this.elapsedSec;
  }

  /** Scripted infection onset (used by scenarios + the cockpit Infect button). */
  setHealth(pigId: string, health: PigHealthState): void {
    const pig = this.pigs.find((p) => p.id === pigId);
    if (!pig) throw new Error(`Unknown pig ${pigId}`);
    pig.health = health;
    pig.tempTarget = HEALTH_TABLE[health].tempTarget;
    // Kick the temp toward the new state so onset is visible within seconds.
    if (health === 'INFECTED' && pig.coreTemp < 39.0) pig.coreTemp = 39.0;
    // Re-draw the next cough arrival at the NEW state's rate — otherwise the
    // pig would keep waiting on a timer drawn for the old (healthy) rate.
    pig.nextCoughAtSec = this.rng() * (60 / HEALTH_TABLE[health].coughPerMin);
  }

  pig(pigId: string): PigActorState | undefined {
    const p = this.pigs.find((x) => x.id === pigId);
    return p ? this.toState(p) : undefined;
  }

  snapshot(): PigActorState[] {
    return this.pigs.map((p) => this.toState(p));
  }

  /** Advances the barn by dt seconds. Deterministic for a fixed seed. */
  tick(dtSec: number): EnvTickResult {
    this.elapsedSec += dtSec;
    const coughs: Array<{ pigId: string; count: number }> = [];

    for (const pig of this.pigs) {
      // Fever trajectory: LINEAR ramp toward the health-state target so onset
      // is visible and reachable in finite time; plateau clamps exactly AT the
      // setpoint (fever stabilizes — pyrogen setpoint theory).
      const target = HEALTH_TABLE[pig.health].tempTarget;
      pig.tempTarget = target;
      const diff = target - pig.coreTemp;
      const step = dtSec * TEMP_RAMP_PER_SEC;
      if (Math.abs(diff) < step) {
        pig.coreTemp = target;
      } else {
        pig.coreTemp += Math.sign(diff) * step;
        pig.coreTemp += (this.rng() - 0.5) * TEMP_DRIFT_AMP * dtSec * 2; // drift
      }
      pig.coreTemp = Math.round(pig.coreTemp * 100) / 100;

      // Health auto-progression: fever past the critical threshold latches CRITICAL.
      if (pig.health === 'INFECTED' && pig.coreTemp >= FEVER_CRITICAL_TEMP) {
        pig.health = 'CRITICAL';
      }

      // Movement: slow random walk, clamped to the pen.
      pig.x = Math.min(MAX_POS, Math.max(MIN_POS, pig.x + (this.rng() - 0.5) * 0.012 * dtSec * 4));
      pig.y = Math.min(MAX_POS, Math.max(MIN_POS, pig.y + (this.rng() - 0.5) * 0.012 * dtSec * 4));
      pig.x = Math.round(pig.x * 1000) / 1000;
      pig.y = Math.round(pig.y * 1000) / 1000;

      // Cough process: exponential inter-arrival at the state rate.
      const ratePerSec = HEALTH_TABLE[pig.health].coughPerMin / 60;
      let count = 0;
      pig.nextCoughAtSec -= dtSec;
      while (pig.nextCoughAtSec <= 0 && ratePerSec > 0) {
        count++;
        pig.nextCoughAtSec += -Math.log(1 - this.rng()) / ratePerSec;
      }
      if (count > 0) coughs.push({ pigId: pig.id, count });
    }

    return { timeSec: this.elapsedSec, pigs: this.snapshot(), coughs };
  }

  private toState(p: InternalPig): PigActorState {
    return { id: p.id, x: p.x, y: p.y, coreTemp: p.coreTemp, health: p.health };
  }
}