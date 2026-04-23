#ifndef THERMAL_IDENTIFICATION_H
#define THERMAL_IDENTIFICATION_H

#include "ThermalCamera.h"

/**
 * 🕵️ THERMAL IDENTIFICATION RITUAL
 * Purpose: Identify individual pigs using thermal signature patterns.
 * Method: 32x24 grid feature extraction & Edge Impulse Classification.
 */

class ThermalID {
public:
    // Export frame as CSV string for Edge Impulse Data Forwarder / Collection
    String frameToCSV(float* frame, int size) {
        String csv = "";
        for (int i = 0; i < size; i++) {
            csv += String(frame[i], 2);
            if (i < size - 1) csv += ",";
        }
        return csv;
    }

    // [FUTURE] This will house the Edge Impulse classification logic
    // int identifyPig(float* frame) {
    //    // signal_t signal;
    //    // numpy::signal_from_buffer(frame, 768, &signal);
    //    // ei_impulse_result_t result = { 0 };
    //    // run_classifier(&signal, &result, false);
    //    return -1; 
    // }

    void printDataForCollection(float* frame) {
        Serial.println("---BEGIN THERMAL FRAME---");
        Serial.println(frameToCSV(frame, 768));
        Serial.println("---END THERMAL FRAME---");
    }
};

#endif
