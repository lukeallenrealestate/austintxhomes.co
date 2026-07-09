// Deep interaction audit v2 — tests real user flows with click simulation.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const jwt = require('/Users/lukeallen/VS Studio/idx-search/node_modules/jsonwebtoken');

const BASE = 'http://localhost:3002';
const REPORT = path.join(__dirname, '..', 'interaction-audit-v2.md');
const results = [];

function record(section, severity, msg) {
  results.push({ section, severity, msg });
  const tag = severity === 'fail' ? '🔴' : severity === 'warn' ? '🟡' : severity === 'ok' ? '✓' : '•';
  console.log(`  ${tag} [${section}] ${msg}`);
}

async function makePage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page._jsErrors = [];
  page._failedReqs = [];
  page.on('pageerror', e => page._jsErrors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400) {
      const u = r.url();
      if (!u.includes('favicon') && !u.includes('analytics') && !u.includes('gtag') &&
          !/\/api\/properties\/photos\//.test(u)) { // ignore stale photo 404s in dev
        page._failedReqs.push(`${r.status()} ${u.slice(0,140)}`);
      }
    }
  });
  return page;
}

function loginToken() {
  return jwt.sign(
    { id: 1, email: 'audit@test.com', name: 'Audit User', role: 'user' },
    'local-preview-secret-austintxhomes-2024-do-not-use-in-production',
    { expiresIn: '30d' }
  );
}

// ========== TESTS ==========

async function testHomePage(browser) {
  const page = await makePage(browser);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('\n━━━ Home page ━━━');

  // 1. Hero search form
  await page.type('#sq', 'Barton Hills');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null),
    page.click('.search-bar button[type="submit"]')
  ]);
  if (page.url().includes('/search') && page.url().includes('Barton')) record('Home', 'ok', 'Hero search → /search with query');
  else record('Home', 'fail', `Hero search navigated wrong: ${page.url()}`);

  // 2. Hero pills (already verified last run)
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));

  // 3. Nav links
  const navLinks = await page.$$eval('nav a[href^="/"], header a[href^="/"]', els => els.map(a => a.getAttribute('href')));
  record('Home', 'ok', `${navLinks.length} nav links`);

  // 4. Footer is shared — test on home
  const footerLinks = await page.$$eval('#site-footer a[href]', els => els.map(a => a.getAttribute('href')));
  record('Home', 'ok', `${footerLinks.length} footer links`);
  // Spot-check 5 random footer links
  for (const href of footerLinks.slice(0, 5)) {
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) continue;
    const res = await fetch(BASE + href, { method: 'HEAD', redirect: 'follow' });
    if (res.status >= 400) record('Home', 'fail', `Footer link ${href} → ${res.status}`);
  }

  if (page._jsErrors.length) page._jsErrors.forEach(e => record('Home', 'fail', `JS: ${e}`));
  if (page._failedReqs.length) page._failedReqs.forEach(r => record('Home', 'fail', `HTTP: ${r}`));

  await page.close();
}

