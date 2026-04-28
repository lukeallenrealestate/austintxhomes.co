// Photo backfill worker — eagerly mirrors MLS photos to Cloudflare R2
// so every listing has photos before a user clicks. Runs as a 1-minute cron tick;
// each tick processes a small batch to avoid blocking the MLS rate budget.
//
// Priority order (handled by SQL ORDER BY in pickNextBatch):
//   1) photo[0] across all Active Austin listings (search-page hero coverage)
//   2) photo[0] across surrounding metro suburbs
//   3) photo[0] across other Active TX listings
//   4) photo[0] across recently-closed listings (old shared links)
//   5) photo[1], photo[2], … in same priority order (detail-page coverage)
//
// Lazy cache (the existing photo proxy) keeps running in parallel — both layers
// call the same r2Service.uploadPhoto(); R2 PUTs are idempotent, last writer wins.

const fetch = require('node-fetch');
const db = require('../db/database');
const r2Service = require('../services/r2');
const { throttle, isRecentlyRateLimited } = require('./throttle');

// Per-tick cap. AGGRESSIVELY reduced after MLS GRID suspended our API for hitting
// 8 RPS hourly average vs their 2 RPS limit. We now run at ~0.2 RPS (one photo
// every 5 seconds) and skip per-photo URL refresh entirely.
const BATCH_SIZE = 12;                 // 12 photos per ~30-min batch = 24/hour
const FETCH_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_BACKOFF_MS = 30000;   // 30s after a 429 before next photo
const EXTRA_BACKFILL_DELAY_MS = 4000;  // 4s extra delay between photos. Net ~5s/photo.

// Hard quota guard — count MLS-domain fetches per rolling hour and pause if
// we approach the warning limit (4 RPS = 14400/hr). We stay well below.
const MLS_DOMAIN_PATTERN = /api\.mlsgrid\.com/i;
const MLS_HOURLY_CAP = 1000;           // self-imposed hourly cap, very conservative
let mlsCallTimestamps = [];
function pruneOldTimestamps() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  mlsCallTimestamps = mlsCallTimestamps.filter(t => t > oneHourAgo);
}
function recordMlsCall() {
  mlsCallTimestamps.push(Date.now());
  pruneOldTimestamps();
}
function isOverHourlyCap() {
  pruneOldTimestamps();
  return mlsCallTimestamps.length >= MLS_HOURLY_CAP;
}

const METRO_SUBURBS = [
  'Westlake Hills', 'West Lake Hills', 'Pflugerville', 'Round Rock',
  'Cedar Park', 'Lakeway', 'Bee Cave', 'Leander', 'Manor', 'Buda', 'Kyle'
].map(c => `'${c}'`).join(',');

// Highest-priority listing with the lowest unmirrored photo index.
// Returns rows of { listing_key, photos, photos_r2, next_idx, total_photos }.
const pickNextBatch = db.prepare(`
  SELECT
    l.listing_key,
    l.photos,
    l.photos_r2,
    json_array_length(COALESCE(l.photos_r2, '[]')) AS next_idx,
    json_array_length(l.photos) AS total_photos
  FROM listings l
  WHERE l.mlg_can_view = 1
    AND l.photos IS NOT NULL
    AND l.photos != '[]'
    AND json_array_length(l.photos) > json_array_length(COALESCE(l.photos_r2, '[]'))
    AND NOT EXISTS (
      SELECT 1 FROM backfill_progress bp
      WHERE bp.listing_key = l.listing_key
        AND bp.photo_idx = json_array_length(COALESCE(l.photos_r2, '[]'))
        AND bp.status = 'failed_permanent'
    )
  ORDER BY
    json_array_length(COALESCE(l.photos_r2, '[]')) ASC,
    CASE
      WHEN l.city = 'Austin' AND l.standard_status = 'Active' THEN 1
      WHEN l.city IN (${METRO_SUBURBS}) AND l.standard_status = 'Active' THEN 2
      WHEN l.standard_status = 'Active' THEN 3
      WHEN l.close_date IS NOT NULL AND l.close_date >= date('now', '-30 days') THEN 4
      ELSE 5
    END,
    l.list_price DESC
  LIMIT ?
`);

