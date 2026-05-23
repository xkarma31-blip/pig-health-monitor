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

  // Events (alerts)
  await page.goto(`${BASE}/events`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_events.png'), fullPage: true });
  console.log("  ✓ Events");

  // Analytics (roster / metrics)
  await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_analytics.png'), fullPage: true });
  console.log("  ✓ Analytics");

  // Nodes
  await page.goto(`${BASE}/nodes`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'mobile_nodes.png'), fullPage: true });
  console.log("  ✓ Nodes");

  // === DESKTOP LANDSCAPE (1440x900) ===
  console.log("\n🖥️ Capturing Desktop Landscape...");
  await page.setViewport({ width: 1440, height: 900, isMobile: false });

  // Landing
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_landing.png'), fullPage: true });
  console.log("  ✓ Landing");

  // Analytics
  await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_analytics.png'), fullPage: true });
  console.log("  ✓ Analytics");

  // Events
  await page.goto(`${BASE}/events`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(DIR, 'desktop_events.png'), fullPage: true });
  console.log("  ✓ Events");

  console.log("\n✅ All captures complete!");
  await browser.close();
})();
