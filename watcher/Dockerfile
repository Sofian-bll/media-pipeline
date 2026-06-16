FROM alpine:latest

RUN apk add --no-cache bash curl coreutils netcat-openbsd

RUN mkdir -p /scripts /data

COPY scripts/watch.sh /scripts/watch.sh
COPY scripts/health.sh /scripts/health.sh
RUN chmod +x /scripts/watch.sh /scripts/health.sh

ENV WATCH_DIR=/watch_dir
ENV SEEN_FILE=/data/seen.txt
ENV POLL_INTERVAL=30
ENV WATCH_EXTENSIONS=mkv,avi,mp4
ENV N8N_WEBHOOK_URL=http://n8n:5678/webhook/watcher

# Start health server in background, then watcher as main process
ENTRYPOINT ["bash", "-c", "/scripts/health.sh & /scripts/watch.sh"]
