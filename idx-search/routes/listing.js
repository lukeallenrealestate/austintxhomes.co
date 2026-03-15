const express = require('express');
const router = express.Router();
const db = require('../db/database');

const SITE_URL = process.env.SITE_URL || 'https://austintxhomes.co';

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1).replace(/\s\S*$/, '') + '…';
}

function formatPrice(p) {
  if (!p) return '';
  return '$' + Number(p).toLocaleString('en-US');
}

function makePropertySlug(listing_key, unparsed_address, city) {
  const addrSlug = slugify(unparsed_address || '');
  const citySlug = slugify(city || 'austin');
  return addrSlug ? `${addrSlug}-${citySlug}-tx-${listing_key}` : listing_key;
}

// GET /property/:slug
// Accepts both old format (ACT222191837) and new address-based format
// (4101-idalia-dr-austin-tx-ACT222191837). Old format gets 301 redirected.
router.get('/:slug', (req, res) => {
  const { slug } = req.params;
  // Extract listing key: uppercase letters + digits at end of slug
  const match = slug.match(/([A-Z][A-Z0-9]*\d+)$/);
  const listingKey = match ? match[1] : slug;

  const listing = db.prepare(`
    SELECT listing_key, unparsed_address, city, state_or_province, postal_code,
           list_price, bedrooms_total, bathrooms_total, living_area, year_built,
           property_sub_type, public_remarks, latitude, longitude,
           standard_status, subdivision_name, school_district
    FROM listings
    WHERE listing_key = ? AND mlg_can_view = 1
  `).get(listingKey);

  if (!listing) {
    return res.status(404).sendFile(require('path').join(__dirname, '../public/index.html'));
  }

  const {
    unparsed_address, city, state_or_province, postal_code,
    list_price, bedrooms_total, bathrooms_total, living_area, year_built,
    property_sub_type, public_remarks, latitude, longitude,
    standard_status, subdivision_name, school_district
  } = listing;

  const beds = bedrooms_total || '';
  const baths = bathrooms_total || '';
  const type = property_sub_type || 'Home';
  const price = formatPrice(list_price);
  const address = unparsed_address || '';
  const cityState = [city, state_or_province, postal_code].filter(Boolean).join(', ');
  const fullAddress = [address, city, state_or_province, postal_code].filter(Boolean).join(', ');

  // Title: "4BR/3BA Single Family Home at 4821 Shoal Creek Blvd, Austin, TX 78756 | Austin TX Homes"
  const titleParts = [];
  if (beds && baths) titleParts.push(`${beds}BR/${baths}BA`);
  titleParts.push(type);
  if (address) titleParts.push(`at ${address}`);
  if (cityState) titleParts.push(cityState);
  const pageTitle = titleParts.join(' ') + ' | Austin TX Homes';

  // Meta description: lead with price and key stats, then excerpt from remarks
  const statsPart = [price, beds && `${beds} bed`, baths && `${baths} bath`, living_area && `${Number(living_area).toLocaleString()} sqft`].filter(Boolean).join(' · ');
  const remarkExcerpt = truncate(public_remarks, 120);
  const metaDesc = truncate(`${statsPart}. ${remarkExcerpt}`, 158);

  const canonicalSlug = makePropertySlug(listing.listing_key, unparsed_address, city);
  const canonicalUrl = `${SITE_URL}/property/${canonicalSlug}`;

  // 301 redirect old listing-key-only URLs to the canonical address-based URL
  // Use root-relative path (not absolute URL) so the redirect works on any host (Replit, prod, etc.)
  if (slug !== canonicalSlug) {
    return res.redirect(301, `/property/${canonicalSlug}`);
  }

  // JSON-LD: RealEstateListing
  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'RealEstateListing',
    name: pageTitle.replace(' | Austin TX Homes', ''),
    url: canonicalUrl,
    description: public_remarks ? truncate(public_remarks, 300) : '',
    ...(list_price && { price: String(list_price), priceCurrency: 'USD' }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: address,
      addressLocality: city || 'Austin',
      addressRegion: state_or_province || 'TX',
      postalCode: postal_code || ''
    },
    ...(latitude && longitude && {
      geo: { '@type': 'GeoCoordinates', latitude, longitude }
    }),
    ...(year_built && { yearBuilt: String(year_built) }),
    ...(living_area && { floorSize: { '@type': 'QuantitativeValue', value: living_area, unitCode: 'FTK' } }),
    ...(beds && { numberOfRooms: beds }),
    offerType: standard_status === 'Active' ? 'ForSale' : standard_status,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: 'Homes for Sale', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 3, name: fullAddress }
      ]
    }
  };

  // Pre-rendered visible content for Googlebot (JS will overwrite this for human users)
  const prerenderStats = [
    beds && `${beds} Bedrooms`,
    baths && `${baths} Bathrooms`,
    living_area && `${Number(living_area).toLocaleString()} Sq Ft`,
    year_built && `Built ${year_built}`
  ].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(pageTitle)}</title>
  <meta name="description" content="${escHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escHtml(pageTitle)}" />
  <meta property="og:description" content="${escHtml(metaDesc)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="Austin TX Homes" />

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(schema)}</script>

  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>

