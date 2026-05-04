import asyncio
from playwright.async_api import async_playwright
import json
import os

async def main():
    sketch_path = os.path.join(os.path.dirname(__file__), "simulators/wokwi/sketch.ino")
    diagram_path = os.path.join(os.path.dirname(__file__), "simulators/wokwi/diagram.json")
    
    with open(sketch_path, "r") as f:
        sketch_code = f.read()
    with open(diagram_path, "r") as f:
        diagram_code = f.read()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        
        print("Navigating to Wokwi...")
        await page.goto("https://wokwi.com/projects/new/esp32")
        await page.wait_for_selector(".view-lines", timeout=15000)
        
        print("Injecting sketch.ino and diagram.json...")
        # Wokwi stores the current project in localStorage or we can set it via monaco editor
        # Let's use Monaco editor API if available on window
        await page.evaluate("""([sketch, diagram]) => {
            const models = monaco.editor.getModels();
            for (const model of models) {
                if (model.uri.path.endsWith('.ino')) {
                    model.setValue(sketch);
                }
                if (model.uri.path.endsWith('.json')) {
                    model.setValue(diagram);
                }
            }
        }""", [sketch_code, diagram_code])
        
        print("Starting simulation...")
        # Click the play button (usually has data-test-id or aria-label="Start simulation")
        await page.click('button[aria-label="Start simulation"]')
        
        print("Waiting 10 seconds for boot and output...")
        await asyncio.sleep(10)
        
        screenshot_path = os.path.join(os.path.dirname(__file__), "wokwi_running.png")
        await page.screenshot(path=screenshot_path)
        print(f"Simulation captured at {screenshot_path}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
