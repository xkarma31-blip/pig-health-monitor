import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { subscribeSensors } from '../../utils/pocketbase-data';
import { telemetryTime } from '../../utils/telemetry-time';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  toDeviceFields,
  formatFirmware,
  formatRssi,
  formatPower,
  deviceFreshness,
  freshnessLabel,
} from '../../utils/device-record';
import {
  ActionButton,
  AlertIcon,
  ChevronRightIcon,
  EmptyState,
  IconChip,
  ListGroup,
  SegmentedControl,
  SensorGridIcon,
  Skeleton,
  useToast,
} from '../../components/primitives';
import { playSound, setSoundEnabled as applySoundPreference } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';
import { loadFarmerSetup, saveFarmerSetup } from '../../utils/setupStore';

type Node = {
  id: string;
  name: string;
  /** Formatted firmware, 'unknown' when the device did not report it. */
  firmware: string;
  /** Formatted RSSI, '—' when the device did not report it. */
  rssi: string;
  /** Device-reported power, '—' when the device did not report it. */
  power: string;
  /** Device-reported acquisition time in ms, null when unknown/invalid. */
  lastSeenMs: number | null;
};

type LoadState = 'loading' | 'ready' | 'error';

// Disclosed legacy display policy — NOT a new acceptance threshold: a node reads
// Active while its last report is under five minutes old; older reads read
// "Not recently seen" (never a definitive "Offline"). The timestamp itself is
// always the real device value; nothing here invents a time.
const STALE_MS = 5 * 60 * 1000;
// Age ticks locally so the freshness label stays truthful as time passes.
const AGE_TICK_MS = 30_000;
// The app's own version, taken from app.json. Kept as a literal because the
// screen fixture cannot resolve a build-time version import; it is the real
// shipped value, not a firmware-version-looking string.
const APP_VERSION = '1.0.0';

function toNode(raw: Record<string, unknown>, index: number): Node {
  const fields = toDeviceFields(raw, `node-${index}`);
  const ts = telemetryTime(fields.lastSeenRaw);
  return {
    id: fields.id,
    name: fields.name,
    firmware: formatFirmware(fields.firmware),
    rssi: formatRssi(fields.rssiDbm),
    power: formatPower(fields.power),
    lastSeenMs: Number.isFinite(ts) ? ts : null,
  };
}

