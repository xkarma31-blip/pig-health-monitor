/*
  INMP441 Mic + TCP Stream + MQTT for ESP32-S3 Super Mini
  --------------------------------------------------------
  Canonicalized from the local esp32s3_mic_telemetry reference, whose
  diagnostic strings were found in the device flash backup on 2026-10-13.
  Preserves WiFi/MQTT/TCP retries and 24-bit telemetry; fixes S16 conversion.
  The disabled USB clip recorder is intentionally not included.

  Wiring:
    INMP441 VDD  -> ESP32-S3 3.3V
    INMP441 GND  -> ESP32-S3 GND
    INMP441 L/R  -> GND (selects LEFT channel)
    INMP441 WS   -> GPIO5
    INMP441 SCK  -> GPIO4
    INMP441 SD   -> GPIO6
    SHT45 VCC/GND -> 3.3V/GND, SDA -> GPIO8, SCL -> GPIO9
*/

#include <driver/i2s.h>
#include <math.h>
#include <WiFi.h>
#include <esp_system.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <ArduinoOTA.h>

#include <lwip/sockets.h>
#include <errno.h>

// v10g 2026-10-17: matched to PHYSICAL wiring (Master, authoritative):
// mic SCK/BCLK -> GPIO4, mic WS/LRCL -> GPIO5, SD -> GPIO6, L/R -> GND.
// The old values (WS=4/SCK=5) were cross-clocking the mic against its pin roles.
#define I2S_WS   5
#define I2S_SCK  4
#define I2S_SD   6
#define I2S_PORT I2S_NUM_0

#define BUFFER_LEN 512
#define SAMPLE_RATE 48000
#define FULL_SCALE 8388608.0
// 2026-11-13 shtcache: the SHT45 ambient fragment is gated on the cached
// reading's age instead of the last attempt's outcome, and the measurement
// read waits 20 ms instead of 10 ms so it cannot beat the 8.5 ms conversion.
// The nowriteblock build it supersedes is the rollback image.
// shtdiag adds the six SHT45 failure-kind counters and the raised MQTT buffer.
#define FIRMWARE_ID "pigpulse-mic-sht45-20261113-shtfinal"

const char* WIFI_SSID = "PigPulse";
const char* WIFI_PASS = "capstone";
const char* MQTT_HOST = "192.168.69.1";
const uint16_t MQTT_PORT = 1883;
const char* TCP_HOST = "192.168.69.1";
const uint16_t TCP_PORT = 9090;
const char* DEVICE_ID = "s3-mic-01";

// --- OTA (experiment 20261108-104640-drop-fix-ota) -----------------------------
// Wireless firmware updates, so the USB cable is needed only ONCE (bootstrap).
// Password-protected so another device on the AP cannot push firmware by accident.
// Uses the ArduinoOTA protocol (UDP 3232, espota.py from the Arduino framework).
// mDNS is disabled: we always push by explicit IP, which saves flash/RAM and
// avoids mDNS chatter on the Pi's AP.
#define OTA_PASSWORD "pigpulse-ota-20261108"

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
WiFiClient tcpStream;
unsigned long lastMqttPub = 0;
unsigned long lastTcpConnect = 0;
unsigned long lastMqttTry = 0;
unsigned long lastWifiTry = 0;
unsigned long lastLinkMs  = 0;   // last time WL_CONNECTED was actually seen
unsigned long lastBpsMark = 0;
uint32_t tcpBytes = 0;
bool fmtPublished = false;
bool i2sReady = false;

// --- audio-drop fix (experiment 20261105-200212-i2s-tcp-drop-fix) ---------------
// The known-good baseline (KNOWN_GOOD.md) records "TCP throughput sometimes dips".
// Two silent drop paths cause it, and both were dropping audio with no retry:
//
//   (1) i2s_read() failing or returning 0 bytes  -> the batch was simply skipped
//   (2) tcp_send() while the socket is down       -> the batch was dropped under a
//       3-second cooldown, and a partial write lost the remainder
//
// Fix: retry the I2S read, and hold audio in a bounded ring buffer instead of
// dropping it, flushing as soon as the socket allows. Overflow still drops, but
// only the OLDEST bytes, and every drop is now counted and reported so the
// effect is measurable on the rig instead of invisible.
#define I2S_READ_RETRIES 3
#define I2S_RETRY_DELAY_MS 5
#define TX_BUF_SZ 65536   // 680 ms of audio at 96,000 B/s (was 340 ms)

// 20261111: the old TCP stall watchdog lived here and was removed — see the
// long comment in tcp_flush(). availableForWrite() on WiFiClient is inherited
// from Print and always returns 0, so the watchdog killed a healthy socket
// every 15 s. `tcpReconnects` is kept instead: it counts how many times the
// audio socket had to be rebuilt, which is the number that actually matters.
static uint32_t tcpReconnects = 0;
// 20261113: BLOCKING-TIME INSTRUMENTATION.
// The audio loop stalls for ~5 s at a time while the board stays associated
// and does NOT reboot (boots/rr constant, 0 hostapd deauths) - so the stall
// is a BLOCKED WRITE, not a link loss. These counters say which one:
//   pubms : longest mqtt.publish()   (the MQTT task)
//   wrms  : longest tcpStream.write() (the AUDIO task)
static uint32_t gPubMs = 0, gWrMs = 0, gPubN = 0, gWrN = 0;

// --- 20261111: BROWNOUT DETECTOR --------------------------------------------
// The board is USB-powered from a DIY 5 V brick with mixed cables. The ESP32-S3
// peaks around 500-600 mA while transmitting at 19.5 dBm - roughly 3x what it
// drew at 8.5 dBm. On a supply with a volt or two of series resistance, that
// current spike pulls the 3.3 V rail under the brownout threshold, the chip
// resets, and the WiFi link drops. That matches what the AP sees: the camera
// holds MCS 7 while the ESP only reaches MCS 1 and deauths 54 times an hour.
//
// RTC_DATA_ATTR survives a RESET but not a power cycle, so:
//   boot count rising + reset reason 15/16 (brownout) => the RAIL SAGGED
//   boot count rising + reset reason 1  (power on)  => the SUPPLY DROPPED OUT
// That distinction is the whole diagnosis, and it costs nothing but a counter.
RTC_DATA_ATTR static uint32_t gBootCount = 0;
RTC_DATA_ATTR static uint32_t gLastReason = 0;
static uint32_t gReasonThisBoot = 0;
static bool     gBrownoutSeen = false;
// 20261111: the Pi sends a heartbeat byte every 2 s on the audio socket.
#define TCP_PEER_TIMEOUT_MS 8000UL
static unsigned long lastPeerByteMs = 0;

