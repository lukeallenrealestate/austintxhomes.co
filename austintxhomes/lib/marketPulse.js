'use strict';

/**
 * The Austin Market Pulse: a weekly, dated, frozen market report.
 *
 * Every week (Monday 9am Central, or the first chance after that if the
 * server was down) we take a snapshot of the live MLS numbers from
 * lib/liveStats (the same engine behind every live token on the site) and
 * store it. Each stored snapshot becomes a permanent, dated edition at
 * /austin-market-pulse/<week-start>, compared with the edition before it.
 * Because every edition is dated, its numbers stay frozen (CLAUDE.md s13).
 *
 * The headline figure is the AUSTIN PRICE-CUT INDEX: the share of active
 * residential for-sale listings in the City of Austin whose current list
 * price is below their original list price.
 *
 * Rules: numbers come only from Luke's ACTRIS feed; no closed sale prices
 * (the feed's close_price is the final list price); closings appear only as
 * aggregate counts. No em or en dashes in generated copy.
 *
 * Storage: market-pulse.json next to the listings DB (Render's persistent
 * disk), so the writer and the reader always use the same file.
 */

const fs = require('fs');
const path = require('path');
const listingDb = require('../../idx-search/db/database');
const live = require('./liveStats');
const ssrInject = require('./ssrInject');

const TZ = 'America/Chicago';
const SITE = 'https://austintxhomes.co';
const HUB = '/austin-market-pulse';
const INDEX_NAME = 'Austin Price-Cut Index';
const STORE = path.join(path.dirname(listingDb.name || path.join(__dirname, '..', '..', 'idx-search', 'db', 'idx.db')), 'market-pulse.json');
const RES_TYPES = ['Single Family Residence', 'Condominium', 'Townhouse', 'Duplex', 'Manufactured Home'];
const MIN_AREA = 10; // listings needed before an area appears in a table

// Areas tracked every week. Neighborhoods use the same boundaries as the
// neighborhood pages; suburbs use the MLS city field.
const NEIGHBORHOODS = [
  ['tarrytown', 'Tarrytown'], ['clarksville', 'Clarksville'], ['old-enfield', 'Old Enfield'],
  ['zilker', 'Zilker'], ['barton-hills', 'Barton Hills'], ['bouldin-creek', 'Bouldin Creek'],
  ['travis-heights', 'Travis Heights'], ['south-congress', 'South Congress'], ['hyde-park', 'Hyde Park'],
  ['rosedale', 'Rosedale'], ['allandale', 'Allandale'], ['brentwood', 'Brentwood'], ['crestview', 'Crestview'],
  ['north-loop', 'North Loop'], ['mueller', 'Mueller'], ['cherrywood', 'Cherrywood'],
  ['windsor-park', 'Windsor Park'], ['east-austin', 'East Austin'], ['westlake-hills', 'Westlake Hills'],
];
const ZIPS = ['78701', '78702', '78703', '78704', '78705', '78721', '78722', '78723', '78731', '78741',
  '78744', '78745', '78746', '78748', '78749', '78751', '78756', '78757', '78758', '78759'];
const CITIES = [
  ['round-rock', 'Round Rock'], ['cedar-park', 'Cedar Park'], ['georgetown', 'Georgetown'],
  ['pflugerville', 'Pflugerville'], ['leander', 'Leander'], ['kyle', 'Kyle'], ['buda', 'Buda'],
  [null, 'Hutto'], [null, 'Manor'], [null, 'Lakeway'], [null, 'Dripping Springs'], [null, 'Liberty Hill'],
];

// ── dates (Central time) ─────────────────────────────────────────────
function ctParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, wd: p.weekday };
}
const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function addDays(iso, n) {
  const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function todayCT() { const p = ctParts(); return isoOf(p.y, p.m, p.d); }
function weekStartCT(d = new Date()) {
  const p = ctParts(d);
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.wd];
  return addDays(isoOf(p.y, p.m, p.d), -back);
}
function longDate(iso, withYear = true) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
  });
}
const shortDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const weekNo = iso => Math.floor(new Date(iso + 'T12:00:00Z').getTime() / (7 * 86400000));

// ── storage ──────────────────────────────────────────────────────────
function load() {
  try {
    const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    return Array.isArray(j.editions) ? j.editions : [];
  } catch { return []; }
}
function save(editions) {
  const tmp = STORE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, editions }, null, 1));
  fs.renameSync(tmp, STORE);
}
/** Editions newest first. */
function editions() { return load().sort((a, b) => b.id.localeCompare(a.id)); }
function edition(id) { return load().find(e => e.id === id) || null; }

// ── snapshot ─────────────────────────────────────────────────────────
const r1 = v => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const r0 = v => (v == null || Number.isNaN(v) ? null : Math.round(v));
function pick(scope) {
  const s = live.computeStats(scope);
  if (!s) return null;
  return {
    count: s.count, pending: s.pendingCount, medianPrice: r0(s.medianPrice), medianPpsf: r0(s.medianPpsf),
    medianDom: r0(s.medianDom), cutPct: r1(s.reducedPct), avgCut: r1(s.avgCutPct), newLast7: s.newLast7,
    newConPct: r1(s.newConPct), p25: r0(s.p25Price), p75: r0(s.p75Price),
  };
}
function rent(scope) {
  const s = live.computeStats(scope);
  if (!s || s.count < MIN_AREA || s.medianRent == null) return null;
  return { count: s.count, median: r0(s.medianRent), p25: r0(s.p25Rent), p75: r0(s.p75Rent), ppsf: s.rentPpsf != null ? Math.round(s.rentPpsf * 100) / 100 : null };
}
function newListingsSince(days, cities) {
  const typePh = RES_TYPES.map(() => '?').join(',');
  const cityPh = cities.map(() => '?').join(',');
  return listingDb.prepare(
    `SELECT COUNT(*) AS n FROM listings
     WHERE property_type = 'Residential' AND property_sub_type IN (${typePh})
       AND city IN (${cityPh}) AND list_price >= 75000 AND mlg_can_view = 1
       AND listing_contract_date >= date('now', '-${Number(days)} days')`
  ).get(...RES_TYPES, ...cities)?.n ?? null;
}
function closingsSince(days, cities) {
  const typePh = RES_TYPES.map(() => '?').join(',');
  const cityPh = cities.map(() => '?').join(',');
  return listingDb.prepare(
    `SELECT COUNT(*) AS n FROM listings
     WHERE standard_status = 'Closed' AND property_type = 'Residential' AND property_sub_type IN (${typePh})
       AND city IN (${cityPh}) AND list_price >= 75000
       AND close_date >= date('now', '-${Number(days)} days')`
  ).get(...RES_TYPES, ...cities)?.n ?? null;
}

