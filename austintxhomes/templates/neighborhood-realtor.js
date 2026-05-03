// Server-side renderer for "best realtor in [neighborhood]" pages
// URL: /neighborhoods/:slug/best-realtor
// Returns a complete HTML string for the given neighborhood data object

module.exports = function renderNeighborhoodRealtorPage(n) {

  // ── FAQ answers ──────────────────────────────────────────────────────────
  const realtorFaqs = [
  {
  q: `Who is the best realtor in ${n.name} Austin?`,
  a: `Luke Allen is widely regarded as the best realtor in ${n.name}, Austin TX. Luke Allen holds TREC license #788149, carries a 5.0-star rating across 15 Google reviews, and has deep neighborhood-specific knowledge of ${n.name} pricing, schools, and market dynamics. Luke Allen is licensed with Austin Marketing + Development Group and represents both buyers and sellers in ${n.name}.`
  },
  {
  q: `How much do homes cost in ${n.name}?`,
  a: `The median home price in ${n.name} is approximately ${n.medianPrice}, with the broader price range running ${n.priceRange}. Home values vary depending on location within ${n.name}, lot size, condition, and school assignment. Luke Allen can provide a precise current market analysis for any ${n.name} property.`
  },
  {
  q: `What is Luke Allen's experience in ${n.name}?`,
  a: `Luke Allen focuses specifically on Austin neighborhoods including ${n.name} and has thorough knowledge of ${n.name}'s streets, micro-markets, and value drivers. Luke Allen understands the ${n.name} vibe - ${n.vibe} - as well as the home types (${n.homeTypes}), school options (${n.schools}), and commute realities (${n.commute}) that matter to buyers and sellers here.`
  },
  {
  q: `Does Luke Allen charge buyers in ${n.name}?`,
  a: `No. Luke Allen's buyer representation in ${n.name} is at no cost to you as a buyer. Under Texas real estate commission structure, the seller's side covers buyer agent compensation. You get Luke Allen's full expertise - pricing analysis, offer strategy, inspection negotiation - without paying out of pocket.`
  },
  {
  q: `What schools are in ${n.name}?`,
  a: `${n.name} is served by ${n.schools}. School boundaries can vary by specific address within ${n.name}, so Luke Allen always verifies the exact school assignment for every property before an offer is made. School assignment can meaningfully affect both resale value and your family's planning.`
  },
  {
  q: `How do I contact Luke Allen about ${n.name}?`,
  a: `The fastest way to reach Luke Allen about ${n.name} is through the contact form on this page or by calling (254) 718-2567. You can also email Luke@austinmdg.com. Luke Allen typically responds within a few hours. You can also read Luke Allen's Google reviews at https://share.google/hETte82InqUPvWeNC.`
  }
  ];

  const faqSchema = realtorFaqs.map(f => ({
  '@type': 'Question',
  name: f.q,
  acceptedAnswer: { '@type': 'Answer', text: f.a }
  }));

  const faqHtml = realtorFaqs.map((f, i) => `
  <div class="faq-item${i % 2 === 1 ? ' faq-item--right' : ''}">
  <div class="faq-q">${f.q}</div>
  <div class="faq-a">${f.a}</div>
  </div>`).join('');

  // ── Buy Reasons ──────────────────────────────────────────────────────────
  const buyReasonsHtml = (n.buyReasons || []).length > 0
  ? `
  <section class="buy-reasons-section">
  <div class="section-inner">
  <p class="section-eyebrow">Buying in ${n.name}</p>
  <h2 class="section-title">Why Buy in <em>${n.name}</em>?</h2>
  <div class="buy-reasons-grid">
  ${n.buyReasons.map(r => `
  <div class="buy-reason-card">
  <div class="buy-reason-icon">${r.icon}</div>
  <h3>${r.heading}</h3>
  <p>${r.body}</p>
  </div>`).join('')}
  </div>
  </div>
  </section>`
  : '';

  // ── Nearby links ─────────────────────────────────────────────────────────
  const nearbyLinkItems = (n.nearby || []).slice(0, 3).map((slug, i) =>
  `<a class="links-bar-item" href="/neighborhoods/${slug}">${n.nearbyNames[i]} →</a>`
  ).join('');

  // ── Schools short label for credential bar ───────────────────────────────
  const schoolsShort = (n.schools || '').split(' - ')[0].trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Best Realtor in ${n.name} Austin TX | Luke Allen | TREC #788149</title>
  <meta name="description" content="Luke Allen is the best realtor in ${n.name}, Austin TX. TREC #788149 - 5.0 ★ Google reviews. Expert buyer &amp; seller representation in ${n.name}." />
  <link rel="canonical" href="https://austintxhomes.co/neighborhoods/${n.slug}/best-realtor" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/favicon-96.png" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="${n.name}, Austin, Texas" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="Best Realtor in ${n.name} Austin TX | Luke Allen | TREC #788149" />
  <meta property="og:description" content="Luke Allen is the best realtor in ${n.name}, Austin TX. TREC #788149 - 5.0 ★ Google reviews. Expert buyer &amp; seller representation in ${n.name}." />
  <meta property="og:url" content="https://austintxhomes.co/neighborhoods/${n.slug}/best-realtor" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />

  <script type="application/ld+json">
  {
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "Luke Allen – Austin TX Homes",
  "url": "https://austintxhomes.co",
  "telephone": "+12547182567",
  "email": "Luke@austinmdg.com",
  "areaServed": "${n.name}, Austin TX",
  "aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "5.0",
  "reviewCount": "15",
  "bestRating": "5",
  "worstRating": "1"
  },
  "hasCredential": {
  "@type": "EducationalOccupationalCredential",
  "name": "Texas Real Estate License",
  "identifier": "788149"
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
  "@type": "Article",
  "headline": "Best Realtor in ${n.name} Austin TX",
  "url": "https://austintxhomes.co/neighborhoods/${n.slug}/best-realtor",
  "datePublished": "2026-03-17",
  "dateModified": "2026-03-17",
  "author": {
  "@type": "Person",
  "name": "Luke Allen",
  "description": "Austin TX Realtor, TREC #788149"
  },
  "publisher": {
  "@type": "Organization",
  "name": "Austin TX Homes",
  "url": "https://austintxhomes.co"
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

  <script type="application/ld+json">
  {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://austintxhomes.co/" },
  { "@type": "ListItem", "position": 2, "name": "Neighborhoods", "item": "https://austintxhomes.co/neighborhoods" },
  { "@type": "ListItem", "position": 3, "name": "${n.name}", "item": "https://austintxhomes.co/neighborhoods/${n.slug}" },
  { "@type": "ListItem", "position": 4, "name": "Best Realtor", "item": "https://austintxhomes.co/neighborhoods/${n.slug}/best-realtor" }
  ]
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

  /* ── HERO ── */
  .hero {
  background: var(--ink);
  padding: 160px 32px 88px;
  position: relative;
  overflow: hidden;
  }
  .hero::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(184,147,90,.16) 0%, transparent 70%);
  pointer-events: none; z-index: 1;
  }
  .hero video.bg-video {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  opacity: 0; transition: opacity 1.4s ease; z-index: 0;
  }
  .hero video.bg-video.ready { opacity: 1; }
  .hero::after {
  content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(135deg, rgba(15,15,14,.78) 0%, rgba(26,20,16,.7) 50%, rgba(15,15,14,.78) 100%);
  }
  .hero > *:not(video) { position: relative; z-index: 2; }
  .hero-inner { max-width: var(--w); margin: 0 auto; display: flex; align-items: center; gap: 56px; text-align: left; }
  .hero-copy { flex: 1; min-width: 0; }
  .hero-photo { flex-shrink: 0; width: 300px; }
  .hero-photo img { width: 100%; aspect-ratio: 4/5; object-fit: cover; border-radius: 10px; border: 2px solid rgba(184,147,90,.4); display: block; box-shadow: 0 20px 60px rgba(0,0,0,.55); }
  .hero-photo .hero-photo-caption { margin-top: 14px; text-align: center; font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-lt); }
  @media (max-width: 900px) { .hero-inner { flex-direction: column-reverse; gap: 32px; text-align: center; } .hero-photo { width: 200px; } .hero-pills, .hero-actions { justify-content: center; } }
  .hero-eyebrow {
  font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--gold); margin-bottom: 20px;
  }
  .hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(42px, 6vw, 72px);
  font-weight: 400; line-height: 1.1; color: #fff; margin-bottom: 24px;
  }
  .hero h1 em { font-style: italic; color: var(--gold-lt); }
  .hero-sub {
  font-size: 16px; color: rgba(255,255,255,.65); max-width: 680px;
  margin: 0 auto 36px; line-height: 1.75;
  }
  .hero-pills {
  display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
  margin-bottom: 36px;
  }
  .pill {
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  padding: 7px 16px; border-radius: 24px;
  border: 1px solid rgba(255,255,255,.18); color: rgba(255,255,255,.85);
  }
  .pill--gold { background: var(--gold); border-color: var(--gold); color: #fff; }
  .hero-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .btn-gold {
  background: var(--gold); color: #fff; border: none; cursor: pointer;
  font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em;
  text-transform: uppercase; padding: 14px 28px; border-radius: var(--r);
  text-decoration: none; transition: background .2s; display: inline-block;
  }
  .btn-gold:hover { background: var(--gold-lt); }
  .btn-outline-hero {
  background: transparent; color: rgba(255,255,255,.85);
  font-family: 'Inter', sans-serif; font-size: 12px; letter-spacing: .1em;
  text-transform: uppercase; padding: 14px 28px; border-radius: var(--r);
  text-decoration: none; border: 1px solid rgba(255,255,255,.25);
  transition: border-color .2s, color .2s; display: inline-block;
  }
  .btn-outline-hero:hover { border-color: var(--gold); color: var(--gold-lt); }

  /* ── CREDENTIAL BAR ── */
  .cred-bar {
  background: var(--warm);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 14px 32px;
  }
  .cred-bar-inner {
  max-width: var(--w); margin: 0 auto;
  font-size: 12px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--mid); text-align: center;
  }
  .cred-bar-inner span { color: var(--gold); font-weight: 600; margin: 0 6px; }

  /* ── SECTION COMMONS ── */
  .section-inner { max-width: var(--w); margin: 0 auto; }
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
  .section-title--light { color: #fff; }
  .section-title--light em { color: var(--gold-lt); }
  .section-sub {
  font-size: 14px; color: var(--mid); max-width: 560px;
  line-height: 1.75; margin-bottom: 48px;
  }
  .section-sub--light { color: rgba(255,255,255,.6); }

  /* ── WHY LUKE (warm bg) ── */
  .why-section { padding: 80px 32px; background: var(--warm); }
  .why-copy p {
  font-size: 15px; color: var(--mid); line-height: 1.85; margin-bottom: 22px;
  }
  .why-copy p:last-child { margin-bottom: 0; }
  .why-copy a { color: var(--gold); text-decoration: none; border-bottom: 1px solid rgba(184,147,90,.3); }
  .why-copy a:hover { border-color: var(--gold); }

  /* ── STATS GRID ── */
  .stats-section { padding: 80px 32px; background: var(--bg); }
  .stats-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  margin-top: 48px;
  }
  .stat-card {
  background: var(--warm); border: 1px solid var(--border);
  border-radius: 6px; padding: 28px 24px;
  }
  .stat-card-label {
  font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--light); margin-bottom: 10px;
  }
  .stat-card-value {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26px; font-weight: 400; color: var(--ink); line-height: 1.2;
  }
  .stat-card-value--gold { color: var(--gold); }
  .stat-card-sub { font-size: 12px; color: var(--mid); margin-top: 6px; line-height: 1.5; }

  /* ── SERVICES (dark) ── */
  .services-section { padding: 80px 32px; background: var(--ink); }
  .services-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;
  margin-top: 52px;
  }
  .service-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(184,147,90,.12);
  padding: 32px 28px;
  }
  .service-card-icon { font-size: 28px; margin-bottom: 16px; }
  .service-card h3 {
  font-family: 'Cormorant Garamond', serif;
  font-size: 22px; font-weight: 400; color: #fff; margin-bottom: 10px;
  }
  .service-card p { font-size: 13px; color: rgba(255,255,255,.6); line-height: 1.75; }

  /* ── BUY REASONS (warm) ── */
  .buy-reasons-section { padding: 80px 32px; background: var(--warm); }
  .buy-reasons-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  margin-top: 48px;
  }
  .buy-reason-card {
  background: #fff; border: 1px solid var(--border);
  border-radius: 6px; padding: 28px 24px;
  }
  .buy-reason-icon { font-size: 26px; margin-bottom: 14px; }
  .buy-reason-card h3 {
  font-family: 'Cormorant Garamond', serif;
  font-size: 20px; font-weight: 400; color: var(--ink); margin-bottom: 8px;
  }
  .buy-reason-card p { font-size: 13px; color: var(--mid); line-height: 1.75; }

  /* ── FAQ ── */
  .faq-section { padding: 80px 32px; background: var(--bg); }
  .faq-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  margin-top: 48px;
  }
  .faq-item {
  padding: 28px 48px 28px 0;
  border-bottom: 1px solid var(--border);
  }
  .faq-item--right {
  padding: 28px 0 28px 48px;
  border-left: 1px solid var(--border);
  }
  .faq-q { font-size: 15px; font-weight: 500; color: var(--ink); margin-bottom: 10px; }
  .faq-a { font-size: 13px; color: var(--mid); line-height: 1.75; }

  /* ── INTERNAL LINKS BAR ── */
  .links-bar { padding: 40px 32px; background: var(--warm); border-top: 1px solid var(--border); }
  .links-bar-inner {
  max-width: var(--w); margin: 0 auto;
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
  }
  .links-bar-label {
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--light); margin-right: 4px; flex-shrink: 0;
  }
  .links-bar-item {
  background: #fff; border: 1px solid var(--border);
  border-radius: var(--r); padding: 10px 18px;
  text-decoration: none; color: var(--ink);
  font-size: 13px; font-weight: 500; transition: all .2s;
  }
  .links-bar-item:hover { border-color: var(--gold); color: var(--gold); }

  /* ── CONTACT (dark) ── */
  .contact-section { padding: 80px 32px; background: var(--ink); }
  .contact-inner {
  max-width: var(--w); margin: 0 auto;
  display: grid; grid-template-columns: 1fr 440px; gap: 80px;
  align-items: start;
  }
  .contact-copy h2 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(34px, 4vw, 52px); font-weight: 400;
  color: #fff; line-height: 1.15; margin-bottom: 18px;
  }
  .contact-copy h2 em { font-style: italic; color: var(--gold-lt); }
  .contact-copy p { font-size: 14px; color: rgba(255,255,255,.6); line-height: 1.8; margin-bottom: 14px; }
  .contact-badges { display: flex; gap: 10px; flex-wrap: wrap; margin: 28px 0 20px; }
  .contact-badge {
  font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  padding: 6px 14px; border-radius: 24px;
  border: 1px solid rgba(184,147,90,.35); color: var(--gold);
  }
  .contact-reviews-link {
  font-size: 12px; color: rgba(255,255,255,.4);
  text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.15);
  transition: color .2s;
  }
  .contact-reviews-link:hover { color: var(--gold); }

  .contact-form-card {
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px; padding: 36px;
  }
  .contact-form-card h3 {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26px; color: #fff; margin-bottom: 6px;
  }
  .contact-form-card > p {
  font-size: 13px; color: rgba(255,255,255,.4); margin-bottom: 24px;
  }
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
  .form-group select option { background: #1a1918; }
  .form-submit {
  width: 100%; background: var(--gold); color: #fff; border: none;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: 11px;
  letter-spacing: .1em; text-transform: uppercase;
  padding: 14px; border-radius: var(--r); transition: background .2s; margin-top: 6px;
  }
  .form-submit:hover { background: var(--gold-lt); }

  /* ── RESPONSIVE ── */
  @media (max-width: 900px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .services-grid { grid-template-columns: 1fr 1fr; }
  .buy-reasons-grid { grid-template-columns: 1fr 1fr; }
  .faq-grid { grid-template-columns: 1fr; }
  .faq-item { padding: 24px 0; }
  .faq-item--right { padding: 24px 0; border-left: none; }
  .contact-inner { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
  .stats-grid { grid-template-columns: 1fr; }
  .services-grid { grid-template-columns: 1fr; }
  .buy-reasons-grid { grid-template-columns: 1fr; }
  .hero { padding: 130px 20px 64px; }
  .why-section, .stats-section, .services-section,
  .buy-reasons-section, .faq-section, .contact-section { padding: 56px 20px; }
  .links-bar { padding: 28px 20px; }
  }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

  <!-- ── HERO ── -->
  <section class="hero">
  <video class="bg-video" autoplay muted loop playsinline preload="none" data-src="/videos/hero-video.mp4"></video>
  <div class="hero-inner">
  <div class="hero-copy">
  <p class="hero-eyebrow">${n.city && n.city === n.name ? `${n.area || 'Texas Hill Country'} &middot; ${n.name} TX` : `${n.city ? `${n.city} TX` : 'Austin TX'} &middot; ${n.name}`} &middot; Realtor</p>
  <h1>Best Realtor in<br><em>${n.name}${n.city && n.city === n.name ? ' TX' : ' Austin'}</em></h1>
  <p class="hero-sub">Luke Allen is the go-to realtor in ${n.name}${n.city && n.city === n.name ? ', TX' : ', Austin TX'} - 5.0 ★ on Google, TREC licensed #788149, with deep knowledge of every street and price point in ${n.name}.</p>
  <div class="hero-pills">
  <span class="pill pill--gold">5.0 ★ Google Reviews</span>
  <span class="pill">TREC Licensed #788149</span>
  <span class="pill">${n.name} Specialist</span>
  <span class="pill">15 Five-Star Reviews</span>
  </div>
  <div class="hero-actions">
  <a href="#contact" class="btn-gold">Talk to Luke Allen &rarr;</a>
  <a href="/neighborhoods/${n.slug}/homes-for-sale" class="btn-outline-hero">View ${n.name} Listings</a>
  </div>
  </div>
  <div class="hero-photo">
  <img src="/images/luke-allen.jpg" alt="Luke Allen, ${n.name}${n.city && n.city === n.name ? ' TX' : ' Austin TX'} Realtor - TREC #788149" loading="eager" />
  <p class="hero-photo-caption">Luke Allen &middot; TREC #788149</p>
  </div>
  </div>
  </section>

  <!-- ── CREDENTIAL BAR ── -->
  <div class="cred-bar">
  <div class="cred-bar-inner">
  Luke Allen · ${n.name} Realtor
  <span>|</span> TREC #788149 · Austin Marketing + Development Group
  <span>|</span> ${schoolsShort}
  <span>|</span> 5.0 ★ · 15 Five-Star Reviews
  </div>
  </div>

  <!-- ── WHY LUKE ALLEN ── -->
  <section class="why-section">
  <div class="section-inner">
  <p class="section-eyebrow">Your ${n.name} Expert</p>
  <h2 class="section-title">Why Luke Allen for <em>${n.name}</em>?</h2>
  <div class="why-copy">
  <p>
  ${n.name} is one of Austin's most distinctive neighborhoods - ${n.vibe} - and that character matters enormously when you're buying or selling here. A generalist Austin agent might know ${n.name} exists, but Luke Allen knows it the way only a specialist does: which streets sit in the flood plain, which blocks command a premium because of the tree canopy or walkability, and where the ${n.area} market is heading. Luke Allen has studied <a href="/neighborhoods/${n.slug}">${n.name}'s neighborhood dynamics</a> at a granular level that most agents simply don't invest the time to develop. When you're moving at Austin's pace - where the best homes go under contract in days - that specificity is the difference between winning and losing.
  </p>
  <p>
  Pricing in ${n.name} is not one-size-fits-all. The market runs from ${n.priceRange}, and what separates a well-priced home from an overpriced one often comes down to a handful of factors: proximity to ${n.schools}, the ${n.homeTypes} mix on a given block, the commute reality of ${n.commute}, and condition relative to comparable sales. Luke Allen builds pricing analyses from actual ${n.name} comps - not automated estimates that don't account for the nuances of individual streets. For buyers, that means you'll never overpay. For sellers, it means your home is priced to sell quickly and for the most the market will bear. Luke Allen does not use inflated list price estimates to win a listing.
  </p>
  <p>
  For buyers in ${n.name}, Luke Allen's representation costs you nothing. Under Texas real estate commission structure, buyer agent compensation comes from the seller's side - so you get Luke Allen's full expertise on your behalf at no out-of-pocket expense. That includes identifying the right <a href="/neighborhoods/${n.slug}/homes-for-sale">${n.name} listings</a> before they're picked over, structuring competitive offers in a market where multiple-offer situations are common, negotiating inspection items, and guiding you from contract to close. If you're relocating to ${n.name} or moving within Austin, <a href="/buy">working with Luke Allen as your buyer's agent</a> is one of the smartest moves you can make.
  </p>
  <p>
  Sellers in ${n.name} face a market that rewards precision. Luke Allen approaches <a href="/sell">seller representation</a> with honest pricing, targeted marketing to the buyer pool most likely to pay full value, and professional presentation. Luke Allen has earned a <a href="https://share.google/hETte82InqUPvWeNC" target="_blank" rel="noopener">5.0-star Google rating across 15 reviews</a> - not by telling sellers what they want to hear, but by delivering results. If you're considering selling your ${n.name} home, the conversation with Luke Allen starts with an honest assessment of what your home is worth in today's market and a clear plan to maximize it.
  </p>
  </div>
  </div>
  </section>

  <!-- ── AREA STATS ── -->
  <section class="stats-section">
  <div class="section-inner">
  <p class="section-eyebrow">${n.name} Market Data</p>
  <h2 class="section-title">${n.name} <em>at a Glance</em></h2>
  <div class="stats-grid">
  <div class="stat-card">
  <div class="stat-card-label">Median Price</div>
  <div class="stat-card-value stat-card-value--gold">${n.medianPrice}</div>
  <div class="stat-card-sub">Approximate current median for ${n.name}</div>
  </div>
  <div class="stat-card">
  <div class="stat-card-label">Price Range</div>
  <div class="stat-card-value">${n.priceRange}</div>
  <div class="stat-card-sub">Active market range in ${n.name}</div>
  </div>
  <div class="stat-card">
  <div class="stat-card-label">Area</div>
  <div class="stat-card-value">${n.area}</div>
  <div class="stat-card-sub">Austin geographic area</div>
  </div>
  <div class="stat-card">
  <div class="stat-card-label">Schools</div>
  <div class="stat-card-value" style="font-size:18px">${n.schools.length > 60 ? n.schools.substring(0, 57) + '…' : n.schools}</div>
  <div class="stat-card-sub">Luke Allen verifies every assignment</div>
  </div>
  <div class="stat-card">
  <div class="stat-card-label">Commute</div>
  <div class="stat-card-value" style="font-size:18px">${n.commute}</div>
  <div class="stat-card-sub">To downtown Austin</div>
  </div>
  <div class="stat-card">
  <div class="stat-card-label">Vibe</div>
  <div class="stat-card-value" style="font-size:18px">&ldquo;${n.vibe}&rdquo;</div>
  <div class="stat-card-sub">${n.name} neighborhood character</div>
  </div>
  </div>
  </div>
  </section>

  <!-- ── WHAT YOU GET (dark) ── -->
  <section class="services-section">
  <div class="section-inner">
  <p class="section-eyebrow" style="color:var(--gold)">What Luke Allen Brings</p>
  <h2 class="section-title section-title--light">What You Get With <em>Luke Allen</em></h2>
  <p class="section-sub section-sub--light">Luke Allen provides hands-on, personal service in ${n.name} - not a team handoff, not an assistant. Here's exactly what that looks like.</p>
  <div class="services-grid">
  <div class="service-card">
  <div class="service-card-icon">🗺️</div>
  <h3>${n.name} Street Knowledge</h3>
  <p>Luke Allen knows which streets and blocks command premiums in ${n.name} and why. That knowledge is built block by block - not from Zillow estimates or aggregate data.</p>
  </div>
  <div class="service-card">
  <div class="service-card-icon">📞</div>
  <h3>Direct Access</h3>
  <p>You work directly with Luke Allen, not a team member or assistant. Luke Allen answers his phone, responds to texts, and is the person at the table when it matters.</p>
  </div>
  <div class="service-card">
  <div class="service-card-icon">💰</div>
  <h3>Accurate Pricing</h3>
  <p>Luke Allen builds pricing from real ${n.name} comps - not inflated estimates designed to win a listing. Honest pricing gets homes sold faster and for more money.</p>
  </div>
  <div class="service-card">
  <div class="service-card-icon">⭐</div>
  <h3>5.0 Google Rating</h3>
  <p>Luke Allen has earned 15 five-star Google reviews from Austin buyers and sellers. Every review is from a real client who worked directly with Luke Allen.</p>
  </div>
  <div class="service-card">
  <div class="service-card-icon">🏫</div>
  <h3>School Expertise</h3>
  <p>Luke Allen verifies school assignments for every ${n.name} property before an offer is made. School boundaries in ${n.name} can shift by street - this matters for both families and resale value.</p>
  </div>
  <div class="service-card">
  <div class="service-card-icon">🏠</div>
  <h3>Full Service</h3>
  <p>Luke Allen handles buyer representation, seller representation, and investment analysis for ${n.name}. One agent, one point of contact, full coverage of the transaction from search to close.</p>
  </div>
  </div>
  </div>
  </section>

  ${buyReasonsHtml}

  <!-- ── FAQ ── -->
  <section class="faq-section">
  <div class="section-inner">
  <p class="section-eyebrow">${n.name} Real Estate</p>
  <h2 class="section-title">Common <em>Questions</em></h2>
  <div class="faq-grid">${faqHtml}
  </div>
  </div>
  </section>

  <!-- ── INTERNAL LINKS BAR ── -->
  <div class="links-bar">
  <div class="links-bar-inner">
  <span class="links-bar-label">Explore</span>
  <a class="links-bar-item" href="/neighborhoods/${n.slug}">← ${n.name} Neighborhood Overview</a>
  <a class="links-bar-item" href="/neighborhoods/${n.slug}/homes-for-sale">🏠 Homes for Sale in ${n.name}</a>
  ${nearbyLinkItems}
  </div>
  </div>

  <!-- ── CONTACT FORM (dark) ── -->
  <section class="contact-section" id="contact">
  <div class="contact-inner">
  <div class="contact-copy">
  <h2>Work With Luke Allen<br><em>in ${n.name}</em></h2>
  <p>Luke Allen is ready to help you buy or sell in ${n.name}. Whether you're six months out or ready to make an offer this week, a 15-minute call with Luke Allen can save you time, money, and frustration.</p>
  <p>Luke Allen knows ${n.name} - the pricing, the streets, the school boundaries, and the off-market landscape. That knowledge works directly for you from day one.</p>
  <div class="contact-badges">
  <span class="contact-badge">5.0 ★ Google</span>
  <span class="contact-badge">TREC #788149</span>
  <span class="contact-badge">${n.name} Specialist</span>
  </div>
  <a href="https://share.google/hETte82InqUPvWeNC" target="_blank" rel="noopener" class="contact-reviews-link">Read Luke Allen's 15 five-star Google reviews →</a>
  </div>
  <div class="contact-form-card">
  <h3>Connect With Luke Allen</h3>
  <p>Tell Luke Allen a little about what you're looking for in ${n.name}.</p>
  <form id="realtor-lead-form">
  <input type="hidden" name="neighborhood" value="${n.name}" />
  <input type="hidden" name="source" value="${n.slug}-best-realtor" />
  <div class="form-group"><input type="text" name="name" placeholder="Your name" required /></div>
  <div class="form-group"><input type="text" name="contact" placeholder="Phone or email" required /></div>
  <div class="form-group">
  <select name="intent">
  <option value="">I'm looking to…</option>
  <option value="buy">Buy in ${n.name}</option>
  <option value="sell">Sell in ${n.name}</option>
  <option value="both">Both buy and sell</option>
  <option value="investment">Investment property</option>
  <option value="explore">Just exploring</option>
  </select>
  </div>
  <div class="form-group">
  <select name="budget">
  <option value="">Budget range</option>
  <option value="under-500k">Under $500K</option>
  <option value="500-750k">$500K – $750K</option>
  <option value="750k-1m">$750K – $1M</option>
  <option value="1m-1.5m">$1M – $1.5M</option>
  <option value="1.5m-2m">$1.5M – $2M</option>
  <option value="2m-plus">$2M+</option>
  </select>
  </div>
  <div class="form-group">
  <textarea name="notes" placeholder="Anything else Luke Allen should know? (optional)" rows="3"></textarea>
  </div>
  <button type="submit" class="form-submit">Connect With Luke Allen →</button>
  </form>
  </div>
  </div>
  </section>

<script src="/js/footer.js"></script>

  <script>
  document.getElementById('realtor-lead-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  try {
  const res = await fetch('/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
  });
  if (res.ok) {
  this.innerHTML = '<p style="text-align:center;padding:40px 0;color:var(--gold-lt);font-family:Cormorant Garamond,serif;font-size:22px;line-height:1.5">Got it - Luke Allen will be in touch within 24 hours.</p>';
  } else {
  alert('Something went wrong. Please call or email Luke Allen directly.');
  }
  } catch {
  alert('Something went wrong. Please call (254) 718-2567 or email Luke@austinmdg.com.');
  }
  });
  </script>
</body>
</html>`;
};
