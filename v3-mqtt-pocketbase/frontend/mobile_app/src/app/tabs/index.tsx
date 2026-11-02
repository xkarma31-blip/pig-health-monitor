import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, type Status } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { useDevices } from '../../hooks/useDevices';
import { usePocketbaseRealtime, type TelemetryFrame } from '../../hooks/usePocketbaseRealtime';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  LogoMark,
  ListGroup,
  ListRow,
  EmptyState,
  AlertIcon,
  ChevronRightIcon,
  RosterIcon,
  WaveformIcon,
} from '../../components/primitives';
import {
  AudioLevelMeter,
  LinkChip,
  LiveCamera,
  stage,
  monitorText,
  FONT_FLOOR,
} from '../../components/monitor';
import {
  cadenceFor,
  friendlyAge,
  linkState,
  pickDeviceId,
  piBaseFromPbUrl,
  piEndpoints,
} from '../../utils/live-source';
import { loadFarmerSetup } from '../../utils/setupStore';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

/** Device roles on the wire. See utils/live-source.ts for provenance. */
const ESP_ID = 's3-mic-01';
const THERMAL_ID = 'pi-thermal-01';

/**
 * Camera state is tri-state on purpose: 'connecting' means we have NOT seen a
 * decoded frame yet. Painting that green is how a certificate failure gets
 * presented as a working feed.
 */
type CameraState = 'connecting' | 'live' | 'failed';

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Body temperature for the Pi node: `bodyTemp` (centre), NOT `temperature` (pen average). */
function bodyReading(frame?: TelemetryFrame): number | undefined {
  if (!frame) return undefined;
  return num(frame.bodyTemp) ?? num(frame.center);
}

function verdictStatus(verdict?: unknown): Status {
  const v = String(verdict || '').toUpperCase();
  if (v.includes('HYPERTHERM') || v.includes('CRITICAL') || v.includes('FEVER')) return 'alert';
  if (v.includes('ELEVAT') || v.includes('WATCH')) return 'watch';
  if (!v || v === 'UNKNOWN') return 'neutral';
  return 'healthy';
}

