/*
  INMP441 Mic + TCP Stream + MQTT for ESP32-S3 Super Mini
  --------------------------------------------------------
  Based on proven working sketch (driver/i2s.h API).
  Adds TCP audio streaming to Pi :9090 and MQTT telemetry to Pi :1883.

  Wiring:
    INMP441 VDD  -> ESP32-S3 3.3V
    INMP441 GND  -> ESP32-S3 GND
    INMP441 L/R  -> GND (selects LEFT channel)
    INMP441 WS   -> GPIO4
    INMP441 SCK  -> GPIO5
    INMP441 SD   -> GPIO6
*/

#include <driver/i2s.h>
#include <math.h>
#include <WiFi.h>
#include <PubSubClient.h>

#define I2S_WS   4
#define I2S_SCK  5
#define I2S_SD   6
#define I2S_PORT I2S_NUM_0

#define BUFFER_LEN 512

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

void i2s_install() {
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 48000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = BUFFER_LEN,
    .use_apll = false
  };
  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
}

void i2s_set_pins() {
  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  i2s_set_pin(I2S_PORT, &pin_config);
}

void wifi_connect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int t = 0; t < 60 && WiFi.status() != WL_CONNECTED; t++) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected ip=%s\n", WiFi.localIP().toString().c_str());
  }
}

void tcp_send(const uint8_t *data, size_t len) {
  if (!tcpStream.connected()) {
    if (millis() - lastTcpConnect < 3000) return;
    lastTcpConnect = millis();
    if (tcpStream.connect(TCP_HOST, TCP_PORT)) {
      Serial.println("[tcp] connected");
    } else {
      return;
    }
  }
  if (tcpStream.write(data, len) != len) {
    tcpStream.stop();
    Serial.println("[tcp] disconnected");
  }
}

void publish_telemetry(int rms, int peak) {
  if (!mqtt.connected()) {
    mqtt.connect(DEVICE_ID);
  }
  if (mqtt.connected()) {
    char payload[128];
    snprintf(payload, sizeof(payload),
             "{\"mic\":true,\"rms\":%d,\"peak\":%d,\"sr\":48000}", rms, peak);
    String topic = String("pig/") + DEVICE_ID + "/telemetry";
    mqtt.publish(topic.c_str(), payload);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Starting INMP441 + TCP + MQTT...");

  i2s_install();
  i2s_set_pins();
  i2s_start(I2S_PORT);
  delay(500);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  wifi_connect();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    delay(5000);
    wifi_connect();
    return;
  }

  mqtt.loop();

  int32_t rawBuffer[BUFFER_LEN];
  size_t bytesIn = 0;

  esp_err_t result = i2s_read(I2S_PORT, &rawBuffer, sizeof(rawBuffer), &bytesIn, portMAX_DELAY);

  if (result == ESP_OK && bytesIn > 0) {
    int samplesRead = bytesIn / sizeof(int32_t);
    int64_t sumSq = 0;
    int32_t peak = 0;

    for (int i = 0; i < samplesRead; i++) {
      int32_t sample = rawBuffer[i] >> 8;
      sumSq += (int64_t)sample * sample;
      int32_t absSample = abs(sample);
      if (absSample > peak) peak = absSample;
    }

    float rms = sqrt((double)sumSq / samplesRead);

    int16_t stereoBuf[BUFFER_LEN * 2];
    for (int i = 0; i < samplesRead; i++) {
      int16_t sample = (int16_t)(rawBuffer[i] >> 8);
      stereoBuf[i * 2] = sample;
      stereoBuf[i * 2 + 1] = sample;
    }
    tcp_send((uint8_t *)stereoBuf, samplesRead * 4);

    if (millis() - lastMqttPub >= 1000) {
      lastMqttPub = millis();
      publish_telemetry((int)rms, peak);
      Serial.printf("RMS: %.0f  Peak: %d\n", rms, peak);
    }
  }
}
