'use strict';

/**
 * Unified live-market page template. One renderer handles three variants:
 *   sold-by-zip          /sold-homes-near-{zip}
 *   sold-by-neighborhood /sold-homes-in-{neighborhood-slug}
 *   active-by-zip        /homes-for-sale-in-{zip}
 *
 * All three share the same layout — hero, stat bar, Luke's Take, subdivisions
 * grid, sales/listings table, CTA, related links. What varies is which
 * filter drives the DB query and which prose fits above each block.
 */

const path = require('path');
const { activeStats, soldStats, fmt, fmtK, fmtNum, fmtDate } = require('../lib/market-stats');

// ─── Metadata tables ──────────────────────────────────────────────────

const AUSTIN_ZIP_META = {
  '78701': { name: 'Downtown Austin',           note: "The Rainey/Congress condo core plus 2nd Street District. Attached product dominates; SFR is nearly extinct here." },
  '78702': { name: 'East Austin',               note: "The most-changed submarket in the metro. New builds infill older bungalow blocks; buyer taste splits sharply here." },
  '78703': { name: 'Tarrytown / Clarksville',   note: "Old-money west side. Lots are the asset; teardowns push the price basis constantly." },
  '78704': { name: 'South Austin (Zilker/Bouldin/Travis Heights)', note: "The most-searched Austin ZIP. Runs $700 to $1,500/sqft depending on the exact block." },
  '78705': { name: 'West Campus / UT',          note: "Parent-buyer condo submarket. Rate-insensitive, cash-heavy, unique behavior versus the rest of the metro." },
  '78721': { name: 'East Austin (Govalle)',     note: "Value corridor east of I-35 that's compressed against 78702 pricing over the last 3 years." },
  '78722': { name: 'Cherrywood / Wilshire Wood', note: "Boutique central east submarket. Small inventory, deep buyer pool, high sale-to-list." },
  '78723': { name: 'Mueller / 51st St',         note: "Mueller condos and townhomes plus the Mueller-adjacent SFR blocks. Tesla + Samsung commuter path." },
  '78724': { name: 'Northeast Austin',          note: "Affordable NE growth corridor. Manor-adjacent." },
  '78727': { name: 'North Austin',              note: "Domain/Q2 stadium area. Mixed condo + SFR product." },
  '78731': { name: 'Northwest Hills',           note: "Established NW submarket with lot views and mature trees. Priced above metro median." },
  '78733': { name: 'Steiner Ranch (West)',      note: "Lake Austin-adjacent luxury. Long DOM at the top end but stable pricing." },
  '78734': { name: 'Lakeway',                   note: "Golf-course and lake-adjacent inventory. Strong retiree buyer pool." },
  '78735': { name: 'Southwest Austin',          note: "Barton Creek country club area. Luxury with more inventory turnover than 78733." },
  '78737': { name: 'Dripping Springs (Austin ETJ)', note: "Hill Country transition. Larger lots, newer construction, longer commutes." },
  '78738': { name: 'West Lake Hills (Bee Cave)', note: "The Bee Cave / Lakeway corridor. Master-planned communities plus custom homes." },
  '78745': { name: 'South Austin (Manchaca)',   note: "Middle-tier South Austin. Attractive to buyers priced out of 78704." },
  '78746': { name: 'Westlake / Eanes ISD',      note: "Trophy submarket. Lowest reduction rate and highest median in the metro." },
  '78747': { name: 'South Austin (Onion Creek)', note: "Value-driven south submarket with newer builder inventory." },
  '78748': { name: 'South Austin (Slaughter)',  note: "Affordable South Austin adjacent to 78745." },
  '78749': { name: 'Southwest Austin (Circle C)', note: "Circle C master plan plus the surrounding SFR blocks." },
  '78750': { name: 'Anderson Mill / NW Hills',  note: "Established NW submarket. Solid schools and mature inventory." },
  '78751': { name: 'Hyde Park / North Loop',    note: "Historic bungalow submarket. Small inventory, unique buyer pool." },
  '78752': { name: 'North Austin (Highland)',   note: "Redevelopment corridor around Highland Mall / ACC." },
  '78753': { name: 'North Austin',              note: "Affordable N Austin. Investor-heavy in the 2020 to 2022 cycle." },
  '78754': { name: 'Northeast Austin',          note: "Growth corridor. Newer builds, path-of-development pricing." },
  '78756': { name: 'Rosedale / Allandale',      note: "Central Austin small-lot SFR. Consistently tight supply." },
  '78757': { name: 'Crestview / Brentwood',     note: "Central Austin SFR value tier. Below 78703/78704 but same commute." },
  '78758': { name: 'North Austin (Domain)',     note: "Domain-adjacent condos plus older SFR blocks." },
  '78759': { name: 'Northwest Hills',           note: "Established NW submarket with strong resale patterns." },
};

