const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const SITE_BASE = 'http://localhost:3002';
const API_BASE = 'http://localhost:3000';

const PAGES = [
  '/',
  '/buy',
  '/sell',
  '/about',
  '/neighborhoods',
  '/neighborhoods/tarrytown',
  '/neighborhoods/bouldin-creek',
  '/neighborhoods/hyde-park',
  '/neighborhoods/east-austin',
];

const API_ENDPOINTS = [
  '/api/properties/search?limit=3&status=Active',
  '/api/properties/search?neighborhood=Bouldin+Creek&limit=3&status=Active',
  '/api/properties/search?neighborhood=Tarrytown&limit=3&status=Active',
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data, error: null }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
  });
}

async function checkLink(href, base) {
  try {
    const url = new URL(href, base);
    if (!url.protocol.startsWith('http')) return { href, status: 'skip', note: 'non-http' };
    const result = await fetchUrl(url.href);
    return { href, url: url.href, status: result.status, error: result.error };
  } catch (e) {
    return { href, status: 'error', note: e.message };
  }
}

async function auditPage(browser, path) {
  const url = SITE_BASE + path;
  const result = {
    path,
    url,
    httpStatus: null,
    title: null,
    consoleErrors: [],
    consoleWarnings: [],
    networkErrors: [],
    links: [],
    brokenLinks: [],
    hasListingCards: false,
    listingCount: 0,
    listingPrices: [],
    listingAddresses: [],
    neighborhoodCardLinks: [],
    screenshot: `/tmp/audit_${path.replace(/\//g, '_').replace(/^_/, '') || 'home'}.png`,
    error: null,
  };

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') result.consoleErrors.push(text);
    else if (msg.type() === 'warning') result.consoleWarnings.push(text);
  });

  page.on('pageerror', (err) => {
    result.consoleErrors.push('PAGE ERROR: ' + err.message);
  });

  page.on('requestfailed', (request) => {
    result.networkErrors.push(`${request.failure().errorText} — ${request.url()}`);
  });

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    result.httpStatus = response ? response.status() : null;

    // Wait a bit for any dynamic content
    await new Promise(r => setTimeout(r, 2000));

    result.title = await page.title();

    // Collect all links
    const links = await page.$$eval('a[href]', anchors =>
      anchors.map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 80) }))
    );
    result.links = links;

    // Check all links
    const linkCheckResults = await Promise.all(
      links.map(l => checkLink(l.href, url))
    );
    result.brokenLinks = linkCheckResults.filter(l => l.status === 404 || l.status === 0 || l.error);

    // Check for listing cards - try multiple selectors
    const listingSelectors = [
      '.listing-card',
      '.property-card',
      '[class*="listing"]',
      '[class*="property"]',
      '.card',
      '[data-listing]',
      '[data-property]',
    ];

    for (const sel of listingSelectors) {
      const count = await page.$$eval(sel, els => els.length).catch(() => 0);
      if (count > 0) {
        result.hasListingCards = true;
        result.listingCount = Math.max(result.listingCount, count);
      }
    }

    // Try to find prices (common patterns)
    const prices = await page.$$eval('*', els => {
      const pricePattern = /\$[\d,]+/g;
      const found = [];
      for (const el of els) {
        if (el.children.length === 0 && el.textContent) {
          const matches = el.textContent.match(pricePattern);
          if (matches) found.push(...matches);
        }
      }
      return [...new Set(found)].slice(0, 10);
    }).catch(() => []);
    result.listingPrices = prices;

    // Try to find addresses
    const addresses = await page.$$eval('*', els => {
      const addrPattern = /\d+\s+[A-Z][a-z]+\s+(St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pl|Cir|Loop|Trail|Pkwy|Hwy)\b/gi;
      const found = [];
      for (const el of els) {
        if (el.children.length === 0 && el.textContent) {
          const matches = el.textContent.match(addrPattern);
          if (matches) found.push(...matches);
        }
      }
      return [...new Set(found)].slice(0, 10);
    }).catch(() => []);
    result.listingAddresses = addresses;

    // For neighborhoods page: collect neighborhood card links
    if (path === '/neighborhoods') {
      const cardLinks = await page.$$eval('a', anchors =>
        anchors
          .filter(a => {
            const href = a.getAttribute('href') || '';
            const text = a.textContent.trim().toLowerCase();
            return href.includes('neighborhood') || text.includes('neighborhood') ||
              href.includes('bouldin') || text.includes('bouldin') ||
              href.includes('tarrytown') || text.includes('tarrytown') ||
              href.includes('hyde') || text.includes('hyde') ||
              href.includes('east') || text.includes('east');
          })
          .map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 80) }))
      ).catch(() => []);
      result.neighborhoodCardLinks = cardLinks;

      // Also get ALL links from the neighborhoods page for card analysis
      const allLinks = await page.$$eval('a[href]', anchors =>
        anchors.map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 80) }))
      ).catch(() => []);
      result.allLinksForNeighborhoods = allLinks;
    }

    // Screenshot
    await page.screenshot({ path: result.screenshot, fullPage: true });

  } catch (e) {
    result.error = e.message;
    try {
      await page.screenshot({ path: result.screenshot, fullPage: true });
    } catch (_) {}
  } finally {
    await page.close();
  }

  return result;
}

