import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View, StyleSheet } from 'react-native';
import { useTheme, statusColor, type Status } from '../../theme';
import { Badge, EmptyState, ListGroup, SearchIcon, Skeleton, ThermometerIcon, WaveformIcon } from '../../components/primitives';
import { subscribeAlerts } from '../../utils/firebase';

type EventItem = {
  id: string;
  timestamp: string;
  message: string;
  status: Status;
  label: string;
  type: 'thermal' | 'sound';
  confidence?: number;
  model?: string;
};

// Map Firebase alert types to local UI types
function mapAlertToEvent(alert: Record<string, unknown>): EventItem {
  const type = (alert.type as string) || '';
  const severity = (alert.severity as string) || 'INFO';
  const isCough = type.includes('COUGH') || type === 'COUGH_DETECTED';
  const isThermal = type.includes('TEMP') || type.includes('FEVER') || type === 'STORAGE_FULL';

  let status: Status = 'info';
  if (severity === 'HIGH' || severity === 'CRITICAL') status = 'alert';
  else if (severity === 'MEDIUM' || severity === 'LOW') status = 'watch';

  const label = status === 'alert' ? 'Critical' : status === 'watch' ? 'Warning' : 'Info';

  // Format timestamp
  const ts = alert.timestamp as number;
  const timestamp = ts
    ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Unknown';

  return {
    id: alert.id as string,
    timestamp,
    message: (alert.message as string) || `${type} event`,
    status,
    label,
    type: isCough ? 'sound' : isThermal ? 'thermal' : 'sound',
    confidence: alert.confidence as number | undefined,
    model: alert.model as string | undefined,
  };
}

export default function EventsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    const unsub = subscribeAlerts((alerts) => {
      setEvents(alerts.map(mapAlertToEvent));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return events;
    const q = query.toLowerCase();
    return events.filter((e) => e.message.toLowerCase().includes(q));
  }, [query, events]);

  const glyphColor = (status: Status) => statusColor(colors, status).fg;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
      <Text style={typography.h1}>Events</Text>
      <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4 }]}>
        Searchable log of sound and temperature triggers
      </Text>

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
              {(item.confidence != null || item.model) && (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  {item.confidence != null && (
                    <Badge label={`${Math.round(item.confidence * 100)}% conf`} status="info" />
                  )}
                  {item.model && (
                    <Badge label={item.model} status="info" />
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  eventCard: {},
  eventTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});