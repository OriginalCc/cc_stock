#!/bin/bash
# Start the Next.js dev server with double-fork daemon for stability
# The double-fork ensures the server survives shell session termination
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

# Kill any existing server on port 3000
fuser -k 3000/tcp 2>/dev/null
sleep 1

# Double-fork daemon pattern
(
  # Intermediate process - exits immediately after spawning the actual server
  (
    # Actual daemon process - runs the server with auto-restart
    while true; do
      echo "[$(date)] Starting Next.js dev server..." >> /tmp/next-restart.log
      npx next dev -p 3000 --turbopack >> /tmp/nextdev.log 2>&1
      EXIT_CODE=$?
      echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..." >> /tmp/next-restart.log
      sleep 3
    done
  ) &
  # Exit intermediate process
  exit 0
) &

# Exit parent
exit 0
