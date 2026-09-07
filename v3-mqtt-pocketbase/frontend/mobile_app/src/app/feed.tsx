import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { ThermalLiveView } from '../components/ThermalLiveView';
import { useAuth } from '../utils/auth';
import { subscribeTelemetry } from '../utils/pocketbase-data';
import { AuthBanner } from '../components/shared/AuthBanner';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

const ROSTER = [
  { id: 'Pig A (Peppa)', tag: 'EAR-001', temp: 38.4, status: 'healthy' as const, emoji: '🐷' },
  { id: 'Pig B (Boss Hog)', tag: 'EAR-002', temp: 38.1, status: 'healthy' as const, emoji: '🐗' },
  { id: 'Pig C (Fever)', tag: 'EAR-003', temp: 39.9, status: 'alert' as const, emoji: '🔥' },
];

const STATUS_COLORS = {
  healthy: { label: 'HEALTHY', color: 'healthy' },
  watch: { label: 'ELEVATED', color: 'watch' },
  alert: { label: 'FEVER', color: 'alert' },
};

export default function FeedScreen() {
  const router = useRouter();
  const user = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { colors, spacing } = useTheme();
  const [isTvMode, setIsTvMode] = useState(false);
  const [selectedPig, setSelectedPig] = useState<string | undefined>(undefined);

  const [telemetryFrame, setTelemetryFrame] = useState<string | undefined>(undefined);
  const [trackerCoords, setTrackerCoords] = useState<{ x?: number; y?: number; pig?: string; temp?: number } | null>(null);

  useEffect(() => {
    if (!user) return;
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

  const isShortScreen = windowHeight < 600;
  const headerAndControlsHeight = isShortScreen ? 140 : 180;
  const maxPossibleHeight = Math.max(160, windowHeight - headerAndControlsHeight);
  const maxPossibleWidth = windowWidth - spacing.lg * 2;

  const standardHeight = Math.min(
    isShortScreen ? 260 : 360,
    maxPossibleHeight,
    Math.floor((maxPossibleWidth / 32) * 24)
  );
  const standardWidth = Math.floor((standardHeight / 24) * 32);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {isTvMode ? (
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

          <TouchableOpacity
            style={styles.exitTvButton}
            onPress={() => {
              haptic('light');
              playSound('tap');
              setIsTvMode(false);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Exit fullscreen TV mode"
          >
            <Text style={[styles.exitTvText, { color: colors.onAccent }]}>📺 EXIT FULLSCREEN TV MODE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.contentWrapper}>
          {!user && (
            <AuthBanner
              title="Not authenticated"
              message="Log in to receive live thermal frames from Firebase"
              buttonLabel="LOG IN"
              onPress={() => router.push('/login')}
            />
          )}
          <View style={[styles.header, isShortScreen && styles.headerShort, { borderBottomColor: colors.divider }]}>
            <TouchableOpacity
              onPress={() => { haptic('light'); playSound('tap'); router.back(); }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Close feed"
            >
              <Text style={styles.backButtonText}>✕ CLOSE FEED</Text>
            </TouchableOpacity>
            <Text style={[styles.title, isShortScreen && styles.titleShort]}>LIVE THERMAL ARRAY</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          <View style={[styles.feedArea, isShortScreen && styles.feedAreaShort]}>
            {!isShortScreen && (
              <>
                <Text style={styles.feedNotice}>📡 MLX90640 Sensor Array</Text>
                <Text style={styles.feedSub}>Actively tracking high-temperature fever clusters</Text>
              </>
            )}

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

              <TouchableOpacity
                style={styles.floatCloseBtn}
                onPress={() => router.back()}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Close thermal feed"
              >
                <Text style={styles.floatCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rosterPanel}>
              <View style={styles.rosterHeader}>
                <Text style={styles.rosterTitle}>🐷 PIG ROSTER</Text>
                <Text style={styles.rosterSub}>{selectedPig ? `🎯 Tracking: ${selectedPig}` : 'Tap a pig to track on feed'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterScroll}>
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
                        <Text style={[styles.rosterChipTemp, { color: pig.status === 'healthy' ? colors.healthy : colors.alert }]}>{pig.temp}°C</Text>
                        <Text style={[styles.rosterChipBadge, { color: pig.status === 'healthy' ? colors.healthy : colors.alert }]}>{sc.label}</Text>
                        </View>
                      </View>
                      {isActive && <Text style={styles.rosterTrackDot}>●</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity
              style={styles.tvButton}
              onPress={() => setIsTvMode(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Enter fullscreen TV mode"
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
  },
  contentWrapper: {
    flex: 1,
    flexDirection: 'column',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
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
  headerShort: {
    paddingTop: 16,
    paddingBottom: 4,
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
  titleShort: {
    fontSize: 14,
    letterSpacing: 1,
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
  feedArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  feedAreaShort: {
    padding: 8,
  },
  feedNotice: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  feedSub: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  heatmapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    marginBottom: 16,
    position: 'relative',
  },
  floatCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  floatCloseBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tvButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  tvButtonText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  exitTvButton: {
    position: 'absolute',
    top: 30,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    zIndex: 10000,
  },
  exitTvText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  rosterPanel: {
    width: '100%',
    maxWidth: 600,
    marginBottom: 16,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rosterTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 2,
  },
  rosterSub: {
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
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  rosterChipActive: {
    borderWidth: 1,
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
  rosterTrackDot: {
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 4,
  },
});
