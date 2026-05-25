// ⚠️ DEPRECATED — PocketBase v1 firmware. Superseded by firmware/src/main.cpp (Firebase RTDB).
// Kept for reference only. Will not compile without /PigHealthMonitor/config.h.
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Ticker.h>
#include "config.h"

Ticker heartbeatTicker;
unsigned long lastTransmitTime = 0;
bool isAlertActive = false;

// ---------------------------------------------------------
// 🚥 Heartbeat LED Logic
// ---------------------------------------------------------
void toggleLED() {
  digitalWrite(ONBOARD_LED, !digitalRead(ONBOARD_LED));
}

void setHeartbeat(float seconds) {
  heartbeatTicker.detach();
  if (seconds == 0) {
    digitalWrite(ONBOARD_LED, HIGH); // Solid ON = Zenith (Connected)
  } else {
    heartbeatTicker.attach(seconds, toggleLED);
  }
}

// ---------------------------------------------------------
// 📡 PocketBase API Transmission
// ---------------------------------------------------------
void sendSensorData(float temp, float humidity, float ammonia, bool squealDetected) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String endpoint = String(PB_URL) + "/api/collections/" + PB_COLLECTION + "/records";
    
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    // Construct the payload matching PocketBase schema
    JsonDocument doc;
    doc["temperature"] = temp;
    doc["humidity"] = humidity;
    doc["ammonia"] = ammonia;
    doc["squeal_detected"] = squealDetected;
    doc["timestamp"] = "auto"; // PocketBase handles actual created/updated times natively, but if needed, we define it.

    String requestBody;
    serializeJson(doc, requestBody);

    Serial.print("› Transmitting to PocketBase: ");
    Serial.println(requestBody);

    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      Serial.print("  [SUCCESS] HTTP Code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("  [VOID] HTTP Error: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }
    
    http.end();
  } else {
    Serial.println("  [VOID] Wi-Fi lost. Attempting reconnect...");
    setHeartbeat(0.5); // Fast blink (Searching...)
    WiFi.reconnect();
  }
}

// ---------------------------------------------------------
// 🚀 Vessel Ignition
// ---------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(ONBOARD_LED, OUTPUT);
  
  // Set pins for basic digital read (for analog read change in loop)
  pinMode(SQUEAL_SENSOR_PIN, INPUT);

  // Ignition Blink (Slow)
  setHeartbeat(1.0); 
  Serial.println("\n› Igniting Pig Health Monitor (ESP32-S3)");
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("› Manifesting Wi-Fi Connection");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n› Wi-Fi Connected!");
  Serial.print("› IP Address: ");
  Serial.println(WiFi.localIP());

  // Zenith State (Solid LED)
  setHeartbeat(0); 
}

// ---------------------------------------------------------
// 🔄 Primary Operational Loop
// ---------------------------------------------------------
void loop() {
  // 1. Read Squeal Alert (Immediate Interrupt logic simulation)
  // In a real scenario, use hardware interrupts for instantaneous audio detection
  bool currentSqueal = digitalRead(SQUEAL_SENSOR_PIN) == HIGH;
  
  if (currentSqueal && !isAlertActive) {
    isAlertActive = true;
    Serial.println("\n⚠️ [CRITICAL] Squeal Alert Detected!");
    setHeartbeat(0.1); // Hyper Blink
    
    // Send immediate packet
    sendSensorData(28.5, 65.0, 15.2, true); // Mock values, replace with live analogRead
  } else if (!currentSqueal && isAlertActive) {
    isAlertActive = false; // Reset when audio drops
    setHeartbeat(0); // Return to solid Zenith
  }

  // 2. Standard Telemetry Transmission
  if (millis() - lastTransmitTime >= SENSOR_POLL_INTERVAL) {
    lastTransmitTime = millis();
    
    // Insert actual sensor readout logic here (e.g., DHT.readTemperature())
    float mockTemp = 28.0 + random(0, 20) / 10.0;     // 28.0C - 30.0C
    float mockHum = 60.0 + random(0, 100) / 10.0;     // 60.0% - 70.0%
    float mockAmmonia = 10.0 + random(0, 50) / 10.0;  // 10.0 - 15.0 ppm
    
    sendSensorData(mockTemp, mockHum, mockAmmonia, false);
  }
}
