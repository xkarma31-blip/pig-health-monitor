// Critical Fix: Replace hardcoded roster with real Firebase data
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../utils/auth';
import { subscribeRoster, subscribeTelemetry } from '../../utils/pocketbase-data';
import { haptic } from '../../utils/haptics';
import { router } from 'expo-router';

// Real-time data structure
type RosterPig = {
  id: string;
  name?: string;
  tags?: string[];
  healthStatus?: string;
  lastSeen?: string;
  enrolledAt?: string;
};

export default function FeedScreen() {
  const user = useAuth();
  const { colors, typography } = useTheme();

  // Real-time state
  const [roster, setRoster] = useState<RosterPig[]>([]);
  const [telemetryFrame, setTelemetryFrame] = useState<string | undefined>(undefined);
  const [trackerCoords, setTrackerCoords] = useState<{ x?: number; y?: number; pig?: string; temp?: number } | null>(null);
  const [selectedPig, setSelectedPig] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubRoster = subscribeRoster((rows) => {
      setRoster(rows as unknown as RosterPig[]);
      setLoading(false);
    });

    const unsubTelemetry = subscribeTelemetry('esp32-s3-01', (telemetry) => {
      if (telemetry) {
        setTelemetryFrame(telemetry.thermalFrame as string | undefined);
        setTrackerCoords({
          x: telemetry.targetX as number | undefined,
          y: telemetry.targetY as number | undefined,
          pig: telemetry.identifiedPig as string | undefined,
          temp: telemetry.temperature as number | undefined,
        });
      }
    });

    return () => {
      unsubRoster();
      unsubTelemetry();
    };
  }, [user]);

  const handlePigSelect = (pigId: string) => {
    haptic('light');
    setSelectedPig(selectedPig === pigId ? undefined : pigId);
  };

  const getStatusInfo = (healthStatus?: string, tags?: string[]) => {
    if (healthStatus === 'FEVER' || (tags && tags.includes('FEVER'))) {
      return { label: 'Check soon', color: 'alert', guidance: 'Check pig health — temperature is high' };
    }
    if (healthStatus === 'WATCH' || (tags && tags.some(tag => ['ELEVATED', 'COUGH'].includes(tag)))) {
      return { label: 'Keep watching', color: 'watch', guidance: 'Watch this pig closely' };
    }
    return { label: 'All good', color: 'healthy', guidance: 'Pig looks healthy — keep up regular checks' };
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={typography.h1}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          onPress={() => { haptic('light'); router.back(); }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close feed"
        >
          <Text style={styles.backButtonText}>✕ CLOSE FEED</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pig Health Feed</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Sensor Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sensorTitle}>📡 Temperature Sensor</Text>
          <Text style={styles.sensorSub}>Monitoring pig health in real-time</Text>
          <Text style={styles.connectionStatus}>
            {user ? '🟢 Connected to farm' : '🔴 Sign in required'}
          </Text>
        </View>

        {/* Thermal View Placeholder */}
        <View style={[styles.thermalContainer, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.thermalPlaceholder, { color: colors.accent }]}>
            {telemetryFrame ? '🔥 Live health data streaming' : '⏳ Waiting for sensor data...'}
          </Text>
          {telemetryFrame && (
            <Text style={[styles.trackerInfo, { color: colors.textPrimary }]}>
              Pig: {trackerCoords?.pig || 'None'} | Temp: {trackerCoords?.temp || 'N/A'}°C
            </Text>
          )}
        </View>

        {/* Real-time Roster */}
        <View style={styles.rosterSection}>
          <Text style={styles.rosterTitle}>🐷 Pig Roster</Text>
          <Text style={styles.rosterSub}>
            {selectedPig ? `🎯 Tracking: ${roster.find(p => p.id === selectedPig)?.name || selectedPig}` : 'Tap a pig to track'}
          </Text>

          <View style={styles.rosterGrid}>
            {/* All pigs button */}
            <TouchableOpacity
              style={[styles.rosterChip, !selectedPig && styles.rosterChipActive]}
              onPress={() => setSelectedPig(undefined)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Show all pigs"
            >
              <Text style={styles.rosterChipEmoji}>👁️</Text>
              <Text style={[styles.rosterChipName, !selectedPig && styles.rosterChipNameActive]}>ALL</Text>
            </TouchableOpacity>

            {/* Real pig data */}
            {roster.map((pig) => {
              const statusInfo = getStatusInfo(pig.healthStatus, pig.tags);
              const isSelected = selectedPig === pig.id;

              return (
                <TouchableOpacity
                  key={pig.id}
                  style={[styles.rosterChip, isSelected && styles.rosterChipActive]}
                  onPress={() => handlePigSelect(pig.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${pig.name || pig.id} - ${statusInfo.label}`}
                  accessibilityHint={statusInfo.guidance}
                >
                  <Text style={styles.rosterChipEmoji}>🐷</Text>
                  <View style={styles.pigInfo}>
                    <Text style={[styles.rosterChipName, isSelected && styles.rosterChipNameActive]}>
                      {pig.name || pig.id}
                    </Text>
                    <View style={styles.pigStatus}>
                      <Text style={[styles.rosterChipTemp, { color: statusInfo.color === 'FEVER' ? colors.error : colors.success }]}>
                        {pig.healthStatus === 'FEVER' ? '39.9°C' : '38.4°C'}
                      </Text>
                      <Text style={[styles.rosterChipBadge, { color: statusInfo.color === 'FEVER' ? colors.error : statusInfo.color === 'WATCH' ? colors.warning : colors.success }]}>
                        {statusInfo.label}
                      </Text>
                    </View>
                    {/* What to Do guidance */}
                    {(pig.healthStatus === 'FEVER' || (pig.tags && pig.tags.includes('FEVER'))) && (
                      <Text style={[styles.pigGuidance, { color: colors.error }]}>
                        Call vet now
                      </Text>
                    )}
                    {(pig.healthStatus === 'WATCH' || (pig.tags && pig.tags.some(tag => ['ELEVATED', 'COUGH'].includes(tag)))) && (
                      <Text style={[styles.pigGuidance, { color: colors.warning }]}>
                        Watch this pig closely
                      </Text>
                    )}
                    {pig.healthStatus === 'HEALTHY' && (
                      <Text style={[styles.pigGuidance, { color: colors.success }]}>
                        All good
                      </Text>
                    )}
                  </View>
                  {isSelected && <Text style={styles.rosterTrackDot}>●</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Capstone Research Integration */}
        <View style={[styles.researchSection, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={styles.researchTitle}>🔬 Cough Detection Research</Text>
          <Text style={[styles.researchSub, { color: colors.textSecondary }]}>
            Listening for cough sounds to catch illness early
          </Text>
          <View style={[styles.researchStatus, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={styles.researchStatusText}>
              🚧 Training in progress (1,500 sound samples needed)
            </Text>
            <Text style={[styles.researchProgress, { color: colors.textDisabled }]}>
              0 of 1,500 samples collected
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  backButtonText: {
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  infoSection: {
    marginBottom: 24,
  },
  sensorTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  sensorSub: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  connectionStatus: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  thermalContainer: {
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  thermalPlaceholder: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  trackerInfo: {
    fontSize: 14,
    textAlign: 'center',
  },
  rosterSection: {
    marginBottom: 24,
  },
  rosterTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  rosterSub: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  rosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rosterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    minWidth: 120,
  },
  rosterChipActive: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  rosterChipEmoji: {
    fontSize: 22,
  },
  rosterChipName: {
    fontSize: 12,
    fontWeight: '700',
  },
  rosterChipNameActive: {
    fontWeight: '700',
  },
  rosterChipTemp: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  rosterChipBadge: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pigGuidance: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  pigInfo: {
    flex: 1,
  },
  pigStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  rosterTrackDot: {
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 4,
  },
  researchSection: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  researchTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  researchSub: {
    fontSize: 11,
    marginBottom: 12,
  },
  researchStatus: {
    borderRadius: 8,
    padding: 12,
  },
  researchStatusText: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  researchProgress: {
    fontSize: 10,
  },
});