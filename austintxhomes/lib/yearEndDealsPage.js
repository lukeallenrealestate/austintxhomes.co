// SSR template for /year-end-new-construction-austin.
//
// Targets Q4-urgent buyers: lease-ending, year-end tax strategy, corporate
// relocation starting Q1, buyers using bonus money. Also targets the
// supply-side motivation: Austin production builders are measurably more
// movable on the incentive stack in November + December because they're
// trying to hit annual revenue and inventory-clearing targets before
// Dec 31. Standing-inventory homes (new builds sitting 60+ days unsold)
// are where the aggressive incentive stacks live.
//
// The page pulls live standing-inventory from the IDX DB sorted by DOM
// descending, so the homes with the biggest built-up carrying cost
// (most negotiating room) surface first.

const db = require('../../idx-search/db/database');
const { BUILDER_MAP } = require('../../idx-search/routes/properties');

function fmtPrice(p) { return p ? '$' + Number(p).toLocaleString('en-US') : ''; }
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

// Figure out which builder a listing most likely belongs to by matching
// office name against the BUILDER_MAP patterns. Used to label cards with
// the builder brand so buyers know who to negotiate against.
function inferBuilder(office) {
  if (!office) return null;
  const l = office.toLowerCase();
  for (const [slug, b] of Object.entries(BUILDER_MAP)) {
    for (const p of b.patterns) {
      const needle = p.replace(/%/g, '').toLowerCase();
      if (needle && l.includes(needle.toLowerCase())) return { slug, name: b.shortName };
    }
  }
  return null;
}

