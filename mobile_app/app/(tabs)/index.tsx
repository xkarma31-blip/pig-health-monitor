/**
 * 📊 Dashboard Screen (Tab 1 — Home)
 * 
 * This is the MAIN screen users see when they open the app.
 * It shows a summary of ALL sensor readings using compact SensorCards.
 * 
 * ⚠️ TEMPORARY: Currently uses mock data from data/mockSensors.ts
 * TODO: Replace `mockSensors` with a real Supabase API call when backend is ready.
 */

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';
import { AlertRow } from '../../components/AlertRow';

// ⚠️ TEMPORARY — Mock data imports (replace with API calls later)
import { mockSensors } from '../../data/mockSensors';
import { mockAlerts } from '../../data/mockAlerts';

export default function DashboardScreen() {
  // ⚠️ TEMPORARY — These counts come from mock data
  const warningCount = mockSensors.filter((s) => s.status === 'warning').length;
  const dangerCount = mockSensors.filter((s) => s.status === 'danger').length;
  const recentAlerts = mockAlerts.slice(0, 3); // Show only 3 most recent

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Header === */}
      <View style={styles.header}>
        <Text style={styles.title}>🐗 Pig Health Monitor</Text>
        <Text style={styles.subtitle}>Sovereign Aqua Protocol — Dashboard</Text>
      </View>

      {/* === Quick Stats Row === */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { borderColor: Theme.colors.success }]}>
          <Text style={[styles.statValue, { color: Theme.colors.success }]}>{mockSensors.length}</Text>
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
      {mockSensors.map((sensor) => (
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
          ⚠️ Currently showing MOCK DATA for development.{'\n'}
          Real sensors will connect via Supabase API.
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
