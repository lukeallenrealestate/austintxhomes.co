'use strict';

/**
 * Shared market-stats helper.
 * Used by:
 *   /sold-homes-near-{zip}          (SEO landing pages, live sold comps)
 *   /austin-isd-homes-for-sale etc. (ISD pages, live inventory section)
 *   /mueller-homes-for-sale etc.    (Neighborhood pages, live inventory section)
 *
 * All queries hit the shared ACTRIS listings DB. Results are memoized in
 * process for 30 minutes so the pages stay fast under sitemap-driven crawl
 * bursts and Render's shared CPU.
 */

const listingDb = require('../../idx-search/db/database');

const CACHE = new Map();
const TTL_MS = 30 * 60 * 1000;

function cached(key, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;
  const value = fn();
  CACHE.set(key, { value, ts: Date.now() });
  return value;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

const RES_TYPES = "'Single Family Residence','Condominium','Townhouse','Duplex','Manufactured Home'";
const NOT_LEASE = "property_type NOT LIKE '%Lease%'";

// ────────────────────────────────────────────────────────────────────
// Active inventory summary for a filter (city, zip, subdivision, or
// school district). Used by ISD + neighborhood pages.
// ────────────────────────────────────────────────────────────────────
function activeStats(filter) {
  const cacheKey = 'active:' + JSON.stringify(filter);
  return cached(cacheKey, () => {
    const conditions = [`standard_status = 'Active'`, `list_price >= 75000`, `property_sub_type IN (${RES_TYPES})`, NOT_LEASE];
    const values = [];
    if (filter.city)          { conditions.push(`city = ?`); values.push(filter.city); }
    if (filter.zip)           { conditions.push(`postal_code = ?`); values.push(filter.zip); }
    if (filter.subdivision)   { conditions.push(`lower(subdivision_name) LIKE ?`); values.push('%' + filter.subdivision.toLowerCase() + '%'); }
    if (filter.schoolDistrict){ conditions.push(`school_district LIKE ?`); values.push('%' + filter.schoolDistrict + '%'); }
    if (filter.elementary)    { conditions.push(`elementary_school LIKE ?`); values.push('%' + filter.elementary + '%'); }
    if (filter.high)          { conditions.push(`high_school LIKE ?`); values.push('%' + filter.high + '%'); }

    const where = conditions.join(' AND ');
    const rows = listingDb.prepare(
      `SELECT list_price, living_area, bedrooms_total, days_on_market, listing_contract_date, new_construction_yn,
              CAST(json_extract(raw_data,'$.OriginalListPrice') AS INTEGER) AS original_list_price
       FROM listings WHERE ${where}`
    ).all(values);

    if (!rows.length) return null;

    const prices = rows.map(r => r.list_price).filter(Boolean);
    const ppsfs = rows.filter(r => r.list_price && r.living_area > 0).map(r => r.list_price / r.living_area);
    const now = Date.now();
    const doms = rows.map(r => {
      if (r.days_on_market > 0) return r.days_on_market;
      if (!r.listing_contract_date) return null;
      const t = new Date(r.listing_contract_date).getTime();
      if (isNaN(t)) return null;
      return Math.floor((now - t) / 86400000);
    }).filter(d => d != null && d >= 0 && d <= 365);

    const reduced = rows.filter(r => r.original_list_price && r.original_list_price > r.list_price).length;
    const newCon = rows.filter(r => r.new_construction_yn === 1).length;

    return {
      count: rows.length,
      medianPrice: median(prices),
      avgPrice: Math.round(avg(prices)),
      medianPpsf: Math.round(median(ppsfs)),
      medianDom: Math.round(median(doms)),
      avgDom: Math.round(avg(doms)),
      reducedCount: reduced,
      reducedPct: rows.length > 0 ? Math.round(100 * reduced / rows.length) : 0,
      newConCount: newCon,
      newConPct: rows.length > 0 ? Math.round(100 * newCon / rows.length) : 0,
      under400k: rows.filter(r => r.list_price < 400000).length,
      t400_600k: rows.filter(r => r.list_price >= 400000 && r.list_price < 600000).length,
      t600k_1m: rows.filter(r => r.list_price >= 600000 && r.list_price < 1000000).length,
      t1m_2m: rows.filter(r => r.list_price >= 1000000 && r.list_price < 2000000).length,
      over2m: rows.filter(r => r.list_price >= 2000000).length,
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// Recent sold comps for a filter. Powers the /sold-homes-near-{zip} pages.
// Only closed sales (not closed leases) in the last N days.
// ────────────────────────────────────────────────────────────────────
function soldStats(filter, days = 90) {
  const cacheKey = 'sold:' + JSON.stringify(filter) + ':' + days;
  return cached(cacheKey, () => {
    const conditions = [
      `standard_status = 'Closed'`,
      `close_price >= 75000`,
      `close_date IS NOT NULL`,
      `close_date >= date('now', '-${Number(days)} days')`,
      `property_sub_type IN (${RES_TYPES})`,
      NOT_LEASE,
    ];
    const values = [];
    if (filter.city)           { conditions.push(`city = ?`); values.push(filter.city); }
    if (filter.zip)            { conditions.push(`postal_code = ?`); values.push(filter.zip); }
    if (filter.subdivision)    { conditions.push(`lower(subdivision_name) LIKE ?`); values.push('%' + filter.subdivision.toLowerCase() + '%'); }
    if (filter.schoolDistrict) { conditions.push(`school_district LIKE ?`); values.push('%' + filter.schoolDistrict + '%'); }
    if (filter.elementary)     { conditions.push(`elementary_school LIKE ?`); values.push('%' + filter.elementary + '%'); }
    if (filter.high)           { conditions.push(`high_school LIKE ?`); values.push('%' + filter.high + '%'); }

    const where = conditions.join(' AND ');
    const rows = listingDb.prepare(
      `SELECT listing_key, unparsed_address, city, postal_code, subdivision_name,
              bedrooms_total, bathrooms_total, living_area, lot_size_acres, year_built,
              list_price, close_price, close_date, days_on_market, listing_contract_date,
              new_construction_yn, latitude, longitude
       FROM listings WHERE ${where}
       ORDER BY close_date DESC`
    ).all(values);

    if (!rows.length) return null;

    const closes = rows.map(r => r.close_price).filter(Boolean);
    const ppsfs = rows.filter(r => r.close_price && r.living_area > 0).map(r => r.close_price / r.living_area);
    const doms = rows.map(r => r.days_on_market).filter(d => d > 0 && d <= 365);
    const s2l = rows.filter(r => r.close_price > 0 && r.list_price > 0).map(r => r.close_price / r.list_price * 100);
    const aboveList = s2l.filter(r => r > 100).length;

    // Group by subdivision so we can show "hottest neighborhoods" on the page
    const subMap = {};
    rows.forEach(r => {
      const s = (r.subdivision_name || '').trim();
      if (!s || s.length > 40) return;
      if (!subMap[s]) subMap[s] = { count: 0, prices: [] };
      subMap[s].count++;
      if (r.close_price) subMap[s].prices.push(r.close_price);
    });
    const topSubdivisions = Object.entries(subMap)
      .map(([name, d]) => ({ name, count: d.count, median: median(d.prices) }))
      .filter(s => s.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      count: rows.length,
      days,
      medianClose: median(closes),
      avgClose: Math.round(avg(closes)),
      medianPpsf: Math.round(median(ppsfs)),
      avgDom: doms.length ? Math.round(avg(doms)) : null,
      avgSaleToList: s2l.length ? parseFloat(avg(s2l).toFixed(1)) : null,
      aboveListCount: aboveList,
      aboveListPct: s2l.length ? Math.round(100 * aboveList / s2l.length) : 0,
      topSubdivisions,
      // Latest 12 sales for the table on the page
      recent: rows.slice(0, 12).map(r => ({
        listing_key: r.listing_key,
        address: (r.unparsed_address || '').trim(),
        city: r.city,
        beds: r.bedrooms_total,
        baths: r.bathrooms_total,
        sqft: r.living_area,
        acres: r.lot_size_acres,
        year: r.year_built,
        closePrice: r.close_price,
        closeDate: r.close_date ? r.close_date.slice(0, 10) : null,
        dom: r.days_on_market,
        ppsf: (r.close_price && r.living_area > 0) ? Math.round(r.close_price / r.living_area) : null,
      })),
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// Top-N Austin ZIPs by residential inventory. Used to enumerate the
// /sold-homes-near-{zip} pages we should ship + link from the hub.
// ────────────────────────────────────────────────────────────────────
function topZipsByInventory(limit = 30) {
  const cacheKey = 'topzips:' + limit;
  return cached(cacheKey, () => {
    return listingDb.prepare(
      `SELECT postal_code AS zip,
              (SELECT city FROM listings l2 WHERE l2.postal_code = listings.postal_code AND l2.city IS NOT NULL GROUP BY city ORDER BY COUNT(*) DESC LIMIT 1) AS primary_city,
              COUNT(*) AS inventory
       FROM listings
       WHERE standard_status = 'Active'
         AND list_price >= 75000
         AND property_sub_type IN (${RES_TYPES})
         AND postal_code IS NOT NULL AND length(postal_code) = 5
       GROUP BY postal_code
       HAVING inventory >= 40
       ORDER BY inventory DESC
       LIMIT ?`
    ).all(limit);
  });
}

// Public helpers for template code (formatting)
const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
const fmtK = n => '$' + Math.round(n / 1000) + 'K';
const fmtNum = n => Math.round(n).toLocaleString('en-US');
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

module.exports = {
  activeStats,
  soldStats,
  topZipsByInventory,
  fmt, fmtK, fmtNum, fmtDate,
};
