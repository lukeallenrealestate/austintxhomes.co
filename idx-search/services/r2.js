// Cloudflare R2 photo storage service (S3-compatible)
// Photos are downloaded from MLS CDN and re-hosted on R2 so browsers
// get them from Cloudflare's global edge network instead of through our server.
//
// Required env vars (all optional — R2 is disabled if absent):
//   R2_ACCOUNT_ID       Cloudflare account ID
//   R2_ACCESS_KEY_ID    R2 API token access key
//   R2_SECRET_ACCESS_KEY R2 API token secret key
//   R2_BUCKET           Bucket name (default: austintxhomes-photos)
//   R2_PUBLIC_URL       Public base URL (e.g. https://pub-xxx.r2.dev)

// @aws-sdk/client-s3 is large (~30s to load on Replit).
// We lazy-require it on first use so the port opens immediately at startup.

const db = require('../db/database');

const BUCKET = process.env.R2_BUCKET || 'austintxhomes-photos';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

let _r2 = null;       // S3Client instance, created on first use
let _ready = false;   // true once we've tried to init (even if disabled)

function getClient() {
  if (_ready) return _r2;
  _ready = true;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !PUBLIC_URL) {
    console.log('[R2] R2 env vars not set — photo CDN disabled, using local proxy only');
    return null;
  }

  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    _r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    console.log('[R2] Cloudflare R2 photo storage enabled →', PUBLIC_URL);
  } catch (e) {
    console.error('[R2] Failed to init S3Client:', e.message);
  }
  return _r2;
}

function isEnabled() {
  return getClient() !== null && PUBLIC_URL !== '';
}

function photoKey(listingKey, photoIdx) {
  return `photos/${listingKey}/${photoIdx}.jpg`;
}

// Upload a buffer to R2 and record the public URL in the DB
async function uploadPhoto(listingKey, photoIdx, buffer, contentType) {
  const client = getClient();
  if (!client) return null;

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = photoKey(listingKey, photoIdx);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const url = `${PUBLIC_URL}/${key}`;
  saveR2Url(listingKey, photoIdx, url);
  return url;
}

// Write the R2 public URL for a single photo index into the DB
function saveR2Url(listingKey, photoIdx, url) {
  try {
    const row = db.prepare('SELECT photos_r2, photos FROM listings WHERE listing_key = ?').get(listingKey);
    if (!row) return;
    let r2Photos = [];
    try { r2Photos = JSON.parse(row.photos_r2) || []; } catch {}
    if (!Array.isArray(r2Photos)) r2Photos = [];
    const totalPhotos = (() => { try { return (JSON.parse(row.photos) || []).length; } catch { return 0; } })();
    while (r2Photos.length < totalPhotos) r2Photos.push(null);
    r2Photos[photoIdx] = url;
    db.prepare('UPDATE listings SET photos_r2 = ? WHERE listing_key = ?')
      .run(JSON.stringify(r2Photos), listingKey);
  } catch (e) {
    console.warn('[R2] saveR2Url failed:', e.message);
  }
}

// Rebuild photos_r2 by listing the R2 bucket directly. Used after a Replit
// Publish nukes the column. The actual photo files in R2 survive — only the
// DB pointers are lost. Yields between chunks so HTTP traffic isn't starved.
async function recoverR2FromBucket() {
  const BUCKET = process.env.R2_BUCKET || 'austintxhomes-photos';
  const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !PUBLIC_URL) {
    console.error('[R2-RECOVER] R2 env not configured — aborting');
    return { aborted: 'env-missing' };
  }
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  console.log('[R2-RECOVER] Starting bucket scan...');
  const t0 = Date.now();
  const byListing = new Map();
  let token, pageCount = 0, totalKeys = 0;
  do {
    const out = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'photos/', ContinuationToken: token }));
    pageCount++;
    for (const o of (out.Contents || [])) {
      totalKeys++;
      const m = /^photos\/([^/]+)\/(\d+)\.jpg$/.exec(o.Key);
      if (!m) continue;
      const lk = m[1];
      const idx = Number(m[2]);
      let m2 = byListing.get(lk);
      if (!m2) { m2 = {}; byListing.set(lk, m2); }
      m2[idx] = `${PUBLIC_URL}/photos/${lk}/${idx}.jpg`;
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
    if (pageCount % 5 === 0) {
      console.log(`[R2-RECOVER] Scanned page ${pageCount}, ${totalKeys} keys, ${byListing.size} unique listings...`);
    }
  } while (token);

  console.log(`[R2-RECOVER] Scan complete: ${totalKeys} keys across ${byListing.size} listings in ${((Date.now() - t0) / 1000).toFixed(1)}s. Rebuilding DB column...`);
  if (byListing.size === 0) {
    console.log('[R2-RECOVER] R2 bucket is empty — nothing to recover.');
    return { keys: 0, listings: 0, updated: 0 };
  }

  const sel = db.prepare('SELECT photos FROM listings WHERE listing_key = ?');
  const upd = db.prepare('UPDATE listings SET photos_r2 = ? WHERE listing_key = ?');
  let updated = 0, skipped = 0;
  const tx = db.transaction((entries) => {
    for (const [lk, idxMap] of entries) {
      const row = sel.get(lk);
      if (!row) { skipped++; continue; }
      let totalPhotos = 0;
      try { totalPhotos = (JSON.parse(row.photos) || []).length; } catch {}
      if (totalPhotos === 0) {
        totalPhotos = Math.max(...Object.keys(idxMap).map(Number)) + 1;
      }
      const arr = new Array(totalPhotos).fill(null);
      for (const [idx, url] of Object.entries(idxMap)) {
        const i = Number(idx);
        if (i < arr.length) arr[i] = url;
      }
      upd.run(JSON.stringify(arr), lk);
      updated++;
    }
  });

  // 100-row sub-transactions with setImmediate yields keep the event loop
  // free for HTTP traffic during recovery.
  const allEntries = [...byListing.entries()];
  const CHUNK = 100;
  for (let i = 0; i < allEntries.length; i += CHUNK) {
    tx(allEntries.slice(i, i + CHUNK));
    if ((i / CHUNK) % 20 === 0) {
      console.log(`[R2-RECOVER] Updated ${updated} / ${byListing.size} listings...`);
    }
    await new Promise(r => setImmediate(r));
  }

  console.log(`[R2-RECOVER] Done. Updated ${updated} listings (${skipped} R2 keys had no DB row) in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  return { keys: totalKeys, listings: byListing.size, updated, skipped };
}

module.exports = { isEnabled, uploadPhoto, saveR2Url, recoverR2FromBucket };
