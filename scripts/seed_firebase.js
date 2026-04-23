/**
 * 🌱 Firebase RTDB Demo Seeder
 * Seeds realistic pig health monitor data for on-device demo testing.
 * Run: node seed_firebase.js
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, push } = require('firebase/database');

const firebaseConfig = {
  apiKey: 'AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc',
  authDomain: 'studio-1248778633-99f62.firebaseapp.com',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const hoursAgo = (h) => Date.now() - h * 60 * 60 * 1000;

async function seed() {
  console.log('🌱 Seeding Firebase RTDB demo data...\n');

  // ── 1. Live Telemetry ────────────────────────────────────────────────────
  await set(ref(db, 'telemetry/esp32-s3-01'), {
    temperature: 38.7,
    status: 'NORMAL',
    identifiedPig: 'Boss Hog',
    timestamp: Date.now(),
  });
  console.log('✅ Telemetry: Boss Hog @ 38.7°C NORMAL');

  // ── 2. Sensors ────────────────────────────────────────────────────────────
  const sensors = {
    'thermal-01': {
      type: 'thermal', label: 'Thermal — Pen A',
      icon: '🌡️', value: 38.7, unit: '°C',
      status: 'normal', lastUpdated: new Date().toISOString(),
      minRange: 35, maxRange: 42,
    },
    'acoustic-01': {
      type: 'acoustic', label: 'Acoustic — INMP441',
      icon: '🔊', value: 0, unit: 'events/hr',
      status: 'normal', lastUpdated: new Date().toISOString(),
      minRange: 0, maxRange: 20,
    },
    'flow-01': {
      type: 'flow', label: 'Water Flow — Pen A',
      icon: '💧', value: 2.4, unit: 'L/hr',
      status: 'normal', lastUpdated: new Date().toISOString(),
      minRange: 1.5, maxRange: 4.0,
    },
  };
  await set(ref(db, 'sensors'), sensors);
  console.log('✅ Sensors: 3 nodes written (thermal, acoustic, flow)');

  // ── 3. Pig Roster ──────────────────────────────────────────────────────────
  const roster = {
    'pig-001': { name: 'Boss Hog', deviceId: 'esp32-s3-01', enrolledAt: new Date(hoursAgo(48)).toISOString(), status: 'active' },
    'pig-002': { name: 'Wilbur', deviceId: 'esp32-s3-01', enrolledAt: new Date(hoursAgo(36)).toISOString(), status: 'active' },
    'pig-003': { name: 'Napoleon', deviceId: 'esp32-s3-01', enrolledAt: new Date(hoursAgo(24)).toISOString(), status: 'active' },
  };
  await set(ref(db, 'roster'), roster);
  console.log('✅ Roster: Boss Hog, Wilbur, Napoleon enrolled');

  // ── 4. Alerts (last 8h spread for trend chart) ────────────────────────────
  const alertsData = [
    { pig: 'Boss Hog', type: 'INFECTIOUS_COUGH', severity: 'HIGH', message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(0.3) },
    { pig: 'Boss Hog', type: 'NON_INFECTIOUS_COUGH', severity: 'LOW', message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(1.1) },
    { pig: 'Wilbur', type: 'INFECTIOUS_COUGH', severity: 'HIGH', message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(2.2) },
    { pig: 'Wilbur', type: 'INFECTIOUS_COUGH', severity: 'HIGH', message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(2.7) },
    { pig: 'Napoleon', type: 'NON_INFECTIOUS_COUGH', severity: 'LOW', message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(4.0) },
    { pig: 'Boss Hog', type: 'INFECTIOUS_COUGH', severity: 'HIGH', message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(5.5) },
    { pig: 'Napoleon', type: 'NON_INFECTIOUS_COUGH', severity: 'LOW', message: 'Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(6.0) },
    { pig: 'Boss Hog', type: 'INFECTIOUS_COUGH', severity: 'HIGH', message: 'Infectious cough signature detected (600Hz band dominant). Veterinary check advised.', deviceId: 'esp32-s3-01', timestamp: hoursAgo(7.2) },
  ];

  const alertsRef = ref(db, 'alerts');
  await set(alertsRef, {}); // clear first
  for (const alert of alertsData) {
    await push(alertsRef, alert);
  }
  console.log(`✅ Alerts: ${alertsData.length} records written (spread across 8h for trend chart)`);

  console.log('\n🔥 Firebase seeded! Open the app via QR code to see live data.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
