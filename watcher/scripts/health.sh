#!/usr/bin/env bash
# Minimal HTTP health check server
while true; do
  echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nOK" | nc -l -p 8080 -q 1 2>/dev/null || true
done
