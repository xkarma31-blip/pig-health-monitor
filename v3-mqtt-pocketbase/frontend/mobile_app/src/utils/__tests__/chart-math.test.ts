/**
 * Tests for the chart math.
 *
 * Plain import-time assertions, same convention as pi-clock.test.ts and
 * telemetry-time.test.ts; run with any TS-aware runner (`npx tsx`, jest).
 *
 * The two easy mistakes in a chart are plotting a repeated value at the wrong
 * x position, and drawing a straight line across a gap that was never
 * measured. Both are pinned here.
 */
import { buildSegments, computeScale } from '../../components/primitives/chartMath';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectDeep(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    report(`FAIL ${label}: expected ${e}, got ${a}`);
  }
}

// ── Segments: a missing reading is a break, never a zero ────────────────
expectDeep(buildSegments([1, 2, 3]), [[{ i: 0, v: 1 }, { i: 1, v: 2 }, { i: 2, v: 3 }]],
  'a full series is one segment');

expectDeep(buildSegments([1, null, 3]), [[{ i: 0, v: 1 }], [{ i: 2, v: 3 }]],
  'a null ends the segment - never interpolated across');

expectDeep(buildSegments([null, 5, null, null, 6, null]), [[{ i: 1, v: 5 }], [{ i: 4, v: 6 }]],
  'leading/trailing nulls produce no empty segments');

expectDeep(buildSegments([null, null]), [],
  'an all-null series has no segments');

// ── Repeated values must keep their own index ───────────────────────────
const repeated = buildSegments([7, 7, 7]);
expectEq(repeated.length, 1, 'repeated values stay in one segment');
expectDeep(repeated[0].map((p) => p.i), [0, 1, 2],
  'repeated values keep their own index (the indexOf bug)');
expectDeep(repeated[0].map((p) => p.v), [7, 7, 7],
  'repeated values keep their values');

// ── Scale ───────────────────────────────────────────────────────────────
const padded = computeScale([10, 20]);
expectEq(padded.lo < 10, true, 'the scale is padded below the minimum');
expectEq(padded.hi > 20, true, 'the scale is padded above the maximum');
expectEq(padded.span, padded.hi - padded.lo, 'span matches the range');

const flat = computeScale([30, 30, 30]);
expectEq(flat.hi > flat.lo, true, 'a flat series still gets a band');
expectEq(flat.hi - flat.lo >= 1, true, 'a flat series band is at least 1 wide');

const fixed = computeScale([10, 20], 0, 50);
expectEq(fixed.lo, 0, 'a caller-supplied low wins');
expectEq(fixed.hi, 50, 'a caller-supplied high wins');

if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('chart-math: all assertions passed');
} else {
  // eslint-disable-next-line no-console
  console.error(`chart-math: ${failures} assertion(s) failed`);
  process.exitCode = 1;
}
