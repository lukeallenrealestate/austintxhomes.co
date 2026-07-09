#!/usr/bin/env node
/**
 * Barton Hills 2026 Market Report — Deep Data Extraction
 *
 * Filter: elementary_school = 'Barton Hills' (the cleanest geographic
 * boundary for the neighborhood — 78704 is too broad, subdivision names
 * are inconsistent, but the AISD Barton Hills Elementary attendance zone
 * IS Barton Hills the neighborhood).
 *
 * Run: node austintxhomes/scripts/barton-hills-2026-analysis.js
 */
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, '..', '..', 'idx-search', 'db', 'idx.db');
const NOW = new Date('2026-06-08').getTime();

function q(sql) {
  const out = execSync(`sqlite3 -json "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`, {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8'
  });
  return out.trim() ? JSON.parse(out) : [];
}

function pct(n, d) { return d ? (n / d * 100) : 0; }
function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function percentile(arr, p) {
  const a = arr.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const idx = Math.ceil((p / 100) * a.length) - 1;
  return a[Math.max(0, idx)];
}
function mean(arr) { return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0; }
function fmt$(n) { return '$' + Math.round(n).toLocaleString(); }
function fmtSqft(n) { return Math.round(n).toLocaleString(); }
function daysBetween(a, b) { return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24))); }

console.log('Loading Barton Hills records (elementary_school filter)...');
const ALL = q(`SELECT * FROM listings WHERE elementary_school = 'Barton Hills' AND property_type = 'Residential' AND property_sub_type IN ('Single Family Residence','Condominium','Townhouse')`);

const SFR = ALL.filter(r => r.property_sub_type === 'Single Family Residence');
const CONDO = ALL.filter(r => r.property_sub_type === 'Condominium');
const TH = ALL.filter(r => r.property_sub_type === 'Townhouse');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  BARTON HILLS 2026 DEEP MARKET ANALYSIS');
console.log('  Elementary School zone: Barton Hills (AISD)');
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log(`Total residential records: ${ALL.length}`);
console.log(`  Single Family: ${SFR.length}`);
console.log(`  Condo: ${CONDO.length}`);
console.log(`  Townhouse: ${TH.length}`);
console.log();

// ZIP distribution
console.log('── ZIP CODE DISTRIBUTION (all residential) ──');
const zipMap = {};
ALL.forEach(r => { zipMap[r.postal_code] = (zipMap[r.postal_code] || 0) + 1; });
Object.entries(zipMap).forEach(([k, v]) => console.log(`  ${k.padEnd(10)} ${v}`));
console.log();

// Middle/high school feeders
console.log('── SCHOOL FEEDER PATTERNS ──');
const feederMap = {};
ALL.forEach(r => {
  const key = `${r.middle_school || '?'} → ${r.high_school || '?'}`;
  feederMap[key] = (feederMap[key] || 0) + 1;
});
Object.entries(feederMap).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(35)} ${v}`));
console.log();

console.log('── STATUS DISTRIBUTION (SFR only) ──');
const statusMap = {};
SFR.forEach(r => { statusMap[r.standard_status] = (statusMap[r.standard_status] || 0) + 1; });
Object.entries(statusMap).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(28)} ${v}`);
});
console.log();

const ACTIVE_SFR = SFR.filter(r => r.standard_status === 'Active');
const PENDING_SFR = SFR.filter(r => ['Pending','Active Under Contract'].includes(r.standard_status));
const CLOSED_SFR = SFR.filter(r => r.standard_status === 'Closed' && r.close_price > 100000);

console.log(`Active SFR for sale:        ${ACTIVE_SFR.length}`);
console.log(`In escrow (Pending+AUC):    ${PENDING_SFR.length}`);
console.log(`Closed sales (>$100k):      ${CLOSED_SFR.length}`);
console.log();

// ─── ACTIVE INVENTORY ──────────────────────────────────────────────
console.log('── ACTIVE INVENTORY (SFR for sale) ──');
const activePrices = ACTIVE_SFR.map(r => r.list_price).filter(p => p > 0);
const activeSqft = ACTIVE_SFR.filter(r => r.living_area > 0 && r.list_price > 0);
const activePPSqft = activeSqft.map(r => r.list_price / r.living_area);

