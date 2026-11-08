// SSR injection for the /1031-exchange-austin pillar page. The static
// HTML carries a placeholder <div class="listings-grid" id="listings-grid">
// that was previously populated by a client-side fetch — but the fetch
// targeted SFR / Condo / Townhouse, which are not the asset classes a
// 1031 buyer typically identifies. This module replaces that empty grid
// with a server-rendered set of investor-grade cards (duplex through
// commercial multifamily, retail, mixed-use, office) that are present
// in the delivered HTML and therefore crawlable.
//
// The existing .listing-card / .listing-img / .listing-body CSS is
// reused so no stylesheet edits are needed; an asset-class chip is
// layered on the card body to surface the 1031 buyer's primary
// filter at a glance.

const db = require('../../idx-search/db/database');

const METRO_CITIES = [
  'Austin', 'Round Rock', 'Georgetown', 'Cedar Park', 'Leander', 'Pflugerville',
  'Kyle', 'Buda', 'San Marcos', 'Bastrop', 'Manor', 'Hutto', 'Taylor', 'Del Valle',
  'Lakeway', 'Bee Cave', 'Dripping Springs', 'Liberty Hill', 'Jarrell', 'Spicewood',
  'Lago Vista', 'Jonestown', 'Elgin', 'Lockhart'
];

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function slugifyAddress(a) {
  return (a || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}
function homesUrl(listing_key, unparsed_address) {
  const slug = slugifyAddress(unparsed_address);
  return slug ? `/homes/${slug}--${listing_key}` : `/homes/${listing_key}`;
}

function assetClass(propType, propSub) {
  const sub = (propSub || '').toLowerCase();
  if (propType === 'Residential Income') {
    if (sub.includes('fourplex')) return { slug: 'multifamily', name: 'Fourplex' };
    if (sub.includes('triplex')) return { slug: 'multifamily', name: 'Triplex' };
    if (sub.includes('duplex')) return { slug: 'multifamily', name: 'Duplex' };
    return { slug: 'multifamily', name: 'Small Multifamily' };
  }
  if (propType === 'Commercial Sale') {
    if (sub.includes('multi')) return { slug: 'multifamily', name: 'Multifamily' };
    if (sub.includes('mixed')) return { slug: 'mixed-use', name: 'Mixed Use' };
    if (sub.includes('retail')) return { slug: 'commercial', name: 'Retail' };
    if (sub.includes('office')) return { slug: 'commercial', name: 'Office' };
    if (sub.includes('warehouse')) return { slug: 'commercial', name: 'Warehouse' };
    return { slug: 'commercial', name: 'Commercial' };
  }
  return { slug: 'other', name: 'Investment' };
}

// Stats + cards together. Cached 15 min to keep the pillar's DB hit
// amortized. The pillar also lives behind a 900s s-maxage at the CDN.
let cache = { ts: 0, html: '' };
const TTL = 15 * 60 * 1000;

function fetchCards() {
  const cityPH = METRO_CITIES.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT listing_key, unparsed_address, city, postal_code, list_price,
           bedrooms_total, bathrooms_total, living_area,
           property_type, property_sub_type, photos
    FROM listings
    WHERE mlg_can_view = 1
      AND standard_status = 'Active'
      AND list_price IS NOT NULL
      AND list_price BETWEEN 200000 AND 2000000
      AND property_type IN ('Residential Income', 'Commercial Sale')
      AND (property_sub_type IS NULL
           OR (property_sub_type NOT LIKE '%Site%'
               AND property_sub_type NOT LIKE '%Business%'
               AND property_sub_type NOT LIKE '%Industrial%'
               AND property_sub_type NOT LIKE '%See Remarks%'))
      AND city IN (${cityPH})
      AND listing_contract_date IS NOT NULL
    ORDER BY listing_contract_date DESC
    LIMIT 9
  `).all(...METRO_CITIES);

  return rows.map(l => {
    let photo = null;
    try { const p = JSON.parse(l.photos || '[]'); photo = p[0] || null; } catch {}
    const asset = assetClass(l.property_type, l.property_sub_type);
    const addr = escHtml(l.unparsed_address || 'Austin, TX');
    const cityZip = [l.city, l.postal_code].filter(Boolean).join(', ');
    const beds = l.bedrooms_total ? `${l.bedrooms_total} bd` : '';
    const baths = l.bathrooms_total ? `${l.bathrooms_total} ba` : '';
    const area = l.living_area ? `${Number(l.living_area).toLocaleString()} sqft` : '';
    const meta = [beds, baths, area].filter(Boolean).join(' &middot; ');
    const href = homesUrl(l.listing_key, l.unparsed_address);
    const img = photo
      ? `<div class="listing-img"><img src="/api/properties/photos/${l.listing_key}/0" alt="${addr}" loading="lazy" /></div>`
      : `<div class="listing-img"><div class="listing-img-placeholder"><span>Austin TX Homes</span></div></div>`;
    return `<a class="listing-card" href="${href}">
      ${img}
      <div class="listing-body">
        <span class="asset-chip asset-${asset.slug}">${escHtml(asset.name)}</span>
        <div class="listing-price">$${Number(l.list_price).toLocaleString()}</div>
        <div class="listing-address">${addr}${cityZip ? '<br/>' + escHtml(cityZip) : ''}</div>
        ${meta ? `<div class="listing-meta">${meta}</div>` : ''}
      </div>
    </a>`;
  }).join('');
}

// Minimal inline styles for the asset chip. Reuses the rest of the
// pillar's listing CSS unchanged.
const CHIP_STYLES = `<style>
.asset-chip { display: inline-block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; border: 1px solid #e5dfd4; padding: 3px 10px; border-radius: 3px; background: #faf8f4; color: #b8935a; }
.asset-chip.asset-multifamily { color: #1a3a52; border-color: #c8d4df; background: #eef3f8; }
.asset-chip.asset-commercial { color: #a84a2f; border-color: #e8d0c6; background: #faf0ec; }
.asset-chip.asset-mixed-use { color: #2d6a4f; border-color: #c6ddd0; background: #e9f3ed; }
</style>`;

function buildInventoryHtml() {
  if (Date.now() - cache.ts < TTL && cache.html) return cache.html;
  try {
    const cards = fetchCards();
    cache = { ts: Date.now(), html: cards };
    return cards;
  } catch (e) {
    console.error('[pillar1031Inject]', e.message);
    return '';
  }
}

// Inject the cards into the static HTML. Three surgical replacements:
// 1. Add the chip <style> once (immediately after the first </style> we find)
// 2. Fill the empty .listings-grid with SSR cards
// 3. Blank the stale "Loading current investment listings…" fallback
function inject(html) {
  const cards = buildInventoryHtml();
  if (!cards) return html;
  let out = html;
  // Chip styles — once, after the pillar's first style block ends
  if (!out.includes('asset-chip')) {
    out = out.replace('</style>', '</style>\n' + CHIP_STYLES);
  }
  // Fill the grid
  out = out.replace(
    '<div class="listings-grid" id="listings-grid"></div>',
    '<div class="listings-grid" id="listings-grid">' + cards + '</div>'
  );
  // Blank the loading fallback so it never shows
  out = out.replace(
    '<div id="listings-empty">\n <p>Loading current investment listings…</p>\n </div>',
    '<div id="listings-empty"></div>'
  );
  return out;
}

module.exports = { inject };
