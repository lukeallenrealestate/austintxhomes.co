'use strict';

/**
 * Weekly Austin Market Report Generator
 * ──────────────────────────────────────
 * Runs every Monday at 9am CDT via cron in server.js.
 * Produces two outputs:
 *   1. Google Business Profile blurb (<1500 chars) - emailed to Luke
 *   2. Full SEO blog post (HTML) - published live to /blog/:slug
 *
 * Data: live MLS via merged server (localhost:3002) + FRED mortgage rates
 * Email: Gmail SMTP from idx-search .env credentials
 *
 * Optional env vars:
 *   FRED_API_KEY - free key from https://freddie.stlouisfed.org/docs/api/api_key.html
 *                  enables real-time 30-year mortgage rate in reports
 */

const fs   = require('fs');
const path = require('path');

let nodemailer;
try { nodemailer = require('../../idx-search/node_modules/nodemailer'); }
catch (_) { try { nodemailer = require('nodemailer'); } catch (__) {} }

// REPORTS_FILE uses DATA_DIR env so Render can keep the report log on its
// persistent disk; defaults to in-repo path for Replit / local dev.
const REPORTS_FILE = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'weekly-reports.json')
  : path.join(__dirname, '../data/weekly-reports.json');
const SITEMAP_FILE = path.join(__dirname, '../public/sitemap.xml');
const IDX_API      = process.env.IDX_API_URL || `http://localhost:${process.env.PORT || 3002}`;
const TO_EMAIL     = 'Luke@austinmdg.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = n => '$' + Math.round(n).toLocaleString('en-US');
const fmtK   = n => '$' + Math.round(n / 1000) + 'K';
const fmtNum = n => Math.round(n).toLocaleString('en-US');
const avg    = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
const med    = arr => { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
const pct    = (n, d) => d ? ((n/d)*100).toFixed(1)+'%' : 'N/A';
const sign   = n => n > 0 ? '+'+n.toFixed(2) : n.toFixed(2);

function isoDate(d = new Date())  { return d.toISOString().slice(0,10); }
function slugDate(d = new Date()) { return d.toISOString().slice(0,10); }

function weekRange(d = new Date()) {
  // Monday of this week → Sunday of this week
  const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const opts = { month: 'long', day: 'numeric' };
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.toLocaleDateString('en-US', opts).replace(/\s\d{4}/, '')} to ${sun.getDate()}, ${sun.getFullYear()}`;
  }
  return `${mon.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to ${sun.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

function dateFormatted(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getISOWeek(d = new Date()) {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  return Math.ceil((d - start) / 604800000) + 1;
}

// ── Mortgage Rate (Freddie Mac PMMS scrape) ────────────────────────────────────
// Parses the meta description from https://www.freddiemac.com/pmms which always
// contains the current week's rate and the year-ago rate in plain text.
// Week-over-week change is tracked by storing the previous rate in weekly-reports.json.
async function fetchMortgageRate(prevRate = null) {
  try {
    const resp = await fetch('https://www.freddiemac.com/pmms', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AustinTXHomes market report bot)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // "Mortgage rates this week averaged 6.38%."
    const curMatch  = html.match(/this week averaged\s+([\d.]+)%/i);
    // "last year when they averaged 6.65%"
    const yagoMatch = html.match(/last year when they averaged\s+([\d.]+)%/i);

    if (!curMatch) return null;

    const current  = parseFloat(curMatch[1]);
    const yearAgo  = yagoMatch ? parseFloat(yagoMatch[1]) : null;
    const wowChange = prevRate != null ? parseFloat((current - prevRate).toFixed(2)) : null;
    const yoyBps    = yearAgo  != null ? Math.round((current - yearAgo) * 100) : null;

    return { current, yearAgo, wowChange, yoyBps };
  } catch (e) {
    console.warn('[WeeklyReport] Freddie Mac rate fetch failed:', e.message);
    return null;
  }
}

// ── Fetch MLS Market Data ─────────────────────────────────────────────────────
//
// HISTORY: Earlier versions of this function pulled data via HTTP from the local
// IDX API with `limit=1000` - which silently capped EVERY weekly report at the
// first 1000 listings out of ~22,000 active. That made the "Austin market report"
// a sample-of-the-newest-1000 report, with statistics skewed toward whatever
// ZIP codes had the highest fresh-listing turnover that week.
//
// This version reads ACTRIS MLS data directly from the SQLite database (the
// same DB the IDX server reads from - better-sqlite3 is synchronous and
// extremely fast). No limit. Every active for-sale listing in the Austin
// metro is included. The median, mean, $/sqft, DOM, and reduction-rate
// numbers are now true market-wide aggregates.
//
// Key methodology improvements vs. the API-fetch approach:
//   1. No 1000-listing cap - we aggregate ALL 22K+ active listings
//   2. Price-reduction rate computed from raw_data.OriginalListPrice (truth)
//      instead of the days_on_market > 14 PROXY (which conflated stale
//      Active flags with reduced listings)
//   3. Calculated DOM from listing_contract_date for active stats - the
//      MLS days_on_market field is sparse and unreliable; the contract-date
//      derivation matches what the neighborhood deep-dive reports use
//   4. Closed-sales absorption uses the available 90-day window scaled to
//      a monthly rate - the previous 30-day filter returned zero when the
//      most recent MLS sync was older than 30 days
async function fetchMarketData() {
  let listingDb;
  try {
    listingDb = require('../../idx-search/db/database');
  } catch (e) {
    console.error('[WeeklyReport] failed to load listingDb:', e.message);
    return null;
  }

  try {
    const NOW = Date.now();
    const FOR_SALE_FILTER = `standard_status = 'Active' AND mlg_can_view = 1
      AND list_price >= 75000 AND property_type NOT LIKE '%Lease%'`;

    // ── Active for-sale: every single listing, no limit ────────────────────
    // Pull only the columns we aggregate to keep memory reasonable on a
    // 22K-row pull. raw_data is the expensive blob - we leave it on the row
    // for reduction-rate but only json_extract the one field we need.
    const active = listingDb.prepare(`
      SELECT listing_key, list_price, living_area, days_on_market, city, postal_code,
             listing_contract_date, property_sub_type, new_construction_yn,
             CAST(json_extract(raw_data, '$.OriginalListPrice') AS INTEGER) AS original_list_price
      FROM listings WHERE ${FOR_SALE_FILTER}
    `).all();

    if (!active.length) {
      console.error('[WeeklyReport] no active listings returned from DB');
      return null;
    }

    // ── Closed last 90 days for absorption + sale-to-list ratio ────────────
    // Earlier code tried last-30-days for monthly rate but returned zero when
    // the MLS sync lagged. The 90-day window is always populated; we just
    // divide by 3 to get a monthly rate.
    const closed = listingDb.prepare(`
      SELECT listing_key, list_price, close_price, close_date,
             listing_contract_date, city, postal_code, property_sub_type
      FROM listings
      WHERE standard_status = 'Closed' AND close_price >= 75000
        AND close_date IS NOT NULL
        AND close_date >= date('now', '-90 days')
    `).all();

    // ── In-escrow (Pending + Active Under Contract) ────────────────────────
    const pending = listingDb.prepare(`
      SELECT listing_key, list_price
      FROM listings
      WHERE standard_status IN ('Pending', 'Active Under Contract')
        AND list_price >= 75000
    `).all();

    // Segment slices - derived from the full active set, not separate fetches
    const condos = active.filter(l =>
      l.property_sub_type === 'Condominium' || l.property_sub_type === 'Condo');
    const newCon = active.filter(l => l.new_construction_yn === 1);

    // ── Calculated DOM (more reliable than the raw days_on_market field) ───
    // The MLS days_on_market column is sparse; we derive DOM from
    // listing_contract_date for any active listing. Clamp at 180 to drop
    // the long tail of stale "Active" flags that should have been delisted.
    function calcActiveDom(l) {
      if (!l.listing_contract_date) return null;
      const t = new Date(l.listing_contract_date).getTime();
      if (isNaN(t)) return null;
      const d = Math.floor((NOW - t) / 86_400_000);
      return d >= 0 && d <= 180 ? d : null;
    }

    // ── Core active stats ──────────────────────────────────────────────────
    const prices = active.map(l => l.list_price).filter(Boolean).sort((a,b)=>a-b);
    const doms   = active.map(calcActiveDom).filter(d => d != null);
    const ppsfs  = active.filter(l => l.list_price && l.living_area > 0)
                         .map(l => l.list_price / l.living_area);

    // ── Price reductions: true count from OriginalListPrice (~99.9% covered) ─
    const reducedRows = active.filter(l =>
      l.original_list_price && l.original_list_price > l.list_price);
    const priceReduced = reducedRows.length;
    const reductionPcts = reducedRows.map(l =>
      (l.original_list_price - l.list_price) / l.original_list_price);
    const avgReductionPct = reductionPcts.length ? avg(reductionPcts) : 0;

    // ── Closed stats (months supply, sale-to-list) ─────────────────────────
    // Use the 90-day window scaled to a monthly rate, because last-30-days
    // is often zero due to MLS sync lag. Same definition the deep-dive
    // neighborhood reports use.
    const monthlyRate = Math.round(closed.length / 3);
    const monthsSupply = monthlyRate > 0 ? (active.length / monthlyRate) : null;

    const saleToList = closed
      .filter(l => l.close_price > 0 && l.list_price > 0)
      .map(l => l.close_price / l.list_price * 100);
    const avgSaleToList = saleToList.length ? avg(saleToList) : null;
    const aboveList = saleToList.filter(r => r > 100).length;
    const aboveListPct = saleToList.length ? aboveList / saleToList.length * 100 : null;

    // ── By city ─────────────────────────────────────────────────────────────
    const cityMap = {};
    active.forEach(l => {
      const c = (l.city || '').trim();
      if (!c || c.toLowerCase() === 'unknown') return;
      if (!cityMap[c]) cityMap[c] = { count:0, prices:[], doms:[], closePrices:[], listPrices:[] };
      cityMap[c].count++;
      if (l.list_price) cityMap[c].prices.push(l.list_price);
      const dom = calcActiveDom(l);
      if (dom != null) cityMap[c].doms.push(dom);
    });
    closed.forEach(l => {
      const c = (l.city || '').trim();
      if (cityMap[c] && l.close_price > 0 && l.list_price > 0) {
        cityMap[c].closePrices.push(l.close_price);
        cityMap[c].listPrices.push(l.list_price);
      }
    });

    const cities = Object.entries(cityMap)
      .map(([city, d]) => ({
        city,
        count:      d.count,
        medPrice:   med(d.prices),
        avgDom:     Math.round(avg(d.doms)),
        s2l:        d.closePrices.length ? avg(d.closePrices.map((p,i) => p/d.listPrices[i]*100)) : null,
      }))
      .filter(c => c.count >= 5)
      .sort((a,b) => b.count - a.count);

    // Hot = lowest DOM among meaningful samples; Soft = highest DOM.
    // Require >=20 listings (was >=5) so a single 10-listing town with a
    // freshly listed batch can't anchor the "hot" bucket.
    const hotCities  = [...cities].filter(c => c.avgDom > 0 && c.count >= 20)
                                   .sort((a,b) => a.avgDom - b.avgDom).slice(0, 4);
    const softCities = [...cities].filter(c => c.avgDom > 0 && c.count >= 20)
                                   .sort((a,b) => b.avgDom - a.avgDom).slice(0, 3);

    // ── Condo stats ─────────────────────────────────────────────────────────
    const condoPrices = condos.map(l => l.list_price).filter(Boolean).sort((a,b)=>a-b);
    const condoDoms   = condos.map(calcActiveDom).filter(d => d != null);

    // ── New construction ────────────────────────────────────────────────────
    const newConPct = active.length > 0 ? Math.round(newCon.length / active.length * 100) : 0;

    // ── By zip (for chart) ──────────────────────────────────────────────────
    const zipMap = {};
    active.forEach(l => {
      const z = l.postal_code;
      if (!z || z.length < 5) return;
      if (!zipMap[z]) zipMap[z] = { count:0, prices:[], doms:[] };
      zipMap[z].count++;
      if (l.list_price) zipMap[z].prices.push(l.list_price);
      const dom = calcActiveDom(l);
      if (dom != null) zipMap[z].doms.push(dom);
    });

    const byZip = Object.entries(zipMap)
      .map(([zip, d]) => ({ zip, count: d.count, medPrice: med(d.prices), avgDom: Math.round(avg(d.doms)) }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 8);

    // Per-target-ZIP stats for the ZIP-level GBP blurbs (78701 through 78704).
    // These are the four central-Austin ZIPs Luke posts GBP updates for; each
    // blurb gets its own send-friendly section in the email so he can
    // copy-paste one per Google Business Profile update. Stats include price
    // cuts (from OriginalListPrice) and closed-last-90 which the metro blurb
    // does not break out per-ZIP.
    const TARGET_ZIPS = ['78701', '78702', '78703', '78704'];
    const zipStats = {};
    for (const zip of TARGET_ZIPS) {
      const zActive = active.filter(l => l.postal_code === zip);
      const zClosed = closed.filter(l => l.postal_code === zip);
      const zPrices = zActive.map(l => l.list_price).filter(Boolean);
      const zDoms   = zActive.map(calcActiveDom).filter(d => d != null);
      const zReduced = zActive.filter(l => l.original_list_price && l.original_list_price > l.list_price).length;
      const zNewCon = zActive.filter(l => l.new_construction_yn).length;
      const zClosedPrices = zClosed.map(l => l.close_price).filter(Boolean);
      const zNewThisWeek = zActive.filter(l => {
        const d = calcActiveDom(l);
        return d != null && d <= 7;
      }).length;
      zipStats[zip] = {
        zip,
        count:        zActive.length,
        medPrice:     zPrices.length ? med(zPrices) : 0,
        avgDom:       zDoms.length ? Math.round(avg(zDoms)) : null,
        reducedPct:   zActive.length ? Math.round(zReduced / zActive.length * 100) : 0,
        newConCount:  zNewCon,
        newConPct:    zActive.length ? Math.round(zNewCon / zActive.length * 100) : 0,
        closedLast90: zClosed.length,
        closedMed:    zClosedPrices.length ? med(zClosedPrices) : 0,
        newThisWeek:  zNewThisWeek,
      };
    }

    // "New this week" - listings whose contract_date is within 7 days.
    // Calculated rather than relying on the sparse days_on_market field.
    const newThisWeek = active.filter(l => {
      const d = calcActiveDom(l);
      return d != null && d <= 7;
    }).length;

    return {
      // Active
      totalActive:    active.length,
      medianPrice:    med(prices),
      avgPrice:       Math.round(avg(prices)),
      avgDom:         Math.round(avg(doms)),
      avgPpsf:        Math.round(avg(ppsfs)),
      newThisWeek,
      priceReducedPct: active.length > 0 ? Math.round(priceReduced / active.length * 100) : 0,
      avgReductionPct: avgReductionPct ? parseFloat((avgReductionPct * 100).toFixed(1)) : null,
      under400k:      active.filter(l => l.list_price < 400000).length,
      t400_600k:      active.filter(l => l.list_price >= 400000 && l.list_price < 600000).length,
      t600k_1m:       active.filter(l => l.list_price >= 600000 && l.list_price < 1000000).length,
      over1m:         active.filter(l => l.list_price >= 1000000).length,
      // Market health
      monthsSupply:   monthsSupply ? parseFloat(monthsSupply.toFixed(2)) : null,
      monthlyRate,
      saleToListPct:  avgSaleToList ? parseFloat(avgSaleToList.toFixed(1)) : null,
      aboveListPct:   aboveListPct  ? parseFloat(aboveListPct.toFixed(2))  : null,
      closedCount:    closed.length,
      pendingCount:   pending.length,
      absorption:     monthsSupply == null ? 'unknown' : monthsSupply < 3 ? 'seller' : monthsSupply < 6 ? 'balanced' : 'buyer',
      // Segments
      condoMedian:    med(condoPrices) || null,
      condoAvgDom:    condoDoms.length ? Math.round(avg(condoDoms)) : null,
      condoCount:     condos.length,
      condoS2L:       null,
      newConPct,
      newConCount:    newCon.length,
      // Geography
      cities,
      hotCities,
      softCities,
      byZip,
      zipStats,
    };
  } catch (e) {
    console.error('[WeeklyReport] fetchMarketData error:', e.message);
    return null;
  }
}

// ── SVG Charts ────────────────────────────────────────────────────────────────
function svgHorizontalBar(title, data) {
  const max = Math.max(...data.map(d => d.value), 1);
  const barH = 34, gap = 10, labW = 155, chartW = 500, barMaxW = chartW - labW - 80;
  const svgH = data.length * (barH + gap) + 55;

  const bars = data.map((d, i) => {
    const y = i * (barH + gap) + 40;
    const bw = Math.max(4, Math.round(d.value / max * barMaxW));
    return `
    <text x="${labW - 6}" y="${y + barH/2 + 5}" text-anchor="end" fill="#5c5b57" font-size="12" font-family="Inter,sans-serif">${d.label}</text>
    <rect x="${labW}" y="${y}" width="${bw}" height="${barH}" fill="#b8935a" rx="3" opacity="0.9"/>
    <text x="${labW + bw + 7}" y="${y + barH/2 + 5}" fill="#b8935a" font-size="12" font-weight="600" font-family="Inter,sans-serif">${d.display || d.value}</text>`;
  }).join('');

  return `<figure style="margin:2rem 0;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px;padding:1.5rem">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartW} ${svgH}" style="width:100%;max-width:${chartW}px;display:block;margin:0 auto" role="img" aria-label="${title}">
    <text x="${chartW/2}" y="22" text-anchor="middle" fill="#1a1918" font-size="14" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${title}</text>
    ${bars}
  </svg>
  <figcaption style="font-size:11px;color:#999690;text-align:center;margin-top:.5rem;font-family:Inter,sans-serif">Source: Austin MLS · ${dateFormatted()}</figcaption>
</figure>`;
}

function svgStackedBar(title, segments, total) {
  const w = 500, h = 90;
  const barW = w - 40;
  let x = 20;
  const colors = ['#b8935a', '#cda96f', '#d4b98a', '#e0cca8'];

  const rects = segments.map((d, i) => {
    const bw = Math.max(1, Math.round(d.count / total * barW));
    const r = `<rect x="${x}" y="32" width="${bw}" height="28" fill="${colors[i]}" rx="${i===0?3:0}"/>`;
    x += bw;
    return r;
  }).join('');

  const labels = (() => {
    let lx = 20;
    return segments.map((d, i) => {
      const bw = Math.max(1, Math.round(d.count / total * barW));
      const cx = lx + bw / 2;
      lx += bw;
      const pctVal = Math.round(d.count / total * 100);
      return pctVal > 6
        ? `<text x="${cx}" y="${h - 10}" text-anchor="middle" fill="#5c5b57" font-size="10" font-family="Inter,sans-serif">${d.label}</text>`
        : '';
    }).join('');
  })();

  return `<figure style="margin:2rem 0;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px;padding:1.5rem">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;display:block;margin:0 auto" role="img" aria-label="${title}">
    <text x="${w/2}" y="18" text-anchor="middle" fill="#1a1918" font-size="14" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${title}</text>
    ${rects}${labels}
  </svg>
  <figcaption style="font-size:11px;color:#999690;text-align:center;margin-top:.5rem;font-family:Inter,sans-serif">Source: Austin MLS Active Listings · ${dateFormatted()}</figcaption>
</figure>`;
}

// ── GBP Blurb (structured, < 1500 chars) ─────────────────────────────────────
function generateGbpBlurb(data, rate, weekLabel) {
  const {
    totalActive, medianPrice, avgDom, avgPpsf, newThisWeek,
    monthsSupply, saleToListPct, aboveListPct, priceReducedPct,
    hotCities, softCities, condoMedian, condoAvgDom, condoCount,
    newConPct, pendingCount, absorption, under400k, over1m,
  } = data;

  const mktLine = monthsSupply != null
    ? `${monthsSupply} months supply (${absorption === 'seller' ? "seller's market" : absorption === 'buyer' ? "buyer's market" : 'balanced'})`
    : `${absorption === 'seller' ? "seller's" : absorption === 'buyer' ? "buyer's" : 'balanced'} market`;

  const rateSection = rate
    ? `Mortgage Rates: 30-yr fixed at ${rate.current.toFixed(2)}% (${rate.wowChange != null ? (rate.wowChange > 0 ? '+' : '') + rate.wowChange.toFixed(2) + '% wk/wk' : 'source: Freddie Mac PMMS'})${rate.yoyBps != null ? `. ${Math.abs(rate.yoyBps)} bps ${rate.yoyBps < 0 ? 'lower' : 'higher'} YoY` : ''}.`
    : '';

  const hotLine = hotCities.slice(0, 3)
    .map(c => `${c.city} (${fmtK(c.medPrice)}, ${c.avgDom} DOM)`)
    .join(', ');

  const softLine = softCities.slice(0, 2)
    .map(c => `${c.city} (${c.avgDom} DOM)`)
    .join(', ');

  const condoLine = condoMedian
    ? `Condos: ${fmtK(condoMedian)} median${condoAvgDom ? `, ${condoAvgDom} DOM` : ''}${condoCount ? `, ${condoCount} active` : ''}.`
    : '';

  const newConLine = newConPct
    ? `New Construction: ${newConPct}% of active listings. Builders offering rate buydowns and closing credits.`
    : '';

  const bottomLine = absorption === 'buyer'
    ? `Buyers hold strongest leverage in years. Sellers must price right - overpriced homes are sitting ${avgDom}+ days.`
    : absorption === 'seller'
    ? `Well-priced homes are moving fast. Buyers should get pre-approved and act decisively in this ${mktLine}.`
    : `Market stabilizing. Accurate pricing wins on both sides - overpriced listings are sitting, fairly priced homes are moving.`;

  const lines = [
    `Austin Real Estate Weekly Update: ${weekLabel}`,
    ``,
    `Market Snapshot: Metro median ${fmt(medianPrice)}. ${fmtNum(totalActive)} active listings, ${newThisWeek} new this week. ${priceReducedPct}% of listings have reduced. Avg ${avgDom} DOM.`,
    rateSection,
    ``,
    `Key Metrics:`,
    `• Active listings: ${fmtNum(totalActive)}`,
    monthsSupply != null ? `• Months supply: ${monthsSupply} (${mktLine})` : `• Market condition: ${mktLine}`,
    `• Days on market: ${avgDom}`,
    aboveListPct != null ? `• Selling above list: ${aboveListPct.toFixed(2)}%` : null,
    saleToListPct != null ? `• Avg sale-to-list: ${saleToListPct.toFixed(1)}%` : null,
    ``,
    hotLine  ? `Hot Markets: ${hotLine}` : null,
    softLine ? `Slower Markets: ${softLine}` : null,
    condoLine   || null,
    newConLine  || null,
    ``,
    `https://austintxhomes.co/`,
    ``,
    `Bottom Line: ${bottomLine}`,
  ].filter(l => l !== null).join('\n');

  return lines.length > 1480 ? lines.slice(0, 1477) + '...' : lines;
}

// ── Per-ZIP GBP Blurbs (78701 / 78702 / 78703 / 78704) ───────────────────────
// One blurb per ZIP so Luke can paste each as its own Google Business Profile
// update. Same 1500-char GBP limit as the metro blurb. Each blurb ends with
// a Learn More URL pointing at the highest-intent page for that ZIP; the
// URL choice per ZIP was decided 2026-07-22 in the GBP-update plan.
const ZIP_META = {
  '78701': {
    area:      'Downtown Austin (Rainey Street, 2nd Street District, Warehouse District)',
    learnMore: 'https://austintxhomes.co/sold-homes-near-78701',
  },
  '78702': {
    area:      'East Austin (East Cesar Chavez, Holly, Chestnut, Govalle)',
    learnMore: 'https://austintxhomes.co/sold-homes-near-78702',
  },
  '78703': {
    area:      'Central West Austin (Tarrytown, Clarksville, Old Enfield, Pemberton Heights)',
    learnMore: 'https://austintxhomes.co/best-realtor-78703-austin',
  },
  '78704': {
    area:      'South Austin (Bouldin Creek, Travis Heights, Zilker, Barton Hills)',
    learnMore: 'https://austintxhomes.co/sold-homes-near-78704',
  },
};

function generateZipBlurb(zStat, weekLabel) {
  const meta = ZIP_META[zStat.zip];
  if (!meta || !zStat.count) return null;
  const marketRead = zStat.reducedPct >= 55 ? "Buyer's market"
                   : zStat.reducedPct >= 40 ? 'Balanced'
                   : "Seller's market";

  const lines = [
    `${zStat.zip} Austin Market Update: ${weekLabel}`,
    ``,
    `${meta.area}`,
    ``,
    `Market Snapshot: ${fmtNum(zStat.count)} active listings, ${zStat.newThisWeek} new this week. Median list price ${fmt(zStat.medPrice)}. ${zStat.reducedPct}% of ${zStat.zip} listings have reduced from original ask.`,
    ``,
    `Key Metrics:`,
    `• Active listings: ${fmtNum(zStat.count)}`,
    `• Median list price: ${fmt(zStat.medPrice)}`,
    zStat.avgDom != null ? `• Days on market: ${zStat.avgDom}` : null,
    `• Price cuts: ${zStat.reducedPct}% of listings`,
    zStat.newConPct >= 5 ? `• New construction: ${zStat.newConPct}% of active (${fmtNum(zStat.newConCount)} homes)` : null,
    zStat.closedLast90 > 0 ? `• Closed last 90 days: ${fmtNum(zStat.closedLast90)} (median ${fmt(zStat.closedMed)})` : null,
    ``,
    `Current read on ${zStat.zip}: ${marketRead}.`,
    ``,
    `Buying or selling in ${zStat.zip}? Free buyer representation with Luke Allen, Austin Realtor (TREC #788149). See live comps and neighborhood market data:`,
    ``,
    meta.learnMore,
  ].filter(l => l !== null).join('\n');

  return lines.length > 1480 ? lines.slice(0, 1477) + '...' : lines;
}

function generateAllZipBlurbs(zipStatsObj, weekLabel) {
  const out = [];
  for (const zip of ['78701', '78702', '78703', '78704']) {
    const zStat = zipStatsObj[zip];
    if (!zStat) continue;
    const blurb = generateZipBlurb(zStat, weekLabel);
    if (blurb) out.push({ zip, blurb, learnMore: ZIP_META[zip].learnMore });
  }
  return out;
}

// ── Full Blog Post HTML ───────────────────────────────────────────────────────
function generateBlogPost(data, rate, angle, weekLabel, dateFmt, slug) {
  const {
    totalActive, medianPrice, avgPrice, avgDom, avgPpsf,
    newThisWeek, monthsSupply, saleToListPct, aboveListPct,
    priceReducedPct, under400k, t400_600k, t600k_1m, over1m,
    condoMedian, condoAvgDom, condoCount, newConPct, newConCount,
    hotCities, softCities, cities, byZip, absorption,
    pendingCount, closedCount,
  } = data;

  const mktWord = absorption === 'seller' ? "seller's market" : absorption === 'buyer' ? "buyer's market" : "balanced market";

  const tierChart = svgStackedBar('Active Listings by Price Range', [
    { label: 'Under $400K',  count: under400k },
    { label: '$400K to $600K',  count: t400_600k },
    { label: '$600K to $1M',    count: t600k_1m  },
    { label: 'Over $1M',     count: over1m    },
  ], totalActive);

  const zipChart = svgHorizontalBar('Active Listings by Zip Code',
    byZip.slice(0, 6).map(z => ({
      label:   `${z.zip} · ${fmtK(z.medPrice)}`,
      value:   z.count,
      display: `${z.count} homes`,
    }))
  );

  const cityTable = cities.slice(0, 10).map(c => `
    <tr>
      <td style="padding:.65rem 1rem;font-weight:500">${c.city}</td>
      <td style="padding:.65rem 1rem;text-align:center">${c.count}</td>
      <td style="padding:.65rem 1rem;text-align:right;color:#b8935a;font-weight:600">${fmtK(c.medPrice)}</td>
      <td style="padding:.65rem 1rem;text-align:center">${c.avgDom} days</td>
      ${c.s2l != null ? `<td style="padding:.65rem 1rem;text-align:center;color:${c.s2l >= 100 ? '#5b9e5c' : '#c0392b'}">${c.s2l.toFixed(1)}%</td>` : '<td style="padding:.65rem 1rem;text-align:center;color:#999"> - </td>'}
    </tr>`).join('');

  const rateBlock = rate ? `
<div class="data-highlight"><span class="stat">${rate.current.toFixed(2)}%</span><span class="stat-label">30-Yr Fixed (Freddie Mac PMMS)</span></div>` : '';

  const titles = [
    `Austin Real Estate Market Report - ${weekLabel}`,
    `Austin Home Prices & Inventory - ${weekLabel}`,
    `Austin Market Update by City & Zip - ${weekLabel}`,
    `Austin Buyer vs. Seller Market Analysis - ${weekLabel}`,
  ];

  const excerpts = [
    `Austin real estate weekly report: ${fmtNum(totalActive)} active listings, median ${fmt(medianPrice)}, avg ${avgDom} DOM${monthsSupply ? `, ${monthsSupply} months supply` : ''}. Full MLS breakdown with charts - ${weekLabel}.`,
    `Austin home prices week of ${dateFmt}: median ${fmt(medianPrice)}, ${fmt(avgPpsf)}/sqft, ${fmtNum(totalActive)} active. Price tier breakdown, top zip codes, and city-by-city comparison.`,
    `Austin real estate by city - ${weekLabel}. Top markets: ${hotCities.slice(0,2).map(c=>c.city).join(', ')}. Full zip code and city table with DOM and pricing data.`,
    `Austin ${mktWord} analysis - ${weekLabel}. ${fmtNum(totalActive)} active listings${monthsSupply ? `, ${monthsSupply} months supply` : ''}, avg ${avgDom} DOM. What buyers and sellers need to know right now.`,
  ];

  const heroVideo = `
<div style="position:relative;margin:2rem 0;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:#0f0f0e">
  <video autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;opacity:.65" src="/videos/hero-video.mp4"></video>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:2rem">
    <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;margin-bottom:.75rem">Austin TX · Live MLS Data</p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(1.4rem,4vw,2.4rem);color:#fff;line-height:1.25">${titles[angle]}</p>
    <p style="font-size:.85rem;color:rgba(255,255,255,.65);margin-top:.75rem">${fmtNum(totalActive)} active listings · Median ${fmt(medianPrice)} · ${avgDom} avg days on market</p>
  </div>
</div>`;

  const keyMetricsBlock = `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin:2rem 0">
  ${[
    ['Active Listings', fmtNum(totalActive)],
    ['Median List Price', fmt(medianPrice)],
    ['Avg Days on Market', avgDom + ' days'],
    ['Avg Price/SqFt', fmt(avgPpsf) + '/sqft'],
    monthsSupply != null ? ['Months Supply', monthsSupply] : null,
    aboveListPct != null ? ['Selling Above List', aboveListPct.toFixed(1) + '%'] : null,
    saleToListPct != null ? ['Avg Sale-to-List', saleToListPct.toFixed(1) + '%'] : null,
    ['New This Week', newThisWeek + ' listings'],
    pendingCount ? ['Pending/UC', fmtNum(pendingCount)] : null,
    rate ? ['30-Yr Fixed (PMMS)', rate.current.toFixed(2) + '%'] : null,
  ].filter(Boolean).map(([label, val]) => `
    <div style="background:#faf8f4;border:1px solid #e5dfd4;border-radius:6px;padding:1rem;text-align:center">
      <div style="font-size:1.4rem;font-family:'Cormorant Garamond',Georgia,serif;color:#b8935a;font-weight:600">${val}</div>
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#999690;margin-top:.3rem">${label}</div>
    </div>`).join('')}
</div>`;

  const cityTableBlock = cities.length ? `
<h2>Austin Real Estate by City - ${weekLabel}</h2>
<div style="overflow-x:auto;border-radius:8px;border:1px solid #e5dfd4;margin:1.5rem 0">
  <table style="width:100%;border-collapse:collapse;font-size:.9rem">
    <thead style="background:#0f0f0e">
      <tr>
        <th style="padding:.75rem 1rem;text-align:left;color:rgba(255,255,255,.65);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">City</th>
        <th style="padding:.75rem 1rem;text-align:center;color:rgba(255,255,255,.65);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">Active</th>
        <th style="padding:.75rem 1rem;text-align:right;color:rgba(255,255,255,.65);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">Median Price</th>
        <th style="padding:.75rem 1rem;text-align:center;color:rgba(255,255,255,.65);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">Avg DOM</th>
        <th style="padding:.75rem 1rem;text-align:center;color:rgba(255,255,255,.65);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500">Sale/List</th>
      </tr>
    </thead>
    <tbody>
      ${cityTable}
    </tbody>
  </table>
</div>` : '';

  const condoBlock = condoMedian ? `
<h2>Austin Condo Market - ${weekLabel}</h2>
<p>The Austin condo segment shows distinct dynamics from single-family homes. With ${fmtNum(condoCount)} active condo listings at a median price of ${fmt(condoMedian)} and average ${condoAvgDom} days on market, condos are tracking ${condoAvgDom > avgDom ? 'slower than' : 'in line with'} the broader market. Downtown and central Austin condo buyers currently have meaningful negotiating leverage, particularly on resale units competing with newer inventory.</p>` : '';

  const newConBlock = newConPct ? `
<h2>New Construction - ${weekLabel}</h2>
<p>${newConPct}% of active Austin listings (${fmtNum(newConCount)} homes) are new construction. Builders in the Austin metro are actively using incentives to move inventory: rate buydowns to the low-to-mid 5% range, closing cost credits of $10,000 to $25,000, and extended rate locks up to 8 months. For buyers who can work with a longer timeline, new construction with builder incentives can represent a better effective rate than resale purchases with conventional financing.</p>` : '';

  const internalLinks = `
<div style="margin:2rem 0;padding:1.5rem;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px">
  <p style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#b8935a;margin-bottom:.75rem">Related Resources</p>
  <div style="display:flex;flex-wrap:wrap;gap:.5rem">
    <a href="/market-report" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Live Market Report</a>
    <a href="/austin-buyers-or-sellers-market" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Buyer's or Seller's Market?</a>
    <a href="/fix-and-flip-calculator-austin" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Fix &amp; Flip Calculator</a>
    <a href="/investment-properties" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Investment Properties</a>
    <a href="/buy" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Buy a Home in Austin</a>
    <a href="/sell" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Sell Your Austin Home</a>
  </div>
</div>`;

  const cta = `
<div style="margin:2.5rem 0;padding:2rem;background:#0f0f0e;border-radius:8px;text-align:center">
  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;margin-bottom:.6rem">Austin TX Realtor · TREC #788149</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;color:#fff;margin-bottom:.75rem">Questions about the Austin market?</p>
  <p style="font-size:.9rem;color:rgba(255,255,255,.6);max-width:480px;margin:0 auto 1.5rem">Luke Allen is an Austin TX Realtor specializing in buyer and seller representation. 15 five-star Google reviews. Free consultations.</p>
  <a href="/about#contact" style="display:inline-block;background:#b8935a;color:#fff;padding:.8rem 2rem;border-radius:4px;text-decoration:none;font-size:.9rem;font-weight:500">Schedule a Free Consultation →</a>
</div>`;

  const rateContext = rate ? (() => {
    const loanAmt  = medianPrice * 0.8;
    const mo       = rate.current / 100 / 12;
    const payment  = Math.round(loanAmt * mo / (1 - Math.pow(1 + mo, -360)));
    return `
<h2>Mortgage Rate Context - ${weekLabel}</h2>
<p>The 30-year fixed mortgage rate is <strong>${rate.current.toFixed(2)}%</strong> this week per Freddie Mac's Primary Mortgage Market Survey${rate.wowChange != null ? ` (${rate.wowChange > 0 ? '+' : ''}${rate.wowChange.toFixed(2)}% from last week)` : ''}. ${rate.yoyBps != null ? `Rates are <strong>${Math.abs(rate.yoyBps)} basis points ${rate.yoyBps < 0 ? 'lower' : 'higher'}</strong> than one year ago when they averaged ${rate.yearAgo ? rate.yearAgo.toFixed(2) + '%' : 'higher'}.` : ''} At Austin's median list price of ${fmt(medianPrice)} with 20% down, a buyer financing ${fmt(loanAmt)} at ${rate.current.toFixed(2)}% carries a principal and interest payment of approximately <strong>${fmt(payment)}/month</strong>.</p>`;
  })() : '';

  const content = `
${heroVideo}

<p>This is the live Austin MLS snapshot for <strong>${weekLabel}</strong> - real listing data, updated at report generation time. Not a national estimate. Not Zillow. The actual active inventory and market metrics as of this week.</p>

${keyMetricsBlock}

<h2>Market Overview - ${weekLabel}</h2>
<p>Austin's housing market has <strong>${fmtNum(totalActive)} active for-sale listings</strong> this week${monthsSupply != null ? ` with ${monthsSupply} months of supply - ${monthsSupply < 3 ? "a seller's market by conventional definition" : monthsSupply < 6 ? "approaching balanced territory" : "firmly in buyer's market territory"}` : ''}. The median list price of ${fmt(medianPrice)} and average ${avgDom} days on market tell a story of ${avgDom < 30 ? 'strong demand - homes in good condition are moving quickly' : avgDom < 60 ? 'a methodical market where buyers are taking their time and sellers need accurate pricing' : 'a market that has shifted in buyers\' favor - overpriced listings are sitting and accumulating days on market'}.</p>

<p>${priceReducedPct}% of active Austin listings have seen a price reduction. ${priceReducedPct > 30 ? 'This elevated price-cut rate signals that sellers initially overpriced and are adjusting to meet the market.' : priceReducedPct > 15 ? 'A moderate number of sellers are recalibrating after overpricing at list.' : 'Relatively few sellers are cutting - most are pricing to the current market from day one.'}</p>

${tierChart}

${zipChart}

${rateContext}

${cityTableBlock}

${condoBlock}

${newConBlock}

<h2>What This Means for Buyers</h2>
<p>${absorption === 'buyer' ? `Buyers hold their strongest leverage in years. With ${avgDom} average days on market and ${monthsSupply ? monthsSupply + ' months of supply' : 'elevated inventory'}, there's time to be selective. Use inspection results as a negotiating tool, ask for closing cost assistance, and don't be afraid to submit below asking on homes that have been sitting. ${aboveListPct != null ? `Only ${aboveListPct.toFixed(1)}% of recent sales went above list - competitive offers aren't required.` : ''}` : absorption === 'seller' ? `Even in a seller's market, buyer preparation is everything. Get fully pre-approved before touring, be ready to move within 24 to 48 hours on the right home. ${aboveListPct != null ? `${aboveListPct.toFixed(1)}% of recent sales went above asking price - well-priced homes in good condition are attracting competition.` : ''}` : `In a balanced market, execution matters. Come in with a clean, pre-approved offer. Modest negotiation on price or concessions is reasonable - just don't lowball on homes that are correctly priced.`}</p>

<h2>What This Means for Sellers</h2>
<p>${absorption === 'buyer' ? `Pricing accuracy is not optional. Homes priced above market are sitting ${avgDom}+ days and ultimately selling for less than they would have at an accurate list price. Buyers are comparing everything. Presentation, professional photography, and MLS syndication quality matter more in a slower market - they determine whether you get showings at all.` : absorption === 'seller' ? `Well-priced homes in good condition are moving. The mistake sellers make even in a seller's market is chasing the top of comp range when their home doesn't support it. Price correctly from day one - you'll get more offers and sell faster than a home that starts too high and cuts.` : `Price based on recent closed comps, not what you need to net or what similar homes were selling for 18 months ago. The current Austin market will tell you quickly if you're off - days on market compound fast when a home is overpriced.`}</p>

${cta}
${internalLinks}`;

  return {
    slug,
    title:          titles[angle],
    date:           isoDate(),
    dateFormatted:  dateFmt,
    category:       'Market Update',
    excerpt:        excerpts[angle],
    readTime:       '7 min read',
    tags:           ['Austin Real Estate', 'Market Report', 'Austin TX', 'MLS Data', weekLabel],
    published:      true,
    mortgageRate:   rate ? rate.current : null, // stored for next week's wow diff
    content,
  };
}

// ── Email ─────────────────────────────────────────────────────────────────────
async function sendEmail(gbpBlurb, zipBlurbs, blogPost, weekLabel) {
  if (!nodemailer) { console.warn('[WeeklyReport] nodemailer unavailable - skipping email'); return; }
  const user = process.env.EMAIL_USER, pass = process.env.EMAIL_PASS;
  if (!user || !pass) { console.warn('[WeeklyReport] EMAIL_USER/PASS not set - skipping email'); return; }

  const transport = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth:   { user, pass },
  });

  await transport.sendMail({
    from:    `"${process.env.EMAIL_FROM_NAME || 'Luke Allen'}" <${user}>`,
    to:      TO_EMAIL,
    subject: `Austin Market Reports - ${weekLabel}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Inter,sans-serif;color:#1a1918;max-width:680px;margin:0 auto;padding:1.5rem}
h1{font-family:Georgia,serif;font-weight:400;color:#0f0f0e}
h2{font-family:Georgia,serif;font-weight:400;color:#b8935a;font-size:.95rem;text-transform:uppercase;letter-spacing:.12em;margin-top:2rem}
.gbp{background:#faf8f4;border:1px solid #e5dfd4;border-left:3px solid #b8935a;padding:1.25rem;border-radius:4px;white-space:pre-wrap;font-size:.88rem;line-height:1.75;font-family:monospace}
.btn{display:inline-block;background:#b8935a;color:#fff;padding:.7rem 1.75rem;border-radius:4px;text-decoration:none;font-size:.9rem}
.foot{font-size:11px;color:#999;margin-top:2rem;border-top:1px solid #e5dfd4;padding-top:1rem}
</style></head><body>
<h1>Austin Market Reports - ${weekLabel}</h1>
<p style="color:#5c5b57">Two reports generated from live MLS data. The GBP blurb is ready to paste. The blog post is live.</p>
<h2>Report 1 - Google Business Profile: Metro (paste as-is)</h2>
<p style="font-size:.82rem;color:#999">Character count: ${gbpBlurb.length} / 1500</p>
<div class="gbp">${gbpBlurb.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

${zipBlurbs.map((zb, i) => `
<h2 style="margin-top:2rem">Report ${i + 2} - GBP Update: ${zb.zip} (paste as-is)</h2>
<p style="font-size:.82rem;color:#999">Character count: ${zb.blurb.length} / 1500 &middot; Learn More URL: <a href="${zb.learnMore}" style="color:#b8935a">${zb.learnMore.replace('https://austintxhomes.co','')}</a></p>
<div class="gbp">${zb.blurb.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
`).join('')}

<h2 style="margin-top:2rem">Report ${2 + zipBlurbs.length} - Blog Post Published</h2>
<p><strong>${blogPost.title}</strong></p>
<p style="font-size:.9rem;color:#5c5b57">${blogPost.excerpt}</p>
<p><a href="https://austintxhomes.co/blog/${blogPost.slug}" class="btn">View Live Post →</a></p>
<div class="foot">Generated by AustinTXHomes weekly report system · Every Monday 9am CDT<br>
Luke Allen, TREC #788149 · austintxhomes.co</div>
</body></html>`,
    text: [
      `Austin Market Reports - ${weekLabel}`,
      ``,
      `METRO GBP BLURB (copy/paste):`,
      ``,
      gbpBlurb,
      ...zipBlurbs.map(zb => [
        ``,
        `─────────────────────`,
        ``,
        `${zb.zip} GBP BLURB (copy/paste). Learn More URL: ${zb.learnMore}`,
        ``,
        zb.blurb,
      ].join('\n')),
      ``,
      `─────────────────────`,
      ``,
      `BLOG POST:`,
      `https://austintxhomes.co/blog/${blogPost.slug}`,
    ].join('\n'),
  });

  console.log(`[WeeklyReport] Email sent → ${TO_EMAIL}`);
}

// ── Sitemap ───────────────────────────────────────────────────────────────────
function appendSitemap(slug) {
  try {
    const xml = fs.readFileSync(SITEMAP_FILE, 'utf8');
    const entry = `  <url>\n    <loc>https://austintxhomes.co/blog/${slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n    <lastmod>${isoDate()}</lastmod>\n  </url>\n`;
    fs.writeFileSync(SITEMAP_FILE, xml.replace('</urlset>', entry + '</urlset>'));
  } catch (e) { console.warn('[WeeklyReport] Sitemap update failed:', e.message); }
}

// ── Main export ───────────────────────────────────────────────────────────────
//
// Options:
//   targetDate  - optional ISO date string (YYYY-MM-DD). When provided, the
//                 report's slug, week-range label, and displayed date are
//                 derived from that date instead of today. Used to regenerate
//                 a specific week's report after a bug-fix. If a stored
//                 report already exists with the resulting slug, it is
//                 REPLACED IN PLACE (preserving array position) instead of
//                 unshifting a duplicate - so the public /blog/{slug} URL
//                 keeps its Google indexing and any inbound links.
//   sendEmail   - set to false to skip the notification email. Useful for
//                 backfill regenerations where Luke doesn't need another
//                 email for a week he's already been briefed on.
module.exports = async function generateWeeklyReport(weeklyReportsRef = [], opts = {}) {
  const targetDate = opts.targetDate ? new Date(opts.targetDate + 'T12:00:00Z') : new Date();
  if (isNaN(targetDate.getTime())) {
    console.warn('[WeeklyReport] Invalid targetDate - aborting:', opts.targetDate);
    return null;
  }
  const angle   = getISOWeek(targetDate) % 4;
  const wLabel  = weekRange(targetDate);
  const dateFmt = dateFormatted(targetDate);
  const slug    = `austin-market-report-${slugDate(targetDate)}`;

  console.log(`[WeeklyReport] Generating - ${wLabel} (angle ${angle})${opts.targetDate ? ' [BACKFILL]' : ''}`);

  // Pull previous rate from most recent stored report for week-over-week diff
  const prevRate = weeklyReportsRef.length > 0 && weeklyReportsRef[0].mortgageRate
    ? weeklyReportsRef[0].mortgageRate
    : null;

  const [data, rate] = await Promise.all([fetchMarketData(), fetchMortgageRate(prevRate)]);

  if (!data) {
    console.warn('[WeeklyReport] No MLS data - aborting');
    return null;
  }

  if (rate) console.log(`[WeeklyReport] Freddie Mac rate: ${rate.current}% (wow: ${rate.wowChange != null ? rate.wowChange : 'N/A'}, yoy: ${rate.yoyBps != null ? rate.yoyBps + 'bps' : 'N/A'})`);
  else      console.log(`[WeeklyReport] Freddie Mac fetch failed - mortgage rates omitted from this report`);

  console.log(`[WeeklyReport] MLS: ${data.totalActive} active, median ${fmt(data.medianPrice)}, ${data.avgDom} DOM`);

  const gbpBlurb  = generateGbpBlurb(data, rate, wLabel);
  const zipBlurbs = generateAllZipBlurbs(data.zipStats || {}, wLabel);
  const blogPost  = generateBlogPost(data, rate, angle, wLabel, dateFmt, slug);

  // Persist - replace in place if the slug already exists (backfill case)
  try {
    const existingIdx = weeklyReportsRef.findIndex(p => p.slug === slug);
    if (existingIdx >= 0) {
      weeklyReportsRef[existingIdx] = blogPost;
      console.log(`[WeeklyReport] Replaced existing post at index ${existingIdx}`);
    } else {
      weeklyReportsRef.unshift(blogPost);
      if (weeklyReportsRef.length > 52) weeklyReportsRef.splice(52);
    }
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(weeklyReportsRef, null, 2));
  } catch (e) { console.error('[WeeklyReport] Save failed:', e.message); }

  appendSitemap(slug);

  if (opts.sendEmail !== false) {
    try { await sendEmail(gbpBlurb, zipBlurbs, blogPost, wLabel); }
    catch (e) { console.error('[WeeklyReport] Email failed:', e.message); }
  }

  return blogPost;
};
