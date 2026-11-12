#!/usr/bin/env python3
"""Minimal DNS probe: does this server answer A queries? (no dig on this host)

  dnstest.py <name> [server ...] [--bind=IP]
"""
import random
import socket
import struct
import sys


def query(server, name, bind_ip=None, timeout=4.0):
    tid = random.randint(0, 65535)
    header = struct.pack("!HHHHHH", tid, 0x0100, 1, 0, 0, 0)
    qname = b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\x00"
    packet = header + qname + struct.pack("!HH", 1, 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        if bind_ip:
            sock.bind((bind_ip, 0))
        sock.sendto(packet, (server, 53))
        data, _ = sock.recvfrom(2048)
    except Exception as exc:
        print(f"{server} (src {bind_ip or 'auto'}): FAILED ({exc})")
        return False
    finally:
        sock.close()
    rcode = data[3] & 0x0F
    answers = struct.unpack("!H", data[6:8])[0]
    verdict = "OK" if rcode == 0 and answers > 0 else f"rcode={rcode} answers={answers}"
    print(f"{server} (src {bind_ip or 'auto'}): {verdict}")
    return rcode == 0 and answers > 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    bind_ip = None
    for a in list(args):
        if a.startswith("--bind="):
            bind_ip = a.split("=", 1)[1]
            args.remove(a)
    name = args[0] if args else "example.com"
    servers = args[1:] or ["192.168.254.254"]
    ok = True
    for server in servers:
        ok = query(server, name, bind_ip) and ok
    sys.exit(0 if ok else 1)