function fetchData() {
  // Standing inventory = active new-construction homes that have been
  // on the market longest (builders have been sitting on them most,
  // so Q4 incentive stacks are most aggressive). days_on_market is
  // NULL for new construction in the ACTRIS feed (builders don't
  // populate it), so we compute DOM from listing_contract_date instead
  // and sort by that ASC (oldest listing = longest sitting = most
  // negotiable right now).
  const today = new Date().toISOString().slice(0, 10);
  const cutoff45 = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT listing_key, unparsed_address, city, postal_code, list_price,
           bedrooms_total, bathrooms_total, living_area, year_built,
           subdivision_name, photos, listing_contract_date, pool_features,
           list_office_name, original_list_price, previous_list_price
    FROM listings
    WHERE mlg_can_view = 1
      AND standard_status = 'Active'
      AND new_construction_yn = 1
      AND property_type NOT LIKE '%Lease%'
      AND list_price IS NOT NULL
      AND list_price > 150000
      AND listing_contract_date IS NOT NULL
      AND listing_contract_date <= ?
    ORDER BY listing_contract_date ASC
    LIMIT 24
  `).all(cutoff45);

  const totalActive = db.prepare(`
    SELECT COUNT(*) AS n FROM listings
    WHERE mlg_can_view = 1 AND standard_status = 'Active'
      AND new_construction_yn = 1
      AND property_type NOT LIKE '%Lease%'
      AND list_price IS NOT NULL AND list_price > 150000
  `).get().n;

  const standingCount = db.prepare(`
    SELECT COUNT(*) AS n FROM listings
    WHERE mlg_can_view = 1 AND standard_status = 'Active'
      AND new_construction_yn = 1
      AND property_type NOT LIKE '%Lease%'
      AND list_price IS NOT NULL AND list_price > 150000
      AND listing_contract_date IS NOT NULL
      AND listing_contract_date <= ?
  `).get(cutoff60).n;

  // Average DOM across all active new construction (computed from listing_contract_date).
  const avgDomRow = db.prepare(`
    SELECT AVG(julianday(?) - julianday(listing_contract_date)) AS avg_dom
    FROM listings
    WHERE mlg_can_view = 1 AND standard_status = 'Active'
      AND new_construction_yn = 1
      AND property_type NOT LIKE '%Lease%'
      AND list_price IS NOT NULL AND list_price > 150000
      AND listing_contract_date IS NOT NULL
  `).get(today);
  const avgDom = Math.round(avgDomRow.avg_dom || 0);

  function daysSince(d) {
    if (!d) return null;
    return Math.floor((Date.now() - new Date(d + 'T00:00:00Z').getTime()) / 86400000);
  }

  return {
    totalActive,
    avgDom,
    standingCount,
    listings: rows.map(l => {
      let photo = null;
      try { const p = JSON.parse(l.photos || '[]'); photo = p[0] || null; } catch {}
      const priceDrop = l.original_list_price && l.list_price && l.original_list_price > l.list_price
        ? l.original_list_price - l.list_price : 0;
      const builder = inferBuilder(l.list_office_name);
      return {
        listing_key: l.listing_key,
        address: l.unparsed_address,
        city: l.city,
        zip: l.postal_code,
        list_price: l.list_price,
        original_list_price: l.original_list_price,
        price_drop: priceDrop,
        beds: l.bedrooms_total,
        baths: l.bathrooms_total,
        sqft: l.living_area,
        year: l.year_built,
        subdivision: l.subdivision_name,
        dom: daysSince(l.listing_contract_date),
        builder,
        photo,
        href: homesUrl(l.listing_key, l.unparsed_address)
      };
    })
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
  const domBadge = l.dom >= 120
    ? `<div class="dom-badge dom-hot">Sitting ${l.dom} days</div>`
    : l.dom >= 90
    ? `<div class="dom-badge dom-warm">${l.dom} days on market</div>`
    : `<div class="dom-badge">${l.dom} days on market</div>`;
  const dropBadge = l.price_drop > 0
    ? `<div class="drop-badge">Already dropped ${fmtPriceShort(l.price_drop)}</div>`
    : '';
  const builderLine = l.builder
    ? `<a href="/${l.builder.slug}-homes-austin-for-sale" class="builder-chip">${escHtml(l.builder.name)}</a>`
    : '';

  return `
  <a class="inv-card" href="${l.href}" aria-label="${escHtml(addr)}">
    ${photo ? `<div class="inv-card-img"><img src="${photo}" alt="${escHtml(addr)}" loading="lazy" />${domBadge}</div>` : `<div class="inv-card-img inv-card-noimg">${domBadge}</div>`}
    <div class="inv-card-body">
      ${builderLine}
      <div class="inv-card-price">${fmtPrice(l.list_price)}</div>
      ${dropBadge}
      <div class="inv-card-addr">${escHtml(l.address || '')}</div>
      <div class="inv-card-sub">${escHtml(l.city || '')}${l.zip ? ', ' + escHtml(l.zip) : ''}${l.subdivision ? ' &middot; ' + escHtml(l.subdivision) : ''}</div>
      <div class="inv-card-specs">${specs}</div>
      <div class="inv-card-cta">Ask Luke about Dec 31 incentives &rarr;</div>
    </div>
  </a>`;
}

function renderPage() {
  const data = fetchData();
  const canonical = 'https://austintxhomes.co/year-end-new-construction-austin';
  const title = 'Year-End New Construction Deals in Austin | Builder Incentives Dec 2026';
  const metaDesc = `${data.standingCount} Austin new construction homes sitting on the market 60+ days. Q4 is when builders stack $25K-$50K in incentives to clear inventory before Dec 31. Independent buyer rep from Luke Allen, TREC #788149.`;
  const cardsHtml = data.listings.length
    ? data.listings.map(renderCard).join('')
    : `<div class="inv-empty">No current standing inventory matching the criteria. Call Luke at (254) 718-2567 for the latest.</div>`;

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      serviceType: 'Austin New Construction Year-End Buyer Representation',
      name: 'Year-end new construction buyer representation in Austin',
      description: 'Independent buyer representation at Austin production builders during Q4, when builders are most movable on incentive stacks to hit annual revenue and inventory-clearing targets.',
      provider: { '@type': 'Person', name: 'Luke Allen', identifier: 'TREC #788149' },
      areaServed: { '@type': 'AdministrativeArea', name: 'Austin TX metro' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Builder-paid representation. Buyer pays nothing.' }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Luke Allen',
      jobTitle: 'Austin New Construction Realtor',
      description: 'Luke Allen is a Texas-licensed Realtor (TREC #788149) specializing in year-end new construction buyer representation across the Austin metro.',
      url: canonical,
      image: 'https://austintxhomes.co/images/luke-allen.jpg',
      telephone: '+12547182567',
      email: 'Luke@austinmdg.com',
      identifier: 'TREC #788149',
      worksFor: { '@type': 'Organization', name: 'Austin Marketing + Development Group' }
    },
    {
      '@context': 'https://schema.org',
      '@type': ['RealEstateAgent', 'LocalBusiness'],
      name: 'Luke Allen Austin Year-End New Construction',
      url: canonical,
      telephone: '+12547182567',
      email: 'Luke@austinmdg.com',
      image: 'https://austintxhomes.co/images/luke-allen.jpg',
      address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', postalCode: '78701', addressCountry: 'US' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '41', bestRating: '5', worstRating: '1' },
      priceRange: '$275,000 to $2,000,000'
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Year-End New Construction Deals in Austin',
      description: 'How Austin production builders move on incentives in Q4 and which standing-inventory homes carry the biggest negotiating room before Dec 31.',
      author: { '@type': 'Person', name: 'Luke Allen', identifier: 'TREC #788149' },
      publisher: { '@type': 'Organization', name: 'Austin Marketing + Development Group' },
      datePublished: '2026-11-08',
      dateModified: new Date().toISOString().slice(0, 10),
      mainEntityOfPage: canonical,
      image: 'https://austintxhomes.co/images/luke-allen.jpg'
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Why are Austin builders more willing to negotiate at year end?',
          acceptedAnswer: { '@type': 'Answer', text: 'Production builders report quarterly to parent companies on home closings and revenue. Q4 numbers get the most scrutiny because they shape the annual report. A home that sits unsold into November costs the builder carrying charges (financing, insurance, taxes, HOA) every month, and every unsold home at year end drops the annual report. That is why rate buydowns, closing cost credits, design studio dollars, and lot premium waivers all stack higher in Q4 than any other time of year.' }
        },
        {
          '@type': 'Question',
          name: 'How much can I save on an Austin new construction home before Dec 31?',
          acceptedAnswer: { '@type': 'Answer', text: 'On standing inventory homes (new builds that have been sitting 60+ days unsold), typical Q4 Austin builder stacks run $25,000 to $50,000 in combined incentives. On homes sitting 120+ days the stack can go higher, sometimes $60,000 or more, because the builder is actively trying to clear the home before the year-end report. The exact mix of incentives depends on the builder and the specific home.' }
        },
        {
          '@type': 'Question',
          name: 'What is standing inventory in Austin new construction?',
          acceptedAnswer: { '@type': 'Answer', text: 'Standing inventory is a new construction home that is already built and ready to move into but has not yet been sold. Also called "quick move-in" or "spec" homes. These are where year-end incentive stacks live because the builder is paying carrying costs every month the home sits. Luke pulls standing inventory sorted by days-on-market so buyers see the most movable homes first.' }
        },
        {
          '@type': 'Question',
          name: 'Can I close an Austin new construction home by December 31?',
          acceptedAnswer: { '@type': 'Answer', text: 'On standing inventory, yes. Standing-inventory new builds are move-in ready, so the only variable is the lender timeline (typically 21 to 30 days from executed contract to close). Starting the process by early December is realistic for a Dec 31 close. To-be-built homes cannot close by year end if they have not yet broken ground or are mid-construction.' }
        },
        {
          '@type': 'Question',
          name: 'Which Austin builders offer the best year-end incentives?',
          acceptedAnswer: { '@type': 'Answer', text: 'D.R. Horton, Lennar, and Pulte (including Centex and Del Webb) typically run the most aggressive year-end incentive stacks because of their scale and standing-inventory volume. Taylor Morrison, David Weekley, Highland, Perry, and Meritage all run year-end incentives too, more targeted at specific communities. Luke Allen tracks current incentive postures across all eight.' }
        },
        {
          '@type': 'Question',
          name: 'Do I pay Luke Allen to represent me on a year-end builder purchase?',
          acceptedAnswer: { '@type': 'Answer', text: 'No. Austin builders allocate a buyer-agent commission (typically 2.5 to 3 percent) out of their marketing budget, separate from the sale price. The commission is baked into the home\'s pricing whether the buyer uses independent representation or not. Walking in unrepresented returns that commission to the builder; it does not reduce the price. Independent representation through Luke costs the buyer $0.' }
        },
        {
          '@type': 'Question',
          name: 'How do I lock in a year-end new construction deal in Austin?',
          acceptedAnswer: { '@type': 'Answer', text: 'Call Luke Allen at (254) 718-2567 or submit the form on austintxhomes.co. First conversation covers target area, budget, timeline, and builder preference. Luke sends back a shortlist of standing-inventory homes with the current year-end incentive posture for each. First visit to any community is coordinated through Luke to lock in buyer representation at registration.' }
        }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://austintxhomes.co/' },
        { '@type': 'ListItem', position: 2, name: 'New Construction Realtor Austin', item: 'https://austintxhomes.co/new-construction-realtor-austin' },
        { '@type': 'ListItem', position: 3, name: 'Year-End New Construction Deals', item: canonical }
      ]
    }
  ];

  return `<!-- atx-author-block v1 -->
<!DOCTYPE html>
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
 ${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n ')}
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
 <style>
  :root { --gold: #b8935a; --gold-lt: #cda96f; --ink: #0f0f0e; --text: #1a1918; --mid: #5c5b57; --light: #999690; --bg: #fff; --warm: #faf8f4; --cream: #f1ece3; --border: #e5dfd4; --r: 4px; --w: 1180px; --emerald: #2d6a4f; --crimson: #a84a2f; --crimson-dk: #7a3521; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; color: var(--text); background: var(--bg); line-height: 1.7; -webkit-font-smoothing: antialiased; }
  a { color: var(--gold); text-decoration: none; }
  a:hover { color: var(--gold-lt); text-decoration: underline; }

  /* Hero */
  .hero { position: relative; overflow: hidden; background: var(--ink); color: #fff; padding: 128px 20px 72px; text-align: center; }
  .hero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.4s ease; z-index: 0; }
  .hero video.ready { opacity: 0.35; }
  .hero-veil { position: absolute; inset: 0; z-index: 1; background: radial-gradient(ellipse 85% 70% at 50% 40%, rgba(184,147,90,.28) 0%, transparent 70%), linear-gradient(180deg, rgba(15,15,14,.82) 0%, rgba(15,15,14,.7) 100%); pointer-events: none; }
  .hero > *:not(video):not(.hero-veil) { position: relative; z-index: 2; }
  .hero-kicker { display: inline-flex; align-items: center; gap: 8px; padding: 7px 16px; background: rgba(168,74,47,.3); border: 1px solid rgba(255,255,255,.2); border-radius: 100px; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #fff; font-weight: 700; margin-bottom: 22px; }
  .hero-kicker .pulse { width: 7px; height: 7px; background: var(--crimson); border-radius: 50%; animation: pulse 1.8s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  .hero h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: clamp(42px, 6.2vw, 68px); letter-spacing: -.01em; line-height: 1.08; margin: 0 auto 18px; max-width: 920px; }
  .hero h1 em { font-style: italic; color: var(--gold-lt); font-weight: 500; }
  .hero-sub { font-size: 17.5px; color: rgba(255,255,255,.88); max-width: 720px; margin: 0 auto 32px; line-height: 1.65; }

  /* Countdown */
  .countdown { display: inline-flex; gap: 14px; margin: 0 auto 32px; }
  .cd-cell { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 6px; padding: 14px 18px; min-width: 76px; }
  .cd-num { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 600; color: var(--gold-lt); line-height: 1; }
  .cd-label { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.65); margin-top: 6px; font-weight: 600; }
  @media (max-width: 500px) { .cd-cell { min-width: 64px; padding: 12px; } .cd-num { font-size: 28px; } }

  .hero-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .hero-cta { display: inline-block; padding: 16px 32px; background: var(--gold); color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; border: none; border-radius: var(--r); cursor: pointer; }
  .hero-cta:hover { background: #a37f49; color: #fff; text-decoration: none; }
  .hero-cta.ghost { background: transparent; border: 1.5px solid rgba(255,255,255,.3); }

  /* Trust bar */
  .trust { background: var(--warm); border-bottom: 1px solid var(--border); padding: 32px 20px; }
  .trust-inner { max-width: var(--w); margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center; }
  .trust-cell strong { display: block; font-family: 'Cormorant Garamond', serif; font-size: clamp(26px, 3vw, 36px); font-weight: 600; color: var(--gold); line-height: 1.1; }
  .trust-cell .s { font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--mid); font-weight: 600; margin-top: 6px; }
  @media (max-width: 720px) { .trust-inner { grid-template-columns: repeat(2, 1fr); } }

  /* Sections */
  section.block { padding: 64px 20px; }
  .inner { max-width: var(--w); margin: 0 auto; }
  .inner-narrow { max-width: 820px; margin: 0 auto; }
  .k { font-size: 11.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-bottom: 10px; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: clamp(30px, 4.2vw, 44px); line-height: 1.15; margin: 0 0 18px; color: var(--ink); letter-spacing: -.005em; }
  h2 em { font-style: italic; color: var(--gold); }
  h3 { font-family: 'Cormorant Garamond', serif; font-weight: 500; font-size: 24px; margin: 28px 0 10px; color: var(--ink); }
  p { margin: 0 0 15px; color: var(--text); font-size: 15.5px; line-height: 1.75; }
  .dek { background: var(--warm); border-left: 3px solid var(--gold); padding: 24px 30px; font-size: 16px; line-height: 1.7; margin: 0 0 24px; }
  .dek strong { color: var(--ink); }

  /* Why-year-end explainer */
  .why-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 30px; }
  .why-card { background: #fff; border: 1px solid var(--border); border-radius: var(--r); padding: 26px 24px; }
  .why-card .big { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 600; color: var(--gold); line-height: 1; margin-bottom: 6px; }
  .why-card h3 { margin: 10px 0 8px; font-size: 20px; }
  .why-card p { font-size: 14.5px; color: var(--mid); margin: 0; line-height: 1.65; }
  @media (max-width: 820px) { .why-grid { grid-template-columns: 1fr; } }

  /* Inventory grid */
  .inv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }
  @media (max-width: 920px) { .inv-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .inv-grid { grid-template-columns: 1fr; } }
  .inv-card { background: #fff; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; display: block; color: var(--text); transition: box-shadow .2s, border .2s; }
  .inv-card:hover { border-color: var(--gold); box-shadow: 0 10px 30px rgba(15,15,14,.1); text-decoration: none; }
  .inv-card-img { position: relative; aspect-ratio: 16/10; background: var(--cream); overflow: hidden; }
  .inv-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .inv-card-noimg { display: flex; align-items: center; justify-content: center; }
  .dom-badge { position: absolute; top: 10px; right: 10px; background: rgba(15,15,14,.82); color: #fff; font-size: 10.5px; padding: 5px 10px; border-radius: 3px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; backdrop-filter: blur(6px); }
  .dom-badge.dom-warm { background: rgba(168,74,47,.9); }
  .dom-badge.dom-hot { background: var(--crimson-dk); }
  .inv-card-body { padding: 16px 18px; }
  .builder-chip { display: inline-block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-bottom: 8px; border: 1px solid var(--border); padding: 3px 10px; border-radius: 3px; }
  .builder-chip:hover { background: var(--gold-pale); color: var(--gold); text-decoration: none; }
  .inv-card-price { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; color: var(--gold); line-height: 1; margin-bottom: 4px; }
  .drop-badge { display: inline-block; background: #e6f4ea; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 3px; letter-spacing: .04em; margin-bottom: 8px; }
  .inv-card-addr { font-size: 14.5px; font-weight: 600; color: var(--ink); line-height: 1.3; }
  .inv-card-sub { font-size: 12.5px; color: var(--mid); margin-top: 3px; }
  .inv-card-specs { font-size: 13px; color: var(--text); margin-top: 6px; }
  .inv-card-cta { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); font-weight: 700; margin-top: 12px; }

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
  .faq { background: #fff; border: 1px solid var(--border); border-radius: var(--r); padding: 22px 26px; margin-bottom: 12px; }
  .faq h3 { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 17px; color: var(--ink); margin: 0 0 8px; line-height: 1.4; }
  .faq p { font-size: 14.5px; color: var(--text); margin: 0; line-height: 1.7; }

  /* Lead form */
  .quick-contact { background: var(--ink); color: #fff; padding: 64px 20px; }
  .qc-inner { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }
  @media (max-width: 760px) { .qc-inner { grid-template-columns: 1fr; } }
  .qc-pitch h2 { color: #fff; }
  .qc-pitch h2 em { color: var(--gold-lt); }
  .qc-pitch p { color: rgba(255,255,255,.82); margin: 0 0 14px; font-size: 15px; }
  .qc-form { background: #fff; color: var(--text); border-radius: 6px; padding: 28px; }
  .qc-form h3 { margin: 0 0 4px; font-family: 'Cormorant Garamond', serif; font-size: 24px; color: var(--ink); }
  .qc-form .sub { font-size: 13px; color: var(--mid); margin: 0 0 18px; }
  .qc-form input, .qc-form textarea, .qc-form select { width: 100%; padding: 12px 14px; font-size: 14.5px; border: 1px solid var(--border); border-radius: var(--r); background: #fff; margin-bottom: 12px; font-family: inherit; color: var(--text); }
  .qc-form input:focus, .qc-form textarea:focus, .qc-form select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(184,147,90,.15); }
  .qc-form textarea { min-height: 72px; resize: vertical; }
  .qc-form button { width: 100%; padding: 15px; background: var(--gold); color: #fff; border: none; border-radius: var(--r); font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; cursor: pointer; font-family: inherit; margin-top: 4px; }
  .qc-form button:hover { background: #a37f49; }
  .qc-form .form-msg { font-size: 13px; margin-top: 12px; padding: 10px 14px; border-radius: var(--r); display: none; }
  .qc-form .form-msg.ok { background: #e6f4ea; color: #166534; display: block; }
  .qc-form .form-msg.err { background: #fde7e7; color: #b91c1c; display: block; }
 </style>
</head>
<body>

<script src="/js/nav.js"></script>

<section class="hero">
 <video autoplay muted loop playsinline preload="none" data-src="/videos/hero-video.mp4"></video>
 <div class="hero-veil"></div>
 <div class="hero-kicker"><span class="pulse"></span> Austin builders are stacking Q4 incentives now</div>
 <h1>Close an Austin <em>new build</em> before 2027 and leave with a bigger stack of concessions.</h1>
 <p class="hero-sub">Austin production builders hit their biggest annual push in November and December. Standing inventory carries $25K to $60K in built-up incentive room because every month that home sits costs the builder money. We bring that cash to you, not to the builder's bottom line.</p>
 <div class="countdown" id="countdown">
  <div class="cd-cell"><div class="cd-num" id="cd-days">00</div><div class="cd-label">Days</div></div>
  <div class="cd-cell"><div class="cd-num" id="cd-hours">00</div><div class="cd-label">Hours</div></div>
  <div class="cd-cell"><div class="cd-num" id="cd-mins">00</div><div class="cd-label">Minutes</div></div>
 </div>
 <div class="hero-cta-row">
  <a href="#inventory" class="hero-cta">See standing inventory</a>
  <a href="#contact" class="hero-cta ghost">Tour with Luke</a>
 </div>
</section>

<div class="trust">
 <div class="trust-inner">
  <div class="trust-cell"><strong>${data.totalActive.toLocaleString()}</strong><div class="s">Active new builds in Austin</div></div>
  <div class="trust-cell"><strong>${data.standingCount.toLocaleString()}</strong><div class="s">Standing 60+ days</div></div>
  <div class="trust-cell"><strong>${data.avgDom}</strong><div class="s">Average days on market</div></div>
  <div class="trust-cell"><strong>$0</strong><div class="s">Buyer cost</div></div>
 </div>
</div>

<section class="block">
 <div class="inner-narrow">
  <div class="k">The mechanics</div>
  <h2>Why Austin builders move the <em>most</em> in Q4.</h2>
  <div class="dek">
   Production builders report quarterly to their parent companies on closings and revenue. The annual report is the one that matters. Every home a builder closes in December is a home that lands in the right year; every home that doesn't close is one more unit of standing inventory the builder carries into the next year. That shapes how the sales office negotiates in November and December.
  </div>

  <div class="why-grid">
   <div class="why-card">
    <div class="big">$25K-$60K</div>
    <h3>Incentive stack size</h3>
    <p>Standing inventory homes carry stacks of closing cost credits, rate buydowns, design studio dollars, and lot premium waivers. The longer the home has been sitting, the bigger the stack.</p>
   </div>
   <div class="why-card">
    <div class="big">21-30 days</div>
    <h3>Close by year end</h3>
    <p>Standing inventory is move-in ready, so the only variable is the lender timeline. An executed contract by early December closes by Dec 31 on most lenders.</p>
   </div>
   <div class="why-card">
    <div class="big">$0</div>
    <h3>Buyer-side cost</h3>
    <p>Builders pay the buyer-agent commission from their marketing budget. Representation costs the buyer nothing and captures a commission that would otherwise stay with the builder.</p>
   </div>
  </div>
 </div>
</section>

<section class="block" style="background:var(--warm);border-top:1px solid var(--border);border-bottom:1px solid var(--border);" id="inventory">
 <div class="inner">
  <div class="k">Standing inventory now</div>
  <h2>${data.listings.length} Austin new builds sitting <em>45 plus days</em>.</h2>
  <p style="max-width:720px;">Sorted by days-on-market descending so the homes with the most built-up carrying cost (and the biggest incentive room) surface first. Pulled live from the ACTRIS MLS. Click any home to see details, then call Luke to run the year-end negotiation.</p>
  <div class="inv-grid">${cardsHtml}</div>
 </div>
</section>

<section class="meet">
 <div class="meet-inner">
  <div class="meet-photo"><img src="/images/luke-allen.jpg" alt="Luke Allen, Austin new construction Realtor" loading="lazy" /></div>
  <div class="meet-text">
   <div class="k">Who runs the negotiation</div>
   <h2>Luke Allen</h2>
   <p class="title-line"><strong>Austin New Construction Realtor</strong> &middot; TREC #788149 &middot; 5.0 across 41 Google reviews</p>
   <p>Luke represents buyers at all eight major Austin production builders (David Weekley, Taylor Morrison, Pulte, DR Horton, Lennar, Highland, Perry, Meritage). Year-end negotiation is a specific skill: which builders will discount base price, which will only move on incentive, which standing-inventory homes carry the biggest stacks. Luke tracks current incentive postures weekly.</p>
   <div class="meet-contact">
    <a href="tel:+12547182567">(254) 718-2567</a>
    <a href="mailto:Luke@austinmdg.com">Luke@austinmdg.com</a>
   </div>
  </div>
 </div>
</section>

<section class="block">
 <div class="inner-narrow">
  <div class="k">Year-end buyer FAQs</div>
  <h2>What people <em>ask</em>.</h2>
  <div class="faq-grid">
   <div class="faq"><h3>Why are Austin builders more willing to negotiate at year end?</h3><p>Production builders report quarterly to parent companies on closings and revenue. Q4 numbers get the most scrutiny because they shape the annual report. A home that sits unsold into November costs the builder every month in carrying charges. Incentive stacks run higher in Q4 than any other quarter.</p></div>
   <div class="faq"><h3>How much can I save on an Austin new construction home before Dec 31?</h3><p>On standing-inventory homes (60+ days unsold), typical Q4 Austin builder stacks run $25,000 to $50,000 in combined incentives. On homes sitting 120+ days the stack can go higher, sometimes $60,000 or more. The mix varies by builder and by specific home.</p></div>
   <div class="faq"><h3>What is standing inventory in Austin new construction?</h3><p>Move-in-ready new builds that have not yet sold. Also called quick-move-in or spec homes. These are where year-end incentive stacks live because the builder is paying carrying costs every month the home sits.</p></div>
   <div class="faq"><h3>Can I close an Austin new construction home by December 31?</h3><p>On standing inventory, yes. Standing-inventory new builds are move-in ready. Lender timeline is typically 21 to 30 days from executed contract. Starting the process by early December is realistic for a Dec 31 close.</p></div>
   <div class="faq"><h3>Which Austin builders offer the best year-end incentives?</h3><p>DR Horton, Lennar, and PulteGroup run the most aggressive year-end stacks because of their scale. Taylor Morrison, David Weekley, Highland, Perry, and Meritage run targeted incentives on specific communities. Luke tracks current postures across all eight.</p></div>
   <div class="faq"><h3>Do I pay Luke Allen for year-end buyer representation?</h3><p>No. Austin builders allocate a 2.5-3% buyer-agent commission from their marketing budget, separate from the sale price. The commission is baked in whether the buyer uses representation or not. Walking in unrepresented returns that commission to the builder.</p></div>
   <div class="faq"><h3>How do I lock in a year-end new construction deal in Austin?</h3><p>Call Luke at (254) 718-2567 or submit the form below. First conversation covers target area, budget, timeline, and builder preference. Luke sends back a shortlist of standing-inventory homes with the current year-end incentive posture for each.</p></div>
  </div>
 </div>
</section>

<section class="quick-contact" id="contact">
 <div class="qc-inner">
  <div class="qc-pitch">
   <div class="k" style="color:var(--gold-lt);">Lock in before Dec 31</div>
   <h2>Ready to run a <em>year-end</em> negotiation?</h2>
   <p>Short intake, fast reply. Luke sends back a curated shortlist of standing-inventory homes with current incentive postures, same business day.</p>
   <p style="font-size:13.5px;color:rgba(255,255,255,.65);">You pick the home, Luke runs the negotiation, builder pays the commission.</p>
  </div>
  <form class="qc-form" id="ye-form" novalidate>
   <h3>Tell Luke what you want</h3>
   <p class="sub">Reply within 1 business hour.</p>
   <input type="text" name="name" placeholder="Your name" autocomplete="name" required />
   <input type="tel" name="phone" placeholder="(512) 555-1234" autocomplete="tel" required />
   <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required />
   <select name="budget">
    <option value="">Budget range</option>
    <option>Under $400K</option>
    <option>$400K-$600K</option>
    <option>$600K-$850K</option>
    <option>$850K-$1.2M</option>
    <option>Over $1.2M</option>
   </select>
   <textarea name="notes" placeholder="Target area, preferred builder, close-by-year-end timeline?"></textarea>
   <input type="hidden" name="source" value="year-end-new-construction-austin" />
   <button type="submit" id="ye-btn">Send to Luke</button>
   <div class="form-msg" id="ye-msg"></div>
  </form>
 </div>
</section>

<script src="/js/footer.js"></script>
<script>
// Countdown to midnight Dec 31 Central Time
(function () {
 const target = new Date(Date.UTC(2026, 11, 31, 6, 0, 0)); // Jan 1 midnight CST = Dec 31 06:00 UTC
 function tick() {
  const now = new Date();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const d = document.getElementById('cd-days');
  const h = document.getElementById('cd-hours');
  const m = document.getElementById('cd-mins');
  if (d) d.textContent = String(days).padStart(2,'0');
  if (h) h.textContent = String(hours).padStart(2,'0');
  if (m) m.textContent = String(mins).padStart(2,'0');
 }
 tick();
 setInterval(tick, 30000);
})();
// Lead form
(function () {
 const f = document.getElementById('ye-form');
 if (!f) return;
 const msg = document.getElementById('ye-msg');
 const btn = document.getElementById('ye-btn');
 f.addEventListener('submit', async function (e) {
  e.preventDefault();
  msg.className = 'form-msg';
  const d = Object.fromEntries(new FormData(f));
  if (!d.name || !d.email || !d.phone) { msg.className = 'form-msg err'; msg.textContent = 'Name, phone, and email are required.'; return; }
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
   const payload = Object.assign({}, d, { message: 'YEAR-END NEW CONSTRUCTION INQUIRY\\n\\nBudget: ' + (d.budget || 'not specified') + '\\n\\nNotes:\\n' + (d.notes || '(none)') });
   const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
   if (r.ok) { msg.className = 'form-msg ok'; msg.textContent = 'Sent. Luke will reply within 1 business hour.'; f.reset(); }
   else { msg.className = 'form-msg err'; msg.textContent = 'Failed. Email Luke@austinmdg.com or call (254) 718-2567.'; }
  } catch (e) { msg.className = 'form-msg err'; msg.textContent = 'Network error. Email Luke@austinmdg.com.'; }
  finally { btn.disabled = false; btn.textContent = 'Send to Luke'; }
 });
})();
</script>
</body>
</html>`;
}

module.exports = { renderPage };
