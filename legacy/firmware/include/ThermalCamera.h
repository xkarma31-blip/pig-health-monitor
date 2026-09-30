#ifndef THERMAL_CAMERA_H
#define THERMAL_CAMERA_H

#include <Adafruit_MLX90640.h>

// ==========================================
// 👁️ THERMAL CAMERA LOGIC (MLX90640)
// Purpose: Process 32x24 thermal grid to find peak pig temperature.
// ==========================================

class ThermalEye {
public:
    Adafruit_MLX90640 mlx;
    float frame[32 * 24]; // Buffer for full frame
    float tempHistory[5] = {0, 0, 0, 0, 0};
    int historyIndex = 0;

    bool begin() {
        if (!mlx.begin(MLX90640_I2CADDR_DEFAULT, &Wire)) {
            Serial.println("❌ MLX90640 not found!");
            return false;
        }
        mlx.setMode(MLX90640_CHESS);
        mlx.setResolution(MLX90640_ADC_18BIT);
        mlx.setRefreshRate(MLX90640_2_HZ);
        Serial.println("✅ Thermal Eye Online.");
        return true;
    }

    float getMaxTemp() {
        if (mlx.getFrame(frame) != 0) {
            Serial.println("⚠️ Failed to read thermal frame");
            return -1.0;
        }

        float maxT = -100.0;
        for (uint16_t i = 0; i < 768; i++) {
            if (frame[i] > maxT) maxT = frame[i];
        }

        // Apply Smoothing (Moving Average)
        tempHistory[historyIndex] = maxT;
        historyIndex = (historyIndex + 1) % 5;

        float sum = 0;
        for (int i = 0; i < 5; i++) sum += tempHistory[i];
        return sum / 5.0;
    }
};

#endif
