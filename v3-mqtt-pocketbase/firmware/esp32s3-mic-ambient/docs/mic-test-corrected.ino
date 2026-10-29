#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

// Actual wiring: SCK=GPIO4, WS=GPIO5, SD=GPIO6, L/R=GND.
// SHT45 may remain wired SDA=8/SCL=9; this mic-only test does not use I2C.
#define I2S_WS 5
#define I2S_SCK 4
#define I2S_SD 6
#define I2S_PORT I2S_NUM_0
#define BUFFER_LEN 512

bool ready = false;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Starting INMP441 mic test: SCK=4 WS=5 SD=6 LEFT");

  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  config.sample_rate = 44100;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  config.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.dma_buf_count = 8;
  config.dma_buf_len = BUFFER_LEN;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_SCK;
  pins.ws_io_num = I2S_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = I2S_SD;

  esp_err_t error = i2s_driver_install(I2S_PORT, &config, 0, nullptr);
  if (error == ESP_OK) error = i2s_set_pin(I2S_PORT, &pins);
  if (error == ESP_OK) error = i2s_start(I2S_PORT);
  ready = error == ESP_OK;
  Serial.printf("I2S initialization: %s\n", esp_err_to_name(error));
  delay(500);
}

void loop() {
  if (!ready) { delay(1000); return; }
  static int32_t raw[BUFFER_LEN];
  size_t bytes = 0;
  esp_err_t error = i2s_read(I2S_PORT, raw, sizeof(raw), &bytes, pdMS_TO_TICKS(1000));
  size_t count = bytes / sizeof(int32_t);
  if (error != ESP_OK || count == 0) {
    Serial.printf("I2S read: %s, bytes=%u\n", esp_err_to_name(error), (unsigned)bytes);
    return;
  }

  double sum = 0, sumSq = 0;
  int32_t peak = 0, minimum = INT32_MAX, maximum = INT32_MIN;
  for (size_t i = 0; i < count; ++i) {
    int32_t sample = raw[i] >> 8;
    sum += sample;
    sumSq += (double)sample * sample;
    peak = max(peak, (int32_t)abs(sample));
    minimum = min(minimum, sample);
    maximum = max(maximum, sample);
  }
  double mean = sum / count;
  double variance = sumSq / count - mean * mean;
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 250) {
    lastPrint = millis();
    Serial.printf("RMS: %.1f AC_RMS: %.1f Peak: %ld Mean: %.1f Min: %ld Max: %ld\n",
                  sqrt(sumSq / count), sqrt(variance > 0 ? variance : 0),
                  (long)peak, mean, (long)minimum, (long)maximum);
  }
}
