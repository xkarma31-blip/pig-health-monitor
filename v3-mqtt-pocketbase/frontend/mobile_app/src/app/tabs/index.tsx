import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, type Status } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { subscribeRoster, subscribeAlerts } from '../../utils/pocketbase-data';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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

type Pen = { id: string; name: string; note: string; temp: string; status: Status; trend: number[] };

// Pens are a hardware concept the RTDB does not model yet — keep as demo
// until /users/$uid/pens/ exists (see gap notes in .planning/).
const PENS: Pen[] = [
  { id: 'pen-3', name: 'Pen 3', note: 'Fever detected, pig #04', temp: '38.9°', status: 'alert', trend: [38.0, 38.1, 38.3, 38.5, 38.7, 38.9] },
  { id: 'pen-5', name: 'Pen 5', note: 'Elevated coughing, monitor', temp: '38.4°', status: 'watch', trend: [38.0, 38.0, 38.1, 38.2, 38.3, 38.4] },
  { id: 'pen-1', name: 'Pen 1', note: 'All clear', temp: '38.1°', status: 'healthy', trend: [38.1, 38.0, 38.2, 38.1, 38.0, 38.1] },
  { id: 'pen-2', name: 'Pen 2', note: 'All clear', temp: '38.2°', status: 'healthy', trend: [38.2, 38.3, 38.1, 38.2, 38.2, 38.2] },
  { id: 'pen-4', name: 'Pen 4', note: 'All clear', temp: '38.0°', status: 'healthy', trend: [38.1, 38.0, 38.0, 38.1, 38.0, 38.0] },
];

const FARM = { name: 'Sundown Farm', penCount: 5, pigCount: 110 };

const DEMO_STATS = { healthy: 3, watch: 1, alert: 1 };

function herdStatusFromRecords(
  roster: Record<string, unknown>[],
  alerts: Record<string, unknown>[],
) {
  let healthy = 0;
  let watch = 0;
  let alert = 0;
  for (const pig of roster) {
    const hs = String(pig.healthStatus || 'NORMAL').toUpperCase();
    if (hs === 'NORMAL') healthy += 1;
    else if (hs === 'ELEVATED' || hs === 'WATCH') watch += 1;
    else alert += 1;
  }
  for (const a of alerts) {
    const sev = String(a.severity || a.level || '').toUpperCase();
    if (sev === 'CRITICAL' || sev === 'HIGH') alert += 1;
    else if (sev === 'WARNING' || sev === 'ELEVATED') watch += 1;
  }
  return { healthy, watch, alert };
}

export default function HomeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const tier = useBreakpoint();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline] = useState(true); // wire to real connectivity state
  const [statsKey, setStatsKey] = useState(0); // bump to replay the count-up
  const [roster, setRoster] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 850);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user || user.admin) return;  // end-user → live; admin & guest → demo figures
    const unsubRoster = subscribeRoster(setRoster);
    const unsubAlerts = subscribeAlerts(setAlerts);
    return () => {
      unsubRoster();
      unsubAlerts();
    };
  }, [user]);

  const liveStats = useMemo(() => herdStatusFromRecords(roster, alerts), [roster, alerts]);
  const hasLiveData = Boolean(user) && !user!.admin && roster.length + alerts.length > 0;
  const stats = hasLiveData ? liveStats : DEMO_STATS;

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setStatsKey((k) => k + 1);
    }, 900);
  };

  const topAlert = PENS.find((p) => p.status === 'alert');
  const contentMax = tier === 'expanded' ? 1100 : tier === 'medium' ? 720 : undefined;
  const penColumns = tier === 'expanded' ? 3 : tier === 'medium' ? 2 : 1;

  const penRows = useMemo(() => {
    const rows: Pen[][] = [];
    for (let i = 0; i < PENS.length; i += penColumns) {
      rows.push(PENS.slice(i, i + penColumns));
    }
    return rows;
  }, [penColumns]);

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
            {isOnline ? `${FARM.name} · ${FARM.penCount} pens · ${FARM.pigCount} pigs` : 'Last synced 6 minutes ago'}
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            { backgroundColor: isOnline ? colors.healthySoft : colors.alertSoft, borderRadius: radius.pill },
          ]}
        >
          <Text style={[typography.label, { color: isOnline ? colors.healthy : colors.alert }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Farm-wide status — live from Firebase when signed in, demo otherwise */}
      <View>
        <StatRow key={`${statsKey}-${stats.healthy}-${stats.watch}-${stats.alert}`} {...stats} />
        {!hasLiveData ? (
          <TouchableOpacity
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
            onPress={() => {
              playSound('tap');
              haptic('light');
              router.push('/login');
            }}
            accessibilityRole="button"
            accessibilityLabel="Sign in to stream live herd status"
            accessibilityHint="Opens the login screen"
          >
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
              Demo figures — sign in to stream live herd status
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Live thermal feed — opens the fullscreen view */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          playSound('tap');
          haptic('light');
          router.push('/thermal');
        }}
        style={[styles.feedCard, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.lg }]}
        accessibilityRole="button"
        accessibilityLabel="Live thermal feed"
        accessibilityHint="Opens the live thermal camera view"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <ThermalThumbnail />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>Live thermal feed</Text>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 2, fontSize: 12.5 }]}>
              Node B streaming, 32×24 array
            </Text>
          </View>
        </View>
        <Badge label="Live" status="alert" />
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

      {/* Pens — responsive grid */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Pens</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{FARM.penCount} total</Text>
        </View>
        {loading ? (
          <Skeleton rows={penColumns === 1 ? 5 : 3} />
        ) : PENS.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title="No pens registered"
              message="Pens appear here once sensor nodes are assigned to them."
            />
          </ListGroup>
        ) : (
          <View>
            {penRows.map((row, rowIdx) => (
              <View key={`row-${rowIdx}`} style={penColumns > 1 ? styles.gridRow : null}>
                {row.map((pen) => (
                  <View
                    key={pen.id}
                    style={penColumns > 1 ? { flex: 1, paddingHorizontal: spacing.sm / 2 } : null}
                  >
                    <ListGroup>
                      <ListRow
                        title={pen.name}
                        subtitle={pen.note}
                        value={pen.temp}
                        status={pen.status}
                        trend={pen.trend}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  pill: { paddingVertical: 5, paddingHorizontal: 11 },
  feedCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  gridRow: { flexDirection: 'row', marginHorizontal: -6, marginBottom: 12 },
});
