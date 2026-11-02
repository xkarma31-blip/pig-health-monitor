import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, type Status } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { enrollAnonymousPig, subscribeRoster } from '../utils/pocketbase-data';
import { anonymousCode } from '../utils/anonymous';
import {
  ChevronLeftIcon,
  EmptyState,
  ListGroup,
  ListRow,
  PlusIcon,
  Skeleton,
  useToast,
} from '../components/primitives';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

/**
 * Research log — the demoted roster.
 *
 * This screen is deliberately NOT a tab. The live monitor owns the app; this is
 * a secondary research surface, reached from the monitor and from settings.
 *
 * Anonymity is structural, not cosmetic:
 *   - enrollment writes only `pigId`, `healthStatus`, `tags`
 *   - the UI reads only `pigId` / record id (see utils/anonymous.ts)
 *   - a stored human name is never read, so it cannot leak into a screenshot
 */

type Entry = {
  id: string;
  code: string;
  status: Status;
  label: string;
  enrolled: string;
};

function statusOf(record: Record<string, unknown>): { status: Status; label: string } {
  const health = String(record.healthStatus || 'NORMAL').toUpperCase();
  const tags = Array.isArray(record.tags) ? record.tags.map((t) => String(t).toUpperCase()) : [];
  if (health === 'CRITICAL' || health === 'FEVER' || health === 'ALERT' || tags.some((t) => t === 'FEVER' || t === 'CRITICAL')) {
    return { status: 'alert', label: 'Check soon' };
  }
  if (health === 'ELEVATED' || health === 'WATCH' || tags.some((t) => t === 'COUGH' || t === 'WATCH')) {
    return { status: 'watch', label: 'Watch' };
  }
  return { status: 'healthy', label: 'Normal' };
}

function toEntry(record: Record<string, unknown>, index: number): Entry {
  const id = String(record.id ?? index);
  const { status, label } = statusOf(record);
  return {
    id,
    code: anonymousCode({ id, pigId: record.pigId }),
    status,
    label,
    enrolled: `record ${id.slice(0, 8)}`,
  };
}

export default function ResearchLogScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const tier = useBreakpoint();
  const { showToast } = useToast();

  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [syncError, setSyncError] = useState(false);

  /**
   * No artificial delay: a screen that fakes a 900 ms load and then reports
   * "No entries yet" when the network failed is misreporting an outage as an
   * empty log. `records === null` is the only loading state, and a query
   * failure sets `syncError` so the screen can say so.
   */
  const loading = records === null && !syncError;

  useEffect(() => {
    const unsubscribe = subscribeRoster(
      (rows) => {
        setRecords(rows);
        setLastRefresh(Date.now());
        setSyncError(false);
      },
      () => setSyncError(true),
    );
    return unsubscribe;
  }, []);

  const entries = useMemo(
    () =>
      (records ?? [])
        .map(toEntry)
        .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    [records],
  );

  const addSlot = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const created = await enrollAnonymousPig();
      playSound('success');
      haptic('light');
      showToast(`${anonymousCode({ id: created.id, pigId: created.pigId })} added to the log`);
    } catch {
      showToast('Could not add a slot — check the connection');
    } finally {
      setSaving(false);
    }
  };

  const contentMax = tier === 'expanded' ? 880 : tier === 'medium' ? 720 : undefined;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg, flex: 1 }]}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: spacing.xxl + 40 },
        contentMax ? { width: '100%', maxWidth: contentMax, alignSelf: 'center' } : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={() => {
            playSound('tap');
            haptic('light');
            router.back();
          }}
          style={[styles.back, { backgroundColor: colors.surface, borderRadius: radius.md }]}
          accessibilityRole="button"
          accessibilityLabel="Back to the live monitor"
        >
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: 4, fontSize: 16 }]}>
            Monitor
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[typography.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>
        Research log
      </Text>
      <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 6, fontSize: 16 }]}>
        Anonymous observation slots. The live monitor is the main view; this log exists for
        the study record, not for daily operation.
      </Text>

      {/* Anonymity notice — the constraint that matters for the paper. */}
      <View
        style={[
          styles.notice,
          { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md },
        ]}
      >
        <Text style={[typography.h2, { color: colors.textPrimary, fontSize: 16 }]}>
          No names are stored
        </Text>
        <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16, marginTop: 4 }]}>
          Every animal is a <Text style={{ color: colors.accent, fontWeight: '700' }}>P-####</Text> code.
          Enrollment writes the code, health status and tags only — never a name, never a photo.
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={addSlot}
        disabled={saving}
        style={[
          styles.addBtn,
          {
            backgroundColor: colors.accent,
            borderRadius: radius.md,
            opacity: saving ? 0.6 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add an anonymous observation slot"
      >
        <PlusIcon size={16} color={colors.onAccent} />
        <Text style={[typography.h2, { color: colors.onAccent, marginLeft: 8, fontSize: 16 }]}>
          {saving ? 'Adding…' : 'Add observation slot'}
        </Text>
      </TouchableOpacity>

      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Log entries</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
            {entries.length} code{entries.length === 1 ? '' : 's'}
          </Text>
        </View>

        {syncError && entries.length === 0 ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.alertSoft, borderColor: colors.alert, borderRadius: radius.md },
            ]}
          >
            <Text style={[typography.h2, { color: colors.alert, fontSize: 16 }]}>
              Could not reach PocketBase
            </Text>
            <Text style={[typography.bodySmall, { color: colors.textPrimary, fontSize: 16, marginTop: 4 }]}>
              The log is unknown, not empty — a failed query looks identical to an empty collection
              if we pretend otherwise. Check the connection, then pull to the monitor and back.
            </Text>
          </View>
        ) : loading ? (
          <Skeleton rows={3} />
        ) : entries.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<PlusIcon size={18} color={colors.accent} />}
              title="No entries yet"
              message="Add an observation slot to start the anonymous research log."
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {entries.map((entry, index) => (
              <ListRow
                key={entry.id}
                title={entry.code}
                subtitle={`${entry.label} · ${entry.enrolled}`}
                value={entry.label}
                status={entry.status}
                index={index}
              />
            ))}
          </ListGroup>
        )}
      </View>

      <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: spacing.lg, fontSize: 16 }]}>
        {lastRefresh
          ? `Log synced at ${new Date(lastRefresh).toLocaleTimeString()}`
          : 'Waiting for the first sync from PocketBase'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: { flexDirection: 'row' as const, alignItems: 'center', justifyContent: 'space-between' },
  back: { flexDirection: 'row' as const, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 },
  notice: { borderWidth: 1, padding: 14, marginTop: 16 },
  addBtn: { flexDirection: 'row' as const, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 14 },
  sectionHead: { flexDirection: 'row' as const, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  errorCard: { borderWidth: 1, padding: 14 },
});
