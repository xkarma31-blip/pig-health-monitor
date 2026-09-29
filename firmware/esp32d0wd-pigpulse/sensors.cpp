/**
 * PigPulse v1.0 - Sensor Drivers
 * MLX90640 thermal camera + INMP441 MEMS microphone(s) + battery ADC
 *
 * Notes:
 * - MLX90640 API is the Melexis-style driver (see downloads/mlx90640-custom-library):
 *     CalculateTo(frame, params, emissivity, Tr, result)  -- 5 args, no subpage.
 *     Chess mode interleaves subpages; two GetFrameData calls = one full image.
 * - INMP441 is standard I2S (NOT PDM). Mic1 = LEFT slot, Mic2 = RIGHT slot.
 * - All functions are fail-safe: sensor failure sets flags, never crashes.
 */

#include "sensors.h"
#include "config.h"
#include <Wire.h>
#include <WiFi.h>
#include <driver/i2s.h>
#include <math.h>

#include <MLX90640_I2C_Driver.h>
#include <MLX90640_API.h>

// ============================================================
// MLX90640 STATE
// ============================================================
static paramsMLX90640 mlxParams;
static uint16_t mlxFrame[834];          // raw frame (reused, saves stack)
static float lastThermalImage[32 * 24]; // last good frame for /thermal
static bool mlxHasFrame = false;
static bool mlxReady = false;
static float ambientTempEMA = 25.0f;
static uint32_t mlxFrames = 0;
static uint32_t mlxLastFrameMs = 0;
static char mlxErr[64] = "not initialized";

static void setMlxErr(const char *e) {
    strncpy(mlxErr, e, sizeof(mlxErr) - 1);
    mlxErr[sizeof(mlxErr) - 1] = '\0';
}

bool mlx_isReady() { return mlxReady; }
uint32_t mlx_frameCount() { return mlxFrames; }
const char *mlx_lastError() { return mlxErr; }
uint32_t mlx_lastFrameAgeMs() {
    if (!mlxHasFrame) return 0xFFFFFFFFUL;
    return millis() - mlxLastFrameMs;
}

// Cached thermal stats (single consistent snapshot for web + telemetry)
static float cachedCenter = 0, cachedMax = 0, cachedMin = 0;
static float cachedAvg = 0, cachedAmbient = 25.0f;
static uint16_t cachedMaxX = 0, cachedMaxY = 0;
static bool thermalCached = false;

// ============================================================
// BENCH DIAGNOSTIC - I2C SCAN
// ============================================================

void i2c_scanDiag() {
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(MLX_I2C_CLOCK_HZ);
    Wire.setTimeout(1000);
    DEBUG_PRINTLN("[I2C] Scanning bus (SDA=21 SCL=22)...");
    int found = 0;
    bool saw33 = false;
    for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            DEBUG_PRINTF("[I2C] ACK at 0x%02X\n", addr);
            found++;
            if (addr == MLX90640_ADDR) saw33 = true;
        }
    }
    DEBUG_PRINTF("[I2C] %d device(s) found\n", found);
    if (saw33) {
        DEBUG_PRINTLN("[I2C] MLX90640 PRESENT at 0x33 - wiring OK");
    } else {
        DEBUG_PRINTLN("[I2C] MLX90640 MISSING - check: 3V3 power, GND,");
        DEBUG_PRINTLN("[I2C]   SDA->G21 / SCL->G22 (not swapped),");
        DEBUG_PRINTLN("[I2C]   4.7k pull-ups SDA->3V3 and SCL->3V3");
    }
}

// Non-printing scan for /health (same bus walk, returns address list).
String i2c_scanAddrs() {
    String out;
    for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            if (out.length()) out += ' ';
            out += "0x" + String(addr, HEX);
        }
    }
    return out;
}

