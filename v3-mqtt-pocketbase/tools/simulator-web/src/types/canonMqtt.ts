/**
 * PigPulse v3 — Canonical MQTT & Hardware Constants
 * Mirrors firmware/include/PigMqttTopics.h and firmware/src/main.cpp exactly.
 */

export const TOPIC_PREFIX = 'pig';
export const TOPIC_TELEMETRY = 'telemetry';
export const TOPIC_ALERTS = 'alerts';
export const TOPIC_COMMANDS = 'commands';
export const TOPIC_STATUS = 'status';
export const TOPIC_RESPONSE = 'response';

// Topic Helpers
export function buildTopic(deviceId: string, subtopic: string): string {
  return `${TOPIC_PREFIX}/${deviceId}/${subtopic}`;
}

export function telemetryTopic(deviceId: string): string {
  return buildTopic(deviceId, TOPIC_TELEMETRY);
}

export function alertsTopic(deviceId: string): string {
  return buildTopic(deviceId, TOPIC_ALERTS);
}

export function commandsTopic(deviceId: string): string {
  return buildTopic(deviceId, TOPIC_COMMANDS);
}

export function statusTopic(deviceId: string): string {
  return buildTopic(deviceId, TOPIC_STATUS);
}

export function responseTopic(deviceId: string): string {
  return buildTopic(deviceId, TOPIC_RESPONSE);
}

// Commands
export const CMD_ENROLL_START = 'ENROLL_START';
export const CMD_ENROLL_STOP = 'ENROLL_STOP';
export const CMD_OTA = 'OTA';
export const CMD_CONFIG = 'CONFIG';
export const CMD_PING = 'PING';

// Alert Types
export const ALERT_FEVER = 'FEVER';
export const ALERT_COUGH_CLUSTER = 'COUGH_CLUSTER';
export const ALERT_LOW_BATTERY = 'LOW_BATTERY';
export const ALERT_WEAK_WIFI = 'WEAK_WIFI';

// Alert Severity
export const SEVERITY_INFO = 'INFO';
export const SEVERITY_WARNING = 'WARNING';
export const SEVERITY_CRITICAL = 'CRITICAL';

// Health Trends
export const TREND_STABLE = 'STABLE';
export const TREND_ELEVATED = 'ELEVATED';
export const TREND_CLUSTER = 'CLUSTER';

// Power States
export const POWER_NORMAL = 'NORMAL';
export const POWER_LOW = 'LOW';
export const POWER_CRITICAL = 'CRITICAL';
export const POWER_HIBERNATE = 'HIBERNATE';

// Thresholds (Firmware & Decisions Grounding)
export const FEVER_WARNING = 39.5;
export const FEVER_CRITICAL = 40.0;
export const BATTERY_LOW = 20.0;
export const BATTERY_CRITICAL = 10.0;
export const WIFI_WEAK_RSSI = -85;

// Canonical 15-Field Wire Telemetry Payload (main.cpp:304-320)
export interface CanonTelemetryPayload {
  temperature: number;
  bodyTemp: number;
  pigId: string;
  targetX: number;
  targetY: number;
  thermalFrame: string; // Base64 of 768 bytes (32x24)
  coughRate: number;
  coughCluster: boolean;
  healthTrend: typeof TREND_STABLE | typeof TREND_ELEVATED | typeof TREND_CLUSTER;
  batteryPct: number;
  batteryV: number;
  powerState: typeof POWER_NORMAL | typeof POWER_LOW | typeof POWER_CRITICAL | typeof POWER_HIBERNATE;
  wifiRssi: number;
  status: typeof SEVERITY_INFO | typeof SEVERITY_WARNING | typeof SEVERITY_CRITICAL | 'NORMAL';
  timestamp: number;
}

// Canonical 7-Field Wire Alert Payload (main.cpp:335-347)
export interface CanonAlertPayload {
  type: typeof ALERT_FEVER | typeof ALERT_COUGH_CLUSTER | typeof ALERT_LOW_BATTERY | typeof ALERT_WEAK_WIFI;
  severity: typeof SEVERITY_INFO | typeof SEVERITY_WARNING | typeof SEVERITY_CRITICAL;
  pigId: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

// Canonical Device Status Payload (main.cpp:421 & LWT)
export interface CanonStatusPayload {
  online: boolean;
  batteryPct?: number;
  batteryV?: number;
  wifiRssi?: number;
  uptime?: number;
  freeHeap?: number;
  timestamp: number;
}