function takeSnapshot() {
  if (!live.isReady()) return null;
  const austin = pick('city=Austin');
  const m = ssrInject.getMarketStats();
  if (!austin || austin.medianPrice == null || !m) return null;
  const metroCities = ssrInject.AUSTIN_METRO_CITIES;
  const metroScope = 'city=' + metroCities.join(',');
  const metro = pick(metroScope);
  const tiers = {};
  for (const [k, min, max] of [['under400', 0, 400000], ['t400_600', 400000, 600000], ['t600_1m', 600000, 1000000], ['t1m_2m', 1000000, 2000000], ['over2m', 2000000, 0]]) {
    tiers[k] = live.computeStats('city=Austin' + (min ? ';min=' + min : '') + (max ? ';max=' + max : ''))?.count ?? 0;
  }
  const area = (scope, extra) => { const s = pick(scope); return s && s.count >= MIN_AREA ? { ...extra, ...s } : null; };
  return {
    austin: { ...austin, newListings7: newListingsSince(7, ['Austin']), closings7: closingsSince(7, ['Austin']) },
    metro: {
      ...metro, newListings7: newListingsSince(7, metroCities), closings7: closingsSince(7, metroCities),
      closings90: m.closedLast90, monthsSupply: r1(m.monthsSupply), finalAskPct: r1(m.finalAskPct), score: m.score, verdict: m.verdict,
    },
    types: { sfr: pick('city=Austin;type=sfr'), condo: pick('city=Austin;type=condo'), townhome: pick('city=Austin;type=townhome') },
    tiers,
    rents: {
      all: rent('city=Austin;lease=1'), b1: rent('city=Austin;lease=1;beds=1'), b2: rent('city=Austin;lease=1;beds=2'),
      b3sfr: rent('city=Austin;lease=1;type=sfr;beds=3'), b4sfr: rent('city=Austin;lease=1;type=sfr;beds=4+'),
    },
    neighborhoods: NEIGHBORHOODS.map(([slug, name]) => area('nbhd=' + slug, { key: slug, name, url: '/neighborhoods/' + slug })).filter(Boolean),
    zips: ZIPS.map(z => area('zip=' + z, { key: z, name: z, url: '/homes-for-sale-in-' + z })).filter(Boolean),
    cities: CITIES.map(([slug, name]) => area('city=' + name, { key: name, name, url: slug ? '/neighborhoods/' + slug : null })).filter(Boolean),
  };
}

/** Is this week's edition still missing (and is it at least Monday 9am CT)? */
function isDue(now = new Date()) {
  const ws = weekStartCT(now);
  const p = ctParts(now);
  if (todayCT() === ws && p.hour < 9) return false;
  return !load().some(e => e.id === ws);
}

/** Build and store this week's edition. force=true replaces an existing one. */
function generate({ force = false } = {}) {
  const ws = weekStartCT();
  const all = load();
  const existing = all.find(e => e.id === ws);
  if (existing && !force) return existing;
  const snap = takeSnapshot();
  if (!snap) return null;
  const ed = { id: ws, weekStart: ws, weekEnd: addDays(ws, 6), published: todayCT(), generatedAt: new Date().toISOString(), ...snap };
  const rest = all.filter(e => e.id !== ws);
  save([...rest, ed]);
  return ed;
}

// ── formatting ───────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = v => (v == null ? 'n/a' : live.fmtValue(v, 'medianPrice'));
const usd = v => (v == null ? 'n/a' : '$' + Math.round(v).toLocaleString('en-US'));
const num = v => (v == null ? 'n/a' : Math.round(v).toLocaleString('en-US'));
const pct = v => (v == null ? 'n/a' : Math.round(v) + '%');
const pct1 = v => (v == null ? 'n/a' : (Math.round(v * 10) / 10).toFixed(1) + '%');
function delta(cur, prev, kind) {
  if (cur == null || prev == null) return '';
  const d = cur - prev;
  if (kind === 'pts') {
    const r = Math.round(d * 10) / 10;
    if (r === 0) return '<span class="mp-d flat">no change</span>';
    return `<span class="mp-d ${r > 0 ? 'up' : 'down'}">${r > 0 ? '▲ +' : '▼ '}${r.toFixed(1)} pts</span>`;
  }
  if (!prev) return '';
  const p = (100 * d) / prev;
  const r = Math.round(p * 10) / 10;
  if (r === 0) return '<span class="mp-d flat">no change</span>';
  return `<span class="mp-d ${r > 0 ? 'up' : 'down'}">${r > 0 ? '▲ +' : '▼ '}${r.toFixed(1)}%</span>`;
}
const vary = (id, arr) => arr[weekNo(id) % arr.length];
const editionUrl = e => `${HUB}/${e.id}`;
const editionTitle = e => `Austin Housing Market Report: Week of ${longDate(e.weekStart)}`;

