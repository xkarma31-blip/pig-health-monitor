import { Link } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Theme } from '../../constants/Theme';
import { useOfflineTelemetry } from '../../hooks/useOfflineTelemetry';
import { SensorCard } from '../../components/SensorCard';
import { AlertRow } from '../../components/AlertRow';
import { FadeInView } from '../../components/Animated/FadeInView';
import { PulseView } from '../../components/Animated/PulseView';
import { ScalePressable } from '../../components/Animated/ScalePressable';

export default function HomeFeedScreen() {
  const telemetry = useOfflineTelemetry();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Header with staggered entrance === */}
      <FadeInView delay={0} duration={500}>
        <View style={styles.header}>
          <Text style={styles.title}>PIGPULSE</Text>
          <Text style={styles.subtitle}>Sovereign Aqua Protocol</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v2.1.0 — AQUA</Text>
          </View>
        </View>
      </FadeInView>

      {/* === Connection Status Banner with pulse === */}
      <FadeInView delay={100} duration={500}>
        <PulseView active={!telemetry.isOfflineMode} duration={3000} minScale={0.99} maxScale={1.01}>
          <View style={[
            styles.connectionBanner, 
            telemetry.isOfflineMode ? styles.bannerOffline : styles.bannerOnline
          ]}>
            <View style={[styles.statusDot, telemetry.isOfflineMode ? styles.dotOffline : styles.dotOnline]} />
            <Text style={styles.bannerIcon}>{telemetry.isOfflineMode ? '📡' : '☁️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {telemetry.isOfflineMode ? 'LOCAL OFFLINE MODE' : 'CLOUD ONLINE MODE'}
              </Text>
              <Text style={styles.bannerSub}>
                {telemetry.isOfflineMode ? 'Connected directly to ESP32 Gateway via AP (192.168.4.1)' : 'Connected securely to Firebase RTDB'}
              </Text>
            </View>
            {telemetry.isConnecting && <ActivityIndicator color={Theme.colors.primary} size="small" />}
          </View>
        </PulseView>
      </FadeInView>

      {/* === Access Feed Button (TV MODE) with scale press === */}
      <FadeInView delay={200} duration={500}>
        <Link href="/feed" asChild>
          <ScalePressable sound="navigate" scaleDown={0.97} style={styles.feedButton}>
            <View style={styles.feedButtonLeft}>
              <Text style={styles.feedButtonIcon}>📹</Text>
              <View>
                <Text style={styles.feedButtonTitle}>LIVE THERMAL FEED</Text>
                <Text style={styles.feedButtonSub}>Node B Streaming (32x24 Array)</Text>
              </View>
            </View>
            <View style={styles.badgeContainer}>
              <PulseView duration={2500} minScale={0.95} maxScale={1.05}>
                <Text style={styles.badgeText}>● LIVE</Text>
              </PulseView>
            </View>
          </ScalePressable>
        </Link>
      </FadeInView>

      {/* === Live Sensors === */}
      <FadeInView delay={300} duration={500}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Telemetry Data</Text>
          <View style={styles.sectionLine} />
        </View>
      </FadeInView>

      {telemetry.error ? (
        <FadeInView delay={350}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>🔒 {telemetry.error}</Text>
          </View>
        </FadeInView>
      ) : telemetry.sensors.length > 0 ? (
        telemetry.sensors.slice(0, 2).map((sensor, i) => (
          <FadeInView key={sensor.id} delay={350 + i * 100} duration={400}>
            <SensorCard sensor={sensor} compact={false} />
          </FadeInView>
        ))
      ) : (
        <ActivityIndicator color={Theme.colors.primary} style={{ marginVertical: 20 }} />
      )}
      
      {/* === Quick Alerts === */}
      <FadeInView delay={500} duration={500}>
        <View style={[styles.sectionHeader, { marginTop: Theme.spacing.lg }]}>
          <Text style={styles.sectionTitle}>Quick Alerts</Text>
          <View style={styles.sectionLine} />
        </View>
      </FadeInView>

      {telemetry.error ? (
        <FadeInView delay={550}>
          <Text style={{ color: Theme.colors.textMuted, fontSize: Theme.typography.body }}>Log in to view cloud alert history.</Text>
        </FadeInView>
      ) : telemetry.alerts.length > 0 ? (
        telemetry.alerts.slice(0, 2).map((alert, i) => (
          <FadeInView key={alert.id} delay={550 + i * 100} duration={400}>
            <AlertRow alert={alert} />
          </FadeInView>
        ))
      ) : (
        <FadeInView delay={550}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>All Clear — No Active Alerts</Text>
          </View>
        </FadeInView>
      )}

      {/* === Footer === */}
      <FadeInView delay={700} duration={600}>
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>SOVEREIGN AQUA PROTOCOL • {new Date().getFullYear()}</Text>
          <Text style={styles.footerSub}>PigPulse IoT Capstone — Kharl Standard</Text>
        </View>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
    paddingBottom: 120,
  },
  header: {
    marginBottom: Theme.spacing.xl,
  },
  title: {
    fontSize: Theme.typography.h1,
    color: Theme.colors.primary,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textSecondary,
    marginTop: 4,
    letterSpacing: 5,
    textTransform: 'uppercase',
  },
  versionBadge: {
    alignSelf: 'flex-start',
    marginTop: Theme.spacing.xs,
    backgroundColor: Theme.colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
  },
  versionText: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  connectionBanner: {
    flexDirection: 'row',
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    marginBottom: Theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  bannerOnline: {
    backgroundColor: '#0A1A1A',
    borderColor: Theme.colors.success + '44',
  },
  bannerOffline: {
    backgroundColor: '#1A150D',
    borderColor: Theme.colors.warning + '44',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOnline: {
    backgroundColor: Theme.colors.success,
  },
  dotOffline: {
    backgroundColor: Theme.colors.warning,
  },
  bannerIcon: {
    fontSize: 24,
    marginRight: Theme.spacing.md,
  },
  bannerTitle: {
    color: Theme.colors.text,
    fontSize: Theme.typography.body,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  bannerSub: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  feedButton: {
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.xl,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  feedButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedButtonIcon: {
    fontSize: 32,
    marginRight: Theme.spacing.md,
  },
  feedButtonTitle: {
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
    color: Theme.colors.text,
    letterSpacing: 1,
  },
  feedButtonSub: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.primaryDim,
    marginTop: 2,
  },
  badgeContainer: {
    backgroundColor: Theme.colors.danger + '22',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.danger + '66',
  },
  badgeText: {
    color: Theme.colors.danger,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.cardBorder,
  },
  errorBox: {
    backgroundColor: '#1A0D0D',
    borderColor: Theme.colors.danger + '44',
    borderWidth: 1,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    marginVertical: Theme.spacing.sm,
  },
  errorText: {
    color: Theme.colors.danger,
    fontSize: Theme.typography.body,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.lg,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.success + '22',
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: Theme.spacing.xs,
  },
  emptyText: {
    color: Theme.colors.success,
    fontSize: Theme.typography.body,
    fontWeight: '600',
    letterSpacing: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: Theme.spacing.xxl,
    paddingTop: Theme.spacing.lg,
  },
  footerDivider: {
    width: 60,
    height: 2,
    backgroundColor: Theme.colors.primary + '33',
    borderRadius: 1,
    marginBottom: Theme.spacing.md,
  },
  footerText: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  footerSub: {
    color: Theme.colors.textMuted + '88',
    fontSize: 9,
    marginTop: 4,
    letterSpacing: 1,
  },
});
