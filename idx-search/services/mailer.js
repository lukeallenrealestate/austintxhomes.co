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

const GOLD = '#b8935a';
const GOLD_DARK = '#a37f49';
const INK = '#0f0f0e';
const TEXT = '#1a1918';
const MID = '#5c5b57';
const LIGHT = '#999690';
const CREAM = '#f1ece3';
const WARM = '#faf8f4';
const BORDER = '#e5dfd4';
const WHITE = '#ffffff';

function formatPrice(p) {
  return p ? '$' + Number(p).toLocaleString() : 'N/A';
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Per-site alert branding. A saved search carries filters.site (set by the
// site that created it) so alerts link back to the right property and read
// on-brand. Falls back to the engine's default (Austin TX Homes).
const ALERT_SITES = {
  newhomesaustin: {
    name: 'New Homes Austin',
    url: 'https://newhomesaustin.co',
    property: (k) => `/new-construction-homes/${k}`,
    browse: '/new-construction-homes',
    accent: '#bf5a34'
  }
};
function alertSite(filters) {
  const key = filters && filters.site;
  if (key && ALERT_SITES[key]) return ALERT_SITES[key];
  return {
    name: 'Austin TX Homes',
    url: process.env.SITE_URL || 'http://localhost:3000',
    property: (k) => `/homes/${k}`,
    browse: '',
    accent: GOLD
  };
}

// ─── Shared email shell ────────────────────────────────────────────
// Every email we send wraps its body in the same branded shell: cream
// outer, white inner card with a thin gold hairline, serif headline,
// clean sans body, consistent footer. Email clients strip <head>, so
// every rule lives inline. Google Fonts don't load in most inboxes -
// Georgia/system-ui fallbacks keep the look close.
function wrap({ title, preheader, intro, body, ctaLabel, ctaUrl, footerNote, siteUrl, accent }) {
  const _accent = accent || GOLD;
  const _siteUrl = siteUrl || process.env.SITE_URL || 'https://austintxhomes.co';
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Luke@austinmdg.com';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${WARM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
<div style="display:none;max-height:0;overflow:hidden;color:${WARM};opacity:0;">${escHtml(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WARM};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${WHITE};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(15,15,14,.06);">
      <!-- Brand bar -->
      <tr><td style="background:${INK};padding:22px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="color:${GOLD};font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">Austin TX Homes</td>
          <td align="right" style="color:#9ca3af;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Luke Allen, TREC #788149</td>
        </tr></table>
      </td></tr>
      <!-- Gold hairline -->
      <tr><td style="background:${_accent};height:3px;line-height:3px;font-size:3px;">&nbsp;</td></tr>
      <!-- Headline -->
      <tr><td style="padding:34px 36px 8px;">
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:28px;line-height:1.18;color:${INK};margin:0;">${title}</h1>
        ${intro ? `<p style="font-size:15px;line-height:1.55;color:${MID};margin:14px 0 0;">${intro}</p>` : ''}
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:22px 36px 10px;">${body}</td></tr>
      ${ctaLabel && ctaUrl ? `
      <!-- CTA -->
      <tr><td align="center" style="padding:12px 36px 32px;">
        <a href="${ctaUrl}" style="display:inline-block;padding:15px 36px;background:${_accent};color:#fff;font-size:15px;font-weight:700;letter-spacing:.02em;text-decoration:none;border-radius:4px;box-shadow:0 2px 8px rgba(184,147,90,.3);">${escHtml(ctaLabel)}</a>
      </td></tr>` : ''}
      ${footerNote ? `
      <tr><td style="padding:0 36px 24px;font-size:13px;color:${LIGHT};line-height:1.6;text-align:center;">${footerNote}</td></tr>` : ''}
      <!-- Footer -->
      <tr><td style="background:${CREAM};padding:22px 36px;border-top:1px solid ${BORDER};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:Georgia,serif;color:${INK};font-size:17px;font-weight:600;padding-bottom:4px;">${escHtml(fromName)}</td></tr>
          <tr><td style="font-size:12px;color:${MID};padding-bottom:2px;">Realtor &middot; Austin, TX &middot; TREC #788149</td></tr>
          <tr><td style="font-size:12px;color:${MID};padding-bottom:10px;">Austin Marketing &amp; Development Group</td></tr>
          <tr><td style="font-size:12px;">
            <a href="tel:+12547182567" style="color:${GOLD_DARK};text-decoration:none;">(254) 718-2567</a> &middot;
            <a href="mailto:${fromEmail}" style="color:${GOLD_DARK};text-decoration:none;">${fromEmail}</a> &middot;
            <a href="${_siteUrl}" style="color:${GOLD_DARK};text-decoration:none;">austintxhomes.co</a>
          </td></tr>
          <tr><td style="padding-top:14px;font-size:11px;color:${LIGHT};line-height:1.6;">
            You're receiving this because you have an account on Austin TX Homes. Reply to this email any time, I read every one.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Strip em dashes and &mdash; from the shell/body. The brand has a
// strict no-dash rule across austintxhomes.co content; this is a safety
// net in case any dynamic piece sneaks one in.
function scrubDashes(html) {
  return html.replace(/&mdash;/g, '&middot;').replace(/—/g, '-').replace(/–/g, '-');
}

// ─── Saved search created: welcome / confirmation ───────────────
async function sendSavedSearchWelcome({ to, clientName, searchName, filters, savedSearchId, matchCount, inviterName }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const site = alertSite(filters);
  const first = (clientName || '').split(' ')[0] || 'there';
  const inviter = inviterName || fromName;
  const ctaUrl = savedSearchId
    ? `${site.url}/account.html#search=${savedSearchId}`
    : `${site.url}/search`;

  const body = `
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 14px;">Hi ${escHtml(first)},</p>
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 16px;">
      Your saved search <strong style="color:${INK};">${escHtml(searchName)}</strong> is set up on Austin TX Homes.
      ${matchCount ? `There are currently <strong>${matchCount} active home${matchCount === 1 ? '' : 's'}</strong> that match your criteria.` : ''}
    </p>
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 20px;">
      From here on, I'll only email you when <strong>a brand-new listing hits the market</strong> matching this search, or when <strong>the price drops</strong> on one of them. No repeat alerts for the same homes.
    </p>
    <div style="background:${WARM};border:1px solid ${BORDER};border-radius:4px;padding:16px 18px;margin:0 0 6px;">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${LIGHT};font-weight:700;margin-bottom:6px;">Your search</div>
      <div style="font-size:14px;color:${INK};font-weight:600;">${escHtml(searchName)}</div>
      <div style="font-size:13px;color:${MID};margin-top:4px;">${escHtml(describeFilters(filters) || 'All matching homes')}</div>
    </div>`;

  const html = scrubDashes(wrap({
    title: `Your saved search is live, ${escHtml(first)}`,
    preheader: `${matchCount || 'New'} matching homes waiting on austintxhomes.co.`,
    body,
    ctaLabel: 'See your saved search',
    ctaUrl,
    footerNote: `Questions? Reply to this email or call ${escHtml(inviter)} directly at (254) 718-2567.`,
    accent: site.accent
  }));

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `Your saved search is live: ${searchName}`,
    html
  });
}

// ─── Activation invite: admin created the account for the client ───────
async function sendActivationInvite({ to, clientName, inviterName, activationUrl }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const first = (clientName || '').split(' ')[0] || 'there';
  const inviter = inviterName || fromName;

  const body = `
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 14px;">Hi ${escHtml(first)},</p>
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 14px;">
      ${escHtml(inviter)} already set up your Austin TX Homes account and built a home search tailored to what you're looking for. One quick step to activate it: pick a password.
    </p>
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 6px;">
      Once you're in, you'll be able to save favorites, get new-listing alerts the moment they hit MLS, and chat with ${escHtml(inviter)} directly.
    </p>
    <p style="font-size:12px;color:${LIGHT};margin:22px 0 0;line-height:1.65;">
      Or paste this link into your browser:<br/>
      <span style="word-break:break-all;color:${MID};">${activationUrl}</span>
    </p>`;

  const html = scrubDashes(wrap({
    title: `Your account is ready, ${escHtml(first)}`,
    preheader: 'Pick a password to activate your Austin TX Homes account.',
    body,
    ctaLabel: 'Create your password',
    ctaUrl: activationUrl,
    footerNote: 'This link is good for 30 days. If it expires, reply to this email and I\'ll send a new one.'
  }));

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `Your Austin TX Homes account is ready, ${first}`,
    html
  });
}

