/**
 * Server-side data injection for the homepage, /neighborhoods, and
 * /austin-buyers-or-sellers-market pages.
 *
 * Why this exists: those three pages all carry user-facing stats that were
 * previously rendered only by client-side JS. Crawlers and AI engines that
 * don't run JS (GPTBot, ClaudeBot, PerplexityBot, ChatGPT-User, and Google
 * before JS-rendering kicks in) saw "Loading…" and skeleton placeholders
 * instead of the answer the page exists to give. Sprint 6A pre-filled
 * static fallback numbers; this Sprint 6B layer reads the live MLS DB and
 * bakes the actual current numbers into the HTML at request time.
 *
 * The injection is pure string replacement — no template engine, no parsed
 * DOM. We match by `id="X"` or `data-neighborhood="X"` and swap the text
 * content. Render output cached per file path for 15 min; if anything in
 * here throws, the route falls back to sendFile() and the static fallbacks
 * still render.
 */
const fs = require('fs');
const path = require('path');
const listingDb = require('../../idx-search/db/database');

// Austin metro cities — Travis/Williamson/Hays/Bastrop counties only, so the
// stats don't get polluted by Killeen/Temple/New Braunfels that the MLS feed
// also covers. Matches the city list in /api/market-stats so the homepage
// stats agree across SSR and the live JS overwrite.
const AUSTIN_METRO_CITIES = [
  'Austin', 'Round Rock', 'Georgetown', 'Cedar Park', 'Leander', 'Pflugerville',
  'Kyle', 'Buda', 'San Marcos', 'Bastrop', 'Manor', 'Hutto', 'Taylor', 'Del Valle',
  'Lakeway', 'Bee Cave', 'Dripping Springs', 'Wimberley', 'Lockhart', 'Elgin',
  'Liberty Hill', 'Jarrell', 'Spicewood', 'Lago Vista', 'Driftwood', 'Manchaca',
  'Westlake Hills', 'West Lake Hills', 'Rollingwood', 'Sunset Valley', 'Jonestown',
  'Volente', 'Hudson Bend', 'Briarcliff', 'Rob Roy'
];

// Per-page rendered-HTML cache. Keys are absolute file paths. The cached
// value embeds the live MLS numbers at the time of render, so a 15-min TTL
// matches the MLS sync cadence — stale enough to amortize the DB hit,
// fresh enough that the numbers always reflect "last quarter hour".
const renderCache = new Map();
const RENDER_TTL = 15 * 60 * 1000;

// Stats cache, keyed by computation name. Lets multiple page renders share
// the same DB queries without recomputing per route.
const statsCache = new Map();
const STATS_TTL = 15 * 60 * 1000;

function cached(key, ttl, compute) {
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.value;
  const value = compute();
  statsCache.set(key, { value, ts: Date.now() });
  return value;
}

// ─── Number formatting ──────────────────────────────────────────────
function fmtThousands(n) { return Math.round(n).toLocaleString('en-US'); }
function fmtPriceCompact(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
}
function fmtTimestamp(d = new Date()) {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }) + ' CT';
}

// ─── Stat computations ─────────────────────────────────────────────
// Rebuilt 2026-11-12 on lib/liveStats (the same snapshot behind every live
// token, the market widgets, and llms.txt), so the homepage, this page, and
// the rest of the site always agree. Rules:
//   * Residential for-sale listings only (no leases, land, or commercial).
//   * No invented fallbacks. The old version silently substituted "industry
//     baseline" values (60 days, 5.5 months, 35%, 97%) when a number looked
//     odd; now an unavailable stat is null and the card says so.
//   * No sold prices. The feed's close_price equals the final LIST price on
//     every closed record, so the old "list-to-close ratio" was really the
//     final ask vs the original ask. It is now labeled as exactly that.
const live = require('./liveStats');
const METRO_SCOPE = 'city=' + AUSTIN_METRO_CITIES.join(',');
const SALE_TYPES = ['Single Family Residence', 'Condominium', 'Townhouse', 'Duplex', 'Manufactured Home'];

