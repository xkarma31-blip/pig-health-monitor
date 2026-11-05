#!/usr/bin/env python3
"""soak_bench.py — PigPulse Pi 4B thermal load bench tool.

Controlled CPU thermal load (baseline -> load -> cooldown) to establish a 
capability baseline. Samples at 1 Hz and records to JSON and SQLite.
"""

import argparse
import datetime
import json
import multiprocessing
import os
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

THERMAL_ZONE = "/sys/class/thermal/thermal_zone0/temp"
CPU_FREQ = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"
LOADAVG = "/proc/loadavg"
CPUINFO = "/proc/cpuinfo"
VCGENCMD = "/usr/bin/vcgencmd"
DEFAULT_DB = "/home/pigpulse/soak/soak.db"
DEFAULT_OUT = "/home/pigpulse/soak/"
LOCK_FILE = "/home/pigpulse/soak/bench.lock"

# ---------------------------------------------------------------- helpers

def get_temp():
    try:
        with open(THERMAL_ZONE, "r") as f:
            return float(f.read().strip()) / 1000.0
    except:
        return None

def get_freq():
    try:
        with open(CPU_FREQ, "r") as f:
            return float(f.read().strip()) / 1000.0
    except:
        return None

def get_load1():
    try:
        with open(LOADAVG, "r") as f:
            return float(f.read().split()[0])
    except:
        return None

def _parse_hex_int(v):
    """Parse '0x...'/int → int, or None when unparseable."""
    if v is None:
        return None
    try:
        return int(v, 16) if isinstance(v, str) else int(v)
    except (TypeError, ValueError):
        return None

def get_throttled():
    """vcgencmd get_throttled → '0x...' string, or None when unreadable.

    Never fabricates '0x0': a failed read must stay distinguishable from a
    real all-clear flag (permissions, missing vcgencmd).
    """
    try:
        out = subprocess.check_output([VCGENCMD, "get_throttled"], text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return None
    if "=" not in out:
        return None
    val = out.split("=", 1)[1].strip()
    if not val or _parse_hex_int(val) is None:
        return None
    return val

def get_model():
    try:
        if os.path.exists("/sys/firmware/devicetree/base/model"):
            with open("/sys/firmware/devicetree/base/model", "r") as f:
                return f.read().strip().strip('\0')
        with open(CPUINFO, "r") as f:
            for line in f:
                if line.startswith("Model"):
                    return line.split(":", 1)[1].strip()
    except:
        pass
    return "Unknown"

def db_event(db_path, etype, detail_dict):
    if not db_path:
        return False
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=5)
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("INSERT INTO events (ts, type, detail) VALUES (?, ?, ?)",
                     (time.time(), etype, json.dumps(detail_dict, separators=(',', ':'))))
        conn.commit()
        return True
    except Exception as exc:
        print(f"warning: db_event({etype!r}) failed: {exc}", file=sys.stderr)
        return False
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

def acquire_lock(lock_path):
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            with open(lock_path, 'r') as f:
                pid_str = f.read().strip()
                if not pid_str:
                    os.remove(lock_path)
                    return acquire_lock(lock_path)
                pid = int(pid_str)
            os.kill(pid, 0)
            return False
        except (ValueError, OSError):
            try:
                os.remove(lock_path)
                return acquire_lock(lock_path)
            except:
                return False
    except OSError as exc:
        print(f"warning: cannot create lock {lock_path}: {exc}", file=sys.stderr)
        return False
    with os.fdopen(fd, 'w') as f:
        f.write(str(os.getpid()))
    return True

def stress_worker():
    # Tight busy loop for CPU load
    while True:
        pass

# ---------------------------------------------------------------- execution

def main():
    """CLI entry point.

    Return codes: 0 = ok, 1 = setup/lock failure, 2 = safety abort (data
    written), 3 = invalid arguments.
    """
    ap = argparse.ArgumentParser(description="Pi thermal load bench")
    ap.add_argument("--seconds", type=int, default=300)
    ap.add_argument("--abort-temp", type=float, default=82.0)
    ap.add_argument("--workers", type=int, default=multiprocessing.cpu_count())
    ap.add_argument("--cooldown-max", type=int, default=180)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()

    if args.workers < 1:
        print("Aborting: --workers must be >= 1", file=sys.stderr)
        return 3
    if args.seconds < 1:
        print("Aborting: --seconds must be >= 1", file=sys.stderr)
        return 3
    if args.cooldown_max < 0:
        print("Aborting: --cooldown-max must be >= 0", file=sys.stderr)
        return 3
    if not 40.0 <= args.abort_temp <= 95.0:
        print("Aborting: --abort-temp must be within 40..95 C", file=sys.stderr)
        return 3

    if not acquire_lock(LOCK_FILE):
        print(f"Aborting: bench lock unavailable at {LOCK_FILE} (bench already running or lock path unusable)", file=sys.stderr)
        return 1

    try:
        return do_run(args)
    finally:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)

