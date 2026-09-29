/**
 * PigPulse v2.0 - TinyML Cough Detector API
 * ESP32-D0WD pig cough classifier using TFLite Micro (mock model placeholder).
 *
 * Pipeline: pre-emphasis -> Hanning window -> 256-tap FFT -> 64 Mel bands -> 13 MFCCs
 *           -> TFLite Micro inference -> class + confidence
 *
 * Classes: 0=productive_cough, 1=non_cough, 2=environmental_noise
 */

#ifndef COUGH_DETECTOR_H
#define COUGH_DETECTOR_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================
// CONSTANTS
// ============================================================
#define COUGH_SAMPLE_RATE       16000
#define COUGH_FRAME_SAMPLES     16000  // 1 second at 16kHz
#define COUGH_FFT_SIZE          256
#define COUGH_MEL_BANDS         64
#define COUGH_MFCC_COUNT        13
#define COUGH_PREEMPH_ALPHA     0.97f
#define COUGH_MEL_FREQ_LOW      8.0f
#define COUGH_MEL_FREQ_HIGH     8000.0f
#define COUGH_MODEL_SIZE        51200  // ~50KB placeholder

// Class IDs
#define CLASS_PRODUCTIVE_COUGH  0
#define CLASS_NON_COUGH         1
#define CLASS_ENVIRONMENTAL_NOISE 2

// ============================================================
// TYPES
// ============================================================
typedef struct {
    int class_id;           // 0=productive_cough, 1=non_cough, 2=environmental_noise
    float confidence;       // 0.0 - 1.0
    const char* class_name; // human-readable label
} cough_result_t;

// ============================================================
// API
// ============================================================

/**
 * Initialize the cough detector.
 * Sets up lookup tables (Hanning, Mel filterbank, DCT) and verifies model data.
 * @return true on success, false on failure.
 */
bool cough_detector_init();

/**
 * Run inference on a 1-second audio frame.
 * @param audio_samples 16000 int16_t samples (1s @ 16kHz mono).
 * @return cough_result_t with class_id, confidence, and class_name.
 */
cough_result_t cough_detector_infer(int16_t* audio_samples);

/**
 * Get human-readable label for a class ID.
 * @param class_id 0, 1, or 2.
 * @return Label string ("unknown" for invalid IDs).
 */
const char* cough_detector_getLabel(int class_id);

#endif // COUGH_DETECTOR_H
