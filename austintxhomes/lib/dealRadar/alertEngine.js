// Deal Radar alert engine
// Manages alert subscriptions and sends email notifications when new deals match.
//
// Email transport: SendGrid (via SENDGRID_API_KEY env var)
//   Falls back to console logging in development if no key is set.
//
// Alert storage: data/dealAlerts.json (file-based, no DB required)
// Alert check runs every 2 hours via setInterval after server start.

const fs   = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, '../../data/dealAlerts.json');

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadAlerts() {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveAlerts(alerts) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
function createAlert({ email, name, minScore = 70, maxPrice, city, subType, badgeType }) {
  if (!email || !email.includes('@')) throw new Error('Valid email required');

  const alerts = loadAlerts();

  // Limit: max 3 alerts per email address
  const existing = alerts.filter(a => a.email.toLowerCase() === email.toLowerCase());
  if (existing.length >= 3) throw new Error('Maximum 3 alerts per email address');

  const alert = {
    id:          genId(),
    email:       email.toLowerCase().trim(),
    name:        (name || '').trim() || 'My Deal Alert',
    minScore:    Number(minScore) || 70,
    maxPrice:    maxPrice ? Number(maxPrice) : null,
    city:        city     || null,
    subType:     subType  || null,
    badgeType:   badgeType|| null,
    createdAt:   new Date().toISOString(),
    lastChecked: null,
    lastSentAt:  null,
    lastSentKeys:[],  // listing keys included in last email
    active:      true,
  };

  alerts.push(alert);
  saveAlerts(alerts);
  return alert;
}

function getAlertsByEmail(email) {
  return loadAlerts().filter(a => a.email.toLowerCase() === email.toLowerCase() && a.active);
}

function deleteAlert(id, email) {
  const alerts = loadAlerts();
  const idx    = alerts.findIndex(a => a.id === id && a.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return false;
  alerts.splice(idx, 1);
  saveAlerts(alerts);
  return true;
}

// ── Email sending ─────────────────────────────────────────────────────────────
async function sendAlertEmail(alert, deals) {
  if (!deals || deals.length === 0) return;

  const SENDGRID_KEY    = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL      = process.env.ALERT_FROM_EMAIL || 'alerts@austintxhomes.co';
  const FROM_NAME       = process.env.ALERT_FROM_NAME  || 'Luke Allen · AustinTXHomes';
  const BASE_URL        = process.env.SITE_URL          || 'https://austintxhomes.co';

  function fmt$(n) {
    if (!n) return '';
    if (n >= 1000000) return '$' + (n/1000000).toFixed(2).replace(/\.?0+$/,'') + 'M';
    return '$' + Math.round(n/1000) + 'K';
  }

  function scoreColor(s) {
    if (s >= 90) return '#27ae60';
    if (s >= 75) return '#b8935a';
    if (s >= 60) return '#2980b9';
    return '#888';
  }

  // Build HTML email body
  const dealRows = deals.slice(0, 5).map(d => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0ebe2">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:72px;vertical-align:top;padding-right:12px">
              ${d.photos && d.photos[0]
                ? `<img src="${d.photos[0]}" width="72" height="54" style="border-radius:4px;object-fit:cover;display:block" />`
                : '<div style="width:72px;height:54px;background:#1a1918;border-radius:4px"></div>'}
            </td>
            <td style="vertical-align:top">
              <div style="font-weight:600;font-size:15px;color:#1a1918">${fmt$(d.list_price)}</div>
              <div style="font-size:12px;color:#666;margin-top:2px">${d.address || ''}${d.city ? ', ' + d.city : ''}</div>
              <div style="margin-top:6px">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background:${scoreColor(d.dealScore)}">
                  Score ${d.dealScore}
                </span>
                ${(d.badges||[]).slice(0,2).map(b=>`<span style="display:inline-block;margin-left:4px;padding:2px 6px;border-radius:3px;font-size:10px;background:#f5ede0;color:#b8935a;font-weight:600">${b.label}</span>`).join('')}
              </div>
              ${d.reasons && d.reasons[0] ? `<div style="font-size:11px;color:#888;margin-top:4px">${d.reasons[0]}</div>` : ''}
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap">
              <a href="${BASE_URL}/deal-radar/${d.listing_key}" style="font-size:11px;color:#b8935a;text-decoration:none">View →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  const unsubLink = `${BASE_URL}/deal-radar?unsubscribe=${alert.id}&email=${encodeURIComponent(alert.email)}`;
  const filterSummary = [
    alert.minScore  && `Score ${alert.minScore}+`,
    alert.maxPrice  && `Under ${fmt$(alert.maxPrice)}`,
    alert.city      && alert.city,
    alert.subType   && alert.subType,
  ].filter(Boolean).join(' · ') || 'All deals';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f4;font-family:Inter,system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e2d8">

        <!-- Header -->
        <tr><td style="background:#0f0f0e;padding:24px 28px">
          <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;margin-bottom:6px">AustinTXHomes</div>
          <div style="font-family:Georgia,serif;font-size:22px;color:#fff;font-weight:400">Deal Radar Alert</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px">${deals.length} new match${deals.length !== 1 ? 'es' : ''} · ${filterSummary}</div>
        </td></tr>

        <!-- Intro -->
        <tr><td style="padding:20px 28px 12px">
          <p style="font-size:13px;color:#555;line-height:1.7;margin:0">
            Hi${alert.name !== 'My Deal Alert' ? ' — your alert <strong>"' + alert.name + '"</strong>' : ''},
            ${deals.length} Austin listing${deals.length !== 1 ? 's' : ''} matched your Deal Radar criteria.
            These are algorithmic screening results only — always verify independently before acting.
          </p>
        </td></tr>

        <!-- Deals table -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">${dealRows}</table>
        </td></tr>

        ${deals.length > 5 ? `<tr><td style="padding:12px 28px;text-align:center">
          <a href="${BASE_URL}/deal-radar" style="font-size:12px;color:#b8935a;text-decoration:none">View all ${deals.length} matches on Deal Radar →</a>
        </td></tr>` : ''}

        <!-- CTA -->
        <tr><td style="padding:20px 28px;border-top:1px solid #f0ebe2;text-align:center">
          <a href="${BASE_URL}/deal-radar" style="display:inline-block;padding:10px 24px;background:#b8935a;color:#fff;border-radius:4px;font-size:13px;font-weight:600;text-decoration:none">
            Open Deal Radar
          </a>
        </td></tr>

        <!-- Disclaimer -->
        <tr><td style="padding:16px 28px;background:#faf8f4;border-top:1px solid #f0ebe2">
          <p style="font-size:10px;color:#aaa;line-height:1.6;margin:0">
            Deal Scores are algorithmic screening results for informational purposes only. They do not guarantee value, condition, or legal development potential.
            Always verify condition, title, zoning, and all financial assumptions independently.<br><br>
            <a href="${unsubLink}" style="color:#aaa;text-decoration:underline">Unsubscribe from this alert</a> ·
            Luke Allen · TREC #788149 · Austin MDG Realty
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = `Deal Radar: ${deals.length} new match${deals.length !== 1 ? 'es' : ''} in Austin${alert.city ? ' · ' + alert.city : ''}`;

  // Send via SendGrid
  if (SENDGRID_KEY) {
    const https = require('https');
    const body  = JSON.stringify({
      personalizations: [{ to: [{ email: alert.email }] }],
      from:    { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: 'text/html', value: html }],
    });

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.sendgrid.com',
        path:     '/v3/mail/send',
        method:   'POST',
        headers:  {
          'Authorization': `Bearer ${SENDGRID_KEY}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`SendGrid ${res.statusCode}: ${d}`));
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    console.log(`[Deal Radar] Alert sent to ${alert.email} (${deals.length} matches)`);
  } else {
    // Development fallback — log to console
    console.log(`[Deal Radar] ALERT (no SENDGRID_API_KEY) → ${alert.email}: ${deals.length} deals`);
    deals.slice(0, 3).forEach(d =>
      console.log(`  - ${d.dealScore} | ${d.address} | ${d.list_price ? '$' + d.list_price.toLocaleString() : ''}`)
    );
  }
}

// ── Alert matching ────────────────────────────────────────────────────────────
/**
 * Check all active alerts against the current deal pool.
 * Sends emails for new matches (keys not seen in lastSentKeys).
 * getDeals is the dealEngine.getDeals function, passed to avoid circular require.
 */
async function runAlertCheck(getDeals) {
  const alerts = loadAlerts().filter(a => a.active);
  if (!alerts.length) return;

  console.log(`[Deal Radar] Running alert check for ${alerts.length} active alerts…`);

  for (const alert of alerts) {
    try {
      const result = await getDeals({
        minScore:  alert.minScore,
        maxPrice:  alert.maxPrice  || undefined,
        city:      alert.city      || undefined,
        subType:   alert.subType   || undefined,
        badgeType: alert.badgeType || undefined,
        page:      1,
        limit:     20,
      });

      const allAlerts  = loadAlerts();
      const alertRef   = allAlerts.find(a => a.id === alert.id);
      if (!alertRef) continue;

      // Find deals not yet emailed
      const prevKeys = new Set(alertRef.lastSentKeys || []);
      const newDeals = result.items.filter(d => !prevKeys.has(d.listing_key));

      alertRef.lastChecked = new Date().toISOString();

      if (newDeals.length > 0) {
        await sendAlertEmail(alert, newDeals);
        alertRef.lastSentAt   = new Date().toISOString();
        alertRef.lastSentKeys = result.items.map(d => d.listing_key); // track all current matches
      }

      saveAlerts(allAlerts);
    } catch (err) {
      console.error(`[Deal Radar] Alert check error for ${alert.email}:`, err.message);
    }
  }
}

// ── Scheduled check ───────────────────────────────────────────────────────────
let _checkTimer = null;
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // every 2 hours

function startScheduledChecks(getDeals) {
  if (_checkTimer) return;
  // First run after 10 minutes (let server warm up)
  setTimeout(() => {
    runAlertCheck(getDeals).catch(e => console.error('[Deal Radar] Alert check failed:', e.message));
    _checkTimer = setInterval(() => {
      runAlertCheck(getDeals).catch(e => console.error('[Deal Radar] Alert check failed:', e.message));
    }, CHECK_INTERVAL_MS);
  }, 10 * 60 * 1000);

  console.log('[Deal Radar] Alert scheduler started (checks every 2 hours)');
}

module.exports = {
  createAlert,
  getAlertsByEmail,
  deleteAlert,
  runAlertCheck,
  startScheduledChecks,
};
