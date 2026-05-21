const express = require('express');
const router = express.Router();

// POST /api/contact
router.post('/', async (req, res) => {
  const {
    name, phone, message, listing, listingKey, listPrice,
    budget, timeline, neighborhood, source,
    company, capital, propertyType, strategy, notes, interestedDeal,
    contact
  } = req.body;
  const email = req.body.email || contact;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

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
              ${phone ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e5dfd4;">
                <span style="color:#999690;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Phone</span><br/>
                <a href="tel:${phone}" style="color:#b8935a;font-family:Georgia,serif;font-size:15px;text-decoration:none;">${phone}</a>
              </td></tr>` : ''}
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

    const [leadResult, confirmResult] = await Promise.allSettled([leadEmailPromise, sendConfirm]);

    if (leadResult.status === 'rejected') {
      console.error('[CONTACT] lead email failed:', leadResult.reason?.message || leadResult.reason);
      return res.status(500).json({ error: 'Failed to send lead notification' });
    }
    if (confirmResult.status === 'rejected') {
      console.warn('[CONTACT] confirmation email failed (lead still delivered):', confirmResult.reason?.message || confirmResult.reason);
    }

    const isHtmlForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isHtmlForm) return res.redirect(303, (req.headers.referer || '/') + '?submitted=1');
    res.json({ ok: true, confirmationSent: confirmResult.status === 'fulfilled' && !confirmResult.value?.skipped });
  } catch (err) {
    console.error('[CONTACT]', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
