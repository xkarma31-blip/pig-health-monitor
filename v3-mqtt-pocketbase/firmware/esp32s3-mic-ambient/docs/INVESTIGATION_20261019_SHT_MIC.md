# SHT45 / INMP441 investigation — 2026-10-19

## Fresh evidence

Production firmware retained; no diagnostic flash or GPIO drive tests performed.
Serial capture requested for 60 seconds, including possible pre-existing serial
buffer content: `pre-change-20261019-sht45/investigation-60s.txt`.
62 complete RMS reports, 32 SHT failed transactions, no boot/panic/brownout
messages in this capture. 34 reports have RMS24=Peak24=2097152 exactly.
All complete reports show WiFi/MQTT/TCP disconnected. This does not identify
the network failure cause. These are block summaries, not a raw PCM capture.

## Code and source checks

- Production uses SCK=4, WS=5, SD=6, left-only, standard I2S, 48 kHz,
  32-bit slots, signed raw32 >>16 conversion to PCM16.
- SHT code uses GPIO8/9, address 0x44, command 0xFD, at least 10 ms conversion
  time, six-byte read, CRC polynomial 0x31 initialized to 0xFF. This matches
  Sensirion SHT4x datasheet v6.5 example and checksum specification.
- Arduino 2.0.17 Wire.cpp lines 453–468 maps ESP_FAIL to 2 for the entire
  write transaction. Existing log cannot distinguish address vs data NACK.
  Therefore “no device at address” is NOT established by this capture alone.
- Current mic metric is uncentered RMS; DC contributes fully. nz=100% is
  not evidence of audio. Raw samples/acoustic response are still needed.
- Existing diagnostic has GPIO6 output-drive tests. Do not blindly run it
  against a connected microphone output; electrical contention is possible.
- Historical register/pull tests are hypotheses, not current continuity or
  voltage measurements. No present short or absent pull-up has been proven.

## Manufacturer sources (specification, not board measurements)

INMP441 DS-INMP441-00 v1.0 downloaded and extracted from manufacturer-document mirror:
https://file.icallin.com/images/VipMasterIC/IC/IVNC/IVNCS00052/IVNCS00052-1.pdf

Official indexed v1.1 source (direct download returned 403):
https://product.tdk.com/system/files/dam/doc/product/sw_piezo/mic/mems-mic/data_sheet/inmp441.pdf

Mic nominal 3.3 V is appropriate. v1.0 electrical table specifies 1.62–3.63 V;
pin description uses 1.8–3.3 V. Normal current at 3.3 V is 2.2 mA typical,
2.5 mA maximum. Requires 64 BCLK per stereo frame, 24-bit I2S data,
CHIPEN high, 0.1 uF decoupling, and recommends 100 kohm SD pulldown.
At 48 kHz expected BCLK is 3.072 MHz, not measured here.
Specified reflow profile peaks at 260 C for lead-free processing with tightly
limited dwell/ramp; this does not authorize prolonged soldering-iron heating.

Sensirion official SHT4x v6.5 downloaded and extracted:
https://sensirion.com/media/documents/33FD6951/661CD142/HT_DS_Datasheet_SHT4x.pdf

SHT45 address 0x44, VDD 1.08–3.6 V, measurement current without heater
320 uA typical / 500 uA max. Current firmware never requests the heater.
External bus pull-ups and decoupling are part of the application requirements.

## Conclusions and discriminating next measurements

No evidence establishes heat damage or low module supply voltage. Both are
possible; shared supply/ground, incorrect header identification, bad joints,
bus integrity and damaged modules remain alternatives. Both sensors normally
draw only a few mA combined without heating; nominal load alone is not a
strong explanation for regulator overload. Actual board regulator and supply
quality are unknown.

1. Power off: photograph both module faces and ESP header labels; inspect joints.
2. Power on: measure each module VDD relative to its own GND, plus ESP 3V3/GND.
   A DMM checks DC; use scope/min-max for transient droop if available.
3. Power off: disconnect mic completely, test SHT alone with short known-good
   jumpers; confirm module pull-ups before adding 4.7 kohm to 3.3 V.
4. If necessary perform address-only I2C probe to distinguish NACK stages.
5. Mic alone: verify supply, L/R ground and module enable circuit; logic-analyzer
   capture at module pins should show WS=48 kHz, SCK=3.072 MHz, and data in
   left slots responding to a controlled acoustic stimulus.
6. Substitute one known-good module/cable at a time. Correct rails/signals plus
   failing old module and working replacement support module failure, but
   do not by themselves identify heat as the cause.

No voltage, module temperature, physical continuity or module-side clock was
measured through this USB session. Do not represent any as verified.
