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

// Hourly cap shared across all MLS-bound code paths — sync, backfill, and proxy.
// 1500/hr × 24 = 36,000/day, comfortably under MLS GRID's 40,000/day rolling
// warning. Throttle's 600ms gap still bounds sustained RPS at 1.667 (under
// MLS's 4 RPS warning), so peak burst behavior is unchanged — this just gives
// the backfill more headroom to keep running when bot/user proxy traffic spikes.
const MLS_HOURLY_CAP = 1500;
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
  getMlsCallCount,
  MLS_HOURLY_CAP
};