// ─── New-listing alert for a saved search ───────────────────────────
async function sendNewListingsAlert({ to, bcc, searchName, filters, listings, savedSearchId, clientName }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const site = alertSite(filters);
  const first = (clientName || '').split(' ')[0];
  const hasDrops = listings.some(l => l.reason === 'price_drop');
  const newCount = listings.filter(l => l.reason === 'new').length;
  const dropCount = listings.filter(l => l.reason === 'price_drop').length;

  let subject;
  if (newCount && dropCount) subject = `${newCount} new + ${dropCount} price drop${dropCount === 1 ? '' : 's'}: ${searchName}`;
  else if (dropCount) subject = `Price drop${dropCount === 1 ? '' : 's'} on ${dropCount} home${dropCount === 1 ? '' : 's'}: ${searchName}`;
  else subject = `${newCount} new listing${newCount === 1 ? '' : 's'}: ${searchName}`;

  const listingRows = listings.slice(0, 10).map(l => {
    const addr = [l.unparsed_address, l.city].filter(Boolean).join(', ');
    const beds = l.bedrooms_total ? `${l.bedrooms_total} bd` : '';
    const baths = l.bathrooms_total ? `${l.bathrooms_total} ba` : '';
    const sqft = l.living_area ? `${Math.round(l.living_area).toLocaleString()} sqft` : '';
    const detail = [beds, baths, sqft].filter(Boolean).join(' &middot; ');
    const url = `${site.url}${site.property(l.listing_key)}`;
    const photo = l.photos && (JSON.parse(l.photos)[0] || null)
      ? `${site.url}/api/properties/photos/${l.listing_key}/0` : null;
    const isDrop = l.reason === 'price_drop' && l.prior_price != null && l.list_price != null;
    const dropDelta = isDrop ? l.prior_price - l.list_price : 0;
    const dropPct = isDrop && l.prior_price > 0 ? Math.round((dropDelta / l.prior_price) * 100) : 0;
    const badge = isDrop
      ? `<div style="display:inline-block;background:#166534;color:#fff;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:3px 8px;border-radius:3px;margin-bottom:8px;">Price Drop &darr; $${dropDelta.toLocaleString()} (${dropPct}%)</div>`
      : `<div style="display:inline-block;background:${CREAM};color:${GOLD_DARK};font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:3px 8px;border-radius:3px;margin-bottom:8px;">New Listing</div>`;
    const priorPriceLine = isDrop
      ? `<span style="font-size:13px;color:${LIGHT};text-decoration:line-through;margin-left:8px;">${formatPrice(l.prior_price)}</span>` : '';

    return `
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WHITE};border:1px solid ${BORDER};border-radius:4px;overflow:hidden;">
          ${photo ? `<tr><td><a href="${url}"><img src="${photo}" alt="${escHtml(addr)}" width="100%" style="display:block;width:100%;max-height:280px;object-fit:cover;" /></a></td></tr>` : ''}
          <tr><td style="padding:16px 18px;">
            ${badge}
            <div><a href="${url}" style="font-family:Georgia,serif;font-size:19px;font-weight:600;color:${INK};text-decoration:none;line-height:1.3;">${escHtml(addr)}</a></div>
            <div style="margin-top:6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:${GOLD};">${formatPrice(l.list_price)}</span>${priorPriceLine}</div>
            ${detail ? `<div style="font-size:13px;color:${MID};margin-top:6px;">${detail}</div>` : ''}
            <a href="${url}" style="display:inline-block;margin-top:14px;padding:9px 20px;background:${INK};color:#fff;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border-radius:3px;">View Home</a>
          </td></tr>
        </table>
      </td></tr>`;
  }).join('');

  const more = listings.length > 10
    ? `<p style="text-align:center;color:${LIGHT};font-size:13px;margin:0 0 20px;">+ ${listings.length - 10} more match${listings.length - 10 === 1 ? '' : 'es'} on austintxhomes.co</p>`
    : '';

  const greeting = first
    ? `<p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 14px;">Hi ${escHtml(first)},</p>`
    : '';
  const headline = newCount && dropCount
    ? `<strong>${newCount} new home${newCount === 1 ? '' : 's'}</strong> just hit the market and <strong>${dropCount} price drop${dropCount === 1 ? '' : 's'}</strong>`
    : (dropCount
      ? `<strong>${dropCount} price drop${dropCount === 1 ? '' : 's'}</strong>`
      : `<strong>${newCount} new home${newCount === 1 ? '' : 's'}</strong> just hit the market`);

  const body = `
    ${greeting}
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 6px;">
      ${headline} for your saved search <strong style="color:${INK};">${escHtml(searchName)}</strong>.
    </p>
    <div style="height:14px;line-height:14px;font-size:14px;">&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${listingRows}
    </table>
    ${more}`;

  const ctaUrl = savedSearchId ? `${site.url}/account.html#search=${savedSearchId}` : `${site.url}${site.browse || '/search'}`;

  const html = scrubDashes(wrap({
    title: hasDrops && !newCount
      ? 'A price just dropped'
      : (newCount && dropCount ? 'New listings + price drops' : 'New listings for you'),
    preheader: `${listings.length} home${listings.length === 1 ? '' : 's'} in your saved search.`,
    body,
    ctaLabel: 'See your saved search',
    ctaUrl,
    footerNote: 'Only getting alerts for homes that are actually new or dropped in price. No duplicates.',
    accent: site.accent
  }));

  const mailOpts = {
    from: `"${fromName}" <${fromEmail}>`,
    to, subject, html
  };
  if (bcc) mailOpts.bcc = bcc;
  await transporter.sendMail(mailOpts);
}

