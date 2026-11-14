import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useTheme, type Status, type ThemeColors } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { resolveSelectedSource } from '../../utils/pocketbase';
import {
  MaintenanceNotice,
  describeFaults,
  diagnosticsLine,
} from '../../components/MaintenanceNotice';
import {
  usePocketbaseRealtime,
  type ConnectionStatus,
  type TelemetryFrame,
} from '../../hooks/usePocketbaseRealtime';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePiThermal } from '../../hooks/usePiThermal';
import {
  LogoMark,
  Badge,
  ListGroup,
  ListRow,
  Skeleton,
  EmptyState,
  ThermalThumbnail,
  ThermometerIcon,
} from '../../components/primitives';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';
import { telemetryTime } from '../../utils/telemetry-time';
import { subscribeDeviceNames } from '../../utils/pocketbase-data';
import { loadFarmerSetup } from '../../utils/setupStore';
import {
  LEGACY_ALERT_C,
  LEGACY_WATCH_C,
  legacyDisplayBand,
  readDeviceValue,
  reportedStatus,
  summarizeDevices,
  usableNumber,
  type ReportedStatus,
} from '../../utils/home-telemetry';

/**
 * Home (lane B6).
 *
 * HONESTY CONTRACT — this screen reports DEVICE MONITORING, never a herd-health
 * verdict:
 *   - Every summary number is a count of DEVICES keyed by the device's OWN
 *     reported status. There is no "healthy pigs" figure and no demo data.
 *   - A device with no explicit reported status is `unknown` — it is never
 *     promoted to healthy by a temperature heuristic.
 *   - A barn SCENE centre is shown as a scene reading; it is never compared to a
 *     clinical temperature threshold and never sets a device status.
 *   - Legacy temperature thresholds survive only as a muted, labelled DISPLAY
 *     note on a device-REPORTED temperature.
 */

// ── Presentation helpers ───────────────────────────────────────────

/** Map an explicit device-reported status onto a theme Status token. */
function statusFor(reported: ReportedStatus): Status {
  switch (reported) {
    case 'normal':
      return 'healthy';
    case 'watch':
      return 'watch';
    case 'alert':
      return 'alert';
    default:
      return 'neutral';
  }
}

type Tone = 'good' | 'warn' | 'bad' | 'idle';

/** Transport/polling label + tone — deliberately separate from sensor freshness. */
function transportView(status: ConnectionStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'connected':
      return { label: 'Live', tone: 'good' };
    case 'connecting':
      return { label: 'Connecting', tone: 'idle' };
    case 'empty':
      return { label: 'No records', tone: 'idle' };
    case 'stale':
      return { label: 'Stored data', tone: 'warn' };
    case 'error':
      return { label: 'Error', tone: 'bad' };
    default:
      return { label: 'Offline', tone: 'bad' };
  }
}

