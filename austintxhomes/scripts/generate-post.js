#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

// --- CLI args ---
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf('--' + name);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes('--' + name);

const neighborhoodSlug = getArg('neighborhood');
const postType = getArg('type') || 'market-update';
const autoPublish = hasFlag('publish');

if (!neighborhoodSlug) {
  console.error('Usage: node scripts/generate-post.js --neighborhood <slug>');
  console.error('Example: node scripts/generate-post.js --neighborhood tarrytown');
  process.exit(1);
}

// --- Load neighborhood data ---
const neighborhoods = require('../data/neighborhoods');
const n = neighborhoods[neighborhoodSlug];
if (!n) {
  console.error(`Neighborhood "${neighborhoodSlug}" not found in data/neighborhoods.js`);
  console.error('Available: ' + Object.keys(neighborhoods).join(', '));
  process.exit(1);
}

// --- Fetch JSON from a URL using Node's built-in http module ---
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'generate-post/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${rawData.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timed out after 10s'));
    });
    req.end();
  });
}

// --- Analyze listings array and compute market stats ---
function analyzeListings(listings) {
  if (!listings.length) return null;

  const prices = listings.map(l => l.list_price).filter(Boolean);
  const medianPrice = prices.length
    ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]
    : null;

  const sqftListings = listings.filter(l => l.list_price && l.living_area);
  const avgPricePerSqft = sqftListings.length
    ? sqftListings.reduce((sum, l, _, arr) => sum + (l.list_price / l.living_area) / arr.length, 0)
    : 0;

  const domListings = listings.filter(l => l.days_on_market != null);
  const avgDom = domListings.length
    ? domListings.reduce((sum, l, _, arr) => sum + l.days_on_market / arr.length, 0)
    : 0;

  // Price tiers
  const under750    = listings.filter(l => l.list_price < 750000).length;
  const tier750to1m = listings.filter(l => l.list_price >= 750000  && l.list_price < 1000000).length;
  const tier1mto15  = listings.filter(l => l.list_price >= 1000000 && l.list_price < 1500000).length;
  const over15m     = listings.filter(l => l.list_price >= 1500000).length;

  // Newest listings (listed in last 7 days)
  const newListings = listings.filter(l => {
    if (!l.list_date) return false;
    return (Date.now() - new Date(l.list_date).getTime()) < 7 * 24 * 60 * 60 * 1000;
  });

  return {
    medianPrice,
    avgPricePerSqft,
    avgDom,
    under750,
    tier750to1m,
    tier1mto15,
    over15m,
    newListings,
    total: listings.length
  };
}

