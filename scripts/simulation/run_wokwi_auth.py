import asyncio
from playwright.async_api import async_playwright
import os

sketch_code = """
#include <WiFi.h>
#include <HTTPClient.h>

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

const char* API_KEY = "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc";
const char* DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com";
const char* ADMIN_EMAIL = "admin@farm.local";
const char* ADMIN_PASSWORD = "357631";

String idToken = "";
unsigned long tokenExpiry = 0;
unsigned long lastSend = 0;

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
}

bool authenticate() {
  if (idToken != "" && millis() < tokenExpiry) return true;
  
  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
  url += API_KEY;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\\"email\\":\\"" + String(ADMIN_EMAIL) + "\\",\\"password\\":\\"" + String(ADMIN_PASSWORD) + "\\",\\"returnSecureToken\\":true}";
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    String response = http.getString();
    int tokenStart = response.indexOf("\\"idToken\\":\\"") + 11;
    int tokenEnd = response.indexOf("\\"", tokenStart);
    idToken = response.substring(tokenStart, tokenEnd);
    tokenExpiry = millis() + (3600 * 1000) - 60000;
    Serial.println("Firebase Authenticated!");
    http.end();
    return true;
  }
  
  Serial.printf("Auth failed: %d\\n", httpCode);
  http.end();
  return false;
}

void setup() {
  Serial.begin(115200);
  connectWiFi();
}

void loop() {
  if (millis() - lastSend > 5000 || lastSend == 0) {
    if (authenticate()) {
      float t = 39.5 + random(-10, 10)/10.0;
      String healthStatus = "NORMAL";
      if (t > 40.0) healthStatus = "WARNING";

      HTTPClient http;
      String url = String(DATABASE_URL) + "/telemetry/esp32-s3-01.json?auth=" + idToken;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");

      String json = "{\\"temperature\\":" + String(t) + ",\\"status\\":\\"" + healthStatus + "\\",\\"identifiedPig\\":\\"Wokwi_Peppa\\",\\"targetX\\":16,\\"targetY\\":12,\\"timestamp\\":{\\".sv\\":\\"timestamp\\"},\\"thermalFrame\\":\\"AAAA\\"}";

      int httpCode = http.PUT(json);
      if (httpCode == 200) {
        Serial.println("Telemetry Pushed: " + String(t) + "C | Status: " + healthStatus);
      } else {
        Serial.printf("Push failed: %d\\n", httpCode);
      }
      http.end();
    }
    lastSend = millis();
  }
  delay(10);
}
"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        
        print("Navigating to Wokwi project...")
        await page.goto("https://wokwi.com/projects/463009293099448321")
        await page.wait_for_selector(".view-lines", timeout=20000)
        
        print("Injecting sketch.ino...")
        await page.evaluate("""([sketch]) => {
            const models = monaco.editor.getModels();
            for (const model of models) {
                if (model.uri.path.endsWith('.ino')) {
                    model.setValue(sketch);
                }
            }
        }""", [sketch_code])
        
        print("Starting simulation via F1...")
        await page.keyboard.press("F1")
        await asyncio.sleep(1)
        await page.keyboard.type("Wokwi: Start Simulator")
        await asyncio.sleep(1)
        await page.keyboard.press("Enter")
        
        print("Waiting 20 seconds for compilation, WiFi, Auth, and Push...")
        await asyncio.sleep(20)
        
        screenshot_path = os.path.join(os.path.dirname(__file__), "wokwi_firebase_running.png")
        await page.screenshot(path=screenshot_path)
        print(f"Simulation captured at {screenshot_path}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
