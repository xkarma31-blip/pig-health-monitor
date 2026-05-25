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
#include <mbedtls/base64.h>

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
  int timeout = 20;
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    Serial.print(".");
    delay(1000);
    timeout--;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
  } else {
    Serial.println("\nWiFi Timed Out — continuing in offline mode.");
  }
}

void setupFirebase() {
  // Sync time via NTP for valid SSL certificates and Firebase tokens
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;
  auth.user.email = FIREBASE_USER_EMAIL;
  auth.user.password = FIREBASE_USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback; 
  
  // Optimize SSL buffers for handling the 1.5KB base64 thermal payloads
  fbdo.setBSSLBufferSize(4096, 1024);
  fbdo.setResponseSize(4096);
  
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
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

// --- RTOS Task Handles ---
TaskHandle_t AudioTaskHandle;
TaskHandle_t ThermalTaskHandle;

// ── TASK 1: AUDIO PERCEPTION (Pinned to Core 0 - High Priority) ───────────
void AudioTask(void *pvParameters) {
  int16_t* stereoBuffer = (int16_t*)heap_caps_malloc(SAMPLES * 2 * sizeof(int16_t), MALLOC_CAP_8BIT);
  if (!stereoBuffer) {
    Serial.println("FATAL: Audio heap allocation failed — restarting.");
    esp_restart();
  }
  size_t bytesRead = 0;

  for (;;) {
    // 1. Read Stereo Audio Data
    i2s_read(I2S_PORT, &stereoBuffer, sizeof(stereoBuffer), &bytesRead, portMAX_DELAY);

    // 2. Perform Spectral Subtraction & Classification
    CoughType coughType = acoustic.classifyCough(stereoBuffer, bytesRead / 2); // div 2 because int16_t is 2 bytes

    // 3. Trigger Alert if Infectious or Non-Infectious (Send via RTDB)
    if (coughType != COUGH_NONE && Firebase.ready()) {
      String severity = (coughType == COUGH_INFECTIOUS) ? "HIGH" : "LOW";
      String coughLabel = (coughType == COUGH_INFECTIOUS) ? "INFECTIOUS_COUGH" : "NON_INFECTIOUS_COUGH";
      String msg = (coughType == COUGH_INFECTIOUS)
        ? "Infectious cough signature detected (600Hz band dominant). Veterinary check advised."
        : "Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.";

      String alertPath = String("/users/") + FARM_USER_UID + "/alerts";
      FirebaseJson alertJson;
      alertJson.set("deviceId", deviceId);
      alertJson.set("type", coughLabel);
      alertJson.set("severity", severity);
      alertJson.set("message", msg);
      alertJson.set("timestamp/.sv", "timestamp");
      Firebase.RTDB.pushJSON(&fbdo, alertPath.c_str(), &alertJson);
    }
    
    // Yield to FreeRTOS scheduler
    vTaskDelay(pdMS_TO_TICKS(10)); 
  }
}

// ── TASK 2: THERMAL PERCEPTION & TELEMETRY (Pinned to Core 1) ───────────
void ThermalTask(void *pvParameters) {
  String currentPig = "SCANNING...";

  for (;;) {
    // 1. Thermal Read (Slow I2C block)
    // ThermalCamera.h MUST provide thermal.readFrame() to refresh frame data
    thermal.readFrame();
    
    if (Firebase.ready()) {
      // 2. Command & Identification Ritual (Zero-Shot)
      String commandPath = String("/users/") + FARM_USER_UID + "/commands/esp32-s3-01";
      if (Firebase.RTDB.getJSON(&fbdo, commandPath.c_str())) {
        FirebaseJson &json = fbdo.jsonObject();
        FirebaseJsonData cmdData;
        json.get(cmdData, "command");
        if (cmdData.success && cmdData.stringValue == "ENROLL_START") {
          FirebaseJsonData nameData;
          String pigName = "Pig_Auto";
          json.get(nameData, "pigName");
          if (nameData.success) {
            pigName = nameData.stringValue;
          }
          if (!identify.saveEnrollment(pigName, thermal.frame)) {
            // Alert if storage is full
            FirebaseJson alertJson;
            alertJson.set("deviceId", deviceId);
            alertJson.set("type", "STORAGE_FULL");
            alertJson.set("severity", "WARNING");
            alertJson.set("message", "Pig roster limit reached (50).");
            alertJson.set("timestamp/.sv", "timestamp");
            String alertPath = String("/users/") + FARM_USER_UID + "/alerts";
            Firebase.RTDB.pushJSON(&fbdo, alertPath.c_str(), &alertJson);
          }
          Firebase.RTDB.deleteNode(&fbdo, commandPath.c_str());
        }
      }

      // Continuous Identification (Cosine Similarity / Embeddings)
      float bestScore = 0;
      currentPig = identify.identifyPig(thermal.frame, bestScore);
      if (currentPig == "UNKNOWN" && bestScore > 0.85) {
        Serial.printf("🔍 Near Match: %.2f (try re-enrolling this pig)\n", bestScore);
      }

      // 3. Telemetry and Alerting (every 5s)
      if (millis() - sendDataPrevMillis > 5000 || sendDataPrevMillis == 0) {
        sendDataPrevMillis = millis();

        float currentTemp = thermal.getMaxTemp();
        String healthStatus = "NORMAL";
        if (currentTemp > 39.5) healthStatus = "WARNING";

        int targetX = 0, targetY = 0;
        float maxT = 0;
        for (int y = 0; y < 24; y++) {
          for (int x = 0; x < 32; x++) {
            float t = thermal.frame[y * 32 + x];
            if (t > maxT) { maxT = t; targetX = x; targetY = y; }
          }
        }

        uint8_t byteFrame[768];
        for(int i = 0; i < 768; i++) {
          float t = thermal.frame[i];
          if(t < 20.0f) t = 20.0f;
          if(t > 40.0f) t = 40.0f;
          byteFrame[i] = (uint8_t)((t - 20.0f) * 12.75f);
        }

        unsigned char base64Str[1500]; 
        size_t olen = 0;
        mbedtls_base64_encode(base64Str, sizeof(base64Str), &olen, byteFrame, 768);
        base64Str[olen] = '\0'; 
        String b64Frame = String((char*)base64Str);

        String telePath = String("/users/") + FARM_USER_UID + "/telemetry/" + deviceId;
        FirebaseJson teleJson;
        teleJson.set("temperature", currentTemp);
        teleJson.set("status", healthStatus);
        teleJson.set("identifiedPig", currentPig);
        teleJson.set("targetX", targetX);
        teleJson.set("targetY", targetY);
        teleJson.set("thermalFrame", b64Frame);
        teleJson.set("timestamp/.sv", "timestamp");
        Firebase.RTDB.setJSON(&fbdo, telePath.c_str(), &teleJson);
      }
    }
    
    // Yield to FreeRTOS scheduler to prevent Watchdog Reset
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Wire.begin(); // Initialize I2C for MLX90640 (Pin 21 SDA, 22 SCL typically)
  Wire.setClock(1000000); // 1MHz Fast Mode Plus required for 768 pixels at 8Hz+
  delay(1000);
  
  Serial.println("🐷 Pig Health Monitor: Initializing Intelligence...");
  
  setupWiFi();
  setupFirebase();
  setupI2S();
  thermal.begin();
  
  // Launch RTOS Tasks
  xTaskCreatePinnedToCore(AudioTask, "AudioTask", 8192, NULL, 2, &AudioTaskHandle, 0); // Core 0
  xTaskCreatePinnedToCore(ThermalTask, "ThermalTask", 16384, NULL, 1, &ThermalTaskHandle, 1); // Core 1

  Serial.println("🐷 Pig Health Monitor: Operational. Dual-Core Ritual Active.");
}

void loop() {
  // Empty. RTOS Tasks handle execution.
  vTaskDelay(portMAX_DELAY);
}