// --- Generate the HTML body for the post ---
function generateContent(n, listings, stats, monthYear, fmt) {
  // Top 3 listings to highlight
  const highlights = listings.slice(0, 3);

  return `
<p>Here's what's actually happening in the ${n.name} real estate market right now — not Zillow estimates, not national trends, but what I'm seeing on the ground as a ${n.name} specialist.</p>

<h2>${n.name} Market Snapshot — ${monthYear}</h2>

${stats ? `
<div class="data-highlight">
  <span class="stat">${fmt(stats.medianPrice)}</span>
  <span class="stat-label">Median Active List Price</span>
</div>
<div class="data-highlight">
  <span class="stat">${stats.avgPricePerSqft > 0 ? '$' + Math.round(stats.avgPricePerSqft) : 'N/A'}/sqft</span>
  <span class="stat-label">Average Price Per Square Foot</span>
</div>
<div class="data-highlight">
  <span class="stat">${stats.total}</span>
  <span class="stat-label">Active Listings Right Now</span>
</div>
${stats.avgDom > 0 ? `<div class="data-highlight">
  <span class="stat">${Math.round(stats.avgDom)} days</span>
  <span class="stat-label">Average Days on Market</span>
</div>` : ''}
` : '<p><em>Live market data unavailable at time of generation. Contact Luke Allen for current figures.</em></p>'}

<h2>What's Available in ${n.name} Right Now</h2>

<p>There ${stats && stats.total === 1 ? 'is' : 'are'} currently <strong>${stats ? stats.total : 'several'} active listings</strong> in ${n.name}. Here's the breakdown by price tier:</p>

${stats ? `<table>
<thead><tr><th>Price Range</th><th>Active Listings</th><th>Notes</th></tr></thead>
<tbody>
${stats.under750 > 0 ? `<tr><td>Under $750K</td><td>${stats.under750}</td><td>Entry-level; typically smaller square footage or needs updating</td></tr>` : ''}
${stats.tier750to1m > 0 ? `<tr><td>$750K \u2013 $1M</td><td>${stats.tier750to1m}</td><td>Primary move-up buyer target; most competition in this range</td></tr>` : ''}
${stats.tier1mto15 > 0 ? `<tr><td>$1M \u2013 $1.5M</td><td>${stats.tier1mto15}</td><td>Renovated character homes and newer builds</td></tr>` : ''}
${stats.over15m > 0 ? `<tr><td>$1.5M+</td><td>${stats.over15m}</td><td>Custom construction, large lots, premium locations</td></tr>` : ''}
</tbody></table>` : ''}

<h2>What I'm Seeing on the Ground</h2>

<p>The ${n.name} market in ${monthYear} is showing ${n.vibe ? `the same characteristics that have always defined it: ${n.vibe.toLowerCase()}.` : 'steady demand across all price points.'} ${stats && stats.newListings && stats.newListings.length > 0 ? `There ${stats.newListings.length === 1 ? 'has been' : 'have been'} ${stats.newListings.length} new listing${stats.newListings.length > 1 ? 's' : ''} in just the past 7 days \u2014 ` : ''}${stats && stats.medianPrice ? `with a median active list price of ${fmt(stats.medianPrice)}, ` : ''}this is not a neighborhood for bottom-fishing or waiting for a crash.</p>

<p>The homes that are moving quickly are the ones priced correctly from day one. In ${n.name}, a well-priced home in good condition typically generates serious buyer interest within the first 10-14 days. Homes that start too high and reduce tend to sit — and in this neighborhood, days on market is a signal that buyers notice.</p>

${highlights.length > 0 ? `<h2>Notable Active Listings</h2>
<p>A few of the more interesting properties currently on the market in ${n.name}:</p>
<ul>
${highlights.filter(l => l.list_price && l.unparsed_address).map(l =>
  `<li><strong>${fmt(l.list_price)}</strong> \u2014 ${l.unparsed_address}${l.bedrooms_total ? ` \u00b7 ${l.bedrooms_total} bed` : ''}${l.bathrooms_total ? `/${l.bathrooms_total} bath` : ''}${l.living_area ? ` \u00b7 ${Number(l.living_area).toLocaleString()} sqft` : ''}</li>`
).join('\n')}
</ul>
<p>See all current listings: <a href="/neighborhoods/${n.slug}/homes-for-sale">Browse ${n.name} homes for sale \u2192</a></p>` : ''}

<h2>For Buyers in ${n.name} Right Now</h2>

<p>If you're actively looking in ${n.name}, here's what I'd tell you: <strong>get your pre-approval letter in hand before you start seriously looking</strong>. Sellers in this price range want certainty, and a pre-approval from a reputable local lender carries significantly more weight than a pre-qualification. The homes that generate multiple offers in ${n.name} — and some do — are going to buyers who can move quickly and cleanly.</p>

<p>Zillow estimates in ${n.name} are notoriously inaccurate. The wide variation in home quality, lot size, and location within the ${n.name} zip code makes automated valuation models unreliable. A home that Zillow estimates at $900K might be worth $825K or $975K depending on the specific block, school assignment, and condition. This is exactly where having a specialist matters.</p>

<p>If you're patient and looking in the ${fmt(stats && stats.medianPrice ? stats.medianPrice : null)} range for ${n.name}, the current inventory gives you reasonable options. The $750K\u2013$1M range is where I'm seeing the most competition. Above $1.5M, buyers have more leverage and more time to evaluate — that market is more negotiable right now.</p>

<h2>For Sellers Thinking About Listing in ${n.name}</h2>

<p>${n.name} sellers have a strong market to work with right now, but "strong" doesn't mean "list high and wait." The sellers who are achieving premium results in ${monthYear} are the ones who priced right, presented well, and moved decisively when good offers came. The sellers who overpriced and reduced are leaving money on the table — buyers notice the price history, and a reduction signals weakness even when you come down to fair market value.</p>

<p>Spring is historically the strongest selling season in ${n.name}, driven in part by families trying to secure homes before the next school year. If you're considering selling, listing in February\u2013April puts you in front of the most motivated buyer pool of the year.</p>

<p>Want a free, honest valuation of your ${n.name} home? <a href="/neighborhoods/${n.slug}/best-realtor">Talk to Luke Allen about selling in ${n.name} \u2192</a></p>

<h2>My Honest Take on Where ${n.name} Is Headed</h2>

<p>${n.name} has structural advantages that don't disappear in a down market: limited supply (it's fully built out — you can't create new land here), excellent schools, walkability, and 10 minutes to downtown Austin. These aren't marketing talking points; they're the reasons buyers have been paying premiums for ${n.name} for decades.</p>

<p>Over the next 90 days, I expect to see continued steady demand at fair prices, with a slight uptick in new listings as sellers who held off through winter come to market. If rates hold where they are or tick down slightly, buyer activity will increase. This is not a market for dramatic predictions in either direction — it's a neighborhood that rewards patient buyers who buy the right house at a fair price, and patient sellers who price accurately and present well.</p>

<p>Questions about the ${n.name} market? <a href="/tarrytown-realtor">Contact Luke Allen directly \u2192</a></p>
`;
}