// ─── Price drop alert on a FAVORITED listing ──────────────────────
async function sendFavoritePriceDropAlert({ to, clientName, listings }) {
  if (!listings || !listings.length) return;
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const siteUrl = process.env.SITE_URL || 'https://austintxhomes.co';
  const first = (clientName || '').split(' ')[0];

  const rows = listings.slice(0, 10).map(l => {
    const addr = [l.unparsed_address, l.city].filter(Boolean).join(', ');
    const url = `${siteUrl}/homes/${l.listing_key}`;
    const photo = l.photos && (JSON.parse(l.photos)[0] || null)
      ? `${siteUrl}/api/properties/photos/${l.listing_key}/0` : null;
    const delta = l.prior_price - l.list_price;
    const pct = l.prior_price > 0 ? Math.round((delta / l.prior_price) * 100) : 0;
    return `
      <tr><td style="padding:0 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WHITE};border:1px solid ${BORDER};border-radius:4px;overflow:hidden;">
          ${photo ? `<tr><td><a href="${url}"><img src="${photo}" alt="${escHtml(addr)}" width="100%" style="display:block;width:100%;max-height:280px;object-fit:cover;" /></a></td></tr>` : ''}
          <tr><td style="padding:16px 18px;">
            <div style="display:inline-block;background:#166534;color:#fff;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:3px 8px;border-radius:3px;margin-bottom:8px;">Price Drop &darr; $${delta.toLocaleString()} (${pct}%)</div>
            <div><a href="${url}" style="font-family:Georgia,serif;font-size:19px;font-weight:600;color:${INK};text-decoration:none;line-height:1.3;">${escHtml(addr)}</a></div>
            <div style="margin-top:6px;"><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:${GOLD};">${formatPrice(l.list_price)}</span><span style="font-size:13px;color:${LIGHT};text-decoration:line-through;margin-left:8px;">${formatPrice(l.prior_price)}</span></div>
            <a href="${url}" style="display:inline-block;margin-top:14px;padding:9px 20px;background:${INK};color:#fff;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border-radius:3px;">View Home</a>
          </td></tr>
        </table>
      </td></tr>`;
  }).join('');

  const greeting = first ? `<p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 14px;">Hi ${escHtml(first)},</p>` : '';
  const headline = listings.length === 1 ? 'A home you saved just dropped in price' : `${listings.length} homes you saved just dropped in price`;

  const body = `
    ${greeting}
    <p style="font-size:15px;line-height:1.65;color:${TEXT};margin:0 0 6px;">
      ${headline}. Worth another look.
    </p>
    <div style="height:14px;line-height:14px;font-size:14px;">&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;

  const html = scrubDashes(wrap({
    title: listings.length === 1 ? 'Price just dropped on a home you saved' : `${listings.length} price drops on homes you saved`,
    preheader: `Only sending this because you favorited ${listings.length === 1 ? 'this home' : 'these homes'}.`,
    body,
    ctaLabel: 'See your favorites',
    ctaUrl: `${siteUrl}/account.html`
  }));

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `Price drop on ${listings.length === 1 ? 'a home' : listings.length + ' homes'} you saved`,
    html
  });
}

// ─── Filter description helper (also used by saved-search welcome) ────
function describeFilters(f) {
  if (!f) return '';
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch { return ''; } }
  const parts = [];
  if (f.city) parts.push(f.city.split(',').length > 1 ? `Cities: ${f.city}` : f.city);
  if (f.zip) parts.push(f.zip.split(',').length > 1 ? `ZIPs: ${f.zip}` : 'ZIP ' + f.zip);
  if (f.neighborhood) parts.push(f.neighborhood);
  if (f.schoolDistrict) parts.push(f.schoolDistrict);
  if (f.minPrice || f.maxPrice) {
    parts.push([
      f.minPrice ? '$' + Number(f.minPrice).toLocaleString() : '',
      f.maxPrice ? '$' + Number(f.maxPrice).toLocaleString() : ''
    ].filter(Boolean).join(' to '));
  }
  if (f.minBeds) parts.push(f.minBeds + '+ bd');
  if (f.minBaths) parts.push(f.minBaths + '+ ba');
  if (f.subType) parts.push(f.subType);
  if (f.pool === 'true' || f.pool === true) parts.push('pool');
  if (f.waterfront === 'true' || f.waterfront === true) parts.push('waterfront');
  if (f.newConstruction === 'true' || f.newConstruction === true) parts.push('new construction');
  return parts.join(' &middot; ');
}

// Generic transactional sender - used by photoBackfill and other admin jobs.
async function sendMail({ to, subject, html, text }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'Luke Allen';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  return transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html, text });
}

module.exports = {
  sendNewListingsAlert,
  sendActivationInvite,
  sendSavedSearchWelcome,
  sendFavoritePriceDropAlert,
  sendMail
};
