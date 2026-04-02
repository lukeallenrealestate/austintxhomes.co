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
    const subject = listing
      ? `New inquiry: ${listing}${price ? ' — ' + price : ''}`
      : `New lead from Austin TX Homes${source ? ' (' + source + ')' : ''}`;

    const row = (label, value) => value
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong style="color:#374151;">${label}</strong><br/><span style="color:#374151;">${value}</span></td></tr>`
      : '';

    await transporter.sendMail({
      from: `"Austin TX Homes" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER,
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

    const isHtmlForm = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isHtmlForm) return res.redirect(303, (req.headers.referer || '/') + '?submitted=1');
    res.json({ ok: true });
  } catch (err) {
    console.error('[CONTACT]', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