const recordFailure = db.prepare(`
  INSERT INTO backfill_progress (listing_key, photo_idx, status, attempts, last_attempt_at, last_error)
  VALUES (?, ?, ?, 1, datetime('now'), ?)
  ON CONFLICT(listing_key, photo_idx) DO UPDATE SET
    status = excluded.status,
    attempts = backfill_progress.attempts + 1,
    last_attempt_at = excluded.last_attempt_at,
    last_error = excluded.last_error
`);

const getFailureCount = db.prepare(
  `SELECT attempts FROM backfill_progress WHERE listing_key = ? AND photo_idx = ?`
);

// Coverage stat for log lines — gives the user something concrete to watch.
const getCoverageSnapshot = db.prepare(`
  SELECT
    SUM(CASE WHEN json_array_length(COALESCE(photos_r2, '[]')) > 0 THEN 1 ELSE 0 END) AS hero_done,
    COUNT(*) AS total_with_photos
  FROM listings
  WHERE mlg_can_view = 1
    AND photos IS NOT NULL
    AND photos != '[]'
`);

let isRunning = false;

// Server.js timers (setInterval/setTimeout/cron) don't appear to fire reliably on
// this Replit deployment. We piggyback on the post-sync hook in mlsSync.js, which
// IS reliable, to drive the periodic jobs from inside runBatch instead.
let hasFiredStartupPing = false;
let hasFiredBulkUrlRefresh = false;
let lastHourlyEmailAt = 0;
const HOURLY_EMAIL_INTERVAL_MS = 55 * 60 * 1000; // 55 min — slightly under an hour to ensure we send when called every 30 min

async function maybeStartupPing() {
  if (hasFiredStartupPing) return;
  hasFiredStartupPing = true;
  try {
    await sendStartupPing();
  } catch (err) {
    console.warn('[BACKFILL-EMAIL] maybeStartupPing failed:', err.message);
  }
}

async function maybeHourlyEmail() {
  if (Date.now() - lastHourlyEmailAt < HOURLY_EMAIL_INTERVAL_MS) return;
  lastHourlyEmailAt = Date.now();
  try {
    await sendHourlyReport('opportunistic');
  } catch (err) {
    console.warn('[BACKFILL-EMAIL] maybeHourlyEmail failed:', err.message);
  }
}

// NOTE: bulk URL refresh was DISABLED after MLS suspended our API. It was paginating
// through 900+ MLS pages per server boot and contributed to the 8 RPS spike. The
// regular */30 sync already updates photos for new listings; old stale-URL listings
// will simply wait until MLS re-emits their PhotosChangeTimestamp.
async function maybeBulkUrlRefresh() {
  return; // intentionally disabled
}