if (activePrices.length) {
  console.log(`Active count:               ${ACTIVE_SFR.length}`);
  console.log(`Median list price:          ${fmt$(median(activePrices))}`);
  console.log(`Mean list price:            ${fmt$(mean(activePrices))}`);
  console.log(`25th pct list:              ${fmt$(percentile(activePrices, 25))}`);
  console.log(`75th pct list:              ${fmt$(percentile(activePrices, 75))}`);
  console.log(`90th pct list:              ${fmt$(percentile(activePrices, 90))}`);
  console.log(`Lowest active:              ${fmt$(Math.min(...activePrices))}`);
  console.log(`Highest active:             ${fmt$(Math.max(...activePrices))}`);
  console.log(`Median $/sqft (active):     $${Math.round(median(activePPSqft))}/sqft`);
  console.log(`Mean $/sqft (active):       $${Math.round(mean(activePPSqft))}/sqft`);
}
console.log();

// ─── DOM ───────────────────────────────────────────────────────────
console.log('── DAYS ON MARKET (calculated) ──');
const activeWithDate = ACTIVE_SFR.filter(r => r.listing_contract_date);
const activeDOMs = activeWithDate.map(r => daysBetween(new Date(r.listing_contract_date).getTime(), NOW));
console.log(`Active median DOM:          ${median(activeDOMs)} days`);
console.log(`Active mean DOM:            ${Math.round(mean(activeDOMs))} days`);
console.log(`Active <14 days:            ${activeDOMs.filter(d => d < 14).length}`);
console.log(`Active 14-30 days:          ${activeDOMs.filter(d => d >= 14 && d < 30).length}`);
console.log(`Active 30-60 days:          ${activeDOMs.filter(d => d >= 30 && d < 60).length}`);
console.log(`Active 60-90 days:          ${activeDOMs.filter(d => d >= 60 && d < 90).length}`);
console.log(`Active 90+ days (stale):    ${activeDOMs.filter(d => d >= 90).length}`);
console.log();

// ─── CLOSED ANALYSIS ───────────────────────────────────────────────
console.log('── CLOSED SALES ──');
if (CLOSED_SFR.length) {
  const closedPrices = CLOSED_SFR.map(r => r.close_price);
  const closedListPrices = CLOSED_SFR.map(r => r.list_price);
  const ratios = CLOSED_SFR.filter(r => r.list_price > 0 && r.close_price > 0).map(r => r.close_price / r.list_price);
  const closedDOMs = CLOSED_SFR.filter(r => r.listing_contract_date && r.close_date).map(r => daysBetween(new Date(r.listing_contract_date).getTime(), new Date(r.close_date).getTime()));

  console.log(`Closed count:               ${CLOSED_SFR.length}`);
  console.log(`Median close price:         ${fmt$(median(closedPrices))}`);
  console.log(`Mean close price:           ${fmt$(mean(closedPrices))}`);
  console.log(`Median list price:          ${fmt$(median(closedListPrices))}`);
  console.log(`Median list-to-close:       ${(median(ratios) * 100).toFixed(1)}%`);
  console.log(`Mean list-to-close:         ${(mean(ratios) * 100).toFixed(1)}%`);
  console.log(`Closed >= 100% of list:     ${ratios.filter(r => r >= 1).length}`);
  console.log(`Closed <= 95% of list:      ${ratios.filter(r => r <= 0.95).length}`);
  if (closedDOMs.length) {
    console.log(`Median DOM (list-to-close): ${median(closedDOMs)} days`);
    console.log(`Mean DOM (list-to-close):   ${Math.round(mean(closedDOMs))} days`);
  }

  const closedWithSqft = CLOSED_SFR.filter(r => r.living_area > 0 && r.close_price > 0);
  const closedPPSqft = closedWithSqft.map(r => r.close_price / r.living_area);
  console.log(`Median closed $/sqft:       $${Math.round(median(closedPPSqft))}/sqft`);
  console.log(`Mean closed $/sqft:         $${Math.round(mean(closedPPSqft))}/sqft`);
}
console.log();

