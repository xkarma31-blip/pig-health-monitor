#pragma once
#include <Wire.h>
#include <stdio.h>
#include <string.h>

// Opt-in only. No bus is initialized until the operator supplies actual pins.
// One address per loop; no measurement delays, heater commands or bus reset.
namespace ShtProbe {
static TwoWire bus(1);
static char line[48];
static size_t used = 0;
static bool overflow = false, initialized = false;
static unsigned nextAddress = 0;
static const uint8_t addresses[] = {0x44, 0x45, 0x40, 0x70};

inline bool safePin(int pin) {
  // Conservative S3 subset: exclude mic 4/5/6, USB 19/20, flash/PSRAM,
  // boot straps and pins not present on common Super Mini boards.
  return pin == 1 || pin == 2 || (pin >= 7 && pin <= 18);
}

inline void help() {
  Serial.println("[sht] Disabled until configured. Commands: sht pins SDA SCL | sht scan | sht off | sht help");
  Serial.println("[sht] Use ACTUAL wired GPIOs. ACK means device present, NOT model identified. Mic GPIO4/5/6 protected.");
}

inline void command() {
  int sda = -1, scl = -1;
  char extra;
  if (sscanf(line, "sht pins %d %d %c", &sda, &scl, &extra) == 2) {
    if (!safePin(sda) || !safePin(scl) || sda == scl) {
      Serial.println("[sht] Rejected: use two distinct supported GPIOs (1,2,7..18); check wiring first.");
      return;
    }
    nextAddress = 0;
    if (initialized) bus.end();
    initialized = bus.begin(sda, scl, 100000);
    bus.setTimeOut(5); // bounded transaction; not a zero-latency guarantee
    Serial.printf("[sht] SDA=%d SCL=%d 100kHz init=%s\n", sda, scl, initialized ? "OK" : "FAILED");
    if (initialized) nextAddress = 1;
  } else if (strcmp(line, "sht scan") == 0) {
    if (initialized) nextAddress = 1;
    else Serial.println("[sht] Set wired pins first: sht pins SDA SCL");
  } else if (strcmp(line, "sht off") == 0) {
    nextAddress = 0;
    if (initialized) bus.end();
    initialized = false;
    Serial.println("[sht] Bus disabled; pin selection is not saved across reboot.");
  } else {
    help();
  }
}

inline void tick() {
  // Bound serial work even if the host continuously sends input.
  for (unsigned n = 0; n < 16 && Serial.available(); ++n) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[used] = 0;
      if (overflow) Serial.println("[sht] Command too long; ignored.");
      else if (used) command();
      used = 0;
      overflow = false;
    } else if (used < sizeof(line) - 1) {
      line[used++] = c;
    } else overflow = true;
  }
  if (!initialized || !nextAddress) return;
  uint8_t address = addresses[nextAddress - 1];
  bus.beginTransmission(address);
  uint8_t result = bus.endTransmission();
  Serial.printf("[sht] address=0x%02X result=%u %s\n", address, result,
                result == 0 ? "ACK (model unverified)" : result == 2 ? "NO ACK" : "BUS ERROR");
  if (++nextAddress > sizeof(addresses)) {
    nextAddress = 0;
    Serial.println("[sht] Probe complete. No sensor measurement/model verification performed.");
  }
}
} // namespace ShtProbe
