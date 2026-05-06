require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fetch = require('node-fetch');
const db = require('../db/database');
const fs = require('fs');
const path = require('path');

const PHOTO_CACHE_DIR = path.join(__dirname, '../cache/photos');

const BASE_URL = 'https://api.mlsgrid.com/v2';
const SYSTEM = process.env.MLSGRID_ORIGINATING_SYSTEM || 'actris';
const TOKEN = process.env.MLSGRID_ACCESS_TOKEN;

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Accept-Encoding': 'gzip'
};

// Fields to select from MLS GRID (reduces payload)
const SELECT_FIELDS = [
  'ListingKey', 'ListingId', 'StandardStatus', 'PropertyType', 'PropertySubType',
  'ListPrice', 'BedroomsTotal', 'BathroomsTotalInteger', 'BathroomsFull', 'BathroomsHalf',
  'LivingArea', 'LotSizeAcres', 'LotSizeSquareFeet', 'YearBuilt', 'GarageSpaces',
  'UnparsedAddress', 'StreetNumber', 'StreetName', 'UnitNumber',
  'City', 'StateOrProvince', 'PostalCode', 'CountyOrParish',
  'SubdivisionName', 'Latitude', 'Longitude',
  'PublicRemarks', 'ListAgentFullName', 'ListAgentDirectPhone', 'ListAgentEmail',
  'ListOfficeName', 'ElementarySchool', 'MiddleOrJuniorSchool', 'HighSchool',
  'DaysOnMarket', 'ListingContractDate', 'CloseDate', 'ClosePrice',
  'ModificationTimestamp', 'PhotosChangeTimestamp', 'MlgCanView', 'MlgCanUse',
  'PoolFeatures', 'WaterfrontYN', 'NewConstructionYN', 'StoriesTotal',
  'ParkingTotal', 'AssociationFee', 'AssociationFeeFrequency', 'TaxAnnualAmount'
].join(',');