// ── generated copy ───────────────────────────────────────────────────
function leadParagraph(e, prev) {
  const a = e.austin, pa = prev && prev.austin;
  const idx = a.cutPct;
  let s1;
  if (!pa) {
    s1 = `The ${INDEX_NAME} opens this series at ${pct1(idx)}: of the ${num(a.count)} homes for sale in the City of Austin this week, ${num(Math.round(a.count * idx / 100))} are listed below their original asking price.`;
  } else {
    const d = Math.round((idx - pa.cutPct) * 10) / 10;
    const since = `the week of ${longDate(prev.weekStart, false)}`;
    if (d >= 0.5) s1 = vary(e.id, [
      `The ${INDEX_NAME} rose to ${pct1(idx)} this week, up ${d.toFixed(1)} points from ${since}, as more Austin sellers trimmed their asking prices.`,
      `More Austin sellers cut prices this week. The ${INDEX_NAME} climbed ${d.toFixed(1)} points to ${pct1(idx)} compared with ${since}.`,
      `Price cuts spread a little further this week: the ${INDEX_NAME} now reads ${pct1(idx)}, ${d.toFixed(1)} points higher than ${since}.`,
    ]);
    else if (d <= -0.5) s1 = vary(e.id, [
      `The ${INDEX_NAME} eased to ${pct1(idx)} this week, down ${Math.abs(d).toFixed(1)} points from ${since}, a sign that fewer active listings are carrying a reduced price.`,
      `Fewer Austin listings are sitting below their original ask this week. The ${INDEX_NAME} slipped ${Math.abs(d).toFixed(1)} points to ${pct1(idx)} versus ${since}.`,
      `The share of Austin listings with a price cut fell this week: the ${INDEX_NAME} is ${pct1(idx)}, ${Math.abs(d).toFixed(1)} points below ${since}.`,
    ]);
    else s1 = vary(e.id, [
      `The ${INDEX_NAME} held essentially steady at ${pct1(idx)} this week (${since}: ${pct1(pa.cutPct)}).`,
      `Austin's price-cut share barely moved this week. The ${INDEX_NAME} sits at ${pct1(idx)}, against ${pct1(pa.cutPct)} for ${since}.`,
      `Little changed on pricing this week: the ${INDEX_NAME} reads ${pct1(idx)}, within half a point of ${since}.`,
    ]);
  }
  const inv = pa
    ? (a.count > pa.count
      ? `Active inventory in the city grew to ${num(a.count)} listings (${num(a.count - pa.count)} more than the prior edition)`
      : a.count < pa.count
        ? `Active inventory in the city shrank to ${num(a.count)} listings (${num(pa.count - a.count)} fewer than the prior edition)`
        : `Active inventory in the city was unchanged at ${num(a.count)} listings`)
    : `There are ${num(a.count)} active listings in the city`;
  const s2 = `${inv}, with a median asking price of ${money(a.medianPrice)} and a median of ${num(a.medianDom)} days on market.`;
  const s3 = a.newListings7 != null
    ? `${num(a.newListings7)} new listings came on in the last seven days, ${num(a.pending)} homes are in escrow, and ${num(a.closings7)} closed.`
    : `${num(a.pending)} Austin homes are in escrow right now.`;
  return `${s1} ${s2} ${s3}`;
}

function verdictParagraph(e) {
  const m = e.metro;
  if (m.monthsSupply == null) return '';
  const ms = m.monthsSupply.toFixed(1);
  const band = m.monthsSupply > 6 ? 'buyer' : m.monthsSupply >= 4 ? 'balanced' : 'seller';
  const text = {
    buyer: vary(e.id, [
      `Across the greater Austin metro there are about ${ms} months of supply, which is buyer's market territory (over 6 months).`,
      `Metro-wide, inventory would take about ${ms} months to sell at the recent pace of closings, comfortably in buyer's market range.`,
    ]),
    balanced: vary(e.id, [
      `Across the greater Austin metro there are about ${ms} months of supply, inside the 4 to 6 month band usually read as a balanced market.`,
      `Metro-wide, it would take about ${ms} months to sell today's inventory at the recent pace of closings, which sits in balanced territory (4 to 6 months).`,
      `Greater Austin is carrying roughly ${ms} months of supply, the middle of the 4 to 6 month range that marks a balanced market.`,
    ]),
    seller: vary(e.id, [
      `Across the greater Austin metro there are only about ${ms} months of supply, which favors sellers (under 4 months).`,
      `Metro inventory would clear in about ${ms} months at the recent pace of closings, a seller-leaning number.`,
    ]),
  }[band];
  const fa = m.finalAskPct != null
    ? ` Homes that went to closing over the last 90 days had been listed, at the end, for a median ${pct1(m.finalAskPct)} of their original asking price, so most sellers who sold cut ${m.finalAskPct >= 99 ? 'little or nothing' : 'something'} first.`
    : '';
  return text + fa;
}

function adviceBlocks(e, prev) {
  const a = e.austin;
  const idx = a.cutPct;
  const rising = prev && idx - prev.austin.cutPct >= 0.5;
  const falling = prev && idx - prev.austin.cutPct <= -0.5;
  let buyers, sellers;
  if (idx >= 55) {
    buyers = vary(e.id, [
      `With more than half of Austin listings already reduced, the opening ask is often not the real number. Look at how long a home has been listed and whether it has been cut before you write an offer, and ask for repairs or closing-cost help even on homes that look fairly priced.`,
      `This is a market where the first price is frequently a starting point. A home sitting past the ${num(a.medianDom)}-day median, especially one that has not been reduced yet, is where a well-supported offer below asking has the best odds.`,
    ]);
    sellers = vary(e.id, [
      `The data says buyers are comparing you against a lot of reduced listings. Pricing right at launch, rather than cutting later, protects you from becoming one of the homes that sits past the ${num(a.medianDom)}-day median.`,
      `More than half of your competition has already cut. A launch price set against the current active field, not last spring's list prices, is the cheapest way to avoid chasing the market down.`,
    ]);
  } else if (idx >= 40) {
    buyers = vary(e.id, [
      `Austin is giving buyers room to negotiate without being a free-for-all. Fresh, well-priced listings still draw attention, while homes that have lingered past the ${num(a.medianDom)}-day median are where concessions are easiest to win.`,
      `About ${pct(idx)} of listings carry a cut, so leverage depends on the house. Newer listings in strong locations still move; older listings are where you push on price and terms.`,
    ]);
    sellers = vary(e.id, [
      `Correctly priced homes are still selling, but about ${pct(idx)} of active listings have already had to reduce. The first two weeks on market matter most, so price and prepare for them.`,
      `Buyers have alternatives, though not unlimited ones. Price against the current active competition in your neighborhood and expect to negotiate on terms even when the price holds.`,
    ]);
  } else {
    buyers = vary(e.id, [
      `Fewer than four in ten Austin listings are reduced, so well-located homes can move quickly. Have financing lined up and be ready to act on the right house.`,
      `Sellers are holding price more often than not right now. Focus your negotiating on homes that have already been sitting, and move decisively on fresh ones you love.`,
    ]);
    sellers = vary(e.id, [
      `Most Austin sellers are holding their price, which gives you room to list confidently. A strong launch still matters, because buyers notice when a home sits.`,
      `With a minority of listings reduced, a well-prepared home priced in line with the active field is in a good position.`,
    ]);
  }
  if (rising) sellers += ' The share of reduced listings rose this week, which is worth factoring into your launch price.';
  if (falling) buyers += ' The share of reduced listings dipped this week, so do not assume every seller is ready to cut.';
  return { buyers, sellers };
}

