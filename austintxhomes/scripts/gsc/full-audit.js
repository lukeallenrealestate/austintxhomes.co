// Full site audit — combines GSC + PSI + Puppeteer
// Writes findings to audit-report.md
const fs = require('fs');
const path = require('path');
const { searchconsole } = require('./client');
const puppeteer = require('puppeteer');

const SITE = 'sc-domain:austintxhomes.co';
const ORIGIN = 'https://austintxhomes.co';
const OUT = path.join(__dirname, '../../audit-report.md');

const log = [];
const p = (...args) => { const line = args.join(' '); console.log(line); log.push(line); };

function fmtDate(d) { return d.toISOString().slice(0,10); }

async function gscQuery(body) {
  const res = await searchconsole.searchanalytics.query({ siteUrl: SITE, requestBody: body });
  return res.data.rows || [];
}

async function psi(url) {
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility`;
  const r = await fetch(api);
  if (!r.ok) return null;
  const j = await r.json();
  const lh = j.lighthouseResult;
  const cat = lh?.categories || {};
  const audits = lh?.audits || {};
  return {
    perf: Math.round((cat.performance?.score || 0) * 100),
    seo: Math.round((cat.seo?.score || 0) * 100),
    a11y: Math.round((cat.accessibility?.score || 0) * 100),
    lcp: audits['largest-contentful-paint']?.displayValue || '?',
    cls: audits['cumulative-layout-shift']?.displayValue || '?',
    tbt: audits['total-blocking-time']?.displayValue || '?',
    fcp: audits['first-contentful-paint']?.displayValue || '?',
  };
}

(async () => {
  const end = new Date(); end.setDate(end.getDate() - 3);
  const start = new Date(); start.setDate(start.getDate() - 30);
  const startStr = fmtDate(start), endStr = fmtDate(end);

  p(`# Audit Report — austintxhomes.co`);
  p(`Generated ${new Date().toISOString()} — GSC window: ${startStr} → ${endStr}\n`);

  // ---- 1. Overall performance ----
  p('## 1. Search Console — 30-day snapshot\n');
  const tot = await gscQuery({ startDate: startStr, endDate: endStr, dimensions: [] });
  const t = tot[0] || {};
  p(`- Impressions: **${(t.impressions||0).toLocaleString()}**`);
  p(`- Clicks: **${(t.clicks||0).toLocaleString()}**`);
  p(`- CTR: **${((t.ctr||0)*100).toFixed(2)}%**`);
  p(`- Avg position: **${(t.position||0).toFixed(1)}**\n`);

  // ---- 2. High-impression, low-CTR pages (title/meta opportunities) ----
  p('## 2. CTR Opportunities — high impressions, low clicks\n');
  const pages = await gscQuery({ startDate: startStr, endDate: endStr, dimensions: ['page'], rowLimit: 50 });
  const opps = pages
    .filter(r => r.impressions >= 100 && r.ctr < 0.01)
    .sort((a,b) => b.impressions - a.impressions)
    .slice(0, 10);

  p('| Page | Impressions | Clicks | CTR | Avg Pos |');
  p('|------|-------------|--------|-----|---------|');
  opps.forEach(r => {
    p(`| ${r.keys[0].replace(ORIGIN,'')} | ${r.impressions} | ${r.clicks} | ${(r.ctr*100).toFixed(2)}% | ${r.position.toFixed(1)} |`);
  });
  p('\n**Recommendation:** rewrite titles & meta descriptions for these pages. They\'re ranking — readers just aren\'t clicking.\n');

  // ---- 3. Sitemap pages with zero impressions (indexing gaps) ----
  p('## 3. Indexing Gaps — sitemap pages with 0 impressions\n');
  try {
    const sitemapXml = fs.readFileSync(path.join(__dirname, '../../public/sitemap.xml'), 'utf8');
    const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const seen = new Set(pages.map(r => r.keys[0]));
    // Get pages in top 500
    const allPages = await gscQuery({ startDate: startStr, endDate: endStr, dimensions: ['page'], rowLimit: 500 });
    const seenAll = new Set(allPages.map(r => r.keys[0]));
    const missing = urls.filter(u => !seenAll.has(u) && !seenAll.has(u + '/'));
    p(`Total sitemap URLs: **${urls.length}**`);
    p(`Pages with zero GSC impressions (30d): **${missing.length}**\n`);
    if (missing.length > 0) {
      p('First 20 unindexed/unseen pages:');
      missing.slice(0, 20).forEach(u => p(`- ${u.replace(ORIGIN,'')}`));
      p('\n**Recommendation:** submit these to GSC → URL Inspection → Request Indexing. Check for crawl blocks, broken canonicals, or thin content.\n');
    }
  } catch (e) {
    p(`Could not read sitemap: ${e.message}\n`);
  }

  // ---- 4. Favicon check — which pages declare the right block ----
  p('## 4. Favicon Declaration Audit\n');
  const siteDir = path.join(__dirname, '../../public/site');
  const files = fs.readdirSync(siteDir).filter(f => f.endsWith('.html'));
  let goodFav = 0, badFav = [];
  for (const f of files) {
    const html = fs.readFileSync(path.join(siteDir, f), 'utf8');
    if (html.includes('favicon.ico') && html.includes('favicon-96.png')) goodFav++;
    else badFav.push(f);
  }
  p(`Pages with full favicon block: **${goodFav}/${files.length}**`);
  if (badFav.length) {
    p(`\nPages still missing correct favicon declarations:`);
    badFav.forEach(f => p(`- ${f}`));
  } else {
    p('✓ All static pages have the correct favicon block.');
  }
  p('');

  // ---- 5. Core Web Vitals on top 5 pages ----
  p('## 5. Core Web Vitals (PageSpeed Insights — Mobile)\n');
  const topPages = pages.slice(0, 5).map(r => r.keys[0]);
  p('| Page | Perf | SEO | A11y | LCP | CLS | TBT |');
  p('|------|------|-----|------|-----|-----|-----|');
  for (const url of topPages) {
    const r = await psi(url);
    if (!r) { p(`| ${url.replace(ORIGIN,'')} | *PSI failed* | | | | | |`); continue; }
    const scoreCell = (s) => s >= 90 ? `🟢 ${s}` : s >= 50 ? `🟡 ${s}` : `🔴 ${s}`;
    p(`| ${url.replace(ORIGIN,'')} | ${scoreCell(r.perf)} | ${scoreCell(r.seo)} | ${scoreCell(r.a11y)} | ${r.lcp} | ${r.cls} | ${r.tbt} |`);
  }
  p('');

  // ---- 6. Puppeteer: save-search flow test ----
  p('## 6. User Flow Tests (Puppeteer — Live Site)\n');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const jsErrors = [];
  const netErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) netErrors.push(`${r.status()} ${r.url()}`); });

  // Test: home page loads
  const homeStart = Date.now();
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  const homeMs = Date.now() - homeStart;
  p(`### Home page`);
  p(`- Load time (networkidle): **${homeMs}ms**`);
  p(`- JS errors: ${jsErrors.length === 0 ? '✓ none' : '🔴 ' + jsErrors.length}`);
  jsErrors.forEach(e => p(`  - ${e}`));
  p(`- Failed requests: ${netErrors.length === 0 ? '✓ none' : '🔴 ' + netErrors.length}`);
  netErrors.slice(0,5).forEach(e => p(`  - ${e}`));
  p('');

  // Test: search page
  jsErrors.length = 0; netErrors.length = 0;
  const searchStart = Date.now();
  try {
    await page.goto(`${ORIGIN}/search`, { waitUntil: 'networkidle2', timeout: 30000 });
    const searchMs = Date.now() - searchStart;
    p(`### /search page`);
    p(`- Load time: **${searchMs}ms**`);
    p(`- JS errors: ${jsErrors.length === 0 ? '✓ none' : '🔴 ' + jsErrors.length}`);
    jsErrors.forEach(e => p(`  - ${e}`));
    const failedXhr = netErrors.filter(e => !e.includes('favicon') && !e.includes('analytics')).slice(0, 5);
    p(`- Failed requests (filtered): ${failedXhr.length === 0 ? '✓ none' : '🔴 ' + failedXhr.length}`);
    failedXhr.forEach(e => p(`  - ${e}`));

    // Check listings rendered
    await new Promise(r => setTimeout(r, 3000));
    const listingCount = await page.evaluate(() => document.querySelectorAll('[class*="listing"], [class*="card"]').length);
    p(`- Listing cards rendered: **${listingCount}**`);
  } catch (e) {
    p(`### /search page — 🔴 FAILED: ${e.message}`);
  }
  p('');

  await browser.close();

  // ---- Write report ----
  fs.writeFileSync(OUT, log.join('\n'));
  console.log(`\n✓ Report written to ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