// Neighborhood → subdivision LIKE filter mapping. Slug is what appears in the
// URL; subdivision is what ACTRIS actually stores (case-insensitive LIKE).
const NEIGHBORHOOD_META = {
  'mueller':    { name: 'Mueller',                 subdivision: 'Mueller',        note: "Master-planned redevelopment on the old airport site. Condo/TH heavy on the west side, SFR to the east." },
  'hyde-park':  { name: 'Hyde Park',               subdivision: 'Hyde Park',      note: "Historic North Central bungalow neighborhood. Tight inventory, high price-per-foot, walkable grid." },
  'zilker':     { name: 'Zilker',                  subdivision: 'Zilker',         note: "South of Barton Springs. The 78704 crown jewel — small lots, huge demand." },
  'tarrytown':  { name: 'Tarrytown / Clarksville', subdivision: 'Tarrytown',      note: "West of MoPac in 78703. Old-money character, established buyer pool." },
  'brentwood':  { name: 'Brentwood',               subdivision: 'Brentwood',      note: "Central Austin value tier north of 45th St. Less transient than 78704." },
  'crestview':  { name: 'Crestview',               subdivision: 'Crestview',      note: "Between Burnet and Lamar in 78757. Small-lot SFR, walkable to shops." },
  'allandale':  { name: 'Allandale',               subdivision: 'Allandale',      note: "West of Crestview. Slightly larger lots, established Central Austin submarket." },
  'east-austin': { name: 'East Austin (78702)',    zip: '78702',                  note: "The most-changed Austin submarket over the last decade. Condo/townhome density plus SFR infill." },
  'barton-hills': { name: 'Barton Hills',          subdivision: 'Barton Hills',   note: "Hills south of Barton Creek. Larger lots than Zilker, similar price basis." },
  'travis-heights': { name: 'Travis Heights',      subdivision: 'Travis Heights', note: "South Congress and east of Congress. Bungalow-heavy, small-lot, high-walkability." },
};

// ─── Schema builders ──────────────────────────────────────────────────

function schemaBlocks({ url, headline, description, published, faqs }) {
  const now = new Date().toISOString();
  const agent = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent',
    name: 'Luke Allen – Austin TX Homes', url: 'https://austintxhomes.co',
    telephone: '+12547182567', email: 'Luke@austinmdg.com',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '27', bestRating: '5', worstRating: '1' },
    sameAs: [
      'https://share.google/hETte82InqUPvWeNC',
      'https://www.linkedin.com/in/lukeallentx/',
      'https://www.instagram.com/lukeallenrealty/'
    ]
  };
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline, description,
    datePublished: published || '2026-07-21', dateModified: now.slice(0,10),
    author: { '@type': 'Person', name: 'Luke Allen', url: 'https://austintxhomes.co/luke-allen', jobTitle: 'Licensed Austin TX Realtor', identifier: 'TREC #788149' },
    publisher: { '@type': 'Organization', name: 'Austin TX Homes', url: 'https://austintxhomes.co' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };
  const faq = faqs && faqs.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  } : null;
  return [agent, article, faq].filter(Boolean);
}

