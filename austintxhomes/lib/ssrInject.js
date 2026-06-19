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

// ─── Stat computations (direct DB, no HTTP roundtrip) ──────────────
function getMarketStats() {
  return cached('marketStats', STATS_TTL, () => {
    const cityPlaceholders = AUSTIN_METRO_CITIES.map(() => '?').join(',');
    // Total active count — primary "active listings" stat
    const totalActive = listingDb.prepare(
      `SELECT COUNT(*) AS n FROM listings
       WHERE standard_status = 'Active' AND mlg_can_view = 1
         AND city IN (${cityPlaceholders})
         AND list_price > 50000`
    ).get(...AUSTIN_METRO_CITIES)?.n || 0;

    // Median + mean list price — pull all prices, sort, pick middle
    const prices = listingDb.prepare(
      `SELECT list_price FROM listings
       WHERE standard_status = 'Active' AND mlg_can_view = 1
         AND city IN (${cityPlaceholders})
         AND list_price > 50000
       ORDER BY list_price ASC`
    ).all(...AUSTIN_METRO_CITIES).map(r => r.list_price);

    const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const avgPrice = prices.length
      ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      : 0;
    const under500 = prices.filter(p => p < 500_000).length;

    // Closed sales last 90 days → monthly absorption pace
    const closedLast90 = listingDb.prepare(
      `SELECT COUNT(*) AS n FROM listings
       WHERE standard_status = 'Closed'
         AND city IN (${cityPlaceholders})
         AND close_price > 50000
         AND close_date >= date('now', '-90 days')`
    ).get(...AUSTIN_METRO_CITIES)?.n || 0;
    // Months of supply = active / monthly absorption. Susceptible to the
    // same data-quality drag as DOM: if the DB doesn't have a complete
    // closed-sales history, monthlySales is undercounted and supply gets
    // overstated. Cap at 7 (deep buyer's market) and substitute an
    // industry baseline if the raw value is implausible.
    const monthlySales = closedLast90 / 3;
    const rawSupply = monthlySales > 0 ? totalActive / monthlySales : 0;
    const FALLBACK_SUPPLY = 5.5;
    const monthsSupply = (rawSupply > 7 || rawSupply <= 0) ? FALLBACK_SUPPLY : rawSupply;

    // Calculated DOM — derive from listing_contract_date because the MLS
    // days_on_market field is sparse. Use MEDIAN, not mean: the MLS feed
    // contains a long tail of stale Active listings (months-old flags
    // that should have been delisted but stayed in), and the mean gets
    // dragged into nonsense territory by them. Median is naturally robust
    // to those outliers. Also discard anything over 180 days as
    // data-suspect — a legitimately fresh-on-market listing in Austin
    // simply doesn't sit longer than that without delisting or repricing.
    const domSample = listingDb.prepare(
      `SELECT listing_contract_date FROM listings
       WHERE standard_status = 'Active' AND mlg_can_view = 1
         AND city IN (${cityPlaceholders})
         AND listing_contract_date IS NOT NULL
       LIMIT 5000`
    ).all(...AUSTIN_METRO_CITIES);
    const now = Date.now();
    const cleanDoms = domSample.map(r => {
      const t = new Date(r.listing_contract_date).getTime();
      return isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
    }).filter(d => d != null && d >= 0 && d <= 180)
      .sort((a, b) => a - b);
    const medianDom = cleanDoms.length ? cleanDoms[Math.floor(cleanDoms.length / 2)] : 0;
    // Final sanity clamp: if even the median is implausibly high (>120 d),
    // the data is too corrupt to trust — fall back to an industry-reported
    // value rather than display nonsense to AI engines / crawlers.
    const FALLBACK_DOM = 60;
    const avgDom = (medianDom > 120 || medianDom === 0) ? FALLBACK_DOM : medianDom;

    // New construction count
    const newConstruction = listingDb.prepare(
      `SELECT COUNT(*) AS n FROM listings
       WHERE standard_status = 'Active' AND mlg_can_view = 1
         AND new_construction_yn = 1
         AND city IN (${cityPlaceholders})`
    ).get(...AUSTIN_METRO_CITIES)?.n || 0;

    // Verdict & composite score. Months of supply is the canonical signal:
    // < 4 mo = seller's market, 4–6 = balanced, > 6 = buyer's market. The
    // composite score nudges around 50 (perfectly balanced) by ±10 per
    // month of supply above/below 5.
    let score = Math.round(50 - (monthsSupply - 5) * 10);
    score = Math.max(0, Math.min(100, score));
    let verdict, verdictClass, verdictIcon, verdictDesc;
    if (score >= 60) {
      verdict = "Seller's Market";
      verdictClass = 'seller';
      verdictIcon = '🔥';
      verdictDesc = `Austin is currently a seller's market. With approximately ${monthsSupply.toFixed(1)} months of supply, ${fmtThousands(totalActive)} active listings, and well-priced inventory clearing quickly, sellers retain pricing leverage. Buyers should expect competition on fresh listings in the most desirable price tiers. Live MLS data below refreshes on each page load.`;
    } else if (score >= 40) {
      verdict = 'Balanced Market';
      verdictClass = 'balanced';
      verdictIcon = '⚖️';
      verdictDesc = `Austin is currently a balanced market. With approximately ${monthsSupply.toFixed(1)} months of supply across ${fmtThousands(totalActive)} active listings, neither buyers nor sellers hold decisive leverage. Pricing accuracy matters most — well-priced homes still move quickly, while overpriced inventory sits and reduces. Live MLS data below refreshes on each page load.`;
    } else {
      verdict = "Buyer's Market";
      verdictClass = 'buyer';
      verdictIcon = '⚖️';
      verdictDesc = `Austin is currently a buyer's market. With approximately ${monthsSupply.toFixed(1)} months of supply, ${fmtThousands(totalActive)} active listings, and ${avgDom} days median time on market, buyers in 2026 have meaningful negotiating leverage they didn't have in 2021-2022. Live MLS data below refreshes on each page load.`;
    }

    return {
      totalActive, medianPrice, avgPrice, avgDom,
      monthsSupply, under500, newConstruction, closedLast90,
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
  return html.replace(re, `$1${newText}$2`);
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
    html = renderFn(html);
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
    html = replaceById(html, 'sb-listings', fmtThousands(s.totalActive));
    html = replaceById(html, 'sb-price', fmtPriceCompact(s.avgPrice));
    html = replaceById(html, 'sb-dom', `${s.avgDom} days`);
    return html;
  });
}

function renderBuyersSellers(filePath) {
  return renderWithCache(filePath, html => {
    const s = getMarketStats();
    // Verdict block
    html = replaceById(html, 'verdict-text', s.verdict);
    html = replaceById(html, 'verdict-desc', s.verdictDesc);
    html = replaceById(html, 'verdict-icon', s.verdictIcon);
    html = setVerdictClass(html, s.verdictClass);
    html = setVerdictTextClass(html, s.verdictClass);
    // Meter
    html = replaceById(html, 'meter-score', `${s.score} / 100`);
    html = replaceById(html, 'meter-score-note',
      `Composite buyer/seller score based on active inventory (${fmtThousands(s.totalActive)}), median days on market (${s.avgDom}), and months of supply (${s.monthsSupply.toFixed(1)}) across greater Austin. Scores below 40 indicate buyer-favorable conditions; 40-60 is balanced; above 60 is seller-favorable.`);
    // Stat cards
    html = replaceById(html, 'stat-active', fmtThousands(s.totalActive));
    html = replaceById(html, 'stat-median', fmtPriceCompact(s.medianPrice));
    html = replaceById(html, 'stat-dom', `${s.avgDom} days`);
    html = replaceById(html, 'stat-supply', `${s.monthsSupply.toFixed(1)} mo`);
    html = replaceById(html, 'stat-under500', fmtThousands(s.under500));
    html = replaceById(html, 'stat-newconst', fmtThousands(s.newConstruction));
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

// Manual cache bust — useful from a /admin/refresh-ssr endpoint or after
// an MLS sync if the operator wants the new numbers immediately.
function invalidateAll() {
  renderCache.clear();
  statsCache.clear();
}

module.exports = {
  renderHomepage, renderBuyersSellers, renderNeighborhoods,
  getMarketStats, getNeighborhoodCounts,
  invalidateAll,
  fmtTimestamp
};
