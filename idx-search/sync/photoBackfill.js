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
const { throttle } = require('./throttle');

// Per-tick cap. At 1.6 RPS, ~80 photos in a minute is the theoretical max,
// but we leave headroom in case other workers are also using the rate budget.
const BATCH_SIZE = 60;
const FETCH_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;

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

async function runBatch(label = 'cron') {
  if (!r2Service.isEnabled()) {
    console.warn('[BACKFILL] R2 not enabled — skipping (set R2_* env vars)');
    return { skipped: true };
  }
  if (isRunning) {
    return { skipped: true, reason: 'already-running' };
  }
  isRunning = true;

  const startedAt = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const rows = pickNextBatch.all([BATCH_SIZE]);
    if (!rows.length) {
      // Steady-state no-op once backfill is fully caught up.
      return { processed: 0, succeeded: 0, failed: 0, idle: true };
    }

    for (const row of rows) {
      processed++;
      const idx = row.next_idx;
      try {
        await throttle();
        const ok = await fetchAndMirror(row.listing_key, idx, row.photos);
        if (ok) succeeded++;
        else failed++;
      } catch (err) {
        failed++;
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
    console.log(
      `[BACKFILL] ${label} batch: ${succeeded}✓ ${failed}✗ in ${elapsedSec}s | hero coverage ${cov.hero_done}/${cov.total_with_photos} (${heroPct}%)`
    );

    return { processed, succeeded, failed, heroDone: cov.hero_done, heroTotal: cov.total_with_photos };
  } finally {
    isRunning = false;
  }
}

async function fetchAndMirror(listingKey, photoIdx, photosJson) {
  let photos;
  try { photos = JSON.parse(photosJson) || []; } catch { return false; }
  if (!Array.isArray(photos) || photoIdx >= photos.length) return false;

  const url = photos[photoIdx];
  if (!url) return false;

  // Per-photo timeout so a slow MLS CDN can't stall the batch.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let res = await fetch(url, { signal: controller.signal });

    // MLS signed URL expired — refresh once and retry.
    if (!res.ok && (res.status === 400 || res.status === 403 || res.status === 404)) {
      const fresh = await tryRefreshAndRefetch(listingKey, photoIdx, controller.signal);
      if (fresh) res = fresh;
    }

    if (!res.ok) {
      const prior = getFailureCount.get([listingKey, photoIdx]);
      const attempts = (prior?.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed_permanent' : 'failed_transient';
      recordFailure.run([listingKey, photoIdx, status, `HTTP ${res.status}`]);
      return false;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.buffer();
    if (!buffer || !buffer.length) {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', 'empty buffer']);
      return false;
    }

    // r2Service.uploadPhoto persists the public URL into listings.photos_r2 via saveR2Url().
    const publicUrl = await r2Service.uploadPhoto(listingKey, photoIdx, buffer, contentType);
    return !!publicUrl;
  } catch (err) {
    if (err.name === 'AbortError') {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', 'CDN timeout']);
    } else {
      recordFailure.run([listingKey, photoIdx, 'failed_transient', err.message.slice(0, 500)]);
    }
    return false;
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

async function sendHourlyReport() {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (!adminEmail) {
    console.warn('[BACKFILL-EMAIL] No ADMIN_EMAIL/EMAIL_FROM/EMAIL_USER set; skipping');
    return;
  }
  if (!r2Service.isEnabled()) return; // No R2 → no backfill running → no point reporting

  const stats = getProgressStats.get() || {};
  const buckets = getCityProgress.all() || [];
  const prior = (getEmailState.get() || {}).backfill_last_email_count;

  const fullyDone = stats.fully_done || 0;
  const total = stats.total_with_photos || 0;

  // Suppress no-op emails: backfill is fully complete AND no new listings finished since last report.
  if (fullyDone === total && fullyDone === prior) {
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

module.exports = { runBatch, sendHourlyReport };
