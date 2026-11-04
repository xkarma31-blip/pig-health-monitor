/**
 * PigPulse — web Analytics (admin island).
 *
 * EVERY number on this screen is read from PocketBase. There is no synthetic
 * generator, no random seed and no placeholder series: when the database has
 * no readings in the selected window the screen says so instead of drawing a
 * plausible-looking curve.
 *
 * Read path (web): pbList() → /api/telemetry?collection=… → serverless bridge
 * → read-only proxy → PocketBase. The proxy caps one page at 100 rows, so a
 * window is read as fixed time buckets and every bucket contributes the mean
 * of the readings it actually contains.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useTheme, type ThemeColors, type ThemeTypography } from '../../theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';

import { ListGroup, Skeleton } from '../../components/primitives';
import { AuthBanner } from '../../components/shared/AuthBanner';
import { pbList } from '../../utils/pocketbase';

/** Number of fixed time buckets a window is split into. */
const BUCKETS = 8;
/** The thermal rig publishes under this device id. */
const THERMAL_DEVICE = 'pi-thermal-01';
/** The ESP32-S3 barn mic publishes under this device id. */
const MIC_DEVICE = 's3-mic-01';
/** Real sensor fields — the proxy's allowlist carries exactly these. */
const TELEMETRY_FIELDS =
  'deviceId,timestamp,center,temperature,ambient,hotspot,max,min,rms,peak,sr,mic';
const ALERT_FIELDS = 'severity,type,message,timestamp,pigId,deviceId';

const TIME_RANGES = [
  { label: '24H', value: 1 },
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
] as const;

type TimeRange = typeof TIME_RANGES[number]['value'];

interface Bucket {
  /** Bucket start, epoch seconds. */
  start: number;
  /** Bucket end, epoch seconds. */
  end: number;
  /** Exact number of telemetry rows for the device inside the bucket. */
  rows: number;
  /** Rows that carried a usable value for this metric. */
  used: number;
  /** Mean of the sampled usable readings — null when the bucket has none. */
  mean: number | null;
  /** Min / max of the sampled usable readings. */
  min: number | null;
  max: number | null;
  /** True when the read itself failed — the bucket is unknown, not empty. */
  failed: boolean;
}

interface AlertSummary {
  /** Rows actually fetched (≤ 100). */
  rows: number;
  /** Exact number of alerts matching the window. */
  total: number;
  critical: number;
  warning: number;
  other: number;
  latest: number | null;
  /** True when the alerts read failed — the window is unknown, not empty. */
  failed: boolean;
}

interface Loaded {
  thermal: Bucket[];
  sound: Bucket[];
  alerts: AlertSummary;
  /** How many reads failed, out of `reads`. A failed read is NOT an empty one. */
  failures: number;
  reads: number;
  /** First failure message, for the error card. */
  reason: string | null;
}

/** Reads issued per window: 8 thermal buckets + 1 alerts call + 8 sound buckets. */
const READS_PER_WINDOW = BUCKETS * 2 + 1;

