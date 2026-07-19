/**
 * Seven Apartments (615 W 7th, downtown Austin) — floor plan & pricing scraper
 * Run: node scripts/update-seven-floorplans.js
 * Scheduled weekly via cron in server.js.
 *
 * Seven uses Greystar's Total Monthly Leasing Price model. Each plan card
 * on sevenapts.com shows: name, beds/baths, Total Monthly Leasing Price,
 * Base Rent, deposit, sqft, and availability. We scrape the main
 * conventional units page and dump every plan card we find.
 *
 * Writes results to data/seven-floorplans.json.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/seven-floorplans.json');
const URL = 'https://www.sevenapts.com/austin/seven/conventional/';

async function scrape() {
  console.log('[seven-scraper] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setViewport({ width: 1440, height: 1400 });

    console.log('[seven-scraper] Navigating...');
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // Aggressive scroll to trigger lazy loads
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 900));
      await new Promise(r => setTimeout(r, 600));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    // Extract plans by parsing the visible text — Greystar site structure is
    // brittle across builds, so pattern-matching the human-readable output
    // is more resilient than tying to specific class names.
    const plans = await page.evaluate(() => {
      const fullText = document.body.innerText.replace(/\r/g, '');
      // Each plan block roughly matches:
      //   [Name]\n BEDS / BATHS \n [x] bd / [y] ba \n BASE RENT/Total Monthly Leasing Price \n Starting from $[price]|$[price] \n Base Rent: $[base]+/month|/month \n [12mo lease?] \n DEPOSIT \n $[deposit] \n SQ. FT \n [sqft] \n [Available ...|Get Notified] \n Details
      //
      // Regex uses a lazy [\s\S] block bounded by the next occurrence of
      // "Details" to isolate each plan chunk.
      const chunks = fullText.split(/\n\s*Details\s*\n/);
      const found = [];
      for (const chunk of chunks) {
        const c = chunk.replace(/\s+/g, ' ').trim();
        if (!/BEDS ?\/ ?BATHS/i.test(c)) continue;

        // Name — usually appears right before "BEDS / BATHS", 2 to 40 chars.
        // Named plans like "The Bremond - Loft" or "The Tower" or "1 Bedroom 08".
        const nameM = c.match(/([A-Z][A-Za-z0-9 .'&-]{2,50})\s+BEDS\s*\/\s*BATHS/);
        const name = nameM ? nameM[1].trim() : '';

        // Beds/baths
        const bbM = c.match(/(\d+)\s*bd\s*\/\s*(\d+(?:\.\d+)?)\s*ba/i);
        const beds = bbM ? parseInt(bbM[1]) : null;
        const baths = bbM ? parseFloat(bbM[2]) : null;

        // Total Monthly Leasing Price — "Starting from $2,413.78" or "$3,805"
        const totalM = c.match(/Starting from \$([\d,.]+)|Total Monthly Leasing Price\s*\$?([\d,.]+)/i);
        const total = totalM ? parseFloat((totalM[1] || totalM[2]).replace(/,/g, '')) : null;

        // Base rent — "Base Rent: $2,352+/month" or "Base Rent: $3,805/month"
        const baseM = c.match(/Base Rent:?\s*\$([\d,.]+)/i);
        const baseRent = baseM ? parseFloat(baseM[1].replace(/,/g, '')) : null;

        // Deposit — "DEPOSIT $500" (usually after DEPOSIT label)
        const depositM = c.match(/DEPOSIT\s*\$([\d,]+)/i);
        const deposit = depositM ? parseInt(depositM[1].replace(/,/g, '')) : null;

        // Square feet
        const sqftM = c.match(/SQ\.?\s*FT\s*(\d{3,5})/i) || c.match(/(\d{3,5})\s*sq\.?\s*ft/i);
        const sqft = sqftM ? parseInt(sqftM[1]) : null;

        // Availability
        const availM = c.match(/Available\s+(\w+\s+\d+,?\s*\d*)/i);
        const isNotified = /Get Notified/i.test(c);
        const availableNow = /Available Now/i.test(c);
        const available = availableNow ? 'Available Now' : (availM ? availM[1].trim() : (isNotified ? 'Notify Me' : 'Contact for Availability'));

        // Plan type from beds
        let planType = beds === 2 ? '2 Bedroom' : (beds === 1 ? '1 Bedroom' : (beds === 3 ? '3 Bedroom' : 'Unit'));
        if (/loft/i.test(name)) planType = beds === 1 ? '1BR Loft' : (beds === 2 ? '2BR Loft' : planType);

        if (name && beds != null) {
          found.push({
            name,
            planType,
            beds,
            baths,
            sqft,
            price: total,          // Total monthly leasing price
            baseRent,
            deposit,
            available,
            availableNow,
            hasAvailability: availableNow || !!availM || !isNotified,
            priceDisplay: total ? `$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo` : (baseRent ? `$${baseRent.toLocaleString()}/mo base` : 'Contact for Pricing'),
          });
        }
      }
      return found;
    });

    // Dedupe by name (Greystar often duplicates card blocks between tabs)
    const seen = new Set();
    const deduped = plans.filter(p => {
      const k = p.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log(`[seven-scraper] Extracted ${deduped.length} plans (${plans.length - deduped.length} duplicates removed)`);

    // Sort: available first, then by price
    deduped.sort((a, b) => {
      const aA = a.availableNow ? 0 : a.hasAvailability ? 1 : 2;
      const bA = b.availableNow ? 0 : b.hasAvailability ? 1 : 2;
      if (aA !== bA) return aA - bA;
      return (a.price || 9999999) - (b.price || 9999999);
    });

    const summary = {};
    for (const p of deduped) {
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
        name: 'Seven Apartments',
        address: '615 W 7th St, Austin TX 78701',
        phone: '(512) 793-8112',
        website: 'https://www.sevenapts.com',
      },
      totalFloorPlans: deduped.length,
      totalAvailable: deduped.filter(p => p.hasAvailability).length,
      summary,
      plans: deduped,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`[seven-scraper] ✓ Wrote ${deduped.length} plans (${output.totalAvailable} available) to ${OUTPUT_FILE}`);
    console.log('[seven-scraper] Summary:', JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

scrape().catch(err => {
  console.error('[seven-scraper] Fatal error:', err.message);
  process.exit(1);
});
