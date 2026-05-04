#include <WiFi.h>
#include <HTTPClient.h>
#include "DHTesp.h" // Wokwi uses DHTesp for DHT sensors

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

const char* API_KEY = "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc";
const char* DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com";
const char* ADMIN_EMAIL = "admin@farm.local";
const char* ADMIN_PASSWORD = "357631";

#define DHTPIN 4
DHTesp dht;

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
  
  String payload = "{\"email\":\"" + String(ADMIN_EMAIL) + "\",\"password\":\"" + String(ADMIN_PASSWORD) + "\",\"returnSecureToken\":true}";
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    String response = http.getString();
    int tokenStart = response.indexOf("\"idToken\":\"") + 11;
    int tokenEnd = response.indexOf("\"", tokenStart);
    idToken = response.substring(tokenStart, tokenEnd);
    tokenExpiry = millis() + (3600 * 1000) - 60000; // rough 1hr expiry
    Serial.println("Firebase Authenticated!");
    http.end();
    return true;
  }
  
  Serial.printf("Auth failed: %d\n", httpCode);
  http.end();
  return false;
}

void setup() {
  Serial.begin(115200);
  dht.setup(DHTPIN, DHTesp::DHT22);
  connectWiFi();
}

void loop() {
  if (millis() - lastSend > 5000 || lastSend == 0) {
    if (authenticate()) {
      float t = dht.getTemperature();
      if (isnan(t)) t = 39.0;
      
      String healthStatus = "NORMAL";
      if (t > 40.0) healthStatus = "WARNING";

      HTTPClient http;
      String url = String(DATABASE_URL) + "/telemetry/esp32-s3-01.json?auth=" + idToken;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");

      String json = "{\"temperature\":" + String(t) + ",\"status\":\"" + healthStatus + "\",\"identifiedPig\":\"Wokwi_Peppa\",\"targetX\":16,\"targetY\":12,\"timestamp\":{\".sv\":\"timestamp\"},\"thermalFrame\":\"AAAA\"}";

      int httpCode = http.PUT(json);
      if (httpCode == 200) {
        Serial.println("Telemetry Pushed: " + String(t) + "C | Status: " + healthStatus);
      } else {
        Serial.printf("Push failed: %d\n", httpCode);
      }
      http.end();
    }
    lastSend = millis();
  }
  delay(10);
}
