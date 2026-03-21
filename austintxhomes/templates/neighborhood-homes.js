// Server-side renderer for "homes for sale in [neighborhood]" pages
// Returns a full HTML string with live MLS listings, filter/sort bar, pagination, and lead capture

module.exports = function renderNeighborhoodHomesPage(n) {
  const nearbyLinks = (n.nearby || []).map((slug, i) =>
    `<a class="nearby-link" href="/neighborhoods/${slug}">${n.nearbyNames[i]} →</a>`
  ).join('');

  const faqs = (n.faqs || []).map(f => `
    <div class="faq-item">
      <div class="faq-q">${f.q}</div>
      <div class="faq-a">${f.a}</div>
    </div>`).join('');

  const faqSchema = (n.faqs || []).map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  }));

  const introParagraphs = (n.intro || []).slice(0, 2).join('<br><br>');

  const tagPills = (n.tags || []).map(t => `<span class="pill">${t}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Homes for Sale in ${n.name} Austin TX | MLS Listings | Luke Allen</title>
  <meta name="description" content="Browse all homes for sale in ${n.name}, Austin TX. Live MLS listings updated daily — every active property in ${n.name}. Luke Allen, TREC #788149." />
  <link rel="canonical" href="https://austintxhomes.co/neighborhoods/${n.slug}/homes-for-sale" />
  <link rel="icon" href="/favicon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Homes for Sale in ${n.name} Austin TX | MLS Listings | Luke Allen" />
  <meta property="og:description" content="Browse all homes for sale in ${n.name}, Austin TX. Live MLS listings updated daily — every active property in ${n.name}. Luke Allen, TREC #788149." />
  <meta property="og:url" content="https://austintxhomes.co/neighborhoods/${n.slug}/homes-for-sale" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="${n.name}, Austin, Texas" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "name": "Luke Allen – Austin TX Homes",
    "url": "https://austintxhomes.co",
    "telephone": "+12547182567",
    "email": "Luke@austinmdg.com",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "5.0",
      "reviewCount": "15",
      "bestRating": "5",
      "worstRating": "1"
    },
    "sameAs": [
      "https://share.google/hETte82InqUPvWeNC",
      "https://www.linkedin.com/in/lukeallentx/",
      "https://www.instagram.com/lukeallenrealty/",
      "https://www.tiktok.com/@austintxapartments"
    ]
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://austintxhomes.co/" },
      { "@type": "ListItem", "position": 2, "name": "Neighborhoods", "item": "https://austintxhomes.co/neighborhoods" },
      { "@type": "ListItem", "position": 3, "name": "${n.name}", "item": "https://austintxhomes.co/neighborhoods/${n.slug}" },
      { "@type": "ListItem", "position": 4, "name": "Homes for Sale", "item": "https://austintxhomes.co/neighborhoods/${n.slug}/homes-for-sale" }
    ]
  }
  </script>

  ${faqSchema.length ? `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": ${JSON.stringify(faqSchema)}
  }
  </script>` : ''}

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --gold: #b8935a; --gold-lt: #cda96f; --gold-pale: #f5ede0;
      --ink: #0f0f0e; --text: #1a1918; --mid: #5c5b57; --light: #999690;
      --bg: #ffffff; --warm: #faf8f4; --cream: #f1ece3; --border: #e5dfd4;
      --r: 4px; --w: 1180px;
    }
    body { font-family: 'Inter', sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }

    /* ── HERO ── */
    .hero {
      margin-top: 64px;
      background: var(--ink);
      background-image: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(184,147,90,.18) 0%, transparent 70%);
      padding: 72px 32px 64px;
      text-align: center;
    }
    .hero-eyebrow {
      font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--gold); margin-bottom: 16px;
    }
    .hero h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(40px, 6vw, 68px);
      font-weight: 400; line-height: 1.1; color: #fff;
      margin-bottom: 16px;
    }
    .hero h1 em { font-style: italic; color: var(--gold-lt); }
    .hero-sub {
      font-size: 15px; color: rgba(255,255,255,.6);
      max-width: 560px; margin: 0 auto 32px; line-height: 1.7;
    }
    .hero-pills {
      display: flex; gap: 8px; flex-wrap: wrap;
      justify-content: center; margin-bottom: 36px;
    }
    .pill {
      font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
      padding: 5px 14px; border-radius: 20px;
      background: rgba(255,255,255,.08); color: rgba(255,255,255,.6);
      border: 1px solid rgba(255,255,255,.12);
    }
    .pill-gold {
      background: var(--gold); color: #fff; border-color: var(--gold);
    }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .btn-gold {
      background: var(--gold); color: #fff; border: none; cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em;
      text-transform: uppercase; padding: 13px 28px; border-radius: var(--r);
      text-decoration: none; transition: background .2s; display: inline-block;
    }
    .btn-gold:hover { background: var(--gold-lt); }
    .btn-outline-white {
      background: transparent; color: #fff;
      font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em;
      text-transform: uppercase; padding: 13px 28px; border-radius: var(--r);
      text-decoration: none; border: 1px solid rgba(255,255,255,.25);
      transition: border-color .2s; display: inline-block;
    }
    .btn-outline-white:hover { border-color: var(--gold); color: var(--gold-lt); }

    /* ── FILTER BAR ── */
    .filter-bar {
      background: var(--warm); border-bottom: 1px solid var(--border);
      padding: 14px 32px; position: sticky; top: 64px; z-index: 90;
    }
    .filter-bar-inner {
      max-width: var(--w); margin: 0 auto;
      display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    }
    .filter-bar select {
      padding: 8px 32px 8px 12px; border: 1px solid var(--border);
      border-radius: var(--r); background: var(--bg);
      font-family: 'Inter', sans-serif; font-size: 13px; color: var(--text);
      cursor: pointer; outline: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23999690' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center;
      transition: border-color .2s;
    }
    .filter-bar select:hover, .filter-bar select:focus { border-color: var(--gold); }
    .filter-bar-result {
      margin-left: auto; font-size: 12px; color: var(--light);
      white-space: nowrap;
    }
    .filter-bar-result span { color: var(--gold); font-weight: 600; }

    /* ── LISTINGS SECTION ── */
    .listings-section { padding: 64px 32px; background: var(--bg); }
    .listings-inner { max-width: var(--w); margin: 0 auto; }
    .section-eyebrow {
      font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--gold); margin-bottom: 12px;
    }
    .section-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(32px, 4vw, 48px); font-weight: 400;
      line-height: 1.15; color: var(--ink); margin-bottom: 8px;
    }
    .section-title em { font-style: italic; }
    .section-sub {
      font-size: 14px; color: var(--mid); max-width: 520px;
      line-height: 1.7; margin-bottom: 40px;
    }

    /* ── LISTINGS GRID ── */
    .listings-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
    }
    .listing-card {
      background: #fff; border: 1px solid var(--border); border-radius: 6px;
      overflow: hidden; text-decoration: none; display: flex; flex-direction: column;
      transition: box-shadow .25s, transform .25s; color: var(--text);
    }
    .listing-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.09); transform: translateY(-3px); }
    .card-img {
      position: relative;
      aspect-ratio: 3 / 2;
      background: linear-gradient(135deg, var(--cream) 0%, var(--border) 100%);
      overflow: hidden;
    }
    .card-img img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .card-img-placeholder {
      width: 100%; height: 100%;
      background: linear-gradient(135deg, var(--cream) 0%, var(--border) 100%);
    }
    .card-badge {
      position: absolute; top: 12px; left: 12px;
      background: var(--gold); color: #fff;
      font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 3px;
    }
    .card-badge-new {
      position: absolute; top: 12px; left: 72px;
      background: #22863a; color: #fff;
      font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 3px;
    }
    .card-body {
      padding: 18px 20px 20px; flex: 1;
      display: flex; flex-direction: column;
    }
    .card-price {
      font-family: 'Cormorant Garamond', serif;
      font-size: 26px; font-weight: 400; color: var(--gold);
      margin-bottom: 4px; line-height: 1.2;
    }
    .card-address {
      font-size: 13px; color: var(--mid);
      margin-bottom: 12px; line-height: 1.4;
    }
    .card-details {
      display: flex; gap: 6px; font-size: 12px; color: var(--mid);
      margin-top: auto; padding-top: 12px;
      border-top: 1px solid var(--border); align-items: center;
    }
    .card-details strong { color: var(--ink); font-weight: 600; }
    .card-cta {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      color: var(--gold); margin-top: 12px; font-weight: 500;
    }
    .listings-loading {
      grid-column: 1 / -1; text-align: center;
      padding: 64px 32px; color: var(--mid); font-size: 14px;
    }
    .empty-state {
      grid-column: 1 / -1; text-align: center;
      padding: 64px 32px; color: var(--mid); font-size: 14px;
      line-height: 1.8;
    }
    .empty-state a { color: var(--gold); text-decoration: none; }
    .empty-state a:hover { text-decoration: underline; }

    /* ── PAGINATION ── */
    .pagination {
      display: flex; gap: 8px; align-items: center;
      justify-content: center; margin-top: 48px; flex-wrap: wrap;
    }
    .page-btn {
      padding: 8px 14px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text);
      font-family: 'Inter', sans-serif; font-size: 13px;
      border-radius: var(--r); cursor: pointer; transition: all .2s;
    }
    .page-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
    .page-btn.active { background: var(--gold); color: #fff; border-color: var(--gold); }
    .page-btn:disabled { opacity: .4; cursor: not-allowed; }
    .page-ellipsis { color: var(--light); padding: 0 4px; }

    /* ── NEIGHBORHOOD GUIDE ── */
    .guide-section { padding: 80px 32px; background: var(--warm); }
    .guide-inner {
      max-width: var(--w); margin: 0 auto;
      display: grid; grid-template-columns: 1fr 360px; gap: 72px; align-items: start;
    }
    .guide-copy h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(32px, 4vw, 42px); font-weight: 400;
      line-height: 1.15; color: var(--ink); margin-bottom: 20px;
    }
    .guide-copy h2 em { font-style: italic; }
    .guide-copy p {
      font-size: 15px; color: var(--mid); line-height: 1.8; margin-bottom: 18px;
    }
    .guide-links { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 28px; }
    .guide-link {
      font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
      color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 2px;
      transition: border-color .2s;
    }
    .guide-link:hover { border-color: var(--gold); }

    /* ── STATS CARD ── */
    .stats-card {
      background: #fff; border: 1px solid var(--border);
      border-radius: 8px; padding: 28px;
    }
    .stats-card h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 20px; font-weight: 400; color: var(--ink); margin-bottom: 18px;
    }
    .stat-row {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 10px 0; border-bottom: 1px solid var(--border);
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      color: var(--light); padding-right: 12px; flex-shrink: 0;
    }
    .stat-val { font-size: 13px; font-weight: 500; color: var(--ink); text-align: right; }
    .stat-val.gold {
      color: var(--gold); font-family: 'Cormorant Garamond', serif; font-size: 18px;
    }

    /* ── WHY LUKE ── */
    .why-section { padding: 80px 32px; background: var(--ink); }
    .why-inner { max-width: var(--w); margin: 0 auto; }
    .why-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin-top: 48px;
    }
    .why-card {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(184,147,90,.12);
      padding: 36px 30px;
    }
    .why-card h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px; font-weight: 400; color: #fff; margin-bottom: 12px;
    }
    .why-card p { font-size: 13px; color: rgba(255,255,255,.6); line-height: 1.75; }
    .why-num {
      font-family: 'Cormorant Garamond', serif;
      font-size: 40px; color: var(--gold); opacity: .4;
      line-height: 1; margin-bottom: 16px;
    }

    /* ── CONTACT SECTION ── */
    .contact-section { padding: 80px 32px; background: var(--warm); }
    .contact-inner {
      max-width: var(--w); margin: 0 auto;
      display: grid; grid-template-columns: 1fr 420px; gap: 80px; align-items: start;
    }
    .contact-copy h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(32px, 4vw, 44px); font-weight: 400;
      line-height: 1.15; color: var(--ink); margin-bottom: 16px;
    }
    .contact-copy h2 em { font-style: italic; }
    .contact-copy p { font-size: 14px; color: var(--mid); line-height: 1.75; margin-bottom: 14px; }
    .trust-badges { display: flex; gap: 12px; flex-wrap: wrap; margin: 24px 0; }
    .trust-badge {
      font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
      background: var(--cream); color: var(--mid);
      padding: 6px 14px; border-radius: var(--r);
      border: 1px solid var(--border);
    }
    .trust-badge strong { color: var(--ink); }
    .nearby-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
    .nearby-link {
      font-size: 12px; color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 1px;
      transition: border-color .2s;
    }
    .nearby-link:hover { border-color: var(--gold); }

    /* ── FORM CARD ── */
    .form-card {
      background: var(--ink); border-radius: 8px; padding: 36px;
    }
    .form-card h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24px; color: #fff; margin-bottom: 6px;
    }
    .form-card p { font-size: 13px; color: rgba(255,255,255,.45); margin-bottom: 24px; }
    .form-group { margin-bottom: 14px; }
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%; padding: 11px 14px;
      border: 1px solid rgba(255,255,255,.15); border-radius: var(--r);
      font-family: 'Inter', sans-serif; font-size: 13px;
      color: #fff; background: rgba(255,255,255,.08);
      outline: none; transition: border-color .2s; resize: vertical;
    }
    .form-group input::placeholder,
    .form-group textarea::placeholder { color: rgba(255,255,255,.3); }
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus { border-color: var(--gold); }
    .form-group select option { background: #1a1918; color: #fff; }
    .form-submit {
      width: 100%; background: var(--gold); color: #fff; border: none;
      cursor: pointer; font-family: 'Inter', sans-serif;
      font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
      padding: 14px; border-radius: var(--r); transition: background .2s; margin-top: 6px;
    }
    .form-submit:hover { background: var(--gold-lt); }

    /* ── FAQ ── */
    .faq-section { padding: 72px 32px; background: var(--bg); }
    .faq-inner { max-width: var(--w); margin: 0 auto; }
    .faq-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 40px;
    }
    .faq-item {
      padding: 24px 0; border-bottom: 1px solid var(--border); padding-right: 48px;
    }
    .faq-item:nth-child(even) {
      padding-right: 0; padding-left: 48px; border-left: 1px solid var(--border);
    }
    .faq-q { font-size: 15px; font-weight: 500; color: var(--ink); margin-bottom: 10px; }
    .faq-a { font-size: 13px; color: var(--mid); line-height: 1.7; }

    /* ── RESPONSIVE ── */
    @media (max-width: 960px) {
      .listings-grid { grid-template-columns: repeat(2, 1fr); }
      .why-grid { grid-template-columns: 1fr; gap: 1px; }
      .guide-inner { grid-template-columns: 1fr; }
      .contact-inner { grid-template-columns: 1fr; }
      .faq-grid { grid-template-columns: 1fr; }
      .faq-item:nth-child(even) { padding-left: 0; border-left: none; }
    }
    @media (max-width: 600px) {
      .listings-grid { grid-template-columns: 1fr; }
      .filter-bar-inner { gap: 8px; }
      .filter-bar select { font-size: 12px; }
      .filter-bar-result { margin-left: 0; width: 100%; }
      .hero { padding: 56px 20px 48px; }
    }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

  <!-- HERO -->
  <section class="hero">
    <p class="hero-eyebrow">${n.name} Austin TX · MLS Listings</p>
    <h1>Homes for Sale in<br><em>${n.name}</em></h1>
    <p class="hero-sub">Every active MLS listing in ${n.name}, Austin TX — updated daily. No sign-up required. Luke Allen, TREC #788149.</p>
    <div class="hero-pills">
      <span class="pill pill-gold">Live MLS Data</span>
      <span class="pill">Updated Daily</span>
      <span class="pill">${n.name}</span>
      <span class="pill">Luke Allen · TREC #788149</span>
      ${tagPills}
    </div>
    <div class="hero-actions">
      <a href="#contact" class="btn-gold">Talk to Luke Allen →</a>
      <a href="#listings" class="btn-outline-white">View Listings ↓</a>
    </div>
  </section>

  <!-- FILTER BAR -->
  <div class="filter-bar">
    <div class="filter-bar-inner">
      <select id="sort-select">
        <option value="newest">Sort: Newest ▾</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
      </select>
      <select id="beds-select">
        <option value="">Min Beds: Any ▾</option>
        <option value="1">1+ Beds</option>
        <option value="2">2+ Beds</option>
        <option value="3">3+ Beds</option>
        <option value="4">4+ Beds</option>
        <option value="5">5+ Beds</option>
      </select>
      <select id="minprice-select">
        <option value="">Min Price: Any ▾</option>
        <option value="300000">$300K+</option>
        <option value="500000">$500K+</option>
        <option value="750000">$750K+</option>
        <option value="1000000">$1M+</option>
        <option value="1500000">$1.5M+</option>
        <option value="2000000">$2M+</option>
      </select>
      <select id="maxprice-select">
        <option value="">Max Price: Any ▾</option>
        <option value="500000">Under $500K</option>
        <option value="750000">Under $750K</option>
        <option value="1000000">Under $1M</option>
        <option value="1500000">Under $1.5M</option>
        <option value="2000000">Under $2M</option>
        <option value="3000000">Under $3M</option>
      </select>
      <span class="filter-bar-result">Results: <span id="result-count">—</span> listings</span>
    </div>
  </div>

  <!-- LISTINGS GRID -->
  <section class="listings-section" id="listings">
    <div class="listings-inner">
      <p class="section-eyebrow">Current MLS Listings</p>
      <h2 class="section-title">${n.name} Homes for Sale</h2>
      <p class="section-sub">Live data from Austin MLS. Click any listing to view details.</p>
      <div class="listings-grid" id="listings-grid">
        <div class="listings-loading">Loading ${n.name} listings…</div>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>
  </section>

  <!-- NEIGHBORHOOD GUIDE -->
  <section class="guide-section">
    <div class="guide-inner">
      <div class="guide-copy">
        <p class="section-eyebrow">${n.area}</p>
        <h2>About <em>${n.name}</em></h2>
        <p>${introParagraphs}</p>
        <div class="guide-links">
          <a href="/neighborhoods/${n.slug}" class="guide-link">Full ${n.name} Guide →</a>
          <a href="/neighborhoods/${n.slug}/best-realtor" class="guide-link">Best Realtor in ${n.name} →</a>
        </div>
      </div>
      <div class="stats-card">
        <h3>${n.name} at a Glance</h3>
        <div class="stat-row">
          <span class="stat-label">Median Price</span>
          <span class="stat-val gold">${n.medianPrice}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Price Range</span>
          <span class="stat-val">${n.priceRange}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Home Types</span>
          <span class="stat-val">${n.homeTypes}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Schools</span>
          <span class="stat-val">${n.schools}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Commute</span>
          <span class="stat-val">${n.commute}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Vibe</span>
          <span class="stat-val">${n.vibe}</span>
        </div>
      </div>
    </div>
  </section>

  <!-- WHY USE LUKE ALLEN -->
  <section class="why-section">
    <div class="why-inner">
      <p class="section-eyebrow" style="color:var(--gold)">Your ${n.name} Realtor</p>
      <h2 class="section-title" style="color:#fff">Why Use <em style="color:var(--gold-lt)">Luke Allen</em>?</h2>
      <p class="section-sub" style="color:rgba(255,255,255,.55)">Luke Allen is a licensed Texas REALTOR specializing in ${n.name} and Central Austin. Here's why buyers choose him.</p>
      <div class="why-grid">
        <div class="why-card">
          <div class="why-num">01</div>
          <h3>Local ${n.name} Knowledge</h3>
          <p>Luke Allen knows every street, every block, and what comparable homes have actually sold for in ${n.name}. Not just MLS data — real on-the-ground knowledge.</p>
        </div>
        <div class="why-card">
          <div class="why-num">02</div>
          <h3>Buyer Representation</h3>
          <p>Luke Allen represents buyers in ${n.name} at no cost to you. His commission is paid by the seller. You get expert representation for free.</p>
        </div>
        <div class="why-card">
          <div class="why-num">03</div>
          <h3>Off-Market Access</h3>
          <p>Some of the best ${n.name} homes never hit MLS. Luke Allen's network means you hear about properties before they're listed publicly.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  ${faqSchema.length ? `<section class="faq-section">
    <div class="faq-inner">
      <p class="section-eyebrow">${n.name} Real Estate</p>
      <h2 class="section-title">Common <em>Questions</em></h2>
      <div class="faq-grid">${faqs}</div>
    </div>
  </section>` : ''}

  <!-- CONTACT -->
  <section class="contact-section" id="contact">
    <div class="contact-inner">
      <div class="contact-copy">
        <p class="section-eyebrow">${n.name} Specialist</p>
        <h2>Interested in <em>${n.name}?</em></h2>
        <p>Luke Allen knows ${n.name} well — the best streets, which blocks to avoid, what homes are worth, and what's coming to market before it hits Zillow.</p>
        <p>Whether you're six months out or ready to make an offer this week, a free call can save you significant time and money.</p>
        <div class="trust-badges">
          <span class="trust-badge">⭐ <strong>5.0</strong> Google Rating</span>
          <span class="trust-badge">TREC <strong>#788149</strong></span>
          <span class="trust-badge">${n.name} <strong>Specialist</strong></span>
        </div>
        <p style="font-size:13px;color:var(--light)">Luke Allen · (254) 718-2567 · Luke@austinmdg.com</p>
        ${nearbyLinks ? `<div class="nearby-links">${nearbyLinks}</div>` : ''}
      </div>
      <div class="form-card">
        <h3>Let's Talk ${n.name}</h3>
        <p>Tell Luke a little about what you're looking for.</p>
        <form id="homes-lead-form">
          <input type="hidden" name="source" value="${n.slug}-homes-for-sale" />
          <div class="form-group"><input type="text" name="name" placeholder="Your name" required /></div>
          <div class="form-group"><input type="text" name="contact" placeholder="Phone or email" required /></div>
          <div class="form-group">
            <select name="intent">
              <option value="">I'm looking to…</option>
              <option value="buy">Buy in ${n.name}</option>
              <option value="sell">Sell in ${n.name}</option>
              <option value="both">Both</option>
              <option value="investment">Investment</option>
              <option value="exploring">Just exploring</option>
            </select>
          </div>
          <div class="form-group">
            <select name="budget">
              <option value="">Budget range…</option>
              <option value="under-500k">Under $500K</option>
              <option value="500k-750k">$500K–$750K</option>
              <option value="750k-1m">$750K–$1M</option>
              <option value="1m-1.5m">$1M–$1.5M</option>
              <option value="1.5m-2m">$1.5M–$2M</option>
              <option value="2m+">$2M+</option>
            </select>
          </div>
          <div class="form-group"><textarea name="notes" rows="3" placeholder="Anything else? (optional)"></textarea></div>
          <button type="submit" class="form-submit">Connect With Luke Allen →</button>
        </form>
      </div>
    </div>
  </section>

<script src="/js/footer.js"></script>

<script>
  let currentPage = 1;
  let totalPages = 1;
  let currentSort = 'newest';
  let currentBeds = '';
  let currentMaxPrice = '';
  let currentMinPrice = '';

  const grid = document.getElementById('listings-grid');
  const countEl = document.getElementById('result-count');

  async function fetchListings(page) {
    currentPage = page;
    grid.innerHTML = '<div class="listings-loading">Loading ${n.name} listings\u2026</div>';

    if (page > 1) document.getElementById('listings').scrollIntoView({behavior: 'smooth', block: 'start'});

    const params = new URLSearchParams({
      neighborhood: '${n.mlsSearch}',
      sortBy: currentSort,
      page: page,
      minPrice: currentMinPrice || '75000',
      limit: 12
    });
    if (currentBeds) params.set('minBeds', currentBeds);
    if (currentMaxPrice) params.set('maxPrice', currentMaxPrice);

    try {
      const res = await fetch('/api/properties/search?' + params);
      const data = await res.json();
      const listings = data.listings || data.properties || [];
      const total = data.total || data.totalCount || listings.length;
      totalPages = Math.ceil(total / 12);

      if (countEl) countEl.textContent = total;

      renderListings(listings);
      renderPagination();
    } catch(e) {
      grid.innerHTML = '<div class="empty-state">Unable to load listings. <a href="/search?neighborhood=${encodeURIComponent(n.mlsSearch)}">Search ${n.name} \u2192</a></div>';
    }
  }

  function renderListings(listings) {
    if (!listings.length) {
      grid.innerHTML = '<div class="empty-state">No ${n.name} listings match your filters right now.<br><a href="#contact">Contact Luke Allen for off-market options \u2192</a></div>';
      return;
    }
    grid.innerHTML = listings.map(function(l) {
      const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'Price N/A';
      const addr = l.unparsed_address || '${n.name}, Austin TX';
      const beds = l.bedrooms_total || '\u2014';
      const baths = l.bathrooms_total || '\u2014';
      const sqft = l.living_area ? Number(l.living_area).toLocaleString() : '\u2014';
      const img = l.photos && l.photos[0] ? l.photos[0] : '';
      const addrSlug = (l.unparsed_address || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\\s+/g, '-');
      const citySlug = (l.city || 'austin').toLowerCase().replace(/[^a-z]/g, '-');
      const link = l.listing_key
        ? (addrSlug ? '/property/' + addrSlug + '-' + citySlug + '-tx-' + l.listing_key : '/property/' + l.listing_key)
        : '/search?neighborhood=${encodeURIComponent(n.mlsSearch)}';
      const isNew = l.list_date && (Date.now() - new Date(l.list_date).getTime()) < 7 * 24 * 60 * 60 * 1000;

      return '<a class="listing-card" href="' + link + '">' +
        '<div class="card-img">' +
        (img ? '<img src="' + img + '" alt="' + addr + '" loading="lazy"/>' : '<div class="card-img-placeholder"></div>') +
        '<span class="card-badge">For Sale</span>' +
        (isNew ? '<span class="card-badge-new">New</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-price">' + price + '</div>' +
        '<div class="card-address">' + addr + '</div>' +
        '<div class="card-details"><span><strong>' + beds + '</strong> bd</span><span>\u00b7</span><span><strong>' + baths + '</strong> ba</span><span>\u00b7</span><span><strong>' + sqft + '</strong> sqft</span></div>' +
        '<div class="card-cta">View Details \u2192</div>' +
        '</div></a>';
    }).join('');
  }

  function renderPagination() {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    html += '<button class="page-btn" onclick="fetchListings(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') + '>\u2190 Prev</button>';

    let pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages = [1, 2];
      if (currentPage > 4) pages.push('...');
      for (let i = Math.max(3, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 3) pages.push('...');
      pages.push(totalPages - 1, totalPages);
      pages = [...new Set(pages)];
    }

    pages.forEach(function(p) {
      if (p === '...') html += '<span class="page-ellipsis">\u2026</span>';
      else html += '<button class="page-btn' + (p === currentPage ? ' active' : '') + '" onclick="fetchListings(' + p + ')">' + p + '</button>';
    });

    html += '<button class="page-btn" onclick="fetchListings(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>Next \u2192</button>';
    el.innerHTML = html;
  }

  document.getElementById('sort-select').addEventListener('change', function(e) { currentSort = e.target.value; fetchListings(1); });
  document.getElementById('beds-select').addEventListener('change', function(e) { currentBeds = e.target.value; fetchListings(1); });
  document.getElementById('maxprice-select').addEventListener('change', function(e) { currentMaxPrice = e.target.value; fetchListings(1); });
  document.getElementById('minprice-select').addEventListener('change', function(e) { currentMinPrice = e.target.value; fetchListings(1); });

  document.getElementById('homes-lead-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(this));
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(formData)
      });
      if (res.ok) this.innerHTML = '<p style="text-align:center;padding:32px 0;color:var(--gold);font-family:Cormorant Garamond,serif;font-size:20px">Got it \u2014 Luke Allen will be in touch within 24 hours.</p>';
    } catch { alert('Something went wrong. Please call or email directly.'); }
  });

  fetchListings(1);
</script>
</body>
</html>`;
};