// --- Build the full post object ---
function generateMarketUpdatePost(n, listings, stats, date) {
  const monthYear    = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const dateISO      = date.toISOString().split('T')[0];
  const dateFormatted = date.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const slug         = `${n.slug}-market-update-${date.toISOString().slice(0, 7)}`;

  // Format price as $X,XXX,XXX
  const fmt = (num) => num ? '$' + Math.round(num).toLocaleString() : 'N/A';

  const content = generateContent(n, listings, stats, monthYear, fmt);

  return {
    slug,
    title: `${n.name} Austin Real Estate Market Update \u2014 ${monthYear}`,
    date: dateISO,
    dateFormatted,
    category: 'Market Update',
    neighborhood: n.slug,
    neighborhoodName: n.name,
    excerpt: `What's happening in the ${n.name} real estate market in ${monthYear}. Active listings, recent sales, price trends, and Luke Allen's take on where the market is headed.`,
    content,
    author: 'Luke Allen',
    authorTitle: 'Austin TX Realtor, TREC #788149',
    tags: [n.name, 'Market Update', 'Austin Real Estate', n.area, 'Home Prices'],
    readTime: '5 min read',
    published: autoPublish,
    featured: false
  };
}

// --- Main ---
async function main() {
  const date = new Date();
  console.log(`\nGenerating ${postType} post for: ${n.name}`);
  console.log(`Date: ${date.toDateString()}`);
  console.log(`Auto-publish: ${autoPublish}\n`);

  // Primary API URL — search by neighborhood
  const primaryUrl = `http://localhost:3002/api/properties/search?neighborhood=${encodeURIComponent(n.mlsSearch)}&sortBy=newest&minPrice=75000&limit=12`;
  const fallbackUrl = `http://localhost:3002/api/properties/search?city=Austin&sortBy=newest&minPrice=75000&limit=12`;

  console.log(`Fetching MLS data from: ${primaryUrl}`);

  let listings = [];
  let stats = null;

  try {
    const data = await fetchJSON(primaryUrl);
    listings = data.listings || data.properties || [];

    // If primary search returned nothing, try the city-wide fallback
    if (listings.length === 0) {
      console.log(`No results for neighborhood search. Trying fallback: ${fallbackUrl}`);
      const fallbackData = await fetchJSON(fallbackUrl);
      listings = fallbackData.listings || fallbackData.properties || [];
    }

    stats = analyzeListings(listings);
    console.log(`Found ${listings.length} listings, median price: ${stats && stats.medianPrice ? '$' + Math.round(stats.medianPrice).toLocaleString() : 'N/A'}`);
  } catch (e) {
    console.warn(`Warning: Could not fetch MLS data (${e.message}). Generating post with placeholder data.`);
    console.warn('Make sure the server is running: node server.js');
  }

  // Generate the post object
  const post = generateMarketUpdatePost(n, listings, stats, date);

  // Load existing posts file
  const postsPath = path.join(__dirname, '../data/blog-posts.js');
  let existingPosts = [];

  try {
    // Clear require cache so we always read the freshest version
    delete require.cache[require.resolve('../data/blog-posts')];
    existingPosts = require('../data/blog-posts');
  } catch (e) {
    console.log('No existing blog-posts.js found, creating new file...');
  }

  // Guard against duplicate slugs
  if (existingPosts.some(p => p.slug === post.slug)) {
    console.warn(`Warning: Post with slug "${post.slug}" already exists. Adding with suffix.`);
    post.slug += '-2';
  }

  // Prepend new post so it appears first in the feed
  const allPosts = [post, ...existingPosts];

  // Serialize back to a CommonJS module
  const postsJS = `module.exports = ${JSON.stringify(allPosts, null, 2)};\n`;
  fs.writeFileSync(postsPath, postsJS, 'utf8');

  console.log(`\n\u2713 Post generated successfully!`);
  console.log(`  Slug:      ${post.slug}`);
  console.log(`  Title:     ${post.title}`);
  console.log(`  Published: ${post.published}`);
  console.log(`  URL:       https://austintxhomes.co/blog/${post.slug}`);

  if (!autoPublish) {
    console.log(`\n  To publish: open data/blog-posts.js, find this post, change published: false to published: true`);
    console.log(`  Or re-run with --publish flag to auto-publish.`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
