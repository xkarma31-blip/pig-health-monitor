/**
 * 🔔 Alerts Screen (Tab 3)
 * 
 * Shows a chronological log of all health alerts and events.
 * Think of it like a "notification history" for the pig pen.
 * 
 * ⚠️ TEMPORARY: Data comes from data/mockAlerts.ts
 * TODO: Replace with Supabase real-time subscription when backend is ready.
 */

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { AlertRow } from '../../components/AlertRow';

// ⚠️ TEMPORARY — Mock data (replace with Supabase query later)
import { mockAlerts } from '../../data/mockAlerts';

export default function AlertsScreen() {
  // Count by severity for the header summary
  const criticalCount = mockAlerts.filter((a) => a.severity === 'critical').length;
  const warningCount = mockAlerts.filter((a) => a.severity === 'warning').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Summary Header === */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryValue, { color: Theme.colors.danger }]}>{criticalCount}</Text>
          <Text style={styles.summaryLabel}>Critical</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryValue, { color: Theme.colors.warning }]}>{warningCount}</Text>
          <Text style={styles.summaryLabel}>Warnings</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryValue, { color: Theme.colors.info }]}>{mockAlerts.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {/* === Alert History === */}
      <Text style={styles.sectionTitle}>Alert History</Text>
      {mockAlerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}

      {/* Temporary Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          ⚠️ TEMPORARY: Alert log populated with sample data.{'\n'}
          Real alerts will trigger from ESP32 sensor thresholds.
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.xl,
    gap: Theme.spacing.sm,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  summaryValue: {
    fontSize: Theme.typography.h1,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
    marginTop: Theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
  },
  notice: {
    marginTop: Theme.spacing.xl,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '44',
    borderStyle: 'dashed',
  },
  noticeText: {
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontSize: Theme.typography.caption,
  },
});
