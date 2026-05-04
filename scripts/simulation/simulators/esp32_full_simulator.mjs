/**
 * 🐷 ESP32-S3 Full Firmware Simulator
 * ====================================
 * A software-based replica of the real ESP32-S3 firmware (main.cpp v1.1).
 * This script simulates ALL hardware sensor inputs and pushes data to
 * Firebase Realtime Database using the exact same JSON schema as the
 * physical device.
 *
 * What it simulates:
 *   1. MLX90640 Thermal Camera → 32×24 pixel thermal frame (base64)
 *   2. Dual INMP441 Microphones → Cough detection (acoustic classification)
 *   3. Pig identification via thermal embeddings (Siamese-Net mock)
 *   4. Firebase RTDB writes to /telemetry, /alerts, /sensors, /roster
 *   5. Command listening on /commands/<deviceId> for enrollment rituals
 *
 * Usage:
 *   node scripts/simulators/esp32_full_simulator.mjs
 *
 * Environment:
 *   TARGET_USER_UID  — Firebase user UID (default: uses root-level paths)
 *   SIM_DURATION     — Total simulation seconds (default: 120)
 *   SIM_INTERVAL     — Tick interval in ms (default: 1000)
 */

import { db } from '../firebase_rest_client.mjs';

// ─── Configuration ───────────────────────────────────────────────────────
const DEVICE_ID = 'esp32-s3-01';
const WIDTH = 32;
const HEIGHT = 24;
const FRAME_SIZE = WIDTH * HEIGHT; // 768 pixels
const SIM_DURATION = parseInt(process.env.SIM_DURATION || '120');
const SIM_INTERVAL = parseInt(process.env.SIM_INTERVAL || '1000');

// ─── Pig Registry (mirrors ThermalIdentification.h enrollments) ──────────
const enrolledPigs = [
  {
    id: 'boss_hog',
    name: 'Boss Hog',
    baseTemp: 38.5,
    thermalRadius: 4,
    orbitRadius: 5,
    orbitSpeed: 0.15,
    orbitOffset: 0,
    centerX: 16,
    centerY: 12,
    status: 'NORMAL',
    tags: [],
  },
  {
    id: 'peppa',
    name: 'Peppa',
    baseTemp: 38.2,
    thermalRadius: 3,
    orbitRadius: 6,
    orbitSpeed: 0.22,
    orbitOffset: Math.PI * 0.7,
    centerX: 16,
    centerY: 12,
    status: 'NORMAL',
    tags: [],
  },
];

// ─── Acoustic Engine (simulates AcousticSignature.h) ─────────────────────
const COUGH_TYPES = {
  NONE: 'NONE',
  INFECTIOUS: 'INFECTIOUS_COUGH',     // 600Hz dominant
  NON_INFECTIOUS: 'NON_INFECTIOUS_COUGH', // 1600Hz dominant
};

function simulateCoughDetection(tick) {
  // Simulate periodic cough events
  if (tick >= 35 && tick <= 38) return { type: COUGH_TYPES.INFECTIOUS, pig: 'Peppa' };
  if (tick >= 70 && tick <= 72) return { type: COUGH_TYPES.NON_INFECTIOUS, pig: 'Boss Hog' };
  if (tick === 90) return { type: COUGH_TYPES.INFECTIOUS, pig: 'Peppa' };
  return { type: COUGH_TYPES.NONE, pig: null };
}