// --- 20261111: digital mic gain + AGC --------------------------------------
// WHY THIS EXISTS (measured, not guessed):
//
// The INMP441 is a 24-bit MEMS mic. The old output path did
//     monoBuf[i] = (int16_t)(rawBuffer[i] >> 16);
// which keeps the top 16 bits of the 24-bit sample and THROWS THE REST AWAY.
// On top of that the signal was simply too quiet to begin with:
//
//     measured at the browser (16 kHz mono, the real consumer):
//       peak = 992 / 32767   = -30.4 dBFS
//       rms  = 166 / 32767   = -45.9 dBFS
//       zero samples = 0.3%
//
// That is -46 dBFS RMS on a recording you are meant to listen to and classify.
// There was 30.4 dB of headroom before clipping and nobody was using any of it.
//
// THE STAGE:
//   1. keep the full 24-bit sample (we have the bits, use them)
//   2. apply a linear digital gain
//   3. peak-targeting AGC: a fast attack (so a squeal can never clip) and a
//      slow release (so the gain does not pump between batches)
//   4. hard clamp at the 16-bit rail, with the clipped count reported so the
//      gain stage is never silently eating transients.
//
// The AGC target is settable at runtime over MQTT:
//     mosquitto_pub -h 127.0.0.1 -t "pig/s3-mic-01/cmd/gain" -m "-6"
// (-6 = aim the output PEAK at -6 dBFS). -1 = loudest, -24 = quietest.
// No reflash needed to change the level.

static uint32_t micClipped   = 0;       // samples that hit the 16-bit rail
static int32_t  micOutPeak   = 0;       // output peak, 16-bit scale
static int32_t  micOutMin    = 0;       // output min, 16-bit scale (sign check!)
static int32_t  micOutMax    = 0;       // output max, 16-bit scale
static int32_t  micSrcMin    = 0;       // source min, 16-bit scale (sign check!)
static int32_t  micSrcMax    = 0;       // source max, 16-bit scale

// --- DC blocker -------------------------------------------------------------
// MEASURED (2026-11-11): with the gain stage in place the output carried a
// DC offset of ~2710 (16-bit scale) against a peak of 20812 — 13% of the
// waveform sitting above the signal. That is the INMP441's MEMS bias, and it
// is wasted 16-bit range: it steals headroom, makes the AGC's peak detector
// aim at the bias instead of the sound, and makes the stream click when it
// starts.
//
// One-pole high-pass: y[n] = x[n] - x[n-1] + R*y[n-1]
//
// MEASURED (2026-11-11): the FIRST version of this filter was fixed-point
// (Q16) and it DID NOT WORK. It produced a constant -91 offset on the output
// regardless of the input, and the simulated fix pointed straight at why:
//
//     (-99 * 65179) >> 16  ==  -99        <- a FIXED POINT
//
// With R = 0.99478 the filter only decays a sample by 0.5% per step, but
// the integer multiply-and-shift rounds DOWN, so any value whose magnitude is
// below 65536/357 = 183 never decreases at all. The filter therefore added a
// permanent -91 to everything it passed, and the AGC amplified it.
//
//   integer filter: source DC -99 -> output mean -91.3  (not removed)
//   float   filter: source DC -99 -> output mean  -0.1  (removed)
//
// The fix is to keep the two filter state values in FLOAT. The ESP32-S3 has
// an FPU and this is 48,000 multiply-adds per second, which is nothing.
//
//   corner = -ln(R) * fs / (2*pi) = 40 Hz at 48 kHz
#define MIC_HP_R 0.994777f
static float micHpX1 = 0.0f;   // x[n-1]
static float micHpY1 = 0.0f;   // y[n-1]
static int32_t micDcAvg = 0;   // slow average of the source, for reporting

// 20261111: audio-rate instrumentation.
// The Pi can only see what ARRIVED. These counters say what the ESP actually
// produced, so a shortfall can be attributed to the right layer:
//   sps    = samples/second produced by the I2S read  (must be 48000)
//   batch  = average samples per i2s_read() call     (must be 512 = BUFFER_LEN)
//   bps    = bytes/second actually written to the socket (must be 96000)
// If sps == 48000 but bps < 96000 -> the radio/link is losing frames.
// If sps < 48000 and batch < 512     -> the audio loop is too slow (DMA overrun).
// If sps < 48000 and batch == 512     -> the I2S clock itself is off.
static uint32_t sampTotal = 0;        // samples produced since the last mark
static uint32_t sampBatchSum = 0;     // sum of samples per i2s_read call
static uint32_t sampBatchN = 0;       // number of i2s_read calls
static unsigned long sampMarkMs = 0;  // millis() at the last publish
static uint32_t tcpBytesTotal = 0;    // bytes written to the socket since mark
static unsigned long tcpMarkMs = 0;

static uint8_t txBuf[TX_BUF_SZ];
static volatile uint16_t txHead = 0, txTail = 0, txLen = 0;
static uint32_t i2sReadFails = 0;     // i2s_read failures after all retries
static uint32_t i2sReadRetries = 0;   // reads that needed >1 attempt
static uint32_t txDroppedBytes = 0;   // bytes discarded by overflow (oldest first)
static uint32_t txPartialWrites = 0;  // writes that could not drain the buffer

bool shtBusReady = false;
// shtValid means "we hold a good reading" -- it is set on success and is NOT
// cleared by a failed attempt. Before 2026-11-13 it was cleared by every
// transient failure, which meant the publish gate below (see publish_telemetry)
// dropped the ambient fragment on roughly half of all messages even though a
// perfectly good reading was still cached. See the KNOWN_GOOD.md entry of
// 2026-11-13 for the measurement.
bool shtValid = false;
// 2026-11-13 (3rd pass): the failure is at the BUS, not in the timing. The
// counters from the shtdiag build on the live board:
//     srf:34  sfs:9  sfc:6  sfw:19  sle:2  sdt:22  slr:182
//   - sfw=19 with sle=2 (NACK on address): the SHT45 did not acknowledge its
//     own address at all -- a marginal physical connection, not a timing
//     race. sdt=22 proves the command->read delay is now correct.
//   - sfs=9 (short read) and sfc=6 (CRC mismatch, last CRC byte 182 = real
//     data, not 255) are the same fault seen mid-transaction.
// So the fix is resilience, not more waiting: retry a failed cycle quickly
// (a transient NACK usually clears on the next try) and stop blanking the
// reading when a cycle or two is lost.
uint32_t shtReadFails = 0;
uint32_t shtFailsShort = 0;
uint32_t shtFailsCrc = 0;
uint32_t shtFailsCmd = 0;
uint8_t shtLastErr = 0;
uint32_t shtLastDelay = 0;
uint8_t shtLastCrcByte = 0;
// Consecutive failed cycles across ALL failure kinds; drives the bus reset.
uint8_t shtConsecFails = 0;
// Fast retries inside the current measure cycle (the sensor NACKs, we try
// again in 8 ms, up to three times, then wait the full 2 s).
uint8_t shtCmdRetries = 0;
uint32_t shtBusResets = 0;

// SHT45 I2C clock.
//
// 2026-11-13: the clock was A/B tested as a hypothesis for the NACKs and the
// hypothesis was WRONG. Over comparable 145 s windows, with sfw (command
// NACKs, sle=2) still the dominant failure throughout:
//     100 kHz (baseline)  srf  ~130  sfw ~75
//      50 kHz ("shtbus")  srf  123   sfw 70   sfs 34   sfc 19
//      10 kHz ("sht10k")  srf  98   sfw 46   sfs 25   sfc 27
// A 10x reduction in the clock did not clear the address NACKs, so the fault
// is NOT rise-time or bus capacitance -- it is a physical connection fault.
// The clock therefore stays at 100 kHz: it is the fastest, it keeps the
// blocking I2C time inside the loop shortest (~1.5 ms vs ~7 ms at 10 kHz,
// against a 10.7 ms I2S buffer), and there is no measured reason to slow it.
//
// The timeout raise and the bus reset ARE kept -- they are free and they
// cover a genuinely wedged bus.
#define SHT_I2C_HZ 100000

