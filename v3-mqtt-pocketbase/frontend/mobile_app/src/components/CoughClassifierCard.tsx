/**
 * PigPulse — on-device cough classifier status (READ ONLY).
 *
 * The classifier is pigpulse-cough on the Pi (PANNs Cnn14_16k + logistic head,
 * :8096, proxied through the thermal console at /cough/*). It scores audio only
 * after the Pi's audio gate sees clean mic signal, so a missing mic must read
 * as STANDBY — never as a cough rate of zero. Every number shown here comes
 * from the classifier's own /api/status; a failed read says "unreachable".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { fetchPiJson, resolvePiBase } from '../utils/pi-thermal';

interface CoughAggregate {
  window_s?: number;
  windows?: number;
  cough_windows?: number;
  rate_pct?: number | null;
  mean_p?: number | null;
  verdict?: string;
  why?: string;
}

interface CoughStatus {
  ok?: boolean;
  server_ts?: number;
  enabled?: boolean;
  audio?: { connected?: boolean; last_chunk_age_s?: number | null; error?: string | null };
  aggregate?: CoughAggregate;
  model?: { name?: string };
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'off' }
  | { kind: 'standby'; model?: string }
  | {
      kind: 'live';
      verdict: string;
      rate: string;
      mean: string;
      windows: number;
      why: string;
      ageS: number;
      stale: boolean;
      model?: string;
    };

function readState(s: CoughStatus | null): ViewState {
  // Distinguish three truths: service down (OFFLINE), service up but gated /
  // no audio (STANDBY), and actively scoring (LIVE). A missing mic must never
  // read as a cough rate of zero.
  if (!s || s.ok !== true) return { kind: 'unreachable' };
  if (s.enabled === false) return { kind: 'off' };
  const model = s.model?.name;
  const a = s.aggregate;
  const audioUp = s.audio?.connected === true;
  const ratePct = a && typeof a.rate_pct === 'number' ? a.rate_pct : null;
  const windows = a && typeof a.windows === 'number' ? a.windows : 0;
  const hasScores = audioUp && ratePct !== null && windows > 0;
  if (!hasScores || ratePct === null) return { kind: 'standby', model };
  const ageS =
    typeof s.server_ts === 'number'
      ? Math.max(0, Math.round(Date.now() / 1000 - s.server_ts))
      : -1;
  // Clock-skew guard: if the Pi clock is off by more than 5 min, the age is
  // meaningless — report it as unknown rather than a huge "stale" number.
  const reliableAge = ageS >= 0 && ageS < 300;
  return {
    kind: 'live',
    verdict: a?.verdict || 'NO DATA',
    rate: `${ratePct.toFixed(1)}%`,
    mean: typeof a?.mean_p === 'number' ? a.mean_p.toFixed(3) : '—',
    windows,
    why: a?.why || '',
    ageS,
    stale: reliableAge && ageS > 120,
    model,
  };
}

export default function CoughClassifierCard() {
  const { colors, typography, spacing, radius } = useTheme();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    const base = await resolvePiBase();
    if (!base) {
      setState({ kind: 'unreachable' });
      return;
    }
    setState(readState(await fetchPiJson<CoughStatus>(base, '/cough/api/status', 6000)));
  }, []);

  useEffect(() => {
    let alive = true;
    void refresh();
    const timer = setInterval(() => {
      if (alive) void refresh();
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const headline =
    state.kind === 'loading'
      ? 'READING…'
      : state.kind === 'unreachable'
        ? 'OFFLINE — CLASSIFIER DOWN'
        : state.kind === 'off'
          ? 'CLASSIFICATION OFF'
          : state.kind === 'standby'
            ? 'STANDBY — NO MIC AUDIO'
            : state.stale
              ? `${state.verdict} — STALE`
              : state.verdict;

  const detail =
    state.kind === 'loading'
      ? 'Reading the Pi classifier status.'
      : state.kind === 'unreachable'
        ? 'No answer from the classifier service. It is stopped or unreachable — not a cough count.'
        : state.kind === 'off'
          ? 'The classifier is running but classification is switched off.'
          : state.kind === 'standby'
            ? `Classifier is up but waiting for clean mic audio. Nothing is being scored, so no cough rate is shown.${state.model ? ` Model: ${state.model}.` : ''}`
            : `${state.rate} of scored windows · mean p ${state.mean} · ${state.windows} windows in ${state.why.replace(/^.*?last 60 s/, 'the last 60 s') || 'the last 60 s'}${
                state.ageS >= 0 ? ` · read ${state.ageS}s ago` : ''
              }`;

  const color =
    state.kind === 'live' && !state.stale && state.verdict === 'HIGH'
      ? colors.error
      : state.kind === 'live' && !state.stale
        ? colors.info
        : state.kind === 'unreachable' || state.kind === 'off'
          ? colors.error
          : colors.textMuted;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md },
      ]}
      accessibilityLabel="Acoustic cough classifier status"
    >
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        AI CLASSIFIER — COUGH (PANNs CNN14)
      </Text>
      <Text style={[typography.h2, { color, fontSize: 17 }]}>{headline}</Text>
      <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.sm, fontSize: 13 }]}>
        {detail}
      </Text>
      <TouchableOpacity
        onPress={refresh}
        accessibilityRole="button"
        accessibilityLabel="Refresh classifier status"
        accessibilityHint="Reads the on-device classifier status from the Pi again"
        style={[styles.refresh, { minHeight: 44, justifyContent: 'center' }]}
      >
        <Text style={[typography.bodySmall, { color: colors.info, fontWeight: '700', fontSize: 14 }]}>
          REFRESH
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, marginTop: 12 },
  refresh: { alignSelf: 'flex-start', paddingHorizontal: 12, marginTop: 12 },
});