// ============================================================
// INMP441 STATE (single I2S port, stereo slots)
// ============================================================
static int16_t i2sBuffer[AUDIO_BUFFER_SIZE]; // 2 KB, interleaved L/R pairs
static float audioRMS = 0.0f;
static float audioRmsL = 0.0f; // LEFT slot  (pig mic, order per reference build)
static float audioRmsR = 0.0f; // RIGHT slot (noise-ref mic)
static uint16_t coughCount = 0;
static uint32_t lastCoughTime = 0;
static float distressFreq = 0.0f;
static bool i2sReady = false;
static char i2sErr[48] = "not initialized";

const char *inmp441_lastError() { return i2sErr; }

static void setI2sErr(esp_err_t code) {
    snprintf(i2sErr, sizeof(i2sErr), "code 0x%x", (unsigned)code);
}
// Waveform ring (latest 256 mono samples) + dead-input detector.
static int16_t waveRing[256];
static uint8_t waveIdx = 0;
// Per-slot dead-input state (LEFT=pig, RIGHT=ref).
static uint8_t stuckL = 0, stuckR = 0, railL = 0, railR = 0;
static bool slotDeadL = true, slotDeadR = true; // start pessimistic: prove alive
static bool audioStuck = true;
static uint32_t lastSoundL = 0, lastSoundR = 0; // last ms with real signal

bool audio_inputStuck() { return audioStuck; }
void audio_slotStuck(bool *l, bool *r) {
    if (l) *l = slotDeadL;
    if (r) *r = slotDeadR;
}
// Per-slot state: 0 = NO MIC (bit-constant or rail, certain),
// 1 = UNTESTED (flickers like a silent room, could be either: tap it),
// 2 = LIVE (real signal recently).
void audio_slotState(int *l, int *r) {
    uint32_t now = millis();
    if (l) *l = slotDeadL ? 0 : ((uint32_t)(now - lastSoundL) < 30000 ? 2 : 1);
    if (r) *r = slotDeadR ? 0 : ((uint32_t)(now - lastSoundR) < 30000 ? 2 : 1);
}

int audio_getWave(int16_t *out, int n) {
    if (out == NULL || n <= 0) return 0;
    if (n > 256) n = 256;
    for (int i = 0; i < n; i++)
        out[i] = waveRing[(waveIdx + 256 - n + i) % 256];
    return n;
}

// ============================================================
// MLX90640 DRIVER
// ============================================================

bool mlx90640_init() {
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(MLX_I2C_CLOCK_HZ);
    Wire.setTimeout(1000);

    Wire.beginTransmission(MLX90640_ADDR);
    if (Wire.endTransmission() != 0) {
        DEBUG_PRINTLN("[MLX90640] Not found at 0x33 (check SDA=21 SCL=22 3V3 GND)");
        setMlxErr("no ACK at 0x33: check power, SDA/SCL, pull-ups");
        mlxReady = false;
        return false;
    }

    uint16_t eeData[832];
    if (MLX90640_DumpEE(MLX90640_ADDR, eeData) != 0) {
        DEBUG_PRINTLN("[MLX90640] DumpEE failed");
        setMlxErr("DumpEE failed: wiring marginal or no pull-ups");
        mlxReady = false;
        return false;
    }
    if (MLX90640_ExtractParameters(eeData, &mlxParams) != 0) {
        DEBUG_PRINTLN("[MLX90640] ExtractParameters failed");
        setMlxErr("ExtractParameters failed");
        mlxReady = false;
        return false;
    }
    if (MLX90640_SetRefreshRate(MLX90640_ADDR, MLX_REFRESH_RATE) != 0) {
        DEBUG_PRINTLN("[MLX90640] SetRefreshRate failed");
        setMlxErr("SetRefreshRate failed");
        mlxReady = false;
        return false;
    }
    if (MLX90640_SetResolution(MLX90640_ADDR, MLX_RESOLUTION) != 0) {
        DEBUG_PRINTLN("[MLX90640] SetResolution failed");
        setMlxErr("SetResolution failed");
        mlxReady = false;
        return false;
    }
    if (MLX90640_SetChessMode(MLX90640_ADDR) != 0) {
        DEBUG_PRINTLN("[MLX90640] SetChessMode failed");
        setMlxErr("SetChessMode failed");
        mlxReady = false;
        return false;
    }

    mlxReady = true;
    setMlxErr("OK");
    DEBUG_PRINTLN("[MLX90640] Initialized (chess, 4Hz, 18-bit)");
    return true;
}

