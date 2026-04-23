// SSR template for individual $1M+ listing pages
// Slug format: {address-kebab}--{listingKey}  (double-dash before key for reliable parsing)

// ── Major employer proximity by city ────────────────────────────────────────
const EMPLOYERS = {
  'Austin': [
    { name: 'Tesla Gigafactory', dist: '15–25 min E' },
    { name: 'Apple Campus (Domain)', dist: '20–30 min N' },
    { name: 'Google / Meta / Indeed', dist: '10–15 min downtown' },
    { name: 'Dell Medical School / UT Austin', dist: '10–20 min' },
    { name: 'Samsung Austin Semiconductor', dist: '25 min N' },
  ],
  'Round Rock': [
    { name: 'Dell Technologies HQ', dist: '5 min' },
    { name: 'Apple Campus (Domain)', dist: '15 min S' },
    { name: 'Samsung Austin Semiconductor', dist: '20 min SW' },
    { name: 'Tesla Gigafactory', dist: '35 min S' },
  ],
  'Cedar Park': [
    { name: 'Apple Campus (Domain)', dist: '20 min SE' },
    { name: 'Dell Technologies HQ', dist: '15 min E' },
    { name: 'Samsung Austin Semiconductor', dist: '25 min SE' },
    { name: 'Tesla Gigafactory', dist: '40 min SE' },
  ],
  'Leander': [
    { name: 'Apple Campus (Domain)', dist: '25 min SE' },
    { name: 'Dell Technologies HQ', dist: '20 min SE' },
    { name: 'Samsung Austin Semiconductor', dist: '30 min SE' },
  ],
  'Georgetown': [
    { name: 'Dell Technologies HQ', dist: '20 min S' },
    { name: 'Apple Campus (Domain)', dist: '30 min S' },
    { name: 'Williamson County jobs hub', dist: '5–10 min' },
  ],
  'Pflugerville': [
    { name: 'Samsung Austin Semiconductor', dist: '10 min W' },
    { name: 'Tesla Gigafactory', dist: '20 min SW' },
    { name: 'Apple Campus (Domain)', dist: '25 min W' },
    { name: 'Dell Technologies HQ', dist: '20 min N' },
  ],
  'Manor': [
    { name: 'Tesla Gigafactory', dist: '15 min W' },
    { name: 'Samsung Austin Semiconductor', dist: '20 min NW' },
    { name: 'Austin-Bergstrom Airport', dist: '20 min SW' },
  ],
  'Kyle': [
    { name: 'Hays County job center', dist: '5–10 min' },
    { name: 'Tesla Gigafactory', dist: '30 min N' },
    { name: 'Downtown Austin', dist: '35 min N' },
  ],
  'Buda': [
    { name: 'Tesla Gigafactory', dist: '25 min N' },
    { name: 'Downtown Austin', dist: '30 min N' },
    { name: 'Hays County job center', dist: '10 min N' },
  ],
  'Lakeway': [
    { name: 'Apple Campus (Domain)', dist: '30 min E' },
    { name: 'Downtown Austin', dist: '30 min E via 71' },
    { name: 'Westlake corridor', dist: '15 min E' },
  ],
  'Dripping Springs': [
    { name: 'Westlake corridor', dist: '25 min NE' },
    { name: 'Downtown Austin', dist: '40 min E' },
    { name: 'Tesla Gigafactory', dist: '50 min NE' },
  ],
  'Westlake Hills': [
    { name: 'Downtown Austin', dist: '10 min E' },
    { name: 'Apple Campus (Domain)', dist: '20 min N' },
    { name: 'UT Austin', dist: '15 min E' },
  ],
};

// ── Neighborhood slug map — for pulling editorial context ────────────────────
// Maps MLS search terms → neighborhood slugs (from data/neighborhoods.js)
const NBHD_KEYWORDS = {
  'tarrytown': 'tarrytown', 'hyde park': 'hyde-park', 'mueller': 'mueller',
  'clarksville': 'clarksville', 'bouldin': 'bouldin-creek', 'travis heights': 'travis-heights',
  'south congress': 'south-congress', 'barton hills': 'barton-hills',
  'zilker': 'zilker', 'west campus': 'west-campus', 'rosedale': 'rosedale',
  'crestview': 'crestview', 'allandale': 'allandale', 'cherrywood': 'cherrywood',
  'east cesar chavez': 'east-cesar-chavez', 'holly': 'holly',
  'north loop': 'north-loop', 'rundberg': 'rundberg', 'st johns': 'st-johns',
  'hudson bend': 'hudson-bend',
  'barton creek': 'barton-creek', 'steiner ranch': 'steiner-ranch',
  'circle c': 'circle-c', 'slaughter': 'circle-c',
  'westlake': 'westlake-hills', 'rob roy': 'rob-roy',
};

function findNeighborhood(listing, neighborhoods) {
  if (!neighborhoods) return null;
  const haystack = [
    listing.subdivision_name || '',
    listing.city || '',
    listing.unparsed_address || '',
  ].join(' ').toLowerCase();

  for (const [keyword, slug] of Object.entries(NBHD_KEYWORDS)) {
    if (haystack.includes(keyword)) {
      return neighborhoods[slug] || null;
    }
  }
  return null;
}

// ── Utility ─────────────────────────────────────────────────────────────────
function slugifyAddress(addr) {
  if (!addr) return 'austin-tx';
  return addr.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-');
}

function buildSlug(listing) {
  return `${slugifyAddress(listing.unparsed_address)}--${listing.listing_key}`;
}

function parseListingKey(slug) {
  const idx = slug.lastIndexOf('--');
  return idx === -1 ? slug : slug.slice(idx + 2);
}

function fmt(n)      { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-US'); }
function fmtPrice(n) { if (!n) return '—'; return '$' + Number(n).toLocaleString('en-US'); }
function fmtDate(s)  { if (!s) return null; try { return new Date(s).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }); } catch { return s; } }
function pct(a, b, decimals = 1) { return b ? (a / b * 100).toFixed(decimals) + '%' : '—'; }

