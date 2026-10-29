#include <Arduino.h>
// SHT45 scanner v3 — SOFTWARE BIT-BANGED I2C on GPIO8/9 (SDA/SCL).
// Why bit-bang: the hardware I2C driver intermittently WEDGES forever when the
// bus glitches on this board (2026-10-19 run #2 froze inside Wire.endTransmission;
// run #1 completed passes). A bit-banged bus cannot hang: every edge is CPU-driven
// and a clamped line is readable/printable instead of fatal.
// Runs under [env:sht-scan] in platformio.usb-diagnostic.ini:
//   cd .../esp32s3_telemetry && pio run -c platformio.usb-diagnostic.ini -e sht-scan -t upload
// Pin map (Master): SHT45 SDA->GPIO8, SCL->GPIO9, VCC->3V3, GND->GND.

#include "driver/gpio.h"

// ========== SWAP TEST: roles inverted (2026-10-19) ==========
// Normal map per Master: SDA->GPIO8, SCL->GPIO9. Sensor never ACKs with that
// map, so this build tests the swapped hypothesis: SDA->GPIO9, SCL->GPIO8.
// If 0x44 ACKs here, a wire pair is physically swapped at one end.
#define SDA_PIN 9
#define SCL_PIN 8
// ================================================
#define HALF_US 50   // 50us half-period = ~10 kHz bus — forgiving of weak pull-ups

static void odEnable(int pin) {
  pinMode(pin, OUTPUT_OPEN_DRAIN);
  gpio_pullup_en((gpio_num_t)pin);   // ensure the released line actually goes high
}

static void busIdle() {
  odEnable(SCL_PIN); digitalWrite(SCL_PIN, HIGH);
  odEnable(SDA_PIN); digitalWrite(SDA_PIN, HIGH);
}

static void i2cStart() {
  // SDA falls while SCL high
  digitalWrite(SDA_PIN, HIGH); delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
  digitalWrite(SDA_PIN, LOW);  delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
}

static void i2cStop() {
  digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
  digitalWrite(SDA_PIN, LOW);  delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
  digitalWrite(SDA_PIN, HIGH); delayMicroseconds(HALF_US);
}

// returns ACK bit: 0 = ACKed, 1 = NACK
static uint8_t i2cWriteByte(uint8_t b) {
  odEnable(SDA_PIN);
  for (int i = 7; i >= 0; i--) {
    digitalWrite(SDA_PIN, (b >> i) & 1);
    delayMicroseconds(HALF_US);
    digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
    digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
  }
  // release SDA, clock the ACK bit in
  pinMode(SDA_PIN, INPUT_PULLUP);
  delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
  uint8_t ack = digitalRead(SDA_PIN);
  digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
  return ack;
}

// read one byte; masterACK=true pulls SDA low (more bytes follow), false = NACK (last byte)
static uint8_t i2cReadByte(bool masterACK) {
  pinMode(SDA_PIN, INPUT_PULLUP);
  uint8_t b = 0;
  for (int i = 7; i >= 0; i--) {
    delayMicroseconds(HALF_US);
    digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
    b |= (digitalRead(SDA_PIN) ? 1 : 0) << i;
    digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
  }
  odEnable(SDA_PIN);
  digitalWrite(SDA_PIN, masterACK ? LOW : HIGH);
  delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, HIGH); delayMicroseconds(HALF_US);
  digitalWrite(SCL_PIN, LOW);  delayMicroseconds(HALF_US);
  pinMode(SDA_PIN, INPUT_PULLUP);
  return b;
}

// Full SHT45 high-precision measurement: command 0x24 0x00, wait, read 6 bytes
static void shtRead(uint8_t addr) {
  i2cStart();
  i2cWriteByte(addr << 1);      // write
  i2cWriteByte(0x24);           // measure T/RH, high repeatability, clock stretching off
  i2cWriteByte(0x00);
  i2cStop();
  delay(20);                    // measurement time ~15 ms
  i2cStart();
  uint8_t ack = i2cWriteByte((addr << 1) | 1);  // read
  if (ack) { Serial.println("SHT read: NACK on read"); return; }
  uint8_t d[6];
  for (int i = 0; i < 6; i++) d[i] = i2cReadByte(i < 5);
  i2cStop();
  uint16_t rawT = ((uint16_t)d[0] << 8) | d[1];
  uint16_t rawH = ((uint16_t)d[3] << 8) | d[4];
  float t = -45.0f + 175.0f * rawT / 65535.0f;
  float h = 100.0f * rawH / 65535.0f;
  Serial.printf("SHT45 T=%.2f C  RH=%.2f %%  (raw %04x/%04x)\n", t, h, rawT, rawH);
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n\n========================================");
  Serial.println("  SHT45 BIT-BANG SCANNER v3 (GPIO8/9)");
  Serial.println("========================================");

  // manual bus recovery: release SDA, pulse SCL 10x, issue STOP
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, OUTPUT_OPEN_DRAIN);
  int sdaBefore = digitalRead(SDA_PIN);
  for (int i = 0; i < 10; i++) {
    digitalWrite(SCL_PIN, LOW);  delayMicroseconds(10);
    digitalWrite(SCL_PIN, HIGH); delayMicroseconds(10);
  }
  pinMode(SDA_PIN, OUTPUT_OPEN_DRAIN);
  digitalWrite(SDA_PIN, LOW); delayMicroseconds(10);
  pinMode(SDA_PIN, INPUT_PULLUP); delayMicroseconds(10);
  Serial.printf("[recovery] SDA before=%d after=%d (1=released 0=clamped)\n",
                sdaBefore, digitalRead(SDA_PIN));
  busIdle();
}

static uint32_t pass = 0;
void loop() {
  pass++;
  int sda = digitalRead(SDA_PIN);
  int scl = digitalRead(SCL_PIN);
  Serial.printf("--- bitbang pass %u (SDA=%d SCL=%d) ---\n", (unsigned)pass, sda, scl);
  uint8_t found[8]; uint8_t n = 0;
  for (uint8_t addr = 0x03; addr <= 0x77; addr++) {
    i2cStart();
    uint8_t ack = i2cWriteByte(addr << 1);   // write-transaction probe
    i2cStop();
    if (ack == 0) {
      Serial.printf("ACK at 0x%02x\n", addr);
      if (n < 8) found[n++] = addr;
    }
  }
  if (n == 0) Serial.println("pass done: no ACK (sensor silent)");
  else {
    Serial.printf("pass done: %u ACK(s)\n", n);
    for (uint8_t i = 0; i < n; i++)
      if (found[i] == 0x44) shtRead(0x44);   // real measurement attempt
  }
  delay(3000);
}
