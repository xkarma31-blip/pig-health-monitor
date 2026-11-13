/*
  INMP441 Mic + TCP Stream + MQTT for ESP32-S3 Super Mini
  --------------------------------------------------------
  Canonicalized from the local esp32s3_mic_telemetry reference, whose
  diagnostic strings were found in the device flash backup on 2026-10-13.
  Preserves WiFi/MQTT/TCP retries and 24-bit telemetry; fixes S16 conversion.
  The disabled USB clip recorder is intentionally not included.

  Wiring:
    INMP441 VDD  -> ESP32-S3 3.3V
    INMP441 GND  -> ESP32-S3 GND
    INMP441 L/R  -> GND (selects LEFT channel)
    INMP441 WS   -> GPIO5
    INMP441 SCK  -> GPIO4
    INMP441 SD   -> GPIO6
    SHT45 VCC/GND -> 3.3V/GND, SDA -> GPIO8, SCL -> GPIO9
*/

#include <driver/i2s.h>
#include <math.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>

// v10g 2026-10-17: matched to PHYSICAL wiring (Master, authoritative):
// mic SCK/BCLK -> GPIO4, mic WS/LRCL -> GPIO5, SD -> GPIO6, L/R -> GND.
// The old values (WS=4/SCK=5) were cross-clocking the mic against its pin roles.
#define I2S_WS   5
#define I2S_SCK  4
#define I2S_SD   6
#define I2S_PORT I2S_NUM_0

#define BUFFER_LEN 512
#define SAMPLE_RATE 48000
#define FULL_SCALE 8388608.0
#define FIRMWARE_ID "pigpulse-mic-sht45-20261019"

const char* WIFI_SSID = "PigPulse";
const char* WIFI_PASS = "capstone";
const char* MQTT_HOST = "192.168.69.1";
const uint16_t MQTT_PORT = 1883;
const char* TCP_HOST = "192.168.69.1";
const uint16_t TCP_PORT = 9090;
const char* DEVICE_ID = "s3-mic-01";

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
WiFiClient tcpStream;
unsigned long lastMqttPub = 0;
unsigned long lastTcpConnect = 0;
unsigned long lastMqttTry = 0;
unsigned long lastWifiTry = 0;
unsigned long lastBpsMark = 0;
uint32_t tcpBytes = 0;
bool fmtPublished = false;
bool i2sReady = false;
bool shtBusReady = false;
bool shtValid = false;
float shtTemperature = 0, shtHumidity = 0;
unsigned long shtLastGood = 0;

uint8_t sht_crc(uint8_t a, uint8_t b) {
  uint8_t crc = 0xff;
  const uint8_t data[] = {a, b};
  for (uint8_t value : data) {
    crc ^= value;
    for (int bit = 0; bit < 8; ++bit)
      crc = (crc & 0x80) ? (crc << 1) ^ 0x31 : crc << 1;
  }
  return crc;
}

void sht_task() {
  static unsigned long started = 0;
  static bool pending = false;
  if (!shtBusReady) return;
  if (pending) {
    if (millis() - started < 10) return;
    pending = false;
    uint8_t data[6];
    if (Wire.requestFrom((uint8_t)0x44, (uint8_t)6) != 6) {
      shtValid = false;
      Serial.println("[sht45] short/failed measurement read");
      return;
    }
    for (auto &value : data) value = Wire.read();
    shtValid = sht_crc(data[0], data[1]) == data[2] &&
               sht_crc(data[3], data[4]) == data[5];
    if (!shtValid) {
      Serial.println("[sht45] CRC failed");
      return;
    }
    shtTemperature = -45.0f + 175.0f * ((data[0] << 8) | data[1]) / 65535.0f;
    shtHumidity = constrain(-6.0f + 125.0f * ((data[3] << 8) | data[4]) / 65535.0f, 0.0f, 100.0f);
    shtLastGood = millis();
    Serial.printf("[sht45] temperature=%.2f C humidity=%.2f %% CRC=OK\n", shtTemperature, shtHumidity);
  } else if (millis() - started >= 2000) {
    started = millis();
    Wire.beginTransmission(0x44);
    Wire.write(0xfd); // High precision, heater off; conversion finishes asynchronously.
    uint8_t error = Wire.endTransmission();
    pending = error == 0;
    if (!pending) {
      shtValid = false;
      Serial.printf("[sht45] address=0x44 SDA=8 SCL=9 I2C error=%u (2=NACK)\n", error);
    }
  }
}

