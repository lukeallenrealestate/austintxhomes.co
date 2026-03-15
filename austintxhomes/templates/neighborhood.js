// Server-side renderer for neighborhood pages
// Returns a full HTML string with unique SEO meta per neighborhood

module.exports = function renderNeighborhoodPage(n) {
  const nearbyLinks = (n.nearby || []).map((slug, i) =>
    `<a class="nearby-card" href="/neighborhoods/${slug}">${n.nearbyNames[i]} →</a>`
  ).join('');

  const highlights = (n.highlights || []).map(h => `
    <div class="highlight-card">
      <div class="highlight-icon">${h.icon}</div>
      <div class="highlight-body">
        <strong>${h.label}</strong>
        <span>${h.text}</span>
      </div>
    </div>`).join('');

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

  const introParagraphs = (n.intro || []).map(p => `<p>${p}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${n.title}</title>
  <meta name="description" content="${n.metaDescription}" />
  <link rel="canonical" href="https://austintxhomes.co/neighborhoods/${n.slug}" />
  <link rel="icon" href="/favicon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${n.title}" />
  <meta property="og:description" content="${n.metaDescription}" />
  <meta property="og:url" content="https://austintxhomes.co/neighborhoods/${n.slug}" />
  <meta name="robots" content="index, follow" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="${n.name}, Austin, Texas" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": "Homes for Sale in ${n.name}, Austin TX",
    "description": "${n.metaDescription}",
    "url": "https://austintxhomes.co/neighborhoods/${n.slug}",
    "areaServed": {
      "@type": "Neighborhood",
      "name": "${n.name}",
      "containedInPlace": { "@type": "City", "name": "Austin", "addressRegion": "TX" }
    },
    "provider": {
      "@type": "RealEstateAgent",
      "name": "Luke Allen",
      "url": "https://austintxhomes.co",
      "telephone": "+12547182567",
      "hasCredential": { "@type": "EducationalOccupationalCredential", "name": "Texas Real Estate License", "identifier": "788149" }
    }
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": ${JSON.stringify(faqSchema)}
  }
  </script>

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

    /* HERO */
    .hero { margin-top: 68px; background: var(--warm); padding: 64px 32px 56px; }
    .hero-inner { max-width: var(--w); margin: 0 auto; display: grid; grid-template-columns: 1fr 380px; gap: 80px; align-items: start; }
    .breadcrumb { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--light); margin-bottom: 16px; }
    .breadcrumb a { color: var(--light); text-decoration: none; }
    .breadcrumb a:hover { color: var(--gold); }
    .hero-copy h1 { font-family: 'Cormorant Garamond', serif; font-size: clamp(40px, 5vw, 60px); font-weight: 400; line-height: 1.1; color: var(--ink); margin-bottom: 12px; }
    .hero-copy h1 em { font-style: italic; }
    .hero-tagline { font-size: 15px; color: var(--mid); margin-bottom: 28px; }
    .hero-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; }
    .tag { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; background: var(--cream); color: var(--mid); padding: 4px 12px; border-radius: 20px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn-gold { background: var(--gold); color: #fff; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; padding: 13px 24px; border-radius: var(--r); text-decoration: none; transition: background .2s; display: inline-block; }
    .btn-gold:hover { background: var(--gold-lt); }
    .btn-outline { background: transparent; color: var(--ink); font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; padding: 13px 24px; border-radius: var(--r); text-decoration: none; border: 1px solid var(--border); transition: border-color .2s; display: inline-block; }
    .btn-outline:hover { border-color: var(--gold); color: var(--gold); }

    /* STATS CARD */
    .stats-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 32px; }
    .stats-card h3 { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 400; color: var(--ink); margin-bottom: 20px; }
    .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--light); }
    .stat-val { font-size: 14px; font-weight: 500; color: var(--ink); text-align: right; max-width: 200px; }
    .stat-val.gold { color: var(--gold); font-family: 'Cormorant Garamond', serif; font-size: 18px; }
    .live-count { font-size: 12px; color: var(--mid); margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); text-align: center; }
    .live-count strong { color: var(--gold); font-size: 22px; font-family: 'Cormorant Garamond', serif; display: block; }

    /* LISTINGS */
    .listings-section { padding: 64px 32px; background: var(--bg); }
    .listings-inner { max-width: var(--w); margin: 0 auto; }
    .section-eyebrow { font-size: 11px; letter-spacing: .15em; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; }
    .section-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(32px, 4vw, 46px); font-weight: 400; line-height: 1.15; color: var(--ink); margin-bottom: 8px; }
    .section-title em { font-style: italic; }
    .section-sub { font-size: 14px; color: var(--mid); max-width: 500px; line-height: 1.7; margin-bottom: 40px; }
    .listings-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .listing-card { background: #fff; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; transition: box-shadow .25s, transform .25s; text-decoration: none; display: flex; flex-direction: column; }
    .listing-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08); transform: translateY(-2px); }
    .card-img { position: relative; height: 196px; background: var(--cream); overflow: hidden; }
    .card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-badge { position: absolute; top: 12px; left: 12px; background: var(--gold); color: #fff; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; padding: 3px 10px; border-radius: 3px; }
    .card-body { padding: 18px; flex: 1; display: flex; flex-direction: column; }
    .card-price { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 400; color: var(--ink); margin-bottom: 3px; }
    .card-address { font-size: 12px; color: var(--mid); margin-bottom: 10px; line-height: 1.4; }
    .card-details { display: flex; gap: 14px; font-size: 12px; color: var(--mid); margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); }
    .card-details strong { color: var(--ink); font-weight: 600; }
    .listings-loading { text-align: center; padding: 48px; color: var(--mid); font-size: 14px; grid-column: 1/-1; }
    .view-all { display: inline-block; margin-top: 36px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); text-decoration: none; border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 2px; }
    .view-all:hover { border-color: var(--gold); }

    /* ABOUT SECTION */
    .about-section { padding: 80px 32px; background: var(--warm); }
    .about-inner { max-width: var(--w); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; }
    .about-copy h2 { font-family: 'Cormorant Garamond', serif; font-size: 40px; font-weight: 400; line-height: 1.15; color: var(--ink); margin-bottom: 24px; }
    .about-copy h2 em { font-style: italic; }
    .about-copy p { font-size: 15px; color: var(--mid); line-height: 1.8; margin-bottom: 18px; }
    .about-copy p:last-child { margin-bottom: 0; }

    /* HIGHLIGHTS */
    .highlights { display: flex; flex-direction: column; gap: 20px; }
    .highlight-card { display: flex; gap: 16px; align-items: flex-start; background: #fff; border: 1px solid var(--border); border-radius: 6px; padding: 20px; }
    .highlight-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
    .highlight-body strong { display: block; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
    .highlight-body span { font-size: 13px; color: var(--mid); line-height: 1.6; }

    /* BUY SECTION */
    .buy-section { padding: 80px 32px; background: var(--ink); }
    .buy-inner { max-width: var(--w); margin: 0 auto; }
    .buy-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px; margin-top: 48px; }
    .buy-card { background: rgba(255,255,255,.04); border: 1px solid rgba(184,147,90,.12); padding: 32px 28px; }
    .buy-card-icon { font-size: 28px; margin-bottom: 16px; }
    .buy-card h3 { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 400; color: #fff; margin-bottom: 10px; }
    .buy-card p { font-size: 13px; color: rgba(255,255,255,.6); line-height: 1.75; }
    .buy-cta { margin-top: 48px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .buy-cta-text { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 300; color: #fff; }
    .buy-cta-text em { font-style: italic; color: var(--gold); }

    /* FAQ */
    .faq-section { padding: 80px 32px; background: var(--bg); }
    .faq-inner { max-width: var(--w); margin: 0 auto; }
    .faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 48px; }
    .faq-item { padding: 28px 0; border-bottom: 1px solid var(--border); padding-right: 48px; }
    .faq-item:nth-child(even) { padding-right: 0; padding-left: 48px; border-left: 1px solid var(--border); }
    .faq-q { font-size: 15px; font-weight: 500; color: var(--ink); margin-bottom: 10px; }
    .faq-a { font-size: 13px; color: var(--mid); line-height: 1.7; }

    /* NEARBY */
    .nearby-section { padding: 64px 32px; background: var(--warm); }
    .nearby-inner { max-width: var(--w); margin: 0 auto; }
    .nearby-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
    .nearby-card { background: #fff; border: 1px solid var(--border); border-radius: var(--r); padding: 14px 22px; text-decoration: none; color: var(--ink); font-size: 14px; font-weight: 500; transition: all .2s; }
    .nearby-card:hover { border-color: var(--gold); color: var(--gold); }

    /* CTA */
    .cta { background: var(--ink); padding: 80px 32px; }
    .cta-inner { max-width: var(--w); margin: 0 auto; display: grid; grid-template-columns: 1fr 420px; gap: 80px; align-items: center; }
    .cta-copy h2 { font-family: 'Cormorant Garamond', serif; font-size: 44px; font-weight: 400; color: #fff; line-height: 1.15; margin-bottom: 16px; }
    .cta-copy h2 em { font-style: italic; color: var(--gold); }
    .cta-copy p { font-size: 14px; color: rgba(255,255,255,.6); line-height: 1.75; margin-bottom: 16px; }
    .cta-form { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 36px; }
    .cta-form h3 { font-family: 'Cormorant Garamond', serif; font-size: 24px; color: #fff; margin-bottom: 6px; }
    .cta-form p { font-size: 13px; color: rgba(255,255,255,.45); margin-bottom: 22px; }
    .form-group { margin-bottom: 14px; }
    .form-group input, .form-group select { width: 100%; padding: 11px 14px; border: 1px solid rgba(255,255,255,.15); border-radius: var(--r); font-family: 'Inter', sans-serif; font-size: 13px; color: #fff; background: rgba(255,255,255,.08); outline: none; transition: border-color .2s; }
    .form-group input::placeholder { color: rgba(255,255,255,.3); }
    .form-group input:focus, .form-group select:focus { border-color: var(--gold); }
    .form-group select option { background: #1a1918; }
    .form-submit { width: 100%; background: var(--gold); color: #fff; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; padding: 13px; border-radius: var(--r); transition: background .2s; margin-top: 6px; }
    .form-submit:hover { background: var(--gold-lt); }

    footer { background: var(--ink); color: rgba(255,255,255,.4); padding: 40px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,.07); }
    .footer-inner { max-width: var(--w); margin: 0 auto; }
    .footer-logo img { height: 32px; opacity: .5; filter: brightness(10); margin-bottom: 20px; }
    .footer-links { display: flex; justify-content: center; gap: 28px; margin-bottom: 20px; flex-wrap: wrap; }
    .footer-links a { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.4); text-decoration: none; }
    .footer-links a:hover { color: var(--gold); }
    .footer-legal { font-size: 11px; line-height: 1.8; }
    .footer-legal a { color: rgba(255,255,255,.4); text-decoration: none; }

    @media (max-width: 900px) {
      .hero-inner { grid-template-columns: 1fr; }
      .listings-grid { grid-template-columns: 1fr 1fr; }
      .about-inner { grid-template-columns: 1fr; }
      .faq-grid { grid-template-columns: 1fr; }
      .faq-item:nth-child(even) { padding-left: 0; border-left: none; }
      .cta-inner { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      .listings-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="breadcrumb"><a href="/">Home</a> / <a href="/neighborhoods">Neighborhoods</a> / ${n.name}</p>
        <h1>${n.h1.replace('Homes for Sale in ', 'Homes for Sale in <em>').replace(', Austin TX', '</em>, Austin TX').replace(', TX', '</em>, TX')}</h1>
        <p class="hero-tagline">${n.tagline}</p>
        <div class="hero-tags">${n.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <div class="hero-actions">
          <a href="/search?neighborhood=${encodeURIComponent(n.mlsSearch)}" class="btn-gold">Search ${n.name} Listings</a>
          <a href="#about" class="btn-outline">Neighborhood Guide</a>
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
          <span class="stat-label">Commute to Downtown</span>
          <span class="stat-val">${n.commute}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Vibe</span>
          <span class="stat-val">${n.vibe}</span>
        </div>
        <div class="live-count">
          <strong id="listing-count">—</strong>
          active listings in ${n.name} right now
        </div>
      </div>
    </div>
  </section>

  <!-- LIVE LISTINGS -->
  <section class="listings-section">
    <div class="listings-inner">
      <p class="section-eyebrow">MLS Listings</p>
      <h2 class="section-title">Homes for Sale in <em>${n.name}</em></h2>
      <p class="section-sub">Updated daily from Austin MLS. Every active listing in ${n.name} — no sign-up required.</p>
      <div class="listings-grid" id="listings-grid">
        <div class="listings-loading">Loading listings…</div>
      </div>
      <a href="/search?neighborhood=${encodeURIComponent(n.mlsSearch)}" target="_blank" rel="noopener" class="view-all">View all ${n.name} listings in search →</a>
    </div>
  </section>

  <!-- ABOUT NEIGHBORHOOD -->
  <section class="about-section" id="about">
    <div class="about-inner">
      <div class="about-copy">
        <h2>Living in <em>${n.name}</em></h2>
        ${introParagraphs}
      </div>
      <div class="highlights">${highlights}</div>
    </div>
  </section>

  <!-- WHY BUY IN THIS NEIGHBORHOOD -->
  <section class="buy-section">
    <div class="buy-inner">
      <p class="section-eyebrow" style="color:var(--gold)">Buying in ${n.name}</p>
      <h2 class="section-title" style="color:#fff">Why Buy a Home in <em style="color:var(--gold-lt)">${n.name}</em>?</h2>
      <p class="section-sub" style="color:rgba(255,255,255,.6)">Here's what makes ${n.name} one of Austin's most compelling places to buy right now — and what you need to know before making an offer.</p>
      <div class="buy-grid">
        ${(n.buyReasons || []).map(r => `
        <div class="buy-card">
          <div class="buy-card-icon">${r.icon}</div>
          <h3>${r.heading}</h3>
          <p>${r.body}</p>
        </div>`).join('')}
      </div>
      <div class="buy-cta">
        <span class="buy-cta-text">Ready to buy in <em>${n.name}</em>?</span>
        <a href="#contact" class="btn-gold">Schedule a Free Buyer Consultation</a>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="faq-section">
    <div class="faq-inner">
      <p class="section-eyebrow">${n.name} Real Estate</p>
      <h2 class="section-title">Common <em>Questions</em></h2>
      <div class="faq-grid">${faqs}</div>
    </div>
  </section>

  <!-- NEARBY NEIGHBORHOODS -->
  <section class="nearby-section">
    <div class="nearby-inner">
      <p class="section-eyebrow">Also Consider</p>
      <h2 class="section-title" style="font-size:32px">Nearby <em>Neighborhoods</em></h2>
      <div class="nearby-grid">${nearbyLinks}</div>
    </div>
  </section>

  <!-- CTA / LEAD CAPTURE -->
  <section class="cta" id="contact">
    <div class="cta-inner">
      <div class="cta-copy">
        <h2>Interested in <em>${n.name}?</em></h2>
        <p>I know ${n.name} well — the best streets, which blocks to avoid, what homes are worth, and what's coming to market before it hits Zillow.</p>
        <p>Whether you're six months out or ready to make an offer this week, a 30-minute call can save you time and money.</p>
        <p style="margin-top:20px;font-size:13px;color:rgba(255,255,255,.4)">Luke Allen · TREC #788149 · (254) 718-2567</p>
      </div>
      <div class="cta-form">
        <h3>Let's Talk ${n.name}</h3>
        <p>Tell me a little about what you're looking for.</p>
        <form id="nbhd-lead-form">
          <input type="hidden" name="neighborhood" value="${n.name}" />
          <input type="hidden" name="source" value="neighborhood-page" />
          <div class="form-group"><input type="text" name="name" placeholder="Your name" required /></div>
          <div class="form-group"><input type="text" name="contact" placeholder="Phone or email" required /></div>
          <div class="form-group">
            <select name="intent">
              <option value="">I'm looking to…</option>
              <option>Buy in ${n.name}</option>
              <option>Sell in ${n.name}</option>
              <option>Just exploring the neighborhood</option>
              <option>Learn about investment potential</option>
            </select>
          </div>
          <div class="form-group"><input type="text" name="budget" placeholder="Budget range (optional)" /></div>
          <button type="submit" class="form-submit">Send Message to Luke</button>
        </form>
      </div>
    </div>
  </section>

<script src="/js/footer.js"></script>

  <script>
    // Load live MLS listings for this neighborhood
    (async function() {
      const grid = document.getElementById('listings-grid');
      try {
        const res = await fetch('/api/properties/search?neighborhood=${encodeURIComponent(n.mlsSearch)}&limit=6&status=Active');
        if (!res.ok) throw new Error();
        const data = await res.json();
        const listings = data.listings || [];
        const total = data.total || listings.length;

        document.getElementById('listing-count').textContent = total || '—';

        if (!listings.length) {
          grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mid);font-size:14px">No active listings found right now. <a href="/about#contact" style="color:var(--gold)">Contact Luke</a> for off-market opportunities.</p>';
          return;
        }

        grid.innerHTML = listings.map(l => {
          const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'Price N/A';
          const addr = l.unparsed_address || [l.street_number, l.street_name, l.city].filter(Boolean).join(' ') || '${n.name}, Austin TX';
          const beds = l.bedrooms_total || '—';
          const baths = l.bathrooms_total || '—';
          const sqft = l.living_area ? Number(l.living_area).toLocaleString() : '—';
          const img = l.photos && l.photos[0] ? l.photos[0] : '';
          const addrSlug = (l.unparsed_address || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
          const citySlug = (l.city || 'austin').toLowerCase().replace(/[^a-z]/g, '-');
          const link = l.listing_key ? (addrSlug ? '/property/' + addrSlug + '-' + citySlug + '-tx-' + l.listing_key : '/property/' + l.listing_key) : '/search?neighborhood=${encodeURIComponent(n.mlsSearch)}';
          return '<a class="listing-card" href="' + link + '">' +
            '<div class="card-img">' + (img ? '<img src="' + img + '" alt="' + addr + '" loading="lazy" />' : '') +
            '<span class="card-badge">For Sale</span></div>' +
            '<div class="card-body"><div class="card-price">' + price + '</div>' +
            '<div class="card-address">' + addr + '</div>' +
            '<div class="card-details"><span><strong>' + beds + '</strong> beds</span><span><strong>' + baths + '</strong> baths</span><span><strong>' + sqft + '</strong> sqft</span></div>' +
            '</div></a>';
        }).join('');
      } catch {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mid);font-size:14px">Unable to load listings. <a href="/search?neighborhood=${encodeURIComponent(n.mlsSearch)}" style="color:var(--gold)">Search ${n.name} listings →</a></p>';
      }
    })();

    // Lead form
    document.getElementById('nbhd-lead-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(this));
      try {
        const res = await fetch('/api/contact', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        if (res.ok) this.innerHTML = '<p style="text-align:center;padding:32px 0;color:var(--gold-lt);font-family:Cormorant Garamond,serif;font-size:20px">Got it — I\\'ll be in touch within 24 hours.</p>';
      } catch { alert('Something went wrong. Please call or email directly.'); }
    });
  </script>
</body>
</html>`;
};
