import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Platform, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { ThermalLiveView } from './ThermalLiveView';
import { useBreakpoint } from '../hooks/useBreakpoint';
import type { PiThermalSnapshot } from '../hooks/usePiThermal';
import { usePiCctv } from '../hooks/usePiCctv';
import { ironRgb } from '../utils/thermal-palette';
import { telemetryTime } from '../utils/telemetry-time';
import { fetchPiAudioChunk } from '../utils/pi-thermal';

/**
 * LiveThermalPanel — the shared live barn view (the Pi console's data, in the
 * app theme). Used by the Live tab and the full-screen /thermal route.
 *
 * Four honest states — a simulation is never dressed as live data:
 *   LIVE        console frames arriving → real frame + markers + stats
 *   LIVE STATS  console unreachable, fresh PocketBase row → real numbers,
 *               image area states "camera frames unavailable"
 *   LAST KNOWN  only a stale PocketBase row → real numbers, age-stamped
 *   OFFLINE     nothing reachable → no imagery at all; guidance + auto-retry
 */

const fmtC = (v: number | undefined | null) =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)}°C` : '—';

function agoLabel(ts: unknown, now: number): string {
  const t = telemetryTime(ts);
  if (!Number.isFinite(t)) return 'unknown';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

type Chip = { text: string; fg: string; bg: string };

/** Header subtitle for the current data state (shared by both screens). */
export function piSubtitle(pi: PiThermalSnapshot): string {
  const liveFrame = pi.live && pi.frame;
  const pb = pi.pbStats;
  if (liveFrame) return 'Live barn thermal — pi-thermal-01';
  if (pi.pbFresh && pb) return 'Live readings — camera frames unavailable';
  if (pb) return `No live frames — last reading ${agoLabel(pb.timestamp, pi.now)}`;
  return 'No live data — barn offline';
}

function StatCard({ label, value, sub, chip }: { label: string; value: string; sub?: string; chip?: Chip }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md },
      ]}
    >
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[typography.stat, { color: colors.textPrimary, fontSize: 22, marginTop: 2 }]}>{value}</Text>
      {sub ? (
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 12 }]}>{sub}</Text>
      ) : null}
      {chip ? (
        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: 6,
            backgroundColor: chip.bg,
            borderRadius: radius.pill,
            paddingHorizontal: 9,
            paddingVertical: 3,
          }}
        >
          <Text style={[typography.label, { color: chip.fg }]}>{chip.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LegendBar({ min, max }: { min: number; max: number }) {
  const { colors, spacing, radius, typography } = useTheme();
  const SEGMENTS = 32;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, width: '100%', maxWidth: 720 }}>
      <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 11, marginRight: 8 }]}>
        {min.toFixed(1)}°C
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden' }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const [r, g, b] = ironRgb(i / (SEGMENTS - 1));
          return <View key={i} style={{ flex: 1, backgroundColor: `rgb(${r},${g},${b})` }} />;
        })}
      </View>
      <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 11, marginLeft: 8 }]}>
        {max.toFixed(1)}°C
      </Text>
    </View>
  );
}

/**
 * Barn-mic listen/mute control. Audio is the ESP32-S3 mic — a DIFFERENT source
 * from the camera's own track (kept separate on purpose). Web playback (the
 * browser app — also how phones see it): 3-second WAV chunks played back to
 * back. Native playback lands with the APK pass.
 */
function BarnMicToggle({ base, healthy }: { base: string | null; healthy: boolean }) {
  const { colors, spacing, radius, typography } = useTheme();
  const [on, setOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setOn(false);
    setPlaying(false);
  };

  useEffect(() => () => stopRef.current?.(), []);

  const start = () => {
    if (!base || !healthy || Platform.OS !== 'web') return;
    let cancelled = false;
    let current: HTMLAudioElement | null = null;
    const loop = async () => {
      while (!cancelled) {
        const url = await fetchPiAudioChunk(base, 3);
        if (cancelled) {
          if (url) {
            try {
              URL.revokeObjectURL(url);
            } catch {
              /* ignore */
            }
          }
          return;
        }
        if (!url) {
          setPlaying(false);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        setPlaying(true);
        await new Promise<void>((resolve) => {
          try {
            current = new Audio(url);
            current.onended = () => resolve();
            current.onerror = () => resolve();
            void current.play().catch(() => resolve());
          } catch {
            resolve();
          }
        });
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
    stopRef.current = () => {
      cancelled = true;
      try {
        current?.pause();
      } catch {
        /* ignore */
      }
    };
    setOn(true);
    void loop();
  };

  const disabled = !healthy || Platform.OS !== 'web';
  const sub = !healthy
    ? 'No audio — mic stream stale'
    : Platform.OS !== 'web'
      ? 'Playback lands with the APK pass'
      : on
        ? playing
          ? 'Playing…'
          : 'Starting…'
        : 'Muted — tap to listen';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]}>Barn mic (ESP32-S3)</Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 4, fontSize: 12 }]}>{sub}</Text>
      </View>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => (on ? stop() : start())}
        accessibilityRole="button"
        accessibilityLabel="Toggle barn mic audio"
        accessibilityState={{ disabled, selected: on }}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          minHeight: 44,
          borderRadius: radius.md,
          backgroundColor: on ? colors.accent : colors.surfaceVariant,
          opacity: disabled ? 0.55 : 1,
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.body, { color: on ? colors.onAccent : colors.textPrimary, fontWeight: '600' }]}>
          {on ? 'Mute' : 'Listen'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function LiveThermalPanel({ pi }: { pi: PiThermalSnapshot }) {
  const { colors, spacing, radius, typography } = useTheme();
  const tier = useBreakpoint();
  const isDesktop = tier === 'expanded';

  const liveFrame = pi.live && pi.frame ? pi.frame : null;
  const pb = pi.pbStats;
  const pbMode = !liveFrame && pi.pbFresh && !!pb;
  const staleStats = !liveFrame && !pbMode && !!pb;
  const statsLive = !!liveFrame || !!pb || false;

  const viewSize = isDesktop ? 720 : tier === 'medium' ? 480 : 340;
  const canvasHeight = Math.round(viewSize * 0.75);

  const chipFor = (verdict: string | undefined): Chip => {
    const v = (verdict || '').toUpperCase();
    if (/ALERT|CRITICAL|HIGH/.test(v)) return { text: verdict || v, fg: colors.alert, bg: colors.alertSoft };
    if (/OUT_OF_BAND|WATCH|ELEVATED|WARN/.test(v)) return { text: verdict || v, fg: colors.watch, bg: colors.watchSoft };
    if (/NORMAL|OK|HEALTHY/.test(v)) return { text: verdict || v, fg: colors.healthy, bg: colors.healthySoft };
    return { text: verdict || 'UNKNOWN', fg: colors.info, bg: colors.infoSoft };
  };

  const sourceChip: Chip = liveFrame
    ? { text: '● LIVE — pi-thermal-01 · MLX90640 32×24', fg: colors.healthy, bg: colors.healthySoft }
    : pbMode
      ? { text: '● LIVE STATS — camera frames unavailable', fg: colors.watch, bg: colors.watchSoft }
      : staleStats
        ? { text: `● OFFLINE — last reading ${agoLabel(pb?.timestamp, pi.now)}`, fg: colors.watch, bg: colors.watchSoft }
        : { text: '● OFFLINE — barn unreachable', fg: colors.textSecondary, bg: colors.surfaceVariant };

  const center = liveFrame ? liveFrame.center : pb?.bodyTemp;
  const min = liveFrame ? liveFrame.min : pb?.min;
  const max = liveFrame ? liveFrame.max : pb?.max;
  const avg = liveFrame ? liveFrame.avg : pb?.avg;
  const amb = liveFrame ? liveFrame.ambient : pb?.ambient;
  const verdict = liveFrame ? liveFrame.verdict : pb?.verdict;

  const ambient = pi.ambient;
  const esp = pi.esp;
  const cctv = usePiCctv(pi.base);

  // ── Stage: real frame, or an honest placeholder. Never a fake image. ──
  const stageBlock = (
    <View style={[styles.stage, isDesktop && styles.stageDesktop]}>
      <View style={[styles.sourceBadge, { backgroundColor: sourceChip.bg, borderColor: colors.divider }]}>
        <Text style={[typography.label, { color: sourceChip.fg }]}>{sourceChip.text}</Text>
      </View>
      {liveFrame ? (
        <>
          <ThermalLiveView liveFrame={liveFrame} width={viewSize} height={canvasHeight} isFullscreen />
          <LegendBar min={liveFrame.min} max={liveFrame.max} />
        </>
      ) : (
        <View
          style={[
            styles.placeholderCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.divider,
              borderRadius: radius.lg,
              padding: spacing.xl,
              width: viewSize,
              minHeight: Math.round(canvasHeight * 0.55),
            },
          ]}
        >
          <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 16, textAlign: 'center' }]}>
            {pb ? 'Camera frames unavailable' : 'Barn offline — no live data'}
          </Text>
          <Text
            style={[typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }]}
          >
            {pb
              ? 'Live thermal frames travel over the barn network (Pi console). Readings below are the latest received.'
              : 'No frames from the Pi console and no recent readings. Check the PigPulse box power and your connection — this screen retries automatically.'}
          </Text>
          {staleStats && pb ? (
            <Text style={[typography.bodySmall, { color: colors.textMuted, textAlign: 'center', marginTop: spacing.md }]}>
              {`Last known · ${agoLabel(pb.timestamp, pi.now)} · center ${fmtC(center)} · max ${fmtC(max)}`}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );

  const statsBlock = statsLive ? (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        {liveFrame
          ? `LIVE READINGS — ${(liveFrame.fps ?? 0).toFixed(1)} FPS · FRAME ${liveFrame.frame ?? '—'}`
          : pbMode
            ? 'LATEST READINGS — POCKETBASE'
            : `LAST KNOWN READINGS — ${agoLabel(pb?.timestamp, pi.now)}`}
      </Text>
      <View style={styles.grid}>
        <StatCard label="Center (pig body)" value={fmtC(center)} chip={chipFor(verdict)} />
        <StatCard
          label="Minimum"
          value={fmtC(min)}
          sub={liveFrame ? `x=${liveFrame.minX}, y=${liveFrame.minY}` : undefined}
        />
        <StatCard
          label="Maximum"
          value={fmtC(max)}
          sub={liveFrame ? `x=${liveFrame.maxX}, y=${liveFrame.maxY}` : undefined}
        />
        <StatCard label="Average" value={fmtC(avg)} />
        <StatCard label="Ambient (MLX)" value={fmtC(amb)} />
        {!liveFrame && pb?.hotspot !== undefined ? <StatCard label="Hotspot" value={fmtC(pb.hotspot)} /> : null}
      </View>
    </View>
  ) : null;

  const ambientBlock = ambient ? (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        BARN AMBIENT — SHT45 (ESP32-S3)
      </Text>
      <View
        style={[
          styles.wideCard,
          { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.stat, { color: colors.textPrimary, fontSize: 22 }]}>
              {fmtC(ambient.temperature)}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>BARN TEMP</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.stat, { color: colors.textPrimary, fontSize: 22 }]}>
              {typeof ambient.humidity === 'number' ? `${ambient.humidity.toFixed(1)}%` : '—'}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>HUMIDITY</Text>
          </View>
        </View>
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 }]}>
          {`${ambient.state ?? 'unknown'} · last ambient ${
            ambient.ageS != null ? Math.max(0, ambient.ageS).toFixed(0) : '—'
          }s ago · ${ambient.mqttConnected ? 'MQTT ok' : 'MQTT down'}`}
        </Text>
      </View>
    </View>
  ) : null;

  const micBlock = esp ? (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        MIC — ESP32-S3 BARN MIC
      </Text>
      <View
        style={[
          styles.wideCard,
          { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]}>
          {esp.connected
            ? 'Streaming'
            : esp.socket
              ? esp.stale
                ? 'Socket open — no data (stale)'
                : 'Socket open — waiting'
              : 'Disconnected'}
        </Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 }]}>
          {`${esp.rate ?? '—'} Hz · ${esp.channels ?? '—'} ch · peer ${esp.peer ?? '—'}`}
        </Text>
        {typeof esp.nonzeroPct === 'number' ? (
          <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 12 }]}>
            {`signal ${esp.nonzeroPct.toFixed(1)}% nonzero`}
          </Text>
        ) : null}
      </View>
    </View>
  ) : null;

  const cctvBlock = (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        CCTV — TAPO CAMERA
      </Text>
      <View
        style={[
          styles.wideCard,
          { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        {cctv.frameUrl ? (
          <Image
            source={{ uri: cctv.frameUrl }}
            style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.bg }}
            resizeMode="cover"
            accessibilityLabel="CCTV camera frame"
          />
        ) : (
          <View
            style={{
              width: '100%',
              aspectRatio: 16 / 9,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg,
              padding: spacing.md,
            }}
          >
            <Text style={[typography.bodySmall, { color: colors.textSecondary, textAlign: 'center' }]}>
              {pi.base
                ? 'Waiting for a camera frame…'
                : 'CCTV shows here when the companion bridge is reachable.'}
            </Text>
          </View>
        )}
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 }]}>
          {cctv.live && cctv.at
            ? `Live snapshot — updated ${Math.max(0, Math.round((cctv.now - cctv.at) / 1000))}s ago`
            : 'No recent frame from the camera'}
        </Text>
      </View>
    </View>
  );

  const soundBlock = (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>SOUND</Text>
      <View
        style={[
          styles.wideCard,
          { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <BarnMicToggle base={pi.base} healthy={!!esp && esp.socket && !esp.stale} />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.md }} />
        <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]}>Camera sound (Tapo)</Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 4, fontSize: 12 }]}>
          A separate track from the barn mic — not wired yet (needs a transcoder on the barn side).
        </Text>
      </View>
    </View>
  );

  // Two columns on desktop only when there is side content to show; otherwise
  // a centered single column — never a lopsided empty half.
  const useTwoColumns = isDesktop && !!(statsBlock || ambientBlock || micBlock || cctvBlock || soundBlock);

  if (useTwoColumns) {
    return (
      <View style={[styles.desktopRow, { paddingHorizontal: spacing.xl }]}>
        <View style={styles.desktopMain}>{stageBlock}</View>
        <View style={[styles.desktopSide, { borderColor: colors.divider }]}>
          {statsBlock}
          {ambientBlock}
          {micBlock}
          {cctvBlock}
          {soundBlock}
        </View>
      </View>
    );
  }

  return (
    <>
      {stageBlock}
      {statsBlock}
      {ambientBlock}
      {micBlock}
      {cctvBlock}
      {soundBlock}
    </>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  stageDesktop: { paddingTop: 24, paddingBottom: 0, paddingHorizontal: 0 },
  desktopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, marginTop: 16 },
  desktopMain: { flex: 1.4, alignItems: 'center' },
  desktopSide: { flex: 1, maxWidth: 480, paddingTop: 46 },
  sourceBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  placeholderCard: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { flexGrow: 1, flexBasis: '46%', minWidth: 150, borderWidth: StyleSheet.hairlineWidth },
  wideCard: { borderWidth: StyleSheet.hairlineWidth },
});
