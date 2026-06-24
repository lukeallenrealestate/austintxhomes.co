/**
 * Query-aware SEO meta injection for /search.
 *
 * The IDX search page is a single client-rendered SPA — same HTML
 * shell for every URL — which means every filter permutation served
 * the same static <title>, <meta description>, and a canonical that
 * pointed back to the homepage. That cost us per-permutation ranking
 * signals on what should be high-intent landing pages
 * (e.g. /search?neighborhood=Tarrytown).
 *
 * This module reads the base index.html once at startup, then on each
 * request inspects req.query and substitutes:
 *   - <title>
 *   - <meta name="description">
 *   - <link rel="canonical">   (self-referencing, with normalized params)
 *   - <meta property="og:title">
 *   - <meta property="og:description">
 *   - <meta property="og:url">
 *   - <meta name="robots">     (noindex for low-value permutations)
 *
 * The decision of what's a "valuable" filter combination (indexable)
 * vs. "low-value" (noindexed) is in shouldIndex() — see that function
 * for the rules.
 */
const fs = require('fs');
const path = require('path');

let baseHtml = null;
function loadBase() {
  if (baseHtml) return baseHtml;
  const filePath = path.join(__dirname, '..', '..', 'idx-search', 'public', 'index.html');
  baseHtml = fs.readFileSync(filePath, 'utf8');
  return baseHtml;
}

