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
    the wall clock, honestly wrong rather than subtly wrong.

A per-device last-seen ledger (`observe`) lets the bridge log sensor gaps
using the same trustworthy monotonic timeline.

State is persisted as JSON (`anchor` + `devices`), file mode 0600, so a
bridge restart keeps the timeline without re-fetching.
"""

import json
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


class TimeAnchor:
    """Timeline anchored to a truth host's HTTP `Date` header."""

    def __init__(self, state_path, truth_urls=(), http_get=None, wall=None,
                 mono=None, gap_threshold_s=120.0):
        self.state_path = state_path
        self.truth_urls = tuple(truth_urls)
        self.http_get = http_get or _default_http_get
        self.wall = wall or time.time
        self.mono = mono or time.monotonic
        self.gap_threshold_s = gap_threshold_s
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
        """Anchor projection at `now_mono`; None when unanchored."""
        if self._anchor is None:
            return None
        return (self._anchor["truth_ms"]
                + (now_mono - self._anchor["mono"]) * 1000.0)

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
            return self.projected_ms(now_mono)
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
        """Restore anchor + ledger from disk. False when absent/corrupt."""
        try:
            with open(self.state_path, "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except (OSError, ValueError):
            return False
        anchor = state.get("anchor")
        if anchor:
            self._anchor = {"truth_ms": anchor["truth_ms"],
                            "mono": anchor["mono"],
                            "source": anchor["source"]}
            self._mono_valid()  # drop immediately if this is a new boot
        self._devices = dict(state.get("devices") or {})
        return True

    def save(self):
        """Persist state as JSON, mode 0600 (atomic replace)."""
        parent = os.path.dirname(self.state_path)
        if parent:
            os.makedirs(parent, mode=0o700, exist_ok=True)
        state = {"anchor": self._anchor, "devices": self._devices}
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.state_path)
