#!/bin/bash
# Start the application server with auto-restart and route warmup
export NODE_OPTIONS="--max-old-space-size=8192"
cd "$(dirname "$0")"

# Increase file descriptor limit (soft limit is 1024, hard limit is 100000)
ulimit -n 65536 2>/dev/null || true

# Build if needed
if [ ! -f ".next/BUILD_ID" ]; then
  echo "Building..."
  npx next build
fi

# Warmup function
warmup() {
  for route in \
    "/" \
    "/api/stock/ashare-quote?symbol=600519" \
    "/api/stock/ashare-timeline?symbol=600519" \
    "/api/stock/strategy" \
    "/api/stock/ashare-sector?symbol=600519&type=full" \
    "/api/stock/ashare-timeline?symbol=399006" \
    "/api/stock/ashare-timeline?symbol=000001.SS" \
    "/api/stock/ashare-timeline?symbol=399001" \
    "/api/stock/search?q=test" \
    "/api/stock/strategy-factors" \
    "/api/stock/strategy-config" \
    "/api/stock/history?symbol=600519"; do
    curl -s -m 5 -o /dev/null "http://localhost:3000${route}" 2>/dev/null
    sleep 1
  done
}

# Auto-restart loop
while true; do
  echo "[$(date +%H:%M:%S)] Starting server..."
  npx next start -p 3000 &
  SERVER_PID=$!
  
  # Wait for server
  for i in $(seq 1 15); do
    if curl -s -m 2 -o /dev/null http://localhost:3000/ 2>/dev/null; then
      break
    fi
    sleep 1
  done
  
  # Warmup
  warmup
  echo "[$(date +%H:%M:%S)] Server ready (PID: $SERVER_PID, FD limit: $(ulimit -n))"
  
  # Monitor
  while kill -0 $SERVER_PID 2>/dev/null; do
    sleep 10
  done
  
  echo "[$(date +%H:%M:%S)] Server died. Restarting in 3 seconds..."
  sleep 3
done
