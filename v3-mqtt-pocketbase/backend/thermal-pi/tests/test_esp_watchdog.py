#!/usr/bin/env python3
"""Focused tests for the s3-mic-01 MQTT watchdog.

These tests are deliberately hardware-free: command execution is injected and
MQTT is represented by the retained flag printed by ``mosquitto_sub %r``.

    cd backend/thermal-pi
    python3 -m unittest tests.test_esp_watchdog -v
"""

from __future__ import annotations

import fcntl
import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
SOURCE_DIR = HERE.parent
sys.path.insert(0, str(SOURCE_DIR))

import esp_watchdog as wd  # noqa: E402


NOW_MS = 1_700_000_000_123
NOW_S = NOW_MS // 1000


def completed(argv: list[str], *, returncode: int = 0, stdout: str = "",
             stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        argv,
        returncode=returncode,
        stdout=stdout,
        stderr=stderr,
    )


class FakeRunner:
    """Record argv arrays and return deterministic command results."""

    def __init__(self, *, mqtt_stdout: str = "", mqtt_rc: int = 27,
                 resolver_stdout: str = "ap0", resolver_rc: int = 0,
                 iw_stdout: str = "", iw_rc: int = 0,
                 publish_rc: int = 0,
                 mqtt_error: Exception | None = None,
                 resolver_error: Exception | None = None,
                 publish_error: Exception | None = None) -> None:
        self.mqtt_stdout = mqtt_stdout
        self.mqtt_rc = mqtt_rc
        self.resolver_stdout = resolver_stdout
        self.resolver_rc = resolver_rc
        self.iw_stdout = iw_stdout
        self.iw_rc = iw_rc
        self.publish_rc = publish_rc
        self.mqtt_error = mqtt_error
        self.resolver_error = resolver_error
        self.publish_error = publish_error
        self.calls: list[list[str]] = []

    def __call__(self, argv: list[str]) -> subprocess.CompletedProcess[str]:
        argv = list(argv)
        self.calls.append(argv)
        if argv[0] == wd.MOSQUITTO_SUB:
            if self.mqtt_error is not None:
                raise self.mqtt_error
            return completed(argv, returncode=self.mqtt_rc,
                             stdout=self.mqtt_stdout)
        if argv[0] == wd.IFACE_RESOLVER:
            if self.resolver_error is not None:
                raise self.resolver_error
            return completed(argv, returncode=self.resolver_rc,
                             stdout=self.resolver_stdout)
        if argv[0] == wd.IW_BIN:
            return completed(argv, returncode=self.iw_rc,
                             stdout=self.iw_stdout)
        if argv[0] == wd.MOSQUITTO_PUB:
            if self.publish_error is not None:
                raise self.publish_error
            return completed(argv, returncode=self.publish_rc)
        raise AssertionError(f"unexpected command: {argv}")

    def calls_to(self, binary: str) -> list[list[str]]:
        return [call for call in self.calls if call[0] == binary]


class WatchdogTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.root = Path(self.tempdir.name)
        self.state_path = self.root / "state" / "esp-watchdog.state"
        self.lease_path = self.root / "dnsmasq.leases"
        self.logger = mock.Mock(spec=logging.Logger)

    def make_watchdog(
        self,
        runner: FakeRunner,
        *,
        syslog_writer: object | None = None,
    ) -> wd.EspWatchdog:
        kwargs = {}
        if syslog_writer is not None:
            kwargs["syslog_writer"] = syslog_writer
        return wd.EspWatchdog(
            state_path=str(self.state_path),
            runner=runner,
            now_ms=lambda: NOW_MS,
            logger=self.logger,
            lease_path=str(self.lease_path),
            **kwargs,
        )

    def write_state(self, state: str) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(state + "\n", encoding="utf-8")

    def write_lease(self, expiry: int, mac: str = wd.STATION_MAC) -> None:
        self.lease_path.write_text(
            f"{expiry} {mac} 192.168.69.50 s3-mic-01 01\n",
            encoding="utf-8",
        )

    def publish_payload(self, runner: FakeRunner) -> dict:
        calls = runner.calls_to(wd.MOSQUITTO_PUB)
        self.assertEqual(len(calls), 1)
        argv = calls[0]
        self.assertEqual(argv[argv.index("-t") + 1], wd.ALERT_TOPIC)
        self.assertEqual(argv[argv.index("-q") + 1], "1")
        self.assertNotIn("-r", argv)
        self.assertNotIn("--retain", argv)
        return json.loads(argv[argv.index("-m") + 1])


