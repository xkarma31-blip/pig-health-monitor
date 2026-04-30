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
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Theme } from '../../constants/Theme';
import { SensorCard } from '../../components/SensorCard';
import { subscribeSensors, enrollPig, subscribeRoster, subscribeTelemetry } from '../../utils/firebase';
import { ThermalLiveView } from '../../components/ThermalLiveView';
import { TouchableOpacity } from 'react-native';
import type { SensorReading } from '../../data/mockSensors';

import { getAuth } from 'firebase/auth';

export default function SensorsScreen() {
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLive, setIsLive] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [newPigName, setNewPigName] = useState('');
  const [telemetry, setTelemetry] = useState<any>(null);
  const [selectedTrackingPig, setSelectedTrackingPig] = useState<string | undefined>(undefined);

  useEffect(() => {
    const unsubAuth = getAuth().onAuthStateChanged((user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setIsLive(false);
        setSensors([]);
        setRoster([]);
        setTelemetry(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubSensors = subscribeSensors((liveSensors) => {
      if (liveSensors.length > 0) {
        setSensors(liveSensors);
        setIsLive(true);
      } else {
        setSensors([]);
        setIsLive(false);
      }
    });

    const unsubRoster = subscribeRoster((liveRoster) => {
      setRoster(liveRoster);
    });

    const unsubTelemetry = subscribeTelemetry('esp32-s3-01', (liveData) => {
      setTelemetry(liveData);
    });

    return () => {
      unsubSensors();
      unsubRoster();
      unsubTelemetry();
    };
  }, [isAuthenticated]);

  // Group sensors by type
  const thermalSensors = sensors.filter((s) => s.type === 'thermal');
  const acousticSensors = sensors.filter((s) => s.type === 'acoustic');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLive && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerText}>🔴 LIVE — Firebase RTDB</Text>
        </View>
      )}
      
      {/* === Live Thermal Tracking === */}
      <View style={{ marginTop: Theme.spacing.md }}>
        <Text style={styles.sectionTitle}>📡 Live Thermal Feed</Text>
        <Text style={styles.sectionDesc}>Tap a pig in the roster below to highlight it on the thermal grid</Text>
        <ThermalLiveView 
          base64Frame={telemetry?.thermalFrame}
          targetX={telemetry?.targetX}
          targetY={telemetry?.targetY}
          identifiedPig={telemetry?.identifiedPig}
          selectedPigToTrack={selectedTrackingPig}
        />
      </View>

      {/* === Enrollment Section === */}
      <View style={styles.enrollmentContainer}>
        <Text style={styles.sectionTitle}>🐷 Pig Roster</Text>
        <Text style={styles.sectionDesc}>Enroll and manage individual pig identities</Text>
        
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            placeholder="Enter Pig Name (e.g. Boss Hog)"
            placeholderTextColor={Theme.colors.textMuted}
            value={newPigName}
            onChangeText={setNewPigName}
          />
          <TouchableOpacity 
            style={[styles.enrollButton, (isEnrolling || !newPigName) && styles.buttonDisabled]} 
            onPress={async () => {
              if (!newPigName) return;
              setIsEnrolling(true);
              try {
                await enrollPig(newPigName);
                alert(`Ritual Initiated: Capturing ${newPigName}. Stand by.`);
                setNewPigName('');
              } finally {
                setIsEnrolling(false);
              }
            }}
            disabled={isEnrolling || !newPigName}
          >
            <Text style={styles.enrollButtonText}>
              {isEnrolling ? '📡 ENROLLING...' : '+ ENROLL PIG'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- Roster List --- */}
        <View style={styles.rosterList}>
          {roster.length === 0 ? (
            <Text style={styles.emptyText}>No pigs enrolled yet.</Text>
          ) : (
            roster.map((pig) => (
              <TouchableOpacity 
                key={pig.id} 
                style={[
                  styles.rosterItem, 
                  selectedTrackingPig === pig.name && styles.rosterItemActive
                ]}
                onPress={() => setSelectedTrackingPig(pig.name === selectedTrackingPig ? undefined : pig.name)}
              >
                <Text style={styles.rosterItemName}>🐖 {pig.name}</Text>
                <Text style={styles.rosterItemDate}>{new Date(pig.enrolledAt).toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>

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


      {/* Status Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {isLive
            ? '🔥 Live sensor data from Firebase RTDB.\nWhen ESP32 hardware connects, values update in real-time.'
            : '⚠️ OFFLINE: Please log in to view active sensor telemetry.'}
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
  enrollmentContainer: {
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    marginTop: Theme.spacing.md,
    borderWidth: 1,
    borderColor: '#66fcf1' + '44',
  },
  enrollButton: {
    backgroundColor: '#66fcf1',
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: Theme.colors.textMuted,
  },
  enrollButtonText: {
    color: Theme.colors.background,
    fontSize: Theme.typography.body,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  inputGroup: {
    marginTop: Theme.spacing.md,
  },
  input: {
    backgroundColor: Theme.colors.card,
    color: Theme.colors.text,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    fontSize: Theme.typography.body,
    marginBottom: Theme.spacing.sm,
  },
  rosterList: {
    marginTop: Theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.cardBorder,
    paddingTop: Theme.spacing.md,
  },
  rosterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder + '44',
  },
  rosterItemActive: {
    backgroundColor: '#00D4AA' + '22',
    borderColor: '#00D4AA',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: Theme.spacing.sm,
  },
  rosterItemName: {
    color: Theme.colors.text,
    fontSize: Theme.typography.body,
    fontWeight: '500',
  },
  rosterItemDate: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
  },
  emptyText: {
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: Theme.spacing.md,
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
