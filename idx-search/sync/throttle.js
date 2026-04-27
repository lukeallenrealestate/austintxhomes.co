// Shared MLS GRID rate limiter — used by both mlsSync.js and photoBackfill.js
// so the two workers share the same 1.6 RPS budget against MLS GRID's 2 RPS limit.

let lastRequestTime = 0;
const MIN_DELAY_MS = 600; // ~1.6 RPS, well under MLS GRID's 2 RPS cap

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

module.exports = { throttle, MIN_DELAY_MS };
