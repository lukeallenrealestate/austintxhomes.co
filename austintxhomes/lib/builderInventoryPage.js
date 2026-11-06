// SSR template for /[builder-slug]-homes-austin-for-sale pages.
// Renders a full HTML page per builder with live inventory from the
// IDX DB + builder-specific descriptive content + FAQ + schemas.
//
// Why SSR (not client-side fetch): Google and the LLM crawlers need the
// listings + FAQ in the initial HTML to index + cite. A JS-rendered grid
// shows up blank to a crawler. Inventory also changes often enough that
// page freshness is a positive crawl signal.

const path = require('path');
const db = require('../../idx-search/db/database');
const { BUILDER_MAP } = require('../../idx-search/routes/properties');

function fmtPrice(p) {
  if (!p) return '';
  return '$' + Number(p).toLocaleString('en-US');
}
function fmtPriceShort(n) {
  if (!n) return '';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + n;
}
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

function fetchBuilderData(slug) {
  const b = BUILDER_MAP[slug];
  if (!b) return null;
  // Match ONLY on list_office_name to prevent cross-contamination. Loose
  // matching via public_remarks + subdivision_name was pulling the same
  // listing onto multiple builder pages (homes that mention competitors
  // in their description, or sit in multi-builder communities). Taylor
  // Morrison and Lennar's patterns include their third-party broker
  // office names (Alexander Properties, Keller Williams City-View)
  // since they rarely list under their own builder name in Austin.
  const officeClause = '(' + b.patterns.map(() => 'list_office_name LIKE ?').join(' OR ') + ')';
  const params = [...b.patterns];

  const where = `mlg_can_view = 1
    AND standard_status = 'Active'
    AND property_type NOT LIKE '%Lease%'
    AND list_price IS NOT NULL
    AND list_price > 100000
    AND new_construction_yn = 1
    AND ${officeClause}`;

  const rows = db.prepare(`
    SELECT listing_key, unparsed_address, city, postal_code, list_price,
           bedrooms_total, bathrooms_total, living_area, year_built,
           subdivision_name, photos, days_on_market, pool_features
    FROM listings
    WHERE ${where}
    ORDER BY list_price
    LIMIT 24
  `).all(...params);

  const all = db.prepare(`
    SELECT list_price, living_area, postal_code, city FROM listings WHERE ${where}
  `).all(...params);

  const prices = all.map(r => r.list_price).sort((a, b) => a - b);
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const minPrice = prices.length ? prices[0] : null;
  const maxPrice = prices.length ? prices[prices.length - 1] : null;
  const ppsfs = all.filter(r => r.living_area > 100).map(r => r.list_price / r.living_area).sort((a, b) => a - b);
  const medianPpsf = ppsfs.length ? Math.round(ppsfs[Math.floor(ppsfs.length / 2)]) : null;
  const uniqueZips = Array.from(new Set(all.map(r => r.postal_code).filter(Boolean))).sort();
  const uniqueCities = Array.from(new Set(all.map(r => r.city).filter(Boolean))).sort();

  return {
    builder: b,
    activeCount: all.length,
    listings: rows.map(l => {
      let photo = null;
      try { const p = JSON.parse(l.photos || '[]'); photo = p[0] || null; } catch {}
      return {
        listing_key: l.listing_key,
        address: l.unparsed_address,
        city: l.city,
        zip: l.postal_code,
        list_price: l.list_price,
        beds: l.bedrooms_total,
        baths: l.bathrooms_total,
        sqft: l.living_area,
        year: l.year_built,
        subdivision: l.subdivision_name,
        dom: l.days_on_market,
        has_pool: !!(l.pool_features && l.pool_features !== '[]' && l.pool_features !== 'null'),
        photo,
        href: homesUrl(l.listing_key, l.unparsed_address)
      };
    }),
    stats: { medianPrice, minPrice, maxPrice, medianPpsf, zipCount: uniqueZips.length, zips: uniqueZips, cities: uniqueCities.slice(0, 8) }
  };
}

