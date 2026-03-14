// Local dev server for austintxhomes pages
// Serves static files from /public and proxies /api/* to the idx-search server
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const IDX_SERVER = 'http://localhost:3000'; // idx-search backend

// Neighborhood page system
const neighborhoods = require('./data/neighborhoods');
const renderNeighborhoodPage = require('./templates/neighborhood');

// Deal Radar engine + alert system
const dealEngine  = require('./lib/dealRadar/dealEngine');
const alertEngine = require('./lib/dealRadar/alertEngine');
const ADMIN_KEY   = process.env.DEAL_RADAR_ADMIN_KEY || 'austin-admin-2026';
app.use(express.json());

// Start scheduled alert checks (2-hour interval, first run after 10 min warmup)
alertEngine.startScheduledChecks(dealEngine.getDeals);

// ── Deal Radar API routes (must come BEFORE the generic /api proxy) ──────────

// GET /api/deal-radar/settings — return current scoring config (admin)
app.get('/api/deal-radar/settings', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json(dealEngine.getConfig());
});

// POST /api/deal-radar/settings — save scoring config and clear cache (admin)
app.post('/api/deal-radar/settings', (req, res) => {
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
app.post('/api/deal-radar/alerts', async (req, res) => {
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

// /search redirects to the idx-search SPA, passing through any query params
app.get('/search', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, IDX_SERVER + '/' + qs);
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

    // Fetch a large sample for accurate stats
    const data = await fetchJSON(`${IDX_SERVER}/api/properties/search?limit=2000&status=Active&property_type=Residential`);
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

// Proxy all other /api/* calls and /property to the idx-search server
app.use('/api', createProxyMiddleware({ target: IDX_SERVER, changeOrigin: true }));
app.use('/property', createProxyMiddleware({ target: IDX_SERVER, changeOrigin: true }));

// Homepage route
app.get('/', (req, res) => {
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
app.get('/buy',           (_req, res) => res.sendFile(path.join(__dirname, 'public/site/buy.html')));
app.get('/rentals',       (_req, res) => res.sendFile(path.join(__dirname, 'public/site/rentals.html')));
app.get('/neighborhoods',     (_req, res) => res.sendFile(path.join(__dirname, 'public/site/neighborhoods.html')));
app.get('/moving-to-austin',  (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-to-austin.html')));
app.get('/market-report',     (_req, res) => res.sendFile(path.join(__dirname, 'public/site/market-report.html')));
app.get('/new-construction',  (_req, res) => res.sendFile(path.join(__dirname, 'public/site/new-construction.html')));
app.get('/first-time-buyers', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/first-time-buyers.html')));
app.get('/investment-properties', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/investment-properties.html')));
app.get('/luxury-homes',          (_req, res) => res.sendFile(path.join(__dirname, 'public/site/luxury-homes.html')));
app.get('/condos',                (_req, res) => res.sendFile(path.join(__dirname, 'public/site/condos.html')));
app.get('/cost-of-living',        (_req, res) => res.sendFile(path.join(__dirname, 'public/site/cost-of-living.html')));
app.get('/tesla-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/tesla-austin-relocation.html')));
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
app.get('/los-angeles-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/los-angeles-to-austin.html')));
app.get('/new-york-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/new-york-to-austin.html')));
app.get('/chicago-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/chicago-to-austin.html')));
app.get('/schwab-austin-relocation', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/schwab-austin-relocation.html')));
app.get('/seattle-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/seattle-to-austin.html')));
app.get('/denver-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/denver-to-austin.html')));
app.get('/dc-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/dc-to-austin.html')));
app.get('/boston-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/boston-to-austin.html')));
app.get('/minneapolis-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/minneapolis-to-austin.html')));
app.get('/sf-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sf-to-austin.html')));
app.get('/atlanta-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/atlanta-to-austin.html')));
app.get('/portland-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/portland-to-austin.html')));
app.get('/phoenix-to-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/phoenix-to-austin.html')));
app.get('/austin-homes-under-400k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-400k.html')));
app.get('/austin-homes-under-500k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-500k.html')));
app.get('/austin-homes-under-750k', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-750k.html')));
app.get('/austin-homes-under-1-million', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-under-1-million.html')));
app.get('/commercial-real-estate-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/commercial-real-estate-austin.html')));
app.get('/austin-homes-big-yard', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-homes-big-yard.html')));
app.get('/austin-tx-realtor', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/austin-tx-realtor.html')));
app.get('/moving-to-austin-guides', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/moving-to-austin-guides.html')));
app.get('/employer-relocation-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/employer-relocation-austin.html')));
app.get('/divorce-realtor-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/divorce-realtor-austin.html')));
app.get('/sell-home-during-divorce-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/sell-home-during-divorce-austin.html')));
app.get('/buying-home-after-divorce-austin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/buying-home-after-divorce-austin.html')));

// Deal Radar pages
app.get('/deal-radar',       (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar.html')));
app.get('/deal-radar-admin', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar-admin.html')));
app.get('/deal-radar/:id',   (_req, res) => res.sendFile(path.join(__dirname, 'public/site/deal-radar-detail.html')));

// Neighborhood deep-dive pages — server-side rendered with unique SEO per neighborhood
app.get('/neighborhoods/:slug', (req, res) => {
  const nbhd = neighborhoods[req.params.slug];
  if (!nbhd) {
    return res.status(404).sendFile(path.join(__dirname, 'public/site/neighborhoods.html'));
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(renderNeighborhoodPage(nbhd));
});

// Serve all static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: any /site/*.html request
app.get('/site/:page', (req, res) => {
  const file = path.join(__dirname, 'public/site', req.params.page);
  res.sendFile(file, err => {
    if (err) res.status(404).send('Page not found');
  });
});

app.listen(PORT, () => {
  console.log(`austintxhomes dev server running at http://localhost:${PORT}`);
  console.log(`Neighborhood pages: ${Object.keys(neighborhoods).length} neighborhoods loaded`);
});
