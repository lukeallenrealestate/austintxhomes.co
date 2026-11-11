'use strict';

/**
 * Live market snapshot widget ("<Area> market right now").
 *
 * v2 (2026-11-11): numbers come from lib/liveStats.js, the same snapshot that
 * resolves live tokens in page copy, so the widget and the prose on a
 * page can never disagree. The old "Last 90 days closed sales" section was
 * removed: the engine's close_price column is the final LIST price, not the
 * sale price, so it was mislabeling list prices as sale prices, and with tiny
 * samples a "median close" effectively disclosed individual sold prices.
 *
 * Used two ways:
 *   1. ssrWithMarketWidget() routes in server.js (legacy filter objects).
 *   2. Auto-injected by server.js on neighborhood / ZIP / ISD pages that map to
 *      a live scope (lib/liveAreas.js), so every area page carries a live,
 *      dated snapshot. Skipped when the sample is too thin to be meaningful.
 */

const live = require('../lib/liveStats');

const MIN_WIDGET_SAMPLE = 5;
const WIDGET_MARKER = '<!-- market-widget v2 -->';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Legacy filter objects from server.js routes -> liveStats scope strings.
function filterToScope(filter) {
  if (!filter) return null;
  if (typeof filter === 'string') return filter;
  const parts = [];
  if (filter.scope) return filter.scope;
  if (filter.nbhd) parts.push('nbhd=' + filter.nbhd);
  if (filter.schoolDistrict) parts.push('isd=' + filter.schoolDistrict);
  if (filter.subdivision) {
    // Prefer the true neighborhood boundary when one exists (the MLS
    // subdivision field is unreliable for older central neighborhoods).
    const slug = String(filter.subdivision).toLowerCase().trim().replace(/\s+/g, '-');
    parts.push(live.polygonsForSlug(slug) ? 'nbhd=' + slug : 'sub=' + filter.subdivision);
  }
  if (filter.zip) parts.push('zip=' + filter.zip);
  if (filter.city) parts.push('city=' + filter.city);
  if (filter.elementary) parts.push('elem=' + filter.elementary);
  if (filter.high) parts.push('high=' + filter.high);
  return parts.length ? parts.join(';') : null;
}

