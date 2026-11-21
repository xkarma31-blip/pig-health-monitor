#!/usr/bin/env python3
"""Monitor MQTT liveness for s3-mic-01 and alert only on state transitions."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import syslog
import tempfile
import time
from pathlib import Path
from typing import Callable, Optional

DEVICE_ID = "s3-mic-01"
TELEMETRY_TOPIC = "pig/s3-mic-01/telemetry"
ALERT_TOPIC = "pig/s3-mic-01/alerts"
STATION_MAC = "68:ee:8f:dd:31:3c"
AP_RADIO_MAC = "dc:a6:32:87:63:a1"

MOSQUITTO_SUB = "/usr/bin/mosquitto_sub"
MOSQUITTO_PUB = "/usr/bin/mosquitto_pub"
IFACE_RESOLVER = "/usr/local/sbin/pigpulse-wlan-iface"
IW_BIN = "/usr/sbin/iw"
LEASE_PATH = "/var/lib/misc/dnsmasq.leases"
DEFAULT_STATE_PATH = "/home/pigpulse/.local/state/pigpulse/esp-watchdog.state"
MQTT_HOST = "127.0.0.1"
MQTT_PORT = "1883"
MQTT_PROBE_SECONDS = 15
DIAGNOSTIC_TIMEOUT_SECONDS = 5
MQTT_TIMEOUT_RETURNCODE = 27

Runner = Callable[[list[str]], subprocess.CompletedProcess[str]]
SyslogWriter = Callable[[int, str], None]
VALID_STATES = {"ONLINE", "OFFLINE"}
_INTERFACE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def run_command(argv: list[str]) -> subprocess.CompletedProcess[str]:
    """Run one command without a shell."""
    timeout = (
        MQTT_PROBE_SECONDS + 5
        if argv and argv[0] == MOSQUITTO_SUB
        else DIAGNOSTIC_TIMEOUT_SECONDS
    )
    return subprocess.run(
        argv,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )


def read_state(path: str) -> Optional[str]:
    """Return a known persisted state, or None for missing/corrupt state."""
    try:
        state = Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None
    return state if state in VALID_STATES else None


def write_state(path: str, state: str) -> None:
    """Atomically persist one watchdog state."""
    if state not in VALID_STATES:
        raise ValueError(f"invalid watchdog state: {state!r}")

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        dir=str(target.parent),
        prefix=f".{target.name}.",
        suffix=".tmp",
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            temp_file.write(state + "\n")
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, target)
        dir_fd = os.open(str(target.parent), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def has_unexpired_lease(path: str, station_mac: str, now_s: int) -> bool:
    """Return whether the exact station has a DHCP lease expiring in future."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return False

    for line in lines:
        fields = line.split()
        if len(fields) < 2 or fields[1].lower() != station_mac.lower():
            continue
        try:
            expiry = int(fields[0])
        except ValueError:
            continue
        if expiry > now_s:
            return True
    return False


def is_station_associated(station_dump: str, station_mac: str) -> bool:
    """Return whether an iw station dump contains the exact station MAC."""
    for line in station_dump.splitlines():
        fields = line.split()
        if len(fields) >= 2:
            if fields[0].lower() == "station" and fields[1].lower() == station_mac.lower():
                return True
    return False


def _has_live_packet(stdout: str) -> bool:
    """A retained flag of 0 is the only proof of a live MQTT packet."""
    return any(line.strip() == "0" for line in stdout.splitlines())


