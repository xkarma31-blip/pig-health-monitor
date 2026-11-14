import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Text, TextInput, View, StyleSheet } from 'react-native';
import { useTheme, statusColor, type Status } from '../../theme';
import { subscribeAlerts } from '../../utils/pocketbase-data';
import { ensureNotificationPermission, notifyAlert } from '../../utils/notifications';
import { telemetryTime } from '../../utils/telemetry-time';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { mapAlert, typeDisplay, type AlertItem, type AlertKind } from '../../utils/alert-record';
import {
  ActionButton,
  AlertIcon,
  Badge,
  EmptyState,
  InfoIcon,
  ListGroup,
  SearchIcon,
  Skeleton,
  ThermometerIcon,
  WaveformIcon,
} from '../../components/primitives';

/** Alert item plus its display timestamp, parsed once at the data boundary. */
type EventItem = AlertItem & { timestamp: string };

type LoadState = 'loading' | 'ready' | 'error';

function formatTimestamp(value: unknown): string {
  // Mixed writers: seeds write epoch seconds, the bridge writes ms — normalize
  // with the same helper the rest of the app uses. An unparsable value stays
  // blank rather than being rendered as a fabricated time.
  const ts = telemetryTime(value);
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toEvent(id: string, record: Record<string, unknown>): EventItem {
  return {
    ...mapAlert(id, record),
    timestamp: formatTimestamp(record.timestamp ?? record.ts ?? record.createdAt),
  };
}

function kindGlyph(kind: AlertKind, color: string) {
  switch (kind) {
    case 'sound':
      return <WaveformIcon size={13} color={color} />;
    case 'system':
      return <AlertIcon size={13} color={color} />;
    case 'unknown':
      return <InfoIcon size={13} color={color} />;
    default:
      return <ThermometerIcon size={11} color={color} />;
  }
}

export default function AlertsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const tier = useBreakpoint();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>('loading');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [notifPermission, setNotifPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const lastAlertId = useRef<string | null>(null);

  // Ask once for notification permission; never block the list on it.
  useEffect(() => {
    let alive = true;
    ensureNotificationPermission().then((granted) => {
      if (alive) setNotifPermission(granted ? 'granted' : 'denied');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Notify on NEW alerts only: the first list is the baseline, and each later
  // change of the newest id fires one local notification. Web is a no-op.
  useEffect(() => {
    if (state !== 'ready' || events.length === 0) return;
    const newest = events[0];
    const id = newest?.id ? String(newest.id) : null;
    if (!id) return;
    if (lastAlertId.current === null) {
      lastAlertId.current = id;
      return;
    }
    if (id !== lastAlertId.current) {
      lastAlertId.current = id;
      void notifyAlert({
        id,
        type: newest.typeToken || undefined,
        message: newest.message,
        severity: newest.severityToken || undefined,
      });
    }
  }, [events, state]);

  useEffect(() => {
    setState('loading');
    // Honest states: a read failure shows an error + retry instead of an empty
    // list, and an empty result is a real "no alerts" rather than demo data.
    const unsub = subscribeAlerts(
      (records) => {
        setEvents(records.map((r, i) => toEvent(String(r.id ?? i), r)));
        setState('ready');
      },
      () => setState('error'),
    );
    return unsub;
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (!query.trim()) return events;
    const q = query.toLowerCase();
    return events.filter((e) => e.message.toLowerCase().includes(q));
  }, [query, events]);

  const glyphColor = (status: Status) => statusColor(colors, status).fg;
  const contentMax = tier === 'expanded' ? 880 : tier === 'medium' ? 720 : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
      <View style={contentMax ? { width: '100%', maxWidth: contentMax, alignSelf: 'center', flex: 1 } : { flex: 1 }}>
        <Text style={[typography.h1, { color: colors.textPrimary }]}>Alerts</Text>
        <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4, fontSize: 16 }]}>
          Alerts recorded by your devices, newest first
        </Text>
        {notifPermission === 'denied' && Platform.OS !== 'web' ? (
          <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <ActionButton
              variant="secondary"
              onPress={() => {
                ensureNotificationPermission().then((granted) =>
                  setNotifPermission(granted ? 'granted' : 'denied')
                );
              }}
              accessibilityLabel="Enable alert notifications"
              accessibilityHint="Allows PigPulse to notify you when a new alert arrives"
            >
              Enable notifications
            </ActionButton>
          </View>
        ) : null}

        {state === 'ready' ? (
          <View
            style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radius.md, marginTop: spacing.xl, marginBottom: spacing.lg }]}
          >
            <SearchIcon size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search alerts, e.g. fever, cough"
              placeholderTextColor={colors.textMuted}
              style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 9, fontSize: 16 }]}
              accessibilityLabel="Search alerts"
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl }} />
        )}

        {state === 'loading' ? (
          <Skeleton rows={4} />
        ) : state === 'error' ? (
          <ListGroup>
            <EmptyState
              icon={<AlertIcon size={18} color={colors.alert} />}
              title="Couldn't load alerts"
              message="Something went wrong reaching the data source. Check the connection and try again."
            />
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
              <ActionButton
                variant="secondary"
                onPress={() => setReloadKey((k) => k + 1)}
                accessibilityLabel="Retry loading alerts"
                accessibilityHint="Reloads the alerts list"
              >
                Retry
              </ActionButton>
            </View>
          </ListGroup>
        ) : filtered.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title={query ? 'No matching alerts' : 'No alerts yet'}
              message={
                query
                  ? 'Try a different search term.'
                  : 'Alerts recorded by your devices will appear here.'
              }
            />
          </ListGroup>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.xxl + 60 }}
            renderItem={({ item }) => (
              <View style={[styles.eventCard, { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }]}>
                <View style={styles.eventTop}>
                  <Badge
                    label={item.label}
                    status={item.status}
                    icon={kindGlyph(item.kind, glyphColor(item.status))}
                  />
                  {item.timestamp ? (
                    <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>{item.timestamp}</Text>
                  ) : null}
                </View>
                <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm, fontSize: 16, lineHeight: 23 }]}>
                  {item.message}
                </Text>
                {/* The event type is always rendered, including the raw token for
                    rows the classifier did not recognise. */}
                <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 6, fontSize: 16 }]}>
                  {typeDisplay(item)}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  eventCard: {},
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
