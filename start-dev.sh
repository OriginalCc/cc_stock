#!/bin/bash
# Auto-restart dev server wrapper
while true; do
  echo "[$(date)] Starting dev server..."
  npx next dev -p 3000 2>&1 | tee /home/z/my-project/dev.log
  EXIT_CODE=$?
  echo "[$(date)] Dev server exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done