class ScopeTests(WatchdogTestCase):
    def test_watchdog_is_scoped_to_s3_mic_01(self) -> None:
        self.assertEqual(wd.DEVICE_ID, "s3-mic-01")
        self.assertEqual(wd.TELEMETRY_TOPIC, "pig/s3-mic-01/telemetry")
        self.assertEqual(wd.ALERT_TOPIC, "pig/s3-mic-01/alerts")
        self.assertEqual(wd.STATION_MAC, "68:ee:8f:dd:31:3c")
        self.assertEqual(wd.AP_RADIO_MAC, "dc:a6:32:87:63:a1")


class MqttProbeTests(WatchdogTestCase):
    def test_mqtt_probe_timeout_constant_is_15_seconds(self) -> None:
        self.assertEqual(wd.MQTT_PROBE_SECONDS, 15)

    def test_probe_uses_retained_flag_and_exact_telemetry_topic(self) -> None:
        runner = FakeRunner(mqtt_stdout="0\n")
        self.make_watchdog(runner).run_once()

        calls = runner.calls_to(wd.MOSQUITTO_SUB)
        self.assertEqual(len(calls), 1)
        argv = calls[0]
        self.assertEqual(argv[argv.index("-t") + 1], wd.TELEMETRY_TOPIC)
        self.assertEqual(argv[argv.index("-F") + 1], "%r")
        self.assertEqual(argv[argv.index("-W") + 1], "15")
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])

    def test_live_packet_is_online_even_if_sub_timeout_returned_nonzero(self) -> None:
        runner = FakeRunner(mqtt_stdout="0\n", mqtt_rc=27)
        self.make_watchdog(runner).run_once()

        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")

    def test_retained_replay_is_not_liveness(self) -> None:
        runner = FakeRunner(mqtt_stdout="1\n", mqtt_rc=27)
        self.make_watchdog(runner).run_once()

        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")

    def test_any_live_packet_beats_a_retained_replay(self) -> None:
        runner = FakeRunner(mqtt_stdout="1\n0\n1\n", mqtt_rc=27)
        self.make_watchdog(runner).run_once()

        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")


class DiagnosticOnlyTests(WatchdogTestCase):
    def test_ap_association_and_future_lease_cannot_override_mqtt_absence(self) -> None:
        self.write_lease(NOW_S + 120)
        runner = FakeRunner(
            mqtt_stdout="1\n",
            resolver_stdout="ap7\n",
            iw_stdout=f"Station {wd.STATION_MAC} (on ap7)\n",
        )
        self.make_watchdog(runner).run_once()

        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")

    def test_ap_interface_is_resolved_by_mac_and_iw_is_absolute(self) -> None:
        runner = FakeRunner(
            mqtt_stdout="0\n",
            resolver_stdout="ap7\n",
            iw_stdout="",
        )
        self.make_watchdog(runner).run_once()

        resolver_calls = runner.calls_to(wd.IFACE_RESOLVER)
        self.assertEqual(
            resolver_calls,
            [[wd.IFACE_RESOLVER, wd.AP_RADIO_MAC]],
        )
        iw_calls = runner.calls_to(wd.IW_BIN)
        self.assertEqual(
            iw_calls,
            [[wd.IW_BIN, "dev", "ap7", "station", "dump"]],
        )

    def test_expired_lease_is_not_accepted(self) -> None:
        self.write_lease(NOW_S)
        self.assertFalse(
            wd.has_unexpired_lease(
                str(self.lease_path), wd.STATION_MAC, NOW_S
            )
        )

    def test_future_lease_is_accepted(self) -> None:
        self.write_lease(NOW_S + 1)
        self.assertTrue(
            wd.has_unexpired_lease(
                str(self.lease_path), wd.STATION_MAC, NOW_S
            )
        )

    def test_missing_or_malformed_lease_file_is_not_a_lease(self) -> None:
        self.assertFalse(
            wd.has_unexpired_lease(
                str(self.lease_path), wd.STATION_MAC, NOW_S
            )
        )
        self.lease_path.write_text("not-a-lease\n", encoding="utf-8")
        self.assertFalse(
            wd.has_unexpired_lease(
                str(self.lease_path), wd.STATION_MAC, NOW_S
            )
        )

    def test_station_dump_matches_only_the_requested_mac(self) -> None:
        self.assertTrue(
            wd.is_station_associated(
                f"Station {wd.STATION_MAC.upper()} (on ap7)\n",
                wd.STATION_MAC,
            )
        )
        self.assertFalse(
            wd.is_station_associated(
                "Station 00:11:22:33:44:55 (on ap7)\n",
                wd.STATION_MAC,
            )
        )


