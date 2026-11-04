import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme, type Status } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { usePocketbaseRealtime, type TelemetryFrame } from '../../hooks/usePocketbaseRealtime';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePiThermal } from '../../hooks/usePiThermal';
import {
  LogoMark,
  Badge,
  ListGroup,
  ListRow,
  StatRow,
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

const DEMO_STATS = { healthy: 3, watch: 1, alert: 1 };

function inferStatus(frame: TelemetryFrame): Status {
  const hs = String(frame.healthStatus || '').toUpperCase();
  if (hs === 'NORMAL' || hs === 'HEALTHY') return 'healthy';
  if (hs === 'ELEVATED' || hs === 'WATCH') return 'watch';
  if (hs === 'CRITICAL' || hs === 'ALERT' || hs === 'HIGH') return 'alert';
  // Fall back to temperature heuristic
  const temp = frame.temperature;
  if (typeof temp === 'number') {
    if (temp > 39.5) return 'alert';
    if (temp > 39.0) return 'watch';
  }
  return 'healthy';
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
 * A usable numeric reading.
 *
 * PocketBase stores an absent numeric field as 0, and the thermal guard
 * strips `temperature` / `bodyTemp` from thermal rows on purpose (the
 * MLX90640 frames a barn scene, not a pig). So zero is "no reading", never a
 * measurement — and it must never be rendered as 0.0°.
 */
function reading(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;
}

/**
 * The device-row reading.
 *
 * The Pi's thermal guard (backend/bridge/thermal_guard.py) strips
 * `temperature` / `bodyTemp` from thermal telemetry rows on purpose: the
 * MLX90640 frames a barn scene, not a pig, so those fields would be a
 * pig-temperature claim the backend refuses to publish. What survives is
 * the raw instrument values — `center` (scene centre) and `ambient`.
 *
 * So a genuine `temperature` is shown as-is; a thermal row shows its
 * scene centre labelled "scene temp"; a row with no reading shows "—".
 * It must NEVER render 0.0° — PocketBase stores an absent field as 0,
 * so zero is "no reading", not a measurement.
 */
function deviceReading(frame: TelemetryFrame | undefined): { value: string; qualifier?: string } {
  const temp = reading(frame?.temperature);
  if (temp !== null) return { value: `${temp.toFixed(1)}°C` };

  const center = reading(frame?.center);
  if (center !== null) return { value: `${center.toFixed(1)}°C`, qualifier: 'scene temp' };

  const ambient = reading(frame?.ambient);
  if (ambient !== null) return { value: `${ambient.toFixed(1)}°C`, qualifier: 'ambient' };

  return { value: '—' };
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
    reconnect,
  } = usePocketbaseRealtime();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
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

  // Derive device rows from realtime telemetry
  const devices: DeviceRow[] = useMemo(() => {
    return deviceIds.map((id) => {
      const frame = telemetry[id];
      const name = deviceNames[id] ?? String(frame?.deviceId || id);
      const reading = deviceReading(frame);
      const stamp = formatTimestamp(frame?.timestamp);
      const note = reading.qualifier ? `${reading.qualifier} · ${stamp}` : stamp;
      return {
        id,
        name,
        temp: reading.value,
        note,
        status: inferStatus(frame || {}),
        trend: [], // Sparkline needs historical frames; empty for now
      };
    });
  }, [deviceIds, telemetry, deviceNames]);

  const stats = useMemo(() => {
    let healthy = 0, watch = 0, alert = 0;
    for (const d of devices) {
      if (d.status === 'healthy') healthy++;
      else if (d.status === 'watch') watch++;
      else if (d.status === 'alert') alert++;
    }
    return devices.length > 0 ? { healthy, watch, alert } : DEMO_STATS;
  }, [devices]);

  const hasLiveData = devices.length > 0;
  const isOnline = connectionStatus === 'connected' || connectionStatus === 'connecting';
  const topAlert = devices.find((d) => d.status === 'alert');
  const farmPrefix = farmName ? `${farmName} · ` : '';

  // Live barn status via the shared hook (console frames or fresh PB rows);
  // "Stale"/"Offline" when nothing recent — never a fake demo label.
  const pi = usePiThermal();
  const piLive = pi.live || pi.pbFresh;
  const piStale = !piLive && !!pi.pbStats;
  // The thermal card's headline number uses the SAME zero-guard as the
  // device rows: the live console frame's scene centre, else the stored PB
  // value — and if both are absent/zero, "—" rather than a fabricated 0.0°C.
  const piTemp = reading(pi.live && pi.frame ? pi.frame.center : undefined) ??
    reading(pi.pbStats?.bodyTemp);

  const onRefresh = () => {
    setRefreshing(true);
    reconnect();
    setTimeout(() => {
      setRefreshing(false);
      setStatsKey((k) => k + 1);
    }, 1200);
  };

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
            {connectionStatus === 'stale'
              ? 'Stored readings · waiting for fresh sensor data'
              : connectionStatus === 'error'
                ? 'Connection unavailable · showing last known readings'
                : hasLiveData
                  ? `${farmPrefix}${devices.length} device${devices.length !== 1 ? 's' : ''} streaming`
                  : farmName
                    ? `${farmName} · connecting to PocketBase…`
                    : 'Connecting to PocketBase…'}
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

      {/* Farm-wide status */}
      <View>
        <StatRow key={`${statsKey}-${stats.healthy}-${stats.watch}-${stats.alert}`} {...stats} />
        {!hasLiveData && connectionStatus !== 'error' ? (
          <TouchableOpacity
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
            onPress={() => {
              playSound('tap');
              haptic('light');
              router.push('/login');
            }}
            accessibilityRole="button"
            accessibilityLabel="Waiting for first telemetry frame"
            accessibilityHint="Shows demo data until a device reports"
          >
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {connectionStatus === 'connected'
                ? 'No telemetry frames yet — demo figures shown until a device reports'
                : 'Demo figures — connect to PocketBase to stream live herd status'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
            <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 2, fontSize: 12.5 }]}>
              {piLive
                ? `pi-thermal-01 · ${typeof piTemp === 'number' ? piTemp.toFixed(1) : '—'}°C · live`
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
            <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>
              {devices.length} connected
            </Text>
          ) : null}
        </View>
        {loading ? (
          <Skeleton rows={penColumns === 1 ? 5 : 3} />
        ) : devices.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title="No devices streaming"
              message={
                hasLiveData
                  ? 'Connected but no telemetry frames yet.'
                  : 'Connect to PocketBase to see live device telemetry. Demo figures are shown until the first frame arrives.'
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
  errorBar: { paddingVertical: 10, paddingHorizontal: 14 },
  feedCard: { flexDirection: 'row' as any, alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionHead: { flexDirection: 'row' as any, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  gridRow: { flexDirection: 'row' as any, marginHorizontal: -6, marginBottom: 12 },
});
