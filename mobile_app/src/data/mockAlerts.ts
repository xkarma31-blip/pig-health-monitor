/**
 * 🚨 Mock Alert Data
 *
 * Realistic alert history for the Alerts tab.
 * Timestamps are Unix epoch ms — required for the CoughTrendChart bucketing logic.
 * Types match the ESP32 firmware alert schema (INFECTIOUS_COUGH, NON_INFECTIOUS_COUGH, etc.)
 */

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'HIGH' | 'LOW' | 'WARNING';

export type AlertEntry = {
  id: string;
  severity: AlertSeverity;
  type?: string;
  message: string;
  timestamp: number;        // Unix epoch ms
  sensorId?: string;
  pig?: string;
  deviceId?: string;
};

// Helper: build a timestamp N hours ago from now
const hoursAgo = (h: number) => Date.now() - h * 60 * 60 * 1000;

export const mockAlerts: AlertEntry[] = [
  {
    id: 'alert-001',
    severity: 'HIGH',
    type: 'INFECTIOUS_COUGH',
    pig: 'Boss Hog',
    message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.',
    timestamp: hoursAgo(0.5),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-002',
    severity: 'LOW',
    type: 'NON_INFECTIOUS_COUGH',
    pig: 'Boss Hog',
    message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.',
    timestamp: hoursAgo(1.2),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-003',
    severity: 'HIGH',
    type: 'INFECTIOUS_COUGH',
    pig: 'Wilbur',
    message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.',
    timestamp: hoursAgo(2.0),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-004',
    severity: 'WARNING',
    type: 'STORAGE_FULL',
    message: 'Pig roster limit reached (50). Enrollment failed. Remove a pig first.',
    timestamp: hoursAgo(3.5),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-005',
    severity: 'HIGH',
    type: 'INFECTIOUS_COUGH',
    pig: 'Wilbur',
    message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.',
    timestamp: hoursAgo(4.1),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-006',
    severity: 'LOW',
    type: 'NON_INFECTIOUS_COUGH',
    pig: 'Napoleon',
    message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.',
    timestamp: hoursAgo(5.0),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-007',
    severity: 'HIGH',
    type: 'INFECTIOUS_COUGH',
    pig: 'Boss Hog',
    message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.',
    timestamp: hoursAgo(6.3),
    deviceId: 'esp32-s3-01',
  },
  {
    id: 'alert-008',
    severity: 'LOW',
    type: 'NON_INFECTIOUS_COUGH',
    pig: 'Napoleon',
    message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.',
    timestamp: hoursAgo(7.5),
    deviceId: 'esp32-s3-01',
  },
];