// Hottest 3x3 cluster average = pig-body estimate (robust to single-pixel
// noise from dust/humidity). Falls back to center 4px if frame is flat.
static float hotspotClusterAvg(const float *img, uint16_t *outX, uint16_t *outY) {
    float best = -1000.0f;
    uint16_t bx = 16, by = 12;
    for (uint8_t y = 0; y <= 24 - 3; y++) {
        for (uint8_t x = 0; x <= 32 - 3; x++) {
            float s = 0;
            for (uint8_t dy = 0; dy < 3; dy++)
                for (uint8_t dx = 0; dx < 3; dx++)
                    s += img[(y + dy) * 32 + (x + dx)];
            if (s > best) { best = s; bx = x + 1; by = y + 1; }
        }
    }
    if (outX) *outX = bx;
    if (outY) *outY = by;
    return best / 9.0f;
}

bool mlx90640_readFrame(float *image, float *ambient, float *center,
                        float *maxTemp, float *minTemp, float *avgTemp,
                        uint16_t *maxX, uint16_t *maxY) {
    if (!mlxReady || image == NULL) return false;

    // Two subpages = one complete 32x24 image (chess mode).
    for (uint8_t sub = 0; sub < 2; sub++) {
        if (MLX90640_GetFrameData(MLX90640_ADDR, mlxFrame) < 0) {
            setMlxErr("GetFrameData failed: loose wire or I2C too fast");
            DEBUG_PRINTLN("[MLX90640] GetFrameData failed");
            return false;
        }
        float ta = MLX90640_GetTa(mlxFrame, &mlxParams);
        float tr = ta - MLX_TA_SHIFT; // reflected-temp guard (see reference .ino)
        MLX90640_CalculateTo(mlxFrame, &mlxParams, MLX_EMISSIVITY, tr, image);
        if (sub == 1) *ambient = ta;
    }

    float sum = 0.0f;
    float mx = -100.0f, mn = 200.0f;
    uint16_t mxI = 0;
    for (uint16_t i = 0; i < 768; i++) {
        float t = image[i];
        sum += t;
        if (t > mx) { mx = t; mxI = i; }
        if (t < mn) mn = t;
    }
    *avgTemp = sum / 768.0f;
    *maxTemp = mx;
    *minTemp = mn;
    *maxX = mxI % 32;
    *maxY = mxI / 32;

    // Primary pig-body estimate: hottest 3x3 cluster (dust-robust).
    uint16_t hx, hy;
    float hot = hotspotClusterAvg(image, &hx, &hy);
    float center4 = (image[367] + image[368] + image[399] + image[400]) / 4.0f;
    // Use the hotter of cluster vs. optical center: pig may be off-center
    // in the 110x75deg pen view, but never report colder than aimed zone
    // when nothing warm is in frame (avoids false-normal on empty pen).
    *center = (hot > center4) ? hot : center4;

    // Cache for /thermal + snapshot readers
    memcpy(lastThermalImage, image, sizeof(lastThermalImage));
    mlxHasFrame = true;
    mlxFrames++;
    mlxLastFrameMs = millis();
    setMlxErr("OK");
    return true;
}

bool mlx90640_getLastFrame(const float **outImage, uint16_t *outLen) {
    if (!mlxHasFrame) return false;
    if (outImage) *outImage = lastThermalImage;
    if (outLen) *outLen = 768;
    return true;
}

