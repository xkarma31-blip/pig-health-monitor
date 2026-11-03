"""Thermal-semantics guard (stdlib only).

The MLX90640 frames a scene, not a pig. The thermal publisher copies the
frame centre into `bodyTemp`, the frame average into `temperature`, and
labels the frame `OUT_OF_BAND` — claims the phone app then reads as a pig
temperature (`frame.temperature > 39.5` -> fever alert). Measured values on
the Pi reach 476.89 "degC", which is a hot spot in the barn, not a body.

Decision (Master, 2026-11-02): keep the sensor running, keep the raw
instrument values, drop only the pig-temperature claim. The guard strips the
claim fields from every telemetry row before it reaches PocketBase:

  * `bodyTemp`, `verdict`, `alerts` — always dropped;
  * `status` — dropped unless it is a device liveness status
    (`online` / `offline`);
  * `temperature` — dropped, but on mic rows it is the SHT45 ambient
    reading (a real instrument value), so it is re-homed to `ambient`.

Raw fields (`center`, `hotspot`, `max`, `min`, `ambient`, `humidity`, ...)
survive untouched. Thermal alert ROWS (the impossible HYPERTHERMIA claims)
are recognised by `is_thermal_alert` so the bridge can suppress them
entirely instead of forwarding them.
"""

# Device liveness statuses are facts about the device, not the pig: keep.
DEVICE_STATUSES = {"online", "offline"}

# Alert types that only the thermal publisher emits.
THERMAL_ALERT_TYPES = {"HYPERTHERMIA", "FEVER"}

# Above this, a "CUSTOM" alert's bodyTemp claim is a thermal-frame value
# (a scene temperature), not a measured body temperature.
THERMAL_CLAIM_THRESHOLD_C = 40.0


def _is_mic_like(payload):
    """Rows from the ESP32-S3 mic carry SHT45 truth: humidity and/or mic."""
    return bool(payload.get("humidity") or payload.get("mic"))


def apply_telemetry_guard(payload):
    """Strip pig-temperature claims from a telemetry payload.

    Returns `(cleaned, dropped)`: `cleaned` is the payload safe to publish,
    `dropped` maps each removed field to its original value (for the log).
    The input dict is never mutated.
    """
    cleaned = dict(payload)
    dropped = {}

    for field in ("bodyTemp", "verdict", "alerts"):
        if field in cleaned:
            dropped[field] = cleaned.pop(field)

    if "temperature" in cleaned:
        if _is_mic_like(cleaned) and "ambient" not in cleaned:
            # SHT45 ambient on mic rows: a real instrument value. Keep it
            # under a name that cannot be read as a pig body temperature.
            cleaned["ambient"] = cleaned["temperature"]
        dropped["temperature"] = cleaned.pop("temperature")

    status = cleaned.get("status")
    if status is not None and str(status).strip().lower() not in DEVICE_STATUSES:
        dropped["status"] = cleaned.pop("status")

    return cleaned, dropped


def is_thermal_alert(row):
    """True when an `alerts`-collection row is a thermal-frame claim.

    Thermal alert rows (HYPERTHERMIA / FEVER, or a CUSTOM alert carrying a
    body-temperature claim) are artefacts of the scene camera and are
    suppressed by the bridge. Unrelated alerts (e.g. MIC_DISCONNECTED)
    pass through.
    """
    kind = str(row.get("type", "")).upper()
    if kind in THERMAL_ALERT_TYPES:
        return True
    if kind == "CUSTOM":
        try:
            return float(row.get("bodyTemp", 0)) > THERMAL_CLAIM_THRESHOLD_C
        except (TypeError, ValueError):
            return False
    return False
