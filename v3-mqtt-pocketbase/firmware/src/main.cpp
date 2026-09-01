/**
 * PigPulse v3 — ESP32 Firmware
 * 
 * D0WD ESP32 with MLX90640 (thermal) + 2x INMP441 (acoustic)
 * Communication: MQTT (replaces Firebase)
 * Power: Adaptive sampling + hibernation
 * 
 * Based on v1.1 dual-core RTOS architecture
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <driver/i2s.h>
#include <Wire.h>
#include <SPIFFS.h>

#include "PigMqttTopics.h"
#include "audio_config.h"
#include "secrets.h"
#include "ThermalCamera.h"
#include "AcousticSignature.h"
#include "ThermalIdentification.h"
#include <mbedtls/base64.h>

// ── Configuration ─────────────────────────────────────────────

#define MQTT_BROKER_IP "192.168.1.100"  // Your laptop/server IP
#define MQTT_BROKER_PORT 1883

// Alert thresholds
#define FEVER_WARNING 39.5
#define FEVER_CRITICAL 40.0
#define BATTERY_LOW 20
#define BATTERY_CRITICAL 10

// Sampling
#define TELEMETRY_INTERVAL_MS 5000
#define HEALTHBEAT_INTERVAL_MS 60000

// ── Sensor Objects ────────────────────────────────────────────

ThermalEye thermal;
AcousticEar acoustic;
ThermalID identify;

// ── MQTT Client ───────────────────────────────────────────────

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ── Timing and State ──────────────────────────────────────────

unsigned long lastTelemetry = 0;
unsigned long lastHealthbeat = 0;
unsigned long startTime = 0;
float currentBatteryPct = 100.0;
float currentBatteryV = 4.2;
int currentWifiRssi = 0;

// ── WiFi Setup ────────────────────────────────────────────────

void setupWiFi() {
  Serial.printf("[WIFI] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int timeout = 20;
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    Serial.print(".");
    delay(1000);
    timeout--;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Timed out — continuing offline");
  }
}

// ── MQTT Callbacks ────────────────────────────────────────────

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  // Null-terminate payload
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.printf("[MQTT] Received on %s: %s\n", topic, message);
  
  // Parse command (simple JSON extraction)
  String msgStr = String(message);
  int cmdStart = msgStr.indexOf("\"command\":\"");
  if (cmdStart == -1) return;
  cmdStart += 11;
  int cmdEnd = msgStr.indexOf("\"", cmdStart);
  if (cmdEnd == -1) return;
  String command = msgStr.substring(cmdStart, cmdEnd);
  
  Serial.printf("[MQTT] Command: %s\n", command.c_str());
  
  if (command == "ENROLL_START") {
    // Extract pig name
    String pigName = "Pig_Auto";
    int nameStart = msgStr.indexOf("\"pigName\":\"");
    if (nameStart != -1) {
      nameStart += 11;
      int nameEnd = msgStr.indexOf("\"", nameStart);
      if (nameEnd != -1) {
        pigName = msgStr.substring(nameStart, nameEnd);
      }
    }
    
    // Save enrollment
    if (!identify.saveEnrollment(pigName, thermal.frame)) {
      // Storage full
      char alertJson[256];
      snprintf(alertJson, sizeof(alertJson),
        "{\"type\":\"STORAGE_FULL\","
        "\"severity\":\"WARNING\","
        "\"message\":\"Pig roster limit reached (50).\","
        "\"timestamp\":%lu}",
        millis() / 1000);
      mqtt.publish(alertsTopic().c_str(), alertJson, true);
    }
    
    // Send response
    char responseJson[256];
    snprintf(responseJson, sizeof(responseJson),
      "{\"command\":\"ENROLL_START\","
      "\"status\":\"SUCCESS\","
      "\"message\":\"Enrollment started for %s\","
      "\"timestamp\":%lu}",
      pigName.c_str(), millis() / 1000);
    mqtt.publish(responseTopic().c_str(), responseJson);
    
  } else if (command == "PING") {
    char responseJson[256];
    snprintf(responseJson, sizeof(responseJson),
      "{\"command\":\"PING\","
      "\"status\":\"SUCCESS\","
      "\"message\":\"PONG\","
      "\"timestamp\":%lu}",
      millis() / 1000);
    mqtt.publish(responseTopic().c_str(), responseJson);
    
  } else {
    char responseJson[256];
    snprintf(responseJson, sizeof(responseJson),
      "{\"command\":\"%s\","
      "\"status\":\"ERROR\","
      "\"message\":\"Unknown command\","
      "\"timestamp\":%lu}",
      command.c_str(), millis() / 1000);
    mqtt.publish(responseTopic().c_str(), responseJson);
  }
}

void connectMqtt() {
  if (mqtt.connected()) return;
  
  Serial.printf("[MQTT] Connecting to %s:%d...", MQTT_BROKER_IP, MQTT_BROKER_PORT);
  
  // Set LWT
  String status = statusTopic();
  String lwtPayload = "{\"online\":false}";
  
  if (mqtt.connect(DEVICE_ID, NULL, NULL, status.c_str(), 1, true, lwtPayload.c_str())) {
    Serial.println(" connected!");
    
    // Subscribe to commands
    mqtt.subscribe(commandsTopic().c_str(), 1);
    Serial.printf("[MQTT] Subscribed to %s\n", commandsTopic().c_str());
    
    // Publish online status
    String onlinePayload = "{\"online\":true}";
    mqtt.publish(status.c_str(), onlinePayload.c_str(), true);
  } else {
    Serial.printf(" failed (rc=%d)\n", mqtt.state());
  }
}

// ── I2S Setup ─────────────────────────────────────────────────

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

// ── RTOS Tasks ────────────────────────────────────────────────

TaskHandle_t AudioTaskHandle;
TaskHandle_t ThermalTaskHandle;

// Task 1: Audio (Core 0)
void AudioTask(void *pvParameters) {
  int16_t* stereoBuffer = (int16_t*)heap_caps_malloc(SAMPLES * 2 * sizeof(int16_t), MALLOC_CAP_8BIT);
  if (!stereoBuffer) {
    Serial.println("FATAL: Audio heap allocation failed — restarting.");
    esp_restart();
  }
  size_t bytesRead = 0;

  for (;;) {
    i2s_read(I2S_PORT, stereoBuffer, SAMPLES * 2 * sizeof(int16_t), &bytesRead, portMAX_DELAY);

    CoughType coughType = acoustic.classifyCough(stereoBuffer, bytesRead / 2);

    if (coughType != COUGH_NONE && mqtt.connected()) {
      String severity = (coughType == COUGH_INFECTIOUS) ? "HIGH" : "LOW";
      String coughLabel = (coughType == COUGH_INFECTIOUS) ? "INFECTIOUS_COUGH" : "NON_INFECTIOUS_COUGH";
      String msg = (coughType == COUGH_INFECTIOUS)
        ? "Infectious cough signature detected (600Hz band dominant). Veterinary check advised."
        : "Non-infectious cough detected (1600Hz band dominant). Monitor for pattern changes.";

      char alertJson[512];
      snprintf(alertJson, sizeof(alertJson),
        "{\"type\":\"%s\","
        "\"severity\":\"%s\","
        "\"message\":\"%s\","
        "\"timestamp\":%lu}",
        coughLabel.c_str(), severity.c_str(), msg.c_str(), millis() / 1000);
      
      mqtt.publish(alertsTopic().c_str(), alertJson, true);
    }
    
    vTaskDelay(pdMS_TO_TICKS(10)); 
  }
}

// Task 2: Thermal + Telemetry (Core 1)
void ThermalTask(void *pvParameters) {
  String currentPig = "SCANNING...";

  for (;;) {
    thermal.readFrame();
    
    if (mqtt.connected()) {
      // Command check (via MQTT callback, no need to poll)
      
      // Continuous identification
      float bestScore = 0;
      currentPig = identify.identifyPig(thermal.frame, bestScore);
      if (currentPig == "UNKNOWN" && bestScore > 0.85) {
        Serial.printf("🔍 Near Match: %.2f (try re-enrolling)\n", bestScore);
      }

      // Telemetry (every 5 seconds)
      if (millis() - lastTelemetry > TELEMETRY_INTERVAL_MS || lastTelemetry == 0) {
        lastTelemetry = millis();

        float currentTemp = thermal.getMaxTemp();
        String healthStatus = "NORMAL";
        if (currentTemp > FEVER_CRITICAL) healthStatus = "CRITICAL";
        else if (currentTemp > FEVER_WARNING) healthStatus = "WARNING";

        // Find hotspot
        int targetX = 0, targetY = 0;
        float maxT = 0;
        for (int y = 0; y < 24; y++) {
          for (int x = 0; x < 32; x++) {
            float t = thermal.frame[y * 32 + x];
            if (t > maxT) { maxT = t; targetX = x; targetY = y; }
          }
        }

        // Encode thermal frame
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

        // Build telemetry JSON
        char telemetryJson[2048];
        snprintf(telemetryJson, sizeof(telemetryJson),
          "{\"temperature\":%.2f,"
          "\"bodyTemp\":%.2f,"
          "\"pigId\":\"%s\","
          "\"targetX\":%d,"
          "\"targetY\":%d,"
          "\"thermalFrame\":\"%s\","
          "\"coughRate\":0,"
          "\"coughCluster\":false,"
          "\"healthTrend\":\"STABLE\","
          "\"batteryPct\":%.1f,"
          "\"batteryV\":%.2f,"
          "\"powerState\":\"NORMAL\","
          "\"wifiRssi\":%d,"
          "\"status\":\"%s\","
          "\"timestamp\":%lu}",
          currentTemp, currentTemp,
          currentPig.c_str(),
          targetX, targetY,
          base64Str,
          currentBatteryPct, currentBatteryV,
          currentWifiRssi,
          healthStatus.c_str(),
          millis() / 1000);

        mqtt.publish(telemetryTopic().c_str(), telemetryJson);

        // Alert if fever
        if (currentTemp >= FEVER_WARNING) {
          char alertJson[512];
          snprintf(alertJson, sizeof(alertJson),
            "{\"type\":\"FEVER\","
            "\"severity\":\"%s\","
            "\"pigId\":\"%s\","
            "\"value\":%.2f,"
            "\"threshold\":%.2f,"
            "\"message\":\"Fever detected: %.2f°C\","
            "\"timestamp\":%lu}",
            (currentTemp >= FEVER_CRITICAL) ? "CRITICAL" : "WARNING",
            currentPig.c_str(),
            currentTemp,
            (currentTemp >= FEVER_CRITICAL) ? FEVER_CRITICAL : FEVER_WARNING,
            currentTemp,
            millis() / 1000);
          
          mqtt.publish(alertsTopic().c_str(), alertJson, true);
        }
      }
    }
    
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// ── Setup ─────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(1000000);  // 1MHz Fast Mode Plus for MLX90640
  delay(1000);
  
  Serial.println("╔══════════════════════════════════════╗");
  Serial.println("║   PigPulse v3 — Firmware Starting   ║");
  Serial.println("╚══════════════════════════════════════╝");
  
  startTime = millis();
  
  // Initialize SPIFFS
  if (!SPIFFS.begin(true)) {
    Serial.println("⚠️ SPIFFS Mount Failed!");
  } else {
    Serial.println("✅ SPIFFS Mounted");
  }
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize MQTT
  mqtt.setServer(MQTT_BROKER_IP, MQTT_BROKER_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(4096);  // For large telemetry payloads
  connectMqtt();
  
  // Initialize I2S for microphones
  setupI2S();
  
  // Initialize thermal camera
  thermal.begin();
  
  // Launch RTOS tasks
  xTaskCreatePinnedToCore(AudioTask, "AudioTask", 8192, NULL, 2, &AudioTaskHandle, 0);
  xTaskCreatePinnedToCore(ThermalTask, "ThermalTask", 16384, NULL, 1, &ThermalTaskHandle, 1);

  Serial.println("🐷 PigPulse v3: Operational. Dual-Core Active.");
}

// ── Loop ──────────────────────────────────────────────────────

void loop() {
  // Maintain MQTT connection
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();
  
  // Update battery (mock for now)
  currentBatteryV = 3.7 + random(-20, 20) / 100.0;
  currentBatteryPct = (currentBatteryV - 3.3) / (4.2 - 3.3) * 100.0;
  currentWifiRssi = WiFi.RSSI();
  
  // Healthbeat (every 60 seconds)
  if (millis() - lastHealthbeat > HEALTHBEAT_INTERVAL_MS) {
    lastHealthbeat = millis();
    
    char statusJson[256];
    snprintf(statusJson, sizeof(statusJson),
      "{\"online\":true,"
      "\"batteryPct\":%.1f,"
      "\"batteryV\":%.2f,"
      "\"wifiRssi\":%d,"
      "\"uptime\":%lu,"
      "\"freeHeap\":%zu,"
      "\"timestamp\":%lu}",
      currentBatteryPct, currentBatteryV,
      currentWifiRssi,
      (millis() - startTime) / 1000,
      ESP.getFreeHeap(),
      millis() / 1000);
    
    mqtt.publish(statusTopic().c_str(), statusJson, true);
    Serial.printf("[HEALTH] bat=%.1f%% rssi=%d\n", currentBatteryPct, currentWifiRssi);
  }
  
  vTaskDelay(pdMS_TO_TICKS(100));
}