async function auditAPI() {
  const results = [];
  for (const endpoint of API_ENDPOINTS) {
    const url = API_BASE + endpoint;
    const r = await fetchUrl(url);
    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(r.body);
    } catch (e) {
      parseError = e.message;
    }

    results.push({
      endpoint,
      url,
      status: r.status,
      error: r.error,
      parseError,
      total: parsed && parsed.total,
      listingCount: parsed && parsed.listings ? parsed.listings.length : 0,
      listings: parsed && parsed.listings ? parsed.listings.slice(0, 3).map(l => ({
        key: l.listing_key,
        price: l.list_price,
        address: [l.street_number, l.street_name, l.city].filter(Boolean).join(' '),
        status: l.standard_status,
        neighborhood: l.city || l.subdivision_name,
      })) : [],
    });
  }
  return results;
}

async function main() {
  console.log('='.repeat(70));
  console.log('AUSTINTXHOMES COMPREHENSIVE AUDIT');
  console.log('='.repeat(70));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Audit all pages
  const pageResults = [];
  for (const pagePath of PAGES) {
    console.log(`Auditing page: ${pagePath} ...`);
    const result = await auditPage(browser, pagePath);
    pageResults.push(result);
  }

  await browser.close();

  // Audit API
  console.log('\nAuditing API endpoints...');
  const apiResults = await auditAPI();

  // ===== REPORT =====
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT REPORT');
  console.log('='.repeat(70));

  // Page-by-page summary
  for (const r of pageResults) {
    console.log('\n' + '-'.repeat(60));
    console.log(`PAGE: ${r.url}`);
    console.log('-'.repeat(60));
    console.log(`  HTTP Status:    ${r.httpStatus}`);
    console.log(`  Title:          ${r.title}`);
    console.log(`  Screenshot:     ${r.screenshot}`);
    console.log(`  Error:          ${r.error || 'none'}`);
    console.log(`  Links found:    ${r.links.length}`);
    console.log(`  Has listings:   ${r.hasListingCards} (${r.listingCount} elements matched)`);
    console.log(`  Prices found:   ${r.listingPrices.slice(0, 5).join(', ') || 'none'}`);
    console.log(`  Addresses found:${r.listingAddresses.slice(0, 3).join(' | ') || 'none'}`);

    if (r.consoleErrors.length > 0) {
      console.log(`  CONSOLE ERRORS (${r.consoleErrors.length}):`);
      r.consoleErrors.forEach(e => console.log(`    [ERR] ${e}`));
    } else {
      console.log(`  Console errors: none`);
    }

    if (r.consoleWarnings.length > 0) {
      console.log(`  Console warnings (${r.consoleWarnings.length}):`);
      r.consoleWarnings.slice(0, 5).forEach(w => console.log(`    [WARN] ${w}`));
    }

    if (r.networkErrors.length > 0) {
      console.log(`  NETWORK ERRORS (${r.networkErrors.length}):`);
      r.networkErrors.forEach(e => console.log(`    [NET] ${e}`));
    }

    if (r.brokenLinks.length > 0) {
      console.log(`  BROKEN LINKS (${r.brokenLinks.length}):`);
      r.brokenLinks.forEach(l => console.log(`    [${l.status}] ${l.url || l.href} — ${l.error || ''}`));
    } else {
      console.log(`  Broken links:   none`);
    }

    // All links
    if (r.links.length > 0) {
      console.log(`  ALL LINKS:`);
      r.links.forEach(l => console.log(`    "${l.text}" => ${l.href}`));
    }

    // Neighborhood cards
    if (r.path === '/neighborhoods') {
      console.log('\n  NEIGHBORHOOD CARD LINKS:');
      if (r.neighborhoodCardLinks.length > 0) {
        r.neighborhoodCardLinks.forEach(l => console.log(`    "${l.text}" => ${l.href}`));
      } else {
        console.log('    (none matched neighborhood pattern)');
      }
      if (r.allLinksForNeighborhoods) {
        console.log('\n  ALL LINKS ON /neighborhoods:');
        r.allLinksForNeighborhoods.forEach(l => console.log(`    "${l.text}" => ${l.href}`));
      }
    }
  }

  // API Results
  console.log('\n' + '='.repeat(70));
  console.log('API AUDIT RESULTS');
  console.log('='.repeat(70));
  for (const r of apiResults) {
    console.log('\n' + '-'.repeat(60));
    console.log(`ENDPOINT: ${r.url}`);
    console.log(`  HTTP Status:  ${r.status}`);
    console.log(`  Error:        ${r.error || 'none'}`);
    console.log(`  Parse Error:  ${r.parseError || 'none'}`);
    console.log(`  Total in DB:  ${r.total}`);
    console.log(`  Listings returned: ${r.listingCount}`);
    if (r.listings.length > 0) {
      console.log(`  Sample listings:`);
      r.listings.forEach(l => console.log(`    [${l.key}] $${l.price} — ${l.address} (${l.status})`));
    }
  }

  // ===== SUMMARY OF ISSUES =====
  console.log('\n' + '='.repeat(70));
  console.log('ISSUES SUMMARY');
  console.log('='.repeat(70));

  const issuePages = pageResults.filter(r =>
    r.error || r.httpStatus !== 200 || r.consoleErrors.length > 0 ||
    r.brokenLinks.length > 0 || r.networkErrors.length > 0
  );

  const noListingPages = pageResults.filter(r =>
    !r.hasListingCards && r.listingPrices.length === 0 && r.listingAddresses.length === 0 &&
    ['/buy', '/neighborhoods/tarrytown', '/neighborhoods/bouldin-creek', '/neighborhoods/hyde-park', '/neighborhoods/east-austin'].includes(r.path)
  );

  if (issuePages.length === 0) {
    console.log('\nNo pages with errors found.');
  } else {
    console.log('\nPAGES WITH ISSUES:');
    for (const r of issuePages) {
      console.log(`  ${r.url}`);
      if (r.httpStatus !== 200) console.log(`    -> HTTP ${r.httpStatus}`);
      if (r.error) console.log(`    -> Error: ${r.error}`);
      r.consoleErrors.forEach(e => console.log(`    -> Console error: ${e}`));
      r.networkErrors.forEach(e => console.log(`    -> Network error: ${e}`));
      r.brokenLinks.forEach(l => console.log(`    -> Broken link [${l.status}]: ${l.url || l.href}`));
    }
  }

  if (noListingPages.length > 0) {
    console.log('\nPAGES MISSING LISTINGS (expected listings but found none):');
    noListingPages.forEach(r => console.log(`  ${r.url}`));
  }

  // Bouldin Creek specific
  const neighborhoodsPage = pageResults.find(r => r.path === '/neighborhoods');
  if (neighborhoodsPage && neighborhoodsPage.allLinksForNeighborhoods) {
    const bouldinLink = neighborhoodsPage.allLinksForNeighborhoods.find(l =>
      (l.href || '').toLowerCase().includes('bouldin') ||
      (l.text || '').toLowerCase().includes('bouldin')
    );
    console.log('\nBOULDIN CREEK LINK ON /neighborhoods:');
    console.log(bouldinLink ? `  Found: "${bouldinLink.text}" => ${bouldinLink.href}` : '  NOT FOUND');
  }

  console.log('\n' + '='.repeat(70));
  console.log('AUDIT COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
