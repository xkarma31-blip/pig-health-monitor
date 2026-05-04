const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  console.log("Navigating to https://pig-health-monitor.vercel.app/auth");
  await page.goto('https://pig-health-monitor.vercel.app/auth', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/scripts/test/debug_auth.png' });
  const html = await page.content();
  console.log("HTML length:", html.length);
  // Log all inputs
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder,
      type: i.type,
      value: i.value
    }));
  });
  console.log("INPUTS FOUND:", JSON.stringify(inputs, null, 2));
  await browser.close();
})();
