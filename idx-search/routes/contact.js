const express = require('express');
const router = express.Router();

// ── Realtor OS CRM forwarder ──────────────────────────────────────────────────
// Every completed lead is ALSO POSTed to the CRM's webhook so it appears in
// the New Leads column instantly. Best-effort: a failed CRM POST never blocks
// the email response or the visitor confirmation. Set REALTOR_OS_WEBHOOK_TOKEN
// in the environment to append ?token=... (the CRM's optional shared secret).
//
// URL is overridable via env for staging or if the CRM ever moves off Replit.
const CRM_WEBHOOK_URL = process.env.REALTOR_OS_WEBHOOK_URL
  || 'https://realtor-os.replit.app/api/leads/webhook';

async function forwardLeadToCrm(payload) {
  try {
    const token = process.env.REALTOR_OS_WEBHOOK_TOKEN;
    const url = token
      ? `${CRM_WEBHOOK_URL}?token=${encodeURIComponent(token)}`
      : CRM_WEBHOOK_URL;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[CRM webhook] non-2xx response:',
        res.status, text.slice(0, 200));
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.warn('[CRM webhook] POST failed:', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

// Derive Buyer vs Seller from the form's source/context. Explicit hint from
// req.body.type wins; otherwise look at page slug + intent keywords. Falls
// back to Buyer because the site's default lead pool is buyers.
function deriveLeadType(body) {
  const explicit = (body.type || body.leadType || '').toString().trim();
  if (explicit) return explicit;
  const hay = [body.source, body.intent, body.strategy, body.form]
    .filter(Boolean).join(' ').toLowerCase();
  if (/\b(sell(er|ing|-home)?|list(ing)?-my-home|home-valuation|cma)\b/.test(hay)) return 'Seller';
  if (/\b(invest|str|rental|fund|capital|deal|1031)\b/.test(hay)) return 'Investor';
  return 'Buyer';
}

// Combine everything the visitor gave us into the `notes` field so nothing
// gets lost in translation to the CRM's simpler schema. The CRM stores this
// verbatim so Luke sees the same detail he'd see in the lead email.
function buildRichNotes(body, phoneOut) {
  const lines = [];
  const primary = body.notes || body.message;
  if (primary) lines.push(primary);
  const extras = [
    ['Listing', body.listing],
    ['Property URL', body.listingKey ? `https://austintxhomes.co/property/${body.listingKey}` : null],
    ['List Price', body.listPrice ? '$' + Number(body.listPrice).toLocaleString() : null],
    ['Property Address', body.address],
    ['Budget', body.budget],
    ['Capital', body.capital],
    ['Timeline', body.timeline],
    ['Neighborhood', body.neighborhood],
    ['Property Type', body.propertyType],
    ['Strategy', body.strategy],
    ['Company / Fund', body.company],
    ['Interested Deal', body.interestedDeal],
    ['Intent', body.intent]
  ].filter(([, v]) => v);
  if (extras.length) {
    if (lines.length) lines.push('');
    lines.push('── Additional detail ──');
    extras.forEach(([label, value]) => lines.push(`${label}: ${value}`));
  }
  if (phoneOut && !body.phone) lines.push(`(Phone recovered from combined "contact" field: ${phoneOut})`);
  return lines.join('\n');
}

// POST /api/contact
router.post('/', async (req, res) => {
  const {
    name, phone, message, listing, listingKey, listPrice,
    budget, timeline, neighborhood, source, address,
    company, capital, propertyType, strategy, notes, interestedDeal,
    contact
  } = req.body;
  let email = req.body.email || contact;

  // If `contact` was used (legacy combined field) and the value looks like
  // a phone number rather than an email, treat it as the phone instead.
  // Old forms have a "Phone or Email" input that confused users — Keith
  // Hallier hit this on 2026-06-22, typed "Phone" literally, the lead
  // notification went out with EMAIL: Phone, and the confirmation email
  // bounced at SMTP RCPT-TO. This block recovers the lead instead of
  // dropping it on the floor.
  const looksLikeEmail = v => typeof v === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const looksLikePhone = v => typeof v === 'string'
    && /^[\d().+\-\s]{7,}$/.test(v.trim());
  let phoneFromContact = phone;
  if (!req.body.email && contact && !looksLikeEmail(contact) && looksLikePhone(contact)) {
    phoneFromContact = contact;
    email = null; // force the validation below to surface the missing-email error
  }

  if (!name || !email) {
    console.warn('[contact] missing required field:', JSON.stringify({
      name, email, contact, phone, source, address, timeline,
      bodyKeys: Object.keys(req.body)
    }));
    return res.status(400).json({
      error: !name ? 'Please enter your name.' : 'Please enter a valid email address.',
      field: !name ? 'name' : 'email'
    });
  }

  // Validate that `email` is actually an email address — without this the
  // confirmation email crashes nodemailer with an unhandled RCPT-TO
  // rejection. Log full payload so we can still see what the user typed.
  if (!looksLikeEmail(email)) {
    console.warn('[contact] invalid email rejected:', JSON.stringify({
      name, email, phone: phoneFromContact, source, address, timeline, message: notes || message,
      bodyKeys: Object.keys(req.body)
    }));
    return res.status(400).json({
      error: 'Please enter a valid email address.',
      field: 'email'
    });
  }
  // Use the recovered phone if the combined-contact rescue ran.
  const phoneOut = phoneFromContact;

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    let rawSiteUrl = process.env.SITE_URL || 'austintxhomes.co';
    if (!rawSiteUrl.startsWith('http')) rawSiteUrl = 'https://' + rawSiteUrl;
    const price = listPrice ? '$' + Number(listPrice).toLocaleString() : '';
    const propertyUrl = listingKey ? `${rawSiteUrl}/property/${listingKey}` : rawSiteUrl;
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const fromAddress = `"Austin TX Homes" <${process.env.EMAIL_USER}>`;

    const subject = listing
      ? `New inquiry: ${listing}${price ? ' · ' + price : ''}`
      : `New lead from Austin TX Homes${source ? ' (' + source + ')' : ''}`;

    const row = (label, value) => value
      ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;"><span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">${label}</span><br/><span style="color:#1a1918;font-family:Georgia,serif;font-size:15px;">${value}</span></td></tr>`
      : '';

    // ── Email 1: Lead notification to Luke ──────────────────────────────────
    const leadEmailPromise = transporter.sendMail({
      from: fromAddress,
      to: adminEmail,
      replyTo: `"${name}" <${email}>`,
      subject,
      html: `
        <div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;background:#faf8f4;">
          <div style="background:#0f0f0e;padding:32px 32px 28px;text-align:center;">
            <h2 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.02em;">New Lead</h2>
            <p style="color:#b8935a;margin:8px 0 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">Austin TX Homes${source ? ' &middot; ' + source : ''}</p>
          </div>
          <div style="background:#b8935a;height:2px;"></div>
          <div style="background:#fff;padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${listing ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Property</span><br/>
                <a href="${propertyUrl}" style="color:#b8935a;font-family:Georgia,serif;font-size:16px;text-decoration:none;">${listing}${price ? ' &middot; ' + price : ''}</a>
              </td></tr>` : ''}
              <tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Name</span><br/>
                <span style="color:#1a1918;font-family:Georgia,serif;font-size:16px;">${name}</span>
              </td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Email</span><br/>
                <a href="mailto:${email}" style="color:#b8935a;font-family:Georgia,serif;font-size:15px;text-decoration:none;">${email}</a>
              </td></tr>
              ${phoneOut ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Phone</span><br/>
                <a href="tel:${phoneOut}" style="color:#b8935a;font-family:Georgia,serif;font-size:15px;text-decoration:none;">${phoneOut}</a>
              </td></tr>` : ''}
              ${row('Property Address', address)}
              ${row('Company / Fund', company)}
              ${row('Budget', budget)}
              ${row('Capital to Deploy', capital)}
              ${row('Timeline', timeline)}
              ${row('Neighborhood', neighborhood)}
              ${row('Property Type', propertyType)}
              ${row('Investment Strategy', strategy)}
              ${row('Interested Deal', interestedDeal)}
              <tr><td style="padding:12px 0;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Message</span><br/>
                <p style="color:#1a1918;font-family:Georgia,serif;font-size:15px;line-height:1.65;white-space:pre-wrap;margin:6px 0 0;">${notes || message || '(no message)'}</p>
              </td></tr>
            </table>
            <div style="margin-top:24px;text-align:center;">
              ${listing ? `<a href="${propertyUrl}" style="display:inline-block;padding:12px 28px;background:#b8935a;color:#fff;border-radius:4px;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">View Property</a>` : ''}
              <a href="mailto:${email}" style="display:inline-block;${listing ? 'margin-left:10px;' : ''}padding:12px 28px;background:#0f0f0e;color:#fff;border-radius:4px;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Reply to ${name.split(' ')[0]}</a>
            </div>
          </div>
        </div>`
    });

    // ── Email 2: Confirmation to the person who submitted ───────────────────
    const firstName = name.split(' ')[0];
    const confirmSubject = listing
      ? `Thanks for your interest in ${listing}, ${firstName}`
      : `Thanks for reaching out, ${firstName}`;

    const confirmEmailPromise = transporter.sendMail({
      from: fromAddress,
      to: `"${name}" <${email}>`,
      replyTo: adminEmail,
      subject: confirmSubject,
      html: `
        <div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;background:#faf8f4;">
          <div style="background:#0f0f0e;padding:40px 32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-family:Georgia,serif;font-size:30px;font-weight:400;letter-spacing:0.03em;">Austin TX Homes</h1>
            <p style="color:#b8935a;margin:10px 0 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;">Luke Allen &middot; Realtor</p>
          </div>
          <div style="background:#b8935a;height:2px;"></div>
          <div style="background:#fff;padding:44px 36px;">
            <p style="color:#1a1918;font-family:Georgia,serif;font-size:18px;line-height:1.5;margin:0 0 22px;">Hi ${firstName},</p>
            <p style="color:#1a1918;font-family:Georgia,serif;font-size:16px;line-height:1.75;margin:0 0 22px;">
              Thank you for reaching out${listing ? ` about <em style="color:#b8935a;font-style:italic;">${listing}</em>` : ''}. I received your message and will be in touch shortly, usually within a few hours during business hours.
            </p>
            ${(notes || message) ? `
            <div style="background:#faf8f4;border-left:3px solid #b8935a;padding:20px 24px;margin:28px 0;">
              <p style="color:#999690;font-family:Arial,sans-serif;font-size:10px;margin:0 0 10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Your Message</p>
              <p style="color:#5c5b57;font-family:Georgia,serif;font-size:15px;line-height:1.65;white-space:pre-wrap;margin:0;font-style:italic;">${notes || message}</p>
            </div>` : ''}
            <p style="color:#1a1918;font-family:Georgia,serif;font-size:16px;line-height:1.75;margin:22px 0 0;">
              In the meantime, feel free to browse current listings at <a href="${rawSiteUrl}" style="color:#b8935a;text-decoration:none;border-bottom:1px solid #b8935a;">austintxhomes.co</a>, or call or text me directly.
            </p>
            <p style="color:#1a1918;font-family:Georgia,serif;font-size:16px;margin:36px 0 0;">Talk soon,</p>
            <p style="color:#1a1918;font-family:Georgia,serif;font-size:24px;font-weight:400;font-style:italic;margin:8px 0 0;">Luke Allen</p>
            <p style="color:#999690;font-family:Arial,sans-serif;font-size:11px;margin:8px 0 0;letter-spacing:0.1em;">
              Austin TX Homes &middot; Licensed Texas Realtor &middot; TREC #788149
            </p>
            <p style="color:#5c5b57;font-family:Arial,sans-serif;font-size:13px;margin:14px 0 0;">
              <a href="tel:2547182567" style="color:#b8935a;text-decoration:none;font-weight:500;">(254) 718-2567</a>
              &nbsp;&middot;&nbsp;
              <a href="mailto:luke@austinmdg.com" style="color:#b8935a;text-decoration:none;font-weight:500;">luke@austinmdg.com</a>
            </p>
            <hr style="border:none;border-top:1px solid #e5dfd4;margin:36px 0 20px;" />
            <p style="color:#999690;font-family:Arial,sans-serif;font-size:11px;margin:0;line-height:1.6;">
              You're receiving this because you submitted a contact form at <a href="${rawSiteUrl}" style="color:#999690;text-decoration:underline;">austintxhomes.co</a>.
            </p>
          </div>
        </div>`
    });

    // The lead notification to Luke is the only must-succeed step. The
    // confirmation email going back to the submitter is best-effort — it'll fail
    // gracefully if the visitor typed a phone number into the "phone or email"
    // field (nodemailer rejects non-RFC addresses). Use allSettled so a failed
    // confirmation doesn't poison a real lead.
    const looksLikeEmail = /.+@.+\..+/.test(email || '');
    const sendConfirm = looksLikeEmail ? confirmEmailPromise : Promise.resolve({ skipped: true });

    // Forward to Realtor OS CRM in parallel with the emails. Best-effort — if
    // the CRM is down or rate-limited, the lead still lands in Luke's inbox.
    // Errors are logged only; the response never surfaces CRM failures.
    const crmPromise = forwardLeadToCrm({
      name,
      email,
      phone: phoneOut || '',
      type: deriveLeadType(req.body),
      source: source || 'austintxhomes.co',
      notes: buildRichNotes(req.body, phoneOut)
    });

    const [leadResult, confirmResult, crmResult] = await Promise.allSettled([
      leadEmailPromise, sendConfirm, crmPromise
    ]);

    if (leadResult.status === 'rejected') {
      console.error('[CONTACT] lead email failed:', leadResult.reason?.message || leadResult.reason);
      return res.status(500).json({ error: 'Failed to send lead notification' });
    }
    if (confirmResult.status === 'rejected') {
      console.warn('[CONTACT] confirmation email failed (lead still delivered):', confirmResult.reason?.message || confirmResult.reason);
    }
    if (crmResult.status === 'fulfilled' && crmResult.value?.ok) {
      console.log('[CRM webhook] lead forwarded ok:', name, '(' + email + ')');
    }
    // Non-ok CRM results already logged by forwardLeadToCrm itself.

    const isHtmlForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isHtmlForm) return res.redirect(303, (req.headers.referer || '/') + '?submitted=1');
    res.json({
      ok: true,
      confirmationSent: confirmResult.status === 'fulfilled' && !confirmResult.value?.skipped,
      crmForwarded: crmResult.status === 'fulfilled' && crmResult.value?.ok === true
    });
  } catch (err) {
    console.error('[CONTACT]', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