function closingsLast90() {
  const cityPh = AUSTIN_METRO_CITIES.map(() => '?').join(',');
  const typePh = SALE_TYPES.map(() => '?').join(',');
  return listingDb.prepare(
    `SELECT list_price, original_list_price FROM listings
     WHERE standard_status = 'Closed' AND property_type = 'Residential'
       AND property_sub_type IN (${typePh})
       AND city IN (${cityPh})
       AND list_price >= 75000
       AND close_date >= date('now', '-90 days')`
  ).all(...SALE_TYPES, ...AUSTIN_METRO_CITIES);
}

function getMarketStats() {
  const s = live.computeStats(METRO_SCOPE);
  if (!s || s.medianPrice == null) return null; // snapshot still loading
  return cached('marketStats', STATS_TTL, () => {
    const totalActive = s.count;
    const closed = closingsLast90();
    const closedLast90 = closed.length;
    // Months of supply = active inventory / average monthly closings.
    const rawSupply = closedLast90 > 0 ? totalActive / (closedLast90 / 3) : null;
    const monthsSupply = rawSupply != null && isFinite(rawSupply) && rawSupply > 0 && rawSupply < 36 ? rawSupply : null;
    // Final ask vs original ask, for homes that went to closing in 90 days.
    const ratios = closed
      .filter(r => r.original_list_price > 0 && r.list_price > 0)
      .map(r => r.list_price / r.original_list_price)
      .filter(x => x > 0.5 && x < 1.5)
      .sort((a, b) => a - b);
    const finalAskPct = ratios.length >= 30 ? 100 * ratios[Math.floor(ratios.length / 2)] : null;

    const under500 = live.computeStats(METRO_SCOPE + ';max=500000')?.count ?? null;
    const reductionRate = s.reducedPct != null ? Math.round(s.reducedPct) : null;
    const avgReduction = s.avgCutPct;
    const escrowCount = s.pendingCount;
    const escrowRatio = totalActive > 0 ? Math.round((escrowCount / totalActive) * 100) : null;
    const avgDom = s.medianDom != null ? Math.round(s.medianDom) : null; // a MEDIAN; name kept for API compatibility

    // Verdict. Months of supply is the canonical signal (< 4 seller's, 4 to 6
    // balanced, > 6 buyer's); the price-cut share is the fallback signal.
    let score;
    if (monthsSupply != null) score = Math.round(50 - (monthsSupply - 5) * 10);
    else if (reductionRate != null) score = Math.round(50 - (reductionRate - 40) * 2);
    else score = 50;
    score = Math.max(0, Math.min(100, score));
    const supplyTxt = monthsSupply != null ? `about ${monthsSupply.toFixed(1)} months of supply` : `${fmtThousands(s.pendingCount)} homes in escrow`;
    const cutTxt = reductionRate != null ? `${reductionRate}% of active listings below their original asking price` : 'widespread price cuts';
    let verdict, verdictClass, verdictIcon, verdictDesc;
    if (score >= 60) {
      verdict = "Seller's Market"; verdictClass = 'seller'; verdictIcon = '🔥';
      verdictDesc = `Greater Austin is currently a seller's market, with ${supplyTxt} across ${fmtThousands(totalActive)} active listings. Well-priced homes are clearing quickly and sellers hold pricing leverage, so buyers should expect competition on fresh listings in the most desirable price tiers.`;
    } else if (score >= 40) {
      verdict = 'Balanced Market'; verdictClass = 'balanced'; verdictIcon = '⚖️';
      verdictDesc = `Greater Austin is currently a balanced market, with ${supplyTxt} across ${fmtThousands(totalActive)} active listings and ${cutTxt}. Neither side holds decisive leverage. Pricing accuracy matters most: well-priced homes still move, while overpriced inventory sits and gets reduced.`;
    } else {
      verdict = "Buyer's Market"; verdictClass = 'buyer'; verdictIcon = '⚖️';
      verdictDesc = `Greater Austin is currently a buyer's market, with ${supplyTxt}, ${fmtThousands(totalActive)} active listings, ${avgDom != null ? avgDom + ' median days on market, ' : ''}and ${cutTxt}. Buyers have real negotiating leverage on price, repairs, and closing costs.`;
    }

    return {
      totalActive, medianPrice: s.medianPrice, avgPrice: s.avgPrice, avgDom,
      monthsSupply, under500, newConstruction: s.newConCount, closedLast90,
      reductionRate, avgReduction,
      escrowCount, escrowRatio,
      finalAskPct, finalAskSampleSize: ratios.length,
      score, verdict, verdictClass, verdictIcon, verdictDesc,
      updated: new Date()
    };
  });
}