// ─── ERA ───────────────────────────────────────────────────────────
console.log('── PRICE/SQFT BY ERA (active SFR) ──');
function bucket(y) {
  if (!y) return 'Unknown';
  if (y < 1945) return 'Pre-WWII (<1945)';
  if (y < 1980) return 'Mid-Century (1945-1979)';
  if (y < 2011) return 'Modern (1980-2010)';
  return 'New Build (2011+)';
}
const eras = {};
ACTIVE_SFR.forEach(r => {
  if (!r.living_area || !r.list_price || !r.year_built) return;
  const b = bucket(r.year_built);
  (eras[b] = eras[b] || []).push({
    price: r.list_price,
    ppsf: r.list_price / r.living_area,
    sqft: r.living_area,
    year: r.year_built
  });
});
Object.entries(eras).sort((a, b) => a[0].localeCompare(b[0])).forEach(([era, recs]) => {
  console.log(`  ${era.padEnd(25)} n=${String(recs.length).padStart(3)}  med $/sqft: $${Math.round(median(recs.map(r => r.ppsf)))}  med price: ${fmt$(median(recs.map(r => r.price)))}  med sqft: ${fmtSqft(median(recs.map(r => r.sqft)))}`);
});
console.log();

// ─── PRICE TIERS ───────────────────────────────────────────────────
console.log('── ACTIVE SFR BY PRICE TIER ──');
const tiers = [
  { name: 'Sub-$750K',           min: 0,        max: 750000 },
  { name: '$750K-$1M',           min: 750000,   max: 1000000 },
  { name: '$1M-$1.5M',           min: 1000000,  max: 1500000 },
  { name: '$1.5M-$2M',           min: 1500000,  max: 2000000 },
  { name: '$2M-$3M',             min: 2000000,  max: 3000000 },
  { name: '$3M-$5M',             min: 3000000,  max: 5000000 },
  { name: '$5M+',                min: 5000000,  max: Infinity },
];
tiers.forEach(t => {
  const r = ACTIVE_SFR.filter(x => x.list_price >= t.min && x.list_price < t.max);
  if (!r.length) return;
  const sqfts = r.filter(x => x.living_area).map(x => x.living_area);
  const ppsf = r.filter(x => x.living_area && x.list_price).map(x => x.list_price / x.living_area);
  const beds = r.filter(x => x.bedrooms_total).map(x => x.bedrooms_total);
  console.log(`  ${t.name.padEnd(18)} n=${String(r.length).padStart(3)}  med $/sqft: $${Math.round(median(ppsf))}  med sqft: ${fmtSqft(median(sqfts))}  med beds: ${median(beds)}`);
});
console.log();

// ─── BEDROOMS ──────────────────────────────────────────────────────
console.log('── BEDROOM COUNT (active SFR) ──');
const byBeds = {};
ACTIVE_SFR.forEach(r => {
  if (!r.bedrooms_total || !r.list_price) return;
  (byBeds[r.bedrooms_total] = byBeds[r.bedrooms_total] || []).push(r);
});
Object.entries(byBeds).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([beds, recs]) => {
  const prices = recs.map(r => r.list_price);
  const sqfts = recs.filter(r => r.living_area).map(r => r.living_area);
  console.log(`  ${beds}BR  n=${String(recs.length).padStart(3)}  med price: ${fmt$(median(prices))}  med sqft: ${fmtSqft(median(sqfts))}`);
});
console.log();

