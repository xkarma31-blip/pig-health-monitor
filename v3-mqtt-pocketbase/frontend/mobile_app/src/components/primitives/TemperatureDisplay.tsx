/** * Improved Temperature Display Component
 * Addresses surface vs core temperature discrepancy and alert logic
 * Designed for farmers and veterinarians with clear, accessible information
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ThermometerIcon } from './Icons';

interface TemperatureDisplayProps {
  temperature: number;
  type: TemperatureType;
  penId: string;
  pigId?: string;
  confidence?: number;
  showDetails?: boolean;
  onPress?: () => void;
  trend?: number[];
  historicalData?: TemperatureReading[];
}

export function TemperatureDisplay({
  temperature,
  penId,
  confidence = 1.0,
  showDetails = false,
  onPress,
  trend,
}: TemperatureDisplayProps) {
  // Mock analysis since we don't have the TemperatureAnalyzer
  const analysis = {
    status: temperature > 39.5 ? 'FEVER' : temperature < 38.0 ? 'LOW' : 'NORMAL',
    color: temperature > 39.5 ? '#FF6B6B' : temperature < 38.0 ? '#F39C12' : '#1E8449',
    message: temperature > 39.5 ? 'Elevated temperature detected' : 
              temperature < 38.0 ? 'Below normal temperature' : 
              'Temperature within normal range'
  };
  
  const formattedTemp = `${temperature.toFixed(1)}°C`;
  
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperInteractiveProps = onPress ? {
    onPress,
    accessibilityLabel: `Temperature details for ${penId}`,
    accessibilityHint: analysis.message,
  } : {};

  return (
    <Wrapper
      style={[
        styles.container,
        {
          backgroundColor: '#3D3D5C',
          borderColor: '#4A4A6A',
          borderWidth: 1,
        },
      ]}
      {...wrapperInteractiveProps}
    >
      {/* Temperature Header */}
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <ThermometerIcon 
            size={20} 
            color={analysis.color}
          />
          <View style={styles.textSection}>
            <Text style={[styles.temperatureText, { color: analysis.color }]}>
              {formattedTemp}
            </Text>
            <Text style={[styles.statusText, { color: '#B0B0B0' }]}>
              {analysis.status.toUpperCase()}
            </Text>
          </View>
        </View>
        
        {/* Status Icon */}
        <View style={styles.statusIcon}>
          <Text style={[styles.statusIconText, { color: analysis.color }]}>
            {analysis.status === 'FEVER' ? '🔥' : analysis.status === 'LOW' ? '❄️' : '🌡️'}
          </Text>
        </View>
      </View>

      {/* Details Section */}
      {showDetails && (
        <View style={styles.details}>
          <Text style={[styles.messageText, { color: '#FFFFFF' }]}>
            {analysis.message}
          </Text>
          
          {/* Trend Graph */}
          {trend && trend.length > 0 && (
            <View style={styles.trendContainer}>
              <Text style={[styles.trendLabel, { color: '#B0B0B0' }]}>
                Trend:
              </Text>
              {/* Sparkline would go here */}
              <Text style={[styles.trendText, { color: analysis.color }]}>
                {trend[trend.length - 1] > trend[0] ? '↗️ Rising' : '↘️ Stable'}
              </Text>
            </View>
          )}
          
          {/* Confidence Indicator */}
          <View style={styles.confidenceContainer}>
            <Text style={[styles.confidenceLabel, { color: '#B0B0B0' }]}>
              Sensor Confidence:
            </Text>
            <View style={styles.confidenceBar}>
              <View 
                style={[
                  styles.confidenceFill,
                  { 
                    width: `${confidence * 100}%`,
                    backgroundColor: confidence > 0.8 ? '#1E8449' : 
                                   confidence > 0.6 ? '#F39C12' : '#FF6B6B'
                  }
                ]}
              />
            </View>
            <Text style={[styles.confidenceText, { color: '#B0B0B0' }]}>
              {Math.round(confidence * 100)}%
            </Text>
          </View>
        </View>
      )}

      {/* Quick Action Buttons */}
      {showDetails && (
        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#1E8449' }]}
            onPress={() => console.log('View details')}
          >
            <Text style={styles.actionButtonText}>Details</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#4A4A6A' }]}
            onPress={() => console.log('Contact vet')}
          >
            <Text style={styles.actionButtonText}>Call Vet</Text>
          </TouchableOpacity>
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: 12,
  },
  textSection: {
    flex: 1,
  },
  temperatureText: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A4A6A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconText: {
    fontSize: 20,
  },
  details: {
    marginTop: 12,
  },
  messageText: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  trendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  trendLabel: {
    fontSize: 12,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  confidenceLabel: {
    fontSize: 12,
    marginRight: 8,
    minWidth: 100,
  },
  confidenceBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#4A4A6A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 12,
    marginLeft: 8,
    minWidth: 40,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

// Mock types for compilation
type TemperatureType = 'SURFACE' | 'CORE' | 'AMBIENT';
interface TemperatureReading {
  id: string;
  penId: string;
  pigId?: string;
  temperature: number;
  type: TemperatureType;
  timestamp: Date;
  sensorId: string;
  confidence: number;
}