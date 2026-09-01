import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../utils/auth';
import { haptic } from '../../utils/haptics';
import { router } from 'expo-router';

export default function EdgeImpulseScreen() {
  useAuth();
  const { colors } = useTheme();
  const [status, setStatus] = useState({
    modelVersion: 'v1.0',
    accuracy: 0,
    samplesCollected: 0,
    samplesTarget: 1500,
    lastTraining: 'Never',
    status: 'ready' as 'training' | 'ready' | 'deployed' | 'error'
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(prev => {
        if (prev.samplesCollected < prev.samplesTarget) {
          return {
            ...prev,
            samplesCollected: Math.min(prev.samplesCollected + Math.floor(Math.random() * 10), prev.samplesTarget),
            accuracy: Math.min(prev.accuracy + Math.random() * 2, 85),
            status: prev.samplesCollected >= 1000 ? 'training' : 'ready'
          };
        }
        return prev;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return colors.success;
      case 'training': return colors.warning;
      case 'deployed': return colors.accent;
      case 'error': return colors.error;
      default: return colors.textPrimary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready for Training';
      case 'training': return 'Training in Progress';
      case 'deployed': return 'Model Deployed';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          onPress={() => { haptic('light'); router.back(); }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close Edge Impulse"
          accessibilityHint="Navigates back to the previous screen"
        >
          <Text style={styles.backButtonText}>✕ CLOSE</Text>
        </TouchableOpacity>
        <Text style={styles.title}>EDGE IMPULSE</Text>
        <View style={styles.statusBadge}>
          <Text style={[styles.statusText, { color: getStatusColor(status.status) }]}>
            {getStatusText(status.status)}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Model Overview */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.accent }]}>🤖 MODEL OVERVIEW</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Audio-based cough detection system</Text>
          
          <View style={styles.modelInfo}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Model Version:</Text>
            <Text style={styles.infoValue}>{status.modelVersion}</Text>
            
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Target Accuracy:</Text>
            <Text style={styles.infoValue}>85-90%</Text>
            
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Current Accuracy:</Text>
            <Text style={[styles.infoValue, { color: getStatusColor(status.status) }]}>
              {status.accuracy.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Data Collection */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.accent }]}>📊 DATA COLLECTION</Text>
          <Text style={styles.cardSubtitle}>
            Collecting cough and non-cough audio samples
          </Text>
          
          <View style={[styles.progressContainer, { backgroundColor: colors.border }]}>
            <View style={[styles.progressBar, { width: `${(status.samplesCollected / status.samplesTarget) * 100}%`, backgroundColor: colors.accent }]} />
          </View>
          
          <Text style={styles.progressText}>
            {status.samplesCollected} / {status.samplesTarget} samples collected
          </Text>
          
          <Text style={[styles.progressSub, { color: colors.textSecondary }]}>
            {status.samplesCollected >= status.samplesTarget 
              ? '✅ Data collection complete!' 
              : `Need ${status.samplesTarget - status.samplesCollected} more samples`}
          </Text>
        </View>

        {/* Technical Specifications */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.accent }]}>⚙️ TECH SPECS</Text>
          
          <View style={styles.specs}>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>Audio Format:</Text>
              <Text style={styles.specValue}>16kHz, 16-bit</Text>
            </View>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>Window Size:</Text>
              <Text style={styles.specValue}>1000ms</Text>
            </View>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>Overlap:</Text>
              <Text style={styles.specValue}>70% (300ms)</Text>
            </View>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>MEL Filters:</Text>
              <Text style={styles.specValue}>32 bands</Text>
            </View>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>FFT Size:</Text>
              <Text style={styles.specValue}>1024 points</Text>
            </View>
            <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>ESP32 Memory:</Text>
              <Text style={styles.specValue}>441KB required</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = {
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
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
    fontWeight: '900' as const,
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold' as const,
    letterSpacing: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  contentContainer: {
    padding: 16,
  },
  content: {
    gap: 16,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '900' as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 11,
    marginBottom: 12,
  },
  modelInfo: {
    gap: 8,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  progressContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%' as const,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  progressSub: {
    fontSize: 11,
  },
  specs: {
    gap: 8,
  },
  specRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  specLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  specValue: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
};