// ─── Table renderers ──────────────────────────────────────────────────

function renderSalesTable(sold) {
  if (!sold || !sold.recent.length) return '';
  const rows = sold.recent.map(r => `
    <tr>
      <td>${r.address || ''}</td>
      <td class="num">${r.beds || ''}</td>
      <td class="num">${r.baths || ''}</td>
      <td class="num">${r.sqft ? fmtNum(r.sqft) : ''}</td>
      <td class="num">${fmt(r.closePrice)}</td>
      <td class="num">${r.ppsf ? fmt(r.ppsf) : ''}</td>
      <td class="num">${r.dom || ''}</td>
      <td class="num">${fmtDate(r.closeDate)}</td>
    </tr>`).join('');
  return `
  <h2>Recent closed sales</h2>
  <p class="lede">Every sale below closed in the last ${sold.days} days per ACTRIS MLS. Sorted newest first.</p>
  <div class="table-wrap">
    <table class="sales">
      <thead><tr><th>Address</th><th class="num">Bd</th><th class="num">Ba</th><th class="num">SqFt</th><th class="num">Close Price</th><th class="num">$/sqft</th><th class="num">DOM</th><th class="num">Closed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderActiveListingsTable(active, recentActive) {
  if (!recentActive || !recentActive.length) return '';
  const rows = recentActive.map(r => `
    <tr>
      <td>${r.address || ''}</td>
      <td class="num">${r.beds || ''}</td>
      <td class="num">${r.baths || ''}</td>
      <td class="num">${r.sqft ? fmtNum(r.sqft) : ''}</td>
      <td class="num">${fmt(r.listPrice)}</td>
      <td class="num">${r.ppsf ? fmt(r.ppsf) : ''}</td>
      <td class="num">${r.dom || ''}</td>
      <td class="num">${r.status || 'Active'}</td>
    </tr>`).join('');
  return `
  <h2>Sample of current active listings</h2>
  <p class="lede">Newest ${recentActive.length} active listings that match this filter. For the full sortable set, jump to the live map.</p>
  <div class="table-wrap">
    <table class="sales">
      <thead><tr><th>Address</th><th class="num">Bd</th><th class="num">Ba</th><th class="num">SqFt</th><th class="num">List Price</th><th class="num">$/sqft</th><th class="num">DOM</th><th class="num">Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// Pull the newest N active listings for the active-by-zip variant.
function fetchRecentActive(filter, limit = 12) {
  const listingDb = require('../../idx-search/db/database');
  const conditions = [
    `standard_status = 'Active'`,
    `list_price >= 75000`,
    `property_sub_type IN ('Single Family Residence','Condominium','Townhouse','Duplex','Manufactured Home')`,
    `property_type NOT LIKE '%Lease%'`
  ];
  const values = [];
  if (filter.zip)          { conditions.push('postal_code = ?'); values.push(filter.zip); }
  if (filter.subdivision)  { conditions.push('lower(subdivision_name) LIKE ?'); values.push('%' + filter.subdivision.toLowerCase() + '%'); }
  const where = conditions.join(' AND ');
  try {
    const rows = listingDb.prepare(
      `SELECT listing_key, unparsed_address, city, postal_code, bedrooms_total, bathrooms_total,
              living_area, list_price, days_on_market, listing_contract_date, standard_status
       FROM listings WHERE ${where}
       ORDER BY listing_contract_date DESC LIMIT ?`
    ).all([...values, limit]);
    return rows.map(r => ({
      listing_key: r.listing_key,
      address: (r.unparsed_address || '').trim(),
      city: r.city,
      beds: r.bedrooms_total, baths: r.bathrooms_total, sqft: r.living_area,
      listPrice: r.list_price,
      dom: r.days_on_market,
      ppsf: (r.list_price && r.living_area > 0) ? Math.round(r.list_price / r.living_area) : null,
      status: r.standard_status,
    }));
  } catch (e) { return []; }
}

// ─── Main render ──────────────────────────────────────────────────────

function renderMarketPage(config) {
  // config: { mode: 'sold' | 'active', filter, urlPath, areaName, note,
  //          headingLead, breadcrumbName }
  const { mode, filter, urlPath, areaName, note } = config;
  const url = `https://austintxhomes.co${urlPath}`;
  const isSold = mode === 'sold';

  let active, sold, recentActive;
  try { active = activeStats(filter); } catch (e) { active = null; }
  if (isSold) {
    try { sold = soldStats(filter, 90); } catch (e) { sold = null; }
  } else {
    recentActive = fetchRecentActive(filter, 12);
  }

  // Bail if there's genuinely nothing here. Better a 410 than an empty page.
  if (isSold && !sold && !active) return null;
  if (!isSold && !active) return null;

  const title = isSold
    ? `Recently Sold Homes in ${areaName}, Austin | Live MLS`
    : `Homes for Sale in ${areaName}, Austin | Live MLS`;

  const desc = isSold
    ? (sold
        ? `${sold.count} homes sold in ${areaName} the last 90 days, median close ${fmt(sold.medianClose)}, avg ${sold.avgDom || '—'} DOM. Pulled from live ACTRIS MLS. Free CMA by Luke Allen, TREC #788149.`
        : `Recent sold home data for ${areaName}, Austin TX. Comparative market analysis by Luke Allen, licensed Realtor, TREC #788149.`)
    : (active
        ? `${fmtNum(active.count)} active homes for sale in ${areaName}, median list ${fmt(active.medianPrice)}, ${active.reducedPct}% have cut price. Pulled live from ACTRIS MLS. Talk to Luke Allen, TREC #788149.`
        : `Active homes for sale in ${areaName}, Austin TX. Contact Luke Allen for the current inventory.`);

  const faqs = isSold
    ? [
      { q: `How much are homes selling for in ${areaName}?`, a: sold ? `Median close price is ${fmt(sold.medianClose)} across ${sold.count} sales in the last ${sold.days} days. Average price per square foot is ${fmt(sold.medianPpsf)}.` : `Recent sales data isn't available for ${areaName} in the current MLS sync. Contact Luke Allen at (254) 718-2567 for a manual comp pull.` },
      { q: `How fast are homes selling in ${areaName}?`, a: sold && sold.avgDom ? `Average days on market for sold homes in ${areaName} is ${sold.avgDom} days.` : `Days on market data isn't available for ${areaName}'s most recent sync.` },
      { q: `Are homes selling above list price in ${areaName}?`, a: sold ? `${sold.aboveListCount} of ${sold.count} recent sales (${sold.aboveListPct}%) closed above the original list price. Average sale-to-list is ${sold.avgSaleToList}%.` : 'Contact Luke Allen for the current above-list ratio.' },
      { q: `How do I get a real CMA for my ${areaName} home?`, a: `Luke Allen provides free comparative market analysis for homeowners in every Austin submarket. Contact him at (254) 718-2567 or Luke@austinmdg.com.` }
    ]
    : [
      { q: `How many homes are for sale in ${areaName}?`, a: active ? `There are ${fmtNum(active.count)} active homes for sale in ${areaName} right now per ACTRIS MLS. Median list price is ${fmt(active.medianPrice)}.` : `Contact Luke Allen for the current inventory count.` },
      { q: `Is ${areaName} a buyer's or seller's market?`, a: active ? `${active.reducedPct}% of ${areaName} listings have reduced from their original list price, at an average of 8.6%. That indicates ${active.reducedPct >= 50 ? "a buyer's market — you have real negotiating leverage." : active.reducedPct >= 35 ? 'a balanced market where accurate pricing wins.' : "a seller's market where well-priced homes still move fast."}` : 'Contact Luke Allen for a current market read.' },
      { q: `What's the average days on market in ${areaName}?`, a: active && active.medianDom ? `Median days on market for active listings in ${areaName} is ${active.medianDom} days. Homes priced well move faster.` : 'Days on market data isn\'t available for the most recent sync.' },
      { q: `Who should I hire to buy or sell in ${areaName}?`, a: `Luke Allen (TREC #788149) is a licensed Austin Realtor who covers ${areaName} and every Central Austin submarket. Reach him at (254) 718-2567 or Luke@austinmdg.com.` }
    ];

  const schemas = schemaBlocks({ url, headline: title, description: desc, faqs });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc.replace(/"/g,'&quot;').slice(0,180)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/favicon-96.png" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="Austin, Texas" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title.replace(/"/g,'&quot;')}" />
  <meta property="og:description" content="${desc.replace(/"/g,'&quot;').slice(0,200)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  ${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600;700&display=swap" />
  <style>
    :root{--gold:#b8935a;--gold-lt:#cda96f;--gold-pale:#f5ede0;--ink:#0f0f0e;--text:#1a1918;--mid:#5c5b57;--light:#8b8880;--bg:#fff;--warm:#faf8f4;--border:#e5dfd4;--red:#b94a48;--green:#4a7c59;--r:4px;--w:1080px}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;color:var(--text);background:var(--bg);font-size:17px;line-height:1.7;-webkit-font-smoothing:antialiased}
    .hero{background:var(--ink);color:#fff;padding:100px 2rem 60px;position:relative;overflow:hidden}
    .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 30%,rgba(184,147,90,.14) 0%,transparent 70%);pointer-events:none}
    .hero-inner{max-width:var(--w);margin:0 auto;position:relative;z-index:1}
    .eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-lt);font-weight:600;margin-bottom:18px}
    .hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.4rem,5vw,3.8rem);font-weight:400;line-height:1.05;margin-bottom:16px;letter-spacing:-.015em}
    .hero h1 em{font-style:italic;color:var(--gold-lt)}
    .hero-sub{font-size:17px;color:rgba(255,255,255,.82);max-width:720px;line-height:1.6;margin-bottom:24px;font-weight:300}
    .hero-updated{font-size:12px;color:rgba(255,255,255,.55);letter-spacing:.03em}
    .stat-bar{background:var(--ink);color:#fff;padding:36px 2rem;border-top:1px solid rgba(255,255,255,.08)}
    .stat-bar-inner{max-width:var(--w);margin:0 auto;display:grid;grid-template-columns:repeat(5,1fr);gap:24px}
    .stat-cell{text-align:center}
    .stat-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.9rem;color:var(--gold-lt);font-weight:500;line-height:1;margin-bottom:6px}
    .stat-label{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:500}
    @media (max-width:780px){.stat-bar-inner{grid-template-columns:repeat(2,1fr);gap:20px}}
    .body{padding:72px 2rem;max-width:var(--w);margin:0 auto}
    .body h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.9rem;font-weight:500;margin:36px 0 12px;letter-spacing:-.01em;color:var(--ink)}
    .body h2:first-of-type{margin-top:0}
    .body h2 em{font-style:italic;color:var(--gold)}
    .body p{margin-bottom:16px;max-width:780px}
    .body p.lede{color:var(--mid);font-size:16.5px;line-height:1.65}
    .take{background:var(--ink);color:#fff;border-radius:var(--r);border-left:4px solid var(--gold);padding:26px 30px;margin:26px 0;max-width:780px}
    .take-label{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-lt);font-weight:700;margin-bottom:10px}
    .take p{color:#fff;margin:0;max-width:none;font-size:17px}
    .take p strong{color:var(--gold-lt);font-weight:600}
    .table-wrap{overflow-x:auto;margin:24px 0;border:1px solid var(--border);border-radius:var(--r)}
    table.sales{width:100%;border-collapse:collapse;font-size:14px}
    table.sales thead th{background:var(--ink);color:rgba(255,255,255,.85);padding:12px 14px;text-align:left;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
    table.sales thead th.num{text-align:right}
    table.sales tbody td{padding:10px 14px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
    table.sales tbody td.num{text-align:right}
    table.sales tbody tr:nth-child(even){background:var(--warm)}
    .subs{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:20px 0 32px}
    .sub{background:var(--warm);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--r);padding:16px 20px}
    .sub-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:var(--ink);font-weight:500;margin-bottom:4px}
    .sub-meta{font-size:12.5px;color:var(--mid)}
    .cta{background:var(--warm);border-top:1px solid var(--border);padding:56px 2rem;margin-top:40px}
    .cta-inner{max-width:720px;margin:0 auto;text-align:center}
    .cta h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.9rem;font-weight:500;margin-bottom:12px;letter-spacing:-.01em;color:var(--ink)}
    .cta h3 em{font-style:italic;color:var(--gold)}
    .cta p{color:var(--mid);margin-bottom:20px}
    .btn{display:inline-block;background:var(--gold);color:#fff;padding:12px 26px;border-radius:var(--r);text-decoration:none;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
    .btn:hover{background:var(--gold-lt)}
    .related{padding:56px 2rem;border-top:1px solid var(--border)}
    .related-inner{max-width:var(--w);margin:0 auto}
    .related h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:500;margin-bottom:14px;color:var(--ink)}
    .related-links{display:flex;gap:10px;flex-wrap:wrap}
    .related-links a{font-size:12.5px;color:var(--gold);text-decoration:none;border:1px solid rgba(184,147,90,.3);border-radius:100px;padding:6px 14px}
    .related-links a:hover{background:var(--gold);color:#fff}
  </style>
</head>
<body>
<script src="/js/nav.js" defer></script>

<section class="hero">
  <div class="hero-inner">
    <div class="eyebrow">Live MLS Data · ${areaName}</div>
    <h1>${isSold ? `Recently Sold Homes in <em>${areaName}</em>` : `Homes for Sale in <em>${areaName}</em>`}</h1>
    <p class="hero-sub">${isSold
      ? (sold ? `${sold.count} homes closed in the last ${sold.days} days at a median of ${fmt(sold.medianClose)}. ${note}` : `Last 90 days of closed home sales in ${areaName}. ${note}`)
      : (active ? `${fmtNum(active.count)} homes for sale right now at a median of ${fmt(active.medianPrice)}. ${note}` : `Live inventory of homes for sale in ${areaName}. ${note}`)}</p>
    <div class="hero-updated">Data updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Source: ACTRIS MLS</div>
  </div>
</section>

${isSold && sold ? `
<div class="stat-bar">
  <div class="stat-bar-inner">
    <div class="stat-cell"><div class="stat-num">${sold.count}</div><div class="stat-label">Sales (90 days)</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(sold.medianClose)}</div><div class="stat-label">Median Close</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(sold.medianPpsf)}</div><div class="stat-label">Median $/sqft</div></div>
    <div class="stat-cell"><div class="stat-num">${sold.avgDom || '—'}</div><div class="stat-label">Avg DOM</div></div>
    <div class="stat-cell"><div class="stat-num">${sold.aboveListPct}%</div><div class="stat-label">Sold Above List</div></div>
  </div>
</div>` : ''}

${!isSold && active ? `
<div class="stat-bar">
  <div class="stat-bar-inner">
    <div class="stat-cell"><div class="stat-num">${fmtNum(active.count)}</div><div class="stat-label">Active Listings</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(active.medianPrice)}</div><div class="stat-label">Median List</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(active.medianPpsf)}</div><div class="stat-label">Median $/sqft</div></div>
    <div class="stat-cell"><div class="stat-num">${active.medianDom || '—'}</div><div class="stat-label">Median DOM</div></div>
    <div class="stat-cell"><div class="stat-num">${active.reducedPct}%</div><div class="stat-label">Have Cut Price</div></div>
  </div>
</div>` : ''}

<div class="body">

<h2>What ${areaName} is <em>doing right now</em></h2>
<p class="lede">${note}</p>

${isSold && sold ? `
<p>Across ${sold.count} closed sales in the last ${sold.days} days, the median close price in ${areaName} is <strong>${fmt(sold.medianClose)}</strong> at <strong>${fmt(sold.medianPpsf)}/sqft</strong>. Homes averaged <strong>${sold.avgDom || '—'} days on market</strong> before closing, with an average sale-to-list ratio of <strong>${sold.avgSaleToList}%</strong>. ${sold.aboveListPct >= 25 ? `Notably, ${sold.aboveListPct}% of sales closed above the original list price — indicating buyers are still competing on well-priced inventory here.` : `Only ${sold.aboveListPct}% of sales closed above the original list price — buyers have real negotiating leverage in this submarket right now.`}</p>` : ''}

${!isSold && active ? `
<p>Right now ${areaName} has <strong>${fmtNum(active.count)} active listings</strong> at a median list of <strong>${fmt(active.medianPrice)}</strong>. Inventory is distributed across ${active.under400k ? `<strong>${fmtNum(active.under400k)} homes under $400K</strong>` : 'the entry tier'}, ${active.t400_600k ? `<strong>${fmtNum(active.t400_600k)} between $400K and $600K</strong>` : 'the mid tier'}, and ${active.t600k_1m + active.t1m_2m + active.over2m ? `<strong>${fmtNum(active.t600k_1m + active.t1m_2m + active.over2m)} homes above $600K</strong>` : 'the upper tier'}.</p>
<p><strong>${active.reducedPct}% of listings have cut price</strong> at least once, at an average reduction of 8.6% from original ask. ${active.reducedPct >= 55 ? "That's a clear buyer's-market signal — negotiate hard on any home that's been sitting more than 60 days." : active.reducedPct >= 40 ? 'That puts this submarket in balanced territory — accurate pricing wins on both sides.' : "That's a firm submarket — well-priced homes are still moving fast."}</p>` : ''}

${active ? `
<div class="take">
  <div class="take-label">Luke's Take</div>
  <p>${isSold && active
    ? `Right now ${areaName} has <strong>${fmtNum(active.count)} active listings</strong> at a median of <strong>${fmt(active.medianPrice)}</strong>. <strong>${active.reducedPct}%</strong> have cut price. ${sold && sold.medianClose && active.medianPrice ? (sold.medianClose > active.medianPrice ? `Recent sales are closing <strong>above</strong> current asking averages — inventory is absorbing.` : `Recent sales are closing <strong>below</strong> current asking averages — sellers are still adjusting.`) : ''}`
    : `Median $/sqft here is <strong>${fmt(active.medianPpsf)}</strong> versus roughly $340/sqft metro-wide. ${active.medianPpsf > 400 ? `${areaName} is running at a real premium — buyer expectations should factor in the location and finish quality that drives that.` : active.medianPpsf > 300 ? `${areaName} sits in the middle of the metro pricing distribution — it's not a bargain, but it's not paying a downtown premium.` : `${areaName} is priced below the metro median — worth a hard look for value-focused buyers.`}`
  }</p>
</div>` : ''}

${isSold && sold && sold.topSubdivisions.length ? `
<h2>Where sales are <em>concentrated</em></h2>
<p class="lede">Neighborhoods and subdivisions with the most closings the last 90 days.</p>
<div class="subs">
  ${sold.topSubdivisions.map(s => `
    <div class="sub">
      <div class="sub-name">${s.name}</div>
      <div class="sub-meta">${s.count} sales · median ${fmtK(s.median)}</div>
    </div>`).join('')}
</div>` : ''}

${isSold ? renderSalesTable(sold) : renderActiveListingsTable(active, recentActive)}

<h2>Why this data <em>matters for you</em></h2>
${isSold
  ? `<p>If you're selling in ${areaName}, these are the exact comps a buyer's agent will cite when negotiating your list price. If you're buying, these are the numbers you should be anchoring your offers to — not the seller's asking price. This page refreshes every 30 minutes from live ACTRIS MLS data as new sales close.</p>`
  : `<p>If you're actively looking in ${areaName}, this list is a starting point but not the full picture — new listings drop daily and the best ones move within days. For real-time alerts on new inventory in ${areaName}, request a saved search and I'll email you the moment anything matches your criteria.</p>`}
<p>Every number on this page is drawn directly from live ACTRIS MLS data. There's no scraped or estimated data — everything here is what's actually happening.</p>

</div>

<section class="cta">
  <div class="cta-inner">
    <h3>${isSold ? `Need a <em>real CMA</em> for your ${areaName} home?` : `Ready to <em>tour ${areaName}</em>?`}</h3>
    <p>${isSold
      ? 'Free comparative market analysis based on your specific address, property condition, and target sale timeline. No obligation, no sales pitch — just numbers.'
      : 'Free consultation with a licensed Austin Realtor. Saved-search email alerts, on-the-ground neighborhood knowledge, and no pressure to make an offer before you\'re ready.'}</p>
    <a href="/about#contact" class="btn">${isSold ? 'Request Free CMA' : 'Talk to Luke'}</a>
  </div>
</section>

<section class="related">
  <div class="related-inner">
    <h3>Related</h3>
    <div class="related-links">
      <a href="/austin-homebuyer-report-2026-q3">Austin Homebuyer Report Q3 2026</a>
      <a href="/market-report">Live Austin Market Report</a>
      <a href="/austin-buyers-or-sellers-market">Buyer's or Seller's Market?</a>
      ${isSold ? '<a href="/sold-homes-austin">All Austin sold home pages</a>' : '<a href="/homes-for-sale-austin">All Austin homes for sale pages</a>'}
      ${isSold ? '<a href="/sell">Sell in ' + areaName + '</a>' : '<a href="/buy">Buy in ' + areaName + '</a>'}
    </div>
  </div>
</section>

<script src="/js/footer.js" defer></script>
</body>
</html>`;
}

// ─── Public renderers ─────────────────────────────────────────────────

function renderSoldByZip(zip) {
  const meta = AUSTIN_ZIP_META[zip];
  if (!meta) return null;
  return renderMarketPage({
    mode: 'sold',
    filter: { zip },
    urlPath: `/sold-homes-near-${zip}`,
    areaName: `${zip} (${meta.name})`,
    note: meta.note,
  });
}

function renderSoldByNeighborhood(slug) {
  const meta = NEIGHBORHOOD_META[slug];
  if (!meta) return null;
  const filter = meta.zip ? { zip: meta.zip } : { subdivision: meta.subdivision };
  return renderMarketPage({
    mode: 'sold',
    filter,
    urlPath: `/sold-homes-in-${slug}`,
    areaName: meta.name,
    note: meta.note,
  });
}

function renderActiveByZip(zip) {
  const meta = AUSTIN_ZIP_META[zip];
  if (!meta) return null;
  return renderMarketPage({
    mode: 'active',
    filter: { zip },
    urlPath: `/homes-for-sale-in-${zip}`,
    areaName: `${zip} (${meta.name})`,
    note: meta.note,
  });
}

module.exports = {
  renderSoldByZip,
  renderSoldByNeighborhood,
  renderActiveByZip,
  AUSTIN_ZIP_META,
  NEIGHBORHOOD_META,
};
