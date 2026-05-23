const puppeteer = require('puppeteer');
const path = require('path');

const ARTIFACTS_DIR = '/home/solrahk/.gemini/antigravity/brain/371372f5-1e4f-444f-ab18-c15eae6bddc0';
const BASE_URL = 'https://mobileapp-lyart.vercel.app';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();

  console.log("🚀 Capturing New Landing Page...");

  // 1. Desktop Landing
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'desktop_landing.png'), fullPage: true });

  // 2. Mobile Landing
  await page.setViewport({ width: 375, height: 812, isMobile: true });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_landing.png') });

  console.log("✨ Landing Page Captured.");
  await browser.close();
})();
