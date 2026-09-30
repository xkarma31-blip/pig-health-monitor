/**
 * PigPulse v1.0 - Power Management
 * Deep sleep (5-min field cycle), RTC state, battery status.
 */

#include "power.h"
#include "config.h"
#include "sensors.h"
#include "wifi.h"
#include <Arduino.h>
#include <esp_sleep.h>
#include <driver/rtc_io.h>

// ============================================================
// RTC MEMORY (survives deep sleep; init only on power-on reset)
// ============================================================
RTC_DATA_ATTR static uint32_t bootCount = 0;
RTC_DATA_ATTR static uint32_t totalReadings = 0;
RTC_DATA_ATTR static uint32_t savedAlertFlags = 0;
RTC_DATA_ATTR static float savedCenterTemp = 0.0f;

// ============================================================
// DEEP SLEEP
// ============================================================

void power_enterDeepSleep() {
    DEBUG_PRINTLN("[Power] Deep sleep...");
    DEBUG_PRINTF("[Power] Wake in %llu s, readings=%u\n",
                 (unsigned long long)(SLEEP_DURATION_US / 1000000ULL),
                 (unsigned)totalReadings);

    totalReadings++; // count the reading that just completed
    // NOTE: savedAlertFlags / savedCenterTemp are written by
    // power_setLastAlertFlags() BEFORE this call -- do not clear here.

    wifi_stop();
    sensors_powerDown();

    // Keep sensor rail off in sleep (MOSFET gate low, hold through sleep)
    rtc_gpio_init((gpio_num_t)SENSOR_POWER_EN);
    rtc_gpio_set_direction((gpio_num_t)SENSOR_POWER_EN, RTC_GPIO_MODE_OUTPUT_ONLY);
    rtc_gpio_set_level((gpio_num_t)SENSOR_POWER_EN, 0);
    rtc_gpio_hold_en((gpio_num_t)SENSOR_POWER_EN);

    esp_sleep_enable_timer_wakeup(SLEEP_DURATION_US);
    // External trigger (PIR / reed switch) on GPIO33 if wired:
    // esp_sleep_enable_ext0_wakeup((gpio_num_t)33, 1);
    esp_deep_sleep_start();
    // never returns
}

void power_wakeFromSleep() {
    bootCount++;
    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    DEBUG_PRINTF("[Power] Boot #%u cause=%d (%s)\n", (unsigned)bootCount, (int)cause,
                 cause == ESP_SLEEP_WAKEUP_TIMER   ? "timer"
                 : cause == ESP_SLEEP_WAKEUP_EXT0  ? "ext0"
                 : cause == ESP_SLEEP_WAKEUP_EXT1  ? "ext1"
                 : cause == ESP_SLEEP_WAKEUP_TOUCHPAD ? "touch"
                                                   : "power-on");
    rtc_gpio_hold_dis((gpio_num_t)SENSOR_POWER_EN);
}

// ============================================================
// LIGHT SLEEP (keeps RAM; short naps only)
// ============================================================

void power_lightSleep(uint32_t durationMs) {
    esp_sleep_enable_timer_wakeup((uint64_t)durationMs * 1000ULL);
    esp_light_sleep_start();
}

// ============================================================
// STATUS / RTC ACCESS
// ============================================================

PowerStatus power_getStatus() {
    PowerStatus s;
    s.voltage = battery_readVoltage();
    s.percent = battery_getPercent(s.voltage);
    s.bootCount = bootCount;
    s.totalReadings = totalReadings;
    s.lastAlertFlags = savedAlertFlags;
    s.lastCenterTemp = savedCenterTemp;
    if (s.voltage <= BATTERY_CRITICAL_VOLTAGE) s.state = POWER_CRITICAL;
    else if (s.voltage <= BATTERY_LOW_VOLTAGE) s.state = POWER_LOW;
    else s.state = POWER_NORMAL;
    return s;
}

uint32_t power_getBootCount() { return bootCount; }
uint32_t power_getTotalReadings() { return totalReadings; }
void power_setLastAlertFlags(uint8_t flags) { savedAlertFlags = flags; }
void power_setLastCenterTemp(float temp) { savedCenterTemp = temp; }
