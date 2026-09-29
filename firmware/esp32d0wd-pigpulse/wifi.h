/**
 * PigPulse v1.0 - WiFi & ESP-NOW Header
 * Same provisioning recipe as the proven INMP441 build:
 *   first boot / no creds  -> captive portal "PigPulse-Setup"
 *   later boots             -> auto-reconnect to saved network
 *   BOOT-held boot or dashboard button -> portal again
 * Dashboard AP "PigPulse-Config" stays up alongside STA.
 */

#ifndef WIFI_H
#define WIFI_H

#include <Arduino.h>
#include <stdint.h>
#include "types.h"

// bench=true: generous timeouts, portal allowed. bench=false (field wake):
// quick STA try, portal disabled (battery).
void wifi_init(bool bench);
void wifi_stopAP();
void wifi_stop();
bool espnow_init();
bool espnow_sendTelemetry(const TelemetryPacket *packet);

// Status / on-demand portal (dashboard "WiFi setup" button)
bool wifi_staConnected();
String wifi_staIP();
void wifi_requestPortal();      // non-blocking: honored by wifi_runPendingPortal()
bool wifi_portalPending();
void wifi_runPendingPortal();   // blocking (bounded by portal timeout)

#endif // WIFI_H