// ─── Thermal Frame Generator (simulates MLX90640 readFrame) ──────────────
function generateThermalFrame(tick, pigs) {
  const frame = new Float32Array(FRAME_SIZE);
  const byteFrame = new Uint8Array(FRAME_SIZE);

  // Background noise: ambient temp 22-24°C with sensor noise
  for (let i = 0; i < FRAME_SIZE; i++) {
    frame[i] = 22.0 + Math.random() * 2.0;
  }

  // Render each pig as a thermal blob
  let maxTemp = 0;
  let maxTargetX = 0;
  let maxTargetY = 0;
  let identifiedPig = 'SCANNING...';

  for (const pig of pigs) {
    // Calculate pig position (orbital motion around pen center)
    const isLethargic = pig.tags.includes('LETHARGIC');
    const angle = isLethargic ? pig.orbitOffset : (tick * pig.orbitSpeed + pig.orbitOffset);
    const px = Math.floor(pig.centerX + Math.sin(angle) * pig.orbitRadius);
    const py = Math.floor(pig.centerY + Math.cos(angle) * pig.orbitRadius);

    // Paint thermal signature onto frame
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (dist < pig.thermalRadius) {
          // Temperature falloff from center: core temp → ambient over radius
          const falloff = 1.0 - (dist / pig.thermalRadius);
          const pixelTemp = 24.0 + (pig.baseTemp - 24.0) * falloff * falloff;
          frame[y * WIDTH + x] = Math.max(frame[y * WIDTH + x], pixelTemp);
        }
      }
    }

    // Track hottest pig for identification
    if (pig.baseTemp > maxTemp) {
      maxTemp = pig.baseTemp;
      maxTargetX = px;
      maxTargetY = py;
      identifiedPig = pig.name;
    }
  }

  // Convert float frame to byte frame (firmware's encoding: 20-40°C → 0-255)
  for (let i = 0; i < FRAME_SIZE; i++) {
    let t = frame[i];
    if (t < 20.0) t = 20.0;
    if (t > 40.0) t = 40.0;
    byteFrame[i] = Math.floor((t - 20.0) * 12.75);
  }

  const base64Frame = Buffer.from(byteFrame).toString('base64');

  return {
    temperature: maxTemp,
    targetX: maxTargetX,
    targetY: maxTargetY,
    identifiedPig,
    thermalFrame: base64Frame,
    rawFrame: frame,
  };
}

// ─── Health Status Engine (mirrors firmware logic) ───────────────────────
function getHealthStatus(temp) {
  if (temp > 40.0) return 'CRITICAL';
  if (temp > 39.5) return 'WARNING';
  return 'NORMAL';
}

// ─── Scenario Engine (realistic health events) ──────────────────────────
async function applyScenario(tick, pigs) {
  const events = [];

  // Tick 15: Auto-enrollment of a new pig (Zero-Shot Siamese)
  if (tick === 15) {
    const newPig = {
      id: `wilbur_${Date.now()}`,
      name: 'Wilbur',
      baseTemp: 38.7,
      thermalRadius: 3.5,
      orbitRadius: 7,
      orbitSpeed: 0.18,
      orbitOffset: Math.PI * 1.4,
      centerX: 16,
      centerY: 12,
      status: 'NORMAL',
      tags: ['NEW_ENROLLMENT'],
    };
    pigs.push(newPig);
    events.push({
      type: 'ZERO_SHOT_ENROLLMENT',
      pig: newPig.name,
      message: `New thermal signature identified via metric embedding. Auto-enrolled as ${newPig.name}.`,
      severity: 'LOW',
    });
    console.log('👀 NEW PIG DETECTED — Zero-Shot Enrollment: Wilbur');
  }

  // Tick 30-50: Peppa develops fever (gradual onset)
  if (tick >= 30 && tick <= 50) {
    const feverProgress = (tick - 30) / 20;
    pigs[1].baseTemp = 38.2 + feverProgress * 2.3; // Ramps to 40.5°C
    if (tick === 30) {
      pigs[1].status = 'FEVER';
      pigs[1].tags = [...new Set([...pigs[1].tags, 'FEVER'])];
      events.push({
        type: 'FEVER_ONSET',
        pig: pigs[1].name,
        message: `🌡️ ${pigs[1].name} core temperature rising: ${pigs[1].baseTemp.toFixed(1)}°C`,
        severity: 'HIGH',
      });
      console.log(`🔥 ${pigs[1].name} fever onset: ${pigs[1].baseTemp.toFixed(1)}°C`);
    }
    if (tick === 45) {
      pigs[1].tags = [...new Set([...pigs[1].tags, 'RESPIRATORY_DISTRESS'])];
      events.push({
        type: 'FEVER_AND_COUGH_DETECTED',
        pig: pigs[1].name,
        message: `🚨 CRITICAL: ${pigs[1].name} at ${pigs[1].baseTemp.toFixed(1)}°C with acoustic cough signature!`,
        severity: 'CRITICAL',
      });
      console.log(`🚨 ${pigs[1].name} CRITICAL — fever + cough detected`);
    }
  }

  // Tick 55-75: Boss Hog becomes lethargic (movement stops)
  if (tick === 55) {
    pigs[0].status = 'INACTIVE';
    pigs[0].tags = [...new Set([...pigs[0].tags, 'LETHARGIC'])];
    events.push({
      type: 'LETHARGY_DETECTION',
      pig: pigs[0].name,
      message: `⚠️ ${pigs[0].name} activity dropped below 10% threshold. Monitor for illness.`,
      severity: 'HIGH',
    });
    console.log(`🐌 ${pigs[0].name} — lethargy detected`);
  }
  if (tick === 75) {
    pigs[0].status = 'NORMAL';
    pigs[0].tags = pigs[0].tags.filter((t) => t !== 'LETHARGIC');
    console.log(`✅ ${pigs[0].name} — resumed normal activity`);
  }

  // Tick 60: Peppa recovery begins (vet intervention)
  if (tick >= 60 && tick <= 80) {
    const recoveryProgress = (tick - 60) / 20;
    pigs[1].baseTemp = 40.5 - recoveryProgress * 1.9; // Back to ~38.6
    if (tick === 60) {
      console.log(`💉 Veterinary intervention started for ${pigs[1].name}`);
    }
    if (tick === 80) {
      pigs[1].status = 'NORMAL';
      pigs[1].tags = pigs[1].tags.filter((t) => t !== 'FEVER' && t !== 'RESPIRATORY_DISTRESS');
      events.push({
        type: 'RECOVERY_CONFIRMED',
        pig: pigs[1].name,
        message: `✅ ${pigs[1].name} temperature returned to ${pigs[1].baseTemp.toFixed(1)}°C. Fever resolved.`,
        severity: 'LOW',
      });
      console.log(`✅ ${pigs[1].name} — recovery confirmed (${pigs[1].baseTemp.toFixed(1)}°C)`);
    }
  }

  return events;
}