def do_run(args, is_selftest=False):
    # Adjust for dry-run / selftest
    baseline_target = 30 if not (args.dry_run or is_selftest) else 2
    load_target = args.seconds if not (args.dry_run or is_selftest) else (5 if args.dry_run else 2)
    cooldown_limit = args.cooldown_max if not (args.dry_run or is_selftest) else (3 if args.dry_run else 2)
    worker_count = args.workers if not (args.dry_run or is_selftest) else (2 if args.dry_run else 1)

    start_ts_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    overall_start = time.time()
    
    # DB start event
    start_detail = {
        "seconds": load_target,
        "workers": worker_count,
        "abort_temp": args.abort_temp,
        "dry_run": args.dry_run or is_selftest
    }
    db_ok = db_event(args.db, "bench_start", start_detail)

    samples = []
    phase = "baseline"
    workers = []
    abort = False
    abort_reason = None

    th = {"events": 0, "cum_or": 0, "reads_ok": 0, "last": None}

    def take_sample(phase_name):
        """Record one 1 Hz sample. Throttle read may be None (unreadable)."""
        s = {
            "t": round(time.time() - overall_start, 3),
            "phase": phase_name,
            "temp": get_temp(),
            "freq_mhz": get_freq(),
            "throttled": get_throttled(),
            "load1": get_load1()
        }
        samples.append(s)

        # Throttle tracking — only valid reads count; None reads never
        # fabricate flags, events, or a cumulative OR.
        t_hex = s["throttled"]
        t_val = _parse_hex_int(t_hex)
        if t_val is not None:
            th["reads_ok"] += 1
            if th["last"] is not None and t_hex != th["last"]:
                th["events"] += 1
            th["last"] = t_hex
            th["cum_or"] |= t_val

        if len(samples) % 10 == 0:
            print(f"[{phase_name}] {s['temp']}C {s['freq_mhz']}MHz", file=sys.stderr)
        return s

    print(f"Starting bench: {phase} phase ({baseline_target}s)...", file=sys.stderr)

    loop_start = time.time()
    next_sample = loop_start

    try:
        # --- Baseline ---
        while (time.time() - loop_start) < baseline_target:
            t_now = time.time()
            if t_now >= next_sample:
                take_sample(phase)
                next_sample += 1.0
            time.sleep(0.01)

        baseline_temps = [s["temp"] for s in samples if s["phase"] == "baseline" and s["temp"] is not None]
        baseline_freqs = [s["freq_mhz"] for s in samples if s["phase"] == "baseline" and s["freq_mhz"] is not None]
        baseline_mean = sum(baseline_temps) / len(baseline_temps) if baseline_temps else 0.0
        baseline_freq_mean = sum(baseline_freqs) / len(baseline_freqs) if baseline_freqs else 0.0
        
        # --- Load ---
        phase = "load"
        print(f"Starting {phase} phase ({load_target}s) with {worker_count} workers...", file=sys.stderr)
        for _ in range(worker_count):
            p = multiprocessing.Process(target=stress_worker)
            p.daemon = True
            p.start()
            workers.append(p)
        
        load_start = time.time()
        while (time.time() - load_start) < load_target:
            t_now = time.time()
            if t_now >= next_sample:
                s = take_sample(phase)
                next_sample += 1.0

                if s["temp"] is not None and s["temp"] >= args.abort_temp:
                    abort = True
                    abort_reason = "temp"
                    break
            time.sleep(0.01)

        # Kill workers
        for w in workers:
            w.terminate()
        for w in workers:
            w.join(timeout=1)
        workers = []

        # --- Cooldown ---
        phase = "cooldown"
        if not abort:
            print(f"Starting {phase} phase (limit {cooldown_limit}s)...", file=sys.stderr)
            cooldown_start = time.time()
            cooldown_target_temp = baseline_mean + 5.0
            
            while (time.time() - cooldown_start) < cooldown_limit:
                t_now = time.time()
                if t_now >= next_sample:
                    s = take_sample(phase)
                    next_sample += 1.0

                    if s["temp"] is not None and s["temp"] <= cooldown_target_temp:
                        break
                time.sleep(0.01)
        else:
            print(f"Aborted: {abort_reason}", file=sys.stderr)

    finally:
        for w in workers:
            if w.is_alive():
                w.terminate()

    overall_end = time.time()
    end_ts_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Results calculation
    all_temps = [s["temp"] for s in samples if s["temp"] is not None]
    load_samples = [s for s in samples if s["phase"] == "load"]
    load_temps = [s["temp"] for s in load_samples if s["temp"] is not None]
    load_freqs = [s["freq_mhz"] for s in load_samples if s["freq_mhz"] is not None]
    cooldown_samples = [s for s in samples if s["phase"] == "cooldown"]
    
    res = {
        "max_temp": max(all_temps) if all_temps else 0.0,
        "load_temp_mean": round(sum(load_temps) / len(load_temps), 2) if load_temps else 0.0,
        "load_temp_max": max(load_temps) if load_temps else 0.0,
        "freq_mean_load_mhz": round(sum(load_freqs) / len(load_freqs), 1) if load_freqs else 0.0,
        "cooldown_seconds": round(cooldown_samples[-1]["t"] - load_samples[-1]["t"], 1) if cooldown_samples and load_samples else 0.0,
        "end_temp": samples[-1]["temp"] if samples else 0.0,
        "throttle_events": th["events"],
        "throttle_ever_hex": hex(th["cum_or"]) if th["reads_ok"] > 0 else None,
        "throttle_reads_ok": th["reads_ok"],
        "abort": abort,
        "abort_reason": abort_reason
    }

    utc_stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_file = f"bench_{utc_stamp}.json"
    out_path = os.path.join(args.out, out_file)
    
    output = {
        "type": "bench",
        "host": os.uname().nodename,
        "nproc": multiprocessing.cpu_count(),
        "model": get_model(),
        "started": start_ts_iso,
        "ended": end_ts_iso,
        "args": {
            "seconds": load_target,
            "workers": worker_count,
            "abort_temp": args.abort_temp,
            "cooldown_max": cooldown_limit,
            "dry_run": args.dry_run or is_selftest
        },
        "baseline": {
            "temp_mean": round(baseline_mean, 2),
            "freq_mean": round(baseline_freq_mean, 1),
            "samples": len([s for s in samples if s["phase"] == "baseline"])
        },
        "result": res,
        "db_events": db_ok,
        "samples": samples
    }

    if not os.path.exists(args.out):
        os.makedirs(args.out, exist_ok=True)
    
    with open(out_path, "w") as f:
        json.dump(output, f, indent=1)
    
    print(f"Bench complete. Result written to {out_path}", file=sys.stderr)

    # DB end event
    end_detail = {
        "max_temp": res["max_temp"],
        "abort": abort,
        "reason": abort_reason,
        "file": out_file
    }
    db_event(args.db, "bench_end", end_detail)

    if abort:
        return 2
    return 0

