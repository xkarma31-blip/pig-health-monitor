/**
 * 🏷️ StatusBadge Component
 * 
 * A small colored pill that shows "Normal", "Warning", or "Critical".
 * The color changes automatically based on the status prop.
 * 
 * HOW TO USE:
 *   import { StatusBadge } from '../components/StatusBadge';
 *   <StatusBadge status="warning" />
 */

import { View, Text, StyleSheet } from 'react-native';
import { Theme, getStatusColor } from '../constants/Theme';
import type { SensorStatus } from '../data/mockSensors';

type Props = {
  status: SensorStatus;
};

// Map status to human-readable label
const statusLabels: Record<SensorStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  danger: 'Critical',
};

export function StatusBadge({ status }: Props) {
  const color = getStatusColor(status);

  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{statusLabels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: Theme.typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
