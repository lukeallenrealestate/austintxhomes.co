const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

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

function safeUser(u) {
  const { password, ...safe } = u;
  return safe;
}

module.exports = router;