void mlx90640_power(bool on) {
    digitalWrite(SENSOR_POWER_EN, on ? HIGH : LOW);
    if (on) delay(100); // MLX90640 boot stabilization
}

// ============================================================
// INMP441 DRIVER (standard I2S stereo, shared DOUT)
// ============================================================

bool inmp441_init() {
    // ONE port, stereo: LEFT slot = Mic 1 (pig), RIGHT slot = Mic 2 (ref).
    // With only Mic 1 fitted the RIGHT slot reads ~0 (mono fallback).
    i2s_config_t cfg = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = AUDIO_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = AUDIO_BUFFER_SIZE / 2, // frames (stereo => /2)
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };
    i2s_pin_config_t pins = {
        .bck_io_num = I2S_BCLK,
        .ws_io_num = I2S_LRCK,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_DOUT_SHARED
    };
    esp_err_t e = i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
    if (e != ESP_OK) {
        setI2sErr(e);
        DEBUG_PRINTF("[INMP441] I2S install failed: 0x%x\n", (unsigned)e);
        i2sReady = false;
        return false;
    }
    e = i2s_set_pin(I2S_NUM_0, &pins);
    if (e != ESP_OK) {
        setI2sErr(e);
        DEBUG_PRINTF("[INMP441] I2S pin config failed: 0x%x\n", (unsigned)e);
        i2s_driver_uninstall(I2S_NUM_0);
        i2sReady = false;
        return false;
    }
    i2s_zero_dma_buffer(I2S_NUM_0);
    i2sReady = true;
    strncpy(i2sErr, "OK", sizeof(i2sErr) - 1);
    DEBUG_PRINTLN("[INMP441] Stereo OK (BCLK=14 WS=15 DOUT=32)");
    return true;
}

// buf = interleaved L/R int16 pairs. RMS over both slots (pig + ref);
// cough gate on total energy; freq from mono-mix zero crossings.
static void processStereoBuffer(const int16_t *buf, int n) {
    if (n < 2) return;
    double ss = 0, ssL = 0, ssR = 0;
    int cross = 0;
    int16_t prevMix = 0;
    // Per-slot constancy: a dead mic reads one identical value forever.
    int16_t mnL = 32767, mxL = -32768, mnR = 32767, mxR = -32768;
    for (int i = 0; i + 1 < n; i += 2) {
        float l = (float)buf[i] / 32768.0f;
        float r = (float)buf[i + 1] / 32768.0f;
        ss += (double)l * l + (double)r * r;
        ssL += (double)l * l;
        ssR += (double)r * r;
        if (buf[i] < mnL) mnL = buf[i];
        if (buf[i] > mxL) mxL = buf[i];
        if (buf[i + 1] < mnR) mnR = buf[i + 1];
        if (buf[i + 1] > mxR) mxR = buf[i + 1];
        int16_t mix = (buf[i] / 2) + (buf[i + 1] / 2);
        waveRing[waveIdx] = mix; // feed the /wave scope
        waveIdx = (waveIdx + 1) % 256;
        if (i > 0 && ((mix >= 0) != (prevMix >= 0))) cross++;
        prevMix = mix;
    }
    // Per-slot dead verdicts. Three identical buffers in a row = no mic,
    // not silence (real silence still flickers a few LSBs).
    if (mnL == mxL) { if (stuckL < 255) stuckL++; } else stuckL = 0;
    if (mnR == mxR) { if (stuckR < 255) stuckR++; } else stuckR = 0;
    slotDeadL = (stuckL >= 3);
    slotDeadR = (stuckR >= 3);
    int pairs = n / 2;
    audioRMS = sqrtf((float)(ss / (2 * pairs)));
    audioRmsL = slotDeadL ? 0.0f : sqrtf((float)(ssL / pairs));
    audioRmsR = slotDeadR ? 0.0f : sqrtf((float)(ssR / pairs));
    // Signal recency per slot: RMS above the noise gate means this ear
    // genuinely heard something (tap = ground truth).
    uint32_t nowSnd = millis();
    if (!slotDeadL && audioRmsL > 0.02f) lastSoundL = nowSnd;
    if (!slotDeadR && audioRmsR > 0.02f) lastSoundR = nowSnd;
    // Rail-pegged slot (floating pin slammed to max) is also no-mic.
    if (audioRmsL > 0.9f) { if (railL < 255) railL++; } else railL = 0;
    if (audioRmsR > 0.9f) { if (railR < 255) railR++; } else railR = 0;
    if (railL >= 5) { slotDeadL = true; audioRmsL = 0.0f; }
    if (railR >= 5) { slotDeadR = true; audioRmsR = 0.0f; }
    // Combine only live slots: a dead slot's frozen value must not inflate
    // the energy reading. Global NO MIC only when BOTH ears are dead.
    if (slotDeadL && slotDeadR) { audioStuck = true; audioRMS = 0.0f; }
    else if (slotDeadL) { audioStuck = false; audioRMS = audioRmsR; }
    else if (slotDeadR) { audioStuck = false; audioRMS = audioRmsL; }
    else { audioStuck = false; /* combined RMS already set */ }

    uint32_t now = millis();
    if (audioRMS > COUGH_ENERGY_THRESHOLD && (now - lastCoughTime) > COUGH_COOLDOWN_MS) {
        coughCount++;
        lastCoughTime = now;
        DEBUG_PRINTF("[Audio] Cough #%u (rms=%.3f)\n", coughCount, audioRMS);
    }
    if (audioRMS > 0.01f) {
        distressFreq = (float)cross * AUDIO_SAMPLE_RATE / (2.0f * pairs);
    }
}

