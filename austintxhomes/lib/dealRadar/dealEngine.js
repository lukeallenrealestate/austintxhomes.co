// Deal Radar engine — fetches MLS listings, scores them, and caches results.
// All heavy computation happens server-side; the API returns pre-scored JSON.
//
// Data sources used in scoring:
//   • Active listings    — price/sqft comps, DOM comparisons
//   • Sold listings      — sold-comp pricing (more reliable than active asking prices)
//   • Rental listings    — actual MLS rent comps for yield scoring
//   • CAD appraisal data — assessed value discount signal

const http  = require('http');
const path  = require('path');
const fs    = require('fs');

const DEFAULT_CONFIG = require('./config');
const signals        = require('./signals');
const soldCompsLib   = require('./soldComps');
const rentCompsLib   = require('./rentComps');
const cadLookup      = require('./cadLookup');

const IDX_SERVER    = process.env.IDX_SERVER || 'http://localhost:3000';
const SETTINGS_FILE = path.join(__dirname, '../../data/dealRadarSettings.json');

// ── In-memory scored-listing cache ────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function getConfig() {
  let overrides = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      overrides = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (_) {}

  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (overrides.weights)    Object.assign(cfg.weights,    overrides.weights);
  if (overrides.signals)    Object.assign(cfg.signals,    overrides.signals);
  if (overrides.priceComps) Object.assign(cfg.priceComps, overrides.priceComps);
  if (typeof overrides.minScoreToShow === 'number') cfg.minScoreToShow = overrides.minScoreToShow;
  if (typeof overrides.cacheMinutes   === 'number') cfg.cacheMinutes   = overrides.cacheMinutes;
  return cfg;
}

// ── Score tiers ───────────────────────────────────────────────────────────────
function getScoreTier(score) {
  if (score >= 90) return { label: 'Exceptional Deal',   color: '#27ae60', rank: 1 };
  if (score >= 75) return { label: 'Strong Opportunity', color: '#b8935a', rank: 2 };
  if (score >= 60) return { label: 'Worth Watching',     color: '#2980b9', rank: 3 };
  return               { label: 'Standard Listing',      color: '#888888', rank: 4 };
}

// ── Deal badges ───────────────────────────────────────────────────────────────
function getDealBadges(breakdown) {
  const badges = [];
  const pct = (cat) => breakdown[cat]?.maxScore > 0
    ? (breakdown[cat].score / breakdown[cat].maxScore) : 0;

  if (pct('priceDrops')    >= 0.55) badges.push({ label: 'Price Reduced',  type: 'drop'  });
  if (pct('priceVsComps')  >= 0.50) badges.push({ label: 'Below Market',   type: 'below' });
  if (pct('domAnomaly')    >= 0.55) badges.push({ label: 'Long DOM',       type: 'dom'   });
  if (pct('valueAddSignals') >= 0.50) badges.push({ label: 'Value-Add',    type: 'value' });
  if (pct('rentYield')     >= 0.55) badges.push({ label: 'Yield Signal',   type: 'yield' });
  if (pct('lotPotential')  >= 0.55) badges.push({ label: 'Large Lot',      type: 'lot'   });
  if (pct('assessedDiscount') >= 0.40) badges.push({ label: 'Below CAD',   type: 'cad'   });

  return badges.slice(0, 3);
}

