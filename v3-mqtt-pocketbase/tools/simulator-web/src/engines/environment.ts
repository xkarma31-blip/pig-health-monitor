/**
 * Barn environment — the reality layer the sensor pipeline consumes.
 *
 * Each pig is an actor with a health state that DRIVES its biology:
 *   HEALTHY  → low cough rate, core temp ~38.5 °C
 *   INFECTED → rising cough rate (7/min), fever ramping toward 40.8 °C
 *   CRITICAL → high cough rate (13/min), fever toward 40.8 °C (auto-latches
 *              at the FEVER_CRITICAL threshold of 40.0 °C)
 *
 * Deterministic by seed; `setHealth` lets scenarios script infections.
 *
 * v3 (grounded 2026-09-08): open-air factors + entropy + contagion + live herd.
 *   - Real herd defaults from the measured PocketBase `pigs` collection
 *     (pig-001 Peppa … pig-004 Wilbur, with breed/age tags).
 *   - Open-air: ambient base temp + diurnal cycle + humidity + air flow
 *     (ventilation dilutes cough contagion and dampens ambient swings).
 *   - Entropy: seeded stochastic events (DRAFT / HEAT_SPIKE / DOOR_OPEN)
 *     scale with an entropy knob; all deterministic for a fixed seed + params.
 *   - Contagion: proximity × air-flow decay — an INFECTED pig seeds exposure
 *     into HEALTHY neighbors within `contagionRadius`; crossing `contagionDose`
 *     turns the neighbor INFECTED (visible herd dynamics at 8/12/20 pigs).
 *   - Scene editing: addPig/removePig/movePig + pen size — the cockpit can
 *     reposition animals and watch the thermal hotspot follow.
 *
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
  /** Grounded identity from the live PocketBase `pigs` collection. */
  name?: string;
  breed?: string;
  ageMo?: number;
}

export interface PigActorState {
  id: string;
  x: number;
  y: number;
  coreTemp: number;
  health: PigHealthState;
  name?: string;
  breed?: string;
  ageMo?: number;
  /** Accumulated contagion exposure (0..contagionDose) — diagnostic readout. */
  exposure?: number;
}

export interface EnvTickResult {
  timeSec: number;
  pigs: PigActorState[];
  /** Cough events emitted during this tick (pigId, count). */
  coughs: Array<{ pigId: string; count: number }>;
  /** Contagion events this tick: newly infected pigs. */
  infections?: Array<{ pigId: string; sourceId: string }>;
  /** Ambient events this tick (DRAFT / HEAT_SPIKE / DOOR_OPEN). */
  events?: Array<{ name: EntropyEventName; atSec: number }>;
  /** Current ambient temperature after diurnal + events (diagnostic). */
  ambientNow?: number;
}

export interface EnvironmentParams {
  /** Base (trough) ambient temperature °C. */
  ambientBaseTemp?: number;
  /** Diurnal swing °C: ambient = base + amp·sin(2π·(t/86400)·dayFrac...) */
  diurnalAmplitude?: number;
  /** Relative humidity 0..1 — feeds event severity + noise. */
  humidity?: number;
  /** Ventilation air flow 0..1 — dilutes contagion, dampens ambient swings. */
  airFlow?: number;
  /** Entropy 0..1 — scales ambient noise + stochastic event frequency. */
  entropy?: number;
  /** Contagion radius in pen units (0 = contagion off). */
  contagionRadius?: number;
  /** Cumulative exposure needed for a healthy pig to turn INFECTED. */
  contagionDose?: number;
  /** Contagion seeding rate per second at radius 0. */
  contagionRate?: number;
  /** Random-walk speed (pen units/sec) for healthy wandering. */
  wanderSpeed?: number;
  /** Noise amplitude °C of the ambient signal. */
  ambientNoise?: number;
}

export interface EnvironmentOptions {
  pigs: PigConfig[];
  seed?: number;
  ambientTemp?: number;
  params?: EnvironmentParams;
}

export type EntropyEventName = 'DRAFT' | 'HEAT_SPIKE' | 'DOOR_OPEN';

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

/** Measured live herd — PocketBase `pigs` collection, 2026-09-08. */
export const REAL_HERD: PigConfig[] = [
  { id: 'pig-001', name: 'Peppa', breed: 'Duroc', ageMo: 6 },
  { id: 'pig-002', name: 'Boss Hog', breed: 'Yorkshire', ageMo: 11 },
  { id: 'pig-003', name: 'Babe', breed: 'Duroc', ageMo: 13 },
  { id: 'pig-004', name: 'Wilbur', breed: 'Landrace', ageMo: 6 }
];

