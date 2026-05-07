/**
 * 📊 SensorCard Component
 * 
 * A reusable card that displays one sensor reading.
 * Just pass in the sensor data and it handles all the styling!
 * 
 * HOW TO USE:
 *   import { SensorCard } from '../components/SensorCard';
 *   import { mockSensors } from '../data/mockSensors';
 * 
 *   <SensorCard sensor={mockSensors[0]} />
 * 
 * HOW TO CUSTOMIZE:
 *   - Change `compact={true}` for a smaller version (used on the Dashboard)
 *   - The card color automatically matches the sensor status
 */

import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Theme, getResponsiveTheme, getStatusColor } from '../constants/Theme';
import { StatusBadge } from './StatusBadge';
import type { SensorReading } from '../data/mockSensors';

type Props = {
  sensor: SensorReading;
  compact?: boolean;  
};

export function SensorCard({ sensor, compact = false }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = getResponsiveTheme(isDesktop);
  const accentColor = getStatusColor(sensor.status);

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }, isDesktop && styles.cardDesktop]}>
      {/* Header Row: Icon + Label + Badge */}
      <View style={styles.headerRow}>
        <Text style={styles.icon}>{sensor.icon}</Text>
        <Text style={[styles.label, { fontSize: T.typography.h3 }]} numberOfLines={1}>{sensor.label}</Text>
        <StatusBadge status={sensor.status} />
      </View>

      {/* Value Display */}
      <Text 
        style={[styles.value, { color: accentColor, fontSize: T.typography.huge }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {sensor.value}{sensor.unit}
      </Text>

      {/* Detail Row (hidden in compact mode) */}
      {!compact && (
        <View style={styles.detailRow}>
          <Text style={styles.detail}>
            Range: {sensor.minRange}–{sensor.maxRange} {sensor.unit}
          </Text>
          <Text style={styles.detail}>
            Updated: {sensor.lastUpdated}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    borderLeftWidth: 5,
    width: '100%',
    marginBottom: Theme.spacing.md,
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  cardDesktop: {
    padding: 12,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
    gap: Theme.spacing.sm,
  },
  icon: {
    fontSize: 22,
  },
  label: {
    fontSize: Theme.typography.h3,
    color: Theme.colors.text,
    fontWeight: '600',
    flex: 1,
  },
  value: {
    fontSize: Theme.typography.huge,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
  },
  detail: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
  },
});
