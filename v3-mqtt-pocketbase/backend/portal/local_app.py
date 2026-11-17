"""Pi-only static Expo app and read-only adapters; no cloud or Node runtime."""
import http.client
import mimetypes
import ssl
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

APP_ROOT = Path('/usr/local/lib/pigpulse-portal/app')
COLLECTIONS = {'telemetry', 'alerts', 'pigs', 'devices'}
QUERY = {'page', 'perPage', 'sort', 'filter', 'expand', 'fields'}
PI_ENDPOINTS = {'data', 'ambient', 'esp/status', 'health', 'cctv',
                'esp/record', 'camera-audio', 'esp/stream',
                'diag.json', 'vitals.json'}


def static(handler, path):
    """Resolve only public export assets; deep routes fall back to index.html."""
    relative = unquote(path.removeprefix('/app/'))
    parts = Path(relative).parts
    root = APP_ROOT.resolve()
    target = (root / relative).resolve()
    if any(part.startswith('.') for part in parts) or not target.is_relative_to(root):
        handler.send_json({'error': 'not allowed'}, 403)
        return
    if not target.is_file():
        if target.suffix:
            handler.send_json({'error': 'asset not found'}, 404)
            return
        target = root / 'index.html'
    # A deployment may contain helper files accidentally: serve only web assets.
    if target.suffix.lower() not in {
        '.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico',
        '.webp', '.gif', '.ttf', '.woff', '.woff2', '.otf', '.mp3', '.wav', '.wasm',
    }:
        handler.send_json({'error': 'asset not allowed'}, 403)
        return
    try:
        body = target.read_bytes()
    except OSError:
        handler.send_json({'error': 'local app is not installed'}, 503)
        return
    handler.send_response(200)
    handler.send_header('Content-Type', mimetypes.guess_type(target.name)[0]
                        or 'application/octet-stream')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Cache-Control', 'no-cache')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.end_headers()
    handler._write(body)


def proxy(handler, service, path):
    """Fixed loopback upstreams only. Never forward credentials or redirects."""
    if service == 'pocketbase':
        conn = http.client.HTTPConnection('127.0.0.1', 8090, timeout=10)
    else:
        try:
            context = ssl.create_default_context(cafile='/home/pigpulse/thermal-pi/pigpulse-ca.crt')
            # Trust the Pi's local certificate; the fixed loopback destination
            # is not its public hostname. TLS verification remains enabled.
            context.check_hostname = False
            conn = http.client.HTTPSConnection('127.0.0.1', 8080,
                                              context=context, timeout=45)
        except OSError:
            handler.send_json({'error': 'local sensor certificate unavailable'}, 503)
            return
    started = False
    try:
        conn.request('GET', path, headers={'Accept': '*/*'})
        response = conn.getresponse()
        if 300 <= response.status < 400:
            handler.send_json({'error': 'unexpected local redirect'}, 502)
            return
        handler.send_response(response.status)
        for name in ('Content-Type', 'Content-Length', 'X-Stream-Ts', 'X-Frame-Ts',
                     'X-Audio-Format', 'X-Audio-Rate', 'X-Audio-Channels'):
            value = response.getheader(name)
            if value:
                handler.send_header(name, value)
        handler.send_header('Cache-Control', 'no-store')
        handler.send_header('X-Content-Type-Options', 'nosniff')
        handler.end_headers()
        started = True
        # read1 does not wait for a full buffer on the continuous PCM stream.
        while chunk := response.read1(65536):
            handler.wfile.write(chunk)
            handler.wfile.flush()
    except (OSError, http.client.HTTPException):
        if not started:
            handler.send_json({'error': 'local service unavailable'}, 502)
    finally:
        conn.close()


def get(handler):
    """Return True for a handled local-app route, otherwise let portal route it."""
    url = urlsplit(handler.path)
    if url.path == '/app':
        handler.send_response(302)
        handler.send_header('Location', '/app/')
        handler.end_headers()
    elif url.path.startswith('/app/'):
        static(handler, url.path)
    elif url.path == '/api/health':
        proxy(handler, 'pocketbase', '/api/health')
    elif url.path == '/api/telemetry':
        args = parse_qs(url.query, keep_blank_values=True)
        collection = args.pop('collection', [''])[0]
        if collection not in COLLECTIONS:
            handler.send_json({'error': 'collection not readable'}, 400)
            return True
        params = {}
        for name, values in args.items():
            if name not in QUERY:
                continue
            value = values[0]
            if len(value) > 200:
                handler.send_json({'error': 'query parameter too long'}, 400)
                return True
            if name == 'perPage':
                if not value.isascii() or not value.isdecimal():
                    handler.send_json({'error': 'invalid perPage'}, 400)
                    return True
                value = str(min(100, max(1, int(value))))
            params[name] = value
        query = urlencode(params)
        proxy(handler, 'pocketbase', f'/api/collections/{collection}/records'
              + (f'?{query}' if query else ''))
    elif url.path == '/api/pi':
        args = parse_qs(url.query, keep_blank_values=True)
        endpoint = args.pop('ep', ['data'])[0]
        if endpoint not in PI_ENDPOINTS:
            handler.send_json({'error': 'unsupported pi endpoint'}, 400)
            return True
        # Query values cannot alter the fixed host or allowlisted endpoint.
        query = urlencode({k: v[0] for k, v in args.items()
                           if k in {'ts', 'duration', 'seconds', 'rate'} and len(v[0]) <= 32})
        proxy(handler, 'thermal', '/' + endpoint + (f'?{query}' if query else ''))
    else:
        return False
    return True
