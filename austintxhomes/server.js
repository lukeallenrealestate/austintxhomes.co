// Local dev server for austintxhomes pages
// Serves static files from /public and all idx-search routes (merged — no proxy)
const http = require('http');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3002;

// ── Phase 1: Open port IMMEDIATELY ──────────────────────────────────
// Replit kills the process if the port isn't open within 60 seconds.
// Heavy modules (WASM SQLite, templates, etc.) take 30+ seconds to load,
// so we open a bare HTTP server first and swap Express in once ready.
let _expressApp = null;
const _server = http.createServer((req, res) => {
  if (_expressApp) return _expressApp(req, res);
  res.writeHead(200, { 'Content-Type': 'text/html', 'Retry-After': '5' });
  res.end('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"><style>body{font-family:Inter,sans-serif;text-align:center;padding:80px;color:#1a1918}h2{color:#b8935a}</style></head><body><h2>Loading Austin TX Homes...</h2><p>The server is starting up. This page will refresh automatically.</p></body></html>');
});
_server.listen(PORT, () => {
  console.log(`[server] Port ${PORT} open — loading application...`);
});

// ── Phase 2: Load heavy modules ─────────────────────────────────────
const express = require('express');
const compression = require('compression');

// Load email credentials from idx-search .env if present
try {
  const envPath = path.join(__dirname, '../idx-search/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  }
} catch (_) {}

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[MAIN] Uncaught exception:', err.message);
  // Exit immediately on port conflicts so the process manager can restart cleanly
  if (err.code === 'EADDRINUSE') {
    console.error('[MAIN] Port in use — exiting for clean restart');
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] Unhandled promise rejection (server kept alive):', reason);
});

const app = express();
const IDX_SERVER = `http://localhost:${PORT}`; // self-reference for internal HTTP calls
const IDX_PUBLIC = path.join(__dirname, '../idx-search/public');

// MLS sync + alert engine (merged — now runs in this process)
const { syncListings, refreshPhotos, syncClosedLeases, syncClosedSales } = require('../idx-search/sync/mlsSync');
const { runAlertJob } = require('../idx-search/services/alertJob');
const r2Service = require('../idx-search/services/r2');
// Ensure idx-search photo cache directory exists
const PHOTO_CACHE_DIR = path.join(__dirname, '../idx-search/cache/photos');
fs.mkdirSync(PHOTO_CACHE_DIR, { recursive: true });

// Neighborhood page system
const neighborhoods = require('./data/neighborhoods');
const renderNeighborhoodPage = require('./templates/neighborhood');
const renderNeighborhoodHomesPage = require('./templates/neighborhood-homes');
const renderNeighborhoodRealtorPage = require('./templates/neighborhood-realtor');

// Round Rock topical web — separate data + templates for /round-rock/*
const roundRockNeighborhoods = require('./data/round-rock-neighborhoods');
const roundRockTemplates = require('./templates/round-rock');

// Blog system
const renderBlogPost = require('./templates/blog-post');
const renderBlogIndex = require('./templates/blog-index');
let blogPosts = require('./data/blog-posts');

// Weekly generated market reports (prepended to blog feed)
const WEEKLY_REPORTS_FILE = path.join(__dirname, 'data/weekly-reports.json');
let weeklyReports = [];
try { weeklyReports = JSON.parse(fs.readFileSync(WEEKLY_REPORTS_FILE, 'utf8')); } catch (_) {}
const allBlogPosts = () => [...weeklyReports, ...blogPosts];

// Weekly report generator
const generateWeeklyReport = require('./scripts/generate-weekly-report');

// Luxury listing page system (programmatic SEO for $1M+ properties)
const { renderListingPage, enrichListing, slugifyAddress } = require('./templates/listing');
const listingDb = require('../idx-search/db/database');

// Deal Radar engine + alert system
const dealEngine  = require('./lib/dealRadar/dealEngine');
const alertEngine = require('./lib/dealRadar/alertEngine');
const ADMIN_KEY   = process.env.DEAL_RADAR_ADMIN_KEY || 'austin-admin-2026';
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Redirect non-canonical hostnames (e.g. replit.app subdomains) to the real domain
app.use((req, res, next) => {
  const host = req.hostname;
  if (host && host !== 'austintxhomes.co' && host !== 'localhost' && !host.startsWith('127.')) {
    return res.redirect(301, `https://austintxhomes.co${req.originalUrl}`);
  }
  next();
});

// Start scheduled alert checks (2-hour interval, first run after 10 min warmup)
alertEngine.startScheduledChecks(dealEngine.getDeals);

const cron = require('node-cron');

// ── Cash Flow Subscribers ─────────────────────────────────────────────────────
const CASH_FLOW_SUBS_FILE = path.join(__dirname, 'data/cash-flow-subscribers.json');

function loadCashFlowSubs() {
  try { return JSON.parse(fs.readFileSync(CASH_FLOW_SUBS_FILE, 'utf8')); } catch { return []; }
}
function saveCashFlowSubs(subs) {
  fs.mkdirSync(path.dirname(CASH_FLOW_SUBS_FILE), { recursive: true });
  fs.writeFileSync(CASH_FLOW_SUBS_FILE, JSON.stringify(subs, null, 2));
}

// Weekly market report — every Monday at 9:00am CDT (14:00 UTC)
// Generates GBP blurb + full blog post from live MLS data, emails to Luke
cron.schedule('0 14 * * 1', async () => {
  console.log('[WeeklyReport] Starting Monday morning report generation...');
  try {
    const post = await generateWeeklyReport(weeklyReports);
    if (post) console.log(`[WeeklyReport] Done — published /blog/${post.slug}`);
  } catch (e) {
    console.error('[WeeklyReport] Cron failed:', e.message);
    // Notify Luke so a missed week is never invisible again
    try {
      const nodemailer = require('nodemailer');
      const transport = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      await transport.sendMail({
        from: `"Austin TX Homes" <${process.env.EMAIL_USER}>`,
        to: 'Luke@austinmdg.com',
        subject: 'Weekly Market Report Failed',
        text: `The Monday weekly market report cron failed.\n\nError: ${e.message}\n\nManual trigger:\ncurl -X POST https://austintxhomes.co/api/weekly-report/generate -H "x-admin-key: ${process.env.DEAL_RADAR_ADMIN_KEY || 'austin-admin-2026'}"`
      });
    } catch (mailErr) {
      console.error('[WeeklyReport] Failure notification also failed:', mailErr.message);
    }
  }
});

