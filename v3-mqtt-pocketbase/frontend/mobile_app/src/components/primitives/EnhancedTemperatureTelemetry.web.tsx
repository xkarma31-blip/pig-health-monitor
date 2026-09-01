import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { 
  TemperatureAnalyzer, 
  TemperatureType, 
  TemperatureReading 
} from '../../utils/temperature';
import { VisualHierarchy, StatusIndicator, EnhancedCard, AccessibleButton } from './VisualHierarchy';
import { ThermometerIcon } from './Icons';

interface EnhancedTemperatureTelemetryProps {
  penId: string;
  pigId?: string;
  surfaceTemperature?: number;
  coreTemperature?: number;
  estimatedCore?: number;
  sensorConfidence?: number;
  historicalData?: TemperatureReading[];
  onTemperatureAlert?: (alert: any) => void;
  onVetContact?: () => void;
  showDetails?: boolean;
}

// Screen dimensions for responsive design

export function EnhancedTemperatureTelemetry({
  penId,
  pigId = 'Unknown',
  surfaceTemperature = 38.9,
  coreTemperature,
  estimatedCore,
  sensorConfidence = 0.85,
  historicalData = [],
  onTemperatureAlert,
  onVetContact,
  showDetails = true,
}: EnhancedTemperatureTelemetryProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [localSurfaceTemp, setLocalSurfaceTemp] = useState(surfaceTemperature);
  const [localCoreTemp, setLocalCoreTemp] = useState(coreTemperature);
  const [localEstimatedCore] = useState(estimatedCore);
  
  // Analyze temperatures
  const surfaceAnalysis = TemperatureAnalyzer.analyzeTemperature(
    localSurfaceTemp,
    'surface',
    sensorConfidence
  );
  
  const coreAnalysis = localCoreTemp ? 
    TemperatureAnalyzer.analyzeTemperature(
      localCoreTemp,
      'core',
      sensorConfidence
    ) : null;
  
  const estimatedAnalysis = localEstimatedCore ? 
    TemperatureAnalyzer.analyzeTemperature(
      localEstimatedCore,
      'estimatedCore',
      sensorConfidence
    ) : null;

  // Get status for non-color indicators
  const getStatusForIndicator = (analysis: any) => {
    if (!analysis) return 'normal';
    return analysis.status;
  };
  
  // Handle temperature alerts
  const handleTemperatureAlert = (alert: any) => {
    if (onTemperatureAlert) {
      onTemperatureAlert(alert);
    }
  };
  
  // Handle vet contact
  const handleVetContact = () => {
    if (onVetContact) {
      onVetContact();
    }
  };
  
  // Format temperature for display
  const formatTemperature = (temp: number, type: TemperatureType) => {
    return `${temp}°C (${TemperatureAnalyzer.formatTemperature(temp, type)})`;
  };
  
  // Accessibility labels
  const getAccessibilityLabel = (type: string, temperature: number, status: string) => {
    return `${type} temperature: ${temperature}°C - ${status} status`;
  };

  return (
    <EnhancedCard
      variant={surfaceAnalysis.status}
      accessibilityLabel={`Temperature card for ${penId} - ${pigId}`}
    >
      <View style={styles.container}>
        {/* Main temperature display */}
        <View style={styles.mainDisplay}>
          <ThermometerIcon size={32} color={surfaceAnalysis.color} />
          <View style={styles.tempInfo}>
            <VisualHierarchy
              type="TITLE"
              accessibilityLabel={getAccessibilityLabel('Surface', localSurfaceTemp, surfaceAnalysis.status)}
              style={{ color: theme.colors.textPrimary }}
            >
              Surface Temperature
            </VisualHierarchy>
            <VisualHierarchy
              type="BODY"
              accessibilityLabel={`Temperature value: ${localSurfaceTemp}°C`}
              style={{ color: theme.colors.textSecondary }}
            >
              {formatTemperature(localSurfaceTemp, 'surface')}
            </VisualHierarchy>
          </View>
          <StatusIndicator
            status={getStatusForIndicator(surfaceAnalysis)}
            size={32}
            accessibilityLabel={`Status: ${surfaceAnalysis.status}`}
          />
        </View>
       
        {/* Confidence indicator */}
        <View style={styles.confidenceContainer}>
          <VisualHierarchy type="CAPTION" accessibilityLabel="Sensor confidence" style={{ color: theme.colors.textMuted }}>
            Confidence: {Math.round(sensorConfidence * 100)}%
          </VisualHierarchy>
          <View style={[styles.confidenceBar, { backgroundColor: theme.colors.border }]}>
            <View
              style={{
                width: `${sensorConfidence * 100}%`,
                height: 4,
                backgroundColor: sensorConfidence > 0.8 ? theme.colors.success : sensorConfidence > 0.6 ? theme.colors.warning : theme.colors.error,
              }}
            />
          </View>
        </View>
       
        {/* Temperature Input Controls (Web-specific) */}
        <View style={[styles.inputSection, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.borderVariant }]}>
          <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>Simulation Controls</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textPrimary }]}>Surface Temp (°C)</Text>
              <Text style={[styles.inputValue, { color: theme.colors.textPrimary }]}>
                {localSurfaceTemp.toFixed(1)}
              </Text>
              <View style={styles.sliderContainer}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>35</Text>
                <View style={[styles.sliderTrack, { backgroundColor: theme.colors.surface }]}>
                  <View
                    style={{
                      width: `${((localSurfaceTemp - 35) / 10) * 100}%`,
                      height: '100%',
                      backgroundColor: surfaceAnalysis.color,
                      borderRadius: 2,
                    }}
                  />
                </View>
                <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>45</Text>
              </View>
              <View style={styles.sliderButtons}>
                <TouchableOpacity
                  style={[styles.sliderButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.accent }]}
                  onPress={() => setLocalSurfaceTemp(Math.max(35, localSurfaceTemp - 0.1))}
                  accessibilityLabel="Decrease surface temperature"
                >
                  <Text style={{ color: theme.colors.textPrimary }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sliderButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.accent }]}
                  onPress={() => setLocalSurfaceTemp(Math.min(45, localSurfaceTemp + 0.1))}
                  accessibilityLabel="Increase surface temperature"
                >
                  <Text style={{ color: theme.colors.textPrimary }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {localCoreTemp !== undefined && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.colors.textPrimary }]}>Core Temp (°C)</Text>
                <Text style={[styles.inputValue, { color: theme.colors.textPrimary }]}>
                  {localCoreTemp.toFixed(1)}
                </Text>
                <View style={styles.sliderContainer}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>36</Text>
                  <View style={[styles.sliderTrack, { backgroundColor: theme.colors.surface }]}>
                    <View
                      style={{
                        width: `${((localCoreTemp - 36) / 6) * 100}%`,
                        height: '100%',
                        backgroundColor: coreAnalysis?.color || theme.colors.info,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 10 }}>42</Text>
                </View>
                <View style={styles.sliderButtons}>
                  <TouchableOpacity
                    style={[styles.sliderButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.accent }]}
                    onPress={() => setLocalCoreTemp(Math.max(36, localCoreTemp - 0.1))}
                    accessibilityLabel="Decrease core temperature"
                  >
                    <Text style={{ color: theme.colors.textPrimary }}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sliderButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.accent }]}
                    onPress={() => setLocalCoreTemp(Math.min(42, localCoreTemp + 0.1))}
                    accessibilityLabel="Increase core temperature"
                  >
                    <Text style={{ color: theme.colors.textPrimary }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
       
        {/* Expandable details */}
        {showDetails && (
          <TouchableOpacity
            style={[styles.expandButton, { borderBottomColor: theme.colors.border }]}
            onPress={() => setExpanded(!expanded)}
            accessibilityLabel={expanded ? 'Show less details' : 'Show more details'}
            accessibilityHint={expanded ? 'Collapses additional temperature information' : 'Expands to show more temperature details'}
          >
            <VisualHierarchy type="CAPTION" style={{ color: theme.colors.accent }}>
              {expanded ? 'Show Less' : 'Show Details'}
            </VisualHierarchy>
            <Text style={[styles.expandIcon, { color: theme.colors.textMuted }]}>
              {expanded ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
        )}
       
        {/* Detailed information */}
        {expanded && (
          <ScrollView style={styles.detailsContainer}>
            {/* Core temperature */}
            {coreAnalysis && (
              <EnhancedCard variant={coreAnalysis.status} style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <StatusIndicator
                    status={getStatusForIndicator(coreAnalysis)}
                    size={24}
                    accessibilityLabel={`Core temperature status: ${coreAnalysis.status}`}
                  />
                  <View style={styles.detailInfo}>
                    <VisualHierarchy type="SUBTITLE" style={{ color: theme.colors.textPrimary }}>
                      Core Temperature
                    </VisualHierarchy>
                    <VisualHierarchy type="BODY" style={{ color: theme.colors.textSecondary }}>
                      {formatTemperature(localCoreTemp!, 'core')}
                    </VisualHierarchy>
                  </View>
                </View>
              </EnhancedCard>
            )}
           
            {/* Estimated core temperature */}
            {estimatedAnalysis && (
              <EnhancedCard variant={estimatedAnalysis.status} style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <StatusIndicator
                    status={getStatusForIndicator(estimatedAnalysis)}
                    size={24}
                    accessibilityLabel={`Estimated core temperature status: ${estimatedAnalysis.status}`}
                  />
                  <View style={styles.detailInfo}>
                    <VisualHierarchy type="SUBTITLE" style={{ color: theme.colors.textPrimary }}>
                      Estimated Core Temperature
                    </VisualHierarchy>
                    <VisualHierarchy type="BODY" style={{ color: theme.colors.textSecondary }}>
                      {formatTemperature(localEstimatedCore!, 'estimatedCore')}
                    </VisualHierarchy>
                  </View>
                </View>
              </EnhancedCard>
            )}
           
            {/* Historical data */}
            {historicalData.length > 0 && (
              <View style={styles.historicalSection}>
                <VisualHierarchy type="SUBTITLE" accessibilityLabel="Recent temperature readings" style={{ color: theme.colors.textPrimary }}>
                  Recent Readings
                </VisualHierarchy>
                {historicalData.slice(0, 5).map((reading, _index) => (
                  <View key={reading.id} style={[styles.historicalItem, { borderBottomColor: theme.colors.border }]}>
                    <VisualHierarchy type="CAPTION" style={{ color: theme.colors.textMuted }}>
                      {reading.timestamp.toLocaleTimeString()}
                    </VisualHierarchy>
                    <VisualHierarchy type="CAPTION" style={{ color: theme.colors.textSecondary }}>
                      {formatTemperature(reading.temperature, reading.type)}
                    </VisualHierarchy>
                    <VisualHierarchy type="CAPTION" style={{ color: theme.colors.textMuted }}>
                      {Math.round(reading.confidence * 100)}%
                    </VisualHierarchy>
                  </View>
                ))}
              </View>
            )}
           
            {/* Action buttons */}
            <View style={styles.actionButtons}>
              <AccessibleButton
                variant={surfaceAnalysis.status === 'critical' ? 'danger' : 'primary'}
                 onPress={handleTemperatureAlert as any}
                accessibilityLabel="Temperature alert"
                accessibilityHint="Opens temperature alert dialog"
              >
                View Alert Details
              </AccessibleButton>
             
              {surfaceAnalysis.status !== 'normal' && (
                <AccessibleButton
                  variant="secondary"
                  onPress={handleVetContact}
                  accessibilityLabel="Contact veterinarian"
                  accessibilityHint="Opens veterinarian contact options"
                >
                  Contact Vet
                </AccessibleButton>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </EnhancedCard>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    minHeight: 120,
  },
  mainDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tempInfo: {
    flex: 1,
    marginLeft: 12,
  },
  confidenceContainer: {
    marginBottom: 12,
  },
  confidenceBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  expandButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  expandIcon: {
    fontSize: 12,
  },
  detailsContainer: {
    marginTop: 12,
  },
  detailCard: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  historicalSection: {
    marginBottom: 16,
  },
  historicalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  // Web-specific styles
  inputSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  inputGroup: {
    flex: 1,
    minWidth: 180,
  },
  inputValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sliderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EnhancedTemperatureTelemetry;