const num = (row: Record<string, unknown>, key: string): number => {
  const v = Number(row[key]);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Scene temperature lives in `center` — the thermal bridge deliberately strips
 * `temperature`/`bodyTemp`, so a naive `temperature` read would report 0.0°.
 * A positive `temperature` is accepted as a fallback for other rigs.
 */
const sceneTempOf = (row: Record<string, unknown>): number | null => {
  const center = num(row, 'center');
  if (center > 0) return center;
  const temperature = num(row, 'temperature');
  return temperature > 0 ? temperature : null;
};

/** Raw PCM RMS from the barn mic. Zero means "no signal", not "silence". */
const soundRmsOf = (row: Record<string, unknown>): number | null => {
  const rms = num(row, 'rms');
  return rms > 0 ? rms : null;
};

/**
 * Read one device's window as fixed buckets. Each bucket is one query; the
 * per-page cap (100 rows) is why a bucket mean is always stated as a mean over
 * the readings it contains, never as the bucket's total.
 *
 * A failed query yields `failed: true` and NO rows — it must never look like a
 * successfully-read empty bucket, or a sleeping server would report a healthy
 * empty barn.
 */
async function fetchBuckets(
  deviceId: string,
  since: number,
  until: number,
  pick: (row: Record<string, unknown>) => number | null
): Promise<Bucket[]> {
  const span = Math.max(1, until - since);
  const width = span / BUCKETS;
  const jobs: Promise<Bucket>[] = [];

  for (let i = 0; i < BUCKETS; i++) {
    const start = Math.floor(since + i * width);
    const end = i === BUCKETS - 1 ? until : Math.floor(since + (i + 1) * width);
    const filter = `deviceId='${deviceId}'&&timestamp>=${start}&&timestamp<${end}`;
    jobs.push(
      pbList<Record<string, unknown>>('telemetry', {
        filter,
        sort: '-timestamp',
        perPage: 100,
        fields: TELEMETRY_FIELDS,
      })
        .then(({ items, totalItems }) => {
          const values: number[] = [];
          for (const row of items) {
            const v = pick(row);
            if (v !== null) values.push(v);
          }
          return {
            start,
            end,
            rows: Number.isFinite(totalItems) ? totalItems : items.length,
            used: values.length,
            mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
            min: values.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : null,
            failed: false,
          };
        })
        .catch(() => ({
          start,
          end,
          rows: 0,
          used: 0,
          mean: null,
          min: null,
          max: null,
          failed: true,
        }))
    );
  }
  return Promise.all(jobs);
}

async function loadWindow(range: TimeRange): Promise<Loaded> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - range * 86400;
  let failures = 0;
  let reason: string | null = null;
  const noteFailure = (e: unknown) => {
    failures += 1;
    if (!reason) reason = String((e as Error)?.message || e || 'read failed').slice(0, 160);
  };

  // Round 1: thermal buckets + the alert list (9 concurrent bridge calls).
  const [thermal, alerts] = await Promise.all([
    fetchBuckets(THERMAL_DEVICE, since, until, sceneTempOf),
    pbList<Record<string, unknown>>('alerts', {
      filter: `timestamp>=${since}`,
      sort: '-timestamp',
      perPage: 100,
      fields: ALERT_FIELDS,
    })
      .then(({ items, totalItems }) => {
        let critical = 0;
        let warning = 0;
        let other = 0;
        for (const alert of items) {
          const severity = String(alert.severity || '').toLowerCase();
          if (severity === 'critical') critical += 1;
          else if (severity === 'warning') warning += 1;
          else other += 1;
        }
        return {
          rows: items.length,
          total: Number.isFinite(totalItems) ? totalItems : items.length,
          critical,
          warning,
          other,
          latest: items[0] ? num(items[0], 'timestamp') || null : null,
          failed: false,
        };
      })
      .catch((e: unknown) => {
        noteFailure(e);
        return {
          rows: 0,
          total: 0,
          critical: 0,
          warning: 0,
          other: 0,
          latest: null,
          failed: true,
        };
      }),
  ]);
  failures += thermal.filter((b) => b.failed).length;
  const firstThermalFailure = thermal.find((b) => b.failed);
  if (firstThermalFailure && !reason) reason = 'thermal bucket read failed';

  // Round 2: sound buckets (8 concurrent bridge calls).
  const sound = await fetchBuckets(MIC_DEVICE, since, until, soundRmsOf);
  failures += sound.filter((b) => b.failed).length;
  if (!reason && sound.some((b) => b.failed)) reason = 'barn-mic bucket read failed';

  return { thermal, sound, alerts, failures, reads: READS_PER_WINDOW, reason };
}

const fmtClock = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDay = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });

const fmtStamp = (ts: number) =>
  `${fmtDay(ts)} ${fmtClock(ts)}`;

