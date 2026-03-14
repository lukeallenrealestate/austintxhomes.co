#!/bin/bash
fuser -k 3000/tcp 2>/dev/null || true
export PORT_BACKUP=$PORT
cd /home/runner/workspace/idx-search && PORT=3000 node server.js &
cd /home/runner/workspace/austintxhomes && PORT=$PORT_BACKUP node server.js
