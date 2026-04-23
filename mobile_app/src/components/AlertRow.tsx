/**
 * 🔔 AlertRow Component
 *
 * A single row in the alerts list. Shows severity, pig name, message, and time.
 * Handles both legacy severity values (info/warning/critical) and
 * ESP32 firmware values (HIGH/LOW/WARNING) from the new dual-band classifier.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../constants/Theme';
import type { AlertEntry } from '../data/mockAlerts';

type Props = {
  alert: AlertEntry;
};

// Normalise severity to a display config — handles all ESP32 + legacy values
function getSeverityConfig(severity: string): { icon: string; color: string; label: string } {
  const s = (severity || '').toUpperCase();
  if (s === 'HIGH' || s === 'CRITICAL')  return { icon: '🚨', color: Theme.colors.danger,  label: 'HIGH' };
  if (s === 'WARNING' || s === 'WARNING') return { icon: '⚠️', color: Theme.colors.warning, label: 'WARNING' };
  if (s === 'LOW')                        return { icon: '🟡', color: '#f5a623',             label: 'LOW' };
  if (s === 'INFO')                       return { icon: 'ℹ️', color: Theme.colors.info,     label: 'INFO' };
  return { icon: '❓', color: Theme.colors.textMuted, label: s };
}

// Format timestamp: accepts both Unix ms (number) and ISO string
function formatTimestamp(ts: number | string): string {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(date.getTime())) return String(ts);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)   return 'Just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)    return `${diffH}h ago`;
  return date.toLocaleDateString();
}

export function AlertRow({ alert }: Props) {
  const config = getSeverityConfig(alert.severity);

  return (
    <View style={[styles.row, { borderLeftColor: config.color }]}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{config.icon}</Text>
        <View style={styles.headerMeta}>
          <Text style={[styles.severity, { color: config.color }]}>{config.label}</Text>
          {alert.pig && (
            <Text style={styles.pigName}>🐷 {alert.pig}</Text>
          )}
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(alert.timestamp)}</Text>
      </View>
      <Text style={styles.message}>{alert.message}</Text>
      {alert.type && (
        <Text style={styles.typeTag}>{alert.type.replace(/_/g, ' ')}</Text>
      )}
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
  headerMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    flexWrap: 'wrap',
  },
  severity: {
    fontSize: Theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pigName: {
    fontSize: Theme.typography.caption,
    color: '#66fcf1',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  message: {
    fontSize: Theme.typography.body,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
  },
  typeTag: {
    marginTop: Theme.spacing.xs,
    fontSize: 10,
    color: Theme.colors.textMuted,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
});
