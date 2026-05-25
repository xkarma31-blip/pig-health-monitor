/**
 * 📊 Mock Sensor Data
 * 
 * This file contains FAKE data used for development/testing.
 * FIREBASE BACKEND: Real data flows from Firebase RTDB /users/{uid}/sensors
 *
 * HOW TO ADD A NEW SENSOR:
 *   1. Add a new object to the `mockSensors` array below
 *   2. Follow the SensorReading type structure
 *   3. The dashboard will automatically show it!
 */

// === TypeScript Type Definitions ===
// These act like "blueprints" that tell your code what shape data should be.
// If you try to use a string where a number is expected, TypeScript warns you!

export type SensorStatus = 'normal' | 'warning' | 'danger';

export type SensorType = 'thermal' | 'acoustic';

export type SensorReading = {
  id: string;            // Unique identifier (e.g., "temp-01")
  type: SensorType;      // Which kind of sensor
  label: string;         // Human-readable name (e.g., "Pen A - Temperature")
  icon: string;          // Emoji icon for display
  value: number;         // Current reading
  unit: string;          // Unit of measurement (e.g., "°C", "dB")
  status: SensorStatus;  // Current health status
  lastUpdated: string;   // When this reading was taken
  minRange: number;      // Minimum safe value
  maxRange: number;      // Maximum safe value
};

// === The Mock Data ===
// Change these values to test how the UI looks with different readings!

export const mockSensors: SensorReading[] = [
  {
    id: 'temp-01',
    type: 'thermal',
    label: 'Body Temperature',
    icon: '🌡️',
    value: 39.5,
    unit: '°C',
    status: 'warning',
    lastUpdated: '2026-04-07 09:15',
    minRange: 37.5,
    maxRange: 40.0,
  },
  {
    id: 'temp-02',
    type: 'thermal',
    label: 'Ambient Temperature',
    icon: '🏠',
    value: 28.3,
    unit: '°C',
    status: 'normal',
    lastUpdated: '2026-04-07 09:15',
    minRange: 22.0,
    maxRange: 32.0,
  },
  {
    id: 'acoustic-01',
    type: 'acoustic',
    label: 'Respiratory Sound',
    icon: '🩺',
    value: 0,
    unit: '% cough',
    status: 'normal',
    lastUpdated: '2026-04-07 09:10',
    minRange: 0,
    maxRange: 100,
  },
  {
    id: 'acoustic-02',
    type: 'acoustic',
    label: 'Squeal Detection',
    icon: '🔊',
    value: 12,
    unit: 'dB above',
    status: 'normal',
    lastUpdated: '2026-04-07 09:10',
    minRange: 0,
    maxRange: 60,
  },
];

/**
 * Helper: Filter sensors by type
 * Usage: getSensorsByType('thermal') → returns only temperature sensors
 */
export function getSensorsByType(type: SensorType): SensorReading[] {
  return mockSensors.filter((s) => s.type === type);
}