void i2s_install() {
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = BUFFER_LEN,
    .use_apll = false
  };
  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2sReady = err == ESP_OK;
  if (!i2sReady) Serial.printf("[i2s] driver_install: %s\n", esp_err_to_name(err));
}

void i2s_set_pins() {
  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  esp_err_t err = i2s_set_pin(I2S_PORT, &pin_config);
  i2sReady = i2sReady && err == ESP_OK;
  if (err != ESP_OK) Serial.printf("[i2s] set_pin: %s\n", esp_err_to_name(err));
}

void wifi_connect() {
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP)
      Serial.printf("[wifi] IP=%s\n", WiFi.localIP().toString().c_str());
    // removed: per-event "disconnected reason" printf — spammed the serial
    // from the event context on every no-AP retry and smashed IDLE1's stack
    // canary (Interrupt WDT panic on CPU1, 2026-10-19 capture).
  });
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Match the running Super Mini firmware's RF power setting.
  WiFi.disconnect(false, false);
  int networks = WiFi.scanNetworks();
  Serial.printf("[wifi] scan count=%d\n", networks);
  for (int i = 0; i < networks; i++) {
    if (WiFi.SSID(i) == WIFI_SSID)
      Serial.printf("[wifi] target BSSID=%s channel=%d RSSI=%d\n",
                    WiFi.BSSIDstr(i).c_str(), WiFi.channel(i), WiFi.RSSI(i));
  }
  WiFi.scanDelete();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  bool powerSet = WiFi.setTxPower(WIFI_POWER_8_5dBm);
  Serial.printf("[wifi] txPower set=%d actual=%d\n", powerSet, (int)WiFi.getTxPower());
  for (int t = 0; t < 60 && WiFi.status() != WL_CONNECTED; t++) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected ip=%s\n", WiFi.localIP().toString().c_str());
  }
}

void wifi_task() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiTry < 5000) return;
  lastWifiTry = millis();
  tcpStream.stop();
  mqtt.disconnect();
  fmtPublished = false;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void mqtt_ensure() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttTry < 5000) return;
  lastMqttTry = millis();
  const char* will = "{\"mic\":false,\"rms\":0,\"peak\":0,\"sr\":48000}";
  // PubSubClient.connect returns bool, NOT an error code (state() is the code).
  if (mqtt.connect(DEVICE_ID, nullptr, nullptr,
                   "pig/s3-mic-01/telemetry", 1, true, will)) {
    fmtPublished = false; // republish retained format after every reconnect
    Serial.println("[mqtt] connected");
  } else {
    Serial.printf("[mqtt] connect failed state=%d\n", mqtt.state());
  }
}

void publish_audio_format() {
  const char* format = "{\"rate\":48000,\"encoding\":\"s16le\",\"endian\":\"little\","
                       "\"channels\":2,\"interleaved\":true,\"bytes_per_frame\":4,"
                       "\"bytes_per_sec\":192000,\"firmware\":\"" FIRMWARE_ID "\"}";
  // Retry if publish failed; the reference marked it published before sending.
  fmtPublished = mqtt.publish("pig/s3-mic-01/audio/fmt", format, true);
}

void tcp_send(const uint8_t *data, size_t len) {
  if (!tcpStream.connected()) {
    if (millis() - lastTcpConnect < 3000) return;
    lastTcpConnect = millis();
    if (tcpStream.connect(TCP_HOST, TCP_PORT, 500)) {
      tcpStream.setNoDelay(true);
      Serial.println("[tcp] connected");
    } else {
      return;
    }
  }
  if (tcpStream.write(data, len) != len) {
    tcpStream.stop();
    Serial.println("[tcp] disconnected");
    return;
  }
  tcpBytes += len;
}

