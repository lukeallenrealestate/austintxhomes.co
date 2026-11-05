const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/authMiddleware');
const { syncListings, refreshPhotos } = require('../sync/mlsSync');
const crm = require('../services/crm');
const { sendActivationInvite } = require('../services/mailer');

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

// GET /api/admin/users — includes pending (admin-invited) clients so Luke
// can see who hasn't activated yet and resend an invite if needed.
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.role,
           u.created_at, u.last_login, u.status,
           u.activation_token, u.crm_contact_id, u.created_by_user_id,
      COUNT(DISTINCT f.id) as favorite_count,
      COUNT(DISTINCT s.id) as search_count
    FROM users u
    LEFT JOIN favorites f ON f.user_id = u.id
    LEFT JOIN saved_searches s ON s.user_id = u.id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY (u.status = 'pending') DESC, u.created_at DESC
  `).all();

  const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  res.json(users.map(u => ({
    ...u,
    // Only expose the raw token to admins (this route is admin-only).
    // Luke needs it on the UI in case the automated email didn't land
    // and he wants to copy/paste the activation link to the client.
    activationUrl: u.status === 'pending' && u.activation_token
      ? `${siteUrl}/activate?token=${u.activation_token}`
      : null,
    activation_token: undefined
  })));
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
const { recoverR2FromBucket } = require('../services/r2');
router.post('/recover-r2-from-bucket', async (_req, res) => {
  recoverR2FromBucket().catch(e => console.error('[R2-RECOVER] fatal:', e));
  res.json({ message: 'R2 bucket scan + photos_r2 rebuild started in background. Watch logs for [R2-RECOVER] lines.' });
});

// ─── Client management: admin creates/attaches a client ───────────
// GET /api/admin/crm/contacts?q=... — search Realtor-OS contacts for
// the picker in the "Build search for client" modal. Returns a
// configured flag so the UI knows whether to show a picker or just a
// manual-entry form.
router.get('/crm/contacts', async (req, res) => {
  const result = await crm.searchContacts(req.query.q || '');
  res.json(result);
});

// POST /api/admin/clients — create (or reuse) a pending client. Body:
//   { name, email, phone?, crmContactId?, sendInvite? }
// If a user already exists:
//   - status='pending': regenerate the token, bump expiry, resend invite
//   - status='active': return the existing user id so the saved search
//     still lands on the right account (admin can build for existing users)
// Returns { user, activationUrl, resent } — activationUrl is pending-only.
router.post('/clients', async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    const email = (req.body?.email || '').trim().toLowerCase();
    const phone = (req.body?.phone || '').trim() || null;
    const crmContactId = (req.body?.crmContactId || '').trim() || null;
    const sendInvite = req.body?.sendInvite !== false;

    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let user;
    let resent = false;

    if (existing && existing.status === 'active') {
      // Already a real account — just return it so the admin can attach
      // a saved search to this known client without re-inviting them.
      // No activation URL, no invite email.
      user = existing;
    } else if (existing && existing.status === 'pending') {
      // Refresh the invite: new token, new expiry, update profile fields
      // in case Luke corrected the name/phone/CRM link on this run.
      db.prepare(`
        UPDATE users SET
          name = ?, phone = ?, crm_contact_id = COALESCE(?, crm_contact_id),
          activation_token = ?, activation_expires = ?,
          created_by_user_id = COALESCE(created_by_user_id, ?)
        WHERE id = ?
      `).run(name, phone, crmContactId, token, expires, req.user.id, existing.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
      resent = true;
    } else {
      // Brand-new pending account. password is empty-string so a stray
      // bcrypt.compare against it fails fast; status='pending' is the
      // real gate.
      const result = db.prepare(`
        INSERT INTO users (email, password, name, phone, role, status,
                           activation_token, activation_expires,
                           created_by_user_id, crm_contact_id)
        VALUES (?, '', ?, ?, 'user', 'pending', ?, ?, ?, ?)
      `).run(email, name, phone, token, expires, req.user.id, crmContactId);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

      // Fire-and-forget mirror into Realtor-OS. If this succeeds we link
      // the two systems so later edits can stay in sync. A failure here
      // doesn't block anything — Luke still has the client in idx-search.
      if (!crmContactId) {
        crm.createContact({
          name, email, phone,
          source: 'austintxhomes.co admin invite',
          note: `Account created on austintxhomes.co by ${req.user.name || 'admin'} on ${new Date().toISOString().slice(0, 10)}`
        }).then(r => {
          if (r.ok && r.id) {
            db.prepare('UPDATE users SET crm_contact_id = ? WHERE id = ?').run(r.id, user.id);
          }
        }).catch(e => console.warn('[CRM] mirror failed:', e.message));
      }
    }

    const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const activationUrl = user.status === 'pending'
      ? `${siteUrl}/activate?token=${user.activation_token}`
      : null;

    // Send the activation email on fresh invites + resends. Never on an
    // already-active user (we didn't change anything). Awaited so the
    // admin UI knows whether to show "Email sent" vs "Email failed — use
    // the Copy Link button". Previously this was fire-and-forget which
    // bit us on lallenncaa@gmail.com: SMTP silently rejected or Gmail
    // routed it to spam and Luke had no signal either way.
    let emailSent = false;
    let emailError = null;
    if (sendInvite && user.status === 'pending') {
      if (!process.env.EMAIL_HOST) {
        emailError = 'Email not configured on this server';
      } else {
        try {
          await sendActivationInvite({
            to: user.email,
            clientName: user.name,
            inviterName: req.user.name || 'Luke Allen',
            activationUrl
          });
          emailSent = true;
          console.log(`[AUTH] activation email sent to ${user.email}`);
        } catch (e) {
          emailError = e.message || 'Unknown email error';
          console.warn(`[AUTH] activation email to ${user.email} failed:`, emailError);
        }
      }
    }

    res.json({
      user: safeUser(user),
      activationUrl,
      resent,
      invited: sendInvite && user.status === 'pending',
      emailSent,
      emailError
    });
  } catch (err) {
    console.error('[ADMIN] create client failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/clients/:userId/searches — attach a saved search to
// an existing client. Admin builds the filters on /search in "building
// for client" mode and this endpoint persists them with alert_enabled=1
// and created_by_user_id = admin so the alert job BCCs Luke.
router.post('/clients/:userId/searches', (req, res) => {
  const userId = Number(req.params.userId);
  const { name, filters, alert_enabled } = req.body || {};
  if (!name || !filters) return res.status(400).json({ error: 'Name and filters required' });

  const client = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(userId, 'user');
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const result = db.prepare(`
    INSERT INTO saved_searches (user_id, name, filters, alert_enabled, created_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, name, JSON.stringify(filters), alert_enabled === false ? 0 : 1, req.user.id);

  res.json({
    id: result.lastInsertRowid,
    user_id: userId,
    name,
    filters,
    alert_enabled: alert_enabled === false ? 0 : 1,
    created_at: new Date().toISOString()
  });
});