// Daily cash flow alert — 8:30am CDT (13:30 UTC)
cron.schedule('30 13 * * *', async () => {
  const subs = loadCashFlowSubs();
  if (!subs.length) return;
  try {
    const r = await fetch(`${IDX_SERVER}/api/properties/cash-flowing`);
    const data = await r.json();
    if (!data.listings?.length) return;
    const top10 = data.listings.slice(0, 10);
    const listingsHtml = top10.map(l => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee">
          <strong>${l.unparsed_address}</strong><br>
          <span style="color:#888">$${l.list_price.toLocaleString()} · ${l.bedrooms_total}bd/${l.bathrooms_total}ba</span><br>
          Monthly mortgage: $${l.monthlyMortgage.toLocaleString()}<br>
          <span style="color:#2a7a2a;font-weight:600">Best nearby rent (${l.compCount} comps): $${l.bestNearbyRent.toLocaleString()}/mo · Cash flow: +$${l.cashFlowMargin.toLocaleString()}/mo</span>
        </td>
      </tr>`).join('');
    for (const sub of subs) {
      if (!process.env.SENDGRID_API_KEY) break;
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [{ email: sub.email }],
          from: { email: process.env.EMAIL_FROM || 'luke@austintxhomes.co', name: 'Luke Allen · AustinTXHomes' },
          subject: `${data.count} Cash-Flowing Properties in Austin Today`,
          html: `<h2>Today's Cash-Flowing Austin Properties</h2>
                 <p>Properties where nearby rents exceed your estimated mortgage payment (20% down, ${data.mortgageRate}% rate).</p>
                 <table style="width:100%;font-family:sans-serif;font-size:14px">${listingsHtml}</table>
                 <p><a href="https://austintxhomes.co/cash-flowing-properties-austin">View all ${data.count} properties →</a></p>
                 <p style="font-size:11px;color:#aaa"><a href="https://austintxhomes.co/cash-flow-unsubscribe/${sub.id}">Unsubscribe</a></p>`
        })
      });
    }
    console.log(`[CashFlow] Emailed ${subs.length} subscribers (${data.count} properties)`);
  } catch (e) {
    console.error('[CashFlow] Daily email failed:', e.message);
  }
});

// MLS incremental sync every 30 minutes
cron.schedule('*/30 * * * *', () => {
  console.log('[SYNC] Scheduled incremental sync...');
  syncListings(false).catch(console.error);
});

// Closed lease comp sync — daily at 2:00am CDT (7:00 UTC) to keep cash-flow data fresh
cron.schedule('0 7 * * *', () => {
  console.log('[LEASE-SYNC] Daily closed lease comp sync...');
  syncClosedLeases().catch(console.error);
});

// Closed sale comp sync — daily at 2:30am CDT (7:30 UTC) for market report stats
cron.schedule('30 7 * * *', () => {
  console.log('[SALES-SYNC] Daily closed sale comp sync...');
  syncClosedSales().catch(console.error);
});

// Bulk photo URL refresh — once daily at 3:05am CDT (8:05 UTC).
// This takes 8-10 minutes and fetches 73 pages from MLS API.
// Running it hourly was crushing the server with API calls + socket hang ups.
cron.schedule('5 8 * * *', () => {
  refreshPhotos().catch(console.error);
});

// Email alerts for saved searches — every hour at :30
cron.schedule('30 * * * *', () => {
  runAlertJob().catch(console.error);
});

// Monthly scraper — runs on the 1st of each month at 7:00am server time
cron.schedule('0 7 1 * *', () => {
  const { execFile } = require('child_process');
  const scraperPath = path.join(__dirname, 'scripts/update-sienna-floorplans.js');
  console.log('[cron] Running Sienna floor plan scraper...');
  execFile(process.execPath, [scraperPath], { cwd: __dirname }, (err, stdout, stderr) => {
    siennaCache = null;
    siennaCacheTime = 0;
    if (err) {
      console.error('[cron] Sienna scraper failed:', err.message);
    } else {
      console.log('[cron] Sienna scraper complete:', stdout.trim().split('\n').pop());
    }
  });
});

// ── Cash Flow Subscriber API (must come BEFORE the generic /api proxy) ───────
app.post('/api/cash-flow/subscribe', express.json(), (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  const subs = loadCashFlowSubs();
  if (subs.find(s => s.email === email.toLowerCase())) return res.json({ ok: true, already: true });
  const id = Math.random().toString(36).slice(2);
  subs.push({ id, email: email.toLowerCase(), createdAt: new Date().toISOString() });
  saveCashFlowSubs(subs);
  res.json({ ok: true, id });
});

app.delete('/api/cash-flow/subscribe/:id', (req, res) => {
  const subs = loadCashFlowSubs().filter(s => s.id !== req.params.id);
  saveCashFlowSubs(subs);
  res.json({ ok: true });
});

// ── Weekly report manual trigger (must come BEFORE the generic /api proxy) ───
app.post('/api/weekly-report/generate', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const post = await generateWeeklyReport(weeklyReports);
    if (!post) return res.status(503).json({ error: 'No MLS data available — is the idx-search server running?' });
    res.json({ ok: true, slug: post.slug, url: `https://austintxhomes.co/blog/${post.slug}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Deal Radar API routes (must come BEFORE the generic /api proxy) ──────────

// GET /api/deal-radar/settings — return current scoring config (admin)
app.get('/api/deal-radar/settings', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json(dealEngine.getConfig());
});

// POST /api/deal-radar/settings — save scoring config and clear cache (admin)
app.post('/api/deal-radar/settings', express.json(), (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    dealEngine.saveSettings(req.body);
    res.json({ ok: true, message: 'Settings saved and cache cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deal-radar — scored listing feed with filters + pagination
app.get('/api/deal-radar', async (req, res) => {
  try {
    const q = req.query;
    const result = await dealEngine.getDeals({
      minScore:     q.minScore  ? Number(q.minScore)  : undefined,
      maxPrice:     q.maxPrice  ? Number(q.maxPrice)  : undefined,
      minPrice:     q.minPrice  ? Number(q.minPrice)  : undefined,
      city:         q.city      || undefined,
      subType:      q.subType   || undefined,
      badgeType:    q.badgeType || undefined,
      cashFlowOnly: q.cashFlow === 'positive',
      page:         q.page      ? Number(q.page)      : 1,
      limit:        q.limit     ? Math.min(Number(q.limit), 48) : 24,
    });
    res.json(result);
  } catch (e) {
    console.error('[Deal Radar] API error:', e.message);
    res.status(500).json({ error: 'Deal Radar scoring engine error', message: e.message });
  }
});

// GET /api/deal-radar/config — public config (Mapbox token etc.) for frontend
app.get('/api/deal-radar/config', (_req, res) => {
  res.json({ mapboxToken: process.env.MAPBOX_PUBLIC_TOKEN || '' });
});

// GET /api/deal-radar/pins — lightweight pin data for map view
app.get('/api/deal-radar/pins', async (req, res) => {
  try {
    const q = req.query;
    const pins = await dealEngine.getDealsForMap({
      minScore:     q.minScore  ? Number(q.minScore)  : undefined,
      maxPrice:     q.maxPrice  ? Number(q.maxPrice)  : undefined,
      minPrice:     q.minPrice  ? Number(q.minPrice)  : undefined,
      city:         q.city      || undefined,
      subType:      q.subType   || undefined,
      badgeType:    q.badgeType || undefined,
      cashFlowOnly: q.cashFlow === 'positive',
    });
    res.json(pins);
  } catch (e) {
    console.error('[Deal Radar] Pins error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/deal-radar/alerts — create a new alert
app.post('/api/deal-radar/alerts', express.json(), async (req, res) => {
  try {
    const { email, label, filters } = req.body;
    if (!email || !filters) return res.status(400).json({ error: 'email and filters required' });
    const alert = alertEngine.createAlert({ email, label, filters });
    res.json({ ok: true, alert });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/deal-radar/alerts?email=... — list alerts for an email address
app.get('/api/deal-radar/alerts', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json(alertEngine.getAlertsByEmail(email));
});

// DELETE /api/deal-radar/alerts/:id — remove an alert
app.delete('/api/deal-radar/alerts/:id', (req, res) => {
  const deleted = alertEngine.deleteAlert(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Alert not found' });
  res.json({ ok: true });
});

// GET /api/deal-radar/:id — full scored detail for one listing
app.get('/api/deal-radar/:id', async (req, res) => {
  try {
    const deal = await dealEngine.getDeal(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Listing not found in Deal Radar' });
    res.json(deal);
  } catch (e) {
    console.error('[Deal Radar] Detail error:', e.message);
    res.status(500).json({ error: 'Deal Radar error', message: e.message });
  }
});

// ── End Deal Radar API ───────────────────────────────────────────────────────

// /search serves the idx-search SPA directly (no localhost redirect)
app.get('/search', (_req, res) => {
  res.sendFile(path.join(IDX_PUBLIC, 'index.html'));
});

// /account — logged-in users' dashboard (saved searches, favorites)
app.get('/account', (_req, res) => {
  res.sendFile(path.join(IDX_PUBLIC, 'account.html'));
});

// Sienna at the Thompson floor plans — reads JSON file, cached 1 hour
let siennaCache = null;
let siennaCacheTime = 0;

app.get('/api/sienna-floorplans', (_req, res) => {
  try {
    if (siennaCache && (Date.now() - siennaCacheTime) < 3600000) {
      return res.json(siennaCache);
    }
    const filePath = path.join(__dirname, 'data/sienna-floorplans.json');
    const data = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    siennaCache = data;
    siennaCacheTime = Date.now();
    res.json(data);
  } catch (e) {
    if (siennaCache) return res.json(siennaCache);
    res.status(500).json({ error: 'Floor plan data unavailable', plans: [], lastUpdated: null });
  }
});

// Market stats endpoint — computed from live MLS data, cached 1 hour
let marketStatsCache = null;
let marketStatsCacheTime = 0;

function fetchJSON(url) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

app.get('/api/market-stats', async (_req, res) => {
  try {
    // Serve cached stats if fresh (< 1 hour)
    if (marketStatsCache && (Date.now() - marketStatsCacheTime) < 3600000) {
      return res.json(marketStatsCache);
    }

    // Austin metro cities (Travis, Williamson, Hays, Bastrop counties — excludes Temple, Killeen, New Braunfels, etc.)
    const AUSTIN_METRO_CITIES = [
      'Austin','Round Rock','Georgetown','Cedar Park','Leander','Pflugerville',
      'Kyle','Buda','San Marcos','Bastrop','Manor','Hutto','Taylor','Del Valle',
      'Lakeway','Bee Cave','Dripping Springs','Wimberley','Buda','Lockhart',
      'Elgin','Liberty Hill','Jarrell','Spicewood','Lago Vista','Driftwood',
      'Manchaca','Bee Cave','Westlake Hills','West Lake Hills','Rollingwood',
      'Sunset Valley','Jonestown','Volente','Hudson Bend','Briarcliff','Rob Roy'
    ].join(',');

    // Fetch a large sample for accurate stats (Austin metro only)
    const data = await fetchJSON(`${IDX_SERVER}/api/properties/search?limit=2000&status=Active&property_type=Residential&city=${encodeURIComponent(AUSTIN_METRO_CITIES)}`);
    const all = (data.listings || []).filter(l => l.list_price > 50000);
    const prices = all.map(l => l.list_price).sort((a, b) => a - b);
    const total  = data.total || all.length;

    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const avg    = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;

    // Price tiers
    const tiers = { under400: 0, t400to600: 0, t600to900: 0, t900to1500: 0, over1500: 0 };
    for (const p of prices) {
      if (p < 400000)       tiers.under400++;
      else if (p < 600000)  tiers.t400to600++;
      else if (p < 900000)  tiers.t600to900++;
      else if (p < 1500000) tiers.t900to1500++;
      else                  tiers.over1500++;
    }

    // City breakdown (top cities)
    const cityMap = {};
    for (const l of all) {
      const c = l.city || 'Other';
      cityMap[c] = (cityMap[c] || 0) + 1;
    }
    const topCities = Object.entries(cityMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([city, count]) => ({ city, count }));

    // Property sub-types
    const newConstruction = all.filter(l => l.new_construction_yn).length;
    const condos = all.filter(l => /condo|townhouse/i.test(l.property_sub_type || '')).length;
    const singleFamily = all.filter(l => /single family/i.test(l.property_sub_type || '')).length;

    // % under $500K
    const under500k = prices.filter(p => p < 500000).length;
    const pctUnder500 = prices.length ? Math.round((under500k / prices.length) * 100) : 0;

    const stats = {
      totalActive: total,
      sampleSize: all.length,
      medianPrice: median,
      avgPrice: avg,
      avgDom: 38, // industry-reported Austin average for 2025-26
      pctUnder500,
      tiers,
      topCities,
      newConstruction,
      condos,
      singleFamily,
      updated: new Date().toISOString()
    };

    marketStatsCache = stats;
    marketStatsCacheTime = Date.now();
    res.json(stats);
  } catch (e) {
    // Return cached data if available, else fallback
    if (marketStatsCache) return res.json(marketStatsCache);
    res.json({ totalActive: 0, medianPrice: 0, avgPrice: 0, avgDom: 0, error: true });
  }
});

// Multifamily market stats — cached 1 hour
let mfStatsCache = null, mfStatsCacheTime = 0;
app.get('/api/multifamily-stats', async (_req, res) => {
  try {
    if (mfStatsCache && (Date.now() - mfStatsCacheTime) < 3600000) return res.json(mfStatsCache);

    const db = listingDb;

    // Multifamily sub-type match — covers the actual values in our DB
    // (Residential Income, Duplex, Triplex, Quadruplex, Apartment, Multi-Family)
    const mfFilter = `(
      property_sub_type LIKE '%Multi%' OR property_sub_type LIKE '%Duplex%'
      OR property_sub_type LIKE '%Triplex%' OR property_sub_type LIKE '%Quadruplex%'
      OR property_sub_type LIKE '%Fourplex%' OR property_sub_type LIKE '%Apartment%'
      OR property_type LIKE '%Multi%' OR property_type LIKE '%Income%'
    )`;

    // Active multifamily for sale
    const active = db.prepare(`
      SELECT list_price, bedrooms_total, bathrooms_total, living_area, lot_size_sqft,
             days_on_market, city, property_sub_type, listing_contract_date, unparsed_address
      FROM listings
      WHERE mlg_can_view = 1 AND standard_status = 'Active'
        AND property_type NOT LIKE '%Lease%'
        AND ${mfFilter}
        AND list_price > 50000
        AND latitude IS NOT NULL
      ORDER BY listing_contract_date DESC
    `).all();

    // Closed multifamily sales — comes from syncClosedSales.
    // Filter last 180 days by close_date (or fall back to all Closed if close_date is null).
    const closed = db.prepare(`
      SELECT close_price, close_date, days_on_market, city, list_price, listing_contract_date
      FROM listings
      WHERE standard_status = 'Closed'
        AND property_type NOT LIKE '%Lease%'
        AND ${mfFilter}
        AND (close_date IS NULL OR close_date >= date('now', '-180 days'))
    `).all();

    const prices = active.map(l => l.list_price).sort((a, b) => a - b);
    const closedPrices = closed.map(l => l.close_price || l.list_price).filter(Boolean).sort((a, b) => a - b);

    // DOM for active: our sync doesn't populate days_on_market, so compute from listing_contract_date
    const today = Date.now();
    const activeDom = active
      .map(l => l.listing_contract_date ? Math.floor((today - new Date(l.listing_contract_date).getTime()) / 86400000) : null)
      .filter(d => d != null && d >= 0 && d < 730); // cap at 2 years to ignore stale data
    const domValues = activeDom;

    // Price tiers
    const tiers = { under500: 0, t500to750: 0, t750to1m: 0, t1mto2m: 0, over2m: 0 };
    for (const p of prices) {
      if (p < 500000) tiers.under500++;
      else if (p < 750000) tiers.t500to750++;
      else if (p < 1000000) tiers.t750to1m++;
      else if (p < 2000000) tiers.t1mto2m++;
      else tiers.over2m++;
    }

    // City breakdown
    const cityMap = {};
    for (const l of active) { const c = l.city || 'Other'; cityMap[c] = (cityMap[c] || 0) + 1; }
    const topCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([city, count]) => ({ city, count }));

    // Sale-to-list ratio — only meaningful when we have *actual* close prices distinct
    // from list prices. ACTRIS IDX feed doesn't expose ClosePrice, so close_price is
    // populated as a fallback from list_price — which would make every ratio = 100%.
    // Only compute it if we see real variance (i.e., at least one row where
    // close_price != list_price).
    const realClosings = closed.filter(l => l.list_price > 0 && l.close_price > 0 && l.close_price !== l.list_price);
    const avgRatio = realClosings.length >= 5
      ? (realClosings.reduce((s, l) => s + l.close_price / l.list_price, 0) / realClosings.length * 100).toFixed(1)
      : null;

    // Closed DOM — same fallback: compute from listing_contract_date if days_on_market is null
    const closedDom = closed
      .map(l => l.days_on_market != null ? l.days_on_market :
        (l.listing_contract_date ? Math.floor((today - new Date(l.listing_contract_date).getTime()) / 86400000) : null))
      .filter(d => d != null && d >= 0 && d < 730);

    const stats = {
      totalActive: active.length,
      medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      avgPrice: prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0,
      avgDom: domValues.length ? Math.round(domValues.reduce((s, d) => s + d, 0) / domValues.length) : 0,
      tiers,
      topCities,
      closedCount: closed.length,
      closedMedian: closedPrices.length ? closedPrices[Math.floor(closedPrices.length / 2)] : 0,
      closedAvgDom: closedDom.length ? Math.round(closedDom.reduce((s, d) => s + d, 0) / closedDom.length) : 0,
      saleToListRatio: avgRatio,
      updated: new Date().toISOString()
    };

    mfStatsCache = stats;
    mfStatsCacheTime = Date.now();
    res.json(stats);
  } catch (e) {
    console.error('[MF-STATS]', e.message);
    if (mfStatsCache) return res.json(mfStatsCache);
    res.json({ totalActive: 0, medianPrice: 0, error: true });
  }
});

// Manual trigger for closed lease comp sync (admin only)
app.post('/api/admin/sync-lease-comps', (req, res) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'Forbidden' });
  syncClosedLeases()
    .then(() => res.json({ ok: true, message: 'Closed lease sync started' }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// ── idx-search routes (merged — no longer proxied) ───────────────────────────
app.use('/api/properties', require('../idx-search/routes/properties'));
app.use('/property',       require('../idx-search/routes/listing'));
app.use('/api/auth',       require('../idx-search/routes/auth'));
app.use('/api/favorites',  require('../idx-search/routes/favorites'));
app.use('/api/searches',   require('../idx-search/routes/searches'));
app.use('/api/admin',      require('../idx-search/routes/admin'));
app.use('/api/admin-cms',  require('./routes/admin-cms'));
app.use('/api/contact',    require('../idx-search/routes/contact'));

// /api/listings — alias for /api/properties/search used by marketing-site pages
app.get('/api/listings', (req, res) => {
  const q = { ...req.query };
  if (q.offset !== undefined && q.limit) {
    q.page = Math.max(1, Math.floor(Number(q.offset) / Number(q.limit)) + 1);
    delete q.offset;
  }
  if (q.sort && !q.sortBy) { q.sortBy = q.sort; delete q.sort; }
  if (q.q && !q.keyword)   { q.keyword = q.q;   delete q.q;   }
  req.url = '/search?' + new URLSearchParams(q).toString();
  require('../idx-search/routes/properties')(req, res, (err) => {
    if (err) res.status(500).json({ error: err.message });
  });
});

// /api/config — frontend config (Google Maps key etc.)
app.get('/api/config', (_req, res) => {
  res.json({ googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '', siteName: 'Austin TX Homes' });
});

// Homepage route
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/site/home.html'));
});

// Clean URLs for main pages
app.get('/about',         (_req, res) => res.sendFile(path.join(__dirname, 'public/site/about.html')));
app.get('/sell',                    (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell.html')));
app.get('/what-is-my-home-worth',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/what-is-my-home-worth.html')));
app.get('/sell-midcentury-modern-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-midcentury-modern-home-austin.html')));
app.get('/sell-ranch-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-ranch-home-austin.html')));
app.get('/sell-craftsman-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-craftsman-home-austin.html')));
app.get('/sell-contemporary-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-contemporary-home-austin.html')));
app.get('/sell-victorian-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-victorian-home-austin.html')));
app.get('/sell-mediterranean-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-mediterranean-home-austin.html')));
app.get('/sell-colonial-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-colonial-home-austin.html')));
app.get('/sell-townhome-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-townhome-austin.html')));
app.get('/sell-condo-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-condo-austin.html')));
app.get('/sell-luxury-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-luxury-home-austin.html')));
app.get('/sell-luxury-home-westlake', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-luxury-home-westlake.html')));
app.get('/sell-luxury-home-tarrytown', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-luxury-home-tarrytown.html')));
app.get('/sell-luxury-home-barton-creek', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-luxury-home-barton-creek.html')));
app.get('/sell-home-over-2-million-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-over-2-million-austin.html')));
app.get('/sell-waterfront-home-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-waterfront-home-austin.html')));
app.get('/driftwood-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/driftwood-tx.html')));
app.get('/lago-vista-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/lago-vista-tx.html')));
app.get('/briarcliff-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/briarcliff-tx.html')));
app.get('/spicewood-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/spicewood-tx.html')));
app.get('/rob-roy-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/rob-roy-austin.html')));
app.get('/steiner-ranch-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/steiner-ranch-austin.html')));
app.get('/lakeway-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/lakeway-tx.html')));
app.get('/bee-cave-tx', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/bee-cave-tx.html')));
app.get('/1031-exchange-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/1031-exchange-austin.html')));
app.get('/brrrr-method-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/brrrr-method-austin.html')));
app.get('/homes-with-pool-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-with-pool-austin.html')));
app.get('/rental-properties-for-sale-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/rental-properties-for-sale-austin.html')));
app.get('/cash-flowing-properties-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/cash-flowing-properties-austin.html')));
app.get('/buy',           (_req, res) => res.sendFile(path.join(__dirname, 'public/site/buy.html')));
app.get('/rentals',       (_req, res) => res.sendFile(path.join(__dirname, 'public/site/rentals.html')));
app.get('/neighborhoods',     (_req, res) => res.sendFile(path.join(__dirname, 'public/site/neighborhoods.html')));
app.get('/moving-to-austin',  (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-to-austin.html')));
app.get('/market-report',     (_req, res) => res.sendFile(path.join(__dirname, 'public/site/market-report.html')));
app.get('/austin-multifamily-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-multifamily-market-report.html')));
app.get('/new-construction',  (_req, res) => res.sendFile(path.join(__dirname, 'public/site/new-construction.html')));
app.get('/first-time-buyers', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/first-time-buyers.html')));
app.get('/investment-properties', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/investment-properties.html')));
app.get('/luxury-homes',          (_req, res) => res.sendFile(path.join(__dirname, 'public/site/luxury-homes.html')));
app.get('/condos',                (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos.html')));
app.get('/cost-of-living',        (_req, res) => res.sendFile(path.join(__dirname, 'public/site/cost-of-living.html')));
app.get('/tesla-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/tesla-austin-relocation.html')));
app.get('/apartments-near-tesla-gigafactory-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/apartments-near-tesla-gigafactory-austin.html')));
app.get('/apple-austin-relocation',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/apple-austin-relocation.html')));
app.get('/samsung-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/samsung-austin-relocation.html')));
app.get('/dell-austin-relocation',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/dell-austin-relocation.html')));
app.get('/ibm-austin-relocation',    (_req, res) => res.sendFile(path.join(__dirname, 'public/site/ibm-austin-relocation.html')));
app.get('/oracle-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/oracle-austin-relocation.html')));
app.get('/google-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/google-austin-relocation.html')));
app.get('/indeed-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/indeed-austin-relocation.html')));
app.get('/amd-austin-relocation',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/amd-austin-relocation.html')));
app.get('/amazon-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/amazon-austin-relocation.html')));
app.get('/meta-austin-relocation',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/meta-austin-relocation.html')));
app.get('/nvidia-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/nvidia-austin-relocation.html')));
app.get('/salesforce-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/salesforce-austin-relocation.html')));
app.get('/schwab-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/schwab-austin-relocation.html')));
// City relocation guides — SEO-optimized "moving-from" slugs
app.get('/moving-from-los-angeles-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-los-angeles-to-austin.html')));
app.get('/moving-from-new-york-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-new-york-to-austin.html')));
app.get('/moving-from-chicago-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-chicago-to-austin.html')));
app.get('/moving-from-seattle-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-seattle-to-austin.html')));
app.get('/moving-from-denver-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-denver-to-austin.html')));
app.get('/moving-from-dc-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-dc-to-austin.html')));
app.get('/moving-from-boston-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-boston-to-austin.html')));
app.get('/moving-from-minneapolis-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-minneapolis-to-austin.html')));
app.get('/moving-from-sf-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-sf-to-austin.html')));
app.get('/moving-from-atlanta-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-atlanta-to-austin.html')));
app.get('/moving-from-portland-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-portland-to-austin.html')));
app.get('/moving-from-phoenix-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-from-phoenix-to-austin.html')));
// 301 redirects from old slugs to preserve SEO equity
app.get('/los-angeles-to-austin', (_req, res) => res.redirect(301, '/moving-from-los-angeles-to-austin'));
app.get('/new-york-to-austin', (_req, res) => res.redirect(301, '/moving-from-new-york-to-austin'));
app.get('/chicago-to-austin', (_req, res) => res.redirect(301, '/moving-from-chicago-to-austin'));
app.get('/seattle-to-austin', (_req, res) => res.redirect(301, '/moving-from-seattle-to-austin'));
app.get('/denver-to-austin', (_req, res) => res.redirect(301, '/moving-from-denver-to-austin'));
app.get('/dc-to-austin', (_req, res) => res.redirect(301, '/moving-from-dc-to-austin'));
app.get('/boston-to-austin', (_req, res) => res.redirect(301, '/moving-from-boston-to-austin'));
app.get('/minneapolis-to-austin', (_req, res) => res.redirect(301, '/moving-from-minneapolis-to-austin'));
app.get('/sf-to-austin', (_req, res) => res.redirect(301, '/moving-from-sf-to-austin'));
app.get('/atlanta-to-austin', (_req, res) => res.redirect(301, '/moving-from-atlanta-to-austin'));
app.get('/portland-to-austin', (_req, res) => res.redirect(301, '/moving-from-portland-to-austin'));
app.get('/phoenix-to-austin', (_req, res) => res.redirect(301, '/moving-from-phoenix-to-austin'));
app.get('/austin-homes-under-400k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-400k.html')));
app.get('/austin-homes-under-500k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-500k.html')));
app.get('/austin-homes-under-750k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-750k.html')));
app.get('/austin-homes-under-1-million', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-1-million.html')));
app.get('/commercial-real-estate-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/commercial-real-estate-austin.html')));
app.get('/austin-homes-big-yard', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-big-yard.html')));
app.get('/eanes-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/eanes-isd-homes-for-sale.html')));
app.get('/austin-tx-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-tx-realtor.html')));
app.get('/moving-to-austin-guides', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-to-austin-guides.html')));
app.get('/employer-relocation-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/employer-relocation-austin.html')));
app.get('/divorce-realtor-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/divorce-realtor-austin.html')));
app.get('/sell-home-during-divorce-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-during-divorce-austin.html')));
app.get('/buying-home-after-divorce-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/buying-home-after-divorce-austin.html')));
app.get('/austin-buyers-or-sellers-market', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-buyers-or-sellers-market.html')));
app.get('/austin-home-prices-falling', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-home-prices-falling.html')));
app.get('/sienna-at-the-thompson-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sienna-at-the-thompson-austin.html')));
app.get('/condos-for-sale-in-the-austonian', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos-for-sale-in-the-austonian.html')));
app.get('/condos-for-rent-in-the-austonian', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos-for-rent-in-the-austonian.html')));
app.get('/condos-for-sale-in-the-modern', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos-for-sale-in-the-modern.html')));
app.get('/condos-for-rent-in-the-modern', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos-for-rent-in-the-modern.html')));
app.get('/texas-residency-ut-austin-in-state-tuition', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/texas-residency-ut-austin-in-state-tuition.html')));
app.get('/austin-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-isd-homes-for-sale.html')));
app.get('/leander-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/leander-isd-homes-for-sale.html')));
app.get('/round-rock-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/round-rock-isd-homes-for-sale.html')));
app.get('/lake-travis-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/lake-travis-isd-homes-for-sale.html')));
app.get('/hays-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/hays-isd-homes-for-sale.html')));
app.get('/pflugerville-isd-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/pflugerville-isd-homes-for-sale.html')));
app.get('/best-realtor-eanes-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-eanes-isd.html')));
app.get('/best-realtor-austin-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-austin-isd.html')));
app.get('/best-realtor-leander-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-leander-isd.html')));
app.get('/best-realtor-round-rock-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-round-rock-isd.html')));
app.get('/best-realtor-lake-travis-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-lake-travis-isd.html')));
app.get('/best-realtor-hays-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-hays-isd.html')));
app.get('/best-realtor-pflugerville-isd', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-pflugerville-isd.html')));
app.get('/best-realtor-78704-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78704-austin.html')));
app.get('/best-realtor-78702-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78702-austin.html')));
app.get('/best-realtor-78703-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78703-austin.html')));
app.get('/best-realtor-78722-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78722-austin.html')));
app.get('/best-realtor-78754-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78754-austin.html')));
app.get('/best-realtor-78731-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/best-realtor-78731-austin.html')));
app.get('/zilker-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/zilker-homes-for-sale.html')));
app.get('/allandale-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/allandale-homes-for-sale.html')));
app.get('/brentwood-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/brentwood-homes-for-sale.html')));
app.get('/tarrytown-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/tarrytown-realtor.html')));
app.get('/tarrytown-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/tarrytown-homes-for-sale.html')));
app.get('/tarrytown-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/tarrytown-market-report.html')));
app.get('/living-in-tarrytown-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-tarrytown-austin.html')));
app.get('/sell-home-tarrytown-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-tarrytown-austin.html')));
app.get('/living-in-allandale-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-allandale-austin.html')));
app.get('/sell-home-allandale-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-allandale-austin.html')));
app.get('/zilker-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/zilker-realtor.html')));
app.get('/zilker-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/zilker-market-report.html')));
app.get('/living-in-zilker-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-zilker-austin.html')));
app.get('/sell-home-zilker-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-zilker-austin.html')));
app.get('/allandale-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/allandale-realtor.html')));
app.get('/allandale-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/allandale-market-report.html')));
app.get('/brentwood-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/brentwood-realtor.html')));
app.get('/brentwood-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/brentwood-market-report.html')));
app.get('/living-in-brentwood-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-brentwood-austin.html')));
app.get('/sell-home-brentwood-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-brentwood-austin.html')));
app.get('/crestview-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/crestview-realtor.html')));
app.get('/crestview-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/crestview-homes-for-sale.html')));
app.get('/crestview-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/crestview-market-report.html')));
app.get('/living-in-crestview-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-crestview-austin.html')));
app.get('/sell-home-crestview-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-crestview-austin.html')));
app.get('/hyde-park-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/hyde-park-realtor.html')));
app.get('/hyde-park-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/hyde-park-homes-for-sale.html')));
app.get('/hyde-park-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/hyde-park-market-report.html')));
app.get('/living-in-hyde-park-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-hyde-park-austin.html')));
app.get('/sell-home-hyde-park-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-hyde-park-austin.html')));
app.get('/mueller-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/mueller-realtor.html')));
app.get('/mueller-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/mueller-homes-for-sale.html')));
app.get('/mueller-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/mueller-market-report.html')));
app.get('/living-in-mueller-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-mueller-austin.html')));
app.get('/sell-home-mueller-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-mueller-austin.html')));
app.get('/east-austin-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/east-austin-realtor.html')));
app.get('/east-austin-homes-for-sale', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/east-austin-homes-for-sale.html')));
app.get('/east-austin-market-report', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/east-austin-market-report.html')));
app.get('/living-in-east-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/living-in-east-austin.html')));
app.get('/sell-home-east-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-east-austin.html')));
app.get('/homes-for-sale-near-tesla-gigafactory', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-tesla-gigafactory.html')));
app.get('/homes-for-sale-near-tesla-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-tesla-austin.html')));
app.get('/homes-for-sale-near-apple-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-apple-austin.html')));
app.get('/homes-for-sale-near-samsung-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-samsung-austin.html')));
app.get('/homes-for-sale-near-google-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-google-austin.html')));
app.get('/homes-for-sale-near-dell-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-dell-austin.html')));
app.get('/homes-for-sale-near-ibm-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-ibm-austin.html')));
app.get('/homes-for-sale-near-oracle-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-oracle-austin.html')));
app.get('/homes-for-sale-near-indeed-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-indeed-austin.html')));
app.get('/homes-for-sale-near-amd-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-amd-austin.html')));
app.get('/homes-for-sale-near-amazon-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-amazon-austin.html')));
app.get('/homes-for-sale-near-meta-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-meta-austin.html')));
app.get('/homes-for-sale-near-nvidia-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-nvidia-austin.html')));
app.get('/homes-for-sale-near-salesforce-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/homes-for-sale-near-salesforce-austin.html')));
app.get('/fix-and-flip-calculator-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/fix-and-flip-calculator-austin.html')));