// Neighborhood listing counts. The neighborhoods.html cards each carry a
// data-neighborhood="<name>" attribute; we read every distinct name from
// the HTML once, then COUNT active subdivisions LIKE each.
function getNeighborhoodCounts(html) {
  return cached('neighborhoodCounts', STATS_TTL, () => {
    const re = /data-neighborhood="([^"]+)"/g;
    const names = new Set();
    let m;
    while ((m = re.exec(html)) !== null) names.add(m[1]);
    const counts = {};
    for (const name of names) {
      try {
        const n = listingDb.prepare(
          `SELECT COUNT(*) AS n FROM listings
           WHERE standard_status = 'Active' AND mlg_can_view = 1
             AND (subdivision_name LIKE ? OR city LIKE ? OR postal_code = ?)`
        ).get('%' + name + '%', '%' + name + '%', name)?.n || 0;
        counts[name] = n;
      } catch {
        counts[name] = 0;
      }
    }
    return counts;
  });
}

// ─── HTML injection primitives ──────────────────────────────────────
// Replace the text content of an element matched by its id. Safe for
// elements whose only child is a text node (which is true for all the
// stat-card-value / verdict-text / etc. we're targeting).
function replaceById(html, id, newText) {
  const re = new RegExp(
    `(<[^>]*\\bid="${id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"[^>]*>)[\\s\\S]*?(</[a-zA-Z]+>)`,
    ''
  );
  // Escape $ in newText so JS String.replace doesn't interpret $1, $2, $$
  // etc. as backreferences. Bug caught 2026-07-22: SSR-injected listing
  // prices like "$65,000" were rendering as ",000" because "$6" was
  // being read as match-group-6 (empty). Doubling the $ makes it a
  // literal $ per MDN.
  const safe = String(newText).replace(/\$/g, '$$$$');
  return html.replace(re, `$1${safe}$2`);
}

function replaceByNeighborhood(html, name, newText) {
  const re = new RegExp(
    `(<[^>]*\\bdata-neighborhood="${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"[^>]*>)[\\s\\S]*?(</[a-zA-Z]+>)`,
    ''
  );
  return html.replace(re, `$1${newText}$2`);
}

// Swap one verdict-icon class (.buyer/.balanced/.seller) for another. The
// emoji content is replaced by replaceById; this just keeps the icon
// background tint matching the verdict.
function setVerdictClass(html, cls) {
  return html.replace(
    /(<div[^>]*id="verdict-icon"[^>]*class="[^"]*?\bverdict-icon\b)\s+(buyer|balanced|seller)/,
    `$1 ${cls}`
  );
}

function setVerdictTextClass(html, cls) {
  return html.replace(
    /(<div[^>]*class="[^"]*?\bverdict-text\b)\s+(buyer|balanced|seller)([^"]*"[^>]*id="verdict-text")/,
    `$1 ${cls}$3`
  );
}

// Append a server-rendered "Last updated" stamp into a known location.
// We inject right after the verdict-card div so it appears under the
// verdict. The buyer's-vs-seller's page is the only one with a verdict;
// for the homepage and /neighborhoods we inject elsewhere or skip.
function injectLastUpdated(html, when) {
  const stamp = `<div style="text-align:center;font-size:11px;color:rgba(255,255,255,.4);margin-top:1rem;font-style:italic;">Live MLS data · last updated ${fmtTimestamp(when)}</div>`;
  return html.replace(
    /(<\/div>\s*<\/div>\s*<\/section>\s*<!--\s*── MARKET METER)/,
    `${stamp}\n  $1`
  );
}

