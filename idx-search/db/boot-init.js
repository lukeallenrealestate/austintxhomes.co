/**
 * First-boot DB initialization for Render.
 *
 * If DB_PATH (the persistent-disk-mounted SQLite file) doesn't exist on
 * boot, download it from r2://${R2_BUCKET}/_migration/idx.db before
 * better-sqlite3 opens it. After download succeeds, subsequent boots skip
 * this step because the file persists on Render's mounted disk.
 *
 * This module is REQUIRED before database.js. Run it synchronously at the
 * top of server.js BEFORE any `require('idx-search/db/database')`.
 *
 * Behavior:
 *   - DB_PATH not set         → no-op (local dev / Replit, uses in-repo path)
 *   - DB exists               → no-op (Render warm boot)
 *   - DB missing + R2 ready   → download
 *   - DB missing + R2 missing → no-op, better-sqlite3 will create fresh DB
 *                               and MLS sync will populate over ~6-12 hours
 */
'use strict';

const fs = require('fs');
const path = require('path');

const KEY = '_migration/idx.db';

function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

async function downloadFromR2(dbPath) {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(`[boot-init] R2 not configured (${missing.join(', ')} missing) — skipping DB download. SQLite will create fresh DB.`);
    return false;
  }

  const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  // Check if the migration object exists; if not, fall back to fresh DB.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: KEY }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.warn(`[boot-init] No migration object at r2://${process.env.R2_BUCKET}/${KEY} — SQLite will create fresh DB.`);
      return false;
    }
    throw err;
  }

  console.log(`[boot-init] Downloading r2://${process.env.R2_BUCKET}/${KEY} → ${dbPath}`);
  const t0 = Date.now();

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = dbPath + '.downloading';
  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: KEY }));
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    res.Body.pipe(out).on('finish', resolve).on('error', reject);
  });

  // Atomic rename so a crash mid-download never leaves a half-written DB.
  fs.renameSync(tmpPath, dbPath);
  const size = fs.statSync(dbPath).size;
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[boot-init] Downloaded ${fmtBytes(size)} in ${elapsedSec}s`);
  return true;
}

async function bootInit() {
  // Only run on hosts where DB_PATH is explicitly configured (Render).
  // Local dev and Replit use the in-repo default path with no init needed.
  if (!process.env.DB_PATH) return;

  const dbPath = process.env.DB_PATH;
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    console.log(`[boot-init] DB already present at ${dbPath} (${fmtBytes(fs.statSync(dbPath).size)})`);
    return;
  }

  try {
    await downloadFromR2(dbPath);
  } catch (err) {
    console.error('[boot-init] DB download failed:', err.message);
    console.error('[boot-init] Continuing with empty DB — MLS sync will populate over ~6-12 hours');
  }
}

module.exports = { bootInit };
