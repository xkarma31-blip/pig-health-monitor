/**
 * Pure helpers for the time-series chart.
 *
 * They live apart from the component so they can be TESTED: the two easy
 * mistakes in a chart are plotting a repeated value at the wrong x position,
 * and drawing a straight line across a gap that was never measured. Both are
 * covered by chart-math.test.ts.
 */

export type ChartSegment = { i: number; v: number }[];

/**
 * Split a value list into continuous segments.
 *
 * A `null` value means "no reading at that position": it ends the current
 * segment, so the line is drawn ONLY through positions that were actually
 * read. A missing reading is never drawn as zero and never interpolated
 * across.
 *
 * Each point keeps its INDEX, because values repeat (two buckets can hold
 * the same temperature) and a value must never be looked up by value.
 */
export function buildSegments(values: (number | null)[]): ChartSegment[] {
  const segments: ChartSegment[] = [];
  let current: ChartSegment = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, v });
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

export type Scale = { lo: number; hi: number; span: number };

/**
 * The y scale for the chart.
 *
 * A flat series still gets a band around it (otherwise every point lands on
 * one line), and a caller-supplied min/max wins, so a fixed band can be
 * kept when one is wanted.
 */
export function computeScale(
  values: number[],
  yMin?: number,
  yMax?: number
): Scale {
  if (!values.length) return { lo: 0, hi: 1, span: 1 };
  let lo = yMin !== undefined ? yMin : Math.min(...values);
  let hi = yMax !== undefined ? yMax : Math.max(...values);
  if (hi - lo < 0.5) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  } else if (yMin === undefined && yMax === undefined) {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  return { lo, hi, span: hi - lo || 1 };
}