// ── Score one listing ─────────────────────────────────────────────────────────
function scoreListing(listing, activeListings, soldListings, cfg, rentCompResult, cadData) {
  const on = (key) => cfg.signals[key];
  const off = (key) => ({ score: 0, maxScore: cfg.weights[key], reasons: [], signals: [] });

  const breakdown = {
    cashFlow:         on('cashFlow')
      ? signals.scoreCashFlow(listing, cfg, rentCompResult)
      : off('cashFlow'),

    priceVsComps:     on('priceVsComps')
      ? signals.scorePriceVsComps(listing, activeListings, soldListings, cfg)
      : off('priceVsComps'),

    priceDrops:       on('priceDrops')
      ? signals.scorePriceDrops(listing, cfg)
      : off('priceDrops'),

    domAnomaly:       on('domAnomaly')
      ? signals.scoreDomAnomaly(listing, activeListings, cfg)
      : off('domAnomaly'),

    rentYield:        on('rentYield')
      ? signals.scoreRentYield(listing, cfg, rentCompResult)
      : off('rentYield'),

    valueAddSignals:  on('valueAddSignals')
      ? signals.scoreValueAddSignals(listing, cfg)
      : off('valueAddSignals'),

    lotPotential:     on('lotPotential')
      ? signals.scoreLotPotential(listing, cfg)
      : off('lotPotential'),

    assessedDiscount: on('assessedDiscount')
      ? signals.scoreAssessedDiscount(listing, cfg, cadData)
      : off('assessedDiscount'),
  };

  const totalScore = Math.min(100, Math.round(
    Object.values(breakdown).reduce((s, b) => s + (b.score || 0), 0)
  ));

  const allReasons = Object.values(breakdown).flatMap(b => b.reasons  || []).filter(Boolean);
  const allSigTags = Object.values(breakdown).flatMap(b => b.signals  || []).filter(Boolean);
  const badges     = getDealBadges(breakdown);
  const tier       = getScoreTier(totalScore);

  const lot = listing.lot_size_sqft || listing.lot_size_area
    || (listing.lot_size_acres ? Math.round(listing.lot_size_acres * 43560) : null);

  const ppsf         = listing.living_area > 0 ? Math.round(listing.list_price / listing.living_area) : null;
  const priceDrop    = (listing.original_list_price > listing.list_price)
    ? listing.original_list_price - listing.list_price : 0;
  const priceDropPct = priceDrop > 0 && listing.original_list_price
    ? Math.round((priceDrop / listing.original_list_price) * 100) : 0;

  return {
    listing_key:         listing.listing_key,
    address:             listing.unparsed_address || listing.address || '',
    city:                listing.city     || '',
    neighborhood:        listing.neighborhood || listing.subdivision_name || listing.city || '',
    postal_code:         listing.postal_code || '',
    list_price:          listing.list_price,
    bedrooms_total:      listing.bedrooms_total,
    bathrooms_total:     listing.bathrooms_total,
    living_area:         listing.living_area,
    lot_size_sqft:       lot,
    year_built:          listing.year_built,
    days_on_market:      listing.days_on_market,
    property_sub_type:   listing.property_sub_type,
    photos:              listing.photos,
    public_remarks:      listing.public_remarks,
    original_list_price: listing.original_list_price,
    latitude:            listing.latitude,
    longitude:           listing.longitude,
    ppsf,
    priceDrop,
    priceDropPct,
    dealScore:        totalScore,
    tier,
    badges,
    reasons:          allReasons.slice(0, 5),
    signalTags:       [...new Set(allSigTags)],
    cashFlowData:     breakdown.cashFlow?.cashFlowData || null,
    cashFlowPositive: (breakdown.cashFlow?.cashFlowData?.monthlyCashFlow ?? -Infinity) >= 0,
    breakdown,
  };
}

// ── Fetch all data in parallel and score ──────────────────────────────────────
async function fetchAndScore() {
  const cfg = getConfig();

  // Fetch active listings, sold comps, and rent comps in parallel
  const [activeData, soldListings, rentComps] = await Promise.all([
    fetchJSON(`${IDX_SERVER}/api/properties/search?limit=${cfg.maxListingsToProcess}&status=Active&property_type=Residential`)
      .then(d => (d.listings || []).filter(l => l.list_price > 50000 && l.living_area > 100))
      .catch(() => []),
    soldCompsLib.getSoldComps().catch(() => []),
    rentCompsLib.getRentComps().catch(() => []),
  ]);

  // Score all active listings
  // CAD data: fetch for high-potential listings only (top half by list price vs neighbours)
  // to avoid hammering TCAD for every listing. We use MLS tax data as primary.
  const scored = await Promise.all(activeData.map(async (listing) => {
    // Rent comp lookup for this specific listing
    const rentCompResult = rentCompsLib.computeRentFromComps(listing, rentComps);

    // CAD data — use MLS tax amount (no external call in hot path)
    // Full TCAD API lookup is handled lazily by cadLookup when detail page is opened
    const cadData = cfg.signals.assessedDiscount
      ? await cadLookup.getAppraisalData(listing).catch(() => null)
      : null;

    return scoreListing(listing, activeData, soldListings, cfg, rentCompResult, cadData);
  }));

  scored.sort((a, b) => b.dealScore - a.dealScore);
  console.log(`[Deal Radar] Scored ${scored.length} listings (${soldListings.length} sold comps, ${rentComps.length} rent comps)`);
  return scored;
}

