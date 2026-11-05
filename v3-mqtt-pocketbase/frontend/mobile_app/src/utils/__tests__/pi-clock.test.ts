/**
 * Behavioral tests for the shared-lag timing contract (PiClock + pickAligned).
 *
 * These are the exact invariants thermal, CCTV and audio alignment ship on:
 * the offset must UNDER-estimate (running max over the window), the lag only
 * ever bumps up and is capped, and `pickAligned` must never return something
 * fresher than the cutoff. Plain import-time assertions, same convention as
 * telemetry-time.test.ts; run with any TS-aware runner (`npx tsx`, jest).
 */
import { DEFAULT_LAG_MS, MAX_LAG_MS, PiClock, pickAligned } from '../pi-clock';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── Ready state + the under-estimate rule ────────────────────────────────
const c1 = new PiClock();
expectEq(c1.ready, false, 'not ready with zero samples');
expectEq(c1.now(), null, 'now() null before ready');
expectEq(c1.offsetMs(), null, 'offsetMs() null before ready');
c1.observe(1_000_500, 1_000_000); // offset +500 (small transit)
c1.observe(1_000_200, 1_000_000); // offset +200 (large transit)
expectEq(c1.ready, false, 'still not ready with two samples');
c1.observe(1_000_300, 1_000_000); // offset +300
expectEq(c1.ready, true, 'ready at three samples');
// The peak is the least-transit observation — the offset lower bound.
expectEq(c1.offsetMs(), 500, 'peak offset wins (under-estimate keeps the max)');
c1.reset();
expectEq(c1.ready, false, 'reset drops observations');
expectEq(c1.now(), null, 'reset leaves now() null');

// ── Sliding window: old peaks slide out, the max recomputes ──────────────
const c2 = new PiClock();
const t = 2_000_000_000;
c2.observe(t + 5_000, t); // +5000 — the loud early peak
c2.observe(t + 51_000, t + 50_000); // +1000, inside the window
c2.observe(t + 52_000, t + 51_000); // +1000 — ready again (min 3 samples)
expectEq(c2.offsetMs(), 5_000, 'old peak still inside the window');
c2.observe(t + 93_000, t + 91_000); // +2000 — arrival 91 s later pushes the old peak out
c2.observe(t + 94_000, t + 92_000); // +2000 — readiness back at three samples
expectEq(c2.offsetMs(), 2_000, 'peak recomputed after the window pruned the old one');

// ── The shared lag: bump-only, capped, released on stop ──────────────────
const c3 = new PiClock();
expectEq(c3.lagMs, DEFAULT_LAG_MS, 'starts at the default lag');
c3.ensureForAge(1_000); // wants 1600 < 3500 — no bump
expectEq(c3.lagMs, DEFAULT_LAG_MS, 'small age does not shrink or bump the lag');
c3.ensureForAge(5_000); // wants 5600
expectEq(c3.lagMs, 5_600, 'large age bumps the lag to age+margin');
c3.ensureForAge(4_000); // wants 4600 < 5600 — never decays mid-session
expectEq(c3.lagMs, 5_600, 'bump-only: a smaller age never lowers the lag');
c3.ensureForAge(100_000);
expectEq(c3.lagMs, MAX_LAG_MS, 'lag is capped at MAX_LAG_MS');
c3.releaseLag();
expectEq(c3.lagMs, DEFAULT_LAG_MS, 'releaseLag resets to the default');

// ── pickAligned: newest item at or behind nowPi − lag, nothing fresher ───
const items = [{ ts: 100 }, { ts: 500 }, { ts: 900 }, { ts: null }, {}, { ts: Number.NaN }];
expectEq(pickAligned(items, null, 100), null, 'null nowPi → nothing selectable');
expectEq(pickAligned(items, 1_000, 100), items[2], 'newest item at or behind the cutoff');
expectEq(pickAligned(items, 700, 100), items[1], 'nothing fresher than nowPi−lag');
expectEq(pickAligned(items, 90, 100), null, 'no item old enough → null');
expectEq(pickAligned([], 1_000, 100), null, 'empty buffer → null');
expectEq(pickAligned(items, 900, 0), items[2], 'cutoff inclusive at exactly ts');

// ── now()/clientTimeFor(): lower bound and exact mapping ─────────────────
const c6 = new PiClock();
const base = Date.now();
c6.observe(base + 5_000, base);
c6.observe(base + 35_000, base + 30_000);
c6.observe(base + 65_000, base + 60_000);
expectEq(c6.offsetMs(), 5_000, 'peak survives inside the window');
const n = c6.now();
if (n === null) {
  failures += 1;
  report('FAIL ready clock still returns null from now()');
} else {
  const d = n - Date.now();
  expectEq(d >= 4_000 && d <= 5_000, true, `now() is a lower bound near +5 s (got ${d})`);
}
expectEq(c6.clientTimeFor(base + 66_001), base + 61_001, 'clientTimeFor maps pi→client exactly');

if (failures > 0) {
  report(`${failures} pi-clock assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('pi-clock: all assertions passed');
