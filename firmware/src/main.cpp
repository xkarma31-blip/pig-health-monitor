#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <driver/i2s.h>
#include <Wire.h>

// Provide the token generation process info.
#include "addons/TokenHelper.h"
// Provide the RTDB payload printing info and other helper functions.
#include "addons/RTDBHelper.h"

#include "audio_config.h"
#include "secrets.h"
#include "ThermalCamera.h"
#include "AcousticSignature.h"
#include "ThermalIdentification.h"

// ==========================================
// 🐷 Pig Health Monitor FIRMWARE v1.1: Intelligence
// Purpose: Multi-modal sensor fusion and edge analysis.
// ==========================================

// --- Sensor Objects ---
ThermalEye thermal;
AcousticEar acoustic;
ThermalID identify;

// --- Firebase Global Objects ---
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// --- Timing and State ---
unsigned long sendDataPrevMillis = 0;
String deviceId = "esp32-s3-01";

void setupWiFi() {
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\nWiFi Connected!");
}

void setupFirebase() {
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;
  auth.user.email = FIREBASE_USER_EMAIL;
  auth.user.password = FIREBASE_USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback; 
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = DMA_BUF_CNT,
    .dma_buf_len = DMA_BUF_LEN,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Wire.begin(); // Initialize I2C for Thermal Camera
  delay(1000);
  
  Serial.println("🐷 Pig Health Monitor: Initializing Intelligence...");
  
  setupWiFi();
  setupFirebase();
  setupI2S();
  thermal.begin();
  
  Serial.println("🐷 Pig Health Monitor: Operational.");
}

void loop() {
  // 1. Read Audio Data for FFT Analysis
  int16_t sampleBuffer[SAMPLES];
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, &sampleBuffer, sizeof(sampleBuffer), &bytesRead, portMAX_DELAY);

  // 2. Perform Cough Detection
  bool coughDetected = acoustic.detectCough(sampleBuffer, bytesRead / 2);

  // 3. Telemetry and Alerting (Non-blocking)
  if (Firebase.ready() && (millis() - sendDataPrevMillis > 5000 || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();

    float currentTemp = thermal.getMaxTemp();
    String healthStatus = "NORMAL";

    if (currentTemp > 39.5) healthStatus = "WARNING";
    if (coughDetected) healthStatus = "CRITICAL";

    // A. Update Telemetry
    String telePath = "/telemetry/" + deviceId;
    FirebaseJson teleJson;
    teleJson.set("temperature", currentTemp);
    teleJson.set("status", healthStatus);
    teleJson.set("timestamp/.sv", "timestamp");
    Firebase.RTDB.setJSON(&fbdo, telePath.c_str(), &teleJson);

    // B. Trigger Alert if Critical
    if (coughDetected) {
      String alertPath = "/alerts";
      FirebaseJson alertJson;
      alertJson.set("deviceId", deviceId);
      alertJson.set("type", "COUGH_DETECTED");
      alertJson.set("severity", "HIGH");
      alertJson.set("message", "Acoustic signature matched a dry cough.");
      alertJson.set("timestamp/.sv", "timestamp");
      Firebase.RTDB.pushJSON(&fbdo, alertPath.c_str(), &alertJson);
    }

    // 4. Manual Data Collection Trigger (Serial Input)
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'c') { // 'c' for Collect
        identify.printDataForCollection(thermal.frame);
      }
    }
  }
}