# ---------------------------------------------------------------- selftest

def run_selftest():
    with tempfile.TemporaryDirectory() as td:
        db_path = os.path.join(td, "test_soak.db")
        # Initialize temp DB schema
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE events (ts REAL, type TEXT, detail TEXT);
        """)
        conn.commit()
        conn.close()

        args = argparse.Namespace(
            seconds=2,
            abort_temp=82.0,
            workers=1,
            cooldown_max=2,
            out=td,
            db=db_path,
            dry_run=False,
            selftest=True
        )

        rc = do_run(args, is_selftest=True)
        if rc != 0:
            print(f"FAIL selftest: do_run returned {rc}")
            return 2

        # Assertions
        json_files = [f for f in os.listdir(td) if f.startswith("bench_") and f.endswith(".json")]
        if not json_files:
            print("FAIL selftest: JSON result not found")
            return 2
        
        with open(os.path.join(td, json_files[0]), "r") as f:
            data = json.load(f)
        
        if len(data.get("samples", [])) < 5:
            print(f"FAIL selftest: not enough samples ({len(data.get('samples', []))})")
            return 2
        
        conn = sqlite3.connect(db_path)
        event_types = [r[0] for r in conn.execute("SELECT type FROM events")]
        conn.close()
        
        if "bench_start" not in event_types or "bench_end" not in event_types:
            print(f"FAIL selftest: missing DB events ({event_types})")
            return 2

        # Throttle honesty: zero valid reads must yield null, not "0x0".
        res = data.get("result", {})
        reads_ok = res.get("throttle_reads_ok")
        ever_hex = res.get("throttle_ever_hex")
        if not isinstance(reads_ok, int):
            print(f"FAIL selftest: throttle_reads_ok missing/not int ({reads_ok!r})")
            return 2
        if reads_ok == 0 and ever_hex is not None:
            print(f"FAIL selftest: no valid throttle reads but throttle_ever_hex={ever_hex!r}")
            return 2
        if reads_ok > 0 and _parse_hex_int(ever_hex) is None:
            print(f"FAIL selftest: {reads_ok} valid throttle read(s) but throttle_ever_hex={ever_hex!r}")
            return 2
        if not isinstance(res.get("throttle_events"), int):
            print(f"FAIL selftest: throttle_events missing/not int ({res.get('throttle_events')!r})")
            return 2

        print("PASS selftest")
        return 0

if __name__ == "__main__":
    sys.exit(main())