// ── Investment math ─────────────────────────────────────────────────────────
function calcInvestment(price) {
  if (!price || price < 50000) return null;
  const estMonthlyRent = Math.round(price * 0.0048);          // 0.48% rule — conservative Austin
  const annualRent     = estMonthlyRent * 12;
  const grossYield     = (annualRent / price * 100).toFixed(2);
  const vacancyExp     = Math.round(annualRent * 0.40);       // 40% expenses + vacancy
  const noi            = annualRent - vacancyExp;
  const capRate        = (noi / price * 100).toFixed(2);
  // Mortgage: 20% down, 7.25% 30yr fixed
  const downPct        = 0.20;
  const rate           = 0.0725 / 12;
  const loan           = price * (1 - downPct);
  const n              = 360;
  const monthlyMortgage = Math.round(loan * (rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1));
  const propTax        = Math.round(price * 0.021 / 12);      // ~2.1% TX property tax
  const insurance      = Math.round(price * 0.005 / 12);      // ~0.5% homeowner's
  const totalPITI      = monthlyMortgage + propTax + insurance;
  const monthlyCashFlow = estMonthlyRent - totalPITI;
  return {
    estMonthlyRent, annualRent, grossYield, capRate,
    downPayment: Math.round(price * downPct),
    monthlyMortgage, propTax, insurance, totalPITI, monthlyCashFlow
  };
}

// ── DB enrichment — called from server.js before rendering ──────────────────
function enrichListing(listing, db, neighborhoods) {
  const city = listing.city || 'Austin';
  const beds = listing.bedrooms_total || 0;

  // 1. City market stats ($/sqft, active count, median price)
  let market = null;
  try {
    const row = db.prepare(`
      SELECT
        ROUND(AVG(list_price / NULLIF(living_area, 0))) AS avg_ppsf,
        ROUND(AVG(list_price))                          AS avg_price,
        COUNT(*)                                         AS active_count
      FROM listings
      WHERE city = ?
        AND standard_status = 'Active'
        AND living_area > 500
        AND list_price > 100000
        AND property_type NOT LIKE '%Lease%'
    `).get(city);
    if (row && row.avg_ppsf) market = row;
  } catch {}

  // 2. Similar listings — same city, ±1 bed, similar price + sqft, NOT leases
  //    ACTRIS IDX feed doesn't expose close_price for residential sales, so we show
  //    similar ACTIVE listings currently on the market instead of sold comps.
  //    This gives buyers real price context even without closed-sale data.
  //    Filters:
  //    - NOT leases, land, farm, commercial  (critical — was showing leases as comps)
  //    - list_price within ±35% of subject
  //    - living_area within ±35% of subject
  //    - NOT the subject listing itself
  let comps = [];
  let compsLabel = 'Similar Active Listings';
  try {
    const subjectPrice = listing.list_price || 0;
    const subjectSqft = listing.living_area || 0;
    const minPrice = subjectPrice ? Math.round(subjectPrice * 0.65) : 10000;
    const maxPrice = subjectPrice ? Math.round(subjectPrice * 1.35) : 999999999;
    const minSqft = subjectSqft ? Math.round(subjectSqft * 0.65) : 500;
    const maxSqft = subjectSqft ? Math.round(subjectSqft * 1.35) : 99999;

    comps = db.prepare(`
      SELECT unparsed_address, list_price AS close_price, list_price, bedrooms_total,
             bathrooms_total, living_area, listing_contract_date AS close_date,
             days_on_market, subdivision_name, listing_key
      FROM listings
      WHERE city = ?
        AND mlg_can_view = 1
        AND standard_status = 'Active'
        AND list_price BETWEEN ? AND ?
        AND living_area BETWEEN ? AND ?
        AND bedrooms_total BETWEEN ? AND ?
        AND property_type NOT LIKE '%Lease%'
        AND property_type NOT LIKE '%Land%'
        AND property_type NOT LIKE '%Farm%'
        AND property_type NOT LIKE '%Commercial%'
        AND listing_key != ?
      ORDER BY ABS(list_price - ?) ASC
      LIMIT 5
    `).all(city, minPrice, maxPrice, minSqft, maxSqft,
           Math.max(0, beds - 1), beds + 1,
           listing.listing_key, subjectPrice);
  } catch (e) { console.warn('[comps]', e.message); }

  // 3. Neighborhood editorial match
  const neighborhood = findNeighborhood(listing, neighborhoods);

  // 4. Employer proximity
  const employers = EMPLOYERS[city] || EMPLOYERS['Austin'];

  // 5. Investment snapshot
  const investment = listing.list_price ? calcInvestment(listing.list_price) : null;

  return { listing, market, comps, neighborhood, employers, investment };
}

