/**
 * 📊 Dashboard Screen (Tab 1 — Home)
 *
 * Main screen showing a real-time summary of ALL sensor readings.
 * Uses Firebase RTDB for live data with mock data as fallback.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';
import { AlertRow } from '../../components/AlertRow';
import { subscribeSensors, subscribeAlerts, subscribeTelemetry } from '../../utils/firebase';
import type { SensorReading } from '../../data/mockSensors';

// Fallback mock data (used when Firebase has no entries)
import { mockSensors } from '../../data/mockSensors';
import { mockAlerts } from '../../data/mockAlerts';

export default function DashboardScreen() {
  const [sensors, setSensors] = useState<SensorReading[]>(mockSensors);
  const [alerts, setAlerts] = useState<any[]>(mockAlerts);
  const [isLive, setIsLive] = useState(false);
  const [identifiedPig, setIdentifiedPig] = useState<string>('SCANNING...');
  const [currentTemp, setCurrentTemp] = useState<string>('—');
  const [healthStatus, setHealthStatus] = useState<string>('NORMAL');

  useEffect(() => {
    // Subscribe to Firebase RTDB — falls back to mock data if empty
    const unsubSensors = subscribeSensors((liveSensors) => {
      if (liveSensors.length > 0) {
        setSensors(liveSensors);
        setIsLive(true);
      }
    });

    const unsubAlerts = subscribeAlerts((liveAlerts) => {
      if (liveAlerts.length > 0) {
        setAlerts(liveAlerts);
      }
    });

    // Subscribe to telemetry using the proper helper (fixes missing ref/db/onValue imports)
    const unsubTele = subscribeTelemetry('esp32-s3-01', (data) => {
      if (data) {
        if (data.identifiedPig) setIdentifiedPig(data.identifiedPig);
        if (data.temperature != null) setCurrentTemp(`${data.temperature.toFixed(1)} °C`);
        if (data.status) setHealthStatus(data.status);
      }
    });

    return () => {
      unsubSensors();
      unsubAlerts();
      unsubTele();
    };
  }, []);

  const warningCount = sensors.filter((s) => s.status === 'warning').length;
  const dangerCount = sensors.filter((s) => s.status === 'danger').length;
  const recentAlerts = alerts.slice(0, 3);

  const statusColor = healthStatus === 'CRITICAL'
    ? Theme.colors.danger
    : healthStatus === 'WARNING'
    ? Theme.colors.warning
    : Theme.colors.success;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Header === */}
      <View style={styles.header}>
        <Text style={styles.title}>🐗 Pig Health Monitor</Text>
        <Text style={styles.subtitle}>Sovereign Aqua Protocol — Dashboard</Text>

        {/* Hero Card: Identified Pig + Vitals */}
        <View style={styles.heroContainer}>
          <View style={styles.heroRow}>
            <View style={styles.heroPanel}>
              <Text style={styles.heroLabel}>IDENTIFIED PIG</Text>
              <Text style={styles.heroValue}>{identifiedPig}</Text>
            </View>
            <View style={[styles.heroPanel, styles.heroDivider]}>
              <Text style={styles.heroLabel}>TEMPERATURE</Text>
              <Text style={[styles.heroValue, { color: statusColor }]}>{currentTemp}</Text>
            </View>
          </View>
          <View style={[styles.statusBar, { backgroundColor: statusColor + '33', borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {healthStatus === 'CRITICAL' ? '🚨 CRITICAL — Cough Detected' :
               healthStatus === 'WARNING' ? '⚠️ WARNING — Elevated Temperature' :
               '✅ NORMAL — All systems nominal'}
            </Text>
          </View>
        </View>

        {isLive && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>🔴 LIVE — Firebase RTDB</Text>
          </View>
        )}
      </View>

      {/* === Quick Stats Row === */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { borderColor: Theme.colors.success }]}>
          <Text style={[styles.statValue, { color: Theme.colors.success }]}>{sensors.length}</Text>
          <Text style={styles.statLabel}>Sensors</Text>
        </View>
        <View style={[styles.statBox, { borderColor: Theme.colors.warning }]}>
          <Text style={[styles.statValue, { color: Theme.colors.warning }]}>{warningCount}</Text>
          <Text style={styles.statLabel}>Warnings</Text>
        </View>
        <View style={[styles.statBox, { borderColor: Theme.colors.danger }]}>
          <Text style={[styles.statValue, { color: Theme.colors.danger }]}>{dangerCount}</Text>
          <Text style={styles.statLabel}>Critical</Text>
        </View>
      </View>

      {/* === Sensor Overview (Compact) === */}
      <Text style={styles.sectionTitle}>Sensor Overview</Text>
      {sensors.map((sensor) => (
        <SensorCard key={sensor.id} sensor={sensor} compact />
      ))}

      {/* === Recent Alerts === */}
      <Text style={styles.sectionTitle}>Recent Alerts</Text>
      {recentAlerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}

      {/* === Footer === */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {isLive
            ? '🔥 Connected to Firebase RTDB — Live telemetry active.'
            : '⚠️ Currently showing MOCK DATA for development.\nReal sensors will connect via Firebase RTDB.'}
        </Text>
        <Text style={styles.footerText}>
          Cross-Platform: Web ↔ Mobile synced via Expo Router
        </Text>
      </View>
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
    paddingBottom: Theme.spacing.xxl,
  },
  header: {
    marginBottom: Theme.spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: Theme.typography.h1,
    color: Theme.colors.primary,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Theme.typography.body,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: Theme.spacing.xs,
  },
  liveBadge: {
    marginTop: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    backgroundColor: '#66fcf1' + '22',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#66fcf1',
  },
  liveBadgeText: {
    color: '#66fcf1',
    fontSize: Theme.typography.caption,
    fontWeight: 'bold',
  },
  heroContainer: {
    marginTop: Theme.spacing.lg,
    padding: Theme.spacing.md,
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
    marginBottom: Theme.spacing.md,
  },
  heroPanel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
  },
  heroDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#66fcf1' + '44',
  },
  heroLabel: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
    letterSpacing: 1.5,
    marginBottom: Theme.spacing.xs,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: '#66fcf1',
    fontSize: Theme.typography.h2,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusBar: {
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.sm,
    alignItems: 'center',
  },
  statusText: {
    fontSize: Theme.typography.caption,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.xl,
    gap: Theme.spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  statValue: {
    fontSize: Theme.typography.h1,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
    marginTop: Theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
    marginTop: Theme.spacing.md,
  },
  footer: {
    marginTop: Theme.spacing.xl,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '44',
    borderStyle: 'dashed',
  },
  footerText: {
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontSize: Theme.typography.caption,
    marginVertical: 2,
  },
});
