import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

console.log('🔥 Starting Live Thermal Feed Simulation...');

// 32x24 grid = 768 pixels
const WIDTH = 32;
const HEIGHT = 24;

let tick = 0;

async function sendFrame() {
  const frame = new Uint8Array(WIDTH * HEIGHT);
  
  // Create a moving "hot" blob for Boss Hog
  const centerX = Math.floor(16 + Math.sin(tick * 0.5) * 8);
  const centerY = Math.floor(12 + Math.cos(tick * 0.3) * 6);
  
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      // Base temp 20 (ambient), hot spot 255
      let temp = 20;
      if (dist < 4) {
        temp = 255 - (dist * 40); // gradient hot spot
      } else if (dist < 8) {
        temp = 100 - (dist * 10);
      }
      frame[y * WIDTH + x] = Math.max(20, Math.min(255, temp));
    }
  }

  const base64Frame = Buffer.from(frame).toString('base64');
  
  await set(ref(db, 'telemetry/esp32-s3-01'), {
    temperature: 38.7 + (Math.random() * 0.5),
    status: 'NORMAL',
    identifiedPig: 'Boss Hog',
    timestamp: Date.now(),
    targetX: centerX,
    targetY: centerY,
    thermalFrame: base64Frame
  });
  
  console.log(`📡 Pushed Frame ${tick} | Target: (${centerX}, ${centerY})`);
  tick++;
}

setInterval(sendFrame, 1000); // 1 FPS
sendFrame();
