// Cloudflare R2 photo storage service (S3-compatible)
// Photos are downloaded from MLS CDN and re-hosted on R2 so browsers
// get them from Cloudflare's global edge network instead of through our server.
//
// Required env vars (all optional — R2 is disabled if absent):
//   R2_ACCOUNT_ID       Cloudflare account ID
//   R2_ACCESS_KEY_ID    R2 API token access key
//   R2_SECRET_ACCESS_KEY R2 API token secret key
//   R2_BUCKET           Bucket name (default: austintxhomes-photos)
//   R2_PUBLIC_URL       Public base URL (e.g. https://photos.austintxhomes.co)

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const db = require('../db/database');

let r2 = null;
const BUCKET = process.env.R2_BUCKET || 'austintxhomes-photos';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('[R2] Cloudflare R2 photo storage enabled →', PUBLIC_URL || '(no public URL set)');
} else {
  console.log('[R2] R2 env vars not set — photo CDN disabled, using local proxy only');
}

function isEnabled() { return r2 !== null && PUBLIC_URL !== ''; }

function photoKey(listingKey, photoIdx) {
  return `photos/${listingKey}/${photoIdx}.jpg`;
}

function publicUrl(listingKey, photoIdx) {
  return `${PUBLIC_URL}/${photoKey(listingKey, photoIdx)}`;
}

// Upload a buffer to R2 and record the public URL in the DB
async function uploadPhoto(listingKey, photoIdx, buffer, contentType) {
  if (!isEnabled()) return null;

  const key = photoKey(listingKey, photoIdx);
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable', // 1 year — photos don't change
  }));

  const url = `${PUBLIC_URL}/${key}`;
  saveR2Url(listingKey, photoIdx, url);
  return url;
}

// Check if an object already exists in R2 (avoids re-uploading)
async function existsInR2(listingKey, photoIdx) {
  if (!isEnabled()) return false;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: photoKey(listingKey, photoIdx) }));
    return true;
  } catch { return false; }
}

// Write the R2 public URL for a single photo index into the DB
function saveR2Url(listingKey, photoIdx, url) {
  const row = db.prepare('SELECT photos_r2, photos FROM listings WHERE listing_key = ?').get(listingKey);
  if (!row) return;
  const r2Photos = tryParse(row.photos_r2, []);
  const totalPhotos = tryParse(row.photos, []).length;
  while (r2Photos.length < totalPhotos) r2Photos.push(null);
  r2Photos[photoIdx] = url;
  db.prepare('UPDATE listings SET photos_r2 = ? WHERE listing_key = ?')
    .run(JSON.stringify(r2Photos), listingKey);
}

function tryParse(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

module.exports = { isEnabled, uploadPhoto, existsInR2, publicUrl, saveR2Url };
