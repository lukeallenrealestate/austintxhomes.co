#!/bin/bash

# Kill all node processes whose cwd is under a given directory path
kill_by_dir() {
  local DIR=$1
  for CWD_LINK in /proc/[0-9]*/cwd; do
    local RESOLVED
    RESOLVED=$(readlink "$CWD_LINK" 2>/dev/null)
    if echo "$RESOLVED" | grep -q "$DIR"; then
      local PID
      PID=$(echo "$CWD_LINK" | cut -d'/' -f3)
      echo "Killing PID $PID (cwd: $RESOLVED)"
      kill -9 "$PID" 2>/dev/null || true
    fi
  done
}

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

echo "Stopping old servers..."
kill_by_dir "idx-search"
kill_port 3000
kill_port 3002
sleep 2

# Remove stale SQLite lock and journal artifacts left by previously killed processes.
# node-sqlite3-wasm uses mkdirSync("idx.db.lock") as its mutex; a SIGKILL'd process
# never runs the cleanup, so the directory persists and blocks every future open.
echo "Cleaning up stale SQLite artifacts..."
rm -f  /home/runner/workspace/idx-search/db/idx.db-journal
rm -rf /home/runner/workspace/idx-search/db/idx.db.lock

# Trap to clean up background jobs on exit.
# Also remove the SQLite lock directory so next restart can open the DB immediately.
cleanup() {
  echo "Shutting down..."
  kill_by_dir "idx-search"
  kill $(jobs -p) 2>/dev/null || true
  sleep 1
  rm -rf /home/runner/workspace/idx-search/db/idx.db.lock
}
trap cleanup EXIT INT TERM

# Install dependencies up front
echo "Installing idx-search dependencies..."
(cd /home/runner/workspace/idx-search && npm install --loglevel=error)
echo "Installing austintxhomes dependencies..."
(cd /home/runner/workspace/austintxhomes && npm install --loglevel=error)

# Start idx-search with auto-restart on crash
idx_watchdog() {
  while true; do
    echo "[idx-search] Starting on port 3000..."
    (cd /home/runner/workspace/idx-search && PORT=3000 node server.js)
    EXIT_CODE=$?
    echo "[idx-search] Exited (code $EXIT_CODE) — restarting in 5 seconds..."
    sleep 5
  done
}
idx_watchdog &

# Give idx-search a head start before the frontend begins proxying
sleep 6

# Start austintxhomes frontend on port 3002 (foreground — keeps script alive)
echo "[austintxhomes] Starting on port 3002..."
cd /home/runner/workspace/austintxhomes && PORT=3002 node server.js