// Cash flow unsubscribe (GET so email links work directly)
app.get('/cash-flow-unsubscribe/:id', (req, res) => {
  const subs = loadCashFlowSubs().filter(s => s.id !== req.params.id);
  saveCashFlowSubs(subs);
  res.send('<p style="font-family:sans-serif;padding:40px">You have been unsubscribed. <a href="/">Return home</a></p>');
});

// Deal Radar pages
app.get('/deal-radar',       (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar.html')));
app.get('/deal-radar-admin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar-admin.html')));
app.get('/deal-radar/:id',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar-detail.html')));

// Sitemap index — points Google to both the static sitemap and the dynamic listing sitemap
app.get('/sitemap-index.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://austintxhomes.co/sitemap.xml</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://austintxhomes.co/listing-sitemap.xml</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </sitemap>
</sitemapindex>`);
});

// ── Programmatic SEO: individual listing pages for $1M+ properties ─────────
// Slug format: {address-kebab}--{listingKey}  (double-dash before key)
app.get('/homes/:slug', (req, res) => {
  try {
    const slug = req.params.slug;
    const ddIdx = slug.lastIndexOf('--');
    const listingKey = ddIdx !== -1 ? slug.slice(ddIdx + 2) : slug;
    const listing = listingDb.prepare('SELECT * FROM listings WHERE listing_key = ?').get(listingKey);
    if (!listing) return res.status(404).sendFile(path.join(__dirname, 'public/site/luxury-homes.html'));
    const enriched = enrichListing(listing, listingDb, neighborhoods);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(renderListingPage(enriched.listing, enriched));
  } catch (e) {
    console.error('[listing page]', e.message);
    res.status(500).send('Error loading listing');
  }
});

// Sitemap for all $1M+ listings (active + sold — sold pages have SEO value too)
app.get('/listing-sitemap.xml', (_req, res) => {
  try {
    const rows = listingDb.prepare(
      `SELECT listing_key, unparsed_address, modification_timestamp
       FROM listings
       WHERE list_price >= 1000000 OR close_price >= 1000000
       ORDER BY modification_timestamp DESC
       LIMIT 5000`
    ).all();
    const urls = rows.map(r => {
      const addrSlug = slugifyAddress(r.unparsed_address);
      const slug = `${addrSlug}--${r.listing_key}`;
      const lastmod = r.modification_timestamp ? r.modification_timestamp.slice(0, 10) : '2026-01-01';
      return `  <url>\n    <loc>https://austintxhomes.co/homes/${slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join('\n');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch (e) {
    console.error('[listing-sitemap]', e.message);
    res.status(500).send('Error generating sitemap');
  }
});