class StatePersistenceTests(WatchdogTestCase):
    def test_missing_state_is_a_safe_first_observation(self) -> None:
        runner = FakeRunner(mqtt_stdout="0\n")
        with mock.patch("syslog.syslog") as syslog:
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "ONLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])
        self.logger.info.assert_called_once()
        baseline = self.logger.info.call_args
        self.assertIn("baseline", baseline.args[0].lower())
        self.assertEqual(baseline.args[2], "ONLINE")
        self.assertEqual(baseline.args[3], False)
        self.assertEqual(baseline.args[4], False)
        syslog.assert_not_called()

    def test_corrupt_state_is_a_safe_first_observation(self) -> None:
        self.write_state("BROKEN")
        runner = FakeRunner(mqtt_stdout="0\n")
        state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "ONLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])
        self.logger.info.assert_called_once()
        self.assertIn("baseline", self.logger.info.call_args.args[0].lower())

    def test_unchanged_state_emits_no_alert_or_transition_log(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="0\n")
        with mock.patch("syslog.syslog") as syslog:
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "ONLINE")
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])
        self.logger.info.assert_not_called()
        syslog.assert_not_called()

    def test_state_file_accepts_only_online_or_offline(self) -> None:
        wd.write_state(str(self.state_path), "ONLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        with self.assertRaises(ValueError):
            wd.write_state(str(self.state_path), "BROKEN")

    def test_cold_start_state_write_failure_is_reported_without_crash(self) -> None:
        runner = FakeRunner(mqtt_stdout="0\n")
        with mock.patch.object(wd, "write_state", side_effect=OSError("read-only")):
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "ONLINE")
        self.logger.error.assert_called()
        self.assertIn("state", self.logger.error.call_args.args[0].lower())

    def test_read_state_rejects_missing_corrupt_and_unknown_values(self) -> None:
        self.assertIsNone(wd.read_state(str(self.state_path)))
        self.write_state("BROKEN")
        self.assertIsNone(wd.read_state(str(self.state_path)))
        self.write_state("online")
        self.assertIsNone(wd.read_state(str(self.state_path)))

    def test_atomic_write_uses_same_directory_replace_and_fsync(self) -> None:
        observed: dict[str, object] = {}
        real_replace = os.replace
        real_fsync = os.fsync

        def replace_spy(src: str, dst: str) -> None:
            observed["src"] = src
            observed["dst"] = dst
            observed["src_text"] = Path(src).read_text(encoding="utf-8")
            real_replace(src, dst)

        with mock.patch.object(wd.os, "replace", side_effect=replace_spy), \
                mock.patch.object(wd.os, "fsync", wraps=real_fsync) as fsync:
            wd.write_state(str(self.state_path), "OFFLINE")

        src = Path(str(observed["src"]))
        dst = Path(str(observed["dst"]))
        self.assertEqual(src.parent, dst.parent)
        self.assertEqual(observed["src_text"], "OFFLINE\n")
        self.assertEqual(dst.read_text(encoding="utf-8"), "OFFLINE\n")
        self.assertGreaterEqual(fsync.call_count, 2)


