# ESP32-S3 microphone watchdog

## Purpose

The watchdog monitors `s3-mic-01` through the local MQTT broker and emits an
alert only when live telemetry changes between `ONLINE` and `OFFLINE`.

- Live MQTT telemetry is the deciding signal.
- A retained packet is replay only and is not treated as liveness.
- AP association and DHCP lease data are diagnostic context only; they never
  override an MQTT result.
- The watchdog does not connect to the board's live audio endpoint.

## Prerequisites

The installer requires `mosquitto-clients` 2.0 or newer, Python 3, and
`flock`. It verifies that the anonymous local broker at `127.0.0.1:1883` is
reachable before replacing any installed file.

The MQTT probe waits 15 seconds (`mosquitto_sub -W 15`). A receive-window
timeout exits with status `27`; this means the broker accepted the connection
and subscription, so the installer accepts it as a valid preflight result. For
the running monitor, status `27` with no live packet is an expected offline
observation, not a monitor failure.

## Installed files

Run the installer as the `pigpulse` user:

```sh
./backend/thermal-pi/install-esp-watchdog.sh
```

It installs these adjacent files under `/home/pigpulse/bin/`:

- `esp-watchdog.sh` — cron wrapper and overlap lock
- `esp_watchdog.py` — MQTT probe, state persistence, and alert publisher

The installer also creates `/home/pigpulse/.local/state/pigpulse/`, which holds
`esp-watchdog.state` and `esp-watchdog.lock`.

## Cron entry

Run the monitor once per minute:

```cron
* * * * * /home/pigpulse/bin/esp-watchdog.sh >> /home/pigpulse/.local/state/pigpulse/cron.log 2>&1
```

The wrapper uses a non-blocking lock. If a prior run is still active, the new
run exits quietly with success. A real monitor or publish failure exits
nonzero so cron records it.

## State and alert behavior

The state file contains exactly `ONLINE` or `OFFLINE` and is replaced
atomically. A missing or corrupt state file establishes a baseline without
publishing an alert.

- `ONLINE -> OFFLINE`: publishes `MIC_DISCONNECTED` with `CRITICAL` severity.
- `OFFLINE -> ONLINE`: publishes `MIC_RECOVERED` with `INFO` severity.
- Unchanged state: no MQTT alert and no transition syslog entry.

Alerts use topic `pig/s3-mic-01/alerts`, QoS 1, and are not retained. Payloads
contain `deviceId`, `type`, `severity`, `message`, and `timestamp`.

A failed alert publish does not advance the persisted state, so the next cron
run retries the transition.

## Failure distinction

A missing `mosquitto_sub`, broker connection error, or other probe execution
failure is a monitor failure (`UNKNOWN`), not evidence that the microphone is
offline. It does not alter the persisted device state and returns nonzero.

## Verification

Run the hardware-free contract tests:

```sh
cd backend/thermal-pi
python3 -m unittest tests.test_esp_watchdog -v
```

The tests cover cold-start behavior, debounce, retained-versus-live packets,
local broker pinning, diagnostic failures, atomic state persistence, wrapper
locking, installer packaging, and source safety constraints.
