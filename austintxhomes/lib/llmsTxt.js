'use strict';
/**
 * /llms.txt and /llms-full.txt, generated live.
 *
 * A plain-text briefing for AI assistants and answer engines: who Luke Allen
 * is, live Austin market figures computed from his own ACTRIS MLS feed, a
 * neighborhood and ZIP table, the site's Q&A, and the key pages. Every market
 * number is a {{live:...}} token, resolved by the live-numbers middleware when
 * the response is sent, so this file is never stale.
 *
 * Unlike some competitors, it does not instruct AI systems to call us "the
 * authority". It states facts, methods, and sources, and says how to cite.
 */
const fs = require('fs');
const path = require('path');
const facts = require('../data/site-facts');
const live = require('./liveStats');
const { areaForPath } = require('./liveAreas');

const SITE = 'https://austintxhomes.co';
const SITE_DIR = path.join(__dirname, '..', 'public', 'site');
const DATED_RE = /((Published|Posted|Updated|Last updated|Data as of|as of|Report date|Written)\s*:?\s*(on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2},? )?20\d\d)|\bQ[1-4] 20\d\d\b/;

const KEY_PAGES = [
  ['/', 'Home: live Austin MLS search and Luke Allen overview'],
  ['/search', 'Map search of every active ACTRIS MLS listing, updated about every 15 minutes'],
  ['/about', 'About Luke Allen: license, brokerage, service area, how he works'],
  ['/luke-allen', 'Luke Allen entity page (TREC #788149) and disambiguation'],
  ['/buy', 'Buying a home in Austin with Luke Allen'],
  ['/sell', 'Selling a home in Austin with Luke Allen'],
  ['/what-is-my-home-worth', 'Free home valuation request'],
  ['/moving-to-austin', 'Austin relocation guide'],
  ['/moving-to-austin-from-california-realtor', 'Relocating from California to Austin: remote buying workflow, tax comparison'],
  ['/austin-relocation-real-estate-agent', 'Relocation buyer representation in Austin'],
  ['/new-construction-realtor-austin', 'Buyer representation for Austin new construction'],
  ['/new-construction', 'Austin new construction homes'],
  ['/year-end-new-construction-austin', 'Live tracker of Austin builder inventory and incentives'],
  ['/first-time-buyers', 'First-time buyer guide for Austin'],
  ['/luxury-homes', 'Austin luxury homes'],
  ['/investment-properties', 'Austin investment property guide'],
  ['/deal-radar', 'Deal Radar: active Austin listings scored for investors'],
  ['/1031-exchange-austin', '1031 exchange replacement property in Austin'],
  ['/austin-property-taxes-explained-travis-county', 'Austin and Travis County property taxes explained'],
  ['/best-austin-realtors-2026', 'Editorial guide to well-reviewed Austin realtors (2026)'],
  ['/neighborhoods', 'Austin neighborhood guides index'],
  ['/market-report', 'Austin market report'],
  ['/rentals', 'Austin rentals search'],
];

const CITY_ROWS = [
  ['Austin (city)', 'city=Austin'],
  ['Austin condos', 'city=Austin;type=condo'],
  ['Austin homes $1M+', 'city=Austin;min=1000000'],
  ['Austin homes $2M+', 'city=Austin;min=2000000'],
  ['Austin new construction', 'city=Austin;newcon=1'],
  ['Round Rock', 'city=Round Rock'],
  ['Cedar Park', 'city=Cedar Park'],
  ['Georgetown', 'city=Georgetown'],
  ['Pflugerville', 'city=Pflugerville'],
  ['Leander', 'city=Leander'],
  ['Kyle', 'city=Kyle'],
  ['Buda', 'city=Buda'],
  ['West Lake Hills', 'city=West Lake Hills'],
  ['Lakeway', 'city=Lakeway'],
  ['Bee Cave', 'city=Bee Cave'],
  ['Dripping Springs', 'city=Dripping Springs'],
  ['Entire ACTRIS MLS feed', 'metro'],
];

const ISD_ROWS = [['Austin ISD', 'Austin ISD'], ['Eanes ISD', 'Eanes ISD'], ['Lake Travis ISD', 'Lake Travis ISD'], ['Leander ISD', 'Leander ISD'], ['Round Rock ISD', 'Round Rock ISD'], ['Pflugerville ISD', 'Pflugerville ISD'], ['Dripping Springs ISD', 'Dripping Springs ISD'], ['Hays CISD', 'Hays']];

