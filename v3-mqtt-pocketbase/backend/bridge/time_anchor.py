"""Laptop-anchored timeline for the Pi bridge (stdlib only).

The Pi has no RTC. Its wall clock has stepped by days (the 2026-11-02
`systemd-timesyncd` first sync moved it +32.8 d), so a stamp taken from the
Pi clock is not a fact about when a sample was produced.

The design (approved 2026-11-02):

  * the truth host — the NTP-synced laptop — sets the anchor via its HTTP
    `Date` header;
  * the monotonic clock carries the timeline forward from there
    (`truth_ms + (mono_now - mono_at_anchor) * 1000`);
  * a wall-clock step on this host changes nothing;
  * a refresh that would move stamps backwards is clamped to keep the
    timeline continuous;
  * a reboot (monotonic reset) invalidates the anchor instead of silently
    extrapolating from a dead monotonic clock — stamps then fall back to
    the wall clock, honestly wrong rather than subtly wrong. The monotonic
    check alone cannot see a reboot whose new boot is already up longer than
    the stored anchor, so the persisted timeline is also scoped to the kernel
    boot identity: state made on a different (or unknown) boot is never
    reused.

A per-device last-seen ledger (`observe`) lets the bridge log sensor gaps
using the same trustworthy monotonic timeline.

State is persisted as JSON (`anchor` + `devices` + `boot_id`), file mode
0600, so a bridge restart keeps the timeline without re-fetching.
"""

import json
import math
import os
import sys
import time
import urllib.request
from email.utils import parsedate_to_datetime

# After a failed refresh, wait this long before trying the truth host again
# (unless forced) — don't hammer a dead host on every message.
RETRY_AFTER_S = 60.0


def _default_http_get(url, timeout=2.0):
    """Fetch `url` and return an object with a `.headers` mapping."""
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp


def _date_header_to_ms(date):
    """Parse an HTTP Date header into epoch milliseconds."""
    return int(parsedate_to_datetime(date).timestamp() * 1000)


_BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id"


def _default_boot_id():
    """Kernel boot identity: stable within a boot, new after a reboot.

    Returns None when the kernel does not expose one (non-Linux, restricted
    `/proc`). Callers then refuse to reuse persisted state: an unknown boot
    is not the same boot.
    """
    try:
        with open(_BOOT_ID_PATH, "r", encoding="utf-8") as fh:
            return fh.read().strip() or None
    except OSError:
        return None


