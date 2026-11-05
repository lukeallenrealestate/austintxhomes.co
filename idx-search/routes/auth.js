const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/authMiddleware');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id, status, activation_token FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      // If this email was already set up by the admin ("pending") and
      // never activated, don't let the public signup clobber it — point
      // the person at the activation flow instead. The invite email they
      // received carries the token; if they lost it, Luke can resend.
      if (existing.status === 'pending') {
        return res.status(409).json({
          error: 'This email was already set up for you by Luke. Check your inbox for the activation link, or ask Luke to resend it.',
          needsActivation: true
        });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const role = email.toLowerCase() === adminEmail.toLowerCase() ? 'admin' : 'user';

    const result = db.prepare(
      'INSERT INTO users (email, password, name, phone, role) VALUES (?, ?, ?, ?, ?)'
    ).run(email.toLowerCase(), hashed, name, phone || null, role);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ token: signToken(user), user: safeUser(user) });

    // Notify admin of new signup (fire-and-forget)
    if (adminEmail && process.env.EMAIL_HOST) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: Number(process.env.EMAIL_PORT) || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        transporter.sendMail({
          from: `"Austin TX Homes" <${process.env.EMAIL_USER}>`,
          to: adminEmail,
          subject: `New signup: ${name}`,
          html: `<p><strong>${name}</strong> (${email.toLowerCase()}${phone ? ', ' + phone : ''}) just created an account on Austin TX Homes.</p>`
        }).catch(e => console.warn('[AUTH] Admin notification failed:', e.message));
      } catch {}
    }
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // Admin-created accounts live as status='pending' until the client
    // visits the activation link and creates a password. A pending row
    // has an empty password hash (bcrypt would still fail-close here,
    // but a dedicated 403 lets the UI route them to /activate).
    if (user.status === 'pending') {
      return res.status(403).json({
        error: 'Luke set up your account but you haven\'t finished signing up yet. Check your email for the activation link, or ask Luke to resend it.',
        needsActivation: true,
        email: user.email
      });
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'This account is disabled. Contact Luke if this is a mistake.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

// PUT /api/auth/me
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
      .run(name, phone || null, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const hashed = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Account activation ──────────────────────────────────────────
// GET /api/auth/activate/:token — look up a pending invite so the
// activation page can show the client's name, who invited them, and
// which saved search is waiting. Returns 410 if the token is expired
// or already consumed.
router.get('/activate/:token', (req, res) => {
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.status, u.activation_expires,
           u.created_by_user_id,
           inviter.name AS invited_by_name
    FROM users u
    LEFT JOIN users inviter ON inviter.id = u.created_by_user_id
    WHERE u.activation_token = ?
  `).get(req.params.token);

  if (!row) return res.status(404).json({ error: 'This activation link is invalid or has already been used.' });
  if (row.status !== 'pending') {
    return res.status(410).json({ error: 'This account has already been activated. Please log in.' });
  }
  if (row.activation_expires && new Date(row.activation_expires) < new Date()) {
    return res.status(410).json({ error: 'This activation link has expired. Ask Luke to send a new one.' });
  }

  // Which saved search(es) were set up for them?
  const searches = db.prepare(`
    SELECT id, name, filters
    FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC
  `).all(row.id).map(s => ({ ...s, filters: tryParseJson(s.filters, {}) }));

  res.json({
    email: row.email,
    name: row.name,
    phone: row.phone,
    invitedBy: row.invited_by_name || 'Luke Allen',
    searches
  });
});

// POST /api/auth/activate/:token — client submits a password. Flips the
// account to active, hashes the password, clears the token, and returns
// a JWT so the page can log them in and redirect to their saved search.
router.post('/activate/:token', async (req, res) => {
  try {
    const { password, name, phone } = req.body || {};
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const row = db.prepare(`SELECT * FROM users WHERE activation_token = ?`).get(req.params.token);
    if (!row) return res.status(404).json({ error: 'This activation link is invalid or has already been used.' });
    if (row.status !== 'pending') {
      return res.status(410).json({ error: 'This account has already been activated. Please log in.' });
    }
    if (row.activation_expires && new Date(row.activation_expires) < new Date()) {
      return res.status(410).json({ error: 'This activation link has expired. Ask Luke to send a new one.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    db.prepare(`
      UPDATE users SET
        password = ?,
        status = 'active',
        activation_token = NULL,
        activation_expires = NULL,
        name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(NULLIF(?, ''), phone),
        last_login = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashed, name || '', phone || '', row.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    const search = db.prepare(
      `SELECT id FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(user.id);

    res.json({
      token: signToken(user),
      user: safeUser(user),
      savedSearchId: search ? search.id : null
    });
  } catch (err) {
    console.error('[AUTH] activate failed:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function tryParseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function safeUser(u) {
  const { password, activation_token, ...safe } = u;
  return safe;
}

module.exports = router;
