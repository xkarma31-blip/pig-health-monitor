/**
 * 🌡️ Sensors Screen (Tab 2)
 * 
 * Shows ALL sensors grouped by type: Thermal, Acoustic, Flow.
 * Each sensor gets a full detailed card (non-compact mode).
 * 
 * Uses Firebase RTDB for live data with mock data as fallback.
 * TODO: Remove mock fallback once ESP32 hardware is connected.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';
import { subscribeSensors } from '../../utils/firebase';
import type { SensorReading } from '../../data/mockSensors';

// Fallback mock data
import { mockSensors } from '../../data/mockSensors';

export default function SensorsScreen() {
  const [sensors, setSensors] = useState<SensorReading[]>(mockSensors);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const unsub = subscribeSensors((liveSensors) => {
      if (liveSensors.length > 0) {
        setSensors(liveSensors);
        setIsLive(true);
      }
    });
    return () => unsub();
  }, []);

  // Group sensors by type
  const thermalSensors = sensors.filter((s) => s.type === 'thermal');
  const acousticSensors = sensors.filter((s) => s.type === 'acoustic');
  const flowSensors = sensors.filter((s) => s.type === 'flow');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLive && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerText}>🔴 LIVE — Firebase RTDB</Text>
        </View>
      )}

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

      {/* Status Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {isLive
            ? '🔥 Live sensor data from Firebase RTDB.\nWhen ESP32 hardware connects, values update in real-time.'
            : '⚠️ TEMPORARY: All values above are mock data.\nWhen ESP32 hardware connects, these will update in real-time.'}
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
