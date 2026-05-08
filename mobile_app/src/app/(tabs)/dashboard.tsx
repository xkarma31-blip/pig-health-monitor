/**
 * 📊 Dashboard Screen (Tab 1 — Home)
 *
 * Main screen showing a real-time summary of ALL sensor readings.
 * Uses Firebase RTDB for live data with mock data as fallback.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Platform, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { Theme, getResponsiveTheme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';
import { AlertRow } from '../../components/AlertRow';
import { ThermalLiveView } from '../../components/ThermalLiveView';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';
import { auth, subscribeSensors, subscribeAlerts, subscribeTelemetry, subscribeRoster } from '../../utils/firebase';
import type { SensorReading } from '../../data/mockSensors';

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = getResponsiveTheme(isDesktop);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);
  const [identifiedPigs, setIdentifiedPigs] = useState<string[]>(['SCANNING...']);
  const [currentTemp, setCurrentTemp] = useState<string>('—');
  const [healthStatus, setHealthStatus] = useState<string>('NORMAL');
  const [roster, setRoster] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [presMode, setPresMode] = useState(false);

  // Keyboard listener for TV Mode (Escape to exit)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      if (!user) {
        setRoster([]);
        setSensors([]);
        setAlerts([]);
        setIsLive(false);
        setIdentifiedPigs(['SCANNING...']);
        setCurrentTemp('—');
        setHealthStatus('NORMAL');
      }
    });
    return unsub;
  }, []);

  // Subscribe to Firebase data ONLY when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubSensors = subscribeSensors((liveSensors) => {
      setSensors(liveSensors);
      setIsLive(true);
    });

    const unsubAlerts = subscribeAlerts((liveAlerts) => {
      setAlerts(liveAlerts);
    });

    const unsubRoster = subscribeRoster((liveRoster) => {
      setRoster(liveRoster);
    });

    const unsubTele = subscribeTelemetry('esp32-s3-01', (data) => {
      if (data) {
        setTelemetry(data);
        if (data.identifiedPigs) {
          setIdentifiedPigs(data.identifiedPigs);
        } else if (data.identifiedPig) {
          setIdentifiedPigs([data.identifiedPig]);
        }
        if (data.temperature != null) setCurrentTemp(`${data.temperature.toFixed(1)} °C`);
        if (data.status) setHealthStatus(data.status);
      }
    });

    return () => {
      unsubSensors();
      unsubAlerts();
      unsubTele();
      unsubRoster();
    };
  }, [isAuthenticated]);

  const warningCount = sensors.filter((s) => s.status === 'warning').length;
  const dangerCount = sensors.filter((s) => s.status === 'danger').length;
  const coughCount = alerts.filter((a) => a.type && a.type.includes('COUGH')).length;
  const recentAlerts = alerts.slice(0, 3);

  const statusColor = healthStatus === 'CRITICAL'
    ? Theme.colors.danger
    : healthStatus === 'WARNING'
    ? Theme.colors.warning
    : Theme.colors.success;

  return (
<ResponsiveLayout>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { padding: T.spacing.lg, paddingBottom: T.spacing.xxl }]}
    >
      {/* === TV MODE FULLSCREEN MODAL === */}
      {presMode && (
        <Modal
          animationType="fade"
          transparent={false}
          visible={presMode}
          onRequestClose={() => setPresMode(false)}
        >
          <View style={styles.tvContainer}>
            <View style={styles.tvHeader}>
              <Text style={styles.tvTitle}>🐗 SOVEREIGN AQUA PROTOCOL — LIVE MONITOR</Text>
              <TouchableOpacity onPress={() => setPresMode(false)} style={styles.tvCloseBtn}>
                <Text style={{color: '#000', fontWeight: 'bold', fontSize: 14}}>✕ EXIT TV MODE</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tvHeroRow}>
              <View style={styles.tvHeroPanel}>
                <Text style={styles.tvHeroLabel}>IDENTIFIED PIGS</Text>
                <Text style={styles.tvHeroValue}>{identifiedPigs.join(', ')}</Text>
              </View>
              <View style={[styles.tvHeroPanel, { borderLeftWidth: 1, borderLeftColor: Theme.colors.primary + '44' }]}>
                <Text style={styles.tvHeroLabel}>TEMPERATURE</Text>
                <Text style={[styles.tvHeroValue, { color: statusColor }]}>{currentTemp}</Text>
              </View>
              <View style={[styles.tvHeroPanel, { borderLeftWidth: 1, borderLeftColor: Theme.colors.primary + '44' }]}>
                <Text style={styles.tvHeroLabel}>STATUS</Text>
                <Text style={[styles.tvHeroValue, { color: statusColor }]}>{healthStatus}</Text>
              </View>
            </View>
            <View style={styles.tvThermal}>
              <ThermalLiveView 
                base64Frame={telemetry?.thermalFrame}
                targetX={telemetry?.targetX}
                targetY={telemetry?.targetY}
                identifiedPig={telemetry?.identifiedPig}
                width={Math.min(Dimensions.get('window').width - 40, 1000)}
              />
            </View>
            <View style={styles.tvFooter}>
              <Text style={styles.tvFooterText}>
                {isLive ? '🔴 LIVE — Firebase Realtime Database' : '☁️ Awaiting ESP32 signal...'}
              </Text>
            </View>
          </View>
        </Modal>
      )}
      {/* === Header === */}
      <View style={{ marginBottom: T.spacing.lg }}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { fontSize: T.typography.h1 }]} adjustsFontSizeToFit numberOfLines={1}>🐗 Pig Health Monitor</Text>
            <Text style={[styles.subtitle, { fontSize: T.typography.caption }]} numberOfLines={1}>Sovereign Aqua Protocol — Dashboard</Text>
          </View>
          {isAuthenticated && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity 
                style={[styles.presButton, presMode && styles.presButtonActive]}
                onPress={() => setPresMode(!presMode)}
              >
                <Text style={[styles.presButtonText, presMode && { color: '#000' }]}>
                  {presMode ? '📺 TV ON' : '📺 TV MODE'}
                </Text>
              </TouchableOpacity>
              {isLive && (
                <View style={styles.liveBadge}>
                  <Text style={[styles.liveBadgeText, { fontSize: T.typography.caption }]}>🔴 LIVE</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {!isAuthenticated && (
          <TouchableOpacity 
            style={styles.guestBanner} 
            onPress={() => router.push('/login')}
          >
            <Text style={styles.guestBannerText}>
              🛡️ GUEST MODE — Tap to Sign In for Cloud Data
            </Text>
          </TouchableOpacity>
        )}

        {/* Hero Card: Identified Pig + Vitals */}
        <View style={[styles.heroContainer, { padding: T.spacing.md, marginTop: T.spacing.md }, healthStatus === 'INACTIVE' && { borderColor: Theme.colors.warning }]}>
          <View style={[styles.heroRow, { marginBottom: T.spacing.sm }]}>
            <View style={styles.heroPanel}>
              <Text style={[styles.heroLabel, { fontSize: T.typography.caption }]}>IDENTIFIED PIGS</Text>
              <View style={styles.pigsList}>
                {identifiedPigs.map((name, i) => (
                  <Text key={i} style={[styles.heroValue, { fontSize: T.typography.h2 }]}>{name}{i < identifiedPigs.length - 1 ? ', ' : ''}</Text>
                ))}
              </View>
              {healthStatus === 'INACTIVE' && <Text style={styles.lethargyBadge}>⚠️ LETHARGIC</Text>}
            </View>
            <View style={[styles.heroPanel, styles.heroDivider]}>
              <Text style={[styles.heroLabel, { fontSize: T.typography.caption }]}>TEMPERATURE</Text>
              <Text style={[styles.heroValue, { color: statusColor, fontSize: T.typography.h2 }]}>{currentTemp}</Text>
            </View>
          </View>
          <View style={[styles.statusBar, { backgroundColor: statusColor + '33', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor, fontSize: T.typography.caption }]}>
              {healthStatus === 'INACTIVE' ? '⚠️ WARNING — Pig Activity Low (Lethargy Check)' :
               healthStatus === 'CRITICAL' ? '🚨 CRITICAL — Cough Detected' :
               healthStatus === 'WARNING' ? '⚠️ WARNING — Elevated Temperature' :
               '✅ NORMAL — All systems nominal'}
            </Text>
          </View>
        </View>
      </View>

      {/* === Thermal Section (Main Centerpiece) === */}
      <View style={{ marginBottom: T.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.spacing.xs }}>
          <Text style={[styles.sectionTitle, { fontSize: T.typography.h3, marginTop: 0 }]}>📡 Live Thermal Feed</Text>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>🔴 LIVE</Text>
          </View>
        </View>
        <ThermalLiveView 
          base64Frame={telemetry?.thermalFrame}
          targetX={telemetry?.targetX}
          targetY={telemetry?.targetY}
          identifiedPig={telemetry?.identifiedPig}
          width={isDesktop ? Math.min(width * 0.7, 800) : undefined}
        />
      </View>

      {/* === Grid Section === */}
      <View style={isDesktop ? styles.desktopGrid : {}}>
        {/* Left Col: Alerts */}
        <View style={isDesktop ? styles.gridCol : {}}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.spacing.sm }}>
            <Text style={[styles.sectionTitle, { fontSize: T.typography.h3, marginBottom: 0 }]}>Recent Events</Text>
          </View>
          {recentAlerts.length === 0 ? (
            <Text style={{color: Theme.colors.textMuted}}>No recent incidents.</Text>
          ) : (
            recentAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))
          )}
        </View>

        {/* Right Col: Node Health */}
        <View style={isDesktop ? styles.gridCol : {}}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.spacing.sm }}>
            <Text style={[styles.sectionTitle, { fontSize: T.typography.h3, marginBottom: 0 }]}>Node Heartbeat</Text>
          </View>
          {sensors.map((sensor) => (
            <SensorCard key={sensor.id} sensor={sensor} compact />
          ))}
        </View>
      </View>

      {/* === Footer === */}
      <View style={[styles.footer, { padding: T.spacing.sm }]}>
        <Text style={[styles.footerText, { fontSize: T.typography.caption }]}>
          {isLive
            ? '🔥 Live telemetry active — Connected to Firebase RTDB.'
            : isAuthenticated
            ? '☁️ Connected to Cloud — Waiting for ESP32 hardware pulse...'
            : '⚠️ GUEST MODE: Please log in to view real-time data.'}
        </Text>
        <Text style={[styles.footerText, { fontSize: T.typography.caption }]}>
          Cross-Platform: Web ↔ Mobile synced via Expo Router
        </Text>
      </View>
    </ScrollView>
</ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {},
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    flexWrap: 'wrap',
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 200,
  },
  title: {
    color: Theme.colors.primary,
    fontWeight: 'bold',
  },
  presButton: {
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  presButtonActive: {
    backgroundColor: Theme.colors.primary,
  },
  presButtonText: {
    color: Theme.colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  subtitle: {
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  guestBanner: {
    marginTop: 8,
    padding: 8,
    backgroundColor: Theme.colors.warning + '22',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.warning,
    width: '100%',
    alignItems: 'center',
  },
  guestBannerText: {
    color: Theme.colors.warning,
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#66fcf1' + '22',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#66fcf1',
  },
  liveBadgeText: {
    color: '#66fcf1',
    fontWeight: 'bold',
  },
  heroContainer: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#66fcf1' + '44',
    width: '100%',
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  heroPanel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  heroDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#66fcf1' + '44',
  },
  heroLabel: {
    color: Theme.colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  pigsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroValue: {
    color: '#66fcf1',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  lethargyBadge: {
    color: Theme.colors.warning,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
    backgroundColor: Theme.colors.warning + '22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBar: {
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statusText: {
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Theme.colors.card,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  statValue: {
    fontWeight: 'bold',
  },
  statLabel: {
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginTop: 8,
  },
  footer: {
    marginTop: 16,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '44',
    borderStyle: 'dashed',
  },
  footerText: {
    color: Theme.colors.textMuted,
    textAlign: 'center',
    marginVertical: 2,
  },
  rosterCard: {
    backgroundColor: Theme.colors.card,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rosterName: {
    color: Theme.colors.primary,
    fontWeight: 'bold',
  },
  rosterTemp: {
    fontWeight: 'bold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    color: '#fff',
  },
  tagDanger: {
    backgroundColor: Theme.colors.danger,
  },
  tagWarning: {
    backgroundColor: Theme.colors.warning,
  },
  tagInfo: {
    backgroundColor: Theme.colors.info,
  },
  desktopGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  gridCol: {
    flex: 1,
    minWidth: 300,
  },
  presOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: Theme.colors.primary,
    zIndex: 1000,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  presTitle: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 2,
  },
  presClose: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  // === TV Mode Fullscreen Styles ===
  tvContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    padding: 20,
  },
  tvHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '44',
    marginBottom: 16,
  },
  tvTitle: {
    color: Theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 2,
  },
  tvCloseBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tvHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '44',
    padding: 16,
    marginBottom: 16,
  },
  tvHeroPanel: {
    flex: 1,
    alignItems: 'center',
  },
  tvHeroLabel: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tvHeroValue: {
    color: Theme.colors.primary,
    fontSize: 28,
    fontWeight: 'bold',
  },
  tvThermal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvFooter: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  tvFooterText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    letterSpacing: 1,
  },
});
