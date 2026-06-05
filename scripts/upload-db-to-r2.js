#!/usr/bin/env node
/**
 * One-time DB migration helper.
 * Uploads idx-search/db/idx.db to your existing Cloudflare R2 bucket at
 * the key "_migration/idx.db" so Render can download it on first boot.
 *
 * Usage:
 *   node scripts/upload-db-to-r2.js
 *
 * Required env vars (same ones your idx-search/.env already has):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *
 * Safe to re-run. Overwrites the previous _migration/idx.db key.
 *
 * After Render successfully boots with the downloaded DB, delete the key
 * to save R2 storage cost — instructions printed at end of upload.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load .env from idx-search if present (same credentials path).
try { require('dotenv').config({ path: path.join(__dirname, '../idx-search/.env') }); } catch {}

const DB_PATH = path.join(__dirname, '../idx-search/db/idx.db');
const KEY = '_migration/idx.db';
const REQUIRED = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

async function main() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`✗ Missing env vars: ${missing.join(', ')}`);
    console.error(`  Tip: export them from idx-search/.env first, or:`);
    console.error(`       set -a; source idx-search/.env; set +a; node scripts/upload-db-to-r2.js`);
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`✗ DB not found at ${DB_PATH}`);
    process.exit(1);
  }
  const stat = fs.statSync(DB_PATH);
  console.log(`▸ Uploading ${DB_PATH} (${fmtBytes(stat.size)}) to r2://${process.env.R2_BUCKET}/${KEY}`);
  console.log(`  This may take 1–5 minutes depending on your upload bandwidth...`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const t0 = Date.now();
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: KEY,
    Body: fs.createReadStream(DB_PATH),
    ContentType: 'application/x-sqlite3',
    ContentLength: stat.size,
  }));
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ Upload complete in ${elapsedSec}s`);
  console.log('');
  console.log(`Render will download this automatically on first boot when DB is missing.`);
  console.log(`After Render is verified working with the new DB, delete it to save R2 storage:`);
  console.log(`  aws s3 rm --endpoint-url=https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com s3://${process.env.R2_BUCKET}/${KEY}`);
  console.log(`Or via the Cloudflare R2 dashboard.`);
}

main().catch(err => { console.error('✗ Upload failed:', err); process.exit(1); });
