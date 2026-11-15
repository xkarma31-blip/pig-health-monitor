import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme';
import { buildSegments, computeScale } from './chartMath';

export type ChartSeries = {
  label: string;
  color: string;
  /**
   * One value per x position. `null` means "no reading here" and is drawn as
   * a BREAK in the line - never as zero, and never interpolated across, so a
   * failed read can never look like a real measurement.
   */
  values: (number | null)[];
};

/** A vertical marker on the chart - used to show WHEN something happened. */
export type ChartMarker = {
  /** Absolute timestamp (same clock as xTimes). */
  t: number;
  label: string;
  color: string;
};

type TimeSeriesChartProps = {
  series: ChartSeries[];
  /** One label per x position (e.g. the bucket's clock time). */
  labels: string[];
  /**
   * The absolute time of each x position. Optional, but REQUIRED for
   * markers: the buckets are fixed-width, so time maps linearly onto x.
   */
  xTimes?: number[];
  /** Vertical markers (alerts, events) drawn over the series. */
  markers?: ChartMarker[];
  /** Drawn on the y axis next to the value. */
  unit?: string;
  height?: number;
  /** Shown instead of the chart when there is nothing to draw. */
  emptyMessage?: string;
  /** Forces the y scale (e.g. keep a fever band visible). */
  yMin?: number;
  yMax?: number;
};

const PAD_L = 44;
const PAD_R = 10;
const PAD_T = 8;
const PAD_B = 22;

/**
 * A line chart of readings over time, drawn with react-native-svg (already a
 * dependency of this app - no new packages).
 *
 * Two rules this component exists to enforce:
 *  1. A missing reading is a GAP, not a zero. The line breaks, so the shape
 *     of the data is never invented.
 *  2. The scale is derived from the data, and the axis is labelled, so a
 *     reader can tell a real fluctuation from a rendering artefact.
 */
export function TimeSeriesChart({
  series,
  labels,
  xTimes,
  markers = [],
  unit = '',
  height = 190,
  emptyMessage = 'No readings in this window.',
  yMin,
  yMax,
}: TimeSeriesChartProps) {
  const { colors, typography } = useTheme();

  const width = 320; // viewBox width; the Svg scales to the parent
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const points = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (points.length === 0 || labels.length === 0) {
    return (
      <View style={styles.empty} accessibilityRole="text">
        <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 15 }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  const { lo, hi, span } = computeScale(points, yMin, yMax);
  const count = labels.length;
  const X = (i: number) => PAD_L + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const Y = (v: number) => PAD_T + plotH - ((v - lo) / span) * plotH;

  const gridLines = [0, 0.5, 1].map((f) => {
    const y = PAD_T + plotH * f;
    const value = hi - span * f;
    return (
      <React.Fragment key={`g${f}`}>
        <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={colors.border} strokeWidth={1} />
        <SvgText
          x={PAD_L - 6}
          y={y + 4}
          fill={colors.textSecondary}
          fontSize={11}
          textAnchor="end"
        >
          {value.toFixed(1)}
          {unit}
        </SvgText>
      </React.Fragment>
    );
  });

  // X labels: first, middle and last only - the buckets are close together
  // and labelling every one of them is unreadable.
  const labelIndexes = count <= 2 ? [0, count - 1] : [0, Math.floor((count - 1) / 2), count - 1];

  // Markers are placed by TIME, not by index: the buckets are fixed-width,
  // so time maps linearly onto x and an event lands where it really happened.
  const t0 = xTimes?.[0];
  const t1 = xTimes?.[xTimes.length - 1];
  const markerX = (t: number): number | null => {
    if (t0 === undefined || t1 === undefined || t1 <= t0) return null;
    if (t < t0 || t > t1) return null;
    return PAD_L + ((t - t0) / (t1 - t0)) * plotW;
  };

  return (
    <View>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessibilityRole="image"
        accessibilityLabel={
          `Line chart over time: ${series
            .map((s) => `${s.label}, ${s.values.filter((v) => v !== null).length} readings`)
            .join('; ')}`
        }
      >
        {gridLines}
        {markers.map((m, i) => {
          const x = markerX(m.t);
          if (x === null) return null;
          return (
            <React.Fragment key={`m${i}`}>
              <Line
                x1={x}
                y1={PAD_T}
                x2={x}
                y2={PAD_T + plotH}
                stroke={m.color}
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />
              <Circle cx={x} cy={PAD_T + 4} r={3.2} fill={m.color} />
            </React.Fragment>
          );
        })}
        {series.map((s) => {
          // Segments come from the tested helper: a null ends the segment, and
          // every point keeps its own index (values repeat).
          const segments = buildSegments(s.values);
          return (
            <React.Fragment key={s.label}>
              {segments.map((seg, i) => {
                const d = seg
                  .map((p, j) => `${j ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`)
                  .join(' ');
                return (
                  <Path
                    key={`${s.label}-${i}`}
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <Circle key={`${s.label}-dot-${i}`} cx={X(i)} cy={Y(v)} r={2.6} fill={s.color} />
                )
              )}
            </React.Fragment>
          );
        })}
        {labelIndexes.map((i, n) => (
          <SvgText
            key={`x${i}`}
            x={X(i)}
            y={height - 6}
            fill={colors.textSecondary}
            fontSize={11}
            textAnchor={n === 0 ? 'start' : n === labelIndexes.length - 1 ? 'end' : 'middle'}
          >
            {labels[i] ?? ''}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 14 }]}>{s.label}</Text>
          </View>
        ))}
        {markers.map((m, i) => (
          <View key={`ml${i}`} style={styles.legendItem}>
            <View style={[styles.markerSwatch, { backgroundColor: m.color }]} />
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 14 }]}>
              {m.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 22, paddingHorizontal: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 4, borderRadius: 2 },
  markerSwatch: { width: 8, height: 8, borderRadius: 4 },
});
