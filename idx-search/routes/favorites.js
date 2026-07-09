const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /api/favorites — get user's favorite listings
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT l.* FROM favorites f
    JOIN listings l ON l.listing_key = f.listing_key
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);

  res.json(rows.map(r => ({ ...r, photos: tryParse(r.photos, []) })));
});

// GET /api/favorites/keys — just the listing keys (for quick checking)
router.get('/keys', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT listing_key FROM favorites WHERE user_id = ?').all(req.user.id);
  res.json(rows.map(r => r.listing_key));
});

// POST /api/favorites/:listingKey
router.post('/:listingKey', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_key) VALUES (?, ?)')
      .run(req.user.id, req.params.listingKey);
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/favorites/:listingKey
router.delete('/:listingKey', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_key = ?')
    .run(req.user.id, req.params.listingKey);
  res.json({ saved: false });
});

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
