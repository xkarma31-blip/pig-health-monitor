import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Theme } from '../constants/Theme';
import { ThermalLiveView } from '../components/ThermalLiveView';
import { useAuth } from '../utils/auth';
import { subscribeTelemetry } from '../utils/firebase';

// Simulated roster — IDs must match ThermalLiveView's pigs.current[].id exactly
const ROSTER = [
  { id: 'Pig A (Peppa)', tag: 'EAR-001', temp: 38.4, status: 'normal' as const, emoji: '🐷' },
  { id: 'Pig B (Boss Hog)', tag: 'EAR-002', temp: 38.1, status: 'normal' as const, emoji: '🐗' },
  { id: 'Pig C (Fever)', tag: 'EAR-003', temp: 39.9, status: 'danger' as const, emoji: '🔥' },
];

const STATUS_COLORS = {
  normal: { label: 'HEALTHY', color: '#00D4AA' },
  warning: { label: 'ELEVATED', color: '#FFD700' },
  danger: { label: 'FEVER', color: '#FF3366' },
};

export default function FeedScreen() {
  const router = useRouter();
  const user = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [isTvMode, setIsTvMode] = useState(false);
  const [selectedPig, setSelectedPig] = useState<string | undefined>(undefined);

  const [telemetryFrame, setTelemetryFrame] = useState<string | undefined>(undefined);
  const [trackerCoords, setTrackerCoords] = useState<{ x?: number; y?: number; pig?: string; temp?: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    // Listen to live telemetry from Core 1 of the ESP32 (esp32-s3-01)
    const unsub = subscribeTelemetry('esp32-s3-01', (telemetry) => {
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
    return () => unsub();
  }, [user]);

  // Gated Gating Shield: If unauthenticated guest, block view completely!
  if (!user) {
    return (
      <View style={styles.lockContainer}>
        <View style={styles.lockCard}>
          {/* 'X' Close Button to prevent getting stuck */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.lockIcon}>🛡️</Text>
          <Text style={styles.lockTitle}>AUTHENTICATION REQUIRED</Text>
          <Text style={styles.lockText}>
            Authorized Farmer or Veterinarian login is required to monitor live MLX90640 thermal feeds and pig identification metrics.
          </Text>
          <TouchableOpacity 
            style={styles.authBtn} 
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.authBtnText}>LOGIN AS FARMER / VET</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Compute responsive thermal bounds to guarantee it fits any screen size (even wide-short screens)
  const isShortScreen = windowHeight < 600;
  const headerAndControlsHeight = isShortScreen ? 140 : 180;
  const maxPossibleHeight = Math.max(160, windowHeight - headerAndControlsHeight);
  const maxPossibleWidth = windowWidth - Theme.spacing.lg * 2;
  
  // Constrain standard height dynamically and calculate exact 32:24 (4:3) width
  const standardHeight = Math.min(
    isShortScreen ? 260 : 360, 
    maxPossibleHeight, 
    Math.floor((maxPossibleWidth / 32) * 24)
  );
  const standardWidth = Math.floor((standardHeight / 24) * 32);

  return (
    <View style={styles.container}>
      {isTvMode ? (
        // === FULLSCREEN TV MODE OVERLAY ===
        <View style={[styles.fullscreenOverlay, { width: windowWidth, height: windowHeight }]}>
          <ThermalLiveView 
            width={windowWidth} 
            height={windowHeight} 
            isFullscreen={true}
            selectedPigToTrack={selectedPig}
            base64Frame={telemetryFrame}
            targetX={trackerCoords?.x}
            targetY={trackerCoords?.y}
            identifiedPig={trackerCoords?.pig}
            liveTemp={trackerCoords?.temp}
          />
          
          {/* Floating Exit Button */}
          <TouchableOpacity 
            style={styles.exitTvButton} 
            onPress={() => setIsTvMode(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.exitTvText}>📺 EXIT FULLSCREEN TV MODE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // === STANDARD FEED PAGE ===
        <View style={styles.contentWrapper}>
          {/* Top Bar */}
          <View style={[styles.header, isShortScreen && styles.headerShort]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>✕ CLOSE FEED</Text>
            </TouchableOpacity>
            <Text style={[styles.title, isShortScreen && styles.titleShort]}>LIVE THERMAL ARRAY</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          {/* Main Feed Area */}
          <View style={[styles.feedArea, isShortScreen && styles.feedAreaShort]}>
            {!isShortScreen && (
              <>
                <Text style={styles.feedNotice}>📡 MLX90640 Sensor Array</Text>
                <Text style={styles.feedSub}>Actively tracking high-temperature fever clusters</Text>
              </>
            )}
            
            {/* The Dynamic Heatmap Component */}
            <View style={[styles.heatmapContainer, { width: standardWidth, height: standardHeight }]}>
              <ThermalLiveView 
                width={standardWidth - 4} 
                height={standardHeight - 4}
                selectedPigToTrack={selectedPig}
                base64Frame={telemetryFrame}
                targetX={trackerCoords?.x}
                targetY={trackerCoords?.y}
                identifiedPig={trackerCoords?.pig}
                liveTemp={trackerCoords?.temp}
              />
              
              {/* Redundant float close button for extreme clarity */}
              <TouchableOpacity 
                style={styles.floatCloseBtn} 
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Text style={styles.floatCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* === PIG ROSTER — Tap to Track === */}
            <View style={styles.rosterPanel}>
              <View style={styles.rosterHeader}>
                <Text style={styles.rosterTitle}>🐷 PIG ROSTER</Text>
                <Text style={styles.rosterSub}>{selectedPig ? `🎯 Tracking: ${selectedPig}` : 'Tap a pig to track on feed'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterScroll}>
                {/* Show All button */}
                <TouchableOpacity
                  style={[styles.rosterChip, !selectedPig && styles.rosterChipActive]}
                  onPress={() => setSelectedPig(undefined)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rosterChipEmoji}>👁️</Text>
                  <Text style={[styles.rosterChipName, !selectedPig && styles.rosterChipNameActive]}>ALL</Text>
                </TouchableOpacity>
                {ROSTER.map((pig) => {
                  const isActive = selectedPig === pig.id;
                  const sc = STATUS_COLORS[pig.status];
                  return (
                    <TouchableOpacity
                      key={pig.id}
                      style={[styles.rosterChip, isActive && styles.rosterChipActive]}
                      onPress={() => setSelectedPig(isActive ? undefined : pig.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rosterChipEmoji}>{pig.emoji}</Text>
                      <View>
                        <Text style={[styles.rosterChipName, isActive && styles.rosterChipNameActive]}>{pig.id}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Text style={[styles.rosterChipTemp, { color: sc.color }]}>{pig.temp}°C</Text>
                          <Text style={[styles.rosterChipBadge, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      </View>
                      {isActive && <Text style={styles.rosterTrackDot}>●</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Toggle TV Fullscreen Button */}
            <TouchableOpacity 
              style={styles.tvButton} 
              onPress={() => setIsTvMode(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.tvButtonText}>📺 ENTER FULLSCREEN TV MODE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050A', // Deep space background
  },
  contentWrapper: {
    flex: 1,
    flexDirection: 'column',
  },
  lockContainer: {
    flex: 1,
    backgroundColor: '#05050A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.xl,
  },
  lockCard: {
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.danger,
    shadowColor: Theme.colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    position: 'relative',
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: Theme.spacing.md,
  },
  lockTitle: {
    color: Theme.colors.danger,
    fontSize: Theme.typography.h2,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: Theme.spacing.md,
  },
  lockText: {
    color: Theme.colors.textSecondary,
    fontSize: Theme.typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Theme.spacing.xl,
  },
  authBtn: {
    backgroundColor: Theme.colors.danger,
    paddingHorizontal: Theme.spacing.xl,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  authBtnText: {
    color: '#fff',
    fontSize: Theme.typography.body,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    zIndex: 10,
  },
  closeBtnText: {
    color: Theme.colors.textMuted,
    fontSize: 18,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50, 
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.background,
  },
  headerShort: {
    paddingTop: 16,
    paddingBottom: Theme.spacing.xs,
  },
  backButton: {
    paddingVertical: Theme.spacing.xs,
    paddingHorizontal: Theme.spacing.md,
    backgroundColor: Theme.colors.danger + '33',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.danger,
  },
  backButtonText: {
    color: Theme.colors.danger,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  titleShort: {
    fontSize: 14,
    letterSpacing: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.success + '22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: Theme.colors.success,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.success,
    marginRight: 6,
  },
  liveText: {
    color: Theme.colors.success,
    fontWeight: 'bold',
    fontSize: Theme.typography.caption,
  },
  feedArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  feedAreaShort: {
    padding: Theme.spacing.sm,
  },
  feedNotice: {
    color: Theme.colors.primary,
    fontSize: Theme.typography.h2,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.xs,
  },
  feedSub: {
    color: Theme.colors.textSecondary,
    fontSize: Theme.typography.body,
    marginBottom: Theme.spacing.xl,
    textAlign: 'center',
  },
  heatmapContainer: {
    borderRadius: Theme.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
    marginBottom: Theme.spacing.lg,
    position: 'relative',
  },
  floatCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(5, 5, 10, 0.85)',
    borderWidth: 1,
    borderColor: Theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  floatCloseBtnText: {
    color: Theme.colors.danger,
    fontSize: 14,
    fontWeight: 'bold',
  },
  tvButton: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  tvButtonText: {
    color: '#05050A',
    fontSize: Theme.typography.body,
    fontWeight: '900',
    letterSpacing: 1,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  exitTvButton: {
    position: 'absolute',
    top: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 74, 74, 0.95)',
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.pill,
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 10000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  exitTvText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  // === Roster Styles ===
  rosterPanel: {
    width: '100%',
    maxWidth: 600,
    marginBottom: Theme.spacing.md,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.xs,
  },
  rosterTitle: {
    color: Theme.colors.text,
    fontSize: Theme.typography.caption,
    fontWeight: '900',
    letterSpacing: 2,
  },
  rosterSub: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  rosterScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  rosterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rosterChipActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '15',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  rosterChipEmoji: {
    fontSize: 22,
  },
  rosterChipName: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  rosterChipNameActive: {
    color: Theme.colors.primary,
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
  rosterTrackDot: {
    color: Theme.colors.primary,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 4,
  },
});
