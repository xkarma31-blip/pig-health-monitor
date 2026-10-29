// Temporary USB diagnostic v10: register-level pad watch (GPIO viewer style).
// Mechanism: one REG_READ(GPIO_IN_REG) returns the instantaneous input level
// of GPIO0..31 (documented approach: alwint3r/esp-read-multiple-gpio-pins;
// live-view libs such as thelastoutpostworkshop/gpio_viewer poll the same
// state via WiFi at ~100 ms — too slow for I2S clocks, so we poll millions of
// times in short masked windows and tally transitions + duty per pad).
//
// Phases per pass:
//   A) I2S running (48 kHz, bck=5, ws=4, data_in=6; DMA left undrained so the
//      periph keeps clocking): WS/SCK frequency AT THE PADS + SD behaviour
//   B) I2S running after gpio_set_direction(4/5/6, INPUT_OUTPUT): re-measure in
//      case phase A was blocked by a disabled pad input buffer
//   C) I2S uninstalled, pads plain INPUT: the passive float state
//
// Watched pads: GPIO0..13 (BIT 0..13). USB 19/20 and flash 26..32 outside
// this range — nothing de-powered by the watch.
#include <Arduino.h>
#include <driver/gpio.h>
#include <driver/i2s.h>
#include <soc/gpio_reg.h>
#include <soc/io_mux_reg.h>
#include <esp_cpu.h>

// ---- v10f additions ----------------------------------------------------
// Draining flag: the drain task MUST own its exit. Deleting a task while
// it is blocked inside i2s_read leaves the driver's queue wait-list
// corrupted and wedges every subsequent i2s_read.
static volatile bool draining = false;
// CPU pulse calibrator: drives GPIO3 with a ~150 kHz square via W1TS/W1TC.
// Completing these transitions physically on the pad does not depend on
// I²S state, so a watch window that SEES GPIO3 oscillating proves the
// GPIO_IN_REG readback chain end-to-end.
static volatile bool pulsing = false;
static void pulseTask(void *) {
  const uint32_t BIT = (1UL << 3);
  while (pulsing) {
    REG_WRITE(GPIO_OUT_W1TS_REG, BIT);
    for (volatile int i = 0; i < 300; ++i) {}
    REG_WRITE(GPIO_OUT_W1TC_REG, BIT);
    for (volatile int i = 0; i < 300; ++i) {}
  }
  vTaskDelete(nullptr);
}

// Own-exit drain: foreground drains=false->task idles out cleanly.
static void drainTask(void *) {
  static int32_t sink[512];
  size_t got = 0;
  while (draining) {
    if (i2s_read(I2S_NUM_0, sink, sizeof(sink), &got, pdMS_TO_TICKS(50)) != ESP_OK)
      vTaskDelay(pdMS_TO_TICKS(10));
  }
  vTaskDelete(nullptr);
}

static void printI2sRegs() {
  Serial.printf("[i2sregs] RX_CLKM_CONF=0x%08x RX_CLKM_DIV=0x%08x RX_CONF=0x%08x\n",
                (unsigned)REG_READ(I2S_RX_CLKM_CONF_REG(0)),
                (unsigned)REG_READ(I2S_RX_CLKM_DIV_CONF_REG(0)),
                (unsigned)REG_READ(I2S_RX_CONF_REG(0)));
}

// Drain task: keeps the I2S RX DMA empty so the peripheral never auto-stops
// its clocks while the register watch runs on the other core.
static TaskHandle_t drainHandle = nullptr;

static const uint32_t WATCH_MASK = 0x00003FFFUL; // GPIO0..13
static const char *PN[14] = {
  "Boot", "IO1", "IO2", "IO3", "SCK4", "WS5", "SD6",
  "IO7", "SDA8", "SCL9", "IO10", "IO11", "IO12", "IO13"
};

static bool startI2S() {
  i2s_config_t cfg = {};
  cfg.mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = 48000;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT; // v10h: probe the other WS half
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;
  i2s_pin_config_t p = {};
  p.mck_io_num = I2S_PIN_NO_CHANGE;
  // v10g: firmware adapted to PHYSICAL wiring (Master 2026-10-17):
  // mic SCK/BCLK -> GPIO4, mic WS/LRCL -> GPIO5, mic SD -> GPIO6, L/R -> GND.
  // Everything before this point ran cross-clocked (bck=5/ws=4).
  p.bck_io_num = 4; p.ws_io_num = 5;
  p.data_out_num = I2S_PIN_NO_CHANGE; p.data_in_num = 6;
  esp_err_t e = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  if (e == ESP_OK) e = i2s_set_pin(I2S_NUM_0, &p);
  if (e == ESP_OK) e = i2s_start(I2S_NUM_0);
  if (e != ESP_OK) Serial.printf("[i2s] start: %s\n", esp_err_to_name(e));
  return e == ESP_OK;
}

struct Watch {
  uint32_t trans[14] = {0}, hi[14] = {0};
  uint32_t n = 0;
  uint32_t run6High = 0, run6Low = 0, maxHigh6 = 0, maxLow6 = 0;
  uint64_t cycles = 0;
  uint32_t prev = 0;

