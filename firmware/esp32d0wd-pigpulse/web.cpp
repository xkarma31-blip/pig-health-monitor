/**
 * PigPulse v1.0 - Web Server
 * Pig-health dashboard + JSON endpoints + NVS history ring.
 */

#include "web.h"
#include "config.h"
#include "sensors.h"
#include "wifi.h"
#include "webpage.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>

// ============================================================
// STATE
// ============================================================
static WebServer server(WEB_SERVER_PORT);
static Preferences prefs;
static uint8_t liveFlags = 0;

void web_setLiveFlags(uint8_t flags) { liveFlags = flags; }

// ============================================================
// HISTORY RING (NVS blob: 24 x HistoryEntry + index byte)
// ============================================================

static void history_load(HistoryEntry *entries, uint8_t *idx) {
    size_t n = prefs.getBytes(NVS_KEY_HISTORY, entries,
                              sizeof(HistoryEntry) * MAX_ALERT_HISTORY);
    if (n != sizeof(HistoryEntry) * MAX_ALERT_HISTORY) {
        memset(entries, 0, sizeof(HistoryEntry) * MAX_ALERT_HISTORY);
        *idx = 0;
        return;
    }
    *idx = prefs.getUChar((String(NVS_KEY_HISTORY) + "_i").c_str(), 0)
           % MAX_ALERT_HISTORY;
}

void history_push(const SensorReading *reading) {
    if (reading == NULL) return;
    if (!prefs.begin(NVS_NAMESPACE, false)) return;
    HistoryEntry entries[MAX_ALERT_HISTORY];
    uint8_t idx = 0;
    history_load(entries, &idx);
    entries[idx].timestamp = reading->uptime_ms;
    entries[idx].center_temp = reading->center_temp;
    entries[idx].ambient_temp = reading->ambient_temp;
    entries[idx].alert_flags = reading->alert_flags;
    idx = (idx + 1) % MAX_ALERT_HISTORY;
    prefs.putBytes(NVS_KEY_HISTORY, entries, sizeof(entries));
    prefs.putUChar((String(NVS_KEY_HISTORY) + "_i").c_str(), idx);
    prefs.end();
}

// ============================================================
// HANDLERS
// ============================================================

static void handleRoot() {
    server.send_P(200, "text/html", WEBPAGE_HTML);
}

static void handleData() {
    SensorReading r;
    sensors_getReading(&r);
    float slotL = 0, slotR = 0;
    audio_slotRMS(&slotL, &slotR);
    bool deadL = true, deadR = true;
    audio_slotStuck(&deadL, &deadR);
    int stateL = 0, stateR = 0;
    audio_slotState(&stateL, &stateR);
    char json[768];
    snprintf(json, sizeof(json),
        "{\"device\":\"%s\",\"fw\":\"%s\",\"uptime\":%u,\"heap\":%u,"
        "\"center_temp\":%.2f,\"max_temp\":%.2f,\"min_temp\":%.2f,"
        "\"avg_temp\":%.2f,\"ambient_temp\":%.2f,\"max_x\":%u,\"max_y\":%u,"
        "\"audio_rms\":%.4f,\"cough\":%u,\"distress_freq\":%.1f,"
        "\"battery_v\":%.2f,\"battery_pct\":%u,\"alerts\":%u,\"wifi_rssi\":%d,"
        "\"sta_ip\":\"%s\",\"mlx_ok\":%s,\"frames\":%u,\"mlx_err\":\"%s\","
        "\"audio_stuck\":%s,\"frame_age_ms\":%u,\"rms_l\":%.4f,\"rms_r\":%.4f,"
        "\"dead_l\":%s,\"dead_r\":%s,\"l_state\":%d,\"r_state\":%d}",
        DEVICE_ID, FIRMWARE_VERSION, r.uptime_ms, r.free_heap,
        r.center_temp, r.max_temp, r.min_temp,
        r.avg_temp, r.ambient_temp, r.max_x, r.max_y,
        r.audio_rms, r.cough_count, r.distress_freq,
        r.battery_voltage, r.battery_percent, liveFlags,
        r.wifi_rssi, wifi_staIP().c_str(),
        mlx_isReady() ? "true" : "false",
        mlx_frameCount(), mlx_lastError(),
        audio_inputStuck() ? "true" : "false",
        mlx_lastFrameAgeMs(), slotL, slotR,
        deadL ? "true" : "false", deadR ? "true" : "false",
        stateL, stateR);
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", json);
}