// ── Public API ────────────────────────────────────────────────────────────────
async function getDeals({
  minScore, maxPrice, minPrice, city, subType, badgeType, cashFlowOnly,
  page = 1, limit = 24,
} = {}) {
  const cfg     = getConfig();
  const cacheMs = (cfg.cacheMinutes || 30) * 60 * 1000;

  if (!_cache || (Date.now() - _cacheTime) > cacheMs) {
    _cache     = await fetchAndScore();
    _cacheTime = Date.now();
  }

  let results = _cache.filter(d => d.dealScore >= (minScore != null ? minScore : cfg.minScoreToShow));
  if (maxPrice)      results = results.filter(d => d.list_price  <= maxPrice);
  if (minPrice)      results = results.filter(d => d.list_price  >= minPrice);
  if (city)          results = results.filter(d => (d.city || '').toLowerCase() === city.toLowerCase());
  if (subType)       results = results.filter(d => (d.property_sub_type || '').toLowerCase().includes(subType.toLowerCase()));
  if (badgeType)     results = results.filter(d => d.badges.some(b => b.type === badgeType));
  if (cashFlowOnly)  results = results.filter(d => d.cashFlowPositive);

  const total  = results.length;
  const offset = (page - 1) * limit;
  const items  = results.slice(offset, offset + limit).map(d => {
    // Omit heavy fields from list view
    const { breakdown, public_remarks, ...rest } = d;
    return rest;
  });

  return {
    items, total, page, limit,
    pages:     Math.ceil(total / limit),
    updatedAt: new Date(_cacheTime).toISOString(),
  };
}

/** Returns lightweight pin data for all scored listings matching filters — used by map view */
async function getDealsForMap({ minScore, maxPrice, minPrice, city, subType, badgeType, cashFlowOnly } = {}) {
  const cfg     = getConfig();
  const cacheMs = (cfg.cacheMinutes || 30) * 60 * 1000;

  if (!_cache || (Date.now() - _cacheTime) > cacheMs) {
    _cache     = await fetchAndScore();
    _cacheTime = Date.now();
  }

  let results = _cache.filter(d =>
    d.dealScore >= (minScore != null ? minScore : cfg.minScoreToShow) &&
    d.latitude && d.longitude
  );
  if (maxPrice)     results = results.filter(d => d.list_price  <= maxPrice);
  if (minPrice)     results = results.filter(d => d.list_price  >= minPrice);
  if (city)         results = results.filter(d => (d.city || '').toLowerCase() === city.toLowerCase());
  if (subType)      results = results.filter(d => (d.property_sub_type || '').toLowerCase().includes(subType.toLowerCase()));
  if (badgeType)    results = results.filter(d => d.badges.some(b => b.type === badgeType));
  if (cashFlowOnly) results = results.filter(d => d.cashFlowPositive);

  // Return only what the map needs
  return results.map(d => ({
    listing_key:  d.listing_key,
    latitude:     d.latitude,
    longitude:    d.longitude,
    list_price:   d.list_price,
    dealScore:    d.dealScore,
    tier:         d.tier,
    address:      d.address,
    city:         d.city,
    bedrooms_total:  d.bedrooms_total,
    bathrooms_total: d.bathrooms_total,
    living_area:  d.living_area,
    photos:       d.photos ? [d.photos[0]] : [],
    badges:           d.badges,
    ppsf:             d.ppsf,
    cashFlowPositive: d.cashFlowPositive,
    monthlyCashFlow:  d.cashFlowData?.monthlyCashFlow ?? null,
  }));
}

async function getDeal(listingKey) {
  const cfg     = getConfig();
  const cacheMs = (cfg.cacheMinutes || 30) * 60 * 1000;

  if (!_cache || (Date.now() - _cacheTime) > cacheMs) {
    _cache     = await fetchAndScore();
    _cacheTime = Date.now();
  }

  return _cache.find(d => d.listing_key === listingKey) || null;
}

function clearCache() {
  _cache     = null;
  _cacheTime = 0;
  soldCompsLib.clearCache();
  rentCompsLib.clearCache();
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  clearCache();
}

module.exports = { getDeals, getDealsForMap, getDeal, clearCache, saveSettings, getConfig };
