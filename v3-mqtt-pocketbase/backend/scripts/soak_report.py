#!/usr/bin/env python3
"""soak_report.py — PigPulse Pi 4B edge soak report generator.

Generates visual plots (PNG), a Markdown summary, and a self-contained HTML report
from a soak monitoring SQLite database produced by soak_collect.py.

Contract specification: docs/SOAK_CONTRACT.md §6
"""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import io
import json
import os
import sqlite3
import sys
import tempfile
import time


def parse_time_arg(val_str: str | None) -> float | None:
    if not val_str:
        return None
    val_str = str(val_str).strip()
    try:
        return float(val_str)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.timestamp()
        except ValueError:
            pass
    raise ValueError(f"Cannot parse time: '{val_str}' (expected epoch seconds or 'YYYY-MM-DD HH:MM[:SS]')")


def _get_plt():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    return plt


def load_db_data(db_path: str, since: float | None = None, until: float | None = None):
    if not os.path.isfile(db_path):
        raise FileNotFoundError(f"soak database not found: {db_path}")

    uri = f"file:{db_path}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True, timeout=10)
    except sqlite3.Error as exc:
        raise RuntimeError(f"cannot open soak database '{db_path}': {exc}") from exc

    con.row_factory = sqlite3.Row
    try:
        # Friendly error for partial / non-soak databases (finding #13)
        for table in ("samples", "events", "journal"):
            try:
                con.execute(f"SELECT ts FROM {table} LIMIT 1")
            except sqlite3.OperationalError as exc:
                raise RuntimeError(
                    f"'{db_path}' is not a complete soak database — table '{table}' unusable ({exc}). "
                    "Expected samples/events/journal as created by soak_collect.py (SOAK_CONTRACT.md §4)."
                ) from exc

        where_parts = []
        params = []
        if since is not None:
            where_parts.append("ts >= ?")
            params.append(since)
        if until is not None:
            where_parts.append("ts <= ?")
            params.append(until)

        where_clause = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

        cur = con.execute(f"SELECT * FROM samples{where_clause} ORDER BY ts ASC", params)
        samples = [dict(r) for r in cur.fetchall()]

        cur = con.execute(f"SELECT * FROM events{where_clause} ORDER BY ts ASC", params)
        events = [dict(r) for r in cur.fetchall()]

        cur = con.execute(f"SELECT * FROM journal{where_clause} ORDER BY ts ASC", params)
        journal_rows = [dict(r) for r in cur.fetchall()]

        return samples, events, journal_rows
    finally:
        con.close()


