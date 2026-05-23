/**
 * 🚨 Mock Alert Data
 * 
 * Fake alert history for the Alerts tab.
 * Each alert has a severity level and a message.
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertEntry = {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  sensorId: string;       // Which sensor triggered this
};

export const mockAlerts: AlertEntry[] = [
  {
    id: 'alert-001',
    severity: 'warning',
    message: 'Body temperature elevated to 39.5°C — monitoring closely.',
    timestamp: '2026-04-07 09:15',
    sensorId: 'temp-01',
  },
  {
    id: 'alert-002',
    severity: 'info',
    message: 'Acoustic sensor calibrated successfully.',
    timestamp: '2026-04-07 08:45',
    sensorId: 'acoustic-01',
  },
  {
    id: 'alert-003',
    severity: 'critical',
    message: 'Temperature spike detected: 41.2°C at 03:22 (auto-resolved).',
    timestamp: '2026-04-06 03:22',
    sensorId: 'temp-01',
  },
  {
    id: 'alert-005',
    severity: 'warning',
    message: 'Possible cough pattern detected — 2 events in 30 minutes.',
    timestamp: '2026-04-05 16:30',
    sensorId: 'acoustic-01',
  },
];