// POST /api/admin/clients/:userId/resend-invite — generate a fresh
// activation token + expiry and email it. Only valid while the account
// is still 'pending'.
router.post('/clients/:userId/resend-invite', async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Client not found' });
  if (row.status !== 'pending') {
    return res.status(409).json({ error: `Account is ${row.status}, not pending.` });
  }
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`UPDATE users SET activation_token = ?, activation_expires = ? WHERE id = ?`)
    .run(token, expires, row.id);

  const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const activationUrl = `${siteUrl}/activate?token=${token}`;

  let emailSent = false;
  let emailError = null;
  if (!process.env.EMAIL_HOST) {
    emailError = 'Email not configured on this server';
  } else {
    try {
      await sendActivationInvite({
        to: row.email,
        clientName: row.name,
        inviterName: req.user.name || 'Luke Allen',
        activationUrl
      });
      emailSent = true;
      console.log(`[AUTH] resend activation email sent to ${row.email}`);
    } catch (e) {
      emailError = e.message || 'Unknown email error';
      console.warn(`[AUTH] resend activation email to ${row.email} failed:`, emailError);
    }
  }

  res.json({ activationUrl, sent: emailSent, emailError });
});

function safeUser(u) {
  if (!u) return u;
  const { password, activation_token, ...safe } = u;
  return safe;
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
