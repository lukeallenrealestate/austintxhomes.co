// Native better-sqlite3 (C++ binding). 10-20× faster than node-sqlite3-wasm
// for the same workload, with no WASM boundary stalls during MLS sync. The
// on-disk idx.db file is library-agnostic — the previous database was
// written by node-sqlite3-wasm and opens unchanged here.
//
// better-sqlite3 already exposes the API the rest of this codebase expects
// (prepare().run/.get/.all, exec, pragma, transaction) — the previous WASM
// wrapper layer deliberately emulated this API to make this swap drop-in.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH override lets us point at a Render persistent-disk mount (e.g.
// /var/data/idx.db) without changing code. Falls back to the original
// in-repo location for Replit / local dev.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'idx.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// DELETE mode (default rollback journal) — every COMMIT is fsync'd to the
// main idx.db file before returning, so container kills (Replit deploys,
// OOM, panic) don't lose committed writes. We previously tried WAL for
// concurrency, but Replit's deploy lifecycle force-kills containers without
// giving SIGTERM handlers time to run wal_checkpoint(TRUNCATE), so every
// Publish nuked thousands of un-checkpointed photos_r2 writes (the "Cleaning
// up stale SQLite artifacts" boot step swept the orphaned -wal/-shm files).
// busy_timeout still useful for the rare case of overlapping statement reuse.
db.pragma('journal_mode = DELETE');
db.pragma('busy_timeout = 30000');

