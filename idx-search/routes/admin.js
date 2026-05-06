const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/authMiddleware');
const { syncListings, refreshPhotos } = require('../sync/mlsSync');

// All admin routes require admin role
router.use(requireAdmin);

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const totalListings = db.prepare('SELECT COUNT(*) as n FROM listings WHERE mlg_can_view = 1').get().n;
  const activeListings = db.prepare(`SELECT COUNT(*) as n FROM listings WHERE standard_status = 'Active' AND mlg_can_view = 1`).get().n;
  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users WHERE role = ?').get('user').n;
  const totalFavorites = db.prepare('SELECT COUNT(*) as n FROM favorites').get().n;
  const totalSearches = db.prepare('SELECT COUNT(*) as n FROM saved_searches').get().n;
  const syncState = db.prepare('SELECT * FROM sync_state WHERE id = 1').get();

  res.json({ totalListings, activeListings, totalUsers, totalFavorites, totalSearches, syncState });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at, u.last_login,
      COUNT(DISTINCT f.id) as favorite_count,
      COUNT(DISTINCT s.id) as search_count
    FROM users u
    LEFT JOIN favorites f ON f.user_id = u.id
    LEFT JOIN saved_searches s ON s.user_id = u.id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// GET /api/admin/users/:userId/favorites
router.get('/users/:userId/favorites', (req, res) => {
  const rows = db.prepare(`
    SELECT l.listing_key, l.unparsed_address, l.city, l.list_price,
           l.bedrooms_total, l.bathrooms_total, l.living_area, l.photos,
           l.standard_status, f.created_at as saved_at
    FROM favorites f
    JOIN listings l ON l.listing_key = f.listing_key
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);

  res.json(rows.map(r => ({ ...r, photos: tryParse(r.photos, []) })));
});

// GET /api/admin/users/:userId/searches
router.get('/users/:userId/searches', (req, res) => {
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.params.userId);
  res.json(rows.map(r => ({ ...r, filters: JSON.parse(r.filters) })));
});

// GET /api/admin/activity — recent signups + favorites
router.get('/activity', (req, res) => {
  const newUsers = db.prepare(`
    SELECT id, email, name, created_at FROM users
    WHERE role = 'user' ORDER BY created_at DESC LIMIT 10
  `).all();

  const recentFavorites = db.prepare(`
    SELECT u.name, u.email, l.unparsed_address, l.list_price, f.created_at
    FROM favorites f
    JOIN users u ON u.id = f.user_id
    JOIN listings l ON l.listing_key = f.listing_key
    ORDER BY f.created_at DESC LIMIT 20
  `).all();

  res.json({ newUsers, recentFavorites });
});

// POST /api/admin/sync
router.post('/sync', async (req, res) => {
  const isInitial = req.query.initial === 'true';
  if (isInitial) {
    db.prepare('UPDATE sync_state SET last_sync_timestamp = NULL WHERE id = 1').run();
    console.log('[SYNC] Admin triggered full initial sync');
  }
  syncListings(isInitial).catch(console.error);
  res.json({ message: `${isInitial ? 'Full initial' : 'Incremental'} sync started in background` });
});

// POST /api/admin/refresh-photos
router.post('/refresh-photos', async (_req, res) => {
  refreshPhotos().catch(console.error);
  res.json({ message: 'Photo refresh started in background' });
});

// POST /api/admin/recover-r2-from-bucket
// Rebuilds the listings.photos_r2 column by listing the R2 bucket directly.
// Used after a Replit deploy nukes the column (the photo files in R2 itself
// survive — only the DB pointers are lost). Runs in background; check logs
// for [R2-RECOVER] progress.
router.post('/recover-r2-from-bucket', async (_req, res) => {
  recoverR2FromBucket().catch(e => console.error('[R2-RECOVER] fatal:', e));
  res.json({ message: 'R2 bucket scan + photos_r2 rebuild started in background. Watch logs for [R2-RECOVER] lines.' });
});

async function recoverR2FromBucket() {
  const BUCKET = process.env.R2_BUCKET || 'austintxhomes-photos';
  const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !PUBLIC_URL) {
    console.error('[R2-RECOVER] R2 env not configured — aborting');
    return;
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

  // Build { listing_key: { idx: url, ... } } from R2 keys shaped like photos/{key}/{idx}.jpg
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

  // For each listing the bucket has, build photos_r2 sized to match listings.photos and UPDATE.
  // Skip listings the DB doesn't know about (e.g., listings that left MlgCanView=true since being mirrored).
  const sel = db.prepare('SELECT photos FROM listings WHERE listing_key = ?');
  const upd = db.prepare('UPDATE listings SET photos_r2 = ? WHERE listing_key = ?');

  let updated = 0, skipped = 0, t1 = Date.now();
  const tx = db.transaction((entries) => {
    for (const [lk, idxMap] of entries) {
      const row = sel.get(lk);
      if (!row) { skipped++; continue; }
      let totalPhotos = 0;
      try { totalPhotos = (JSON.parse(row.photos) || []).length; } catch {}
      if (totalPhotos === 0) {
        // No photos array on the listing — fall back to one slot per R2 key found.
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

  // Chunk so we don't hold a single mega-transaction (node-sqlite3-wasm is single-threaded).
  // Yield to the event loop between chunks — without this, ~14 chunks of 500 listings
  // each (1000+ sync SQL ops per chunk) blocked HTTP responses for several minutes
  // and made the public site unreachable while recovery ran.
  const allEntries = [...byListing.entries()];
  const CHUNK = 100;
  for (let i = 0; i < allEntries.length; i += CHUNK) {
    tx(allEntries.slice(i, i + CHUNK));
    if ((i / CHUNK) % 20 === 0) {
      console.log(`[R2-RECOVER] Updated ${updated} / ${byListing.size} listings...`);
    }
    // Yield between chunks so HTTP traffic isn't starved.
    await new Promise(r => setImmediate(r));
  }

  console.log(`[R2-RECOVER] Done. Updated ${updated} listings (${skipped} R2 keys had no DB row) in ${((Date.now() - t1) / 1000).toFixed(1)}s.`);
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