// Upsert preserves photos_r2 (Cloudflare R2 mirror URLs) across syncs.
// INSERT OR REPLACE would wipe photos_r2 to NULL every cycle, defeating the
// CDN cache and causing the persistent "No Photo" cards on /search.
// photos_r2 is only cleared when MLS reports a newer photos_change_timestamp,
// signaling that the cached R2 mirrors are stale and must re-mirror.
const upsertListing = db.prepare(`
  INSERT INTO listings (
    listing_key, listing_id, standard_status, property_type, property_sub_type,
    list_price, bedrooms_total, bathrooms_total, bathrooms_full, bathrooms_half,
    living_area, lot_size_acres, lot_size_sqft, year_built, garage_spaces,
    unparsed_address, street_number, street_name, unit_number,
    city, state_or_province, postal_code, county, subdivision_name,
    latitude, longitude, public_remarks,
    list_agent_full_name, list_agent_direct_phone, list_agent_email, list_office_name,
    elementary_school, middle_school, high_school, school_district,
    days_on_market, listing_contract_date, close_date, close_price,
    modification_timestamp, photos_change_timestamp, mlg_can_view,
    photos, pool_features, waterfront_yn, new_construction_yn,
    stories, parking_total, association_fee, association_fee_frequency,
    tax_annual_amount, raw_data, synced_at
  ) VALUES (
    @listing_key, @listing_id, @standard_status, @property_type, @property_sub_type,
    @list_price, @bedrooms_total, @bathrooms_total, @bathrooms_full, @bathrooms_half,
    @living_area, @lot_size_acres, @lot_size_sqft, @year_built, @garage_spaces,
    @unparsed_address, @street_number, @street_name, @unit_number,
    @city, @state_or_province, @postal_code, @county, @subdivision_name,
    @latitude, @longitude, @public_remarks,
    @list_agent_full_name, @list_agent_direct_phone, @list_agent_email, @list_office_name,
    @elementary_school, @middle_school, @high_school, @school_district,
    @days_on_market, @listing_contract_date, @close_date, @close_price,
    @modification_timestamp, @photos_change_timestamp, @mlg_can_view,
    @photos, @pool_features, @waterfront_yn, @new_construction_yn,
    @stories, @parking_total, @association_fee, @association_fee_frequency,
    @tax_annual_amount, @raw_data, CURRENT_TIMESTAMP
  )
  ON CONFLICT(listing_key) DO UPDATE SET
    listing_id = excluded.listing_id,
    standard_status = excluded.standard_status,
    property_type = excluded.property_type,
    property_sub_type = excluded.property_sub_type,
    list_price = excluded.list_price,
    bedrooms_total = excluded.bedrooms_total,
    bathrooms_total = excluded.bathrooms_total,
    bathrooms_full = excluded.bathrooms_full,
    bathrooms_half = excluded.bathrooms_half,
    living_area = excluded.living_area,
    lot_size_acres = excluded.lot_size_acres,
    lot_size_sqft = excluded.lot_size_sqft,
    year_built = excluded.year_built,
    garage_spaces = excluded.garage_spaces,
    unparsed_address = excluded.unparsed_address,
    street_number = excluded.street_number,
    street_name = excluded.street_name,
    unit_number = excluded.unit_number,
    city = excluded.city,
    state_or_province = excluded.state_or_province,
    postal_code = excluded.postal_code,
    county = excluded.county,
    subdivision_name = excluded.subdivision_name,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    public_remarks = excluded.public_remarks,
    list_agent_full_name = excluded.list_agent_full_name,
    list_agent_direct_phone = excluded.list_agent_direct_phone,
    list_agent_email = excluded.list_agent_email,
    list_office_name = excluded.list_office_name,
    elementary_school = excluded.elementary_school,
    middle_school = excluded.middle_school,
    high_school = excluded.high_school,
    school_district = excluded.school_district,
    days_on_market = excluded.days_on_market,
    listing_contract_date = excluded.listing_contract_date,
    close_date = excluded.close_date,
    close_price = excluded.close_price,
    modification_timestamp = excluded.modification_timestamp,
    mlg_can_view = excluded.mlg_can_view,
    photos = excluded.photos,
    pool_features = excluded.pool_features,
    waterfront_yn = excluded.waterfront_yn,
    new_construction_yn = excluded.new_construction_yn,
    stories = excluded.stories,
    parking_total = excluded.parking_total,
    association_fee = excluded.association_fee,
    association_fee_frequency = excluded.association_fee_frequency,
    tax_annual_amount = excluded.tax_annual_amount,
    raw_data = excluded.raw_data,
    photos_r2 = CASE
      WHEN excluded.photos_change_timestamp IS NOT NULL
       AND listings.photos_change_timestamp IS NOT NULL
       AND excluded.photos_change_timestamp > listings.photos_change_timestamp
        THEN NULL
      ELSE listings.photos_r2
    END,
    photos_change_timestamp = excluded.photos_change_timestamp,
    synced_at = CURRENT_TIMESTAMP
`);

const deleteListing = db.prepare(`DELETE FROM listings WHERE listing_key = ?`);
const updateSyncState = db.prepare(`
  UPDATE sync_state SET last_sync_timestamp = ?, last_sync_at = CURRENT_TIMESTAMP,
  total_synced = total_synced + ? WHERE id = 1
`);

