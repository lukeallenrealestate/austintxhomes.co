// Shared MLS GRID rate limiter — used by mlsSync.js, photoBackfill.js, AND the
// photo proxy in routes/properties.js. All MLS-bound requests share this budget
// to stay under the 2 RPS limit and avoid suspension.

let lastRequestTime = 0;
let lastRateLimitTime = 0;
const MIN_DELAY_MS = 600; // ~1.6 RPS, well under MLS GRID's 2 RPS cap
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000; // backfill pauses for 30 min after a 429

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Called whenever MLS returns a 429. Triggers a 30-min pause on the backfill
// AND tells the photo proxy to stop hitting MLS until things cool off.
function recordRateLimit() {
  lastRateLimitTime = Date.now();
}

function isRecentlyRateLimited() {
  return (Date.now() - lastRateLimitTime) < RATE_LIMIT_BACKOFF_MS;
}

// Two-bucket hourly cap. All MLS-bound calls (sync, backfill, proxy, on-demand
// refresh) record to the same sliding-window timestamp list, but two different
// thresholds gate two different code paths:
//
//   MLS_HOURLY_CAP (1500) — hard ceiling. The user-facing photo proxy stops
//     hitting MLS at this number. We're well under MLS's 7,200/hr warning and
//     the daily 1500×24 = 36,000 stays under their 40,000/day rolling warning.
//
//   BACKFILL_HOURLY_CAP (800) — soft cap for background work. The backfill
//     stops scheduling new batches at this number, leaving the (1500−800)=700
//     calls/hour difference reserved for real user/bot photo proxy traffic.
//     Without this, the backfill (~400/hr) plus moderate bot crawl exhausts
//     the single shared 1500 bucket and users start seeing broken-photo
//     placeholders, which is what we just observed in production.
//
// Net effect: backfill self-throttles when traffic is hot, users always have
// at least 700/hr of headroom, MLS limits never breached.
const MLS_HOURLY_CAP = 1500;
const BACKFILL_HOURLY_CAP = 800;
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
function isOverBackfillCap() {
  pruneOldTimestamps();
  return mlsCallTimestamps.length >= BACKFILL_HOURLY_CAP;
}
function getMlsCallCount() {
  pruneOldTimestamps();
  return mlsCallTimestamps.length;
}

module.exports = {
  throttle,
  MIN_DELAY_MS,
  recordRateLimit,
  isRecentlyRateLimited,
  recordMlsCall,
  isOverHourlyCap,
  isOverBackfillCap,
  getMlsCallCount,
  MLS_HOURLY_CAP,
  BACKFILL_HOURLY_CAP
};
