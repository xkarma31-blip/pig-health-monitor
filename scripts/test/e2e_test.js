const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching browser for visual test...");
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log("Navigating to production dashboard...");
  await page.goto('https://mobileapp-lyart.vercel.app', { waitUntil: 'networkidle2' });

  // TEST 1: Check Guest Mode
  console.log("\n=== TEST 1: GUEST MODE ===");
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes("GUEST MODE")) {
    console.log("✅ Guest Mode Banner is VISIBLE.");
  } else {
    console.log("❌ Guest Mode Banner MISSING.");
  }

  if (!bodyText.includes("Boss Hog") && !bodyText.includes("Peppa")) {
    console.log("✅ No pig data leaked. Data is hidden (N/A / Empty).");
  } else {
    console.log("❌ Pig data leaked in guest mode!");
  }

  // TEST 2: Login
  console.log("\n=== TEST 2: AUTHENTICATING ===");
  console.log("Navigating to Login tab...");
  await page.goto('https://mobileapp-lyart.vercel.app/login', { waitUntil: 'networkidle2' });
  
  console.log("Typing credentials...");
  await page.waitForSelector('input[placeholder="admin@farm.local"]', {timeout: 10000});
  await page.type('input[placeholder="admin@farm.local"]', 'admin@farm.local');
  await page.type('input[placeholder="••••••••"]', '357631');
  
  // Click the login button using exact layout coordinates
  console.log("Clicking login button...");
  const buttonRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
    console.log("BUTTON TEXTS:", buttons.map(b => b.innerText));
    const loginBtn = buttons.find(b => b.innerText && b.innerText.includes('AUTHENTICATE'));
    if (!loginBtn) return null;
    const rect = loginBtn.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  
  if (buttonRect) {
    await page.mouse.click(buttonRect.x, buttonRect.y);
  } else {
    console.log("❌ Could not find login button!");
  }

  console.log("Waiting for network idle after login...");
  await new Promise(r => setTimeout(r, 5000)); // Give Firebase time to auth

  const errorText = await page.evaluate(() => {
    const errObj = document.querySelector('div[dir="auto"][style*="color: rgb(255, 68, 68)"]');
    return errObj ? errObj.innerText : null;
  });
  if (errorText) console.log("LOGIN ERROR ON SCREEN:", errorText);

  console.log("Waiting to see if we navigated back to Dashboard...");
  await new Promise(r => setTimeout(r, 4000)); 
  
  await page.screenshot({ path: '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/scripts/test/screenshot.png' });
  console.log("Screenshot saved to screenshot.png");

  const authText = await page.evaluate(() => document.body.innerText);
  
  console.log("\n=== TEST 3: VERIFYING LIVE DATA ===");
  if (authText.includes("Boss Hog") || authText.includes("Peppa") || authText.includes("Pig_Auto_")) {
    console.log("✅ SUCCESS! Real database data is showing after login.");
  } else {
    console.log("❌ FAILED. Data still hidden or not loading after login.");
  }

  if (authText.includes("🔴 LIVE")) {
    console.log("✅ LIVE badge is visible.");
  } else {
    console.log("❌ LIVE badge is missing.");
  }

  await browser.close();
})();
