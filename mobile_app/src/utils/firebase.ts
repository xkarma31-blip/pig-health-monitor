/**
 * 🔥 Firebase Configuration — Sovereign Aqua Protocol
 *
 * Central Firebase client for the Pig Health Monitor.
 * Connects to Firebase Realtime Database for live sensor telemetry.
 *
 * Project: studio-1248778633-99f62
 * Backend: Firebase RTDB (replaces legacy Supabase)
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, push, set, update } from 'firebase/database';
import { getAuth, initializeAuth, Auth } from 'firebase/auth';
// @ts-expect-error - type definitions are missing in this version but runtime export exists
import { getReactNativePersistence } from 'firebase/auth';
import { Platform } from 'react-native';
import type { SensorReading } from '../data/mockSensors';

// Conditionally import AsyncStorage only on native to avoid web bundle issues
let AsyncStorage: Record<string, unknown> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

// Firebase project configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: 'studio-1248778633-99f62.firebaseapp.com',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
  storageBucket: 'studio-1248778633-99f62.firebasestorage.app',
  messagingSenderId: '',
  appId: '',
};

// Initialize Firebase securely with persistence (avoiding double-init on Fast Refresh)
// Web: getAuth() auto-persists to localStorage
// Native: initializeAuth() + AsyncStorage for disk persistence
let app: FirebaseApp;
let auth: Auth;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  if (Platform.OS === 'web') {
    // On web, getAuth() uses browserLocalPersistence by default
    auth = getAuth(app);
  } else {
    // On native, explicitly set AsyncStorage for login persistence
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} else {
  app = getApp();
  auth = getAuth(app);
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
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const sensors: SensorReading[] = Object.entries(data).map(([id, val]: [string, Record<string, unknown>]) => ({
      id,
      type: val.type || 'thermal',
      label: val.label || id,
      icon: val.icon || '📡',
      value: val.value ?? 0,
      unit: val.unit || '',
      status: val.status || 'normal',
      lastUpdated: val.lastUpdated || new Date().toISOString(),
      minRange: val.minRange ?? 0,
      maxRange: val.maxRange ?? 100,
    }));
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
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const alerts = Object.entries(data).map(([id, val]: [string, Record<string, unknown>]) => ({
      id,
      ...val,
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
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const roster = Object.entries(data).map(([id, val]: [string, Record<string, unknown>]) => ({
      id,
      ...val,
      tags: val.tags || [],
      healthStatus: val.healthStatus || 'NORMAL'
    }));
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
