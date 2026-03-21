# AustinTXHomes — Claude Instructions

Read this file before building or modifying any page on this site.

---

## SEO Checklist for Every New Page

### 1. HTML Meta (head)
- [ ] `<title>` — keep under 60 characters. Format: `{Page Topic} Austin TX | {Benefit} | Luke Allen`
- [ ] `<meta name="description">` — 140–160 chars, includes primary keyword naturally
- [ ] `<link rel="canonical">` — absolute URL: `https://austintxhomes.co/{slug}` — never `/site/` in the path
- [ ] `<link rel="icon" href="/favicon.png" />`
- [ ] **All 5 OG tags** (required — missing og:image breaks social sharing and rich results):
  ```html
  <meta property="og:type" content="website" />
  <meta property="og:title" content="..." />
  <meta property="og:description" content="..." />
  <meta property="og:url" content="https://austintxhomes.co/{slug}" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  ```
- [ ] `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">` — use the FULL string, not just `index, follow`
- [ ] `<meta name="geo.region" content="US-TX">`
- [ ] `<meta name="geo.placename" content="Austin, Texas">`
- [ ] `<meta name="twitter:card" content="summary_large_image" />`

### 2. Schema Markup (JSON-LD)

Every page needs **at minimum** a `RealEstateAgent` schema block with the full standard fields below. Add additional types based on page type.

#### Standard RealEstateAgent block (copy this exactly for every page):
```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": "Luke Allen – Austin TX Homes",
  "url": "https://austintxhomes.co",
  "telephone": "+12547182567",
  "email": "Luke@austinmdg.com",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "5.0",
    "reviewCount": "15",
    "bestRating": "5",
    "worstRating": "1"
  },
  "sameAs": [
    "https://share.google/hETte82InqUPvWeNC",
    "https://www.linkedin.com/in/lukeallentx/",
    "https://www.instagram.com/lukeallenrealty/",
    "https://www.tiktok.com/@austintxapartments"
  ]
}
```

> **When to update `reviewCount`:** Luke currently has 15 five-star Google reviews. Update this number whenever he gets more reviews.

#### Additional schema by page type:
- **All pages** → `BreadcrumbList` (shows breadcrumb path in Google search results)
- **Content/guide pages** → `Article` schema with `datePublished`, `dateModified`, `author` (Luke Allen, TREC #788149)
- **Pages with FAQs** → `FAQPage` schema matching the visible Q&A content (drives rich result accordion in search)
- **Service pages** → `hasOfferCatalog` on the RealEstateAgent schema
- **Home page only** → also include `geo` coordinates and `openingHoursSpecification` on the RealEstateAgent

#### BreadcrumbList template (required on every page):
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://austintxhomes.co/" },
    { "@type": "ListItem", "position": 2, "name": "{Page Name}", "item": "https://austintxhomes.co/{slug}" }
  ]
}
```

#### Schema URL rules — CRITICAL:
- All schema URLs must use `https://austintxhomes.co/` — never `/site/` in any path
- The about page contact link is `/about#contact` — never `/site/about.html#contact`

### 3. Sitemap — `public/sitemap.xml`
- [ ] Add `<url>` entry for the new page
- [ ] Set `<loc>` to the canonical URL (no `/site/` in path)
- [ ] Set `<priority>`: 0.9 for core service/money-keyword pages, 0.8 for content/guide pages, 0.7 for supporting pages
- [ ] Set `<changefreq>`: `weekly` for listing pages, `monthly` for content pages
- [ ] Set `<lastmod>` to today's date

### 4. Server Route — `server.js`
- [ ] Add a clean URL route: `app.get('/{slug}', (_req, res) => res.sendFile(path.join(__dirname, 'public/site/{slug}.html')));`

### 5. Footer — `public/js/footer.js`
Add a link to the new page in the most relevant column:
- **Services** column — transactional pages (Buy, Sell, Rentals, listing pages)
- **Austin Guides** column — content/guide pages (Market Report, Moving Guide, etc.)
- **Neighborhoods** column — individual neighborhood pages only

### 6. Internal Links — contextual body links
- [ ] Link to the new page from **at least 2–3 existing pages** within paragraph copy — not just nav/footer
- [ ] The new page itself should contain **at least 4–6 contextual links** to related pages on the site
- [ ] Pages with zero internal body links are dead ends — Google cannot distribute authority through them
- Common link spots: `home.html` services section, thematically related pages, neighborhood pages