// ─── POOL ──────────────────────────────────────────────────────────
console.log('── POOL PREMIUM ──');
const withPool = ACTIVE_SFR.filter(r =>
  r.pool_features && /private|in.?ground|pool/i.test(r.pool_features) && !/none/i.test(r.pool_features) &&
  r.list_price && r.living_area
);
const noPool = ACTIVE_SFR.filter(r =>
  (!r.pool_features || /^none$/i.test(r.pool_features)) &&
  r.list_price && r.living_area
);
if (withPool.length) {
  const poolPpsf = withPool.map(r => r.list_price / r.living_area);
  const noPoolPpsf = noPool.map(r => r.list_price / r.living_area);
  const poolPrices = withPool.map(r => r.list_price);
  const noPoolPrices = noPool.map(r => r.list_price);
  console.log(`With pool:                  n=${withPool.length}  med $/sqft: $${Math.round(median(poolPpsf))}  med price: ${fmt$(median(poolPrices))}`);
  console.log(`No pool:                    n=${noPool.length}  med $/sqft: $${Math.round(median(noPoolPpsf))}  med price: ${fmt$(median(noPoolPrices))}`);
  if (median(noPoolPpsf)) {
    console.log(`Pool $/sqft premium:        +${pct(median(poolPpsf) - median(noPoolPpsf), median(noPoolPpsf)).toFixed(1)}%`);
  }
} else {
  console.log('No pool data available');
}
console.log();

// ─── LOT ───────────────────────────────────────────────────────────
console.log('── LOT SIZE (active SFR) ──');
const lots = ACTIVE_SFR.filter(r => r.lot_size_acres > 0).map(r => r.lot_size_acres);
if (lots.length) {
  console.log(`Median lot:                 ${median(lots).toFixed(3)} ac (${Math.round(median(lots) * 43560).toLocaleString()} sqft)`);
  console.log(`Mean lot:                   ${mean(lots).toFixed(3)} ac`);
}
const lotBucket = {
  '<0.15 ac': ACTIVE_SFR.filter(r => r.lot_size_acres > 0 && r.lot_size_acres < 0.15),
  '0.15-0.25 ac': ACTIVE_SFR.filter(r => r.lot_size_acres >= 0.15 && r.lot_size_acres < 0.25),
  '0.25-0.5 ac': ACTIVE_SFR.filter(r => r.lot_size_acres >= 0.25 && r.lot_size_acres < 0.5),
  '0.5+ ac': ACTIVE_SFR.filter(r => r.lot_size_acres >= 0.5),
};
Object.entries(lotBucket).forEach(([k, recs]) => {
  const prices = recs.map(r => r.list_price).filter(p => p > 0);
  if (recs.length) console.log(`  ${k.padEnd(14)} n=${String(recs.length).padStart(3)}  med price: ${fmt$(median(prices))}`);
});
console.log();

// ─── SUBDIVISIONS ──────────────────────────────────────────────────
console.log('── TOP SUBDIVISIONS (active SFR) ──');
const subdivs = {};
ACTIVE_SFR.forEach(r => {
  if (!r.subdivision_name) return;
  (subdivs[r.subdivision_name] = subdivs[r.subdivision_name] || []).push(r);
});
const subdivList = Object.entries(subdivs).sort((a, b) => b[1].length - a[1].length).slice(0, 20);
subdivList.forEach(([sub, recs]) => {
  const prices = recs.map(r => r.list_price).filter(p => p > 0);
  const ppsf = recs.filter(r => r.living_area && r.list_price).map(r => r.list_price / r.living_area);
  console.log(`  ${sub.padEnd(35)} n=${String(recs.length).padStart(2)}  med price: ${fmt$(median(prices)).padStart(11)}  med $/sqft: $${ppsf.length ? Math.round(median(ppsf)) : 'N/A'}`);
});
console.log();

// ─── ABSORPTION ────────────────────────────────────────────────────
console.log('── KEY INSIGHTS ──');
const closedRecent = SFR.filter(r =>
  r.standard_status === 'Closed' &&
  r.close_price > 100000 &&
  r.close_date &&
  daysBetween(new Date(r.close_date).getTime(), NOW) <= 90
);
const monthlySales = closedRecent.length / 3;
const absorption = monthlySales ? ACTIVE_SFR.length / monthlySales : Infinity;
console.log(`Closed sales last 90 days:  ${closedRecent.length}`);
console.log(`Monthly absorption rate:    ${monthlySales.toFixed(1)} sales/month`);
console.log(`Months of inventory:        ${absorption === Infinity ? 'n/a' : absorption.toFixed(1)} months`);
console.log();

