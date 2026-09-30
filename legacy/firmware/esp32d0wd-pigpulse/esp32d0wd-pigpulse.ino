/**
 * PigPulse v2.0 - Main Firmware
 * ESP32-D0WD pig fever screening + TinyML cough detection for tropical open-air pens.
 *
 * Two operating modes:
 *   FIELD MODE  (default): wake -> sample -> ESP-NOW -> deep sleep (5 min).
 *   CONFIG MODE (hold BOOT/GPIO0 low at wake): stay awake, live thermal +
 *               dashboard on WiFi AP (PigPulse-Config), sleep after
 *               CONFIG_MODE_TIMEOUT_MS or on power loss.
 *
 * v2.0 additions:
 *   - TinyML cough classifier (TFLite Micro mock) with MFCC feature extraction
 *   - MQTT publishing to "pig/telemetry/cough" topic
 *   - I2S DMA audio capture for 1-second inference windows
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "config.h"
#include "types.h"
#include "sensors.h"
#include "wifi.h"
#include "web.h"
#include "power.h"

// TinyML cough detector
#if COUGH_DETECTOR_ENABLED
#include "src/cough_detector.h"
#endif

// ============================================================
// STATE
// ============================================================
static SensorReading lastReading;
static bool configMode = false;
static uint32_t configStartMs = 0;
static bool g_micDriverFail = false;
static uint32_t lastLiveSampleMs = 0;
static uint32_t lastLedMs = 0;
static bool ledOn = false;

// MQTT client
#if MQTT_ENABLED
static WiFiClient wifiClient;
static PubSubClient mqttClient(wifiClient);
static uint32_t lastMqttReconnectAttempt = 0;
#endif

// TinyML inference state
#if COUGH_DETECTOR_ENABLED
static int16_t coughAudioBuffer[COUGH_FRAME_SAMPLES];
static int coughAudioIdx = 0;
static uint32_t lastCoughInferenceMs = 0;
static cough_result_t lastCoughResult;
#endif

// ============================================================
// MQTT HELPERS
// ============================================================
#if MQTT_ENABLED
static bool mqtt_connect() {
    if (mqttClient.connected()) return true;
    uint32_t now = millis();
    if (now - lastMqttReconnectAttempt < 5000) return false;
    lastMqttReconnectAttempt = now;

    mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    DEBUG_PRINTF("[MQTT] Connecting to %s:%d...\n", MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
        DEBUG_PRINTLN("[MQTT] Connected");
        // Subscribe to command topic
        mqttClient.subscribe(MQTT_TOPIC_CMD);
        return true;
    }
    DEBUG_PRINTF("[MQTT] Failed rc=%d\n", mqttClient.state());
    return false;
}

static void mqtt_publishCough(const cough_result_t *result) {
    if (!mqttClient.connected() && !mqtt_connect()) return;
    // JSON payload: {"class":"productive_cough","confidence":0.87,"ts":12345}
    char payload[128];
    snprintf(payload, sizeof(payload),
             "{\"class\":\"%s\",\"confidence\":%.2f,\"ts\":%u}",
             result->class_name, result->confidence, (unsigned)millis());
    mqttClient.publish(MQTT_TOPIC_COWH, payload, false);
    DEBUG_PRINTF("[MQTT] %s -> %s\n", MQTT_TOPIC_COWH, payload);
}

static void mqtt_publishTelemetry(const SensorReading *r) {
    if (!mqttClient.connected() && !mqtt_connect()) return;
    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"device\":\"%s\",\"temp\":%.2f,\"amb\":%.2f,\"rms\":%.3f,"
             "\"cough\":%u,\"batt\":%.2f,\"alerts\":%u}",
             DEVICE_ID, r->center_temp, r->ambient_temp, r->audio_rms,
             r->cough_count, r->battery_voltage, r->alert_flags);
    mqttClient.publish(MQTT_TOPIC_THERMAL, payload, false);
}
#endif

// ============================================================
// ALERT EVALUATION
// ============================================================
static uint8_t evaluateAlerts(const SensorReading *r) {
    uint8_t f = 0;
    if (r->center_temp >= PIG_TEMP_FEVER) f |= ALERT_FEVER;
    if (r->center_temp >= PIG_TEMP_HYPERTHERMIA) f |= ALERT_HYPERTHERMIA;
    if (r->battery_voltage <= BATTERY_LOW_VOLTAGE) f |= ALERT_LOW_BATTERY;
    if (r->battery_voltage <= BATTERY_CRITICAL_VOLTAGE) f |= ALERT_CRITICAL_BATTERY;
    if (r->cough_count > 0) f |= ALERT_COUGH_DETECTED;
    if (r->audio_rms > 0.1f &&
        r->distress_freq >= DISTRESS_FREQ_LOW &&
        r->distress_freq <= DISTRESS_FREQ_HIGH)
        f |= ALERT_DISTRESS_VOCAL;
    return f;
}

// ============================================================
// TINYML COUGH INFERENCE
// ============================================================
#if COUGH_DETECTOR_ENABLED
static void cough_detector_feedSamples(const int16_t *monoSamples, int n) {
    // Accumulate mono samples into the 1-second buffer
    for (int i = 0; i < n; i++) {
        coughAudioBuffer[coughAudioIdx++] = monoSamples[i];
        if (coughAudioIdx >= COUGH_FRAME_SAMPLES) {
            // Buffer full - run inference
            uint32_t t0 = millis();
            lastCoughResult = cough_detector_infer(coughAudioBuffer);
            uint32_t elapsed = millis() - t0;
            DEBUG_PRINTF("[CoughML] %s (%.2f) in %ums\n",
                         lastCoughResult.class_name,
                         lastCoughResult.confidence,
                         (unsigned)elapsed);
#if MQTT_ENABLED && COUGH_ML_MQTT_PUBLISH
            mqtt_publishCough(&lastCoughResult);
#endif
            coughAudioIdx = 0; // reset for next window
        }
    }
}
#endif

// ============================================================
// FIELD SAMPLING (single pass, then sleep)
// ============================================================
static void sample_fieldReading() {
    uint32_t t0 = millis();
    DEBUG_PRINTLN("\n[Main] --- Field sampling ---");
    memset(&lastReading, 0, sizeof(lastReading));

    sensors_powerUp();

    bool mlxOk = mlx90640_init();
    bool micOk = inmp441_init();
    uint8_t failFlags = 0;
    if (!mlxOk) { failFlags |= ALERT_SENSOR_FAIL; DEBUG_PRINTLN("[Main] MLX fail"); }
    if (!micOk) { failFlags |= ALERT_AUDIO_FAIL; DEBUG_PRINTLN("[Main] Mic fail"); }

    // --- Thermal: frame averaging ---
    float img[32 * 24];
    float cC = 0, cMx = -1000, cMn = 1000, cAvg = 0, cAmbSum = 0;
    uint16_t cX = 0, cY = 0;
    int good = 0;
    for (int i = 0; i < FRAME_AVERAGE_COUNT; i++) {
        float amb, c, mx, mn, avg;
        uint16_t x, y;
        if (mlxOk && mlx90640_readFrame(img, &amb, &c, &mx, &mn, &avg, &x, &y)) {
            c = ambient_compensate(c, amb);
            cC += c;
            if (good == 0 || mx > cMx) cMx = mx;
            if (good == 0 || mn < cMn) cMn = mn;
            cAvg += avg; cAmbSum += amb;
            cX = x; cY = y;
            good++;
        }
        delay(250);
    }
    if (good > 0) {
        lastReading.center_temp = cC / good;
        lastReading.max_temp = cMx;
        lastReading.min_temp = cMn;
        lastReading.avg_temp = cAvg / good;
        lastReading.ambient_temp = cAmbSum / good;
        sensors_cacheThermal(lastReading.center_temp, lastReading.max_temp,
                             lastReading.min_temp, lastReading.avg_temp,
                             lastReading.ambient_temp, cX, cY);
    }

    // --- Audio: 5 s feature window ---
    sensors_resetCoughCount();
    uint32_t a0 = millis();
    while ((uint32_t)(millis() - a0) < (uint32_t)AUDIO_SAMPLE_SECONDS * 1000UL) {
        inmp441_read();
#if COUGH_DETECTOR_ENABLED
        // Feed mono samples to TinyML pipeline
        {
            int16_t mono[512];
            int n = audio_readMono(mono, 512);
            if (n > 0) cough_detector_feedSamples(mono, n);
        }
#endif
        delay(5);
    }

    sensors_getReading(&lastReading);
    lastReading.alert_flags |= failFlags;
    lastReading.alert_flags |= evaluateAlerts(&lastReading);

    power_setLastAlertFlags(lastReading.alert_flags);
    power_setLastCenterTemp(lastReading.center_temp);
    history_push(&lastReading);

    DEBUG_PRINTF("[Main] Body=%.2fC Max=%.2fC Amb=%.2fC RMS=%.3f cough=%u "
                 "batt=%.2fV alerts=0x%02X (%ums)\n",
                 lastReading.center_temp, lastReading.max_temp,
                 lastReading.ambient_temp, lastReading.audio_rms,
                 lastReading.cough_count, lastReading.battery_voltage,
                 lastReading.alert_flags, (unsigned)(millis() - t0));
}

// ============================================================
// TELEMETRY
// ============================================================
static void send_telemetry() {
    TelemetryPacket p;
    memset(&p, 0, sizeof(p));
    strncpy(p.device_id, DEVICE_ID, sizeof(p.device_id) - 1);
    p.timestamp = millis();
    p.center_temp = lastReading.center_temp;
    p.max_temp = lastReading.max_temp;
    p.ambient_temp = lastReading.ambient_temp;
    p.audio_rms = lastReading.audio_rms;
    p.cough_count = lastReading.cough_count;
    p.battery_voltage = lastReading.battery_voltage;
    p.alert_flags = lastReading.alert_flags;
    p.battery_percent = lastReading.battery_percent;
    if (espnow_sendTelemetry(&p)) DEBUG_PRINTLN("[Main] Telemetry ACK");
    else DEBUG_PRINTLN("[Main] Telemetry no-ack (check gateway MAC)");

#if MQTT_ENABLED
    mqtt_publishTelemetry(&lastReading);
#endif
}

// ============================================================
// SETUP / LOOP
// ============================================================

void setup() {
    DEBUG_SERIAL.begin(DEBUG_BAUD);
    delay(300);
    DEBUG_PRINTLN("\n========================================");
    DEBUG_PRINTF("  PigPulse %s  %s\n", FIRMWARE_VERSION, DEVICE_ID);
    DEBUG_PRINTLN("========================================");

    pinMode(LED_STATUS, OUTPUT);
    digitalWrite(LED_STATUS, HIGH);
    pinMode(CONFIG_HOLD_PIN, INPUT_PULLUP);

    power_wakeFromSleep();

    // BOOT held at wake -> config mode
    configMode = (digitalRead(CONFIG_HOLD_PIN) == LOW);
    configStartMs = millis();

    float vBatt = battery_readVoltage();
    DEBUG_PRINTF("[Main] Battery %.2fV\n", vBatt);
    if (!battery_isPresent()) {
        configMode = true;
        DEBUG_PRINTLN("[Main] No divider -> BENCH config mode");
    } else if (vBatt <= BATTERY_CRITICAL_VOLTAGE && !configMode) {
        DEBUG_PRINTLN("[Main] CRITICAL battery, emergency sleep");
        delay(500);
        power_enterDeepSleep();
    }

    wifi_init(configMode);
    webserver_init();
    espnow_init();

    // Initialize TinyML cough detector
#if COUGH_DETECTOR_ENABLED
    if (cough_detector_init()) {
        DEBUG_PRINTLN("[Main] Cough detector ready");
    } else {
        DEBUG_PRINTLN("[Main] Cough detector init FAILED");
    }
#endif

    // Initialize MQTT
#if MQTT_ENABLED
    if (wifi_staConnected()) {
        mqtt_connect();
    }
#endif

    if (!configMode) {
        // FIELD: one reading, transmit, sleep.
        sample_fieldReading();
        send_telemetry();
        delay(500);
        power_enterDeepSleep();
    }

    // CONFIG: live sensors for the dashboard.
    sensors_powerUp();
    i2c_scanDiag();
    if (!mlx90640_init()) lastReading.alert_flags |= ALERT_SENSOR_FAIL;
    if (!inmp441_init()) { lastReading.alert_flags |= ALERT_AUDIO_FAIL; g_micDriverFail = true; }
    {
        uint32_t p0 = millis();
        while ((uint32_t)(millis() - p0) < 1500) { inmp441_read(); delay(20); }
        float pl = 0, pr = 0;
        bool dl = true, dr = true;
        audio_slotRMS(&pl, &pr);
        audio_slotStuck(&dl, &dr);
        DEBUG_PRINTF("[Audio] Probe: L(pig)=%s %.3f | R(ref)=%s %.3f\n",
                     dl ? "DEAD" : "LIVE", pl, dr ? "DEAD" : "LIVE", pr);
    }
    DEBUG_PRINTLN("[Main] CONFIG MODE - dashboard live, sleep on timeout");
    DEBUG_PRINTF("[Main] Connect to %s, open http://%s\n",
                 WIFI_AP_SSID, WiFi.softAPIP().toString().c_str());
}

void loop() {
    if (!configMode) {
        delay(1000);
        power_enterDeepSleep();
        return;
    }

    // --- Config mode: millis()-scheduled, non-blocking ---
    webserver_handle();
    wifi_runPendingPortal();

    uint32_t now = millis();

    // MQTT loop
#if MQTT_ENABLED
    if (wifi_staConnected()) {
        if (!mqttClient.connected()) mqtt_connect();
        mqttClient.loop();
    }
#endif

    // Live thermal frame every ~500 ms
    if ((uint32_t)(now - lastLiveSampleMs) >= 500) {
        lastLiveSampleMs = now;
        if (!mlx_isReady()) {
            static uint32_t lastRetryMs = 0;
            if ((uint32_t)(now - lastRetryMs) >= 10000) {
                lastRetryMs = now;
                if (mlx90640_init()) {
                    lastReading.alert_flags &= ~ALERT_SENSOR_FAIL;
                    DEBUG_PRINTLN("[Main] MLX retry: now ready");
                }
            }
        }
        float img[32 * 24];
        float amb, c, mx, mn, avg;
        uint16_t x, y;
        if (mlx90640_readFrame(img, &amb, &c, &mx, &mn, &avg, &x, &y)) {
            c = ambient_compensate(c, amb);
            sensors_cacheThermal(c, mx, mn, avg, amb, x, y);
        }
        inmp441_read();

        // Feed audio to TinyML pipeline
#if COUGH_DETECTOR_ENABLED
        {
            int16_t mono[512];
            int n = audio_readMono(mono, 512);
            if (n > 0) cough_detector_feedSamples(mono, n);
        }
#endif

        sensors_getReading(&lastReading);
        uint8_t f = 0;
        if (!mlx_isReady()) f |= ALERT_SENSOR_FAIL;
        if (g_micDriverFail) f |= ALERT_AUDIO_FAIL;
        uint8_t e = evaluateAlerts(&lastReading) & ~ALERT_COUGH_DETECTED;
        uint32_t lastTrip = sensors_lastCoughMs();
        if (lastTrip != 0 && (uint32_t)(now - lastTrip) < 60000) e |= ALERT_COUGH_DETECTED;
        lastReading.alert_flags = f | e;
        web_setLiveFlags(lastReading.alert_flags);
    }

    // Status LED heartbeat
    if ((uint32_t)(now - lastLedMs) >= 500) {
        lastLedMs = now;
        ledOn = !ledOn;
        digitalWrite(LED_STATUS, ledOn ? HIGH : LOW);
    }

    // Config timeout -> field sleep cycle resumes
    if ((uint32_t)(now - configStartMs) >= CONFIG_MODE_TIMEOUT_MS) {
        DEBUG_PRINTLN("[Main] Config timeout, sleeping");
        delay(300);
        power_enterDeepSleep();
    }
}
