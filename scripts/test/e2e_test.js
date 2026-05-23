const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching browser for visual test...");
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log("Navigating to production dashboard...");
  await page.goto('https://pig-health-monitor.vercel.app', { waitUntil: 'networkidle2' });

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
  console.log("Navigating to Session tab...");
  await page.goto('https://pig-health-monitor.vercel.app/login', { waitUntil: 'networkidle2' });
  
  console.log("Waiting for SIGN IN button...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('div'));
    const signInBtn = btns.find(b => b.innerText === 'SIGN IN');
    if (signInBtn) signInBtn.click();
  });
  await new Promise(r => setTimeout(r, 4000));

  console.log("Typing credentials...");
  // Wait for ANY input to appear
  await page.waitForFunction(() => document.querySelectorAll('input').length >= 2, {timeout: 15000});
  const inputs = await page.$$('input');
  // Usually email is 1st, password is 2nd
  await inputs[0].type('admin@farm.local');
  await inputs[1].type('357631');
  
  console.log("Clicking AUTHENTICATE...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('div'));
    const authBtn = btns.find(b => b.innerText === 'AUTHENTICATE');
    if (authBtn) authBtn.click();
  });

  console.log("Waiting for network idle after login...");
  await new Promise(r => setTimeout(r, 8000)); // Give Firebase time to auth

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
