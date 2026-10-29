"""Keep incomplete TLS handshakes off the HTTP accept loop."""
import ssl
from http.server import ThreadingHTTPServer


class ThreadedTLSServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler, context):
        self.context = context
        super().__init__(address, handler)

    def process_request_thread(self, request, client_address):
        connection = request
        try:
            request.settimeout(5)
            connection = self.context.wrap_socket(request, server_side=True)
            connection.settimeout(15)
            self.finish_request(connection, client_address)
        except (OSError, ssl.SSLError):
            pass  # disconnected, idle, or non-TLS client
        except Exception:
            self.handle_error(connection, client_address)
        finally:
            self.shutdown_request(connection)
