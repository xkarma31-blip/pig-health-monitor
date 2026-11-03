import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { ThermalLiveView } from '../components/ThermalLiveView';
import { ChevronLeftIcon } from '../components/primitives/Icons';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

/**
 * Fullscreen thermal view. When a real frame is streaming it renders the
 * MLX90640 32×24 grid; otherwise it shows the built-in simulated herd with
 * an explicit DEMO badge — a simulation must never masquerade as live data.
 */
export default function ThermalScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const tier = useBreakpoint();
  const [scale] = useState(1);

  const viewSize = tier === 'expanded' ? 560 : tier === 'medium' ? 480 : 340;

  const goBack = () => {
    playSound('tap');
    haptic('light');
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: colors.surface, borderRadius: radius.md, transform: [{ scale }] },
          ]}
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
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>
            Preview of the thermal camera grid
          </Text>
        </View>
      </View>

      <View style={styles.stage}>
        <View style={styles.demoBadgeRow}>
          <View style={[styles.demoBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontWeight: '700' }]}>
              DEMO SIMULATION — not live sensor data
            </Text>
          </View>
        </View>
        <ThermalLiveView width={viewSize} height={Math.round(viewSize * 0.75)} isFullscreen />
      </View>
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
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  demoBadgeRow: { marginBottom: 12 },
  demoBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
});
