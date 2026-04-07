/**
 * 🌡️ Sensors Screen (Tab 2)
 * 
 * Shows ALL sensors grouped by type: Thermal, Acoustic, Flow.
 * Each sensor gets a full detailed card (non-compact mode).
 * 
 * ⚠️ TEMPORARY: Data comes from data/mockSensors.ts
 * TODO: Replace with real-time Supabase subscription when backend is ready.
 */

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';

// ⚠️ TEMPORARY — Mock data (replace with Supabase query later)
import { getSensorsByType } from '../../data/mockSensors';

export default function SensorsScreen() {
  // Group sensors by type using the helper function
  const thermalSensors = getSensorsByType('thermal');
  const acousticSensors = getSensorsByType('acoustic');
  const flowSensors = getSensorsByType('flow');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === Thermal Section === */}
      <Text style={styles.sectionTitle}>🌡️ Thermal Sensors</Text>
      <Text style={styles.sectionDesc}>Body and ambient temperature monitoring</Text>
      {thermalSensors.map((sensor) => (
        <SensorCard key={sensor.id} sensor={sensor} />
      ))}

      {/* === Acoustic Section === */}
      <Text style={styles.sectionTitle}>🩺 Acoustic Sensors</Text>
      <Text style={styles.sectionDesc}>Respiratory sound and squeal detection</Text>
      {acousticSensors.map((sensor) => (
        <SensorCard key={sensor.id} sensor={sensor} />
      ))}

      {/* === Flow Section === */}
      <Text style={styles.sectionTitle}>🫧 Flow Sensors</Text>
      <Text style={styles.sectionDesc}>Water bubble rate and dissolved oxygen</Text>
      {flowSensors.map((sensor) => (
        <SensorCard key={sensor.id} sensor={sensor} />
      ))}

      {/* Temporary Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          ⚠️ TEMPORARY: All values above are mock data.{'\n'}
          When ESP32 hardware connects, these will update in real-time.
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
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.xs,
  },
  sectionDesc: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textMuted,
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
