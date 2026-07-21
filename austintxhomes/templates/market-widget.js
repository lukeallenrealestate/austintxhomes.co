'use strict';

/**
 * Live market widget renderer.
 * Server-side generates an HTML block with active-inventory stats for any
 * filter (school district or subdivision / neighborhood name). Used by the
 * SSR route factory in server.js that injects this block into existing
 * static ISD and neighborhood HTML pages.
 *
 * All numbers come from lib/market-stats.js (30-min in-process cache).
 */

const { activeStats, soldStats, fmt, fmtK, fmtNum } = require('../lib/market-stats');

function renderMarketWidget(filter, opts = {}) {
  const { areaName = 'this area', ctaLabel = 'Get a free CMA', showSold = true } = opts;

  let active, sold;
  try { active = activeStats(filter); } catch (e) { active = null; }
  if (showSold) { try { sold = soldStats(filter, 90); } catch (e) { sold = null; } }

  if (!active) {
    return `<!-- market-widget: no active inventory data for ${areaName} -->`;
  }

  const heat = active.reducedPct >= 55 ? { label: "Buyer's market", cls: 'buy' }
             : active.reducedPct >= 40 ? { label: 'Balanced', cls: 'bal' }
             : { label: "Seller's market", cls: 'sell' };

  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `
<section class="market-widget" id="live-market">
  <div class="mw-inner">
    <div class="mw-header">
      <span class="mw-eyebrow">Live MLS Data · Updated ${now}</span>
      <h2>${areaName} <em>market right now</em></h2>
    </div>

    <div class="mw-stats">
      <div class="mw-stat">
        <div class="mw-num">${fmtNum(active.count)}</div>
        <div class="mw-lbl">Active Listings</div>
      </div>
      <div class="mw-stat">
        <div class="mw-num">${fmt(active.medianPrice)}</div>
        <div class="mw-lbl">Median List Price</div>
      </div>
      <div class="mw-stat">
        <div class="mw-num">${fmt(active.medianPpsf)}</div>
        <div class="mw-lbl">Median $/sqft</div>
      </div>
      <div class="mw-stat">
        <div class="mw-num">${active.medianDom || 'n/a'}</div>
        <div class="mw-lbl">Median DOM</div>
      </div>
      <div class="mw-stat">
        <div class="mw-num">${active.reducedPct}%</div>
        <div class="mw-lbl">Have Cut Price</div>
      </div>
    </div>

    <div class="mw-verdict mw-verdict-${heat.cls}">
      <span class="mw-verdict-label">Current Read</span>
      <span class="mw-verdict-val">${heat.label}</span>
      <span class="mw-verdict-detail">${active.reducedPct}% of ${areaName} listings have reduced from original ask. ${active.newConPct > 15 ? `New construction is ${active.newConPct}% of inventory (${fmtNum(active.newConCount)} homes), builder incentives are live.` : ''}</span>
    </div>

    <div class="mw-tiers">
      <div class="mw-tier"><span class="mw-tier-num">${fmtNum(active.under400k)}</span><span class="mw-tier-lbl">Under $400K</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${fmtNum(active.t400_600k)}</span><span class="mw-tier-lbl">$400K to $600K</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${fmtNum(active.t600k_1m)}</span><span class="mw-tier-lbl">$600K to $1M</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${fmtNum(active.t1m_2m)}</span><span class="mw-tier-lbl">$1M,$2M</span></div>
      <div class="mw-tier"><span class="mw-tier-num">${fmtNum(active.over2m)}</span><span class="mw-tier-lbl">Over $2M</span></div>
    </div>

    ${sold ? `
    <div class="mw-sold">
      <div class="mw-sold-head">Last 90 days closed sales</div>
      <div class="mw-sold-grid">
        <div><span class="mw-sold-num">${fmtNum(sold.count)}</span><span class="mw-sold-lbl">Homes Sold</span></div>
        <div><span class="mw-sold-num">${fmt(sold.medianClose)}</span><span class="mw-sold-lbl">Median Close</span></div>
        <div><span class="mw-sold-num">${sold.avgDom || 'n/a'}</span><span class="mw-sold-lbl">Avg DOM</span></div>
        <div><span class="mw-sold-num">${sold.aboveListPct}%</span><span class="mw-sold-lbl">Above List</span></div>
      </div>
    </div>` : ''}

    <div class="mw-cta">
      <a href="/about#contact">${ctaLabel} for ${areaName} &rarr;</a>
    </div>
  </div>
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
.mw-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:500;}
.mw-verdict{padding:20px 24px;border-left:3px solid #b8935a;background:#faf8f4;border-radius:4px;margin-bottom:20px;display:flex;flex-direction:column;gap:6px;}
.mw-verdict-buy{border-left-color:#4a7c59;}
.mw-verdict-sell{border-left-color:#b94a48;}
.mw-verdict-bal{border-left-color:#c58a2f;}
.mw-verdict-label{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#5c5b57;font-weight:600;}
.mw-verdict-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500;color:#1a1918;}
.mw-verdict-detail{font-size:14.5px;color:#5c5b57;line-height:1.6;}
.mw-tiers{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;}
.mw-tier{background:#faf8f4;border:1px solid #e5dfd4;border-radius:4px;padding:14px 12px;text-align:center;}
.mw-tier-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;color:#1a1918;font-weight:500;display:block;line-height:1;margin-bottom:4px;}
.mw-tier-lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b8880;font-weight:500;}
.mw-sold{background:#0f0f0e;color:#fff;border-radius:6px;padding:22px 24px;margin-bottom:20px;}
.mw-sold-head{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#cda96f;font-weight:600;margin-bottom:14px;}
.mw-sold-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.mw-sold-grid > div{text-align:center;}
.mw-sold-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;color:#cda96f;font-weight:500;line-height:1;display:block;margin-bottom:4px;}
.mw-sold-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:500;}
.mw-cta{text-align:center;padding-top:8px;}
.mw-cta a{display:inline-block;background:#b8935a;color:#fff;text-decoration:none;padding:12px 26px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
.mw-cta a:hover{background:#cda96f;}
@media (max-width:780px){.mw-stats,.mw-tiers{grid-template-columns:repeat(2,1fr);}.mw-sold-grid{grid-template-columns:repeat(2,1fr);}}
</style>`;
}

module.exports = { renderMarketWidget };
