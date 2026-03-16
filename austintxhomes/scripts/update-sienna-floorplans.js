/**
 * Sienna at the Thompson — floor plan & pricing scraper
 * Run: node scripts/update-sienna-floorplans.js
 * Schedule monthly (cron or manual) to keep pricing current.
 *
 * Scrapes rentsienna.com/floorplans/ (Jonah Digital / RealPage CMS)
 * Writes results to data/sienna-floorplans.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/sienna-floorplans.json');
const FLOORPLANS_URL = 'https://rentsienna.com/floorplans/';

async function scrape() {
  console.log('[sienna-scraper] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 900 });

  try {
    console.log('[sienna-scraper] Navigating to', FLOORPLANS_URL);
    await page.goto(FLOORPLANS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // Dismiss the pop-down alert if present
    try {
      await page.click('[data-js-hook="popdown-close"]');
      await new Promise(r => setTimeout(r, 1000));
      console.log('[sienna-scraper] Dismissed popup');
    } catch (e) {
      // No popup, continue
    }

    // Scroll down to trigger lazy loading of unit cards
    await page.evaluate(() => window.scrollBy(0, 1200));
    await new Promise(r => setTimeout(r, 2000));

    // Wait for unit cards
    try {
      await page.waitForSelector('.jd-fp-unit-card', { timeout: 15000 });
      console.log('[sienna-scraper] Unit cards loaded');
    } catch (e) {
      console.warn('[sienna-scraper] Unit cards selector timed out, proceeding anyway');
    }

    const plans = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.jd-fp-unit-card');

      cards.forEach(card => {
        try {
          const titleEl = card.querySelector('.jd-fp-unit-card__floorplan-title');
          const imgEl = card.querySelector('img');
          const fullText = card.textContent.replace(/\s+/g, ' ').trim();

          // Title: "Studio - 1507, Lofts above The Thompson"
          //     or "Jr. 1 Bedroom - 1504 - Lofts above The Thompson"
          //     or "1 Bedroom - 2506 - Residences at The Thompson"
          const title = titleEl?.textContent?.trim() || '';

          // Parse unit number from title (e.g. "1507")
          const unitMatch = title.match(/-\s*(\d{4})/);
          const unitNum = unitMatch ? unitMatch[1] : '';

          // Parse floor plan type from title
          let planType = 'Studio';
          const titleLower = title.toLowerCase();
          if (/\b2\s*bed|\btwo\s*bed/i.test(titleLower)) planType = '2 Bedroom';
          else if (/jr\.?\s*1\s*bed|junior\s*1/i.test(titleLower)) planType = 'Jr. 1 Bedroom';
          else if (/\b1\s*bed|\bone\s*bed/i.test(titleLower)) planType = '1 Bedroom';
          else if (/studio/i.test(titleLower)) planType = 'Studio';

          // Parse location (Lofts vs Residences)
          let location = 'Sienna';
          if (/lofts/i.test(title)) location = 'Lofts above The Thompson';
          else if (/residen/i.test(title)) location = 'Residences at The Thompson';

          // Parse beds from imgAlt: "1 bedroom floor plan layout" or "Studio floor plan layout"
          const imgAlt = imgEl?.alt || '';
          let beds = 0; // Studio default
          const bedAltMatch = imgAlt.match(/(\d+)\s*bedroom/i);
          if (bedAltMatch) beds = parseInt(bedAltMatch[1]);

          // Parse baths from imgAlt
          const bathAltMatch = imgAlt.match(/(\d+)\s*bathroom/i);
          const baths = bathAltMatch ? parseInt(bathAltMatch[1]) : 1;

          // Parse sqft from imgAlt
          const sqftAltMatch = imgAlt.match(/(\d+)\s*square feet/i);
          const sqft = sqftAltMatch ? parseInt(sqftAltMatch[1]) : null;

          // Parse availability from card text
          const availNow = /Available Now/i.test(fullText);
          const availDateMatch = fullText.match(/Available\s+([\w]+\s+\d+,?\s*\d*)/i);
          const availText = availNow ? 'Available Now' : (availDateMatch ? availDateMatch[1].trim() : 'Contact for Availability');

          // Parse price from card text: "Starting at $2,404" or "$2,404"
          const priceMatch = fullText.replace(/,/g, '').match(/Starting at \$(\d+)|\$(\d{3,5})\s*(?:\/mo|mo)?/i);
          const price = priceMatch ? parseInt(priceMatch[1] || priceMatch[2]) : null;
          const priceDisplay = price ? `$${price.toLocaleString()}/mo` : 'Contact for Pricing';

          if (unitNum || planType) {
            results.push({
              unit: unitNum,
              name: unitNum ? `#${unitNum}` : planType,
              planType,
              location,
              beds,
              baths,
              sqft,
              price,
              priceDisplay,
              available: availText,
              availableNow: availNow,
            });
          }
        } catch (e) {
          // Skip malformed card
        }
      });

      return results;
    });

    console.log(`[sienna-scraper] Extracted ${plans.length} units`);

    if (plans.length === 0) {
      console.warn('[sienna-scraper] WARNING: No units found — RealPage page structure may have changed');
    }

    // Sort: available now first, then by price
    plans.sort((a, b) => {
      if (a.availableNow && !b.availableNow) return -1;
      if (!a.availableNow && b.availableNow) return 1;
      return (a.price || 9999999) - (b.price || 9999999);
    });

    // Build summary by type
    const summary = {};
    for (const p of plans) {
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
        name: 'Sienna at the Thompson',
        address: '501 Brazos St, Austin TX 78701',
        phone: '(512) 900-8000',
        website: 'https://rentsienna.com',
      },
      summary,
      plans,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`[sienna-scraper] ✓ Wrote ${plans.length} units to ${OUTPUT_FILE}`);
    console.log('[sienna-scraper] Summary by type:', JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

scrape().catch(err => {
  console.error('[sienna-scraper] Fatal error:', err.message);
  process.exit(1);
});
