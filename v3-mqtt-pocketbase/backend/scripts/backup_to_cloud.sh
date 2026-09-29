#!/usr/bin/env bash
# PigPulse — PocketBase SQLite snapshot + optional cloud upload.
#
#   bash ~/scripts/backup_to_cloud.sh          # snapshot + try upload
#
# DEPLOYMENT REALITY: the Pi runs as a standalone access point with NO internet
# (no router uplink), so the upload branch will essentially never fire in the
# field. Snapshots accumulate in backups/pending/ — therefore the retention cap
# below is not optional. It is the only thing standing between a nightly job
# and a full SD card, which would take the whole rig down.
#
# This script is NOT wired to a timer. Run it manually, or add a systemd timer
# (see the header of backend/systemd/ for the unit pattern).
set -euo pipefail

DB_PATH="/home/pigpulse/pocketbase/pb_data/data.db"
BACKUP_DIR="/home/pigpulse/backups"
PENDING_DIR="$BACKUP_DIR/pending"
ARCHIVE_DIR="$BACKUP_DIR/archive"
KEEP_ARCHIVED=7          # local snapshots to retain
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="pigpulse_backup_${TIMESTAMP}.db.gz"

mkdir -p "$PENDING_DIR" "$ARCHIVE_DIR"

if [[ ! -f "$DB_PATH" ]]; then
    echo "[backup] SQLite DB not found at $DB_PATH yet. Skipping."
    exit 0
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[backup] sqlite3 not installed (apt-get install -y sqlite3). Skipping."
    exit 0
fi

# .backup is SQLite's online backup API: it copies a consistent snapshot while
# PocketBase is running, unlike `cp` on a live -wal database.
echo "[backup] creating consistent SQLite snapshot..."
TMP_DB="/tmp/pb_snapshot_${TIMESTAMP}.db"
trap 'rm -f "$TMP_DB"' EXIT
sqlite3 "$DB_PATH" ".backup '$TMP_DB'"

gzip -c "$TMP_DB" > "$PENDING_DIR/$BACKUP_FILE"
echo "[backup] created: $PENDING_DIR/$BACKUP_FILE"

# Retention FIRST, before any network work — an offline Pi must not fill its
# own card waiting for an upload that will never happen.
prune() {
    local dir="$1" keep="$2"
    # newest first, drop everything past $keep
    mapfile -t old < <(ls -1t "$dir"/*.db.gz 2>/dev/null | tail -n "+$((keep + 1))")
    if ((${#old[@]})); then
        echo "[backup] pruning ${#old[@]} old snapshot(s) from $(basename "$dir")"
        rm -f "${old[@]}"
    fi
}
prune "$PENDING_DIR" "$KEEP_ARCHIVED"
prune "$ARCHIVE_DIR" "$KEEP_ARCHIVED"

if ! command -v rclone >/dev/null 2>&1; then
    echo "[backup] rclone not installed — snapshot kept in $PENDING_DIR"
    exit 0
fi

# Reachable-internet test. ICMP is often blocked, so a failed ping alone is not
# proof of offline — let rclone be the authority instead of guessing.
if ! ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    echo "[backup] no route to internet (AP-only deployment) — kept in $PENDING_DIR"
    exit 0
fi

echo "[backup] internet reachable — uploading pending snapshots..."
for f in "$PENDING_DIR"/*.db.gz; do
    [[ -e "$f" ]] || continue
    echo "[backup] uploading $(basename "$f") to gdrive:PigPulse_Backups/"
    if rclone copy "$f" "gdrive:PigPulse_Backups/" --drive-use-trash=false; then
        mv "$f" "$ARCHIVE_DIR/"
        echo "[backup] uploaded + archived"
    else
        echo "[backup] upload failed, kept in pending"
    fi
done
prune "$ARCHIVE_DIR" "$KEEP_ARCHIVED"
