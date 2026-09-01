import React, { useEffect, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTheme, type Status } from '../../theme';
import { EmptyState, ListGroup, ListRow, PigPlusIcon, PlusIcon, Skeleton, useToast } from '../../components/primitives';

type Pig = { id: string; name: string; enrolled: string; temp: string; status: Status; trend: number[] };

// Replace with your Firebase RTDB /users/{uid}/roster/ listener.
const HERD: Pig[] = [
  { id: 'wilbur', name: 'Wilbur', enrolled: 'Enrolled May 12', temp: '38.9°C', status: 'healthy', trend: [38.7, 38.8, 38.9, 38.8, 38.9, 38.9] },
  { id: 'babe', name: 'Babe', enrolled: 'Enrolled May 15', temp: '39.1°C', status: 'healthy', trend: [39.0, 39.0, 39.1, 39.0, 39.1, 39.1] },
  { id: 'porky', name: 'Porky', enrolled: 'Enrolled May 20', temp: '40.2°C', status: 'alert', trend: [38.9, 39.2, 39.6, 39.9, 40.0, 40.2] },
];

function EnrollButton({ onPress }: { onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));

  const bounce = () => {
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }),
    ]).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          bounce();
          onPress();
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
  );
}

export default function RosterScreen() {
  const { colors, spacing, typography } = useTheme();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 950);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={typography.h1}>Roster</Text>
      <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.xl }]}>
        Manual enrollment and per-pig health
      </Text>

      <EnrollButton onPress={() => showToast('Enrollment coming soon')} />

      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.sectionHead}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Active herd</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{HERD.length} pigs</Text>
        </View>
        {loading ? (
          <Skeleton rows={3} />
        ) : HERD.length === 0 ? (
          <ListGroup>
            <EmptyState
              icon={<PigPlusIcon size={18} color={colors.accent} />}
              title="No pigs enrolled yet"
              message='Tap "Enroll new pig" above to add your first one to the roster.'
            />
          </ListGroup>
        ) : (
          <ListGroup>
            {HERD.map((pig, i) => (
              <ListRow key={pig.id} title={pig.name} subtitle={pig.enrolled} value={pig.temp} status={pig.status} trend={pig.trend} index={i} />
            ))}
          </ListGroup>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  enrollButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
});