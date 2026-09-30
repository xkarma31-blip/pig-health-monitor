/**
 * PigPulse v1.0 - Sensor Drivers Header
 * MLX90640 thermal camera + INMP441 MEMS microphone(s) + battery ADC
 *
 * Wiring (see config.h -- matches Master's bench-proven stereo setup):
 *   BCLK=GPIO14 (SCK both mics), LRCK=GPIO15 (WS both mics),
 *   DOUT=GPIO32 (SD of BOTH mics tied directly, tri-state shared).
 *   Mic 1 (pig): L/R -> GND (LEFT). Mic 2 (noise ref): L/R -> 3V3 (RIGHT).
 */

#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>
#include <stdint.h>
#include "types.h"

// --- MLX90640 ---
bool mlx90640_init();
// Full-frame read. image must hold 768 floats. Returns false on I2C/API error.
bool mlx90640_readFrame(float *image, float *ambient, float *center,
                        float *maxTemp, float *minTemp, float *avgTemp,
                        uint16_t *maxX, uint16_t *maxY);
// Bench diagnostic: scans I2C bus, prints every ACK address and a
// verdict for the MLX90640 (0x33). Call in config/bench mode at boot.
void i2c_scanDiag();
// Reads up to n mono-mixed samples (LEFT+RIGHT slots averaged) for WAV
// clips. Blocks briefly. Returns samples actually read (0 = mic dead).
int audio_readMono(int16_t *out, int n);
// True when the mic input looks dead (stuck pin / rail): dashboard shows
// NO MIC instead of a pegged 100% meter.
bool audio_inputStuck();
// Per-slot dead flags (LEFT=pig, RIGHT=ref). One mic can read NO MIC
// while the other stays LIVE.
void audio_slotStuck(bool *leftDead, bool *rightDead);
// Tri-state per slot: 0 = NO MIC (certain), 1 = UNTESTED (tap the mic),
// 2 = LIVE (real signal within 30 s).
void audio_slotState(int *leftState, int *rightState);
// Battery divider presence test: a real divider reads STABLE and in-range;
// a floating bench pin bounces rail-to-rail or saturates. Only a proven
// divider may authorize field (deep-sleep) mode.
bool battery_isPresent();
// Last I2S driver result as text (serial is unreliable on this bench;
// /health carries it instead). Never NULL.
const char *inmp441_lastError();
// Copies up to n recent waveform samples (oldest-first) for /wave.
int audio_getWave(int16_t *out, int n);
// Per-slot energy (LEFT=pig mic, RIGHT=noise-ref mic; order per reference
// build, tap-test to confirm). Powers the dual L/R bench meters.
void audio_slotRMS(float *left, float *right);
// Bench diagnostics
bool mlx_isReady();          // last init result
uint32_t mlx_frameCount();   // successful full-frame reads since boot
const char *mlx_lastError(); // short human-readable last error (never NULL)
uint32_t mlx_lastFrameAgeMs(); // ms since last good frame (UINT32_MAX = never)
// Live scan returning ACK addresses as "0x33 0x68..." ("" = none).
// Safe anytime; /health uses it so no reboot is needed to re-check wiring.
String i2c_scanAddrs();

// Read-only access to the last good frame (for the /thermal web endpoint).
// Returns false if no valid frame has been captured yet.
bool mlx90640_getLastFrame(const float **outImage, uint16_t *outLen);
void mlx90640_power(bool on);

// --- INMP441 ---
bool inmp441_init();
void inmp441_read();      // non-fatal: no-op if I2S not ready
void inmp441_deinit();

// --- Battery ---
float battery_readVoltage();
uint8_t battery_getPercent(float voltage);

// --- Ambient (solar-loading) compensation ---
float ambient_compensate(float rawTemp, float ambient);

// --- Sensor power rail ---
void sensors_powerUp();
void sensors_powerDown();

// --- Cached getters (populated by the sampling loop in the .ino) ---
float sensors_getAudioRMS();
uint16_t sensors_getCoughCount();
float sensors_getDistressFreq();
void sensors_resetCoughCount();
uint32_t sensors_lastCoughMs(); // millis() of last trip (0 = never)
// Fills *reading from the last cached thermal/audio values + fresh
// battery/RSSI/heap. Never blocks on I2C/I2S.
void sensors_getReading(SensorReading *reading);
// Called by the sampler after a successful averaged read so the web
// endpoints and telemetry share one consistent snapshot.
void sensors_cacheThermal(float center, float maxT, float minT, float avgT,
                          float ambient, uint16_t maxX, uint16_t maxY);

#endif // SENSORS_H
