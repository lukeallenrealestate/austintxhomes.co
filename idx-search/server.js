require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { syncListings, refreshPhotos } = require('./sync/mlsSync');
const { runAlertJob } = require('./services/alertJob');

// Track whether the server has fully started so we know when startup errors are fatal.
let serverStarted = false;

// Exit on errors that occur before the server is up (watchdog will restart us).
// After startup, log but keep running to avoid dropping live traffic.
process.on('uncaughtException', (err) => {
  if (!serverStarted) {
    console.error('[IDX] Fatal startup error — exiting for watchdog restart:', err.message);
    process.exit(1);
  }
  console.error('[IDX] Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  if (!serverStarted) {
    console.error('[IDX] Fatal startup rejection — exiting for watchdog restart:', reason);
    process.exit(1);
  }
  console.error('[IDX] Unhandled promise rejection (server kept alive):', reason);
});

// Ensure photo cache directory exists
fs.mkdirSync(path.join(__dirname, 'cache', 'photos'), { recursive: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/properties', require('./routes/properties'));

// SEO: server-side rendered property pages (/property/:listingKey)
app.use('/property', require('./routes/listing'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/searches', require('./routes/searches'));
app.use('/api/admin', require('./routes/admin'));

// Contact form submission
app.post('/api/contact', async (req, res) => {
  const {
    name, phone, message, listing, listingKey, listPrice,
    budget, timeline, neighborhood, source,
    // commercial form fields
    company, capital, propertyType, strategy, notes, interestedDeal,
    contact  // "Phone or Email" field used by commercial form
  } = req.body;
  // Accept email OR the generic "contact" field (used by commercial RE form)
  const email = req.body.email || contact;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    let rawSiteUrl = process.env.SITE_URL || 'austintxhomes.co';
    if (!rawSiteUrl.startsWith('http')) rawSiteUrl = 'https://' + rawSiteUrl;
    const price = listPrice ? '$' + Number(listPrice).toLocaleString() : '';
    const propertyUrl = listingKey ? `${rawSiteUrl}/property/${listingKey}` : rawSiteUrl;
    const subject = listing
      ? `New inquiry: ${listing}${price ? ' — ' + price : ''}`
      : `New lead from Austin TX Homes${source ? ' (' + source + ')' : ''}`;

    const row = (label, value) => value
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong style="color:#374151;">${label}</strong><br/><span style="color:#374151;">${value}</span></td></tr>`
      : '';

    await transporter.sendMail({
      from: `"Austin TX Homes" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER,
      replyTo: `"${name}" <${email}>`,
      subject,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
          <div style="background:#1877F2;padding:20px 28px;">
            <h2 style="color:#fff;margin:0;font-size:20px;">New Contact Form Submission</h2>
            ${source ? `<p style="color:#c7d9ff;margin:6px 0 0;font-size:13px;">Source: ${source}</p>` : ''}
          </div>
          <div style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${listing ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Property</strong><br/>
                <a href="${propertyUrl}" style="color:#1877F2;">${listing}${price ? ' — ' + price : ''}</a>
              </td></tr>` : ''}
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Name</strong><br/><span style="color:#374151;">${name}</span>
              </td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Email</strong><br/>
                <a href="mailto:${email}" style="color:#1877F2;">${email}</a>
              </td></tr>
              ${phone ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Phone</strong><br/>
                <a href="tel:${phone}" style="color:#1877F2;">${phone}</a>
              </td></tr>` : ''}
              ${row('Company / Fund', company)}
              ${row('Budget', budget)}
              ${row('Capital to Deploy', capital)}
              ${row('Timeline', timeline)}
              ${row('Neighborhood', neighborhood)}
              ${row('Property Type', propertyType)}
              ${row('Investment Strategy', strategy)}
              ${row('Interested Deal', interestedDeal)}
              <tr><td style="padding:8px 0;">
                <strong style="color:#374151;">Message</strong><br/>
                <p style="color:#374151;white-space:pre-wrap;margin:4px 0 0;">${notes || message || '(no message)'}</p>
              </td></tr>
            </table>
            <div style="margin-top:20px;">
              ${listing ? `<a href="${propertyUrl}" style="display:inline-block;padding:10px 20px;background:#1877F2;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;">View Property</a>` : ''}
              <a href="mailto:${email}" style="display:inline-block;${listing ? 'margin-left:10px;' : ''}padding:10px 20px;background:#f3f4f6;color:#374151;border-radius:6px;text-decoration:none;font-size:14px;">Reply to ${name}</a>
            </div>
          </div>
        </div>`
    });

    // If this was a plain HTML form submit, redirect back with success flag
    const isHtmlForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isHtmlForm) return res.redirect(303, (req.headers.referer || '/') + '?submitted=1');
    res.json({ ok: true });
  } catch (err) {
    console.error('[CONTACT]', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// SEO: Dynamic XML sitemap
app.get('/sitemap.xml', (req, res) => {
  const db = require('./db/database');
  const SITE_URL = process.env.SITE_URL || 'https://austintxhomes.co';
  const listings = db.prepare(`
    SELECT listing_key, modification_timestamp
    FROM listings
    WHERE mlg_can_view = 1 AND standard_status = 'Active'
    ORDER BY modification_timestamp DESC
    LIMIT 50000
  `).all();

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/about.html', priority: '0.8', changefreq: 'monthly' },
  ];

  const staticXml = staticPages.map(p => `
  <url>
    <loc>${SITE_URL}${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  const listingXml = listings.map(l => {
    const lastmod = l.modification_timestamp
      ? new Date(l.modification_timestamp).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    return `
  <url>
    <loc>${SITE_URL}/property/${l.listing_key}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }).join('');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${listingXml}
</urlset>`);
});

// Frontend config (Google Maps key is public but restrict domain in Google Cloud Console)
app.get('/api/config', (req, res) => {
  res.json({
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    siteName: 'Austin TX Homes'
  });
});

// Trigger manual sync
app.post('/api/admin/sync', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const isInitial = req.query.initial === 'true';
  if (isInitial) {
    const db = require('./db/database');
    db.prepare('UPDATE sync_state SET last_sync_timestamp = NULL WHERE id = 1').run();
    console.log('[SYNC] Admin triggered full initial sync');
  }
  syncListings(isInitial).catch(console.error);
  res.json({ message: `${isInitial ? 'Full initial' : 'Incremental'} sync started in background` });
});

// Trigger manual photo refresh
app.post('/api/admin/refresh-photos', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  refreshPhotos().catch(console.error);
  res.json({ message: 'Photo refresh started in background' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  serverStarted = true;
  console.log(`\n🏠 Austin TX Homes IDX running on port ${PORT}`);

  // Check if DB has enough data; a partial initial sync (<5000 listings) means a prior
  // startup was interrupted (e.g. by rate-limiting) and we need to restart from scratch.
  const db = require('./db/database');
  const count = db.prepare('SELECT COUNT(*) as n FROM listings').get().n;
  if (count < 5000) {
    console.log(`[SYNC] Only ${count} listings in DB — starting full initial import...`);
    // Clear sync state so syncListings treats this as a fresh start
    db.prepare('UPDATE sync_state SET last_sync_timestamp = NULL WHERE id = 1').run();
    syncListings(true).catch(console.error);
  } else {
    console.log(`[SYNC] ${count} listings in DB. Starting incremental sync...`);
    syncListings(false).catch(console.error);
    // Photo refresh handled by the cron below; skip on startup to avoid OOM
  }
});

// Incremental sync every 30 minutes (reduced from 15 to ease MLS API load)
cron.schedule('*/30 * * * *', () => {
  console.log('[SYNC] Scheduled incremental sync...');
  syncListings(false).catch(console.error);
});

// Bulk photo URL refresh every 60 minutes (reduced from 45, CDN tokens expire ~60-70 min after issue)
// Scheduled at :05 to avoid collision with sync
cron.schedule('5 * * * *', () => {
  refreshPhotos().catch(console.error);
});

// Email alerts for saved searches — runs every hour at :30 to avoid collisions
cron.schedule('30 * * * *', () => {
  runAlertJob().catch(console.error);
});
