#ifndef ACOUSTIC_SIGNATURE_H
#define ACOUSTIC_SIGNATURE_H

#include <arduinoFFT.h>
#include "audio_config.h"

// ==========================================
// 👂 ACOUSTIC SIGNATURE — DUAL-BAND COUGH CLASSIFIER
//
// Based on peer-reviewed research (NIH / ASABE):
//   - Infectious pig coughs peak at ~600 Hz (moist/expectoration)
//   - Non-infectious/healthy coughs peak at ~1600 Hz (dry)
//   - Total cough energy is concentrated in 150 Hz – 5 kHz range
//
// Strategy:
//   1. RMS silence gate — don't waste cycles on quiet rooms
//   2. Compute FFT → extract two diagnostic bands:
//        Band A: 500–800 Hz   → infectious marker
//        Band B: 1200–2000 Hz → non-infectious marker
//   3. Dynamic noise floor from high-freq bins (>4 kHz, animal-silent zone)
//   4. SNR check on whichever band dominates
//   5. Classify: INFECTIOUS / NON_INFECTIOUS / NONE
// ==========================================

#define SAMPLES           512     // Power of 2; gives 31.25 Hz/bin at 16kHz
#define SILENCE_RMS       50.0    // Below this, room is silent — skip FFT
#define NOISE_BAND_START  128     // Bin 128 = ~4000 Hz — above pig vocalisation
#define SNR_THRESHOLD     5.0     // Signal must be 5× above noise floor
#define ABS_MAG_THRESHOLD 1500.0  // Minimum absolute magnitude to qualify

// Cough bands in FFT bins (bin = freq / (SAMPLE_RATE / SAMPLES))
// bin = freq / (16000 / 512) = freq / 31.25
// 500 Hz → bin 16  |  800 Hz → bin 25
// 1200 Hz → bin 38 |  2000 Hz → bin 64
#define BAND_A_START  16   // 500 Hz
#define BAND_A_END    25   // 800 Hz  → INFECTIOUS band
#define BAND_B_START  38   // 1200 Hz
#define BAND_B_END    64   // 2000 Hz → NON-INFECTIOUS band

enum CoughType { COUGH_NONE, COUGH_INFECTIOUS, COUGH_NON_INFECTIOUS };

class AcousticEar {
public:
    double vReal[SAMPLES];
    double vImag[SAMPLES];
    ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, SAMPLES, SAMPLE_RATE);

    /**
     * Analyse a raw PCM buffer and classify any detected cough.
     * Returns CoughType enum; caller should treat INFECTIOUS as high-severity.
     */
    CoughType classifyCough(int16_t* buffer, size_t sampleCount) {
        if (sampleCount < SAMPLES) return COUGH_NONE;

        // ── Step 1: RMS Silence Gate ──────────────────────────────────────
        double rms = 0;
        for (int i = 0; i < SAMPLES; i++) {
            vReal[i] = buffer[i];
            vImag[i] = 0;
            rms += (double)buffer[i] * buffer[i];
        }
        rms = sqrt(rms / SAMPLES);
        if (rms < SILENCE_RMS) return COUGH_NONE;

        // ── Step 2: FFT ───────────────────────────────────────────────────
        FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
        FFT.compute(FFT_FORWARD);
        FFT.complexToMagnitude();

        // ── Step 3: Dynamic Noise Floor (bins above 4 kHz) ────────────────
        double noiseFloor = 0;
        int noiseCount = (SAMPLES / 2) - NOISE_BAND_START;
        for (int i = NOISE_BAND_START; i < (SAMPLES / 2); i++) {
            noiseFloor += vReal[i];
        }
        noiseFloor /= (double)noiseCount;
        if (noiseFloor < 1.0) noiseFloor = 1.0;

        // ── Step 4: Extract Band Energies ─────────────────────────────────
        double magA = 0; // Infectious band   (500–800 Hz)
        double magB = 0; // Non-infect band   (1200–2000 Hz)
        for (int i = BAND_A_START; i <= BAND_A_END; i++) {
            if (vReal[i] > magA) magA = vReal[i];
        }
        for (int i = BAND_B_START; i <= BAND_B_END; i++) {
            if (vReal[i] > magB) magB = vReal[i];
        }

        double snrA = magA / noiseFloor;
        double snrB = magB / noiseFloor;

        // ── Step 5: Classify ──────────────────────────────────────────────
        bool aTriggered = (snrA > SNR_THRESHOLD && magA > ABS_MAG_THRESHOLD);
        bool bTriggered = (snrB > SNR_THRESHOLD && magB > ABS_MAG_THRESHOLD);

        if (aTriggered || bTriggered) {
            // Dominant band determines type
            if (magA >= magB) {
                Serial.printf("🔴 INFECTIOUS COUGH | SNR: %.1f | MagA: %.0f | RMS: %.0f\n", snrA, magA, rms);
                return COUGH_INFECTIOUS;
            } else {
                Serial.printf("🟡 NON-INFECTIOUS COUGH | SNR: %.1f | MagB: %.0f | RMS: %.0f\n", snrB, magB, rms);
                return COUGH_NON_INFECTIOUS;
            }
        }

        // Sub-threshold logging for field tuning
        if (magA > ABS_MAG_THRESHOLD * 0.7 || magB > ABS_MAG_THRESHOLD * 0.7) {
            Serial.printf("🔍 Sub-threshold: SNR_A=%.1f SNR_B=%.1f NF=%.0f\n", snrA, snrB, noiseFloor);
        }

        return COUGH_NONE;
    }

    // Backwards-compatible wrapper — returns true if ANY cough detected
    bool detectCough(int16_t* buffer, size_t sampleCount) {
        return classifyCough(buffer, sampleCount) != COUGH_NONE;
    }
};

#endif