def _is_finite_number(value):
    """True for a number usable in finite float arithmetic.

    Bools and non-numbers are rejected, as are NaN, +/-inf, and integers too
    large to become a finite float. The last kind is mathematically finite
    (`10 ** 400` is a perfectly good Python int) but unusable: the projection
    and ledger arithmetic would raise `OverflowError` converting it to float.
    So acceptance is "a finite float comes back", guarded against that raise.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(float(value))
    except (OverflowError, ValueError):
        return False


def _valid_boot_id(boot_id):
    """True only for a known, non-empty boot identity string."""
    return isinstance(boot_id, str) and bool(boot_id)


def _well_formed_anchor(anchor):
    """True when `anchor` is a dict with finite, sane numeric fields."""
    if not isinstance(anchor, dict):
        return False
    truth_ms = anchor.get("truth_ms")
    mono = anchor.get("mono")
    if not _is_finite_number(truth_ms) or not _is_finite_number(mono):
        return False
    return truth_ms > 0 and mono >= 0


def _well_formed_ledger(devices):
    """True when `devices` maps names to finite, non-negative last-seen times."""
    if not isinstance(devices, dict):
        return False
    for key, seen in devices.items():
        if not isinstance(key, str) or not key:
            return False
        if not _is_finite_number(seen) or seen < 0:
            return False
    return True


class TimeAnchor:
    """Timeline anchored to a truth host's HTTP `Date` header."""

    def __init__(self, state_path, truth_urls=(), http_get=None, wall=None,
                 mono=None, gap_threshold_s=120.0, boot_id=None):
        self.state_path = state_path
        self.truth_urls = tuple(truth_urls)
        self.http_get = http_get or _default_http_get
        self.wall = wall or time.time
        self.mono = mono or time.monotonic
        self.gap_threshold_s = gap_threshold_s
        # Injectable so tests need no kernel; default reads the real one.
        self.boot_id = _default_boot_id() if boot_id is None else boot_id
        self._anchor = None       # {"truth_ms", "mono", "source"}
        self._devices = {}        # device -> monotonic time of last observe
        self._last_fail_mono = None

    # ── timeline ─────────────────────────────────────────────────────────
    def refresh(self, force=False):
        """Re-anchor from the truth host. True only on a successful adopt."""
        now_mono = self.mono()
        if (not force and self._last_fail_mono is not None
                and now_mono - self._last_fail_mono < RETRY_AFTER_S):
            return False  # backing off after a failed attempt
        for url in self.truth_urls:
            try:
                resp = self.http_get(url)
                date = resp.headers.get("Date")
                if not date:
                    continue
                truth_ms = _date_header_to_ms(date)
            except Exception:
                continue
            self._adopt(url, truth_ms, self.mono())
            try:
                self.save()
            except OSError as exc:
                # Best-effort persistence: the in-memory anchor still carries
                # the timeline, but a restart will need a fresh re-anchor.
                print(f"time_anchor: could not persist state: {exc}",
                      file=sys.stderr)
            return True
        self._last_fail_mono = self.mono()
        return False

    def _adopt(self, source, truth_ms, mono_now):
        current = self.projected_ms(mono_now)
        if current is not None and truth_ms < current:
            # The truth host stepped backwards (NTP correction): keep the
            # timeline continuous rather than letting stamps regress.
            truth_ms = current
        self._anchor = {"truth_ms": truth_ms, "mono": mono_now,
                        "source": source}
        self._last_fail_mono = None

    def projected_ms(self, now_mono):
        """Anchor projection at `now_mono`; None when unanchored.

        Also None when the arithmetic does not yield a usable finite
        millisecond value: finite fields can still overflow (or not convert)
        under a large monotonic delta, and an inf/NaN stamp is never returned.
        """
        if self._anchor is None:
            return None
        try:
            stamp = (self._anchor["truth_ms"]
                     + (now_mono - self._anchor["mono"]) * 1000.0)
        except (OverflowError, ValueError):
            return None
        return stamp if math.isfinite(stamp) else None

    def _mono_valid(self, now_mono=None):
        """False — and the anchor dropped — after a monotonic reset."""
        if self._anchor is None:
            return False
        now_mono = self.mono() if now_mono is None else now_mono
        if now_mono < self._anchor["mono"]:
            self._anchor = None  # reboot: extrapolation would be fiction
            return False
        return True

    def now_ms(self):
        """Current timeline stamp in ms (wall fallback when unanchored)."""
        now_mono = self.mono()
        if self._mono_valid(now_mono):
            stamp = self.projected_ms(now_mono)
            if stamp is not None:
                return stamp
            # Finite fields, unusable projection: drop the anchor and fall
            # back to the wall clock rather than emit inf/NaN.
            self._anchor = None
        return self.wall() * 1000.0

    def status(self):
        anchored = self._mono_valid()
        return {"anchored": anchored,
                "source": self._anchor["source"] if anchored else None}

    # ── per-device ledger ────────────────────────────────────────────────
    def observe(self, device):
        """Record a sighting of `device`; report the gap since the last one."""
        now_mono = self.mono()
        last = self._devices.get(device)
        self._devices[device] = now_mono
        if last is None:
            return {"gap_s": None, "is_gap": False}
        gap_s = now_mono - last
        if gap_s < 0:
            gap_s = None  # monotonic reset between observations
        return {"gap_s": gap_s,
                "is_gap": gap_s is not None and gap_s >= self.gap_threshold_s}

    # ── persistence ──────────────────────────────────────────────────────
    def load(self):
        """Restore anchor + ledger from disk. False when absent/corrupt.

        This is a startup/reload contract with one rule: unless a well-formed
        state written by this same kernel boot (a known, non-empty identity
        equal on both sides) is *fully* adopted, BOTH the anchor and the
        per-device ledger are cleared and it returns False. That covers a
        missing/unreadable file (including a transient read error), corrupt
        JSON, a wrong root type, an unknown or empty boot, a malformed anchor
        (non-numeric/NaN/inf/negative fields, or numbers too large to be a
        usable float) or ledger, and a monotonic reset under a matching boot.
        Nothing is half-adopted, so a reused instance never keeps state the
        file no longer justifies — honest fallback to the wall clock beats a
        confidently wrong timeline. A caller that wants to keep memory on a
        transient error simply does not call `load()`.

        A well-formed same-boot document that legitimately carries no anchor
        (`anchor: null`, e.g. a fresh boot with only a ledger) is *adopted*:
        True is returned, the in-memory anchor (if any) is dropped so a reload
        never keeps a stale one, and the file's ledger replaces the old one.
        """
        try:
            with open(self.state_path, "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except (OSError, ValueError):
            return self._reject()

        if not isinstance(state, dict):
            return self._reject()

        stored_boot = state.get("boot_id")
        if (not _valid_boot_id(stored_boot)
                or not _valid_boot_id(self.boot_id)
                or stored_boot != self.boot_id):
            # Different (or unknown) boot: the stored monotonic timeline and
            # ledger gaps are not comparable to this boot's clock.
            return self._reject()

        anchor = state.get("anchor")
        if anchor is not None and not _well_formed_anchor(anchor):
            # Non-finite / negative / wrong-shaped anchor: adopt nothing.
            return self._reject()

        devices = state.get("devices")
        if devices is not None and not _well_formed_ledger(devices):
            # Non-numeric / negative ledger entry: adopt nothing, never raise.
            return self._reject()

        if anchor is None:
            # A well-formed same-boot document that legitimately carries no
            # anchor (a fresh boot, or an explicit invalidation). Adopt it as
            # such: drop any anchor already in memory so a reload never keeps
            # a stale one, and take the file's ledger verbatim.
            self._anchor = None
        else:
            self._anchor = {"truth_ms": anchor["truth_ms"],
                            "mono": anchor["mono"],
                            "source": anchor.get("source")}
            if not self._mono_valid():
                # Same boot, but the monotonic clock still went back: the
                # stored ledger shares that dead timeline, so it goes too.
                return self._reject()
        self._devices = dict(devices or {})
        return True

    def _reject(self):
        """Drop all adopted state (fail safe) and report failure."""
        self._anchor = None
        self._devices = {}
        return False

    def save(self):
        """Persist state as JSON, mode 0600 (atomic replace)."""
        parent = os.path.dirname(self.state_path)
        if parent:
            os.makedirs(parent, mode=0o700, exist_ok=True)
        state = {"anchor": self._anchor, "devices": self._devices,
                 "boot_id": self.boot_id}
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.state_path)
