#!/usr/bin/env bash
# Pi -> laptop staging -> Google Drive. The laptop is a PIPE, not storage:
# anything uploaded (and VERIFIED) is deleted locally; anything still being
# written stays.
#
# Drive quota note (2026-11-16): the shared rclone client project
# (projects/202264815644, 840k queries/min shared by every rclone user) throws
# intermittent 403 rateLimitExceeded. The 403s land on PATH RESOLUTION and
# DESTINATION LISTING, not on file bytes. Fixes baked in here:
#   * ID_REMOTE addresses the target folder by Drive file ID -> no resolution.
#   * 64 MiB upload chunks -> ~2 write calls per clip instead of ~15.
#   * per-file retry passes -> one bad clip cannot abort the whole batch.
#   * VERIFY BEFORE DELETE: a local clip is removed only after Drive reports
#     the same size (and MD5 when the API returns one). Storm-interrupted
#     uploads leave truncated objects; those must not delete the only copy.
#   * hop3 prunes Pi copies once verified safe: byte-size-identical in the
#     laptop cache, or already present on Drive (size match). Explicit names only.
set -u
CACHE="${PI_RECS_CACHE:-/root/.cache/pigpulse-recs}"
REMOTE="${PI_RECS_REMOTE:-gpdrive:PigPulse/cctv-pi-recs}"
ID_REMOTE="${PI_RECS_ID_REMOTE:-gpdrive2:}"
CHUNK="${PI_RECS_CHUNK_SIZE:-64Mi}"
STALE_MIN="${PI_RECS_STALE_MIN:-20}"
PI_HOST="${PI_RECS_PI_HOST:-pigpulse@192.168.69.1}"
PI_DIR="${PI_RECS_PI_DIR:-/home/pigpulse/cctv/recs}"
PRUNE_AGE_S="${PI_RECS_PRUNE_AGE_S:-1200}"
PAUSE_FILE="${PI_RECS_PAUSE_RSYNC:-/root/.cache/pigpulse-recs.pause-rsync}"
SKIP_HOP3=0

mkdir -p "$CACHE"
SSHOPTS="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=15 -o PreferredAuthentications=password -o PubkeyAuthentication=no"

# Prefer the ID-rooted remote when it exists in the rclone config.
RC_CONF="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
if ! grep -q "^\[${ID_REMOTE%%:*}\]" "$RC_CONF" 2>/dev/null; then
  echo "[$(date +%F_%T)] note: ID remote ${ID_REMOTE%%:*} not in config — using ${REMOTE}"
  ID_REMOTE="$REMOTE"
fi

# remote_meta <name> -> "<size> <md5>" for one object on Drive (1 API call).
# Prints "0 -" when the object is absent or the listing failed.
remote_meta() {
  rclone lsjson --files-only "$ID_REMOTE$1" 2>/dev/null | python3 -c '
import sys, json
try:
    items = json.load(sys.stdin)
except Exception:
    print("0 -"); raise SystemExit
if not items:
    print("0 -"); raise SystemExit
it = items[0]
md5 = ((it.get("Hashes") or {}).get("md5") or "")
print("%d %s" % (int(it.get("Size") or 0), md5 or "-"))
'
}

if [ "${PI_RECS_SKIP_HOP1:-0}" = "1" ]; then
  echo "[$(date +%F_%T)] hop1: SKIPPED (env)"
elif [ -f "$PAUSE_FILE" ]; then
  echo "[$(date +%F_%T)] hop1: SKIPPED (paused) — footage stays on the Pi, will sync to Drive on hop2"
  SKIP_HOP3=1
else
  echo "[$(date +%F_%T)] hop1: rsync Pi -> $CACHE"
  sshpass -p capstone rsync -a --timeout=90 -e "$SSHOPTS" \
    "pigpulse@192.168.69.1:/home/pigpulse/cctv/recs/" "$CACHE/" || echo "rsync failed (Pi offline? laptop asleep?)"
fi

if [ "${PI_RECS_SKIP_HOP2:-0}" = "1" ]; then
  echo "[$(date +F_%T)] hop2: SKIPPED (env)"
