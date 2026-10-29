#!/usr/bin/env bash
# Read-only Pi sampler. No network probes, restarts, or accounting changes.
# Usage: bash sample_resources.sh [interval_seconds] [sample_count]
set -euo pipefail
interval=${1:-5}
count=${2:-3}
[[ $interval =~ ^[0-9]+$ && $count =~ ^[0-9]+$ ]] || exit 2
(( interval >= 1 && interval <= 60 && count >= 1 && count <= 120 )) || exit 2
for ((i=0; i<count; i++)); do
  printf '\nSAMPLE=%s UTC=%s UPTIME_S=' "$i" "$(date -u +%FT%TZ)"
  cut -d' ' -f1 /proc/uptime
  grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
  for unit in pigpulse-thermal pigpulse-cctv pigpulse-rtc-trial; do
    printf 'UNIT=%s\n' "$unit"
    systemctl show "$unit" -p ActiveState -p CPUUsageNSec -p MemoryCurrent \
      -p TasksCurrent -p NRestarts -p InvocationID
    group=$(systemctl show "$unit" -p ControlGroup --value)
    # Empty group on inactive units must never select the root cgroup.
    if [[ $group == /system.slice/* && $group != *..* ]]; then
      file="/sys/fs/cgroup${group}/cgroup.procs"
      if [[ -r $file ]]; then
        # RSS is a fallback, NOT cgroup memory: shared pages can be counted twice.
        while read -r pid; do
          [[ $pid =~ ^[0-9]+$ ]] || continue
          if [[ -r /proc/$pid/status ]]; then
            printf 'PID=%s ' "$pid"
            awk '/^(Name|VmRSS):/ {printf "%s ", $0} END {print ""}' "/proc/$pid/status" || true
          fi
        done < "$file"
      fi
    fi
  done
  if (( i + 1 < count )); then sleep "$interval"; fi
done
