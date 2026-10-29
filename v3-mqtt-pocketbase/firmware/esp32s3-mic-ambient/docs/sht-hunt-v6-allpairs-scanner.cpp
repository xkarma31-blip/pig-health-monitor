// SHT / I2C HUNT v6 — exhaustive: I2C scan 1..126 on EVERY safe ordered pin pair.
// v4 found pins 1,2,12,13 sit HIGH with all internal pulls off => external pull-ups.
// A pull-up pair is what an I2C bus looks like. So stop assuming 8/9; scan everything.
// Safety: mic 4/5/6 are NEVER driven and never used.
#include <Arduino.h>
#include <soc/gpio_reg.h>
#include <soc/io_mux_reg.h>

static const int PINS[] = {1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18};
static const int NP = sizeof(PINS) / sizeof(PINS[0]);

static int totalAck = 0;

static inline int lvl(int p) { return (int)((REG_READ(GPIO_IN_REG) >> p) & 1); }
static inline uint32_t padReg(int p) { return REG_READ(IO_MUX_GPIO0_REG + p * 4); }

static void hardFloat(int p) {
  pinMode(p, INPUT);
  gpio_set_pull_mode((gpio_num_t)p, GPIO_FLOATING);
  REG_CLR_BIT(GPIO_ENABLE_REG, (uint32_t)1 << p);
}
static void pullUp(int p)   { hardFloat(p); gpio_set_pull_mode((gpio_num_t)p, GPIO_PULLUP_ONLY); }
static void sdaLo(int p)    { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
static void sdaRel(int p)   { pullUp(p); }

static void allFloat() { for (int i = 0; i < NP; ++i) hardFloat(PINS[i]); }

// ---- one open-drain I2C address probe; returns 0=ACK 1=NACK 2=SCL timeout ----
static int probe(int sda, int scl, uint8_t addr) {
  pullUp(sda); pullUp(scl);
  // START
  sdaLo(sda); delayMicroseconds(2); sdaRel(sda); delayMicroseconds(2);
  int r = 1;
  for (int b = 7; b >= 0; --b) {
    if ((addr << 1) & (1 << b)) sdaRel(sda); else sdaLo(sda);
    delayMicroseconds(2);
    pullUp(scl); delayMicroseconds(2);
    if (!lvl(scl)) { r = 2; goto done; }
    hardFloat(scl);                            // pull SCL low
    delayMicroseconds(2);
  }
  sdaRel(sda); delayMicroseconds(2);
  pullUp(scl); delayMicroseconds(2);
  if (!lvl(scl)) { r = 2; goto done; }
  r = lvl(sda) == 0 ? 0 : 1;
  hardFloat(scl);
  delayMicroseconds(2);
done:
  sdaRel(sda); pullUp(scl); delayMicroseconds(2);
  return r;
}

static int scanPair(int sda, int scl) {
  int n = 0;
  for (uint8_t a = 1; a < 127; ++a) {
    int r = probe(sda, scl, a);
    if (r == 0) { Serial.printf("[HIT] SDA=%d SCL=%d addr=0x%02X (%u) ACK\n", sda, scl, a, a); ++n; ++totalAck; }
  }
  return n;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("=== SHT/I2C HUNT v6 — every safe ordered pin pair, 1..126 ===");
  Serial.printf("[cfg] %d pins -> %d ordered pairs\n", NP, NP * (NP - 1));

  // Which pins are held HIGH by something external? (internal pulls off)
  allFloat();
  delay(5);
  Serial.print("[ext-up] held HIGH with NO internal pull (=> external pull-up/driver): ");
  for (int i = 0; i < NP; ++i) if (lvl(PINS[i])) Serial.printf("GPIO%d ", PINS[i]);
  Serial.println();

  for (int i = 0; i < NP; ++i) {
    for (int j = 0; j < NP; ++j) {
      if (i == j) continue;
      int sda = PINS[i], scl = PINS[j];
      int n = scanPair(sda, scl);
      if (n) Serial.printf("[pair] SDA=%d SCL=%d -> %d device(s)\n", sda, scl, n);
      else   Serial.printf("[pair] SDA=%-2d SCL=%-2d -> none\n", sda, scl);
    }
  }
  allFloat();
  Serial.printf("=== TOTAL ACKs ACROSS ALL PAIRS: %d ===\n", totalAck);
  Serial.println(totalAck ? "VERDICT: an I2C device IS present on the pair(s) marked HIT"
                          : "VERDICT: no I2C device responds on ANY safe pin pair");
  Serial.println("=== v6 done — board idle ===");
}

void loop() { delay(5000); }
