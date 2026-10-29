# Preserved combined firmware — 2026-10-19

Firmware ID: pigpulse-mic-sht45-20261019. Canonical source is
`arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino` relative to the firmware root.
This archive preserves source, configuration, compiled application, ELF,
bootloader, partition table and boot_app0. SHA256SUMS verifies each file.

## Wiring — user's actual connections

- SHT45 VCC=3.3V, GND=GND, SDA=GPIO8, SCL=GPIO9.
- INMP441 VDD=3.3V, GND=GND, SCK=GPIO4, WS=GPIO5, SD=GPIO6, L/R=GND.
- Do NOT use the older reversed SCK=5/WS=4 mapping.
- Audio: 48000 Hz, left channel, I2S32 >>16 to S16LE duplicated stereo.
- Board: measured ESP32-S3, MAC 68:ee:8f:dd:31:3c, 4 MB flash.
- Toolchain: espressif32 7.0.1 / Arduino 2.0.17 / PubSubClient 2.8.

## Evidence and limitations

Earlier live check returned seven CRC-valid SHT readings, WiFi/MQTT/TCP all
connected, and approximately 192000 bytes/s transmitted audio with varied levels.
The fresh archived `verification-serial.txt` again shows network connections,
varied mic readings, and SHT CRC-valid 34.09 C / 65.07% and 34.11 C / 64.90%.
It ALSO shows SHT NACKs, failed reads, one CRC failure and TCP throughput dips.
This is a recoverable functional baseline, NOT an error-free or acoustically
verified release. No measured voltage or proof of damage cause exists.

## Restore exact application

Run as solrahk from this archive, after verifying `sha256sum -c SHA256SUMS`.
The application-only restore keeps the current matching partition layout/NVS:

```sh
~/.platformio/penv/bin/python ~/.platformio/packages/tool-esptoolpy/esptool.py \
  --chip esp32s3 --port /dev/ttyACM0 --baud 115200 \
  write_flash 0x10000 firmware.bin
```

For restoring the full build layout (does not replace all NVS contents):

```sh
~/.platformio/penv/bin/python ~/.platformio/packages/tool-esptoolpy/esptool.py \
  --chip esp32s3 --port /dev/ttyACM0 --baud 115200 \
  write_flash --flash_size 4MB 0x0 bootloader.bin 0x8000 partitions.bin \
  0xe000 boot_app0.bin 0x10000 firmware.bin
```

Rebuild source by copying this archive's platformio.ini and src into a separate
existing sandbox location, then use `~/.platformio/penv/bin/pio run`.
Do not blindly overwrite later canonical changes. The system `/usr/local/bin/pio`
has a missing tabulate dependency; use the virtualenv CLI above.

Second copy: `/home/solrahk/sandbox/firmware-backups/known-good-20261019-143307-mic-sht45.tar.gz`.
Both copies are on the same laptop; external/off-device backup is still needed
for protection against disk failure. Firmware and source contain local WiFi
credentials: keep archives private.
