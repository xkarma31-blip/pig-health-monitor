# Wei4bot (/wei) — Setup Summary

## Usage in Telegram (Master chat)
```
/wei start      — Wake Wei4bot
/wei stop       — Put Wei4bot to sleep
/wei restart    — Restart Wei4bot
/wei status     — Check status
```

## What Was Fixed

### 1. Config format (ROOT CAUSE of AttributeError)
Changed from string format (caused `'str' object has no attribute 'get'`):
```yaml
# OLD — broken
quick_commands:
  wei: /home/solrahk/.hermes/scripts/wei-toggle.sh
```
To dict format ( Hermes gateway expects `type: exec` with `command:`):
```yaml
# NEW — correct
quick_commands:
  wei:
    type: exec
    command: /home/solrahk/.hermes/scripts/wei-toggle.sh
```

### 2. Config updated via `hermes config set` (not direct file edit)
- `quick_commands.wei` → `{"type":"exec","command":"/home/solrahk/.hermes/scripts/wei-toggle.sh"}`
- `command_allowlist` → `["start hermes-vps-gateway.service"]`
- `quick_commands.ollama` → `{"type":"exec","command":"/terminal execute bash ~/.local/bin/ollama-toggle"}`

### 3. Gateway needs restart to reload config

## Files
- Script: `~/.hermes/scripts/wei-toggle.sh`
- Config: `~/.hermes/config.yaml` (modified via `hermes config set`)
- Docs: `~/pig-health-monitor/docs/WEI_COMMAND_SETUP.md`

## Current Status
- Wei4bot service: **RUNNING**
- Auto-start on boot: **DISABLED** (manual only)
- `/wei` command: **CONFIGURED** — gateway config format fixed, needs restart