def get_median_interval(samples: list[dict]) -> float:
    if len(samples) < 2:
        return 10.0
    gaps = [samples[i]["ts"] - samples[i - 1]["ts"] for i in range(1, len(samples))]
    gaps = [g for g in gaps if g > 0]
    if not gaps:
        return 10.0
    gaps.sort()
    return gaps[len(gaps) // 2]


def compute_signal_availability(samples: list[dict], signal_fn, med_interval: float):
    """Tri-state availability over sample-interval dt.

    signal_fn returns True (up), False (down) or None (unknown / NULL field).
    Unknown time counts toward dt_all but never as up or down. Outages count
    'last known up -> down' transitions. Longest outage uses raw (uncapped) dt
    so a sampling gap inside an outage is not truncated.
    Returns (pct_up, outages, longest_outage_min, pct_unknown).
    """
    if not samples:
        return 0.0, 0, 0.0, 0.0
    if len(samples) < 2:
        st = signal_fn(samples[0])
        pct_up = 100.0 if st is True else 0.0
        pct_unknown = 100.0 if st is None else 0.0
        return pct_up, 0, 0.0, pct_unknown

    max_cap = 3.0 * med_interval
    total_dt = 0.0
    up_dt = 0.0
    unknown_dt = 0.0
    outages = 0
    longest_outage_dt = 0.0
    current_outage_dt = 0.0
    last_known = None  # last non-None state

    for i in range(len(samples) - 1):
        dt_raw = samples[i + 1]["ts"] - samples[i]["ts"]
        if dt_raw <= 0:
            continue
        dt_cap = min(dt_raw, max_cap)
        st = signal_fn(samples[i])

        total_dt += dt_cap
        if st is True:
            up_dt += dt_cap
            current_outage_dt = 0.0
            last_known = True
        elif st is False:
            if last_known is True:
                outages += 1
            current_outage_dt += dt_raw
            if current_outage_dt > longest_outage_dt:
                longest_outage_dt = current_outage_dt
            last_known = False
        else:  # None -> unknown time
            unknown_dt += dt_cap
            current_outage_dt = 0.0

    pct_up = (100.0 * up_dt / total_dt) if total_dt > 0 else 0.0
    pct_unknown = (100.0 * unknown_dt / total_dt) if total_dt > 0 else 0.0
    longest_outage_min = longest_outage_dt / 60.0
    return pct_up, outages, longest_outage_min, pct_unknown


def is_svc_all_active(svc_str: str | None) -> bool:
    if not svc_str:
        return False
    parts = svc_str.split(",")
    if not parts:
        return False
    return all(p.endswith("=active") for p in parts)


# --- Tri-state signal extractors (None = field missing / NULL / 'unknown') ---

_UNKNOWN_STRS = {"", "unknown", "none", "null"}


def _tri_from_int(val) -> bool | None:
    if val is None:
        return None
    return val == 1


def _tri_oper(val) -> bool | None:
    if val is None:
        return None
    text = str(val).strip().lower()
    if text in _UNKNOWN_STRS:
        return None
    return text == "up"


def _tri_svc(val) -> bool | None:
    if val is None or not str(val).strip():
        return None
    return is_svc_all_active(str(val))


def _tri_amb(val) -> bool | None:
    if val is None:
        return None
    text = str(val).strip().lower()
    if text in _UNKNOWN_STRS:
        return None
    return text == "live"


def signal_defs():
    return [
        ("Thermal OK", lambda r: _tri_from_int(r.get("th_ok"))),
        ("ESP Connected", lambda r: _tri_from_int(r.get("esp_conn"))),
        ("Eth Link", lambda r: _tri_oper(r.get("eth_oper"))),
        ("Wlan Link", lambda r: _tri_oper(r.get("wlan_oper"))),
        ("All Services Active", lambda r: _tri_svc(r.get("svc"))),
        ("Ambient Live", lambda r: _tri_amb(r.get("amb_state"))),
    ]


# --- Plotting Functions ---

def plot_temperature(samples: list[dict], events: list[dict], out_path: str):
    plt = _get_plt()
    import numpy as np

    fig, ax = plt.subplots(figsize=(10, 5), dpi=120)

    ts_list = [datetime.fromtimestamp(s["ts"]) for s in samples] if samples else []
    cpu_temps = [s["cpu_temp_c"] for s in samples]
    amb_temps = [s["amb_temp_c"] for s in samples]
    th_ambs = [s["th_ambient"] for s in samples]

    if samples:
        ax.plot(ts_list, cpu_temps, label="CPU Temp (°C)", color="#1f77b4", linewidth=1.5)
        if any(v is not None for v in amb_temps):
            ax.plot(ts_list, amb_temps, label="Ambient Temp (°C)", color="#2ca02c", linestyle="--", linewidth=1.2)
        if any(v is not None for v in th_ambs):
            ax.plot(ts_list, th_ambs, label="Thermal Ambient (°C)", color="#ff7f0e", linestyle=":", linewidth=1.2)

    # Guide lines
    ax.axhline(75, color="#ff7f0e", linestyle="--", alpha=0.7, label="75 °C Warning")
    ax.axhline(80, color="#d62728", linestyle="--", alpha=0.8, label="80 °C High")
    ax.axhline(82, color="#8c564b", linestyle="--", alpha=0.9, label="82 °C Abort")

    # Throttle & Bench events
    for e in events:
        e_time = datetime.fromtimestamp(e["ts"])
        etype = e["type"]
        if etype == "throttle_change":
            ax.axvline(e_time, color="#d62728", linestyle="-.", alpha=0.8)
            ax.text(e_time, ax.get_ylim()[0] + 2, f" Throttle {e.get('detail', '')}", color="#d62728", rotation=90, verticalalignment="bottom", fontsize=8)
        elif etype == "bench_start":
            ax.axvline(e_time, color="#2ca02c", linestyle="--", alpha=0.8)
            ax.text(e_time, ax.get_ylim()[1] - 2, " Bench Start", color="#2ca02c", rotation=90, verticalalignment="top", fontsize=8)
        elif etype == "bench_end":
            ax.axvline(e_time, color="#9467bd", linestyle="--", alpha=0.8)
            ax.text(e_time, ax.get_ylim()[1] - 2, " Bench End", color="#9467bd", rotation=90, verticalalignment="top", fontsize=8)

    ax.set_title("Temperature Timeline & Thermal Events", fontsize=12, fontweight="bold")
    ax.set_ylabel("Temperature (°C)")
    ax.set_xlabel("Local Time")
    ax.grid(True, linestyle=":", alpha=0.6)
    ax.legend(loc="upper left", fontsize=8)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def plot_rates(samples: list[dict], out_path: str):
    plt = _get_plt()
    fig, axes = plt.subplots(2, 2, figsize=(11, 7), dpi=120)

    ts_list = [datetime.fromtimestamp(s["ts"]) for s in samples] if samples else []

    pb_rates = []
    sd_rates = []
    frame_rates = []
    fps_vals = []

    for i in range(len(samples)):
        dt = (samples[i]["ts"] - samples[i - 1]["ts"]) if i > 0 else 10.0
        dt = max(dt, 0.1)

        pb_tot = samples[i].get("pb_new_total")
        pb_rates.append((pb_tot * 60.0 / dt) if pb_tot is not None else 0.0)

        sd_delta = samples[i].get("sd_wr_mb_delta")
        sd_rates.append((sd_delta * 60.0 / dt) if sd_delta is not None else 0.0)

        if i > 0 and samples[i].get("th_frame") is not None and samples[i - 1].get("th_frame") is not None:
            df = samples[i]["th_frame"] - samples[i - 1]["th_frame"]
            frame_rates.append((df * 60.0 / dt) if df >= 0 else 0.0)
        else:
            fps_c = samples[i].get("th_fps")
            frame_rates.append((fps_c * 60.0) if fps_c is not None else 0.0)

        fps_vals.append(samples[i].get("th_fps") or 0.0)

    # Subplot 1: PB rows/min
    axes[0, 0].plot(ts_list, pb_rates, color="#1f77b4", linewidth=1.2)
    axes[0, 0].set_title("PocketBase Writes (rows/min)", fontsize=10, fontweight="bold")
    axes[0, 0].set_ylabel("Rows / min")
    axes[0, 0].grid(True, linestyle=":", alpha=0.5)

    # Subplot 2: SD MB/min
    axes[0, 1].plot(ts_list, sd_rates, color="#ff7f0e", linewidth=1.2)
    axes[0, 1].set_title("SD Card Writes (MB/min)", fontsize=10, fontweight="bold")
    axes[0, 1].set_ylabel("MB / min")
    axes[0, 1].grid(True, linestyle=":", alpha=0.5)

    # Subplot 3: Frames/min
    axes[1, 0].plot(ts_list, frame_rates, color="#2ca02c", linewidth=1.2)
    axes[1, 0].set_title("Thermal Frames (frames/min)", fontsize=10, fontweight="bold")
    axes[1, 0].set_ylabel("Frames / min")
    axes[1, 0].grid(True, linestyle=":", alpha=0.5)

    # Subplot 4: FPS
    axes[1, 1].plot(ts_list, fps_vals, color="#d62728", linewidth=1.2)
    axes[1, 1].set_title("Thermal FPS", fontsize=10, fontweight="bold")
    axes[1, 1].set_ylabel("FPS")
    axes[1, 1].grid(True, linestyle=":", alpha=0.5)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def plot_availability(samples: list[dict], out_path: str, med_interval: float = 10.0):
    plt = _get_plt()
    import numpy as np

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=120)

    signals = signal_defs()
    max_cap = 3.0 * med_interval  # band width cap; time beyond it (a gap) stays unfilled

    if samples:
        t_start = samples[0]["ts"]
        t_end = samples[-1]["ts"]
        dur = max(t_end - t_start, 1.0)
    else:
        t_start, dur = 0, 1.0

    y_labels = [s[0] for s in signals]
    y_pos = np.arange(len(signals))

    for idx, (_, s_fn) in enumerate(signals):
        for i in range(len(samples) - 1):
            t0 = samples[i]["ts"]
            t1 = samples[i + 1]["ts"]
            dt = t1 - t0
            if dt <= 0:
                continue
            band_end = t0 + min(dt, max_cap)
            val = s_fn(samples[i])
            if val is None:
                color = "#9e9e9e"  # unknown / NULL
            elif val:
                color = "#2ca02c"
            else:
                color = "#d62728"
            ax.fill_betweenx([idx - 0.35, idx + 0.35],
                             datetime.fromtimestamp(t0),
                             datetime.fromtimestamp(band_end),
                             color=color, alpha=0.85, linewidth=0)

    ax.set_yticks(y_pos)
    ax.set_yticklabels(y_labels, fontweight="bold", fontsize=9)
    ax.set_title("System & Interface Availability Bands", fontsize=12, fontweight="bold")
    ax.set_xlabel("Local Time")
    ax.grid(True, axis="x", linestyle=":", alpha=0.6)

    # Custom legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor="#2ca02c", label="UP / Active"),
        Patch(facecolor="#d62728", label="DOWN / Outage"),
        Patch(facecolor="#9e9e9e", label="Unknown / NULL"),
    ]
    ax.legend(handles=legend_elements, loc="upper right", fontsize=8)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def plot_processing(samples: list[dict], out_path: str):
    plt = _get_plt()
    fig, axes = plt.subplots(2, 2, figsize=(11, 7), dpi=120)

    ts_list = [datetime.fromtimestamp(s["ts"]) for s in samples] if samples else []

    fps_vals = [s.get("th_fps") for s in samples]
    read_ms = [s.get("th_read_ms") for s in samples]
    own_cpu = [s.get("own_cpu_pct") for s in samples]
    load1_vals = [s.get("load1") for s in samples]

    axes[0, 0].plot(ts_list, fps_vals, color="#1f77b4", linewidth=1.2)
    axes[0, 0].set_title("Thermal FPS", fontsize=10, fontweight="bold")
    axes[0, 0].set_ylabel("FPS")
    axes[0, 0].grid(True, linestyle=":", alpha=0.5)

    axes[0, 1].plot(ts_list, read_ms, color="#ff7f0e", linewidth=1.2)
    axes[0, 1].set_title("Thermal Read Latency (ms)", fontsize=10, fontweight="bold")
    axes[0, 1].set_ylabel("Read Ms")
    axes[0, 1].grid(True, linestyle=":", alpha=0.5)

    axes[1, 0].plot(ts_list, own_cpu, color="#2ca02c", linewidth=1.2)
    axes[1, 0].set_title("Soak Collector CPU %", fontsize=10, fontweight="bold")
    axes[1, 0].set_ylabel("Own CPU %")
    axes[1, 0].grid(True, linestyle=":", alpha=0.5)

    axes[1, 1].plot(ts_list, load1_vals, color="#9467bd", linewidth=1.2)
    axes[1, 1].set_title("System Load Average (1-min)", fontsize=10, fontweight="bold")
    axes[1, 1].set_ylabel("Load1")
    axes[1, 1].grid(True, linestyle=":", alpha=0.5)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


