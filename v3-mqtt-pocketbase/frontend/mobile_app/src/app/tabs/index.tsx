import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
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
  useToast,
} from '../../components/primitives';
import type { Status } from '../../theme';

type Pen = { id: string; name: string; note: string; temp: string; status: Status; trend: number[] };

// Replace with your Firebase RTDB /users/{uid}/pens/ listener.
const PENS: Pen[] = [
  { id: 'pen-3', name: 'Pen 3', note: 'Fever detected, pig #04', temp: '38.9°', status: 'alert', trend: [38.0, 38.1, 38.3, 38.5, 38.7, 38.9] },
  { id: 'pen-5', name: 'Pen 5', note: 'Elevated coughing, monitor', temp: '38.4°', status: 'watch', trend: [38.0, 38.0, 38.1, 38.2, 38.3, 38.4] },
  { id: 'pen-1', name: 'Pen 1', note: 'All clear', temp: '38.1°', status: 'healthy', trend: [38.1, 38.0, 38.2, 38.1, 38.0, 38.1] },
  { id: 'pen-2', name: 'Pen 2', note: 'All clear', temp: '38.2°', status: 'healthy', trend: [38.2, 38.3, 38.1, 38.2, 38.2, 38.2] },
  { id: 'pen-4', name: 'Pen 4', note: 'All clear', temp: '38.0°', status: 'healthy', trend: [38.1, 38.0, 38.0, 38.1, 38.0, 38.0] },
];

const FARM = { name: 'Sundown Farm', penCount: 5, pigCount: 110 };

export default function HomeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline] = useState(true); // wire to real connectivity state
  const [statsKey, setStatsKey] = useState(0); // bump to replay the count-up

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 850);
    return () => clearTimeout(t);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setStatsKey((k) => k + 1);
    }, 900);
  };

  const topAlert = PENS.find((p) => p.status === 'alert');

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}
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
            <Text style={[typography.h1, { marginLeft: 9 }]}>
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

      {/* Farm-wide status */}
      <StatRow key={statsKey} healthy={3} watch={1} alert={1} />

      {/* Live thermal feed — tappable */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => showToast('Opening live thermal view…')}
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

      {/* Pens */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Pens</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{FARM.penCount} total</Text>
        </View>
        {loading ? (
          <Skeleton rows={5} />
        ) : PENS.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title="No pens need attention"
              message="Every sensor is reporting a normal temperature right now."
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {PENS.map((pen, i) => (
              <ListRow key={pen.id} title={pen.name} subtitle={pen.note} value={pen.temp} status={pen.status} trend={pen.trend} index={i} />
            ))}
          </ListGroup>
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
});