function mapListing(p) {
  const photos = (p.Media || [])
    .filter(m => m.MediaCategory === 'Photo' || !m.MediaCategory)
    .sort((a, b) => {
      if (a.PreferredPhotoYN && !b.PreferredPhotoYN) return -1;
      if (!a.PreferredPhotoYN && b.PreferredPhotoYN) return 1;
      return (a.Order || 0) - (b.Order || 0);
    })
    .map(m => m.MediaURL)
    .filter(Boolean);

  return {
    listing_key: p.ListingKey,
    listing_id: p.ListingId || null,
    standard_status: p.StandardStatus || null,
    property_type: p.PropertyType || null,
    property_sub_type: Array.isArray(p.PropertySubType) ? p.PropertySubType[0] : (p.PropertySubType || null),
    list_price: p.ListPrice || null,
    bedrooms_total: p.BedroomsTotal || null,
    bathrooms_total: p.BathroomsTotalInteger || null,
    bathrooms_full: p.BathroomsFull || null,
    bathrooms_half: p.BathroomsHalf || null,
    living_area: p.LivingArea || null,
    lot_size_acres: p.LotSizeAcres || null,
    lot_size_sqft: p.LotSizeSquareFeet || null,
    year_built: p.YearBuilt || null,
    garage_spaces: p.GarageSpaces || null,
    unparsed_address: p.UnparsedAddress || null,
    street_number: p.StreetNumber || null,
    street_name: p.StreetName || null,
    unit_number: p.UnitNumber || null,
    city: p.City || null,
    state_or_province: p.StateOrProvince || null,
    postal_code: p.PostalCode || null,
    county: p.CountyOrParish || null,
    subdivision_name: p.SubdivisionName || null,
    latitude: p.Latitude || null,
    longitude: p.Longitude || null,
    public_remarks: p.PublicRemarks || null,
    list_agent_full_name: p.ListAgentFullName || null,
    list_agent_direct_phone: p.ListAgentDirectPhone || null,
    list_agent_email: p.ListAgentEmail || null,
    list_office_name: p.ListOfficeName || null,
    elementary_school: p.ElementarySchool || null,
    middle_school: p.MiddleOrJuniorSchool || null,
    high_school: p.HighSchool || null,
    school_district: p.SchoolDistrict || null,
    days_on_market: p.DaysOnMarket || null,
    listing_contract_date: p.ListingContractDate || null,
    // MLS GRID / ACTRIS doesn't expose ClosePrice/CloseDate on the IDX feed.
    // Fall back to MajorChangeTimestamp (when status flipped to Closed) and last list price.
    close_date: p.CloseDate
      || (p.StandardStatus === 'Closed' ? (p.MajorChangeTimestamp || p.ACT_LastChangeTimestamp || null) : null),
    close_price: p.ClosePrice
      || (p.StandardStatus === 'Closed' ? (p.ListPrice || p.OriginalListPrice || null) : null),
    modification_timestamp: p.ModificationTimestamp || null,
    photos_change_timestamp: p.PhotosChangeTimestamp || null,
    mlg_can_view: p.MlgCanView ? 1 : 0,
    photos: JSON.stringify(photos),
    pool_features: Array.isArray(p.PoolFeatures) ? p.PoolFeatures.join(', ') : (p.PoolFeatures || null),
    waterfront_yn: p.WaterfrontYN ? 1 : 0,
    new_construction_yn: p.NewConstructionYN ? 1 : 0,
    stories: p.StoriesTotal || null,
    parking_total: p.ParkingTotal || null,
    association_fee: p.AssociationFee || null,
    association_fee_frequency: p.AssociationFeeFrequency || null,
    tax_annual_amount: p.TaxAnnualAmount || null,
    raw_data: JSON.stringify(p)
  };
}

// Always upsert — never delete. Listings that flap to MlgCanView=false get
// kept in the table with mlg_can_view=0, so their cached photos_r2 (and any
// other downstream-derived state) survives the flap. Search queries already
// filter mlg_can_view=1, so hidden listings remain invisible to users. The
// previous DELETE path lost photos_r2 every time MLS briefly reported a
// listing as not-viewable (during agent edits, status flux, etc.) — the
// next sync would re-INSERT the row fresh with photos_r2=NULL.
const batchUpsert = db.transaction((listings) => {
  let visible = 0;
  let hidden = 0;
  for (const listing of listings) {
    upsertListing.run(listing);
    if (listing.mlg_can_view) visible++;
    else hidden++;
  }
  return { visible, hidden };
});

// For closed lease comps — always insert regardless of mlg_can_view (they're comps, not display listings)
const batchUpsertLeaseComps = db.transaction((listings) => {
  let count = 0;
  for (const listing of listings) {
    listing.mlg_can_view = 0; // don't show in search results
    upsertListing.run(listing);
    count++;
  }
  return count;
});

// Shared MLS rate limiter — coordinates with photoBackfill so we never exceed 1.6 RPS combined
const { throttle, recordRateLimit } = require('./throttle');

