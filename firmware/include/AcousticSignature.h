#ifndef ACOUSTIC_SIGNATURE_H
#define ACOUSTIC_SIGNATURE_H

#include <arduinoFFT.h>
#include "audio_config.h"

// ==========================================
// 👂 ACOUSTIC SIGNATURE LOGIC (FFT)
// Purpose: Detect cough signatures in the audio stream.
// ==========================================

#define SAMPLES 512             // Must be a power of 2
#define COUGH_THRESHOLD 1500    // Magnitude threshold for cough detection

class AcousticEar {
public:
    double vReal[SAMPLES];
    double vImag[SAMPLES];
    ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, SAMPLES, SAMPLE_RATE);

    bool detectCough(int16_t* buffer, size_t size) {
        if (size < SAMPLES) return false;

        // 1. Fill FFT buffers
        for (int i = 0; i < SAMPLES; i++) {
            vReal[i] = buffer[i];
            vImag[i] = 0;
        }

        // 2. Process FFT
        FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
        FFT.compute(FFT_FORWARD);
        FFT.complexToMagnitude();

        // 3. Noise Floor Estimation (Average Magnitude)
        double noiseFloor = 0;
        for (int i = 2; i < (SAMPLES / 2); i++) {
            noiseFloor += vReal[i];
        }
        noiseFloor /= (SAMPLES / 2 - 2);

        // 4. Analyze specific frequency bins (Cough: 500Hz - 2500Hz)
        // 500Hz is approx bin 16, 2500Hz is approx bin 80
        double maxMagnitude = 0;
        for (int i = 16; i < 80; i++) {
            if (vReal[i] > maxMagnitude) maxMagnitude = vReal[i];
        }

        // Dynamic Threshold: SNR (Signal-to-Noise Ratio) must be > 3.0
        if (maxMagnitude > (noiseFloor * 3.0) && maxMagnitude > COUGH_THRESHOLD) {
            Serial.printf("🔊 High SNR Cough Detected! SNR: %.2f, Magnitude: %.2f\n", maxMagnitude / noiseFloor, maxMagnitude);
            return true;
        }
        return false;
    }
};

#endif
