/**
 * PigPulse v1.0 - WiFi & ESP-NOW Communication
 * Provisioning recipe from the proven INMP441 build:
 *   WiFiManager autoConnect -> saved network, else captive portal.
 * Dashboard AP stays up alongside STA so the phone always has a way in.
 * ESP-NOW peer channel follows the STA channel (AP+STA share one radio).
 */

#include "wifi.h"
#include "config.h"
#include "web.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <esp_now.h>

// ============================================================
// STATE
// ============================================================
static uint8_t gatewayMac[] = GATEWAY_MAC_ADDRESS;
static bool espNowReady = false;
static bool wifiAPReady = false;
static volatile bool telemetryAck = false;
static volatile bool portalRequested = false;
static WiFiManager wm;

// ============================================================
// ESP-NOW CALLBACK (WiFi task: keep trivial)
// ============================================================
static void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    (void)mac_addr;
    telemetryAck = (status == ESP_NOW_SEND_SUCCESS);
}

// ============================================================
// WIFI
// ============================================================

void wifi_init(bool bench) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.setHostname(DEVICE_ID);

    wm.setDebugOutput(true);
    if (bench) {
        wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_S);
        wm.setConnectTimeout(WIFI_CONNECT_TIMEOUT_S);
        wm.setEnableConfigPortal(true);
    } else {
        // Field wake: fast STA attempt, never camp on a portal (battery).
        wm.setConfigPortalTimeout(1);
        wm.setConnectTimeout(WIFI_FIELD_TIMEOUT_S);
        wm.setEnableConfigPortal(false);
    }

    // Blocking, but bounded by the timeouts above.
    bool staUp = wm.autoConnect(WIFI_SETUP_SSID);
    if (staUp) {
        DEBUG_PRINTF("[WiFi] STA up: %s @ %s\n",
                     WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    } else {
        DEBUG_PRINTLN("[WiFi] STA not connected, AP-only");
    }

    // Our dashboard AP follows the STA channel (one radio).
    uint8_t ch = (WiFi.status() == WL_CONNECTED && WiFi.channel() > 0)
                     ? (uint8_t)WiFi.channel()
                     : ESPNOW_CHANNEL;
    WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASS, ch, false, WIFI_AP_MAX_CONN);
    wifiAPReady = true;

    DEBUG_PRINTF("[WiFi] Dashboard AP: %s (ch %u)\n", WIFI_AP_SSID, ch);
    DEBUG_PRINTF("[WiFi] Open http://%s  (STA: %s)\n",
                 WiFi.softAPIP().toString().c_str(),
                 wifi_staIP().c_str());
}

bool wifi_staConnected() { return WiFi.status() == WL_CONNECTED; }

String wifi_staIP() {
    return wifi_staConnected() ? WiFi.localIP().toString() : String("-");
}

void wifi_requestPortal() { portalRequested = true; }
bool wifi_portalPending() { return portalRequested; }

// Runs the captive portal (bounded by portal timeout), then revives the
// dashboard server which had to yield port 80.
void wifi_runPendingPortal() {
    if (!portalRequested) return;
    portalRequested = false;
    DEBUG_PRINTLN("[WiFi] On-demand portal: join " WIFI_SETUP_SSID);
    webserver_stop(); // yield port 80 to the portal
    wm.setEnableConfigPortal(true);
    wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_S);
    wm.startConfigPortal(WIFI_SETUP_SSID);
    webserver_start(); // same routes, re-listened
    DEBUG_PRINTF("[WiFi] Portal done. STA: %s\n", wifi_staIP().c_str());
}

// ============================================================
// ESP-NOW
// ============================================================

bool espnow_init() {
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("[ESPNOW] Init failed");
        espNowReady = false;
        return false;
    }
    esp_now_register_send_cb(onDataSent);

    // Peer channel must equal the radio's current channel.
    uint8_t ch = (WiFi.status() == WL_CONNECTED && WiFi.channel() > 0)
                     ? (uint8_t)WiFi.channel()
                     : ESPNOW_CHANNEL;
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, gatewayMac, 6);
    peer.channel = ch;
    peer.encrypt = false;

    if (esp_now_add_peer(&peer) != ESP_OK) {
        DEBUG_PRINTLN("[ESPNOW] Add peer failed (set GATEWAY_MAC_ADDRESS)");
        espNowReady = false;
        return false;
    }
    espNowReady = true;
    DEBUG_PRINTF("[ESPNOW] Ready (ch %u)\n", ch);
    return true;
}

bool espnow_sendTelemetry(const TelemetryPacket *packet) {
    if (!espNowReady || packet == NULL) return false;
    // TelemetryPacket is packed: 16+4+4+4+4+4+2+4+1+1 = 44 bytes (< 250 B limit)
    static_assert(sizeof(TelemetryPacket) <= 250, "ESP-NOW packet too large");
    telemetryAck = false;
    if (esp_now_send(gatewayMac, (const uint8_t *)packet,
                     sizeof(TelemetryPacket)) != ESP_OK) {
        DEBUG_PRINTLN("[ESPNOW] Send call failed");
        return false;
    }
    uint32_t t0 = millis();
    while (!telemetryAck && (millis() - t0) < 500) delay(5);
    DEBUG_PRINTF("[ESPNOW] Telemetry %s\n", telemetryAck ? "ACK" : "no-ack");
    return telemetryAck;
}

void wifi_stopAP() {
    if (wifiAPReady) {
        WiFi.softAPdisconnect(true);
        wifiAPReady = false;
        DEBUG_PRINTLN("[WiFi] AP stopped");
    }
}

void wifi_stop() {
    wifi_stopAP();
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);
    DEBUG_PRINTLN("[WiFi] Off (deep-sleep)");
}