void inmp441_read() {
    if (!i2sReady) return;
    size_t bytes = 0;
    if (i2s_read(I2S_NUM_0, i2sBuffer, sizeof(i2sBuffer), &bytes,
                 pdMS_TO_TICKS(200)) == ESP_OK && bytes >= 4) {
        processStereoBuffer(i2sBuffer, bytes / 2);
    }
}

void inmp441_deinit() {
    if (i2sReady) { i2s_driver_uninstall(I2S_NUM_0); i2sReady = false; }
}

// Mono-mix tap for WAV clips. Returns samples written to out.
int audio_readMono(int16_t *out, int n) {
    if (!i2sReady || out == NULL || n <= 0) return 0;
    int filled = 0;
    uint32_t t0 = millis();
    while (filled < n && (millis() - t0) < 800) {
        size_t bytes = 0;
        if (i2s_read(I2S_NUM_0, i2sBuffer, sizeof(i2sBuffer), &bytes,
                     pdMS_TO_TICKS(200)) != ESP_OK || bytes < 4)
            break;
        int pairs = bytes / 4; // stereo frames of int16 pairs
        for (int i = 0; i < pairs && filled < n; i++) {
            out[filled++] = (int16_t)((i2sBuffer[2 * i] / 2) +
                                      (i2sBuffer[2 * i + 1] / 2));
        }
    }
    return filled;
}

// ============================================================
// BATTERY
// ============================================================

float battery_readVoltage() {
    uint32_t acc = 0;
    for (int i = 0; i < 16; i++) acc += analogRead(BATTERY_ADC_PIN);
    float vAdc = (acc / 16.0f) / ADC_RESOLUTION * ADC_REF_VOLTAGE;
    return vAdc * (BATTERY_R1 + BATTERY_R2) / BATTERY_R2;
}

uint8_t battery_getPercent(float voltage) {
    if (voltage >= BATTERY_FULL_VOLTAGE) return 100;
    if (voltage <= BATTERY_CRITICAL_VOLTAGE) return 0;
    float p = (voltage - BATTERY_CRITICAL_VOLTAGE) /
              (BATTERY_FULL_VOLTAGE - BATTERY_CRITICAL_VOLTAGE) * 100.0f;
    return (uint8_t)constrain(p, 0, 100);
}

