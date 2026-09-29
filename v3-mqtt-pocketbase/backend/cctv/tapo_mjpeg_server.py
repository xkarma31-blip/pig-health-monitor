#!/usr/bin/env python3
"""Live MJPEG from Tapo RTSP — serves on 0.0.0.0:8091 (Pi dual-home)."""
import os
import socket
import subprocess
import threading
import time
from collections import deque

# The camera joins the PigPulse AP, where dnsmasq reserves 192.168.69.2 for its
# MAC (18:69:45:fb:d4:be — per dnsmasq.leases on the Pi). Older notes pointed at
# .83 instead — probe both on startup so either addressing works, and allow an
# explicit override.
CANDIDATES = [h for h in (
    os.environ.get("CCTV_RTSP_HOST", "").strip(),
    "192.168.69.2",
    "192.168.69.83",
) if h]
RTSP_USER, RTSP_PASS, RTSP_PORT = "pigpulse", "capstone", 554
PORT = 8091
BIND = "0.0.0.0"
BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
# clients is touched by every connection thread AND the single ffmpeg pump
# thread, so all access goes through _clients_lock.
_clients_lock = threading.Lock()
clients = []


def clients_snapshot():
    with _clients_lock:
        return list(clients)


def client_drop(conn):
    with _clients_lock:
        if conn in clients:
            clients.remove(conn)


def rtsp_url(host: str) -> str:
    return f"rtsp://{RTSP_USER}:{RTSP_PASS}@{host}:{RTSP_PORT}/stream1"


def pick_host(timeout: float = 2.0) -> str | None:
    """First candidate whose RTSP port accepts a TCP connection."""
    for host in CANDIDATES:
        try:
            with socket.create_connection((host, RTSP_PORT), timeout=timeout):
                return host
        except OSError:
            continue
    return None


def read_frames():
    while True:
        # Re-probe every restart cycle: the camera may still be booting, or the
        # Pi's AP may not be up yet — never give up, just wait and retry.
        host = None
        while host is None:
            host = pick_host()
            if host is None:
                print("CCTV: no camera answering on any candidate, retrying…",
                      flush=True)
                time.sleep(5)
        cmd = [
            "ffmpeg",
            "-rtsp_transport", "tcp",
            "-fflags", "nobuffer",
            "-flags", "low_delay",
            "-probesize", "32",
            "-analyzeduration", "0",
            "-max_delay", "0",
            "-i", rtsp_url(host),
            "-an", "-dn",
            "-vf", "fps=10,scale=800:-1",
            "-q:v", "6",
            "-f", "mjpeg",
            "-",
        ]
        try:
            # Keep stderr: DEVNULL used to hide every ffmpeg/RTSP failure
            # (bad auth, camera reboot, missing ffmpeg) behind a silent
            # restart loop — the browser just showed "CCTV offline".
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if proc.stdout is None or proc.stderr is None:   # unreachable with PIPE
                raise RuntimeError("ffmpeg pipes not attached")
            stdout, stderr = proc.stdout, proc.stderr
            err_tail: deque = deque(maxlen=8)
            threading.Thread(
                target=lambda: [
                    err_tail.append(l.decode(errors="replace").strip())
                    for l in stderr
                ],
                daemon=True,
            ).start()
            buf = b""
            while True:
                chunk = stdout.read(65536)
                if not chunk:
                    if proc.poll() is not None:
                        break
                    continue
                buf += chunk
                start = 0
                while True:
                    s = buf.find(b"\xff\xd8", start)
                    if s < 0:
                        break
                    e = buf.find(b"\xff\xd9", s + 2)
                    if e < 0:
                        break
                    frame = buf[s : e + 2]
                    start = e + 2
                    payload = BOUNDARY + frame + b"\r\n"
                    dead = []
                    for c in clients_snapshot():
                        try:
                            c.sendall(payload)
                        except Exception:
                            dead.append(c)
                    for c in dead:
                        client_drop(c)
                        try:
                            c.close()
                        except Exception:
                            pass
                buf = buf[start:]
            proc.kill()
            if err_tail:
                print(f"CCTV: ffmpeg for {host} exited: {err_tail[-1]}", flush=True)
        except Exception as e:
            print(
                f"CCTV: ffmpeg failed to start ({type(e).__name__}: {e}) "
                f"— check that ffmpeg is installed",
                flush=True,
            )
        time.sleep(1)   # never spin the retry loop


def handle_client(conn):
    try:
        conn.sendall(
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
            b"Cache-Control: no-cache\r\n"
            b"Connection: close\r\n\r\n"
        )
        with _clients_lock:
            clients.append(conn)
        # Hold the client open by reading. recv() returning b"" is a clean
        # FIN — breaking there is essential, because `while conn in clients`
        # alone spins this thread at 100% CPU until the next video frame
        # happens to fail a sendall and evicts the socket.
        while True:
            data = conn.recv(1024)
            if not data:
                break
    except Exception:
        pass
    finally:
        client_drop(conn)
        try:
            conn.close()
        except Exception:
            pass


def serve():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((BIND, PORT))
    except OSError as e:
        # Without this the thread dies and pigpulse-cctv.service
        # (Restart=on-failure) loops every 5 s with only a bare traceback.
        print(f"CCTV: FATAL cannot bind {BIND}:{PORT} — {e}", flush=True)
        raise
    s.listen(8)
    print(f"MJPEG live: http://{BIND}:{PORT}/", flush=True)
    threading.Thread(target=read_frames, daemon=True).start()
    while True:
        conn, _ = s.accept()
        # A client that connects and never reads would otherwise hold a thread
        # forever; drop idle ones.
        conn.settimeout(300)
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    serve()
