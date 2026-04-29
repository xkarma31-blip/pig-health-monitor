import { db } from './firebase_rest_client.mjs';

console.log('🔥 Starting Multi-Pig Stress Test Simulation...');

const WIDTH = 32;
const HEIGHT = 24;
let tick = 0;

// Track active pigs
const pigs = [
  { id: 'boss_hog', name: 'Boss Hog', temp: 38.5, radius: 4, offsetX: 0, offsetY: 0, status: 'NORMAL', tags: [] },
  { id: 'peppa', name: 'Peppa', temp: 38.2, radius: 3, offsetX: 10, offsetY: -5, status: 'NORMAL', tags: [] },
  // Third pig arrives at tick 20
];

const USER_UID = process.env.TARGET_USER_UID || 'test_farmer_01';
const BASE_PATH = `users/${USER_UID}`;

async function updatePigProfile(pig) {
  await db.ref(`${BASE_PATH}/roster/${pig.id}`).set({
    name: pig.name,
    temperature: pig.temp,
    status: pig.status,
    tags: pig.tags,
    lastSeen: Date.now()
  });
}

async function removePigProfile(pigId) {
  // Use null to delete in Firebase REST
  await db.ref(`${BASE_PATH}/roster/${pigId}`).set(null);
}

async function sendFrame() {
  const frame = new Uint8Array(WIDTH * HEIGHT);
  const timestamp = Date.now();
  
  // Fill background noise
  for (let i = 0; i < frame.length; i++) {
    frame[i] = 20 + Math.random() * 3;
  }

  // ── SCENARIO EVENTS (SCIENTIFIC HEALTH MONITORING) ──
  
  // 1. Unidentified Pig Arrives (Zero-Shot Enrollment via Siamese Network)
  if (tick === 20) {
    console.log('👀 NEW UNIDENTIFIED PIG DETECTED!');
    const newPig = { 
        id: `auto_${Date.now()}`, 
        name: `Pig_Auto_${Math.floor(Math.random()*1000)}`, 
        temp: 38.8, 
        radius: 3, 
        offsetX: -10, 
        offsetY: 8, 
        status: 'NORMAL',
        tags: ['NEW_ENROLLMENT']
    };
    pigs.push(newPig);
    await updatePigProfile(newPig);
    
    // Trigger Auto-Enrollment Alert
    const newAlertRef = db.ref(`${BASE_PATH}/alerts`).push();
    await newAlertRef.set({
      pig: newPig.name,
      type: 'ZERO_SHOT_ENROLLMENT',
      message: `New thermal signature identified via metric embedding. Auto-enrolled as ${newPig.name}.`,
      severity: 'LOW',
      timestamp: timestamp,
      status: 'active'
    });
  }

  // 2. Fever & Respiratory Distress Outbreak on Peppa
  if (tick === 40) {
    console.log('🔥 Peppa has developed a fever and cough (Respiratory Distress)!');
    pigs[1].temp = 40.5; // High fever (Normal is ~38.5-39.5)
    pigs[1].status = 'FEVER';
    if (!pigs[1].tags.includes('FEVER')) pigs[1].tags.push('FEVER');
    if (!pigs[1].tags.includes('RESPIRATORY_DISTRESS')) pigs[1].tags.push('RESPIRATORY_DISTRESS');
    await updatePigProfile(pigs[1]);

    const newAlertRef = db.ref(`${BASE_PATH}/alerts`).push();
    await newAlertRef.set({
      pig: pigs[1].name,
      type: 'FEVER_AND_COUGH_DETECTED',
      message: `🚨 ALERT: ${pigs[1].name} core temperature 40.5°C and acoustic cough signature detected!`,
      severity: 'CRITICAL',
      timestamp: timestamp,
      status: 'active'
    });
  }

  // 3. Lethargy / Inactivity Detection (Boss Hog stops moving)
  let bossHogLethargic = false;
  if (tick >= 60 && tick < 80) {
    if (tick === 60) {
        console.log('🚨 Boss Hog has become lethargic (No movement detected)!');
        pigs[0].status = 'INACTIVE';
        if (!pigs[0].tags.includes('LETHARGIC')) pigs[0].tags.push('LETHARGIC');
        await updatePigProfile(pigs[0]);

        const newAlertRef = db.ref(`${BASE_PATH}/alerts`).push();
        await newAlertRef.set({
            pig: pigs[0].name,
            type: 'LETHARGY_DETECTION',
            message: `⚠️ WARNING: ${pigs[0].name} activity levels dropped below 10% threshold. Monitor for illness.`,
            severity: 'HIGH',
            timestamp: timestamp,
            status: 'active'
        });
    }
    bossHogLethargic = true;
  } else if (tick === 80) {
      console.log('✅ Boss Hog resumed normal activity.');
      pigs[0].status = 'NORMAL';
      pigs[0].tags = pigs[0].tags.filter(t => t !== 'LETHARGIC');
      await updatePigProfile(pigs[0]);
  }

  // 4. Peppa Fever Recovery (veterinary intervention simulation)
  if (tick === 100) {
      console.log('✅ Peppa fever subsiding after intervention (38.6°C).');
      pigs[1].temp = 38.6;
      pigs[1].status = 'NORMAL';
      pigs[1].tags = pigs[1].tags.filter(t => t !== 'FEVER' && t !== 'RESPIRATORY_DISTRESS');
      await updatePigProfile(pigs[1]);

      const newAlertRef = db.ref(`${BASE_PATH}/alerts`).push();
      await newAlertRef.set({
          pig: pigs[1].name,
          type: 'RECOVERY_CONFIRMED',
          message: `✅ ${pigs[1].name} temperature returned to 38.6°C. Fever resolved.`,
          severity: 'LOW',
          timestamp: timestamp,
          status: 'resolved'
      });
  }

  // 5. Full Cycle Reset — loop the stress test for continuous monitoring
  if (tick === 120) {
      console.log('🔄 Stress test cycle complete. Resetting scenarios for next loop...');
      pigs[0].temp = 38.5;
      pigs[0].status = 'NORMAL';
      pigs[0].tags = [];
      pigs[1].temp = 38.2;
      pigs[1].status = 'NORMAL';
      pigs[1].tags = [];
      
      // CRITICAL FIX: Delete any auto-enrolled pigs from Firebase before clearing them locally
      while (pigs.length > 2) {
          const extraPig = pigs.pop();
          console.log(`🧹 Cleaning up ghost pig: ${extraPig.id}`);
          await removePigProfile(extraPig.id);
      }
      
      for (const pig of pigs) await updatePigProfile(pig);
      tick = 0; // Reset cycle
      return;
  }

  // ── RENDER FRAME ──
  // Simulating the trough at the center (16, 12)
  let maxT = 0;
  let targetX = 0, targetY = 0;
  let highestTempPig = "NONE";

  pigs.forEach((pig, index) => {
    // If lethargic, pig stops orbiting and stays still
    const speed = bossHogLethargic && index === 0 ? 0 : 0.2 + (index * 0.05);
    
    // If lethargic, lock position, otherwise orbit
    const px = bossHogLethargic && index === 0 
        ? Math.floor(16 + pig.offsetX) 
        : Math.floor(16 + pig.offsetX + Math.sin(tick * speed) * 4);
    
    const py = bossHogLethargic && index === 0 
        ? Math.floor(12 + pig.offsetY) 
        : Math.floor(12 + pig.offsetY + Math.cos(tick * speed) * 4);

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        if (dist < pig.radius) {
            // Map temperature 38C -> ~200 pixel value, 40C -> 255
            const pixelVal = Math.min(255, 150 + ((pig.temp - 35) * 20) - (dist * 15));
            if (pixelVal > frame[y * WIDTH + x]) {
                frame[y * WIDTH + x] = pixelVal;
            }
            
            if (pig.temp > maxT) {
                maxT = pig.temp;
                targetX = px;
                targetY = py;
                highestTempPig = pig.name;
            }
        }
      }
    }
  });

  const base64Frame = Buffer.from(frame).toString('base64');
  
  await db.ref(`${BASE_PATH}/telemetry/esp32-s3-01`).set({
    temperature: maxT > 0 ? maxT : 20,
    status: maxT > 39.5 ? 'WARNING' : 'NORMAL',
    identifiedPig: highestTempPig,
    timestamp: timestamp,
    targetX: maxT > 0 ? targetX : -1,
    targetY: maxT > 0 ? targetY : -1,
    thermalFrame: base64Frame
  });

  console.log(`📡 Tick ${tick} | Max Temp: ${maxT.toFixed(1)}°C (${highestTempPig})`);
  tick++;
}

// Initialize pigs in DB
async function initDB() {
    for (const pig of pigs) {
        await updatePigProfile(pig);
    }
}

initDB().then(() => {
    setInterval(sendFrame, 1000); // 1 FPS
    sendFrame();
});