// Full thermal frame for the dashboard canvas (adapted from reference /data).
static void handleThermal() {
    const float *img = NULL;
    uint16_t n = 0;
    if (!mlx90640_getLastFrame(&img, &n)) {
        server.send(200, "application/json",
                    "{\"ok\":false,\"error\":\"no frame yet\"}");
        return;
    }
    SensorReading r;
    sensors_getReading(&r);
    String json;
    json.reserve(8200);
    json += "{\"ok\":true,";
    json += "\"center\":" + String(r.center_temp, 2) + ",";
    json += "\"min\":" + String(r.min_temp, 2) + ",";
    json += "\"max\":" + String(r.max_temp, 2) + ",";
    json += "\"avg\":" + String(r.avg_temp, 2) + ",";
    json += "\"ambient\":" + String(r.ambient_temp, 2) + ",";
    json += "\"maxX\":" + String(r.max_x) + ",";
    json += "\"maxY\":" + String(r.max_y) + ",";
    json += "\"alerts\":" + String(liveFlags) + ",";
    json += "\"pixels\":[";
    for (uint16_t i = 0; i < n; i++) {
        if (i) json += ',';
        json += String(img[i], 1); // 1 decimal: ~4 KB, easier on 520 KB SRAM
    }
    json += "]}";
    server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    server.sendHeader("Pragma", "no-cache");
    server.send(200, "application/json", json);
}

static void handleHistory() {
    if (!prefs.begin(NVS_NAMESPACE, true)) {
        server.send(200, "application/json", "{\"history\":[]}");
        return;
    }
    HistoryEntry entries[MAX_ALERT_HISTORY];
    uint8_t idx = 0;
    history_load(entries, &idx);
    prefs.end();

    String json("{\"history\":[");
    bool first = true;
    // Oldest-first order starting at write index.
    for (uint8_t k = 0; k < MAX_ALERT_HISTORY; k++) {
        const HistoryEntry *e =
            &entries[(idx + k) % MAX_ALERT_HISTORY];
        if (e->timestamp == 0 && e->center_temp == 0) continue; // empty slot
        if (!first) json += ',';
        first = false;
        json += "{\"t\":" + String(e->timestamp) +
                ",\"c\":" + String(e->center_temp, 1) +
                ",\"a\":" + String(e->ambient_temp, 1) +
                ",\"f\":" + String(e->alert_flags) + "}";
    }
    json += "]}";
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", json);
}

static void handleCSV() {
    SensorReading r;
    sensors_getReading(&r);
    char csv[256];
    snprintf(csv, sizeof(csv),
        "uptime_ms,center,max,ambient,cough,batt_v,batt_pct,alerts\n"
        "%u,%.2f,%.2f,%.2f,%u,%.2f,%u,%u",
        r.uptime_ms, r.center_temp, r.max_temp,
        r.ambient_temp, r.cough_count, r.battery_voltage,
        r.battery_percent, liveFlags);
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("Content-Disposition",
                      "attachment; filename=pigpulse_reading.csv");
    server.send(200, "text/csv", csv);
}

static void handleWifiSetup() {
    wifi_requestPortal();
    server.send(200, "text/plain",
                "WiFi portal starting: join network PigPulse-Setup, "
                "pick your WiFi, then reconnect here.");
}

