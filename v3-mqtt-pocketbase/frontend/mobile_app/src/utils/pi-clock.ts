/**
 * PiClock — a client-side estimate of the Raspberry Pi's clock (epoch ms).
 *
 * Every capture endpoint stamps what it returns with the Pi's own clock:
 * `/data` carries `ts`, the CCTV proxy forwards `X-Frame-Ts`, and the mic
 * stream forwards `X-Stream-Ts`. One shared estimate of "what time is it on
 * the Pi right now" is what lets the thermal frame, the camera frame and the
 * audio sample captured at the same instant be shown — and played — at the
 * same instant on this device: all of them delayed by one shared amount.
 *
 * Model: offset = piClock − clientClock. A payload stamped with Pi time `P`
 * that reaches this device at client time `C` measures `P − C = offset −
 * transit`. Transit is always ≥ 0, so every measurement UNDER-estimates the
 * offset; the running maximum over a sliding window is the sample with the
 * least transit, and is therefore a lower bound on the true offset.
 * `now()` = clientNow + maxOffset is a lower bound on the Pi's current time.
 *
 * Being a lower bound is the safe direction: selecting items with
 * `ts ≤ now() − lag` guarantees the shown content is at least `lag` behind
 * live (never ahead of its own audio), and scheduling audio at
 * `capture + lag` through `clientTimeFor` guarantees it never starts before
 * the frame that shows the same moment.
 */

export const DEFAULT_LAG_MS = 3500;
export const MAX_LAG_MS = 8000;
const WINDOW_MS = 90_000;
const MIN_SAMPLES = 3;

interface OffsetSample {
  offset: number;
  at: number;
}

export interface TimedLike {
  ts?: number | null;
}

export class PiClock {
  private samples: OffsetSample[] = [];
  private peak = Number.NEGATIVE_INFINITY;
  private lag = DEFAULT_LAG_MS;
  private listeners = new Set<() => void>();

  /**
   * Feed one observation: the Pi time a payload was produced, and when it
   * reached this device.
   */
  observe(serverTs: number, clientArrival = Date.now()): void {
    if (!Number.isFinite(serverTs) || serverTs <= 0 || !Number.isFinite(clientArrival)) return;
    const wasReady = this.ready;
    this.samples.push({ offset: serverTs - clientArrival, at: clientArrival });
    this.prune(clientArrival);
    this.recompute();
    if (!wasReady && this.ready) this.emit();
  }

  /** True once enough recent observations exist for the estimate to mean anything. */
  get ready(): boolean {
    return this.samples.length >= MIN_SAMPLES;
  }

  /** Lower-bound estimate of the Pi's current time (epoch ms); null until ready. */
  now(): number | null {
    return this.ready ? Date.now() + this.peak : null;
  }

  /** Current offset estimate (pi − client, ms); null until ready. */
  offsetMs(): number | null {
    return this.ready ? this.peak : null;
  }

  /** Client wall-clock time at which Pi moment `piMs` happens (ms); null until ready. */
  clientTimeFor(piMs: number): number | null {
    const off = this.offsetMs();
    return off === null ? null : piMs - off;
  }

  /** The shared presentation lag: how far behind live everything is shown/played. */
  get lagMs(): number {
    return this.lag;
  }

  /**
   * Grow the shared lag so that content arriving `ageMs` late is still
   * schedulable (`lag ≥ age + margin`). Bump-only: the lag recovers via
   * `releaseLag()` when listening stops, not by decaying mid-session.
   */
  ensureForAge(ageMs: number, marginMs = 600): void {
    if (!Number.isFinite(ageMs) || ageMs <= 0) return;
    const want = Math.min(ageMs + marginMs, MAX_LAG_MS);
    if (want > this.lag + 1) {
      this.lag = want;
      this.emit();
    }
  }

  /** Start fresh at the default lag (called when a listening session ends). */
  releaseLag(): void {
    if (this.lag !== DEFAULT_LAG_MS) {
      this.lag = DEFAULT_LAG_MS;
      this.emit();
    }
  }

  /** Drop every observation (e.g. after a stretch with no data). */
  reset(): void {
    this.samples = [];
    this.peak = Number.NEGATIVE_INFINITY;
    if (this.lag !== DEFAULT_LAG_MS) this.lag = DEFAULT_LAG_MS;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].at < cutoff) drop++;
    if (drop > 0) this.samples.splice(0, drop);
  }

  private recompute(): void {
    let peak = Number.NEGATIVE_INFINITY;
    for (const s of this.samples) {
      if (s.offset > peak) peak = s.offset;
    }
    this.peak = peak;
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* a listener must never break the clock */
      }
    }
  }
}

/** The one shared estimate every capture surface aligns against. */
export const piClock = new PiClock();

/**
 * Newest item whose `ts` is at least `lagMs` behind the Pi-clock estimate —
 * i.e. the freshest item that can be shown while staying `lagMs` behind live.
 * Null while the clock is not ready or nothing is old enough yet.
 */
export function pickAligned<T extends TimedLike>(items: readonly T[], nowPi: number | null, lagMs: number): T | null {
  if (nowPi === null) return null;
  const cutoff = nowPi - lagMs;
  let best: T | null = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const ts = item.ts;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts > cutoff) continue;
    if (ts > bestTs) {
      bestTs = ts;
      best = item;
    }
  }
  return best;
}
