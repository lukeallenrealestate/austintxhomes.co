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
  const { name, email, phone, message, listing, listingKey, listPrice } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const { sendNewListingsAlert } = require('./services/mailer');
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const price = listPrice ? '$' + Number(listPrice).toLocaleString() : '';
    const propertyUrl = listingKey ? `${siteUrl}/property/${listingKey}` : siteUrl;

    await transporter.sendMail({
      from: `"Austin TX Homes" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      replyTo: `"${name}" <${email}>`,
      subject: `New inquiry: ${listing}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
          <div style="background:#1877F2;padding:20px 28px;">
            <h2 style="color:#fff;margin:0;font-size:20px;">New Contact Form Submission</h2>
          </div>
          <div style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Property</strong><br/>
                <a href="${propertyUrl}" style="color:#1877F2;">${listing}${price ? ' — ' + price : ''}</a>
              </td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Name</strong><br/>${name}
              </td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Email</strong><br/>
                <a href="mailto:${email}" style="color:#1877F2;">${email}</a>
              </td></tr>
              ${phone ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Phone</strong><br/>
                <a href="tel:${phone}" style="color:#1877F2;">${phone}</a>
              </td></tr>` : ''}
              <tr><td style="padding:8px 0;">
                <strong style="color:#374151;">Message</strong><br/>
                <p style="color:#374151;white-space:pre-wrap;margin:4px 0 0;">${message || '(no message)'}</p>
              </td></tr>
            </table>
            <div style="margin-top:20px;">
              <a href="${propertyUrl}" style="display:inline-block;padding:10px 20px;background:#1877F2;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;">View Property</a>
              <a href="mailto:${email}" style="display:inline-block;margin-left:10px;padding:10px 20px;background:#f3f4f6;color:#374151;border-radius:6px;text-decoration:none;font-size:14px;">Reply to ${name}</a>
            </div>
          </div>
        </div>`
    });

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
  syncListings(false).catch(console.error);
  res.json({ message: 'Sync started in background' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  serverStarted = true;
  console.log(`\n🏠 Austin TX Homes IDX running on port ${PORT}`);

  // Check if DB is empty, do initial sync
  const db = require('./db/database');
  const count = db.prepare('SELECT COUNT(*) as n FROM listings').get().n;
  if (count === 0) {
    console.log('[SYNC] Database empty — starting initial import (this may take a while)...');
    syncListings(true).catch(console.error);
  } else {
    console.log(`[SYNC] ${count} listings in DB. Starting incremental sync...`);
    syncListings(false).catch(console.error);
    // Refresh photo URLs in background (they expire ~60-70 min after CDN token issue)
    setTimeout(() => refreshPhotos().catch(console.error), 3000);
  }
});

// Incremental sync every 15 minutes
cron.schedule('*/15 * * * *', () => {
  console.log('[SYNC] Scheduled incremental sync...');
  syncListings(false).catch(console.error);
});

// Bulk photo URL refresh every 45 minutes (CDN tokens expire ~60-70 min after issue)
cron.schedule('*/45 * * * *', () => {
  refreshPhotos().catch(console.error);
});

// Email alerts for saved searches — runs every hour
cron.schedule('0 * * * *', () => {
  runAlertJob().catch(console.error);
});
