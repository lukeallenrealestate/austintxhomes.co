// Uses node-sqlite3-wasm (pure WASM, no compilation needed)
// Wrapped to expose the same API as better-sqlite3 so all routes work unchanged.
const { Database: WasmDB } = require('node-sqlite3-wasm');
const path = require('path');

const wasmDb = new WasmDB(path.join(__dirname, 'idx.db'));

// WAL mode = better concurrency (readers don't block writers and vice-versa).
// busy_timeout = wait up to 30 s instead of throwing immediately when locked.
try { wasmDb.run('PRAGMA journal_mode=WAL'); } catch {}
try { wasmDb.run('PRAGMA busy_timeout=30000'); } catch {}

// Convert {key: val} → {'@key': val} so named SQL params (@key) resolve correctly
function normalizeParams(args) {
  if (!args || args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {
    const result = {};
    for (const [k, v] of Object.entries(args[0])) {
      const prefixed =
        k.startsWith('@') || k.startsWith(':') || k.startsWith('$') ? k : `@${k}`;
      result[prefixed] = v;
    }
    return result;
  }
  return args.length === 1 ? args[0] : args;
}

function makeStmt(sql) {
  return {
    run(...args) {
      const p = normalizeParams(args);
      const r = wasmDb.run(sql, p) || {};
      return { changes: r.changes ?? 0, lastInsertRowid: r.lastInsertRowid ?? 0 };
    },
    get(...args) {
      const p = normalizeParams(args);
      return wasmDb.get(sql, p);
    },
    all(...args) {
      const p = normalizeParams(args);
      return wasmDb.all(sql, p);
    }
  };
}

const db = {
  prepare: (sql) => makeStmt(sql),
  exec: (sql) => {
    // node-sqlite3-wasm only runs one statement at a time — split on semicolons
    sql.split(';').map(s => s.trim()).filter(Boolean).forEach(s => {
      try { wasmDb.run(s); } catch (e) {
        // ignore "already exists" errors from IF NOT EXISTS
        if (!e.message?.includes('already exists')) throw e;
      }
    });
  },
  pragma: (str) => { wasmDb.run(`PRAGMA ${str}`); },
  transaction: (fn) => {
    return function (...args) {
      wasmDb.run('BEGIN');
      try {
        const result = fn(...args);
        wasmDb.run('COMMIT');
        return result;
      } catch (e) {
        wasmDb.run('ROLLBACK');
        throw e;
      }
    };
  }
};

// Create tables — each statement separate so node-sqlite3-wasm handles them correctly
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

statements.forEach(sql => wasmDb.run(sql));

// Migrations — add columns that may not exist in older DBs
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
  // Track the last "fully cached" listing count emailed so we can suppress
  // duplicate hourly reports once backfill reaches steady state.
  `ALTER TABLE sync_state ADD COLUMN backfill_last_email_count INTEGER DEFAULT -1`,
  `ALTER TABLE sync_state ADD COLUMN backfill_last_email_at DATETIME`
];
migrations.forEach(sql => { try { wasmDb.run(sql); } catch {} });

module.exports = db;
