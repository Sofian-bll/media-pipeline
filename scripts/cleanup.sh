#!/usr/bin/env bash
set -euo pipefail
INCOMING_DIR="${INCOMING_DIR:-/mnt/nas/incoming}"
RETENTION_HOURS="${RETENTION_HOURS:-24}"
echo "[$(date -Iseconds)] Cleanup: removing files older than ${RETENTION_HOURS}h"
find "$INCOMING_DIR" -maxdepth 1 -type f \( -iname "*.mkv" -o -iname "*.avi" \) -mmin +$((RETENTION_HOURS * 60)) -delete 2>/dev/null
echo "[$(date -Iseconds)] Cleanup done"
