const puppeteer = require('puppeteer');
const path = require('path');

const DIR = '/home/solrahk/.gemini/antigravity/brain/371372f5-1e4f-444f-ab18-c15eae6bddc0';
const BASE = 'https://pig-health-monitor.vercel.app';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();

  // === MOBILE PORTRAIT (375x812 — iPhone) ===
  console.log("📱 Capturing Mobile Portrait...");
  await page.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 });
  
  // Landing
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_landing.png'), fullPage: true });
  console.log("  ✓ Landing");

  // Dashboard
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_dashboard.png'), fullPage: true });
  console.log("  ✓ Dashboard");

  // Sensors
  await page.goto(`${BASE}/sensors`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_sensors.png'), fullPage: true });
  console.log("  ✓ Sensors");

  // Alerts
  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_alerts.png'), fullPage: true });
  console.log("  ✓ Alerts");

  // === DESKTOP LANDSCAPE (1440x900) ===
  console.log("\n🖥️ Capturing Desktop Landscape...");
  await page.setViewport({ width: 1440, height: 900, isMobile: false });

  // Landing
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_landing.png'), fullPage: true });
  console.log("  ✓ Landing");

  // Dashboard  
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_dashboard.png'), fullPage: true });
  console.log("  ✓ Dashboard");

  // Sensors
  await page.goto(`${BASE}/sensors`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_sensors.png'), fullPage: true });
  console.log("  ✓ Sensors");

  console.log("\n✅ All captures complete!");
  await browser.close();
})();