// 2026-11-13: after enough consecutive failures, rebuild the I2C peripheral.
// A bus that has been mis-framed -- a NACK mid-transaction can leave the
// peripheral's state machine out of step -- often clears on a re-init even
// when the wiring itself is marginal. Cheap, and it costs nothing when the
// bus is healthy because it only runs after repeated failures.
void sht_bus_recover() {
  if (shtConsecFails < 6) return;
  shtConsecFails = 0;
  shtCmdRetries = 0;
  Wire.end();
  delay(2);
  shtBusReady = Wire.begin(8, 9, SHT_I2C_HZ);
  Wire.setTimeOut(50);
  shtBusResets++;
  Serial.printf("[sht45] I2C bus reset (ready=%d)\n", shtBusReady);
}
// How long a cached reading stays publishable. Pen temperature/humidity
// moves slowly, so a long window is honest -- and `sage` publishes the real
// age of the value so the consumer can see it.
#define SHT_MAX_STALE_MS 30000
float shtTemperature = 0, shtHumidity = 0;
unsigned long shtLastGood = 0;

uint8_t sht_crc(uint8_t a, uint8_t b) {
  uint8_t crc = 0xff;
  const uint8_t data[] = {a, b};
  for (uint8_t value : data) {
    crc ^= value;
    for (int bit = 0; bit < 8; ++bit)
      crc = (crc & 0x80) ? (crc << 1) ^ 0x31 : crc << 1;
  }
  return crc;
}

void sht_task() {
  static unsigned long started = 0;
  static bool pending = false;
  if (!shtBusReady) return;
  if (pending) {
    // The SHT45 high-precision conversion takes up to 8.5 ms and the old 10 ms
    // margin left only ~1.5 ms for I2C and Wi-Fi jitter -- enough to read before
    // the conversion finished and fail the CRC. 20 ms clears the race; reading
    // late is safe because a new measurement only starts on a new command.
    if (millis() - started < 20) return;
    pending = false;
    shtLastDelay = millis() - started;
    uint8_t data[6];
    if (Wire.requestFrom((uint8_t)0x44, (uint8_t)6) != 6) {
      shtReadFails++;
      shtFailsShort++;
      shtConsecFails++;
      // Come back in 8 ms instead of 2 s: the bus fault is transient and a
      // quick retry usually succeeds.
      started = millis() - 1992;
      sht_bus_recover();
      Serial.println("[sht45] short/failed measurement read");
      return;
    }
    for (auto &value : data) value = Wire.read();
    shtLastCrcByte = data[2];
    bool crcOk = sht_crc(data[0], data[1]) == data[2] &&
                 sht_crc(data[3], data[4]) == data[5];
    if (!crcOk) {
      shtReadFails++;
      shtFailsCrc++;
      shtConsecFails++;
      started = millis() - 1992;
      sht_bus_recover();
      Serial.println("[sht45] CRC failed");
      return;
    }
    shtValid = true;
    shtTemperature = -45.0f + 175.0f * ((data[0] << 8) | data[1]) / 65535.0f;
    shtHumidity = constrain(-6.0f + 125.0f * ((data[3] << 8) | data[4]) / 65535.0f, 0.0f, 100.0f);
    shtLastGood = millis();
    shtConsecFails = 0;
    shtCmdRetries = 0;
    Serial.printf("[sht45] temperature=%.2f C humidity=%.2f %% CRC=OK\n", shtTemperature, shtHumidity);
  } else if (millis() - started >= 2000) {
    started = millis();
    Wire.beginTransmission(0x44);
    Wire.write(0xfd); // High precision, heater off; conversion finishes asynchronously.
    uint8_t error = Wire.endTransmission();
    pending = error == 0;
    if (!pending) {
      shtReadFails++;
      shtFailsCmd++;
      shtLastErr = error;
      shtConsecFails++;
      // The sensor NACKs its own address on a marginal bus. Retry in 8 ms --
      // up to 3 times -- before falling back to the full 2 s cadence. A
      // transient NACK usually clears on the next attempt.
      shtCmdRetries++;
      if (shtCmdRetries >= 3) {
        shtCmdRetries = 0;
        started = millis();
      } else {
        started = millis() - 1992;
      }
      sht_bus_recover();
      Serial.printf("[sht45] address=0x44 SDA=8 SCL=9 I2C error=%u (2=NACK)\n", error);
    } else {
      shtConsecFails = 0;
      shtCmdRetries = 0;
    }
  }
}

void i2s_install() {
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = BUFFER_LEN,
    .use_apll = false
  };
  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2sReady = err == ESP_OK;
  if (!i2sReady) Serial.printf("[i2s] driver_install: %s\n", esp_err_to_name(err));
}

void i2s_set_pins() {
  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  esp_err_t err = i2s_set_pin(I2S_PORT, &pin_config);
  i2sReady = i2sReady && err == ESP_OK;
  if (err != ESP_OK) Serial.printf("[i2s] set_pin: %s\n", esp_err_to_name(err));
}

void wifi_connect() {
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP)
      Serial.printf("[wifi] IP=%s\n", WiFi.localIP().toString().c_str());
    // removed: per-event "disconnected reason" printf — spammed the serial
    // from the event context on every no-AP retry and smashed IDLE1's stack
    // canary (Interrupt WDT panic on CPU1, 2026-10-19 capture).
  });
  WiFi.mode(WIFI_STA);
  // 20261110: disable modem sleep.
  // Measured on the Pi's socket: snd_wnd 5760 B with rtt 47.7 ms (and rcv_rtt
  // spiking to 416 ms). Throughput is capped at window/RTT:
  //   5760/0.0477 = 120.7 KB/s   (observed max 130.9 KB/s)
  //   5760/0.416  =  13.8 KB/s   (observed min  14.0 KB/s)
  // Stereo needs 192 KB/s, so the spikes starve the stream. Modem sleep is the
  // usual source of those 100-400 ms latency spikes; AP DTIM period is 2.
  // Cost: higher idle current. The barn board is USB powered, so acceptable.
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  // Match the running Super Mini firmware's RF power setting.
  WiFi.disconnect(false, false);
  int networks = WiFi.scanNetworks();
  Serial.printf("[wifi] scan count=%d\n", networks);
  for (int i = 0; i < networks; i++) {
    if (WiFi.SSID(i) == WIFI_SSID)
      Serial.printf("[wifi] target BSSID=%s channel=%d RSSI=%d\n",
                    WiFi.BSSIDstr(i).c_str(), WiFi.channel(i), WiFi.RSSI(i));
  }
  WiFi.scanDelete();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastWifiTry = millis();   // start the grace window from the boot attempt
  lastLinkMs  = millis();   // and the offline window: gives the first
                            // association 120 s before any radio reset
  // 20261111: TX POWER 8.5 dBm -> 19.5 dBm (the ESP32-S3 maximum).
  //
  // MEASURED ASYMMETRY (the AP's own station table, 2026-11-10):
  //     tx bitrate 52-72 MBit/s   (AP -> ESP downlink)
  //     rx bitrate  5.5 MBit/s    (ESP -> AP uplink, i.e. the AUDIO direction)
  // The uplink is the direction that carries the audio, and it was running at
  // the 802.11b fallback rate while the downlink ran at 802.11n. A 22.5 dB
  // power deficit on the uplink is a strong candidate for that collapse: the
  // AP hears the ESP much more weakly than the ESP hears the AP.
  //
  // Why it matters even more now: with a 5760-byte TCP window the ceiling is
  // window/RTT, so every millisecond of added RTT directly steals bandwidth.
  // A cleaner uplink lowers RTT and raises the ceiling.
  bool powerSet = WiFi.setTxPower(WIFI_POWER_19_5dBm);
  Serial.printf("[wifi] txPower set=%d actual=%d (%.1f dBm)\n",
                powerSet, (int)WiFi.getTxPower(), (int)WiFi.getTxPower() / 4.0);
  for (int t = 0; t < 60 && WiFi.status() != WL_CONNECTED; t++) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected ip=%s\n", WiFi.localIP().toString().c_str());
  }
}

