#include <Arduino.h>
#include <driver/i2s.h>
#include "audio_config.h"

// ==========================================
// 🐷 Pig Health Monitor FIRMWARE v0.1: The Awakening
// Purpose: Test if the INMP441 Microphone is hearing sound.
// Usage: Open 'Serial Plotter' (Ctrl+Shift+L in Arduino) to see the waves.
// ==========================================

void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT, // INMP441 L/R pin grounded = Left
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = DMA_BUF_CNT,
    .dma_buf_len = DMA_BUF_LEN,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);
  Serial.println("🐷 Pig Health Monitor: Initializing Ears...");
  
  setupI2S();
  
  Serial.println("🐷 Pig Health Monitor: Listening... (Open Serial Plotter!)");
}

void loop() {
  // 1. Read Data from I2S Buffer
  int16_t sampleBuffer[128]; // Small buffer for immediate plotting
  size_t bytesRead = 0;
  
  i2s_read(I2S_PORT, &sampleBuffer, sizeof(sampleBuffer), &bytesRead, portMAX_DELAY);

  // 2. Plot Data to Serial (For Visual Debugging)
  if (bytesRead > 0) {
    for (int i = 0; i < bytesRead / 2; i++) {
      Serial.println(sampleBuffer[i]); // Print raw sample value
    }
  }
}
