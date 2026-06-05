#!/usr/bin/env node
/**
 * Render pre-start hook. Runs BEFORE `node austintxhomes/server.js`.
 *
 * What it does:
 *   1. If DB_PATH is set and the file is missing, download idx.db from R2.
 *      This handles the first deploy on Render with a fresh persistent disk.
 *   2. Exits cleanly so the start script can move on to the actual server.
 *
 * Safe to no-op on subsequent boots — once the disk is populated, this just
 * sees the file exists and exits in <100ms.
 *
 * Configured in render.yaml as the first step of the start command:
 *   node scripts/render-boot.js && node austintxhomes/server.js
 */
'use strict';

(async () => {
  try {
    const { bootInit } = require('../idx-search/db/boot-init');
    await bootInit();
    console.log('[render-boot] Pre-start hook complete');
  } catch (err) {
    console.error('[render-boot] Pre-start hook errored:', err.message);
    // Don't exit non-zero — let the server start with whatever state we have.
    // An empty DB is recoverable (MLS sync rebuilds it); a hard exit at this
    // step would mean Render never gets to start the actual server.
  }
})();