  void run(uint32_t iters) {
    const uint32_t CHUNK = 60000; // ≈5 ms masked per chunk: irq-wdt safe
    while (iters) {
      uint32_t k = iters < CHUNK ? iters : CHUNK;
      iters -= k;
      if (run6High > maxHigh6) maxHigh6 = run6High;
      if (run6Low > maxLow6) maxLow6 = run6Low;
      run6High = run6Low = 0;
      uint32_t t0 = esp_cpu_get_ccount();
      taskDISABLE_INTERRUPTS();
      for (uint32_t i = 0; i < k; ++i) {
        uint32_t cur = REG_READ(GPIO_IN_REG) & WATCH_MASK;
        uint32_t d = prev ^ cur;
        ++n;
        hi[0] += (cur >> 0) & 1;   hi[1] += (cur >> 1) & 1;   hi[2] += (cur >> 2) & 1;
        hi[3] += (cur >> 3) & 1;   hi[4] += (cur >> 4) & 1;   hi[5] += (cur >> 5) & 1;
        hi[6] += (cur >> 6) & 1;   hi[7] += (cur >> 7) & 1;   hi[8] += (cur >> 8) & 1;
        hi[9] += (cur >> 9) & 1;   hi[10] += (cur >> 10) & 1; hi[11] += (cur >> 11) & 1;
        hi[12] += (cur >> 12) & 1; hi[13] += (cur >> 13) & 1;
        if (d) {
          trans[0] += (d >> 0) & 1;  trans[1] += (d >> 1) & 1;  trans[2] += (d >> 2) & 1;
          trans[3] += (d >> 3) & 1;  trans[4] += (d >> 4) & 1;  trans[5] += (d >> 5) & 1;
          trans[6] += (d >> 6) & 1;  trans[7] += (d >> 7) & 1;  trans[8] += (d >> 8) & 1;
          trans[9] += (d >> 9) & 1;  trans[10] += (d >> 10) & 1; trans[11] += (d >> 11) & 1;
          trans[12] += (d >> 12) & 1; trans[13] += (d >> 13) & 1;
          prev = cur;
        }
        if ((cur >> 6) & 1) { if (++run6High > maxHigh6) maxHigh6 = run6High; run6Low = 0; }
        else { if (++run6Low > maxLow6) maxLow6 = run6Low; run6High = 0; }
      }
      taskENABLE_INTERRUPTS();
      cycles += (uint32_t)(esp_cpu_get_ccount() - (uint32_t)t0);
      delayMicroseconds(50); // let the RTOS breathe between masks
    }
  }

  void print(const char *phase) {
    double s = cycles / 240000000.0;
    Serial.printf("[watch] %-46s n=%lu dur=%.1fms  SD longest HIGH run=%lu LOW run=%lu\n",
                  phase, (unsigned long)n, s * 1000.0,
                  (unsigned long)maxHigh6, (unsigned long)maxLow6);
    if (!n || s <= 0) return;
    for (int p = 0; p < 14; ++p) {
      double pct = 100.0 * hi[p] / n;
      double freq = trans[p] / 2.0 / s;
      bool clockish = trans[p] > n / 50;
      Serial.printf("[watch] %5s hi=%5.1f%% trans=%9lu estHz=%10.0f %s\n",
                    PN[p], pct, (unsigned long)trans[p], freq,
                    clockish ? "TOGGLING" : "");
    }
    Serial.flush();
  }
};

// ---- Matrix ground-truth helpers --------------------------------------
static const uint32_t OUT_SEL_REG[14] = {
  GPIO_FUNC0_OUT_SEL_CFG_REG,  GPIO_FUNC1_OUT_SEL_CFG_REG,
  GPIO_FUNC2_OUT_SEL_CFG_REG,  GPIO_FUNC3_OUT_SEL_CFG_REG,
  GPIO_FUNC4_OUT_SEL_CFG_REG,  GPIO_FUNC5_OUT_SEL_CFG_REG,
  GPIO_FUNC6_OUT_SEL_CFG_REG,  GPIO_FUNC7_OUT_SEL_CFG_REG,
  GPIO_FUNC8_OUT_SEL_CFG_REG,  GPIO_FUNC9_OUT_SEL_CFG_REG,
  GPIO_FUNC10_OUT_SEL_CFG_REG, GPIO_FUNC11_OUT_SEL_CFG_REG,
  GPIO_FUNC12_OUT_SEL_CFG_REG, GPIO_FUNC13_OUT_SEL_CFG_REG
};
static const char *SIGNAME(uint32_t s) {
  switch (s) {
    case 22: return "I2S0O_BCK";
    case 24: return "I2S0O_WS";
    case 25: return "I2S0I_SD(lo)";
    case 26: return "I2S0I_BCK(lo)";
    case 27: return "I2S0I_WS(lo)";
    case 256: return "DIR-CPU";
    default:  return "";
  }
}
static void printOutMatrix() {
  Serial.println("[matrix] pad out_sel+SIGNAL / iomux ie/wpu/wpd");
  for (int p = 0; p < 14; ++p) {
    uint32_t r = REG_READ(OUT_SEL_REG[p]);
    uint32_t m = REG_READ(IO_MUX_GPIO0_REG + (p * 4)); // 4-byte stride GPIO0..13
    Serial.printf("[matrix] GPIO%d out_sel=%3u (%-11s) ie=%u wpu=%u wpd=%u iomux=0x%08x\n",
                  p, (unsigned)(r & 0x1FF), SIGNAME(r & 0x1FF),
                  (unsigned)((m >> 9) & 1),   // FUN_IE  (bit 9)
                  // 2026-10-19 FIX: these two were swapped. ESP32-S3 IO_MUX is
                  // FUN_WPU = bit 8, FUN_WPD = bit 7 (bit 9 = FUN_IE, unchanged).
                  // Proven empirically: gpio_set_pull_mode(PULLUP_ONLY) sets bit 8
                  // and reads 1; PULLDOWN_ONLY sets bit 7 and reads 0.
                  (unsigned)((m >> 8) & 1),   // FUN_WPU (bit 8)
                  (unsigned)((m >> 7) & 1),   // FUN_WPD (bit 7)
                  (unsigned)m);
  }
}