// Blog routes — SSR from data/blog-posts.js + weekly-reports.json
app.get('/blog', (req, res) => {
  // Reload static posts on each request in dev so edits are reflected without restart
  try { delete require.cache[require.resolve('./data/blog-posts')]; blogPosts = require('./data/blog-posts'); } catch(e) {}
  const category = req.query.category || null;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 12;
  const published = allBlogPosts().filter(p => p.published !== false);
  const filtered = category ? published.filter(p => p.category === category) : published;
  const totalPages = Math.ceil(filtered.length / perPage);
  const pagePosts = filtered.slice((page - 1) * perPage, page * perPage);
  res.setHeader('Content-Type', 'text/html');
  res.send(renderBlogIndex(pagePosts, { category, page, totalPages }));
});

app.get('/blog/:slug', (req, res) => {
  try { delete require.cache[require.resolve('./data/blog-posts')]; blogPosts = require('./data/blog-posts'); } catch(e) {}
  const post = allBlogPosts().find(p => p.slug === req.params.slug && p.published !== false);
  if (!post) return res.status(404).sendFile(path.join(__dirname, 'public/site/404.html'), () => res.status(404).send('Post not found'));
  res.setHeader('Content-Type', 'text/html');
  res.send(renderBlogPost(post));
});

// Neighborhood deep-dive pages — server-side rendered with unique SEO per neighborhood
app.get('/neighborhoods/:slug/homes-for-sale', (req, res) => {
  const nbhd = neighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/neighborhoods.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(renderNeighborhoodHomesPage(nbhd));
});

