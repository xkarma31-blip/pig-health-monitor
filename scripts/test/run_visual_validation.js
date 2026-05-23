const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = '/home/solrahk/.gemini/antigravity/brain/371372f5-1e4f-444f-ab18-c15eae6bddc0';
const BASE_URL = 'https://mobileapp-lyart.vercel.app';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();

  console.log("🚀 Starting Visual Validation Ritual...");

  try {
    // 1. Log In
    await page.setViewport({ width: 1280, height: 800 });
    console.log("🔑 Navigating to Login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    
    await page.waitForSelector('input', { timeout: 10000 });

    console.log("⌨️ Typing credentials...");
    await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const emailInput = inputs.find(i => i.placeholder === 'admin@farm.local');
        const passInput = inputs.find(i => i.placeholder === '••••••••');
        if (emailInput) {
            emailInput.value = 'admin@farm.local';
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (passInput) {
            passInput.value = '357631';
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    console.log("🖱️ Clicking Authenticate...");
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div, span, p, button'));
        const btn = buttons.find(b => b.innerText && b.innerText.includes('AUTHENTICATE'));
        if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 8000)); // Wait for auth and redirection

    // === TEST 1: DESKTOP DASHBOARD ===
    console.log("🖥️ Capturing Desktop Dashboard...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'desktop_dashboard.png'), fullPage: true });

    // === TEST 2: DESKTOP EVENTS ===
    console.log("🔔 Capturing Desktop Events...");
    await page.goto(`${BASE_URL}/events`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'desktop_events.png'), fullPage: true });

    // === TEST 3: MOBILE DASHBOARD ===
    console.log("📱 Capturing Mobile Dashboard...");
    await page.setViewport({ width: 375, height: 812, isMobile: true });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_dashboard.png') });

    console.log("✨ Validation Ritual Complete.");
  } catch (err) {
    console.error("❌ Ritual Failed:", err);
  } finally {
    await browser.close();
  }
})();