// Divider present? Sample raw ADC for spread + sanity. Floating bench pins
// bounce rail-to-rail or sit saturated; a real divider is stable and mid-range.
bool battery_isPresent() {
    uint32_t mn = 4096, mx = 0, acc = 0;
    for (int i = 0; i < 16; i++) {
        uint32_t v = analogRead(BATTERY_ADC_PIN);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        acc += v;
        delay(3);
    }
    float avgRaw = acc / 16.0f;
    float vBatt = (avgRaw / ADC_RESOLUTION) * ADC_REF_VOLTAGE *
                  (BATTERY_R1 + BATTERY_R2) / BATTERY_R2;
    bool stable = ((mx - mn) < 250);            // ~0.2 V of spread max
    bool sane = (vBatt >= 2.5f && vBatt <= 4.5f);
    bool unsaturated = (avgRaw < 4000.0f);
    DEBUG_PRINTF("[Batt] present=%d v=%.2f spread=%u\n",
                 (int)(stable && sane && unsaturated), vBatt, (unsigned)(mx - mn));
    return (stable && sane && unsaturated);
}

// ============================================================
// AMBIENT (SOLAR-LOADING) COMPENSATION
// ============================================================

float ambient_compensate(float rawTemp, float ambient) {
#if AMBIENT_COMP_ENABLE
    ambientTempEMA = AMBIENT_COMP_ALPHA * ambient +
                     (1.0f - AMBIENT_COMP_ALPHA) * ambientTempEMA;
    // Tropical sun heats skin/fur above core: pull down proportionally
    // to how far ambient is above a 25C neutral reference.
    return rawTemp - (ambientTempEMA - 25.0f) * SOLAR_COMP_FACTOR;
#else
    (void)ambient;
    return rawTemp;
#endif
}

// ============================================================
// POWER RAIL + CACHE
// ============================================================

void sensors_powerUp() {
    pinMode(SENSOR_POWER_EN, OUTPUT);
    mlx90640_power(true);
    delay(200); // MLX90640 boot time
}

void sensors_powerDown() {
    mlx90640_power(false);
    inmp441_deinit();
}

float sensors_getAudioRMS() { return audioRMS; }
void audio_slotRMS(float *left, float *right) {
    if (left) *left = audioRmsL;
    if (right) *right = audioRmsR;
}
uint16_t sensors_getCoughCount() { return coughCount; }
float sensors_getDistressFreq() { return distressFreq; }
void sensors_resetCoughCount() { coughCount = 0; }
uint32_t sensors_lastCoughMs() { return lastCoughTime; }

void sensors_cacheThermal(float center, float maxT, float minT, float avgT,
                          float ambient, uint16_t maxX, uint16_t maxY) {
    cachedCenter = center; cachedMax = maxT; cachedMin = minT;
    cachedAvg = avgT; cachedAmbient = ambient;
    cachedMaxX = maxX; cachedMaxY = maxY;
    thermalCached = true;
}

void sensors_getReading(SensorReading *reading) {
    if (reading == NULL) return;
    reading->center_temp = thermalCached ? cachedCenter : 0;
    reading->max_temp = thermalCached ? cachedMax : 0;
    reading->min_temp = thermalCached ? cachedMin : 0;
    reading->avg_temp = thermalCached ? cachedAvg : 0;
    reading->ambient_temp = thermalCached ? cachedAmbient : ambientTempEMA;
    reading->max_x = cachedMaxX;
    reading->max_y = cachedMaxY;
    reading->audio_rms = audioRMS;
    reading->cough_count = coughCount;
    reading->distress_freq = distressFreq;
    reading->battery_voltage = battery_readVoltage();
    reading->battery_percent = battery_getPercent(reading->battery_voltage);
    reading->uptime_ms = millis();
    reading->free_heap = ESP.getFreeHeap();
    reading->wifi_rssi = WiFi.RSSI();
}