app.get('/neighborhoods/:slug/best-realtor', (req, res) => {
  const nbhd = neighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/neighborhoods.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(renderNeighborhoodRealtorPage(nbhd));
});

app.get('/neighborhoods/:slug', (req, res) => {
  const nbhd = neighborhoods[req.params.slug];
  if (!nbhd) {
    return res.status(404).sendFile(path.join(__dirname, 'public/site/neighborhoods.html'));
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(renderNeighborhoodPage(nbhd));
});

// ── Round Rock Topical Web ────────────────────────────────────────────────────
// City hub — static HTML
app.get('/round-rock', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/round-rock.html')));

// Neighborhood sub-pages — SSR via round-rock template
app.get('/round-rock/:slug/homes-for-sale', (req, res) => {
  const nbhd = roundRockNeighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/round-rock.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(roundRockTemplates.renderHomesForSale(nbhd));
});

app.get('/round-rock/:slug/homes-for-rent', (req, res) => {
  const nbhd = roundRockNeighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/round-rock.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(roundRockTemplates.renderHomesForRent(nbhd));
});

app.get('/round-rock/:slug/best-realtor', (req, res) => {
  const nbhd = roundRockNeighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/round-rock.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(roundRockTemplates.renderBestRealtor(nbhd));
});

app.get('/round-rock/:slug', (req, res) => {
  const nbhd = roundRockNeighborhoods[req.params.slug];
  if (!nbhd) return res.status(404).sendFile(path.join(__dirname, 'public/site/round-rock.html'));
  res.setHeader('Content-Type', 'text/html');
  res.send(roundRockTemplates.renderHub(nbhd));
});

// Serve all static files from /public
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// Fallback: serve idx-search static assets (js, css, html used by the /search SPA)
// JS/CSS get a 1-hour cache (ETag still allows conditional revalidation)
app.use(express.static(IDX_PUBLIC, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
}));

// Bulk upload disk-cached photos to R2 — runs once on startup to migrate existing cache
// Processes up to 200 files per boot so it doesn't slow startup
async function bulkUploadDiskCacheToR2() {
  if (!r2Service.isEnabled()) return;
  let files;
  try { files = fs.readdirSync(PHOTO_CACHE_DIR).filter(f => f.endsWith('.jpg')); }
  catch { return; }
  if (!files.length) return;

  console.log(`[R2] Bulk upload: ${files.length} disk-cached photos to migrate`);
  let uploaded = 0, skipped = 0;
  const LIMIT = 200;

  for (const file of files.slice(0, LIMIT)) {
    // filename format: {listingKey}-{idx}.jpg
    const m = file.match(/^(.+)-(\d+)\.jpg$/);
    if (!m) continue;
    const [, listingKey, idxStr] = m;
    const photoIdx = parseInt(idxStr);
    try {
      const buffer = fs.readFileSync(path.join(PHOTO_CACHE_DIR, file));
      await r2Service.uploadPhoto(listingKey, photoIdx, buffer, 'image/jpeg');
      uploaded++;
    } catch (e) {
      skipped++;
    }
    // Small delay to avoid hammering R2 API
    await new Promise(r => setTimeout(r, 50));
  }
  console.log(`[R2] Bulk upload done: ${uploaded} uploaded, ${skipped} skipped`);
}

// Fallback: any /site/*.html request
app.get('/site/:page', (req, res) => {
  const file = path.join(__dirname, 'public/site', req.params.page);
  res.sendFile(file, err => {
    if (err) res.status(404).send('Page not found');
  });
});

// ── Phase 3: Swap Express into the HTTP server ─────────────────────
_expressApp = app;
console.log(`Neighborhood pages: ${Object.keys(neighborhoods).length} neighborhoods loaded`);
console.log(`[server] Austin TX Homes running on port ${PORT}`);

// Build performance index (deferred so it doesn't block requests)
setTimeout(() => {
  try {
    const idxDbForIndex = require('../idx-search/db/database');
    idxDbForIndex.prepare(
      `CREATE INDEX IF NOT EXISTS idx_listings_active_coords
       ON listings(standard_status, mlg_can_view, listing_contract_date)
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
    ).run();
    console.log('[DB] idx_listings_active_coords ready');
  } catch (e) {
    console.warn('[DB] Index creation skipped:', e.message);
  }
}, 500);

// MLS sync startup check
const idxDb = require('../idx-search/db/database');
const count = idxDb.prepare('SELECT COUNT(*) as n FROM listings').get().n;
if (count < 5000) {
  console.log(`[SYNC] Only ${count} listings — starting full initial import...`);
  idxDb.prepare('UPDATE sync_state SET last_sync_timestamp = NULL WHERE id = 1').run();
  syncListings(true).catch(console.error);
} else {
  console.log(`[SYNC] ${count} listings in DB. Starting incremental sync...`);
  syncListings(false).catch(console.error);
  // Photo refresh deliberately NOT run on startup — it takes 8-10 min
  // and blocks the event loop. Runs once daily via cron instead.
}

// Drain disk photo cache to R2 (background — uploads ~100 cached files per boot)
if (r2Service.isEnabled()) {
  setTimeout(() => bulkUploadDiskCacheToR2().catch(console.error), 5000);
}

// Sync closed lease comps for cash-flow algorithm (runs after main sync)
const closedLeaseCount = idxDb.prepare(
  `SELECT COUNT(*) as n FROM listings WHERE (property_type LIKE '%Lease%') AND standard_status = 'Closed'`
).get().n;
if (closedLeaseCount === 0) {
  console.log('[LEASE-SYNC] No closed lease comps found — running initial closed lease sync...');
  syncClosedLeases().catch(console.error);
} else {
  console.log(`[LEASE-SYNC] ${closedLeaseCount} closed lease comps in DB.`);
}

// Sync closed sale comps for market report stats (sale-to-list ratio, closed count, etc.)
const closedSaleCount = idxDb.prepare(
  `SELECT COUNT(*) as n FROM listings WHERE (property_type = 'Residential' OR property_type = 'Residential Income') AND standard_status = 'Closed'`
).get().n;
if (closedSaleCount === 0) {
  console.log('[SALES-SYNC] No closed sale comps found — running initial closed sale sync...');
  setTimeout(() => syncClosedSales().catch(console.error), 10000); // offset 10s from lease sync to avoid API rate limits
} else {
  console.log(`[SALES-SYNC] ${closedSaleCount} closed sale comps in DB.`);
}
