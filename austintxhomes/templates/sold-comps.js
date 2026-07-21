'use strict';

const { activeStats, soldStats, fmt, fmtK, fmtNum, fmtDate } = require('../lib/market-stats');

const AUSTIN_ZIP_META = {
  '78701': { name: 'Downtown Austin',           note: "The Rainey/Congress condo core plus 2nd Street District. Attached product dominates; SFR is nearly extinct here."  },
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
  '78738': { name: 'West Lake Hills (Bee Cave)','note': "The Bee Cave / Lakeway corridor. Master-planned communities plus custom homes." },
  '78745': { name: 'South Austin (Manchaca)',   note: "Middle-tier South Austin. Attractive to buyers priced out of 78704." },
  '78746': { name: 'Westlake / Eanes ISD',      note: "Trophy submarket. Lowest reduction rate and highest median in the metro." },
  '78747': { name: 'South Austin (Onion Creek)',note: "Value-driven south submarket with newer builder inventory." },
  '78748': { name: 'South Austin (Slaughter)',  note: "Affordable South Austin adjacent to 78745." },
  '78749': { name: 'Southwest Austin (Circle C)','note': "Circle C master plan plus the surrounding SFR blocks." },
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

function schemaBlocks(zip, meta, sold, active) {
  const url = `https://austintxhomes.co/sold-homes-near-${zip}`;
  const now = new Date().toISOString();
  const agent = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent',
    name: 'Luke Allen – Austin TX Homes',
    url: 'https://austintxhomes.co',
    telephone: '+12547182567',
    email: 'Luke@austinmdg.com',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '27', bestRating: '5', worstRating: '1' },
    sameAs: [
      'https://share.google/hETte82InqUPvWeNC',
      'https://www.linkedin.com/in/lukeallentx/',
      'https://www.instagram.com/lukeallenrealty/'
    ]
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://austintxhomes.co/' },
      { '@type': 'ListItem', position: 2, name: 'Sold Homes', item: 'https://austintxhomes.co/sold-homes-austin' },
      { '@type': 'ListItem', position: 3, name: `${meta.name} (${zip})`, item: url }
    ]
  };
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `Recently Sold Homes in ${zip} · ${meta.name}, Austin`,
    description: `Last-${sold ? sold.days : 90}-days closed home sales in ${zip}. Median close price, days on market, and sale-to-list ratio pulled from live ACTRIS MLS data.`,
    datePublished: '2026-07-19',
    dateModified: now.slice(0, 10),
    author: { '@type': 'Person', name: 'Luke Allen', url: 'https://austintxhomes.co/luke-allen', jobTitle: 'Licensed Austin TX Realtor', identifier: 'TREC #788149' },
    publisher: { '@type': 'Organization', name: 'Austin TX Homes', url: 'https://austintxhomes.co' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: `How much are homes selling for in ${zip}?`, acceptedAnswer: { '@type': 'Answer', text: sold ? `Median close price is ${fmt(sold.medianClose)} across ${sold.count} sales in the last ${sold.days} days. Average price per square foot is ${fmt(sold.medianPpsf)}.` : `No recent sales are available in ${zip} in the current MLS sync. Contact Luke Allen at (254) 718-2567 for a manual comp pull.` } },
      { '@type': 'Question', name: `How fast are homes selling in ${zip}?`, acceptedAnswer: { '@type': 'Answer', text: sold && sold.avgDom ? `Average days on market for sold homes in ${zip} is ${sold.avgDom} days. Homes that sell above list typically move in under 30 days.` : `Days on market data isn't available for the most recent sync in ${zip}.` } },
      { '@type': 'Question', name: `Are homes selling above list price in ${zip}?`, acceptedAnswer: { '@type': 'Answer', text: sold && sold.aboveListCount ? `${sold.aboveListCount} of ${sold.count} recent sales (${sold.aboveListPct}%) closed above the original list price. Average sale-to-list is ${sold.avgSaleToList}%.` : 'Below- and at-list sales dominate the recent closings in this ZIP. Buyers have negotiating leverage.' } },
      { '@type': 'Question', name: `How do I get a real CMA for my ${zip} home?`, acceptedAnswer: { '@type': 'Answer', text: 'Luke Allen provides free comparative market analysis for homeowners in every Austin ZIP. Contact him at (254) 718-2567 or Luke@austinmdg.com for a full CMA based on your specific address and property condition.' } }
    ]
  };
  return [agent, breadcrumb, article, faq];
}

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
  <h2>Last ${sold.count} closed sales in this ZIP</h2>
  <p class="lede">Every sale below closed in the last ${sold.days} days per ACTRIS MLS. Sorted newest first. If you need the full list for a valuation, ping Luke.</p>
  <div class="table-wrap">
    <table class="sales">
      <thead>
        <tr>
          <th>Address</th><th class="num">Bd</th><th class="num">Ba</th><th class="num">SqFt</th>
          <th class="num">Close Price</th><th class="num">$/sqft</th><th class="num">DOM</th><th class="num">Closed</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderSoldCompsPage(zip) {
  const meta = AUSTIN_ZIP_META[zip];
  if (!meta) return null;

  let sold, active;
  try { sold = soldStats({ zip }, 90); } catch (e) { sold = null; }
  try { active = activeStats({ zip }); } catch (e) { active = null; }

  const url = `https://austintxhomes.co/sold-homes-near-${zip}`;
  const title = `Recently Sold Homes in ${zip} (${meta.name}), Austin | Live MLS`;
  const desc = sold
    ? `${sold.count} homes sold in ${zip} the last 90 days, median close ${fmt(sold.medianClose)}, avg ${sold.avgDom || '—'} DOM. Pulled from live ACTRIS MLS. Free CMA by Luke Allen, TREC #788149.`
    : `Recent sold home data for ${zip} (${meta.name}), Austin TX. Comparative market analysis by Luke Allen, licensed Realtor, TREC #788149.`;

  const schemas = schemaBlocks(zip, meta, sold, active);

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
    .hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2.4rem,5vw,3.8rem);font-weight:400;line-height:1.05;margin-bottom:16px;letter-spacing:-0.015em}
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
    <div class="eyebrow">Live MLS Data · ${meta.name}</div>
    <h1>Recently Sold Homes in <em>${zip}</em></h1>
    <p class="hero-sub">${sold ? `${sold.count} homes closed in the last ${sold.days} days at a median of ${fmt(sold.medianClose)}.` : `Last 90 days of closed home sales in ${zip}.`} ${meta.note}</p>
    <div class="hero-updated">Data updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Source: ACTRIS MLS</div>
  </div>