def plot_journal(journal_rows: list[dict], out_path: str):
    plt = _get_plt()
    fig, ax = plt.subplots(figsize=(10, 5), dpi=120)

    # Group journal rows by unit
    units_data = {}
    total_by_ts = {}

    for j in journal_rows:
        ts = j["ts"]
        u = j["unit"]
        errs = j["err"]
        units_data.setdefault(u, []).append((ts, errs))
        total_by_ts[ts] = total_by_ts.get(ts, 0) + errs

    for u, data in units_data.items():
        data.sort(key=lambda x: x[0])
        ts_l = [datetime.fromtimestamp(x[0]) for x in data]
        err_l = [x[1] for x in data]
        if any(e > 0 for e in err_l):
            ax.plot(ts_l, err_l, label=f"{u} errors", linewidth=1.2)

    if total_by_ts:
        sorted_tot = sorted(total_by_ts.items(), key=lambda x: x[0])
        tot_ts = [datetime.fromtimestamp(x[0]) for x in sorted_tot]
        tot_err = [x[1] for x in sorted_tot]
        ax.plot(tot_ts, tot_err, label="Total Journal Errors", color="black", linewidth=2.0, linestyle="--")

    ax.set_title("Journal Error Entries per 60s Window", fontsize=12, fontweight="bold")
    ax.set_ylabel("Errors / Window")
    ax.set_xlabel("Local Time")
    ax.grid(True, linestyle=":", alpha=0.6)
    ax.legend(loc="upper left", fontsize=8)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)


# --- Summary & Report Generation ---