// ── rendering helpers ────────────────────────────────────────────────
function areaRows(list, prevList) {
  const prevMap = new Map((prevList || []).map(x => [x.key, x]));
  return list.slice().sort((x, y) => x.name.localeCompare(y.name)).map(x => {
    const p = prevMap.get(x.key);
    const name = x.url ? `<a href="${x.url}">${esc(x.name)}</a>` : esc(x.name);
    return `<tr><td>${name}</td><td>${num(x.count)}</td><td>${money(x.medianPrice)}</td><td>${usd(x.medianPpsf)}</td><td>${num(x.medianDom)}</td><td>${pct(x.cutPct)} ${p ? delta(x.cutPct, p.cutPct, 'pts') : ''}</td><td>${num(x.newLast7)}</td></tr>`;
  }).join('');
}
function areaTable(title, list, prevList, note) {
  if (!list || !list.length) return '';
  return `<h3>${esc(title)}</h3>
<div class="mp-tw"><table class="mp-t">
<thead><tr><th>Area</th><th>Active</th><th>Median ask</th><th>Ask $/sqft</th><th>Median days listed</th><th>Share with a price cut</th><th>New in 7 days</th></tr></thead>
<tbody>${areaRows(list, prevList)}</tbody></table></div>${note ? `<p class="mp-note">${note}</p>` : ''}`;
}

function leaderboards(e, prev) {
  const areas = [...(e.neighborhoods || []), ...(e.zips || [])].filter(x => x.count >= 15 && x.cutPct != null);
  const fmtItem = (x, v) => `<li>${x.url ? `<a href="${x.url}">${esc(x.name)}</a>` : esc(x.name)} <span>${v}</span></li>`;
  const top = (arr, f, n = 5) => arr.slice().sort(f).slice(0, n);
  const blocks = [];
  blocks.push(`<div class="mp-lb"><h4>Highest share of price cuts</h4><ol>${top(areas, (x, y) => y.cutPct - x.cutPct).map(x => fmtItem(x, pct(x.cutPct))).join('')}</ol></div>`);
  blocks.push(`<div class="mp-lb"><h4>Sellers holding firmest</h4><ol>${top(areas, (x, y) => x.cutPct - y.cutPct).map(x => fmtItem(x, pct(x.cutPct))).join('')}</ol></div>`);
  blocks.push(`<div class="mp-lb"><h4>Most new listings in 7 days</h4><ol>${top(areas, (x, y) => y.newLast7 - x.newLast7).map(x => fmtItem(x, num(x.newLast7))).join('')}</ol></div>`);
  if (prev) {
    const pm = new Map([...(prev.neighborhoods || []), ...(prev.zips || [])].map(x => [x.key, x]));
    const moved = areas.map(x => ({ x, p: pm.get(x.key) })).filter(o => o.p && o.p.count >= 15 && o.p.cutPct != null)
      .map(o => ({ ...o, d: Math.round((o.x.cutPct - o.p.cutPct) * 10) / 10 }));
    const up = top(moved.filter(o => o.d > 0), (a, b) => b.d - a.d, 3);
    const down = top(moved.filter(o => o.d < 0), (a, b) => a.d - b.d, 3);
    if (up.length) blocks.push(`<div class="mp-lb"><h4>Price cuts spreading fastest</h4><ol>${up.map(o => fmtItem(o.x, '+' + o.d.toFixed(1) + ' pts')).join('')}</ol></div>`);
    if (down.length) blocks.push(`<div class="mp-lb"><h4>Price cuts receding fastest</h4><ol>${down.map(o => fmtItem(o.x, o.d.toFixed(1) + ' pts')).join('')}</ol></div>`);
  }
  return `<div class="mp-lbs">${blocks.join('')}</div>`;
}