/** Weighted mean over the buckets that actually carry readings. */
function weightedMean(buckets: Bucket[]): { mean: number | null; sampled: number; rows: number } {
  let sum = 0;
  let weight = 0;
  let sampled = 0;
  let rows = 0;
  for (const b of buckets) {
    rows += b.rows;
    sampled += b.used;
    if (b.mean === null) continue;
    sum += b.mean * b.used;
    weight += b.used;
  }
  return { mean: weight > 0 ? sum / weight : null, sampled, rows };
}

function peakOf(buckets: Bucket[]): number | null {
  let peak: number | null = null;
  for (const b of buckets) {
    if (b.max === null) continue;
    if (peak === null || b.max > peak) peak = b.max;
  }
  return peak;
}

export default function AnalyticsScreen() {
  const user = useAuth();
  const { colors, spacing, typography } = useTheme();
  const styles = useAnalyticsStyles(colors);

  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);

  const run = useCallback(async (range: TimeRange, isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const loaded = await loadWindow(range);
      setData(loaded);
    } catch (e: any) {
      setError(String(e?.message || e || 'read failed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Inline the load so setState is not called synchronously inside the
      // effect body (react-hooks/set-state-in-effect).
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadWindow(timeRange);
        if (!cancelled) setData(loaded);
      } catch (e: unknown) {
        if (!cancelled) setError(String((e as Error)?.message || e || 'read failed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const windowLabel = timeRange === 1 ? 'last 24 hours' : `last ${timeRange} days`;

  const thermalFailed = data ? data.thermal.filter((b) => b.failed).length : 0;
  const soundFailed = data ? data.sound.filter((b) => b.failed).length : 0;
  const thermalEmpty = thermalFailed > 0
    ? `${thermalFailed} of ${BUCKETS} reads failed — unknown`
    : 'no readings in this window';
  const soundEmpty = soundFailed > 0
    ? `${soundFailed} of ${BUCKETS} reads failed — unknown`
    : 'no signal readings in this window';

  // A chart whose reads failed must not claim the window was empty — not even
  // when only SOME of its buckets failed, because the successful ones may be
  // empty for a reason we never saw.
  const chartEmpty = (failed: number, what: string) =>
    failed === BUCKETS
      ? `Could not read ${what} — all ${failed} reads failed (unknown, not empty)`
      : failed > 0
        ? `No ${what} in the reads that succeeded — ${failed} of ${BUCKETS} reads failed, so this window is incomplete`
        : `No ${what} in the ${windowLabel}`;

  const thermalStats = useMemo(
    () => (data ? weightedMean(data.thermal) : null),
    [data]
  );
  const soundStats = useMemo(
    () => (data ? weightedMean(data.sound) : null),
    [data]
  );
  const thermalPeak = useMemo(() => (data ? peakOf(data.thermal) : null), [data]);
  const soundPeak = useMemo(() => (data ? peakOf(data.sound) : null), [data]);

  const openLogin = () => router.push('/login');

  const tempFormat = (v: number) => `${v.toFixed(1)}°C`;
  const soundFormat = (v: number) => Math.round(v).toLocaleString();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {!user && (
          <AuthBanner
            title="Not authenticated"
            message="Log in to read live telemetry from PocketBase"
            buttonLabel="LOG IN"
            onPress={openLogin}
          />
        )}

        <View style={styles.header}>
          <Text style={[typography.h1, { color: colors.textPrimary }]}>Analytics</Text>
          <Text style={[typography.body, styles.subtitle]}>
            Real readings from PocketBase · {windowLabel} · no synthetic data
          </Text>
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeSelector}>
          {TIME_RANGES.map((range) => (
            <TouchableOpacity
              key={range.value}
              style={[
                styles.timeRangeButton,
                timeRange === range.value && styles.timeRangeButtonActive,
              ]}
              onPress={() => setTimeRange(range.value)}
              accessibilityRole="button"
              accessibilityLabel={`${range.label} time range`}
              accessibilityHint={`Shows real readings from the ${windowLabel}`}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: timeRange === range.value ? colors.background : colors.textPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                  },
                ]}
              >
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => run(timeRange, true)}
            accessibilityRole="button"
            accessibilityLabel="Refresh analytics"
            accessibilityHint="Re-reads the selected window from PocketBase"
          >
            <Text style={[typography.body, { color: colors.accent, fontWeight: '700', fontSize: 16 }]}>
              {refreshing ? '…' : 'REFRESH'}
            </Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={[styles.errorCard, { borderLeftColor: colors.error }]}>
            <Text style={[typography.body, { color: colors.error, fontWeight: '700', fontSize: 16 }]}>
              Could not read telemetry
            </Text>
            <Text style={[typography.bodySmall, styles.errorText]}>{error}</Text>
          </View>
        )}

        {/* A failed read is NOT an empty window. Say so, above the numbers. */}
        {!loading && data && data.failures > 0 && (
          <View style={[styles.errorCard, { borderLeftColor: colors.warning }]}>
            <Text style={[typography.body, { color: colors.warning, fontWeight: '700', fontSize: 16 }]}>
              {data.failures} of {data.reads} reads failed — these charts are incomplete
            </Text>
            <Text style={[typography.bodySmall, styles.errorText]}>
              A failed read is unknown, not zero. Nothing below is a full picture of the window.
              {data.reason ? ` First failure: ${data.reason}` : ''}
            </Text>
          </View>
        )}

        {/* Key Metrics Grid */}
        {loading ? (
          <View style={styles.metricsGrid}>
            <Skeleton rows={2} />
          </View>
        ) : data && thermalStats && soundStats ? (
          <>
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { borderLeftColor: colors.accent }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Avg scene temp</Text>
                <Text style={[typography.stat, { color: colors.accent }]}>
                  {thermalStats.mean === null ? '—' : tempFormat(thermalStats.mean)}
                </Text>
                <Text style={[typography.bodySmall, styles.metricNote]}>
                  {thermalStats.sampled > 0
                    ? `mean of ${thermalStats.sampled} sampled readings`
                    : thermalEmpty}
                </Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: colors.warning }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Peak scene temp</Text>
                <Text style={[typography.stat, { color: colors.warning }]}>
                  {thermalPeak === null ? '—' : tempFormat(thermalPeak)}
                </Text>
                <Text style={[typography.bodySmall, styles.metricNote]}>
                  {thermalStats.sampled > 0
                    ? `peak of ${thermalStats.sampled} sampled readings`
                    : thermalEmpty}
                </Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: colors.info }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Mean sound RMS</Text>
                <Text style={[typography.stat, { color: colors.info }]}>
                  {soundStats.mean === null ? '—' : soundFormat(soundStats.mean)}
                </Text>
                <Text style={[typography.bodySmall, styles.metricNote]}>
                  {soundStats.sampled > 0
                    ? `raw RMS, not dB · ${soundStats.sampled} sampled`
                    : soundEmpty}
                </Text>
              </View>
              <View style={[styles.metricCard, { borderLeftColor: colors.healthy }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Peak sound RMS</Text>
                <Text style={[typography.stat, { color: colors.healthy }]}>
                  {soundPeak === null ? '—' : soundFormat(soundPeak)}
                </Text>
                <Text style={[typography.bodySmall, styles.metricNote]}>
                  {soundStats.sampled > 0
                    ? `raw RMS, not dB · peak of ${soundStats.sampled}`
                    : soundEmpty}
                </Text>
              </View>
            </View>

            {/* Scene temperature */}
            <View style={styles.section}>
              <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.sm, fontSize: 18 }]}>
                Scene temperature
              </Text>
              <Text style={[typography.bodySmall, styles.sectionNote]}>
                Mean `center` per time bucket from the {THERMAL_DEVICE} thermal rig. Scene
                temperature, not pig body temperature.
              </Text>
              <MetricChart
                buckets={data.thermal}
                color={colors.accent}
                format={tempFormat}
                unit="°C"
                colors={colors}
                typography={typography}
                emptyLabel={chartEmpty(thermalFailed, 'thermal readings')}
              />
              <CoverageNote
                buckets={data.thermal}
                range={timeRange}
                colors={colors}
                typography={typography}
                label="thermal readings"
              />
              <BucketTable
                buckets={data.thermal}
                format={tempFormat}
                range={timeRange}
                colors={colors}
                typography={typography}
              />
            </View>

            {/* Sound */}
            <View style={styles.section}>
              <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.sm, fontSize: 18 }]}>
                Barn mic signal
              </Text>
              <Text style={[typography.bodySmall, styles.sectionNote]}>
                Mean `rms` per time bucket from the {MIC_DEVICE} barn mic. Raw RMS amplitude as
                stored by the mic bridge — not decibels, and not a 16-bit ceiling. Buckets without
                signal are shown empty, never as zero.
              </Text>
              <MetricChart
                buckets={data.sound}
                color={colors.info}
                format={soundFormat}
                unit=""
                colors={colors}
                typography={typography}
                emptyLabel={chartEmpty(soundFailed, 'barn-mic signal readings')}
              />
              <CoverageNote
                buckets={data.sound}
                range={timeRange}
                colors={colors}
                typography={typography}
                label="barn-mic readings"
              />
              <BucketTable
                buckets={data.sound}
                format={soundFormat}
                range={timeRange}
                colors={colors}
                typography={typography}
              />
            </View>

            {/* Alert Summary */}
            <View style={styles.section}>
              <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.sm, fontSize: 18 }]}>
                Alerts ({windowLabel})
              </Text>
              {data.alerts.failed ? (
                <View style={[styles.emptyCard, { borderLeftColor: colors.error }]}>
                  <Text style={[typography.body, { color: colors.error, fontWeight: '700', fontSize: 16 }]}>
                    Alert history could not be read
                  </Text>
                  <Text style={[typography.bodySmall, styles.sectionNote]}>
                    The alerts query failed, so the number of alerts in the {windowLabel} is unknown.
                    This is not the same as zero.
                  </Text>
                </View>
              ) : data.alerts.total === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '700', fontSize: 16 }]}>
                    No alerts recorded
                  </Text>
                  <Text style={[typography.bodySmall, styles.sectionNote]}>
                    The alerts collection has no rows in the {windowLabel}. This is the real count,
                    not a placeholder.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.alertSummaryGrid}>
                    <View style={[styles.metricCard, { borderLeftColor: colors.error }]}>
                      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Critical</Text>
                      <Text style={[typography.stat, { color: colors.error }]}>{data.alerts.critical}</Text>
                    </View>
                    <View style={[styles.metricCard, { borderLeftColor: colors.warning }]}>
                      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Warning</Text>
                      <Text style={[typography.stat, { color: colors.warning }]}>{data.alerts.warning}</Text>
                    </View>
                    <View style={[styles.metricCard, { borderLeftColor: colors.info }]}>
                      <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 16, letterSpacing: 0.6 }]}>Other</Text>
                      <Text style={[typography.stat, { color: colors.info }]}>{data.alerts.other}</Text>
                    </View>
                  </View>
                  <Text style={[typography.bodySmall, styles.sectionNote]}>
                    {data.alerts.total} alert{data.alerts.total === 1 ? '' : 's'} in the {windowLabel}.
                    {data.alerts.rows < data.alerts.total
                      ? ` Showing the ${data.alerts.rows} most recent of ${data.alerts.total}.`
                      : ''}
                    {data.alerts.latest
                      ? ` Most recent: ${fmtStamp(data.alerts.latest)}.`
                      : ''}
                  </Text>
                </>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Bar chart of the bucket means. Every bucket of the window is rendered — an
 * empty bucket keeps its slot so the horizontal spacing stays proportional to
 * real time — and the axis range is printed because the bars are scaled to the
 * data, not to zero.
 */
