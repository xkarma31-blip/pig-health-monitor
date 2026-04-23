/**
 * 🔔 Alerts Screen (Tab 3)
 * 
 * Shows a chronological log of all health alerts and events.
 * Think of it like a "notification history" for the pig pen.
 * 
 * Uses Firebase RTDB for live data with mock data as fallback.
 * TODO: Remove mock fallback once ESP32 hardware is connected.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { AlertRow } from '../../components/AlertRow';
import { subscribeAlerts } from '../../utils/firebase';

// Fallback mock data
import { mockAlerts } from '../../data/mockAlerts';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<any[]>(mockAlerts);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const unsub = subscribeAlerts((liveAlerts) => {
      if (liveAlerts.length > 0) {
        setAlerts(liveAlerts);
        setIsLive(true);
      }
    });
    return () => unsub();
  }, []);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLive && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerText}>🔴 LIVE — Firebase RTDB</Text>
        </View>
      )}

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
          <Text style={[styles.summaryValue, { color: Theme.colors.info }]}>{alerts.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {/* === Alert History === */}
      <Text style={styles.sectionTitle}>Alert History</Text>
      {alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}

      {/* Status Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {isLive
            ? '🔥 Live alert feed from Firebase RTDB.\nReal alerts trigger from ESP32 sensor thresholds.'
            : '⚠️ TEMPORARY: Alert log populated with sample data.\nReal alerts will trigger from ESP32 sensor thresholds.'}
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
  liveBanner: {
    alignSelf: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    backgroundColor: '#66fcf1' + '22',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#66fcf1',
    marginBottom: Theme.spacing.md,
  },
  liveBannerText: {
    color: '#66fcf1',
    fontSize: Theme.typography.caption,
    fontWeight: 'bold',
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
