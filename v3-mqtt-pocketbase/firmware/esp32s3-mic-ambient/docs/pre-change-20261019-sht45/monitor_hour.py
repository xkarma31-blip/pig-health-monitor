"""Read-only one-hour capture with reconnection and durable results."""
import collections
import datetime
import json
from pathlib import Path
import re
import time
import serial

root = Path(__file__).resolve().parent
prefix = root / ('hour-watch-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
counts = collections.Counter()
values = collections.Counter()
start = time.monotonic()
port = None
with prefix.with_suffix('.jsonl').open('x', buffering=1) as log:
    def record(kind, text):
        log.write(json.dumps({'time': datetime.datetime.now().astimezone().isoformat(),
                              'kind': kind, 'text': text}) + '\n')
    record('start', '3600 seconds; combined firmware; no flashing')
    try:
        while time.monotonic() - start < 3600:
            try:
                if port is None:
                    port = serial.Serial('/dev/ttyACM0', 115200, timeout=1)
                    port.reset_input_buffer()
                    record('connected', '/dev/ttyACM0')
                line = port.readline().decode(errors='replace').strip()
                if not line:
                    continue
                record('serial', line)
                counts['lines'] += 1
                if '[sht45]' in line:
                    counts['sht_reports'] += 1
                    if 'CRC=OK' in line:
                        counts['sht_valid_measurements'] += 1
                    if 'error=' in line or 'failed' in line:
                        counts['sht_errors'] += 1
                match = re.search(r'RMS24: (\d+) Peak24: (\d+)', line)
                if match:
                    rms, peak = map(int, match.groups())
                    counts['mic_reports'] += 1
                    values[rms] += 1
                    if rms == peak:
                        counts['mic_rms_equals_peak'] += 1
                    if peak and peak & (peak - 1) == 0:
                        counts['mic_power_of_two_peak'] += 1
                    if 'wifi:1' in line:
                        counts['wifi_connected_reports'] += 1
                if any(w in line.lower() for w in ('brownout', 'panic', 'rst:', 'starting pigpulse')):
                    counts['reset_or_fault_markers'] += 1
            except (serial.SerialException, OSError) as exc:
                counts['serial_errors'] += 1
                record('serial_error', str(exc))
                if port is not None:
                    port.close()
                port = None
                time.sleep(2)
    finally:
        if port is not None:
            port.close()
        summary = {'elapsed_seconds': round(time.monotonic() - start, 1),
                   'counts': dict(counts), 'most_common_rms': values.most_common(20),
                   'distinct_reported_rms': len(values),
                   'limitations': 'Block summaries, not raw PCM. No controlled sound, voltage or temperature measurement.'}
        prefix.with_suffix('.summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        record('finished', summary)
        print(json.dumps(summary, indent=2), flush=True)
