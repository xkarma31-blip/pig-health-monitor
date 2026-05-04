import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc",
  authDomain: "studio-1248778633-99f62.firebaseapp.com",
  databaseURL: "https://studio-1248778633-99f62-default-rtdb.firebaseio.com",
  projectId: "studio-1248778633-99f62",
  storageBucket: "studio-1248778633-99f62.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SENSORS = [
  { id: 'temp-01', name: 'Body Temperature', type: 'thermal', unit: '°C', icon: '🌡️' },
  { id: 'acoustic-01', name: 'Respiratory Sound', type: 'acoustic', unit: '% cough', icon: '🔊' },
  { id: 'temp-02', name: 'Ambient Temperature', type: 'thermal', unit: '°C', icon: '🌡️' }
];


function getRandomValue(sensor) {
  if (sensor.type === 'thermal') {
    return (38 + Math.random() * 2).toFixed(1);
  } else {
    return Math.floor(Math.random() * 15);
  }
}

async function feed() {
  console.log("📡 Feeding mock data to Firebase...");
  
  const updates = {};
  for (const sensor of SENSORS) {
    const value = parseFloat(getRandomValue(sensor));
    let status = 'normal';
    
    if (sensor.id === 'temp-01' && value > 39.2) status = 'warning';
    if (sensor.id === 'temp-01' && value > 40.0) status = 'danger';
    if (sensor.id === 'acoustic-01' && value > 10) status = 'warning';

    updates[sensor.id] = {
      ...sensor,
      value,
      status,
      updated: new Date().toISOString()
    };

    // If status is danger, push an alert
    if (status === 'danger' || (status === 'warning' && Math.random() > 0.8)) {
       const severity = status === 'danger' ? 'critical' : 'warning';
       await push(ref(db, 'alerts'), {
         title: `${sensor.name} Issue`,
         message: `${sensor.name} is showing ${status} levels: ${value}${sensor.unit}`,
         severity,
         timestamp: new Date().toISOString(),
         read: false
       });
    }

  }

  await set(ref(db, 'sensors'), updates);
  console.log("✅ Update successful");
}

// Run every 5 seconds
setInterval(feed, 5000);
feed();