// ─── Page renderers ─────────────────────────────────────────────────
function renderWithCache(filePath, renderFn) {
  const hit = renderCache.get(filePath);
  if (hit && Date.now() - hit.ts < RENDER_TTL) return hit.html;
  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
    const out = renderFn(html);
    if (out == null) return html; // live data not ready yet: serve static, do not cache
    html = out;
  } catch (e) {
    console.warn(`[ssrInject] render failed for ${filePath}:`, e.message);
    // Fall back to whatever's on disk — Sprint 6A fallback values still display.
    try { html = fs.readFileSync(filePath, 'utf8'); } catch { html = ''; }
  }
  renderCache.set(filePath, { html, ts: Date.now() });
  return html;
}

function renderHomepage(filePath) {
  return renderWithCache(filePath, html => {
    const s = getMarketStats();
    if (!s) return null;
    html = replaceById(html, 'sb-listings', fmtThousands(s.totalActive));
    html = replaceById(html, 'sb-price', fmtPriceCompact(s.avgPrice));
    html = replaceById(html, 'sb-dom', s.avgDom != null ? `${s.avgDom} days` : 'n/a');
    html = replaceById(html, 'hf-listings', fmtThousands(s.totalActive));
    html = replaceById(html, 'hf-price', fmtPriceCompact(s.avgPrice));
    html = replaceById(html, 'hf-dom', s.avgDom != null ? String(s.avgDom) : 'n/a');
    html = replaceById(html, 'pp-listings', fmtThousands(s.totalActive));
    html = replaceById(html, 'dr-count', fmtThousands(s.totalActive) + '+');
    // SSR the Recently Listed grid so Googlebot sees actual listing cards,
    // not "Loading listings…". Fetches 3 newest active residential listings.
    // Falls back silently to the client-side fetch if the DB query fails.
    try {
      const rows = listingDb.prepare(`
        SELECT listing_key, unparsed_address, city, postal_code, list_price,
               bedrooms_total, bathrooms_total, living_area, photos,
               listing_contract_date
        FROM listings
        WHERE standard_status = 'Active'
          AND list_price >= 250000
          AND property_sub_type IN ('Single Family Residence','Condominium','Townhouse')
          AND mlg_can_view = 1
          AND unparsed_address IS NOT NULL
          AND photos IS NOT NULL AND photos != '[]' AND photos != ''
        ORDER BY listing_contract_date DESC
        LIMIT 3
      `).all();
      if (rows.length) html = replaceById(html, 'feat-grid', renderListingCards(rows));
    } catch (e) {
      console.warn('[ssrInject] Recently Listed SSR failed, falling back to client-side:', e.message);
    }
    return html;
  });
}

