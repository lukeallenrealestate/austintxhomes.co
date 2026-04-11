// Server-side renderers for the Round Rock topical web at /round-rock/*
// Exports 4 functions — each returns a full HTML string for one page type.

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Shared CSS — used by all 4 page types
const SHARED_STYLES = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--gold:#b8935a;--gold-lt:#cda96f;--gold-pale:#f5ede0;--ink:#0f0f0e;--text:#1a1918;--mid:#5c5b57;--light:#999690;--bg:#fff;--warm:#faf8f4;--cream:#f1ece3;--border:#e5dfd4;--r:4px;--w:1180px}
  html{scroll-behavior:smooth}
  body{font-family:'Inter',sans-serif;color:var(--text);background:var(--bg);line-height:1.6}
  a{color:inherit}

  /* HERO */
  .hero{background:var(--ink);padding:100px 32px 80px;position:relative;overflow:hidden}
  .hero video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.4s ease}
  .hero video.ready{opacity:1}
  .hero::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,15,14,.84) 0%,rgba(26,20,16,.76) 50%,rgba(15,15,14,.84) 100%);z-index:1}
  .hero-inner{max-width:var(--w);margin:0 auto;position:relative;z-index:2;display:grid;grid-template-columns:1fr 380px;gap:48px;align-items:start}
  .hero-left{text-align:left}
  .hero-eye{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:16px}
  .hero-breadcrumb{font-size:11px;color:rgba(255,255,255,.4);margin-bottom:16px;letter-spacing:.08em}
  .hero-breadcrumb a{color:var(--gold);text-decoration:none}
  .hero-breadcrumb a:hover{color:var(--gold-lt)}
  .hero h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5vw,58px);font-weight:400;color:#fff;line-height:1.1;margin-bottom:16px}
  .hero h1 em{font-style:italic;color:var(--gold)}
  .hero p.lead{font-size:15px;color:rgba(255,255,255,.6);max-width:560px;margin-bottom:24px;line-height:1.75}
  .hero-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
  .hero-pill{font-size:11px;letter-spacing:.06em;color:var(--gold);background:rgba(184,147,90,.1);border:1px solid rgba(184,147,90,.25);padding:5px 12px;border-radius:20px}
  .hero-form{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:28px}
  .hero-form h3{font-family:'Cormorant Garamond',serif;font-size:22px;color:#fff;margin-bottom:4px;font-weight:400}
  .hero-form p{font-size:12px;color:rgba(255,255,255,.45);margin-bottom:20px}
  .hero-form input,.hero-form select,.hero-form textarea{width:100%;padding:10px 14px;margin-bottom:10px;border:1px solid rgba(255,255,255,.15);border-radius:var(--r);background:rgba(255,255,255,.08);color:#fff;font-family:'Inter',sans-serif;font-size:13px;outline:none;resize:none}
  .hero-form input::placeholder,.hero-form textarea::placeholder{color:rgba(255,255,255,.3)}
  .hero-form input:focus,.hero-form select:focus,.hero-form textarea:focus{border-color:var(--gold)}
  .hero-form select option{background:#1a1918;color:#fff}
  .hero-form .btn-submit{width:100%;background:var(--gold);color:#fff;border:none;padding:12px;border-radius:var(--r);font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:'Inter',sans-serif;transition:background .2s;margin-top:4px}
  .hero-form .btn-submit:hover{background:var(--gold-lt)}
  .hero-form-success{text-align:center;padding:24px 0;color:var(--gold-lt);font-family:'Cormorant Garamond',serif;font-size:20px;display:none}

  /* STATS BAR */
  .stats-bar{background:var(--warm);border-bottom:1px solid var(--border);padding:24px 32px}
  .stats-inner{max-width:var(--w);margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
  .stat{text-align:center}
  .stat-num{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:400;color:var(--ink);line-height:1}
  .stat-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--light);margin-top:6px}

  /* SECTIONS */
  section{padding:72px 32px}
  .section-inner{max-width:var(--w);margin:0 auto}
  .section-eye{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
  .section-title{font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:400;color:var(--ink);margin-bottom:12px;line-height:1.15}
  .section-title em{font-style:italic}
  .section-desc{font-size:14px;color:var(--mid);max-width:620px;margin-bottom:36px;line-height:1.8}

  /* CONTENT 2-col */
  .content-grid{display:grid;grid-template-columns:2fr 1fr;gap:48px;align-items:start}
  .content-body p{font-size:15px;color:var(--text);line-height:1.85;margin-bottom:16px}
  .highlights-card{background:var(--warm);border:1px solid var(--border);border-radius:8px;padding:28px}
  .highlights-card h3{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:var(--ink);margin-bottom:20px}
  .highlight{display:flex;gap:14px;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}
  .highlight:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
  .highlight-icon{font-size:22px;line-height:1;flex-shrink:0}
  .highlight-body strong{display:block;font-size:13px;color:var(--ink);margin-bottom:4px;font-weight:600}
  .highlight-body span{font-size:12px;color:var(--mid);line-height:1.6}

  /* LISTINGS GRID */
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
  .card{background:#fff;border:1px solid var(--border);border-radius:6px;overflow:hidden;transition:box-shadow .25s,transform .25s;text-decoration:none;display:flex;flex-direction:column;cursor:pointer}
  .card:hover{box-shadow:0 8px 28px rgba(0,0,0,.08);transform:translateY(-2px)}
  .card-img{position:relative;height:190px;background:var(--cream);overflow:hidden}
  .card-img img{width:100%;height:100%;object-fit:cover;display:block}
  .card-body{padding:16px;flex:1;display:flex;flex-direction:column}
  .card-price{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--ink);margin-bottom:4px}
  .card-addr{font-size:13px;color:var(--mid);margin-bottom:10px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-stats{display:flex;gap:14px;font-size:12px;color:var(--mid);margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}
  .card-stats strong{color:var(--ink);font-weight:600}
  .card-badge{position:absolute;top:10px;left:10px;background:var(--gold);color:#fff;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border-radius:3px}
  .pg-btn{min-width:36px;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r);background:#fff;font-size:13px;font-weight:500;color:var(--ink);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center}
  .pg-btn:hover{border-color:var(--gold);color:var(--gold)}
  .pg-btn.active{background:var(--ink);color:#fff;border-color:var(--ink)}
  .pg-btn:disabled{opacity:.35;pointer-events:none}
  .grid .loading{grid-column:1/-1;text-align:center;padding:48px;color:var(--mid);font-size:14px}

  /* WHY BUY */
  .buy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .buy-card{background:var(--warm);border:1px solid var(--border);border-radius:8px;padding:32px}
  .buy-card .icon{font-size:36px;margin-bottom:16px;display:block}
  .buy-card h3{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:var(--ink);margin-bottom:10px}
  .buy-card p{font-size:13px;color:var(--mid);line-height:1.7}

  /* REALTOR PAGE */
  .credential-bar{background:var(--warm);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:24px 32px}
  .credential-inner{max-width:var(--w);margin:0 auto;display:flex;justify-content:center;gap:40px;flex-wrap:wrap;font-size:12px;color:var(--mid)}
  .credential-inner strong{color:var(--ink);font-weight:600}
  .credential-item{display:flex;align-items:center;gap:10px}

  .agent-card{background:var(--warm);border-radius:8px;padding:32px;display:flex;gap:24px;align-items:center}
  .agent-photo{width:120px;height:120px;border-radius:50%;object-fit:cover;flex-shrink:0;border:3px solid var(--gold)}
  .agent-info h3{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;color:var(--ink);margin-bottom:4px}
  .agent-info p{font-size:13px;color:var(--mid);margin-bottom:12px}
  .agent-info .btn{display:inline-block;background:var(--gold);color:#fff;padding:10px 22px;border-radius:var(--r);font-size:12px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;margin-right:8px;transition:background .2s}
  .agent-info .btn:hover{background:var(--gold-lt)}
  .agent-info .btn-outline{background:transparent;color:var(--ink);border:1px solid var(--border)}
  .agent-info .btn-outline:hover{border-color:var(--gold);color:var(--gold);background:transparent}

  .services-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .service-card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:28px}
  .service-card .icon{font-size:28px;margin-bottom:12px;display:block}
  .service-card h4{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:8px}
  .service-card p{font-size:13px;color:var(--mid);line-height:1.65}

  /* FAQ */
  .faq-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:32px}
  .faq-item{padding:24px 0;border-bottom:1px solid var(--border);padding-right:40px}
  .faq-item:nth-child(even){padding-right:0;padding-left:40px;border-left:1px solid var(--border)}
  .faq-q{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:8px}
  .faq-a{font-size:13px;color:var(--mid);line-height:1.75}

  /* NEARBY */
  .nearby-wrap{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
  .nearby-card{display:block;padding:14px 22px;background:#fff;border:1px solid var(--border);border-radius:4px;text-decoration:none;color:var(--ink);font-size:13px;font-weight:500;transition:all .2s}
  .nearby-card:hover{border-color:var(--gold);color:var(--gold);transform:translateY(-1px)}

  /* RELATED LINKS */
  .related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
  .related-card{background:var(--warm);border:1px solid var(--border);border-radius:6px;padding:24px;text-decoration:none;transition:all .2s}
  .related-card:hover{border-color:var(--gold);background:#fff;transform:translateY(-2px)}
  .related-card h4{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;color:var(--ink);margin-bottom:6px}
  .related-card p{font-size:12px;color:var(--mid)}
  .related-card .arrow{color:var(--gold);font-size:13px;margin-top:10px;display:block}

  /* CTA */
  .cta{background:var(--ink);padding:72px 32px;text-align:center}
  .cta h2{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:400;color:#fff;margin-bottom:12px}
  .cta h2 em{font-style:italic;color:var(--gold)}
  .cta p{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:28px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.7}
  .cta .btn-gold{display:inline-block;background:var(--gold);color:#fff;border:none;padding:14px 32px;border-radius:var(--r);font-size:12px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;font-family:'Inter',sans-serif;transition:background .2s}
  .cta .btn-gold:hover{background:var(--gold-lt)}

  @media(max-width:960px){.stats-inner{grid-template-columns:repeat(2,1fr)}.hero-inner{grid-template-columns:1fr}.hero-form{max-width:420px}.content-grid{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}.buy-grid,.services-grid{grid-template-columns:1fr 1fr}.faq-grid{grid-template-columns:1fr}.faq-item:nth-child(even){padding-left:0;border-left:none}.agent-card{flex-direction:column;text-align:center}.related-grid{grid-template-columns:1fr}}
  @media(max-width:600px){.grid{grid-template-columns:1fr}.buy-grid,.services-grid{grid-template-columns:1fr}.hero{padding:80px 20px 60px}section{padding:56px 20px}.stats-bar{padding:20px 20px}}
`;

// Shared head section — includes meta tags, schema, and font loading
function renderHead({ title, description, canonical, schemaBlocks }) {
  const schemaJson = schemaBlocks.map(b => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n  ');
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/favicon-96.png" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="Round Rock, Texas" />
  ${schemaJson}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>${SHARED_STYLES}</style>
</head>`;
}

function realEstateAgentSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: 'Luke Allen – Austin TX Homes',
    url: 'https://austintxhomes.co',
    telephone: '+12547182567',
    email: 'Luke@austinmdg.com',
    image: 'https://austintxhomes.co/images/luke-allen.jpg',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '15', bestRating: '5', worstRating: '1' },
    areaServed: { '@type': 'City', name: 'Round Rock', addressRegion: 'TX' },
    hasCredential: { '@type': 'EducationalOccupationalCredential', name: 'Texas Real Estate License', identifier: '788149' },
    sameAs: ['https://share.google/hETte82InqUPvWeNC', 'https://www.linkedin.com/in/lukeallentx/', 'https://www.instagram.com/lukeallenrealty/']
  };
}

function breadcrumbSchema(n, pageType) {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://austintxhomes.co/' },
    { '@type': 'ListItem', position: 2, name: 'Round Rock', item: 'https://austintxhomes.co/round-rock' },
    { '@type': 'ListItem', position: 3, name: n.name, item: `https://austintxhomes.co/round-rock/${n.slug}` }
  ];
  if (pageType && pageType !== 'hub') {
    const path = pageType === 'sale' ? 'homes-for-sale' : (pageType === 'rent' ? 'homes-for-rent' : 'best-realtor');
    const label = pageType === 'sale' ? 'Homes for Sale' : (pageType === 'rent' ? 'Homes for Rent' : 'Best Realtor');
    items.push({ '@type': 'ListItem', position: 4, name: label, item: `https://austintxhomes.co/round-rock/${n.slug}/${path}` });
  }
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

function faqPageSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (faqs || []).map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
}

// Shared contact form modal HTML — used on all 4 page types
function contactModalHtml() {
  return `
<div id="contact-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center;padding:20px">
  <div style="background:#fff;max-width:480px;width:100%;border-radius:8px;padding:36px;position:relative">
    <button onclick="closeContactModal()" style="position:absolute;top:14px;right:18px;background:none;border:none;font-size:28px;color:#999;cursor:pointer;line-height:1">×</button>
    <h3 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;margin-bottom:8px">Contact Luke</h3>
    <p style="font-size:13px;color:#5c5b57;margin-bottom:20px">Send me a message — I respond within a few hours.</p>
    <form id="modal-form">
      <input type="hidden" name="source" value="round-rock-modal" />
      <input type="text" name="name" placeholder="Your name" required style="width:100%;padding:10px 14px;margin-bottom:10px;border:1px solid #e5dfd4;border-radius:4px;font-size:14px" />
      <input type="text" name="contact" placeholder="Email or phone" required style="width:100%;padding:10px 14px;margin-bottom:10px;border:1px solid #e5dfd4;border-radius:4px;font-size:14px" />
      <textarea name="message" rows="4" placeholder="What can I help with?" style="width:100%;padding:10px 14px;margin-bottom:10px;border:1px solid #e5dfd4;border-radius:4px;font-size:14px;font-family:inherit;resize:vertical"></textarea>
      <button type="submit" style="width:100%;background:#b8935a;color:#fff;border:none;padding:14px;border-radius:4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">Send Message</button>
    </form>
    <div id="modal-success" style="display:none;text-align:center;padding:40px 0;color:#cda96f;font-family:'Cormorant Garamond',serif;font-size:20px">Got it — I'll reach out within a few hours.</div>
  </div>
</div>`;
}

// Shared JS — hero video + hero form + contact modal
function sharedScripts() {
  return `
<script>
(function(){
  const v = document.querySelector('.hero video');
  if (!v) return;
  if (v.readyState >= 3) v.classList.add('ready');
  else v.addEventListener('canplay', () => v.classList.add('ready'), { once: true });
})();
const heroForm = document.getElementById('hero-contact-form');
if (heroForm) heroForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  try { await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch {}
  this.style.display = 'none';
  document.getElementById('hero-form-success').style.display = 'block';
});
function openContactModal() { document.getElementById('contact-modal').style.display = 'flex'; }
function closeContactModal() { document.getElementById('contact-modal').style.display = 'none'; }
document.getElementById('contact-modal')?.addEventListener('click', e => { if (e.target.id === 'contact-modal') closeContactModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContactModal(); });
const modalForm = document.getElementById('modal-form');
if (modalForm) modalForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  try { await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch {}
  this.style.display = 'none';
  document.getElementById('modal-success').style.display = 'block';
});
</script>`;
}

// Generates the listings grid with pagination + API fetch code
// Used by homes-for-sale and homes-for-rent templates
function listingsGridScript({ forRent, citySlug, subdivisionName, zips, minPrice }) {
  const rentFlag = forRent ? 'true' : 'false';
  const moSuffix = forRent ? '<span style="font-size:14px;font-weight:400;color:var(--mid)">/mo</span>' : '';
  return `
<script>
const RR_PER_PAGE = 12;
let rrPage = 1;

function makePropertyUrl(l) {
  const key = l.listing_key || '';
  if (!key) return '#';
  const addr = (l.unparsed_address || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\\s+/g, '-');
  const city = (l.city || 'round-rock').toLowerCase().replace(/[^a-z]/g, '-');
  const zip = (l.postal_code || '').replace(/[^0-9]/g, '');
  return addr ? '/property/' + addr + '-' + city + '-tx' + (zip ? '-' + zip : '') + '-' + key : '/property/' + key;
}

async function loadListings(page) {
  rrPage = page;
  const grid = document.getElementById('rr-listings-grid');
  grid.innerHTML = '<div class="loading">Loading ${forRent ? 'rentals' : 'homes'}…</div>';
  const params = new URLSearchParams({
    forRent: '${rentFlag}',
    city: 'Round Rock',
    ${zips && zips.length ? `zip: ${JSON.stringify(zips.join(','))},` : ''}
    ${subdivisionName ? `neighborhood: ${JSON.stringify(subdivisionName)},` : ''}
    minPrice: ${minPrice || (forRent ? 500 : 75000)},
    sortBy: 'newest',
    page: page,
    limit: RR_PER_PAGE
  });
  try {
    const res = await fetch('/api/properties/search?' + params);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const listings = data.listings || [];
    const totalPages = data.pages || 1;
    grid.innerHTML = '';
    if (!listings.length) {
      grid.innerHTML = '<div class="loading">No ${forRent ? 'rentals' : 'homes'} currently available. Check back soon or contact Luke for off-market options.</div>';
      document.getElementById('rr-pagination').innerHTML = '';
      return;
    }
    listings.forEach(l => {
      const price = l.list_price ? '$' + Number(l.list_price).toLocaleString() : 'Price N/A';
      const addr = l.unparsed_address || '';
      const cityZip = [l.city, l.postal_code].filter(Boolean).join(', ');
      const beds = l.bedrooms_total || '—';
      const baths = l.bathrooms_total || '—';
      const sqft = l.living_area ? Number(l.living_area).toLocaleString() : '—';
      const photo = (l.photos && l.photos[0]) || '';
      const isNew = l.days_on_market != null && l.days_on_market <= 3;
      const card = document.createElement('a');
      card.className = 'card';
      card.href = makePropertyUrl(l);
      card.innerHTML = '<div class="card-img">' +
        (photo
          ? '<img src="' + photo + '" alt="' + addr.replace(/"/g, '&quot;') + '" loading="lazy" onerror="this.parentElement.innerHTML=\\'<div style=\\\\\\'display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:12px\\\\\\'>No Photo</div>\\'" />'
          : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:12px">No Photo</div>') +
        (isNew ? '<span class="card-badge" style="background:#0f0f0e">New</span>' : '<span class="card-badge">${forRent ? 'For Rent' : 'For Sale'}</span>') +
        '</div><div class="card-body"><div class="card-price">' + price + '${moSuffix}' + '</div><div class="card-addr">' + addr + '<br><span style="font-size:12px;color:#999">' + cityZip + '</span></div><div class="card-stats"><span><strong>' + beds + '</strong> bd</span><span><strong>' + baths + '</strong> ba</span><span><strong>' + sqft + '</strong> sqft</span></div></div>';
      grid.appendChild(card);
    });
    const pag = document.getElementById('rr-pagination');
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = '<button class="pg-btn" onclick="loadListings(' + (page-1) + ')" ' + (page<=1?'disabled':'') + '>&lsaquo; Prev</button>';
    for (let i = 1; i <= Math.min(totalPages, 7); i++) {
      html += '<button class="pg-btn' + (i===page?' active':'') + '" onclick="loadListings(' + i + ')">' + i + '</button>';
    }
    if (totalPages > 7) html += '<span style="color:#999;padding:0 4px">…</span><button class="pg-btn" onclick="loadListings(' + totalPages + ')">' + totalPages + '</button>';
    html += '<button class="pg-btn" onclick="loadListings(' + (page+1) + ')" ' + (page>=totalPages?'disabled':'') + '>Next &rsaquo;</button>';
    pag.innerHTML = html;
    if (page > 1) document.getElementById('listings-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    grid.innerHTML = '<div class="loading">Unable to load listings. Please try again.</div>';
  }
}
loadListings(1);
</script>`;
}

// ============================================================
// PAGE 1: Neighborhood HUB — /round-rock/:slug
// ============================================================
function renderHub(n) {
  const title = `${n.name} Round Rock, TX — Homes, Schools, Commute | Luke Allen`;
  const description = `${n.name} in Round Rock, TX — median ${n.medianPrice}, ${n.schools.split(' — ')[0]}, ${n.commute.split(',')[0]}. Complete neighborhood guide from local realtor Luke Allen.`;
  const canonical = `https://austintxhomes.co/round-rock/${n.slug}`;

  const schemaBlocks = [
    realEstateAgentSchema(),
    breadcrumbSchema(n, 'hub'),
    faqPageSchema(n.faqs),
    {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: `${n.name}, Round Rock, TX`,
      containedInPlace: { '@type': 'City', name: 'Round Rock', addressRegion: 'TX', addressCountry: 'US' }
    }
  ];

  const highlights = (n.highlights || []).map(h =>
    `<div class="highlight"><div class="highlight-icon">${escHtml(h.icon)}</div><div class="highlight-body"><strong>${escHtml(h.label)}</strong><span>${escHtml(h.text)}</span></div></div>`
  ).join('');

  const intro = (n.intro || []).map(p => `<p>${escHtml(p)}</p>`).join('');

  const buyReasons = (n.buyReasons || []).map(b =>
    `<div class="buy-card"><span class="icon">${escHtml(b.icon)}</span><h3>${escHtml(b.heading)}</h3><p>${escHtml(b.body)}</p></div>`
  ).join('');

  const faqs = (n.faqs || []).map(f =>
    `<div class="faq-item"><div class="faq-q">${escHtml(f.q)}</div><div class="faq-a">${escHtml(f.a)}</div></div>`
  ).join('');

  const pills = (n.tags || []).map(t => `<span class="hero-pill">${escHtml(t)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title, description, canonical, schemaBlocks })}
<body>
<script src="/js/nav.js"></script>

<section class="hero">
  <video autoplay muted loop playsinline preload="auto" src="/videos/hero-video.mp4"></video>
  <div class="hero-inner">
    <div class="hero-left">
      <div class="hero-breadcrumb"><a href="/round-rock">Round Rock</a> &nbsp;›&nbsp; ${escHtml(n.name)}</div>
      <p class="hero-eye">${escHtml(n.name)} · Round Rock, TX</p>
      <h1>${escHtml(n.name)} <em>Round Rock</em></h1>
      <p class="lead">${escHtml(n.intro[0] || '')}</p>
      <div class="hero-pills">${pills}</div>
    </div>
    <div class="hero-form">
      <h3>Interested in ${escHtml(n.name)}?</h3>
      <p>I'll send curated ${escHtml(n.name)} listings matching what you're looking for.</p>
      <form id="hero-contact-form">
        <input type="hidden" name="source" value="round-rock-${escHtml(n.slug)}-hub" />
        <input type="text" name="name" placeholder="Your name" required />
        <input type="text" name="contact" placeholder="Email or phone" required />
        <select name="intent">
          <option value="">I'm interested in...</option>
          <option>Buying in ${escHtml(n.name)}</option>
          <option>Renting in ${escHtml(n.name)}</option>
          <option>Selling my ${escHtml(n.name)} home</option>
          <option>Just exploring</option>
        </select>
        <button type="submit" class="btn-submit">Get Started</button>
      </form>
      <div class="hero-form-success" id="hero-form-success">Got it — I'll reach out within a few hours.</div>
    </div>
  </div>
</section>

<div class="stats-bar">
  <div class="stats-inner">
    <div class="stat"><div class="stat-num">${escHtml(n.medianPrice)}</div><div class="stat-label">Median Price</div></div>
    <div class="stat"><div class="stat-num">${escHtml((n.priceRange || '').split(' – ')[0] || '—')}–${escHtml((n.priceRange || '').split(' – ')[1] || '—')}</div><div class="stat-label">Price Range</div></div>
    <div class="stat"><div class="stat-num">${escHtml(n.zips.join(', '))}</div><div class="stat-label">Zip Code${n.zips.length > 1 ? 's' : ''}</div></div>
    <div class="stat"><div class="stat-num">${escHtml(n.schools.split(' — ')[0])}</div><div class="stat-label">School District</div></div>
  </div>
</div>

<section style="background:var(--bg)">
  <div class="section-inner">
    <p class="section-eye">About ${escHtml(n.name)}</p>
    <h2 class="section-title">Living in <em>${escHtml(n.name)}</em></h2>
    <div class="content-grid">
      <div class="content-body">${intro}</div>
      <div class="highlights-card">
        <h3>${escHtml(n.name)} Highlights</h3>
        ${highlights}
      </div>
    </div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">Explore ${escHtml(n.name)}</p>
    <h2 class="section-title">Browse ${escHtml(n.name)} <em>Pages</em></h2>
    <div class="related-grid">
      <a class="related-card" href="/round-rock/${n.slug}/homes-for-sale">
        <h4>Homes for Sale</h4>
        <p>Active listings in ${escHtml(n.name)}, updated daily from MLS</p>
        <span class="arrow">View Listings →</span>
      </a>
      <a class="related-card" href="/round-rock/${n.slug}/homes-for-rent">
        <h4>Homes for Rent</h4>
        <p>Current rentals in ${escHtml(n.name)}, updated daily from MLS</p>
        <span class="arrow">View Rentals →</span>
      </a>
      <a class="related-card" href="/round-rock/${n.slug}/best-realtor">
        <h4>Best Realtor</h4>
        <p>Why work with Luke Allen in ${escHtml(n.name)}</p>
        <span class="arrow">Meet Luke →</span>
      </a>
    </div>
  </div>
</section>

<section style="background:var(--bg)">
  <div class="section-inner">
    <p class="section-eye">Why Buy in ${escHtml(n.name)}</p>
    <h2 class="section-title">Why People <em>Choose ${escHtml(n.name)}</em></h2>
    <div class="buy-grid">${buyReasons}</div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">Common Questions</p>
    <h2 class="section-title">${escHtml(n.name)} <em>FAQ</em></h2>
    <div class="faq-grid">${faqs}</div>
  </div>
</section>

<section style="background:var(--bg)">
  <div class="section-inner">
    <p class="section-eye">Nearby Neighborhoods</p>
    <h2 class="section-title">Other <em>Round Rock Areas</em></h2>
    <div class="nearby-wrap">
      ${(n.nearby || []).map(slug => `<a class="nearby-card" href="/round-rock/${slug}">${escHtml(slug.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))} →</a>`).join('')}
      <a class="nearby-card" href="/round-rock">← Back to Round Rock Hub</a>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Ready to Explore <em>${escHtml(n.name)}?</em></h2>
  <p>I'll set up a private showing, run a cap rate analysis, or give you honest off-market intel — free. No pressure.</p>
  <a href="tel:+12547182567" class="btn-gold">Call (254) 718-2567</a>
  <div style="margin-top:14px"><button onclick="openContactModal()" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:13px;text-decoration:underline;cursor:pointer;font-family:inherit">Or send a message</button></div>
</section>

${contactModalHtml()}
<script src="/js/footer.js"></script>
${sharedScripts()}
</body>
</html>`;
}

// ============================================================
// PAGE 2: Homes for Sale — /round-rock/:slug/homes-for-sale
// ============================================================
function renderHomesForSale(n) {
  const title = `Homes for Sale in ${n.name} Round Rock TX | ${n.medianPrice} Median | Luke Allen`;
  const description = `Browse homes for sale in ${n.name}, Round Rock TX. Median ${n.medianPrice}, ${n.schools.split(' — ')[0]}. Updated daily from MLS. Licensed Round Rock realtor.`;
  const canonical = `https://austintxhomes.co/round-rock/${n.slug}/homes-for-sale`;

  const schemaBlocks = [
    realEstateAgentSchema(),
    breadcrumbSchema(n, 'sale'),
    {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: `Homes for Sale in ${n.name}, Round Rock TX`,
      description,
      url: canonical,
      areaServed: { '@type': 'Neighborhood', name: n.name, containedInPlace: { '@type': 'City', name: 'Round Rock', addressRegion: 'TX' } }
    }
  ];

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title, description, canonical, schemaBlocks })}
<body>
<script src="/js/nav.js"></script>

<section class="hero">
  <video autoplay muted loop playsinline preload="auto" src="/videos/hero-video.mp4"></video>
  <div class="hero-inner">
    <div class="hero-left">
      <div class="hero-breadcrumb"><a href="/round-rock">Round Rock</a> &nbsp;›&nbsp; <a href="/round-rock/${n.slug}">${escHtml(n.name)}</a> &nbsp;›&nbsp; Homes for Sale</div>
      <p class="hero-eye">Homes for Sale</p>
      <h1>${escHtml(n.name)} Homes <em>For Sale</em></h1>
      <p class="lead">Active listings in ${escHtml(n.name)}, Round Rock — updated daily from Austin MLS. Median price ${escHtml(n.medianPrice)}, range ${escHtml(n.priceRange)}.</p>
    </div>
    <div class="hero-form">
      <h3>${escHtml(n.name)} Buyer Help</h3>
      <p>Tell me what you're looking for and I'll send curated ${escHtml(n.name)} listings.</p>
      <form id="hero-contact-form">
        <input type="hidden" name="source" value="round-rock-${escHtml(n.slug)}-sale" />
        <input type="text" name="name" placeholder="Your name" required />
        <input type="text" name="contact" placeholder="Email or phone" required />
        <select name="budget">
          <option value="">Budget range</option>
          <option>Under $400K</option>
          <option>$400K–$550K</option>
          <option>$550K–$700K</option>
          <option>$700K+</option>
        </select>
        <button type="submit" class="btn-submit">Get Started</button>
      </form>
      <div class="hero-form-success" id="hero-form-success">Got it — I'll reach out within a few hours.</div>
    </div>
  </div>
</section>

<div class="stats-bar">
  <div class="stats-inner">
    <div class="stat"><div class="stat-num">${escHtml(n.medianPrice)}</div><div class="stat-label">Median Price</div></div>
    <div class="stat"><div class="stat-num">${escHtml(n.zips.join(', '))}</div><div class="stat-label">Zip Code${n.zips.length > 1 ? 's' : ''}</div></div>
    <div class="stat"><div class="stat-num">Daily</div><div class="stat-label">MLS Updates</div></div>
    <div class="stat"><div class="stat-num">$0</div><div class="stat-label">Cost to Search</div></div>
  </div>
</div>

<section style="background:var(--bg)" id="listings-section">
  <div class="section-inner">
    <p class="section-eye">Active Listings</p>
    <h2 class="section-title">${escHtml(n.name)} Homes <em>For Sale Now</em></h2>
    <p class="section-desc">All active listings in the ${escHtml(n.name)} ${n.zips.length > 1 ? 'zip codes' : 'zip code'} matching "${escHtml(n.subdivisionName)}". Click any home for full details.</p>
    <div id="rr-listings-grid" class="grid"></div>
    <div id="rr-pagination" style="display:flex;justify-content:center;gap:6px;margin-top:36px"></div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">About the Market</p>
    <h2 class="section-title">${escHtml(n.name)} <em>Buyer Insights</em></h2>
    <div class="content-grid">
      <div class="content-body">
        <p>${escHtml(n.intro[0] || '')}</p>
        <p>${escHtml(n.intro[2] || n.intro[1] || '')}</p>
        <p><strong>Schools:</strong> ${escHtml(n.schools)}</p>
        <p><strong>Commute:</strong> ${escHtml(n.commute)}</p>
      </div>
      <div class="highlights-card">
        <h3>Related Pages</h3>
        <p style="font-size:13px;color:var(--mid);margin-bottom:16px">Explore more about ${escHtml(n.name)}:</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <a href="/round-rock/${n.slug}" style="color:var(--gold);text-decoration:none;font-size:13px">← ${escHtml(n.name)} Neighborhood Guide</a>
          <a href="/round-rock/${n.slug}/homes-for-rent" style="color:var(--gold);text-decoration:none;font-size:13px">${escHtml(n.name)} Homes for Rent →</a>
          <a href="/round-rock/${n.slug}/best-realtor" style="color:var(--gold);text-decoration:none;font-size:13px">Best Realtor in ${escHtml(n.name)} →</a>
          <a href="/round-rock" style="color:var(--gold);text-decoration:none;font-size:13px">← Round Rock Hub</a>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Want to See <em>${escHtml(n.name)} Homes?</em></h2>
  <p>I'll set up private showings, run cap rate analysis, and tell you about off-market options. No pressure — free consultation.</p>
  <a href="tel:+12547182567" class="btn-gold">Call (254) 718-2567</a>
</section>

${contactModalHtml()}
<script src="/js/footer.js"></script>
${sharedScripts()}
${listingsGridScript({ forRent: false, citySlug: n.slug, subdivisionName: n.subdivisionName, zips: n.zips, minPrice: 75000 })}
</body>
</html>`;
}

// ============================================================
// PAGE 3: Homes for Rent — /round-rock/:slug/homes-for-rent
// ============================================================
function renderHomesForRent(n) {
  const title = `Homes for Rent in ${n.name} Round Rock TX | ${n.rentRange} | Luke Allen`;
  const description = `Browse homes for rent in ${n.name}, Round Rock TX. Rent range ${n.rentRange}, ${n.schools.split(' — ')[0]}. Updated daily from MLS. Free renter representation.`;
  const canonical = `https://austintxhomes.co/round-rock/${n.slug}/homes-for-rent`;

  const schemaBlocks = [
    realEstateAgentSchema(),
    breadcrumbSchema(n, 'rent'),
    {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: `Homes for Rent in ${n.name}, Round Rock TX`,
      description,
      url: canonical
    }
  ];

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title, description, canonical, schemaBlocks })}
<body>
<script src="/js/nav.js"></script>

<section class="hero">
  <video autoplay muted loop playsinline preload="auto" src="/videos/hero-video.mp4"></video>
  <div class="hero-inner">
    <div class="hero-left">
      <div class="hero-breadcrumb"><a href="/round-rock">Round Rock</a> &nbsp;›&nbsp; <a href="/round-rock/${n.slug}">${escHtml(n.name)}</a> &nbsp;›&nbsp; Homes for Rent</div>
      <p class="hero-eye">Homes for Rent</p>
      <h1>${escHtml(n.name)} Homes <em>For Rent</em></h1>
      <p class="lead">Current rentals in ${escHtml(n.name)}, Round Rock — updated daily from MLS. Typical rent range: ${escHtml(n.rentRange)}.</p>
    </div>
    <div class="hero-form">
      <h3>${escHtml(n.name)} Rental Help</h3>
      <p>In Texas, the landlord pays my commission — renter representation is free.</p>
      <form id="hero-contact-form">
        <input type="hidden" name="source" value="round-rock-${escHtml(n.slug)}-rent" />
        <input type="text" name="name" placeholder="Your name" required />
        <input type="text" name="contact" placeholder="Email or phone" required />
        <select name="moveIn">
          <option value="">Move-in timeline</option>
          <option>Within 30 days</option>
          <option>1–3 months</option>
          <option>3+ months</option>
        </select>
        <button type="submit" class="btn-submit">Get Started</button>
      </form>
      <div class="hero-form-success" id="hero-form-success">Got it — I'll reach out within a few hours.</div>
    </div>
  </div>
</section>

<div class="stats-bar">
  <div class="stats-inner">
    <div class="stat"><div class="stat-num">${escHtml(n.rentRange.split(' – ')[0] || '—')}</div><div class="stat-label">Rent From</div></div>
    <div class="stat"><div class="stat-num">${escHtml(n.zips.join(', '))}</div><div class="stat-label">Zip Code${n.zips.length > 1 ? 's' : ''}</div></div>
    <div class="stat"><div class="stat-num">Free</div><div class="stat-label">Representation</div></div>
    <div class="stat"><div class="stat-num">Daily</div><div class="stat-label">MLS Updates</div></div>
  </div>
</div>

<section style="background:var(--bg)" id="listings-section">
  <div class="section-inner">
    <p class="section-eye">Available Rentals</p>
    <h2 class="section-title">${escHtml(n.name)} Rentals <em>Available Now</em></h2>
    <p class="section-desc">Current MLS rental listings in ${escHtml(n.name)}. Rentals move fast — contact me immediately when you find one worth seeing.</p>
    <div id="rr-listings-grid" class="grid"></div>
    <div id="rr-pagination" style="display:flex;justify-content:center;gap:6px;margin-top:36px"></div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">Why Use a Realtor</p>
    <h2 class="section-title">Why Use a Realtor <em>to Rent in Round Rock?</em></h2>
    <div class="content-grid">
      <div class="content-body">
        <p>In Texas, the landlord or property manager pays the agent commission — <strong>renter representation is completely free</strong>. There's no reason not to have a licensed agent in your corner.</p>
        <p>What you get when you work with me:</p>
        <p><strong>Access to every MLS rental in ${escHtml(n.name)}</strong> — not just what's on Zillow or Apartments.com. MLS includes private landlords, property managers, and off-market rentals.</p>
        <p><strong>Lease review before you sign.</strong> Texas residential leases are dense. I walk through the key terms so you understand what you're agreeing to before committing 12 months of your life.</p>
        <p><strong>Negotiation on your behalf.</strong> Rent, move-in date, pet deposits, lease length — most renters don't realize how much is negotiable. Having an agent ask for you is often more effective than asking yourself.</p>
      </div>
      <div class="highlights-card">
        <h3>Quick Facts</h3>
        <div class="highlight"><div class="highlight-icon">💰</div><div class="highlight-body"><strong>Cost to renter</strong><span>$0 — landlord pays my commission</span></div></div>
        <div class="highlight"><div class="highlight-icon">⚡</div><div class="highlight-body"><strong>Typical response time</strong><span>Same-day showings for active MLS listings</span></div></div>
        <div class="highlight"><div class="highlight-icon">📝</div><div class="highlight-body"><strong>Lease review</strong><span>I walk through key terms before you sign</span></div></div>
        <div class="highlight"><div class="highlight-icon">🔑</div><div class="highlight-body"><strong>Credit/app support</strong><span>I help you build a strong renter application</span></div></div>
      </div>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Need Help Finding a <em>${escHtml(n.name)} Rental?</em></h2>
  <p>Rentals in desirable Round Rock neighborhoods lease in days. Let me set up showings and negotiate your lease — free.</p>
  <a href="tel:+12547182567" class="btn-gold">Call (254) 718-2567</a>
</section>

${contactModalHtml()}
<script src="/js/footer.js"></script>
${sharedScripts()}
${listingsGridScript({ forRent: true, citySlug: n.slug, subdivisionName: n.subdivisionName, zips: n.zips, minPrice: 500 })}
</body>
</html>`;
}

// ============================================================
// PAGE 4: Best Realtor — /round-rock/:slug/best-realtor
// ============================================================
function renderBestRealtor(n) {
  const title = `Best Realtor in ${n.name} Round Rock TX | Luke Allen, TREC #788149`;
  const description = `Luke Allen is the top realtor in ${n.name}, Round Rock TX. 5.0 Google rating, licensed Texas realtor (TREC #788149), Round Rock market specialist.`;
  const canonical = `https://austintxhomes.co/round-rock/${n.slug}/best-realtor`;

  const schemaBlocks = [
    realEstateAgentSchema(),
    breadcrumbSchema(n, 'realtor'),
    {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: `Luke Allen – ${n.name} Round Rock Realtor`,
      provider: { '@type': 'RealEstateAgent', name: 'Luke Allen' },
      areaServed: { '@type': 'Place', name: `${n.name}, Round Rock, TX` },
      url: canonical
    }
  ];

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title, description, canonical, schemaBlocks })}
<body>
<script src="/js/nav.js"></script>