else
  echo "[$(date +%F_%T)] hop2: upload -> ${ID_REMOTE} (chunk ${CHUNK}, files older than ${STALE_MIN}m)"
  HOP2_TRIES="${PI_RECS_HOP2_TRIES:-6}"
  STALE_S=$((STALE_MIN * 60))
  NOW_S="$(date +%s)"

  # Build the pending list: complete clips only (older than STALE_MIN).
  PENDING="$(mktemp /tmp/pigpulse-pending.XXXXXX)"
  for f in "$CACHE"/seg_*.mp4; do
    [ -f "$f" ] || continue
    mt="$(stat -c %Y "$f" 2>/dev/null || echo 0)"
    [ $((NOW_S - mt)) -ge "$STALE_S" ] || continue
    printf '%s\n' "$f"
  done > "$PENDING"
  NPENDING="$(wc -l < "$PENDING")"
  echo "[$(date +%F_%T)] hop2: $NPENDING clip(s) eligible"

  # Pass-based retry: every pending clip gets one attempt per pass, so a
  # quota 403 on one clip cannot block the others.
  for a in $(seq 1 "$HOP2_TRIES"); do
    [ "$NPENDING" -gt 0 ] || break
    echo "[$(date +%F_%T)] hop2: pass $a/$HOP2_TRIES — $NPENDING clip(s) pending"
    REMAIN="$(mktemp /tmp/pigpulse-remain.XXXXXX)"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      name="$(basename "$f")"
      lsize="$(stat -c %s "$f" 2>/dev/null || echo 0)"
      read -r rsize rmd5 <<EOF
$(remote_meta "$name")
EOF
      if [ "${rsize:-0}" = "$lsize" ] && [ "$lsize" != "0" ]; then
        # Already on Drive at the right size. Confirm content if MD5 is offered.
        if [ "${rmd5:-}" != "-" ] && [ "${rmd5:-}" != "" ]; then
          lmd5="$(md5sum "$f" 2>/dev/null | cut -d' ' -f1)"
          if [ "$lmd5" != "$rmd5" ]; then
            echo "[$(date +%F_%T)] hop2: $name SIZE OK but MD5 differs — re-uploading"
          else
            echo "[$(date +%F_%T)] hop2: $name already on Drive (size+md5 match) — dropping local copy"
            rm -f -- "$f"
            continue
          fi
        else
          echo "[$(date +%F_%T)] hop2: $name already on Drive (size match) — dropping local copy"
          rm -f -- "$f"
          continue
        fi
      fi
      if rclone copyto --drive-chunk-size "$CHUNK" --transfers 1 --tpslimit 6 \
           --tpslimit-burst 6 --contimeout 30s --timeout 600s \
           --retries 3 --low-level-retries 5 --drive-pacer-min-sleep 250ms \
           --drive-pacer-burst 1 "$f" "$ID_REMOTE$name" >/tmp/pigpulse-up.XXXXXX.log 2>&1; then
        read -r vsize vmd5 <<EOF
$(remote_meta "$name")
EOF
        if [ "${vsize:-0}" = "$lsize" ] && [ "$lsize" != "0" ]; then
          if [ "${vmd5:-}" != "-" ] && [ "${vmd5:-}" != "" ]; then
            lmd5="$(md5sum "$f" 2>/dev/null | cut -d' ' -f1)"
            if [ "$lmd5" != "$vmd5" ]; then
              echo "[$(date +%F_%T)] hop2: $name uploaded but MD5 MISMATCH — keeping local copy"
              echo "$f" >> "$REMAIN"
              continue
            fi
          fi
          echo "[$(date +%F_%T)] hop2: $name uploaded+verified ($lsize B) — dropping local copy"
          rm -f -- "$f"
        else
          echo "[$(date +%F_%T)] hop2: $name uploaded but size VERIFY FAILED (drive=${vsize:-?} local=$lsize) — keeping local copy"
          echo "$f" >> "$REMAIN"
        fi
      else
        echo "[$(date +%F_%T)] hop2: $name upload FAILED (rc=$?) — keeping local copy"
        echo "$f" >> "$REMAIN"
      fi
    done < "$PENDING"
    cp -f "$REMAIN" "$PENDING"
    NPENDING="$(wc -l < "$PENDING")"
    rm -f "$REMAIN"
    if [ "$NPENDING" -gt 0 ] && [ "$a" -lt "$HOP2_TRIES" ]; then
      nap=$((45 + RANDOM % 91))
      echo "[$(date +%F_%T)] hop2: pass $a done, $NPENDING still pending; sleeping ${nap}s then retrying"
      sleep "$nap"
    fi
  done
  if [ "$NPENDING" -gt 0 ]; then
    echo "[$(date +%F_%T)] hop2: $NPENDING clip(s) still not on Drive after $HOP2_TRIES pass(es) — local copies KEPT"
  fi
  rm -f "$PENDING"
fi

echo "[$(date +%F_%T)] hop3: prune Pi recs already verified (cache or Drive)"
if [ "$SKIP_HOP3" = "1" ]; then
  echo "[$(date +%F_%T)] hop3: SKIPPED (paused)"
elif [ "${PI_RECS_PRUNE_DISABLE:-0}" = "1" ]; then
  echo "[$(date +%F_%T)] hop3: DISABLED by env"
