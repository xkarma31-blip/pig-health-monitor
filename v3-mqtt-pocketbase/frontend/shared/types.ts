/**
 * PigPulse v3 — Shared TypeScript Types
 * Used across frontend components
 */

// ── Sensor Types ─────────────────────────────────────────────

export interface SensorReading {
  id: string;
  type: 'thermal' | 'acoustic' | 'battery' | 'wifi';
  label: string;
  icon: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
  minRange: number;
  maxRange: number;
}

export interface ThermalFrame {
  width: 32;
  height: 24;
  data: number[];  // 768 values (32x24)
  maxTemp: number;
  minTemp: number;
  hotspotX: number;
  hotspotY: number;
}

// ── Alert Types ──────────────────────────────────────────────

export type AlertType = 'FEVER' | 'COUGH_CLUSTER' | 'LOW_BATTERY' | 'WEAK_WIFI';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  deviceId: string;
  type: AlertType;
  severity: AlertSeverity;
  pigId?: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

// ── Device Types ─────────────────────────────────────────────

export type DeviceType = 'esp32' | 'webcam' | 'luckfox';
export type DeviceStatus = 'online' | 'offline' | 'hibernate';

export interface Device {
  id: string;
  deviceId: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  batteryPct?: number;
  batteryV?: number;
  wifiRssi?: number;
  uptime?: number;
  lastSeen?: string;
  firmwareVersion?: string;
}

// ── Pig Types ────────────────────────────────────────────────

export type PigHealthStatus = 'NORMAL' | 'FEVER' | 'COUGH' | 'SICK';
export type PigStatus = 'active' | 'inactive' | 'removed';

export interface Pig {
  id: string;
  pigId: string;
  name: string;
  tags: string[];
  healthStatus: PigHealthStatus;
  thermalEmbedding?: string;
  enrolledAt?: string;
  lastSeen?: string;
  deviceId?: string;
  status: PigStatus;
}

// ── MQTT Types ───────────────────────────────────────────────

export interface MqttTelemetry {
  temperature: number;
  bodyTemp: number;
  pigId: string;
  targetX: number;
  targetY: number;
  thermalFrame: string;
  coughRate: number;
  coughCluster: boolean;
  healthTrend: 'STABLE' | 'ELEVATED' | 'CLUSTER';
  batteryPct: number;
  batteryV: number;
  powerState: 'NORMAL' | 'LOW' | 'CRITICAL' | 'HIBERNATE';
  wifiRssi: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  timestamp: number;
}

export interface MqttAlert {
  type: AlertType;
  severity: AlertSeverity;
  pigId: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

export interface MqttStatus {
  online: boolean;
  batteryPct: number;
  batteryV: number;
  wifiRssi: number;
  uptime: number;
  freeHeap: number;
  timestamp: number;
}

export interface MqttCommand {
  command: string;
  pigName?: string;
  executed: boolean;
  timestamp: number;
}

// ── API Types ────────────────────────────────────────────────

export interface ApiResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface AuthToken {
  token: string;
  user: {
    id: string;
    email: string;
  };
}