class EspWatchdog:
    def __init__(
        self,
        state_path: str,
        runner: Optional[Runner] = None,
        now_ms: Optional[Callable[[], int]] = None,
        logger: Optional[logging.Logger] = None,
        lease_path: str = LEASE_PATH,
        syslog_writer: Optional[SyslogWriter] = None,
    ) -> None:
        self.state_path = state_path
        self.runner = runner or run_command
        self.now_ms = now_ms or (lambda: int(time.time() * 1000))
        self.logger = logger or logging.getLogger(__name__)
        self.lease_path = lease_path
        self.syslog_writer = syslog_writer or syslog.syslog
        self.failed = False

    def _mqtt_observation(self) -> str:
        """Return ONLINE, OFFLINE, or UNKNOWN for one MQTT probe window."""
        argv = [
            MOSQUITTO_SUB,
            "-h",
            MQTT_HOST,
            "-p",
            MQTT_PORT,
            "-t",
            TELEMETRY_TOPIC,
            "-F",
            "%r",
            "-W",
            str(MQTT_PROBE_SECONDS),
        ]
        try:
            result = self.runner(argv)
        except (OSError, subprocess.SubprocessError) as exc:
            self.failed = True
            self.logger.error("%s MQTT probe failed", DEVICE_ID, exc_info=exc)
            return "UNKNOWN"

        stdout = result.stdout or ""
        if _has_live_packet(stdout):
            return "ONLINE"
        if result.returncode == MQTT_TIMEOUT_RETURNCODE:
            return "OFFLINE"

        self.failed = True
        self.logger.error(
            "%s MQTT probe failed with return code %s",
            DEVICE_ID,
            result.returncode,
        )
        return "UNKNOWN"

    def _diagnostics(self) -> tuple[bool, bool]:
        """Collect AP association and DHCP evidence without using it for state."""
        associated = False
        interface = ""
        try:
            resolved = self.runner([IFACE_RESOLVER, AP_RADIO_MAC])
            if resolved.returncode == 0:
                interface = (resolved.stdout or "").strip().splitlines()[0].strip()
            else:
                self.logger.warning(
                    "%s could not resolve AP radio interface (rc=%s)",
                    DEVICE_ID,
                    resolved.returncode,
                )
        except (OSError, subprocess.SubprocessError, IndexError):
            self.logger.warning(
                "%s could not resolve AP radio interface",
                DEVICE_ID,
                exc_info=True,
            )

        if interface and _INTERFACE_RE.fullmatch(interface):
            try:
                station_dump = self.runner([IW_BIN, "dev", interface, "station", "dump"])
                associated = (
                    station_dump.returncode == 0
                    and is_station_associated(station_dump.stdout or "", STATION_MAC)
                )
            except (OSError, subprocess.SubprocessError):
                associated = False

        lease = has_unexpired_lease(
            self.lease_path,
            STATION_MAC,
            self.now_ms() // 1000,
        )
        return associated, lease

    def _capture_frame() -> str:
        """Best-effort CCTV snapshot as a data URL for the alert record.

        Same contract as the thermal/cough publishers: a missing camera never
        blocks the alert, but every alert should carry the frame that backs it.
        """
        try:
            import base64
            import ssl
            import urllib.request

            ctx = ssl._create_unverified_context()
            url = "https://127.0.0.1:8080/cctv?snapshot=1"
            with urllib.request.urlopen(url, timeout=3, context=ctx) as resp:
                data = resp.read()
            if not data or not data.startswith(b"\xff\xd8"):
                return ""
            return "data:image/jpeg;base64," + base64.b64encode(data).decode()
        except Exception:
            return ""

    def _publish_alert(self, state: str) -> bool:
        if state == "OFFLINE":
            alert_type = "MIC_DISCONNECTED"
            severity = "CRITICAL"
            message = f"{DEVICE_ID} telemetry is absent over MQTT"
        else:
            alert_type = "MIC_RECOVERED"
            severity = "INFO"
            message = f"{DEVICE_ID} telemetry received over MQTT"

        payload = {
            "deviceId": DEVICE_ID,
            "type": alert_type,
            "severity": severity,
            "message": message,
            "timestamp": int(self.now_ms()),
        }
        # Attach the CCTV frame that backs this alert (thermal/cough do the
        # same). Best-effort: a missing camera never blocks the alert.
        frame = _capture_frame()
        if frame:
            payload["frame"] = frame
        argv = [
            MOSQUITTO_PUB,
            "-h",
            MQTT_HOST,
            "-p",
            MQTT_PORT,
            "-t",
            ALERT_TOPIC,
            "-q",
            "1",
            "-m",
            json.dumps(payload, separators=(",", ":")),
        ]
        try:
            result = self.runner(argv)
        except (OSError, subprocess.SubprocessError):
            return False
        return result.returncode == 0

    def _persist_state(self, state: str) -> bool:
        try:
            write_state(self.state_path, state)
        except OSError:
            self.logger.error(
                "%s could not persist watchdog state %s",
                DEVICE_ID,
                state,
                exc_info=True,
            )
            return False
        return True

    def _log_transition(
        self,
        previous: str,
        observed: str,
        associated: bool,
        leased: bool,
    ) -> None:
        transition = (
            f"{DEVICE_ID} transition {previous} -> {observed} "
            f"(ap_associated={associated}, dhcp_lease={leased})"
        )
        self.logger.info(transition)
        try:
            priority = syslog.LOG_ERR if observed == "OFFLINE" else syslog.LOG_INFO
            self.syslog_writer(priority, transition)
        except OSError:
            self.logger.exception("could not write watchdog transition to syslog")

    def run_once(self) -> str:
        observed = self._mqtt_observation()
        if observed == "UNKNOWN":
            return observed

        associated, leased = self._diagnostics()
        previous = read_state(self.state_path)

        if previous is None:
            self.logger.info(
                "%s baseline %s (ap_associated=%s, dhcp_lease=%s)",
                DEVICE_ID,
                observed,
                associated,
                leased,
            )
            if not self._persist_state(observed):
                self.failed = True
            return observed
        if previous == observed:
            return observed

        self._log_transition(previous, observed, associated, leased)
        if not self._publish_alert(observed):
            self.failed = True
            self.logger.error(
                "%s transition %s -> %s: MQTT alert publish failed",
                DEVICE_ID,
                previous,
                observed,
            )
            return observed

        if not self._persist_state(observed):
            self.failed = True
        return observed


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", default=DEFAULT_STATE_PATH)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    watchdog = EspWatchdog(args.state)
    watchdog.run_once()
    return 1 if watchdog.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
