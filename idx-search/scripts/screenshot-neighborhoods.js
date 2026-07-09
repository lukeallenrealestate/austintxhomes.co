/**
 * Screenshots Google Maps for each neighborhood to help extract polygon coordinates.
 * Run: node scripts/screenshot-neighborhoods.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const NEIGHBORHOODS = [
  { name: 'South Congress', query: 'South Congress Austin TX' },
  { name: 'Cherrywood', query: 'Cherrywood Austin TX' },
  { name: 'Rainey Street', query: 'Rainey Street District Austin TX' },
  { name: 'The Domain', query: 'The Domain Austin TX neighborhood' },
  { name: 'West Austin', query: 'West Austin neighborhood Austin TX' },
  { name: 'Pecan Springs', query: 'Pecan Springs Austin TX neighborhood' },
];

const OUT_DIR = '/tmp/neighborhood-screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(browser, neighborhood) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const url = `https://www.google.com/maps/search/${encodeURIComponent(neighborhood.query)}`;
  console.log(`\n[${neighborhood.name}] Navigating to ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait a bit for the map and any drawn polygon to fully render
  await new Promise(r => setTimeout(r, 4000));

  const finalUrl = page.url();
  console.log(`  Final URL: ${finalUrl}`);

  // Extract @lat,lng,zoom from URL
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+\.?\d*)z/);
  if (coordMatch) {
    console.log(`  Center: lat=${coordMatch[1]}, lng=${coordMatch[2]}, zoom=${coordMatch[3]}`);
  }

  const filename = neighborhood.name.toLowerCase().replace(/\s+/g, '-') + '.png';
  const outPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  Saved: ${outPath}`);

  await page.close();
  return { name: neighborhood.name, url: finalUrl, coordMatch };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  for (const n of NEIGHBORHOODS) {
    try {
      const r = await screenshot(browser, n);
      results.push(r);
    } catch (e) {
      console.error(`  ERROR for ${n.name}:`, e.message);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();

  console.log('\n\n=== Summary ===');
  for (const r of results) {
    if (r.coordMatch) {
      console.log(`${r.name}: center=(${r.coordMatch[1]}, ${r.coordMatch[2]}), zoom=${r.coordMatch[3]}`);
    }
  }
  console.log(`\nScreenshots saved to: ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
