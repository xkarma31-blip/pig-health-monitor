"""Run with TLS cert/key arguments; no sensor imports or hardware required."""
import pathlib
import socket
import ssl
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from tls_server import ThreadedTLSServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"alive")

    def log_message(self, *_args):
        pass


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[1], sys.argv[2])
server = ThreadedTLSServer(("127.0.0.1", 0), Handler, ctx)
threading.Thread(target=server.serve_forever, daemon=True).start()
idle = socket.create_connection(server.server_address)
try:
    url = "https://127.0.0.1:%d/" % server.server_port
    with urllib.request.urlopen(url, context=ssl._create_unverified_context(), timeout=2) as r:
        assert r.read() == b"alive"
    print("PASS: idle TLS client does not block another HTTPS request")
finally:
    idle.close()
    server.shutdown()
    server.server_close()
