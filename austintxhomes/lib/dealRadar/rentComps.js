// Fetches active rental listings from the MLS to derive real rent comp data.
// When available, this replaces the Austin rent estimate tier table with actual
// market data. Falls back gracefully to estimates when no lease data is found.

const http = require('http');
const IDX_SERVER = process.env.IDX_SERVER || 'http://localhost:3000';

let _cache     = null;
let _cacheTime = 0;
const CACHE_MS = 6 * 60 * 60 * 1000; // refresh every 6 hours

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

/** Returns active rental listings. list_price = monthly rent. */
async function getRentComps() {
  if (_cache && (Date.now() - _cacheTime) < CACHE_MS) return _cache;

  let rentals = [];
  try {
    // idx-search returns rental listings when forRent=true
    const data = await fetchJSON(`${IDX_SERVER}/api/properties/search?limit=1000&forRent=true`);
    rentals = (data.listings || []).filter(l =>
      l.list_price > 300 &&     // filter out bad data
      l.list_price < 30000 &&   // monthly rent sanity cap
      l.living_area > 100
    );
  } catch (_) { /* fall back to estimates */ }

  _cache     = rentals;
  _cacheTime = Date.now();
  if (rentals.length > 0) {
    console.log(`[Deal Radar] Rent comps loaded: ${rentals.length} rental listings`);
  }
  return rentals;
}

/**
 * Given a sale listing and the pool of rental comps, find the best estimated rent.
 * Returns { estimatedRent, confidence, compCount, method } or null if no comps found.
 */
function computeRentFromComps(listing, rentComps) {
  if (!rentComps || rentComps.length === 0) return null;

  // Match on: same city, similar beds (±1), similar sqft (±35%)
  const comps = rentComps.filter(l => {
    if (!l.living_area || !l.list_price) return false;
    if ((l.city || '') !== (listing.city || '')) return false;
    const bedDiff  = Math.abs((l.bedrooms_total || 3) - (listing.bedrooms_total || 3));
    const sqftDiff = Math.abs(l.living_area - listing.living_area) / listing.living_area;
    return bedDiff <= 1 && sqftDiff <= 0.35;
  });

  if (comps.length < 3) return null;

  // Use median rent
  const rents      = comps.map(l => l.list_price).sort((a, b) => a - b);
  const medianRent = rents[Math.floor(rents.length / 2)];

  return {
    estimatedRent: Math.round(medianRent),
    confidence:    comps.length >= 8 ? 'high' : comps.length >= 4 ? 'medium' : 'low',
    compCount:     comps.length,
    method:        'mls-lease-comps',
  };
}

function clearCache() { _cache = null; _cacheTime = 0; }

module.exports = { getRentComps, computeRentFromComps, clearCache };
