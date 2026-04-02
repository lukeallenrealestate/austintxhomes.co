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

module.exports = { isEnabled, uploadPhoto, saveR2Url };
