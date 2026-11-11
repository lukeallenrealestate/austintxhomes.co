'use strict';

/**
 * Live market numbers for every page on the site.
 *
 * RULE (Luke, 2026-11-11): no stale numbers on any undated page. Any market
 * figure on an evergreen page must be a live token, not a typed-in number.
 * Dated content (blog posts, a "Q3 2026" report) may keep its numbers because
 * the date tells the reader when they were true.
 *
 * Token syntax (works in body copy, attributes, meta tags, and JSON-LD):
 *
 *   {{live:<scope>:<stat>[:<format>][|fallback text]}}
 *   {{asof}}            -> November 11, 2026
 *   {{asof:short}}      -> Nov 11, 2026
 *   {{asof:month}}      -> November 2026
 *   {{year}}            -> 2026
 *
 * <scope> is one or more key=value pairs joined by ';'
 *   city=Austin            MLS city field (comma list allowed)
 *   zip=78704              postal code (comma list allowed)
 *   nbhd=tarrytown         neighborhood boundary polygon (austin-neighborhoods.json),
 *                          falling back to data/neighborhoods.js mlsSearch
 *   sub=Mueller            subdivision_name LIKE
 *   isd=Eanes              school_district LIKE
 *   elem=Casis / high=Austin High   school LIKE
 *   metro                  every active residential listing in the MLS feed
 *   type=sfr|condo|townhome|duplex   property sub-type filter
 *   min=1000000 / max=2000000        list price band
 *   newcon=1               new construction only
 *
 * <stat>: count, medianPrice, avgPrice, medianPpsf, medianDom, medianSqft,
 *   p10Price, p90Price, minPrice, maxPrice, reducedPct, reducedCount,
 *   newConPct, newConCount, newLast7, newLast30, pendingCount,
 *   under400k, t400_600k, t600k_1m, t1m_2m, over2m
 *
 * <format>: auto ($725K / $1.25M), usd ($1,234,567), k ($725K), m ($1.3M),
 *   num (1,234), pct (12%), raw. Default: auto for prices, num otherwise,
 *   pct for *Pct stats.
 *
 * COMPLIANCE: only ACTIVE and PENDING listing data is used. Closed sale prices
 * are never exposed (see commit 048d389, TX MLS rule). Do not add closed-price
 * stats here.
 *
 * Small samples: price/DOM/ppsf medians need MIN_SAMPLE listings. Below that
 * the token renders its |fallback text, or an empty string (and is reported
 * by scripts/check-live-tokens.js, which must pass before shipping).
 */

const fs = require('fs');
const path = require('path');
const listingDb = require('../../idx-search/db/database');

const TTL_MS = 30 * 60 * 1000;
const MIN_SAMPLE = 5;
const TZ = 'America/Chicago';
const CACHE = new Map();

const RES_TYPES = ['Single Family Residence', 'Condominium', 'Townhouse', 'Duplex', 'Manufactured Home'];
const TYPE_MAP = {
  sfr: ['Single Family Residence'],
  condo: ['Condominium'],
  townhome: ['Townhouse'],
  townhouse: ['Townhouse'],
  duplex: ['Duplex'],
  manufactured: ['Manufactured Home'],
};