class TransitionTests(WatchdogTestCase):
    def test_online_to_offline_publishes_disconnect_alert(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="1\n")
        with mock.patch("syslog.syslog") as syslog:
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "OFFLINE")
        payload = self.publish_payload(runner)
        self.assertEqual(
            set(payload),
            {"deviceId", "type", "severity", "message", "timestamp"},
        )
        self.assertEqual(payload["deviceId"], "s3-mic-01")
        self.assertEqual(payload["type"], "MIC_DISCONNECTED")
        self.assertEqual(payload["severity"], "CRITICAL")
        self.assertIsInstance(payload["message"], str)
        self.assertTrue(payload["message"].strip())
        self.assertEqual(payload["timestamp"], NOW_MS)
        self.assertIs(type(payload["timestamp"]), int)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")
        self.logger.info.assert_called_once()
        syslog.assert_called_once()
        self.assertIn("s3-mic-01", syslog.call_args.args[1])

    def test_offline_to_online_publishes_recovery_alert(self) -> None:
        self.write_state("OFFLINE")
        runner = FakeRunner(mqtt_stdout="0\n")
        with mock.patch("syslog.syslog") as syslog:
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "ONLINE")
        payload = self.publish_payload(runner)
        self.assertEqual(
            set(payload),
            {"deviceId", "type", "severity", "message", "timestamp"},
        )
        self.assertEqual(payload["deviceId"], "s3-mic-01")
        self.assertEqual(payload["type"], "MIC_RECOVERED")
        self.assertEqual(payload["severity"], "INFO")
        self.assertEqual(payload["timestamp"], NOW_MS)
        self.assertIs(type(payload["timestamp"]), int)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.logger.info.assert_called_once()
        syslog.assert_called_once()
        self.assertIn("s3-mic-01", syslog.call_args.args[1])

    def test_failed_alert_publish_keeps_previous_state_for_retry(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="1\n", publish_rc=1)
        with mock.patch("syslog.syslog") as syslog:
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "OFFLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.assertEqual(len(runner.calls_to(wd.MOSQUITTO_PUB)), 1)
        syslog.assert_called_once()
        self.assertIn("ONLINE -> OFFLINE", syslog.call_args.args[1])

    def test_state_write_failure_is_reported_without_crash(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="1\n")
        with mock.patch.object(wd, "write_state", side_effect=OSError("read-only")):
            state = self.make_watchdog(runner).run_once()

        self.assertEqual(state, "OFFLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.logger.error.assert_called()
        self.assertIn("state", self.logger.error.call_args.args[0].lower())


class ColdStartAndDebounceTests(WatchdogTestCase):
    def test_cold_start_offline_establishes_baseline_without_alert(self) -> None:
        runner = FakeRunner(mqtt_stdout="1\n", mqtt_rc=27)
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        state = watchdog.run_once()

        self.assertEqual(state, "OFFLINE")
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])
        self.assertFalse(watchdog.failed)
        self.assertIn("baseline", self.logger.info.call_args.args[0].lower())

    def test_one_offline_window_transitions_and_next_window_is_debounced(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="1\n", mqtt_rc=27)
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        first = watchdog.run_once()
        second = watchdog.run_once()

        self.assertEqual(first, "OFFLINE")
        self.assertEqual(second, "OFFLINE")
        self.assertEqual(len(runner.calls_to(wd.MOSQUITTO_PUB)), 1)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")


class MonitorFailureTests(WatchdogTestCase):
    def test_missing_mosquitto_sub_is_not_a_device_offline_transition(self) -> None:
        runner = FakeRunner(mqtt_error=OSError("mosquitto_sub missing"))
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        state = watchdog.run_once()

        self.assertEqual(state, "UNKNOWN")
        self.assertTrue(watchdog.failed)
        self.assertFalse(self.state_path.exists())
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])
        self.logger.error.assert_called()

    def test_broker_probe_error_is_not_a_device_offline_transition(self) -> None:
        runner = FakeRunner(mqtt_rc=1)
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        state = watchdog.run_once()

        self.assertEqual(state, "UNKNOWN")
        self.assertTrue(watchdog.failed)
        self.assertFalse(self.state_path.exists())
        self.assertEqual(runner.calls_to(wd.MOSQUITTO_PUB), [])

    def test_expected_timeout_without_live_packet_is_offline_not_monitor_failure(self) -> None:
        runner = FakeRunner(mqtt_stdout="", mqtt_rc=27)
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        state = watchdog.run_once()

        self.assertEqual(state, "OFFLINE")
        self.assertFalse(watchdog.failed)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")

    def test_recovery_publish_failure_keeps_offline_state_and_retries(self) -> None:
        self.write_state("OFFLINE")
        transition_syslog = mock.Mock()
        failed_runner = FakeRunner(mqtt_stdout="0\n", publish_rc=1)
        failed = self.make_watchdog(failed_runner, syslog_writer=transition_syslog)

        observed = failed.run_once()

        self.assertEqual(observed, "ONLINE")
        self.assertTrue(failed.failed)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "OFFLINE\n")
        transition_syslog.assert_called_once()

        retry_runner = FakeRunner(mqtt_stdout="0\n", publish_rc=0)
        retry = self.make_watchdog(retry_runner, syslog_writer=mock.Mock())
        self.assertEqual(retry.run_once(), "ONLINE")
        self.assertFalse(retry.failed)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.assertEqual(len(retry_runner.calls_to(wd.MOSQUITTO_PUB)), 1)

    def test_resolver_failure_is_visible_but_does_not_override_mqtt(self) -> None:
        runner = FakeRunner(
            mqtt_stdout="0\n",
            resolver_error=OSError("resolver failed"),
        )
        watchdog = self.make_watchdog(runner, syslog_writer=mock.Mock())

        state = watchdog.run_once()

        self.assertEqual(state, "ONLINE")
        self.assertFalse(watchdog.failed)
        self.assertEqual(self.state_path.read_text(encoding="utf-8"), "ONLINE\n")
        self.logger.warning.assert_called()
        self.assertIn("resolve", self.logger.warning.call_args.args[0].lower())

    def test_main_returns_nonzero_after_monitor_failure(self) -> None:
        instance = mock.Mock()
        instance.failed = True
        instance.run_once.return_value = "UNKNOWN"
        with mock.patch.object(wd, "EspWatchdog", return_value=instance):
            exit_code = wd.main(["--state", str(self.state_path)])
        self.assertEqual(exit_code, 1)


