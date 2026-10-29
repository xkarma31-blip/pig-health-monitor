import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useTheme } from '../theme';
import { ThermalLiveView } from '../components/ThermalLiveView';
import { ChevronLeftIcon } from '../components/primitives/Icons';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';
import { loadFarmerSetup } from '../utils/setupStore';

/**
 * Fullscreen thermal view. When a real frame is streaming it renders the
 * MLX90640 32×24 grid; otherwise it shows the built-in simulated herd with
 * an explicit DEMO badge — a simulation must never masquerade as live data.
 * A button opens the real Pi dashboard (separate view, local network only).
 */
export default function ThermalScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const tier = useBreakpoint();
  const [scale] = useState(1);
  const [piDashboardUrl, setPiDashboardUrl] = useState<string | null>(null);

  // Derive the local Pi dashboard URL from the farmer-saved PocketBase
  // address (same host, thermal-pi HTTPS port). Null until setup completes.
  useEffect(() => {
    let mounted = true;
    loadFarmerSetup()
      .then((setup) => {
        if (!mounted || !setup.pbUrl) return;
        try {
          const host = new URL(setup.pbUrl).hostname;
          if (host) setPiDashboardUrl(`https://${host}:8080/`);
        } catch {
          /* malformed saved address: leave button disabled */
        }
      })
      .catch(() => { /* keep disabled */ });
    return () => { mounted = false; };
  }, []);

  const openPiDashboard = () => {
    playSound('tap');
    haptic('light');
    if (piDashboardUrl) Linking.openURL(piDashboardUrl).catch(() => { /* device has no handler */ });
  };

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
        <View style={styles.demoBadgeRow}>
          <View style={[styles.demoBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontWeight: '700' }]}>
              DEMO SIMULATION — not live sensor data
            </Text>
          </View>
        </View>
        <ThermalLiveView width={viewSize} height={Math.round(viewSize * 0.75)} isFullscreen />
        <TouchableOpacity
          style={[
            styles.piButton,
            { backgroundColor: piDashboardUrl ? colors.accent : colors.surfaceVariant, borderRadius: radius.md },
          ]}
          activeOpacity={0.85}
          onPress={openPiDashboard}
          disabled={!piDashboardUrl}
          accessibilityRole="button"
          accessibilityLabel="Open live Pi dashboard"
          accessibilityHint={
            piDashboardUrl
              ? 'Opens the real thermal camera view in your browser. Requires the PigPulse Wi-Fi network.'
              : 'Disabled until a device address is saved in setup'
          }
        >
          <Text style={[typography.body, { color: piDashboardUrl ? colors.onAccent : colors.textSecondary, fontWeight: '600' }]}>
            {piDashboardUrl ? 'Open live Pi dashboard →' : 'Live Pi dashboard: finish setup to enable'}
          </Text>
        </TouchableOpacity>
        {piDashboardUrl ? (
          <Text style={[typography.bodySmall, { color: colors.textMuted, marginTop: 8, textAlign: 'center', maxWidth: 420 }]}>
            Opens in your browser · requires PigPulse Wi-Fi · the certificate is self-signed (accept once)
          </Text>
        ) : null}
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
  piButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, minHeight: 44, minWidth: 240, alignItems: 'center' },
});
