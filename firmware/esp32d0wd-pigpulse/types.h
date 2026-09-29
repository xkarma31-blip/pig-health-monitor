/**
 * PigPulse v1.0 - Data Structures
 * ESP32-D0WD Pig Health Monitoring Device
 */

#ifndef TYPES_H
#define TYPES_H

#include <stdint.h>

// ============================================================
// ALERT FLAGS (bitmask)
// ============================================================
typedef enum {
    ALERT_NONE              = 0x00,
    ALERT_FEVER             = 0x01,     // pig body temp > 40C
    ALERT_HYPERTHERMIA      = 0x02,     // pig body temp > 41C
    ALERT_LOW_BATTERY       = 0x04,     // battery < 3.3V
    ALERT_CRITICAL_BATTERY  = 0x08,     // battery < 3.1V
    ALERT_SENSOR_FAIL       = 0x10,     // MLX90640 not responding
    ALERT_AUDIO_FAIL        = 0x20,     // INMP441 not responding
    ALERT_COUGH_DETECTED    = 0x40,     // cough event
    ALERT_DISTRESS_VOCAL    = 0x80      // distress vocalization
} AlertFlags;

// ============================================================
// SENSOR READING (single snapshot)
// ============================================================
typedef struct {
    float center_temp;          // center-zone temperature (C)
    float max_temp;             // hottest pixel (C)
    float min_temp;             // coldest pixel (C)
    float avg_temp;             // average of all pixels (C)
    float ambient_temp;         // estimated ambient (C)
    uint16_t max_x;             // X position of hottest pixel
    uint16_t max_y;             // Y position of hottest pixel
    float audio_rms;            // audio RMS energy (0.0 - 1.0)
    uint16_t cough_count;       // cough events in sampling period
    float distress_freq;        // dominant distress frequency (Hz)
    float battery_voltage;      // battery voltage (V)
    uint8_t battery_percent;    // battery percentage (0-100)
    uint8_t alert_flags;        // AlertFlags bitmask
    uint32_t uptime_ms;         // device uptime (ms)
    uint32_t free_heap;         // free heap (bytes)
    int8_t wifi_rssi;           // WiFi signal strength (dBm)
} SensorReading;

// ============================================================
// TELEMETRY PACKET (sent via ESP-NOW)
// ============================================================
typedef struct __attribute__((packed)) {
    char device_id[16];         // device identifier
    uint32_t timestamp;         // millis() at creation
    float center_temp;          // pig body temp estimate
    float max_temp;             // max temp in frame
    float ambient_temp;         // ambient temp estimate
    float audio_rms;            // audio energy
    uint16_t cough_count;       // cough events
    float battery_voltage;      // battery voltage
    uint8_t alert_flags;        // AlertFlags
    uint8_t battery_percent;    // battery percentage
} TelemetryPacket;

// ============================================================
// HISTORY ENTRY (NVS storage)
// ============================================================
typedef struct {
    uint32_t timestamp;         // epoch or millis
    float center_temp;          // pig body temp
    float ambient_temp;         // ambient
    uint8_t alert_flags;        // alerts at this time
} HistoryEntry;

#endif // TYPES_H