async function testSearchFullFlow(browser) {
  const page = await makePage(browser);
  console.log('\n━━━ /search full flow ━━━');

  await page.goto(BASE + '/search', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  // Listings should be visible
  const cards = await page.$$eval('[class*="listing"], [class*="card"]', els => els.length);
  if (cards === 0) record('/search', 'fail', 'No listing cards rendered');
  else record('/search', 'ok', `${cards} listing cards rendered`);

  // Test filter buttons exist & are clickable
  const filterBtns = await page.$$eval('.filter-btn', els => els.map(b => b.textContent.trim().slice(0,30)));
  if (filterBtns.length < 3) record('/search', 'fail', `Only ${filterBtns.length} filter buttons found (expected 5+)`);
  else record('/search', 'ok', `${filterBtns.length} filter buttons: ${filterBtns.slice(0,5).join(', ')}`);

  // Click price filter, see if dropdown opens
  try {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.filter-btn')].find(b => /price/i.test(b.textContent));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const dropdownOpen = await page.evaluate(() => !!document.querySelector('.filter-dropdown.open, .dropdown.open, [class*="dropdown"][class*="open"]'));
    if (dropdownOpen) record('/search', 'ok', 'Price filter dropdown opens');
    else record('/search', 'warn', 'Price filter dropdown did not open (or different class used)');
  } catch (e) { record('/search', 'fail', `Price filter: ${e.message}`); }

  // Click first listing card
  const firstCard = await page.$('a[href*="/property"], [class*="listing-card"] a, [class*="card"][onclick]');
  if (firstCard) {
    const href = await firstCard.evaluate(el => el.getAttribute('href') || el.getAttribute('onclick'));
    record('/search', 'ok', `First listing card has href: ${href?.slice(0,60)}`);
  } else {
    record('/search', 'warn', 'No clickable listing link found');
  }

  // Save search — not logged in → auth modal
  await page.click('#save-search-btn');
  await new Promise(r => setTimeout(r, 500));
  let authOpen = await page.evaluate(() => document.getElementById('auth-modal')?.classList.contains('open'));
  if (authOpen) record('/search', 'ok', 'Save Search (logged out) opens auth modal');
  else record('/search', 'fail', 'Save Search (logged out) did not open auth modal');
  await page.evaluate(() => document.getElementById('auth-modal')?.classList.remove('open'));

  // Log in, save search end-to-end
  await page.evaluate((tok, u) => {
    localStorage.setItem('idx_token', tok);
    localStorage.setItem('idx_user', JSON.stringify(u));
  }, loginToken(), { id: 1, email: 'audit@test.com', name: 'Audit', role: 'user' });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  await page.click('#save-search-btn');
  await new Promise(r => setTimeout(r, 400));
  const modalOpen = await page.evaluate(() => document.getElementById('save-search-modal')?.classList.contains('open'));
  if (!modalOpen) { record('/search', 'fail', 'Save search modal did not open (logged in)'); }
  else {
    await page.type('#search-name-input', 'Audit v2 Test');
    await page.click('#save-search-modal .btn-primary');
    await new Promise(r => setTimeout(r, 2500));
    const stillOpen = await page.evaluate(() => document.getElementById('save-search-modal')?.classList.contains('open'));
    if (stillOpen) record('/search', 'fail', 'Save search modal stuck open after submit');
    else record('/search', 'ok', 'Save search completes end-to-end');
  }

  // Favorites heart click (if present)
  const heartBtn = await page.$('.fav-btn, .favorite-btn, button[aria-label*="favorite" i], [class*="heart"]');
  if (heartBtn) {
    record('/search', 'ok', 'Favorite button exists');
  } else record('/search', 'warn', 'No favorite button found');

  if (page._jsErrors.length) page._jsErrors.forEach(e => record('/search', 'fail', `JS: ${e}`));
  if (page._failedReqs.length) page._failedReqs.slice(0,5).forEach(r => record('/search', 'fail', `HTTP: ${r}`));

  await page.close();
}

async function testAuthFlow(browser) {
  const page = await makePage(browser);
  console.log('\n━━━ Auth flow ━━━');

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  // Click signup
  const signupBtn = await page.$('#signup-btn');
  if (!signupBtn) { record('Auth', 'fail', 'No signup button on home'); await page.close(); return; }
  await signupBtn.click();
  await new Promise(r => setTimeout(r, 500));
  const signupOpen = await page.evaluate(() => document.getElementById('auth-modal')?.classList.contains('open'));
  if (!signupOpen) { record('Auth', 'fail', 'Signup button did not open auth modal'); await page.close(); return; }
  record('Auth', 'ok', 'Signup button opens auth modal');

  // Fill and submit signup (won't work fully due to dev DB bug, but should hit endpoint)
  const timestamp = Date.now();
  const email = `audit${timestamp}@test.com`;
  await page.evaluate((email) => {
    const nameInput = document.getElementById('signup-name') || document.querySelector('#auth-modal input[type="text"]');
    const emailInput = document.getElementById('signup-email') || document.querySelector('#auth-modal input[type="email"]');
    const pwInput = document.getElementById('signup-password') || document.querySelector('#auth-modal input[type="password"]');
    if (nameInput) nameInput.value = 'Audit User';
    if (emailInput) emailInput.value = email;
    if (pwInput) pwInput.value = 'testpassword123';
  }, email);

  // Check form fields exist
  const hasFields = await page.evaluate(() => ({
    hasName: !!(document.getElementById('signup-name') || document.querySelector('#auth-modal input[type="text"]')),
    hasEmail: !!(document.getElementById('signup-email') || document.querySelector('#auth-modal input[type="email"]')),
    hasPw: !!(document.getElementById('signup-password') || document.querySelector('#auth-modal input[type="password"]')),
  }));
  if (!hasFields.hasEmail || !hasFields.hasPw) record('Auth', 'fail', `Auth modal missing fields: ${JSON.stringify(hasFields)}`);
  else record('Auth', 'ok', 'Auth modal has required fields');

  if (page._jsErrors.length) page._jsErrors.forEach(e => record('Auth', 'fail', `JS: ${e}`));

  await page.close();
}

async function testContactFormAbout(browser) {
  const page = await makePage(browser);
  console.log('\n━━━ /about contact form ━━━');

  await page.goto(BASE + '/about', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  const forms = await page.$$('form');
  record('/about', 'ok', `${forms.length} forms`);

  // Find contact form fields
  const formInfo = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return null;
    return {
      action: form.action || form.getAttribute('action'),
      onsubmit: !!form.getAttribute('onsubmit'),
      method: form.method,
      inputs: [...form.querySelectorAll('input, textarea, select')].map(i => ({ name: i.name, type: i.type, required: i.required })),
      submitBtn: !!form.querySelector('button[type="submit"], input[type="submit"]')
    };
  });
  if (!formInfo) { record('/about', 'warn', 'No form on /about'); await page.close(); return; }
  if (!formInfo.onsubmit && !formInfo.action) record('/about', 'fail', 'Contact form has no submit handler (no onsubmit or action)');
  else record('/about', 'ok', 'Contact form has submit handler');
  if (!formInfo.submitBtn) record('/about', 'fail', 'Contact form missing submit button');

  await page.close();
}

