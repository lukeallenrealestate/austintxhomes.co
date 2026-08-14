const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function formatPrice(p) {
  return p ? '$' + Number(p).toLocaleString() : 'N/A';
}

// Per-site alert branding. A saved search carries filters.site (set by the site
// that created it) so alerts link back to the right property and read on-brand.
// Falls back to the engine's default (Austin TX Homes) when no site is set.
const ALERT_SITES = {
  newhomesaustin: {
    name: 'New Homes Austin',
    url: 'https://newhomesaustin.co',
    property: (k) => `/new-construction-homes/${k}`,
    browse: '/new-construction-homes',
    accent: '#bf5a34',
  }
};

function alertSite(filters) {
  const key = filters && filters.site;
  if (key && ALERT_SITES[key]) return ALERT_SITES[key];
  return {
    name: 'Austin TX Homes',
    url: process.env.SITE_URL || 'http://localhost:3000',
    property: (k) => `/property/${k}`,
    browse: '',
    accent: '#1877F2'
  };
}

async function sendNewListingsAlert({ to, searchName, filters, listings }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const site = alertSite(filters);
  const siteUrl = site.url;
  const accent = site.accent;

  const listingRows = listings.slice(0, 10).map(l => {
    const addr = [l.unparsed_address, l.city].filter(Boolean).join(', ');
    const beds = l.bedrooms_total ? `${l.bedrooms_total} bd` : '';
    const baths = l.bathrooms_total ? `${l.bathrooms_total} ba` : '';
    const sqft = l.living_area ? `${Math.round(l.living_area).toLocaleString()} sqft` : '';
    const detail = [beds, baths, sqft].filter(Boolean).join(' · ');
    const url = `${siteUrl}${site.property(l.listing_key)}`;
    // Use the /api proxy for photos (302 to R2) so email images don't
    // break when the raw MLS Grid ?expires token rotates. Recipients
    // often open weekly digests days after send.
    const photo = l.photos && (JSON.parse(l.photos)[0] || null)
      ? `${siteUrl}/api/properties/photos/${l.listing_key}/0`
      : null;

    // Price-drop badge + delta if the alertJob flagged this as a
    // re-notification because the price dropped since last send.
    const isDrop = l.reason === 'price_drop' && l.prior_price != null && l.list_price != null;
    const dropDelta = isDrop ? l.prior_price - l.list_price : 0;
    const dropPct   = isDrop && l.prior_price > 0 ? Math.round((dropDelta / l.prior_price) * 100) : 0;
    const badge = isDrop
      ? `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:4px;margin-bottom:6px;">Price Drop &#9660; $${dropDelta.toLocaleString()} (${dropPct}%)</span><br/>`
      : '';
    const priorPriceLine = isDrop
      ? `<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;margin-left:6px;">${formatPrice(l.prior_price)}</span>`
      : '';

    return `
      <tr>
        <td style="padding:16px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          ${photo ? `<a href="${url}"><img src="${photo}" alt="" width="120" style="border-radius:8px;display:block;margin-bottom:8px;" /></a>` : ''}
          ${badge}<a href="${url}" style="font-weight:600;font-size:15px;color:${accent};text-decoration:none;">${addr}</a><br/>
          <span style="font-size:18px;font-weight:700;color:#111;">${formatPrice(l.list_price)}</span>${priorPriceLine}<br/>
          <span style="font-size:13px;color:#6b7280;">${detail}</span><br/>
          <a href="${url}" style="display:inline-block;margin-top:8px;padding:6px 14px;background:${accent};color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">View Home</a>
        </td>
      </tr>`;
  }).join('');

  const more = listings.length > 10
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;">+ ${listings.length - 10} more new listings matching your search</p>` : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:${accent};padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:22px;">New Listings Alert</h1>
        <p style="color:#f4ede2;margin:4px 0 0;">${escHtml(searchName)}</p>
      </div>
      <div style="padding:24px 32px;">
        <p style="color:#374151;margin:0 0 16px;">
          Hi there! We found <strong>${listings.length} new listing${listings.length !== 1 ? 's' : ''}</strong> matching your saved search.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">${listingRows}</table>
        ${more}
        <div style="margin-top:24px;text-align:center;">
          <a href="${siteUrl}${site.browse}" style="display:inline-block;padding:12px 28px;background:${accent};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">View all homes</a>
        </div>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
        You're receiving this because you saved a search on ${escHtml(site.name)}.<br/>
        ${fromName} · <a href="mailto:${fromEmail}" style="color:#9ca3af;">${fromEmail}</a>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `${listings.length} new listing${listings.length !== 1 ? 's' : ''} for "${searchName}"`,
    html
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Generic transactional sender — used by photoBackfill and other admin-facing jobs.
async function sendMail({ to, subject, html, text }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text
  });
}

module.exports = { sendNewListingsAlert, sendMail };
