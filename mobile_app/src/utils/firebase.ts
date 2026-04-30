/**
 * 🔥 Firebase Configuration — Sovereign Aqua Protocol
 *
 * Central Firebase client for the Pig Health Monitor.
 * Connects to Firebase Realtime Database for live sensor telemetry.
 *
 * Project: studio-1248778633-99f62
 * Backend: Firebase RTDB (replaces legacy Supabase)
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, push, set } from 'firebase/database';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SensorReading } from '../data/mockSensors';

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
let app;
let auth;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
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

// NOTE: Static refs like 'sensorsRef' are deprecated in favor of dynamic path generation 
// to support multi-tenancy. We keep them here but with a warning or update them.
export const sensorsRef = () => ref(db, `${getUserPath()}/sensors`);
export const alertsRef = () => ref(db, `${getUserPath()}/alerts`);
export const telemetryRef = () => ref(db, `${getUserPath()}/telemetry`);
export const commandsRef = () => ref(db, `${getUserPath()}/commands`);
export const rosterRef = () => ref(db, `${getUserPath()}/roster`);

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
  const q = query(sensorsRef(), orderByChild('lastUpdated'), limitToLast(20));
  return onValue(q, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const sensors: SensorReading[] = Object.entries(data).map(([id, val]: [string, any]) => ({
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
export function subscribeAlerts(callback: (alerts: any[]) => void) {
  const q = query(alertsRef(), orderByChild('timestamp'), limitToLast(50));
  return onValue(q, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const alerts = Object.entries(data).map(([id, val]: [string, any]) => ({
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
  const commandPath = `${getUserPath()}/commands/${deviceId}`;
  const commandRef = ref(db, commandPath);
  return set(commandRef, {
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
  const newPigRef = push(rosterRef());
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
export async function updatePigHealth(pigId: string, tags: string[], healthStatus: string = 'NORMAL') {
  const pigRef = ref(db, `${getUserPath()}/roster/${pigId}`);
  // Use update to avoid overwriting other fields like name/deviceId
  const { update } = await import('firebase/database');
  return update(pigRef, {
    tags,
    healthStatus,
    lastSeen: new Date().toISOString(),
  });
}

/**
 * Subscribe to the pig roster
 */
export function subscribeRoster(callback: (roster: any[]) => void) {
  return onValue(rosterRef(), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const roster = Object.entries(data).map(([id, val]: [string, any]) => ({
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
export function subscribeTelemetry(deviceId: string, callback: (telemetry: any) => void) {
  const deviceTeleRef = ref(db, `${getUserPath()}/telemetry/${deviceId}`);
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