function renderCard(l) {
  const photo = l.photo ? `/api/properties/photos/${l.listing_key}/0` : null;
  const addr = [l.address, l.city].filter(Boolean).join(', ');
  const specs = [
    l.beds ? `${l.beds} bd` : '',
    l.baths ? `${l.baths} ba` : '',
    l.sqft ? `${Number(l.sqft).toLocaleString()} sqft` : ''
  ].filter(Boolean).join(' &middot; ');
  return `
  <a class="inv-card" href="${l.href}" aria-label="${escHtml(addr)}">
    ${photo ? `<div class="inv-card-img"><img src="${photo}" alt="${escHtml(addr)}" loading="lazy" /></div>` : `<div class="inv-card-img inv-card-noimg"></div>`}
    <div class="inv-card-body">
      <div class="inv-card-price">${fmtPrice(l.list_price)}</div>
      <div class="inv-card-addr">${escHtml(l.address || '')}</div>
      <div class="inv-card-sub">${escHtml(l.city || '')}${l.zip ? ', ' + escHtml(l.zip) : ''}</div>
      <div class="inv-card-specs">${specs}</div>
      ${l.subdivision ? `<div class="inv-card-sub">${escHtml(l.subdivision)}</div>` : ''}
      <div class="inv-card-cta">Tour with Luke &rarr;</div>
    </div>
  </a>`;
}

