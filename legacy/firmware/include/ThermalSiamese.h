#ifndef THERMAL_SIAMESE_H
#define THERMAL_SIAMESE_H

#include <Arduino.h>
#include <SPIFFS.h>
#include <FS.h>
#include <vector>
#include <math.h>

// ==========================================
// 🐖 ZERO-SHOT THERMAL IDENTITY (METRIC LEARNING)
// ==========================================
// Instead of classifying classes (Pig 1, Pig 2), we extract a 
// low-dimensional "embedding" vector representing the thermal signature.
// This allows identifying *new* pigs that were never in the training set.

#define EMBEDDING_SIZE 128
#define UNKNOWN_THRESHOLD 0.85f // If cosine similarity < 0.85, it's a new pig

struct ThermalEmbeddingRecord {
    char name[32];
    float embedding[EMBEDDING_SIZE];
};

class ThermalSiamese {
private:
    float currentEmbedding[EMBEDDING_SIZE];

    // Mock Feature Extractor (To be replaced by actual ESP-DL CNN inference)
    // A real Siamese CNN would take the 32x24 frame and output 128 floats.
    // For now, we perform a deterministic downsample/hash to simulate it.
    void extractFeatures(float* frame768, float* outEmbedding128) {
        // Average pooling from 768 to 128 (factor of 6)
        for (int i = 0; i < EMBEDDING_SIZE; i++) {
            float sum = 0;
            for (int j = 0; j < 6; j++) {
                sum += frame768[(i * 6) + j];
            }
            outEmbedding128[i] = sum / 6.0f;
        }

        // L2 Normalization (Crucial for Cosine Similarity)
        float magnitude = 0;
        for (int i = 0; i < EMBEDDING_SIZE; i++) {
            magnitude += outEmbedding128[i] * outEmbedding128[i];
        }
        magnitude = sqrt(magnitude);
        
        if (magnitude > 0) {
            for (int i = 0; i < EMBEDDING_SIZE; i++) {
                outEmbedding128[i] /= magnitude;
            }
        }
    }

    float cosineSimilarity(float* vecA, float* vecB, int size) {
        float dot = 0.0f;
        // Assuming L2 normalized vectors, dot product == cosine similarity
        for(int i = 0; i < size; i++) {
            dot += vecA[i] * vecB[i];
        }
        return dot;
    }

public:
    void begin() {
        if (!SPIFFS.begin(true)) {
            Serial.println("❌ SPIFFS Mount Failed");
        }
    }

    /**
     * Identify a pig, or return UNKNOWN if it's a new pig.
     */
    String identify(float* rawThermalFrame, float& outBestScore) {
        extractFeatures(rawThermalFrame, currentEmbedding);

        File file = SPIFFS.open("/embeddings.bin", FILE_READ);
        if(!file) return "UNKNOWN"; // No database

        ThermalEmbeddingRecord record;
        outBestScore = -1.0f;
        String bestName = "UNKNOWN";

        while(file.read((uint8_t*)&record, sizeof(ThermalEmbeddingRecord))) {
            float score = cosineSimilarity(currentEmbedding, record.embedding, EMBEDDING_SIZE);
            if(score > outBestScore) {
                outBestScore = score;
                bestName = String(record.name);
            }
        }
        file.close();

        // Zero-Shot Check: Does this embedding match known pigs strongly enough?
        if(outBestScore >= UNKNOWN_THRESHOLD) { 
            return bestName;
        }
        
        return "UNKNOWN";
    }

    /**
     * Save a new pig's embedding permanently (Enrollment)
     */
    bool enrollNewPig(String name, float* rawThermalFrame) {
        File file = SPIFFS.open("/embeddings.bin", FILE_APPEND);
        if(!file) return false;

        ThermalEmbeddingRecord record;
        memset(record.name, 0, 32);
        strncpy(record.name, name.c_str(), 31);
        
        extractFeatures(rawThermalFrame, record.embedding);

        file.write((uint8_t*)&record, sizeof(ThermalEmbeddingRecord));
        file.close();
        
        Serial.printf("✅ Zero-Shot Enrollment Complete: %s\n", record.name);
        return true;
    }
    
    void wipeDatabase() {
        SPIFFS.remove("/embeddings.bin");
        Serial.println("🗑️ Zero-Shot Identity Database Wiped.");
    }
};

#endif
