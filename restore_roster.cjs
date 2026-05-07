const admin = require('firebase-admin');
const serviceAccount = require('./firebase_config/firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com'
});

const db = admin.database();

const rosterData = {
  "peppa-001": {
    "name": "Peppa",
    "enrolledAt": new Date().toISOString(),
    "lastSeen": new Date().toISOString(),
    "status": "active",
    "temperature": 38.5,
    "tags": ["HEALTHY"],
    "healthStatus": "NORMAL"
  },
  "bacon-a1": {
    "name": "Bacon-A1",
    "enrolledAt": new Date().toISOString(),
    "lastSeen": new Date().toISOString(),
    "status": "active",
    "temperature": 39.1,
    "tags": ["ACTIVE"],
    "healthStatus": "NORMAL"
  },
  "pig-mock-1": {
    "name": "Mock Pig Alpha",
    "enrolledAt": new Date().toISOString(),
    "lastSeen": new Date().toISOString(),
    "status": "active",
    "temperature": 38.8,
    "tags": ["MOCK"],
    "healthStatus": "NORMAL"
  }
};

const uid = "xgC6Hkq2a6XrNG5emkf5cuyjpiu2";

async function restore() {
  console.log("Starting restoration ritual...");
  
  // Restore to user-specific path
  await db.ref(`users/${uid}/roster`).set(rosterData);
  console.log(`Restored roster to users/${uid}/roster`);
  
  // Also restore to global path just in case the app (or some version of it) looks there
  await db.ref('roster').set(rosterData);
  console.log(`Restored roster to /roster`);
  
  console.log("Restoration complete. Peppa has returned.");
  process.exit(0);
}

restore().catch(err => {
  console.error("Restoration failed:", err);
  process.exit(1);
});
