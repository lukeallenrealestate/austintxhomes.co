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
    const key = req.params.listingKey;
    const uid = req.user.id;
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_key) VALUES (?, ?)').run(uid, key);
    // Seed the price-drop tracker with the CURRENT list price so the
    // first alert only fires on a real drop below today's price. INSERT
    // OR IGNORE so toggling off + on doesn't reset the baseline higher
    // than what the user has already been alerted about.
    const l = db.prepare('SELECT list_price FROM listings WHERE listing_key = ?').get(key);
    if (l && l.list_price != null) {
      db.prepare(`
        INSERT OR IGNORE INTO favorite_price_sent (user_id, listing_key, last_price_alerted)
        VALUES (?, ?, ?)
      `).run(uid, key, l.list_price);
    }
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/favorites/:listingKey
router.delete('/:listingKey', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_key = ?')
    .run(req.user.id, req.params.listingKey);
  // Keep favorite_price_sent intact. If the user favorites again later
  // we preserve their last alert history so we don't spam them about a
  // drop they already saw.
  res.json({ saved: false });
});

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