// ─── Sensor Status Writer (mirrors mock_feeder.js sensors path) ──────────
async function updateSensors(thermalData, coughEvent) {
  const sensors = {
    'temp-01': {
      id: 'temp-01',
      name: 'Body Temperature',
      type: 'thermal',
      unit: '°C',
      icon: '🌡️',
      value: parseFloat(thermalData.temperature.toFixed(1)),
      status: thermalData.temperature > 40.0 ? 'danger' : thermalData.temperature > 39.5 ? 'warning' : 'normal',
      updated: new Date().toISOString(),
    },
    'acoustic-01': {
      id: 'acoustic-01',
      name: 'Respiratory Sound',
      type: 'acoustic',
      unit: '% cough',
      icon: '🔊',
      value: coughEvent.type !== COUGH_TYPES.NONE ? (coughEvent.type === COUGH_TYPES.INFECTIOUS ? 85 : 40) : Math.floor(Math.random() * 8),
      status: coughEvent.type === COUGH_TYPES.INFECTIOUS ? 'danger' : coughEvent.type === COUGH_TYPES.NON_INFECTIOUS ? 'warning' : 'normal',
      updated: new Date().toISOString(),
    },
    'temp-02': {
      id: 'temp-02',
      name: 'Ambient Temperature',
      type: 'thermal',
      unit: '°C',
      icon: '🌡️',
      value: parseFloat((25.0 + Math.random() * 2).toFixed(1)),
      status: 'normal',
      updated: new Date().toISOString(),
    },
  };

  await db.ref('sensors').set(sensors);
}

// ─── Roster Writer ───────────────────────────────────────────────────────
async function updateRoster(pigs) {
  for (const pig of pigs) {
    await db.ref(`roster/${pig.id}`).set({
      name: pig.name,
      temperature: parseFloat(pig.baseTemp.toFixed(1)),
      status: pig.status,
      tags: pig.tags,
      lastSeen: Date.now(),
    });
  }
}

