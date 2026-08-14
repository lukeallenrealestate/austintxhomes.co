const db = require('../db/database');
const { sendNewListingsAlert } = require('./mailer');

// Point-in-polygon (ray casting) — same algo as properties.js
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function buildFilterConditions(filters) {
  const conditions = ['mlg_can_view = 1', "standard_status = 'Active'",
    'latitude IS NOT NULL', 'longitude IS NOT NULL'];
  const values = [];

  const {
    forRent, minPrice, maxPrice, minBeds, minBaths,
    minSqft, maxSqft, minYear, maxYear,
    city, zip, neighborhood, schoolDistrict, keyword,
    pool, waterfront, newConstruction, propertyType, subType,
    north, south, east, west
  } = filters;

  if (forRent === 'true') {
    conditions.push(`(property_type LIKE '%Lease%' OR property_type LIKE '%Rental%')`);
  } else if (forRent === 'false') {
    conditions.push(`property_type NOT LIKE '%Lease%'`);
  }

  if (propertyType) { conditions.push('property_type = ?'); values.push(propertyType); }
  if (subType) {
    const types = subType.split(',').map(s => s.trim());
    conditions.push(`property_sub_type IN (${types.map(() => '?').join(',')})`);
    values.push(...types);
  }

  if (minPrice) { conditions.push('list_price >= ?'); values.push(Number(minPrice)); }
  if (maxPrice) { conditions.push('list_price <= ?'); values.push(Number(maxPrice)); }
  if (minBeds)  { conditions.push('bedrooms_total >= ?'); values.push(Number(minBeds)); }
  if (minBaths) { conditions.push('bathrooms_total >= ?'); values.push(Number(minBaths)); }
  if (minSqft)  { conditions.push('living_area >= ?'); values.push(Number(minSqft)); }
  if (maxSqft)  { conditions.push('living_area <= ?'); values.push(Number(maxSqft)); }
  if (minYear)  { conditions.push('year_built >= ?'); values.push(Number(minYear)); }
  if (maxYear)  { conditions.push('year_built <= ?'); values.push(Number(maxYear)); }

  // Bounding box (from map view saved searches)
  if (north && south && east && west) {
    conditions.push('latitude <= ? AND latitude >= ? AND longitude <= ? AND longitude >= ?');
    values.push(Number(north), Number(south), Number(east), Number(west));
  }

  if (city) {
    const cities = city.split(',').map(s => s.trim());
    conditions.push(`city IN (${cities.map(() => '?').join(',')})`);
    values.push(...cities);
  }
  if (zip) {
    const zips = zip.split(',').map(s => s.trim());
    conditions.push(`postal_code IN (${zips.map(() => '?').join(',')})`);
    values.push(...zips);
  }
  if (neighborhood) { conditions.push('subdivision_name LIKE ?'); values.push(`%${neighborhood}%`); }
  if (schoolDistrict) { conditions.push('school_district LIKE ?'); values.push(`%${schoolDistrict}%`); }
  if (keyword) {
    conditions.push(`(unparsed_address LIKE ? OR city LIKE ? OR postal_code LIKE ? OR subdivision_name LIKE ? OR school_district LIKE ?)`);
    const kw = `%${keyword}%`;
    values.push(kw, kw, kw, kw, kw);
  }
  if (pool === 'true') { conditions.push(`pool_features IS NOT NULL AND pool_features != ''`); }
  if (waterfront === 'true') { conditions.push(`waterfront_yn = 1`); }
  if (newConstruction === 'true') { conditions.push(`new_construction_yn = 1`); }

  return { conditions, values };
}

// Per-(search, listing) dedup lookup + record. Kept small so it fits in
// one prepared-statement round-trip per search.
const getSentForSearch = db.prepare(
  `SELECT listing_key, last_price_sent FROM saved_search_sent WHERE saved_search_id = ?`
);
const recordSent = db.prepare(
  `INSERT INTO saved_search_sent (saved_search_id, listing_key, last_price_sent, reason, sent_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(saved_search_id, listing_key) DO UPDATE SET
     last_price_sent = excluded.last_price_sent,
     reason = excluded.reason,
     sent_at = excluded.sent_at`
);

