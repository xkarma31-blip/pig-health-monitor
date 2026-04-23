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

  // 2. Perform Cough Classification (Dual-Band Research Model)
  CoughType coughType = acoustic.classifyCough(sampleBuffer, bytesRead / 2);
  bool coughDetected = (coughType != COUGH_NONE);

  // 3. Command & Identification Ritual
  String currentPig = "SCANNING...";
  if (Firebase.ready()) {
    // Check for incoming commands
    if (Firebase.RTDB.getJSON(&fbdo, "/commands/esp32-s3-01")) {
      FirebaseJson &json = fbdo.jsonData();
      FirebaseJsonData cmdData;
      json.get(cmdData, "command");
      if (cmdData.success && cmdData.stringValue == "ENROLL_START") {
        FirebaseJsonData nameData;
        String pigName = "Pig_Auto";
        if (json.get(nameData, "pigName") && nameData.success) {
          pigName = nameData.stringValue;
        }
        
        if (!identify.saveEnrollment(pigName, thermal.frame)) {
          // Alert if storage is full — visible in mobile app
          String alertPath = "/alerts";
          FirebaseJson alertJson;
          alertJson.set("deviceId", deviceId);
          alertJson.set("type", "STORAGE_FULL");
          alertJson.set("severity", "WARNING");
          alertJson.set("message", "Pig roster limit reached (50). Enrollment failed. Remove a pig first.");
          alertJson.set("timestamp/.sv", "timestamp");
          Firebase.RTDB.pushJSON(&fbdo, alertPath.c_str(), &alertJson);
        }
        Firebase.RTDB.deleteNode(&fbdo, "/commands/esp32-s3-01");
      }
    }

    // Continuous ID
    float bestScore = 0;
    currentPig = identify.identifyPig(thermal.frame, bestScore);
    if (currentPig == "UNKNOWN" && bestScore > 0.85) {
      Serial.printf("🔍 Near Match: %.2f (try re-enrolling this pig)\n", bestScore);
    }
  }

  // 4. Telemetry and Alerting (every 5s, non-blocking)
  if (Firebase.ready() && (millis() - sendDataPrevMillis > 5000 || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();

    float currentTemp = thermal.getMaxTemp();
    String healthStatus = "NORMAL";
    if (currentTemp > 39.5) healthStatus = "WARNING";
    if (coughDetected) healthStatus = "CRITICAL";

    // A. Push telemetry
    String telePath = "/telemetry/" + deviceId;
    FirebaseJson teleJson;
    teleJson.set("temperature", currentTemp);
    teleJson.set("status", healthStatus);
    teleJson.set("identifiedPig", currentPig);
    teleJson.set("timestamp/.sv", "timestamp");
    Firebase.RTDB.setJSON(&fbdo, telePath.c_str(), &teleJson);

    // B. Alert with severity based on cough type
    if (coughDetected) {
      String severity = (coughType == COUGH_INFECTIOUS) ? "HIGH" : "LOW";
      String coughLabel = (coughType == COUGH_INFECTIOUS)
        ? "INFECTIOUS_COUGH"
        : "NON_INFECTIOUS_COUGH";
      String msg = (coughType == COUGH_INFECTIOUS)
        ? "Infectious cough signature detected (600Hz band dominant). Veterinary check advised."
        : "Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.";

      String alertPath = "/alerts";
      FirebaseJson alertJson;
      alertJson.set("deviceId", deviceId);
      alertJson.set("pig", currentPig);
      alertJson.set("type", coughLabel);
      alertJson.set("severity", severity);
      alertJson.set("message", msg);
      alertJson.set("timestamp/.sv", "timestamp");
      Firebase.RTDB.pushJSON(&fbdo, alertPath.c_str(), &alertJson);
    }

    // C. Serial data collection trigger
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'c') identify.printDataForCollection(thermal.frame);
    }
  }
}
