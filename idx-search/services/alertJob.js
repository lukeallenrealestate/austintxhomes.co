const db = require('../db/database');
const { sendNewListingsAlert, sendSavedSearchWelcome, sendFavoritePriceDropAlert } = require('./mailer');

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

  // Admin-created searches carry created_by_user_id on the saved_search
  // row. We join to that admin's user row to pick up the BCC address so
  // Luke sees every alert his clients get. For public-signup searches
  // created_by_user_id is NULL and admin_email comes back NULL -> no BCC.
  // Pending clients (status='pending') don't get alerts yet — they
  // haven't activated their email as a legit recipient.
  const searches = db.prepare(`
    SELECT ss.id, ss.name, ss.filters, ss.last_alerted_at,
           ss.created_by_user_id,
           u.email, u.name AS full_name, u.status,
           admin.email AS admin_email
    FROM saved_searches ss
    JOIN users u ON u.id = ss.user_id
    LEFT JOIN users admin ON admin.id = ss.created_by_user_id AND admin.role = 'admin'
    WHERE ss.alert_enabled = 1
      AND u.email IS NOT NULL
      AND u.status = 'active'
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
        bcc: search.admin_email || null,
        searchName: search.name,
        filters,
        listings: emailListings,
        savedSearchId: search.id,
        clientName: search.full_name
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
      const bccNote = search.admin_email ? ` [bcc:${search.admin_email}]` : '';
      console.log(`[ALERTS] Sent ${emailListings.length} to ${search.email}${bccNote} for "${search.name}" (${newCount} new, ${dropCount} price drops)`);
    } catch (err) {
      console.error(`[ALERTS] Failed for search ${search.id}:`, err.message);
    }
  }
}

// ─── Bootstrap: mark current pool as "already seen" + send welcome ────
// Call this when a new saved_search row is created so the first run of
// runAlertJob doesn't blast an "N new listings" email for homes the
// user could already see on the search results page. We write the
// entire current matching pool into saved_search_sent with reason
// 'bootstrap', so dedup takes over immediately and only truly-new MLS
// arrivals or price drops will trigger emails afterward.
//
// Also sends ONE "your saved search is live" welcome email with the
// match count as the headline, so users know the system is working.
async function bootstrapSavedSearch({ savedSearchId, alertEnabled }) {
  const row = db.prepare(`
    SELECT ss.id, ss.name, ss.filters, ss.created_by_user_id,
           u.id AS user_id, u.email, u.name AS full_name, u.status
    FROM saved_searches ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.id = ?
  `).get(savedSearchId);
  if (!row) return;
  let filters;
  try { filters = JSON.parse(row.filters); } catch { filters = {}; }

  const { conditions, values } = buildFilterConditions(filters);
  const where = conditions.join(' AND ');
  let candidates = db.prepare(`
    SELECT listing_key, list_price, latitude, longitude
    FROM listings WHERE ${where} LIMIT 2000
  `).all(values);

  if (filters.polygon) {
    try {
      const poly = typeof filters.polygon === 'string' ? JSON.parse(filters.polygon) : filters.polygon;
      if (Array.isArray(poly) && poly.length > 2) {
        candidates = candidates.filter(l => l.latitude && l.longitude && pointInPolygon(l.latitude, l.longitude, poly));
      }
    } catch {}
  }

  // Record every current match so the hourly job treats them as
  // "already notified" - no retro spam.
  const now = new Date().toISOString();
  const tx = db.transaction((items) => {
    for (const l of items) recordSent.run(savedSearchId, l.listing_key, l.list_price, 'bootstrap', now);
  });
  tx(candidates);

  // Send the welcome email so the user knows the search is live and
  // what the current pool size is. Only for active (non-pending)
  // accounts with email configured and alerts enabled.
  if (!process.env.EMAIL_HOST) return;
  if (row.status !== 'active') return;
  if (!alertEnabled) return;

  try {
    await sendSavedSearchWelcome({
      to: row.email,
      clientName: row.full_name,
      searchName: row.name,
      filters,
      savedSearchId: row.id,
      matchCount: candidates.length,
      inviterName: null
    });
    db.prepare(`UPDATE saved_searches SET last_alerted_at = ? WHERE id = ?`).run(now, row.id);
    console.log(`[SAVED-SEARCH] welcome sent to ${row.email} for "${row.name}" (${candidates.length} initial matches marked as seen)`);
  } catch (err) {
    console.warn(`[SAVED-SEARCH] welcome email failed for ${row.email}:`, err.message);
  }
}

// ─── Favorite price-drop job ──────────────────────────────────────
// Scans every user's favorites, compares current list_price against
// what we last alerted them about (favorite_price_sent.last_price_alerted
// seeded when they hearted the home), emails one summary per user
// covering all drops. Only runs for active accounts with a configured
// mailer. Idempotent: after emailing we update last_price_alerted so
// repeat scans against the same price are no-ops, and small tick-ups
// aren't re-emailed.
async function runFavoritePriceDropJob() {
  if (!process.env.EMAIL_HOST) return;

  // One row per (user, favorited listing) where the live price is
  // strictly lower than the last price we told them about.
  const drops = db.prepare(`
    SELECT f.user_id, u.email, u.name AS full_name,
           l.listing_key, l.list_price, l.unparsed_address, l.city,
           l.photos, l.standard_status,
           fps.last_price_alerted AS prior_price
    FROM favorites f
    JOIN users u ON u.id = f.user_id AND u.status = 'active'
    JOIN listings l ON l.listing_key = f.listing_key
      AND l.mlg_can_view = 1
      AND l.standard_status = 'Active'
    JOIN favorite_price_sent fps
      ON fps.user_id = f.user_id AND fps.listing_key = f.listing_key
    WHERE l.list_price IS NOT NULL
      AND fps.last_price_alerted IS NOT NULL
      AND l.list_price < fps.last_price_alerted
  `).all();

  if (!drops.length) return;

  const byUser = new Map();
  for (const d of drops) {
    if (!byUser.has(d.user_id)) byUser.set(d.user_id, { email: d.email, name: d.full_name, items: [] });
    byUser.get(d.user_id).items.push(d);
  }

  const now = new Date().toISOString();
  const updateSent = db.prepare(`
    UPDATE favorite_price_sent SET last_price_alerted = ?, sent_at = ?
    WHERE user_id = ? AND listing_key = ?
  `);

  for (const [userId, payload] of byUser.entries()) {
    try {
      await sendFavoritePriceDropAlert({
        to: payload.email,
        clientName: payload.name,
        listings: payload.items.map(i => ({
          listing_key: i.listing_key,
          list_price: i.list_price,
          prior_price: i.prior_price,
          unparsed_address: i.unparsed_address,
          city: i.city,
          photos: i.photos
        }))
      });
      const tx = db.transaction((items) => {
        for (const it of items) updateSent.run(it.list_price, now, userId, it.listing_key);
      });
      tx(payload.items);
      console.log(`[FAV-PRICE] Sent ${payload.items.length} price drop alert${payload.items.length === 1 ? '' : 's'} to ${payload.email}`);
    } catch (err) {
      console.warn(`[FAV-PRICE] failed for ${payload.email}:`, err.message);
    }
  }
}

module.exports = { runAlertJob, runFavoritePriceDropJob, bootstrapSavedSearch, buildFilterConditions, pointInPolygon };
