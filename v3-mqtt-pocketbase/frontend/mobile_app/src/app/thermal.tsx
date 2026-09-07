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
 * Fullscreen live thermal feed. Renders the MLX90640 32×24 grid from
 * telemetry when a frame is streaming, otherwise the built-in simulated
 * herd so the view is always demonstrable.
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
          accessibilityHint="Closes the live thermal view"
        >
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={[typography.h2, { color: colors.textPrimary, marginLeft: 6 }]}>Back</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>Live thermal feed</Text>
          <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 12.5 }]}>
            Node B · MLX90640 · 32×24
          </Text>
        </View>
      </View>

      <View style={styles.stage}>
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
});
