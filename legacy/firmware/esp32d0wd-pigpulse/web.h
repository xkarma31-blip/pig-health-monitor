/**
 * PigPulse v1.0 - Web Server Header
 * Dashboard + JSON endpoints. Served only in config mode
 * (field mode sleeps; see CONFIG_HOLD_PIN / CONFIG_MODE_TIMEOUT_MS).
 *
 * Endpoints:
 *   /         pig health dashboard (webpage.h)
 *   /data     stats snapshot JSON (poll every 10 s)
 *   /thermal  full 32x24 frame JSON (thermal canvas, on demand)
 *   /history  24h ring JSON (sparkline)
 *   /csv      latest reading as CSV
 *   /health   plain-text diagnostics
 */

#ifndef WEB_H
#define WEB_H

#include "types.h"

void webserver_init();
void webserver_handle();
void webserver_stop();    // yield port 80 (captive portal)
void webserver_start();   // re-listen with registered routes
// Live alert flags pushed by the main loop (handlers must NOT read
// alert_flags off a locally-built SensorReading: sensors_getReading()
// never fills it, so that would be uninitialized stack memory).
void web_setLiveFlags(uint8_t flags);
// Append one reading to the NVS 24-entry ring (survives reboot).
void history_push(const SensorReading *reading);

#endif // WEB_H