<section class="hero">
  <video autoplay muted loop playsinline preload="auto" src="/videos/hero-video.mp4"></video>
  <div class="hero-inner">
    <div class="hero-left">
      <div class="hero-breadcrumb"><a href="/round-rock">Round Rock</a> &nbsp;›&nbsp; <a href="/round-rock/${n.slug}">${escHtml(n.name)}</a> &nbsp;›&nbsp; Best Realtor</div>
      <p class="hero-eye">${escHtml(n.name)} Realtor</p>
      <h1>Best Realtor in <em>${escHtml(n.name)}</em></h1>
      <p class="lead">Luke Allen — licensed Texas realtor (TREC #788149), 5.0 Google rating, Round Rock market specialist. I help buyers, sellers, and renters in ${escHtml(n.name)} navigate the ${escHtml(n.schools.split(' — ')[0])} market with honest, data-driven guidance.</p>
      <div class="hero-pills">
        <span class="hero-pill">5.0 ★ Google Rating</span>
        <span class="hero-pill">TREC #788149</span>
        <span class="hero-pill">${escHtml(n.name)} Specialist</span>
      </div>
    </div>
    <div class="hero-form">
      <h3>Work With Luke</h3>
      <p>Tell me what you need. No pressure, no spam — just a real conversation.</p>
      <form id="hero-contact-form">
        <input type="hidden" name="source" value="round-rock-${escHtml(n.slug)}-realtor" />
        <input type="text" name="name" placeholder="Your name" required />
        <input type="text" name="contact" placeholder="Email or phone" required />
        <select name="intent">
          <option value="">I want to...</option>
          <option>Buy in ${escHtml(n.name)}</option>
          <option>Sell in ${escHtml(n.name)}</option>
          <option>Rent in ${escHtml(n.name)}</option>
          <option>Just talk through options</option>
        </select>
        <button type="submit" class="btn-submit">Start Conversation</button>
      </form>
      <div class="hero-form-success" id="hero-form-success">Got it — I'll reach out within a few hours.</div>
    </div>
  </div>
</section>

<div class="credential-bar">
  <div class="credential-inner">
    <div class="credential-item">⭐ <strong>5.0</strong> Google Rating</div>
    <div class="credential-item">📝 <strong>15</strong> Reviews</div>
    <div class="credential-item">🏠 <strong>TREC</strong> #788149</div>
    <div class="credential-item">📍 <strong>${escHtml(n.name)}</strong> Specialist</div>
    <div class="credential-item">📞 <strong>(254) 718-2567</strong></div>
  </div>
</div>

<section style="background:var(--bg)">
  <div class="section-inner">
    <p class="section-eye">About Luke</p>
    <h2 class="section-title">Your ${escHtml(n.name)} <em>Local Realtor</em></h2>
    <div class="agent-card">
      <img src="/images/luke-allen.jpg" alt="Luke Allen, Round Rock Realtor" class="agent-photo" />
      <div class="agent-info">
        <h3>Luke Allen</h3>
        <p>Licensed Texas Realtor · TREC #788149 · Austin Marketing + Development Group · Serving Round Rock buyers, sellers, and renters.</p>
        <a href="tel:+12547182567" class="btn">Call (254) 718-2567</a>
        <button class="btn btn-outline" onclick="openContactModal()" style="font-family:inherit;cursor:pointer;border:1px solid var(--border)">Send Message</button>
      </div>
    </div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">What I Do</p>
    <h2 class="section-title">Services in <em>${escHtml(n.name)}</em></h2>
    <div class="services-grid">
      <div class="service-card">
        <span class="icon">🏡</span>
        <h4>Buyer Representation</h4>
        <p>Full MLS search, private showings, negotiation, inspection coordination, and closing. Free to buyers in ${escHtml(n.name)}.</p>
      </div>
      <div class="service-card">
        <span class="icon">📸</span>
        <h4>Seller Representation</h4>
        <p>Comparative market analysis, professional photography, MLS listing, marketing, open houses, negotiation, and closing.</p>
      </div>
      <div class="service-card">
        <span class="icon">🔑</span>
        <h4>Renter Representation</h4>
        <p>Access to every MLS rental, lease review, negotiation, and advocacy. Free — landlord pays commission in Texas.</p>
      </div>
      <div class="service-card">
        <span class="icon">📊</span>
        <h4>Market Analysis</h4>
        <p>Data-driven pricing for ${escHtml(n.name)} using live MLS comps and historical trend analysis.</p>
      </div>
      <div class="service-card">
        <span class="icon">🏫</span>
        <h4>School Zone Guidance</h4>
        <p>${escHtml(n.schools.split(' — ')[0])} — I know the exact feeder patterns and boundary maps.</p>
      </div>
      <div class="service-card">
        <span class="icon">💼</span>
        <h4>Investment Analysis</h4>
        <p>Cap rate, cash flow, and rental comp analysis for buyers considering ${escHtml(n.name)} as an investment.</p>
      </div>
    </div>
  </div>
</section>

<section style="background:var(--bg)">
  <div class="section-inner">
    <p class="section-eye">Why Luke</p>
    <h2 class="section-title">Why Work With <em>Luke in ${escHtml(n.name)}</em></h2>
    <div class="buy-grid">
      <div class="buy-card">
        <span class="icon">⭐</span>
        <h3>5.0 Google Rating</h3>
        <p>15 five-star reviews from buyers and sellers across the Austin metro. No pressure, no spin, straight talk.</p>
      </div>
      <div class="buy-card">
        <span class="icon">🏠</span>
        <h3>Round Rock Specialist</h3>
        <p>I know every corner of Round Rock — ${escHtml(n.name)}, Teravista, Forest Creek, Behrens Ranch, and everything in between.</p>
      </div>
      <div class="buy-card">
        <span class="icon">💬</span>
        <h3>Always Responsive</h3>
        <p>Texts, calls, emails — I respond within a few hours during business hours, always same-day.</p>
      </div>
    </div>
  </div>
</section>

<section style="background:var(--warm)">
  <div class="section-inner">
    <p class="section-eye">Explore ${escHtml(n.name)}</p>
    <h2 class="section-title">More ${escHtml(n.name)} <em>Resources</em></h2>
    <div class="related-grid">
      <a class="related-card" href="/round-rock/${n.slug}">
        <h4>Neighborhood Guide</h4>
        <p>Schools, commute, vibe, and what makes ${escHtml(n.name)} different</p>
        <span class="arrow">Read Guide →</span>
      </a>
      <a class="related-card" href="/round-rock/${n.slug}/homes-for-sale">
        <h4>Homes for Sale</h4>
        <p>Active listings in ${escHtml(n.name)}, updated daily</p>
        <span class="arrow">View Listings →</span>
      </a>
      <a class="related-card" href="/round-rock/${n.slug}/homes-for-rent">
        <h4>Homes for Rent</h4>
        <p>Current rentals in ${escHtml(n.name)}</p>
        <span class="arrow">View Rentals →</span>
      </a>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Ready to Start <em>the Conversation?</em></h2>
  <p>No pressure. No spam. Just a real conversation about what you want to do in ${escHtml(n.name)} and how I can help.</p>
  <a href="tel:+12547182567" class="btn-gold">Call (254) 718-2567</a>
</section>

${contactModalHtml()}
<script src="/js/footer.js"></script>
${sharedScripts()}
</body>
</html>`;
}

module.exports = {
  renderHub,
  renderHomesForSale,
  renderHomesForRent,
  renderBestRealtor
};