### 7. Navigation — `public/js/nav.js`
Only add to the primary nav if it's a top-level service (Buy, Sell, Neighborhoods, About tier). Most pages live in the footer only.

### 8. Page Content Requirements
- [ ] Single `<h1>` that includes the primary keyword
- [ ] Logical `<h2>` / `<h3>` heading hierarchy — no skipped levels
- [ ] At least 300 words of original copy (Google ignores thin pages; 600+ is better)
- [ ] FAQ section with 4–6 questions → add matching `FAQPage` schema
- [ ] Primary keyword used naturally in: h1, first paragraph, at least one h2, and meta description

### 9. Design System (always match exactly)
- Fonts: Cormorant Garamond (headings) + Inter (body) from Google Fonts
- Colors: use CSS variables from `:root` — never hardcode hex values
  ```
  --gold: #b8935a  --gold-lt: #cda96f  --gold-pale: #f5ede0
  --ink: #0f0f0e   --text: #1a1918     --mid: #5c5b57
  --light: #999690 --bg: #ffffff        --warm: #faf8f4
  --cream: #f1ece3 --border: #e5dfd4   --r: 4px  --w: 1180px
  ```
- Nav: `<script src="/js/nav.js"></script>` as **first element** inside `<body>`
- Footer: `<script src="/js/footer.js"></script>` at end of body, **before** `<script>` blocks
- Hero style: dark `--ink` background with `radial-gradient` gold glow at `50% 40%`
- First section after nav: `margin-top: 64px` to clear the fixed nav

### 10. API Integration (listing pages)
- Endpoint: `/api/properties/search` (not `/api/listings`)
- Field names are snake_case: `list_price`, `listing_key`, `unparsed_address`, `bedrooms_total`, `bathrooms_total`, `living_area`, `lot_size_sqft`, `photos`
- Sort param: `sortBy` with values `price_desc`, `price_asc`, `newest`
- Pagination: `page` (1-indexed), not `offset`
- Always add `minPrice=75000` on for-sale fetches to exclude rental listings that bleed through
- Rental listings: use `forRent=true` param; price shows `/mo` suffix
- Photos array: `l.photos[0]` gives the first image path
- Yard size heuristic: `estimated_yard_sqft = lot_size_sqft - living_area`

### 11. Visual QA — Screenshot with Puppeteer
After building or modifying any page, screenshot it and fix visual issues before declaring done.

```bash
node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3002/{SLUG}', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: '/tmp/{SLUG}-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/{SLUG}-mobile.png', fullPage: true });
  await browser.close();
  console.log('Screenshots saved');
})();
"
```

Check both screenshots for:
- [ ] Hero renders correctly — text readable over dark background
- [ ] Nav and footer present
- [ ] Listing cards load or show graceful empty state
- [ ] No broken sections, overflow, or cut-off text
- [ ] Mobile stacks correctly — no horizontal scroll, no overlapping elements
- [ ] Typography hierarchy clear — h1 > h2 > body copy
- [ ] CTA sections and forms fully visible

If Puppeteer is not installed: `npm install puppeteer` in the austintxhomes directory.

---

## Site Structure Reference