else
  TMPD="$(mktemp -d /tmp/pigpulse-hop3.XXXXXX)"
  PI_LIST_OK=0
  if sshpass -p capstone $SSHOPTS "$PI_HOST" \
       'cd '"$PI_DIR"' 2>/dev/null || exit 9; for f in seg_*.mp4; do [ -f "$f" ] || continue; printf "%s %s %s\n" "$f" "$(stat -c %s "$f")" "$(stat -c %Y "$f")"; done' \
       > "$TMPD/pi.txt" 2>"$TMPD/pi.err"; then
    PI_LIST_OK=1
  fi
  if [ "$PI_LIST_OK" = "1" ]; then
    find "$CACHE" -maxdepth 1 -name 'seg_*.mp4' -printf '%s %f\n' > "$TMPD/cache.txt" 2>/dev/null
    timeout 120 rclone lsf --files-only --format sp "$ID_REMOTE" > "$TMPD/drive.txt" 2>/dev/null
    : > "$TMPD/kill.txt"
    SUMMARY="$(python3 - "$TMPD" "$PRUNE_AGE_S" <<'PYEOF'
import sys, time
d = sys.argv[1]
age_s = int(sys.argv[2])
def parse_sized(fn):
    out = {}
    try:
        fh = open(fn)
    except OSError:
        return out
    for ln in fh:
        ln = ln.rstrip("\n")
        if not ln:
            continue
        if ";" in ln:
            sz, n = ln.split(";", 1)
            if sz.isdigit():
                out[n] = int(sz)
            continue
        p = ln.split(None, 3)
        if len(p) == 4 and p[0].isdigit():
            out[p[3]] = int(p[0])
        elif len(p) == 2 and p[0].isdigit():
            out[p[1]] = int(p[0])
    return out
pi = {}
for ln in open(d + "/pi.txt"):
    p = ln.split()
    if len(p) == 3 and p[1].isdigit() and p[2].isdigit():
        pi[p[0]] = (int(p[1]), int(p[2]))
cache = parse_sized(d + "/cache.txt")
drive = parse_sized(d + "/drive.txt")
now = time.time()
newest_age = int(now - max(mt for _, mt in pi.values())) if pi else -1
kill = []
kc = kd = 0
for n, (sz, mt) in pi.items():
    if now - mt < age_s:
        continue
    if n in cache and cache[n] == sz:
        kill.append(n); kc += 1
    elif n in drive and drive[n] == sz:
        kill.append(n); kd += 1
with open(d + "/kill.txt", "w") as fh:
    fh.write("\n".join(sorted(kill)) + ("\n" if kill else ""))
print("pi=%d cache=%d drive=%d candidates=%d (cache:%d drive:%d)" % (len(pi), len(cache), len(drive), len(kill), kc, kd))
if newest_age >= 0:
    print("newest Pi clip age: %d min" % (newest_age // 60))
    if newest_age > 2700:
        print("WARNING no new Pi clip for %d min — camera may be offline or not recording" % (newest_age // 60))
if len(drive) == 0:
    print("WARNING drive listing empty — drive-side pruning disabled this run")
PYEOF
)"
    echo "[$(date +%F_%T)] hop3: $SUMMARY"
    if [ ! -s "$TMPD/kill.txt" ]; then
      echo "[$(date +%F_%T)] hop3: nothing safe to prune"
    elif [ "${PI_RECS_PRUNE_DRYRUN:-0}" = "1" ]; then
      echo "[$(date +%F_%T)] hop3: DRYRUN would delete $(wc -l < "$TMPD/kill.txt") files"
    else
      CNT="$(wc -l < "$TMPD/kill.txt")"
      if sshpass -p capstone $SSHOPTS "$PI_HOST" \
           'cat > /tmp/pigpulse-prune.txt; cd '"$PI_DIR"' || exit 9; while IFS= read -r f; do [ -f "$f" ] && rm -f -- "$f"; done < /tmp/pigpulse-prune.txt; echo "clips now: $(ls seg_*.mp4 2>/dev/null | wc -l)"; df -h / | tail -1' \
           < "$TMPD/kill.txt"; then
        echo "[$(date +%F_%T)] hop3: deleted $CNT verified Pi clips"
      else
        echo "[$(date +%F_%T)] hop3: DELETE ssh FAILED — no confirmation, check Pi"
      fi
    fi
  else
    echo "[$(date +%F_%T)] hop3: SKIPPED (Pi unreachable): $(head -c 200 "$TMPD/pi.err" 2>/dev/null | tr '\n' ' ')"
  fi
  rm -rf "$TMPD"
fi

echo "[$(date +%F_%T)] done; cache now: $(du -sh "$CACHE" 2>/dev/null | cut -f1)"
