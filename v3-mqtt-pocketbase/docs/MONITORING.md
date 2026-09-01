# PigPulse v3 — Monitoring & Observability

## Sentry (Error Tracking)

Sentry captures runtime errors in the Expo app and bridge script.

### Expo App Setup
```typescript
// app/_layout.tsx
import * as Sentry from 'sentry-expo';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  tracesSampleRate: 1.0,
});
```

### Bridge Script Setup
```python
# mqtt_bridge.py
import sentry_sdk
sentry_sdk.init(
    dsn="YOUR_SENTRY_DSN",
    traces_sample_rate=1.0
)
```

## Watchdog (System Health)

Watchdog monitors Docker containers and ESP32 connectivity.

### Docker Health Checks
Already configured in `docker-compose.yml`:
- Mosquitto: `mosquitto_sub` health check
- PocketBase: `wget --spider` health check
- ValKey: `valkey-cli ping` health check
- OpenResty: `curl -f http://localhost/health` health check

### ESP32 Watchdog
The firmware includes:
- MQTT Last Will and Testament (LWT) — marks device offline if disconnected
- Healthbeat every 60 seconds — battery, WiFi, uptime
- FreeRTOS watchdog — restarts if tasks hang

### Monitoring Endpoints
```
GET /health           → OpenResty status
GET /api/health       → PocketBase status
mosquitto_sub -t '$SYS/#'  → MQTT broker stats
```

## ValKey (Redis Cache)

ValKey buffers telemetry data and caches API responses.

### What's Cached
| Data Type | TTL | Purpose |
|-----------|-----|---------|
| Telemetry | 5s | Real-time sensor data |
| Alerts | 60s | Near real-time alerts |
| Devices | 5min | Slow-changing device status |
| Pigs | 1hr | Rarely-changing pig roster |

### Cache Strategy (L1→L2→L3)
```
L1: OpenResty Lua shared dict (in-memory, <1ms)
L2: ValKey (network, ~1ms)
L3: PocketBase SQLite (disk, ~10ms)
```

### Monitor Cache Hit Rate
```bash
# Connect to ValKey
docker exec pigpulse-valkey valkey-cli

# Check cache stats
INFO stats
GET cache_hit_rate
```

## Grafana Dashboard (Optional)

For production monitoring, add Grafana:

```yaml
# Add to docker-compose.yml
grafana:
  image: grafana/grafana:latest
  container_name: pigpulse-grafana
  ports:
    - "3000:3000"
  volumes:
    - grafana-data:/var/lib/grafana
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Dashboard Panels
- ESP32 device status (online/offline)
- Telemetry data rate (messages/second)
- Alert frequency
- MQTT broker connections
- PocketBase query latency
- Cache hit/miss ratio
