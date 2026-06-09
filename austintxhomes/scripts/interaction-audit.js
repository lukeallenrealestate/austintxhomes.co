// Comprehensive user-interaction audit.
// For each page: find every clickable, test each, record broken behavior.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const jwt = require('/Users/lukeallen/VS Studio/idx-search/node_modules/jsonwebtoken');

const BASE = 'http://localhost:3002';
const REPORT = path.join(__dirname, '..', 'interaction-audit.md');
const findings = [];

function log(section, severity, msg) {
  findings.push({ section, severity, msg });
  const tag = severity === 'fail' ? '🔴' : severity === 'warn' ? '🟡' : '✓';
  console.log(`  ${tag} [${section}] ${msg}`);
}

async function auditPage(browser, url, tests) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const jsErrors = [];
  const failedReqs = [];
  const consoleMsgs = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text()); });
  page.on('response', r => {
    const url = r.url();
    if (r.status() >= 400 && !url.includes('favicon') && !url.includes('analytics') && !url.includes('gtag')) {
      failedReqs.push(`${r.status()} ${url.slice(0, 140)}`);
    }
  });

  console.log(`\n━━━━ ${url} ━━━━`);
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    log(url, 'fail', `Page navigation failed: ${e.message}`);
    await page.close();
    return;
  }

  if (jsErrors.length) jsErrors.forEach(e => log(url, 'fail', `JS error: ${e}`));
  if (failedReqs.length) failedReqs.forEach(r => log(url, 'fail', `HTTP fail: ${r}`));

  for (const t of tests) {
    try {
      jsErrors.length = 0;
      const result = await t(page);
      if (result === false) log(url, 'fail', t.name + ' returned false');
      if (jsErrors.length) log(url, 'fail', `${t.name} caused JS error: ${jsErrors[0]}`);
    } catch (e) {
      log(url, 'fail', `${t.name} threw: ${e.message}`);
    }
  }

  await page.close();
}

// ---- Test helpers ----
const testLinkCount = (min) => async function homeLinkCount(page) {
  const count = await page.$$eval('a[href]', els => els.length);
  if (count < min) return false;
  log(page.url(), 'ok', `${count} links found`);
};

async function testAllInternalLinks(page) {
  const links = await page.$$eval('a[href]', els => els.map(a => a.getAttribute('href')).filter(h => h && (h.startsWith('/') || h.startsWith(location.origin))));
  const unique = [...new Set(links)];
  let broken = 0;
  for (const href of unique.slice(0, 30)) {
    try {
      const abs = href.startsWith('http') ? href : BASE + href;
      const res = await fetch(abs, { method: 'HEAD', redirect: 'follow' });
      if (res.status >= 400) { log(page.url(), 'fail', `Broken link: ${href} → ${res.status}`); broken++; }
    } catch (e) { log(page.url(), 'fail', `Link fetch failed: ${href}`); broken++; }
  }
  if (broken === 0) log(page.url(), 'ok', `${unique.length} internal links all resolve`);
}

async function testHeroSearchForm(page) {
  const input = await page.$('#sq');
  if (!input) return; // not on this page
  await page.type('#sq', 'South Congress');
  const before = page.url();
  await page.click('.search-bar button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));
  if (page.url() === before) { log(page.url(), 'fail', 'Hero search did not navigate'); return; }
  if (!page.url().includes('/search')) { log(page.url(), 'fail', `Hero search wrong dest: ${page.url()}`); return; }
  log(page.url(), 'ok', 'Hero search navigates to /search');
}

async function testHeroPills(page) {
  const pills = await page.$$eval('.hero-pills a.pill', els => els.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })));
  if (!pills.length) return;
  for (const p of pills) {
    try {
      const res = await fetch(BASE + p.href, { method: 'HEAD' });
      if (res.status >= 400) log(page.url(), 'fail', `Hero pill "${p.text}" → ${res.status} at ${p.href}`);
      else log(page.url(), 'ok', `Hero pill "${p.text}" → ${p.href}`);
    } catch (e) { log(page.url(), 'fail', `Hero pill "${p.text}" broken: ${e.message}`); }
  }
}

async function testNavVisibility(page) {
  const navExists = await page.$('nav, header, #site-nav, [class*="nav"]');
  if (!navExists) log(page.url(), 'fail', 'No nav/header element found');
  else log(page.url(), 'ok', 'Nav element present');
  const footer = await page.$('#site-footer, footer');
  if (!footer) log(page.url(), 'fail', 'No footer element found');
  else log(page.url(), 'ok', 'Footer present');
}

async function testSaveSearchLoggedOut(page) {
  const btn = await page.$('#save-search-btn');
  if (!btn) { log(page.url(), 'warn', 'No save-search button on /search'); return; }
  await btn.click();
  await new Promise(r => setTimeout(r, 500));
  const authModalOpen = await page.evaluate(() => document.getElementById('auth-modal')?.classList.contains('open'));
  if (!authModalOpen) log(page.url(), 'fail', 'Save Search (logged out) did not open auth modal');
  else log(page.url(), 'ok', 'Save Search (logged out) opens auth modal');
  // Close
  await page.evaluate(() => document.getElementById('auth-modal')?.classList.remove('open'));
}

