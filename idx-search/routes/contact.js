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
      ? `New inquiry: ${listing}${price ? ' — ' + price : ''}`
      : `New lead from Austin TX Homes${source ? ' (' + source + ')' : ''}`;

    const row = (label, value) => value
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong style="color:#374151;">${label}</strong><br/><span style="color:#374151;">${value}</span></td></tr>`
      : '';

    // ── Email 1: Lead notification to Luke ──────────────────────────────────
    const leadEmailPromise = transporter.sendMail({
      from: fromAddress,
      to: adminEmail,
      replyTo: `"${name}" <${email}>`,
      subject,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
          <div style="background:#1877F2;padding:20px 28px;">
            <h2 style="color:#fff;margin:0;font-size:20px;">New Contact Form Submission</h2>
            ${source ? `<p style="color:#c7d9ff;margin:6px 0 0;font-size:13px;">Source: ${source}</p>` : ''}
          </div>
          <div style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${listing ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Property</strong><br/>
                <a href="${propertyUrl}" style="color:#1877F2;">${listing}${price ? ' — ' + price : ''}</a>
              </td></tr>` : ''}
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Name</strong><br/><span style="color:#374151;">${name}</span>
              </td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Email</strong><br/>
                <a href="mailto:${email}" style="color:#1877F2;">${email}</a>
              </td></tr>
              ${phone ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <strong style="color:#374151;">Phone</strong><br/>
                <a href="tel:${phone}" style="color:#1877F2;">${phone}</a>
              </td></tr>` : ''}
              ${row('Company / Fund', company)}
              ${row('Budget', budget)}
              ${row('Capital to Deploy', capital)}
              ${row('Timeline', timeline)}
              ${row('Neighborhood', neighborhood)}
              ${row('Property Type', propertyType)}
              ${row('Investment Strategy', strategy)}
              ${row('Interested Deal', interestedDeal)}
              <tr><td style="padding:8px 0;">
                <strong style="color:#374151;">Message</strong><br/>
                <p style="color:#374151;white-space:pre-wrap;margin:4px 0 0;">${notes || message || '(no message)'}</p>
              </td></tr>
            </table>
            <div style="margin-top:20px;">
              ${listing ? `<a href="${propertyUrl}" style="display:inline-block;padding:10px 20px;background:#1877F2;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;">View Property</a>` : ''}
              <a href="mailto:${email}" style="display:inline-block;${listing ? 'margin-left:10px;' : ''}padding:10px 20px;background:#f3f4f6;color:#374151;border-radius:6px;text-decoration:none;font-size:14px;">Reply to ${name}</a>
            </div>
          </div>
        </div>`
    });

    // ── Email 2: Confirmation to the person who submitted ───────────────────
    const firstName = name.split(' ')[0];
    const confirmSubject = listing
      ? `Got your question about ${listing} — I'll be in touch soon`
      : `Thanks for reaching out, ${firstName} — I'll be in touch soon`;

    const confirmEmailPromise = transporter.sendMail({
      from: fromAddress,
      to: `"${name}" <${email}>`,
      replyTo: adminEmail,
      subject: confirmSubject,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
          <div style="background:#1877F2;padding:20px 28px;">
            <h2 style="color:#fff;margin:0;font-size:20px;">Austin TX Homes</h2>
            <p style="color:#c7d9ff;margin:6px 0 0;font-size:13px;">luke@austinmdg.com · (512) 710-0455</p>
          </div>
          <div style="padding:28px;">
            <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi ${firstName},</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Thanks for reaching out${listing ? ` about <strong>${listing}</strong>` : ''}! I received your message and will follow up with you shortly — usually within a few hours during business hours.
            </p>
            ${(notes || message) ? `
            <div style="background:#f9fafb;border-left:3px solid #1877F2;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0;">
              <p style="color:#6b7280;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Your message</p>
              <p style="color:#374151;font-size:14px;white-space:pre-wrap;margin:0;">${notes || message}</p>
            </div>` : ''}
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:16px 0;">
              In the meantime, feel free to browse listings at <a href="${rawSiteUrl}" style="color:#1877F2;text-decoration:none;">austintxhomes.co</a> or call/text me directly.
            </p>
            <p style="color:#374151;font-size:15px;margin:24px 0 4px;">Talk soon,</p>
            <p style="color:#374151;font-size:15px;font-weight:600;margin:0;">Luke Allen</p>
            <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">Austin TX Homes · Realtor</p>
            <p style="color:#6b7280;font-size:13px;margin:2px 0 0;">
              <a href="tel:5127100455" style="color:#1877F2;text-decoration:none;">(512) 710-0455</a> ·
              <a href="mailto:luke@austinmdg.com" style="color:#1877F2;text-decoration:none;">luke@austinmdg.com</a>
            </p>
            <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              You're receiving this because you submitted a contact form at <a href="${rawSiteUrl}" style="color:#9ca3af;">austintxhomes.co</a>.
            </p>
          </div>
        </div>`
    });

    // Send both emails in parallel
    await Promise.all([leadEmailPromise, confirmEmailPromise]);

    const isHtmlForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isHtmlForm) return res.redirect(303, (req.headers.referer || '/') + '?submitted=1');
    res.json({ ok: true });
  } catch (err) {
    console.error('[CONTACT]', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
