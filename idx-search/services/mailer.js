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

async function sendNewListingsAlert({ to, searchName, filters, listings }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

  const listingRows = listings.slice(0, 10).map(l => {
    const addr = [l.unparsed_address, l.city].filter(Boolean).join(', ');
    const beds = l.bedrooms_total ? `${l.bedrooms_total} bd` : '';
    const baths = l.bathrooms_total ? `${l.bathrooms_total} ba` : '';
    const sqft = l.living_area ? `${Math.round(l.living_area).toLocaleString()} sqft` : '';
    const detail = [beds, baths, sqft].filter(Boolean).join(' · ');
    const url = `${siteUrl}/property/${l.listing_key}`;
    const photo = l.photos ? JSON.parse(l.photos)[0] : null;

    return `
      <tr>
        <td style="padding:16px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          ${photo ? `<a href="${url}"><img src="${photo}" alt="" width="120" style="border-radius:8px;display:block;margin-bottom:8px;" /></a>` : ''}
          <a href="${url}" style="font-weight:600;font-size:15px;color:#1877F2;text-decoration:none;">${addr}</a><br/>
          <span style="font-size:18px;font-weight:700;color:#111;">${formatPrice(l.list_price)}</span><br/>
          <span style="font-size:13px;color:#6b7280;">${detail}</span><br/>
          <a href="${url}" style="display:inline-block;margin-top:8px;padding:6px 14px;background:#1877F2;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">View Home</a>
        </td>
      </tr>`;
  }).join('');

  const more = listings.length > 10
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;">+ ${listings.length - 10} more new listings matching your search</p>` : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#1877F2;padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:22px;">New Listings Alert</h1>
        <p style="color:#dbeafe;margin:4px 0 0;">${escHtml(searchName)}</p>
      </div>
      <div style="padding:24px 32px;">
        <p style="color:#374151;margin:0 0 16px;">
          Hi there! We found <strong>${listings.length} new listing${listings.length !== 1 ? 's' : ''}</strong> matching your saved search.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">${listingRows}</table>
        ${more}
        <div style="margin-top:24px;text-align:center;">
          <a href="${siteUrl}" style="display:inline-block;padding:12px 28px;background:#1877F2;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">View All Results</a>
        </div>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
        You're receiving this because you saved a search on Austin TX Homes.<br/>
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

module.exports = { sendNewListingsAlert };
