// SHT HUNT v8 — hardware I2C, correct lifecycle, and ERROR-CODE evidence.
// Key discriminator added: Wire.endTransmission() returns
//   0 = ACK   2 = NACK (bus works, nobody there)   3 = timeout   4 = other   5 = busy
// "0 devices" only means "no device" if those were NACKs. Timeouts would mean the
// bus itself did not work, and would invalidate the scan.
// Pinout source: docs/wiring/mkwiring.py lines 30-33 (SDA=8 SCL=9, 0x44)
//                and line 50 ("ALSO SAFE ... ambient: 1 / 2").
#include <Arduino.h>
#include <Wire.h>
#include <soc/gpio_reg.h>
#include <soc/io_mux_reg.h>

static const int PAIRS[][2] = {{1, 2}, {12, 13}, {2, 1}, {13, 12}, {8, 9}, {7, 10}, {8, 10}, {9, 1}};
static const int NPAIR = sizeof(PAIRS) / sizeof(PAIRS[0]);
static const uint8_t PROBEADDR[] = {0x44, 0x45, 0x23, 0x68, 0x76, 0x3C, 0x27, 0x50};

static inline uint32_t padReg(int p) { return REG_READ(IO_MUX_GPIO0_REG + p * 4); }

static void hardFloat(int p) {
  pinMode(p, INPUT);
  gpio_set_pull_mode((gpio_num_t)p, GPIO_FLOATING);
  REG_CLR_BIT(GPIO_ENABLE_REG, (uint32_t)1 << p);
}

static bool shtRead(uint8_t addr, float &tC, float &rh) {
  Wire.beginTransmission(addr);
  Wire.write(0x24); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(20);
  if (Wire.requestFrom((int)addr, 6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; ++i) b[i] = Wire.read();
  tC = -45.0f + 175.0f * (float)(((uint16_t)b[0] << 8) | b[1]) / 65535.0f;
  rh = 100.0f * (float)(((uint16_t)b[3] << 8) | b[4]) / 65535.0f;
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("=== SHT HUNT v8 — hardware I2C + error-code evidence ===");

  int totalAck = 0;
  for (int k = 0; k < NPAIR; ++k) {
    int sda = PAIRS[k][0], scl = PAIRS[k][1];
    Serial.printf("\n--- pair %d/%d  SDA=%d SCL=%d ---\n", k + 1, NPAIR, sda, scl);

    hardFloat(sda); hardFloat(scl);
    delay(2);
    int iSda = (REG_READ(GPIO_IN_REG) >> sda) & 1;
    int iScl = (REG_READ(GPIO_IN_REG) >> scl) & 1;
    uint32_t md = padReg(sda), mc = padReg(scl);
    Serial.printf("[pad] idle SDA=%d SCL=%d | SDA IE=%d WPU=%d WPD=%d | SCL IE=%d WPU=%d WPD=%d\n",
                  iSda, iScl, (int)((md >> 9) & 1), (int)((md >> 8) & 1), (int)((md >> 7) & 1),
                  (int)((mc >> 9) & 1), (int)((mc >> 8) & 1), (int)((mc >> 7) & 1));
    if (!iSda || !iScl) { Serial.println("[skip] not idling HIGH -> no pull-ups -> not a bus"); continue; }

    Wire.end();                       // <-- the bug in v7: re-begin without end() hung
    delay(5);
    Wire.begin(sda, scl, 100000);
    Wire.setTimeOut(50);

    // error codes first: this is what makes "0 devices" interpretable
    Serial.print("[code] endTransmission per address: ");
    int nack = 0, other = 0;
    for (unsigned i = 0; i < sizeof(PROBEADDR); ++i) {
      Wire.beginTransmission(PROBEADDR[i]);
      uint8_t rc = Wire.endTransmission();
      Serial.printf("0x%02X=%u ", PROBEADDR[i], rc);
      if (rc == 2) ++nack; else if (rc != 0) ++other;
    }
    Serial.printf(" | NACK=%d error=%d\n", nack, other);
    if (other > 0) Serial.println("[warn] non-NACK error -> bus may be unusable, results unreliable");

    int acked = 0;
    for (uint8_t a = 1; a < 127; ++a) {
      Wire.beginTransmission(a);
      if (Wire.endTransmission() == 0) { Serial.printf("[i2c] *** ACK 0x%02X\n", a); ++acked; }
    }
    Serial.printf("[i2c] pair %d/%d -> %d device(s)\n", sda, scl, acked);
    totalAck += acked;

    for (uint8_t addr : {(uint8_t)0x44, (uint8_t)0x45, (uint8_t)0x23}) {
      float t = 0, h = 0;
      if (shtRead(addr, t, h))
        Serial.printf("[SHT] 0x%02X replied: %.2f C  %.2f %%RH  <-- SENSOR ALIVE\n", addr, t, h);
    }
    Wire.end();
  }

  Serial.printf("\n=== TOTAL ACKs: %d ===\n", totalAck);
  Serial.println("=== v8 done — board idle ===");
}

void loop() { delay(5000); }
