#!/usr/bin/env python3
"""Pi-side 24/7 RTSP recorder for the Tapo camera (stream copy, no re-encode).

Records the camera's main RTSP stream to 15-minute MP4 segments on the Pi.
Works entirely with the RTSP camera account — no camera control-API password.
- self-heals: relaunches ffmpeg if it dies or stops writing (staleness watch)
- rotates: deletes the OLDEST segments while free space is below a floor
- the segment being written is never a rotation victim

Credentials come from the environment, never from source. Reads either the
REC_* names or the existing TAPO_RTSP_* names from /etc/pigpulse/cctv.env.

Audio note: the camera publishes pcm_alaw 8 kHz on the stream, which the MP4
container refuses — that is the recording-to-zero-bytes failure mode. Video is
copied bit-exact; audio is transcoded to AAC 32k (8 kHz mono, negligible CPU).
"""
import glob
import os
import signal
import subprocess
import time

HOST = (
    os.environ.get("REC_RTSP_HOST")
    or os.environ.get("TAPO_RTSP_HOST")
    or "192.168.69.2"
)
USER = (
    os.environ.get("REC_RTSP_USER")
    or os.environ.get("TAPO_RTSP_USER")
    or "pigpulse"
)
PASS = (
    os.environ.get("REC_RTSP_PASS")
    or os.environ.get("TAPO_RTSP_PASS")
    or ""
)
OUTDIR = os.environ.get("REC_DIR", "/home/pigpulse/cctv/recs")
SEG_SECONDS = int(os.environ.get("REC_SEG_SECONDS", "900"))
MAX_STALE_S = int(os.environ.get("REC_MAX_STALE_S", "120"))
FLOOR_MB = int(os.environ.get("REC_FLOOR_MB", "5000"))

URL = "rtsp://%s:%s@%s:554/stream1" % (USER, PASS, HOST)


def log(msg):
    print("RTSP-REC [%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def newest_mtime():
    files = sorted(glob.glob(os.path.join(OUTDIR, "seg_*.mp4")))
    if not files:
        return 0, None
    newest = files[-1]
    return os.stat(newest).st_mtime, newest


def free_mb():
    st = os.statvfs(OUTDIR)
    return st.f_bavail * st.f_frsize // (1024 * 1024)


def rotate():
    files = sorted(glob.glob(os.path.join(OUTDIR, "seg_*.mp4")))
    free = free_mb()
    if free >= FLOOR_MB:
        return free
    # never rotate the newest file: it is the one ffmpeg is writing
    for victim in files[:-1]:
        if free >= FLOOR_MB:
            break
        try:
            os.remove(victim)
            free = free_mb()
        except OSError:
            pass
    return free


def spawn():
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-rtsp_transport", "tcp", "-i", URL,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "32k",
        "-avoid_negative_ts", "make_zero", "-fflags", "+genpts",
        "-f", "segment", "-segment_time", str(SEG_SECONDS),
        "-reset_timestamps", "1", "-strftime", "1",
        os.path.join(OUTDIR, "seg_%Y%m%d_%H%M%S.mp4"),
    ]
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log("ffmpeg spawned pid=%s" % p.pid)
    return p


def main():
    if not PASS:
        sys.exit("no RTSP password: set REC_RTSP_PASS or the cctv.env TAPO_RTSP_PASS")
    os.makedirs(OUTDIR, exist_ok=True)
    p = spawn()
    spawned_at = time.time()
    last_data = time.time()
    wrote = False
    fast_exits = 0  # consecutive <10 s exits = camera likely unreachable
    while True:
        time.sleep(15)
        free = rotate()
        if free < FLOOR_MB:
            log("WARNING: below disk floor even after rotation")
        if p.poll() is not None:
            runtime = time.time() - spawned_at
            if runtime < 10:
                fast_exits += 1
                backoff = min(15 * (2 ** fast_exits), 300)
                log("ffmpeg exited fast (%.0fs) — backing off %ds"
                    % (runtime, backoff))
                time.sleep(backoff)
            else:
                fast_exits = 0
                log("ffmpeg exited rc=%s — relaunching" % p.returncode)
            p = spawn()
            spawned_at = time.time()
            last_data = time.time()
            wrote = False
            continue
        mt, newest = newest_mtime()
        if mt and mt > spawned_at:
            last_data = mt
            wrote = True
            fast_exits = 0
        stale = time.time() - last_data
        if stale > MAX_STALE_S:
            log("stale for %ds (newest: %s) — relaunching ffmpeg"
                % (int(stale), os.path.basename(newest or "none")))
            p.send_signal(signal.SIGKILL)
            p.wait()
            if not wrote:
                # camera possibly unreachable: never drum a dead camera
                fast_exits += 1
                backoff = min(15 * (2 ** fast_exits), 300)
                log("no data this run — backing off %ds" % backoff)
                time.sleep(backoff)
            p = spawn()
            spawned_at = time.time()
            last_data = time.time()
            wrote = False


if __name__ == "__main__":
    import sys
    main()
