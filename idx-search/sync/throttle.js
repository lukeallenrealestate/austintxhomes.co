// Shared MLS GRID rate limiter — used by both mlsSync.js and photoBackfill.js
// so the two workers share the same 1.6 RPS budget against MLS GRID's 2 RPS limit.

let lastRequestTime = 0;
let lastRateLimitTime = 0;
const MIN_DELAY_MS = 600; // ~1.6 RPS, well under MLS GRID's 2 RPS cap
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000; // backfill pauses for 30 min after a 429 (was 10)

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Called by mlsSync when MLS returns a 429. The backfill checks this flag and
// stops hammering MLS while the sync is being throttled — they share the budget.
function recordRateLimit() {
  lastRateLimitTime = Date.now();
}

function isRecentlyRateLimited() {
  return (Date.now() - lastRateLimitTime) < RATE_LIMIT_BACKOFF_MS;
}

module.exports = { throttle, MIN_DELAY_MS, recordRateLimit, isRecentlyRateLimited };