const newSupply = ACTIVE_SFR.filter(r =>
  r.listing_contract_date &&
  daysBetween(new Date(r.listing_contract_date).getTime(), NOW) <= 30
);
console.log(`New listings last 30 days:  ${newSupply.length}`);
console.log();

// ─── PRICE REDUCTIONS ──────────────────────────────────────────────
let reducedCount = 0;
let reducedTotal = 0;
ACTIVE_SFR.forEach(r => {
  if (!r.raw_data) return;
  try {
    const raw = JSON.parse(r.raw_data);
    const orig = raw.OriginalListPrice;
    if (orig && r.list_price && orig > r.list_price) {
      reducedCount++;
      reducedTotal += (orig - r.list_price) / orig;
    }
  } catch (e) {}
});
console.log(`Active w/ price reduction:  ${reducedCount}/${ACTIVE_SFR.length} (${pct(reducedCount, ACTIVE_SFR.length).toFixed(1)}%)`);
if (reducedCount) {
  console.log(`Avg reduction:              ${(reducedTotal / reducedCount * 100).toFixed(1)}%`);
}
console.log();

// ─── BENCHMARKS ────────────────────────────────────────────────────
console.log('── TOP CLOSED SALES (luxury benchmarks) ──');
CLOSED_SFR.slice().sort((a, b) => b.close_price - a.close_price).slice(0, 8).forEach((r, i) => {
  console.log(`  ${i+1}. ${r.unparsed_address || 'addr unknown'} - ${fmt$(r.close_price)} (${r.bedrooms_total}BR/${r.bathrooms_full}BA, ${fmtSqft(r.living_area || 0)} sqft, built ${r.year_built})`);
});
console.log();

console.log('── BOTTOM CLOSED SALES (entry benchmarks) ──');
CLOSED_SFR.slice().sort((a, b) => a.close_price - b.close_price).slice(0, 5).forEach((r, i) => {
  console.log(`  ${i+1}. ${r.unparsed_address || 'addr unknown'} - ${fmt$(r.close_price)} (${r.bedrooms_total}BR/${r.bathrooms_full}BA, ${fmtSqft(r.living_area || 0)} sqft, built ${r.year_built})`);
});
console.log();

// ─── HOUSING STOCK AGE ─────────────────────────────────────────────
console.log('── HOUSING STOCK AGE (active SFR) ──');
const ages = ACTIVE_SFR.filter(r => r.year_built).map(r => r.year_built);
const ageBuckets = {
  '<1950': ages.filter(y => y < 1950).length,
  '1950-1969': ages.filter(y => y >= 1950 && y < 1970).length,
  '1970-1989': ages.filter(y => y >= 1970 && y < 1990).length,
  '1990-2009': ages.filter(y => y >= 1990 && y < 2010).length,
  '2010-2019': ages.filter(y => y >= 2010 && y < 2020).length,
  '2020+': ages.filter(y => y >= 2020).length,
};
Object.entries(ageBuckets).forEach(([k, v]) => console.log(`  ${k.padEnd(15)} ${v}`));
console.log();

// ─── CONDOS ────────────────────────────────────────────────────────
console.log('── CONDOS (Barton Hills elementary zone) ──');
const condoActive = CONDO.filter(r => r.standard_status === 'Active');
const condoPrices = condoActive.map(r => r.list_price).filter(p => p > 0);
const condoPpsf = condoActive.filter(r => r.living_area && r.list_price).map(r => r.list_price / r.living_area);
console.log(`Active condos:              ${condoActive.length}`);
if (condoPrices.length) {
  console.log(`Median condo list price:    ${fmt$(median(condoPrices))}`);
  console.log(`Median condo $/sqft:        $${Math.round(median(condoPpsf))}/sqft`);
}
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log('  END OF ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════');