</section>

${sold ? `
<div class="stat-bar">
  <div class="stat-bar-inner">
    <div class="stat-cell"><div class="stat-num">${sold.count}</div><div class="stat-label">Sales (90 days)</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(sold.medianClose)}</div><div class="stat-label">Median Close</div></div>
    <div class="stat-cell"><div class="stat-num">${fmt(sold.medianPpsf)}</div><div class="stat-label">Median $/sqft</div></div>
    <div class="stat-cell"><div class="stat-num">${sold.avgDom || '—'}</div><div class="stat-label">Avg DOM</div></div>
    <div class="stat-cell"><div class="stat-num">${sold.aboveListPct}%</div><div class="stat-label">Sold Above List</div></div>
  </div>
</div>` : ''}

<div class="body">

<h2>What ${zip} is <em>doing right now</em></h2>
<p class="lede">${meta.note}</p>
${sold ? `
<p>Across ${sold.count} closed sales in the last ${sold.days} days, the median close price in ${zip} is <strong>${fmt(sold.medianClose)}</strong> at <strong>${fmt(sold.medianPpsf)}/sqft</strong>. Homes averaged <strong>${sold.avgDom || '—'} days on market</strong> before closing, with an average sale-to-list ratio of <strong>${sold.avgSaleToList}%</strong>. ${sold.aboveListPct >= 25 ? `Notably, ${sold.aboveListPct}% of sales closed above the original list price — indicating buyers are still competing on well-priced inventory here.` : `Only ${sold.aboveListPct}% of sales closed above the original list price — buyers have real negotiating leverage in this ZIP right now.`}</p>` : `
<p>The current ACTRIS MLS sync doesn't have closed home sale data for ${zip} in the last 90 days. This can happen for smaller ZIPs where sales are sparse, or when the MLS sync is temporarily behind. Contact Luke Allen directly at (254) 718-2567 for a manual comp pull, or request a free comparative market analysis using the form below.</p>`}

${active ? `
<div class="take">
  <div class="take-label">Luke's Take</div>
  <p>Right now ${zip} has <strong>${fmtNum(active.count)} active listings</strong> at a median list of <strong>${fmt(active.medianPrice)}</strong>. <strong>${active.reducedPct}%</strong> have cut price at least once. ${sold && sold.medianClose && active.medianPrice ? (sold.medianClose > active.medianPrice ? `Recent sales are closing <strong>above</strong> current asking averages — the market is absorbing existing inventory.` : `Recent sales are closing <strong>below</strong> current asking averages — sellers are still adjusting to where the market actually is.`) : ''}</p>
</div>` : ''}

${sold && sold.topSubdivisions.length ? `
<h2>Where sales are <em>concentrated</em></h2>
<p class="lede">Neighborhoods and subdivisions in ${zip} with the most closings the last 90 days.</p>
<div class="subs">
  ${sold.topSubdivisions.map(s => `
    <div class="sub">
      <div class="sub-name">${s.name}</div>
      <div class="sub-meta">${s.count} sales · median ${fmtK(s.median)}</div>
    </div>`).join('')}
</div>` : ''}

${renderSalesTable(sold)}

<h2>Why this data <em>matters for you</em></h2>
<p>If you're selling in ${zip}, these are the exact comps a buyer's agent will cite when negotiating your list price. If you're buying, these are the numbers you should be anchoring your offers to — not the seller's asking price. If you're just watching the market, this page updates weekly with fresh ACTRIS data as sales close and settle.</p>
<p>Every number on this page is drawn directly from live ACTRIS MLS data and refreshes every 30 minutes. There's no scraped or estimated data — everything here is what actually closed.</p>

</div>

<section class="cta">
  <div class="cta-inner">
    <h3>Need a <em>real CMA</em> for your ${zip} home?</h3>
    <p>Free comparative market analysis based on your specific address, property condition, and target sale timeline. No obligation, no sales pitch — just numbers.</p>
    <a href="/about#contact" class="btn">Request Free CMA</a>
  </div>
</section>

<section class="related">
  <div class="related-inner">
    <h3>Related</h3>
    <div class="related-links">
      <a href="/austin-homebuyer-report-2026-q3">Austin Homebuyer Report Q3 2026</a>
      <a href="/market-report">Live Austin Market Report</a>
      <a href="/austin-buyers-or-sellers-market">Is it a buyer's or seller's market?</a>
      <a href="/sell">Sell a home in ${meta.name}</a>
      <a href="/buy">Buy a home in ${meta.name}</a>
      <a href="/sold-homes-austin">All Austin sold home pages</a>
    </div>
  </div>
</section>

<script src="/js/footer.js" defer></script>
</body>
</html>`;
}

module.exports = { renderSoldCompsPage, AUSTIN_ZIP_META };
