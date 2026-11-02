import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useTheme, type Status } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { enrollPig, subscribeRoster } from '../../utils/pocketbase-data';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  EmptyState,
  ListGroup,
  ListRow,
  PigPlusIcon,
  PlusIcon,
  Skeleton,
  useToast,
} from '../../components/primitives';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

type Pig = { id: string; name: string; enrolled: string; temp?: string; status: Status; trend?: number[] };

// Demo herd shown while signed out — replaced by the live /roster stream on sign-in.
const DEMO_HERD: Pig[] = [
  { id: 'wilbur', name: 'Wilbur', enrolled: 'Enrolled May 12', temp: '38.9°C', status: 'healthy', trend: [38.7, 38.8, 38.9, 38.8, 38.9, 38.9] },
  { id: 'babe', name: 'Babe', enrolled: 'Enrolled May 15', temp: '39.1°C', status: 'healthy', trend: [39.0, 39.0, 39.1, 39.0, 39.1, 39.1] },
  { id: 'porky', name: 'Porky', enrolled: 'Enrolled May 20', temp: '40.2°C', status: 'alert', trend: [38.9, 39.2, 39.6, 39.9, 40.0, 40.2] },
];

function formatEnrolled(value: unknown): string {
  const ts = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  if (!Number.isFinite(ts)) return 'Recently enrolled';
  return `Enrolled ${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function pigStatus(record: Record<string, unknown>): Status {
  const hs = String(record.healthStatus || 'NORMAL').toUpperCase();
  const tags = Array.isArray(record.tags) ? record.tags.map((t) => String(t).toUpperCase()) : [];
  if (hs === 'CRITICAL' || hs === 'FEVER' || hs === 'ALERT' || tags.some((t) => t === 'FEVER' || t === 'CRITICAL')) return 'alert';
  if (hs === 'ELEVATED' || hs === 'WATCH' || tags.some((t) => t === 'COUGH' || t === 'WATCH')) return 'watch';
  return 'healthy';
}

function mapPig(id: string, record: Record<string, unknown>): Pig {
  return {
    id,
    name: String(record.name || `Pig ${id.slice(0, 4)}`),
    enrolled: formatEnrolled(record.enrolledAt ?? record.lastSeen),
    temp: typeof record.temp === 'string' ? record.temp : undefined,
    status: pigStatus(record),
  };
}

function EnrollModal({
  visible,
  onClose,
  onSubmit,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  saving: boolean;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const [name, setName] = useState('');

  // Fresh form every time the dialog opens.
  const close = () => {
    setName('');
    onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    onSubmit(trimmed);
    setName('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalScrim, { backgroundColor: colors.overlay + '99' }]}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
          ]}
        >
          <Text style={[typography.title, { color: colors.textPrimary }]}>Enroll new pig</Text>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 6 }]}>
            Keep the pig near Node A (INMP441) so a reference audio signature can be captured.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pig name, e.g. Wilbur"
            placeholderTextColor={colors.textMuted}
            autoFocus
            onSubmitEditing={submit}
            style={[
              typography.body,
              styles.nameInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.backgroundVariant,
                borderColor: colors.border,
                borderRadius: radius.md,
                marginTop: spacing.lg,
              },
            ]}
            accessibilityLabel="Pig name"
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={() => {
                playSound('tap');
                close();
              }}
              style={[styles.modalBtn, { minHeight: 44, justifyContent: 'center' }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel enrollment"
            >
              <Text style={[typography.h2, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={!name.trim() || saving}
              style={[
                styles.modalBtn,
                styles.submitBtn,
                {
                  backgroundColor: colors.accent,
                  borderRadius: radius.md,
                  minHeight: 44,
                  justifyContent: 'center',
                  opacity: !name.trim() || saving ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Confirm enrollment"
            >
              <Text style={[typography.h2, { color: colors.onAccent }]}>
                {saving ? 'Enrolling…' : 'Enroll'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function RosterScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const tier = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [liveHerd, setLiveHerd] = useState<Pig[] | null>(null);
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 950);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // End-user role → live roster from PocketBase. Admin & guests see mock (legacy demo).
    if (!user || user.admin) return;
    const unsub = subscribeRoster((records) => {
      setLiveHerd(records.map((r, i) => mapPig(String(r.id ?? i), r)));
    });
    return unsub;
  }, [user]);

  // Signed out → demo herd; signed in → live stream.
  const herd = user && !user.admin && liveHerd ? liveHerd : DEMO_HERD;

  const sorted = useMemo(
    () =>
      [...herd].sort((a, b) => {
        const rank = (s: Status) => (s === 'alert' ? 0 : s === 'watch' ? 1 : 2);
        return rank(a.status) - rank(b.status);
      }),
    [herd],
  );

  const bounce = () => {
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }),
    ]).start();
  };

  const handleEnroll = async (name: string) => {
    if (!user || user.admin) {
      setEnrollOpen(false);
      showToast('Sign in to enroll pigs');
      return;
    }
    setSaving(true);
    try {
      await enrollPig(name);
      playSound('success');
      showToast(`${name} enrolled — capture running on Node A`);
      setEnrollOpen(false);
    } catch {
      showToast('Enrollment failed — check your connection');
    } finally {
      setSaving(false);
    }
  };

  const contentMax = tier === 'expanded' ? 880 : tier === 'medium' ? 720 : undefined;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg, flex: 1 }]}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: spacing.xxl + 60 },
        contentMax ? { width: '100%', maxWidth: contentMax, alignSelf: 'center' } : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.h1, { color: colors.textPrimary }]}>Roster</Text>
      <View style={styles.subtitleRow}>
        <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4, flex: 1 }]}>
          Manual enrollment and per-pig health
        </Text>
        {!user ? (
          <View style={[styles.demoPill, { backgroundColor: colors.badgeBg }]}>
            <Text style={[typography.label, { color: colors.badgeText, fontSize: 10 }]}>DEMO DATA</Text>
          </View>
        ) : null}
      </View>

      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            bounce();
            playSound('tap');
            haptic('light');
            setEnrollOpen(true);
          }}
          style={[styles.enrollButton, { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md + 3 }]}
          accessibilityRole="button"
          accessibilityLabel="Enroll new pig"
          accessibilityHint="Adds a new pig to the roster"
        >
          <PlusIcon size={16} color={colors.onAccent} />
          <Text style={[typography.h2, { color: colors.onAccent, marginLeft: 8, fontSize: 15 }]}>Enroll new pig</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Active herd</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{sorted.length} pigs</Text>
        </View>
        {loading ? (
          <Skeleton rows={3} />
        ) : sorted.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<PigPlusIcon size={18} color={colors.accent} />}
              title="No pigs enrolled yet"
              message='Tap "Enroll new pig" above to add your first one to the roster.'
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {sorted.map((pig, i) => (
              <ListRow
                key={pig.id}
                title={pig.name}
                subtitle={pig.enrolled}
                value={pig.temp}
                status={pig.status}
                trend={pig.trend}
                index={i}
              />
            ))}
          </ListGroup>
        )}
      </View>

      <EnrollModal
        visible={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onSubmit={handleEnroll}
        saving={saving}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  demoPill: {
    alignSelf: 'flex-start',
    marginLeft: 10,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  enrollButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  modalScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420 },
  nameInput: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  submitBtn: { marginLeft: 10, paddingHorizontal: 22 },
});
