require('dotenv').config();
const { Database } = require('node-sqlite3-wasm');
const fetch = require('node-fetch');
const path = require('path');

const db = new Database(path.join(__dirname, 'db/idx.db'));
const row = db.get("SELECT photos FROM listings WHERE photos != '[]' AND photos IS NOT NULL LIMIT 1");
const photos = JSON.parse(row.photos);
console.log('Photo count:', photos.length);
console.log('Sample URL:', photos[0]);

(async () => {
  const r1 = await fetch(photos[0]).catch(e => ({ status: 'ERR: ' + e.message }));
  console.log('Without auth:', r1.status);

  const r2 = await fetch(photos[0], {
    headers: { Authorization: `Bearer ${process.env.MLSGRID_ACCESS_TOKEN}` }
  }).catch(e => ({ status: 'ERR: ' + e.message }));
  console.log('With auth:', r2.status, r2.headers?.get('content-type'));
})();
