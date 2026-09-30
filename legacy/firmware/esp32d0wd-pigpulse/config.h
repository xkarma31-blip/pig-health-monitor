/**
 * PigPulse v1.0 - Configuration
 * ESP32-D0WD Pig Health Monitoring Device
 *
 * All tunable parameters centralized here.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
// DEVICE IDENTIFICATION
// ============================================================
#define DEVICE_ID               "PIGPULSE-001"
#define FIRMWARE_VERSION        "1.0.0"

// ============================================================
// PIN DEFINITIONS - MLX90640 THERMAL CAMERA (I2C)
// ============================================================
#define I2C_SDA                 21
#define I2C_SCL                 22
#define MLX90640_ADDR           0x33

// MLX90640 driver settings (Melexis API codes)
// Refresh: 0x00=0.5Hz … 0x03=4Hz, 0x04=8Hz. 4Hz saves power in the pen.
#define MLX_REFRESH_RATE        0x03
// Resolution: 0x00=16-bit … 0x02=18-bit. 18-bit = good quality/noise trade.
#define MLX_RESOLUTION          0x02
#define MLX_EMISSIVITY          0.95f
#define MLX_TA_SHIFT            8.0f   // reflected-temp guard (see reference .ino)
// Pen wiring runs are longer than a bench: 400 kHz is the robust choice
// (reference used 800 kHz; raise only on short, stable wiring).
// Breadboard jumper wires are worse than PCB traces: the capstone wiring
// guide prescribes 100 kHz if the MLX hangs, so that is the default here.
#define MLX_I2C_CLOCK_HZ        100000UL

// ============================================================
// PIN DEFINITIONS - INMP441 MEMS MICROPHONES (I2S stereo, PROVEN)
// ============================================================
// Grounded to Master's bench-tested wiring (esp32_inmp441_webui + capstone
// breadboard guide): ONE shared data line, slots split by the L/R pin.
//   Mic 1 (pig-facing):   L/R pin -> GND (LEFT slot)
//   Mic 2 (noise ref):    L/R pin -> 3V3 (RIGHT slot)
// DOUTs tie DIRECTLY together (tri-stated on opposite slots) -> GPIO32.
#define I2S_BCLK                14      // shared bit clock (SCK on both mics)
#define I2S_LRCK                15      // shared word select (WS on both mics)
#define I2S_DOUT_SHARED         32      // SD of BOTH mics tied here
#define DUAL_MIC_ENABLE         1       // 0 = fit Mic 1 only (mono fallback)

// ============================================================
// PIN DEFINITIONS - POWER / UI
// ============================================================
#define BATTERY_ADC_PIN         34      // ADC1_CH6 - voltage divider
#define SENSOR_POWER_EN         27      // MOSFET gate for sensor rail
#define LED_STATUS              2       // onboard LED
#define CONFIG_HOLD_PIN         0       // BOOT button: hold at wake = config mode

// ============================================================
// THERMAL THRESHOLDS (Celsius)
// ============================================================
#define PIG_TEMP_NORMAL_MIN     38.5f
#define PIG_TEMP_NORMAL_MAX     39.5f
#define PIG_TEMP_FEVER          40.0f
#define PIG_TEMP_HYPERTHERMIA   41.0f
#define AMBIENT_COMP_ENABLE     1
#define AMBIENT_COMP_ALPHA      0.3f    // EMA factor for ambient tracking
#define SOLAR_COMP_FACTOR       0.1f    // deg pull-down per deg ambient > 25C
#define FRAME_AVERAGE_COUNT     4       // frames averaged per reading

// ============================================================
// AUDIO CONFIGURATION
// ============================================================
#define AUDIO_SAMPLE_RATE       16000   // Hz
#define AUDIO_BUFFER_SIZE       1024    // samples per DMA read
#define AUDIO_SAMPLE_SECONDS    5       // seconds sampled per reading
#define COUGH_ENERGY_THRESHOLD  0.15f   // RMS threshold for cough event
#define COUGH_COOLDOWN_MS       2000    // min time between cough events
#define DISTRESS_FREQ_LOW       200     // Hz - distress vocalization low bound
#define DISTRESS_FREQ_HIGH      2000    // Hz - distress vocalization high bound

// ============================================================
// POWER MANAGEMENT
// ============================================================
#define SLEEP_DURATION_US       300000000ULL  // 5 minutes in microseconds
#define CONFIG_MODE_TIMEOUT_MS  300000UL      // 5 min web access, then sleep
#define BATTERY_LOW_VOLTAGE     3.3f
#define BATTERY_CRITICAL_VOLTAGE 3.1f
#define BATTERY_FULL_VOLTAGE    4.2f
#define BATTERY_R1              100000.0f  // voltage divider R1 (100K)
#define BATTERY_R2              47000.0f   // voltage divider R2 (47K)
#define ADC_RESOLUTION          4095.0f
#define ADC_REF_VOLTAGE         3.3f

// ============================================================
// COMMUNICATION
// ============================================================
// WiFi AP Mode (direct dashboard, always up)
#define WIFI_AP_SSID            "PigPulse-Config"
#define WIFI_AP_PASS            "pigpulse123"
#define WIFI_AP_CHANNEL         1
#define WIFI_AP_MAX_CONN        4

// WiFi provisioning (join ANY network from the phone)
// First boot / no saved creds / BOOT-held boot -> captive portal
// "PigPulse-Setup": pick a network, done. Creds saved in NVS.
#define WIFI_SETUP_SSID         "PigPulse-Setup"
#define WIFI_PORTAL_TIMEOUT_S   180     // bench/config mode
#define WIFI_CONNECT_TIMEOUT_S  20
#define WIFI_FIELD_TIMEOUT_S    15      // field wake: quick try, no portal

// Web server
#define WEB_SERVER_PORT         80

// ESP-NOW (channel MUST match the AP channel in AP+STA mode)
#define ESPNOW_CHANNEL          1
#define ESPNOW_MAX_RETRY        5
// Gateway MAC address (replace with actual gateway MAC)
#define GATEWAY_MAC_ADDRESS     {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}

// ============================================================
// MQTT CONFIGURATION (PigPulse v3.0 - feat/v3-mqtt-pocketbase)
// ============================================================
#define MQTT_ENABLED            1
#define MQTT_BROKER_HOST        "192.168.1.100"
#define MQTT_BROKER_PORT        1883
#define MQTT_USE_TLS            0
#define MQTT_CLIENT_ID          "PIGPULSE-001"
#define MQTT_KEEPALIVE_S        60
#define MQTT_QOS                1
#define MQTT_USERNAME           ""
#define MQTT_PASSWORD           ""

// MQTT topics
#define MQTT_TOPIC_COWH         "pig/telemetry/cough"
#define MQTT_TOPIC_THERMAL      "pig/telemetry/thermal"
#define MQTT_TOPIC_STATUS       "pig/telemetry/status"
#define MQTT_TOPIC_CMD          "pig/command"

// ============================================================
// TINYML COUGH DETECTOR
// ============================================================
#define COUGH_DETECTOR_ENABLED  1
#define COUGH_ML_INTERVAL_MS    1000
#define COUGH_ML_MQTT_PUBLISH   1

// ============================================================
// TELEMETRY / HISTORY
// ============================================================
#define TELEMETRY_INTERVAL_MS   300000  // 5 minutes
#define MAX_ALERT_HISTORY       24      // hours of history served by /history
#define NVS_NAMESPACE           "pigpulse"
#define NVS_KEY_HISTORY         "hist24"  // ring of HistoryEntry (24 x 12 B)

// ============================================================
// DEBUG
// ============================================================
#define DEBUG_SERIAL            Serial
#define DEBUG_BAUD              115200
#define DEBUG_ENABLE            1

#if DEBUG_ENABLE
  #define DEBUG_PRINT(x)        DEBUG_SERIAL.print(x)
  #define DEBUG_PRINTLN(x)      DEBUG_SERIAL.println(x)
  #define DEBUG_PRINTF(...)     DEBUG_SERIAL.printf(__VA_ARGS__)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINTF(...)
#endif

#endif // CONFIG_H
