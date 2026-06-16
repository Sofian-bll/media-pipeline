#!/usr/bin/env bash
set -euo pipefail

WATCH_DIR="${WATCH_DIR:-/watch_dir}"
SEEN_FILE="${SEEN_FILE:-/data/seen.txt}"
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-http://n8n:5678/webhook/watcher}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
WATCH_EXTENSIONS="${WATCH_EXTENSIONS:-mkv,avi,mp4}"

# Normalize extensions to pipe-separated regex
IFS=',' read -ra EXTS <<< "$WATCH_EXTENSIONS"
EXT_REGEX=""
for ext in "${EXTS[@]}"; do
  ext=$(echo "$ext" | xargs)
  [ -n "$EXT_REGEX" ] && EXT_REGEX="$EXT_REGEX|"
  EXT_REGEX="$EXT_REGEX\.${ext}$"
done

mkdir -p "$(dirname "$SEEN_FILE")"
touch "$SEEN_FILE"

echo "[$(date -Iseconds)] Watcher started — watching $WATCH_DIR every ${POLL_INTERVAL}s for: $WATCH_EXTENSIONS"

while true; do
  for f in $(find "$WATCH_DIR" -maxdepth 1 -type f 2>/dev/null); do
    # Filter by extension
    if ! echo "$f" | grep -qE "$EXT_REGEX"; then
      continue
    fi

    # Compute hash and path key
    file_hash=$(md5sum "$f" 2>/dev/null | awk '{print $1}' || echo "")
    if [ -z "$file_hash" ]; then
      echo "[$(date -Iseconds)] WARN: Cannot hash $f, skipping"
      continue
    fi
    seen_key="${file_hash}"

    # Skip already seen
    if grep -qFx "$seen_key" "$SEEN_FILE" 2>/dev/null; then
      continue
    fi

    # Get file size
    file_size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)

    # Send webhook
    echo "[$(date -Iseconds)] Detected: $(basename "$f") (${file_size} bytes)"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$N8N_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"event\":\"file.detected\",\"data\":{\"path\":\"$f\",\"size\":$file_size,\"hash\":\"$file_hash\"}}" \
      2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
      echo "$seen_key" >> "$SEEN_FILE"
      echo "[$(date -Iseconds)] Webhook OK (HTTP $HTTP_CODE) — marked as seen"
    else
      echo "[$(date -Iseconds)] Webhook FAILED (HTTP $HTTP_CODE) — will retry next scan"
    fi
  done

  sleep "$POLL_INTERVAL"
done
