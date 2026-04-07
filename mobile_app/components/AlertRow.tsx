/**
 * 🔔 AlertRow Component
 * 
 * A single row in the alerts list. Shows severity, message, and time.
 * 
 * HOW TO USE:
 *   import { AlertRow } from '../components/AlertRow';
 *   <AlertRow alert={mockAlerts[0]} />
 */

import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../constants/Theme';
import type { AlertEntry, AlertSeverity } from '../data/mockAlerts';

type Props = {
  alert: AlertEntry;
};

// Severity → emoji + color mapping
const severityConfig: Record<AlertSeverity, { icon: string; color: string }> = {
  info: { icon: 'ℹ️', color: Theme.colors.info },
  warning: { icon: '⚠️', color: Theme.colors.warning },
  critical: { icon: '🚨', color: Theme.colors.danger },
};

export function AlertRow({ alert }: Props) {
  const config = severityConfig[alert.severity];

  return (
    <View style={[styles.row, { borderLeftColor: config.color }]}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{config.icon}</Text>
        <Text style={[styles.severity, { color: config.color }]}>
          {alert.severity.toUpperCase()}
        </Text>
        <Text style={styles.timestamp}>{alert.timestamp}</Text>
      </View>
      <Text style={styles.message}>{alert.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    borderLeftWidth: 4,
    borderColor: Theme.colors.cardBorder,
    borderWidth: 1,
    marginBottom: Theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
    gap: Theme.spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  severity: {
    fontSize: Theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
    marginLeft: 'auto',
  },
  message: {
    fontSize: Theme.typography.body,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
  },
});