class MqttEndpointTests(WatchdogTestCase):
    def test_probe_and_publish_pin_local_broker_without_credentials(self) -> None:
        self.write_state("ONLINE")
        runner = FakeRunner(mqtt_stdout="1\n", mqtt_rc=27)
        self.make_watchdog(runner, syslog_writer=mock.Mock()).run_once()

        sub_argv = runner.calls_to(wd.MOSQUITTO_SUB)[0]
        pub_argv = runner.calls_to(wd.MOSQUITTO_PUB)[0]
        for argv in (sub_argv, pub_argv):
            self.assertEqual(argv[argv.index("-h") + 1], "127.0.0.1")
            self.assertEqual(argv[argv.index("-p") + 1], "1883")
            for credential_flag in ("-u", "-P", "--username", "--password", "--pw"):
                self.assertNotIn(credential_flag, argv)

    def test_diagnostic_command_timeout_is_bounded(self) -> None:
        with mock.patch.object(wd.subprocess, "run") as run:
            run.return_value = completed(
                [wd.IFACE_RESOLVER, wd.AP_RADIO_MAC],
                stdout="ap7\n",
            )
            wd.run_command([wd.IFACE_RESOLVER, wd.AP_RADIO_MAC])

        self.assertLessEqual(
            run.call_args.kwargs["timeout"],
            wd.DIAGNOSTIC_TIMEOUT_SECONDS,
        )