// v10k: electrical short probe — I2S off, CPU drives GPIO6; if the WS net (pad5)
// follows our drive in lockstep while an unrelated pad (GPIO9) floats, the two
// nets are one (short). No peripheral drivers active anywhere = zero contention.
static void shortProbe() {
  Serial.println("[probe] I2S OFF; CPU drives GPIO6 (pad5/pad9 as observers)");
  Serial.flush();
  // Input-enable on 5/6/9 (they may have ie=0 from earlier phases)
  REG_SET_BIT(IO_MUX_GPIO5_REG, 0x200);
  REG_SET_BIT(IO_MUX_GPIO6_REG, 0x200);
  REG_SET_BIT(IO_MUX_GPIO9_REG, 0x200);
  // GPIO6 as CPU output, matrix direct (default DIR-CPU), GPIO5/9 stay inputs
  gpio_set_direction(GPIO_NUM_6, GPIO_MODE_OUTPUT);
  const struct { const char *name; bool drive; bool level; } steps[] = {
    { "S1 drive6=LOW",  true,  false },
    { "S2 drive6=HIGH", true,  true  },
    { "S3 release6",    false, false },
  };
  for (const auto &st : steps) {
    digitalWrite(6, st.drive ? (st.level ? HIGH : LOW) : LOW);
    gpio_set_direction(GPIO_NUM_6,
                       st.drive ? GPIO_MODE_OUTPUT : GPIO_MODE_INPUT);
    delay(30);
    Watch w; w.run(240000); w.print(st.name);
  }
  Serial.println("[probe] symmetric: CPU drives GPIO5");
  Serial.flush();
  for (bool level : {false, true}) {
    digitalWrite(5, level ? HIGH : LOW);
    gpio_set_direction(GPIO_NUM_5, GPIO_MODE_OUTPUT);
    delay(30);
    Watch w; w.run(240000);
    w.print(level ? "S4 drive5=HIGH" : "S5 drive5=LOW");
    gpio_set_direction(GPIO_NUM_5, GPIO_MODE_INPUT);
  }
  Serial.flush();
  // v10L: before rewiring the mic onto new pins, drive-test the reroute
  // candidates (7/10/13) — if any of them is merged into the 5/6 net, the
  // spread-pin plan must pick different pins instead.
  Serial.println("[probe] v10L candidates: CPU drives GPIO7 / GPIO10 / GPIO13");
  Serial.flush();
  REG_SET_BIT(IO_MUX_GPIO7_REG, 0x200);
  REG_SET_BIT(IO_MUX_GPIO10_REG, 0x200);
  REG_SET_BIT(IO_MUX_GPIO13_REG, 0x200);
  for (int pad : {7, 10, 13}) {
    for (bool level : {false, true}) {
      digitalWrite((gpio_num_t)pad, level ? HIGH : LOW);
      gpio_set_direction((gpio_num_t)pad, GPIO_MODE_OUTPUT);
      delay(30);
      Watch w; w.run(240000);
      char nm[28];
      snprintf(nm, sizeof(nm), "D%d drive=%s", pad, level ? "HIGH" : "LOW");
      w.print(nm);
      Serial.flush();
    }
    gpio_set_direction((gpio_num_t)pad, GPIO_MODE_INPUT);
  }
  Serial.flush();
}

void setup() {
  Serial.begin(115200);
  delay(900);
  Serial.println("PAD-REGISTER-WATCH-v10 (GPIO_IN_REG, 240 MHz, chunked masks)");
  Serial.flush();
}

void loop() {
  static int pass = 0;
  ++pass;
  if (pass > 1) { delay(4000); return; }  // v10k: probe once, then idle
  Serial.printf("\n===== pass %d =====\n", pass);
  Serial.flush();

  shortProbe();
  Serial.println("\n[probe] done — full matrix for the record:");
  Serial.flush();
  printOutMatrix();
  Serial.flush();
}

