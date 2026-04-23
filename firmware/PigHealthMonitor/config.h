#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// ⚙️ PIG HEALTH MONITOR - configuration
// ==========================================

// 📡 Network Settings
#define WIFI_SSID "YOUR_SSID"
#define WIFI_PASS "YOUR_PASSWORD"

// 🌩️ PocketBase Backend
// Ensure the URL matches your server EXACTLY. Do not add a trailing slash.
#define PB_URL "https://sol-pig-monitor.pockethost.io"
#define PB_COLLECTION "sensors" // The name of the collection we created

// 🔌 ESP32-S3 Pin Definitions
// Modify these if your physical wiring changes
#define SQUEAL_SENSOR_PIN 4   // Example: Analog/Digital sound sensor
#define TEMP_SENSOR_PIN   5   // Example: DHT22 Data pin
#define AMMONIA_SENSOR_PIN 6  // Example: MQ135 Analog pin
#define ONBOARD_LED       48  // ESP32-S3 typical built-in RGB or standard LED

// ⏱️ Intervals (in milliseconds)
#define SENSOR_POLL_INTERVAL 60000 // How often to send standard data (60 seconds)

#endif
