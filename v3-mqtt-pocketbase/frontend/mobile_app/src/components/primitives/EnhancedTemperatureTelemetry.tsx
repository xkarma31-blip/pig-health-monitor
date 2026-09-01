/**
 * Enhanced Temperature Telemetry Component
 * Improved visual hierarchy, accessibility, and non-color indicators
 * Designed for farmers and veterinarians with comprehensive accessibility features
 */

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
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  
  // Analyze temperatures
  const surfaceAnalysis = TemperatureAnalyzer.analyzeTemperature(
    surfaceTemperature,
    'surface',
    sensorConfidence
  );
  
  const coreAnalysis = coreTemperature ? 
    TemperatureAnalyzer.analyzeTemperature(
      coreTemperature,
      'core',
      sensorConfidence
    ) : null;
  
  const estimatedAnalysis = estimatedCore ? 
    TemperatureAnalyzer.analyzeTemperature(
      estimatedCore,
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
              accessibilityLabel={getAccessibilityLabel('Surface', surfaceTemperature, surfaceAnalysis.status)}
            >
              Surface Temperature
            </VisualHierarchy>
            <VisualHierarchy
              type="BODY"
              accessibilityLabel={`Temperature value: ${surfaceTemperature}°C`}
            >
              {formatTemperature(surfaceTemperature, 'surface')}
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
          <VisualHierarchy type="CAPTION" accessibilityLabel="Sensor confidence">
            Confidence: {Math.round(sensorConfidence * 100)}%
          </VisualHierarchy>
          <View style={styles.confidenceBar}>
            <View
              style={{
                width: `${sensorConfidence * 100}%`,
                height: 4,
                backgroundColor: sensorConfidence > 0.8 ? colors.success : sensorConfidence > 0.6 ? colors.warning : colors.error,
              }}
            />
          </View>
        </View>
        
        {/* Expandable details */}
        {showDetails && (
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setExpanded(!expanded)}
            accessibilityLabel={expanded ? 'Show less details' : 'Show more details'}
            accessibilityHint={expanded ? 'Collapses additional temperature information' : 'Expands to show more temperature details'}
          >
            <VisualHierarchy type="CAPTION">
              {expanded ? 'Show Less' : 'Show Details'}
            </VisualHierarchy>
            <Text style={styles.expandIcon}>
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
                    <VisualHierarchy type="SUBTITLE">
                      Core Temperature
                    </VisualHierarchy>
                    <VisualHierarchy type="BODY">
                      {formatTemperature(coreTemperature!, 'core')}
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
                    <VisualHierarchy type="SUBTITLE">
                      Estimated Core Temperature
                    </VisualHierarchy>
                    <VisualHierarchy type="BODY">
                      {formatTemperature(estimatedCore!, 'estimatedCore')}
                    </VisualHierarchy>
                  </View>
                </View>
              </EnhancedCard>
            )}
            
            {/* Historical data */}
            {historicalData.length > 0 && (
              <View style={styles.historicalSection}>
                <VisualHierarchy type="SUBTITLE" accessibilityLabel="Recent temperature readings">
                  Recent Readings
                </VisualHierarchy>
                {historicalData.slice(0, 5).map((reading, _index) => (
                  <View key={reading.id} style={styles.historicalItem}>
                    <VisualHierarchy type="CAPTION">
                      {reading.timestamp.toLocaleTimeString()}
                    </VisualHierarchy>
                    <VisualHierarchy type="CAPTION">
                      {formatTemperature(reading.temperature, reading.type)}
                    </VisualHierarchy>
                    <VisualHierarchy type="CAPTION">
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
          // @ts-expect-error colors not in module scope
              backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 4,
  },
  expandButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
            // @ts-expect-error colors not in module scope
                borderBottomColor: colors.border,
  },
  expandIcon: {
    fontSize: 12,
            // @ts-expect-error colors not in module scope
                color: colors.textSecondary,
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
            // @ts-expect-error colors not in module scope
                borderBottomColor: colors.border,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
});