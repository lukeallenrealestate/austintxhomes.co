// Google Indexing API — notifies Google of new/updated listing pages
// so they get crawled and indexed within minutes instead of days.
//
// Auth: tries env vars first (for Replit), falls back to ~/.config/gsc/ files (local dev).
// Requires: Google Cloud "Web Search Indexing API" enabled + OAuth scope indexing.
const fs = require('fs');
const path = require('path');
const os = require('os');

const INDEXING_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const BATCH_ENDPOINT = 'https://indexing.googleapis.com/batch';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITE_ORIGIN = process.env.SITE_URL?.replace(/\/$/, '') || 'https://austintxhomes.co';

let clientId, clientSecret, refreshToken;
let accessToken = null;
let tokenExpiry = 0;

// Load credentials
function loadCredentials() {
  // Priority 1: env vars (Replit production)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    clientId = process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    return true;
  }

  // Priority 2: file-based credentials (local dev)
  try {
    const cfgDir = path.join(os.homedir(), '.config', 'gsc');
    const creds = JSON.parse(fs.readFileSync(path.join(cfgDir, 'client.json'), 'utf8')).installed;
    const tok = JSON.parse(fs.readFileSync(path.join(cfgDir, 'token.json'), 'utf8'));
    clientId = creds.client_id;
    clientSecret = creds.client_secret;
    refreshToken = tok.refresh_token;
    return true;
  } catch {
    return false;
  }
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return accessToken;
}

// Notify Google of a single URL (new or updated)
async function notifyUrl(url) {
  const token = await getAccessToken();
  const res = await fetch(INDEXING_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ url, type: 'URL_UPDATED' })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Indexing API error (${res.status}): ${text}`);
  }

  return res.json();
}

// Notify Google of multiple URLs (batched — up to 100 per call, 200/day quota)
async function notifyUrls(urls) {
  if (!urls.length) return { sent: 0, errors: [] };
  if (!loadCredentials()) {
    console.log('[INDEXING] No Google credentials configured — skipping');
    return { sent: 0, errors: ['no credentials'] };
  }

  const results = { sent: 0, errors: [] };

  // Process in chunks of 40 to stay well under quota + rate limits
  for (let i = 0; i < urls.length; i += 40) {
    const batch = urls.slice(i, i + 40);
    for (const url of batch) {
      try {
        await notifyUrl(url);
        results.sent++;
      } catch (err) {
        const msg = err.message || '';
        results.errors.push(`${url}: ${msg.slice(0, 200)}`);
        if (msg.includes('429')) {
          console.warn('[INDEXING] Rate limit hit — stopping batch');
          return results;
        }
        if (msg.includes('403') && msg.includes('SERVICE_DISABLED')) {
          console.warn('[INDEXING] Indexing API not enabled in Google Cloud — skipping');
          return results;
        }
      }
      // Small delay between calls to be polite
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

// Build the canonical listing URL from a listing record
function listingUrl(listing) {
  const addr = listing.unparsed_address || '';
  const key = listing.listing_key || '';
  if (!addr || !key) return null;

  // Slugify address: "123 Main St, Austin, TX 78704" → "123-main-st-austin-tx-78704"
  const slug = addr.toLowerCase()
    .replace(/[,#.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${SITE_ORIGIN}/property/${slug}-${key}`;
}

module.exports = { notifyUrls, listingUrl, loadCredentials };
