#ifndef THERMAL_IDENTIFICATION_H
#define THERMAL_IDENTIFICATION_H

#include "ThermalCamera.h"
#include <SPIFFS.h>
#include <FS.h>
#include <vector>
#include <math.h>

/**
 * 🕵️ THERMAL IDENTIFICATION RITUAL
 * Purpose: Identify individual pigs using normalized thermal signature patterns.
 * Method: Cosine Similarity on [0, 1] Min-Max Normalized 32x24 frames.
 */

struct PigRecord {
    char name[32];
    float embedding[768];
};

class ThermalID {
public:
    // Min-Max Normalization to make Re-ID robust to ambient temperature shifts
    void normalizeFrame(float* frame, float* normalized, int size) {
        float minT = 100.0, maxT = -100.0;
        for (int i = 0; i < size; i++) {
            if (frame[i] < minT) minT = frame[i];
            if (frame[i] > maxT) maxT = frame[i];
        }
        float range = maxT - minT;
        if (range < 0.1) range = 0.1; // Avoid division by zero
        for (int i = 0; i < size; i++) {
            normalized[i] = (frame[i] - minT) / range;
        }
    }

    String frameToCSV(float* frame, int size) {
        String csv = "";
        for (int i = 0; i < size; i++) {
            csv += String(frame[i], 2);
            if (i < size - 1) csv += ",";
        }
        return csv;
    }

    void printDataForCollection(float* frame) {
        Serial.println("---BEGIN THERMAL FRAME---");
        Serial.println(frameToCSV(frame, 768));
        Serial.println("---END THERMAL FRAME---");
    }

    static constexpr int MAX_ENROLLMENTS = 50;

    bool saveEnrollment(String name, float* frame) {
        if(!SPIFFS.begin(true)) return false;
        
        // Count existing records
        File countFile = SPIFFS.open("/roster.bin", FILE_READ);
        size_t count = 0;
        if (countFile) {
            count = countFile.size() / sizeof(PigRecord);
            countFile.close();
        }

        if (count >= MAX_ENROLLMENTS) {
            Serial.println("⚠️ SPIFFS Roster Full!");
            return false;
        }

        File file = SPIFFS.open("/roster.bin", FILE_APPEND);
        if(!file) return false;

        PigRecord record;
        memset(record.name, 0, 32);
        strncpy(record.name, name.c_str(), 31);
        normalizeFrame(frame, record.embedding, 768);

        file.write((uint8_t*)&record, sizeof(PigRecord));
        file.close();
        
        Serial.printf("✅ Enrolled: %s (Total: %d/%d)\n", record.name, count + 1, MAX_ENROLLMENTS);
        return true;
    }

    String identifyPig(float* currentFrame, float& outBestScore) {
        if(!SPIFFS.begin(true)) return "UNKNOWN";
        
        File file = SPIFFS.open("/roster.bin", FILE_READ);
        if(!file) return "NO_ROSTER";

        float normalizedCurrent[768];
        normalizeFrame(currentFrame, normalizedCurrent, 768);

        PigRecord record;
        outBestScore = -1.0;
        String bestName = "UNKNOWN";

        while(file.read((uint8_t*)&record, sizeof(PigRecord))) {
            float dot = 0, magA = 0, magB = 0;
            for(int i=0; i<768; i++) {
                dot += normalizedCurrent[i] * record.embedding[i];
                magA += normalizedCurrent[i] * normalizedCurrent[i];
                magB += record.embedding[i] * record.embedding[i];
            }
            float score = dot / (sqrt(magA) * sqrt(magB));

            if(score > outBestScore) {
                outBestScore = score;
                bestName = String(record.name);
            }
        }
        file.close();

        if(outBestScore > 0.95) { 
            return bestName;
        }
        
        return "UNKNOWN";
    }
};

#endif