// Render N active-listing cards for the homepage "Recently Listed" section.
// Matches the class shape the client-side JS was producing, so page CSS
// styles apply identically. Address slugification follows the /homes/{slug}
// route pattern in server.js.
function renderListingCards(rows) {
  return rows.map(l => {
    const isRental = l.property_type && (l.property_type.includes('Lease') || l.property_type.includes('Rental'));
    const price = l.list_price
      ? '$' + Number(l.list_price).toLocaleString() + (isRental ? '<span style="font-size:.7em;color:var(--light);font-weight:400;">/mo</span>' : '')
      : '';
    const addr = [l.unparsed_address, l.city].filter(Boolean).join(', ').trim();
    const addrEsc = addr.replace(/"/g, '&quot;');
    const stats = [
      l.bedrooms_total && `${l.bedrooms_total} bd`,
      l.bathrooms_total && `${l.bathrooms_total} ba`,
      l.living_area && `${Number(l.living_area).toLocaleString()} sqft`,
    ].filter(Boolean).join(' · ');
    // Match the /homes/{slug} URL shape server.js expects
    const addrSlug = (l.unparsed_address || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    const href = `/homes/${addrSlug}--${l.listing_key}`;
    let photos = [];
    try { photos = JSON.parse(l.photos || '[]'); } catch (_) {}
    const img = photos && photos.length ? `/api/properties/photos/${l.listing_key}/0` : '';
    return `<a class="listing-card" href="${href}">
      <div class="lc-img">${img ? `<img src="${img}" alt="${addrEsc}" loading="lazy" />` : ''}<span class="lc-badge">Active</span></div>
      <div class="lc-body">
        <div class="lc-price">${price}</div>
        <div class="lc-addr">${addrEsc}</div>
        <div class="lc-stats"><span>${stats}</span></div>
      </div>
    </a>`;
  }).join('');
}

// Each stat card has an outer signal class (.buyer-signal / .seller-signal
// / .neutral-signal) that colors the top border, plus a footer chip with
// the matching color. These tiny helpers compute signal + label for each
// stat type using industry-standard thresholds.
function domSignal(d) {
  if (d < 30) return { cls: 'seller', label: '↓ Seller signal' };
  if (d > 60) return { cls: 'buyer', label: '↑ Buyer signal' };
  return { cls: 'neutral', label: '→ Balanced' };
}
function supplySignal(m) {
  if (m < 4) return { cls: 'seller', label: '↓ Seller signal' };
  if (m > 6) return { cls: 'buyer', label: '↑ Buyer signal' };
  return { cls: 'neutral', label: '→ Balanced' };
}
function reductionSignal(pct) {
  if (pct >= 40) return { cls: 'buyer', label: '↑ Strong buyer leverage' };
  if (pct >= 25) return { cls: 'buyer', label: '↑ Buyer signal' };
  if (pct < 15) return { cls: 'seller', label: '↓ Sellers holding firm' };
  return { cls: 'neutral', label: '→ Balanced' };
}
function escrowSignal(pct) {
  if (pct > 30) return { cls: 'seller', label: '↓ Strong demand' };
  if (pct < 15) return { cls: 'buyer', label: '↑ Weak demand' };
  return { cls: 'neutral', label: '→ Balanced demand' };
}
// Final ask as a share of the original ask, for homes that went to closing.
function finalAskSignal(pct) {
  if (pct >= 99) return { cls: 'seller', label: '↓ Few cuts before contract' };
  if (pct < 95) return { cls: 'buyer', label: '↑ Deep cuts before contract' };
  return { cls: 'neutral', label: '→ Modest cuts' };
}
function activeSignal(n) {
  if (n > 12000) return { cls: 'buyer', label: '↑ Elevated inventory' };
  if (n < 6000) return { cls: 'seller', label: '↓ Tight inventory' };
  return { cls: 'neutral', label: '→ Moderate inventory' };
}

// Swap the signal class (.buyer-signal/.seller-signal/.neutral-signal) on
// a stat-card whose outer wrapper carries id="card-X". Attribute order in
// the source HTML is class-then-id (`<div class="stat-card X" id="card-Y">`),
// so the regex matches the class attr first and asserts the matching id
// on the lookahead to avoid clobbering the wrong card.
function setSignalClass(html, cardId, cls) {
  const re = new RegExp(
    `(<div\\b[^>]*\\bclass="[^"]*?\\bstat-card\\b)\\s+(buyer|seller|neutral)-signal([^"]*"[^>]*\\bid="${cardId}"[^>]*>)`,
    ''
  );
  return html.replace(re, `$1 ${cls}-signal$3`);
}
function setSignalChipClass(html, signalId, cls) {
  const re = new RegExp(
    `(<div[^>]*class="[^"]*?\\bstat-signal\\b)\\s+(buyer|seller|neutral)([^"]*"[^>]*id="${signalId}")`,
    ''
  );
  return html.replace(re, `$1 ${cls}$3`);
}

function renderBuyersSellers(filePath) {
  return renderWithCache(filePath, html => {
    const s = getMarketStats();
    if (!s) return null;
    const na = 'n/a';
    // Verdict block
    html = replaceById(html, 'verdict-text', s.verdict);
    html = replaceById(html, 'verdict-desc', s.verdictDesc);
    html = replaceById(html, 'verdict-icon', s.verdictIcon);
    html = setVerdictClass(html, s.verdictClass);
    html = setVerdictTextClass(html, s.verdictClass);
    // Meter
    html = replaceById(html, 'meter-score', `${s.score} / 100`);
    html = replaceById(html, 'meter-score-note',
      `Composite buyer/seller score for greater Austin, driven by ${s.monthsSupply != null ? `months of supply (${s.monthsSupply.toFixed(1)})` : `the share of listings with a price cut (${s.reductionRate}%)`}, with ${fmtThousands(s.totalActive)} active listings and ${s.avgDom != null ? s.avgDom + ' median days on market' : 'current days on market'} as context. Below 40 favors buyers, 40 to 60 is balanced, above 60 favors sellers.`);
    // ── Stat card values
    html = replaceById(html, 'stat-active', fmtThousands(s.totalActive));
    html = replaceById(html, 'stat-median', fmtPriceCompact(s.medianPrice));
    html = replaceById(html, 'stat-dom', s.avgDom != null ? `${s.avgDom} days` : na);
    html = replaceById(html, 'stat-supply', s.monthsSupply != null ? `${s.monthsSupply.toFixed(1)} mo` : na);
    html = replaceById(html, 'stat-reduction',
      s.reductionRate == null ? na
        : s.avgReduction != null ? `${s.reductionRate}<span>% (avg cut ${s.avgReduction.toFixed(1)}%)</span>`
        : `${s.reductionRate}<span>%</span>`);
    html = replaceById(html, 'stat-escrow',
      s.escrowRatio != null ? `${s.escrowRatio}<span>% (${fmtThousands(s.escrowCount)} in escrow)</span>` : na);
    html = replaceById(html, 'stat-l2c', s.finalAskPct != null ? `${s.finalAskPct.toFixed(1)}<span>%</span>` : na);
    // ── Per-stat signal classes + chip labels
    const apply = (card, chip, sig) => {
      html = setSignalClass(html, card, sig.cls);
      html = setSignalChipClass(html, chip, sig.cls);
      html = replaceById(html, chip, sig.label);
    };
    apply('card-active', 'stat-active-signal', activeSignal(s.totalActive));
    if (s.avgDom != null) apply('card-dom', 'stat-dom-signal', domSignal(s.avgDom));
    if (s.monthsSupply != null) apply('card-supply', 'stat-supply-signal', supplySignal(s.monthsSupply));
    if (s.reductionRate != null) apply('card-reduction', 'stat-reduction-signal', reductionSignal(s.reductionRate));
    if (s.escrowRatio != null) apply('card-escrow', 'stat-escrow-signal', escrowSignal(s.escrowRatio));
    if (s.finalAskPct != null) apply('card-l2c', 'stat-l2c-signal', finalAskSignal(s.finalAskPct));

    // Last-updated stamp under the verdict card
    html = injectLastUpdated(html, s.updated);
    return html;
  });
}

function renderNeighborhoods(filePath) {
  return renderWithCache(filePath, html => {
    const counts = getNeighborhoodCounts(html);
    for (const [name, n] of Object.entries(counts)) {
      const label = n === 0 ? '—' : (n === 1 ? '1 home' : `${fmtThousands(n)} homes`);
      html = replaceByNeighborhood(html, name, label);
    }
    return html;
  });
}

// ─── Per-neighborhood listings (for /neighborhoods/:slug SSR) ────────
// Returns { listings, total } where:
//   - listings: first N (default 6) active listings for the neighborhood
//   - total:    full count of active matches (drives the displayed
//               "Active listings" stat)
//
// Filter precedence:
//   1. austin-neighborhoods.json polygon (most accurate — actual city
//      boundary GeoJSON; used wherever a slug matches a polygon key).
//      Each neighborhood gets a UNIQUE listing set, so /tarrytown and
//      /clarksville don't show the same 78703 listings and trip
//      duplicate-content flags.
//   2. n.searchParam (zip / city / forRent fields) — used by the few
//      neighborhood entries already configured this way.
//   3. subdivision_name LIKE n.mlsSearch — the legacy fallback for
//      master-planned subdivisions where the MLS field IS reliable
//      (Mueller, Sorento, Crystal Falls, etc.).
//
// Polygon path: SQL pre-filters by lat/lng bbox (cheap), then a Node
// ray-casting check per row (~100µs each on small candidate sets) gives
// the precise boundary cut. Cached 15 min; falls back gracefully to the
// next strategy if anything throws.
const nbhdPolyData = (() => {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', 'idx-search', 'data', 'austin-neighborhoods.json'),
      'utf8'
    ));
  } catch (e) {
    console.warn('[ssrInject] austin-neighborhoods.json not loaded:', e.message);
    return {};
  }
})();