async function runAlertJob() {
  if (!process.env.EMAIL_HOST) return; // Email not configured, skip

  const searches = db.prepare(`
    SELECT ss.id, ss.name, ss.filters, ss.last_alerted_at,
           u.email, u.name AS full_name
    FROM saved_searches ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.alert_enabled = 1 AND u.email IS NOT NULL
  `).all();

  if (!searches.length) return;

  for (const search of searches) {
    try {
      const filters = JSON.parse(search.filters);
      const { conditions, values } = buildFilterConditions(filters);

      // No modification_timestamp gate anymore - dedup happens per
      // listing via saved_search_sent below. This is what lets us catch
      // price drops: a listing that already alerted might still qualify
      // for a fresh notification if its list_price has since dropped.
      const where = conditions.join(' AND ');
      let candidates = db.prepare(`
        SELECT listing_key, list_price, unparsed_address, city,
               bedrooms_total, bathrooms_total, living_area, photos,
               latitude, longitude, modification_timestamp
        FROM listings WHERE ${where}
        ORDER BY modification_timestamp DESC LIMIT 500
      `).all(values);

      if (filters.polygon) {
        try {
          const poly = typeof filters.polygon === 'string' ? JSON.parse(filters.polygon) : filters.polygon;
          if (Array.isArray(poly) && poly.length > 2) {
            candidates = candidates.filter(l => l.latitude && l.longitude && pointInPolygon(l.latitude, l.longitude, poly));
          }
        } catch {}
      }

      if (!candidates.length) continue;

      // Load per-listing send history for THIS saved search. Map keys to
      // last_price_sent so we can detect price drops in O(1) per candidate.
      const sentRows = getSentForSearch.all(search.id);
      const sentMap = new Map(sentRows.map(r => [r.listing_key, r.last_price_sent]));

      const toNotify = [];
      for (const l of candidates) {
        const priorPrice = sentMap.get(l.listing_key);
        if (priorPrice === undefined) {
          // Never sent for this search - fresh match
          toNotify.push({ ...l, reason: 'new' });
        } else if (l.list_price != null && priorPrice != null && l.list_price < priorPrice) {
          // Previously sent, but the price has since dropped - re-notify
          // with a price-drop label so the email template can call it out.
          toNotify.push({ ...l, reason: 'price_drop', prior_price: priorPrice });
        }
        // Otherwise skip: already sent and price hasn't dropped.
      }

      if (!toNotify.length) continue;

      // Cap at 50 for the email
      const emailListings = toNotify.slice(0, 50);

      await sendNewListingsAlert({
        to: search.email,
        searchName: search.name,
        filters,
        listings: emailListings
      });

      // Record every listing we sent so we don't re-send unless its price
      // drops. Uses a single transaction for atomicity across N inserts.
      const now = new Date().toISOString();
      const tx = db.transaction((items) => {
        for (const l of items) recordSent.run(search.id, l.listing_key, l.list_price, l.reason, now);
      });
      tx(emailListings);

      // Keep last_alerted_at on the saved_searches row for account-page display,
      // even though it no longer drives dedup logic.
      db.prepare(`UPDATE saved_searches SET last_alerted_at = ? WHERE id = ?`).run(now, search.id);

      const newCount = emailListings.filter(l => l.reason === 'new').length;
      const dropCount = emailListings.filter(l => l.reason === 'price_drop').length;
      console.log(`[ALERTS] Sent ${emailListings.length} to ${search.email} for "${search.name}" (${newCount} new, ${dropCount} price drops)`);
    } catch (err) {
      console.error(`[ALERTS] Failed for search ${search.id}:`, err.message);
    }
  }
}

module.exports = { runAlertJob };
