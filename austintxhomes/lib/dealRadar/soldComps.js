// Fetches and caches recently closed/sold MLS listings for use as sold comparables.
// Sold comps give more reliable pricing signals than active listings since they
// reflect actual transaction prices rather than asking prices.

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

/** Returns an array of recently sold listings with close_price populated */
async function getSoldComps() {
  if (_cache && (Date.now() - _cacheTime) < CACHE_MS) return _cache;

  let listings = [];

  // Try 'Closed' first (RETS standard), then 'Sold' as fallback
  for (const status of ['Closed', 'Sold']) {
    try {
      const url = `${IDX_SERVER}/api/properties/search?limit=2000&status=${status}&property_type=Residential`;
      const data = await fetchJSON(url);
      const found = (data.listings || []).filter(l =>
        (l.close_price || l.list_price) > 50000 && l.living_area > 100
      );
      if (found.length > 30) {
        listings = found;
        break;
      }
    } catch (_) { /* try next status */ }
  }

  _cache     = listings;
  _cacheTime = Date.now();
  if (listings.length > 0) {
    console.log(`[Deal Radar] Sold comps loaded: ${listings.length} closed listings`);
  }
  return listings;
}

function clearCache() { _cache = null; _cacheTime = 0; }

module.exports = { getSoldComps, clearCache };