void ota_setup() {
  ArduinoOTA.setHostname(DEVICE_ID);
  ArduinoOTA.setPassword(OTA_PASSWORD);
  ArduinoOTA.setMdnsEnabled(false);   // pushed by IP; no mDNS needed
  ArduinoOTA.onStart([]() {
    Serial.println("[ota] update started");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("[ota] update done; rebooting");
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[ota] error[%u]\n", (unsigned)error);
  });
  ArduinoOTA.begin();
  Serial.println("[ota] listening on UDP 3232");
}

// --- 20261110b: WiFi recovery rewritten --------------------------------------
// The previous wifi_task() re-called WiFi.begin() every 5 s whenever status was
// not WL_CONNECTED. But WL_CONNECTED only becomes true AFTER DHCP finishes, and
// DHCP on this AP routinely takes longer than 5 s while the CCTV recorder is
// pushing ~1.2 Mbit/s. So the retry kept aborting its own in-flight
// association/DHCP:
//     begin -> radio associates, DHCP starts -> 5 s -> begin -> aborted...
// Observed 2026-11-10: the AP still listed this MAC as associated (inactive
// time 1000 ms, 5.5 Mbit/s rx) while ARP on the Pi was INCOMPLETE, ping failed,
// and the board never reconnected (the Pi reported accepted=1 and a frozen byte
// count for 860 s). Not a crash - the radio was alive, the IP stack was stuck,
// and nothing could reach it, OTA included.
//
// New policy:
//   * a healthy link is never touched;
//   * every attempt gets 30 s to finish association + DHCP;
//   * only a DEFINITE failure shortens that to 10 s;
//   * after 120 s with no link the association is recycled once (disconnect
//     then begin) - deliberately NOT WiFi.mode(WIFI_OFF), because that would
//     also tear down the OTA UDP socket, which is the only way left in;
//   * TCP/MQTT are left alone. They already self-heal: tcp_flush() reconnects
//     after a stall and mqtt_ensure() retries every 5 s. The old code dropped
//     both on every WiFi retry, which is what made a 5 s blip look like a
//     permanent outage.
#define WIFI_GRACE_MS      30000UL   // let association + DHCP finish
#define WIFI_DEFINITE_MS   10000UL   // retry sooner on a definite failure
#define WIFI_RECYCLE_MS   120000UL   // offline this long -> full radio reset
#define WIFI_HARD_RESET_MS 900000UL  // offline this long -> restart the chip

void wifi_task() {
  unsigned long nowMs = millis();
  wl_status_t st = WiFi.status();
  if (st == WL_CONNECTED) {
    lastLinkMs = nowMs;
    return;
  }

  // --- 20261110c: the recycle branch below used to be DEAD CODE ---------------
  // It tested `millis() - lastWifiTry`, but lastWifiTry is reset on every
  // retry (every 10-30 s), so that value could never reach WIFI_RECYCLE_MS.
  // Measured 2026-11-10 on the real board: it sat in `[wifi] retry status=4`
  // forever and never once logged a recycle. Now the window is timed from the
  // last GOOD link, which is the only value that means "I have been offline
  // for this long".
  //
  // The recycle is a real radio reset (WIFI_OFF -> WIFI_STA), not just another
  // WiFi.begin(). Nothing short of that clears a wedged ESP32 station
  // interface. It DOES tear down the ArduinoOTA UDP socket — accepted on
  // purpose: when the station interface is wedged the OTA socket is already
  // unreachable, so there is nothing left to protect.
  if (nowMs - lastLinkMs >= WIFI_RECYCLE_MS) {
    Serial.printf("[wifi] offline %lus - FULL radio reset\n",
                  (nowMs - lastLinkMs) / 1000UL);
    tcpStream.stop();
    mqtt.disconnect();
    fmtPublished = false;
    WiFi.disconnect(true, false);   // drop link + radio off, KEEP credentials
    delay(200);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
    lastLinkMs  = nowMs;            // restart the offline window
    lastWifiTry = nowMs;
    return;
  }

  unsigned long since = nowMs - lastWifiTry;
  bool definite = (st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED ||
                   st == WL_CONNECTION_LOST);
  unsigned long waitMs = definite ? WIFI_DEFINITE_MS : WIFI_GRACE_MS;
  if (since < waitMs) return;      // still in flight: hands off

  Serial.printf("[wifi] retry status=%d after %lus (offline %lus)\n",
                (int)st, since / 1000UL, (nowMs - lastLinkMs) / 1000UL);
  lastWifiTry = nowMs;
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // Last resort: if even repeated radio resets never restore a link, a full
  // chip restart is the only software move left. This is what keeps the barn
  // board reachable without anyone opening the enclosure.
  if (nowMs - lastLinkMs >= WIFI_HARD_RESET_MS) {
    Serial.printf("[wifi] offline %lus - RESTARTING CHIP\n",
                  (nowMs - lastLinkMs) / 1000UL);
    delay(100);
    ESP.restart();
  }
}

// --- 20261111: MQTT / OTA task ---------------------------------------------
// Everything that can block on the network lives here, NOT in the audio loop.
//
//   gRms/gPeak/gNonZero  the latest levels, handed over from the audio path
//   gFmtDirty            set when the retained audio/format message needs
//                        republishing (after an MQTT reconnect)
//
// The PubSubClient object is not thread-safe, so every user of it takes
// mqttMutex. The audio path never touches mqtt at all.
static volatile int   gRms = 0;
static volatile int   gPeak = 0;
static volatile int   gNonZero = 0;
static volatile bool  gFmtDirty = false;
static SemaphoreHandle_t mqttMutex = NULL;