// v2-congruent defaults: ambient static, no entropy draws, no contagion, so a
// default BarnEnvironment consumes the SAME PRNG stream as the committed v2
// model — every existing seed-dependent test keeps its exact expected output.
// Open-air factors (diurnal, entropy, contagion) are explicit opt-ins via
// `setParams` / `params:` and stay OFF until the cockpit switches them on.
const DEFAULT_PARAMS: Required<EnvironmentParams> = {
  ambientBaseTemp: 28.5,
  diurnalAmplitude: 0,
  humidity: 0.65,
  airFlow: 0.6,
  entropy: 0,
  contagionRadius: 0,
  contagionDose: 5,
  contagionRate: 0.08,
  wanderSpeed: 0.012,
  ambientNoise: 0.02
};

// Event envelope: name → peak ambient shift °C and halflife seconds.
const EVENT_ENVELOPE: Record<EntropyEventName, { deltaC: number; halflifeSec: number }> = {
  DRAFT: { deltaC: -2.2, halflifeSec: 45 },
  HEAT_SPIKE: { deltaC: +3.5, halflifeSec: 90 },
  DOOR_OPEN: { deltaC: +0.8, halflifeSec: 120 }
};

interface InternalPig {
  id: string;
  x: number;
  y: number;
  coreTemp: number;
  health: PigHealthState;
  nextCoughAtSec: number;
  tempTarget: number;
  name?: string;
  breed?: string;
  ageMo?: number;
  exposure: number; // accumulated contagion exposure 0..contagionDose
  infectedAtSec: number; // when it crossed the dose (for diagnostics)
}

interface ActiveEvent {
  name: EntropyEventName;
  atSec: number;
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
  private params: Required<EnvironmentParams>;
  private events: ActiveEvent[] = [];
  readonly seed: number;

