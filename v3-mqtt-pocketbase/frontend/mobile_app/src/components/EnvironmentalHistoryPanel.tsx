/**
 * Environmental history panel (lane B3 contract, UI wiring).
 *
 * Real data only: rows come from the `telemetry` collection, are normalized
 * source-scoped by the B3 helpers, and are aggregated into buckets. A gap stays
 * a gap (mean null, never 0), unknown provenance is never promoted to valid,
 * and the numeric forecast stays unavailable because no evaluated model exists.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { pbList } from '../utils/pocketbase';
import { cacheGet, cacheSet } from '../utils/storage-cache';
import {
  ENVIRONMENTAL_FIELDS,
  aggregateBuckets,
  assessEnvironmentalReadiness,
  detectTimestampUnit,
  forecastEnvironmental,
  normalizeSeries,
  NO_MODEL_REASON,
  type BucketAggregate,
  type EnvironmentalField,
  type EnvironmentalSeries,
} from '../utils/environment-history';

const PERIODS = [
  { key: '24h', label: '24 h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];
type LoadState = 'loading' | 'ready' | 'error';

function fmt(n: number | null, digits = 1): string {
  return n === null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const FIELD_LABEL: Record<EnvironmentalField, string> = {
  ambient: 'Ambient',
  humidity: 'Humidity',
};

export function EnvironmentalHistoryPanel() {
  const { colors, spacing, radius, typography } = useTheme();
  const [field, setField] = useState<EnvironmentalField>('ambient');
  const [period, setPeriod] = useState<PeriodKey>('24h');
  const [state, setState] = useState<LoadState>('loading');
  const [series, setSeries] = useState<EnvironmentalSeries | null>(null);
  const [buckets, setBuckets] = useState<BucketAggregate | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey] = useState(0);

  const spec = ENVIRONMENTAL_FIELDS[field];
  const sourceOptions = spec.sources;
  const [source, setSource] = useState<string>(sourceOptions[0]?.source ?? '');

  // Keep the source valid when the field changes.
  useEffect(() => {
    if (!sourceOptions.some((s) => s.source === source)) {
      setSource(sourceOptions[0]?.source ?? '');
    }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [field, sourceOptions, source]);

  const load = useCallback(async () => {
    const end = Date.now();
    const start = end - (PERIODS.find((p) => p.key === period)?.ms ?? PERIODS[0].ms);
    setNow(end);

    const apply = (rows: Record<string, unknown>[]) => {
      const detected = detectTimestampUnit(rows[0]?.timestamp);
      const unit = detected === 'seconds' ? 'seconds' : 'milliseconds';
      const normalized = normalizeSeries(rows, {
        field,
        source,
        unit,
        now: end,
        measurementProvenance: 'unknown',
      });
      const aggregated = aggregateBuckets(normalized.samples, {
        start,
        end,
        buckets: 24,
        field,
        source,
      });
      setSeries(normalized);
      setBuckets(aggregated);
      setState('ready');
    };

    // Show the on-phone cache immediately, then replace it with live data.
    const hit = await cacheGet<Record<string, unknown>[]>('telemetry-history');
    if (hit && Array.isArray(hit.v)) apply(hit.v);

    try {
      const { items } = await pbList('telemetry', { sort: 'timestamp', perPage: 5000 });
      apply(items);
      void cacheSet('telemetry-history', items);
    } catch {
      if (hit && Array.isArray(hit.v)) {
        setState('ready');
      } else {
        setState('error');
      }
    }
  }, [field, period, source]);

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      setState('loading');
    }
    void load();
    return () => { mounted = false; };
  }, [load, reloadKey]);

  const readiness = useMemo(() => {
    if (!series) return null;
    const newest = series.coverage.lastMs ?? null;
    return assessEnvironmentalReadiness({
      sourceSupported: true,
      rowCount: series.coverage.rows,
      validCount: series.coverage.valid,
      requiredCoverage: 0.9,
      minValidSamples: 30,
      inputAgeMs: newest === null ? null : now - newest,
      maxInputAgeMs: 10 * 60 * 1000,
      horizonMinutes: 30,
    });
  }, [series, now]);

  const forecast = useMemo(() => {
    if (!series) return null;
    return forecastEnvironmental({
      capability: {
        sourceSupported: true,
        rowCount: series.coverage.rows,
        validCount: series.coverage.valid,
        requiredCoverage: 0.9,
        minValidSamples: 30,
        inputAgeMs: null,
        maxInputAgeMs: 10 * 60 * 1000,
        horizonMinutes: 30,
      },
      target: field,
      history: series.samples,
      cutoffMs: now,
      predictor: undefined,
    });
  }, [series, field, now]);

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Text
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accentSoft : colors.surface,
          borderColor: active ? colors.accent : colors.divider,
          borderRadius: radius.sm,
        },
      ]}
    >
      <Text style={[typography.bodySmall, { color: active ? colors.accent : colors.textSecondary, fontSize: 16, fontWeight: '600' }]}>
        {label}
      </Text>
    </Text>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 72 }}>
      <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Environmental trends</Text>
      <Text style={[typography.bodySmall, { color: colors.textSecondary, marginBottom: spacing.md, fontSize: 16 }]}>
        Stored {FIELD_LABEL[field].toLowerCase()} readings from the selected source. Gaps stay gaps — nothing is imputed.
      </Text>

      <View style={styles.row}>
        {sourceOptions.map((s) => chip(s.source, s.source === source, () => setSource(s.source), `src-${s.source}`))}
      </View>
      <View style={[styles.row, { marginTop: spacing.xs }]}>
        {chip('Ambient', field === 'ambient', () => setField('ambient'), 'f-ambient')}
        {chip('Humidity', field === 'humidity', () => setField('humidity'), 'f-humidity')}
      </View>
      <View style={[styles.row, { marginTop: spacing.xs }]}>
        {PERIODS.map((p) => chip(p.label, p.key === period, () => setPeriod(p.key), `p-${p.key}`))}
      </View>

      {state === 'loading' ? (
        <View style={{ marginTop: spacing.lg }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : state === 'error' ? (
        <Text style={[typography.body, { color: colors.alert, marginTop: spacing.lg, fontSize: 16 }]}>
          Couldn't load environmental history. Check the connection and try again.
        </Text>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md, marginTop: spacing.md }]}>
            <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Readiness</Text>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
              {readiness ? readiness.status.replace(/-/g, ' ') : '—'}
              {readiness && 'reason' in readiness ? ` — ${readiness.reason}` : ''}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.xs, fontSize: 16 }]}>
              {series ? `${series.coverage.valid} valid of ${series.coverage.accepted} accepted (${series.coverage.rows} rows)` : '—'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md, marginTop: spacing.md }]}>
            <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Trend</Text>
            {buckets && buckets.buckets.length > 0 ? (
              buckets.buckets.map((b) => (
                <View key={b.start} style={styles.bucketRow}>
                  <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>{timeLabel(b.start)}</Text>
                  <Text style={[typography.bodySmall, { color: b.mean === null ? colors.textMuted : colors.textPrimary, fontSize: 16 }]}>
                    {b.mean === null ? 'gap' : `${fmt(b.mean)} ${spec.unit}`}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>No samples in this window.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md, marginTop: spacing.md }]}>
            <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Prediction</Text>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
              {forecast && !forecast.available ? NO_MODEL_REASON : 'Unavailable in this build.'}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, minHeight: 44, justifyContent: 'center' },
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth },
  bucketRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
});