async function runBatch(label = 'cron') {
  // Fire startup ping ASAP — independent of R2 state so we always know the server is alive.
  maybeStartupPing().catch(() => {});

  if (!r2Service.isEnabled()) {
    console.warn('[BACKFILL] R2 not enabled — skipping (set R2_* env vars)');
    return { skipped: true };
  }
  if (isRunning) {
    return { skipped: true, reason: 'already-running' };
  }
  // If MLS just rate-limited the regular sync, pause so we don't make it worse.
  if (isRecentlyRateLimited()) {
    console.log(`[BACKFILL] ${label} skipped: MLS rate-limited recently, backing off`);
    // Still send hourly email if it's time — backfill being paused doesn't mean we shouldn't report.
    maybeHourlyEmail().catch(() => {});
    return { skipped: true, reason: 'rate-limited' };
  }
  // Self-imposed hourly cap: stay well under MLS GRID's 7200/hr warning limit.
  if (isOverHourlyCap()) {
    console.log(`[BACKFILL] ${label} skipped: hourly MLS cap reached (${mlsCallTimestamps.length}/${MLS_HOURLY_CAP})`);
    maybeHourlyEmail().catch(() => {});
    return { skipped: true, reason: 'hourly-cap' };
  }
  isRunning = true;

  const startedAt = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Per-batch status histogram so we can SEE why photos fail in the logs.
  const failureStats = {};
  let bumpFail = (code) => { failureStats[code] = (failureStats[code] || 0) + 1; };

  try {
    const rows = pickNextBatch.all([BATCH_SIZE]);
    if (!rows.length) {
      // Steady-state no-op once backfill is fully caught up.
      console.log(`[BACKFILL] ${label} idle: nothing left to mirror`);
      return { processed: 0, succeeded: 0, failed: 0, idle: true };
    }

    console.log(`[BACKFILL] ${label} starting batch of ${rows.length} photos...`);

    for (const row of rows) {
      processed++;
      const idx = row.next_idx;
      try {
        await throttle();
        // Extra delay beyond the shared throttle — backfill is non-urgent so giving
        // MLS more breathing room reduces 429s for the regular sync.
        if (EXTRA_BACKFILL_DELAY_MS > 0) {
          await new Promise(r => setTimeout(r, EXTRA_BACKFILL_DELAY_MS));
        }
        const result = await fetchAndMirror(row.listing_key, idx, row.photos);
        if (result.ok) {
          succeeded++;
        } else {
          failed++;
          bumpFail(result.code || 'unknown');
          // Back off when MLS is rate-limiting us — extra wait beyond the throttle.
          if (result.code === 'HTTP 429') {
            await new Promise(r => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
          }
        }
      } catch (err) {
        failed++;
        bumpFail('threw');
        console.warn(`[BACKFILL] ${row.listing_key}/${idx} threw:`, err.message);
        try {
          recordFailure.run([row.listing_key, idx, 'failed_transient', err.message.slice(0, 500)]);
        } catch {}
      }
    }

    const cov = getCoverageSnapshot.get();
    const heroPct = cov.total_with_photos
      ? ((cov.hero_done / cov.total_with_photos) * 100).toFixed(1)
      : '0.0';
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    const failBreakdown = Object.entries(failureStats)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `${code}:${n}`)
      .join(' ');
    console.log(
      `[BACKFILL] ${label} batch: ${succeeded}✓ ${failed}✗ in ${elapsedSec}s | hero coverage ${cov.hero_done}/${cov.total_with_photos} (${heroPct}%)${failBreakdown ? ' | failures: ' + failBreakdown : ''}`
    );

    return { processed, succeeded, failed, heroDone: cov.hero_done, heroTotal: cov.total_with_photos };
  } finally {
    isRunning = false;
    // Opportunistic post-batch jobs — fire hourly email + bulk URL refresh from the
    // same hook that calls us, since server.js timers aren't firing on this Replit instance.
    maybeHourlyEmail().catch(() => {});
    // Run the bulk URL refresh AFTER we release isRunning so it can use the throttle.
    // Fire-and-forget — don't await, it can take many minutes.
    maybeBulkUrlRefresh().catch(() => {});
  }
}

