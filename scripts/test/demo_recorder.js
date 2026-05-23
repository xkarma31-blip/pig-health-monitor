/**
 * Pig Health Monitor — Video Demo Script
 * Records screenshots at each step for a defense presentation.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTDIR = '/home/solrahk/.gemini/antigravity/brain/3fb71982-c17f-448f-b330-828f77169f7b/artifacts/demo_screenshots';
const URL = 'https://pig-health-monitor.vercel.app';

(async () => {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  console.log("🎬 Launching demo recorder...");
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();

  // Helper
  const snap = async (name, delay = 2000) => {
    await new Promise(r => setTimeout(r, delay));
    const file = path.join(OUTDIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`📸 ${name}`);
  };

  // === STEP 1: Guest Dashboard ===
  console.log("\n=== STEP 1: Guest Mode Dashboard ===");
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await snap('01_guest_dashboard', 3000);

  // === STEP 2: Navigate to Login ===
  console.log("\n=== STEP 2: Login Page ===");
  await page.goto(URL + '/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('02_login_page', 2000);

  // === STEP 3: Enter Credentials ===
  console.log("\n=== STEP 3: Entering Credentials ===");
  try {
    await page.waitForSelector('input[placeholder="admin@farm.local"]', { timeout: 10000 });
    await page.type('input[placeholder="admin@farm.local"]', 'admin@farm.local', { delay: 50 });
    await page.type('input[placeholder="••••••••"]', '357631', { delay: 50 });
    await snap('03_credentials_entered', 1000);

    // Click authenticate
    const btn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      const loginBtn = buttons.find(b => b.innerText && b.innerText.includes('AUTHENTICATE'));
      if (!loginBtn) return null;
      const rect = loginBtn.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (btn) {
      await page.mouse.click(btn.x, btn.y);
      console.log("Clicked AUTHENTICATE button");
    } else {
      console.log("Could not find AUTHENTICATE button, trying fallback...");
      // Try clicking any button-like element
      await page.evaluate(() => {
        const btns = document.querySelectorAll('div[role="button"]');
        if (btns.length > 0) btns[btns.length - 1].click();
      });
    }
    await snap('04_authenticating', 5000);
  } catch (e) {
    console.log("Login form issue:", e.message);
    await snap('03_login_error', 1000);
  }

  // === STEP 4: Authenticated Dashboard ===
  console.log("\n=== STEP 4: Authenticated Dashboard ===");
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('05_live_dashboard', 5000);

  // === STEP 5: Events Tab (alerts) ===
  console.log("\n=== STEP 5: Events Tab ===");
  await page.goto(URL + '/events', { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('06_events_tab', 3000);

  // === STEP 6: Analytics Tab (metrics + roster) ===
  console.log("\n=== STEP 6: Analytics Tab ===");
  await page.goto(URL + '/analytics', { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('07_analytics_tab', 3000);

  // === STEP 7: Nodes Tab ===
  console.log("\n=== STEP 7: Nodes Tab ===");
  await page.goto(URL + '/nodes', { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('08_nodes_tab', 3000);

  // === STEP 8: Sign Out ===
  console.log("\n=== STEP 8: Sign Out ===");
  await page.goto(URL + '/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('09_session_before_logout', 2000);
  
  try {
    const signOutBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      const btn = buttons.find(b => b.innerText && (b.innerText.includes('SIGN OUT') || b.innerText.includes('LOGOUT')));
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (signOutBtn) {
      await page.mouse.click(signOutBtn.x, signOutBtn.y);
      console.log("Clicked SIGN OUT");
    }
  } catch (e) {
    console.log("Sign out issue:", e.message);
  }
  await snap('10_after_logout', 3000);

  // === STEP 9: Verify data cleared ===
  console.log("\n=== STEP 9: Verify Data Cleared ===");
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await snap('11_guest_after_logout', 3000);

  console.log("\n🎬 Demo recording complete! Screenshots saved to:", OUTDIR);
  await browser.close();
})();
