import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import {
  ChevronRightIcon,
  EmptyState,
  IconChip,
  ListGroup,
  SegmentedControl,
  SensorGridIcon,
  Skeleton,
} from '../../components/primitives';

type Node = { id: string; name: string; version: string; battery: string; rssi: string; online: boolean };

// Replace with your Firebase RTDB /users/{uid}/sensors/ listener.
const NODES: Node[] = [
  { id: 'node-b', name: 'Node B (MLX90640)', version: 'v2.1.0-2026041312', battery: '84%', rssi: '-45 dBm', online: true },
  { id: 'node-a', name: 'Node A (INMP441)', version: 'v2.1.0-2026041312', battery: '42%', rssi: '-52 dBm', online: true },
];

export default function SettingsScreen() {
  const { colors, spacing, radius, typography, schemeOverride, setSchemeOverride } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1050);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={typography.h1}>Settings</Text>

      {/* Hardware nodes */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Hardware nodes</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{NODES.length} active</Text>
        </View>
        {loading ? (
          <Skeleton rows={2} />
        ) : NODES.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<SensorGridIcon size={16} color={colors.accent} />}
              title="No hardware connected"
              message="Pair a thermal or acoustic sensor node to start collecting data."
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {NODES.map((node) => (
              <View key={node.id} style={{ padding: spacing.md }}>
                <View style={styles.nodeTop}>
                  <IconChip background={colors.healthySoft}>
                    <SensorGridIcon size={16} color={colors.healthy} />
                  </IconChip>
                  <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: spacing.md }]}>{node.name}</Text>
                </View>
                <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 4, marginLeft: 46, fontSize: 12.5 }]}>
                  {node.version}
                </Text>
                <View style={[styles.nodeStats, { marginTop: spacing.md }]}>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Battery</Text>
                    <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.battery}</Text>
                  </View>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Signal</Text>
                    <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.rssi}</Text>
                  </View>
                  <View>
                    <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>Status</Text>
                    <Text style={[typography.body, { color: colors.healthy, marginTop: 3, fontWeight: '600' }]}>
                      {node.online ? 'Active' : 'Offline'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ListGroup>
        )}
      </View>

      {/* Appearance */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Appearance</Text>
        <SegmentedControl
          options={[
            { key: 'system', label: 'System' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ]}
          value={schemeOverride}
          onChange={setSchemeOverride}
        />
      </View>

      {/* Account */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Account</Text>
        <ListGroup>
          <TouchableOpacity
            style={[styles.row, { padding: spacing.md, borderRadius: radius.md }]}
            activeOpacity={0.7}
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel="Log in"
            accessibilityHint="Opens the sign-in screen"
          >
            <Text style={[typography.h2, { color: colors.textPrimary, flex: 1, fontSize: 15 }]}>Log in</Text>
            <ChevronRightIcon size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </ListGroup>
      </View>

      {/* About */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>About</Text>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>Pigpulse · v2.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  nodeTop: { flexDirection: 'row', alignItems: 'center' },
  nodeStats: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center' },
});