class WrapperAndPackagingTests(WatchdogTestCase):
    def test_overlapping_cron_run_is_quiet_and_successful(self) -> None:
        wrapper = SOURCE_DIR / "esp-watchdog.sh"
        wrapper_text = wrapper.read_text(encoding="utf-8")
        self.assertIn("PIGPULSE_WATCHDOG_STATE_DIR", wrapper_text)

        state_dir = self.root / "wrapper-state"
        state_dir.mkdir()
        lock_path = state_dir / "esp-watchdog.lock"
        with lock_path.open("w", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            env = os.environ.copy()
            env["PIGPULSE_WATCHDOG_STATE_DIR"] = str(state_dir)
            result = subprocess.run(
                [str(wrapper)],
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=5,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr, "")

    def test_wrapper_propagates_real_failure_as_nonzero(self) -> None:
        wrapper = SOURCE_DIR / "esp-watchdog.sh"
        wrapper_text = wrapper.read_text(encoding="utf-8")
        self.assertIn("PIGPULSE_WATCHDOG_PYTHON", wrapper_text)

        state_dir = self.root / "wrapper-failure-state"
        env = os.environ.copy()
        env["PIGPULSE_WATCHDOG_STATE_DIR"] = str(state_dir)
        env["PIGPULSE_WATCHDOG_PYTHON"] = "/does/not/exist/python3"
        result = subprocess.run(
            [str(wrapper)],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)

    def test_wrapper_does_not_mistake_child_exit_75_for_lock_contention(self) -> None:
        wrapper = SOURCE_DIR / "esp-watchdog.sh"
        state_dir = self.root / "wrapper-child-75-state"
        state_dir.mkdir()
        fake_python = self.root / "python-exit-75"
        fake_python.write_text("#!/bin/sh\nexit 75\n", encoding="utf-8")
        fake_python.chmod(0o755)

        env = os.environ.copy()
        env["PIGPULSE_WATCHDOG_STATE_DIR"] = str(state_dir)
        env["PIGPULSE_WATCHDOG_PYTHON"] = str(fake_python)
        result = subprocess.run(
            [str(wrapper)],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            check=False,
        )

        self.assertEqual(result.returncode, 75, result.stderr)

    def test_installer_packages_both_scripts_with_executable_modes(self) -> None:
        installer_source = SOURCE_DIR / "install-esp-watchdog.sh"
        self.assertTrue(installer_source.is_file())
        installer_text = installer_source.read_text(encoding="utf-8")

        fake_bin = self.root / "fake-bin"
        fake_bin.mkdir()
        required_binaries = ("mosquitto_sub", "mosquitto_pub", "flock", "python3")
        for name in required_binaries:
            fake = fake_bin / name
            if name in ("mosquitto_sub", "mosquitto_pub"):
                fake.write_text(
                    "#!/bin/sh\n"
                    "if [ \"${1:-}\" = \"--version\" ]; then\n"
                    f"  printf '%s\\n' '{name} version 2.0.18 running on libmosquitto 2.0.18'\n"
                    "fi\n"
                    "exit 0\n",
                    encoding="utf-8",
                )
            else:
                fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake.chmod(0o755)
            absolute_path = f"/usr/bin/{name}"
            self.assertIn(absolute_path, installer_text)
            installer_text = installer_text.replace(absolute_path, str(fake))

        timestamp = "20261120T010203Z"
        fake_date = fake_bin / "date"
        fake_date.write_text(
            f"#!/bin/sh\nprintf '%s\\n' '{timestamp}'\n",
            encoding="utf-8",
        )
        fake_date.chmod(0o755)

        installer_dir = self.root / "installer"
        installer_dir.mkdir()
        installer = installer_dir / "install-esp-watchdog.sh"
        installer.write_text(installer_text, encoding="utf-8")
        installer.chmod(0o755)
        packaged_names = ("esp-watchdog.sh", "esp_watchdog.py")
        for name in packaged_names:
            shutil.copy2(SOURCE_DIR / name, installer_dir / name)

        dest = self.root / "bin"
        dest.mkdir()
        previous = {
            "esp-watchdog.sh": (b"old wrapper\n", 0o750),
            "esp_watchdog.py": (b"old python\n", 0o640),
        }
        for name, (content, mode) in previous.items():
            existing = dest / name
            existing.write_bytes(content)
            existing.chmod(mode)

        state_dir = self.root / "installed-state"
        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}{os.pathsep}{env.get('PATH', '')}"
        env["PIGPULSE_WATCHDOG_DEST_DIR"] = str(dest)
        env["PIGPULSE_WATCHDOG_STATE_DIR"] = str(state_dir)

        def run_installer() -> None:
            result = subprocess.run(
                [str(installer)],
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=5,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

        run_installer()
        for name in packaged_names:
            installed = dest / name
            self.assertTrue(installed.is_file())
            self.assertEqual(installed.read_bytes(), (SOURCE_DIR / name).read_bytes())
            self.assertEqual(installed.stat().st_mode & 0o777, 0o755)

            backup = dest / f"{name}.bak.{timestamp}"
            old_content, old_mode = previous[name]
            self.assertEqual(backup.read_bytes(), old_content)
            self.assertEqual(backup.stat().st_mode & 0o777, old_mode)
        self.assertTrue(state_dir.is_dir())

        run_installer()
        for name in packaged_names:
            backup = dest / f"{name}.bak.{timestamp}"
            collision_backup = dest / f"{name}.bak.{timestamp}.1"
            old_content, old_mode = previous[name]
            self.assertEqual(backup.read_bytes(), old_content)
            self.assertEqual(backup.stat().st_mode & 0o777, old_mode)
            self.assertEqual(
                collision_backup.read_bytes(),
                (SOURCE_DIR / name).read_bytes(),
            )
            self.assertEqual(collision_backup.stat().st_mode & 0o777, 0o755)
            self.assertEqual((dest / name).stat().st_mode & 0o777, 0o755)


class InstallerContractTests(WatchdogTestCase):
    def prepare_installer(
        self,
        *,
        sub_version: str = "2.0.18",
        pub_version: str = "2.0.18",
        sub_rc: int = 27,
        omit_python_source: bool = False,
        omit_binary: str | None = None,
        invalid_python_source: bool = False,
        version_rc: int = 0,
    ) -> tuple[Path, Path, Path, Path]:
        fake_bin = self.root / "installer-fake-bin"
        fake_bin.mkdir()
        args_file = self.root / "mosquitto-sub-args"
        versions = {
            "mosquitto_sub": sub_version,
            "mosquitto_pub": pub_version,
        }
        for name, version in versions.items():
            if name == omit_binary:
                continue
            fake = fake_bin / name
            if name == "mosquitto_sub":
                fake.write_text(
                    "#!/bin/sh\n"
                    "if [ \"${1:-}\" = \"--version\" ]; then\n"
                    f"  printf '%s\\n' 'mosquitto_sub version {version} running on libmosquitto {version}'\n"
                    f"  exit '{version_rc}'\n"
                    "fi\n"
                    "printf '%s\\n' \"$@\" > \"$PIGPULSE_TEST_MQTT_ARGS\"\n"
                    "exit \"${PIGPULSE_TEST_MQTT_RC:-27}\"\n",
                    encoding="utf-8",
                )
            else:
                fake.write_text(
                    "#!/bin/sh\n"
                    "if [ \"${1:-}\" = \"--version\" ]; then\n"
                    f"  printf '%s\\n' 'mosquitto_pub version {version} running on libmosquitto {version}'\n"
                    f"  exit '{version_rc}'\n"
                    "fi\n"
                    "exit 0\n",
                    encoding="utf-8",
                )
            fake.chmod(0o755)
        for name in ("flock", "python3"):
            if name == omit_binary:
                continue
            fake = fake_bin / name
            if name == "python3":
                fake.write_text(
                    f"#!/bin/sh\nexec {shlex.quote(sys.executable)} \"$@\"\n",
                    encoding="utf-8",
                )
            else:
                fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake.chmod(0o755)

        installer_dir = self.root / "contract-installer"
        installer_dir.mkdir()
        installer_source = SOURCE_DIR / "install-esp-watchdog.sh"
        installer_text = installer_source.read_text(encoding="utf-8")
        for name in ("mosquitto_sub", "mosquitto_pub", "flock", "python3"):
            installer_text = installer_text.replace(
                f"/usr/bin/{name}",
                str(fake_bin / name),
            )
        installer = installer_dir / "install-esp-watchdog.sh"
        installer.write_text(installer_text, encoding="utf-8")
        installer.chmod(0o755)
        shutil.copy2(SOURCE_DIR / "esp-watchdog.sh", installer_dir / "esp-watchdog.sh")
        if not omit_python_source:
            shutil.copy2(SOURCE_DIR / "esp_watchdog.py", installer_dir / "esp_watchdog.py")
            if invalid_python_source:
                (installer_dir / "esp_watchdog.py").write_text(
                    "def broken(:\n",
                    encoding="utf-8",
                )

        dest = self.root / "contract-bin"
        dest.mkdir()
        state_dir = self.root / "contract-state"
        return installer, dest, state_dir, args_file

    def run_installer(
        self,
        installer: Path,
        dest: Path,
        state_dir: Path,
        args_file: Path,
        *,
        sub_rc: int = 27,
    ) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["PIGPULSE_WATCHDOG_DEST_DIR"] = str(dest)
        env["PIGPULSE_WATCHDOG_STATE_DIR"] = str(state_dir)
        env["PIGPULSE_TEST_MQTT_ARGS"] = str(args_file)
        env["PIGPULSE_TEST_MQTT_RC"] = str(sub_rc)
        return subprocess.run(
            [str(installer)],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            check=False,
        )

    def test_installer_rejects_mosquitto_clients_older_than_2_0(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer(
            sub_version="1.6.15",
            pub_version="1.6.15",
        )

        result = self.run_installer(installer, dest, state_dir, args_file)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("2.0", result.stderr)
        self.assertFalse((dest / "esp-watchdog.sh").exists())

    def test_installer_accepts_valid_version_output_when_version_exits_nonzero(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer(version_rc=1)

        result = self.run_installer(installer, dest, state_dir, args_file, sub_rc=27)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((dest / "esp-watchdog.sh").is_file())
        self.assertTrue((dest / "esp_watchdog.py").is_file())

    def test_installer_accepts_timeout_27_from_anonymous_local_preflight(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer()

        result = self.run_installer(installer, dest, state_dir, args_file, sub_rc=27)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((dest / "esp-watchdog.sh").is_file())
        self.assertTrue((dest / "esp_watchdog.py").is_file())
        args = args_file.read_text(encoding="utf-8").splitlines()
        self.assertEqual(args[args.index("-h") + 1], "127.0.0.1")
        self.assertEqual(args[args.index("-p") + 1], "1883")
        self.assertEqual(args[args.index("-W") + 1], "15")
        for credential_flag in ("-u", "-P", "--username", "--password", "--pw"):
            self.assertNotIn(credential_flag, args)

    def test_installer_rejects_failed_local_preflight_without_replacing_files(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer()
        wrapper = dest / "esp-watchdog.sh"
        wrapper.write_text("old wrapper\n", encoding="utf-8")

        result = self.run_installer(installer, dest, state_dir, args_file, sub_rc=5)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(wrapper.read_text(encoding="utf-8"), "old wrapper\n")
        self.assertFalse((dest / "esp_watchdog.py").exists())
        self.assertFalse(list(dest.glob("*.bak.*")))

    def test_installer_requires_both_source_files_before_replacing_files(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer(
            omit_python_source=True,
        )
        wrapper = dest / "esp-watchdog.sh"
        wrapper.write_text("old wrapper\n", encoding="utf-8")

        result = self.run_installer(installer, dest, state_dir, args_file)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(wrapper.read_text(encoding="utf-8"), "old wrapper\n")
        self.assertFalse(list(dest.glob("*.bak.*")))

    def test_installer_rejects_missing_prerequisite_without_replacing_files(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer(
            omit_binary="mosquitto_pub",
        )
        wrapper = dest / "esp-watchdog.sh"
        wrapper.write_text("old wrapper\n", encoding="utf-8")

        result = self.run_installer(installer, dest, state_dir, args_file)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mosquitto_pub", result.stderr)
        self.assertEqual(wrapper.read_text(encoding="utf-8"), "old wrapper\n")
        self.assertFalse(list(dest.glob("*.bak.*")))

    def test_installer_rejects_invalid_python_before_replacing_files(self) -> None:
        installer, dest, state_dir, args_file = self.prepare_installer(
            invalid_python_source=True,
        )
        wrapper = dest / "esp-watchdog.sh"
        wrapper.write_text("old wrapper\n", encoding="utf-8")

        result = self.run_installer(installer, dest, state_dir, args_file)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("esp_watchdog.py", result.stderr)
        self.assertEqual(wrapper.read_text(encoding="utf-8"), "old wrapper\n")
        self.assertFalse(list(dest.glob("*.bak.*")))


class SourceSafetyTests(unittest.TestCase):
    def source_and_wrapper(self) -> tuple[str, str]:
        source = (SOURCE_DIR / "esp_watchdog.py").read_text(encoding="utf-8")
        wrapper = (SOURCE_DIR / "esp-watchdog.sh").read_text(encoding="utf-8")
        return source, wrapper

    def test_source_and_wrapper_are_free_of_live_audio_endpoint(self) -> None:
        source, wrapper = self.source_and_wrapper()
        self.assertNotIn("9090", source)
        self.assertNotIn("9090", wrapper)

    def test_source_and_wrapper_do_not_hardcode_wlan_interface_names(self) -> None:
        source, wrapper = self.source_and_wrapper()
        pattern = re.compile(r"\bwlan[01]\b")
        self.assertIsNone(pattern.search(source))
        self.assertIsNone(pattern.search(wrapper))

    def test_source_never_uses_shell_true(self) -> None:
        source, _ = self.source_and_wrapper()
        self.assertNotIn("shell=True", source)

    def test_wrapper_calls_adjacent_source_with_predictable_state_path(self) -> None:
        _, wrapper = self.source_and_wrapper()
        self.assertTrue(wrapper.startswith("#!/bin/sh\n"))
        self.assertIn('"$SCRIPT_DIR/esp_watchdog.py"', wrapper)
        self.assertIn(
            "STATE_DIR=/home/pigpulse/.local/state/pigpulse",
            wrapper,
        )
        self.assertIn('"$STATE_DIR/esp-watchdog.state"', wrapper)
        self.assertIn("exec ", wrapper)

    def test_wrapper_prevents_overlapping_cron_runs(self) -> None:
        _, wrapper = self.source_and_wrapper()
        self.assertIn("/usr/bin/flock", wrapper)
        self.assertIn("-n ", wrapper)
        self.assertIn("esp-watchdog.lock", wrapper)


if __name__ == "__main__":
    unittest.main(verbosity=2)
