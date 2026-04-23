import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const hoursAgo = (h) => Date.now() - h * 60 * 60 * 1000;

console.log('🌱 Seeding Firebase RTDB...\n');

// 1. Telemetry
await set(ref(db, 'telemetry/esp32-s3-01'), {
  temperature: 38.7, status: 'NORMAL',
  identifiedPig: 'Boss Hog', timestamp: Date.now(),
});
console.log('✅ Telemetry: Boss Hog @ 38.7°C NORMAL');

// 2. Sensors
await set(ref(db, 'sensors'), {
  'thermal-01': { type:'thermal', label:'Thermal — Pen A', icon:'🌡️', value:38.7, unit:'°C', status:'normal', lastUpdated: new Date().toISOString(), minRange:35, maxRange:42 },
  'acoustic-01': { type:'acoustic', label:'Acoustic — INMP441', icon:'🔊', value:2, unit:'events/hr', status:'warning', lastUpdated: new Date().toISOString(), minRange:0, maxRange:20 },
  'flow-01': { type:'flow', label:'Water Flow — Pen A', icon:'💧', value:2.4, unit:'L/hr', status:'normal', lastUpdated: new Date().toISOString(), minRange:1.5, maxRange:4.0 },
});
console.log('✅ Sensors: thermal, acoustic, flow');

// 3. Roster
await set(ref(db, 'roster'), {
  'pig-001': { name:'Boss Hog', deviceId:'esp32-s3-01', enrolledAt: new Date(hoursAgo(48)).toISOString(), status:'active' },
  'pig-002': { name:'Wilbur', deviceId:'esp32-s3-01', enrolledAt: new Date(hoursAgo(36)).toISOString(), status:'active' },
  'pig-003': { name:'Napoleon', deviceId:'esp32-s3-01', enrolledAt: new Date(hoursAgo(24)).toISOString(), status:'active' },
});
console.log('✅ Roster: Boss Hog, Wilbur, Napoleon');

// 4. Alerts spread across last 8 hours
const alertsRef = ref(db, 'alerts');
await set(alertsRef, {}); // clear existing
const alerts = [
  { pig:'Boss Hog', type:'INFECTIOUS_COUGH', severity:'HIGH', message:'Infectious cough signature detected (600Hz dominant). Veterinary check advised.', deviceId:'esp32-s3-01', timestamp:hoursAgo(0.3) },
  { pig:'Boss Hog', type:'NON_INFECTIOUS_COUGH', severity:'LOW', message:'Non-infectious cough detected (1600Hz dominant). Monitor for pattern changes.', deviceId:'esp32-s3-01', timestamp:hoursAgo(1.1) },
  { pig:'Wilbur', type:'INFECTIOUS_COUGH', severity:'HIGH', message:'Infectious cough signature detected (600Hz dominant). Veterinary check advised.', deviceId:'esp32-s3-01', timestamp:hoursAgo(2.2) },
  { pig:'Wilbur', type:'INFECTIOUS_COUGH', severity:'HIGH', message:'Infectious cough signature detected (600Hz dominant). Veterinary check advised.', deviceId:'esp32-s3-01', timestamp:hoursAgo(2.8) },
  { pig:'Napoleon', type:'NON_INFECTIOUS_COUGH', severity:'LOW', message:'Non-infectious cough detected (1600Hz dominant). Monitor for pattern changes.', deviceId:'esp32-s3-01', timestamp:hoursAgo(4.0) },
  { pig:'Boss Hog', type:'INFECTIOUS_COUGH', severity:'HIGH', message:'Infectious cough signature detected (600Hz dominant). Veterinary check advised.', deviceId:'esp32-s3-01', timestamp:hoursAgo(5.5) },
  { pig:'Napoleon', type:'NON_INFECTIOUS_COUGH', severity:'LOW', message:'Non-infectious cough detected (1600Hz dominant). Monitor for pattern changes.', deviceId:'esp32-s3-01', timestamp:hoursAgo(6.0) },
  { pig:'Boss Hog', type:'INFECTIOUS_COUGH', severity:'HIGH', message:'Infectious cough signature detected (600Hz dominant). Veterinary check advised.', deviceId:'esp32-s3-01', timestamp:hoursAgo(7.2) },
];
for (const a of alerts) await push(alertsRef, a);
console.log(`✅ Alerts: ${alerts.length} records seeded across 8h`);

console.log('\n🔥 Done! Open Expo Go and shake/reload to see live data.');
process.exit(0);