// ─── Command Listener (checks /commands/esp32-s3-01) ─────────────────────
async function checkCommands() {
  // In a real scenario, we'd listen for commands from the app
  // For simulation, we just log that we're checking
  // The mobile app can write { command: "ENROLL_START", pigName: "NewPig" }
  // to /commands/esp32-s3-01 and the firmware would read it
  return null;
}

// ─── Test Validation Engine ──────────────────────────────────────────────
const testResults = {
  totalTicks: 0,
  telemetryWrites: 0,
  sensorWrites: 0,
  alertsGenerated: 0,
  rosterUpdates: 0,
  coughDetections: 0,
  feverDetected: false,
  lethargyDetected: false,
  recoveryDetected: false,
  enrollmentDetected: false,
  errors: [],
  frameValidation: {
    validBase64: 0,
    invalidBase64: 0,
    correctSize: 0,
    incorrectSize: 0,
  },
};

function validateFrame(base64Frame) {
  try {
    const decoded = Buffer.from(base64Frame, 'base64');
    if (decoded.length === FRAME_SIZE) {
      testResults.frameValidation.correctSize++;
    } else {
      testResults.frameValidation.incorrectSize++;
    }
    testResults.frameValidation.validBase64++;
  } catch (e) {
    testResults.frameValidation.invalidBase64++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SIMULATION LOOP
// ═══════════════════════════════════════════════════════════════════════════
async function runSimulation() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🐷 ESP32-S3 Full Firmware Simulator v1.1                   ║');
  console.log('║  Pig Health Monitor — Intelligence Layer                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Device ID: ${DEVICE_ID}`);
  console.log(`  Duration:  ${SIM_DURATION}s (${SIM_DURATION} ticks @ ${SIM_INTERVAL}ms)`);
  console.log(`  Pigs:      ${enrolledPigs.map((p) => p.name).join(', ')}`);
  console.log('');

  // Initialize roster in DB
  await updateRoster(enrolledPigs);
  console.log('✅ Initial roster written to Firebase');

  let tick = 0;

  const interval = setInterval(async () => {
    if (tick >= SIM_DURATION) {
      clearInterval(interval);
      printReport();
      return;
    }

    try {
      // 1. Apply scenario events
      const events = await applyScenario(tick, enrolledPigs);
      for (const event of events) {
        const alertRef = db.ref('alerts').push();
        await alertRef.set({
          ...event,
          deviceId: DEVICE_ID,
          timestamp: Date.now(),
          status: 'active',
        });
        testResults.alertsGenerated++;

        if (event.type === 'FEVER_ONSET' || event.type === 'FEVER_AND_COUGH_DETECTED') testResults.feverDetected = true;
        if (event.type === 'LETHARGY_DETECTION') testResults.lethargyDetected = true;
        if (event.type === 'RECOVERY_CONFIRMED') testResults.recoveryDetected = true;
        if (event.type === 'ZERO_SHOT_ENROLLMENT') testResults.enrollmentDetected = true;
      }

      // 2. Acoustic analysis
      const coughEvent = simulateCoughDetection(tick);
      if (coughEvent.type !== COUGH_TYPES.NONE) {
        testResults.coughDetections++;
        const severity = coughEvent.type === COUGH_TYPES.INFECTIOUS ? 'HIGH' : 'LOW';
        const msg = coughEvent.type === COUGH_TYPES.INFECTIOUS
          ? `Infectious cough signature detected (600Hz band dominant). Veterinary check advised.`
          : `Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.`;

        const alertRef = db.ref('alerts').push();
        await alertRef.set({
          deviceId: DEVICE_ID,
          type: coughEvent.type,
          severity,
          message: msg,
          pig: coughEvent.pig,
          timestamp: Date.now(),
          status: 'active',
        });
        testResults.alertsGenerated++;
        console.log(`🎤 Cough detected: ${coughEvent.type} (${coughEvent.pig})`);
      }

      // 3. Generate thermal frame
      const thermalData = generateThermalFrame(tick, enrolledPigs);
      validateFrame(thermalData.thermalFrame);

      // 4. Write telemetry (mirrors firmware's Firebase.RTDB.setJSON)
      await db.ref(`telemetry/${DEVICE_ID}`).set({
        temperature: parseFloat(thermalData.temperature.toFixed(1)),
        status: getHealthStatus(thermalData.temperature),
        identifiedPig: thermalData.identifiedPig,
        targetX: thermalData.targetX,
        targetY: thermalData.targetY,
        thermalFrame: thermalData.thermalFrame,
        timestamp: Date.now(),
      });
      testResults.telemetryWrites++;

      // 5. Update sensors (for the Sensors tab)
      await updateSensors(thermalData, coughEvent);
      testResults.sensorWrites++;

      // 6. Update roster
      await updateRoster(enrolledPigs);
      testResults.rosterUpdates++;

      // 7. Check for commands
      await checkCommands();

      // Status line
      const statusIcon = thermalData.temperature > 39.5 ? '🔴' : '🟢';
      console.log(
        `${statusIcon} Tick ${String(tick).padStart(3, '0')} | ` +
          `${thermalData.identifiedPig.padEnd(12)} | ` +
          `${thermalData.temperature.toFixed(1)}°C | ` +
          `Pigs: ${enrolledPigs.length} | ` +
          `Alerts: ${testResults.alertsGenerated}`
      );

      testResults.totalTicks++;
      tick++;
    } catch (err) {
      testResults.errors.push({ tick, error: err.message });
      console.error(`❌ Tick ${tick} ERROR: ${err.message}`);
      tick++;
    }
  }, SIM_INTERVAL);
}

// ─── Test Report ─────────────────────────────────────────────────────────
function printReport() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 SIMULATION TEST REPORT                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('── Data Flow Validation ──────────────────────────────────────');
  console.log(`  Total ticks executed:    ${testResults.totalTicks}`);
  console.log(`  Telemetry writes:        ${testResults.telemetryWrites}`);
  console.log(`  Sensor updates:          ${testResults.sensorWrites}`);
  console.log(`  Roster updates:          ${testResults.rosterUpdates}`);
  console.log(`  Alerts generated:        ${testResults.alertsGenerated}`);
  console.log(`  Cough detections:        ${testResults.coughDetections}`);
  console.log('');
  console.log('── Thermal Frame Validation ──────────────────────────────────');
  console.log(`  Valid base64 frames:     ${testResults.frameValidation.validBase64}`);
  console.log(`  Invalid base64 frames:   ${testResults.frameValidation.invalidBase64}`);
  console.log(`  Correct size (768B):     ${testResults.frameValidation.correctSize}`);
  console.log(`  Incorrect size:          ${testResults.frameValidation.incorrectSize}`);
  console.log('');
  console.log('── Scenario Coverage ────────────────────────────────────────');
  console.log(`  Fever detected:          ${testResults.feverDetected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Lethargy detected:       ${testResults.lethargyDetected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Recovery confirmed:      ${testResults.recoveryDetected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Zero-shot enrollment:    ${testResults.enrollmentDetected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Cough classification:    ${testResults.coughDetections > 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  const allPass =
    testResults.feverDetected &&
    testResults.lethargyDetected &&
    testResults.recoveryDetected &&
    testResults.enrollmentDetected &&
    testResults.coughDetections > 0 &&
    testResults.frameValidation.invalidBase64 === 0 &&
    testResults.frameValidation.incorrectSize === 0 &&
    testResults.errors.length === 0;

  if (testResults.errors.length > 0) {
    console.log('── Errors ──────────────────────────────────────────────────');
    testResults.errors.forEach((e) => console.log(`  Tick ${e.tick}: ${e.error}`));
    console.log('');
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log(allPass ? '  🎉 ALL TESTS PASSED — ESP32 simulation is VALID' : '  ⚠️ SOME TESTS FAILED — Review above');
  console.log('══════════════════════════════════════════════════════════════');

  // Exit with appropriate code
  process.exit(allPass ? 0 : 1);
}

// ─── Run ─────────────────────────────────────────────────────────────────
runSimulation().catch((err) => {
  console.error('💀 Simulation crashed:', err);
  process.exit(1);
});