function indexChart(history) {
  // history: oldest -> newest [{id, v}]
  const pts = history.filter(h => h.v != null);
  if (pts.length < 2) return '';
  const W = 640, H = 200, P = 34;
  const vs = pts.map(p => p.v);
  let lo = Math.floor(Math.min(...vs) - 2), hi = Math.ceil(Math.max(...vs) + 2);
  if (hi - lo < 6) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 3); hi = Math.ceil(mid + 3); }
  const x = i => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = v => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5"><title>Week of ${shortDate(p.id)}: ${p.v.toFixed(1)}%</title></circle>`).join('');
  const labels = pts.map((p, i) => (pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${shortDate(p.id)}</text>` : '').join('');
  return `<figure class="mp-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${INDEX_NAME} by week">
<text x="${P - 6}" y="${y(hi) + 4}" text-anchor="end">${hi}%</text><text x="${P - 6}" y="${y(lo) + 4}" text-anchor="end">${lo}%</text>
<line x1="${P}" y1="${y(lo)}" x2="${W - P}" y2="${y(lo)}" class="ax"/><path d="${line}" class="ln"/>${dots}${labels}</svg>
<figcaption>${INDEX_NAME} by week: share of active City of Austin listings priced below their original ask.</figcaption></figure>`;
}

const CSS = `
:root{--gold:#b8935a;--gold-lt:#cda96f;--gold-pale:#f5ede0;--ink:#0f0f0e;--text:#1a1918;--mid:#5c5b57;--light:#999690;--bg:#fff;--warm:#faf8f4;--cream:#f1ece3;--border:#e5dfd4;--r:4px;--w:1180px}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
.nav-backdrop{height:80px;background:var(--ink)}
.mp-hero{background:var(--warm);border-bottom:1px solid var(--border);padding:56px 24px 44px}
.mp-wrap{max-width:920px;margin:0 auto}
.mp-ey{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:600}
.mp-hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(2rem,4.4vw,3rem);line-height:1.1;margin:12px 0 14px}
.mp-meta{font-size:13px;color:var(--mid)}
.mp-meta a{color:#8a6a3a}.mp-crumb{font-size:12px;color:var(--light);margin-bottom:14px}.mp-crumb a{color:var(--mid);text-decoration:none}
main.mp{padding:44px 24px 72px}
.mp p{font-size:16.5px;line-height:1.8;color:var(--text)}
.mp h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:2rem;margin:48px 0 14px;line-height:1.2}
.mp h3{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--mid);margin:30px 0 10px}
.mp a{color:#8a6a3a}
.mp-idx{display:flex;gap:28px;align-items:center;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:6px;padding:28px 30px;margin:8px 0 26px}
.mp-idx-n{font-family:'Cormorant Garamond',Georgia,serif;font-size:4rem;line-height:1;color:var(--gold-lt)}
.mp-idx-l{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px}
.mp-idx-t{font-size:15px;line-height:1.6;color:rgba(255,255,255,.85);max-width:520px}
.mp-idx .mp-d{background:rgba(255,255,255,.08)}
.mp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 8px}
.mp-kpi{background:var(--warm);border:1px solid var(--border);border-radius:var(--r);padding:16px 14px}
.mp-kpi b{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.75rem;font-weight:500;line-height:1.1}
.mp-kpi span{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mid);margin-top:6px}
.mp-kpi em{font-style:normal;display:block;margin-top:6px}
.mp-d{font-size:12px;font-weight:600;padding:2px 6px;border-radius:3px;white-space:nowrap}
.mp-d.up,.mp-d.down{color:var(--text);background:var(--gold-pale)}.mp-d.flat{color:var(--mid);background:var(--cream)}.mp-idx .mp-d.up,.mp-idx .mp-d.down{color:#fff}
.mp-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:var(--r)}
.mp-t{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
.mp-t th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mid);background:var(--warm);padding:10px 12px;border-bottom:1px solid var(--border)}
.mp-t td{padding:9px 12px;border-bottom:1px solid var(--border)}.mp-t tr:last-child td{border-bottom:0}
.mp-note{font-size:13px!important;color:var(--mid)!important;margin-top:8px}
.mp-lbs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.mp-lb{border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;background:#fff}
.mp-lb h4{margin:0 0 10px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
.mp-lb ol{margin:0;padding-left:18px;font-size:14px;line-height:1.9}.mp-lb li span{float:right;color:var(--mid);font-weight:600}
.mp-adv{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mp-adv div{background:var(--warm);border-left:3px solid var(--gold);padding:18px 20px;border-radius:var(--r)}
.mp-adv h3{margin-top:0}.mp-adv p{font-size:15px}
.mp-chart{margin:10px 0 0}.mp-chart svg{width:100%;height:auto}.mp-chart text{font-size:11px;fill:var(--mid)}
.mp-chart .ln{fill:none;stroke:var(--gold);stroke-width:2.5}.mp-chart circle{fill:var(--ink)}.mp-chart .ax{stroke:var(--border)}
.mp-chart figcaption{font-size:13px;color:var(--mid);margin-top:6px}
.mp-arch{list-style:none;padding:0;margin:0;border:1px solid var(--border);border-radius:var(--r)}
.mp-arch li{display:flex;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:15px}.mp-arch li:last-child{border-bottom:0}
.mp-arch span{color:var(--mid);white-space:nowrap}
.mp-cta{background:var(--ink);color:#fff;border-radius:6px;padding:30px;margin-top:48px}
.mp-cta p{color:rgba(255,255,255,.85)}.mp-cta a.btn{display:inline-block;background:var(--gold);color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
.mp-method p{font-size:14px;color:var(--mid)}
.mp-nav{display:flex;justify-content:space-between;gap:12px;margin-top:32px;font-size:14px}
details.mp-faq{border-bottom:1px solid var(--border);padding:14px 0}details.mp-faq summary{cursor:pointer;font-weight:600;font-size:16px}
@media(max-width:780px){.mp-kpis{grid-template-columns:repeat(2,1fr)}.mp-lbs,.mp-adv{grid-template-columns:1fr}.mp-idx{padding:22px}.mp-idx-n{font-size:3.2rem}}
`;

function shell({ title, description, canonical, jsonld, body, ogType = 'article' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${canonical}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
<link rel="apple-touch-icon" href="/favicon-96.png" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="geo.region" content="US-TX" />
<meta name="geo.placename" content="Austin, Texas" />
<meta property="og:type" content="${ogType}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}${canonical}" />
<meta property="og:image" content="${SITE}/images/luke-allen.jpg" />
<meta name="twitter:card" content="summary_large_image" />
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap" />
<style>${CSS}</style>
</head>
<body>
<script src="/js/nav.js"></script>
<div class="nav-backdrop"></div>
${body}
<script src="/js/footer.js" defer></script>
</body>
</html>`;
}

const AUTHOR = { '@type': 'Person', name: 'Luke Allen', url: `${SITE}/luke-allen`, jobTitle: 'Licensed Texas Real Estate Agent', identifier: 'TREC #788149' };
const PUBLISHER = { '@type': 'Organization', name: 'Austin TX Homes', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/favicon-96.png` } };

function methodology() {
  return `<section class="mp-method"><h2>How these numbers are computed</h2>
<p>Every figure comes from active and pending residential listings (single-family, condo, townhouse, duplex, and manufactured homes) in ACTRIS MLS, received through MLS Grid and computed by Luke Allen. Nothing comes from outside sources. "City of Austin" means listings whose MLS city is Austin. "Greater Austin" means the MLS cities of the Austin metro (Travis, Williamson, Hays, and Bastrop counties). Neighborhoods use the same boundaries as the neighborhood guides on this site, and areas with fewer than ${MIN_AREA} active listings are left out.</p>
<p>The ${INDEX_NAME} is the share of active residential for-sale listings in the City of Austin whose current list price is below their original list price. Days listed count from each listing's list date. The citywide new-listings figure counts every listing that came on the market in the last seven days, including any already under contract; in the neighborhood tables and rankings, "new in 7 days" counts only those still active. Months of supply divides active metro listings by the average monthly number of closings over the last 90 days. Closings are reported only as counts: no individual or median sale prices are published, and the "final ask" figure compares a closed home's last list price with its first list price. Rents are the asking rents of rental listings active on the MLS, which include houses, condos, townhomes, and some apartment units but not large apartment complexes that do not list on the MLS.</p>
<p>Each edition is a snapshot taken on its publish date and is never revised afterward. For today's numbers, see the <a href="/austin-buyers-or-sellers-market">live buyer's or seller's market page</a>.</p></section>`;
}

function cta() {
  return `<div class="mp-cta"><p><strong>Want this read for one house or one neighborhood?</strong> Luke Allen (TREC #788149) runs the same numbers for a specific home, street, or price range, whether you are buying or selling.</p><a class="btn" href="/about#contact">Ask Luke about your market</a></div>`;
}

// ── edition page ─────────────────────────────────────────────────────
function renderEdition(e) {
  const all = editions(); // newest first
  const i = all.findIndex(x => x.id === e.id);
  const prev = i >= 0 ? all[i + 1] || null : null;
  const next = i > 0 ? all[i - 1] : null;
  const history = all.slice(i).reverse().slice(-26).map(x => ({ id: x.id, v: x.austin && x.austin.cutPct }));
  const a = e.austin, m = e.metro, pa = prev && prev.austin, pm = prev && prev.metro;
  const title = editionTitle(e);
  const description = `${INDEX_NAME}: ${pct1(a.cutPct)} of Austin listings are below their original ask. ${num(a.count)} active, ${money(a.medianPrice)} median ask, ${num(a.newListings7)} new this week. Data as of ${longDate(e.published)}.`;
  const adv = adviceBlocks(e, prev);
  const kpi = (label, v, d) => `<div class="mp-kpi"><b>${v}</b><span>${label}</span>${d ? `<em>${d}</em>` : ''}</div>`;
  const vsLine = prev ? `Changes compare with the edition for the week of ${longDate(prev.weekStart)}.` : 'This is the first edition, so there are no week-over-week changes yet.';
  const r = e.rents || {};
  const rentRow = (lbl, x) => (x ? `<tr><td>${lbl}</td><td>${num(x.count)}</td><td>${usd(x.median)}</td><td>${usd(x.p25)} to ${usd(x.p75)}</td></tr>` : '');
  const tiers = e.tiers || {};
  const tierTotal = Object.values(tiers).reduce((s, v) => s + v, 0) || 1;
  const tierRow = (lbl, v) => `<tr><td>${lbl}</td><td>${num(v)}</td><td>${pct(100 * v / tierTotal)}</td></tr>`;
  const t = e.types || {};
  const typeRow = (lbl, x, px) => (x && x.count ? `<tr><td>${lbl}</td><td>${num(x.count)}</td><td>${money(x.medianPrice)}</td><td>${usd(x.medianPpsf)}</td><td>${num(x.medianDom)}</td><td>${pct(x.cutPct)} ${px ? delta(x.cutPct, px.cutPct, 'pts') : ''}</td></tr>` : '');
  const pt = (prev && prev.types) || {};

  const faq = [
    [`What is the ${INDEX_NAME} for the week of ${longDate(e.weekStart)}?`, `${pct1(a.cutPct)}. Of ${num(a.count)} active residential listings in the City of Austin, that share was listed below its original asking price as of ${longDate(e.published)}, according to ACTRIS MLS data computed by Luke Allen.`],
    [`How many homes are for sale in Austin the week of ${longDate(e.weekStart)}?`, `${num(a.count)} active residential listings in the City of Austin and ${num(m.count)} across greater Austin, with ${num(a.newListings7)} new City of Austin listings in the previous seven days.`],
    ...(m.monthsSupply != null ? [[`Is Austin a buyer's or seller's market the week of ${longDate(e.weekStart)}?`, `Greater Austin had about ${m.monthsSupply.toFixed(1)} months of supply. Under 4 months usually favors sellers, 4 to 6 is balanced, and over 6 favors buyers.`]] : []),
  ];

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: title, description, datePublished: e.generatedAt, dateModified: e.generatedAt,
      author: AUTHOR, publisher: PUBLISHER, mainEntityOfPage: `${SITE}${editionUrl(e)}`, image: `${SITE}/images/luke-allen.jpg`,
      about: { '@type': 'City', name: 'Austin', containedInPlace: { '@type': 'State', name: 'Texas' } } },
    { '@context': 'https://schema.org', '@type': 'Dataset', name: `${INDEX_NAME} and Austin housing market snapshot, week of ${longDate(e.weekStart)}`,
      description: `Weekly snapshot of active residential listings in Austin, Texas from ACTRIS MLS, computed by Luke Allen (TREC #788149).`,
      creator: AUTHOR, temporalCoverage: e.published, datePublished: e.published, isAccessibleForFree: true, url: `${SITE}${editionUrl(e)}`,
      spatialCoverage: { '@type': 'Place', name: 'Austin, Texas' },
      variableMeasured: [
        { '@type': 'PropertyValue', name: INDEX_NAME, value: a.cutPct, unitText: 'percent' },
        { '@type': 'PropertyValue', name: 'Active listings, City of Austin', value: a.count },
        { '@type': 'PropertyValue', name: 'Median asking price, City of Austin', value: a.medianPrice, unitText: 'USD' },
        { '@type': 'PropertyValue', name: 'Median days on market, City of Austin', value: a.medianDom, unitText: 'days' },
        ...(m.monthsSupply != null ? [{ '@type': 'PropertyValue', name: 'Months of supply, greater Austin', value: m.monthsSupply }] : []),
      ] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Austin Market Pulse', item: `${SITE}${HUB}` },
      { '@type': 'ListItem', position: 3, name: `Week of ${longDate(e.weekStart)}`, item: `${SITE}${editionUrl(e)}` } ] },
  ];

  const body = `<header class="mp-hero"><div class="mp-wrap">
<div class="mp-crumb"><a href="/">Home</a> / <a href="${HUB}">Austin Market Pulse</a> / Week of ${shortDate(e.weekStart)}</div>
<div class="mp-ey">The Austin Market Pulse · Weekly</div>
<h1>${esc(title)}</h1>
<div class="mp-meta">By <a href="/luke-allen">Luke Allen</a>, Austin Realtor, TREC #788149 · Published ${longDate(e.published)} · Data as of ${longDate(e.published)}</div>
</div></header>
<main class="mp"><div class="mp-wrap">
<div class="mp-idx"><div><div class="mp-idx-l">${INDEX_NAME}</div><div class="mp-idx-n">${pct1(a.cutPct)}</div>${pa ? delta(a.cutPct, pa.cutPct, 'pts') : ''}</div>
<div class="mp-idx-t">Share of active City of Austin listings priced below their original asking price, week of ${longDate(e.weekStart)}.${a.avgCut != null ? ` Among the homes that have cut, the average cut is ${pct1(a.avgCut)} of the original ask.` : ''}</div></div>
<p>${leadParagraph(e, prev)}</p>
<div class="mp-kpis">
${kpi('Active listings, Austin', num(a.count), pa ? delta(a.count, pa.count) : '')}
${kpi('Median asking price', money(a.medianPrice), pa ? delta(a.medianPrice, pa.medianPrice) : '')}
${kpi('Median ask per sq ft', usd(a.medianPpsf), pa ? delta(a.medianPpsf, pa.medianPpsf) : '')}
${kpi('Median days listed', num(a.medianDom), pa ? delta(a.medianDom, pa.medianDom) : '')}
${kpi('New listings, last 7 days', num(a.newListings7), pa ? delta(a.newListings7, pa.newListings7) : '')}
${kpi('In escrow now', num(a.pending), pa ? delta(a.pending, pa.pending) : '')}
${kpi('Closings, last 7 days', num(a.closings7), pa ? delta(a.closings7, pa.closings7) : '')}
${kpi('Months of supply, metro', m.monthsSupply != null ? m.monthsSupply.toFixed(1) : 'n/a', pm && pm.monthsSupply != null && m.monthsSupply != null ? delta(m.monthsSupply, pm.monthsSupply) : '')}
</div>
<p class="mp-note">${vsLine}</p>

<h2>Buyer's market or seller's market?</h2>
<p>${verdictParagraph(e)} Greater Austin as a whole has ${num(m.count)} active listings, a median asking price of ${money(m.medianPrice)}, and ${pct1(m.cutPct)} of listings with a price cut.</p>
${indexChart(history)}

<h2>Where prices are being cut, and where they are not</h2>
<p>${vary(e.id, [
    'Citywide numbers hide big differences between neighborhoods. These lists rank the neighborhoods and ZIP codes with at least 15 active listings this week.',
    'The citywide index is an average of very different local markets. Here is how the neighborhoods and ZIP codes with 15 or more active listings compare this week.',
    'Not every part of Austin is moving the same way. Ranked below: neighborhoods and ZIP codes with at least 15 active listings this week.',
  ])}</p>
${leaderboards(e, prev)}

<h2>Austin by property type and price range</h2>
<div class="mp-tw"><table class="mp-t"><thead><tr><th>Type, City of Austin</th><th>Active</th><th>Median ask</th><th>Ask $/sqft</th><th>Median days listed</th><th>Share with a price cut</th></tr></thead><tbody>
${typeRow('Single-family homes', t.sfr, pt.sfr)}${typeRow('Condos', t.condo, pt.condo)}${typeRow('Townhomes', t.townhome, pt.townhome)}
</tbody></table></div>
<h3>Active listings by asking price</h3>
<div class="mp-tw"><table class="mp-t"><thead><tr><th>Asking price</th><th>Active listings</th><th>Share</th></tr></thead><tbody>
${tierRow('Under $400K', tiers.under400 || 0)}${tierRow('$400K to $600K', tiers.t400_600 || 0)}${tierRow('$600K to $1M', tiers.t600_1m || 0)}${tierRow('$1M to $2M', tiers.t1m_2m || 0)}${tierRow('$2M and up', tiers.over2m || 0)}
</tbody></table></div>

<h2>Neighborhoods and ZIP codes</h2>
${areaTable('Central Austin neighborhoods', e.neighborhoods, prev && prev.neighborhoods, prev ? 'The change next to each price-cut share is versus the prior edition.' : '')}
${areaTable('Austin ZIP codes', e.zips, prev && prev.zips)}
${areaTable('Suburbs', e.cities, prev && prev.cities)}

${r.all ? `<h2>Austin asking rents</h2>
<p>For renters, and for owners weighing whether to rent out instead of selling: these are asking rents for rental listings active on the MLS in the City of Austin this week.</p>
<div class="mp-tw"><table class="mp-t"><thead><tr><th>Rental</th><th>Active rentals</th><th>Median asking rent</th><th>Middle half of asks</th></tr></thead><tbody>
${rentRow('All MLS-listed rentals', r.all)}${rentRow('1-bedroom', r.b1)}${rentRow('2-bedroom', r.b2)}${rentRow('3-bedroom house', r.b3sfr)}${rentRow('4+ bedroom house', r.b4sfr)}
</tbody></table></div>` : ''}

<h2>What this week means</h2>
<div class="mp-adv"><div><h3>For buyers</h3><p>${adv.buyers}</p></div><div><h3>For sellers</h3><p>${adv.sellers}</p></div></div>

<h2>Questions about this week</h2>
${faq.map(([q, ans]) => `<details class="mp-faq"><summary>${esc(q)}</summary><p>${esc(ans)}</p></details>`).join('')}

${methodology()}
${cta()}
<div class="mp-nav"><span>${prev ? `<a href="${editionUrl(prev)}">&larr; Week of ${shortDate(prev.weekStart)}</a>` : ''}</span><a href="${HUB}">All editions</a><span>${next ? `<a href="${editionUrl(next)}">Week of ${shortDate(next.weekStart)} &rarr;</a>` : ''}</span></div>
</div></main>`;
  return shell({ title: `${title} | Luke Allen`, description, canonical: editionUrl(e), jsonld, body });
}

// ── hub page ─────────────────────────────────────────────────────────
function renderHub() {
  const all = editions();
  const latest = all[0] || null;
  const history = all.slice().reverse().slice(-26).map(x => ({ id: x.id, v: x.austin && x.austin.cutPct }));
  const title = 'Austin Housing Market Report, Updated Weekly: The Austin Market Pulse';
  const description = `A free weekly Austin housing market report from Luke Allen, Austin Realtor (TREC #788149): the ${INDEX_NAME}, inventory, asking prices, days on market, and rents, computed from ACTRIS MLS data every Monday.`;
  const a = latest && latest.austin;
  const faq = [
    [`What is the ${INDEX_NAME}?`, `The ${INDEX_NAME} is the share of active residential for-sale listings in the City of Austin whose current list price is below their original list price. Luke Allen, an Austin Realtor (TREC #788149), computes it from ACTRIS MLS data and publishes it every Monday in the Austin Market Pulse. Right now it reads {{live:city=Austin:reducedPct:pct1|n/a}}.`],
    ['How often is the Austin Market Pulse published?', 'Every Monday morning (Central time). Each edition is a dated snapshot that is never revised, so the archive shows how the Austin market has moved week by week.'],
    ['Where does the data come from?', 'Every figure comes from active and pending listings in ACTRIS MLS, the multiple listing service for the Austin area, received through MLS Grid and computed by Luke Allen. No outside sources are used and no individual sale prices are published.'],
    ['Is Austin a buyer\'s or seller\'s market right now?', 'Check the live verdict on the buyer\'s or seller\'s market page, which updates throughout the day. As of {{asof}}, {{live:city=Austin:reducedPct:pct1|n/a}} of City of Austin listings carry a price cut and the median listing has been on the market {{live:city=Austin:medianDom|n/a}} days.'],
  ];
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: `${SITE}${HUB}`, author: AUTHOR, publisher: PUBLISHER,
      ...(latest ? { dateModified: latest.generatedAt } : {}),
      hasPart: all.slice(0, 20).map(e => ({ '@type': 'NewsArticle', headline: editionTitle(e), url: `${SITE}${editionUrl(e)}`, datePublished: e.generatedAt })) },
    { '@context': 'https://schema.org', '@type': 'Dataset', name: INDEX_NAME,
      description: `Weekly share of active residential for-sale listings in the City of Austin, Texas priced below their original list price. Computed by Luke Allen (TREC #788149) from ACTRIS MLS data and published every Monday.`,
      creator: AUTHOR, url: `${SITE}${HUB}`, isAccessibleForFree: true, spatialCoverage: { '@type': 'Place', name: 'Austin, Texas' },
      ...(all.length ? { temporalCoverage: `${all[all.length - 1].published}/${latest.published}` } : {}),
      variableMeasured: { '@type': 'PropertyValue', name: INDEX_NAME, unitText: 'percent' } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Austin Market Pulse', item: `${SITE}${HUB}` } ] },
  ];
  const body = `<header class="mp-hero"><div class="mp-wrap">
<div class="mp-crumb"><a href="/">Home</a> / Austin Market Pulse</div>
<div class="mp-ey">Weekly · Every Monday</div>
<h1>The Austin Market Pulse: Austin's Housing Market, Week by Week</h1>
<div class="mp-meta">By <a href="/luke-allen">Luke Allen</a>, Austin Realtor, TREC #788149 · Computed from ACTRIS MLS data</div>
</div></header>
<main class="mp"><div class="mp-wrap">
<p>Every Monday, Luke Allen takes a snapshot of the Austin housing market straight from the MLS and publishes it here: how many homes are for sale, what they are asking, how long they are sitting, how many have cut their price, and what rentals are asking. Each edition is dated and never revised, so the archive below is a week-by-week record of the market.</p>
<div class="mp-idx"><div><div class="mp-idx-l">${INDEX_NAME} · right now</div><div class="mp-idx-n">{{live:city=Austin:reducedPct:pct1|n/a}}</div></div>
<div class="mp-idx-t">Share of active City of Austin listings priced below their original asking price, as of {{asof}}. ${a ? `In the latest weekly edition (week of ${longDate(latest.weekStart)}) it was ${pct1(a.cutPct)}.` : ''}</div></div>
${latest ? `<h2>Latest edition: week of ${longDate(latest.weekStart)}</h2>
<p>${leadParagraph(latest, all[1] || null)}</p>
<p><a href="${editionUrl(latest)}">Read the full report for the week of ${longDate(latest.weekStart)} &rarr;</a></p>` : '<p>The first edition is being prepared and will appear here shortly.</p>'}
${indexChart(history) ? `<h2>The ${INDEX_NAME} over time</h2>${indexChart(history)}` : ''}
${all.length ? `<h2>All editions</h2><ul class="mp-arch">${all.map(e => `<li><a href="${editionUrl(e)}">Week of ${longDate(e.weekStart)}</a><span>Index ${pct1(e.austin && e.austin.cutPct)} · ${num(e.austin && e.austin.count)} active</span></li>`).join('')}</ul>` : ''}
<h2>About the Austin Market Pulse</h2>
${faq.map(([q, ans]) => `<details class="mp-faq"><summary>${esc(q)}</summary><p>${ans}</p></details>`).join('')}
<p>For figures that update throughout the day, see the <a href="/austin-buyers-or-sellers-market">live buyer's or seller's market page</a> and the <a href="/market-report">Austin market report</a>. Neighborhood-level numbers live on each <a href="/neighborhoods">neighborhood guide</a>.</p>
${methodology()}
${cta()}
</div></main>`;
  return shell({ title: `Austin Housing Market Report, Weekly | ${INDEX_NAME} | Luke Allen`, description, canonical: HUB, jsonld, body, ogType: 'website' });
}