// Create tables — better-sqlite3's exec() supports multi-statement SQL
// natively, but we keep statements separate for clearer error messages.
const statements = [
  `CREATE TABLE IF NOT EXISTS listings (
    listing_key TEXT PRIMARY KEY,
    listing_id TEXT,
    standard_status TEXT,
    property_type TEXT,
    property_sub_type TEXT,
    list_price REAL,
    bedrooms_total INTEGER,
    bathrooms_total INTEGER,
    bathrooms_full INTEGER,
    bathrooms_half INTEGER,
    living_area REAL,
    lot_size_acres REAL,
    lot_size_sqft REAL,
    year_built INTEGER,
    garage_spaces INTEGER,
    unparsed_address TEXT,
    street_number TEXT,
    street_name TEXT,
    unit_number TEXT,
    city TEXT,
    state_or_province TEXT,
    postal_code TEXT,
    county TEXT,
    subdivision_name TEXT,
    latitude REAL,
    longitude REAL,
    public_remarks TEXT,
    list_agent_full_name TEXT,
    list_agent_direct_phone TEXT,
    list_agent_email TEXT,
    list_office_name TEXT,
    elementary_school TEXT,
    middle_school TEXT,
    high_school TEXT,
    school_district TEXT,
    days_on_market INTEGER,
    listing_contract_date TEXT,
    close_date TEXT,
    close_price REAL,
    modification_timestamp TEXT,
    photos_change_timestamp TEXT,
    mlg_can_view INTEGER DEFAULT 1,
    photos TEXT DEFAULT '[]',
    pool_features TEXT,
    waterfront_yn INTEGER DEFAULT 0,
    new_construction_yn INTEGER DEFAULT 0,
    stories INTEGER,
    parking_total INTEGER,
    association_fee REAL,
    association_fee_frequency TEXT,
    tax_annual_amount REAL,
    raw_data TEXT,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(standard_status)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(property_type)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(list_price)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_beds ON listings(bedrooms_total)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_zip ON listings(postal_code)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_latlon ON listings(latitude, longitude)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_school ON listings(school_district)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_modified ON listings(modification_timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_subdiv ON listings(subdivision_name)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_active_date ON listings(standard_status, mlg_can_view, listing_contract_date)`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sync_timestamp TEXT,
    last_sync_at DATETIME,
    total_synced INTEGER DEFAULT 0
  )`,
  `INSERT OR IGNORE INTO sync_state (id, total_synced) VALUES (1, 0)`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    listing_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, listing_key)
  )`,
  `CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filters TEXT NOT NULL,
    alert_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

statements.forEach(sql => db.exec(sql));

// Migrations — add columns / tables that may not exist in older DBs
const migrations = [
  `ALTER TABLE saved_searches ADD COLUMN last_alerted_at DATETIME`,
  `ALTER TABLE listings ADD COLUMN photos_r2 TEXT`,
  `CREATE TABLE IF NOT EXISTS backfill_progress (
    listing_key TEXT NOT NULL,
    photo_idx INTEGER NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    last_error TEXT,
    PRIMARY KEY (listing_key, photo_idx)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_backfill_status ON backfill_progress(status)`,
  // Partial index that supports photoBackfill.pickNextBatch — scopes to rows
  // that actually have photos to mirror and pre-orders the synced_at DESC
  // tiebreaker so the planner doesn't have to re-sort 36k+ rows on each pick.
  `CREATE INDEX IF NOT EXISTS idx_listings_backfill_pick
    ON listings(mlg_can_view, synced_at DESC)
    WHERE photos IS NOT NULL AND photos != '[]'`,
  // Track the last "fully cached" listing count emailed so we can suppress
  // duplicate hourly reports once backfill reaches steady state.
  `ALTER TABLE sync_state ADD COLUMN backfill_last_email_count INTEGER DEFAULT -1`,
  `ALTER TABLE sync_state ADD COLUMN backfill_last_email_at DATETIME`,

  // Price-history anchors from the ACTRIS RESO feed. Populated by mlsSync.js
  // on every sync; consumed by templates/listing.js to render a Price History
  // card. Nullable — ACTRIS ships these on most active listings but not all,
  // and closed listings often don't carry the previous-price marker.
  `ALTER TABLE listings ADD COLUMN original_list_price REAL`,
  `ALTER TABLE listings ADD COLUMN previous_list_price REAL`,
  `ALTER TABLE listings ADD COLUMN price_change_timestamp TEXT`,

  // Per-(saved-search, listing) send log so we never notify the same client
  // about the same listing twice. Previously runAlertJob deduped by
  // modification_timestamp >= last_alerted_at at the SEARCH level - which
  // meant any listing that got touched in MLS for any reason (photo update,
  // description edit, status flip and back) re-fired notifications for
  // every match. Now: only send a listing if it's brand new to this search
  // OR the current list_price is strictly lower than last_price_sent
  // (price-drop reason). `reason` records which for the email template.
  `CREATE TABLE IF NOT EXISTS saved_search_sent (
    saved_search_id INTEGER NOT NULL,
    listing_key     TEXT    NOT NULL,
    last_price_sent REAL,
    reason          TEXT,
    sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (saved_search_id, listing_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sss_search ON saved_search_sent(saved_search_id)`,

  // ─── Sprint 2: query performance ─────────────────────────────────────
  // Composite indexes for the multi-filter searches users actually run.
  // The existing idx_listings_active_date covers status+sort but combinations
  // like (active + city + price) still scan post-index. These add direct
  // index hits for the top filter patterns.
  `CREATE INDEX IF NOT EXISTS idx_listings_active_price
    ON listings(mlg_can_view, standard_status, list_price)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_active_city_price
    ON listings(mlg_can_view, standard_status, city, list_price)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_active_zip_price
    ON listings(mlg_can_view, standard_status, postal_code, list_price)`,

  // R-Tree spatial index for map bounding-box queries. Previously map
  // endpoints did latitude BETWEEN + longitude BETWEEN, which SQLite has to
  // evaluate row-by-row even with the lat/lon compound index. R-Tree gives
  // true O(log n) spatial lookup. Triggers below keep it aligned with the
  // listings.rowid.
  `CREATE VIRTUAL TABLE IF NOT EXISTS listings_rtree USING rtree(
    id,
    minlat, maxlat,
    minlon, maxlon
  )`,
  `CREATE TRIGGER IF NOT EXISTS listings_rtree_ai
     AFTER INSERT ON listings
     WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
   BEGIN
     INSERT OR REPLACE INTO listings_rtree(id, minlat, maxlat, minlon, maxlon)
     VALUES (NEW.rowid, NEW.latitude, NEW.latitude, NEW.longitude, NEW.longitude);
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_rtree_au
     AFTER UPDATE OF latitude, longitude ON listings
   BEGIN
     DELETE FROM listings_rtree WHERE id = NEW.rowid;
     INSERT INTO listings_rtree(id, minlat, maxlat, minlon, maxlon)
     SELECT NEW.rowid, NEW.latitude, NEW.latitude, NEW.longitude, NEW.longitude
     WHERE NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_rtree_ad
     AFTER DELETE ON listings
   BEGIN
     DELETE FROM listings_rtree WHERE id = OLD.rowid;
   END`,

  // FTS5 trigram index for autocomplete + keyword search. Replaces 5 LIKE
  // table scans per keystroke (~100ms total) with single MATCH queries
  // (<10ms). content='listings' means FTS5 indexes into the live columns by
  // rowid — no text duplication. Trigram tokenizer supports infix matching
  // (so "Thornton" finds rows with "1234 Thornton St" mid-string), unlike
  // the default unicode61 tokenizer which is prefix-only.
  `CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
    unparsed_address, city, postal_code, subdivision_name, school_district,
    content='listings',
    content_rowid='rowid',
    tokenize='trigram'
  )`,
  `CREATE TRIGGER IF NOT EXISTS listings_fts_ai AFTER INSERT ON listings BEGIN
     INSERT INTO listings_fts(rowid, unparsed_address, city, postal_code, subdivision_name, school_district)
     VALUES (NEW.rowid, NEW.unparsed_address, NEW.city, NEW.postal_code, NEW.subdivision_name, NEW.school_district);
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_fts_ad AFTER DELETE ON listings BEGIN
     INSERT INTO listings_fts(listings_fts, rowid, unparsed_address, city, postal_code, subdivision_name, school_district)
     VALUES ('delete', OLD.rowid, OLD.unparsed_address, OLD.city, OLD.postal_code, OLD.subdivision_name, OLD.school_district);
   END`,
  `CREATE TRIGGER IF NOT EXISTS listings_fts_au AFTER UPDATE ON listings BEGIN
     INSERT INTO listings_fts(listings_fts, rowid, unparsed_address, city, postal_code, subdivision_name, school_district)
     VALUES ('delete', OLD.rowid, OLD.unparsed_address, OLD.city, OLD.postal_code, OLD.subdivision_name, OLD.school_district);
     INSERT INTO listings_fts(rowid, unparsed_address, city, postal_code, subdivision_name, school_district)
     VALUES (NEW.rowid, NEW.unparsed_address, NEW.city, NEW.postal_code, NEW.subdivision_name, NEW.school_district);
   END`
];
migrations.forEach(sql => { try { db.exec(sql); } catch {} });

// One-time backfill of the new R-Tree + FTS5 indexes. Idempotent — once
// user_version reaches CURRENT_SCHEMA_VERSION we skip the work. Triggers
// handle ongoing INSERT/UPDATE/DELETE maintenance going forward.
const CURRENT_SCHEMA_VERSION = 2;
const currentVersion = db.pragma('user_version', { simple: true });
if (currentVersion < CURRENT_SCHEMA_VERSION) {
  const t0 = Date.now();
  try {
    console.log(`[db] Migrating schema ${currentVersion} -> ${CURRENT_SCHEMA_VERSION}: backfilling R-Tree + FTS5`);
    db.exec(`INSERT OR REPLACE INTO listings_rtree(id, minlat, maxlat, minlon, maxlon)
             SELECT rowid, latitude, latitude, longitude, longitude
             FROM listings WHERE latitude IS NOT NULL AND longitude IS NOT NULL`);
    // FTS5 'rebuild' drops and rebuilds the entire index from the content=
    // table in one pass — far faster than incremental inserts for 40k+ rows.
    db.exec(`INSERT INTO listings_fts(listings_fts) VALUES('rebuild')`);
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    console.log(`[db] Schema migration complete in ${Date.now() - t0}ms`);
  } catch (err) {
    // If the SQLite build lacks rtree or fts5 trigram support, log loudly
    // but don't crash boot. Routes have LIKE fallbacks for autocomplete and
    // the BETWEEN fallback for spatial queries below.
    console.error('[db] Sprint 2 migration failed (continuing without new indexes):', err.message);
  }
}

module.exports = db;