function renderMarketWidget(filter, opts = {}) {
  const { areaName = 'this area', ctaLabel = 'Get a free CMA', pageUrl = null } = opts;
  const scope = filterToScope(filter);
  const s = scope ? live.computeStats(scope) : null;
  if (!s || s.count < MIN_WIDGET_SAMPLE || s.medianPrice == null) {
    return `<!-- market-widget: live sample too thin or not ready for ${esc(areaName)} -->`;
  }
  const f = (v, stat, fmt) => live.fmtValue(v, stat, fmt) || 'n/a';
  const asof = live.asOf();
  const iso = live.asOf('iso');

  const cut = Math.round(s.reducedPct || 0);
  const heat = cut >= 55 ? { label: "Leaning toward buyers", cls: 'buy' }
             : cut >= 40 ? { label: 'Balanced', cls: 'bal' }
             : { label: 'Leaning toward sellers', cls: 'sell' };
  const newConPct = Math.round(s.newConPct || 0);

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${areaName} housing market snapshot (active listings)`,
    description: `Live statistics for active residential listings in ${areaName}: count, median asking price, median asking price per square foot, median days on market, share of listings with a price reduction, and new listings in the last 7 days. Computed by Luke Allen (TREC #788149) from ACTRIS MLS data and refreshed every 30 minutes.`,
    creator: { '@type': 'Person', name: 'Luke Allen', url: 'https://austintxhomes.co/about' },
    dateModified: iso,
    temporalCoverage: iso,
    isAccessibleForFree: true,
    ...(pageUrl ? { url: pageUrl } : {}),
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Active listings', value: s.count },
      { '@type': 'PropertyValue', name: 'Median asking price', value: Math.round(s.medianPrice), unitText: 'USD' },
      ...(s.medianPpsf != null ? [{ '@type': 'PropertyValue', name: 'Median asking price per square foot', value: Math.round(s.medianPpsf), unitText: 'USD' }] : []),
      ...(s.medianDom != null ? [{ '@type': 'PropertyValue', name: 'Median days on market', value: Math.round(s.medianDom), unitText: 'days' }] : []),
      { '@type': 'PropertyValue', name: 'Listings with a price reduction', value: cut, unitText: 'percent' },
    ],
  };

  return `${WIDGET_MARKER}
<section class="market-widget" id="live-market" aria-labelledby="mw-h">
  <div class="mw-inner">
    <div class="mw-header">
      <span class="mw-eyebrow">Live MLS data &middot; as of ${esc(asof)}</span>
      <h2 id="mw-h">${esc(areaName)} <em>market right now</em></h2>
    </div>

    <div class="mw-stats">
      <div class="mw-stat"><div class="mw-num">${f(s.count, 'count')}</div><div class="mw-lbl">Active Listings</div></div>
      <div class="mw-stat"><div class="mw-num">${f(s.medianPrice, 'medianPrice')}</div><div class="mw-lbl">Median Asking Price</div></div>
      <div class="mw-stat"><div class="mw-num">${f(s.medianPpsf, 'medianPpsf')}</div><div class="mw-lbl">Median Ask $/sqft</div></div>
      <div class="mw-stat"><div class="mw-num">${f(s.medianDom, 'medianDom')}</div><div class="mw-lbl">Median Days Listed</div></div>
      <div class="mw-stat"><div class="mw-num">${cut}%</div><div class="mw-lbl">Have Cut Price</div></div>
    </div>

    <div class="mw-verdict mw-verdict-${heat.cls}">
      <span class="mw-verdict-label">Current read</span>
      <span class="mw-verdict-val">${heat.label}</span>
      <span class="mw-verdict-detail">${cut}% of active ${esc(areaName)} listings are priced below their original ask, and ${f(s.newLast7, 'newLast7')} new ${s.newLast7 === 1 ? 'listing has' : 'listings have'} come on in the last 7 days.${newConPct > 15 ? ` New construction makes up ${newConPct}% of inventory (${f(s.newConCount, 'newConCount')} homes), so builder incentives are worth pricing in.` : ''}</span>
    </div>

    <div class="mw-tiers">
      <div class="mw-tier"><span class="mw-tier-num">${f(s.under400k, 'under400k')}</span><span class="mw-tier-lbl">Under $400K</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${f(s.t400_600k, 't400_600k')}</span><span class="mw-tier-lbl">$400K to $600K</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${f(s.t600k_1m, 't600k_1m')}</span><span class="mw-tier-lbl">$600K to $1M</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${f(s.t1m_2m, 't1m_2m')}</span><span class="mw-tier-lbl">$1M to $2M</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${f(s.over2m, 'over2m')}</span><span class="mw-tier-lbl">Over $2M</span></div>
    </div>

    <p class="mw-source">Asking prices of active residential listings in ACTRIS MLS, computed by Luke Allen (TREC #788149). Refreshed every 30 minutes. Days listed are counted from each listing's list date.</p>

    <div class="mw-cta">
      <a href="/about#contact">${esc(ctaLabel)} for ${esc(areaName)} &rarr;</a>
    </div>
  </div>
  <script type="application/ld+json">${JSON.stringify(dataset).replace(/</g, '\\u003c')}</script>
</section>

<style>
.market-widget{background:linear-gradient(180deg,#faf8f4,#fff);border-top:1px solid #e5dfd4;border-bottom:1px solid #e5dfd4;padding:56px 2rem;}
.mw-inner{max-width:1080px;margin:0 auto;}
.mw-header{margin-bottom:28px;}
.mw-eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#b8935a;font-weight:600;display:block;margin-bottom:10px;}
.mw-header h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(1.8rem,3.5vw,2.4rem);font-weight:500;line-height:1.15;color:#1a1918;letter-spacing:-.01em;margin:0;}
.mw-header h2 em{font-style:italic;color:#b8935a;}
.mw-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px;background:#0f0f0e;padding:24px 20px;border-radius:6px;}
.mw-stat{text-align:center;color:#fff;}
.mw-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.7rem;color:#cda96f;font-weight:500;line-height:1;margin-bottom:6px;}
.mw-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.62);font-weight:500;}
.mw-verdict{padding:20px 24px;border-left:3px solid #b8935a;background:#faf8f4;border-radius:4px;margin-bottom:20px;display:flex;flex-direction:column;gap:6px;}
.mw-verdict-buy{border-left-color:#4a7c59;}
.mw-verdict-sell{border-left-color:#b94a48;}
.mw-verdict-bal{border-left-color:#c58a2f;}
.mw-verdict-label{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#5c5b57;font-weight:600;}
.mw-verdict-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500;color:#1a1918;}
.mw-verdict-detail{font-size:14.5px;color:#5c5b57;line-height:1.6;}
.mw-tiers{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;}
.mw-tier{background:#faf8f4;border:1px solid #e5dfd4;border-radius:4px;padding:14px 12px;text-align:center;}
.mw-tier-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;color:#1a1918;font-weight:500;display:block;line-height:1;margin-bottom:4px;}
.mw-tier-lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#77746d;font-weight:500;}
.mw-source{font-size:12.5px;color:#77746d;line-height:1.6;margin:0 0 20px;text-align:center;}
.mw-cta{text-align:center;padding-top:4px;}
.mw-cta a{display:inline-block;background:#b8935a;color:#fff;text-decoration:none;padding:12px 26px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
.mw-cta a:hover{background:#cda96f;}
@media (max-width:780px){.market-widget{padding:44px 20px;}.mw-stats,.mw-tiers{grid-template-columns:repeat(2,1fr);}.mw-stats .mw-stat:last-child{grid-column:span 2;}}
</style>`;
}

module.exports = { renderMarketWidget, filterToScope, WIDGET_MARKER };
