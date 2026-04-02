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

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
