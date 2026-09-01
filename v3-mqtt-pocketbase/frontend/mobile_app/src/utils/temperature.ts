/**
 * Temperature Telemetry System
 * Comprehensive temperature monitoring with veterinary standards
 * Addresses surface vs core temperature discrepancy and alert logic
 */

export type TemperatureType = 'surface' | 'core' | 'estimatedCore';

export interface TemperatureReading {
  id: string;
  penId: string;
  pigId?: string;
  temperature: number;
  type: TemperatureType;
  timestamp: Date;
  sensorId: string;
  confidence: number; // 0-1 confidence level
}

export interface TemperatureAlert {
  id: string;
  penId: string;
  pigId?: string;
  temperature: number;
  type: TemperatureType;
  severity: 'normal' | 'elevated' | 'high' | 'critical';
  message: string;
  recommendation: string;
  timestamp: Date;
  resolved: boolean;
}

export interface TemperatureThresholds {
  // Core temperature thresholds (veterinary standards)
  core: {
    normal: { min: number; max: number };
    elevated: { min: number; max: number };
    high: { min: number; max: number };
    critical: { min: number; max: number };
  };
  
  // Surface temperature thresholds (typically 1-2°C lower than core)
  surface: {
    normal: { min: number; max: number };
    elevated: { min: number; max: number };
    high: { min: number; max: number };
    critical: { min: number; max: number };
  };
  
  // Estimated core temperature (surface + calibration offset)
  estimatedCore: {
    normal: { min: number; max: number };
    elevated: { min: number; max: number };
    high: { min: number; max: number };
    critical: { min: number; max: number };
  };
}

// Veterinary-standard temperature thresholds
export const TEMPERATURE_THRESHOLDS: TemperatureThresholds = {
  core: {
    normal: { min: 38.5, max: 39.8 },     // Normal rectal temperature
    elevated: { min: 39.8, max: 40.5 },   // Slightly elevated
    high: { min: 40.5, max: 41.2 },       // High fever
    critical: { min: 41.2, max: 42.0 },   // Critical fever
  },
  surface: {
    normal: { min: 37.5, max: 38.8 },     // Normal surface temperature (1°C lower than core)
    elevated: { min: 38.8, max: 39.5 },   // Elevated surface
    high: { min: 39.5, max: 40.2 },       // High surface
    critical: { min: 40.2, max: 41.0 },   // Critical surface
  },
  estimatedCore: {
    normal: { min: 38.5, max: 39.6 },     // Estimated core from surface (+1°C)
    elevated: { min: 39.6, max: 40.3 },   // Estimated elevated
    high: { min: 40.3, max: 41.0 },       // Estimated high
    critical: { min: 41.0, max: 41.8 },   // Estimated critical
  },
};

// Temperature calibration offset (surface to core)
export const CALIBRATION_OFFSETS = {
  default: 1.0,      // Default: surface + 1°C = core
  summer: 0.8,       // Summer: less offset due to environmental heat
  winter: 1.2,       // Winter: more offset due to environmental cold
  stress: 0.6,        // During stress: less offset due to metabolic changes
};

export class TemperatureAnalyzer {
  /**
   * Analyze temperature reading and determine status
   */
  static analyzeTemperature(
    temperature: number,
    type: TemperatureType = 'core',
    confidence: number = 1.0
  ): {
    status: 'normal' | 'elevated' | 'high' | 'critical';
    message: string;
    recommendation: string;
    color: string;
    icon: string;
  } {
    const thresholds = TEMPERATURE_THRESHOLDS[type];
    let status: 'normal' | 'elevated' | 'high' | 'critical';
    let message: string;
    let recommendation: string;
    let color: string;
    let icon: string;

    // Adjust thresholds based on confidence
    const adjustedThresholds = this.adjustThresholdsByConfidence(thresholds, confidence);

    if (temperature >= adjustedThresholds.critical.min) {
      status = 'critical';
      message = 'Critical fever detected - immediate attention required';
      recommendation = 'Isolate affected pigs and consult veterinarian immediately';
      color = '#FF0000'; // Red
      icon = '🚨';
    } else if (temperature >= adjustedThresholds.high.min) {
      status = 'high';
      message = 'High fever detected - veterinary attention needed';
      recommendation = 'Monitor closely and prepare for veterinary consultation';
      color = '#FF6B6B'; // Light red
      icon = '⚠️';
    } else if (temperature >= adjustedThresholds.elevated.min) {
      status = 'elevated';
      message = 'Elevated temperature - monitor closely';
      recommendation = 'Increase monitoring frequency and check for other symptoms';
      color = '#FF9800'; // Orange
      icon = '🔍';
    } else {
      status = 'normal';
      message = 'Normal temperature reading';
      recommendation = 'Continue routine monitoring';
      color = '#4CAF50'; // Green
      icon = '✅';
    }

    return { status, message, recommendation, color, icon };
  }