async function testDivorceRealtorHeadshot(browser) {
  const page = await makePage(browser);
  console.log('\n━━━ /divorce-realtor-austin headshot ━━━');
  await page.goto(BASE + '/divorce-realtor-austin', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));
  if (page._failedReqs.filter(r => r.includes('headshot')).length > 0) {
    record('/divorce-realtor-austin', 'fail', 'Headshot still 404');
  } else record('/divorce-realtor-austin', 'ok', 'Headshot fix verified');
  await page.close();
}

async function testNeighborhoodCards(browser) {
  const page = await makePage(browser);
  console.log('\n━━━ /neighborhoods grid ━━━');
  await page.goto(BASE + '/neighborhoods', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  const cardLinks = await page.$$eval('a[href*="/neighborhoods/"]', els => els.map(a => a.getAttribute('href')));
  const unique = [...new Set(cardLinks)];
  record('/neighborhoods', 'ok', `${unique.length} neighborhood card links`);

  // Click first, verify navigates
  if (unique.length > 0) {
    await page.goto(BASE + unique[0], { waitUntil: 'networkidle2' });
    const status = page.url().includes(unique[0]);
    if (status) record('/neighborhoods', 'ok', `First card → ${unique[0]} loads`);
    else record('/neighborhoods', 'fail', `First card navigation failed`);
  }
  await page.close();
}

async function testSitemapPages(browser) {
  console.log('\n━━━ Sitemap — all pages 200? ━━━');
  const sitemapXml = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8');
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  record('sitemap', 'info', `${urls.length} URLs in sitemap`);

  let failed = 0;
  for (const url of urls) {
    const localUrl = url.replace('https://austintxhomes.co', BASE);
    try {
      const res = await fetch(localUrl, { redirect: 'manual' });
      if (res.status === 200) continue;
      if (res.status >= 300 && res.status < 400) {
        record('sitemap', 'warn', `${res.status} redirect: ${url}`);
      } else {
        record('sitemap', 'fail', `${res.status}: ${url}`);
        failed++;
      }
    } catch (e) {
      record('sitemap', 'fail', `Fetch error: ${url} — ${e.message}`);
      failed++;
    }
  }
  if (failed === 0) record('sitemap', 'ok', 'All sitemap pages return 200');
}

// ========== MAIN ==========
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  await testHomePage(browser);
  await testSearchFullFlow(browser);
  await testAuthFlow(browser);
  await testContactFormAbout(browser);
  await testDivorceRealtorHeadshot(browser);
  await testNeighborhoodCards(browser);
  await testSitemapPages(browser);
  await browser.close();

  const fails = results.filter(r => r.severity === 'fail').length;
  const warns = results.filter(r => r.severity === 'warn').length;
  const oks = results.filter(r => r.severity === 'ok').length;

  const lines = ['# Interaction Audit v2', `Generated ${new Date().toISOString()}\n`];
  lines.push(`## Summary`);
  lines.push(`- 🔴 ${fails} failures`);
  lines.push(`- 🟡 ${warns} warnings`);
  lines.push(`- ✓ ${oks} passes\n`);
  if (fails > 0) {
    lines.push(`## 🔴 Failures\n`);
    results.filter(r => r.severity === 'fail').forEach(r => lines.push(`- **${r.section}** — ${r.msg}`));
  }
  if (warns > 0) {
    lines.push(`\n## 🟡 Warnings\n`);
    results.filter(r => r.severity === 'warn').forEach(r => lines.push(`- **${r.section}** — ${r.msg}`));
  }
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\n━━━━━━━━━━━━━━━━━━\n${fails} failures, ${warns} warnings — report: ${REPORT}`);
})().catch(e => { console.error(e); process.exit(1); });