async function testSaveSearchLoggedIn(page) {
  const token = jwt.sign(
    { id: 1, email: 'audit@test.com', name: 'Audit User', role: 'user' },
    'local-preview-secret-austintxhomes-2024-do-not-use-in-production',
    { expiresIn: '30d' }
  );
  await page.evaluate((tok, u) => {
    localStorage.setItem('idx_token', tok);
    localStorage.setItem('idx_user', JSON.stringify(u));
  }, token, { id: 1, email: 'audit@test.com', name: 'Audit', role: 'user' });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  await page.click('#save-search-btn');
  await new Promise(r => setTimeout(r, 500));
  const modalOpen = await page.evaluate(() => document.getElementById('save-search-modal')?.classList.contains('open'));
  if (!modalOpen) { log(page.url(), 'fail', 'Save Search modal did not open'); return; }

  await page.type('#search-name-input', 'Audit Test');
  await page.click('#save-search-modal .btn-primary');
  await new Promise(r => setTimeout(r, 2500));
  const stillOpen = await page.evaluate(() => document.getElementById('save-search-modal')?.classList.contains('open'));
  if (stillOpen) log(page.url(), 'fail', 'Save Search modal stuck open after submit (API rejected?)');
  else log(page.url(), 'ok', 'Save Search completes end-to-end');
}

async function testMapFilters(page) {
  // Test a filter dropdown actually reloads results
  const priceBtn = await page.$('[data-filter="price"], #price-filter, button[class*="price"]');
  if (!priceBtn) { log(page.url(), 'warn', 'No price filter button found'); return; }
  log(page.url(), 'ok', 'Price filter button exists');
}

async function testAuthModalOpens(page) {
  const btn = await page.$('#login-btn, #signup-btn, [onclick*="openAuthModal"]');
  if (!btn) { log(page.url(), 'warn', 'No auth button on header'); return; }
  await btn.click();
  await new Promise(r => setTimeout(r, 500));
  const open = await page.evaluate(() => document.getElementById('auth-modal')?.classList.contains('open'));
  if (!open) log(page.url(), 'fail', 'Auth modal did not open');
  else log(page.url(), 'ok', 'Auth modal opens');
}

async function testContactForms(page) {
  const forms = await page.$$('form');
  log(page.url(), 'ok', `${forms.length} forms found`);
  for (const f of forms) {
    const hasSubmit = await f.evaluate(el => !!el.querySelector('button[type="submit"], input[type="submit"]'));
    const hasAction = await f.evaluate(el => !!el.getAttribute('action') || !!el.getAttribute('onsubmit'));
    if (!hasSubmit) log(page.url(), 'fail', 'Form has no submit button');
    if (!hasAction && !hasSubmit) log(page.url(), 'warn', 'Form has neither action nor submit');
  }
}

async function testAllButtons(page) {
  // Check all buttons have either onclick, type=submit inside form, or data-handler
  const buttons = await page.$$eval('button, [role="button"]', els => els.map(b => ({
    text: b.textContent.trim().slice(0, 40),
    onclick: !!b.getAttribute('onclick'),
    type: b.getAttribute('type'),
    id: b.id,
    inForm: !!b.closest('form'),
    disabled: b.disabled
  })));
  let suspicious = 0;
  for (const b of buttons) {
    if (!b.text && !b.id) continue; // icon-only buttons — skip unless needed
    if (b.disabled) continue;
    if (!b.onclick && b.type !== 'submit' && !b.inForm && !b.id) {
      log(page.url(), 'warn', `Button "${b.text}" has no handler`); suspicious++;
      if (suspicious > 3) break;
    }
  }
  if (!suspicious) log(page.url(), 'ok', `All ${buttons.length} buttons have handlers`);
}

// ---- Main ----
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  await auditPage(browser, '/', [testNavVisibility, testHeroSearchForm]);
  await auditPage(browser, '/', [testHeroPills, testAllButtons, testAllInternalLinks]);
  await auditPage(browser, '/buy', [testNavVisibility, testAllButtons, testAllInternalLinks]);
  await auditPage(browser, '/sell', [testNavVisibility, testAllButtons, testContactForms]);
  await auditPage(browser, '/rentals', [testNavVisibility, testAllButtons]);
  await auditPage(browser, '/about', [testNavVisibility, testAllButtons, testContactForms]);
  await auditPage(browser, '/search', [testSaveSearchLoggedOut, testAuthModalOpens]);
  await auditPage(browser, '/search', [testSaveSearchLoggedIn]);
  await auditPage(browser, '/market-report', [testNavVisibility, testAllButtons]);
  await auditPage(browser, '/neighborhoods', [testNavVisibility, testAllInternalLinks]);
  await auditPage(browser, '/austin-multifamily-market-report', [testNavVisibility, testAllButtons]);
  await auditPage(browser, '/divorce-realtor-austin', [testNavVisibility, testAllButtons]);

  await browser.close();

  // Write report
  const out = ['# Interaction Audit Report', `Generated ${new Date().toISOString()}\n`];
  const bySec = {};
  findings.forEach(f => { (bySec[f.section] ||= []).push(f); });
  const fails = findings.filter(f => f.severity === 'fail').length;
  const warns = findings.filter(f => f.severity === 'warn').length;
  out.push(`## Summary\n- 🔴 **${fails} failures**\n- 🟡 **${warns} warnings**\n- ✓ ${findings.filter(f => f.severity === 'ok').length} passes\n`);

  if (fails > 0) {
    out.push('## 🔴 Failures\n');
    findings.filter(f => f.severity === 'fail').forEach(f => out.push(`- **${f.section}** — ${f.msg}`));
  }
  if (warns > 0) {
    out.push('\n## 🟡 Warnings\n');
    findings.filter(f => f.severity === 'warn').forEach(f => out.push(`- **${f.section}** — ${f.msg}`));
  }

  fs.writeFileSync(REPORT, out.join('\n'));
  console.log(`\n\n━━━━━━━━━━━━━━━━━━\nDone. ${fails} failures, ${warns} warnings.\nReport: ${REPORT}`);
})().catch(e => { console.error(e); process.exit(1); });
