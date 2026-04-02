#!/bin/bash

# Kill processes listening on a specific port
kill_port() {
  local PORT=$1
  local HEX_PORT=$(printf '%04X' "$PORT")
  local INODES
  INODES=$(awk -v p="$HEX_PORT" '
    NR>1 {
      split($2,a,":");
      if (toupper(a[2]) == p && $4 == "0A") print $10
    }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)

  for INODE in $INODES; do
    for FD_PATH in /proc/*/fd/*; do
      if [ -L "$FD_PATH" ]; then
        local TARGET
        TARGET=$(readlink "$FD_PATH" 2>/dev/null)
        if echo "$TARGET" | grep -q "socket:\[$INODE\]"; then
          local PID
          PID=$(echo "$FD_PATH" | cut -d'/' -f3)
          echo "Killing PID $PID holding port $PORT"
          kill -9 "$PID" 2>/dev/null || true
        fi
      fi
    done
  done
}

echo "Stopping old server..."
kill_port 3002
sleep 1

# Remove stale SQLite lock and journal artifacts left by previously killed processes.
echo "Cleaning up stale SQLite artifacts..."
rm -f  /home/runner/workspace/idx-search/db/idx.db-journal
rm -rf /home/runner/workspace/idx-search/db/idx.db.lock

# Trap to clean up on exit.
cleanup() {
  echo "Shutting down..."
  kill $(jobs -p) 2>/dev/null || true
  sleep 1
  rm -rf /home/runner/workspace/idx-search/db/idx.db.lock
}
trap cleanup EXIT INT TERM

# Start the merged server (foreground — keeps script alive)
echo "[server] Starting on port 3002..."
cd /home/runner/workspace/austintxhomes && PORT=3002 node server.js
