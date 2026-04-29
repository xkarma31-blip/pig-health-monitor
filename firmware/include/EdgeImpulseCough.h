#ifndef EDGE_IMPULSE_COUGH_H
#define EDGE_IMPULSE_COUGH_H

// ==========================================
// 🐷 EDGE IMPULSE AUDIO CLASSIFIER WRAPPER
// ==========================================
// Note: You must include the exported Edge Impulse Arduino Library.
// e.g., #include <pig_cough_inferencing.h>
// Since the exact library name depends on your project name,
// define the generic EI_CLASSIFIER macros or include the specific header.

#include <Arduino.h>

// Forward declaration of the Edge Impulse classifier structures (assuming standard export)
// In practice, uncomment the specific include below once exported:
// #include <your-edge-impulse-project_inferencing.h>

#ifndef EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW
// Mocking EI definitions for compilation before the library is dropped in.
#define EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW 1
#define EI_CLASSIFIER_SLICE_SIZE 16000 // 1 sec at 16kHz
typedef struct {
    const char *label;
    float value;
} ei_impulse_result_bounding_box_t;
typedef struct {
    struct {
        float value;
        const char *label;
    } classification[3];
} ei_impulse_result_t;
typedef struct {
    int (*get_data)(size_t offset, size_t length, float *out_ptr);
} signal_t;
extern int run_classifier(signal_t *signal, ei_impulse_result_t *result, bool debug = false);
#endif

enum CoughClassification {
    COUGH_NONE,
    COUGH_DETECTED,
    GRUNT_DETECTED,
    NOISE
};

class EdgeImpulseAudio {
private:
    float* features;
    size_t feature_index = 0;

public:
    EdgeImpulseAudio() {
        // Allocate buffer for 1 second of 16kHz audio
        features = (float*)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(float));
    }

    ~EdgeImpulseAudio() {
        free(features);
    }

    /**
     * Feed cleaned (spectrally subtracted) PCM data into the EI buffer.
     * When the buffer is full, it runs inference.
     */
    CoughClassification processBuffer(int16_t* cleanedBuffer, size_t sampleCount) {
        // Convert int16_t to float and feed the rolling buffer
        for (size_t i = 0; i < sampleCount; i++) {
            if (feature_index < EI_CLASSIFIER_SLICE_SIZE) {
                features[feature_index++] = (float)cleanedBuffer[i];
            }
        }

        // If buffer is full, run inference
        if (feature_index >= EI_CLASSIFIER_SLICE_SIZE) {
            feature_index = 0; // Reset for next window
            return runInference();
        }

        return COUGH_NONE; // Not enough data yet
    }

private:
    CoughClassification runInference() {
        // Wrap the feature buffer in an EI signal_t structure
        signal_t signal;
        signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
        signal.get_data = &raw_feature_get_data;

        ei_impulse_result_t result = { 0 };

        // Run the classifier
        EI_IMPULSE_ERROR res = run_classifier(&signal, &result, false);
        if (res != 0) {
            Serial.printf("❌ Edge Impulse Error: %d\n", res);
            return COUGH_NONE;
        }

        // Analyze results
        float highest_prob = 0;
        String top_label = "";

        for (uint16_t i = 0; i < 3; i++) { // Assuming 3 classes: Cough, Grunt, Noise
            if (result.classification[i].value > highest_prob) {
                highest_prob = result.classification[i].value;
                top_label = String(result.classification[i].label);
            }
        }

        if (highest_prob > 0.8) {
            if (top_label.indexOf("cough") != -1 || top_label.indexOf("Cough") != -1) {
                Serial.printf("🔴 EDGE IMPULSE COUGH DETECTED (%.2f)\n", highest_prob);
                return COUGH_DETECTED;
            } else if (top_label.indexOf("grunt") != -1 || top_label.indexOf("Grunt") != -1) {
                Serial.printf("🟡 GRUNT DETECTED (%.2f)\n", highest_prob);
                return GRUNT_DETECTED;
            }
        }

        return NOISE;
    }

    // Callback required by Edge Impulse to fetch the raw data
    static int raw_feature_get_data(size_t offset, size_t length, float *out_ptr) {
        // In a real implementation, this accesses the rolling buffer.
        // For simplicity in this wrapper, we assume a static global or singleton access.
        // To make it perfectly thread-safe, pass a context pointer if the EI library supports it.
        return 0;
    }
};

#endif