// ── HTML renderer ────────────────────────────────────────────────────────────
function renderListingPage(listing, { market, comps, neighborhood, employers, investment } = {}) {
  const slug     = buildSlug(listing);
  const url      = `https://austintxhomes.co/homes/${slug}`;
  const photos   = (() => { try { return JSON.parse(listing.photos || '[]'); } catch { return []; } })();
  const photoUrls = photos.map((_, i) => `/api/properties/photos/${listing.listing_key}/${i}`);
  const heroPhoto = photoUrls[0] || '';
  const city     = listing.city || 'Austin';
  const zip      = listing.postal_code || '';
  const addr     = listing.unparsed_address || `${city}, TX`;
  const stdStatus = (listing.standard_status || '').toLowerCase();
  const isSold   = stdStatus === 'closed';
  const isPending = stdStatus === 'pending';
  const isActive = stdStatus === 'active';

  const statusLabel = isSold ? 'Sold' : isPending ? 'Under Contract' : 'Active Listing';
  const statusCls   = isSold ? 'status-sold' : isPending ? 'status-pending' : 'status-active';
  const price = isSold && listing.close_price ? listing.close_price : listing.list_price;
  const ppsf  = listing.living_area > 0 ? Math.round(price / listing.living_area) : null;
  const acres = listing.lot_size_acres ? listing.lot_size_acres.toFixed(2) : null;

  // Price-vs-market insight
  let priceInsight = '';
  if (market && market.avg_ppsf && ppsf) {
    const diff = ppsf - market.avg_ppsf;
    const diffPct = Math.abs(Math.round(diff / market.avg_ppsf * 100));
    if (diff < -5) {
      priceInsight = `At ${fmtPrice(ppsf)}/sqft, this home is <strong>${diffPct}% below</strong> the ${city} active market average of ${fmtPrice(market.avg_ppsf)}/sqft — potentially representing value relative to comparable properties currently on the market.`;
    } else if (diff > 5) {
      priceInsight = `At ${fmtPrice(ppsf)}/sqft, this home is priced <strong>${diffPct}% above</strong> the ${city} active market average of ${fmtPrice(market.avg_ppsf)}/sqft, reflecting premium positioning — typically tied to finishes, lot, location, or view.`;
    } else {
      priceInsight = `At ${fmtPrice(ppsf)}/sqft, this home is priced <strong>in line with the ${city} market average</strong> of ${fmtPrice(market.avg_ppsf)}/sqft across ${fmt(market.active_count)} active listings.`;
    }
  }

  const title    = `${addr} | ${fmtPrice(price)} | Luke Allen Austin`;
  const metaDesc = `${addr} — ${fmtPrice(price)}, ${listing.bedrooms_total||0}bd/${listing.bathrooms_total||0}ba, ${fmt(listing.living_area)} sqft${listing.subdivision_name ? ', ' + listing.subdivision_name : ''}. ${isSold ? 'Sold.' : 'Active listing in'} ${city}, TX. Contact Luke Allen · TREC #788149.`;

  const schemaType = (listing.property_sub_type||'').toLowerCase().includes('condo') ? 'Apartment' :
                     (listing.property_sub_type||'').toLowerCase().includes('townhouse') ? 'Townhouse' : 'SingleFamilyResidence';

  const residenceSchema = {
    '@context': 'https://schema.org', '@type': schemaType, name: addr, url,
    address: { '@type': 'PostalAddress', streetAddress: addr, addressLocality: city, addressRegion: 'TX', postalCode: zip, addressCountry: 'US' },
    numberOfRooms: listing.bedrooms_total, numberOfBathroomsTotal: listing.bathrooms_total,
    ...(listing.living_area ? { floorSize: { '@type': 'QuantitativeValue', value: listing.living_area, unitCode: 'FTK' } } : {}),
    ...(listing.year_built ? { yearBuilt: listing.year_built } : {}),
    ...(photoUrls.length ? { image: photoUrls.slice(0, 6) } : {}),
    ...(listing.latitude && listing.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: listing.latitude, longitude: listing.longitude } } : {}),
    offers: { '@type': 'Offer', price, priceCurrency: 'USD', availability: isActive ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut' }
  };
  const agentSchema = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent',
    name: 'Luke Allen – Austin TX Homes', url: 'https://austintxhomes.co',
    telephone: '+12547182567', email: 'Luke@austinmdg.com',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '15', bestRating: '5', worstRating: '1' },
    sameAs: ['https://share.google/hETte82InqUPvWeNC','https://www.linkedin.com/in/lukeallentx/','https://www.instagram.com/lukeallenrealty/','https://www.tiktok.com/@austintxapartments']
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://austintxhomes.co/' },
      { '@type': 'ListItem', position: 2, name: 'Austin Luxury Homes', item: 'https://austintxhomes.co/luxury-homes' },
      { '@type': 'ListItem', position: 3, name: addr, item: url }
    ]
  };

  const galleryPhotos = photoUrls.slice(0, 12).map((src, i) => `
    <div class="gallery-thumb${i===0?' gallery-main':''}" onclick="openPhoto(${i})">
      <img src="${src}" alt="${addr} — photo ${i+1}" loading="${i<3?'eager':'lazy'}" />
    </div>`).join('');

  const detailRows = [
    ['Price', fmtPrice(price)], ['Status', statusLabel],
    ['Beds', listing.bedrooms_total||'—'], ['Full Baths', listing.bathrooms_full||'—'],
    ['Half Baths', listing.bathrooms_half||'—'],
    ['Living Area', listing.living_area ? fmt(listing.living_area)+' sqft' : '—'],
    ['Lot Size', acres ? `${acres} acres${listing.lot_size_sqft?' ('+fmt(listing.lot_size_sqft)+' sqft)':''}` : '—'],
    ['Year Built', listing.year_built||'—'], ['Garage', listing.garage_spaces ? listing.garage_spaces+' spaces' : '—'],
    ['Stories', listing.stories||'—'],
    ['Type', [listing.property_type, listing.property_sub_type].filter(Boolean).join(' · ')||'—'],
    ['Subdivision', listing.subdivision_name||'—'], ['County', listing.county||'—'],
    ['Zip Code', zip||'—'], ['$/sqft', ppsf ? fmtPrice(ppsf)+'/sqft' : '—'],
    ['Days on Market', listing.days_on_market!=null ? listing.days_on_market+' days' : '—'],
    ['HOA', listing.association_fee ? `${fmtPrice(listing.association_fee)}/${listing.association_fee_frequency||'mo'}` : 'None / verify with agent'],
    ['Annual Tax Est.', listing.tax_annual_amount ? fmtPrice(listing.tax_annual_amount) : '—'],
    ['Pool', listing.pool_features && listing.pool_features!=='[]' && listing.pool_features!=='null' ? 'Yes' : '—'],
    ['Waterfront', listing.waterfront_yn ? 'Yes' : '—'],
    ['New Construction', listing.new_construction_yn ? 'Yes' : '—'],
    ['MLS #', listing.listing_key||'—'], ['List Date', fmtDate(listing.listing_contract_date)||'—'],
    ...(isSold ? [['Close Date', fmtDate(listing.close_date)||'—'],['Close Price', fmtPrice(listing.close_price)||'—']] : []),
    ['Elementary School', listing.elementary_school||'—'],
    ['Middle School', listing.middle_school||'—'],
    ['High School', listing.high_school||'—'],
    ['School District', listing.school_district||'—'],
  ];

  const detailTable = detailRows.map(([k,v]) => `
    <div class="detail-row">
      <span class="detail-label">${k}</span>
      <span class="detail-value">${v}</span>
    </div>`).join('');

  // Comps table
  const compsHTML = comps.length ? `
  <section class="insight-section">
    <p class="section-label">Similar Homes on the Market in ${city}</p>
    <h2 class="section-title">Comparable Listings Right Now</h2>
    <p style="font-size:.88rem;color:var(--mid);margin:0 0 1.25rem;">Homes currently for sale in ${city} with similar bedroom count, size, and price range — giving you real-time context for how this property's asking price compares to the active market.</p>
    <div class="comps-table">
      <div class="comp-header">
        <span>Address</span><span>List Price</span><span>$/sqft</span><span>Beds/Baths</span><span>Sqft</span><span>DOM</span><span>Listed</span>
      </div>
      ${comps.map(c => {
        const cppsf = c.living_area > 0 ? Math.round(c.list_price / c.living_area) : null;
        return `<div class="comp-row">
          <span class="comp-addr">${c.listing_key ? `<a href="/homes/${buildSlug(c)}" style="color:inherit;text-decoration:none;">` : ''}${c.unparsed_address || '—'}${c.listing_key ? '</a>' : ''}${c.subdivision_name ? '<br><small>'+c.subdivision_name+'</small>' : ''}</span>
          <span>${fmtPrice(c.list_price)}</span>
          <span>${cppsf ? fmtPrice(cppsf) : '—'}</span>
          <span>${c.bedrooms_total||'—'} bd / ${c.bathrooms_total||'—'} ba</span>
          <span>${c.living_area ? fmt(c.living_area)+' sqft' : '—'}</span>
          <span>${c.days_on_market!=null ? c.days_on_market+'d' : '—'}</span>
          <span>${c.close_date ? c.close_date.slice(0,10) : '—'}</span>
        </div>`;
      }).join('')}
    </div>
    <p style="font-size:.75rem;color:var(--light);margin-top:.75rem;">Source: ACTRIS MLS, live listings. Similar by ±1 bed, ±35% price, ±35% sqft. Contact Luke for a formal comparative market analysis.</p>
  </section>` : '';

  // Investment section
  const investHTML = investment && !isSold ? `
  <section class="insight-section invest-section">
    <p class="section-label">Investment Analysis</p>
    <h2 class="section-title">Rental Income Potential</h2>
    <p style="font-size:.88rem;color:rgba(255,255,255,.65);margin:0 0 1.5rem;line-height:1.7;">The numbers below use conservative Austin-market assumptions. They are estimates — not a guarantee. Actual rents vary by condition, timing, and management. <a href="/rental-properties-for-sale-austin" style="color:var(--gold);">Read our full Austin rental property guide →</a></p>
    <div class="invest-grid">
      <div class="invest-card">
        <div class="invest-label">Est. Monthly Rent</div>
        <div class="invest-num">${fmtPrice(investment.estMonthlyRent)}/mo</div>
        <div class="invest-sub">0.48% rule · conservative Austin est.</div>
      </div>
      <div class="invest-card">
        <div class="invest-label">Gross Yield</div>
        <div class="invest-num">${investment.grossYield}%</div>
        <div class="invest-sub">Annual rent ÷ purchase price</div>
      </div>
      <div class="invest-card">
        <div class="invest-label">Cap Rate (est.)</div>
        <div class="invest-num">${investment.capRate}%</div>
        <div class="invest-sub">NOI after 40% vacancy + expenses</div>
      </div>
      <div class="invest-card">
        <div class="invest-label">Down Payment</div>
        <div class="invest-num">${fmtPrice(investment.downPayment)}</div>
        <div class="invest-sub">20% conventional investment loan</div>
      </div>
    </div>
    <div class="invest-breakdown">
      <p style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin:0 0 1rem;font-weight:600;">Monthly Cash Flow Breakdown (20% down · 7.25% rate)</p>
      <div class="cf-rows">
        <div class="cf-row cf-income"><span>Estimated Gross Rent</span><span>+${fmtPrice(investment.estMonthlyRent)}</span></div>
        <div class="cf-row"><span>Principal + Interest</span><span>−${fmtPrice(investment.monthlyMortgage)}</span></div>
        <div class="cf-row"><span>Property Tax (~2.1% TX avg)</span><span>−${fmtPrice(investment.propTax)}</span></div>
        <div class="cf-row"><span>Insurance (~0.5%)</span><span>−${fmtPrice(investment.insurance)}</span></div>
        <div class="cf-row cf-total ${investment.monthlyCashFlow >= 0 ? 'cf-pos' : 'cf-neg'}">
          <span>Est. Monthly Cash Flow</span>
          <span>${investment.monthlyCashFlow >= 0 ? '+' : ''}${fmtPrice(investment.monthlyCashFlow)}</span>
        </div>
      </div>
      ${investment.monthlyCashFlow < 0 ? `<p style="font-size:.8rem;color:rgba(255,255,255,.5);margin:.75rem 0 0;line-height:1.6;">At current rates and prices, many Austin luxury properties run neutral or slightly negative on pure cash flow — <strong style="color:rgba(255,255,255,.75);">appreciation and equity paydown are the primary return drivers</strong>. BRRRR and off-market acquisitions can improve day-one cash flow. <a href="/brrrr-method-austin" style="color:var(--gold);">Learn about the BRRRR method in Austin →</a></p>` : ''}
    </div>
  </section>` : '';

  // Neighborhood context
  const nbhdHTML = neighborhood ? `
  <section class="insight-section" style="background:var(--warm);color:var(--text);">
    <p class="section-label" style="color:var(--gold);">Neighborhood Context</p>
    <h2 class="section-title" style="color:var(--text);">About ${neighborhood.name}</h2>
    ${(neighborhood.intro||[]).slice(0,2).map(p => `<p style="font-size:.92rem;color:var(--mid);line-height:1.75;">${p}</p>`).join('')}
    ${neighborhood.highlights && neighborhood.highlights.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-top:1.25rem;">
      ${neighborhood.highlights.slice(0,4).map(h => `
      <div style="padding:1rem;background:var(--cream);border-radius:var(--r);border:1px solid var(--border);">
        <div style="font-size:1.2rem;margin-bottom:.4rem;">${h.icon}</div>
        <strong style="font-size:.82rem;color:var(--text);">${h.label}</strong>
        <p style="font-size:.78rem;color:var(--mid);margin:.3rem 0 0;line-height:1.5;">${h.text}</p>
      </div>`).join('')}
    </div>` : ''}
    <div style="margin-top:1.25rem;">
      <a href="/neighborhoods/${neighborhood.slug}" style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:600;">Full ${neighborhood.name} Guide →</a>
    </div>
  </section>` : '';

  // Employers section
  const employersHTML = employers && employers.length ? `
  <section class="insight-section" style="background:var(--warm);color:var(--text);">
    <p class="section-label" style="color:var(--gold);">Commute & Employment</p>
    <h2 class="section-title" style="color:var(--text);">Major Employers Near ${city}, TX</h2>
    <p style="font-size:.88rem;color:var(--mid);margin:0 0 1.25rem;">${city} sits within commuting range of Austin's major tech, manufacturing, and corporate campuses. Approximate drive times from this area:</p>
    <div class="employer-grid">
      ${employers.map(e => `
      <div class="employer-card">
        <svg width="16" height="16" fill="none" stroke="var(--gold)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <div>
          <strong style="font-size:.85rem;color:var(--text);">${e.name}</strong>
          <span style="font-size:.78rem;color:var(--mid);display:block;">${e.dist}</span>
        </div>
      </div>`).join('')}
    </div>
  </section>` : '';

  // Price insight callout
  const priceInsightHTML = priceInsight ? `
  <div class="price-insight">
    <svg width="16" height="16" fill="none" stroke="var(--gold)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
    <p>${priceInsight} <a href="/market-report" style="color:var(--gold);">View Austin market report →</a></p>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${metaDesc.replace(/"/g,'&quot;').slice(0,160)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/favicon-96.png" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title.replace(/"/g,'&quot;')}" />
  <meta property="og:description" content="${metaDesc.replace(/"/g,'&quot;').slice(0,200)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${heroPhoto||'https://austintxhomes.co/images/luke-allen.jpg'}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="${city}, Texas" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(residenceSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(agentSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --gold:#b8935a;--gold-lt:#cda96f;--gold-pale:#f5ede0;
      --ink:#0f0f0e;--text:#1a1918;--mid:#5c5b57;
      --light:#999690;--bg:#ffffff;--warm:#faf8f4;
      --cream:#f1ece3;--border:#e5dfd4;--r:4px;--w:1180px;
    }
    *,*::before,*::after{box-sizing:border-box;}
    body{margin:0;font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);}
    a{color:var(--gold);text-decoration:none;}a:hover{color:var(--gold-lt);}

    /* sold banner */
    .sold-banner{background:#1a1a1a;color:#ccc;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;padding:10px 2rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;margin-top:80px;}
    .sold-banner span:first-child{color:var(--gold);font-weight:600;}

    /* hero */
    .hero{position:relative;background:var(--ink);${!isSold?'margin-top:80px;':''}min-height:460px;display:flex;align-items:flex-end;overflow:hidden;}
    ${heroPhoto?`.hero-bg{position:absolute;inset:0;background:url('${heroPhoto}') center/cover no-repeat;filter:brightness(.5);}`:'.hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(184,147,90,.18) 0%,transparent 70%);}'}
    .hero-content{position:relative;z-index:2;padding:3rem 2rem 2.5rem;max-width:var(--w);margin:0 auto;width:100%;}
    .status-badge{display:inline-block;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;padding:4px 12px;border-radius:2px;margin-bottom:.9rem;font-weight:600;}
    .status-active{background:#1d7a4a;color:#fff;}.status-pending{background:#b8935a;color:#fff;}.status-sold{background:#555;color:#fff;}
    .hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:600;color:#fff;margin:0 0 .6rem;line-height:1.1;}
    .hero-price{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;color:var(--gold);margin-bottom:.9rem;}
    .hero-pills{display:flex;flex-wrap:wrap;gap:.5rem;}
    .pill{background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);font-size:.73rem;letter-spacing:.05em;padding:4px 12px;border-radius:20px;border:1px solid rgba(255,255,255,.2);}

    /* gallery */
    .gallery{max-width:var(--w);margin:2rem auto 0;padding:0 2rem;}
    .gallery-grid{display:grid;gap:6px;grid-template-columns:repeat(4,1fr);}
    .gallery-main{grid-column:1/3;grid-row:1/3;}
    .gallery-thumb{overflow:hidden;cursor:pointer;border-radius:var(--r);background:#111;}
    .gallery-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .3s;display:block;}
    .gallery-thumb:hover img{transform:scale(1.04);}
    .gallery-main img{min-height:340px;}.gallery-thumb:not(.gallery-main) img{height:165px;}

    /* layout */
    .listing-body{max-width:var(--w);margin:2.5rem auto;padding:0 2rem;display:grid;grid-template-columns:1fr 340px;gap:3rem;align-items:start;}
    @media(max-width:900px){.listing-body{grid-template-columns:1fr;}}

    .section-label{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:.65rem;}
    .section-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:600;color:var(--text);margin:0 0 1.1rem;}

    /* price insight */
    .price-insight{display:flex;gap:.75rem;align-items:flex-start;background:var(--warm);border-left:3px solid var(--gold);padding:1rem 1.25rem;border-radius:0 var(--r) var(--r) 0;margin:1.5rem 0;}
    .price-insight svg{flex-shrink:0;margin-top:2px;}
    .price-insight p{margin:0;font-size:.87rem;color:var(--mid);line-height:1.65;}

    /* detail table */
    .details-grid{margin:2.5rem 0;}
    .details-grid h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:600;margin:0 0 1rem;}
    .detail-row{display:flex;justify-content:space-between;align-items:baseline;padding:.55rem 0;border-bottom:1px solid var(--border);gap:1rem;}
    .detail-label{font-size:.8rem;color:var(--mid);letter-spacing:.04em;flex-shrink:0;}
    .detail-value{font-size:.86rem;color:var(--text);font-weight:500;text-align:right;}

    /* insight sections */
    .insight-section{max-width:var(--w);margin:0 auto 0;padding:2.5rem 2rem;border-top:1px solid var(--border);}
    .insight-section.invest-section{background:var(--ink);color:#fff;border-top:none;}
    .insight-section.invest-section .section-title{color:#fff;}

    /* comps table */
    .comps-table{border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:.82rem;}
    .comp-header,.comp-row{display:grid;grid-template-columns:2fr 1.2fr 1fr 1.2fr 1fr .6fr 1fr;gap:0;padding:.65rem 1rem;}
    .comp-header{background:var(--cream);font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--mid);font-weight:600;}
    .comp-row{border-top:1px solid var(--border);color:var(--text);}
    .comp-row:hover{background:var(--warm);}
    .comp-addr{font-weight:500;} .comp-addr small{color:var(--mid);}
    .over-ask{color:#1d7a4a;font-size:.75rem;display:block;}
    .under-ask{color:#b44;font-size:.75rem;display:block;}
    @media(max-width:760px){.comp-header{display:none;}.comp-row{grid-template-columns:1fr 1fr;row-gap:.25rem;}}

    /* investment */
    .invest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.75rem;}
    .invest-card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:1.25rem;}
    .invest-label{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:.4rem;}
    .invest-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:700;color:var(--gold);line-height:1;}
    .invest-sub{font-size:.72rem;color:rgba(255,255,255,.4);margin-top:.3rem;}
    .invest-breakdown{background:rgba(255,255,255,.05);border-radius:8px;padding:1.25rem;}
    .cf-rows{display:flex;flex-direction:column;gap:.4rem;}
    .cf-row{display:flex;justify-content:space-between;font-size:.84rem;color:rgba(255,255,255,.65);padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,.07);}
    .cf-income{color:rgba(255,255,255,.85);}
    .cf-total{font-weight:600;border-top:1px solid rgba(255,255,255,.2);border-bottom:none;padding-top:.6rem;margin-top:.25rem;font-size:.9rem;}
    .cf-pos{color:#6fcf97;}.cf-neg{color:#f6ad7b;}

    /* employers */
    .employer-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;}
    .employer-card{display:flex;align-items:flex-start;gap:.65rem;padding:.75rem 1rem;background:var(--cream);border-radius:var(--r);border:1px solid var(--border);}
    .employer-card svg{flex-shrink:0;margin-top:2px;}

    /* sidebar */
    .sidebar{position:sticky;top:100px;}
    .contact-card{background:var(--ink);border-radius:8px;padding:1.75rem;color:#fff;}
    .contact-card h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:600;margin:0 0 .25rem;color:#fff;}
    .contact-card .agent-title{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:1rem;display:block;}
    .contact-card .agent-creds{font-size:.78rem;color:rgba(255,255,255,.55);margin-bottom:1.25rem;line-height:1.6;}
    .contact-form label{display:block;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.5);margin:.85rem 0 .3rem;}
    .contact-form input,.contact-form textarea{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:var(--r);color:#fff;font-family:inherit;font-size:.87rem;padding:.55rem .8rem;transition:border-color .2s;}
    .contact-form input:focus,.contact-form textarea:focus{outline:none;border-color:var(--gold);}
    .contact-form textarea{resize:vertical;min-height:80px;}
    .btn-gold{margin-top:1.1rem;width:100%;background:var(--gold);color:#fff;font-size:.76rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;padding:.8rem;border:none;border-radius:var(--r);cursor:pointer;transition:background .2s;font-family:inherit;}
    .btn-gold:hover{background:var(--gold-lt);}
    .form-msg{font-size:.78rem;margin-top:.65rem;padding:.55rem;border-radius:var(--r);display:none;}
    .form-msg.ok{background:rgba(29,122,74,.25);color:#6fcf97;display:block;}
    .form-msg.err{background:rgba(184,0,0,.2);color:#f87171;display:block;}
    .contact-quick{display:flex;flex-direction:column;gap:.55rem;margin:1.25rem 0 0;}
    .contact-quick a{display:flex;align-items:center;gap:.55rem;font-size:.78rem;color:rgba(255,255,255,.65);transition:color .2s;}
    .contact-quick a:hover{color:var(--gold);}

    /* similar */
    .similar{max-width:var(--w);margin:0 auto;padding:2.5rem 2rem;}
    .similar h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:600;margin:0 0 1.5rem;}
    .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:1.5rem;}
    .card{background:var(--warm);border-radius:8px;overflow:hidden;border:1px solid var(--border);transition:box-shadow .2s,transform .2s;}
    .card:hover{box-shadow:0 8px 28px rgba(0,0,0,.1);transform:translateY(-2px);}
    .card-img{height:175px;background:#ddd;overflow:hidden;}
    .card-img img{width:100%;height:100%;object-fit:cover;}
    .card-body{padding:.9rem;}
    .card-price{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:700;color:var(--text);}
    .card-addr{font-size:.8rem;color:var(--mid);margin:.2rem 0 .45rem;}
    .card-pills{display:flex;gap:.35rem;flex-wrap:wrap;}
    .card-pill{font-size:.7rem;color:var(--mid);background:var(--cream);padding:3px 7px;border-radius:3px;}
    .card a{color:inherit;}

    /* footer related */
    .related{background:var(--warm);padding:2.5rem 2rem;border-top:1px solid var(--border);}
    .related-inner{max-width:var(--w);margin:0 auto;}
    .related h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:600;margin:0 0 1rem;}
    .related-links{display:flex;flex-wrap:wrap;gap:.65rem;}
    .related-links a{font-size:.8rem;color:var(--mid);border:1px solid var(--border);padding:.45rem .9rem;border-radius:var(--r);transition:all .2s;}
    .related-links a:hover{color:var(--gold);border-color:var(--gold);}

    /* lightbox */
    #lightbox{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);align-items:center;justify-content:center;}
    #lightbox.open{display:flex;}
    #lightbox img{max-width:92vw;max-height:90vh;object-fit:contain;border-radius:4px;}
    #lb-close{position:absolute;top:1.5rem;right:2rem;color:#fff;font-size:2rem;cursor:pointer;}
    #lb-prev,#lb-next{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:2.5rem;cursor:pointer;padding:0 1.5rem;user-select:none;}
    #lb-prev{left:0;}#lb-next{right:0;}

    @media(max-width:640px){
      .gallery-grid{grid-template-columns:1fr 1fr;}
      .gallery-main{grid-column:1/3;}
      .gallery-thumb:not(.gallery-main) img{height:120px;}
      .listing-body,.similar,.gallery,.insight-section{padding-left:1rem;padding-right:1rem;}
      .invest-grid{grid-template-columns:1fr 1fr;}
      .employer-grid{grid-template-columns:1fr;}
    }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

${isSold ? `<div class="sold-banner">
  <span>SOLD${listing.close_date ? ' · ' + fmtDate(listing.close_date) : ''}</span>
  ${listing.close_price ? `<span>Final: ${fmtPrice(listing.close_price)}</span>` : ''}
  <span>Page preserved as a market reference for ${city}, TX.</span>
</div>` : '<div style="margin-top:80px"></div>'}

<!-- Hero -->
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-content">
    <div class="status-badge ${statusCls}">${statusLabel}</div>
    <h1>${addr}</h1>
    <div class="hero-price">${fmtPrice(price)}</div>
    <div class="hero-pills">
      ${listing.bedrooms_total ? `<span class="pill">${listing.bedrooms_total} Bed</span>` : ''}
      ${listing.bathrooms_total ? `<span class="pill">${listing.bathrooms_total} Bath</span>` : ''}
      ${listing.living_area ? `<span class="pill">${fmt(listing.living_area)} sqft</span>` : ''}
      ${ppsf ? `<span class="pill">${fmtPrice(ppsf)}/sqft</span>` : ''}
      ${listing.year_built ? `<span class="pill">Built ${listing.year_built}</span>` : ''}
      ${acres ? `<span class="pill">${acres} acres</span>` : ''}
      ${listing.garage_spaces ? `<span class="pill">${listing.garage_spaces}-Car Garage</span>` : ''}
      ${listing.pool_features && listing.pool_features !== '[]' && listing.pool_features !== 'null' ? '<span class="pill">Pool</span>' : ''}
      ${listing.waterfront_yn ? '<span class="pill">Waterfront</span>' : ''}
      ${listing.new_construction_yn ? '<span class="pill">New Construction</span>' : ''}
      ${listing.subdivision_name ? `<span class="pill">${listing.subdivision_name}</span>` : ''}
    </div>
  </div>
</section>

<!-- Gallery -->
${photoUrls.length > 1 ? `<div class="gallery"><div class="gallery-grid">${galleryPhotos}</div></div>` : ''}

<!-- Body -->
<div class="listing-body">
  <div class="main-col">
    ${listing.public_remarks ? `
    <div style="margin-bottom:1.5rem;">
      <p class="section-label">About This Home</p>
      ${listing.public_remarks.split('\n').filter(Boolean).map(p => `<p style="font-size:.92rem;line-height:1.75;color:var(--mid);margin:0 0 .85rem;">${p}</p>`).join('')}
    </div>` : ''}

    ${priceInsightHTML}

    <div class="details-grid">
      <h2>Property Details</h2>
      ${detailTable}
    </div>

    ${listing.school_district ? `
    <div style="margin:1.5rem 0;padding:1.25rem;background:var(--warm);border-radius:8px;border-left:3px solid var(--gold);">
      <p class="section-label">School District</p>
      <p style="margin:0;font-size:.95rem;color:var(--text);font-weight:500;">${listing.school_district}</p>
      ${[listing.elementary_school, listing.middle_school, listing.high_school].filter(Boolean).length ?
        `<p style="margin:.4rem 0 0;font-size:.8rem;color:var(--mid);">${[listing.elementary_school, listing.middle_school, listing.high_school].filter(Boolean).join(' · ')}</p>` : ''}
    </div>` : ''}

    ${isSold ? `
    <div style="margin:1.5rem 0;padding:1.25rem;background:#1a1a1a;border-radius:8px;border-left:3px solid #555;color:#ccc;">
      <p style="margin:0 0 .4rem;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#888;">Market Reference</p>
      <p style="margin:0;font-size:.86rem;line-height:1.65;">This property has sold. This page is preserved as a historical market record for ${city}, TX. For active luxury listings, <a href="/luxury-homes" style="color:var(--gold);">browse Austin luxury homes</a> or <a href="/about#contact" style="color:var(--gold);">contact Luke Allen</a>.</p>
    </div>` : ''}

    <div style="margin:1.5rem 0;padding:1.25rem;background:var(--warm);border-radius:8px;">
      <p class="section-label">Have Questions About This Property?</p>
      <p style="margin:0 0 .65rem;font-size:.88rem;color:var(--mid);line-height:1.65;">Luke Allen (TREC #788149) has deep knowledge of ${city} and surrounding markets. Whether you're buying, selling, or just researching comparable sales — reach out for a no-pressure conversation.</p>
      <a href="/about#contact" style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:600;">Schedule a Call →</a>
    </div>
  </div>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="contact-card">
      <h3>Luke Allen</h3>
      <span class="agent-title">Austin Realtor · TREC #788149</span>
      <p class="agent-creds">Austin Marketing + Development Group<br>15 Five-Star Google Reviews · 5.0 Rating</p>
      <form class="contact-form" id="contact-form" onsubmit="submitContact(event)">
        <input type="hidden" name="listing" value="${addr.replace(/"/g,'&quot;')}" />
        <input type="hidden" name="listingKey" value="${listing.listing_key}" />
        <input type="hidden" name="listPrice" value="${price}" />
        <label for="cf-name">Your Name</label>
        <input id="cf-name" name="name" type="text" placeholder="Jane Smith" required />
        <label for="cf-email">Email</label>
        <input id="cf-email" name="email" type="email" placeholder="jane@email.com" required />
        <label for="cf-phone">Phone (optional)</label>
        <input id="cf-phone" name="phone" type="tel" placeholder="(512) 555-0000" />
        <label for="cf-msg">Message</label>
        <textarea id="cf-msg" name="message" placeholder="I'm interested in this property…"></textarea>
        <button type="submit" class="btn-gold">Send Message</button>
        <div class="form-msg" id="form-msg"></div>
      </form>
      <div class="contact-quick">
        <a href="tel:+12547182567">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.59 3.38 2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.7A16 16 0 0 0 16 16.73l.9-.9a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          (254) 718-2567
        </a>
        <a href="mailto:Luke@austinmdg.com">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Luke@austinmdg.com
        </a>
      </div>
    </div>
  </aside>
</div>

<!-- Comparable Sales -->
${compsHTML}

<!-- Investment Snapshot -->
${investHTML}

<!-- Neighborhood Context -->
${nbhdHTML}

<!-- Employer Proximity -->
${employersHTML}

<!-- Similar Active Listings -->
<section class="similar" id="similar">
  <h2>More Luxury Homes in ${city}</h2>
  <div class="cards" id="similar-cards">
    <div style="grid-column:1/-1;color:var(--mid);font-size:.86rem;padding:.5rem 0;">Loading…</div>
  </div>
  <div style="margin-top:1.5rem;">
    <a href="/luxury-homes" style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:600;">View All Luxury Homes →</a>
  </div>
</section>

<!-- Related Links -->
<div class="related">
  <div class="related-inner">
    <h2>Explore Austin Real Estate</h2>
    <div class="related-links">
      <a href="/luxury-homes">Austin Luxury Homes</a>
      <a href="/sell-luxury-home-austin">Sell a Luxury Home</a>
      <a href="/homes-with-pool-austin">Homes with Pool</a>
      <a href="/sell-home-over-2-million-austin">Sell Home Over $2M</a>
      <a href="/investment-properties">Investment Properties</a>
      <a href="/rental-properties-for-sale-austin">Rental Properties</a>
      <a href="/1031-exchange-austin">1031 Exchange Austin</a>
      <a href="/brrrr-method-austin">BRRRR Method Austin</a>
      <a href="/market-report">Austin Market Report</a>
      <a href="/about#contact">Contact Luke Allen</a>
    </div>
  </div>
</div>

<script src="/js/footer.js"></script>

<div id="lightbox">
  <span id="lb-close" onclick="closeLB()">✕</span>
  <span id="lb-prev" onclick="shiftLB(-1)">‹</span>
  <img id="lb-img" src="" alt="" />
  <span id="lb-next" onclick="shiftLB(1)">›</span>
</div>

<script>
const photos = ${JSON.stringify(photoUrls)};
let lbIdx = 0;
function openPhoto(i) { lbIdx=i; document.getElementById('lb-img').src=photos[i]; document.getElementById('lightbox').classList.add('open'); }
function closeLB() { document.getElementById('lightbox').classList.remove('open'); }
function shiftLB(d) { lbIdx=(lbIdx+d+photos.length)%photos.length; document.getElementById('lb-img').src=photos[lbIdx]; }
document.getElementById('lightbox').addEventListener('click',e=>{ if(e.target.id==='lightbox') closeLB(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLB(); if(e.key==='ArrowLeft') shiftLB(-1); if(e.key==='ArrowRight') shiftLB(1); });

async function submitContact(e) {
  e.preventDefault();
  const btn=e.target.querySelector('.btn-gold'), msg=document.getElementById('form-msg');
  btn.disabled=true; btn.textContent='Sending…';
  try {
    const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
    if(r.ok){msg.className='form-msg ok';msg.textContent='Sent! Luke will be in touch shortly.';e.target.reset();}
    else{msg.className='form-msg err';msg.textContent='Send failed — email Luke@austinmdg.com directly.';}
  } catch{msg.className='form-msg err';msg.textContent='Network error — email Luke@austinmdg.com.';}
  btn.disabled=false; btn.textContent='Send Message';
}

(async()=>{
  try{
    const r=await fetch('/api/properties/search?minPrice=1000000&status=Active&sortBy=price_desc&limit=6&city=${encodeURIComponent(city)}');
    const d=await r.json();
    const items=(d.listings||[]).filter(l=>l.listing_key!=='${listing.listing_key}').slice(0,4);
    const el=document.getElementById('similar-cards');
    if(!items.length){el.innerHTML='<div style="color:var(--mid);font-size:.86rem;">No similar active listings found. <a href="/luxury-homes" style="color:var(--gold)">Browse all luxury homes →</a></div>';return;}
    el.innerHTML=items.map(l=>{
      const p=l.list_price?'$'+Number(l.list_price).toLocaleString():'';
      const img=l.photos&&l.photos[0]?'/api/properties/photos/'+l.listing_key+'/0':'';
      const s=l.unparsed_address?l.unparsed_address.toLowerCase().replace(/[^a-z0-9\\s-]/g,'').trim().replace(/\\s+/g,'-')+'--'+l.listing_key:l.listing_key;
      return '<div class="card"><a href="/homes/'+s+'">'+
        (img?'<div class="card-img"><img src="'+img+'" alt="'+l.unparsed_address+'" loading="lazy"/></div>':'<div class="card-img" style="background:#e5e0d8"></div>')+
        '<div class="card-body"><div class="card-price">'+p+'</div><div class="card-addr">'+(l.unparsed_address||'')+'</div>'+
        '<div class="card-pills">'+(l.bedrooms_total?'<span class="card-pill">'+l.bedrooms_total+' bd</span>':'')+(l.bathrooms_total?'<span class="card-pill">'+l.bathrooms_total+' ba</span>':'')+(l.living_area?'<span class="card-pill">'+Number(l.living_area).toLocaleString()+' sqft</span>':'')+'</div>'+
        '</div></a></div>';
    }).join('');
  }catch(e){console.warn('similar listings failed',e.message);}
})();
</script>
</body>
</html>`;
}

module.exports = { renderListingPage, enrichListing, buildSlug, parseListingKey, slugifyAddress };
