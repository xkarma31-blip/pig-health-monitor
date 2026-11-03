import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { ChevronLeftIcon } from '../components/primitives/Icons';
import { LiveThermalPanel, piSubtitle } from '../components/LiveThermalPanel';
import { usePiThermal } from '../hooks/usePiThermal';
import { goBackOrHome } from '../utils/navigation';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

/**
 * Full-screen thermal view — the same LiveThermalPanel as the Live tab, with
 * the deep-link-safe Back affordance.
 */
export default function ThermalScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const pi = usePiThermal();

  const goBack = () => {
    playSound('tap');
    haptic('light');
    goBackOrHome(router, '/tabs/live');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.surface, borderRadius: radius.md }]}
            activeOpacity={0.85}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            accessibilityHint="Closes the thermal view"
          >
            <ChevronLeftIcon size={18} color={colors.textPrimary} />
            <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: 6 }]}>Back</Text>
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>Thermal view</Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>{piSubtitle(pi)}</Text>
          </View>
        </View>

        <LiveThermalPanel pi={pi} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  titleWrap: { marginLeft: 14 },
});
