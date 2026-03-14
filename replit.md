# Austin TX Homes — Project Overview

## Architecture

Two Node.js Express servers run together via `start.sh`:

| Server | Port | Purpose |
|--------|------|---------|
| `austintxhomes` | 3002 (→ external port 80) | Main marketing site — neighborhood pages, Deal Radar, static content |
| `idx-search` | 3000 (internal only) | MLS/IDX property search SPA + API |

## How They Connect

- `austintxhomes` proxies `/api/*` and `/property/*` to `idx-search` (port 3000)
- `/search` on `austintxhomes` directly serves the idx-search SPA's `index.html` — **no localhost redirect**
- idx-search JS/CSS assets (`/js/app.js`, `/css/styles.css`, etc.) are served from `idx-search/public/` via a fallback `express.static` in `austintxhomes/server.js`

## Runtime

- Node.js v20 (upgraded from v14)
- `start.sh` kills lingering processes by cwd (`kill_by_dir "idx-search"`) and by port, then cleans up SQLite lock artifacts before starting
- idx-search runs inside a watchdog loop — if it crashes, it restarts automatically after 5 seconds
- `idx-search/server.js` distinguishes pre-startup errors (exits so watchdog can restart) from runtime errors (logs but keeps serving)
- SQLite uses WAL mode + busy_timeout=30000ms for concurrent read/write during MLS sync

## SQLite Locking (Critical)

`node-sqlite3-wasm` implements file locking using `mkdirSync("idx.db.lock")`. When any process is killed with SIGKILL, this directory is never cleaned up, causing "database is locked" on every subsequent startup.

**`start.sh` removes `idx.db.lock/` and any stale journal files before starting idx-search.** The cleanup trap also removes it on shutdown. Never skip this step.

## Key Files

- `start.sh` — startup script, handles port cleanup and process sequencing
- `austintxhomes/server.js` — main site server
- `idx-search/server.js` — IDX search server
- `idx-search/sync/mlsSync.js` — MLS data sync + photo URL refresh
- `austintxhomes/lib/dealRadar/` — Deal Radar scoring engine

## Accessing the App

- **Main site**: Replit dev domain (port 3002 → port 80)
- **IDX search**: `<domain>/search` — served through austintxhomes (no direct port 3000 access required)
- **Do NOT use `localhost:3000`** from external devices — always use the Replit public URL
