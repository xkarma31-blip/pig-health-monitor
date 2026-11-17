#!/usr/bin/env python3
"""PigPulse diagnostics state — read-only device info for the :8080 dashboard.

collect() returns Pi vitals, the latest ESP32-S3 telemetry, the audio ingest
state, network state and service states. start() launches the MQTT subscriber
once. No writes, no control paths.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
from collections import deque

import paho.mqtt.client as mqtt

ESP_TOPIC = "pig/s3-mic-01/telemetry"
# Every device publishes its telemetry here; the diagnostics page charts the
# thermal scene temperature and the mic level from it. One wildcard
# subscription keeps a single connection instead of one per device.
TELEMETRY_TOPIC = "pig/+/telemetry"
CHECK_FILE = "/run/pigpulse/audio-check.json"
BROKER = "127.0.0.1"

# How many readings to keep per device. The thermal bridge publishes every
# PUBLISH_INTERVAL_S (10 s), so 180 points is ~30 minutes of trend.
SERIES_MAX = 180
# ...and the same window in time, so a device that publishes faster than the
# thermal bridge still shows half an hour rather than a couple of minutes.
SERIES_WINDOW_S = 1800

_lock = threading.Lock()
_esp = {"payload": None, "at": 0.0}
ESP_TELEMETRY_FRESH_S = 60

# deviceId -> deque of {"t": epoch seconds, "p": payload}
_series: dict[str, deque] = {}
_started = False


def _series_for(device_id: str) -> deque:
    d = _series.get(device_id)
    if d is None:
        d = deque(maxlen=SERIES_MAX)
        _series[device_id] = d
    return d


def _age_text(age_s: float) -> str:
    if age_s < 60:
        return f"{age_s:.0f} s"
    if age_s < 3600:
        return f"{age_s / 60:.0f} min"
    return f"{age_s / 3600:.1f} h"


def esp_telemetry_state(payload, age_s) -> tuple[str, str]:
    """Label S3 telemetry honestly; an old row is never a live mic reading."""
    if not payload:
        return "NO TELEMETRY", "No telemetry has arrived from S3 on MQTT yet."
    if age_s is None:
        return "UNKNOWN AGE", "Telemetry age could not be determined."
    if age_s > ESP_TELEMETRY_FRESH_S:
        return (
            "STALE",
            f"Last S3 telemetry {_age_text(age_s)} ago — not a live reading. "
            "Check the mic link and ESP32-S3 association.",
        )
    return "LIVE", "Recent S3 telemetry received."


def _on_message(_client, _userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8", "replace"))
    except Exception:
        payload = None
    topic = msg.topic or ""
    with _lock:
        if topic == ESP_TOPIC:
            _esp["payload"] = payload
            _esp["at"] = time.time()
        if payload and topic.startswith("pig/") and topic.endswith("/telemetry"):
            # The published timestamp is in MILLISECONDS (thermal_publish.py
            # sends int(time.time() * 1000)); normalise to seconds here.
            ts = payload.get("timestamp")
            try:
                t = float(ts) / 1000.0
            except (TypeError, ValueError):
                t = time.time()
            device = str(payload.get("deviceId") or topic.split("/")[1])
            # The ESP publishes a "mic: false" payload with rms/peak = 0 when
            # its stream is down. Plotting that as a flat zero would read as
            # "a silent room" instead of "the mic is offline", so those
            # readings are not recorded as trend points.
            if payload.get("mic") is False:
                return
            _series_for(device).append({"t": t, "p": payload})


def _loop():
    try:
        client = mqtt.Client()
        client.on_message = _on_message
        client.connect(BROKER, 1883, 30)
        client.subscribe(ESP_TOPIC)
        client.subscribe(TELEMETRY_TOPIC)
        client.loop_forever()
    except Exception:
        pass


def start():
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_loop, name="diag-mqtt", daemon=True).start()


def run(cmd, timeout=4):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (out.stdout or "").strip()
    except Exception:
        return ""


def pi_vitals():
    load = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    mem = {}
    try:
        for line in open("/proc/meminfo"):
            k, _, v = line.partition(":")
            mem[k.strip()] = int(v.split()[0])
    except Exception:
        pass
    total, avail = mem.get("MemTotal", 0), mem.get("MemAvailable", 0)
    try:
        temp = int(open("/sys/class/thermal/thermal_zone0/temp").read().strip()) / 1000.0
    except Exception:
        temp = None
    disk = shutil.disk_usage("/")
    return {
        "load": [round(v, 2) for v in load],
        "nproc": os.cpu_count(),
        "mem_total_kb": total,
        "mem_avail_kb": avail,
        "mem_used_pct": round(100 * (total - avail) / total, 1) if total else None,
        "temp_c": temp,
        "disk_used_pct": round(100 * disk.used / disk.total, 1) if disk.total else None,
        "disk_free_gb": round(disk.free / 1e9, 1),
        "throttled": run(["vcgencmd", "get_throttled"]).split("=")[-1],
        "core_volt": run(["vcgencmd", "measure_volts", "core"]).split("=")[-1],
        "uptime_s": int(time.time() - float(open("/proc/uptime").read().split()[0])),
    }


def services():
    names = ["hostapd", "dnsmasq", "pigpulse-uplink-split", "pigpulse-thermal",
             "pigpulse-cough", "pigpulse-portal"]
    return {n: run(["systemctl", "is-active", n]) for n in names}


def net_state():
    info = run(["iw", "dev", "wlan1", "info"])
    channel = None
    for line in info.splitlines():
        if "channel" in line:
            channel = line.split("channel")[1].split("(")[0].strip()
    clients = len([ln for ln in run(["hostapd_cli", "-p", "/var/run/hostapd", "-i", "wlan1", "all_sta"]).splitlines()
                   if re.match(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}\b", ln)])
    link = run(["iw", "dev", "wlan0sta", "link"])
    addr = run(["ip", "-4", "-o", "addr", "show", "wlan0sta"])
    ip = addr.split("inet ")[-1].split("/")[0] if "inet " in addr else ""
    return {
        "ap": {"iface": "wlan1", "channel": channel, "clients": clients},
        "uplink": {
            "connected": "Connected to" in link,
            "detail": " ".join(link.split())[:200],
            "ip": ip,
            "default": run(["ip", "route", "show", "default", "dev", "wlan0sta"]),
        },
    }


def audio_state():
    try:
        import esp_audio_ingest
        status = esp_audio_ingest.get().status()
    except Exception as exc:  # noqa: BLE001
        status = {"error": str(exc)}
    check = None
    try:
        check = json.load(open(CHECK_FILE))
    except Exception:
        pass
    return {"ingest": status, "sanity": check}


def series_snapshot() -> dict:
    """Rolling per-device telemetry history for the trend chart.

    Each entry: {"points": [{"t": epoch_s, "v": value}], "unit": unit,
    "n": count, "last_age_s": seconds since the newest point}
    """
    now = time.time()
    out: dict[str, dict] = {}
    with _lock:
        snapshot = {dev: list(dq) for dev, dq in _series.items()}
    for dev, points in snapshot.items():
        points = [pt for pt in points if now - pt["t"] <= SERIES_WINDOW_S]
        if not points:
            continue
        for field, unit in (("center", "°C"), ("ambient", "°C"), ("rms", ""), ("peak", "")):
            vals = []
            for pt in points:
                v = (pt.get("p") or {}).get(field)
                try:
                    vals.append({"t": pt["t"], "v": float(v)})
                except (TypeError, ValueError):
                    continue
            if not vals:
                continue
            out[f"{dev}.{field}"] = {
                "points": vals,
                "field": field,
                "unit": unit,
                "n": len(vals),
                "last_age_s": round(now - vals[-1]["t"], 1),
            }
    return out


def collect():
    with _lock:
        age_s = round(time.time() - _esp["at"], 1) if _esp["at"] else None
        state, note = esp_telemetry_state(_esp["payload"], age_s)
        esp = {"payload": _esp["payload"], "age_s": age_s, "state": state, "note": note}
    return {
        "at": int(time.time()),
        "pi": pi_vitals(),
        "esp": esp,
        "audio": audio_state(),
        "net": net_state(),
        "services": services(),
        "series": series_snapshot(),
    }


HTML = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PigPulse diagnostics</title><style>
:root{--bg:#121314;--panel:#1d1f21;--line:#2b2d2f;--ink:#f2f3f1;--dim:#a6a9a6;--ok:#3ddc84;--warn:#d9a05b;--bad:#d06b5a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.5 'Inter',system-ui,sans-serif;padding:20px 16px 64px}
.wrap{max-width:900px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}h1 span{color:var(--ok)}
.sub{color:var(--dim);margin:0 0 18px}.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;margin:0 0 16px}
h2{font-size:20px;margin:0 0 12px;color:var(--ok)}table{width:100%;border-collapse:collapse}
td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}td:first-child{color:var(--dim);width:46%}
td:last-child{font-weight:700;text-align:right}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
a.back{position:fixed;right:14px;bottom:14px;background:var(--panel);color:var(--ok);border:1px solid var(--line);border-radius:999px;padding:10px 16px;font:700 15px system-ui;text-decoration:none}
.picker{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.picker button{background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:8px 14px;font:600 15px system-ui;cursor:pointer}
.picker button[aria-pressed="true"]{color:var(--bg);background:var(--ok);border-color:var(--ok)}
.note{color:var(--dim);font-size:15px;margin:8px 0 0}.note.warn{color:var(--warn)}
</style></head><body><div class="wrap">
<h1>Pig<span>Pulse</span> diagnostics</h1>
<p class="sub">Read-only device state · refreshes every 5 s · <span id="at"></span></p>
<div id="root">loading…</div>
<a class="back" href="/">← Dashboard</a>
<script src="/static/trend.js"></script>
<script>
const cls = (v) => (v === true || v === 'active') ? 'ok' : (v === false || v === 'inactive' || v === 'failed') ? 'bad' : '';
const row = (k, v) => `<tr><td>${k}</td><td class="${cls(v)}">${v}</td></tr>`;
async function tick(){
  try{
    const [d, vp] = await Promise.all([
      fetch('/diag.json', {cache:'no-store'}).then((r) => r.json()),
      fetch('/vitals.json', {cache:'no-store'}).then((r) => r.json()).catch(() => ({ samples: [] })),
    ]);
    document.getElementById('at').textContent = new Date().toLocaleTimeString();
    const p = d.pi, e = d.esp.payload || {}, a = d.audio.ingest || {}, n = d.net, s = d.services || {};
    let html = '';
    html += '<div class="card"><h2>Pi health - where the power drops</h2>'
      + '<p class="note">Sampled on this Pi every 10 s and appended to its own card, so a power cut is still visible after the reboot it caused. Amber dashed lines are reboots; the gap before one is the downtime.</p>'
      + PigTrend.renderAll(PigTrend.vitalsSeries((vp || {}).samples || []), {
          width: 860, height: 200, reboots: PigTrend.rebootMarkers((vp || {}).reboots || []),
          emptyMessage: 'No vitals sampled yet.',
        }) + PigTrend.rebootList((vp || {}).reboots || [], {
          emptyMessage: 'No reboots recorded yet.',
        }) + '</div>';
    html += '<div class="card"><h2>Trend</h2>'
      + PigTrend.renderAll(d.series || {}, {
          width: 860, height: 220,
          emptyMessage: 'No telemetry history yet - the page starts collecting as soon as a device reports.',
        }) + '</div>';
    html += '<div class="card"><h2>ESP32-S3 barn mic</h2>';
    if (d.esp.state !== 'LIVE') {
      html += `<p class="note warn">${d.esp.note}</p>`;
    }
    html += '<table>';
    html += row('telemetry state', d.esp.state);
    html += row('mic reading', d.esp.state === 'LIVE' && e.mic !== undefined ? e.mic : '—');
    html += row('level (rms / peak)', e.rms === undefined ? '—' : `${e.rms} / ${e.peak}`);
    html += row('source min / max', e.smin === undefined ? '—' : `${e.smin} / ${e.smax}`);
    html += row('I2S read fails / retries', `${e.irf ?? '—'} / ${e.irr ?? '—'}`);
    html += row('samples/s · batch', `${e.sps ?? '—'} · ${e.batch ?? '—'}`);
    html += row('bytes/s', e.bps ?? '—');
    html += row('packets tx / rx', `${e.txp ?? '—'} / ${e.txr ?? '—'}`);
    html += row('RSSI · heap', `${e.rssi ?? '—'} dBm · ${e.heap ?? '—'}`);
    html += row('boot count · clip', `${e.boots ?? '—'} · ${e.clip ?? '—'}`);
    html += row('telemetry age', d.esp.age_s === null || d.esp.age_s === undefined ? '—' : `${d.esp.age_s.toFixed ? d.esp.age_s.toFixed(0) : d.esp.age_s} s`);
    html += '</table></div>';
    html += '<div class="card"><h2>Audio ingest (Pi)</h2><table>';
    html += row('connected', a.connected);
    html += row('last chunk', (a.lastMs === null || a.lastMs === undefined) ? '—' : `${(a.lastMs/1000).toFixed(1)} s ago`);
    html += row('bytes · chunks', `${a.bytes ?? '—'} · ${a.chunks ?? '—'}`);
    html += row('longest gap', (a.maxGapInMs === undefined) ? '—' : `${(a.maxGapInMs/1000/60).toFixed(1)} min`);
    html += row('non-zero samples', (a.nonzeroPct === undefined) ? '—' : `${a.nonzeroPct} %`);
    const c = d.audio.sanity;
    html += row('sanity check', c ? (c.ok ? 'PASS' : 'FAIL — ' + c.reason) : 'never run');
    html += '</table></div>';
    html += '<div class="card"><h2>Pi</h2><table>';
    html += row('load (1/5/15)', (p.load || []).join(' / '));
    html += row('cpu cores', p.nproc);
    html += row('memory used', `${p.mem_used_pct} % (${Math.round((p.mem_total_kb - p.mem_avail_kb)/1024)} MB of ${Math.round(p.mem_total_kb/1024)} MB)`);
    html += row('temperature', p.temp_c === null ? '—' : `${p.temp_c} °C`);
    html += row('disk used / free', `${p.disk_used_pct} % / ${p.disk_free_gb} GB`);
    html += row('throttled flags', p.throttled);
    html += row('core voltage', p.core_volt);
    html += row('uptime', `${Math.floor(p.uptime_s/3600)} h ${Math.floor(p.uptime_s%3600/60)} m`);
    html += '</table></div>';
    html += '<div class="card"><h2>Network</h2><table>';
    html += row('AP (wlan1)', `PigPulse · ch ${n.ap.channel ?? '—'} · ${n.ap.clients ?? '—'} clients`);
    html += row('uplink (wlan0)', n.uplink.connected ? 'connected' : 'down');
    html += row('uplink IP', n.uplink.ip || '—');
    html += row('default route', n.uplink.default || '—');
    html += '</table></div>';
    html += '<div class="card"><h2>Services</h2><table>';
    for (const [k, v] of Object.entries(s)) html += row(k, v);
    html += '</table></div>';
    document.getElementById('root').innerHTML = html;
    document.querySelectorAll('.picker button').forEach((b) => {
      b.addEventListener('click', () => { trendKey = b.getAttribute('data-key'); tick(); });
    });
  }catch(err){ document.getElementById('root').innerHTML = '<div class="card bad">'+err+'</div>'; }
}
tick(); setInterval(tick, 5000);
</script></body></html>"""