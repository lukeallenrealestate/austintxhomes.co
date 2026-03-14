#!/bin/bash
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
cd /home/runner/workspace/idx-search && PORT=3000 node server.js &
cd /home/runner/workspace/austintxhomes && PORT=3002 node server.js
