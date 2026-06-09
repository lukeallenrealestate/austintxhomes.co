# Audit Report — austintxhomes.co
Generated 2026-04-13T15:31:02.629Z — GSC window: 2026-03-14 → 2026-04-10

## 🚨 Top Findings (action order)

1. **Pages are 25–30 MB each** — ~5× what's healthy. Images aren't optimized. This is your #1 perf problem and almost certainly hurting both rankings and CTR.
2. **260 of 336 sitemap pages (77%) have zero Google impressions in the last 30 days.** Most of your content isn't being seen. Likely causes: poor internal linking, weak canonicals, thin content, or Google chose not to index.
3. **`/austin-multifamily-market-report`: 4,209 impressions → 5 clicks (0.12% CTR).** Ranks in top 6 but title/meta doesn't convert. Biggest single SEO win on the site.
4. **`/search` page has CLS 1.0** (huge layout shift as listings load). Google counts this as "poor" Core Web Vitals, directly affects rankings.
5. **Site-wide CTR is 0.35%** (healthy is 2–5%). Titles and meta descriptions need work across the board.


## 1. Search Console — 30-day snapshot

- Impressions: **19,577**
- Clicks: **68**
- CTR: **0.35%**
- Avg position: **18.3**

## 2. CTR Opportunities — high impressions, low clicks

| Page | Impressions | Clicks | CTR | Avg Pos |
|------|-------------|--------|-----|---------|
| /austin-multifamily-market-report | 4209 | 5 | 0.12% | 6.1 |
| /cost-of-living | 1995 | 1 | 0.05% | 9.8 |
| /west-austin/westlake/market-report | 1253 | 2 | 0.16% | 6.6 |
| /investment-properties | 847 | 1 | 0.12% | 18.1 |
| /neighborhoods | 649 | 1 | 0.15% | 35.8 |
| /best-austin-areas-multifamily-investment | 624 | 1 | 0.16% | 9.2 |
| /tesla-austin-relocation | 513 | 2 | 0.39% | 4.9 |
| /luxury-homes | 421 | 1 | 0.24% | 57.7 |
| /lago-vista-tx | 394 | 1 | 0.25% | 54.3 |
| /clarksville/rentals | 393 | 1 | 0.25% | 10.7 |

**Recommendation:** rewrite titles & meta descriptions for these pages. They're ranking — readers just aren't clicking.

## 3. Indexing Gaps — sitemap pages with 0 impressions

Total sitemap URLs: **336**
Pages with zero GSC impressions (30d): **260**

First 20 unindexed/unseen pages:
- /buy
- /buying-home-after-divorce-austin
- /rentals
- /samsung-austin-relocation
- /indeed-austin-relocation
- /austin-homes-under-750k
- /austin-homes-under-1-million
- /austin-homes-under-500k
- /austin-homes-under-400k
- /moving-to-austin-guides
- /employer-relocation-austin
- /moving-from-denver-to-austin
- /moving-from-dc-to-austin
- /moving-from-sf-to-austin
- /moving-from-atlanta-to-austin
- /moving-from-minneapolis-to-austin
- /moving-from-portland-to-austin
- /moving-from-seattle-to-austin
- /schwab-austin-relocation
- /market-report

**Recommendation:** submit these to GSC → URL Inspection → Request Indexing. Check for crawl blocks, broken canonicals, or thin content.

## 4. Favicon Declaration Audit

Pages with full favicon block: **181/181**
✓ All static pages have the correct favicon block.

## 5. Core Web Vitals (Lighthouse — Mobile, 4× CPU throttle)

| Page | Perf | SEO | A11y | LCP | CLS | TBT | FCP |
|------|------|-----|------|-----|-----|-----|-----|
| / | 🟡 69 | 🟢 100 | 🟡 81 | 🔴 **5.1 s** | 🟢 0 | 🟢 0 ms | 🟡 3.8 s |
| /divorce-realtor-austin | 🟡 67 | 🟢 100 | 🟡 85 | 🔴 **16.3 s** | 🟡 0.157 | 🟢 0 ms | 🟢 1.8 s |
| /austin-multifamily-market-report | 🟡 74 | 🟢 100 | 🟡 80 | 🔴 **14.5 s** | 🟢 0 | 🟢 0 ms | 🟢 1.6 s |
| /search | 🔴 35 | 🟡 85 | 🟡 85 | 🔴 **19.1 s** | 🔴 **1.0** | 🟢 130 ms | 🟡 2.7 s |
| /apple-austin-relocation | 🟡 84 | 🟢 100 | 🟢 88 | 🟢 2.9 s | 🟢 0.008 | 🟢 0 ms | 🟢 1.8 s |

**Critical finding: massive network payloads (25–30 MB per page)** — this is ~5× what a healthy page serves. Almost certainly oversized/unoptimized images.

Top opportunities per page:
- `/` — 25.8 MB total payload
- `/divorce-realtor-austin` — 26.4 MB total payload
- `/austin-multifamily-market-report` — 25.8 MB total payload
- `/search` — 6.9 MB + 106 KB unused JS + 2.2 s main-thread work + CLS 1.0 (huge layout shift)
- `/apple-austin-relocation` — 30.6 MB total payload

## 6. User Flow Tests (Puppeteer — Live Site)

### Home page
- Load time (networkidle): **11587ms**
- JS errors: ✓ none
- Failed requests: ✓ none

### /search page
- Load time: **1562ms**
- JS errors: ✓ none
- Failed requests (filtered): ✓ none
- Listing cards rendered: **254**