// Normalize a slug ('hyde-park') to the JSON key format ('hyde park').
// Returns an array of polygons (each polygon is an array of {lat,lng}).
// MultiPolygon → array of outer rings, one per disjoint region.
function polygonsForSlug(slug) {
  if (!slug) return null;
  const key = String(slug).replace(/-/g, ' ').toLowerCase().trim();
  const g = nbhdPolyData[key];
  if (!g) return null;
  // GeoJSON puts longitude first: [lng, lat]. Our ray-casting helper
  // expects {lat, lng} so we swap on extraction.
  if (g.type === 'Polygon') {
    return [g.coordinates[0].map(([lng, lat]) => ({ lat, lng }))];
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates.map(poly => poly[0].map(([lng, lat]) => ({ lat, lng })));
  }
  return null;
}

// Standard ray-casting point-in-polygon. Mirrors idx-search/routes/properties.js
// so SSR and live-fetch filtering produce identical sets.
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function pointInAnyPolygon(lat, lng, polys) {
  for (const p of polys) if (pointInPolygon(lat, lng, p)) return true;
  return false;
}

function getNeighborhoodListings(n, limit = 6) {
  if (!n) return { listings: [], total: 0 };
  return cached(`nbhd-listings:${n.slug || n.mlsSearch}`, STATS_TTL, () => {
    try {
      // ── Strategy 1: polygon (preferred — true neighborhood boundary) ──
      const polys = polygonsForSlug(n.slug);
      if (polys && polys.length) {
        // Combined bbox across all polygons (MultiPolygon support)
        let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
        for (const poly of polys) for (const p of poly) {
          if (p.lat > north) north = p.lat;
          if (p.lat < south) south = p.lat;
          if (p.lng > east)  east  = p.lng;
          if (p.lng < west)  west  = p.lng;
        }
        const rows = listingDb.prepare(`
          SELECT listing_key, list_price, unparsed_address, city, postal_code,
                 bedrooms_total, bathrooms_total, living_area, photos,
                 latitude, longitude
          FROM listings
          WHERE standard_status = 'Active' AND mlg_can_view = 1
            AND list_price > 50000
            AND latitude IS NOT NULL AND longitude IS NOT NULL
            AND latitude BETWEEN ? AND ?
            AND longitude BETWEEN ? AND ?
            AND property_type NOT LIKE '%Lease%'
          ORDER BY listing_contract_date DESC NULLS LAST
        `).all(south, north, west, east);
        const inside = rows.filter(r => pointInAnyPolygon(r.latitude, r.longitude, polys));
        return {
          listings: inside.slice(0, limit).map(hydratePhoto),
          total: inside.length
        };
      }

      // ── Strategy 2: searchParam (zip / city based) ──
      // ── Strategy 3: subdivision_name LIKE (legacy) ──
      const conditions = [
        `standard_status = 'Active'`,
        `mlg_can_view = 1`,
        `list_price > 50000`,
        `latitude IS NOT NULL`,
        `longitude IS NOT NULL`
      ];
      const values = [];

      if (n.searchParam) {
        const p = new URLSearchParams(n.searchParam);
        const zip = p.get('zip');
        const city = p.get('city');
        const nbhd = p.get('neighborhood');
        if (zip) {
          const zips = zip.split(',').map(s => s.trim()).filter(Boolean);
          conditions.push(`postal_code IN (${zips.map(() => '?').join(',')})`);
          values.push(...zips);
        }
        if (city) {
          const cities = city.split(',').map(s => decodeURIComponent(s).trim()).filter(Boolean);
          conditions.push(`city IN (${cities.map(() => '?').join(',')})`);
          values.push(...cities);
        }
        if (nbhd) {
          conditions.push(`subdivision_name LIKE ?`);
          values.push(`%${decodeURIComponent(nbhd)}%`);
        }
        if (p.get('forRent') === 'false') {
          conditions.push(`property_type NOT LIKE '%Lease%'`);
        }
      } else if (n.mlsSearch) {
        conditions.push(`subdivision_name LIKE ?`);
        values.push(`%${n.mlsSearch}%`);
      } else {
        return { listings: [], total: 0 };
      }

      const baseSql = `FROM listings WHERE ${conditions.join(' AND ')}`;
      const total = listingDb.prepare(`SELECT COUNT(*) AS n ${baseSql}`).get(...values)?.n || 0;
      const rows = listingDb.prepare(`
        SELECT listing_key, list_price, unparsed_address, city,
               bedrooms_total, bathrooms_total, living_area, photos
        ${baseSql}
        ORDER BY listing_contract_date DESC NULLS LAST
        LIMIT ?
      `).all(...values, limit);

      return { listings: rows.map(hydratePhoto), total };
    } catch (err) {
      console.error('[ssrInject getNeighborhoodListings]', n.slug, err.message);
      return { listings: [], total: 0 };
    }
  });
}

