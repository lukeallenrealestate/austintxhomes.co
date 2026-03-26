'use strict';

/**
 * Weekly Austin Market Report Generator
 * ──────────────────────────────────────
 * Runs every Monday at 9am CST via the cron in server.js.
 * Produces two outputs:
 *   1. Google Business Profile blurb (<1500 chars) — emailed to Luke
 *   2. Full SEO blog post (HTML) — published live to /blog/:slug
 *
 * Data source: live MLS data from the idx-search API (localhost:3000)
 * Email: Gmail SMTP via idx-search credentials
 */

const fs   = require('fs');
const path = require('path');

// Use nodemailer from idx-search (already installed, no extra install needed)
let nodemailer;
try {
  nodemailer = require('../../idx-search/node_modules/nodemailer');
} catch (e) {
  try { nodemailer = require('nodemailer'); } catch (_) {}
}

const REPORTS_FILE = path.join(__dirname, '../data/weekly-reports.json');
const SITEMAP_FILE = path.join(__dirname, '../public/sitemap.xml');
const IDX_API      = 'http://localhost:3000';
const TO_EMAIL     = 'Luke@austinmdg.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = n  => '$' + Math.round(n).toLocaleString('en-US');
const fmtK = n  => '$' + (Math.round(n / 1000)) + 'K';
const avg  = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
const med  = arr => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)];
};

function getISOWeek(d = new Date()) {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  return Math.ceil((d - start) / 604800000) + 1;
}

function dateStr(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0,10);
}

