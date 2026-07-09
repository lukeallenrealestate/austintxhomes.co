const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /api/searches
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(rows.map(r => ({ ...r, filters: JSON.parse(r.filters) })));
});

// POST /api/searches
router.post('/', requireAuth, (req, res) => {
  const { name, filters, alert_enabled } = req.body;
  if (!name || !filters) return res.status(400).json({ error: 'Name and filters required' });

  const result = db.prepare('INSERT INTO saved_searches (user_id, name, filters, alert_enabled) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, JSON.stringify(filters), alert_enabled ? 1 : 0);

  res.json({ id: result.lastInsertRowid, name, filters, alert_enabled: alert_enabled ? 1 : 0, created_at: new Date().toISOString() });
});

// PATCH /api/searches/:id/alert — toggle email alerts
router.patch('/:id/alert', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const enabled = req.body.alert_enabled ? 1 : 0;
  db.prepare('UPDATE saved_searches SET alert_enabled = ? WHERE id = ?').run(enabled, req.params.id);
  res.json({ alert_enabled: enabled });
});

// DELETE /api/searches/:id
router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM saved_searches WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