async function fetchPage(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    await throttle();

    try {
      const res = await fetch(url, { headers: HEADERS });

      if (res.status === 429) {
        // Rate limited — record for shared backoff (so backfill pauses too) + exponential backoff
        recordRateLimit();
        const backoffMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        console.warn(`[API] Rate limited (429). Backing off ${backoffMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MLS GRID API error ${res.status}: ${text}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      console.warn(`[API] Fetch failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`MLS GRID API rate-limited after ${retries} attempts`);
}

async function syncListings(isInitial = false) {
  if (!TOKEN) {
    console.warn('[SYNC] No MLSGRID_ACCESS_TOKEN set — skipping sync');
    return;
  }

  const syncState = db.prepare('SELECT * FROM sync_state WHERE id = 1').get();
  const lastTimestamp = syncState?.last_sync_timestamp;

  // Track which listings are truly NEW (not in DB before this sync) for Google Indexing
  const existingKeys = new Set();
  if (!isInitial && lastTimestamp) {
    // Only track for incremental syncs (initial import would be thousands of URLs)
    try {
      const rows = db.prepare('SELECT listing_key FROM listings WHERE mlg_can_view = 1').all();
      rows.forEach(r => existingKeys.add(r.listing_key));
    } catch {}
  }
  const newListings = [];

  let filterParts = [`OriginatingSystemName eq '${SYSTEM}'`];

  if (isInitial || !lastTimestamp) {
    console.log('[SYNC] Starting initial import...');
    filterParts.push('MlgCanView eq true');
  } else {
    console.log(`[SYNC] Incremental sync since ${lastTimestamp}`);
    filterParts.push(`ModificationTimestamp gt ${lastTimestamp}`);
  }

  const filter = encodeURIComponent(filterParts.join(' and '));
  let url = `${BASE_URL}/Property?$filter=${filter}&$expand=Media&$top=1000`;

  let totalSynced = 0;
  let totalHidden = 0;
  let latestTimestamp = lastTimestamp;
  let pageCount = 0;

  while (url) {
    try {
      pageCount++;
      console.log(`[SYNC] Fetching page ${pageCount}...`);
      const data = await fetchPage(url);
      const records = data.value || [];

      if (records.length === 0) break;

      const mapped = records.map(mapListing);

      // Detect new listings before upserting
      if (existingKeys.size > 0) {
        for (const m of mapped) {
          if (m.mlg_can_view && m.standard_status === 'Active' && !existingKeys.has(m.listing_key)) {
            newListings.push(m);
          }
        }
      }

      const { visible, hidden } = batchUpsert(mapped);
      totalSynced += visible;
      totalHidden += hidden;

      for (const r of records) {
        if (r.ModificationTimestamp) {
          if (!latestTimestamp || r.ModificationTimestamp > latestTimestamp) {
            latestTimestamp = r.ModificationTimestamp;
          }
        }
      }

      url = data['@odata.nextLink'] || null;

    } catch (err) {
      console.error(`[SYNC] Error on page ${pageCount}:`, err.message);
      break;
    }
  }

  if (latestTimestamp) {
    updateSyncState.run(latestTimestamp, totalSynced);
  }

  const missingR2 = db.prepare(`
    SELECT COUNT(*) AS n FROM listings
    WHERE mlg_can_view = 1
      AND (photos_r2 IS NULL OR photos_r2 = '[]')
      AND photos IS NOT NULL AND photos != '[]'
  `).get();
  const hiddenSuffix = totalHidden > 0 ? ` (${totalHidden} kept hidden — flapped MlgCanView=false)` : '';
  console.log(`[SYNC] Done. Synced ${totalSynced} listings (${pageCount} pages)${hiddenSuffix}. Listings still missing R2 mirrors: ${missingR2.n}`);

  // Notify Google Indexing API of new listing pages (fire-and-forget, non-blocking)
  if (newListings.length > 0 && newListings.length <= 200) {
    const { notifyUrls, listingUrl } = require('../services/googleIndexing');
    const urls = newListings.map(listingUrl).filter(Boolean);
    if (urls.length) {
      console.log(`[INDEXING] Notifying Google of ${urls.length} new listing pages...`);
      notifyUrls(urls).then(r => {
        console.log(`[INDEXING] Done. Sent: ${r.sent}, errors: ${r.errors.length}`);
        if (r.errors.length) console.log('[INDEXING] First error:', r.errors[0]);
      }).catch(err => {
        console.warn('[INDEXING] Failed:', err.message);
      });
    }
  } else if (newListings.length > 200) {
    console.log(`[INDEXING] Skipping — ${newListings.length} new listings exceeds 200/day quota`);
  }

  // Kick the backfill once after sync completes so newly-arrived listings get
  // their hero photos cached within ~1 minute instead of waiting for the next
  // backfill cron tick or a user click. Lazy require to avoid startup-order issues.
  try {
    const photoBackfill = require('./photoBackfill');
    photoBackfill.runBatch('post-sync').catch(err => console.warn('[BACKFILL]', err.message));
  } catch (e) {
    console.warn('[BACKFILL] post-sync hook failed to load:', e.message);
  }
}

let refreshRunning = false;

// Bulk photo URL refresh — pages through Property+Media to get fresh signed CDN URLs
async function refreshPhotos() {
  if (!TOKEN) return;
  if (refreshRunning) { console.log('[PHOTOS] Refresh already in progress, skipping.'); return; }
  refreshRunning = true;
  console.log('[PHOTOS] Starting bulk photo URL refresh...');

  const filter = `OriginatingSystemName eq '${SYSTEM}' and MlgCanView eq true`;
  let url = `${BASE_URL}/Property?$filter=${encodeURIComponent(filter)}&$expand=Media&$select=ListingKey&$top=500`;
  let pageCount = 0;
  let totalRefreshed = 0;

  // Prepare DB write helpers. Flush after every page (~500 listings) and chunk
  // each flush into 100-row transactions with setImmediate yields between them.
  // node-sqlite3-wasm is synchronous and single-threaded — without these yields,
  // a 5000-row transaction blocks the Node event loop for 30-40 seconds and the
  // public site becomes unreachable while the hourly photo refresh runs.
  const FLUSH_EVERY = 1; // flush every page so chunks stay bounded at ~500 each
  const TX_CHUNK = 100;  // rows per sub-transaction inside a flush
  const stmt = db.prepare('UPDATE listings SET photos = ? WHERE listing_key = ?');
  const batchUpdate = db.transaction((batch) => {
    for (const [key, urls] of batch) stmt.run(JSON.stringify(urls), key);
  });
  let pageBatch = {};

  const flushBatch = async () => {
    const entries = Object.entries(pageBatch);
    if (!entries.length) return;
    try {
      for (let i = 0; i < entries.length; i += TX_CHUNK) {
        batchUpdate(entries.slice(i, i + TX_CHUNK));
        // Yield so HTTP traffic interleaves with DB writes.
        await new Promise(r => setImmediate(r));
      }
      totalRefreshed += entries.length;
    } catch (e) {
      console.error(`[PHOTOS] Batch write failed (${entries.length} listings):`, e.message);
    }
    pageBatch = {};
  };

  while (url) {
    pageCount++;
    try {
      const data = await fetchPage(url);
      for (const p of (data.value || [])) {
        if (!p.ListingKey || !p.Media?.length) continue;
        const urls = p.Media
          .filter(m => m.MediaCategory === 'Photo' || !m.MediaCategory)
          .sort((a, b) => (a.Order || 0) - (b.Order || 0))
          .map(m => m.MediaURL)
          .filter(Boolean);
        if (urls.length) pageBatch[p.ListingKey] = urls;
      }
      url = data['@odata.nextLink'] || null;
      if (pageCount % FLUSH_EVERY === 0) {
        await flushBatch();
        if (pageCount % 10 === 0) {
          console.log(`[PHOTOS] Page ${pageCount}, refreshed ${totalRefreshed} listings...`);
        }
        // Yield to event loop so user requests aren't starved during this long-running job
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.error('[PHOTOS] Error:', e.message);
      break;
    }
  }

  await flushBatch(); // flush any remaining
  if (totalRefreshed === 0) {
    console.log('[PHOTOS] No photos to refresh.');
    refreshRunning = false;
    return;
  }

  console.log(`[PHOTOS] Refreshed photos for ${totalRefreshed} listings across ${pageCount} pages.`);
  refreshRunning = false;
}

// Sync closed Residential Lease records for cash-flow comp lookups.
// Runs WITHOUT MlgCanView filter — closed leases often have MlgCanView=false but we need them as comps.
async function syncClosedLeases() {
  if (!TOKEN) {
    console.warn('[LEASE-SYNC] No MLSGRID_ACCESS_TOKEN set — skipping');
    return;
  }

  // Fetch leases closed in the last 180 days, using ModificationTimestamp as proxy
  // (leases get a new ModificationTimestamp when they close, so this captures recent closings)
  // MLS GRID only allows filtering by: MlgCanView, ModificationTimestamp, OriginatingSystemName, StandardStatus, ListingId, PropertyType
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const cutoffTs = cutoff.toISOString(); // full ISO timestamp

  const filterParts = [
    `OriginatingSystemName eq '${SYSTEM}'`,
    `PropertyType eq 'Residential Lease'`,
    `StandardStatus eq 'Closed'`,
    `ModificationTimestamp gt ${cutoffTs}`
  ];
  const filter = encodeURIComponent(filterParts.join(' and '));
  let url = `${BASE_URL}/Property?$filter=${filter}&$top=1000`;

  let totalSynced = 0;
  let pageCount = 0;

  console.log(`[LEASE-SYNC] Fetching closed leases since ${cutoffTs}...`);

  while (url) {
    try {
      pageCount++;
      console.log(`[LEASE-SYNC] Page ${pageCount}...`);
      const data = await fetchPage(url);
      const records = data.value || [];
      if (!records.length) break;

      const mapped = records.map(mapListing);
      const saved = batchUpsertLeaseComps(mapped);
      totalSynced += saved;

      url = data['@odata.nextLink'] || null;
    } catch (err) {
      console.error(`[LEASE-SYNC] Error on page ${pageCount}:`, err.message);
      break;
    }
  }

  console.log(`[LEASE-SYNC] Done. Synced ${totalSynced} closed lease comps (${pageCount} pages).`);
}

// Sync closed MULTIFAMILY sales for the multifamily market report.
// ACTRIS labels multifamily as PropertyType 'Residential Income' or 'Commercial Sale'
// with sub-types like Apartment, Multi-Family, Duplex, Triplex, Quadruplex.
// Runs WITHOUT MlgCanView filter — closed sales are comps, not display listings.
async function syncClosedSales({ daysBack = 180 } = {}) {
  if (!TOKEN) {
    console.warn('[SALES-SYNC] No MLSGRID_ACCESS_TOKEN set — skipping');
    return;
  }

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const cutoffTs = cutoff.toISOString();

  // MLS GRID only allows PropertyType filter (not PropertySubType), so we pull
  // the whole PropertyType and let the stats query filter by sub-type.
  const propertyTypes = ['Residential Income', 'Commercial Sale'];

  let grandTotal = 0;
  let grandPages = 0;

  for (const propType of propertyTypes) {
    const filterParts = [
      `OriginatingSystemName eq '${SYSTEM}'`,
      `PropertyType eq '${propType}'`,
      `StandardStatus eq 'Closed'`,
      `ModificationTimestamp gt ${cutoffTs}`
    ];
    const filter = encodeURIComponent(filterParts.join(' and '));
    let url = `${BASE_URL}/Property?$filter=${filter}&$top=1000`;

    let typeSynced = 0;
    let typePages = 0;
    console.log(`[SALES-SYNC] Fetching closed ${propType} since ${cutoffTs}...`);

    while (url) {
      try {
        typePages++;
        console.log(`[SALES-SYNC] ${propType} page ${typePages}...`);
        const data = await fetchPage(url);
        const records = data.value || [];
        if (!records.length) break;

        // Reuse the lease-comp writer — it stores with mlg_can_view=0 so these are comps only
        const mapped = records.map(mapListing);
        const saved = batchUpsertLeaseComps(mapped);
        typeSynced += saved;

        url = data['@odata.nextLink'] || null;
      } catch (err) {
        console.error(`[SALES-SYNC] Error on ${propType} page ${typePages}:`, err.message);
        break;
      }
    }
    grandTotal += typeSynced;
    grandPages += typePages;
    console.log(`[SALES-SYNC] ${propType}: ${typeSynced} rows across ${typePages} pages.`);
  }

  console.log(`[SALES-SYNC] Done. Synced ${grandTotal} closed sale comps (${grandPages} pages total).`);
  return grandTotal;
}

module.exports = { syncListings, refreshPhotos, syncClosedLeases, syncClosedSales };