function toneColors(colors: ThemeColors, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'good':
      return { fg: colors.healthy, bg: colors.healthySoft };
    case 'warn':
      return { fg: colors.watch, bg: colors.watchSoft };
    case 'bad':
      return { fg: colors.alert, bg: colors.alertSoft };
    default:
      return { fg: colors.info, bg: colors.infoSoft };
  }
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  try {
    const timestamp = telemetryTime(value);
    if (!Number.isFinite(timestamp)) return 'Time unavailable';
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

/**
 * The device-row reading.
 *
 * A device-REPORTED `temperature` is shown plain. A thermal row shows its scene
 * centre labelled "scene temp" (the MLX90640 frames a barn scene, not a pig).
 * Anything absent/zero renders "—": PocketBase stores an absent field as 0, so
 * zero is "no reading", never a measurement.
 */
function deviceReading(frame: TelemetryFrame | undefined): { value: string; qualifier?: string } {
  const { kind, value } = readDeviceValue(frame ?? {});
  if (kind === null || value === null) return { value: '—' };
  const text = `${value.toFixed(1)}°C`;
  if (kind === 'scene') return { value: text, qualifier: 'scene temp' };
  if (kind === 'ambient') return { value: text, qualifier: 'ambient' };
  return { value: text };
}

/**
 * A muted, labelled note for a device-REPORTED temperature that the legacy
 * thresholds would have flagged. DISPLAY ONLY — it never sets a device status
 * and never feeds a count.
 */
function legacyNote(frame: TelemetryFrame | undefined): string | null {
  const { kind, value } = readDeviceValue(frame ?? {});
  if (kind !== 'temperature' || value === null) return null;
  const band = legacyDisplayBand(value);
  if (!band || band === 'normal') return null;
  return `legacy ${band}`;
}

function FreshnessBadge({ band }: { band: 'fresh' | 'aging' | 'stale' | 'unknown' }) {
  const label =
    band === 'fresh' ? 'Sensors fresh'
      : band === 'aging' ? 'Sensors aging'
        : band === 'stale' ? 'Sensors stale'
          : 'Freshness unknown';
  const status: Status =
    band === 'fresh' ? 'healthy' : band === 'aging' ? 'watch' : band === 'stale' ? 'alert' : 'neutral';
  return <Badge label={label} status={status} />;
}

function SummaryCell({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[typography.bodySmall, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[typography.stat, { color }]}>{value}</Text>
    </View>
  );
}

type DeviceRow = {
  id: string;
  name: string;
  temp: string;
  note: string;
  status: Status;
  trend: number[];
};

export default function HomeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  useAuth();
  const tier = useBreakpoint();

  const {
    telemetry,
    deviceIds,
    connectionStatus,
    lastError,
    freshness,
    reconnect,
    now,
  } = usePocketbaseRealtime();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [farmName, setFarmName] = useState('');
  const [penName, setPenName] = useState('');
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});

  // Debounce the loading indicator — give PB 850ms to deliver first frame.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 850);
    return () => clearTimeout(t);
  }, []);

  // Saved farm / pen names from setup — re-read on focus so a rename shows here.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadFarmerSetup()
        .then((setup) => {
          if (!mounted) return;
          setFarmName(setup.farmName);
          setPenName(setup.penName);
        })
        .catch(() => { /* keep defaults */ });
      return () => { mounted = false; };
    }, []),
  );

  // Human device names from the PocketBase `devices` collection.
  useEffect(() => {
    const unsub = subscribeDeviceNames(setDeviceNames);
    return unsub;
  }, []);

  // Derive device rows from realtime telemetry.
  const devices: DeviceRow[] = useMemo(() => {
    return deviceIds.map((id) => {
      const frame = telemetry[id];
      const name = deviceNames[id] ?? String(frame?.deviceId || id);
      const reading = deviceReading(frame);
      const stamp = formatTimestamp(frame?.timestamp);
      const legacy = legacyNote(frame);
      const note = [reading.qualifier, stamp, legacy].filter(Boolean).join(' · ');
      return {
        id,
        name,
        temp: reading.value,
        note,
        status: statusFor(reportedStatus(frame ?? {})),
        trend: [], // Sparkline needs historical frames; empty for now
      };
    });
  }, [deviceIds, telemetry, deviceNames]);

  // Device monitoring counts only — never a herd-health verdict.
  // `now` is the hook's ticking clock (it advances every 5 s), so the summary
  // ages against a stable instant instead of calling Date.now() during render.
  const summary = useMemo(() => summarizeDevices(telemetry, now), [telemetry, now]);
  const hasDevices = devices.length > 0;
  const needsReview = summary.status.watch + summary.status.alert;
  const reportedCount = summary.status.normal + summary.status.watch + summary.status.alert;

  const transport = transportView(connectionStatus);
  const tone = toneColors(colors, transport.tone);
  const topAlert = devices.find((d) => d.status === 'alert');
  const farmPrefix = farmName ? `${farmName} · ` : '';

  const subtitle =
    connectionStatus === 'error'
      ? 'Connection unavailable · showing last known readings'
      : connectionStatus === 'stale'
        ? 'Stored readings · waiting for fresh sensor data'
        : connectionStatus === 'empty'
          ? 'Connected · no telemetry records yet'
          : connectionStatus === 'connecting'
            ? farmName
              ? `${farmName} · connecting to PocketBase…`
              : 'Connecting to PocketBase…'
            : hasDevices
              ? `${farmPrefix}${devices.length} device${devices.length !== 1 ? 's' : ''} reporting`
              : farmName
                ? `${farmName} · no devices reporting`
                : 'No devices reporting';

  // Live barn status via the shared hook (console frames or fresh PB rows).
  const pi = usePiThermal();
  const piLive = pi.live || pi.pbFresh;
  const piStale = !piLive && !!pi.pbStats;
  // The thermal tile headline uses the SAME zero-guard as the device rows: the
  // live console frame's scene centre, else the stored PB `center` (the guard
  // strips `bodyTemp`, so `center` is the only usable value) — never a fake 0.0°.
  const piTemp =
    usableNumber(pi.live && pi.frame ? pi.frame.center : undefined) ?? usableNumber(pi.pbStats?.center);

  const onRefresh = () => {
    setRefreshing(true);
    reconnect();
    setTimeout(() => setRefreshing(false), 1200);
  };

  // Plain-language notice when something is genuinely not working, so the app
  // never looks healthy while the box is silent. Derived from measured state
  // only — it never invents a diagnosis.
  const maintenanceFault = describeFaults({
    connectionStatus,
    thermalLive: piLive,
    hasStoredThermal: !!pi.pbStats,
    deviceCount: devices.length,
  });
  const pbUrlForDiagnostics = resolveSelectedSource().base || undefined;

  const contentMax = tier === 'expanded' ? 1100 : tier === 'medium' ? 720 : undefined;
  const penColumns = tier === 'expanded' ? 3 : tier === 'medium' ? 2 : 1;

  const deviceRows = useMemo(() => {
    const rows: DeviceRow[][] = [];
    for (let i = 0; i < devices.length; i += penColumns) {
      rows.push(devices.slice(i, i + penColumns));
    }
    return rows;
  }, [devices, penColumns]);

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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.brandRow}>
            <LogoMark />
            <Text style={[typography.h1, { marginLeft: 9, color: colors.textPrimary }]}>
              <Text style={{ color: colors.textPrimary }}>Pig</Text>
              <Text style={{ color: colors.accent }}>pulse</Text>
            </Text>
          </View>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4 }]}>
            {subtitle}
          </Text>
          {maintenanceFault ? (
            <MaintenanceNotice
              fault={maintenanceFault}
              diagnostics={diagnosticsLine({
                pbUrl: pbUrlForDiagnostics,
                connectionStatus,
                thermalLive: piLive,
                deviceCount: devices.length,
              })}
            />
          ) : null}
          {hasDevices ? (
            <View style={{ marginTop: spacing.sm }}>
              <FreshnessBadge band={freshness.band} />
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.pill,
            { backgroundColor: tone.bg, borderRadius: radius.pill },
          ]}
        >
          <Text style={[typography.label, { color: tone.fg }]}>{transport.label}</Text>
        </View>
      </View>

      {/* Connection error detail */}
      {lastError ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={reconnect}
          style={[styles.errorBar, { backgroundColor: colors.alertSoft, borderRadius: radius.md, marginTop: spacing.md }]}
          accessibilityRole="button"
          accessibilityLabel={`Connection error: ${lastError}. Tap to retry.`}
        >
          <Text style={[typography.bodySmall, { color: colors.alert }]}>
            ⚠ {lastError} — tap to retry
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Device monitoring summary — device counts, not a herd-health verdict */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.lg },
        ]}
      >
        <Text style={[typography.caption, { color: colors.textMuted }]}>Device monitoring</Text>
        <View style={styles.summaryRow}>
          <SummaryCell label="Devices" value={summary.total} color={colors.textPrimary} />
          <SummaryCell label="Reported status" value={reportedCount} color={colors.info} />
          <SummaryCell
            label="Needs review"
            value={needsReview}
            color={needsReview > 0 ? colors.alert : colors.textMuted}
          />
        </View>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Reported: {summary.status.normal} normal · {summary.status.watch} watch ·{' '}
          {summary.status.alert} alert · {summary.status.unknown} no status
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: 2 }]}>
          Freshness: {summary.freshness.fresh} fresh · {summary.freshness.aging} aging ·{' '}
          {summary.freshness.stale} stale · {summary.freshness.unknown} untimed
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
          Counts come from devices and their own reported status — not a herd-health score.
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 4 }]}>
          Freshness compares the newest recorded timestamp only; the schema carries no
          producer-age or clock-quality field, so a skewed device clock cannot be detected here.
        </Text>
      </View>

      {!hasDevices && connectionStatus !== 'error' ? (
        <TouchableOpacity
          activeOpacity={0.6}
          style={[styles.waitBar, { marginTop: spacing.sm }]}
          onPress={() => {
            playSound('tap');
            haptic('light');
            router.push('/login');
          }}
          accessibilityRole="button"
          accessibilityLabel="Waiting for the first telemetry record"
          accessibilityHint="Opens the PocketBase connection settings"
        >
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {connectionStatus === 'empty'
              ? 'No telemetry records yet — devices have not reported'
              : 'Connect to PocketBase to receive device telemetry'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Thermal view */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          playSound('tap');
          haptic('light');
          router.push('/thermal');
        }}
        style={[styles.feedCard, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.lg }]}
        accessibilityRole="button"
        accessibilityLabel="Thermal view"
        accessibilityHint="Opens the thermal camera preview"
      >
        <View style={{ flexDirection: 'row' as any, alignItems: 'center', flex: 1 }}>
          <ThermalThumbnail />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>Thermal view</Text>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 2 }]}>
              {piLive
                ? `pi-thermal-01 · scene ${typeof piTemp === 'number' ? piTemp.toFixed(1) : '—'}°C · live`
                : piStale
                  ? 'pi-thermal-01 · stale — check the barn'
                  : 'No live thermal data — barn offline'}
            </Text>
          </View>
        </View>
        <Badge label={piLive ? 'Live' : piStale ? 'Stale' : 'Offline'} status={piLive ? 'healthy' : piStale ? 'watch' : 'info'} />
      </TouchableOpacity>

      {/* Needs attention */}
      {topAlert ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            Needs attention
          </Text>
          <ListGroup>
            <ListRow title={topAlert.name} subtitle={topAlert.note} value={topAlert.temp} status="alert" />
          </ListGroup>
        </View>
      ) : null}

      {/* Devices / pens grid */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {devices.length > 0 ? 'Devices' : penName || 'Pens'}
          </Text>
          {devices.length > 0 ? (
            <Text style={[typography.body, { color: colors.textMuted }]}>
              {devices.length} monitored
            </Text>
          ) : null}
        </View>
        {loading ? (
          <Skeleton rows={penColumns === 1 ? 5 : 3} />
        ) : devices.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title="No devices reporting"
              message={
                connectionStatus === 'empty'
                  ? 'Connected, but no telemetry records exist yet.'
                  : 'Connect to PocketBase to receive device telemetry.'
              }
            />
          </ListGroup>
        ) : (
          <View>
            {deviceRows.map((row, rowIdx) => (
              <View key={`row-${rowIdx}`} style={penColumns > 1 ? styles.gridRow : null}>
                {row.map((device) => (
                  <View
                    key={device.id}
                    style={penColumns > 1 ? { flex: 1, paddingHorizontal: spacing.sm / 2 } : null}
                  >
                    <ListGroup>
                      <ListRow
                        title={device.name}
                        subtitle={device.note}
                        value={device.temp}
                        status={device.status}
                        trend={device.trend}
                        index={rowIdx}
                      />
                    </ListGroup>
                  </View>
                ))}
                {penColumns > 1 && row.length < penColumns
                  ? Array.from({ length: penColumns - row.length }).map((_, i) => (
                      <View key={`fill-${i}`} style={{ flex: 1, paddingHorizontal: spacing.sm / 2 }} />
                    ))
                  : null}
              </View>
            ))}
            <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
              Legacy display thresholds ({LEGACY_WATCH_C.toFixed(1)}/{LEGACY_ALERT_C.toFixed(1)}°C)
              label a device-REPORTED temperature only — never a device status or a count, and never
              applied to a scene or ambient reading.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row' as any, justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row' as any, alignItems: 'center' },
  pill: { paddingVertical: 5, paddingHorizontal: 11 },
  errorBar: { paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' as any },
  waitBar: { minHeight: 44, justifyContent: 'center' as any },
  summaryCard: { padding: 14 },
  summaryRow: { flexDirection: 'row' as any, marginTop: 6, gap: 10 },
  feedCard: { flexDirection: 'row' as any, alignItems: 'center', justifyContent: 'space-between', padding: 14, minHeight: 44 },
  sectionHead: { flexDirection: 'row' as any, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  gridRow: { flexDirection: 'row' as any, marginHorizontal: -6, marginBottom: 12 },
});
