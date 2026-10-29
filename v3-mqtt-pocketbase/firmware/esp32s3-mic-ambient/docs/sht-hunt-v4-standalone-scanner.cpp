// SHT / I2C HUNT v4 — net connectivity + capacitance + honest scan.
// NOTE on register bits (empirically proven in v3): FUN_WPD = bit7, FUN_WPU = bit8, FUN_IE = bit9.
// The repo diagnostic labels 7/8 the other way round.
#include <Arduino.h>
#include <soc/gpio_reg.h>
#include <soc/io_mux_reg.h>

static const int SCL_PIN = 9;
static const int SDA_PIN = 8;
static const int CAND[] = {1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18};
static const int NC = sizeof(CAND) / sizeof(CAND[0]);

static inline int lvl(int p) { return (int)((REG_READ(GPIO_IN_REG) >> p) & 1); }

static void hardFloat(int p) {
  pinMode(p, INPUT);
  gpio_set_pull_mode((gpio_num_t)p, GPIO_FLOATING);
  REG_CLR_BIT(GPIO_ENABLE_REG, (uint32_t)1 << p);
}
static void pullUp(int p)   { hardFloat(p); gpio_set_pull_mode((gpio_num_t)p, GPIO_PULLUP_ONLY); }
static void pullDown(int p) { hardFloat(p); gpio_set_pull_mode((gpio_num_t)p, GPIO_PULLDOWN_ONLY); }
static void driveLow(int p) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }

static void allFloat() { for (int i = 0; i < NC; ++i) hardFloat(CAND[i]); }
static void allFloatPlusMic() { allFloat(); hardFloat(4); hardFloat(5); hardFloat(6); }

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("=== SHT/I2C HUNT v4 (nets, capacitance, honest scan) ===");

  // ---- 1. Baseline stability of the true-float level ----
  allFloatPlusMic();
  delay(5);
  Serial.print("[base] true-float levels (no pulls at all): ");
  for (int i = 0; i < NC; ++i) Serial.printf("%d=%d ", CAND[i], lvl(CAND[i]));
  Serial.println();
  Serial.printf("[base] mic 4=%d 5=%d 6=%d\n", lvl(4), lvl(5), lvl(6));

  // ---- 2. Strongest possible external-pullup test: enemy pull-down ----
  // If an external pull-up beats the internal ~45k pull-down, the pin reads 1.
  allFloat();
  pullDown(SDA_PIN); pullDown(SCL_PIN);
  delay(10);
  Serial.printf("[ext?] with INTERNAL PULL-DOWN forced: SDA8=%d SCL9=%d  (1 => external pull-up present)\n",
                lvl(SDA_PIN), lvl(SCL_PIN));

  // ---- 3. Rise time with a KNOWN pull-up -> capacitance estimate ----
  for (int k = 0; k < 2; ++k) {
    int p = (k == 0) ? SDA_PIN : SCL_PIN;
    // 3a. with internal pull-up (~45k) = well-defined RC
    pullUp(p);
    driveLow(p); delay(2); hardFloat(p); pullUp(p);
    long t = 0; while (t < 500000 && lvl(p) == 0) { delayMicroseconds(1); t += 1; }
    Serial.printf("[cap] GPIO%d rise with 45k internal pull-up: %s\n", p,
                  t >= 500000 ? "NEVER (>500ms)" : (String(t) + " us").c_str());
    if (t < 500000 && t > 0) Serial.printf("[cap]   -> approx capacitance = %.1f nF (C = t/(2.2*45k))\n", t / (2.2 * 45000.0) * 1e6);
    // 3b. with NO pull-up at all = does it rise by itself?
    driveLow(p); delay(2); hardFloat(p);
    long t2 = 0; while (t2 < 2000000 && lvl(p) == 0) { delayMicroseconds(10); t2 += 10; }
    Serial.printf("[cap] GPIO%d rise with NO pull-up: %s\n", p,
                  t2 >= 2000000 ? "NEVER (>2s)" : (String(t2) + " us").c_str());
  }

  // ---- 4. NET CONNECTIVITY: sense-pin has a pull-up; drive each other pin low ----
  // Sense reads 0 only if the driver pin is electrically the same node.
  Serial.println("[nets] driving each pin LOW while sensing with a 45k pull-up ...");
  int found = 0;
  for (int i = 0; i < NC; ++i) {
    int s = CAND[i];
    for (int j = 0; j < NC; ++j) {
      int d = CAND[j];
      if (d == s) continue;
      allFloat();
      pullUp(s);
      driveLow(d);
      delay(1);
      int v = lvl(s);
      hardFloat(d);
      if (v == 0) {
        Serial.printf("[nets] *** GPIO%d reads 0 while GPIO%d is driven LOW  -> same net (or shorted)\n", s, d);
        ++found;
      }
    }
  }
  Serial.printf("[nets] %d coupled pair(s) found\n", found);

  // ---- 5. Honest I2C scan: internal pull-ups explicitly ON, open-drain ----
  pullUp(SDA_PIN); pullUp(SCL_PIN);
  delay(2);
  Serial.printf("[scan] bus idles SDA=%d SCL=%d (pull-ups on)\n", lvl(SDA_PIN), lvl(SCL_PIN));
  for (int k = 0; k < 9; ++k) { driveLow(SCL_PIN); delayMicroseconds(5); pullUp(SCL_PIN); delayMicroseconds(5); }
  Serial.println("[scan] bit-banged 1..126 ...");
  int ack = 0, nack = 0, to = 0;
  for (uint8_t a = 1; a < 127; ++a) {
    bool ok = true;
    driveLow(SDA_PIN); delayMicroseconds(5);
    pullUp(SCL_PIN); delayMicroseconds(5);
    for (int b = 7; b >= 0; --b) {
      driveLow(SCL_PIN); delayMicroseconds(5);
      if ((a << 1) & (1 << b)) pullUp(SDA_PIN); else driveLow(SDA_PIN);
      delayMicroseconds(5);
      pullUp(SCL_PIN); delayMicroseconds(5);
    }
    driveLow(SCL_PIN); delayMicroseconds(5);
    pullUp(SDA_PIN); delayMicroseconds(5);
    pullUp(SCL_PIN);
    long t = 0; while (t < 2000 && lvl(SCL_PIN) == 0) { delayMicroseconds(10); t += 10; }
    if (t >= 2000) { ok = false; ++to; }
    int ackbit = lvl(SDA_PIN);
    if (ok && ackbit == 0) { Serial.printf("[scan] *** ACK 0x%02X\n", a); ++ack; }
    else if (ok) ++nack;
    driveLow(SCL_PIN); delayMicroseconds(5); pullUp(SDA_PIN); delayMicroseconds(5);
  }
  Serial.printf("[scan] DONE ack=%d nack=%d scl_timeout=%d\n", ack, nack, to);
  Serial.println(ack ? "VERDICT: device(s) present on 8/9" : "VERDICT: no device ACKs on 8/9");

  Serial.println("=== v4 done — board idle ===");
}

void loop() { delay(5000); }
