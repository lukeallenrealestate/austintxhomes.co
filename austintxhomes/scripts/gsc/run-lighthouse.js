// Run Lighthouse locally on a list of URLs via headless Chrome.
const chromeLauncher = require('chrome-launcher');

async function runLH(urls) {
  const { default: lighthouse } = await import('lighthouse');
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
  const opts = {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'seo', 'accessibility'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 360, height: 640, deviceScaleFactor: 2, disabled: false },
    throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }
  };
  const results = [];
  for (const url of urls) {
    try {
      const r = await lighthouse(url, opts);
      const lh = r.lhr;
      const cat = lh.categories;
      const a = lh.audits;
      results.push({
        url: url.replace('https://austintxhomes.co',''),
        perf: Math.round(cat.performance.score * 100),
        seo: Math.round(cat.seo.score * 100),
        a11y: Math.round(cat.accessibility.score * 100),
        lcp: a['largest-contentful-paint'].displayValue,
        cls: a['cumulative-layout-shift'].displayValue,
        tbt: a['total-blocking-time'].displayValue,
        fcp: a['first-contentful-paint'].displayValue,
        topOpps: lh.categories.performance.auditRefs
          .filter(r => r.group === 'diagnostics' || r.group === 'load-opportunities')
          .map(ref => a[ref.id])
          .filter(x => x && x.score !== null && x.score < 0.9 && (x.details?.overallSavingsMs > 100 || x.numericValue > 100))
          .sort((a, b) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0))
          .slice(0, 3)
          .map(x => `${x.title} (${x.displayValue || ''})`)
      });
      console.log(`✓ ${url} — perf ${results.at(-1).perf}`);
    } catch (e) {
      console.log(`✗ ${url} — ${e.message}`);
    }
  }
  await chrome.kill();
  return results;
}

const urls = [
  'https://austintxhomes.co/',
  'https://austintxhomes.co/divorce-realtor-austin',
  'https://austintxhomes.co/austin-multifamily-market-report',
  'https://austintxhomes.co/search',
  'https://austintxhomes.co/apple-austin-relocation',
];

runLH(urls).then(results => {
  require('fs').writeFileSync('/tmp/lh-results.json', JSON.stringify(results, null, 2));
  console.log('\n| Page | Perf | SEO | A11y | LCP | CLS | TBT | FCP |');
  console.log('|------|------|-----|------|-----|-----|-----|-----|');
  results.forEach(r => console.log(`| ${r.url} | ${r.perf} | ${r.seo} | ${r.a11y} | ${r.lcp} | ${r.cls} | ${r.tbt} | ${r.fcp} |`));
  console.log('\nTop opportunities per page:');
  results.forEach(r => {
    console.log(`\n${r.url}`);
    r.topOpps.forEach(o => console.log(`  - ${o}`));
  });
});