def generate_report(db_path: str, since: float | None, until: float | None, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)

    samples, events, journal_rows = load_db_data(db_path, since, until)
    med_int = get_median_interval(samples)

    # Compute statistics
    import numpy as np

    # Pair each temperature with its own timestamp so a NULL-temp window can
    # never misalign the "max at" time (finding #1).
    cpu_pairs = [(s["ts"], s["cpu_temp_c"]) for s in samples if s.get("cpu_temp_c") is not None]
    if cpu_pairs:
        max_cpu_ts, max_cpu_temp = max(cpu_pairs, key=lambda p: p[1])
        max_cpu_temp = float(max_cpu_temp)
        max_cpu_temp_time = datetime.fromtimestamp(max_cpu_ts).strftime("%Y-%m-%d %H:%M:%S")
        cpu_vals = [p[1] for p in cpu_pairs]
        cpu_min = float(np.min(cpu_vals))
        cpu_mean = float(np.mean(cpu_vals))
        cpu_max = float(np.max(cpu_vals))
    else:
        max_cpu_temp, max_cpu_temp_time = 0.0, "N/A"
        cpu_min = cpu_mean = cpu_max = 0.0

    # Minutes in temp ranges
    mins_ge_75 = sum((min(samples[i + 1]["ts"] - samples[i]["ts"], 3.0 * med_int) / 60.0)
                     for i in range(len(samples) - 1)
                     if samples[i].get("cpu_temp_c") and samples[i]["cpu_temp_c"] >= 75.0)
    mins_ge_80 = sum((min(samples[i + 1]["ts"] - samples[i]["ts"], 3.0 * med_int) / 60.0)
                     for i in range(len(samples) - 1)
                     if samples[i].get("cpu_temp_c") and samples[i]["cpu_temp_c"] >= 80.0)
    mins_ge_82 = sum((min(samples[i + 1]["ts"] - samples[i]["ts"], 3.0 * med_int) / 60.0)
                     for i in range(len(samples) - 1)
                     if samples[i].get("cpu_temp_c") and samples[i]["cpu_temp_c"] >= 82.0)

    # Different sensors — keep the standalone ambient sensor and the thermal
    # cam's reported ambient separate in the summary (finding #12).
    amb_sensor_vals = [s["amb_temp_c"] for s in samples if s.get("amb_temp_c") is not None]
    amb_thermal_vals = [s["th_ambient"] for s in samples if s.get("th_ambient") is not None]
    amb_sensor_str = f"{np.min(amb_sensor_vals):.1f} / {np.max(amb_sensor_vals):.1f}" if amb_sensor_vals else "N/A"
    amb_thermal_str = f"{np.min(amb_thermal_vals):.1f} / {np.max(amb_thermal_vals):.1f}" if amb_thermal_vals else "N/A"

    throttle_events_count = sum(1 for e in events if e.get("type") == "throttle_change")

    # Availability math (tri-state; tri-state extractors live in signal_defs())
    avail_results = {}
    for name, s_fn in signal_defs():
        avail_results[name] = compute_signal_availability(samples, s_fn, med_int)

    # Build availability tables (5 columns incl. % Unknown) from one loop so
    # the Markdown and HTML renderings can never drift apart.
    avail_table_md_lines = []
    avail_table_html_lines = []
    for name, _ in signal_defs():
        pct_up_v, outages_v, longest_v, pct_unknown_v = avail_results[name]
        avail_table_md_lines.append(
            f"| {name} | {pct_up_v:.1f}% | {outages_v} | {longest_v:.1f} | {pct_unknown_v:.1f}% |"
        )
        avail_table_html_lines.append(
            f"<tr><td>{name}</td><td>{pct_up_v:.1f}%</td><td>{outages_v}</td>"
            f"<td>{longest_v:.1f}</td><td>{pct_unknown_v:.1f}%</td></tr>"
        )
    avail_table_md = "\n".join(avail_table_md_lines)
    avail_table_html = "\n".join(avail_table_html_lines)

    th_ok_pct = avail_results["Thermal OK"][0]
    esp_conn_pct = avail_results["ESP Connected"][0]

    # Rates math
    test_dur_s = (samples[-1]["ts"] - samples[0]["ts"]) if len(samples) > 1 else 1.0
    test_hours = max(test_dur_s / 3600.0, 0.0001)
    test_mins = max(test_dur_s / 60.0, 0.0001)

    pb_rows_total = sum(s.get("pb_new_total") or 0 for s in samples)
    pb_rows_per_min = pb_rows_total / test_mins

    # Per device PB
    pb_device_counts = {}
    for s in samples:
        raw_json = s.get("pb_new_json")
        if raw_json:
            try:
                obj = json.loads(raw_json)
                if isinstance(obj, dict):
                    for dev, cnt in obj.items():
                        pb_device_counts[dev] = pb_device_counts.get(dev, 0) + int(cnt)
            except (ValueError, TypeError):
                pass

    pb_per_device_lines = [f"  - **{dev}**: {cnt / test_mins:.2f} rows/min ({cnt} total)" for dev, cnt in pb_device_counts.items()]
    pb_per_device_str = "\n".join(pb_per_device_lines) if pb_per_device_lines else "  - None recorded"

    sd_mb_total = sum(s.get("sd_wr_mb_delta") or 0.0 for s in samples)
    sd_gb_per_day = (sd_mb_total / 1000.0) / (test_hours / 24.0)

    frames = [s["th_frame"] for s in samples if s.get("th_frame") is not None]
    if len(frames) >= 2 and frames[-1] >= frames[0]:
        frames_per_min = (frames[-1] - frames[0]) / test_mins
    else:
        fps_c = [s["th_fps"] for s in samples if s.get("th_fps") is not None]
        frames_per_min = (float(np.mean(fps_c)) * 60.0) if fps_c else 0.0

    fps_all = [s["th_fps"] for s in samples if s.get("th_fps") is not None]
    fps_mean = float(np.mean(fps_all)) if fps_all else 0.0
    fps_min = float(np.min(fps_all)) if fps_all else 0.0

    read_ms_all = [s["th_read_ms"] for s in samples if s.get("th_read_ms") is not None]
    read_ms_mean = float(np.mean(read_ms_all)) if read_ms_all else 0.0
    read_ms_p95 = float(np.percentile(read_ms_all, 95)) if read_ms_all else 0.0

    # Processing stats
    own_cpu_all = [s["own_cpu_pct"] for s in samples if s.get("own_cpu_pct") is not None]
    own_cpu_mean = float(np.mean(own_cpu_all)) if own_cpu_all else 0.0
    own_cpu_max = float(np.max(own_cpu_all)) if own_cpu_all else 0.0

    load1_all = [s["load1"] for s in samples if s.get("load1") is not None]
    load1_mean = float(np.mean(load1_all)) if load1_all else 0.0
    load1_max = float(np.max(load1_all)) if load1_all else 0.0

    # Journal stats
    journal_by_unit = {}
    journal_err_total = 0
    for j in journal_rows:
        u = j["unit"]
        cnt = j["count"]
        err = j["err"]
        journal_err_total += err
        d = journal_by_unit.setdefault(u, {"count": 0, "err": 0})
        d["count"] += cnt
        d["err"] += err

    journal_lines = []
    for u in sorted(journal_by_unit):
        d = journal_by_unit[u]
        err_pm = d["err"] / test_mins
        journal_lines.append(f"| {u} | {d['count']} | {d['err']} | {err_pm:.2f} |")
    journal_table_rows = "\n".join(journal_lines) if journal_lines else "| None | 0 | 0 | 0.00 |"

    # Events table
    events_lines = []
    for e in events:
        e_time_str = datetime.fromtimestamp(e["ts"]).strftime("%Y-%m-%d %H:%M:%S")
        events_lines.append(f"| {e_time_str} | {e['type']} | {e.get('detail') or ''} |")
    events_table_rows = "\n".join(events_lines) if events_lines else "| N/A | None | No events recorded |"

    # Gaps table
    gaps_lines = []
    for i in range(len(samples) - 1):
        gap = samples[i + 1]["ts"] - samples[i]["ts"]
        if gap > 2.5 * med_int:
            t0_str = datetime.fromtimestamp(samples[i]["ts"]).strftime("%Y-%m-%d %H:%M:%S")
            t1_str = datetime.fromtimestamp(samples[i + 1]["ts"]).strftime("%Y-%m-%d %H:%M:%S")
            gaps_lines.append(f"- **Gap {gap:.1f}s** from {t0_str} to {t1_str}")
    gaps_table_rows = "\n".join(gaps_lines) if gaps_lines else "- No significant sample gaps detected."

    # Build summary.md
    summary_md = f"""# Soak Report Summary

## Headline
- **Max CPU temp**: {max_cpu_temp:.1f} °C at {max_cpu_temp_time}
- **Throttle events**: {throttle_events_count}
- **% Thermal OK**: {th_ok_pct:.1f}%
- **% ESP Connected**: {esp_conn_pct:.1f}%
- **PB rows written**: {pb_rows_total}
- **Mean PB rows/min**: {pb_rows_per_min:.2f}
- **SD MB written**: {sd_mb_total:.1f} MB
- **Journal errors total**: {journal_err_total}

## Temperature
- **CPU temp (min/mean/max)**: {cpu_min:.1f} / {cpu_mean:.1f} / {cpu_max:.1f} °C
- **Minutes ≥75 °C**: {mins_ge_75:.1f} min
- **Minutes ≥80 °C**: {mins_ge_80:.1f} min
- **Minutes ≥82 °C**: {mins_ge_82:.1f} min
- **Ambient sensor temp (min/max)**: {amb_sensor_str} °C
- **Thermal-cam ambient (min/max)**: {amb_thermal_str} °C

## Availability
| Signal | % Up | Outages | Longest Outage (min) | % Unknown |
|---|---|---|---|---|
{avail_table_md}

Formula: `100 × Σ dt_up / Σ dt_all` (sample gap dt capped at 3× median interval: {med_int:.1f}s). NULL / unknown samples count toward dt_all but never as up or down; longest outage uses raw uncapped dt.

## Rates
- **PB rows/min overall**: {pb_rows_per_min:.2f} rows/min (Total rows: {pb_rows_total})
- **PB rows/min per device**:
{pb_per_device_str}
- **SD GB/day**: {sd_gb_per_day:.3f} GB/day ({sd_mb_total:.1f} MB total across {test_hours:.2f} hours)
- **Frames/min**: {frames_per_min:.1f} frames/min
- **FPS (mean/min)**: {fps_mean:.1f} / {fps_min:.1f}
- **Read MS (mean/p95)**: {read_ms_mean:.1f} / {read_ms_p95:.1f} ms

## Processing
- **Collector CPU (mean/max)**: {own_cpu_mean:.1f}% / {own_cpu_max:.1f}%
- **System Load1 (mean/max)**: {load1_mean:.2f} / {load1_max:.2f}

## Journal
| Unit | Total Entries | Error Entries | Err/min |
|---|---|---|---|
{journal_table_rows}

## Events
| Local Time | Event Type | Detail |
|---|---|---|
{events_table_rows}

## Gaps
{gaps_table_rows}
"""

    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write(summary_md)

    # Generate plots
    p1 = os.path.join(out_dir, "01_temperature.png")
    p2 = os.path.join(out_dir, "02_rates.png")
    p3 = os.path.join(out_dir, "03_availability.png")
    p4 = os.path.join(out_dir, "04_processing.png")
    p5 = os.path.join(out_dir, "05_journal.png")

    plot_temperature(samples, events, p1)
    plot_rates(samples, p2)
    plot_availability(samples, p3, med_int)
    plot_processing(samples, p4)
    plot_journal(journal_rows, p5)

    # Base64 encode PNGs for inline HTML
    def b64_img(p):
        with open(p, "rb") as fh:
            return base64.b64encode(fh.read()).decode("ascii")

    b64_1 = b64_img(p1)
    b64_2 = b64_img(p2)
    b64_3 = b64_img(p3)
    b64_4 = b64_img(p4)
    b64_5 = b64_img(p5)

    # Build report.html
    report_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PigPulse Pi Edge Soak Report</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #1a1a2e; color: #e0e0e0; margin: 0; padding: 20px; line-height: 1.5; }}
