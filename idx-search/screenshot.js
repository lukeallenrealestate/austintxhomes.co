const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Home — list view (above the fold)
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '/tmp/ss_home.png' });
  console.log('✓ home');

  // 2. Home — scrolled to show cards
  await page.evaluate(() => window.scrollBy(0, 60));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/tmp/ss_cards.png' });
  console.log('✓ cards');

  // 3. Map view
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#map-view-btn');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: '/tmp/ss_map.png' });
  console.log('✓ map');

  // 4. Property detail — use SAMPLE listing (Unsplash photos, no CDN rate limit in dev)
  const key = 'SAMPLE001';
  await page.goto(`http://localhost:3000/property.html?id=${key}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '/tmp/ss_detail_top.png' });
  console.log('✓ detail top');

  await page.evaluate(() => window.scrollBy(0, 600));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '/tmp/ss_detail_mid.png' });
  console.log('✓ detail mid');

  // 5. Account page
  await page.goto('http://localhost:3000/account.html', { waitUntil: 'networkidle0', timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '/tmp/ss_account.png' });
  console.log('✓ account');

  await browser.close();
  console.log('\nAll screenshots saved to /tmp/ss_*.png');
})();
