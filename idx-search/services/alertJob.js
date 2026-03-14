const db = require('../db/database');
const { sendNewListingsAlert } = require('./mailer');

function buildFilterConditions(filters) {
  const conditions = ['mlg_can_view = 1', "standard_status = 'Active'"];
  const values = [];

  const {
    forRent, minPrice, maxPrice, minBeds, minBaths,
    minSqft, maxSqft, minYear, maxYear,
    city, zip, neighborhood, schoolDistrict, keyword,
    pool, waterfront, newConstruction, propertyType, subType
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

async function runAlertJob() {
  if (!process.env.EMAIL_HOST) return; // Email not configured, skip

  const searches = db.prepare(`
    SELECT ss.id, ss.name, ss.filters, ss.last_alerted_at,
           u.email, u.full_name
    FROM saved_searches ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.alert_enabled = 1 AND u.email IS NOT NULL
  `).all();

  if (!searches.length) return;

  for (const search of searches) {
    try {
      const filters = JSON.parse(search.filters);
      const { conditions, values } = buildFilterConditions(filters);

      // Only listings newer than last alert (or last 24h if never alerted)
      const since = search.last_alerted_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      conditions.push(`listing_contract_date >= ?`);
      values.push(since.slice(0, 10)); // date portion only

      const where = conditions.join(' AND ');
      const listings = db.prepare(`
        SELECT listing_key, list_price, unparsed_address, city,
               bedrooms_total, bathrooms_total, living_area, photos
        FROM listings WHERE ${where}
        ORDER BY listing_contract_date DESC LIMIT 50
      `).all(values);

      if (!listings.length) continue;

      await sendNewListingsAlert({
        to: search.email,
        searchName: search.name,
        filters,
        listings
      });

      db.prepare(`UPDATE saved_searches SET last_alerted_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), search.id);

      console.log(`[ALERTS] Sent ${listings.length} new listing(s) to ${search.email} for "${search.name}"`);
    } catch (err) {
      console.error(`[ALERTS] Failed for search ${search.id}:`, err.message);
    }
  }
}

module.exports = { runAlertJob };