<!-- HEADER -->
<header class="header">
  <a href="/" class="header-logo"><img src="/images/logo.png" alt="Luke Allen | Austin TX Real Estate" /></a>
  <div class="header-actions" style="margin-left:auto;">
    <a href="/" class="btn btn-ghost">← Back to Search</a>
    <a href="/account.html" id="account-link" class="btn btn-ghost" style="display:none;">My Account</a>
    <a href="/admin.html" id="admin-link" class="btn btn-ghost" style="display:none;">Admin</a>
    <button id="login-btn" class="btn btn-outline">Log In</button>
    <button id="signup-btn" class="btn btn-primary">Sign Up</button>
  </div>
</header>

<!-- PRE-RENDERED SEO CONTENT (visible to Googlebot; JS enhances for human users) -->
<div id="seo-prerender" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);" aria-hidden="true">
  <h1>${escHtml(pageTitle.replace(' | Austin TX Homes', ''))}</h1>
  <p>${escHtml(price)} &mdash; ${escHtml(prerenderStats)}</p>
  <p>${escHtml(fullAddress)}</p>
  ${subdivision_name ? `<p>Subdivision: ${escHtml(subdivision_name)}</p>` : ''}
  ${school_district ? `<p>School District: ${escHtml(school_district)}</p>` : ''}
  <p>${escHtml(public_remarks || '')}</p>
</div>