// Returns { ok: true } on success, or { ok: false, code: 'HTTP 429' | 'CDN timeout' | ... } on failure.
async function fetchAndMirror(listingKey, photoIdx, photosJson) {
  let photos;
  try { photos = JSON.parse(photosJson) || []; } catch { return { ok: false, code: 'parse-error' }; }
  if (!Array.isArray(photos) || photoIdx >= photos.length) return { ok: false, code: 'no-url' };

  const url = photos[photoIdx];
  if (!url) return { ok: false, code: 'no-url' };

  // Per-photo timeout so a slow MLS CDN can't stall the batch.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Count this against our self-imposed hourly MLS quota if it hits the MLS domain.
    if (MLS_DOMAIN_PATTERN.test(url)) recordMlsCall();

    let res = await fetch(url, { signal: controller.signal });

    // 429 = MLS rate limit. Don't burn a refresh attempt; just back off and retry next batch.
    if (res.status === 429) {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', 'HTTP 429 rate-limited']);
      return { ok: false, code: 'HTTP 429' };
    }

    // NOTE: per-photo URL refresh is INTENTIONALLY DISABLED. It was making 2-3 MLS
    // API calls per failed photo and got our account suspended for exceeding 2 RPS.
    // Stale URLs (400/403/404) just record as transient failures here — the next
    // regular MLS sync naturally re-fetches photos when MLS reports updated
    // photos_change_timestamp, and the sync's INSERT...ON CONFLICT clears photos_r2
    // so they get re-mirrored on the next backfill pass.

    if (!res.ok) {
      const prior = getFailureCount.get([listingKey, photoIdx]);
      const attempts = (prior?.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed_permanent' : 'failed_transient';
      recordFailure.run([listingKey, photoIdx, status, `HTTP ${res.status}`]);
      return { ok: false, code: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.buffer();
    if (!buffer || !buffer.length) {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', 'empty buffer']);
      return { ok: false, code: 'empty-buffer' };
    }

    // r2Service.uploadPhoto persists the public URL into listings.photos_r2 via saveR2Url().
    const publicUrl = await r2Service.uploadPhoto(listingKey, photoIdx, buffer, contentType);
    return publicUrl ? { ok: true } : { ok: false, code: 'r2-upload-null' };
  } catch (err) {
    if (err.name === 'AbortError') {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', 'CDN timeout']);
      return { ok: false, code: 'CDN timeout' };
    }
    recordFailure.run([listingKey, photoIdx, 'failed_transient', err.message.slice(0, 500)]);
    return { ok: false, code: 'fetch-error' };
  } finally {
    clearTimeout(timer);
  }
}

// Lazy require to avoid circular deps with routes/properties.js.
// refreshListingPhotos is attached to the router export at the bottom of properties.js.
async function tryRefreshAndRefetch(listingKey, photoIdx, signal) {
  try {
    const router = require('../routes/properties');
    const refresh = router.refreshListingPhotos;
    if (typeof refresh !== 'function') return null;
    const fresh = await refresh(listingKey);
    if (!fresh || !fresh[photoIdx]) return null;
    return await fetch(fresh[photoIdx], { signal });
  } catch {
    return null;
  }
}

// ─── Hourly progress email ────────────────────────────────────────────────
// Sends a concise summary to ADMIN_EMAIL each hour. Suppresses itself once
// backfill is at steady state (no new listings finished since last email AND
// every listing has all photos cached) so you don't get spammed forever.

const getProgressStats = db.prepare(`
  SELECT
    COUNT(*) AS total_with_photos,
    SUM(CASE WHEN json_array_length(COALESCE(photos_r2, '[]')) >= 1 THEN 1 ELSE 0 END) AS hero_done,
    SUM(CASE WHEN json_array_length(COALESCE(photos_r2, '[]')) >= json_array_length(photos) THEN 1 ELSE 0 END) AS fully_done,
    SUM(json_array_length(photos)) AS photos_total,
    SUM(json_array_length(COALESCE(photos_r2, '[]'))) AS photos_cached
  FROM listings
  WHERE mlg_can_view = 1
    AND photos IS NOT NULL
    AND photos != '[]'
`);

const getCityProgress = db.prepare(`
  SELECT
    CASE
      WHEN city = 'Austin' AND standard_status = 'Active' THEN '1. Austin (Active)'
      WHEN city IN (${METRO_SUBURBS}) AND standard_status = 'Active' THEN '2. Metro suburbs (Active)'
      WHEN standard_status = 'Active' THEN '3. Other Active TX'
      WHEN close_date IS NOT NULL AND close_date >= date('now', '-30 days') THEN '4. Recently closed'
      ELSE '5. Older closed'
    END AS bucket,
    COUNT(*) AS total,
    SUM(CASE WHEN json_array_length(COALESCE(photos_r2, '[]')) >= 1 THEN 1 ELSE 0 END) AS hero_done,
    SUM(CASE WHEN json_array_length(COALESCE(photos_r2, '[]')) >= json_array_length(photos) THEN 1 ELSE 0 END) AS fully_done
  FROM listings
  WHERE mlg_can_view = 1 AND photos IS NOT NULL AND photos != '[]'
  GROUP BY bucket
  ORDER BY bucket
`);

const getEmailState = db.prepare(`SELECT backfill_last_email_count FROM sync_state WHERE id = 1`);
const setEmailState = db.prepare(`
  UPDATE sync_state SET backfill_last_email_count = ?, backfill_last_email_at = CURRENT_TIMESTAMP WHERE id = 1
`);

function pct(num, denom) {
  if (!denom) return '0.0%';
  return ((num / denom) * 100).toFixed(1) + '%';
}

function estimateRemaining(photosTotal, photosCached) {
  const remaining = photosTotal - photosCached;
  if (remaining <= 0) return 'complete';
  // 1.6 RPS = 5,760 photos/hr theoretical; assume ~80% effective due to retries/timeouts.
  const hours = remaining / 4600;
  if (hours < 1) return `~${Math.round(hours * 60)} minutes`;
  if (hours < 48) return `~${hours.toFixed(1)} hours`;
  return `~${(hours / 24).toFixed(1)} days`;
}

async function sendHourlyReport(reason = 'cron') {
  console.log(`[BACKFILL-EMAIL] sendHourlyReport called (reason=${reason})`);
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (!adminEmail) {
    console.warn('[BACKFILL-EMAIL] No ADMIN_EMAIL/EMAIL_FROM/EMAIL_USER set; skipping');
    return;
  }
  console.log(`[BACKFILL-EMAIL] adminEmail=${adminEmail}`);
  if (!r2Service.isEnabled()) {
    console.warn('[BACKFILL-EMAIL] R2 disabled — skipping email');
    return;
  }

  const stats = getProgressStats.get() || {};
  const buckets = getCityProgress.all() || [];
  const prior = (getEmailState.get() || {}).backfill_last_email_count;

  const fullyDone = stats.fully_done || 0;
  const total = stats.total_with_photos || 0;
  console.log(`[BACKFILL-EMAIL] stats: fullyDone=${fullyDone} total=${total} prior=${prior}`);

  // Suppress no-op emails: backfill is fully complete AND no new listings finished since last report.
  if (fullyDone === total && fullyDone === prior && reason === 'cron') {
    console.log('[BACKFILL-EMAIL] Suppressed: steady-state, no new completions since last email');
    return;
  }

  const heroDone = stats.hero_done || 0;
  const photosCached = stats.photos_cached || 0;
  const photosTotal = stats.photos_total || 0;
  const remaining = estimateRemaining(photosTotal, photosCached);
  const isFullyDone = fullyDone === total && total > 0;

  const subject = isFullyDone
    ? `[austintxhomes] Photo backfill 100% complete — ${fullyDone.toLocaleString()} listings done`
    : `[austintxhomes] Photo backfill — ${fullyDone.toLocaleString()} of ${total.toLocaleString()} listings have all photos (${pct(fullyDone, total)})`;

  const bucketRows = buckets.map(b => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${b.bucket}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${b.total.toLocaleString()}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${(b.hero_done || 0).toLocaleString()} (${pct(b.hero_done, b.total)})</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${(b.fully_done || 0).toLocaleString()} (${pct(b.fully_done, b.total)})</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;color:#1a1918;">
      <h2 style="margin:0 0 4px;font-family:Georgia,serif;font-weight:400;">${isFullyDone ? '100% complete' : 'Photo backfill progress'}</h2>
      <p style="margin:0 0 24px;color:#5c5b57;font-size:14px;">austintxhomes.co · IDX photo cache (Cloudflare R2 mirror)</p>

      <div style="background:#faf8f4;border:1px solid #e5dfd4;border-radius:6px;padding:18px 22px;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#b8935a;margin-bottom:8px;">Headline</div>
        <div style="font-size:22px;font-family:Georgia,serif;line-height:1.3;">
          <strong>${fullyDone.toLocaleString()}</strong> of <strong>${total.toLocaleString()}</strong> listings now have <em>every photo</em> cached.
        </div>
        <div style="margin-top:8px;font-size:14px;color:#5c5b57;">
          ${pct(fullyDone, total)} fully cached · ${pct(heroDone, total)} have at least their hero photo
        </div>
      </div>

      <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <thead>
          <tr style="background:#f5ede0;">
            <th align="left" style="padding:8px 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5c5b57;">Bucket</th>
            <th align="right" style="padding:8px 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5c5b57;">Listings</th>
            <th align="right" style="padding:8px 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5c5b57;">Hero photo</th>
            <th align="right" style="padding:8px 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5c5b57;">All photos</th>
          </tr>
        </thead>
        <tbody>${bucketRows}</tbody>
      </table>

      <div style="font-size:13px;color:#5c5b57;line-height:1.7;">
        <div><strong>Photos mirrored to R2:</strong> ${photosCached.toLocaleString()} / ${photosTotal.toLocaleString()} (${pct(photosCached, photosTotal)})</div>
        <div><strong>Estimated time to full coverage:</strong> ${remaining}</div>
      </div>

      ${isFullyDone ? `
        <div style="margin-top:24px;padding:16px;background:#eaf5e8;border:1px solid #b8d4b3;border-radius:6px;font-size:13px;color:#1a4d1a;">
          <strong>All caught up.</strong> You won't get more of these emails unless new listings come in and need backfilling.
        </div>` : `
        <p style="margin-top:24px;font-size:12px;color:#999690;">Next update in ~1 hour. Backfill runs continuously in the background.</p>`}
    </div>`;

  const text = isFullyDone
    ? `Photo backfill is 100% complete — ${fullyDone.toLocaleString()} listings done.`
    : `Photo backfill: ${fullyDone.toLocaleString()} of ${total.toLocaleString()} listings have all photos (${pct(fullyDone, total)}). Estimated ${remaining} remaining.`;

  try {
    const { sendMail } = require('../services/mailer');
    await sendMail({ to: adminEmail, subject, html, text });
    setEmailState.run([fullyDone]);
    console.log(`[BACKFILL-EMAIL] Sent hourly report to ${adminEmail}: ${fullyDone}/${total} listings fully cached`);
  } catch (err) {
    console.warn('[BACKFILL-EMAIL] Failed to send:', err.message);
  }
}

// One-shot email at server startup so we know the email pipeline is alive.
// If you stop seeing this on each redeploy, SMTP is broken (not the cron).
async function sendStartupPing() {
  console.log('[BACKFILL-EMAIL] sendStartupPing called');
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (!adminEmail) {
    console.warn('[BACKFILL-EMAIL] startup ping: no admin email configured');
    return;
  }
  try {
    const { sendMail } = require('../services/mailer');
    const cov = getCoverageSnapshot.get() || {};
    const r2On = r2Service.isEnabled();
    await sendMail({
      to: adminEmail,
      subject: `[austintxhomes] IDX server restarted — backfill is ${r2On ? 'live' : 'DISABLED (R2 off)'}`,
      text: `Server just restarted. R2 ${r2On ? 'enabled' : 'DISABLED'}. Hero coverage at boot: ${cov.hero_done || 0}/${cov.total_with_photos || 0} listings. You'll get an hourly progress email on the hour.`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;color:#1a1918;">
        <h2 style="font-family:Georgia,serif;font-weight:400;margin:0 0 6px;">IDX server restarted</h2>
        <p style="font-size:14px;color:#5c5b57;margin:0 0 18px;">austintxhomes.co · ${new Date().toISOString()}</p>
        <div style="background:#faf8f4;border:1px solid #e5dfd4;border-radius:6px;padding:14px 18px;font-size:14px;line-height:1.7;">
          <div><strong>R2 status:</strong> ${r2On ? '✓ enabled' : '✗ disabled — fix R2_* env vars'}</div>
          <div><strong>Hero coverage at boot:</strong> ${cov.hero_done || 0} / ${cov.total_with_photos || 0} listings</div>
        </div>
        <p style="font-size:12px;color:#999690;margin-top:16px;">Hourly progress emails will follow at the top of each hour.</p>
      </div>`
    });
    console.log(`[BACKFILL-EMAIL] startup ping sent to ${adminEmail}`);
  } catch (err) {
    console.warn('[BACKFILL-EMAIL] startup ping failed:', err.message);
  }
}

module.exports = { runBatch, sendHourlyReport, sendStartupPing };
