import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { subscribeSensors } from '../../utils/pocketbase-data';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  ChevronRightIcon,
  EmptyState,
  IconChip,
  ListGroup,
  SegmentedControl,
  SensorGridIcon,
  Skeleton,
  useToast,
} from '../../components/primitives';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

type Node = { id: string; name: string; version: string; battery: string; rssi: string; online: boolean };

// Demo nodes shown while signed out — replaced by the live /sensors stream on sign-in.
const DEMO_NODES: Node[] = [
  { id: 'node-b', name: 'Node B (MLX90640)', version: 'v2.1.0-2026041312', battery: '84%', rssi: '-45 dBm', online: true },
  { id: 'node-a', name: 'Node A (INMP441)', version: 'v2.1.0-2026041312', battery: '42%', rssi: '-52 dBm', online: true },
];

function mapSensor(id: string, s: Record<string, unknown>): Node {
  const label = String(s.label || id);
  const type = String(s.type || 'sensor');
  const name = `${label} (${type === 'thermal' ? 'MLX90640' : type === 'sound' ? 'INMP441' : type})`;
  const battery = s.battery != null ? `${Math.round(Number(s.battery))}%` : '—';
  const rssi = s.rssi != null ? `${Number(s.rssi)} dBm` : '—';
  const lastUpdated = Date.parse(String(s.lastUpdated ?? ''));
  const online = Number.isFinite(lastUpdated) ? Date.now() - lastUpdated < 5 * 60 * 1000 : true;
  return {
    id,
    name,
    version: typeof s.firmware === 'string' ? s.firmware : 'unknown',
    battery,
    rssi,
    online,
  };
}

export default function SettingsScreen() {
  const { colors, spacing, radius, typography, schemeOverride, setSchemeOverride, mode } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToast();
  const tier = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [liveNodes, setLiveNodes] = useState<Node[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1050);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user || user.admin) return;  // admin → demo nodes (legacy mock)
    const unsub = subscribeSensors((sensors) => {
      setLiveNodes(sensors.map((s, i) => mapSensor(String(s.id ?? i), s as unknown as Record<string, unknown>)));
    });
    return unsub;
  }, [user]);

  // Signed out → demo nodes; signed in → live sensor stream.
  const nodes = user && !user.admin && liveNodes ? liveNodes : DEMO_NODES;
  const nodeColumns = tier === 'expanded' ? 2 : 1;

  const nodeRows = useMemo(() => {
    const rows: Node[][] = [];
    for (let i = 0; i < nodes.length; i += nodeColumns) {
      rows.push(nodes.slice(i, i + nodeColumns));
    }
    return rows;
  }, [nodes, nodeColumns]);

  const contentMax = tier === 'expanded' ? 960 : tier === 'medium' ? 720 : undefined;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg, flex: 1 }]}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: spacing.xxl + 60 },
        contentMax ? { width: '100%', maxWidth: contentMax, alignSelf: 'center' } : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.h1, { color: colors.textPrimary }]}>Settings</Text>

      {/* Hardware nodes */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Hardware nodes</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>
            {nodes.length} {liveNodes ? 'paired' : 'demo'}
          </Text>
        </View>
        {loading ? (
          <Skeleton rows={2} />
        ) : nodes.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<SensorGridIcon size={16} color={colors.accent} />}
              title="No hardware connected"
              message="Pair a thermal or acoustic sensor node to start collecting data."
            />
          </ListGroup>
        ) : (
          <View>
            {nodeRows.map((row, rowIdx) => (
              <View key={`node-row-${rowIdx}`} style={nodeColumns > 1 ? styles.gridRow : null}>
                {row.map((node) => (
                  <View
                    key={node.id}
                    style={nodeColumns > 1 ? { flex: 1, paddingHorizontal: spacing.sm / 2 } : null}
                  >
                    <ListGroup>
                      <View style={{ padding: spacing.md }}>
                        <View style={styles.nodeTop}>
                          <IconChip background={node.online ? colors.healthySoft : colors.alertSoft}>
                            <SensorGridIcon size={16} color={node.online ? colors.healthy : colors.alert} />
                          </IconChip>
                          <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: spacing.md, flex: 1 }]} numberOfLines={1}>
                            {node.name}
                          </Text>
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
                            <Text
                              style={[
                                typography.body,
                                { color: node.online ? colors.healthy : colors.alert, marginTop: 3, fontWeight: '600' },
                              ]}
                            >
                              {node.online ? 'Active' : 'Offline'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </ListGroup>
                  </View>
                ))}
                {nodeColumns > 1 && row.length < nodeColumns ? (
                  <View style={{ flex: 1, paddingHorizontal: spacing.sm / 2 }} />
                ) : null}
              </View>
            ))}
          </View>
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
        <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }]}>
          Saved on this device — currently following {schemeOverride === 'system' ? `system (${mode})` : `${mode} mode`}
        </Text>
      </View>

      {/* Account */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Account</Text>
        <ListGroup>
          {authLoading ? (
            <View style={{ padding: spacing.md, minHeight: 44, justifyContent: 'center' }}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>Checking session…</Text>
            </View>
          ) : user ? (
            <>
              <View style={[styles.row, { padding: spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 15 }]} numberOfLines={1}>
                    {user.email ?? user.displayName ?? 'Signed in'}
                  </Text>
                  <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 12.5 }]}>
                    Live data streaming from your farm
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.row, { padding: spacing.md, minHeight: 44 }]}
                activeOpacity={0.7}
                onPress={() => {
                  playSound('tap');
                  haptic('light');
                  logout()
                    .then(() => showToast('Signed out'))
                    .catch(() => showToast('Sign out failed'));
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityHint="Ends your session on this device"
              >
                <Text style={[typography.h2, { color: colors.alert, flex: 1, fontSize: 15 }]}>Sign out</Text>
                <ChevronRightIcon size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.row, { padding: spacing.md, borderRadius: radius.md, minHeight: 44 }]}
              activeOpacity={0.7}
              onPress={() => {
                playSound('tap');
                haptic('light');
                router.push('/login');
              }}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              accessibilityHint="Opens the sign-in screen"
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.h2, { color: colors.textPrimary, flex: 0, fontSize: 15 }]}>Log in</Text>
                <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 12.5 }]}>
                  Enable live events, roster, and sensor streaming
                </Text>
              </View>
              <ChevronRightIcon size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
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
  screen: { flex: 1 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  nodeTop: { flexDirection: 'row', alignItems: 'center' },
  nodeStats: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center' },
  gridRow: { flexDirection: 'row', marginHorizontal: -6, marginBottom: 12 },
});