export default function MonitorScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  useAuth();
  const tier = useBreakpoint();

  const { telemetry, deviceIds, connectionStatus, lastError, reconnect } = usePocketbaseRealtime();
  const { devices } = useDevices();

  const [piBase, setPiBase] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cameraState, setCameraState] = useState<CameraState>('connecting');
  const [cameraKey, setCameraKey] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing this on unmount matters: setState after unmount is a warning on
  // web and a no-op-plus-leak on native.
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // Freshness labels must age even when no new frame arrives — otherwise a
  // dead node keeps showing "just now".
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // The Pi's thermal service shares the PocketBase host (PB :8090, thermal :8080).
  useEffect(() => {
    let alive = true;
    loadFarmerSetup()
      .then((setup) => {
        if (alive) setPiBase(piBaseFromPbUrl(setup.pbUrl));
      })
      .catch(() => {
        if (alive) setPiBase(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const espId = pickDeviceId(deviceIds, ESP_ID, /mic|esp|s3/i);
  const thermalId = pickDeviceId(deviceIds, THERMAL_ID, /thermal|pi-/i);

  const espFrame = espId ? telemetry[espId] : undefined;
  const thermalFrame = thermalId ? telemetry[thermalId] : undefined;

  // The ESP has no status topic; if its retained LWT says mic:false it is down,
  // regardless of how recent the last (pre-mortem) telemetry row looks.
  const espLwt = espFrame?.mic === false;
  const espLastSeen = espFrame?.timestamp;
  const espState = espLwt
    ? 'offline'
    : linkState(espLastSeen, now, cadenceFor(ESP_ID));

  const thermalDevice = devices.find((d) => d.deviceId === thermalId);
  const thermalOnline = thermalDevice?.online;
  const thermalState = thermalOnline === false
    ? 'offline'
    : linkState(
        thermalFrame?.timestamp ?? thermalDevice?.lastSeen,
        now,
        cadenceFor(THERMAL_ID),
      );

  const cameraUrl = useMemo(() => (piBase ? piEndpoints(piBase) : null), [piBase]);
  const cameraDot =
    cameraState === 'live' ? stage.live : cameraState === 'failed' ? stage.offline : stage.idle;
  const cameraLabel =
    cameraState === 'live' ? 'live' : cameraState === 'failed' ? 'offline' : 'connecting';

  const thermalValue = bodyReading(thermalFrame);
  const thermalVerdict = thermalFrame?.verdict ?? thermalFrame?.status;
  const thermalStatus = verdictStatus(thermalVerdict);

  const espAirTemp = num(espFrame?.temperature);
  const espHumidity = num(espFrame?.humidity);

  const isOnline = connectionStatus === 'connected' || connectionStatus === 'connecting';

  const deviceRows = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      subtitle: string;
      value: string;
      status: Status;
    }> = [];

    if (thermalId) {
      rows.push({
        id: thermalId,
        title: 'Thermal node',
        subtitle: `${thermalId} · ${friendlyAge(thermalFrame?.timestamp, now)}`,
        value: thermalValue !== undefined ? `${thermalValue.toFixed(1)}°` : '—',
        status: thermalStatus,
      });
    }
    if (espId) {
      rows.push({
        id: espId,
        title: 'Barn mic',
        subtitle: `${espId} · ${friendlyAge(espLastSeen, now)}`,
        value: espState === 'live' ? 'live' : espState,
        status: espState === 'live' ? 'healthy' : espState === 'unknown' ? 'neutral' : 'alert',
      });
    }
    for (const d of devices) {
      if (d.deviceId === thermalId) continue;
      rows.push({
        id: d.deviceId,
        title: d.name || d.deviceId,
        subtitle: `${d.deviceId} · ${friendlyAge(d.lastSeen, now)}`,
        value: d.status || '—',
        status: d.status === 'offline' ? 'alert' : d.status === 'online' ? 'healthy' : 'neutral',
      });
    }
    return rows;
  }, [devices, espId, espLastSeen, espState, now, thermalFrame?.timestamp, thermalId, thermalStatus, thermalValue]);

  const onRefresh = () => {
    setRefreshing(true);
    setCameraState('connecting');
    setCameraKey((k) => k + 1);
    reconnect();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshing(false), 1200);
  };

  const openCamera = () => {
    playSound('tap');
    haptic('light');
    router.push('/camera');
  };

  const openResearch = () => {
    playSound('tap');
    haptic('light');
    router.push('/research');
  };

  const contentMax = tier === 'expanded' ? 1180 : tier === 'medium' ? 760 : undefined;
  const tileColumns = tier === 'expanded' ? 3 : tier === 'medium' ? 2 : 1;

  const cameraPlaceholder = (
    <View style={[styles.cameraPlaceholder, { backgroundColor: stage.deep }]}>
      <Text style={[monitorText.h2, { color: stage.ink, textAlign: 'center' }]}>
        {piBase ? 'Camera not reachable' : 'No Pi address yet'}
      </Text>
      <Text style={[monitorText.body, { color: stage.inkDim, textAlign: 'center', marginTop: 8 }]}>
        {piBase
          ? 'The Pi serves HTTPS with a self-signed certificate. Open the Pi console once and accept it, then retry.'
          : 'Finish the setup wizard so the app knows where the Pi lives (PocketBase host → thermal :8080).'}
      </Text>
      <TouchableOpacity
        onPress={() => {
          playSound('tap');
          haptic('light');
          setCameraState('connecting');
          setCameraKey((k) => k + 1);
        }}
        style={[styles.retry, { borderColor: stage.live, borderRadius: radius.md }]}
        accessibilityRole="button"
        accessibilityLabel="Retry the live camera"
      >
        <Text style={[monitorText.label, { color: stage.live }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg, flex: 1 }}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: spacing.xxl + 60 },
        contentMax ? { width: '100%', maxWidth: contentMax, alignSelf: 'center' } : null,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.brandRow}>
            <LogoMark />
            <Text style={[typography.h1, { marginLeft: 9, color: colors.textPrimary }]}>
              <Text style={{ color: colors.textPrimary }}>Pig</Text>
              <Text style={{ color: colors.accent }}>pulse</Text>
            </Text>
          </View>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4, fontSize: 16 }]}>
            {connectionStatus === 'stale'
              ? 'Stored readings · waiting for fresh sensor data'
              : connectionStatus === 'error'
                ? 'Connection unavailable · showing last known readings'
                : 'Live monitor · feeds, thermal, barn audio'
                  + (deviceIds.length > 0 ? ` · ${deviceIds.length} node${deviceIds.length === 1 ? '' : 's'}` : '')}
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            {
              backgroundColor:
                connectionStatus === 'stale'
                  ? colors.watchSoft
                  : isOnline
                    ? colors.healthySoft
                    : colors.alertSoft,
              borderRadius: radius.pill,
            },
          ]}
        >
          <Text
            style={[
              typography.label,
              {
                color:
                  connectionStatus === 'stale'
                    ? colors.watch
                    : isOnline
                      ? colors.healthy
                      : colors.alert,
              },
            ]}
          >
            {connectionStatus === 'connected'
              ? 'Live'
              : connectionStatus === 'connecting'
                ? 'Connecting'
                : connectionStatus === 'stale'
                  ? 'Stored data'
                  : connectionStatus === 'error'
                    ? 'Error'
                    : 'Offline'}
          </Text>
        </View>
      </View>

      {lastError ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={reconnect}
          style={[styles.errorBar, { backgroundColor: colors.alertSoft, borderRadius: radius.md, marginTop: spacing.md }]}
          accessibilityRole="button"
          accessibilityLabel={`Connection error: ${lastError}. Tap to retry.`}
        >
          <Text style={[typography.bodySmall, { color: colors.alert, fontSize: 16 }]}>
            ⚠ {lastError} — tap to retry
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Live feeds stage ───────────────────────────────────── */}
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        Live feeds
      </Text>

      <View style={[styles.stagePanel, { borderRadius: radius.xl }]}>
        {/* Camera */}
        <View style={[styles.stageHead]}>
          <View style={styles.cameraTitleRow}>
            <View style={[styles.liveDot, { backgroundColor: cameraDot }]} />
            <Text style={[monitorText.label, { color: stage.ink }]}>
              Barn camera
              <Text style={{ color: cameraDot }}>{`  ${cameraLabel}`}</Text>
            </Text>
          </View>
          <View style={styles.cameraActions}>
            <TouchableOpacity
              onPress={openCamera}
              style={[styles.ghostBtn, { borderColor: stage.edge }]}
              accessibilityRole="button"
              accessibilityLabel="Open the camera full screen"
            >
              <Text style={[monitorText.label, { color: stage.ink }]}>Full screen</Text>
            </TouchableOpacity>
          </View>
        </View>

        {cameraUrl && piBase && cameraState !== 'failed' ? (
          <LiveCamera
            key={cameraKey}
            uri={cameraUrl.cctv}
            baseUrl={piBase}
            height={tier === 'expanded' ? 520 : undefined}
            onLive={() => setCameraState('live')}
            onFailure={() => setCameraState('failed')}
          />
        ) : (
          cameraPlaceholder
        )}

        <Text style={[monitorText.body, { color: stage.inkDim, marginTop: 10 }]}>
          {piBase
            ? `Tapo C200C · MJPEG via ${cameraUrl?.cctv ?? ''}`
            : 'Camera stream appears once the Pi address is known.'}
        </Text>

        {/* Sensor tiles */}
        <View style={[styles.tiles, tileColumns > 1 ? styles.tilesRow : null]}>
          {/* Thermal */}
          <View style={[styles.tile, { borderColor: stage.edge }, tileColumns > 1 ? { flex: 1 } : null]}>
            <Text style={[monitorText.micro, { color: stage.inkDim }]}>Thermal · pen</Text>
            <Text style={[monitorText.metric, { color: stage.ink, marginTop: 2 }]}>
              {thermalValue !== undefined ? `${thermalValue.toFixed(1)}°C` : '—'}
            </Text>
            <Text style={[monitorText.body, { color: stage.inkDim }]} numberOfLines={2}>
              {String(thermalVerdict || 'waiting for the thermal node')}
            </Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={[monitorText.body, { color: stage.inkDim }]}>
                max {num(thermalFrame?.max)?.toFixed(1) ?? '—'}° · min {num(thermalFrame?.min)?.toFixed(1) ?? '—'}°
              </Text>
              <Text style={[monitorText.body, { color: stage.inkDim }]}>
                ambient {num(thermalFrame?.ambient)?.toFixed(1) ?? '—'}°
              </Text>
            </View>
            <View style={{ marginTop: 10 }}>
              <LinkChip
                state={thermalState}
                label="Thermal node"
                detail={friendlyAge(thermalFrame?.timestamp ?? thermalDevice?.lastSeen, now)}
              />
            </View>
          </View>

          {/* Audio */}
          <View style={[styles.tile, { borderColor: stage.edge }, tileColumns > 1 ? { flex: 1 } : null]}>
            <AudioLevelMeter
              rms={num(espFrame?.rms)}
              peak={num(espFrame?.peak)}
              active={espState === 'live'}
              detail={
                espState === 'live'
                  ? `48 kHz S16LE · ${friendlyAge(espLastSeen, now)}`
                  : espState === 'offline'
                    ? 'No audio arriving from the barn mic'
                    : 'Waiting for the first audio frame'
              }
            />
            <View style={{ marginTop: 10 }}>
              <LinkChip
                state={espState}
                label="ESP32-S3 mic"
                detail={
                  espAirTemp !== undefined
                    ? `pen air ${espAirTemp.toFixed(1)}°C${espHumidity !== undefined ? ` · ${espHumidity.toFixed(0)}% RH` : ''}`
                    : espState === 'live'
                      ? 'streaming, no SHT45 reading'
                      : 'not reporting'
                }
              />
            </View>
          </View>

          {/* Node links */}
          <View style={[styles.tile, { borderColor: stage.edge }, tileColumns > 1 ? { flex: 1 } : null]}>
            <Text style={[monitorText.micro, { color: stage.inkDim }]}>Links</Text>
            <View style={{ marginTop: 8, gap: 8 }}>
              <LinkChip state={espState} label="ESP32-S3" detail="TCP :9090 audio · MQTT telemetry" />
              <LinkChip
                state={thermalState}
                label="Pi 4B"
                detail={piBase ? `console ${piBase}` : 'address unknown'}
              />
              <LinkChip
                state={
                  connectionStatus === 'connected'
                    ? 'live'
                    : connectionStatus === 'connecting'
                      ? 'stale'
                      : 'offline'
                }
                label="PocketBase"
                detail="telemetry source of truth"
              />
            </View>
          </View>
        </View>
      </View>

      {/* ── Devices ────────────────────────────────────────────── */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Nodes</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
            {deviceRows.length} reporting
          </Text>
        </View>
        {deviceRows.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<WaveformIcon size={18} color={colors.accent} />}
              title="No nodes yet"
              message="The Pi and the barn mic appear here once their first telemetry reaches PocketBase."
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {deviceRows.map((row, i) => (
              <ListRow
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                value={row.value}
                status={row.status}
                index={i}
              />
            ))}
          </ListGroup>
        )}
      </View>

      {/* ── Alerts shortcut ────────────────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          playSound('tap');
          haptic('light');
          router.push('/tabs/events');
        }}
        style={[styles.rowLink, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.lg }]}
        accessibilityRole="button"
        accessibilityLabel="Open events and alerts"
      >
        <AlertIcon size={18} color={colors.watch} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 16 }]}>Alerts & events</Text>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
            Cough, fever and node events
          </Text>
        </View>
        <ChevronRightIcon size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* ── Research log (demoted roster) ──────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openResearch}
        style={[styles.rowLink, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.sm }]}
        accessibilityRole="button"
        accessibilityLabel="Open the research log"
        accessibilityHint="Anonymous P-number observations, not the live monitor"
      >
        <RosterIcon size={18} color={colors.textSecondary} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 16 }]}>Research log</Text>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
            Anonymous P-#### observations
          </Text>
        </View>
        <ChevronRightIcon size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {deviceIds.length === 0 ? (
        <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.md, fontSize: FONT_FLOOR }]}>
          {connectionStatus === 'connected'
            ? 'Connected to PocketBase, but no telemetry has arrived yet. Check the bridge, the node power, and the MQTT link.'
            : 'No telemetry yet. The tiles above fill in as soon as a node reaches PocketBase.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' as const, justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' },
  pill: { paddingVertical: 5, paddingHorizontal: 11 },
  errorBar: { paddingVertical: 10, paddingHorizontal: 14 },
  stagePanel: {
    borderWidth: 2,
    borderColor: stage.edge,
    backgroundColor: stage.ground,
    padding: 12,
  },
  stageHead: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  cameraTitleRow: { flexDirection: 'row' as const, alignItems: 'center', gap: 9 },
  cameraActions: { flexDirection: 'row' as const, gap: 8 },
  liveDot: { width: 12, height: 12, borderRadius: 6 },
  ghostBtn: { borderWidth: 2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' as const },
  cameraPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  retry: { marginTop: 14, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' as const },
  tiles: { marginTop: 12, gap: 10 },
  tilesRow: { flexDirection: 'row' as const, alignItems: 'stretch', flexWrap: 'wrap' as const },
  tile: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    minWidth: 240,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sectionHead: { flexDirection: 'row' as const, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  rowLink: { flexDirection: 'row' as const, alignItems: 'center', padding: 14, minHeight: 56 },
});