| URL | File | Server Route |
|-----|------|-------------|
| `/` | `public/site/home.html` | ✓ |
| `/buy` | `public/site/buy.html` | ✓ |
| `/sell` | `public/site/sell.html` | ✓ |
| `/rentals` | `public/site/rentals.html` | ✓ |
| `/neighborhoods` | `public/site/neighborhoods.html` | ✓ |
| `/about` | `public/site/about.html` | ✓ |
| `/austin-tx-realtor` | `public/site/austin-tx-realtor.html` | ✓ |
| `/moving-to-austin` | `public/site/moving-to-austin.html` | ✓ |
| `/market-report` | `public/site/market-report.html` | ✓ |
| `/new-construction` | `public/site/new-construction.html` | ✓ |
| `/first-time-buyers` | `public/site/first-time-buyers.html` | ✓ |
| `/investment-properties` | `public/site/investment-properties.html` | ✓ |
| `/luxury-homes` | `public/site/luxury-homes.html` | ✓ |
| `/commercial-real-estate-austin` | `public/site/commercial-real-estate-austin.html` | ✓ |
| `/austin-homes-big-yard` | `public/site/austin-homes-big-yard.html` | ✓ |
| `/austin-buyers-or-sellers-market` | `public/site/austin-buyers-or-sellers-market.html` | ✓ |
| `/austin-home-prices-falling` | `public/site/austin-home-prices-falling.html` | ✓ |
| `/sienna-at-the-thompson-austin` | `public/site/sienna-at-the-thompson-austin.html` | ✓ |
| `/texas-residency-ut-austin-in-state-tuition` | `public/site/texas-residency-ut-austin-in-state-tuition.html` | ✓ |
| `/austin-isd-homes-for-sale` | `public/site/austin-isd-homes-for-sale.html` | ✓ |
| `/leander-isd-homes-for-sale` | `public/site/leander-isd-homes-for-sale.html` | ✓ |
| `/round-rock-isd-homes-for-sale` | `public/site/round-rock-isd-homes-for-sale.html` | ✓ |
| `/lake-travis-isd-homes-for-sale` | `public/site/lake-travis-isd-homes-for-sale.html` | ✓ |
| `/hays-isd-homes-for-sale` | `public/site/hays-isd-homes-for-sale.html` | ✓ |
| `/pflugerville-isd-homes-for-sale` | `public/site/pflugerville-isd-homes-for-sale.html` | ✓ |
| `/best-realtor-eanes-isd` | `public/site/best-realtor-eanes-isd.html` | ✓ |
| `/best-realtor-austin-isd` | `public/site/best-realtor-austin-isd.html` | ✓ |
| `/best-realtor-leander-isd` | `public/site/best-realtor-leander-isd.html` | ✓ |
| `/best-realtor-round-rock-isd` | `public/site/best-realtor-round-rock-isd.html` | ✓ |
| `/best-realtor-lake-travis-isd` | `public/site/best-realtor-lake-travis-isd.html` | ✓ |
| `/best-realtor-hays-isd` | `public/site/best-realtor-hays-isd.html` | ✓ |
| `/best-realtor-pflugerville-isd` | `public/site/best-realtor-pflugerville-isd.html` | ✓ |
| `/best-realtor-78704-austin` | `public/site/best-realtor-78704-austin.html` | ✓ |
| `/best-realtor-78702-austin` | `public/site/best-realtor-78702-austin.html` | ✓ |
| `/best-realtor-78703-austin` | `public/site/best-realtor-78703-austin.html` | ✓ |
| `/best-realtor-78722-austin` | `public/site/best-realtor-78722-austin.html` | ✓ |
| `/best-realtor-78754-austin` | `public/site/best-realtor-78754-austin.html` | ✓ |
| `/best-realtor-78731-austin` | `public/site/best-realtor-78731-austin.html` | ✓ |
| `/brentwood-realtor` | `public/site/brentwood-realtor.html` | ✓ |
| `/brentwood-homes-for-sale` | `public/site/brentwood-homes-for-sale.html` | ✓ |
| `/brentwood-market-report` | `public/site/brentwood-market-report.html` | ✓ |
| `/living-in-brentwood-austin` | `public/site/living-in-brentwood-austin.html` | ✓ |
| `/sell-home-brentwood-austin` | `public/site/sell-home-brentwood-austin.html` | ✓ |
| `/tarrytown-realtor` | `public/site/tarrytown-realtor.html` | ✓ |
| `/tarrytown-homes-for-sale` | `public/site/tarrytown-homes-for-sale.html` | ✓ |
| `/tarrytown-market-report` | `public/site/tarrytown-market-report.html` | ✓ |
| `/living-in-tarrytown-austin` | `public/site/living-in-tarrytown-austin.html` | ✓ |
| `/sell-home-tarrytown-austin` | `public/site/sell-home-tarrytown-austin.html` | ✓ |
| `/zilker-realtor` | `public/site/zilker-realtor.html` | ✓ |
| `/zilker-market-report` | `public/site/zilker-market-report.html` | ✓ |
| `/neighborhoods/:slug` | `templates/neighborhood.js` (SSR) | ✓ |

Neighborhood data lives in `data/neighborhoods.js`. New neighborhoods go there, not as static HTML files.

---

## Owner Info (for schema / contact)
- Name: Luke Allen
- Phone: +12547182567
- Email: Luke@austinmdg.com
- TREC License: 788149
- Brokerage: Austin Marketing + Development Group
- Domain: https://austintxhomes.co
- Google Business: https://share.google/hETte82InqUPvWeNC
- LinkedIn: https://www.linkedin.com/in/lukeallentx/
- Instagram: https://www.instagram.com/lukeallenrealty/
- TikTok: https://www.tiktok.com/@austintxapartments
- Google Reviews: 15 five-star reviews, 5.0 rating (update when this changes)
- OG image: https://austintxhomes.co/images/luke-allen.jpg
