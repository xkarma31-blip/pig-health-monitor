import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { LiveThermalPanel, piSubtitle } from '../../components/LiveThermalPanel';
import { usePiThermal } from '../../hooks/usePiThermal';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

/**
 * Live tab — every live barn feed in one place: the thermal view (real Pi
 * console data when reachable, honest states when not), quick access to the
 * Roster (which now lives here instead of its own tab), and the stream notes.
 */
export default function LiveScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const pi = usePiThermal();

  const open = (path: string) => {
    playSound('tap');
    haptic('light');
    router.push(path);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl + 72 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Text style={[typography.h1, { color: colors.textPrimary }]}>Live</Text>
          <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4 }]}>{piSubtitle(pi)}</Text>
        </View>

        <LiveThermalPanel pi={pi} />

        {/* Quick links — the Roster moved under Live */}
        <View style={[styles.links, { paddingHorizontal: spacing.lg, marginTop: spacing.lg }]}>
          <TouchableOpacity
            onPress={() => open('/tabs/roster')}
            accessibilityRole="button"
            accessibilityLabel="Open roster"
            accessibilityHint="Opens the pig roster"
            style={[
              styles.linkBtn,
              { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md },
            ]}
          >
            <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '600' }]}>Roster →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => open('/thermal')}
            accessibilityRole="button"
            accessibilityLabel="Open full thermal view"
            accessibilityHint="Opens the thermal view full screen"
            style={[
              styles.linkBtn,
              { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.md },
            ]}
          >
            <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '600' }]}>Full screen →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});
