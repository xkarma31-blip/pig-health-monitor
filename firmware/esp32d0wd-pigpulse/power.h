/**
 * PigPulse v1.0 - Power Management Header
 */

#ifndef POWER_H
#define POWER_H

#include <stdint.h>

typedef enum {
    POWER_NORMAL,
    POWER_LOW,
    POWER_CRITICAL
} PowerState;

typedef struct {
    float voltage;
    uint8_t percent;
    PowerState state;
    uint32_t bootCount;
    uint32_t totalReadings;
    uint32_t lastAlertFlags;
    float lastCenterTemp;
} PowerStatus;

void power_enterDeepSleep();
void power_wakeFromSleep();
void power_lightSleep(uint32_t durationMs);
PowerStatus power_getStatus();
uint32_t power_getBootCount();
uint32_t power_getTotalReadings();
void power_setLastAlertFlags(uint8_t flags);
void power_setLastCenterTemp(float temp);

#endif // POWER_H