function renderBuilderInventoryPage(slug) {
  const data = fetchBuilderData(slug);
  if (!data) return null;
  const { builder: b, listings, activeCount, stats } = data;

  const canonical = `https://austintxhomes.co/${slug}-homes-austin-for-sale`;
  const title = `${b.name} Homes For Sale Austin TX | ${activeCount} Active | Luke Allen`;
  const metaDesc = `${activeCount} ${b.shortName} homes for sale in the Austin metro. ${stats.medianPrice ? 'Median ' + fmtPriceShort(stats.medianPrice) + '. ' : ''}Live MLS data. Independent buyer rep from Luke Allen (TREC #788149). Builder-paid, so buyer pays $0.`;

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: b.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a.replace('{{ACTIVE_COUNT}}', activeCount) }
    }))
  });

  const itemListSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: listings.slice(0, 10).map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://austintxhomes.co${l.href}`,
      name: `${l.address}, ${l.city || 'Austin'} TX`
    }))
  });

  const personSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Luke Allen',
    jobTitle: `${b.name} buyer representation Realtor in Austin`,
    description: `Luke Allen represents home buyers at ${b.name} communities across the Austin metro. Texas-licensed Realtor (TREC #788149). Builder-paid representation.`,
    url: canonical,
    image: 'https://austintxhomes.co/images/luke-allen.jpg',
    telephone: '+12547182567',
    email: 'Luke@austinmdg.com',
    identifier: 'TREC #788149',
    worksFor: { '@type': 'Organization', name: 'Austin Marketing + Development Group' }
  });

  const realEstateAgentSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['RealEstateAgent', 'LocalBusiness'],
    name: `Luke Allen Austin ${b.name} Buyer Representation`,
    url: canonical,
    telephone: '+12547182567',
    email: 'Luke@austinmdg.com',
    image: 'https://austintxhomes.co/images/luke-allen.jpg',
    address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', postalCode: '78701', addressCountry: 'US' },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '30', bestRating: '5', worstRating: '1' },
    priceRange: b.priceBand
  });

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://austintxhomes.co/' },
      { '@type': 'ListItem', position: 2, name: 'New Construction Realtor Austin', item: 'https://austintxhomes.co/new-construction-realtor-austin' },
      { '@type': 'ListItem', position: 3, name: `${b.name} Austin`, item: canonical }
    ]
  });

  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${b.name} Homes For Sale in Austin, TX`,
    description: `Live inventory of ${b.name} homes currently for sale in the Austin metro.`,
    author: { '@type': 'Person', name: 'Luke Allen', identifier: 'TREC #788149' },
    publisher: { '@type': 'Organization', name: 'Austin Marketing + Development Group' },
    datePublished: '2026-11-05',
    dateModified: new Date().toISOString().slice(0, 10),
    mainEntityOfPage: canonical,
    image: 'https://austintxhomes.co/images/luke-allen.jpg'
  });

  // Replace {{ACTIVE_COUNT}} tokens in any visible FAQ answers
  const faqHtml = b.faqs.map(f => `
    <div class="faq">
      <h3>${escHtml(f.q)}</h3>
      <p>${f.a.replace('{{ACTIVE_COUNT}}', activeCount)}</p>
    </div>`).join('');

  const cardsHtml = listings.length
    ? listings.map(renderCard).join('')
    : `<div class="inv-empty">No ${b.shortName} active listings pulled from the MLS feed right now. Call Luke at (254) 718-2567 to find out when new inventory is coming.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
 <title>${escHtml(title)}</title>
 <meta name="description" content="${escHtml(metaDesc)}" />
 <link rel="canonical" href="${canonical}" />
 <link rel="icon" href="/favicon.ico" sizes="any" />
 <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
 <link rel="apple-touch-icon" href="/favicon-96.png" />
 <meta property="og:type" content="website" />
 <meta property="og:title" content="${escHtml(title)}" />
 <meta property="og:description" content="${escHtml(metaDesc)}" />
 <meta property="og:url" content="${canonical}" />
 <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
 <meta name="twitter:card" content="summary_large_image" />
 <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
 <meta name="geo.region" content="US-TX" />
 <meta name="geo.placename" content="Austin, Texas" />
 <meta name="theme-color" content="#0f0f0e" />
 <meta name="author" content="Luke Allen" />
 <script type="application/ld+json">${personSchema}</script>
 <script type="application/ld+json">${realEstateAgentSchema}</script>
 <script type="application/ld+json">${articleSchema}</script>
 <script type="application/ld+json">${faqSchema}</script>
 <script type="application/ld+json">${itemListSchema}</script>
 <script type="application/ld+json">${breadcrumbSchema}</script>
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
 <style>
  :root { --gold: #b8935a; --gold-lt: #cda96f; --ink: #0f0f0e; --text: #1a1918; --mid: #5c5b57; --light: #999690; --bg: #fff; --warm: #faf8f4; --cream: #f1ece3; --border: #e5dfd4; --r: 4px; --w: 1180px; --emerald: #2d6a4f; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; color: var(--text); background: var(--bg); line-height: 1.7; -webkit-font-smoothing: antialiased; }
  a { color: var(--gold); text-decoration: none; }
  a:hover { color: var(--gold-lt); text-decoration: underline; }
  .hero { position: relative; overflow: hidden; background: var(--ink); color: #fff; padding: 128px 20px 72px; text-align: center; }
  .hero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.4s ease; z-index: 0; }
  .hero video.ready { opacity: 0.4; }
  .hero-veil { position: absolute; inset: 0; z-index: 1; background: radial-gradient(ellipse 85% 70% at 50% 40%, rgba(184,147,90,.26) 0%, transparent 70%), linear-gradient(180deg, rgba(15,15,14,.78) 0%, rgba(15,15,14,.66) 100%); pointer-events: none; }
  .hero > *:not(video):not(.hero-veil) { position: relative; z-index: 2; }
  .hero-eyebrow { font-size: 11.5px; letter-spacing: .28em; text-transform: uppercase; color: var(--gold-lt); font-weight: 600; margin-bottom: 20px; }
  .hero h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: clamp(38px, 5.8vw, 62px); letter-spacing: -.01em; line-height: 1.08; margin: 0 auto 18px; max-width: 980px; }
  .hero h1 em { font-style: italic; color: var(--gold-lt); font-weight: 500; }
  .hero-sub { font-size: 17px; color: rgba(255,255,255,.88); max-width: 760px; margin: 0 auto 28px; line-height: 1.6; }
  .hero-meta { font-size: 12.5px; color: rgba(255,255,255,.72); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 36px; }
  .hero-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .hero-cta { display: inline-block; padding: 15px 32px; background: var(--gold); color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; border: none; border-radius: var(--r); cursor: pointer; }
  .hero-cta:hover { background: #a37f49; color: #fff; text-decoration: none; }
  .hero-cta.ghost { background: transparent; border: 1.5px solid rgba(255,255,255,.3); }
  .fact-row { background: var(--warm); border-bottom: 1px solid var(--border); padding: 32px 20px; }
  .fact-row-inner { max-width: var(--w); margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center; }
  .fact { font-size: 12.5px; color: var(--mid); letter-spacing: .04em; }
  .fact strong { display: block; font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; color: var(--ink); line-height: 1.1; margin-bottom: 4px; }
  @media (max-width: 720px) { .fact-row-inner { grid-template-columns: repeat(2, 1fr); } }
  section.block { padding: 56px 20px; }
  .inner { max-width: var(--w); margin: 0 auto; }
  .inner-narrow { max-width: 820px; margin: 0 auto; }
  .k { font-size: 11.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-bottom: 10px; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: clamp(28px, 4vw, 42px); line-height: 1.15; margin: 0 0 16px; color: var(--ink); letter-spacing: -.005em; }
  h2 em { font-style: italic; color: var(--gold); }
  p { margin: 0 0 14px; color: var(--text); font-size: 15px; line-height: 1.75; }
  .dek { background: var(--warm); border-left: 3px solid var(--gold); border-radius: var(--r); padding: 22px 28px; font-size: 15.5px; line-height: 1.7; margin: 0 0 24px; }
  .dek strong { color: var(--ink); }
  /* Inventory grid */
  .inv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }
  @media (max-width: 920px) { .inv-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .inv-grid { grid-template-columns: 1fr; } }
  .inv-card { background: #fff; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; display: block; color: var(--text); transition: box-shadow .2s, border .2s; }
  .inv-card:hover { border-color: var(--gold); box-shadow: 0 10px 30px rgba(15,15,14,.1); text-decoration: none; }
  .inv-card-img { aspect-ratio: 16/10; background: var(--cream); overflow: hidden; }
  .inv-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .inv-card-noimg { display: flex; align-items: center; justify-content: center; color: var(--light); font-size: 12px; }
  .inv-card-body { padding: 16px 18px; }
  .inv-card-price { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 600; color: var(--gold); line-height: 1; margin-bottom: 4px; }
  .inv-card-addr { font-size: 14.5px; font-weight: 600; color: var(--ink); line-height: 1.3; }
  .inv-card-sub { font-size: 12.5px; color: var(--mid); margin-top: 3px; }
  .inv-card-specs { font-size: 13px; color: var(--text); margin-top: 6px; }
  .inv-card-cta { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-top: 10px; }
  .inv-empty { background: var(--warm); padding: 36px; border-radius: var(--r); text-align: center; color: var(--mid); }
  /* Meet Luke */
  .meet { background: var(--cream); padding: 56px 20px; }
  .meet-inner { max-width: 960px; margin: 0 auto; display: flex; gap: 40px; align-items: center; }
  @media (max-width: 760px) { .meet-inner { flex-direction: column; text-align: center; } }
  .meet-photo { flex: 0 0 180px; width: 180px; height: 180px; border-radius: 50%; overflow: hidden; border: 3px solid var(--gold); box-shadow: 0 10px 30px rgba(15,15,14,.12); }
  .meet-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .meet-text h2 { margin: 0 0 8px; }
  .meet-text .title-line { font-size: 14px; color: var(--mid); margin: 0 0 12px; }
  .meet-text p { font-size: 14.5px; color: var(--mid); margin: 0 0 14px; }
  .meet-contact a { margin-right: 14px; font-size: 14px; font-weight: 600; color: var(--gold); }
  /* FAQ */
  .faq-grid { margin-top: 28px; }
  .faq { background: #fff; border: 1px solid var(--border); border-radius: var(--r); padding: 20px 24px; margin-bottom: 12px; }
  .faq h3 { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 16px; color: var(--ink); margin: 0 0 8px; line-height: 1.4; }
  .faq p { font-size: 14px; color: var(--text); margin: 0; line-height: 1.7; }
  /* Quick contact */
  .quick-contact { background: var(--ink); color: #fff; padding: 56px 20px; }
  .qc-inner { max-width: 820px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 36px; align-items: center; }
  @media (max-width: 720px) { .qc-inner { grid-template-columns: 1fr; } }
  .qc-pitch h2 { color: #fff; }
  .qc-pitch h2 em { color: var(--gold-lt); }
  .qc-pitch p { color: rgba(255,255,255,.82); margin: 0 0 14px; font-size: 15px; }
  .qc-form { background: #fff; color: var(--text); border-radius: 6px; padding: 24px; }
  .qc-form h3 { margin: 0 0 4px; font-family: 'Cormorant Garamond', serif; font-size: 22px; color: var(--ink); }
  .qc-form .sub { font-size: 13px; color: var(--mid); margin: 0 0 16px; }
  .qc-form input, .qc-form textarea { width: 100%; padding: 11px 14px; font-size: 14px; border: 1px solid var(--border); border-radius: var(--r); background: #fff; margin-bottom: 10px; font-family: inherit; }
  .qc-form input:focus, .qc-form textarea:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(184,147,90,.15); }
  .qc-form textarea { min-height: 70px; resize: vertical; }
  .qc-form button { width: 100%; padding: 14px; background: var(--gold); color: #fff; border: none; border-radius: var(--r); font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; cursor: pointer; font-family: inherit; margin-top: 4px; }
  .qc-form button:hover { background: #a37f49; }
  .qc-form .form-msg { font-size: 13px; margin-top: 10px; padding: 9px 12px; border-radius: var(--r); display: none; }
  .qc-form .form-msg.ok { background: #e6f4ea; color: #166534; display: block; }
  .qc-form .form-msg.err { background: #fde7e7; color: #b91c1c; display: block; }
  /* Related */
  .related { background: var(--warm); padding: 48px 20px; border-top: 1px solid var(--border); }
  .related-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
  @media (max-width: 920px) { .related-grid { grid-template-columns: repeat(2, 1fr); } }
  .related-card { background: #fff; border: 1px solid var(--border); border-radius: var(--r); padding: 14px 16px; }
  .related-card strong { display: block; font-family: 'Cormorant Garamond', serif; font-size: 17px; color: var(--ink); font-weight: 600; }
  .related-card span { font-size: 12px; color: var(--mid); }
  .author-bar { background: var(--warm); border-top: 1px solid var(--border); padding: 22px; text-align: center; font-size: 12.5px; color: var(--mid); }
  .author-bar strong { color: var(--ink); }
 </style>
</head>
<body>

<script src="/js/nav.js"></script>

<section class="hero">
 <video autoplay muted loop playsinline preload="none" data-src="/videos/hero-video.mp4"></video>
 <div class="hero-veil"></div>
 <div class="hero-eyebrow">${escHtml(b.name)} Austin Inventory</div>
 <h1><em>${escHtml(b.shortName)}</em> homes for sale in Austin, TX.</h1>
 <p class="hero-sub">${escHtml(b.tagline)} Independent buyer representation from Luke Allen (TREC #788149), builder-paid so you pay $0.</p>
 <div class="hero-meta">${activeCount} active listings &nbsp; &middot; &nbsp; Median ${stats.medianPrice ? fmtPriceShort(stats.medianPrice) : 'N/A'} &nbsp; &middot; &nbsp; ${stats.zipCount} ZIPs</div>
 <div class="hero-cta-row">
  <a href="#inventory" class="hero-cta">Browse ${activeCount} listings</a>
  <a href="#contact" class="hero-cta ghost">Tour with Luke</a>
 </div>
</section>

<div class="fact-row">
 <div class="fact-row-inner">
  <div class="fact"><strong>${activeCount}</strong>Active ${escHtml(b.shortName)} homes</div>
  <div class="fact"><strong>${stats.medianPrice ? fmtPriceShort(stats.medianPrice) : 'N/A'}</strong>Median list price</div>
  <div class="fact"><strong>${stats.medianPpsf ? '$' + stats.medianPpsf : 'N/A'}</strong>Median $/sqft</div>
  <div class="fact"><strong>$0</strong>Buyer cost</div>
 </div>
</div>

<section class="block">
 <div class="inner-narrow">
  <div class="k">About the builder</div>
  <h2>${escHtml(b.name)} in <em>Austin</em>.</h2>
  <div class="dek">${escHtml(b.overview)}</div>
  <p><strong style="color:var(--ink);">Known Austin communities:</strong> ${escHtml(b.areas)}</p>
  <p><strong style="color:var(--ink);">The lever that matters:</strong> ${escHtml(b.negotiationNote)}</p>
 </div>
</section>

<section class="block" style="background:var(--warm);border-top:1px solid var(--border);border-bottom:1px solid var(--border);" id="inventory">
 <div class="inner">
  <div class="k">Live inventory</div>
  <h2>${activeCount} ${escHtml(b.shortName)} homes <em>for sale</em>.</h2>
  <p style="max-width:720px;">${escHtml(b.inventoryIntro || '')}</p>
  <div class="inv-grid">${cardsHtml}</div>
  ${activeCount > 24 ? `<p style="text-align:center;margin-top:24px;color:var(--mid);">+ ${activeCount - 24} more ${escHtml(b.shortName)} active listings. <a href="#contact">Ask Luke for the full list.</a></p>` : ''}
 </div>
</section>

<section class="meet">
 <div class="meet-inner">
  <div class="meet-photo"><img src="/images/luke-allen.jpg" alt="Luke Allen, ${escHtml(b.name)} buyer representation in Austin" loading="lazy" /></div>
  <div class="meet-text">
   <div class="k">Who represents you</div>
   <h2>Luke Allen</h2>
   <p class="title-line"><strong>${escHtml(b.name)} Buyer Representation</strong> &middot; TREC #788149 &middot; 5.0 across 41 Google reviews</p>
   <p>${escHtml(b.meetParagraph || '')}</p>
   <div class="meet-contact">
    <a href="tel:+12547182567">(254) 718-2567</a>
    <a href="mailto:Luke@austinmdg.com">Luke@austinmdg.com</a>
   </div>
  </div>
 </div>
</section>

<section class="block">
 <div class="inner-narrow">
  <div class="k">Common questions</div>
  <h2>${escHtml(b.shortName)} Austin, <em>answered</em>.</h2>
  <div class="faq-grid">${faqHtml}</div>
 </div>
</section>

<section class="quick-contact" id="contact">
 <div class="qc-inner">
  <div class="qc-pitch">
   <div class="k" style="color:var(--gold-lt);">Tour with Luke</div>
   <h2>Ready to tour a <em>${escHtml(b.shortName)}</em> home?</h2>
   <p>${escHtml(b.ctaBlurb || '')}</p>
  </div>
  <form class="qc-form" id="qc-form" novalidate>
   <h3>Request a tour</h3>
   <p class="sub">${escHtml(b.name)} Austin inventory</p>
   <input type="text" name="name" placeholder="Your name" autocomplete="name" required />
   <input type="tel" name="phone" placeholder="(512) 555-1234" autocomplete="tel" required />
   <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required />
   <textarea name="notes" placeholder="Which ${escHtml(b.shortName)} community or specific home? Any questions?"></textarea>
   <input type="hidden" name="source" value="${slug}-homes-austin-for-sale" />
   <button type="submit" id="qc-btn">Send to Luke</button>
   <div class="form-msg" id="qc-msg"></div>
  </form>
 </div>
</section>

<section class="related">
 <div class="inner">
  <div class="k">Other Austin builders</div>
  <p style="margin:0 0 18px;font-size:14.5px;color:var(--mid);">Comparing builders? Luke represents buyers across every major production + semi-custom brand in the Austin metro:
   ${Object.values(BUILDER_MAP).filter(x => x.slug !== slug).map(x => `<a href="/${x.slug}-homes-austin-for-sale">${escHtml(x.shortName)}</a>`).join(', ')}.
  </p>
  <p style="margin:0;font-size:13.5px;color:var(--mid);">Reference: <a href="/new-construction-realtor-austin">new construction realtor Austin</a>. Negotiation playbook: <a href="/new-build-negotiation-austin">builder incentive levers</a>.</p>
 </div>
</section>

<div class="author-bar">
 Live inventory from the ACTRIS MLS. Reviewed by <strong>Luke Allen</strong>, TREC #788149, Austin Marketing + Development Group.
</div>

<script src="/js/footer.js"></script>
<script>
(function(){
 const f=document.getElementById('qc-form');
 if(!f) return;
 const msg=document.getElementById('qc-msg');
 const btn=document.getElementById('qc-btn');
 f.addEventListener('submit',async function(e){
  e.preventDefault();
  msg.className='form-msg';
  const d=Object.fromEntries(new FormData(f));
  if(!d.name||!d.email||!d.phone){msg.className='form-msg err';msg.textContent='Name, phone, and email are required.';return;}
  btn.disabled=true; btn.textContent='Sending...';
  try{
   const payload=Object.assign({},d,{message:'${escHtml(b.shortName).replace(/'/g, "\\'")} TOUR REQUEST\\n\\n'+(d.notes||'(no notes)')});
   const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(r.ok){msg.className='form-msg ok';msg.textContent='Sent. Luke will reply within 1 business hour.';f.reset();}
   else{msg.className='form-msg err';msg.textContent='Failed. Email Luke@austinmdg.com or call (254) 718-2567.';}
  }catch(err){msg.className='form-msg err';msg.textContent='Network error. Email Luke@austinmdg.com.';}
  finally{btn.disabled=false; btn.textContent='Send to Luke';}
 });
})();
</script>
</body>
</html>`;
}

function listBuilderSlugs() {
  return Object.keys(BUILDER_MAP);
}

module.exports = { renderBuilderInventoryPage, listBuilderSlugs };