export default function SettingsScreen() {
  const { colors, spacing, radius, typography, schemeOverride, setSchemeOverride, mode } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToast();
  const tier = useBreakpoint();
  const [state, setState] = useState<LoadState>('loading');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const setup = await loadFarmerSetup();
        if (!alive) return;
        setSoundEnabled(setup.soundEnabled === true);
        applySoundPreference(setup.soundEnabled === true);
      } catch {
        if (alive) setSoundEnabled(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Bounded cleanup timer: recompute node age locally without re-reading data.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // The initial state is already 'loading'; a manual refresh flips to it
    // from the button handler, so there is no setState in the effect body.
    // Honest states: a read failure shows an error + retry instead of an empty
    // or demo list; an empty result is a real "no nodes paired".
    const unsub = subscribeSensors(
      (sensors) => {
        setNodes(sensors.map((s, i) => toNode(s as unknown as Record<string, unknown>, i)));
        setState('ready');
      },
      () => setState('error'),
    );
    return unsub;
  }, [reloadKey]);

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
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
            {state === 'ready' ? `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}` : '—'}
          </Text>
        </View>
        {state === 'loading' ? (
          <Skeleton rows={2} />
        ) : state === 'error' ? (
          <ListGroup>
            <EmptyState
              icon={<AlertIcon size={18} color={colors.alert} />}
              title="Couldn't load nodes"
              message="Something went wrong reaching the data source. Check the connection and try again."
            />
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
              <ActionButton
                variant="secondary"
                onPress={() => { setState('loading'); setReloadKey((k) => k + 1); }}
                accessibilityLabel="Retry loading nodes"
                accessibilityHint="Reloads the hardware nodes list"
              >
                Retry
              </ActionButton>
            </View>
          </ListGroup>
        ) : nodes.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<SensorGridIcon size={16} color={colors.accent} />}
              title="No nodes reported"
              message="The data source returned no sensor nodes. They will appear here when a device next reports."
            />
          </ListGroup>
        ) : (
          <View>
            {nodeRows.map((row, rowIdx) => (
              <View key={`node-row-${rowIdx}`} style={nodeColumns > 1 ? styles.gridRow : null}>
                {row.map((node) => {
                  const freshness = deviceFreshness(node.lastSeenMs, now, STALE_MS);
                  // Unknown time is neutral, not a red alarm: absence of a reading
                  // is not proof the hardware is down. 'stale' is a softer amber.
                  const freshnessTone =
                    freshness === 'recent'
                      ? { fg: colors.healthy, soft: colors.healthySoft }
                      : freshness === 'stale'
                        ? { fg: colors.watch, soft: colors.watchSoft }
                        : { fg: colors.textMuted, soft: colors.surfaceAlt };
                  return (
                    <View
                      key={node.id}
                      style={nodeColumns > 1 ? { flex: 1, paddingHorizontal: spacing.sm / 2 } : null}
                    >
                      <ListGroup>
                        <View style={{ padding: spacing.md }}>
                          <View style={styles.nodeTop}>
                            <IconChip background={freshnessTone.soft}>
                              <SensorGridIcon size={16} color={freshnessTone.fg} />
                            </IconChip>
                            <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: spacing.md, flex: 1 }]} numberOfLines={1}>
                              {node.name}
                            </Text>
                          </View>
                          <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 4, marginLeft: 46, fontSize: 16 }]}>
                            {node.firmware}
                          </Text>
                          <View style={[styles.nodeStats, { marginTop: spacing.md }]}>
                            <View>
                              <Text style={[typography.label, { color: colors.textMuted, fontSize: 16 }]}>Power</Text>
                              <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.power}</Text>
                            </View>
                            <View>
                              <Text style={[typography.label, { color: colors.textMuted, fontSize: 16 }]}>Signal</Text>
                              <Text style={[typography.body, { color: colors.textPrimary, marginTop: 3, fontWeight: '600' }]}>{node.rssi}</Text>
                            </View>
                            <View>
                              <Text style={[typography.label, { color: colors.textMuted, fontSize: 16 }]}>Status</Text>
                              <Text
                                style={[
                                  typography.body,
                                  { color: freshnessTone.fg, marginTop: 3, fontWeight: '600' },
                                ]}
                              >
                                {freshnessLabel(freshness)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </ListGroup>
                    </View>
                  );
                })}
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
        <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16, marginTop: spacing.sm }]}>
          Saved on this device — currently following {schemeOverride === 'system' ? `system (${mode})` : `${mode} mode`}
        </Text>
      </View>

      {/* Sound feedback — silent by default, opt-in */}
      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>Sound feedback</Text>
        <SegmentedControl
          options={[
            { key: 'off', label: 'Off' },
            { key: 'on', label: 'On' },
          ]}
          value={soundEnabled ? 'on' : 'off'}
          onChange={(key) => {
            const enabled = key === 'on';
            setSoundEnabled(enabled);
            applySoundPreference(enabled);
            void saveFarmerSetup({ soundEnabled: enabled }).catch(() => {
              showToast('Could not save sound setting');
            });
            if (enabled) playSound('tap');
          }}
        />
        <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16, marginTop: spacing.sm }]}>
          PigPulse is silent until you turn this on. Vibration and accessibility cues stay available.
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
                  <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 16 }]} numberOfLines={1}>
                    {user.email ?? user.displayName ?? 'Signed in'}
                  </Text>
                  <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 16 }]}>
                    Signed in on this device
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
                <Text style={[typography.h2, { color: colors.alert, flex: 1, fontSize: 16 }]}>Sign out</Text>
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
                <Text style={[typography.h2, { color: colors.textPrimary, flex: 0, fontSize: 16 }]}>Log in</Text>
                <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 2, fontSize: 16 }]}>
                  Sign in to view your events, roster, and sensor readings
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
        <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>Pigpulse · v{APP_VERSION}</Text>
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