  constructor(opts: EnvironmentOptions) {
    this.seed = opts.seed ?? 0xb0ba5eed;
    this.rng = createRng(this.seed);
    const p = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) };
    if (opts.ambientTemp !== undefined) p.ambientBaseTemp = opts.ambientTemp;
    this.params = p;
    this.pigs = opts.pigs.map((cfg) => this.spawnPig(cfg));
  }

  private spawnPig(cfg: PigConfig): InternalPig {
    const health: PigHealthState = cfg.health ?? 'HEALTHY';
    return {
      id: cfg.id,
      x: cfg.x ?? 0.3 + this.rng() * 0.4,
      y: cfg.y ?? 0.3 + this.rng() * 0.4,
      coreTemp: cfg.coreTemp ?? INITIAL_TEMP[health],
      health,
      tempTarget: HEALTH_TABLE[health].tempTarget,
      nextCoughAtSec: this.rng() * (60 / HEALTH_TABLE[health].coughPerMin),
      name: cfg.name,
      breed: cfg.breed,
      ageMo: cfg.ageMo,
      exposure: 0,
      infectedAtSec: -1
    };
  }

  get timeSec(): number {
    return this.elapsedSec;
  }

  get ambient(): EnvironmentParams {
    return { ...this.params };
  }

  /** Current ambient temperature after diurnal cycle + active events + noise. */
  get ambientTemp(): number {
    let t = this.params.ambientBaseTemp;
    if (this.params.diurnalAmplitude > 0) {
      // Slow day cycle: full swing over 6 minutes of sim time (fast enough to watch).
      t += this.params.diurnalAmplitude * Math.sin((this.elapsedSec / 360) * 2 * Math.PI);
    }
    for (const ev of this.events) {
      const env = EVENT_ENVELOPE[ev.name];
      const age = this.elapsedSec - ev.atSec;
      const decay = Math.exp(-age / env.halflifeSec);
      // Air flow dampens ambient shifts: a well-ventilated barn barely feels them.
      const damp = 1 - this.params.airFlow * 0.6;
      t += env.deltaC * decay * damp;
    }
    if (this.params.entropy > 0 && this.params.ambientNoise > 0) {
      t += (this.rng() - 0.5) * 2 * this.params.ambientNoise * Math.min(1, this.params.entropy * 2);
    }
    return Math.round(t * 100) / 100;
  }

  get pigCount(): number {
    return this.pigs.length;
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
    // pig would still be waiting on a timer drawn for the old (healthy) rate.
    pig.nextCoughAtSec = this.rng() * (60 / HEALTH_TABLE[health].coughPerMin);
  }

  /** Update live environment knobs (open-air factors, contagion, entropy). */
  setParams(p: Partial<EnvironmentParams>): void {
    this.params = { ...this.params, ...p };
  }

  /** Manually trigger an ambient event (entropy knob scales the effect). */
  triggerEvent(name: EntropyEventName): void {
    this.events = this.events.filter((e) => e.name !== name);
    this.events.push({ name, atSec: this.elapsedSec });
  }

  /** Scene editing: add a pig (returns its state), throwing on duplicate id. */
  addPig(cfg: PigConfig): PigActorState {
    if (this.pigs.some((p) => p.id === cfg.id)) throw new Error(`Duplicate pig ${cfg.id}`);
    const pig = this.spawnPig(cfg);
    this.pigs.push(pig);
    return this.toState(pig);
  }

  removePig(pigId: string): void {
    const i = this.pigs.findIndex((p) => p.id === pigId);
    if (i === -1) throw new Error(`Unknown pig ${pigId}`);
    this.pigs.splice(i, 1);
  }

  /** Scene editing: reposition a pig (clamped to the pen). */
  movePig(pigId: string, x: number, y: number): void {
    const pig = this.pigs.find((p) => p.id === pigId);
    if (!pig) throw new Error(`Unknown pig ${pigId}`);
    pig.x = Math.round(Math.min(MAX_POS, Math.max(MIN_POS, x)) * 1000) / 1000;
    pig.y = Math.round(Math.min(MAX_POS, Math.max(MIN_POS, y)) * 1000) / 1000;
  }

  pig(pigId: string): PigActorState | undefined {
    const p = this.pigs.find((x) => x.id === pigId);
    return p ? this.toState(p) : undefined;
  }

  snapshot(): PigActorState[] {
    return this.pigs.map((p) => this.toState(p));
  }

  /**
   * Advances the barn by dt seconds. Deterministic for a fixed seed + params.
   * v3 additionally: ambient dynamics, entropy events, contagion between pigs.
   */
  tick(dtSec: number): EnvTickResult {
    this.elapsedSec += dtSec;
    const coughs: Array<{ pigId: string; count: number }> = [];
    const infections: Array<{ pigId: string; sourceId: string }> = [];
    const tickEvents: Array<{ name: EntropyEventName; atSec: number }> = [];

    // Entropy: stochastic ambient events, seeded & scaled by the entropy knob.
    if (this.params.entropy > 0) {
      const eventProb = dtSec * this.params.entropy * 0.08;
      if (this.rng() < eventProb && this.params.diurnalAmplitude > 0) {
        const names: EntropyEventName[] = ['DRAFT', 'HEAT_SPIKE', 'DOOR_OPEN'];
        const name = names[Math.floor(this.rng() * names.length)];
        this.events = this.events.filter((e) => e.name !== name);
        this.events.push({ name, atSec: this.elapsedSec });
        tickEvents.push({ name, atSec: this.elapsedSec });
      }
    }

    // Contagion exposure first (so newly infected pigs cough this same tick
    // only after their state flips — their cough rate updates next tick).
    if (this.params.contagionRadius > 0) {
      for (const pig of this.pigs) {
        if (pig.health !== 'HEALTHY') continue;
        for (const src of this.pigs) {
          if (src.id === pig.id || src.health === 'HEALTHY') continue;
          const dx = pig.x - src.x;
          const dy = pig.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > this.params.contagionRadius) continue;
          const proximity = 1 - dist / this.params.contagionRadius;
          // Air flow dilutes the pathogen cloud; humidity slightly increases droplet survival.
          const dilution = 1 - this.params.airFlow * 0.7;
          const humidityBoost = 1 + this.params.humidity * 0.4;
          pig.exposure +=
            dtSec * this.params.contagionRate * proximity * dilution * humidityBoost;
        }
      }
      for (const pig of this.pigs) {
        if (pig.health !== 'HEALTHY' || pig.exposure < this.params.contagionDose) continue;
        const source = this.pigs
          .filter((s) => s.id !== pig.id && s.health !== 'HEALTHY')
          .sort((a, b) => dist(a, pig) - dist(b, pig))[0];
        this.setHealth(pig.id, 'INFECTED');
        pig.exposure = 0;
        pig.infectedAtSec = this.elapsedSec;
        if (source) infections.push({ pigId: pig.id, sourceId: source.id });
      }
    }

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
      const speed = this.params.wanderSpeed;
      pig.x = Math.min(MAX_POS, Math.max(MIN_POS, pig.x + (this.rng() - 0.5) * speed * dtSec * 4));
      pig.y = Math.min(MAX_POS, Math.max(MIN_POS, pig.y + (this.rng() - 0.5) * speed * dtSec * 4));
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

    // Expire finished events (age > 4·halflife) to keep the array tiny.
    this.events = this.events.filter((ev) => {
      const age = this.elapsedSec - ev.atSec;
      return age < EVENT_ENVELOPE[ev.name].halflifeSec * 4;
    });

    return {
      timeSec: this.elapsedSec,
      pigs: this.snapshot(),
      coughs,
      infections: infections.length ? infections : undefined,
      events: tickEvents.length ? tickEvents : undefined,
      ambientNow: this.ambientTemp
    };
  }

  private toState(p: InternalPig): PigActorState {
    return {
      id: p.id,
      x: p.x,
      y: p.y,
      coreTemp: p.coreTemp,
      health: p.health,
      name: p.name,
      breed: p.breed,
      ageMo: p.ageMo,
      exposure: Math.round(p.exposure * 1000) / 1000
    };
  }
}

function dist(a: InternalPig, b: InternalPig): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}