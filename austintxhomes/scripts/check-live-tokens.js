#!/usr/bin/env node
'use strict';
/**
 * Stale-number + live-token checker.  RULE: no stale numbers on undated pages.
 *
 *   node scripts/check-live-tokens.js public/site/foo.html [more files...]
 *   node scripts/check-live-tokens.js --all          (every public/site page + data/ + templates/)
 *   node scripts/check-live-tokens.js --all --summary
 *
 * For each file it reports:
 *   TOKEN ERRORS   malformed {{...}}, unknown stats, scopes that resolve to nothing
 *   NEEDS FALLBACK tokens on small/fragile scopes (nbhd, sub, isd, elem, high,
 *                  type, min/max, newcon) without a |fallback. In production a
 *                  thin sample renders the fallback instead of an empty string.
 *   CANDIDATES     sentences that still contain hard-coded market numbers
 *                  (heuristic: market keyword + $/%/count in one sentence).
 *                  Each must be tokenized, rewritten as timeless, or be on a
 *                  page whose visible date frames it (see DATED below).
 *   DATED          whether the page shows a specific visible date (published /
 *                  as-of / quarter). Only dated pages may keep frozen numbers.
 *
 * Exit code 1 if any TOKEN ERRORS (so it can gate a commit).
 * Note: resolution uses the LOCAL listings DB, which can hold stale actives,
 * so local counts run high. Validation here is about syntax + resolvability.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const summary = args.includes('--summary');
let files = args.filter(a => !a.startsWith('--'));
if (args.includes('--all')) {
  files = [
    ...fs.readdirSync(path.join(ROOT, 'public/site')).filter(f => f.endsWith('.html')).map(f => 'public/site/' + f),
    ...['data/neighborhoods.js', 'data/neighborhood-realtor-content.js', 'data/round-rock-neighborhoods.js'],
    ...fs.readdirSync(path.join(ROOT, 'templates')).filter(f => f.endsWith('.js')).map(f => 'templates/' + f),
  ];
}
if (!files.length) { console.error('usage: check-live-tokens.js <files...> | --all [--summary]'); process.exit(2); }

const L = require('../lib/liveStats');
const STATS = new Set(['count', 'pendingCount', 'medianPrice', 'avgPrice', 'medianPpsf', 'medianDom', 'medianSqft',
  'p10Price', 'p90Price', 'minPrice', 'maxPrice', 'reducedPct', 'reducedCount', 'newConPct', 'newConCount',
  'newLast7', 'newLast30', 'under400k', 't400_600k', 't600k_1m', 't1m_2m', 'over2m']);
const FORMATS = new Set(['auto', 'usd', 'k', 'm', 'num', 'pct', 'raw']);
const FRAGILE = /(^|;)\s*(nbhd|sub|isd|elem|high|type|min|max|newcon)\b/;

const KW = /(median|average|avg\.?|typical(ly)? (price|home|list)|days on (the )?market|\bDOM\b|active listings?|homes? (for sale|listed|on the market|currently)|inventory|months? of (supply|inventory)|per (square foot|sq\.? ?ft)|\/sq ?ft|\/sf\b|price per|sale[- ]to[- ]list|list[- ]to[- ]sale|price (cuts?|reductions?|drops?)|reduced|year[- ]over[- ]year|\bYoY\b|appreciat|homes sold|closed sales?|sold (for|in|homes)|sells? for|listings? (are|is)|currently|right now|this (month|quarter|year)|mortgage rates?|interest rates?|rents? (are|average|run)|cap rate|price range|starting (at|from)|priced (from|at|between)|range from)/i;
const NUM = /(\$\s?\d[\d,.]*\s?[KkMm]?\b|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?%|\b\d+\s+(days|homes|listings|sales|months|properties))/;
const DATE_RE = /((Published|Posted|Updated|Last updated|Data as of|as of|Report date|Written)\s*:?\s*(on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{1,2},? )?20\d\d)|\bQ[1-4] 20\d\d\b/;

const TOKEN_ANY = /\{\{([^{}]*)\}\}/g;

function waitReady(cb, tries = 0) {
  L.warm();
  if (L.isReady() || tries > 600) return cb();
  setTimeout(() => waitReady(cb, tries + 1), 250);
}

function visibleText(src, isHtml) {
  let s = src;
  if (isHtml) {
    s = s.replace(/<script(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
    // keep meta descriptions / titles: they are visible in search results
    s = s.replace(/<meta[^>]+content="([^"]*)"[^>]*>/g, ' $1. ');
    s = s.replace(/<[^>]+>/g, ' ');
  }
  return s.replace(/&nbsp;|&amp;|&#\d+;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
}

function checkFile(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const isHtml = rel.endsWith('.html');
  const errors = [], fragile = [];
  let tokens = 0, m;
  TOKEN_ANY.lastIndex = 0;
  while ((m = TOKEN_ANY.exec(src))) {
    const raw = m[1].trim();
    if (!/^(live|asof|year)\b/.test(raw)) continue; // not ours (e.g. template literals)
    tokens++;
    const body = raw.split('|')[0];
    const hasFb = raw.includes('|');
    const parts = body.split(':');
    if (parts[0] === 'asof' || parts[0] === 'year') continue;
    if (parts.length < 3 || parts.length > 4) { errors.push(`malformed: {{${raw}}}`); continue; }
    const [, scope, stat, fmt] = parts;
    if (!STATS.has(stat)) { errors.push(`unknown stat "${stat}": {{${raw}}}`); continue; }
    if (fmt && !FORMATS.has(fmt)) { errors.push(`unknown format "${fmt}": {{${raw}}}`); continue; }
    const st = L.computeStats(scope);
    if (!st) { errors.push(`scope does not resolve: {{${raw}}}`); continue; }
    if (st.count === 0 && !hasFb) errors.push(`scope has 0 listings locally: {{${raw}}}`);
    if (FRAGILE.test(scope) && !hasFb && stat !== 'count') fragile.push(`{{${raw}}}`);
  }
  // Candidate stale sentences: tokens replaced by a neutral word first.
  const text = visibleText(src.replace(/\{\{[^{}]*\}\}/g, 'LIVEVALUE'), isHtml);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const candidates = sentences.filter(s => KW.test(s) && NUM.test(s)).map(s => s.trim().slice(0, 240));
  const dated = isHtml ? DATE_RE.test(visibleText(src, true)) : false;
  return { rel, tokens, errors, fragile, candidates, dated };
}

waitReady(() => {
  let errCount = 0, candTotal = 0, pagesWithCands = 0;
  for (const f of files) {
    const r = checkFile(f);
    errCount += r.errors.length;
    candTotal += r.candidates.length;
    if (r.candidates.length) pagesWithCands++;
    if (summary) {
      if (r.errors.length || r.candidates.length || r.fragile.length) {
        console.log(`${String(r.candidates.length).padStart(4)} cand  ${String(r.tokens).padStart(3)} tok  ${r.errors.length ? r.errors.length + ' ERR ' : ''}${r.fragile.length ? r.fragile.length + ' nofb ' : ''}${r.dated ? 'DATED ' : ''}${r.rel}`);
      }
      continue;
    }
    console.log(`\n=== ${r.rel}  (${r.tokens} tokens${r.dated ? ', DATED' : ', undated'})`);
    r.errors.forEach(e => console.log('  TOKEN ERROR   ' + e));
    r.fragile.forEach(e => console.log('  NEEDS FALLBACK ' + e));
    r.candidates.forEach(c => console.log('  CANDIDATE     ' + c));
  }
  console.log(`\n${files.length} files | token errors: ${errCount} | candidate stale sentences: ${candTotal} on ${pagesWithCands} files`);
  process.exit(errCount ? 1 : 0);
});
