/**
 * Solomon Austin (1414 E 51st St, East Austin) — floor plan & pricing scraper
 * Run: node scripts/update-solomon-floorplans.js
 * Scheduled weekly via cron in server.js.
 *
 * Solomon uses the same Jonah Digital / RealPage CMS as rentsienna.com,
 * with the same floor-by-floor map filter that hides most units on load.
 * We scrape the overview page for every floor plan URL, then visit each
 * individually to extract the plan's name, sqft, price, and availability.
 *
 * Writes results to data/solomon-floorplans.json.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/solomon-floorplans.json');
const OVERVIEW_URL = 'https://solomonatx.com/floorplans/';
const CONCURRENCY = 4;
const PAGE_TIMEOUT = 25000;

async function collectFloorplanUrls(page) {
  await page.goto(OVERVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 6000));
  try { await page.click('[data-js-hook="popdown-close"]'); await new Promise(r => setTimeout(r, 500)); } catch (_) {}
  return page.evaluate(() => {
    const all = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      // Match unit-hash URLs OR named plan URLs like /floorplans/balance/, /floorplans/tranquil/
      if (/\/floorplans\/(unit-[a-f0-9]+|[a-z][a-z0-9-]{2,40})\/?$/i.test(href)
          && !/#|floorplans\/?$/i.test(href.replace(/\/floorplans\/[a-z0-9-]+\/?$/i, ''))) {
        all.add(href.replace(/\/$/, '') + '/');
      }
    });
    return [...all];
  });
}

async function scrapeUnitPage(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await new Promise(r => setTimeout(r, 2500));
    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
      const title = document.querySelector('h1, h2')?.textContent?.trim() || document.title.trim();

      let planType = 'Studio';
      const t = title.toLowerCase();
      const bodyLower = bodyText.toLowerCase();
      if (/2\s*bed/.test(bodyLower)) planType = '2 Bedroom';
      else if (/3\s*bed/.test(bodyLower)) planType = '3 Bedroom';
      else if (/1\s*bed/.test(bodyLower)) planType = '1 Bedroom';
      else if (/studio/.test(bodyLower)) planType = 'Studio';
      if (/live\s*work/i.test(bodyText)) planType = 'Live/Work';

      let beds = 0;
      const bedM = bodyLower.match(/(\d)\s*bed/);
      if (bedM) beds = parseInt(bedM[1]);

      let sqft = null;
      const sqftM = bodyText.match(/(\d{3,5})\s*sq\.?\s*ft/i);
      if (sqftM) sqft = parseInt(sqftM[1]);

      let baths = 1;
      const bathM = bodyText.match(/(\d)\s*bath/i);
      if (bathM) baths = parseInt(bathM[1]);

      // Solomon shows: "$3,010.75 /mo*" (total) AND "$2,879 Base Rent"
      const totalM = bodyText.replace(/,/g, '').match(/\$(\d{3,5}(?:\.\d{2})?)\s*\/?\s*mo/i);
      const baseM = bodyText.replace(/,/g, '').match(/\$(\d{3,5})\s+Base Rent/i);
      const startingM = bodyText.replace(/,/g, '').match(/Starting at \$(\d{3,5})/i);
      const price = totalM ? parseFloat(totalM[1]) : (startingM ? parseFloat(startingM[1]) : null);
      const baseRent = baseM ? parseInt(baseM[1]) : null;

      const availNow = /Available Now/i.test(bodyText);
      const availDateM = bodyText.match(/Available\s+(\w+\s+\d+(?:,?\s*\d{4})?)/i);
      const onlyLeftM = bodyText.match(/Only\s+(\d+)\s+left/i);
      const isWaitlist = /waitlist|no units available|not currently available/i.test(bodyText);
      const unitsLeft = onlyLeftM ? parseInt(onlyLeftM[1]) : null;

      let available = 'Contact for Availability';
      if (availNow) available = 'Available Now';
      else if (unitsLeft) available = `Only ${unitsLeft} left`;
      else if (availDateM) available = availDateM[1].trim();
      else if (isWaitlist) available = 'Waitlist';
      else if (price) available = 'Available';

      const hasAvailability = availNow || !!unitsLeft || !!availDateM || (!!price && !isWaitlist);

      // Extract plan name from title (e.g. "Balance", "Elevate", "Vitality - Affordable")
      let name = title.replace(/floorplan layout:?\s*/i, '').trim();
      // Fall back to first line of body text if title is generic
      if (!name || name.length > 60) {
        const firstLine = bodyText.split(/\n|·|,|\|/)[0].trim();
        if (firstLine.length < 50) name = firstLine;
      }

      return {
        name: name || planType,
        planType,
        beds,
        baths,
        sqft,
        price,
        baseRent,
        available,
        availableNow: availNow,
        unitsLeft,
        hasAvailability,
        priceDisplay: price ? `$${Math.round(price).toLocaleString()}/mo` : (baseRent ? `$${baseRent.toLocaleString()}/mo base` : 'Contact for Pricing'),
      };
    });
    data.url = url;
    return data;
  } catch (e) {
    console.warn(`[solomon-scraper]   ✗ ${url}: ${e.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function parallelMap(items, workerFn, concurrency) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await workerFn(items[my]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scrape() {
  console.log('[solomon-scraper] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const overviewPage = await browser.newPage();
    await overviewPage.setUserAgent('Mozilla/5.0');
    await overviewPage.setViewport({ width: 1440, height: 900 });
    console.log('[solomon-scraper] Collecting floor plan URLs...');
    const urls = await collectFloorplanUrls(overviewPage);
    await overviewPage.close();
    console.log(`[solomon-scraper] Found ${urls.length} floor plan / unit URLs`);
    if (!urls.length) {
      console.warn('[solomon-scraper] WARNING: no URLs — page structure may have changed');
      return;
    }

    const raw = await parallelMap(urls, (u) => scrapeUnitPage(browser, u), CONCURRENCY);
    const plans = raw.filter(Boolean);
    console.log(`[solomon-scraper] Scraped ${plans.length}/${urls.length} pages`);

    plans.sort((a, b) => {
      const aA = a.availableNow ? 0 : a.hasAvailability ? 1 : 2;
      const bA = b.availableNow ? 0 : b.hasAvailability ? 1 : 2;
      if (aA !== bA) return aA - bA;
      return (a.price || 9999999) - (b.price || 9999999);
    });

    const summary = {};
    for (const p of plans) {
      if (!p.hasAvailability) continue;
      const key = p.planType;
      if (!summary[key]) summary[key] = { count: 0, availableNow: 0, priceFrom: null, priceTo: null };
      summary[key].count++;
      if (p.availableNow) summary[key].availableNow++;
      if (p.price) {
        if (!summary[key].priceFrom || p.price < summary[key].priceFrom) summary[key].priceFrom = p.price;
        if (!summary[key].priceTo || p.price > summary[key].priceTo) summary[key].priceTo = p.price;
      }
    }

    const output = {
      lastUpdated: new Date().toISOString(),
      property: {
        name: 'Solomon Apartments',
        address: '1414 E 51st St, Austin TX 78723',
        phone: '(737) 358-5151',
        website: 'https://solomonatx.com',
      },
      totalFloorPlans: plans.length,
      totalAvailable: plans.filter(p => p.hasAvailability).length,
      summary,
      plans,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`[solomon-scraper] ✓ Wrote ${plans.length} plans (${output.totalAvailable} available) to ${OUTPUT_FILE}`);
    console.log('[solomon-scraper] Summary:', JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

scrape().catch(err => {
  console.error('[solomon-scraper] Fatal error:', err.message);
  process.exit(1);
});