function slugDate(d = new Date()) {
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

// ── Fetch live MLS data ────────────────────────────────────────────────────────
async function fetchMarketData() {
  const [activeResp, highResp] = await Promise.all([
    fetch(`${IDX_API}/api/properties/search?limit=500&minPrice=75000&forRent=false`),
    fetch(`${IDX_API}/api/properties/search?limit=500&minPrice=75000&forRent=false&sortBy=price_desc`),
  ]);

  const activeData = await activeResp.json();
  const listings   = activeData.listings || [];

  if (!listings.length) return null;

  const prices  = listings.map(l => l.list_price).filter(Boolean).sort((a,b)=>a-b);
  const doms    = listings.map(l => l.days_on_market).filter(x => x != null && x >= 0);
  const ppsfs   = listings
    .filter(l => l.list_price && l.living_area > 0)
    .map(l => l.list_price / l.living_area);

  // By zip code
  const zipMap = {};
  listings.forEach(l => {
    const z = l.postal_code;
    if (!z || z.length < 5) return;
    if (!zipMap[z]) zipMap[z] = { count:0, prices:[], doms:[] };
    zipMap[z].count++;
    if (l.list_price) zipMap[z].prices.push(l.list_price);
    if (l.days_on_market != null && l.days_on_market >= 0) zipMap[z].doms.push(l.days_on_market);
  });

  const byZip = Object.entries(zipMap)
    .map(([zip, d]) => ({
      zip,
      count:    d.count,
      avgPrice: avg(d.prices),
      medPrice: med(d.prices),
      avgDom:   avg(d.doms),
    }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 10);

  // Price reductions (dom > 14 as proxy for stale)
  const stale = listings.filter(l => l.days_on_market > 30).length;

  return {
    totalActive:  listings.length,
    avgPrice:     avg(prices),
    medianPrice:  med(prices),
    avgDom:       avg(doms),
    avgPpsf:      avg(ppsfs),
    newThisWeek:  listings.filter(l => l.days_on_market <= 7).length,
    staleCount:   stale,
    under400k:    listings.filter(l => l.list_price < 400000).length,
    t400_600k:    listings.filter(l => l.list_price >= 400000 && l.list_price < 600000).length,
    t600k_1m:     listings.filter(l => l.list_price >= 600000 && l.list_price < 1000000).length,
    over1m:       listings.filter(l => l.list_price >= 1000000).length,
    byZip,
    // Market pressure indicator
    pctNewThisWeek: listings.length > 0 ? Math.round(listings.filter(l => l.days_on_market <= 7).length / listings.length * 100) : 0,
    absorption: doms.length > 0 ? (avg(doms) < 25 ? 'seller' : avg(doms) < 45 ? 'balanced' : 'buyer') : 'balanced',
  };
}

// ── SVG Chart Generators ───────────────────────────────────────────────────────
function svgHorizontalBar(title, data) {
  // data: [{ label, value, display }]
  const max = Math.max(...data.map(d => d.value), 1);
  const barH = 34;
  const gap  = 10;
  const labW = 130;
  const chartW = 480;
  const barMaxW = chartW - labW - 80;
  const svgH = data.length * (barH + gap) + 55;

  const bars = data.map((d, i) => {
    const y    = i * (barH + gap) + 40;
    const barW = Math.max(4, Math.round(d.value / max * barMaxW));
    return `
    <text x="${labW - 6}" y="${y + barH/2 + 5}" text-anchor="end" fill="#5c5b57" font-size="12" font-family="Inter,system-ui,sans-serif">${d.label}</text>
    <rect x="${labW}" y="${y}" width="${barW}" height="${barH}" fill="#b8935a" rx="3" opacity="0.9"/>
    <text x="${labW + barW + 7}" y="${y + barH/2 + 5}" fill="#b8935a" font-size="12" font-weight="600" font-family="Inter,system-ui,sans-serif">${d.display || d.value}</text>`;
  }).join('');

  return `<figure style="margin:2rem 0;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px;padding:1.5rem">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartW} ${svgH}" style="width:100%;max-width:${chartW}px;display:block;margin:0 auto" role="img" aria-label="${title}">
    <text x="${chartW/2}" y="22" text-anchor="middle" fill="#1a1918" font-size="14" font-weight="600" font-family="Cormorant Garamond,Georgia,serif" letter-spacing="0.02em">${title}</text>
    ${bars}
  </svg>
  <figcaption style="font-size:11px;color:#999690;text-align:center;margin-top:.5rem;font-family:Inter,sans-serif">Source: Austin MLS Active Listings · ${dateStr()}</figcaption>
</figure>`;
}

function svgPieBar(title, segments) {
  // segments: [{ label, count, pct, color }]
  const total = segments.reduce((s,d)=>s+d.count,0);
  const w = 480, h = 80;
  let x = 0;
  const bars = segments.map(d => {
    const bw = Math.round(d.pct / 100 * (w - 60));
    const rect = `<rect x="${20 + x}" y="30" width="${bw}" height="24" fill="${d.color}" rx="2"/>`;
    x += bw;
    return rect;
  }).join('');

  const labels = segments.map((d, i) => {
    let bx = 20;
    for (let j=0;j<i;j++) bx += Math.round(segments[j].pct/100*(w-60));
    const bw = Math.round(d.pct/100*(w-60));
    return `<text x="${bx + bw/2}" y="${h - 8}" text-anchor="middle" fill="#5c5b57" font-size="10" font-family="Inter,sans-serif">${d.label}</text>`;
  }).join('');

  return `<figure style="margin:2rem 0;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px;padding:1.5rem">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;display:block;margin:0 auto" role="img" aria-label="${title}">
    <text x="${w/2}" y="18" text-anchor="middle" fill="#1a1918" font-size="14" font-weight="600" font-family="Cormorant Garamond,Georgia,serif">${title}</text>
    ${bars}${labels}
  </svg>
  <figcaption style="font-size:11px;color:#999690;text-align:center;margin-top:.5rem;font-family:Inter,sans-serif">Source: Austin MLS Active Listings · ${dateStr()}</figcaption>
</figure>`;
}

// ── GBP Blurb (< 1500 chars) ──────────────────────────────────────────────────
function generateGbpBlurb(data, angle, weekLabel) {
  const { totalActive, medianPrice, avgDom, avgPpsf, newThisWeek, absorption, byZip, over1m, under400k } = data;
  const topZip = byZip[0];
  const mktWord = absorption === 'seller' ? "seller's market" : absorption === 'buyer' ? "buyer's market" : "balanced market";

  const angles = [
    // 0 — Inventory
    `Austin TX Real Estate Update — ${weekLabel}\n\n${totalActive} homes are currently active for sale in the Austin metro. ${newThisWeek} new listings hit the market in the past 7 days. Median list price: ${fmt(medianPrice)}. Average days on market: ${avgDom} days — ${avgDom < 25 ? 'demand is strong and well-priced homes are moving fast' : avgDom < 45 ? 'buyers have more options and time to decide' : 'sellers need to price competitively to attract offers'}.\n\nPrice per square foot is averaging ${fmt(avgPpsf)}/sqft across active Austin listings. ${under400k} homes are priced under $400K; ${over1m} are listed above $1M.\n\nCurrently a ${mktWord} in Austin. If you're buying or selling in Austin TX, reach out to Luke Allen — local Austin Realtor, TREC #788149. Free buyer and seller consultations. (254) 718-2567 · austintxhomes.co`,

    // 1 — Pricing
    `Austin TX Home Prices — ${weekLabel}\n\nActive Austin MLS listings: ${totalActive} homes for sale. Median list price sits at ${fmt(medianPrice)} with an average of ${fmt(avgPpsf)}/sqft. The highest-activity zip code is ${topZip?.zip || '78704'} with ${topZip?.count || 0} active homes averaging ${fmtK(topZip?.avgPrice || 0)}.\n\nAvg days on market: ${avgDom}. ${avgDom < 30 ? 'Properly priced homes are selling quickly — overpricing leads to extended time on market and eventual price cuts.' : 'Buyers have negotiating room in the current Austin market — inspection objections and seller concessions are more common than in 2021-2022.'}\n\nLooking for Austin TX home values or thinking about selling? Luke Allen is a local Austin Realtor (TREC #788149) who provides free, data-driven home valuations. (254) 718-2567 · austintxhomes.co`,

    // 2 — Neighborhood
    `Austin TX Real Estate by Neighborhood — ${weekLabel}\n\nTop Austin zip codes by active listings this week:\n${byZip.slice(0,4).map(z => `· ${z.zip}: ${z.count} homes, avg ${fmtK(z.avgPrice)}, avg ${z.avgDom} DOM`).join('\n')}\n\nTotal metro active inventory: ${totalActive} homes. Median price: ${fmt(medianPrice)}. Avg days on market: ${avgDom} — currently a ${mktWord}.\n\nWhether you're looking in central Austin or the suburbs, Luke Allen provides expert buyer and seller representation across all Austin zip codes. TREC #788149. (254) 718-2567 · austintxhomes.co`,

    // 3 — Market conditions
    `Austin TX Market Conditions — ${weekLabel}\n\n${totalActive} homes active on Austin MLS. Current average days on market: ${avgDom} — indicating a ${mktWord}. ${newThisWeek} new listings entered the market this week.\n\n${absorption === 'seller' ? 'In a seller\'s market, buyers should get pre-approved before touring, write strong offers, and avoid over-negotiating on minor inspection items.' : absorption === 'buyer' ? 'In a buyer\'s market, ask for seller concessions, schedule multiple showings, and use inspection results as a negotiating tool.' : 'In a balanced market, well-priced homes in good condition sell quickly while overpriced homes sit. Strategy matters on both sides.'}\n\nMedian price: ${fmt(medianPrice)} · Avg ${fmt(avgPpsf)}/sqft. Luke Allen, Austin TX Realtor TREC #788149. Free consultations. (254) 718-2567 · austintxhomes.co`,
  ];

  const blurb = angles[angle];
  // Hard cap at 1450 chars to stay safely under 1500
  return blurb.length > 1450 ? blurb.slice(0, 1447) + '...' : blurb;
}

// ── Full Blog Post ────────────────────────────────────────────────────────────
function generateBlogPost(data, angle, weekLabel, dateFormatted, slug) {
  const { totalActive, medianPrice, avgPrice, avgDom, avgPpsf, newThisWeek,
          staleCount, under400k, t400_600k, t600k_1m, over1m, byZip, absorption, pctNewThisWeek } = data;

  const mktWord    = absorption === 'seller' ? "seller's market" : absorption === 'buyer' ? "buyer's market" : "balanced market";
  const mktAdvice  = {
    seller: 'Sellers hold the advantage — well-priced homes in good condition are generating offers quickly. Aggressive pricing, however, remains punished. Buyers are comparing.',
    buyer:  'Buyers have more leverage than any point since 2019. Inspection requests are being honored, seller concessions are on the table, and days on market give buyers time to decide.',
    balanced: 'Neither buyers nor sellers have a commanding edge. Homes in excellent condition at accurate prices move; everything else sits. Execution — pricing, staging, marketing — matters more than ever.',
  }[absorption];

  const topZips = byZip.slice(0, 6);

  // SVG Chart 1: Price tier distribution
  const tierChart = svgPieBar('Austin Active Listings by Price Range', [
    { label: 'Under $400K',   count: under400k, pct: Math.round(under400k/totalActive*100),  color: '#b8935a' },
    { label: '$400K–$600K',   count: t400_600k, pct: Math.round(t400_600k/totalActive*100),  color: '#cda96f' },
    { label: '$600K–$1M',     count: t600k_1m,  pct: Math.round(t600k_1m/totalActive*100),   color: '#d4b98a' },
    { label: 'Over $1M',      count: over1m,    pct: Math.round(over1m/totalActive*100),      color: '#e5dfd4' },
  ].filter(d => d.count > 0));

  // SVG Chart 2: Top zip codes by active listings
  const zipChart = svgHorizontalBar('Active Listings by Zip Code (Top 6)',
    topZips.map(z => ({
      label:   `${z.zip} · ${fmtK(z.avgPrice)} avg`,
      value:   z.count,
      display: `${z.count} homes`,
    }))
  );

  const titles = [
    `Austin Real Estate Inventory Report — ${weekLabel}`,
    `Austin Home Price Tracker — ${weekLabel}`,
    `Austin Real Estate Neighborhood Spotlight — ${weekLabel}`,
    `Austin Market Conditions Report — ${weekLabel}`,
  ];

  const excerpts = [
    `Live Austin MLS data for the week of ${dateFormatted}: ${totalActive} active listings, median price ${fmt(medianPrice)}, avg ${avgDom} days on market. Full inventory breakdown with charts.`,
    `Austin home prices week of ${dateFormatted}: median ${fmt(medianPrice)}, avg ${fmt(avgPpsf)}/sqft, ${totalActive} active listings. Price tier breakdown and top zip codes by activity.`,
    `Austin real estate by neighborhood — week of ${dateFormatted}. Top zip codes: ${topZips.slice(0,3).map(z=>z.zip).join(', ')}. ${totalActive} active listings, median ${fmt(medianPrice)}.`,
    `Is Austin a buyer's or seller's market right now? Week of ${dateFormatted}: ${totalActive} active listings, avg ${avgDom} DOM, median price ${fmt(medianPrice)}. Full market conditions analysis.`,
  ];

  const intros = [
    `<p>Every Monday morning I pull a fresh snapshot of the Austin MLS — active for-sale listings, days on market, price trends — and write up what the data actually shows. This isn't a national report or a Zillow estimate. It's the real Austin MLS picture as of the week of <strong>${dateFormatted}</strong>.</p>
<p>This week's focus: <strong>inventory</strong> — how many homes are active, what came on this week, and what the supply picture means for buyers and sellers right now.</p>`,

    `<p>Price trends in Austin real estate move faster than most national reports capture. This is a direct MLS snapshot for the week of <strong>${dateFormatted}</strong> — ${totalActive} active for-sale listings, aggregated to show where Austin pricing actually stands right now at the zip code level.</p>
<p>This week's focus: <strong>pricing and value</strong> — what active Austin homes are priced at, price per square foot by area, and what the data tells us about where the market is headed.</p>`,

    `<p>The Austin real estate market is really ten markets in one — central neighborhoods, east side, south Austin, the northern suburbs, the Hill Country fringe. This week's report for <strong>${dateFormatted}</strong> breaks down the MLS data by zip code so you can see which areas have the most activity, the best values, and the most competition.</p>`,

    `<p>Is Austin a buyer's market or a seller's market right now? The answer is in the data — specifically days on market, new listing velocity, and price tier distribution. Here's the full picture for the week of <strong>${dateFormatted}</strong>, straight from the Austin MLS.</p>`,
  ];

  const bodies = [
    // 0 — Inventory
    `<h2>Austin MLS Snapshot — Week of ${weekLabel}</h2>
<div class="data-highlight"><span class="stat">${totalActive.toLocaleString()}</span><span class="stat-label">Active For-Sale Listings</span></div>
<div class="data-highlight"><span class="stat">${fmt(medianPrice)}</span><span class="stat-label">Median List Price</span></div>
<div class="data-highlight"><span class="stat">${avgDom} days</span><span class="stat-label">Avg Days on Market</span></div>
<div class="data-highlight"><span class="stat">${newThisWeek}</span><span class="stat-label">New Listings (Last 7 Days)</span></div>
<div class="data-highlight"><span class="stat">${fmt(avgPpsf)}/sqft</span><span class="stat-label">Avg Price Per Sq Ft</span></div>

${tierChart}

<p>${pctNewThisWeek}% of active Austin listings entered the market within the last 7 days — ${newThisWeek} new homes. That's ${pctNewThisWeek > 15 ? 'a strong pace of new supply entering the market, giving buyers more options each week' : pctNewThisWeek > 8 ? 'a healthy cadence of new inventory, consistent with a functioning market' : 'a relatively slow pace of new listings — inventory is tighter than average and buyers are competing for fewer options'}.</p>

<h2>What ${totalActive} Active Listings Actually Means</h2>
<p>In a metro area of nearly 2.4 million people, ${totalActive} active for-sale listings equates to roughly ${Math.round(totalActive / 24)} months of supply at current absorption rates — ${absorption === 'seller' ? '<strong>a seller\'s market by any standard measure.</strong> Buyers need to be decisive and pre-approved.' : absorption === 'buyer' ? '<strong>approaching buyer\'s market territory.</strong> Sellers need to price accurately and present their homes well.' : '<strong>a balanced market</strong> where execution on both sides determines outcome.'}  ${mktAdvice}</p>

<h2>Where the Stale Inventory Is</h2>
<p>${staleCount} active listings (${Math.round(staleCount/totalActive*100)}% of the market) have been on the market more than 30 days. These are the homes where price reductions are most common and buyer leverage is greatest. If you're a patient buyer willing to look at longer-DOM properties, this is where negotiating room lives in the current Austin market.</p>

<h2>Price Tier Breakdown</h2>
<ul>
<li><strong>Under $400K:</strong> ${under400k} homes (${Math.round(under400k/totalActive*100)}% of market) — the most competitive price range; first-time buyers and investors competing for limited supply</li>
<li><strong>$400K–$600K:</strong> ${t400_600k} homes (${Math.round(t400_600k/totalActive*100)}%) — Austin's largest move-up segment; suburban growth corridors dominating this tier</li>
<li><strong>$600K–$1M:</strong> ${t600k_1m} homes (${Math.round(t600k_1m/totalActive*100)}%) — central Austin and established suburban neighborhoods; strong second-move buyer demand</li>
<li><strong>Over $1M:</strong> ${over1m} homes (${Math.round(over1m/totalActive*100)}%) — custom builds, premium neighborhoods, and Westlake/Tarrytown/Rob Roy properties</li>
</ul>`,

    // 1 — Pricing
    `<h2>Austin Home Price Snapshot — ${weekLabel}</h2>
<div class="data-highlight"><span class="stat">${fmt(medianPrice)}</span><span class="stat-label">Median List Price</span></div>
<div class="data-highlight"><span class="stat">${fmt(avgPrice)}</span><span class="stat-label">Average List Price</span></div>
<div class="data-highlight"><span class="stat">${fmt(avgPpsf)}/sqft</span><span class="stat-label">Avg Price Per Sq Ft</span></div>
<div class="data-highlight"><span class="stat">${avgDom} days</span><span class="stat-label">Avg Days on Market</span></div>

${zipChart}

<h2>What the Median vs. Average Gap Tells Us</h2>
<p>The gap between Austin's median list price (${fmt(medianPrice)}) and average list price (${fmt(avgPrice)}) is ${fmt(Math.abs(avgPrice - medianPrice))}. ${avgPrice > medianPrice ? 'The average being higher than the median signals that luxury listings ($1M+) are pulling the average up — but the typical Austin home transaction is happening closer to the median.' : 'The average sitting below the median is unusual and suggests a cluster of lower-priced listings is skewing the data downward.'}  When evaluating whether a specific home is priced fairly, median is the more useful benchmark.</p>

<h2>Price Per Square Foot by Area</h2>
<p>At ${fmt(avgPpsf)}/sqft metro-wide, Austin's value per square foot varies enormously by location. Central zip codes like 78703 and 78704 routinely trade at $450–650/sqft for renovated properties. Suburban growth corridors — Pflugerville, Manor, Kyle — typically trade at $175–250/sqft. When you see a listing priced at $X/sqft, the only meaningful comparison is to other homes in the same zip code with similar finishes and condition.</p>

${tierChart}

<h2>Price Tier Analysis</h2>
<p>The under-$400K segment (${under400k} homes, ${Math.round(under400k/totalActive*100)}% of market) remains the most supply-constrained relative to demand. This is where multiple offers still happen regularly. At the other end, the $1M+ segment (${over1m} homes, ${Math.round(over1m/totalActive*100)}% of market) has seen the largest adjustment since peak prices in 2022 — buyers at that price point have more negotiating room and longer inspection periods.</p>`,

    // 2 — Neighborhood Spotlight
    `<h2>Austin Real Estate by Zip Code — ${weekLabel}</h2>
<div class="data-highlight"><span class="stat">${totalActive.toLocaleString()}</span><span class="stat-label">Total Metro Active Listings</span></div>
<div class="data-highlight"><span class="stat">${fmt(medianPrice)}</span><span class="stat-label">Metro Median Price</span></div>
<div class="data-highlight"><span class="stat">${avgDom} days</span><span class="stat-label">Metro Avg Days on Market</span></div>

${zipChart}

<h2>Top Zip Codes This Week</h2>
${topZips.map(z => `<h3>${z.zip} — ${z.count} Active Listings · Avg ${fmtK(z.avgPrice)} · ${z.avgDom} avg DOM</h3>
<p>With ${z.count} active listings and an average price of ${fmt(z.avgPrice)}, zip code ${z.zip} is one of Austin's most active markets this week. Average days on market of ${z.avgDom} ${z.avgDom < 20 ? 'suggests strong buyer demand — homes here are moving quickly.' : z.avgDom < 40 ? 'indicates a balanced pace — neither rushed nor sluggish.' : 'reflects softer demand or overpricing relative to buyer expectations in this submarket.'}</p>`).join('')}

${tierChart}

<h2>Reading the Zip Code Data</h2>
<p>Zip code activity count (number of active listings) tells you about supply. Average days on market tells you about demand relative to that supply. A zip code with low listing count and low DOM is undersupplied — prices there tend to hold firm. A zip code with high listing count and high DOM is oversupplied — buyers have leverage. The most competitive situations are low inventory + low DOM = multiple offers.</p>`,

    // 3 — Market Conditions
    `<h2>Austin Market Conditions — ${weekLabel}</h2>
<div class="data-highlight"><span class="stat">${avgDom} days</span><span class="stat-label">Avg Days on Market</span></div>
<div class="data-highlight"><span class="stat">${totalActive.toLocaleString()}</span><span class="stat-label">Active Listings</span></div>
<div class="data-highlight"><span class="stat">${newThisWeek}</span><span class="stat-label">New Listings (7 Days)</span></div>
<div class="data-highlight"><span class="stat">${fmt(medianPrice)}</span><span class="stat-label">Median List Price</span></div>

${tierChart}
${zipChart}

<h2>The Verdict: ${mktWord === "seller's market" ? "Seller's Market" : mktWord === "buyer's market" ? "Buyer's Market" : "Balanced Market"}</h2>
<p>The primary indicator of market conditions in real estate is days on market. At ${avgDom} days on average, Austin is currently a <strong>${mktWord}</strong>. ${mktAdvice}</p>

<h2>What This Means If You're Buying</h2>
<p>${absorption === 'seller' ? `In a seller's market, preparation is everything. Get fully pre-approved (not just pre-qualified) before touring homes. When you find the right property, be prepared to move within 24–48 hours. Avoid lowball offers — they lose deals. If you're competing with other buyers, consider an escalation clause, fewer contingencies, or a flexible close date.` : absorption === 'buyer' ? `Use the leverage you have: ask for closing cost assistance (2–3% of purchase price is reasonable right now), request longer inspection periods, and push back on anything you find in the inspection. Sellers are often motivated and willing to negotiate items they wouldn't have touched in 2021-2022.` : `In a balanced market, the outcome depends on execution. Well-priced homes still sell quickly; overpriced ones sit. Get pre-approved, move decisively on homes you like, but don't overpay just because you feel urgency that isn't there.`}</p>

<h2>What This Means If You're Selling</h2>
<p>${absorption === 'seller' ? `Pricing correctly still matters — the fastest sales happen when sellers price accurately on day one rather than chasing the market down. Buyers are comparing everything. Presentation and marketing quality determine whether you get multiple offers or watch other homes in your area sell while yours sits.` : absorption === 'buyer' ? `Price your home based on recent closed sales, not what you'd like to net. Over-listing is the #1 mistake sellers make in a soft market — it extends days on market, triggers price cuts, and signals weakness. A home priced right from day one sells faster and for more than one that starts high and cuts.` : `In today's Austin market, sellers who price to comps and present their homes well are getting reasonable offers within 30 days. Sellers who test the market with aggressive pricing are sitting — and sitting costs money in taxes, carrying costs, and opportunity.`}</p>`,
  ];

  // Hero video section
  const heroVideo = `
<div style="position:relative;margin:2rem 0;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:#0f0f0e">
  <video autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;opacity:.7"
         src="/videos/hero-video.mp4">
  </video>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:2rem">
    <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;margin-bottom:.75rem">Austin TX Real Estate</p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(1.5rem,4vw,2.5rem);color:#fff;line-height:1.25">${titles[angle]}</p>
  </div>
</div>`;

  // Internal links
  const internalLinks = `
<div style="margin:2rem 0;padding:1.5rem;background:#faf8f4;border:1px solid #e5dfd4;border-radius:8px">
  <p style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#b8935a;margin-bottom:.75rem">Related Resources</p>
  <div style="display:flex;flex-wrap:wrap;gap:.5rem">
    <a href="/market-report" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Live Market Report</a>
    <a href="/investment-properties" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Investment Properties</a>
    <a href="/fix-and-flip-calculator-austin" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Fix &amp; Flip Calculator</a>
    <a href="/buy" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Buy a Home in Austin</a>
    <a href="/sell" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Sell Your Austin Home</a>
    <a href="/austin-buyers-or-sellers-market" style="font-size:13px;color:#b8935a;text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:.3rem .9rem">Buyer's or Seller's Market?</a>
  </div>
</div>`;

  // CTA
  const ctaSection = `
<div style="margin:2.5rem 0;padding:2rem;background:#0f0f0e;border-radius:8px;text-align:center">
  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;margin-bottom:.6rem">Work with Luke Allen · Austin TX Realtor</p>
  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;color:#fff;margin-bottom:.75rem">Questions about the Austin market?</p>
  <p style="font-size:.9rem;color:rgba(255,255,255,.6);margin-bottom:1.5rem;max-width:480px;margin-left:auto;margin-right:auto">Luke Allen is an Austin TX Realtor (TREC #788149) specializing in buyer and seller representation across all Austin zip codes. 15 five-star Google reviews.</p>
  <a href="/about#contact" style="display:inline-block;background:#b8935a;color:#fff;padding:.8rem 2rem;border-radius:4px;text-decoration:none;font-size:.9rem;font-weight:500">Schedule a Free Consultation →</a>
</div>`;

  const content = heroVideo + intros[angle] + bodies[angle] + ctaSection + internalLinks;

  return {
    slug,
    title:           titles[angle],
    date:            isoDate(),
    dateFormatted,
    category:        'Market Update',
    excerpt:         excerpts[angle],
    readTime:        '6 min read',
    tags:            ['Austin Real Estate', 'Market Report', 'Austin TX', 'MLS Data', weekLabel],
    published:       true,
    content,
  };
}

// ── Email Sender ───────────────────────────────────────────────────────────────
async function sendEmail(gbpBlurb, blogPost, weekLabel) {
  if (!nodemailer) {
    console.warn('[WeeklyReport] nodemailer not available — skipping email');
    return;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    console.warn('[WeeklyReport] EMAIL_USER / EMAIL_PASS not set — skipping email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth:   { user: emailUser, pass: emailPass },
  });

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Inter, system-ui, sans-serif; color: #1a1918; max-width: 680px; margin: 0 auto; }
  h1   { font-family: Georgia, serif; font-weight: 400; color: #0f0f0e; }
  h2   { font-family: Georgia, serif; font-weight: 400; color: #b8935a; font-size: 1rem; text-transform: uppercase; letter-spacing: .12em; }
  .gbp { background: #faf8f4; border: 1px solid #e5dfd4; border-left: 3px solid #b8935a; padding: 1.25rem; border-radius: 4px; white-space: pre-wrap; font-size: .92rem; line-height: 1.7; }
  .link-btn { display: inline-block; background: #b8935a; color: #fff; padding: .7rem 1.75rem; border-radius: 4px; text-decoration: none; font-size: .9rem; }
  .footer { font-size: 11px; color: #999; margin-top: 2rem; border-top: 1px solid #e5dfd4; padding-top: 1rem; }
</style></head>
<body>
<h1>Austin Market Report — ${weekLabel}</h1>
<p style="color:#5c5b57;font-size:.95rem">Your two automated weekly reports are ready. Data is pulled live from your MLS database.</p>

<h2>Report 1 — Google Business Profile Update</h2>
<p style="font-size:.88rem;color:#5c5b57">Copy and paste the text below into your Google Business profile post:</p>
<div class="gbp">${gbpBlurb}</div>
<p style="font-size:.82rem;color:#999;margin-top:.5rem">Character count: ${gbpBlurb.length} / 1500</p>

<h2 style="margin-top:2rem">Report 2 — Weekly Blog Post Published</h2>
<p style="font-size:.92rem;color:#1a1918"><strong>${blogPost.title}</strong></p>
<p style="font-size:.9rem;color:#5c5b57">${blogPost.excerpt}</p>
<p><a href="https://austintxhomes.co/blog/${blogPost.slug}" class="link-btn">View Live Post →</a></p>

<div class="footer">
  <p>Generated by AustinTXHomes automated report system · Every Monday 9am CST<br>
  Data source: Austin MLS active listings database · Luke Allen, TREC #788149</p>
</div>
</body>
</html>`;

  await transporter.sendMail({
    from:    `"${process.env.EMAIL_FROM_NAME || 'Luke Allen'}" <${emailUser}>`,
    to:      TO_EMAIL,
    subject: `Austin Market Report — ${weekLabel}`,
    html:    htmlBody,
    text:    `Austin Market Report — ${weekLabel}\n\nGOOGLE BUSINESS PROFILE BLURB:\n\n${gbpBlurb}\n\nBLOG POST:\nhttps://austintxhomes.co/blog/${blogPost.slug}`,
  });

  console.log(`[WeeklyReport] Email sent to ${TO_EMAIL} for week ${weekLabel}`);
}

// ── Update sitemap ────────────────────────────────────────────────────────────
function appendSitemap(slug) {
  try {
    const xml     = fs.readFileSync(SITEMAP_FILE, 'utf8');
    const entry   = `  <url>\n    <loc>https://austintxhomes.co/blog/${slug}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n    <lastmod>${isoDate()}</lastmod>\n  </url>\n`;
    const updated = xml.replace('</urlset>', entry + '</urlset>');
    fs.writeFileSync(SITEMAP_FILE, updated);
  } catch (e) {
    console.warn('[WeeklyReport] Could not update sitemap:', e.message);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {Array} weeklyReportsRef — in-memory array to prepend the new post to
 * @returns {Object|null} the new post object, or null if data unavailable
 */
module.exports = async function generateWeeklyReport(weeklyReportsRef = []) {
  const now         = new Date();
  const weekNum     = getISOWeek(now);
  const angle       = weekNum % 4;               // 0-3 rotates the report angle
  const weekLabel   = `Week of ${dateStr(now)}`;
  const dateFormatted = dateStr(now);
  const slug        = `austin-market-report-${slugDate(now)}`;

  console.log(`[WeeklyReport] Generating report for ${weekLabel} (angle ${angle})...`);

  let data;
  try {
    data = await fetchMarketData();
  } catch (e) {
    console.error('[WeeklyReport] Failed to fetch market data:', e.message);
    return null;
  }

  if (!data || !data.totalActive) {
    console.warn('[WeeklyReport] No market data available — aborting');
    return null;
  }

  console.log(`[WeeklyReport] Market data: ${data.totalActive} active listings, median ${fmt(data.medianPrice)}, avg ${data.avgDom} DOM`);

  const gbpBlurb = generateGbpBlurb(data, angle, weekLabel);
  const blogPost = generateBlogPost(data, angle, weekLabel, dateFormatted, slug);

  // Save to weekly-reports.json
  try {
    weeklyReportsRef.unshift(blogPost);
    if (weeklyReportsRef.length > 52) weeklyReportsRef.splice(52);
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(weeklyReportsRef, null, 2));
    console.log(`[WeeklyReport] Saved post "${blogPost.slug}" to weekly-reports.json`);
  } catch (e) {
    console.error('[WeeklyReport] Failed to save reports file:', e.message);
  }

  // Update sitemap
  appendSitemap(slug);

  // Send email
  try {
    await sendEmail(gbpBlurb, blogPost, weekLabel);
  } catch (e) {
    console.error('[WeeklyReport] Email failed:', e.message);
  }

  return blogPost;
};