void publish_telemetry(int rms, int peak) {
  if (mqtt.connected()) {
    char payload[256];
    char ambient[96] = "";
    if (shtValid && millis() - shtLastGood < 5000)
      snprintf(ambient, sizeof(ambient), ",\"temperature\":%.2f,\"humidity\":%.2f", shtTemperature, shtHumidity);
    snprintf(payload, sizeof(payload),
             "{\"mic\":true,\"rms\":%d,\"peak\":%d,\"sr\":48000%s}", rms, peak, ambient);
    String topic = String("pig/") + DEVICE_ID + "/telemetry";
    if (!mqtt.publish(topic.c_str(), payload)) Serial.println("[mqtt] publish failed");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Starting " FIRMWARE_ID " (I2S32 >>16 -> S16LE stereo)...");
  shtBusReady = Wire.begin(8, 9, 100000);
  Wire.setTimeOut(5);
  Serial.printf("[pins] mic SCK=4 WS=5 SD=6 LEFT; SHT45 SDA=8 SCL=9 init=%d\n", shtBusReady);

  i2s_install();
  i2s_set_pins();
  if (i2sReady) {
    esp_err_t err = i2s_start(I2S_PORT);
    i2sReady = err == ESP_OK;
    if (!i2sReady) Serial.printf("[i2s] start: %s\n", esp_err_to_name(err));
  }
  delay(500);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(1); // bound MQTT handshake stalls while audio is live
  mqtt.setBufferSize(384);
  wifi_connect();
  lastBpsMark = millis();
}

void loop() {
  sht_task();
  wifi_task();
  if (!i2sReady) {
    Serial.println("[i2s] initialization failed; no audio is being sent");
    delay(1000);
    return;
  }

  static int32_t rawBuffer[BUFFER_LEN];
  size_t bytesIn = 0;

  esp_err_t result = i2s_read(I2S_PORT, &rawBuffer, sizeof(rawBuffer), &bytesIn, pdMS_TO_TICKS(100));
  if (result != ESP_OK || bytesIn == 0) {
    Serial.printf("[i2s] read failed: %s bytes=%u\n", esp_err_to_name(result), (unsigned)bytesIn);
    delay(50);
    return;
  }

  if (result == ESP_OK && bytesIn > 0) {
    int samplesRead = bytesIn / sizeof(int32_t);
    int64_t sumSq = 0;
    int32_t peak = 0;
    int nonZero = 0;

    for (int i = 0; i < samplesRead; i++) {
      int32_t sample = rawBuffer[i] >> 8;
      sumSq += (int64_t)sample * sample;
      int32_t absSample = abs(sample);
      if (absSample > peak) peak = absSample;
      if (sample != 0) nonZero++;
    }

    float rms = sqrt((double)sumSq / samplesRead);

    int16_t stereoBuf[BUFFER_LEN * 2];
    for (int i = 0; i < samplesRead; i++) {
      // INMP441 is MSB-aligned: keep the signed top 16 bits, not the low
      // 16 bits of a 24-bit sample (which wrap into full-scale distortion).
      int16_t sample = (int16_t)(rawBuffer[i] >> 16);
      stereoBuf[i * 2] = sample;
      stereoBuf[i * 2 + 1] = sample;
    }
    if (WiFi.status() == WL_CONNECTED) {
      tcp_send((uint8_t *)stereoBuf, samplesRead * 4);
      mqtt.loop();
      mqtt_ensure();
      if (mqtt.connected() && !fmtPublished) publish_audio_format();
    }

    if (millis() - lastMqttPub >= 1000) {
      unsigned long now = millis();
      lastMqttPub = now;
      publish_telemetry((int)rms, peak);
      uint32_t bps = tcpBytes * 1000 / (now - lastBpsMark);
      lastBpsMark = now;
      tcpBytes = 0;
      Serial.printf("RMS24: %.0f Peak24: %d nz:%d%% %.1f dBFS tcp:%lu B/s wifi:%d mqtt:%d tcp:%d\n",
                    rms, peak, 100 * nonZero / samplesRead,
                    20.0 * log10(rms / FULL_SCALE + 1e-9), (unsigned long)bps,
                    WiFi.status() == WL_CONNECTED, mqtt.connected(), tcpStream.connected());
    }
  }
}
