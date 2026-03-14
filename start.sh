#!/bin/bash

# Kill any node server.js processes listening on our ports
kill_port() {
  local PORT=$1
  local HEX_PORT=$(printf '%04X' "$PORT")
  # Find inodes listening on this port in /proc/net/tcp and /proc/net/tcp6
  local INODES=$(awk -v p="$HEX_PORT" '
    NR>1 {
      split($2,a,":");
      if (toupper(a[2]) == p && $4 == "0A") print $10
    }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)

  if [ -z "$INODES" ]; then
    return 0
  fi

  for INODE in $INODES; do
    for FD_PATH in /proc/*/fd/*; do
      if [ -L "$FD_PATH" ]; then
        TARGET=$(readlink "$FD_PATH" 2>/dev/null)
        if echo "$TARGET" | grep -q "socket:\[$INODE\]"; then
          PID=$(echo "$FD_PATH" | cut -d'/' -f3)
          echo "Killing PID $PID holding port $PORT"
          kill -9 "$PID" 2>/dev/null || true
        fi
      fi
    done
  done
}

echo "Cleaning up ports 3000 and 3002..."
kill_port 3000
kill_port 3002
sleep 2

# Trap to clean up background jobs when this script exits
cleanup() {
  echo "Shutting down background processes..."
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start idx-search backend on port 3000
echo "Starting idx-search on port 3000..."
(cd /home/runner/workspace/idx-search && npm install --loglevel=error && PORT=3000 node server.js) &

# Give idx-search a moment to bind
sleep 2

# Start austintxhomes frontend on port 3002 (foreground - keeps script alive)
echo "Starting austintxhomes on port 3002..."
cd /home/runner/workspace/austintxhomes && npm install --loglevel=error && PORT=3002 node server.js
