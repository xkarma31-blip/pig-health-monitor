#!/usr/bin/env python3
"""Live MJPEG from Tapo RTSP — serves on 127.0.0.1:8091 (loopback only).

Loopback is deliberate. thermal-pi's /cctv route proxies this feed so the
browser stays on the HTTPS origin, and it dials _CCTV_HOST = "127.0.0.1", so
nothing on the AP needs a direct connection. Binding 0.0.0.0 published an
UNAUTHENTICATED video stream to every client that could associate with SSID
PigPulse.
"""
import os
import queue as _queue
import socket
import struct
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
BIND = "127.0.0.1"
BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
# clients is touched by every connection thread AND the single ffmpeg pump
# thread, so all access goes through _clients_lock.
_clients_lock = threading.Lock()
clients = []


def clients_snapshot():
    with _clients_lock:
        return list(clients)


def client_drop(q):
    with _clients_lock:
        if q in clients:
            clients.remove(q)


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
        retry_delay = 5
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
                    # Non-blocking fan-out: the pump NEVER waits on a client.
                    # A slow reader (phone wifi doze) used to block this loop
                    # for up to its whole send timeout — dragging EVERY
                    # stream seconds behind. Now each client has a tiny
                    # latest-frame queue; when full, the oldest frame is
                    # dropped so every reader catches up to the freshest.
                    for q in clients_snapshot():
                        try:
                            q.put_nowait(payload)
                        except _queue.Full:
                            try:
                                q.get_nowait()
                            except _queue.Empty:
                                pass
                            try:
                                q.put_nowait(payload)
                            except _queue.Full:
                                pass
                buf = buf[start:]
            proc.kill()
            proc.wait(timeout=5)
            if err_tail:
                print(f"CCTV: ffmpeg for {host} exited: {err_tail[-1]}", flush=True)
                if any("401" in line or "Unauthorized" in line for line in err_tail):
                    retry_delay = 180  # measured camera recovery after 180s quiet
        except Exception as e:
            print(
                f"CCTV: ffmpeg failed to start ({type(e).__name__}: {e}) "
                f"— check that ffmpeg is installed",
                flush=True,
            )
        time.sleep(retry_delay)


def handle_client(conn):
    """One tiny queue + one writer thread per client.

    The pump enqueues frames and never blocks. The writer drains at the
    client's own pace. SO_SNDTIMEO bounds a wedged SEND (send-only — the
    keepalive recv below deliberately has no timeout, because an idle
    browser never sends after the GET, and a recv timeout would evict
    healthy clients). Result: no client can delay any other client, and a
    slow one always catches up to the freshest frame instead of lagging.
    """
    q = None
    try:
        conn.sendall(
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
            b"Cache-Control: no-cache\r\n"
            b"Connection: close\r\n\r\n"
        )
        conn.setsockopt(
            socket.SOL_SOCKET, socket.SO_SNDTIMEO, struct.pack("ll", 10, 0)
        )
        try:
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        q = _queue.Queue(maxsize=2)
        with _clients_lock:
            clients.append(q)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return

    def writer():
        while True:
            try:
                conn.sendall(q.get(timeout=30))
            except _queue.Empty:
                # No frames for 30 s: exit if this client was unregistered
                # (its reader saw the browser leave); otherwise keep waiting.
                if q not in clients_snapshot():
                    return
                continue
            except Exception:
                break
        client_drop(q)
        try:
            conn.close()
        except Exception:
            pass

    threading.Thread(target=writer, daemon=True).start()
    # Hold the client open by reading. recv() returning b"" is a clean
    # FIN — breaking there is essential, because a dead-but-unread socket
    # would otherwise linger until its next send times out.
    try:
        while True:
            data = conn.recv(1024)
            if not data:
                break
    except Exception:
        pass
    finally:
        client_drop(q)
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
        # No settimeout here: sends are bounded per-writer by SO_SNDTIMEO
        # (set in handle_client), and the keepalive recv must block forever
        # — idle browsers never send after the GET.
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    serve()
