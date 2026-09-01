#ifndef PIG_MQTT_TOPICS_H
#define PIG_MQTT_TOPICS_H

/**
 * PigPulse v3 — MQTT Topic Definitions
 *
 * Flat topic structure:
 *   pig/{deviceId}/telemetry  — Sensor data
 *   pig/{deviceId}/alerts     — Health alerts
 *   pig/{deviceId}/commands   — Inbound commands
 *   pig/{deviceId}/status     — Device status (LWT)
 *   pig/{deviceId}/response   — Command responses
 */

#include <Arduino.h>

#ifndef DEVICE_ID
#define DEVICE_ID "esp32-001"
#endif

// Topic prefixes
#define TOPIC_PREFIX "pig"
#define TOPIC_TELEMETRY "telemetry"
#define TOPIC_ALERTS "alerts"
#define TOPIC_COMMANDS "commands"
#define TOPIC_STATUS "status"
#define TOPIC_RESPONSE "response"

// Full topic strings
#define TOPIC_TELEMETRY_FULL TOPIC_PREFIX "/" DEVICE_ID "/" TOPIC_TELEMETRY
#define TOPIC_ALERTS_FULL TOPIC_PREFIX "/" DEVICE_ID "/" TOPIC_ALERTS
#define TOPIC_COMMANDS_FULL TOPIC_PREFIX "/" DEVICE_ID "/" TOPIC_COMMANDS
#define TOPIC_STATUS_FULL TOPIC_PREFIX "/" DEVICE_ID "/" TOPIC_STATUS
#define TOPIC_RESPONSE_FULL TOPIC_PREFIX "/" DEVICE_ID "/" TOPIC_RESPONSE

// Commands
#define CMD_ENROLL_START "ENROLL_START"
#define CMD_ENROLL_STOP "ENROLL_STOP"
#define CMD_OTA "OTA"
#define CMD_CONFIG "CONFIG"
#define CMD_PING "PING"

// Alert types
#define ALERT_FEVER "FEVER"
#define ALERT_COUGH_CLUSTER "COUGH_CLUSTER"
#define ALERT_LOW_BATTERY "LOW_BATTERY"
#define ALERT_WEAK_WIFI "WEAK_WIFI"

// Severity
#define SEVERITY_INFO "INFO"
#define SEVERITY_WARNING "WARNING"
#define SEVERITY_CRITICAL "CRITICAL"

// Health trends
#define TREND_STABLE "STABLE"
#define TREND_ELEVATED "ELEVATED"
#define TREND_CLUSTER "CLUSTER"

// Power states
#define POWER_NORMAL "NORMAL"
#define POWER_LOW "LOW"
#define POWER_CRITICAL "CRITICAL"
#define POWER_HIBERNATE "HIBERNATE"

// Helpers
inline String buildTopic(const char* subtopic) {
    return String(TOPIC_PREFIX) + "/" + DEVICE_ID + "/" + subtopic;
}

inline String telemetryTopic() { return buildTopic(TOPIC_TELEMETRY); }
inline String alertsTopic() { return buildTopic(TOPIC_ALERTS); }
inline String commandsTopic() { return buildTopic(TOPIC_COMMANDS); }
inline String statusTopic() { return buildTopic(TOPIC_STATUS); }
inline String responseTopic() { return buildTopic(TOPIC_RESPONSE); }

#endif
