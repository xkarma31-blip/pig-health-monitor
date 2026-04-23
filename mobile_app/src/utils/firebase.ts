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

// Initialize Firebase securely (avoiding double-init on Fast Refresh)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);

// === Database References ===

/** Reference to /sensors node in RTDB */
export const sensorsRef = ref(db, 'sensors');

/** Reference to /alerts node in RTDB */
export const alertsRef = ref(db, 'alerts');

/** Reference to /telemetry node (raw ESP32 data) */
export const telemetryRef = ref(db, 'telemetry');
export const commandsRef = ref(db, 'commands');
export const rosterRef = ref(db, 'roster');

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
  const q = query(sensorsRef, orderByChild('lastUpdated'), limitToLast(20));
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
  const q = query(alertsRef, orderByChild('timestamp'), limitToLast(50));
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
  const commandPath = `commands/${deviceId}`;
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
export async function enrollPig(name: string, deviceId: string = 'esp32-s3-01') {
  // 1. Tell ESP32 to capture a reference embedding with a specific name
  await sendCommand('ENROLL_START', name, deviceId);
  
  // 2. Create the record in the roster
  const newPigRef = push(rosterRef);
  return set(newPigRef, {
    name,
    deviceId,
    enrolledAt: new Date().toISOString(),
    status: 'active'
  });
}

/**
 * Subscribe to the pig roster
 */
export function subscribeRoster(callback: (roster: any[]) => void) {
  return onValue(rosterRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const roster = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      ...val,
    }));
    callback(roster);
  });
}

/**
 * Subscribe to telemetry for a specific device
 */
export function subscribeTelemetry(deviceId: string, callback: (telemetry: any) => void) {
  const deviceTeleRef = ref(db, `telemetry/${deviceId}`);
  return onValue(deviceTeleRef, (snapshot) => {
    callback(snapshot.val());
  });
}

// Export core instances for direct use
export { app, db };