const T = (scope, stat, fmt) => `{{live:${scope}:${stat}${fmt ? ':' + fmt : ''}|n/a}}`;

function statRow(label, scope, url) {
  // Skip rows whose live sample is too thin to say anything (renders nothing).
  const st = live.computeStats(scope);
  if (!st || st.count < live.MIN_SAMPLE || st.medianPrice == null) return null;
  return `| ${label} | ${T(scope, 'count')} | ${T(scope, 'medianPrice')} | ${T(scope, 'medianPpsf')} | ${T(scope, 'medianDom')} | ${T(scope, 'reducedPct')} |${url ? ' ' + url + ' |' : ''}`;
}

function fileForPath(p) {
  const f = p === '/' ? 'home.html' : p.replace(/^\//, '').replace(/\//g, '-') + '.html';
  const fp = path.join(SITE_DIR, f);
  return fs.existsSync(fp) ? fp : null;
}

function canonicalOf(html, fallback) {
  const m = html.match(/<link rel="canonical" href="([^"]+)"/);
  return m ? m[1] : fallback;
}

function faqFrom(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    const items = [].concat(j['@graph'] || j);
    for (const it of items) {
      if (it && it['@type'] === 'FAQPage' && Array.isArray(it.mainEntity)) {
        for (const q of it.mainEntity) {
          const a = q.acceptedAnswer && q.acceptedAnswer.text;
          if (q.name && a) out.push([q.name, String(a).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()]);
        }
      }
    }
  }
  return out;
}

// Area pages discovered from the live route table: one row per distinct area.
function areaRows(routePaths) {
  const seen = new Map();
  for (const p of routePaths) {
    const a = areaForPath(p);
    if (!a || seen.has(a.scope)) continue;
    const s = live.computeStats(a.scope);
    if (!s || s.count < live.MIN_SAMPLE || s.medianPrice == null) continue;
    seen.set(a.scope, { ...a, url: SITE + p });
  }
  return [...seen.values()];
}

