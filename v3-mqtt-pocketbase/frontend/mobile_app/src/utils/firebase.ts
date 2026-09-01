import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, push, set, update } from 'firebase/database';
import { getAuth, initializeAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SensorReading } from '../data/mockSensors';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDGPyc_Yz5eGoiszQpj3YNB46G01xH_QDs',
  authDomain: 'studio-1248778633-99f62.firebaseapp.com',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
  storageBucket: 'studio-1248778633-99f62.firebasestorage.app',
  messagingSenderId: '362832626962',
  appId: '1:362832626962:web:c56868d6c57516062e1fcb',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth initialization is platform-aware:
// - Web: getAuth() uses Firebase's built-in browser localStorage persistence.
// - Native: initializeAuth() with AsyncStorage persistence so sessions survive
//   app restarts (getAuth() on RN would warn and fall back to memory-only).
// initializeAuth is wrapped in try/catch so a Fast Refresh re-evaluation of this
// module (which throws "auth/already-initialized") falls back to getAuth(), which
// returns the existing AsyncStorage-backed instance.
let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app);
  }
}


const db = getDatabase(app);

// === Path Helpers ===

/**
 * Returns the base path for the current authenticated user.
 * Sandboxes all data under /users/$uid/
 */
export function getUserPath(): string | null {
  const user = auth.currentUser;
  return user ? `users/${user.uid}` : null;
}

// Dynamic refs — return null when user is not authenticated to prevent
// Firebase errors on invalid paths like 'null/sensors'.
export const sensorsRef = () => {
  const base = getUserPath();
  return base ? ref(db, `${base}/sensors`) : null;
};
export const alertsRef = () => {
  const base = getUserPath();
  return base ? ref(db, `${base}/alerts`) : null;
};
export const telemetryRef = () => {
  const base = getUserPath();
  return base ? ref(db, `${base}/telemetry`) : null;
};
export const commandsRef = () => {
  const base = getUserPath();
  return base ? ref(db, `${base}/commands`) : null;
};
export const rosterRef = () => {
  const base = getUserPath();
  return base ? ref(db, `${base}/roster`) : null;
};

// === Listener Helpers ===

/**
 * Subscribe to real-time sensor updates.
 * Returns an unsubscribe function.
 *
 * Usage:
 *   const unsub = subscribeSensors((sensors) => setSensors(sensors));
 *   // Later: unsub();
 */
export function subscribeSensors(callback: (sensors: SensorReading[]) => void) {
  const sRef = sensorsRef();
  if (!sRef) {
    callback([]);
    return () => {}; // noop unsubscribe
  }
  const q = query(sRef, orderByChild('lastUpdated'), limitToLast(20));
  return onValue(q, (snapshot) => {
    const data = snapshot.val() as Record<string, unknown> | null;
    if (!data) {
      callback([]);
      return;
    }
    const sensors: SensorReading[] = Object.entries(data).map(([id, val]) => {
      const v = val as Record<string, unknown>;
      return {
        id,
        type: v.type || 'thermal',
        label: v.label || id,
        icon: v.icon || '📡',
        value: v.value ?? 0,
        unit: v.unit || '',
        status: v.status || 'normal',
        lastUpdated: v.lastUpdated || new Date().toISOString(),
        minRange: v.minRange ?? 0,
        maxRange: v.maxRange ?? 100,
      } as SensorReading;
    });
    callback(sensors);
  });
}

/**
 * Subscribe to real-time alert updates.
 * Returns an unsubscribe function.
 */
export function subscribeAlerts(callback: (alerts: Record<string, unknown>[]) => void) {
  const aRef = alertsRef();
  if (!aRef) {
    callback([]);
    return () => {}; // noop unsubscribe
  }
  const q = query(aRef, orderByChild('timestamp'), limitToLast(50));
  return onValue(q, (snapshot) => {
    const data = snapshot.val() as Record<string, unknown> | null;
    if (!data) {
      callback([]);
      return;
    }
    const alerts = Object.entries(data).map(([id, val]) => ({
      id,
      ...(val as Record<string, unknown>),
    }));
    callback(alerts);
  });
}

/**
 * Send a command to the ESP32 (e.g., trigger enrollment or calibration)
 */
export async function sendCommand(command: string, pigName: string = '', deviceId: string = 'esp32-s3-01') {
  const base = getUserPath();
  if (!base) throw new Error('Not authenticated');
  const commandPath = `${base}/commands/${deviceId}`;
  const cmdRef = ref(db, commandPath);
  return set(cmdRef, {
    command,
    pigName, // For enrollment naming
    executed: false,
    timestamp: Date.now(),
  });
}

/**
 * Enroll a new pig into the system
 */
export async function enrollPig(name: string, isTemporary: boolean = false, deviceId: string = 'esp32-s3-01') {
  // 1. Tell ESP32 to capture a reference embedding
  await sendCommand('ENROLL_START', name, deviceId);
  
  // 2. Create the record in the roster
  const rRef = rosterRef();
  if (!rRef) throw new Error('Not authenticated');
  const newPigRef = push(rRef);
  return set(newPigRef, {
    name,
    isTemporary,
    deviceId,
    tags: isTemporary ? ['UNIDENTIFIED'] : [],
    healthStatus: 'NORMAL',
    lastSeen: new Date().toISOString(),
    enrolledAt: new Date().toISOString(),
    status: 'active'
  });
}

/**
 * Update a pig's health tags (e.g., Fever, Cough)
 */
export function updatePigHealth(pigId: string, tags: string[], healthStatus: string = 'NORMAL') {
  const base = getUserPath();
  if (!base) throw new Error('Not authenticated');
  const pigRef = ref(db, `${base}/roster/${pigId}`);
  return update(pigRef, {
    tags,
    healthStatus,
    lastSeen: new Date().toISOString(),
  });
}

/**
 * Subscribe to the pig roster
 */
export function subscribeRoster(callback: (roster: Record<string, unknown>[]) => void) {
  const rRef = rosterRef();
  if (!rRef) {
    callback([]);
    return () => {}; // noop unsubscribe
  }
  return onValue(rRef, (snapshot) => {
    const data = snapshot.val() as Record<string, unknown> | null;
    if (!data) {
      callback([]);
      return;
    }
    const roster = Object.entries(data).map(([id, val]) => {
      const v = val as Record<string, unknown>;
      return {
        id,
        ...v,
        tags: v.tags || [],
        healthStatus: v.healthStatus || 'NORMAL',
      };
    });
    callback(roster);
  });
}

/**
 * Subscribe to telemetry for a specific device
 */
export function subscribeTelemetry(deviceId: string, callback: (telemetry: Record<string, unknown> | null) => void) {
  const base = getUserPath();
  if (!base) {
    callback(null);
    return () => {}; // noop unsubscribe
  }
  const deviceTeleRef = ref(db, `${base}/telemetry/${deviceId}`);
  return onValue(deviceTeleRef, (snapshot) => {
    callback(snapshot.val());
  });
}

/**
 * Fetch telemetry directly from the ESP32 (Mountain Mode)
 * Used when internet is unavailable in remote areas.
 */
export async function fetchLocalTelemetry(ip: string = '192.168.4.1') {
  try {
    const response = await fetch(`http://${ip}/api/telemetry`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    return await response.json();
  } catch (error) {
    console.warn('📡 Local Pulse Failed:', error);
    return null;
  }
}

// Export core instances for direct use
export { app, db, auth };
