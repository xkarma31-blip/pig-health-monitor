#ifndef AUDIO_CONFIG_H
#define AUDIO_CONFIG_H

#include <Arduino.h>

// ==========================================
// 🐷 Pig Health Monitor HARDWARE CONFIGURATION
// ==========================================

// --- I2S MICROPHONE PINS (INMP441) ---
// Connect these to your ESP32-S3
#define I2S_SD      10  // Serial Data (DIN on Mic)
#define I2S_WS      11  // Word Select (LRC on Mic)
#define I2S_SCK     12  // Serial Clock (BCLK on Mic)

// --- AUDIO SETTINGS ---
#define SAMPLE_RATE 16000       // 16kHz is standard for TinyML
#define I2S_PORT    I2S_NUM_0
#define DMA_BUF_LEN 1024        // DMA Buffer Length
#define DMA_BUF_CNT 4           // Number of DMA Buffers

// --- UTILITIES ---
#define SERIAL_BAUD 115200      // Serial Monitor Speed

#endif