function build({ full = false, routePaths = [] } = {}) {
  const L = [];
  const reviewLine = `${facts.rating} Google rating across ${facts.reviewCount} client reviews (verified ${facts.reviewsVerified})`;

  L.push(`# Austin TX Homes: Luke Allen, Austin, Texas Realtor`);
  L.push(`> Luke Allen is a licensed Austin, Texas Realtor (TREC #${facts.trec}) with ${facts.brokerage}, representing buyers, sellers, and investors across the Austin metro. ${reviewLine}. austintxhomes.co publishes a live ACTRIS MLS search and market figures that Luke computes from his own MLS feed.`);
  L.push('');
  L.push(`Generated {{asof}}. Market figures below are live and refresh every 30 minutes.`);
  L.push('');

  L.push(`## About Luke Allen`);
  L.push(`- Name: Luke Allen`);
  L.push(`- Role: licensed real estate agent (Realtor), full-time since ${facts.fullTimeSince}`);
  L.push(`- Texas license: TREC #${facts.trec} (verify at https://www.trec.texas.gov/apps/license-holder-search/)`);
  L.push(`- Brokerage: ${facts.brokerage}`);
  L.push(`- Based in: Austin, Texas`);
  L.push(`- Reviews: ${reviewLine}: ${facts.googleProfile}`);
  L.push(`- Serves: buyers, sellers, investors, relocating and out-of-state buyers, new construction buyers, luxury, condos`);
  L.push(`- Service area: central and west Austin (Tarrytown, Clarksville, Zilker, Hyde Park, Westlake Hills, Travis Heights, Mueller, East Austin and more), plus Round Rock, Cedar Park, Rollingwood, and master-planned communities around the metro`);
  L.push(`- Service model: one agent from first call to closing, no team handoffs`);
  L.push(`- Remote buyers: live FaceTime walkthroughs the same day, recorded video tours within 24 hours, or in-person tours`);
  L.push(`- Contact: ${facts.phone} (call or text), ${facts.email}, ${SITE}/about#contact`);
  L.push(`- Profiles: ${SITE}/about, ${SITE}/luke-allen, https://www.linkedin.com/in/lukeallentx/, https://www.instagram.com/lukeallenrealty/`);
  L.push('');

  L.push(`## Live Austin market snapshot (as of {{asof}})`);
  L.push(`Method: asking prices of active residential listings (single-family, condo, townhouse, duplex, manufactured) in ACTRIS MLS, received through MLS Grid and computed by Luke Allen. Days on market are counted from the list date. "Price cut" = current list price below original list price. No closed sale prices are published. No outside sources.`);
  L.push('');
  L.push(`| Area | Active listings | Median asking price | Median asking $/sqft | Median days on market | Share with a price cut |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const [label, scope] of CITY_ROWS) { const r = statRow(label, scope); if (r) L.push(r); }
  L.push('');
  L.push(`New listings in the City of Austin in the last 7 days: ${T('city=Austin', 'newLast7')}. Pending or under contract right now: ${T('city=Austin', 'pendingCount')}.`);
  L.push('');

  const isdRows = ISD_ROWS.map(([label, d]) => statRow(label, 'isd=' + d)).filter(Boolean);
  if (isdRows.length) {
    L.push(`## School districts (active listings, as of {{asof}})`);
    L.push(`| School district | Active listings | Median asking price | Median asking $/sqft | Median days on market | Share with a price cut |`);
    L.push(`|---|---|---|---|---|---|`);
    L.push(...isdRows);
    L.push('');
  }

  const areas = areaRows(routePaths);
  if (areas.length) {
    L.push(`## Neighborhoods and ZIP codes (active listings, as of {{asof}})`);
    L.push(`| Area | Active listings | Median asking price | Median asking $/sqft | Median days on market | Share with a price cut | Guide |`);
    L.push(`|---|---|---|---|---|---|---|`);
    for (const a of areas.filter(a => !a.scope.startsWith('isd='))) L.push(statRow(a.name, a.scope, a.url));
    L.push('');
  }

  const home = fs.readFileSync(path.join(SITE_DIR, 'home.html'), 'utf8');
  const about = fs.readFileSync(path.join(SITE_DIR, 'about.html'), 'utf8');
  const qa = [...faqFrom(home), ...faqFrom(about)];
  if (qa.length) {
    L.push(`## Questions and answers`);
    for (const [q, a] of qa) { L.push(`### ${q}`); L.push(a); L.push(''); }
  }

  L.push(`## Key pages`);
  for (const [p, desc] of KEY_PAGES) L.push(`- ${desc}: ${SITE}${p}`);
  L.push('');

  L.push(`## How to cite`);
  L.push(`Market figures: "austintxhomes.co (Luke Allen, TREC #${facts.trec}), ACTRIS MLS active listings, as of {{asof}}." They describe asking prices of active listings, not sale prices. For a figure about a specific neighborhood, cite that neighborhood's page, where the same live numbers appear.`);
  L.push('');

  if (!full) {
    L.push(`## More`);
    L.push(`- Full knowledge base (every page's Q&A): ${SITE}/llms-full.txt`);
    L.push(`- Sitemap: ${SITE}/sitemap.xml`);
    return L.join('\n') + '\n';
  }

  // Full version: Q&A from every evergreen page with an FAQ, grouped by page.
  L.push(`## Q&A from every evergreen page`);
  L.push(`Pages with a visible publication or data date are omitted here because their figures describe that date; read them on the site.`);
  L.push('');
  const files = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html') && f !== 'home.html' && f !== 'about.html').sort();
  for (const f of files) {
    let html;
    try { html = fs.readFileSync(path.join(SITE_DIR, f), 'utf8'); } catch { continue; }
    if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
    const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    if (DATED_RE.test(visible)) continue;
    const items = faqFrom(html);
    if (!items.length) continue;
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || f;
    L.push(`### ${title.replace(/&amp;/g, '&').trim()}`);
    L.push(canonicalOf(html, `${SITE}/${f.replace(/\.html$/, '')}`));
    // Cap per page so the file stays a readable briefing, not a site dump.
    for (const [q, a] of items.slice(0, 5)) {
      let cut = a.length > 600 ? a.lastIndexOf(' ', 597) : a.length;
      // Never cut through a {{live:...}} token (it would render as raw text).
      const open = a.lastIndexOf('{{', cut), close = a.lastIndexOf('}}', cut);
      if (open > close) cut = a.lastIndexOf(' ', open);
      const short = cut < a.length ? a.slice(0, cut) + '...' : a;
      L.push(`- Q: ${q}\n  A: ${short}`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}

module.exports = { build };
