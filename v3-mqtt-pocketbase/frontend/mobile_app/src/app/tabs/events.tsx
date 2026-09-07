import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View, StyleSheet } from 'react-native';
import { useTheme, statusColor, type Status } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { subscribeAlerts } from '../../utils/pocketbase-data';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  Badge,
  EmptyState,
  ListGroup,
  SearchIcon,
  Skeleton,
  ThermometerIcon,
  WaveformIcon,
} from '../../components/primitives';

type EventItem = {
  id: string;
  timestamp: string;
  message: string;
  status: Status;
  label: string;
  type: 'thermal' | 'sound';
};

// Demo log shown while signed out — replaced by the live /alerts stream on sign-in.
const DEMO_EVENTS: EventItem[] = [
  { id: '1', timestamp: 'Apr 7, 9:15 AM', message: 'Body temperature elevated to 39.5°C — monitoring closely.', status: 'watch', label: 'Warning', type: 'thermal' },
  { id: '2', timestamp: 'Apr 7, 8:45 AM', message: 'Acoustic sensor calibrated successfully.', status: 'info', label: 'Info', type: 'sound' },
  { id: '3', timestamp: 'Apr 6, 3:22 AM', message: 'Temperature spike detected: 41.2°C at 03:22, auto-resolved.', status: 'alert', label: 'Critical', type: 'thermal' },
  { id: '4', timestamp: 'Apr 5, 4:10 PM', message: 'Possible cough pattern detected — 2 events in 30 minutes.', status: 'watch', label: 'Warning', type: 'sound' },
];

function formatTimestamp(value: unknown): string {
  const ts = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  if (!Number.isFinite(ts)) return String(value ?? '');
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function mapAlert(id: string, record: Record<string, unknown>): EventItem {
  const severity = String(record.severity || record.level || record.status || 'info').toUpperCase();
  const status: Status =
    severity === 'CRITICAL' || severity === 'HIGH' || severity === 'ALERT'
      ? 'alert'
      : severity === 'WARNING' || severity === 'ELEVATED' || severity === 'WATCH'
        ? 'watch'
        : 'info';
  const label =
    status === 'alert' ? 'Critical' : status === 'watch' ? 'Warning' : 'Info';
  const rawType = String(record.type || record.source || 'thermal').toLowerCase();
  const message =
    (typeof record.message === 'string' && record.message) ||
    (typeof record.description === 'string' && record.description) ||
    (typeof record.title === 'string' && record.title) ||
    `${String(record.type || 'Sensor')} event recorded`;
  return {
    id,
    timestamp: formatTimestamp(record.timestamp ?? record.ts ?? record.createdAt),
    message,
    status,
    label,
    type: rawType.includes('sound') || rawType.includes('audio') ? 'sound' : 'thermal',
  };
}

export default function EventsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { user } = useAuth();
  const tier = useBreakpoint();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveEvents, setLiveEvents] = useState<EventItem[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 750);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user || user.admin) return;  // admin → mock demo events
    const unsub = subscribeAlerts((records) => {
      setLiveEvents(records.map((r, i) => mapAlert(String(r.id ?? i), r)));
    });
    return unsub;
  }, [user]);

  // Signed out → demo log; signed in → live stream (demo until first snapshot).
  const events = user && !user.admin && liveEvents ? liveEvents : DEMO_EVENTS;

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
        <Text style={[typography.h1, { color: colors.textPrimary }]}>Events</Text>
        <View style={styles.subtitleRow}>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4, flex: 1 }]}>
            Searchable log of sound and temperature triggers
          </Text>
          {!user ? (
            <View style={[styles.demoPill, { backgroundColor: colors.badgeBg }]}>
              <Text style={[typography.label, { color: colors.badgeText, fontSize: 10 }]}>DEMO DATA</Text>
            </View>
          ) : null}
        </View>

        <View
          style={[styles.searchBar, { backgroundColor: colors.surface, borderRadius: radius.md, marginTop: spacing.xl, marginBottom: spacing.lg }]}
        >
          <SearchIcon size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, e.g. fever, cough"
            placeholderTextColor={colors.textMuted}
            style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 9, fontSize: 15 }]}
            accessibilityLabel="Search events"
          />
        </View>

        {loading ? (
          <Skeleton rows={4} />
        ) : filtered.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<ThermometerIcon size={18} color={colors.accent} />}
              title={query ? 'No matching events' : 'No events yet'}
              message={query ? 'Try a different search term.' : 'Fever and cough alerts will show up here as they happen.'}
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
                    icon={
                      item.type === 'sound' ? (
                        <WaveformIcon size={13} color={glyphColor(item.status)} />
                      ) : (
                        <ThermometerIcon size={11} color={glyphColor(item.status)} />
                      )
                    }
                  />
                  <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{item.timestamp}</Text>
                </View>
                <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 20 }]}>
                  {item.message}
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
  subtitleRow: { flexDirection: 'row', alignItems: 'center' },
  demoPill: {
    alignSelf: 'flex-start',
    marginLeft: 10,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  eventCard: {},
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