<div class="detail-header">
  <div class="gallery" id="gallery">
    <div class="loading" style="height:480px;"><div class="spinner"></div></div>
  </div>

  <div class="detail-content" id="detail-content" style="display:none;">
    <div class="detail-main">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
        <div>
          <div class="detail-price" id="detail-price"></div>
          <div class="detail-status-row">
            <span class="card-status" id="detail-status"></span>
            <span id="detail-dom" style="font-size:13px;color:var(--text-light);"></span>
          </div>
          <div class="detail-address" id="detail-address"></div>
        </div>
        <button class="heart-btn" id="detail-heart" style="position:static;width:44px;height:44px;border:1.5px solid var(--border);border-radius:50%;flex-shrink:0;" onclick="toggleDetailFavorite()">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>

      <div class="detail-stats" id="detail-stats"></div>

      <div class="detail-section">
        <h3>About This Home</h3>
        <div class="detail-description desc-truncated" id="detail-description"></div>
        <button class="show-more-btn" id="show-more-btn" onclick="toggleDesc()">Show more ▼</button>
      </div>

      <div class="detail-section">
        <h3>Property Details</h3>
        <div class="detail-facts" id="detail-facts"></div>
      </div>

      <div class="detail-section" id="schools-section" style="display:none;">
        <h3>Schools</h3>
        <div class="detail-facts" id="detail-schools"></div>
      </div>

      <div class="detail-section">
        <h3>Location</h3>
        <div id="detail-map" style="height:320px;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg);"></div>
      </div>

      <div class="detail-section" id="similar-section">
        <h3>Similar Homes</h3>
        <div class="similar-grid" id="similar-listings"></div>
      </div>

      <div class="detail-section" id="listing-agent-section">
        <h3>Listing Information</h3>
        <div class="listing-agent-row">
          <div class="agent-avatar agent-avatar-sm" id="agent-avatar"></div>
          <div>
            <div style="font-size:14px;font-weight:600;" id="agent-name"></div>
            <div style="font-size:13px;color:var(--text-light);" id="agent-office"></div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px;">Listing Agent</div>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-sidebar">
      <div class="contact-card">
        <div class="price-big" id="sidebar-price"></div>
        <div class="est-payment" id="sidebar-payment"></div>
        <form class="contact-form" onsubmit="submitContact(event)">
          <input type="text" name="name" placeholder="Your name" required />
          <input type="email" name="email" placeholder="Your email" required />
          <input type="tel" name="phone" placeholder="Your phone (optional)" />
          <textarea name="message" rows="3" placeholder="I'm interested in this property..."></textarea>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;border-radius:var(--radius);">
            Request Info
          </button>
        </form>
        <div class="agent-info">
          <div class="agent-avatar" style="background:var(--blue);">L</div>
          <div>
            <div class="agent-name">Luke Allen</div>
            <div class="agent-office">Austin Marketing + Development Group</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px;">(254) 718-2567</div>
          </div>
        </div>
      </div>
      <div id="open-house-card" style="display:none;margin-top:16px;background:var(--blue-light);border-radius:var(--radius-lg);padding:16px;">
        <div style="font-weight:700;color:var(--blue);margin-bottom:4px;">Open House</div>
        <div id="open-house-details" style="font-size:14px;"></div>
      </div>
    </div>
  </div>

  <div id="detail-error" style="display:none;" class="empty-state">
    <h3>Listing not found</h3>
    <p>This listing may have been removed or is no longer available.</p>
    <a href="/" class="btn btn-primary">Back to Search</a>
  </div>
</div>

<!-- AUTH MODAL -->
<div class="modal-overlay" id="auth-modal">
  <div class="modal">
    <button class="modal-close" onclick="closeAuthModal()">×</button>
    <div id="login-form">
      <h2>Welcome back</h2>
      <p class="modal-subtitle">Log in to save homes</p>
      <div class="form-group"><label>Email</label><input type="email" id="login-email" placeholder="you@email.com" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="login-password" placeholder="••••••••" /></div>
      <div id="login-error" class="form-error"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="doLogin()">Log In</button>
      <div class="modal-footer">Don't have an account? <a onclick="showSignup()">Sign Up</a></div>
    </div>
    <div id="signup-form" style="display:none;">
      <h2>Create account</h2>
      <p class="modal-subtitle">Save homes and searches</p>
      <div class="form-group"><label>Full Name</label><input type="text" id="signup-name" placeholder="Your name" /></div>
      <div class="form-group"><label>Email</label><input type="email" id="signup-email" placeholder="you@email.com" /></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="signup-phone" placeholder="(512) 555-0000" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="signup-password" placeholder="At least 8 characters" /></div>
      <div id="signup-error" class="form-error"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="doSignup()">Create Account</button>
      <div class="modal-footer">Already have an account? <a onclick="showLogin()">Log In</a></div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<!-- listingKey is read from URL path by property.js -->
<script>window.__LISTING_KEY__ = ${JSON.stringify(listingKey)};</script>
<script src="/js/auth.js"></script>
<script src="/js/list.js"></script>
<script src="/js/property.js"></script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