// ─── Human formatting helpers ───────────────────────────────────────
function fmtPrice(n) {
  const num = Number(n);
  if (!num) return null;
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(num % 1_000_000 ? 1 : 0) + 'M';
  if (num >= 1000) return '$' + Math.round(num / 1000) + 'K';
  return '$' + num;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Normalize a city / neighborhood / zip param into a title-ready string.
// Strips weird casing, trims, caps length so a malicious or accidental
// long param can't blow up the title.
function clean(v) {
  if (!v) return null;
  let s = String(v).trim().replace(/\+/g, ' ').slice(0, 60);
  // Title-case for cities / neighborhoods unless the value is a ZIP
  if (/^\d{5}$/.test(s)) return s;
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// Translate the MLS property subtype into something a human / Google
// would write. Map to the most-searched phrasing for each type.
const SUBTYPE_LABEL = {
  'Single Family Residence': 'Homes',
  'Condominium': 'Condos',
  'Townhouse': 'Townhomes',
  'Multi Family': 'Multi-Family Properties',
  'Land': 'Lots & Land'
};
function subTypeLabel(v) {
  if (!v) return 'Homes';
  // subType may be a comma-joined list when multiple are checked
  const first = String(v).split(',')[0].trim();
  return SUBTYPE_LABEL[first] || 'Homes';
}

// ─── Title & description builders ───────────────────────────────────
// The composition target: "{beds+} {type} in {place} {price band} | Luke Allen"
// e.g. "3+ Bed Homes in Tarrytown Under $1.5M | Luke Allen Realtor"
// Capped at ~62 chars for the title; descriptions at ~155.
function buildTitle(q) {
  const place = clean(q.neighborhood) || clean(q.schoolDistrict) || clean(q.city) || clean(q.zip) || 'Austin TX';
  const beds = q.minBeds ? `${q.minBeds}+ Bed ` : '';
  const type = subTypeLabel(q.subType);
  const forRent = q.forRent === 'true';
  const verb = forRent ? 'for Rent' : 'for Sale';

  let priceClause = '';
  if (q.minPrice && q.maxPrice) {
    priceClause = ` ${fmtPrice(q.minPrice)}-${fmtPrice(q.maxPrice)}`;
  } else if (q.maxPrice) {
    priceClause = ` Under ${fmtPrice(q.maxPrice)}`;
  } else if (q.minPrice) {
    priceClause = ` Over ${fmtPrice(q.minPrice)}`;
  }

  const core = `${beds}${type} ${verb} in ${place}${priceClause}`;
  return `${core} | Luke Allen Realtor`.slice(0, 90);
}

function buildDescription(q) {
  const place = clean(q.neighborhood) || clean(q.schoolDistrict) || clean(q.city) || clean(q.zip) || 'Austin TX';
  const beds = q.minBeds ? `${q.minBeds}+ bedroom ` : '';
  const baths = q.minBaths ? `${q.minBaths}+ bath ` : '';
  const type = subTypeLabel(q.subType).toLowerCase();
  const forRent = q.forRent === 'true';
  const verb = forRent ? 'for rent' : 'for sale';

  let priceClause = '';
  if (q.minPrice && q.maxPrice) priceClause = ` priced ${fmtPrice(q.minPrice)}-${fmtPrice(q.maxPrice)}`;
  else if (q.maxPrice)          priceClause = ` under ${fmtPrice(q.maxPrice)}`;
  else if (q.minPrice)          priceClause = ` over ${fmtPrice(q.minPrice)}`;

  const sqftClause = q.minSqft ? `, ${Number(q.minSqft).toLocaleString()}+ sqft` : '';
  const yearClause = q.minYear ? `, built ${q.minYear}+` : '';

  return `Search live MLS listings for ${beds}${baths}${type} ${verb} in ${place}${priceClause}${sqftClause}${yearClause}. Updated every 15 minutes. Luke Allen, licensed Austin Realtor (TREC #788149).`
    .slice(0, 158);
}

// ─── Canonical URL builder ─────────────────────────────────────────
// Build a canonical that includes only the SEO-meaningful filters
// (drops bbox map state, drop pagination, drop sort). This produces a
// single canonical URL per meaningful filter combination — the
// page=2/page=3 variants canonicalize back to page=1.
const CANONICAL_PARAMS = [
  'city', 'neighborhood', 'zip', 'schoolDistrict',
  'subType', 'minPrice', 'maxPrice', 'minBeds', 'minBaths',
  'minSqft', 'maxSqft', 'minYear', 'maxYear',
  'pool', 'waterfront', 'newConstruction', 'forRent'
];
function buildCanonical(q) {
  const usp = new URLSearchParams();
  for (const k of CANONICAL_PARAMS) {
    if (q[k] != null && q[k] !== '' && q[k] !== 'false') {
      usp.set(k, String(q[k]));
    }
  }
  // Sort the params alphabetically so equivalent filter sets always
  // produce the same canonical URL regardless of how the user got there.
  const sorted = Array.from(usp.entries()).sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(sorted).toString();
  return `https://austintxhomes.co/search${qs ? '?' + qs : ''}`;
}

// ─── Indexability rules ────────────────────────────────────────────
// Don't index endless low-value permutations. The rules below noindex:
//   - Polygon (drawn) searches — transient, no SEO value
//   - Map bbox-only (no other filters) — also transient
//   - Pages 2+ (canonical handles dedup but be explicit)
//   - Sort variants (canonical handles dedup, noindex as belt-and-suspenders)
// The bare /search (no params) IS indexable.
function shouldIndex(q) {
  if (q.polygon) return false;
  if (q.page && Number(q.page) > 1) return false;
  if (q.sortBy && q.sortBy !== 'newest') return false;
  // bbox-only (north/south/east/west present, no semantic filters) is a
  // transient map state, not a meaningful landing page
  const hasBbox = q.north || q.south || q.east || q.west;
  const hasSemantic = CANONICAL_PARAMS.some(p => q[p] != null && q[p] !== '' && q[p] !== 'false');
  if (hasBbox && !hasSemantic) return false;
  return true;
}

// ─── Render ────────────────────────────────────────────────────────
function renderSearchHtml(query) {
  const q = query || {};
  const title = buildTitle(q);
  const desc = buildDescription(q);
  const canonical = buildCanonical(q);
  const indexable = shouldIndex(q);
  const robotsContent = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1'
    : 'noindex, follow';

  let html = loadBase();

  // <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(title)}</title>`
  );
  // <meta name="description">
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(desc)}" />`
  );
  // <link rel="canonical">
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );
  // og:title
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(title)}" />`
  );
  // og:description
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`
  );
  // og:url
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`
  );
  // robots meta — inject after canonical if not already present, replace if present
  if (/<meta\s+name="robots"/.test(html)) {
    html = html.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="${robotsContent}" />`
    );
  } else {
    html = html.replace(
      /(<link\s+rel="canonical"[^>]*>)/,
      `$1\n  <meta name="robots" content="${robotsContent}" />`
    );
  }

  return html;
}

module.exports = {
  renderSearchHtml,
  // exported for tests
  buildTitle, buildDescription, buildCanonical, shouldIndex
};