void mqttTask(void* arg) {
  (void)arg;
  unsigned long lastSerLog = 0;
  for (;;) {
    if (mqttMutex && xSemaphoreTake(mqttMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      ArduinoOTA.handle();
      mqtt.loop();
      mqtt_ensure();
      if (mqtt.connected() && gFmtDirty) {
        publish_audio_format();
      }
      if (millis() - lastMqttPub >= 1000) {
        unsigned long now = millis();
        lastMqttPub = now;
        publish_telemetry(gRms, gPeak);
        uint32_t bps = tcpBytes * 1000 / (now - lastBpsMark);
        lastBpsMark = now;
        tcpBytes = 0;
        // 20261111: the serial line is rate-limited to every 5 s and the port
        // is non-blocking (setTxTimeoutMs(0) in setup). A full USB TX buffer
        // with nobody reading it would otherwise stall this task for 250 ms
        // per write.
        if (now - lastSerLog >= 5000) {
          lastSerLog = now;
          Serial.printf("RMS24: %.0f Peak24: %d nz:%d%% %.1f dBFS tcp:%lu B/s wifi:%d mqtt:%d tcp:%d\n",
                        (double)gRms, gPeak, gNonZero,
                        20.0 * log10(((double)gRms ? (double)gRms : 1.0) / FULL_SCALE + 1e-9),
                        (unsigned long)bps,
                        WiFi.status() == WL_CONNECTED, mqtt.connected(), tcpStream.connected());
        }
      }
      xSemaphoreGive(mqttMutex);
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void mqtt_ensure() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttTry < 5000) return;
  lastMqttTry = millis();
  const char* will = "{\"mic\":false,\"rms\":0,\"peak\":0,\"sr\":48000}";
  // PubSubClient.connect returns bool, NOT an error code (state() is the code).
  // The handshake needs to be allowed to WAIT for the CONNACK, so give it a
  // one-second timeout for the duration of the connect.
  mqtt.setSocketTimeout(1);
  wifiClient.setTimeout(1000);
  if (mqtt.connect(DEVICE_ID, nullptr, nullptr,
                   "pig/s3-mic-01/telemetry", 1, true, will)) {
    fmtPublished = false; // republish retained format after every reconnect
    gFmtDirty = true;    // the MQTT task does the actual publish
    // 20261111: THIS IS THE ORIGINAL "THE AUDIO CUTS" BUG.
    //
    // PubSubClient::readByte() is:
    //     while(!_client->available()) {
    //       yield();
    //       if(currentMillis - previousMillis >= socketTimeout * 1000) return false;
    //     }
    // and PubSubClient::loop() calls readByte() UNCONDITIONALLY. So with a
    // non-zero socketTimeout, every mqtt.loop() with nothing to read SPINS
    // for that many SECONDS. With setSocketTimeout(1) that is a one-second
    // busy-wait, burning a whole core of the dual-core S3 and - when it was
    // still called from the audio loop - freezing the audio for a second
    // every second.
    //
    // The connect handshake needs the timeout; the steady-state reads must
    // not have it. So: 1 second while connecting, 0 afterwards.
    mqtt.setSocketTimeout(0);
    wifiClient.setTimeout(100);
    Serial.println("[mqtt] connected");
  } else {
    Serial.printf("[mqtt] connect failed state=%d\n", mqtt.state());
  }
}

void publish_audio_format() {
  const char* format = "{\"rate\":48000,\"encoding\":\"s16le\",\"endian\":\"little\","
                       "\"channels\":1,\"interleaved\":false,\"bytes_per_frame\":2,"
                       "\"bytes_per_sec\":96000,\"firmware\":\"" FIRMWARE_ID "\"}";
  // Retry if publish failed; the reference marked it published before sending.
  fmtPublished = mqtt.publish("pig/s3-mic-01/audio/fmt", format, true);
  gFmtDirty = !fmtPublished;
}

// Enqueue audio for sending. Never drops silently: on overflow the OLDEST bytes
// are discarded (a cough half-sent is still countable once the socket returns)
// and the loss is counted in txDroppedBytes.
void tcp_enqueue(const uint8_t *data, size_t len) {
  for (size_t i = 0; i < len; i++) {
    if (txLen == TX_BUF_SZ) {
      txTail = (txTail + 1) % TX_BUF_SZ;   // discard oldest
      txLen--;
      txDroppedBytes++;
    }
    txBuf[txHead] = data[i];
    txHead = (txHead + 1) % TX_BUF_SZ;
    txLen++;
  }
}

// Drain as much as the socket accepts this pass. A partial write is not an
// error: the remainder stays buffered and is retried on the next loop.

// 20261113: NON-BLOCKING BULK SEND.
//
// Arduino's NetworkClient::write() wraps send() in a select()+retry loop:
//     WIFI_CLIENT_MAX_WRITE_RETRY   = 10
//     WIFI_CLIENT_SELECT_TIMEOUT_US = 1000000   (1 second)
// so ONE write() call can block for 10 x 1 s = 10 SECONDS whenever the socket's
// send queue is full. Measured on the live board 2026-11-13 (telemetry `wrms`):
//     tcpStream.write() blocked for 10,003 ms   <- exactly 10 x 1 s
//     mqtt.publish()      took      2 ms
//     hostapd deassociations in the stall window: 0
//
// That 10 s hole IS the "weird pause": the Pi sees no bytes for 5 s, closes the
// socket, the ESP reconnects, and the audio is gone for seconds - repeatedly.
//
// send() is called directly here with MSG_DONTWAIT so it can NEVER block. A
// full queue returns -1 with EAGAIN; the caller keeps the bytes in the ring
// buffer and retries on the next loop, so nothing is lost and the socket stays
// up. The ring is TX_BUF_SZ (64 KB = 680 ms of audio at 96 KB/s), so a link
// hiccup is absorbed instead of destroying the stream.
static size_t tcp_send_nowait(const uint8_t *buf, size_t len) {
  int fd = tcpStream.fd();
  if (fd < 0) return 0;
  int n = send(fd, buf, len, MSG_DONTWAIT);
  if (n < 0) return 0;          // EAGAIN = the queue is full, retry next loop
  return (size_t)n;
}

void tcp_flush() {
  // --- 20261110d WATCHDOG: REMOVED 20261111 --------------------------------
  // It watched `tcpStream.availableForWrite() == 0` and dropped the socket
  // after TCP_STALL_MS. That check was WRONG in a way that looked right:
  //
  //   WiFiClient does NOT override availableForWrite(). It inherits
  //   Print::availableForWrite(), whose entire body is `{ return 0; }`
  //   (framework-arduinoespressif32@3.20016.0/cores/esp32/Print.h:80).
  //
  // So the condition was permanently TRUE and the watchdog killed a perfectly
  // healthy socket every 15 s. Measured on the live board: tse=2425 stall
  // events and a clean 15 s connect/disconnect cycle in the Pi's ingest log.
  // It made the stream WORSE, not better.
  //
  // The replacement liveness rule is on the RECEIVER side, because only the
  // receiver can tell that bytes are not arriving:
  //   - the Pi closes the socket after a few seconds of silence (esp_audio_ingest
  //     now does this), and the ESP sees the FIN;
  //   - here, `connected()` false -> stop() the socket properly and reconnect.
  // `stop()` matters: connect() on a client whose pcb is still open leaks the
  // pcb, and leaked pcbs eventually exhaust the lwIP socket pool.
  if (!tcpStream.connected()) {
    if (millis() - lastTcpConnect < 3000) return;
    lastTcpConnect = millis();
    tcpStream.stop();          // close the old pcb before making a new one
    lastPeerByteMs = 0;
    if (tcpStream.connect(TCP_HOST, TCP_PORT, 500)) {
      tcpStream.setNoDelay(true);
      tcpReconnects++;
      Serial.printf("[tcp] connected with %u bytes buffered\n", txLen);
    } else {
      return;
    }
  }

  // --- 20261111: PEER HEARTBEAT -------------------------------------------
  // The Pi sends one byte every 2 s on this socket. If those bytes stop
  // arriving, the path is dead EVEN IF every local write still "succeeds".
  //
  // WHY THIS IS NEEDED (measured 2026-11-11): Linux advertises a ~1 MB TCP
  // receive window, so the ESP's lwIP happily buffers up to 1 MB of audio it
  // believes it sent, while none of it arrives. write() keeps returning the
  // byte count (txp stayed 0 through a whole dead session), connected() stays
  // true, and the stream was dead for hours with no way out.
  //
  // The Pi now also closes a socket that has been silent for 5 s, so the
  // symptom was "the audio cuts every ~30 s" instead of "the audio dies".
  // This closes the loop: the ESP notices the missing heartbeats and rebuilds
  // the socket itself.
  while (tcpStream.available() > 0) {
    tcpStream.read();          // drain the heartbeat byte(s)
    lastPeerByteMs = millis();
  }
  if (tcpStream.connected() && lastPeerByteMs != 0 &&
      millis() - lastPeerByteMs > TCP_PEER_TIMEOUT_MS) {
    Serial.printf("[tcp] no heartbeat for %lus - dropping socket\n",
                  (millis() - lastPeerByteMs) / 1000UL);
    tcpStream.stop();
    lastPeerByteMs = 0;
    return;
  }
  while (txLen > 0) {
    // write at most one contiguous run, so the ring never needs a memcpy
    uint16_t run = (uint16_t)min((uint32_t)(TX_BUF_SZ - txTail), (uint32_t)txLen);
    uint32_t _w0 = millis();
    size_t n = tcp_send_nowait(txBuf + txTail, run);
    uint32_t _wd = millis() - _w0;
    if (_wd > gWrMs) gWrMs = _wd;
    if (_wd > 100) gWrN++;
    if (n == 0) {
      // 20261113: THIS IS THE "WEIRD PAUSE" BUG. FIXED.
      //
      // The old code destroyed the socket here:
      //     txPartialWrites++;
      //     tcpStream.stop();
      //     Serial.println("[tcp] stalled; buffer retained");   // <- the lie
      // "buffer retained" and then the socket was thrown away.
      //
      // Why that was fatal: the socket's TCP send buffer is 5760 bytes
      // (CONFIG_LWIP_TCP_SND_BUF_DEFAULT), which is 59 ms of slack at
      // 96,000 B/s. Any WiFi hiccup longer than that fills the buffer,
      // `tcp_write()` returns 0, the socket was destroyed, and the stream went
      // silent until the reconnect completed - about 5 s. Then it happened
      // again. Measured on the live board 2026-11-13 (telemetry `wrms`):
      //     tcpStream.write() blocked for 10,003 ms  (audio task) = 10 x 1 s
      //     mqtt.publish()      took      2 ms   (MQTT task)
      // So it was never the radio and never MQTT: it was this write, and the
      // socket being killed instead of the data being kept.
      //
      // The fix: KEEP the unsent bytes in the ring buffer and retry. The ring
      // is TX_BUF_SZ (64 KB = 680 ms of audio at 96 KB/s), so it rides out a
      // hiccup without dropping a single sample - and the socket stays up, so
      // the listener never hears a gap.
      txPartialWrites++;
      return;                 // nothing went out; retry next loop
    }
    txTail = (txTail + n) % TX_BUF_SZ;
    txLen -= n;
    tcpBytes += n;
    tcpBytesTotal += n;
    if (n < run) break;        // socket full; the rest stays in the ring
  }
}

void publish_telemetry(int rms, int peak) {
  if (mqtt.connected()) {
    // Sizes: the widest possible payload (every counter at its maximum, plus
    // the SHT45 fragment) measures 571 bytes -- 474 of them in the drops
    // fragment alone. `snprintf` truncating mid-JSON would emit invalid JSON
    // that every consumer drops -- the exact failure this build shipped with --
    // so leave real headroom over the worst case.
    // 768 also silences the compiler's -Wformat-truncation warning, which was
    // pointing at a genuine (if not yet triggered) hazard.
    // 2026-11-13: drops[384] was undersized -- 439 bytes are needed at the
    // worst case, so a long-lived counter set could have truncated the
    // fragment into invalid JSON. Now 512.
    char payload[768];
    char ambient[96] = "";
    // 2026-11-13: gate on the CACHED reading's age, not on the last attempt's
    // outcome. `shtLastGood != 0` proves a reading was ever obtained, and the
    // staleness window is what makes a genuinely dead sensor drop the fragment
    // on its own -- so a failed cycle no longer throws away a still-good value.
    // The window is 30 s (SHT_MAX_STALE_MS): pen temperature and humidity move
    // slowly, the bus is intermittent, and `sage` publishes the true age.
    if (shtValid && shtLastGood && (millis() - shtLastGood) < SHT_MAX_STALE_MS)
      snprintf(ambient, sizeof(ambient), ",\"temperature\":%.2f,\"humidity\":%.2f", shtTemperature, shtHumidity);
    // Additive drop counters (irf=i2s read fails, irr=retries, txd=bytes dropped
    // by overflow, txp=partial writes). Existing keys keep their names and units,
    // so old consumers are unaffected; PocketBase drops unknown fields as usual.
    // txr = TCP reconnects, rssi = dBm, heap = free bytes,
    // sps/batch/bps = audio-rate instrumentation (see sampTotal comment).
    // opk = output peak (16-bit scale), clip = clipped samples.
    // NOTE: rms/peak stay in the 24-bit SOURCE domain on purpose, so a change
    // in what the barn actually sounds like is still visible there.
    // srf = SHT45 measurement attempts that did not yield a good reading;
    // sage = ms since the last good SHT45 reading (0 = never). These two make
    // the 2026-11-13 ambient fix measurable straight off the wire.
    // sfs/sfc/sfw = the three failure kinds, sle = last I2C error,
    // sdt = ms actually elapsed command->read, slr = last CRC byte.
    char drops[640] = "";
    uint32_t sps = 0, bps = 0, batch = 0;
    unsigned long nowMs = millis();
    if (sampMarkMs && nowMs > sampMarkMs) {
      sps = sampTotal * 1000UL / (nowMs - sampMarkMs);
      bps = tcpBytesTotal * 1000UL / (nowMs - sampMarkMs);
    }
    if (sampBatchN) batch = sampBatchSum / sampBatchN;
    sampTotal = 0; sampBatchSum = 0; sampBatchN = 0; tcpBytesTotal = 0;
    sampMarkMs = nowMs;
    int dc16 = (int)(micDcAvg >> 8);
    snprintf(drops, sizeof(drops),
             ",\"irf\":%lu,\"irr\":%lu,\"txd\":%lu,\"txp\":%lu,\"txr\":%lu,"
             "\"rssi\":%d,\"heap\":%lu,\"sps\":%lu,\"batch\":%lu,\"bps\":%lu,"
             "\"opk\":%ld,\"clip\":%lu,\"dc\":%d,"
             "\"omin\":%ld,\"omax\":%ld,\"smin\":%ld,\"smax\":%ld,"
             "\"boots\":%lu,\"rr\":%lu,\"br\":%lu,\"txp\":%ld,"
             "\"pubms\":%lu,\"wrms\":%lu,\"pubn\":%lu,\"wrn\":%lu,"
             "\"srf\":%lu,\"sage\":%lu,"
             "\"sfs\":%lu,\"sfc\":%lu,\"sfw\":%lu,\"sle\":%u,\"sdt\":%lu,\"slr\":%u,"
             "\"sbr\":%lu",
             (unsigned long)i2sReadFails, (unsigned long)i2sReadRetries,
             (unsigned long)txDroppedBytes, (unsigned long)txPartialWrites,
             (unsigned long)tcpReconnects, (int)WiFi.RSSI(),
             (unsigned long)ESP.getFreeHeap(),
             (unsigned long)sps, (unsigned long)batch, (unsigned long)bps,
             (long)micOutPeak, (unsigned long)micClipped, dc16,
             (long)micOutMin, (long)micOutMax,
             (long)micSrcMin, (long)micSrcMax,
             (unsigned long)gBootCount, (unsigned long)gReasonThisBoot,
             (unsigned long)(gBrownoutSeen ? 1 : 0),
             (long)(int)WiFi.getTxPower(),
             (unsigned long)gPubMs, (unsigned long)gWrMs,
             (unsigned long)gPubN, (unsigned long)gWrN,
             (unsigned long)shtReadFails,
             (unsigned long)(shtLastGood ? (millis() - shtLastGood) : 0),
             (unsigned long)shtFailsShort, (unsigned long)shtFailsCrc,
             (unsigned long)shtFailsCmd, (unsigned int)shtLastErr,
             (unsigned long)shtLastDelay, (unsigned int)shtLastCrcByte,
             (unsigned long)shtBusResets);
    snprintf(payload, sizeof(payload),
             "{\"mic\":true,\"rms\":%d,\"peak\":%d,\"sr\":48000%s%s}", rms, peak, ambient, drops);
    String topic = String("pig/") + DEVICE_ID + "/telemetry";
    uint32_t _t0 = millis();
    bool _ok = mqtt.publish(topic.c_str(), payload);
    uint32_t _dt = millis() - _t0;
    if (_dt > gPubMs) gPubMs = _dt;
    if (_dt > 100) gPubN++;
    if (!_ok) Serial.println("[mqtt] publish failed");
  }
}

void setup() {
  gReasonThisBoot = (uint32_t)esp_reset_reason();
  gBootCount++;
  if (gBootCount > 1) {
    gBrownoutSeen = (gReasonThisBoot == ESP_RST_BROWNOUT) ||
                    (gLastReason == ESP_RST_BROWNOUT);
  }
  gLastReason = gReasonThisBoot;
  Serial.begin(115200);
  Serial.printf("[boot] count=%lu reason=%u%s\n", (unsigned long)gBootCount,
                gReasonThisBoot,
                (gReasonThisBoot == ESP_RST_BROWNOUT) ? " BROWNOUT"
                : (gReasonThisBoot == ESP_RST_POWERON) ? " POWER-ON" : "");
  // 20261111: never let the USB TX buffer stall the firmware. With the cable
  // plugged in and nothing reading the port, a full buffer made every
  // Serial.printf block for 250 ms. 0 = drop the data instead of waiting.
  Serial.setTxTimeoutMs(0);
  delay(500);
  Serial.println("Starting " FIRMWARE_ID " (I2S32 >>16 -> S16LE MONO 48k)...");
  // 2026-11-13: the SHT45 bus at 100 kHz was NACKing its own address
  // (sle=2) roughly two attempts in three. The signature — address NACK,
  // short reads, and CRC mismatches on otherwise plausible bytes — is what
  // a marginal wire looks like electrically: long leads raise the bus
  // capacitance, and the SHT45 then misreads the address byte and does not
  // acknowledge it. Halving the clock quadruples the bit period and gives
  // the level time to settle. 50 kHz is still ~2.4 ms of bus time per
  // measure+read cycle, well inside the I2S buffer budget (512 samples =
  // 10.7 ms at 48 kHz), so the audio loop is not at risk.
  //
  // If this does not clear the NACKs, the answer is physical: shorten the
  // SDA/SCL leads, keep them away from the mic and the motorised cable, and
  // check the module's pull-ups.
  shtBusReady = Wire.begin(8, 9, SHT_I2C_HZ);
  // 5 ms was tight enough to time a transaction out on a slow bus and be
  // reported as a short read. 50 ms costs nothing here: the measurement
  // cycle is 2 s.
  Wire.setTimeOut(50);
  Serial.printf("[pins] mic SCK=4 WS=5 SD=6 LEFT; SHT45 SDA=8 SCL=9 init=%d\n", shtBusReady);

  i2s_install();
  i2s_set_pins();
  if (i2sReady) {
    esp_err_t err = i2s_start(I2S_PORT);
    i2sReady = err == ESP_OK;
    if (!i2sReady) Serial.printf("[i2s] start: %s\n", esp_err_to_name(err));
  }
  delay(500);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(1); // bound MQTT handshake stalls while audio is live
  // 2026-11-13: 384 -> 1024. PubSubClient refuses to publish when
  //   bufferSize < MQTT_MAX_HEADER_SIZE(5) + 2 + strlen(topic) + payload
  // so a 384-byte buffer caps the payload at 353 bytes for our 24-char topic.
  // The telemetry payload had crept up to 346 bytes -- SEVEN bytes of margin --
  // and adding six diagnostic counters pushed it over, at which point
  // mqtt.publish() returns false and EVERY telemetry message is dropped
  // silently while the audio keeps streaming. 1024 leaves room for the
  // worst-case payload (673 bytes) with real margin. The buffer is a heap
  // allocation; RAM use is 35.7%, so 640 extra bytes is cheap.
  mqtt.setBufferSize(1024);
  // The PubSubClient socket timeout is in SECONDS (MQTT_SOCKET_TIMEOUT), so
  // its publishes can block for a full second. The MQTT task can afford that
  // (the audio no longer shares its timing), but the underlying client is
  // also used for the OTA session, so bound it to 100 ms.
  wifiClient.setTimeout(100);
  // 20261111: the MQTT/OTA task and its mutex. Everything that can block on
  // the network runs in the task; the audio loop only ever touches the TCP
  // audio socket. This is what makes the stream continuous.
  mqttMutex = xSemaphoreCreateMutex();
  if (mqttMutex) {
    // 2026-11-13: 4096 -> 8192. publish_telemetry holds payload[768] + drops[640]
    // + ambient[96] on the stack (~1.5 KB), and it runs in THIS task, which
    // also carries mqtt.loop() and ArduinoOTA.handle(). RAM use is 35.7%, so
    // the headroom is cheap and the stack overflow is not.
    xTaskCreate(mqttTask, "mqtt", 8192, NULL, 1, NULL);
  } else {
    Serial.println("[mqtt] FATAL: could not create the mutex");
  }
  wifi_connect();
  ota_setup();
  lastBpsMark = millis();
}

void loop() {
  sht_task();
  wifi_task();
  // 20261111: ArduinoOTA.handle() moved to the MQTT task. It was serviced
  // here on every loop pass so that OTA stays reachable even when audio is
  // down - the MQTT task still does that, it just does not share the audio
  // loop's timing.
  if (!i2sReady) {
    // Audio is down: keep the broker session alive AND keep OTA responsive.
    // A 1 s block here throttles espota to ~1 packet/s (hours for one image),
    // which is exactly when a wireless fix matters most.
    mqtt.loop();
    static unsigned long lastDeadLog = 0;
    if (millis() - lastDeadLog >= 1000) {
      lastDeadLog = millis();
      mqtt_ensure();
      Serial.println("[i2s] initialization failed; no audio is being sent");
    }
    delay(10);
    return;
  }

  static int32_t rawBuffer[BUFFER_LEN];
  size_t bytesIn = 0;

  // Retry the I2S read instead of dropping the batch. A WiFi-stack stall can
  // exceed the 100 ms timeout; one retry costs 5 ms and saves 4 KB of audio.
  esp_err_t result = ESP_FAIL;
  for (int attempt = 1; attempt <= I2S_READ_RETRIES; attempt++) {
    result = i2s_read(I2S_PORT, &rawBuffer, sizeof(rawBuffer), &bytesIn,
                      pdMS_TO_TICKS(100));
    if (result == ESP_OK && bytesIn > 0) {
      if (attempt > 1) i2sReadRetries++;
      break;
    }
    if (attempt < I2S_READ_RETRIES) delay(I2S_RETRY_DELAY_MS);
  }
  if (result != ESP_OK || bytesIn == 0) {
    // All retries exhausted: this is a real gap, now counted and visible.
    i2sReadFails++;
    if (i2sReadFails % 20 == 1)
      Serial.printf("[i2s] read failed after %d tries: %s bytes=%u\n",
                    I2S_READ_RETRIES, esp_err_to_name(result), (unsigned)bytesIn);
    mqtt.loop();          // keep the session from timing out while audio is down
    mqtt_ensure();
    delay(50);
    return;
  }

  if (result == ESP_OK && bytesIn > 0) {
    int samplesRead = bytesIn / sizeof(int32_t);
    int64_t sumSq = 0;
    int32_t peak = 0;
    int nonZero = 0;

    for (int i = 0; i < samplesRead; i++) {
      int32_t sample = rawBuffer[i] >> 8;
      sumSq += (int64_t)sample * sample;
      int32_t absSample = abs(sample);
      if (absSample > peak) peak = absSample;
      if (sample != 0) nonZero++;
    }

    float rms = sqrt((double)sumSq / samplesRead);

    // 20261111: MONO on the wire.
    //
    // WHY (measured, not guessed): this ESP's lwIP is built with
    //   CONFIG_LWIP_TCP_SND_BUF_DEFAULT 5760
    //   CONFIG_LWIP_TCP_WND_DEFAULT      5760
    // so the TCP window is 5.6 KB and the throughput ceiling is window/RTT.
    // At the measured RTT of 47.7 ms that is 5760/0.0477 = 120.7 KB/s, and at
    // the best RTT seen it peaked near 170 KB/s. S16LE STEREO at 48 kHz needs
    // 192,000 B/s — it does not fit. The old firmware sent the SAME sample in
    // both channels (stereoBuf[i*2] = stereoBuf[i*2+1] = sample), so half the
    // bandwidth carried zero extra information.
    //
    // Mono S16LE at 48 kHz needs 96,000 B/s: identical information, half the
    // airtime, and it fits under the window/RTT ceiling with headroom.
    // The Pi upmixes back to stereo locally (CPU is free there), so the
    // browser, the cough classifier and every other consumer are unchanged.
    int16_t monoBuf[BUFFER_LEN];

    // --- 20261111: DC block (ESP side) --------------------------------------
    // The source is extracted exactly as it always was - the top 16 bits of
    // the I2S word - which the board has always produced as a properly
    // BIPOLAR signal (measured on the real board: min -992 / max 750 /
    // 49.5% negative samples).
    //
    // Only a DC blocker is applied here, and it is free of the fixed-point
    // dead zone that broke the first version: the two filter state values are
    // kept in FLOAT, because with R = 0.99478 in Q16 the integer multiply
    // rounds down and any value below 183 never decays:
    //     (-99 * 65179) >> 16 == -99      <- a fixed point
    // Float state: 48,000 multiply-adds per second, which is nothing.
    //
    // NOTE: there is deliberately NO gain stage on the ESP any more. Levelling
    // is post-processing and post-processing belongs on the Pi, where the CPU
    // is free and the radio airtime is not. The ESP sends the signal as
    // captured; the Pi applies the gain and the limiter.
    int32_t hpPeak = 0;
    int32_t srcMin = 32767, srcMax = -32768;
    for (int i = 0; i < samplesRead; i++) {
      int16_t s16 = (int16_t)(rawBuffer[i] >> 16);
      if (s16 < srcMin) srcMin = s16;
      if (s16 > srcMax) srcMax = s16;
      micDcAvg += (s16 - micDcAvg) >> 14;           // slow average, for reporting
      float yf = (float)s16 - micHpX1 + MIC_HP_R * micHpY1;
      micHpX1 = (float)s16;
      micHpY1 = yf;
      int32_t y = (int32_t)lrintf(yf);
      rawBuffer[i] = y;                             // keep the DC-blocked value
      int32_t ay = y < 0 ? -y : y;
      if (ay > hpPeak) hpPeak = ay;
    }
    micSrcMin = srcMin;
    micSrcMax = srcMax;

    // 20261111: there is deliberately NO gain stage here. Levelling is
    // post-processing and post-processing belongs on the Pi (esp_audio_ingest.py),
    // where the CPU is free and the radio airtime is not. The ESP sends the
    // signal exactly as captured; the Pi applies the level and the limiter.

    int32_t outPeak = 0;
    int32_t outMin = 32767, outMax = -32768;
    for (int i = 0; i < samplesRead; i++) {
      int32_t v = rawBuffer[i];
      if (v > outMax) outMax = v;
      if (v < outMin) outMin = v;
      int32_t av = v < 0 ? -v : v;
      if (av > outPeak) outPeak = av;
      monoBuf[i] = (int16_t)v;
    }
    micOutPeak = outPeak;
    micOutMin = outMin;
    micOutMax = outMax;
    sampTotal += samplesRead;
    sampBatchSum += samplesRead;
    sampBatchN++;
    if (WiFi.status() == WL_CONNECTED) {
      tcp_enqueue((uint8_t *)monoBuf, samplesRead * 2);   // never drops silently
      tcp_flush();                                          // drains what it can
      // 20261111: MQTT and OTA moved OUT of this loop into their own task.
      //
      // WHY (measured, this is the real "the audio cuts" bug):
      //   PubSubClient's socket timeout is in SECONDS (MQTT_SOCKET_TIMEOUT),
      //   so mqtt.publish() / mqtt.loop() / mqtt.connect() can each block for
      //   a FULL SECOND when the broker socket is slow. Those calls used to
      //   run here, inside the audio loop, so every second of telemetry
      //   stalled the audio for a second:
      //
      //     telemetry arrival: 09:13:14.71  16.70  17.71  19.71  21.70 ...
      //                            every 2 s, not every 1 s
      //     sps over that window: 48810 / 16200 / 51352 / 16136 / 17973 ...
      //                           (the low ones are a 2 s window holding 1 s
      //                            worth of samples - the audio gap)
      //
      //   The Pi's own byte counter showed the same thing: the stream was
      //   delivering 38-50 KB/s instead of 96 KB/s, in 1-second holes.
      //
      // The audio path now touches NOTHING that can block. MQTT, telemetry,
      // the OTA handler and the retained-format publish all live in a task of
      // their own, behind a mutex.
    }
    gRms = (int)rms;
    gPeak = peak;
    gNonZero = nonZero;
  }
}