h1, h2, h3 {{ color: #00d2ff; border-bottom: 1px solid #333; padding-bottom: 5px; }}
.card {{ background: #16213e; border-radius: 8px; padding: 18px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }}
table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
th, td {{ border: 1px solid #0f3460; padding: 8px 12px; text-align: left; }}
th {{ background-color: #0f3460; color: #e0e0e0; }}
tr:nth-child(even) {{ background-color: #1f4068; }}
img {{ max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #0f3460; margin-top: 10px; }}
.badge {{ background: #00d2ff; color: #1a1a2e; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85em; }}
</style>
</head>
<body>
<h1>PigPulse Pi Edge Soak Report</h1>
<div class="card">
<p><strong>Database:</strong> {os.path.abspath(db_path)}</p>
<p><strong>Generated:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
<p><strong>Samples:</strong> {len(samples)} | <strong>Events:</strong> {len(events)} | <strong>Journal Rows:</strong> {len(journal_rows)}</p>
</div>

<div class="card">
<h2>Headline & Key Metrics</h2>
<ul>
<li><strong>Max CPU temp:</strong> {max_cpu_temp:.1f} °C at {max_cpu_temp_time}</li>
<li><strong>Throttle events:</strong> {throttle_events_count}</li>
<li><strong>% Thermal OK:</strong> {th_ok_pct:.1f}%</li>
<li><strong>% ESP Connected:</strong> {esp_conn_pct:.1f}%</li>
<li><strong>PB rows written:</strong> {pb_rows_total} (mean {pb_rows_per_min:.2f} rows/min)</li>
<li><strong>SD MB written:</strong> {sd_mb_total:.1f} MB ({sd_gb_per_day:.3f} GB/day)</li>
<li><strong>Journal errors total:</strong> {journal_err_total}</li>
</ul>
</div>

<div class="card">
<h2>01 Temperature Timeline</h2>
<img src="data:image/png;base64,{b64_1}" alt="01 Temperature Timeline" />
</div>

<div class="card">
<h2>02 Data & System Rates</h2>
<img src="data:image/png;base64,{b64_2}" alt="02 Rates" />
</div>

<div class="card">
<h2>03 Availability Bands</h2>
<img src="data:image/png;base64,{b64_3}" alt="03 Availability" />
</div>

<div class="card">
<h2>04 Processing & Resource Usage</h2>
<img src="data:image/png;base64,{b64_4}" alt="04 Processing" />
</div>

<div class="card">
<h2>05 Journal Errors</h2>
<img src="data:image/png;base64,{b64_5}" alt="05 Journal" />
</div>

<div class="card">
<h2>Availability Table</h2>
<table>
<tr><th>Signal</th><th>% Up</th><th>Outages</th><th>Longest Outage (min)</th><th>% Unknown</th></tr>
{avail_table_html}
</table>
</div>

<div class="card">
<h2>Journal Error Summary</h2>
<table>
<tr><th>Unit</th><th>Total Entries</th><th>Error Entries</th><th>Err/min</th></tr>
{journal_table_rows}
</table>
</div>

<div class="card">
<h2>Events Chronology</h2>
<table>
<tr><th>Local Time</th><th>Event Type</th><th>Detail</th></tr>
{events_table_rows}
</table>
</div>

</body>
</html>
"""

    with open(os.path.join(out_dir, "report.html"), "w", encoding="utf-8") as fh:
        fh.write(report_html)


# --- Selftest ---

def run_selftest() -> int:
    try:
        with tempfile.TemporaryDirectory() as td_db, tempfile.TemporaryDirectory() as td_out:
            db_path = os.path.join(td_db, "soak_test.db")
            con = sqlite3.connect(db_path)

            # Build DDL
            con.executescript("""
            CREATE TABLE IF NOT EXISTS samples (
              ts REAL PRIMARY KEY, boot_id TEXT, cpu_temp_c REAL, cpu_freq_mhz REAL,
              throttle_hex TEXT, uv_now INTEGER, freqcap_now INTEGER, thr_now INTEGER, softlim_now INTEGER,
              uv_ever INTEGER, freqcap_ever INTEGER, thr_ever INTEGER, softlim_ever INTEGER,
              cpu_pct REAL, load1 REAL, load5 REAL, load15 REAL, mem_used_mb REAL, mem_total_mb REAL, swap_used_mb REAL,
              disk_free_mb REAL, sd_wr_mb_delta REAL, sd_wr_mb_total REAL, eth_oper TEXT, wlan_oper TEXT, wifi_clients INTEGER,
              th_ok INTEGER, th_frame INTEGER, th_fps REAL, th_read_ms INTEGER, th_center REAL, th_ambient REAL,
              th_alerts INTEGER, th_verdict TEXT, th_animals INTEGER, th_drift REAL, amb_state TEXT, amb_temp_c REAL,
              amb_rh REAL, amb_thi REAL, amb_age_s REAL, esp_conn INTEGER, esp_stale INTEGER, esp_last_ms INTEGER,
              esp_bytes INTEGER, esp_chunks INTEGER, esp_accepted INTEGER, esp_nonzero_pct REAL, esp_uptime_s INTEGER,
              pb_max_rowid INTEGER, pb_new_total INTEGER, pb_new_json TEXT, own_cpu_pct REAL, own_rss_mb REAL,
              svc TEXT, j_err_total INTEGER
            );
            CREATE TABLE IF NOT EXISTS events (ts REAL NOT NULL, type TEXT NOT NULL, detail TEXT);
            CREATE TABLE IF NOT EXISTS journal (ts REAL NOT NULL, unit TEXT NOT NULL, count INTEGER NOT NULL, err INTEGER NOT NULL, last TEXT);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            """)

            # Synthetic ~3h dataset (10s cadence) exercising every code path:
            #  - temp ramp 55 -> 81 (max exactly 81.0 at i=899), dip, slow re-rise
            #  - NULL cpu_temp window   i in [300,309]
            #  - unknown-signal window  i in [650,659] (6 tri-state fields NULL)
            #  - sampling gap: skip i in [810,821] -> exact 130.0s gap
            #  - frame counter reset at i=540 (end < start -> fps fallback path)
            t0 = time.time() - 10800.0

            for i in range(1080):
                if 810 <= i <= 821:
                    continue  # sampling gap -> exactly 130.0s between i=809 and i=822

                t = t0 + i * 10.0

                if i < 900:
                    temp = 55.0 + (i / 899.0) * 26.0   # max exactly 81.0 at i=899
                elif i < 950:
                    temp = 81.0 - (i - 899) * (16.0 / 51.0)
                else:
                    temp = 65.0 + (i - 950) * (7.0 / 130.0)

                temp_val = None if 300 <= i <= 309 else round(temp, 2)

                thr_hex = "0x50000" if i >= 600 else "0x0"
                thr_ever = 1 if i >= 600 else 0

                esp_c = 0 if (400 <= i <= 430) else 1
                esp_s = 1 if (400 <= i <= 430) else 0

                if 700 <= i <= 730:
                    svc = "mosquitto=active,pigpulse-bridge=failed,pigpulse-pocketbase=active,pigpulse-cctv=active,pigpulse-rtsp-recorder=active,pigpulse-thermal=active,pigpulse-soak=active"
                else:
                    svc = "mosquitto=active,pigpulse-bridge=active,pigpulse-pocketbase=active,pigpulse-cctv=active,pigpulse-rtsp-recorder=active,pigpulse-thermal=active,pigpulse-soak=active"

                th_ok = 1
                eth_oper = "up"
                wlan_oper = "up"
                amb_state = "live"
                esp_conn = esp_c
                if 650 <= i <= 659:
                    # unknown window: the 6 tri-state availability fields are NULL
                    th_ok = None
                    esp_conn = None
                    eth_oper = None
                    wlan_oper = None
                    svc = None
                    amb_state = None

                th_frame = (1000 + i * 10) if i < 540 else (i - 540)

                row = {
                    "ts": t,
                    "boot_id": "selftest-boot",
                    "cpu_temp_c": temp_val,
                    "cpu_freq_mhz": 1500.0,
                    "throttle_hex": thr_hex,
                    "uv_now": 0, "freqcap_now": 0, "thr_now": 0, "softlim_now": 0,
                    "uv_ever": 0, "freqcap_ever": 0, "thr_ever": thr_ever, "softlim_ever": thr_ever,
                    "cpu_pct": 12.5, "load1": 0.45, "load5": 0.30, "load15": 0.20,
                    "mem_used_mb": 512.0, "mem_total_mb": 3900.0, "swap_used_mb": 0.0,
                    "disk_free_mb": 15000.0, "sd_wr_mb_delta": 0.5, "sd_wr_mb_total": 100.0 + i * 0.5,
                    "eth_oper": eth_oper, "wlan_oper": wlan_oper, "wifi_clients": 1,
                    "th_ok": th_ok, "th_frame": th_frame, "th_fps": 9.9, "th_read_ms": 90,
                    "th_center": 42.0, "th_ambient": 24.5, "th_alerts": 0, "th_verdict": "NORMAL",
                    "th_animals": 2, "th_drift": 0.1,
                    "amb_state": amb_state, "amb_temp_c": 24.5, "amb_rh": 55.0, "amb_thi": 72.0, "amb_age_s": 1.0,
                    "esp_conn": esp_conn, "esp_stale": esp_s, "esp_last_ms": 10,
                    "esp_bytes": 100000, "esp_chunks": 1000, "esp_accepted": 100,
                    "esp_nonzero_pct": 99.9, "esp_uptime_s": 3600,
                    "pb_max_rowid": 100 + i * 5, "pb_new_total": 5,
                    "pb_new_json": '{"s3-mic-01":3,"pi-thermal-01":2}',
                    "own_cpu_pct": 1.2, "own_rss_mb": 25.0,
                    "svc": svc, "j_err_total": 2 if i < 500 else 10,
                }

                con.execute("""
                INSERT INTO samples (
                  ts, boot_id, cpu_temp_c, cpu_freq_mhz, throttle_hex, uv_now, freqcap_now, thr_now, softlim_now,
                  uv_ever, freqcap_ever, thr_ever, softlim_ever, cpu_pct, load1, load5, load15, mem_used_mb,
                  mem_total_mb, swap_used_mb, disk_free_mb, sd_wr_mb_delta, sd_wr_mb_total, eth_oper, wlan_oper,
                  wifi_clients, th_ok, th_frame, th_fps, th_read_ms, th_center, th_ambient, th_alerts, th_verdict,
                  th_animals, th_drift, amb_state, amb_temp_c, amb_rh, amb_thi, amb_age_s, esp_conn, esp_stale,
                  esp_last_ms, esp_bytes, esp_chunks, esp_accepted, esp_nonzero_pct, esp_uptime_s, pb_max_rowid,
                  pb_new_total, pb_new_json, own_cpu_pct, own_rss_mb, svc, j_err_total
                ) VALUES (
                  :ts, :boot_id, :cpu_temp_c, :cpu_freq_mhz, :throttle_hex, :uv_now, :freqcap_now, :thr_now, :softlim_now,
                  :uv_ever, :freqcap_ever, :thr_ever, :softlim_ever, :cpu_pct, :load1, :load5, :load15, :mem_used_mb,
                  :mem_total_mb, :swap_used_mb, :disk_free_mb, :sd_wr_mb_delta, :sd_wr_mb_total, :eth_oper, :wlan_oper,
                  :wifi_clients, :th_ok, :th_frame, :th_fps, :th_read_ms, :th_center, :th_ambient, :th_alerts, :th_verdict,
                  :th_animals, :th_drift, :amb_state, :amb_temp_c, :amb_rh, :amb_thi, :amb_age_s, :esp_conn, :esp_stale,
                  :esp_last_ms, :esp_bytes, :esp_chunks, :esp_accepted, :esp_nonzero_pct, :esp_uptime_s, :pb_max_rowid,
                  :pb_new_total, :pb_new_json, :own_cpu_pct, :own_rss_mb, :svc, :j_err_total
                )
                """, row)

            # Events
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0, "collector_start", "schema=1 interval=10 db=synthetic"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 4000, "esp_change", "connected 1->0 stale 0->1 (lastMs=2300)"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 4300, "esp_change", "connected 0->1 stale 1->0 (lastMs=5)"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 6000, "throttle_change", "0x0->0x50000"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 7000, "svc_change", "pigpulse-bridge: active->failed"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 7300, "svc_change", "pigpulse-bridge: failed->active"))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 1000, "bench_start", '{"seconds":300,"workers":4,"abort_temp":82.0,"dry_run":false}'))
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)", (t0 + 1300, "bench_end", '{"max_temp":78.3,"abort":false,"reason":null,"file":"bench_01.json"}'))

            # Journal
            for k in range(1, 181):
                j_ts = t0 + k * 60.0
                err_b = 2 if (7000 <= k * 60 <= 7300) else 0
                con.execute("INSERT INTO journal (ts, unit, count, err, last) VALUES (?,?,?,?,?)", (j_ts, "pigpulse-thermal", 6, 0, "ok"))
                con.execute("INSERT INTO journal (ts, unit, count, err, last) VALUES (?,?,?,?,?)", (j_ts, "pigpulse-bridge", 10, err_b, "bridge log"))

            con.commit()
            con.close()

            # Run pipeline
            generate_report(db_path, None, None, td_out)

            # Assertions
            expected_pngs = ["01_temperature.png", "02_rates.png", "03_availability.png", "04_processing.png", "05_journal.png"]
            for png in expected_pngs:
                p = os.path.join(td_out, png)
                if not os.path.isfile(p):
                    print(f"FAIL selftest: Missing PNG file {png}")
                    return 2
                sz = os.path.getsize(p)
                if sz < 10000:
                    print(f"FAIL selftest: PNG file {png} size {sz} < 10000 bytes")
                    return 2

            sum_p = os.path.join(td_out, "summary.md")
            if not os.path.isfile(sum_p):
                print("FAIL selftest: Missing summary.md")
                return 2

            with open(sum_p, "r", encoding="utf-8") as fh:
                sum_text = fh.read()

            required_substrings = ["Max CPU temp", "Availability", "Rates", "Journal", "Events", "% Unknown"]
            for sub in required_substrings:
                if sub not in sum_text:
                    print(f"FAIL selftest: summary.md missing required substring '{sub}'")
                    return 2

            # Max temp must pair with the timestamp of i=899 (the exact maximum);
            # a filtered-list index would misalign this by the NULL-temp window.
            expected_max_line = (
                f"**Max CPU temp**: 81.0 °C at "
                f"{datetime.fromtimestamp(t0 + 8990.0).strftime('%Y-%m-%d %H:%M:%S')}"
            )
            if expected_max_line not in sum_text:
                print(f"FAIL selftest: summary.md missing expected max-temp line: {expected_max_line!r}")
                return 2

            # The skipped samples i in [810,821] must surface as an exact 130.0s gap.
            if "**Gap 130.0s**" not in sum_text:
                print("FAIL selftest: summary.md missing '**Gap 130.0s**' (skipped-sample gap)")
                return 2

            # Direct tri-state availability check: [T, F, F, None, T] at dt=10
            # -> 25.0% up, 1 outage, 20/60 min longest, 25.0% unknown.
            tri_rows = [
                {"ts": 0.0, "v": 1}, {"ts": 10.0, "v": 0}, {"ts": 20.0, "v": 0},
                {"ts": 30.0, "v": None}, {"ts": 40.0, "v": 1},
            ]
            tri_fn = lambda r: _tri_from_int(r.get("v"))
            pct_up_t, out_t, longest_t, unknown_t = compute_signal_availability(tri_rows, tri_fn, 10.0)
            if (abs(pct_up_t - 25.0) > 1e-9 or out_t != 1
                    or abs(longest_t - (20.0 / 60.0)) > 1e-9 or abs(unknown_t - 25.0) > 1e-9):
                print(f"FAIL selftest: tri-state check expected (25.0, 1, {20.0 / 60.0:.6f}, 25.0), "
                      f"got ({pct_up_t}, {out_t}, {longest_t}, {unknown_t})")
                return 2

            # Raw-dt longest outage: [T@0, F@10, F@310] -> 5.0 min despite the
            # 300s sample gap (the dt cap applies to pct math only, never to
            # the measured outage length).
            raw_rows = [{"ts": 0.0, "v": 1}, {"ts": 10.0, "v": 0}, {"ts": 310.0, "v": 0}]
            pct_up_r, out_r, longest_r, unknown_r = compute_signal_availability(raw_rows, tri_fn, 10.0)
            if out_r != 1 or abs(longest_r - 5.0) > 1e-9:
                print(f"FAIL selftest: raw-dt outage check expected 1 outage / 5.0 min, got {out_r} / {longest_r}")
                return 2

            html_p = os.path.join(td_out, "report.html")
            if not os.path.isfile(html_p):
                print("FAIL selftest: Missing report.html")
                return 2

            with open(html_p, "r", encoding="utf-8") as fh:
                html_text = fh.read()

            if "data:image/png;base64" not in html_text:
                print("FAIL selftest: report.html missing 'data:image/png;base64'")
                return 2
            if "% Unknown" not in html_text:
                print("FAIL selftest: report.html missing '% Unknown' availability column")
                return 2

            print("PASS selftest: 5 PNGs (>10KB), summary.md, report.html, tri-state + raw-dt availability checks OK")
            return 0
    except Exception as exc:
        print(f"FAIL selftest: Exception occurred: {exc}")
        import traceback
        traceback.print_exc()
        return 2


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="PigPulse Pi edge soak report generator (see docs/SOAK_CONTRACT.md §6)")
    ap.add_argument("--db", help="Path to soak.db SQLite database")
    ap.add_argument("--since", help="Start time (epoch seconds or 'YYYY-MM-DD HH:MM[:SS]')")
    ap.add_argument("--until", help="End time (epoch seconds or 'YYYY-MM-DD HH:MM[:SS]')")
    ap.add_argument("--out", help="Output directory (default ./soak_report_<UTCstamp>/)")
    ap.add_argument("--selftest", action="store_true", help="Run self-test on synthetic data")

    args = ap.parse_args(argv)

    if args.selftest:
        return run_selftest()

    if not args.db:
        ap.error("--db PATH is required (unless running --selftest)")

    out_dir = args.out
    if not out_dir:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out_dir = f"./soak_report_{stamp}"

    try:
        since_ts = parse_time_arg(args.since)
        until_ts = parse_time_arg(args.until)
        generate_report(args.db, since_ts, until_ts, out_dir)
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"Report generated successfully in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