// ── polygons (shared with ssrInject) ─────────────────────────────────
let polyData = null;
function polygonsForSlug(slug) {
  if (polyData === null) {
    try {
      polyData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'idx-search', 'data', 'austin-neighborhoods.json'), 'utf8'));
    } catch (e) {
      console.warn('[liveStats] austin-neighborhoods.json not loaded:', e.message);
      polyData = {};
    }
  }
  const key = String(slug).replace(/-/g, ' ').toLowerCase().trim();
  const g = polyData[key];
  if (!g) return null;
  if (g.type === 'Polygon') return [g.coordinates[0].map(([lng, lat]) => ({ lat, lng }))];
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => p[0].map(([lng, lat]) => ({ lat, lng })));
  return null;
}
function pip(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng, xj = poly[j].lat, yj = poly[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inAny(lat, lng, polys) { for (const p of polys) if (pip(lat, lng, p)) return true; return false; }

function neighborhoodRecord(slug) {
  try { return require('../data/neighborhoods')[slug] || null; } catch { return null; }
}

// ── scope parsing ────────────────────────────────────────────────────
function parseScope(scopeStr) {
  const scope = {};
  for (const part of String(scopeStr).split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq === -1) scope[p.toLowerCase()] = true;
    else scope[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return scope;
}

// ── in-memory snapshot of every viewable active/pending residential listing ──
// One SQL pass every TTL; every scope then filters in JS (milliseconds).
// The full load runs once (about 3s); afterwards only rows modified since the
// last load are re-read, so the 30-minute refresh costs milliseconds and does
// not block the event loop. School district comes from the school_district
// column (filled by mlsSync from HighSchoolDistrict, plus backfillSchoolDistrict
// below for older rows).
const SNAP_COLS = `listing_key, modification_timestamp, list_price, living_area, days_on_market,
           listing_contract_date, new_construction_yn, original_list_price, standard_status,
           mlg_can_view, property_type, latitude, longitude, city, postal_code,
           lower(subdivision_name) AS sub, property_sub_type AS ptype,
           lower(coalesce(elementary_school,'')) AS elem, lower(coalesce(high_school,'')) AS high,
           lower(coalesce(school_district,'')) AS isd`;
const LIVE_STATUSES = new Set(['Active', 'Pending', 'Active Under Contract']);
const qualifies = r => LIVE_STATUSES.has(r.standard_status) && r.mlg_can_view === 1 &&
  r.list_price >= 75000 && !String(r.property_type || '').includes('Lease') && RES_TYPES.includes(r.ptype);

// Reading original_list_price walks past the large raw_data column, so a full
// load costs ~20s of synchronous SQLite time. To never block requests:
//   1. On boot, load the snapshot persisted next to the DB (sub-second), then
//      apply a delta of rows modified since it was written.
//   2. With no persisted file, build it in small background chunks; until it
//      is ready, tokens render their |fallback text.
//   3. Every TTL, apply a delta (milliseconds) and re-persist.
const SNAP_FILE = path.join(path.dirname(listingDb.name || path.join(__dirname, '..', '..', 'idx-search', 'db', 'idx.db')), 'live-snapshot.json');

let MAP = null;       // listing_key -> row
let SNAP = null;      // array view of MAP
let snapTs = 0;
let maxMod = '';
let loading = false;

let lastPersist = 0;
function persist(force) {
  if (!force && Date.now() - lastPersist < 6 * 3600 * 1000) return;
  lastPersist = Date.now();
  try {
    const tmp = SNAP_FILE + '.' + process.pid + '.tmp';
    fs.writeFile(tmp, JSON.stringify({ maxMod, savedAt: Date.now(), rows: SNAP }), err => {
      if (err) return console.warn('[liveStats] persist failed', err.message);
      fs.rename(tmp, SNAP_FILE, () => {}); // atomic swap: readers never see a half-written file
    });
  } catch (e) { console.warn('[liveStats] persist failed', e.message); }
}

function applyDelta() {
  const delta = listingDb.prepare(`SELECT ${SNAP_COLS} FROM listings WHERE modification_timestamp > ?`).all(maxMod);
  for (const r of delta) {
    if (r.modification_timestamp > maxMod) maxMod = r.modification_timestamp;
    if (qualifies(r)) MAP.set(r.listing_key, r); else MAP.delete(r.listing_key);
  }
  return delta.length;
}

function publish(t0, label) {
  SNAP = [...MAP.values()];
  snapTs = Date.now();
  CACHE.clear();
  console.log(`[liveStats] ${label}: ${SNAP.length} listings in ${snapTs - t0}ms`);
  persist(label === 'built snapshot');
}

function loadFromDisk() {
  try {
    const j = JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8'));
    if (!j || !Array.isArray(j.rows) || Date.now() - j.savedAt > 3 * 86400000) return false;
    MAP = new Map(j.rows.map(r => [r.listing_key, r]));
    maxMod = j.maxMod || '';
    lastPersist = Date.now();
    return true;
  } catch { return false; }
}

function buildInChunks(chunk = 300, pauseMs = 100) {
  if (loading) return;
  loading = true;
  const t0 = Date.now();
  const tmp = new Map();
  let lastId = 0, tmpMax = '';
  const pick = listingDb.prepare(`
    SELECT rowid AS _rid, ${SNAP_COLS} FROM listings
    WHERE rowid > ? AND standard_status IN ('Active','Pending','Active Under Contract')
      AND mlg_can_view = 1 AND list_price >= 75000
    ORDER BY rowid LIMIT ?`);
  const step = () => {
    try {
      const rows = pick.all(lastId, chunk);
      for (const r of rows) {
        lastId = r._rid;
        delete r._rid;
        if (r.modification_timestamp > tmpMax) tmpMax = r.modification_timestamp;
        if (qualifies(r)) tmp.set(r.listing_key, r);
      }
      if (rows.length === chunk) return setTimeout(step, pauseMs);
      MAP = tmp; maxMod = tmpMax; loading = false;
      applyDelta();
      publish(t0, 'built snapshot');
    } catch (e) {
      loading = false;
      console.error('[liveStats] chunked build failed:', e.message);
    }
  };
  setTimeout(step, 0);
}

function snapshot() {
  if (SNAP && Date.now() - snapTs < TTL_MS) return SNAP;
  const t0 = Date.now();
  if (!MAP) {
    if (loadFromDisk()) {
      applyDelta();
      publish(t0, 'loaded snapshot from disk + delta');
      return SNAP;
    }
    buildInChunks();
    return SNAP || [];
  }
  applyDelta();
  publish(t0, 'delta refresh');
  return SNAP;
}

function isReady() { return !!SNAP; }

/**
 * One-time, non-blocking backfill of school_district from the raw MLS
 * HighSchoolDistrict field (older rows were synced before mlsSync mapped it).
 * Small chunks with pauses so the event loop stays responsive.
 */
function backfillSchoolDistrict({ chunk = 400, pauseMs = 300 } = {}) {
  let total = 0;
  const pick = listingDb.prepare(`
    SELECT rowid FROM listings
    WHERE school_district IS NULL
      AND standard_status IN ('Active','Pending','Active Under Contract')
      AND rowid > ? ORDER BY rowid LIMIT ?`);
  const upd = listingDb.prepare(`UPDATE listings SET school_district = json_extract(raw_data,'$.HighSchoolDistrict') WHERE rowid = ?`);
  const runChunk = listingDb.transaction(ids => { for (const id of ids) upd.run(id); });
  let lastId = 0;
  const step = () => {
    try {
      const ids = pick.all(lastId, chunk).map(r => r.rowid);
      if (!ids.length) {
        console.log(`[liveStats] school_district backfill done (${total} rows checked)`);
        // The UPDATE does not touch modification_timestamp, so rebuild the
        // snapshot in the background to pick up the new district values.
        if (total) buildInChunks();
        return;
      }
      runChunk(ids);
      total += ids.length;
      lastId = ids[ids.length - 1];
      setTimeout(step, pauseMs);
    } catch (e) {
      console.error('[liveStats] school_district backfill stopped:', e.message);
    }
  };
  setTimeout(step, pauseMs);
}

let CITIES = null, citiesFor = null;
function knownCities() {
  const snap = SNAP || [];
  if (CITIES && citiesFor === snap) return CITIES;
  CITIES = new Set(snap.map(r => String(r.city || '').toLowerCase()).filter(Boolean));
  citiesFor = snap;
  return CITIES;
}

const csvSet = v => new Set(String(v).split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

// Returns rows for a scope, or null if the scope cannot be resolved.
function rowsFor(scope) {
  const hasGeo = scope.city || scope.zip || scope.sub || scope.isd || scope.elem || scope.high || scope.nbhd || scope.metro;
  if (!hasGeo) return null;
  let types = null;
  if (scope.type) {
    types = TYPE_MAP[String(scope.type).toLowerCase()];
    if (!types) return null;
  }
  let polys = null, nbhdSub = null, nbhdCities = null, nbhdZips = null;
  if (scope.nbhd) {
    const rec = neighborhoodRecord(scope.nbhd);
    const recCity = rec && rec.mlsSearch && !rec.searchParam && knownCities().has(rec.mlsSearch.toLowerCase())
      ? rec.mlsSearch.toLowerCase() : null;
    if (recCity) {
      // data/neighborhoods.js uses the CITY name as mlsSearch for whole cities
      // (Round Rock, Georgetown, West Lake Hills) and also for communities
      // inside them (Sun City Georgetown). A whole city matches on the MLS city
      // field; a community with no boundary of its own resolves to nothing, so
      // pages never show city-wide figures under a community's name.
      const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
      if (norm(rec.name) !== norm(rec.mlsSearch)) return null;
      nbhdCities = new Set([recCity]);
    } else {
      polys = polygonsForSlug(scope.nbhd);
    }
    if (!recCity && (!polys || !polys.length)) {
      polys = null;
      // Same precedence as ssrInject.getNeighborhoodListings: searchParam
      // (zip / city / neighborhood) first, then subdivision LIKE mlsSearch.
      if (!rec) return null;
      if (rec.searchParam) {
        const p = new URLSearchParams(rec.searchParam);
        if (p.get('zip')) nbhdZips = csvSet(p.get('zip'));
        if (p.get('city')) nbhdCities = csvSet(decodeURIComponent(p.get('city')));
        if (p.get('neighborhood')) nbhdSub = decodeURIComponent(p.get('neighborhood')).toLowerCase();
        if (!nbhdZips && !nbhdCities && !nbhdSub) return null;
      } else if (rec.mlsSearch) {
        nbhdSub = rec.mlsSearch.toLowerCase();
      } else {
        return null;
      }
    }
  }
  const cities = scope.city ? csvSet(scope.city) : nbhdCities;
  const zips = scope.zip ? csvSet(scope.zip) : nbhdZips;
  const sub = scope.sub ? String(scope.sub).toLowerCase() : null;
  const isd = scope.isd ? String(scope.isd).toLowerCase() : null;
  const elem = scope.elem ? String(scope.elem).toLowerCase() : null;
  const high = scope.high ? String(scope.high).toLowerCase() : null;
  const min = scope.min ? Number(scope.min) : null;
  const max = scope.max ? Number(scope.max) : null;

  return snapshot().filter(r => {
    if (types && !types.includes(r.ptype)) return false;
    if (min != null && r.list_price < min) return false;
    if (max != null && r.list_price >= max) return false;
    if (scope.newcon && r.new_construction_yn !== 1) return false;
    if (cities && !cities.has(String(r.city || '').toLowerCase())) return false;
    if (zips && !zips.has(String(r.postal_code || '').toLowerCase())) return false;
    if (sub && !(r.sub || '').includes(sub)) return false;
    if (nbhdSub && !(r.sub || '').includes(nbhdSub)) return false;
    if (isd && !r.isd.includes(isd)) return false;
    if (elem && !r.elem.includes(elem)) return false;
    if (high && !r.high.includes(high)) return false;
    if (polys && (r.latitude == null || !inAny(r.latitude, r.longitude, polys))) return false;
    return true;
  });
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pctile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

function computeStats(scopeStr) {
  snapshot(); // refreshes (and clears CACHE) when older than TTL
  if (!SNAP) return null; // still building: tokens fall back, never render a fake 0
  const key = 'scope:' + scopeStr;
  if (CACHE.has(key)) return CACHE.get(key);

  const scope = parseScope(scopeStr);
  let value = null;
  try {
    const all = rowsFor(scope);
    if (all) {
      const active = all.filter(r => r.standard_status === 'Active');
      const pendingCount = all.length - active.length;
      const now = Date.now();
      // Days on market from the list date (the stored DOM field only updates
      // when the listing is modified, so it understates untouched listings).
      const ageDays = r => {
        if (r.listing_contract_date) {
          const t = new Date(r.listing_contract_date).getTime();
          if (!isNaN(t)) return Math.floor((now - t) / 86400000);
        }
        return r.days_on_market > 0 ? r.days_on_market : null;
      };
      const listedWithin = (r, d) => {
        if (!r.listing_contract_date) return false;
        const t = new Date(r.listing_contract_date).getTime();
        return !isNaN(t) && now - t <= d * 86400000;
      };
      const prices = active.map(r => r.list_price).filter(Boolean);
      const ppsf = active.filter(r => r.living_area > 0).map(r => r.list_price / r.living_area);
      const sqft = active.map(r => r.living_area).filter(x => x > 0);
      const doms = active.map(ageDays).filter(d => d != null && d >= 0 && d <= 730);
      const reduced = active.filter(r => r.original_list_price && r.original_list_price > r.list_price).length;
      const newCon = active.filter(r => r.new_construction_yn === 1).length;
      const n = active.length;
      const enough = n >= MIN_SAMPLE;
      value = {
        count: n,
        pendingCount,
        medianPrice: enough ? median(prices) : null,
        avgPrice: enough ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
        medianPpsf: ppsf.length >= MIN_SAMPLE ? median(ppsf) : null,
        medianSqft: sqft.length >= MIN_SAMPLE ? median(sqft) : null,
        medianDom: doms.length >= MIN_SAMPLE ? median(doms) : null,
        p10Price: enough ? pctile(prices, 10) : null,
        p90Price: enough ? pctile(prices, 90) : null,
        minPrice: n ? Math.min(...prices) : null,
        maxPrice: n ? Math.max(...prices) : null,
        reducedCount: reduced,
        reducedPct: enough ? (100 * reduced / n) : null,
        newConCount: newCon,
        newConPct: enough ? (100 * newCon / n) : null,
        newLast7: active.filter(r => listedWithin(r, 7)).length,
        newLast30: active.filter(r => listedWithin(r, 30)).length,
        under400k: prices.filter(p => p < 400000).length,
        t400_600k: prices.filter(p => p >= 400000 && p < 600000).length,
        t600k_1m: prices.filter(p => p >= 600000 && p < 1000000).length,
        t1m_2m: prices.filter(p => p >= 1000000 && p < 2000000).length,
        over2m: prices.filter(p => p >= 2000000).length,
      };
    }
  } catch (e) {
    console.error('[liveStats] scope failed', scopeStr, e.message);
    value = null;
  }
  CACHE.set(key, value);
  return value;
}

// ── formatting ───────────────────────────────────────────────────────
const PRICE_STATS = new Set(['medianPrice', 'avgPrice', 'p10Price', 'p90Price', 'minPrice', 'maxPrice', 'medianPpsf']);
function fmtValue(v, stat, fmt) {
  if (v == null || Number.isNaN(v)) return null;
  const f = fmt || (PRICE_STATS.has(stat) ? (stat === 'medianPpsf' ? 'usd' : 'auto') : (/Pct$/.test(stat) ? 'pct' : 'num'));
  switch (f) {
    case 'usd': return '$' + Math.round(v).toLocaleString('en-US');
    case 'k': return '$' + Math.round(v / 1000).toLocaleString('en-US') + 'K';
    case 'm': return '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    case 'auto':
      // >= $999,500 reads as millions, so nothing ever renders as "$1,000K".
      if (v >= 999500) return '$' + (v / 1e6).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'M';
      return '$' + Math.round(v / 1000).toLocaleString('en-US') + 'K';
    case 'pct': return Math.round(v) + '%';
    case 'raw': return String(Math.round(v));
    case 'num':
    default: return Math.round(v).toLocaleString('en-US');
  }
}

function asOf(kind) {
  const d = new Date();
  if (kind === 'short') return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
  if (kind === 'month') return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'long', year: 'numeric' });
  if (kind === 'iso') return d.toLocaleDateString('en-CA', { timeZone: TZ });
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' });
}

/** Resolve one token body (the part between {{ and }}). Returns {text, ok}. */
function resolveToken(body) {
  let fallback = null;
  const bar = body.indexOf('|');
  if (bar !== -1) { fallback = body.slice(bar + 1); body = body.slice(0, bar); }
  const parts = body.split(':');
  const head = parts[0].trim();
  if (head === 'asof') return { text: asOf(parts[1]), ok: true };
  if (head === 'year') return { text: asOf('iso').slice(0, 4), ok: true };
  if (head !== 'live' || parts.length < 3) return { text: fallback ?? '', ok: fallback != null };
  const [, scopeStr, stat, fmt] = parts;
  const stats = computeStats(scopeStr.trim());
  const v = stats ? stats[stat.trim()] : undefined;
  const text = v === undefined ? null : fmtValue(v, stat.trim(), fmt && fmt.trim());
  if (text == null) return { text: fallback ?? '', ok: fallback != null };
  return { text, ok: true };
}

const TOKEN_RE = /\{\{\s*((?:live|asof|year)\b[^{}]*?)\s*\}\}/g;

/**
 * Replace every live token in an HTML string. Returns the new string.
 * Unresolved tokens (no data, no fallback) are recorded on `report`.
 */
function applyLiveTokens(html, report) {
  if (typeof html !== 'string' || html.indexOf('{{') === -1) return html;
  let found = false;
  const out = html.replace(TOKEN_RE, (_m, body) => {
    found = true;
    const r = resolveToken(body);
    if (!r.ok && report) report.push(body);
    return r.text;
  });
  if (report) report.hadTokens = found;
  return out;
}

function hasLiveTokens(html) {
  return typeof html === 'string' && /\{\{\s*live:/.test(html);
}

function clearCache() { CACHE.clear(); SNAP = null; MAP = null; maxMod = ''; }

/** Refresh the snapshot off the request path (call at startup + on a timer). */
function warm() {
  try { snapTs = 0; snapshot(); } catch (e) { console.error('[liveStats] warm failed', e.message); }
}

module.exports = {
  applyLiveTokens, hasLiveTokens, computeStats, resolveToken, fmtValue, asOf,
  polygonsForSlug, clearCache, warm, backfillSchoolDistrict, isReady, MIN_SAMPLE,
};
