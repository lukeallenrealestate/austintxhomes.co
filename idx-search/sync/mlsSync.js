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

const upsertListing = db.prepare(`
  INSERT OR REPLACE INTO listings (
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
    close_date: p.CloseDate || null,
    close_price: p.ClosePrice || null,
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

const batchUpsert = db.transaction((listings) => {
  let count = 0;
  for (const listing of listings) {
    if (!listing.mlg_can_view) {
      deleteListing.run(listing.listing_key);
    } else {
      upsertListing.run(listing);
      count++;
    }
  }
  return count;
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

// Rate limiter with exponential backoff for 429 errors
let lastRequestTime = 0;
const MIN_DELAY_MS = 600; // Keep ~1.6 RPS (well under 2 RPS limit)

async function fetchPage(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    // Enforce minimum delay between requests
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
    }
    
    lastRequestTime = Date.now();
    
    try {
      const res = await fetch(url, { headers: HEADERS });
      
      if (res.status === 429) {
        // Rate limited — exponential backoff
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
}

async function syncListings(isInitial = false) {
  if (!TOKEN) {
    console.warn('[SYNC] No MLSGRID_ACCESS_TOKEN set — skipping sync');
    return;
  }

  const syncState = db.prepare('SELECT * FROM sync_state WHERE id = 1').get();
  const lastTimestamp = syncState?.last_sync_timestamp;

  let filterParts = [`OriginatingSystemName eq '${SYSTEM}'`];

  if (isInitial || !lastTimestamp) {
    console.log('[SYNC] Starting initial import...');
    filterParts.push('MlgCanView eq true');
  } else {
    console.log(`[SYNC] Incremental sync since ${lastTimestamp}`);
    filterParts.push(`ModificationTimestamp gt ${lastTimestamp}`);
  }

  const filter = encodeURIComponent(filterParts.join(' and '));
  // No $select — let the API return all fields so we don't hit unsupported field errors
  let url = `${BASE_URL}/Property?$filter=${filter}&$expand=Media&$top=1000`;

  let totalSynced = 0;
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
      const saved = batchUpsert(mapped);
      totalSynced += saved;

      // Track latest modification timestamp
      for (const r of records) {
        if (r.ModificationTimestamp) {
          if (!latestTimestamp || r.ModificationTimestamp > latestTimestamp) {
            latestTimestamp = r.ModificationTimestamp;
          }
        }
      }

      url = data['@odata.nextLink'] || null;
      // Delay is now enforced in fetchPage via MIN_DELAY_MS rate limiter

    } catch (err) {
      console.error(`[SYNC] Error on page ${pageCount}:`, err.message);
      // Save progress and exit — next incremental sync will catch up
      break;
    }
  }

  if (latestTimestamp) {
    updateSyncState.run(latestTimestamp, totalSynced);
  }

  console.log(`[SYNC] Done. Synced ${totalSynced} listings (${pageCount} pages).`);
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

  // Prepare DB write helpers (flushed every FLUSH_EVERY pages to limit peak RAM)
  const FLUSH_EVERY = 10; // ~5000 listings per flush
  const stmt = db.prepare('UPDATE listings SET photos = ? WHERE listing_key = ?');
  const batchUpdate = db.transaction((batch) => {
    for (const [key, urls] of batch) stmt.run(JSON.stringify(urls), key);
  });
  let pageBatch = {};

  const flushBatch = () => {
    const entries = Object.entries(pageBatch);
    if (!entries.length) return;
    batchUpdate(entries);
    totalRefreshed += entries.length;
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
        flushBatch();
        console.log(`[PHOTOS] Page ${pageCount}, refreshed ${totalRefreshed} listings...`);
      }
      // Rate limiting is handled in fetchPage
    } catch (e) {
      console.error('[PHOTOS] Error:', e.message);
      break;
    }
  }

  flushBatch(); // flush any remaining
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

module.exports = { syncListings, refreshPhotos, syncClosedLeases };