// Add a browser-reachable photo URL from the stored MLSGrid Media keys.
function hydratePhoto(r) {
  let photos = [];
  try { photos = r.photos ? JSON.parse(r.photos) : []; } catch {}
  const firstPhoto = photos.length
    ? `/api/properties/photos/${r.listing_key}/0`
    : null;
  return { ...r, firstPhoto };
}

// Render a stretch of <a class="listing-card"> HTML for the cards grid.
// Format matches the client-side renderer in templates/neighborhood.js
// closely enough that there's no visible flicker when JS swaps them out.
function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
}
function renderNeighborhoodListingCardsHtml(listings, fallbackName) {
  if (!listings || !listings.length) return '';
  return listings.map(l => {
    const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'Price N/A';
    const addr = l.unparsed_address || `${fallbackName || 'Austin'}, TX`;
    const beds = l.bedrooms_total ?? ' - ';
    const baths = l.bathrooms_total ?? ' - ';
    const sqft = l.living_area ? Number(l.living_area).toLocaleString() : ' - ';
    const addrSlug = slugify(l.unparsed_address);
    const citySlug = (l.city || 'austin').toLowerCase().replace(/[^a-z]/g, '-');
    const href = l.listing_key
      ? (addrSlug ? `/property/${addrSlug}-${citySlug}-tx-${l.listing_key}` : `/property/${l.listing_key}`)
      : '#';
    const imgTag = l.firstPhoto
      ? `<img src="${escAttr(l.firstPhoto)}" alt="${escAttr(addr)}" loading="lazy" />`
      : '';
    return `<a class="listing-card" href="${escAttr(href)}">` +
      `<div class="card-img">${imgTag}<span class="card-badge">For Sale</span></div>` +
      `<div class="card-body">` +
        `<div class="card-price">${escAttr(price)}</div>` +
        `<div class="card-address">${escAttr(addr)}</div>` +
        `<div class="card-details">` +
          `<span><strong>${escAttr(beds)}</strong> beds</span>` +
          `<span><strong>${escAttr(baths)}</strong> baths</span>` +
          `<span><strong>${escAttr(sqft)}</strong> sqft</span>` +
        `</div>` +
      `</div>` +
      `</a>`;
  }).join('\n');
}

// Manual cache bust — useful from a /admin/refresh-ssr endpoint or after
// an MLS sync if the operator wants the new numbers immediately.
function invalidateAll() {
  renderCache.clear();
  statsCache.clear();
}

module.exports = {
  renderHomepage, renderBuyersSellers, renderNeighborhoods,
  getMarketStats, getNeighborhoodCounts, AUSTIN_METRO_CITIES,
  getNeighborhoodListings, renderNeighborhoodListingCardsHtml,
  invalidateAll,
  fmtTimestamp
};