  /**
   * Adjust thresholds based on sensor confidence
   */
  private static adjustThresholdsByConfidence(
    thresholds: TemperatureThresholds['core'],
    confidence: number
  ) {
    const adjustment = (1 - confidence) * 0.2; // ±0.2°C adjustment based on confidence
    
    return {
      normal: {
        min: Math.max(36.0, thresholds.normal.min - adjustment),
        max: Math.min(42.0, thresholds.normal.max + adjustment),
      },
      elevated: {
        min: Math.max(36.0, thresholds.elevated.min - adjustment),
        max: Math.min(42.0, thresholds.elevated.max + adjustment),
      },
      high: {
        min: Math.max(36.0, thresholds.high.min - adjustment),
        max: Math.min(42.0, thresholds.high.max + adjustment),
      },
      critical: {
        min: Math.max(36.0, thresholds.critical.min - adjustment),
        max: Math.min(42.0, thresholds.critical.max + adjustment),
      },
    };
  }

  /**
   * Estimate core temperature from surface reading
   */
  static estimateCoreTemperature(surfaceTemp: number, conditions?: {
    season?: 'summer' | 'winter' | 'spring' | 'fall';
    stressLevel?: 'low' | 'medium' | 'high';
    humidity?: number;
  }): number {
    let offset = CALIBRATION_OFFSETS.default;
    
    // Adjust offset based on conditions
    if (conditions?.season) {
      switch (conditions.season) {
        case 'summer':
          offset = CALIBRATION_OFFSETS.summer;
          break;
        case 'winter':
          offset = CALIBRATION_OFFSETS.winter;
          break;
      }
    }
    
    if (conditions?.stressLevel) {
      switch (conditions.stressLevel) {
        case 'high':
          offset = CALIBRATION_OFFSETS.stress;
          break;
      }
    }
    
    // Adjust for humidity (higher humidity = less offset)
    if (conditions?.humidity) {
      const humidityFactor = (100 - conditions.humidity) / 100;
      offset *= (0.8 + humidityFactor * 0.4);
    }
    
    return Math.round((surfaceTemp + offset) * 10) / 10;
  }

  /**
   * Generate temperature alert with clear messaging
   */
  static generateAlert(
    reading: TemperatureReading,
    historicalData?: TemperatureReading[]
  ): TemperatureAlert {
    const analysis = this.analyzeTemperature(reading.temperature, reading.type, reading.confidence);
    
    // Determine if this is a trend alert
    const isTrendAlert = this.isTrendAlert(reading, historicalData);
    
    return {
      id: `alert-${reading.id}-${Date.now()}`,
      penId: reading.penId,
      pigId: reading.pigId,
      temperature: reading.temperature,
      type: reading.type,
      severity: analysis.status,
      message: isTrendAlert ? `Trend alert: ${analysis.message}` : analysis.message,
      recommendation: analysis.recommendation,
      timestamp: reading.timestamp,
      resolved: false,
    };
  }

  /**
   * Check if temperature represents a concerning trend
   */
  private static isTrendAlert(
    currentReading: TemperatureReading,
    historicalData?: TemperatureReading[]
  ): boolean {
    if (!historicalData || historicalData.length < 3) return false;
    
    const recentReadings = historicalData
      .filter(r => r.penId === currentReading.penId && r.type === currentReading.type)
      .slice(-6); // Last 6 readings
    
    if (recentReadings.length < 3) return false;
    
    // Check for consistent upward trend
    const temps = recentReadings.map(r => r.temperature);
    const isUpwardTrend = temps.slice(-3).every((temp, i) => {
      return i === 0 || temp > temps.slice(-3)[i - 1];
    });
    
    // Check for rapid temperature increase
    const tempIncrease = temps[temps.length - 1] - temps[0];
    const rapidIncrease = tempIncrease > 1.0; // More than 1°C increase
    
    return isUpwardTrend || rapidIncrease;
  }

  /**
   * Format temperature for display with type indicator
   */
  static formatTemperature(
    temperature: number,
    type: TemperatureType = 'core',
    includeUnit: boolean = true
  ): string {
    const unit = includeUnit ? '°C' : '';
    const typeIndicator = type === 'surface' ? '(Skin)' : type === 'estimatedCore' ? '(Est. Core)' : '';
    
    return `${temperature}${unit} ${typeIndicator}`.trim();
  }

  /**
   * Get temperature icon based on status
   */
  static getStatusIcon(status: 'normal' | 'elevated' | 'high' | 'critical'): string {
    switch (status) {
      case 'normal':
        return '✓'; // Green checkmark
      case 'elevated':
        return '⚠'; // Orange warning
      case 'high':
        return '🔥'; // Fire
      case 'critical':
        return '🚨'; // Alert
      default:
        return '?';
    }
  }

  /**
   * Get temperature color based on status
   */
  static getStatusColor(status: 'normal' | 'elevated' | 'high' | 'critical'): string {
    switch (status) {
      case 'normal':
        return '#4CAF50'; // Green
      case 'elevated':
        return '#FF9800'; // Orange
      case 'high':
        return '#FF6B6B'; // Light red
      case 'critical':
        return '#FF0000'; // Red
      default:
        return '#757575'; // Gray
    }
  }

  /**
   * Get accessibility label for temperature reading
   */
  static getAccessibilityLabel(
    temperature: number,
    type: TemperatureType,
    status: 'normal' | 'elevated' | 'high' | 'critical'
  ): string {
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    const typeText = type === 'surface' ? 'surface' : type === 'estimatedCore' ? 'estimated core' : 'core';
    
    return `${temperature} degrees Celsius ${typeText} temperature, ${statusText} status`;
  }
}