static void handleHealth() {
    SensorReading r;
    sensors_getReading(&r);
    String h("PigPulse ");
    h += FIRMWARE_VERSION;
    h += " ";
    h += DEVICE_ID;
    h += "\nUptime ms: " + String(r.uptime_ms);
    h += "\nFree heap: " + String(r.free_heap);
    h += "\nCenter C: " + String(r.center_temp, 2);
    h += "\nAmbient C: " + String(r.ambient_temp, 2);
    h += "\nBattery V: " + String(r.battery_voltage, 2);
    h += "\nAlerts: 0x" + String(liveFlags, HEX);
    h += "\nRSSI dBm: " + String(r.wifi_rssi);
    h += "\nI2C bus: " + i2c_scanAddrs();
    h += "\nMLX ready: " + String(mlx_isReady() ? "yes" : "no");
    h += "\nMLX frames: " + String(mlx_frameCount());
    h += "\nMLX status: " + String(mlx_lastError());
    h += "\nMic driver: " + String(inmp441_lastError()) + "\n";
    server.send(200, "text/plain", h);
}

// 3-second mono WAV clip, streamed (no big RAM buffer). For bench "hear
// what the mic hears". Nothing autoplays: the dashboard only fetches this
// when the user taps Listen.
static void handleClip() {
    const uint32_t SR = AUDIO_SAMPLE_RATE;
    const uint32_t SEC = 3;
    const uint32_t N = SR * SEC; // samples
    const uint32_t DATA_BYTES = N * 2;

    uint8_t h[44];
    memcpy(h, "RIFF", 4);
    uint32_t v32 = 36 + DATA_BYTES;
    memcpy(h + 4, &v32, 4);
    memcpy(h + 8, "WAVEfmt ", 8);
    v32 = 16; memcpy(h + 16, &v32, 4);
    h[20] = 1; h[21] = 0;                       // PCM
    h[22] = 1; h[23] = 0;                       // mono
    v32 = SR; memcpy(h + 24, &v32, 4);          // sample rate
    v32 = SR * 2; memcpy(h + 28, &v32, 4);      // byte rate
    h[32] = 2; h[33] = 0;                       // block align
    h[34] = 16; h[35] = 0;                      // bits
    memcpy(h + 36, "data", 4);
    memcpy(h + 40, &DATA_BYTES, 4);

    server.setContentLength(44 + DATA_BYTES);
    server.send(200, "audio/wav", "");
    server.sendContent((const char *)h, 44);

    static int16_t mono[512];
    uint32_t sent = 0;
    while (sent < N) {
        uint32_t want = N - sent;
        if (want > 512) want = 512;
        int r = audio_readMono(mono, (int)want);
        if (r <= 0) memset(mono, 0, sizeof(mono)), r = (int)want; // silence pad
        server.sendContent((const char *)mono, (size_t)r * 2);
        sent += (uint32_t)r;
    }
}

// ============================================================
// PUBLIC
// ============================================================
// Live waveform slice for the dashboard scope (256 samples, ~16 ms).
static void handleWave() {
    static int16_t w[256];
    int n = audio_getWave(w, 256);
    String json("{\"stuck\":");
    json += audio_inputStuck() ? "true" : "false";
    json += ",\"n\":" + String(n) + ",\"wave\":[";
    for (int i = 0; i < n; i++) {
        if (i) json += ',';
        json += String(w[i]);
    }
    json += "]}";
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", json);
}

void webserver_init() {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/data", HTTP_GET, handleData);
    server.on("/thermal", HTTP_GET, handleThermal);
    server.on("/history", HTTP_GET, handleHistory);
    server.on("/csv", HTTP_GET, handleCSV);
    server.on("/health", HTTP_GET, handleHealth);
    server.on("/wifisetup", HTTP_GET, handleWifiSetup);
    server.on("/clip.wav", HTTP_GET, handleClip);
    server.on("/wave", HTTP_GET, handleWave);
    server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
    server.begin();
    DEBUG_PRINTF("[Web] Dashboard on port %d\n", WEB_SERVER_PORT);
}

void webserver_handle() {
    server.handleClient();
}

void webserver_stop() {
    server.stop();
    DEBUG_PRINTLN("[Web] Port 80 yielded (portal)");
}

void webserver_start() {
    server.begin();
    DEBUG_PRINTLN("[Web] Dashboard re-listening");
}
