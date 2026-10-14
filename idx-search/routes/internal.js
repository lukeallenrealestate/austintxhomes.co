/**
 * Internal API — server-to-server endpoints for Realtor-OS and other
 * authenticated backend consumers. Every route gated by requireInternalKey.
 *
 * Why this exists: austintxhomes.co's public endpoints filter mlg_can_view=1
 * for MLS compliance, which hides syndication-opted-out listings from the
 * public UI. Realtor-OS needs the full inventory (Luke is a licensed agent,
 * he can see everything) plus comp/market/deal queries that aren't appropriate
 * on a public site.
 *
 * Headers required on every request:  X-Internal-API-Key: <INTERNAL_API_KEY>
 *
 * All responses: Cache-Control: no-store (never cached at the CDN edge).
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireInternalKey } = require('../middleware/authMiddleware');

router.use(requireInternalKey);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ─── Shared SQL helpers ──────────────────────────────────────────────── */

/** Build a photo-URL list from the stored JSON (ingest stores a photos array). */
function expandPhotos(row) {
  try {
    const arr = row.photos ? JSON.parse(row.photos) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** Row → listing-shaped JSON matching the public /api/properties/:key output. */
function toListing(row) {
  return {
    listing_key: row.listing_key,
    listing_id: row.listing_id,
    standard_status: row.standard_status,
    property_type: row.property_type,
    property_sub_type: row.property_sub_type,
    list_price: row.list_price,
    close_price: row.close_price,
    close_date: row.close_date,
    original_list_price: row.original_list_price,
    previous_list_price: row.previous_list_price,
    price_change_timestamp: row.price_change_timestamp,
    bedrooms_total: row.bedrooms_total,
    bathrooms_total: row.bathrooms_total,
    bathrooms_full: row.bathrooms_full,
    bathrooms_half: row.bathrooms_half,
    living_area: row.living_area,
    lot_size_acres: row.lot_size_acres,
    lot_size_sqft: row.lot_size_sqft,
    year_built: row.year_built,
    garage_spaces: row.garage_spaces,
    unparsed_address: row.unparsed_address,
    street_number: row.street_number,
    street_name: row.street_name,
    unit_number: row.unit_number,
    city: row.city,
    state_or_province: row.state_or_province,
    postal_code: row.postal_code,
    county: row.county,
    subdivision_name: row.subdivision_name,
    latitude: row.latitude,
    longitude: row.longitude,
    public_remarks: row.public_remarks,
    list_agent_full_name: row.list_agent_full_name,
    list_agent_direct_phone: row.list_agent_direct_phone,
    list_agent_email: row.list_agent_email,
    list_office_name: row.list_office_name,
    elementary_school: row.elementary_school,
    middle_school: row.middle_school,
    high_school: row.high_school,
    school_district: row.school_district,
    days_on_market: row.days_on_market,
    listing_contract_date: row.listing_contract_date,
    modification_timestamp: row.modification_timestamp,
    mlg_can_view: row.mlg_can_view,
    photos: expandPhotos(row),
    tax_annual_amount: row.tax_annual_amount,
    association_fee: row.association_fee,
    association_fee_frequency: row.association_fee_frequency,
    pool_features: row.pool_features,
    waterfront_yn: row.waterfront_yn,
    new_construction_yn: row.new_construction_yn,
    stories: row.stories,
  };
}

/** Haversine distance in miles between two lat/lng points. */
function milesBetween(lat1, lng1, lat2, lng2) {
  const R = 3959; // earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/* ─── /api/internal/lookup — single-listing resolver ────────────────────
 *
 * Realtor-OS's Tour Planner calls this. Finds a listing by MLS#, listing
 * key, or free-text address — any status, any visibility. Returns the
 * single best match or null.
 */
router.get('/lookup', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q required' });

    // 1. MLS# / listing key direct hit (prefixes: ACT, numeric)
    if (/^[A-Z]{0,4}\d{6,10}$/i.test(q)) {
      const row = db.prepare(
        `SELECT * FROM listings WHERE listing_key = ? OR listing_id = ? LIMIT 1`
      ).get(q.toUpperCase(), q.toUpperCase());
      if (row) return res.json({ ...toListing(row), _matchType: 'exact' });
    }

    // 2. FTS trigram on unparsed_address — no mlg_can_view filter, no status filter.
    //    Try the exact text first; if nothing comes back, try with trailing
    //    unit suffix stripped so "501 w 26th st APT 103" also finds "501 W 26th St".
    const tryFts = (text, matchType) => {
      try {
        const ftsQuery = `"${text.replace(/"/g, '""')}"`;
        const row = db.prepare(`
          SELECT l.*,
            CASE l.standard_status WHEN 'Active' THEN 0 WHEN 'Pending' THEN 1
                 WHEN 'Active Under Contract' THEN 2 ELSE 3 END AS status_rank
          FROM listings l
          WHERE l.rowid IN (SELECT rowid FROM listings_fts WHERE unparsed_address MATCH ?)
          ORDER BY status_rank, l.modification_timestamp DESC
          LIMIT 1
        `).get(ftsQuery);
        if (row) return { ...toListing(row), _matchType: matchType };
      } catch (err) {
        // FTS syntax issues on odd input — swallow and let the caller fall through
      }
      return null;
    };

    let hit = tryFts(q, 'exact');
    if (hit) return res.json(hit);

    // Strip apt/unit suffixes and try again — matches a sibling unit in the
    // same building (caller gets 'approximate' so UI can flag that).
    const stripped = q
      .replace(/\s+(apt\.?|apartment|unit|ste\.?|suite|#)\s*[a-z0-9-]+\s*$/i, '')
      .replace(/,\s*[a-z\s,]+(?:tx|texas)?\s*\d*\s*$/i, '')
      .trim();
    if (stripped && stripped !== q) {
      hit = tryFts(stripped, 'approximate');
      if (hit) return res.json(hit);
    }

    // 3. LIKE fallback — catches 2-char queries + "San Pedro" (where FTS trigram
    //    sometimes misses short words). mlg_can_view ignored on purpose.
    const like = `%${q}%`;
    const row = db.prepare(`
      SELECT * FROM listings
      WHERE unparsed_address LIKE ?
      ORDER BY
        CASE standard_status WHEN 'Active' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END,
        modification_timestamp DESC
      LIMIT 1
    `).get(like);
    if (row) return res.json({ ...toListing(row), _matchType: 'approximate' });

    return res.status(404).json({ error: 'No matching listing', query: q });
  } catch (err) {
    console.error('[internal/lookup] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/comps — recent closed comps ────────────────────────
 *
 * Query:
 *   lat, lng (required)         — point to find comps around
 *   radius (default 1 mile)
 *   months (default 6)          — close_date floor
 *   beds (optional, exact match)
 *   sqftMin, sqftMax (optional)
 *   propertyType (optional)     — "Residential", "Residential Lease", etc.
 *   limit (default 25, max 100)
 *
 * Returns comps with distance, DOM, close-to-list ratio, implied $/sqft.
 */
router.get('/comps', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const radius = Math.min(10, Math.max(0.1, parseFloat(req.query.radius) || 1));
    const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    const beds = req.query.beds ? parseInt(req.query.beds, 10) : null;
    const sqftMin = req.query.sqftMin ? parseInt(req.query.sqftMin, 10) : null;
    const sqftMax = req.query.sqftMax ? parseInt(req.query.sqftMax, 10) : null;
    const propertyType = req.query.propertyType || 'Residential';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    // Rough bounding box to prune the comp pool before haversine filter.
    // 1 degree lat ≈ 69 mi, 1 degree lng at 30°N ≈ 59.7 mi.
    const latSpan = radius / 69;
    const lngSpan = radius / 59.7;

    const closedFloor = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const conditions = [
      'standard_status = ?',
      `property_type = ?`,
      'close_date IS NOT NULL',
      'close_date >= ?',
      'close_price IS NOT NULL',
      'latitude BETWEEN ? AND ?',
      'longitude BETWEEN ? AND ?',
    ];
    const values = [
      'Closed', propertyType, closedFloor,
      lat - latSpan, lat + latSpan,
      lng - lngSpan, lng + lngSpan,
    ];
    if (beds != null) { conditions.push('bedrooms_total = ?'); values.push(beds); }
    if (sqftMin != null) { conditions.push('living_area >= ?'); values.push(sqftMin); }
    if (sqftMax != null) { conditions.push('living_area <= ?'); values.push(sqftMax); }

    const rows = db.prepare(`
      SELECT listing_key, listing_id, unparsed_address, city, postal_code,
             subdivision_name, latitude, longitude, standard_status,
             property_type, property_sub_type,
             list_price, original_list_price, close_price, close_date,
             bedrooms_total, bathrooms_total, living_area, year_built,
             days_on_market, listing_contract_date, photos
      FROM listings
      WHERE ${conditions.join(' AND ')}
      LIMIT 500
    `).all(...values);

    const comps = rows
      .map(r => {
        const distance = milesBetween(lat, lng, r.latitude, r.longitude);
        if (distance > radius) return null;
        const sqft = r.living_area || null;
        const pricePerSqft = sqft && r.close_price ? r.close_price / sqft : null;
        const closeToList = r.list_price && r.close_price ? r.close_price / r.list_price : null;
        const originalToList = r.original_list_price && r.close_price
          ? r.close_price / r.original_list_price : null;
        return {
          listing_key: r.listing_key,
          mls_number: r.listing_id,
          address: r.unparsed_address,
          city: r.city,
          zip: r.postal_code,
          subdivision: r.subdivision_name,
          lat: r.latitude,
          lng: r.longitude,
          sub_type: r.property_sub_type,
          beds: r.bedrooms_total,
          baths: r.bathrooms_total,
          sqft,
          year_built: r.year_built,
          list_price: r.list_price,
          original_list_price: r.original_list_price,
          close_price: r.close_price,
          close_date: r.close_date,
          dom: r.days_on_market,
          price_per_sqft: pricePerSqft ? Math.round(pricePerSqft) : null,
          close_to_list_ratio: closeToList ? Number(closeToList.toFixed(3)) : null,
          original_to_close_ratio: originalToList ? Number(originalToList.toFixed(3)) : null,
          distance_mi: Number(distance.toFixed(2)),
          first_photo: expandPhotos(r)[0] || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_mi - b.distance_mi)
      .slice(0, limit);

    // Aggregates on the kept comps.
    const prices = comps.map(c => c.price_per_sqft).filter(x => x != null).sort((a, b) => a - b);
    const doms = comps.map(c => c.dom).filter(x => x != null).sort((a, b) => a - b);
    const ratios = comps.map(c => c.close_to_list_ratio).filter(x => x != null);
    const median = (xs) => xs.length ? xs[Math.floor(xs.length / 2)] : null;
    const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

    res.json({
      params: { lat, lng, radius, months, beds, sqftMin, sqftMax, propertyType },
      count: comps.length,
      summary: {
        median_price_per_sqft: median(prices),
        median_dom: median(doms),
        mean_close_to_list_ratio: mean(ratios) ? Number(mean(ratios).toFixed(3)) : null,
      },
      comps,
    });
  } catch (err) {
    console.error('[internal/comps] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/market-stats — aggregate stats ─────────────────────
 *
 * Rolls up by zip or neighborhood over a trailing window. Used for
 * dashboard-style views: "what's happening in 78703?"
 *
 * Query:
 *   zip or neighborhood (one required)
 *   months (default 6)
 *   propertyType (default 'Residential')
 */
router.get('/market-stats', (req, res) => {
  try {
    const { zip, neighborhood } = req.query;
    if (!zip && !neighborhood) {
      return res.status(400).json({ error: 'zip or neighborhood required' });
    }
    const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    const propertyType = req.query.propertyType || 'Residential';
    const closedFloor = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const scopeCol = zip ? 'postal_code' : 'subdivision_name';
    const scopeVal = zip || neighborhood;

    const closed = db.prepare(`
      SELECT list_price, close_price, close_date, days_on_market, living_area,
             bedrooms_total, bathrooms_total, year_built
      FROM listings
      WHERE ${scopeCol} = ?
        AND property_type = ?
        AND standard_status = 'Closed'
        AND close_date IS NOT NULL
        AND close_date >= ?
        AND close_price IS NOT NULL
    `).all(scopeVal, propertyType, closedFloor);

    const active = db.prepare(`
      SELECT COUNT(*) AS n,
             AVG(list_price) AS mean_price,
             AVG(days_on_market) AS mean_dom
      FROM listings
      WHERE ${scopeCol} = ?
        AND property_type = ?
        AND standard_status = 'Active'
    `).get(scopeVal, propertyType);

    const pending = db.prepare(`
      SELECT COUNT(*) AS n
      FROM listings
      WHERE ${scopeCol} = ?
        AND property_type = ?
        AND standard_status IN ('Pending', 'Active Under Contract')
    `).get(scopeVal, propertyType);

    const ppsf = closed
      .map(r => r.living_area && r.close_price ? r.close_price / r.living_area : null)
      .filter(Boolean).sort((a, b) => a - b);
    const doms = closed.map(r => r.days_on_market).filter(x => x != null).sort((a, b) => a - b);
    const ratios = closed
      .map(r => r.list_price && r.close_price ? r.close_price / r.list_price : null)
      .filter(Boolean);
    const q = (xs, p) => xs.length ? xs[Math.floor((xs.length - 1) * p)] : null;

    // Monthly closed count + median $/sqft trend for charting.
    const trend = {};
    for (const r of closed) {
      const key = (r.close_date || '').slice(0, 7); // YYYY-MM
      if (!key) continue;
      (trend[key] = trend[key] || { n: 0, ppsf: [] });
      trend[key].n++;
      if (r.living_area && r.close_price) trend[key].ppsf.push(r.close_price / r.living_area);
    }
    const monthly = Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month, closed: v.n,
        median_ppsf: v.ppsf.length ? Math.round(v.ppsf.sort((a, b) => a - b)[Math.floor(v.ppsf.length / 2)]) : null,
      }));

    res.json({
      scope: { kind: zip ? 'zip' : 'neighborhood', value: scopeVal, months, propertyType },
      closed: {
        count: closed.length,
        median_price_per_sqft: ppsf.length ? Math.round(ppsf[Math.floor(ppsf.length / 2)]) : null,
        p25_price_per_sqft: q(ppsf, 0.25),
        p75_price_per_sqft: q(ppsf, 0.75),
        median_dom: q(doms, 0.5),
        mean_close_to_list_ratio: ratios.length
          ? Number((ratios.reduce((s, x) => s + x, 0) / ratios.length).toFixed(3)) : null,
      },
      active: {
        count: active.n,
        mean_price: active.mean_price ? Math.round(active.mean_price) : null,
        mean_dom: active.mean_dom ? Math.round(active.mean_dom) : null,
      },
      pending: { count: pending.n },
      monthly,
    });
  } catch (err) {
    console.error('[internal/market-stats] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/deals/aging — Active listings sitting past typical DOM ─
 *
 * Query:
 *   minDom (default 60)         — minimum days-on-market threshold
 *   city (optional)
 *   zip (optional)
 *   propertyType (default 'Residential')
 *   limit (default 50)
 *
 * Deal angle: longer-than-typical DOM = seller is motivated. Negotiation leverage.
 */
router.get('/deals/aging', (req, res) => {
  try {
    const minDom = parseInt(req.query.minDom, 10) || 60;
    const propertyType = req.query.propertyType || 'Residential';
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const { city, zip } = req.query;

    const conditions = [
      `standard_status = 'Active'`,
      `property_type = ?`,
      `days_on_market >= ?`,
    ];
    const values = [propertyType, minDom];
    if (city) { conditions.push('city = ?'); values.push(city); }
    if (zip) { conditions.push('postal_code = ?'); values.push(zip); }

    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE ${conditions.join(' AND ')}
      ORDER BY days_on_market DESC
      LIMIT ?
    `).all(...values, limit);

    res.json({
      params: { minDom, propertyType, city, zip, limit },
      count: rows.length,
      deals: rows.map(r => ({
        ...toListing(r),
        _reason: `${r.days_on_market} days on market — ${
          r.original_list_price && r.list_price && r.list_price < r.original_list_price
            ? `reduced from $${Math.round(r.original_list_price).toLocaleString()}`
            : 'no price drops yet'
        }`,
      })),
    });
  } catch (err) {
    console.error('[internal/deals/aging] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/deals/price-drops ──────────────────────────────────
 *
 * Active listings whose current list price is strictly below their original
 * list price AND the drop happened within `sinceDays`.
 */
router.get('/deals/price-drops', (req, res) => {
  try {
    const sinceDays = parseInt(req.query.sinceDays, 10) || 30;
    const minPercent = parseFloat(req.query.minPercent) || 3;
    const propertyType = req.query.propertyType || 'Residential';
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE standard_status = 'Active'
        AND property_type = ?
        AND original_list_price IS NOT NULL
        AND list_price IS NOT NULL
        AND list_price < original_list_price
        AND price_change_timestamp IS NOT NULL
        AND price_change_timestamp >= ?
      ORDER BY price_change_timestamp DESC
      LIMIT ?
    `).all(propertyType, sinceIso, limit * 2);

    const deals = rows
      .map(r => {
        const dropPct = ((r.original_list_price - r.list_price) / r.original_list_price) * 100;
        if (dropPct < minPercent) return null;
        return {
          ...toListing(r),
          _price_drop_percent: Number(dropPct.toFixed(1)),
          _price_drop_dollars: Math.round(r.original_list_price - r.list_price),
          _reason: `Dropped ${dropPct.toFixed(1)}% ($${Math.round(r.original_list_price - r.list_price).toLocaleString()}) on ${
            (r.price_change_timestamp || '').slice(0, 10)
          }`,
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    res.json({ params: { sinceDays, minPercent, propertyType, limit }, count: deals.length, deals });
  } catch (err) {
    console.error('[internal/deals/price-drops] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/deals/under-comp ───────────────────────────────────
 *
 * Active listings priced below the median $/sqft of their nearest closed
 * comps. The strongest deal-finder — surfaces listings mispriced vs the
 * actual sold market, not what the seller wishes it was worth.
 *
 * Query:
 *   zip or neighborhood (one required — scope for the comp pool)
 *   months (default 6)
 *   delta (default 10, meaning "list PPSF must be ≥10% below median comp PPSF")
 *   propertyType (default 'Residential')
 *   limit (default 50)
 */
router.get('/deals/under-comp', (req, res) => {
  try {
    const { zip, neighborhood } = req.query;
    if (!zip && !neighborhood) {
      return res.status(400).json({ error: 'zip or neighborhood required' });
    }
    const months = Math.min(24, parseInt(req.query.months, 10) || 6);
    const delta = parseFloat(req.query.delta) || 10;
    const propertyType = req.query.propertyType || 'Residential';
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const scopeCol = zip ? 'postal_code' : 'subdivision_name';
    const scopeVal = zip || neighborhood;
    const closedFloor = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const closed = db.prepare(`
      SELECT close_price, living_area
      FROM listings
      WHERE ${scopeCol} = ? AND property_type = ?
        AND standard_status = 'Closed'
        AND close_date >= ? AND close_price IS NOT NULL
        AND living_area IS NOT NULL AND living_area > 0
    `).all(scopeVal, propertyType, closedFloor);

    const ppsf = closed.map(r => r.close_price / r.living_area).sort((a, b) => a - b);
    if (ppsf.length < 5) {
      return res.json({
        error: `Only ${ppsf.length} comps in scope — need at least 5 for a reliable median`,
        params: { zip, neighborhood, months, delta, propertyType },
        deals: [],
      });
    }
    const medianPpsf = ppsf[Math.floor(ppsf.length / 2)];
    const threshold = medianPpsf * (1 - delta / 100);

    const actives = db.prepare(`
      SELECT * FROM listings
      WHERE ${scopeCol} = ? AND property_type = ?
        AND standard_status = 'Active'
        AND list_price IS NOT NULL
        AND living_area IS NOT NULL AND living_area > 0
    `).all(scopeVal, propertyType);

    const deals = actives
      .map(r => {
        const listPpsf = r.list_price / r.living_area;
        if (listPpsf >= threshold) return null;
        const belowPct = ((medianPpsf - listPpsf) / medianPpsf) * 100;
        return {
          ...toListing(r),
          _list_ppsf: Math.round(listPpsf),
          _comp_median_ppsf: Math.round(medianPpsf),
          _below_median_percent: Number(belowPct.toFixed(1)),
          _reason: `List PPSF $${Math.round(listPpsf)} is ${belowPct.toFixed(1)}% below neighborhood median $${Math.round(medianPpsf)} across ${closed.length} recent comps`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b._below_median_percent - a._below_median_percent)
      .slice(0, limit);

    res.json({
      params: { zip, neighborhood, months, delta, propertyType, limit },
      comp_pool_size: closed.length,
      median_ppsf: Math.round(medianPpsf),
      count: deals.length,
      deals,
    });
  } catch (err) {
    console.error('[internal/deals/under-comp] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/deals/relisted ─────────────────────────────────────
 *
 * Listings whose listing_contract_date is recent but original_list_price is
 * significantly older than listing_contract_date would suggest — proxy for
 * "withdrawn/expired and relisted fresh to reset DOM." These sellers tend
 * to be the most negotiable since they just failed to sell once.
 *
 * ACTRIS doesn't ship a clean "relisted from X" flag, so we approximate:
 * contract_date within last `sinceDays`, days_on_market < 14 (fresh listing),
 * BUT the property's price_change_timestamp is NULL (no changes yet — hallmark
 * of a reset listing).
 */
router.get('/deals/relisted', (req, res) => {
  try {
    const sinceDays = parseInt(req.query.sinceDays, 10) || 30;
    const propertyType = req.query.propertyType || 'Residential';
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE standard_status = 'Active'
        AND property_type = ?
        AND listing_contract_date >= ?
        AND days_on_market < 14
      ORDER BY listing_contract_date DESC
      LIMIT ?
    `).all(propertyType, sinceIso, limit);

    res.json({
      params: { sinceDays, propertyType, limit },
      count: rows.length,
      // Note: without a canonical "relisted" MLS flag this is approximate; UI should
      // frame these as "freshly listed, worth checking history".
      deals: rows.map(r => ({
        ...toListing(r),
        _reason: `Freshly listed ${r.listing_contract_date}, no edits yet — worth checking prior history`,
      })),
    });
  } catch (err) {
    console.error('[internal/deals/relisted] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/match-brief ────────────────────────────────────────
 *
 * Match active listings against a buyer brief. Powers Realtor-OS's
 * "deals for Amit"-style per-contact feeds.
 *
 * Body: { minPrice, maxPrice, minBeds, maxBeds, minBaths, minSqft, maxSqft,
 *         zips: [], cities: [], neighborhoods: [], propertyType, musts: [] }
 * Returns up to 200 matching active listings, ranked by freshness.
 */
router.post('/match-brief', express.json(), (req, res) => {
  try {
    const b = req.body || {};
    const conditions = [`standard_status = 'Active'`, `list_price IS NOT NULL`];
    const values = [];
    if (b.propertyType) {
      conditions.push('property_type = ?');
      values.push(b.propertyType);
    } else {
      conditions.push(`property_type != 'Residential Lease'`); // sales by default
    }
    if (b.minPrice) { conditions.push('list_price >= ?'); values.push(b.minPrice); }
    if (b.maxPrice) { conditions.push('list_price <= ?'); values.push(b.maxPrice); }
    if (b.minBeds) { conditions.push('bedrooms_total >= ?'); values.push(b.minBeds); }
    if (b.maxBeds) { conditions.push('bedrooms_total <= ?'); values.push(b.maxBeds); }
    if (b.minBaths) { conditions.push('bathrooms_total >= ?'); values.push(b.minBaths); }
    if (b.minSqft) { conditions.push('living_area >= ?'); values.push(b.minSqft); }
    if (b.maxSqft) { conditions.push('living_area <= ?'); values.push(b.maxSqft); }
    if (Array.isArray(b.zips) && b.zips.length) {
      conditions.push(`postal_code IN (${b.zips.map(() => '?').join(',')})`);
      values.push(...b.zips);
    }
    if (Array.isArray(b.cities) && b.cities.length) {
      conditions.push(`city IN (${b.cities.map(() => '?').join(',')})`);
      values.push(...b.cities);
    }
    if (Array.isArray(b.neighborhoods) && b.neighborhoods.length) {
      conditions.push(`subdivision_name IN (${b.neighborhoods.map(() => '?').join(',')})`);
      values.push(...b.neighborhoods);
    }
    // 'musts' = required substrings in public_remarks (AND semantics). E.g., ["pool", "office"]
    if (Array.isArray(b.musts)) {
      for (const must of b.musts) {
        if (!must) continue;
        conditions.push(`LOWER(public_remarks) LIKE ?`);
        values.push(`%${String(must).toLowerCase()}%`);
      }
    }

    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN listing_contract_date IS NULL THEN 1 ELSE 0 END,
        listing_contract_date DESC
      LIMIT 200
    `).all(...values);

    res.json({ count: rows.length, matches: rows.map(toListing) });
  } catch (err) {
    console.error('[internal/match-brief] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/listing/:key — raw listing with photos, invisible OK ─ */
router.get('/listing/:key', (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM listings WHERE listing_key = ? LIMIT 1`).get(req.params.key);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(toListing(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── /api/internal/health — simple health + coverage check ────────────── */
router.get('/health', (_req, res) => {
  const total = db.prepare(`SELECT COUNT(*) AS n FROM listings`).get().n;
  const active = db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE standard_status = 'Active'`).get().n;
  const invisibleActive = db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE standard_status = 'Active' AND mlg_can_view = 0`).get().n;
  const closed = db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE standard_status = 'Closed'`).get().n;
  const closedLast180 = db.prepare(`
    SELECT COUNT(*) AS n FROM listings
    WHERE standard_status = 'Closed'
      AND close_date >= date('now', '-180 days')
  `).get().n;
  res.json({ total, active, invisibleActive, closed, closedLast180 });
});

module.exports = router;