// ── Google Business Profile blurb (emailed to Luke) ──────────────────
function gbpBlurb(e) {
  const all = editions();
  const i = all.findIndex(x => x.id === e.id);
  const prev = i >= 0 ? all[i + 1] : null;
  const a = e.austin;
  const d = prev ? Math.round((a.cutPct - prev.austin.cutPct) * 10) / 10 : null;
  const move = d == null ? '' : d >= 0.5 ? ` (up ${d.toFixed(1)} points from last week)` : d <= -0.5 ? ` (down ${Math.abs(d).toFixed(1)} points from last week)` : ' (about the same as last week)';
  const txt = `Austin housing market, week of ${longDate(e.weekStart)}: ${pct1(a.cutPct)} of homes for sale in Austin are priced below their original ask${move}. `
    + `${num(a.count)} active listings, a ${money(a.medianPrice)} median asking price, ${num(a.medianDom)} median days on market, and ${num(a.newListings7)} new listings this week. `
    + (e.metro.monthsSupply != null ? `Greater Austin has about ${e.metro.monthsSupply.toFixed(1)} months of supply. ` : '')
    + `Full neighborhood-by-neighborhood report, computed from MLS data: ${SITE}${editionUrl(e)}`;
  return txt.slice(0, 1450);
}

module.exports = {
  HUB, INDEX_NAME, STORE, editions, edition, generate, isDue, takeSnapshot,
  renderEdition, renderHub, gbpBlurb, editionUrl, editionTitle, weekStartCT,
};