function MetricChart({
  buckets,
  color,
  format,
  unit,
  colors,
  typography,
  emptyLabel,
}: {
  buckets: Bucket[];
  color: string;
  format: (v: number) => string;
  unit: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  emptyLabel: string;
}) {
  const PLOT_HEIGHT = 132;
  const COLUMN_WIDTH = 92;
  const styles = useAnalyticsStyles(colors);

  const values = buckets
    .map((b) => b.mean)
    .filter((v): v is number => v !== null);
  const hasData = values.length > 0;

  if (!hasData) {
    return (
      <View style={styles.emptyChart}>
        <Text style={[typography.body, { color: colors.textSecondary, fontSize: 16, textAlign: 'center' }]}>
          {emptyLabel}
        </Text>
      </View>
    );
  }

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const spread = hi - lo;
  const axisBase = spread === 0 ? lo - 1 : lo - spread * 0.2;
  const axisTop = spread === 0 ? hi + 1 : hi + spread * 0.2;
  const axisSpan = axisTop - axisBase || 1;

  return (
    <View>
      <Text style={[typography.bodySmall, { color: colors.textSecondary, marginBottom: 8, fontSize: 16, lineHeight: 22 }]}>
        Axis {format(axisBase)} – {format(axisTop)}
        {unit ? ` ${unit}` : ''} · each bar is one time bucket
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          {buckets.map((b) => {
            const height =
              b.mean === null ? 0 : Math.max(6, ((b.mean - axisBase) / axisSpan) * PLOT_HEIGHT);
            return (
              <View key={b.start} style={{ width: COLUMN_WIDTH, alignItems: 'center' }}>
                <Text style={styles.barValue}>
                  {b.failed ? 'n/a' : b.mean === null ? '—' : format(b.mean)}
                </Text>
                <View
                  style={[
                    styles.plotColumn,
                    { height: PLOT_HEIGHT, backgroundColor: `${color}22` },
                    // A failed read is hatched-in-words, not silently blank.
                    b.failed && { borderWidth: 1, borderColor: colors.error, borderStyle: 'dashed' },
                  ]}
                >
                  {b.mean !== null && (
                    <View style={{ height, width: 34, backgroundColor: color, borderRadius: 6 }} />
                  )}
                </View>
                <Text style={styles.barLabel}>{b.failed ? 'failed' : fmtClock(b.start)}</Text>
                <Text style={styles.barSubLabel}>{b.failed ? 'read' : fmtDay(b.start)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Exact, non-rounded statement of what the chart is built from. */
function CoverageNote({
  buckets,
  range,
  colors,
  typography,
  label,
}: {
  buckets: Bucket[];
  range: TimeRange;
  colors: ThemeColors;
  typography: ThemeTypography;
  label: string;
}) {
  const styles = useAnalyticsStyles(colors);
  const stats = weightedMean(buckets);
  const withData = buckets.filter((b) => b.used > 0);
  const failed = buckets.filter((b) => b.failed).length;
  const windowLabel = range === 1 ? 'last 24 hours' : `last ${range} days`;

  // A failed read must never be reported as an empty window.
  if (stats.rows === 0) {
    return (
      <Text style={[typography.bodySmall, styles.coverageNote]}>
        {failed > 0
          ? `Could not read ${label} — ${failed} of ${BUCKETS} reads failed. The window is unknown, not empty.`
          : `0 ${label} in the ${windowLabel}.`}
      </Text>
    );
  }
  const covered = withData.length;
  // The real per-bucket sample is at most 100 rows; `stats.sampled` is a window
  // total, so quoting it as a per-bucket figure would overstate the sampling.
  const perBucket = Math.min(100, Math.max(...buckets.map((b) => b.used)));
  return (
    <Text style={[typography.bodySmall, styles.coverageNote]}>
      {stats.rows.toLocaleString()} {label} in the window · {covered} of {BUCKETS} buckets carry
      readings · each mean uses that bucket&apos;s most recent readings (max {perBucket} of its own
      rows)
      {failed > 0 ? ` · ${failed} of ${BUCKETS} reads failed, so this window is incomplete` : ''}.
    </Text>
  );
}

/** Every bucket as text — the exact numbers behind the chart. */
function BucketTable({
  buckets,
  format,
  range,
  colors,
  typography,
}: {
  buckets: Bucket[];
  format: (v: number) => string;
  range: TimeRange;
  colors: ThemeColors;
  typography: ThemeTypography;
}) {
  const { spacing: themeSpacing } = useTheme();
  const styles = useAnalyticsStyles(colors);
  // Failed buckets are listed as well: omitting them would imply the window was
  // fully read. Only a window with no data AND no failures has nothing to show.
  const withData = buckets.filter((b) => b.used > 0 || b.failed);
  if (!withData.length) return null;
  // A bucket wider than a day must print both dates — a clock-only range like
  // "02:59 AM–08:59 AM" would otherwise imply an 11-day bucket lasted 6 hours.
  const multiDay = (b: Bucket) => b.end - b.start > 86400;
  return (
    <View style={{ marginTop: themeSpacing.md }}>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6, fontSize: 16, letterSpacing: 0.6 }]}>
        Bucket detail
      </Text>
      <ListGroup>
        {withData.map((b) => (
          <View key={b.start} style={styles.tableRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '700', fontSize: 16 }]}>
                {multiDay(b) ? `${fmtStamp(b.start)} → ${fmtStamp(b.end)}` : range === 1 ? fmtClock(b.start) : fmtStamp(b.start)}
              </Text>
              <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16, lineHeight: 22 }]}>
                {b.failed
                  ? 'read failed — window unknown'
                  : `${b.used} sampled of ${b.rows.toLocaleString()} rows${
                      multiDay(b) ? '' : ` · ${fmtClock(b.start)}–${fmtClock(b.end)}`
                    }`}
              </Text>
            </View>
            <Text style={[typography.body, { color: b.failed ? colors.error : colors.textPrimary, fontWeight: '700', fontSize: 16 }]}>
              {b.failed ? 'n/a' : b.mean === null ? '—' : format(b.mean)}
            </Text>
          </View>
        ))}
      </ListGroup>
    </View>
  );
}

const useAnalyticsStyles = (colors: ThemeColors) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 },
    header: { marginBottom: 20 },
    subtitle: { color: colors.textSecondary, marginTop: 4, fontSize: 16 },
    timeRangeSelector: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
    timeRangeButton: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, minHeight: 44, justifyContent: 'center' },
    timeRangeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    refreshButton: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.accent, minHeight: 44, justifyContent: 'center' },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    metricCard: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4 },
    metricNote: { color: colors.textSecondary, marginTop: 4, fontSize: 16, lineHeight: 22 },
    section: { marginBottom: 28 },
    sectionNote: { color: colors.textSecondary, marginBottom: 10, fontSize: 16, lineHeight: 23 },
    coverageNote: { color: colors.textSecondary, marginTop: 10, fontSize: 16, lineHeight: 23 },
    errorCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, marginBottom: 20 },
    errorText: { color: colors.textSecondary, marginTop: 6, fontSize: 16, lineHeight: 22 },
    emptyCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: colors.border },
    emptyChart: { height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16 },
    alertSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
    barValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    barLabel: { fontSize: 16, color: colors.textSecondary, marginTop: 6 },
    barSubLabel: { fontSize: 16, color: colors.textSecondary },
    plotColumn: { justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', width: 44 },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  });
};
