'use strict';

/**
 * IndexNow integration.
 *
 * IndexNow is a real-time URL notification protocol. When we ping the API
 * with URLs we've just updated, Bing and Yandex crawl them within minutes
 * and re-index. Google doesn't consume IndexNow directly, but AI answer
 * engines (ChatGPT web, Perplexity, DuckDuckGo) all source from Bing's
 * index, so a fast Bing recrawl feeds all of them.
 *
 * Protocol: host a key file at https://austintxhomes.co/{KEY}.txt whose
 * body is exactly the key. POST { host, key, keyLocation, urlList } to
 * api.indexnow.org/indexnow. Bing owns the endpoint.
 *
 * Key file exposure: the /{key}.txt route in server.js serves the key.
 * The key itself is public, it's a domain-ownership proof, not a secret,
 * so committing it is fine.
 */

const HOST = 'austintxhomes.co';
const KEY  = 'a3f7b2e91c4d8f6b5e0a2c7d9f1e4b6a';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// Recent-ping ringbuffer so a bug that would spam IndexNow can't take out
// our reputation with Bing. Same URL within 10 min is dropped.
const RECENT = new Map();
const DEDUPE_MS = 10 * 60 * 1000;

function scrubUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    let u = raw.trim();
    if (!u) continue;
    if (u.startsWith('/')) u = `https://${HOST}${u}`;
    if (!/^https:\/\/austintxhomes\.co\//.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    const last = RECENT.get(u);
    if (last && Date.now() - last < DEDUPE_MS) continue;
    RECENT.set(u, Date.now());
    out.push(u);
  }
  // Bing caps a single submission at 10K URLs. We'll never be close, but
  // trim defensively.
  return out.slice(0, 10000);
}

async function pingIndexNow(urls, opts = {}) {
  const urlList = scrubUrls(Array.isArray(urls) ? urls : [urls]);
  if (!urlList.length) return { ok: true, sent: 0, skipped: 'no-fresh-urls' };
  const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };
  try {
    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    // IndexNow returns 200/202 on success. 4xx means malformed / bad key.
    // 5xx is transient on their end; we'll retry on next update.
    const ok = resp.status >= 200 && resp.status < 300;
    if (!ok) console.warn(`[indexnow] ${resp.status} on ${urlList.length} urls (${opts.source || 'unknown'})`);
    else console.log(`[indexnow] ✓ ${urlList.length} urls submitted (${opts.source || 'unknown'})`);
    return { ok, sent: urlList.length, status: resp.status };
  } catch (e) {
    console.warn('[indexnow] ping failed:', e.message);
    return { ok: false, sent: 0, error: e.message };
  }
}

module.exports = { pingIndexNow, KEY, KEY_LOCATION };
