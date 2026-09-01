/**
 * PigPulse v3 — PocketBase Client
 * 
 * PocketBase API client with Realtime SSE support.
 * Replaces Firebase as the primary data source.
 */

import { Platform } from 'react-native';

// PocketBase configuration
const POCKETBASE_URL = process.env.EXPO_PUBLIC_POCKETBASE_URL || 'http://192.168.1.100:8090';

// Types
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

export interface AlertEntry {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  pigId?: string;
  value?: number;
  threshold?: number;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface TelemetryData {
  deviceId: string;
  timestamp: number;
  temperature?: number;
  bodyTemp?: number;
  pigId?: string;
  targetX?: number;
  targetY?: number;
  thermalFrame?: string;
  coughRate?: number;
  coughCluster?: boolean;
  healthTrend?: string;
  batteryPct?: number;
  batteryV?: number;
  powerState?: string;
  wifiRssi?: number;
  status?: string;
}

// ── Auth ──────────────────────────────────────────────────────

let authToken: string | null = null;

export async function pbLogin(email: string, password: string): Promise<boolean> {
  try {
    const resp = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
    
    if (resp.ok) {
      const data = await resp.json();
      authToken = data.token;
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[PocketBase] Auth error:', error);
    return false;
  }
}

export function pbLogout() {
  authToken = null;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

// ── Collections ───────────────────────────────────────────────

/**
 * Subscribe to telemetry updates via Realtime SSE
 * Returns unsubscribe function
 */
export function subscribeTelemetry(
  callback: (data: TelemetryData[]) => void
): () => void {
  const eventSource = new EventSource(
    `${POCKETBASE_URL}/api/realtime?filter=collection='telemetry'`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.action === 'create' || data.action === 'update') {
        callback([data.record as TelemetryData]);
      }
    } catch (e) {
      console.warn('[PocketBase] Realtime parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.warn('[PocketBase] Realtime connection error');
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Subscribe to alert updates via Realtime SSE
 * Returns unsubscribe function
 */
export function subscribeAlerts(
  callback: (data: AlertEntry[]) => void
): () => void {
  const eventSource = new EventSource(
    `${POCKETBASE_URL}/api/realtime?filter=collection='alerts'`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.action === 'create') {
        callback([data.record as AlertEntry]);
      }
    } catch (e) {
      console.warn('[PocketBase] Realtime parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.warn('[PocketBase] Realtime connection error');
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Fetch latest telemetry (polling fallback)
 */
export async function fetchLatestTelemetry(): Promise<TelemetryData[]> {
  try {
    const resp = await fetch(
      `${POCKETBASE_URL}/api/collections/telemetry/records?sort=-timestamp&limit=20`,
      { headers: getHeaders() }
    );
    
    if (resp.ok) {
      const data = await resp.json();
      return data.items || [];
    }
    return [];
  } catch (error) {
    console.warn('[PocketBase] Fetch telemetry error:', error);
    return [];
  }
}

/**
 * Fetch latest alerts (polling fallback)
 */
export async function fetchLatestAlerts(): Promise<AlertEntry[]> {
  try {
    const resp = await fetch(
      `${POCKETBASE_URL}/api/collections/alerts/records?sort=-timestamp&limit=50`,
      { headers: getHeaders() }
    );
    
    if (resp.ok) {
      const data = await resp.json();
      return data.items || [];
    }
    return [];
  } catch (error) {
    console.warn('[PocketBase] Fetch alerts error:', error);
    return [];
  }
}

/**
 * Check if PocketBase is reachable
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const resp = await fetch(`${POCKETBASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export { POCKETBASE_URL };
