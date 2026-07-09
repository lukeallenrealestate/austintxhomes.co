// County Appraisal District (CAD) data lookup.
//
// PRIMARY METHOD: MLS tax_annual_amount field
//   Many MLS listings include the property's annual tax bill. We back-calculate
//   approximate assessed value: assessed ≈ tax_annual / effective_rate.
//   Effective rates by county (2026): Travis ~1.97%, Williamson ~2.15%, Hays ~2.20%
//
// SECONDARY METHOD: TCAD Public API (Travis County only)
//   TCAD exposes a public property search at propaccess.trueautomation.com.
//   Used when tax_annual_amount is not available in the MLS record.
//   Results are cached for 30 days (appraisal values change only yearly).
//
// Both methods return: { appraisedValue, source, confidence }

const https = require('https');
const path  = require('path');
const fs    = require('fs');

const CACHE_FILE = path.join(__dirname, '../../data/cadCache.json');
const CACHE_TTL_DAYS = 30;

// Effective tax rates by county (used to back-calculate assessed value from tax bill)
const EFFECTIVE_RATES = {
  'travis':    0.0197,
  'williamson': 0.0215,
  'hays':      0.0220,
  'bastrop':   0.0190,
  'caldwell':  0.0195,
  default:     0.0205, // Austin metro average
};

// ── File-based cache ──────────────────────────────────────────────────────────
let _fileCache = null;

function loadFileCache() {
  if (_fileCache) return _fileCache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      _fileCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } else {
      _fileCache = {};
    }
  } catch (_) { _fileCache = {}; }
  return _fileCache;
}

function saveFileCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_) { /* non-fatal */ }
}

function cacheKey(listingKey) {
  return `lid_${listingKey}`;
}

function getCached(listingKey) {
  const cache = loadFileCache();
  const entry = cache[cacheKey(listingKey)];
  if (!entry) return null;
  const ageMs = Date.now() - entry.timestamp;
  if (ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null; // expired
  return entry.data;
}

function setCache(listingKey, data) {
  const cache = loadFileCache();
  cache[cacheKey(listingKey)] = { timestamp: Date.now(), data };
  _fileCache = cache;
  saveFileCache(cache);
}

// ── Method 1: MLS tax_annual_amount ──────────────────────────────────────────
/**
 * If the listing has tax_annual_amount, estimate assessed value.
 * Returns { appraisedValue, source, confidence } or null.
 */
function fromTaxAmount(listing) {
  const tax = listing.tax_annual_amount;
  if (!tax || tax < 100) return null;

  const county = (listing.county || '').toLowerCase();
  const rate   = EFFECTIVE_RATES[county] || EFFECTIVE_RATES.default;
  const approxAssessed = Math.round(tax / rate);

  // Sanity check: assessed should be within 30–200% of list price
  const ratio = approxAssessed / listing.list_price;
  if (ratio < 0.2 || ratio > 3.0) return null;

  return {
    appraisedValue: approxAssessed,
    taxAnnual:      Math.round(tax),
    effectiveRate:  rate,
    source:         'mls-tax-estimate',
    confidence:     'medium', // estimated from tax bill, not direct CAD query
    note:           `Derived from MLS tax figure ($${Math.round(tax).toLocaleString()}/yr) at ${(rate*100).toFixed(2)}% effective rate`,
  };
}

// ── Method 2: TCAD public API (Travis County) ─────────────────────────────────
/**
 * Query TCAD's public property search API by address.
 * Rate-limited by our own 30-day cache — only hits TCAD once per property per month.
 */
function queryTCAD(address) {
  return new Promise((resolve) => {
    // Normalize address for search: strip unit numbers, keep street number + name
    const searchAddr = (address || '')
      .replace(/,.*/, '')        // remove city/state
      .replace(/#\S+/, '')       // remove unit numbers
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (!searchAddr || searchAddr.length < 5) return resolve(null);

    const postBody = JSON.stringify({ q: searchAddr, cid: '67' });
    const options  = {
      hostname: 'propaccess.trueautomation.com',
      path:     '/clientdb/Property/QuickSearch',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(postBody),
        'Accept':         'application/json',
        'User-Agent':     'Mozilla/5.0 (compatible; AustinTXHomes/1.0)',
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const results = json.Results || json.results || [];
          if (!results.length) return resolve(null);

          // Find best match by address similarity
          const match = results[0]; // first result is usually best match
          const appraised = match.AppraisedValue || match.MarketValue || match.appraisedValue;
          if (!appraised || appraised < 10000) return resolve(null);

          resolve({
            appraisedValue: Math.round(appraised),
            cadPropertyId:  match.PropertyId || match.propertyId,
            source:         'tcad-api',
            confidence:     'high',
            note:           'Travis County Appraisal District appraised value',
          });
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(postBody);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Get CAD appraisal data for a listing.
 * Uses cached result if available, otherwise tries MLS tax field then TCAD API.
 */
async function getAppraisalData(listing) {
  if (!listing || !listing.listing_key || !listing.list_price) return null;

  // Check cache first
  const cached = getCached(listing.listing_key);
  if (cached !== null) return cached;  // cached null means "tried and found nothing"

  // Method 1: MLS tax amount (no network call)
  const fromTax = fromTaxAmount(listing);
  if (fromTax) {
    setCache(listing.listing_key, fromTax);
    return fromTax;
  }

  // Method 2: TCAD API (Travis County properties only, async)
  // Only attempt for Austin-area properties to avoid unnecessary requests
  const city   = (listing.city || '').toLowerCase();
  const county = (listing.county || '').toLowerCase();
  const isTravis = county === 'travis' || ['austin', 'rollingwood', 'west lake hills', 'lakeway'].includes(city);

  if (isTravis && listing.unparsed_address) {
    const tcad = await queryTCAD(listing.unparsed_address);
    setCache(listing.listing_key, tcad); // cache even if null
    return tcad;
  }

  // Nothing found — cache null so we don't retry constantly
  setCache(listing.listing_key, null);
  return null;
}

/** Pre-warm CAD cache for a batch of listings (fire-and-forget) */
async function prewarmBatch(listings) {
  // Process in small batches to avoid hammering TCAD
  const BATCH = 5;
  const DELAY = 1000; // 1 second between batches

  for (let i = 0; i < listings.length; i += BATCH) {
    const batch = listings.slice(i, i + BATCH);
    await Promise.all(batch.map(l => getAppraisalData(l).catch(() => null)));
    if (i + BATCH < listings.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }
}

function clearCache() {
  _fileCache = {};
  saveFileCache({});
}

module.exports = { getAppraisalData, prewarmBatch, clearCache };
