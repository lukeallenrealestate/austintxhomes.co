/**
 * Sienna at the Thompson — floor plan & pricing scraper (v2)
 * Run: node scripts/update-sienna-floorplans.js
 * Scheduled weekly via cron in server.js.
 *
 * Strategy: rentsienna.com uses a floor-by-floor map filter that only
 * exposes the currently-selected floor's units to the initial DOM. Instead
 * of interacting with the map, we scrape the overview page for every
 * floor-plan URL, then visit each in parallel to extract that plan's
 * name, size, price, and availability.
 *
 * Writes results to data/sienna-floorplans.json.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/sienna-floorplans.json');
const OVERVIEW_URL = 'https://rentsienna.com/floorplans/';
const CONCURRENCY = 4;
const PAGE_TIMEOUT = 25000;

async function collectFloorplanUrls(page) {
  await page.goto(OVERVIEW_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  try { await page.click('[data-js-hook="popdown-close"]'); await new Promise(r => setTimeout(r, 800)); } catch (_) {}
  return page.evaluate(() => {
    const all = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (/\/floorplans\/(unit-|studio|1-bedroom|2-bedroom|3-bedroom|jr-)/i.test(href)) {
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
    await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
    await new Promise(r => setTimeout(r, 1500));
    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
      const title = document.querySelector('h1, h2')?.textContent?.trim() || document.title.trim();

      // Bed count
      let planType = 'Studio';
      const t = title.toLowerCase();
      if (/\b2\s*bed/.test(t)) planType = '2 Bedroom';
      else if (/\b3\s*bed/.test(t)) planType = '3 Bedroom';
      else if (/jr\.?\s*1\s*bed|junior/.test(t)) planType = 'Jr. 1 Bedroom';
      else if (/\b1\s*bed/.test(t)) planType = '1 Bedroom';
      else if (/studio/.test(t)) planType = 'Studio';

      let beds = 0;
      const bedM = t.match(/(\d)\s*bed/);
      if (bedM) beds = parseInt(bedM[1]);
      if (/jr\.?\s*1|junior/.test(t)) beds = 1;

      // Location tag
      let location = 'Sienna';
      if (/lofts/i.test(title)) location = 'Lofts above The Thompson';
      else if (/residen/i.test(title)) location = 'Residences at The Thompson';

      // Sqft (page usually shows "492 sq. ft." or "492 sqft" or from image alt)
      let sqft = null;
      const sqftM = bodyText.match(/(\d{3,5})\s*sq\.?\s*ft/i);
      if (sqftM) sqft = parseInt(sqftM[1]);
      if (!sqft) {
        const img = document.querySelector('img[alt*="square feet" i]');
        if (img) { const m = img.alt.match(/(\d+)\s*square feet/i); if (m) sqft = parseInt(m[1]); }
      }

      // Bath count
      let baths = 1;
      const bathM = bodyText.match(/(\d)\s*bath/i);
      if (bathM) baths = parseInt(bathM[1]);

      // Price — "Starting at $2,404" or "$2,404/mo"
      let price = null;
      const priceM = bodyText.replace(/,/g, '').match(/Starting at \$(\d{3,5})|\$(\d{3,5})\s*(?:\/mo|mo|per month)/i);
      if (priceM) price = parseInt(priceM[1] || priceM[2]);

      // Availability — Sienna uses several phrasings:
      //   "Available Now"           → 1 unit ready for immediate move-in
      //   "Only N left!"            → N units available (still countable inventory)
      //   "Available [Month Day]"   → future date
      //   "Waitlist" / "No units"   → nothing bookable right now
      // Any of the first three = available. We also count "Starting at $X" as a
      // strong signal — the property only surfaces starting prices for plans
      // with real inventory.
      const availNow = /Available Now/i.test(bodyText);
      const onlyLeftM = bodyText.match(/Only\s+(\d+)\s+left/i);
      const availDateM = bodyText.match(/Available\s+(\w+\s+\d+(?:,?\s*\d{4})?)/i);
      const isWaitlist = /waitlist|no units available|not currently available/i.test(bodyText);
      const hasStartingPrice = /Starting at \$[\d,]{3,}/i.test(bodyText);
      const unitsLeft = onlyLeftM ? parseInt(onlyLeftM[1]) : null;

      let available = 'Contact for Availability';
      if (availNow) available = 'Available Now';
      else if (unitsLeft) available = `Only ${unitsLeft} left`;
      else if (availDateM) available = availDateM[1].trim();
      else if (isWaitlist) available = 'Waitlist';
      else if (hasStartingPrice) available = 'Available';

      // A plan counts as "has availability" if it's available now, has a
      // remaining count, has a future date, OR shows a starting price without
      // being on a waitlist. Everything else is inventory-out.
      const hasAvailability = availNow || !!unitsLeft || !!availDateM || (hasStartingPrice && !isWaitlist);

      // Unit number if present (from URL or title). window.location.href because
      // 'location' is already a local variable earlier in this evaluate() scope.
      const hrefUrl = window.location.href;
      const unitM = hrefUrl.match(/unit-([a-f0-9]{8,})/i) || title.match(/-\s*(\d{4})\b/) || title.match(/#(\d{4})/);
      const unit = unitM ? unitM[1].slice(0, 8) : '';

      return {
        title,
        planType,
        location,
        beds,
        baths,
        sqft,
        price,
        available,
        availableNow: availNow,
        unitsLeft,
        unit,
        hasAvailability,
      };
    });
    data.url = url;
    return data;
  } catch (e) {
    console.warn(`[sienna-scraper]   ✗ ${url}: ${e.message}`);
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
  console.log('[sienna-scraper] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const overviewPage = await browser.newPage();
    await overviewPage.setUserAgent('Mozilla/5.0');
    await overviewPage.setViewport({ width: 1280, height: 900 });
    console.log('[sienna-scraper] Collecting floor plan URLs...');
    const urls = await collectFloorplanUrls(overviewPage);
    await overviewPage.close();
    console.log(`[sienna-scraper] Found ${urls.length} floor plan / unit URLs`);
    if (!urls.length) {
      console.warn('[sienna-scraper] WARNING: no URLs collected — page structure may have changed');
      return;
    }

    console.log(`[sienna-scraper] Visiting each with concurrency ${CONCURRENCY}...`);
    const raw = await parallelMap(urls, (u) => scrapeUnitPage(browser, u), CONCURRENCY);
    const plans = raw.filter(Boolean);
    console.log(`[sienna-scraper] Scraped ${plans.length}/${urls.length} pages successfully`);

    // Sort: available now first, then upcoming, then waitlist; then by price
    plans.sort((a, b) => {
      const aAvail = a.availableNow ? 0 : a.hasAvailability ? 1 : 2;
      const bAvail = b.availableNow ? 0 : b.hasAvailability ? 1 : 2;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return (a.price || 9999999) - (b.price || 9999999);
    });

    // Summary by plan type — only count plans with actual availability
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

    // Add priceDisplay + name for backwards-compat with the frontend renderer
    for (const p of plans) {
      p.priceDisplay = p.price ? `$${p.price.toLocaleString()}/mo` : 'Contact for Pricing';
      p.name = p.unit ? `#${p.unit}` : p.planType;
    }

    const totalAvailable = plans.filter(p => p.hasAvailability).length;

    const output = {
      lastUpdated: new Date().toISOString(),
      property: {
        name: 'Sienna at the Thompson',
        address: '501 Brazos St, Austin TX 78701',
        phone: '(512) 379-5527',
        website: 'https://rentsienna.com',
      },
      totalFloorPlans: plans.length,
      totalAvailable,
      summary,
      plans,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`[sienna-scraper] ✓ Wrote ${plans.length} plans (${totalAvailable} available) to ${OUTPUT_FILE}`);
    console.log('[sienna-scraper] Summary by type:', JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

scrape().catch(err => {
  console.error('[sienna-scraper] Fatal error:', err.message);
  process.exit(1);
});
