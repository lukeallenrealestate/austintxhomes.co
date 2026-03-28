/**
 * One-time script: fetches Austin neighborhood boundary polygons from the
 * City of Austin's Neighborhood Reporting Areas ArcGIS service and writes
 * them to data/austin-neighborhoods.json.
 *
 * Run: node scripts/fetch-austin-neighborhoods.js
 *
 * Re-run any time you want fresher city data, or after manually editing
 * the MANUAL_OVERRIDES below to refine Tarrytown/Travis Heights/Clarksville.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ARCGIS_URL =
  'https://services.arcgis.com/0L95CJ0VTaxqcmED/ArcGIS/rest/services/' +
  'Neighborhood_Reporting_Areas/FeatureServer/0/query';

// City dataset uses "CENTRAL EAST AUSTIN" — map common search terms to it
const NAME_ALIASES = {
  'east austin': 'central east austin',
};

// Neighborhoods the city dataset doesn't have — approximate bounding rectangles.
// Replace coordinates with geojson.io-drawn polygons for more accurate outlines.
// Format: GeoJSON Polygon (coordinates[0] = outer ring, [lng, lat] pairs, closed)
const MANUAL_OVERRIDES = {
  tarrytown: {
    type: 'Polygon',
    coordinates: [[
      [-97.775, 30.293], [-97.755, 30.293],
      [-97.755, 30.320], [-97.775, 30.320],
      [-97.775, 30.293]
    ]]
  },
  'travis heights': {
    type: 'Polygon',
    coordinates: [[
      [-97.751, 30.244], [-97.730, 30.244],
      [-97.730, 30.260], [-97.751, 30.260],
      [-97.751, 30.244]
    ]]
  },
  clarksville: {
    type: 'Polygon',
    coordinates: [[
      [-97.771, 30.274], [-97.753, 30.274],
      [-97.753, 30.290], [-97.771, 30.290],
      [-97.771, 30.274]
    ]]
  }
};

async function main() {
  console.log('Fetching Austin neighborhood boundaries from City ArcGIS...');

  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'NEIGHNAME',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '300'
  });

  const res = await fetch(`${ARCGIS_URL}?${params}`, {
    headers: { 'User-Agent': 'austintxhomes.co/1.0 (Luke@austinmdg.com)' }
  });

  if (!res.ok) throw new Error(`ArcGIS responded ${res.status}`);
  const data = await res.json();

  const overrides = {};
  for (const feature of data.features || []) {
    const name = (feature.properties?.NEIGHNAME || '').toLowerCase().trim();
    if (name && feature.geometry) overrides[name] = feature.geometry;
  }

  console.log(`  Got ${Object.keys(overrides).length} polygons from city data`);

  // Add alias mappings
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (overrides[canonical] && !overrides[alias]) {
      overrides[alias] = overrides[canonical];
      console.log(`  Alias: "${alias}" → "${canonical}"`);
    }
  }

  // Add manual overrides (only if not already present from city data)
  for (const [key, geom] of Object.entries(MANUAL_OVERRIDES)) {
    if (!overrides[key]) {
      overrides[key] = geom;
      console.log(`  Manual: "${key}" (approximate rectangle)`);
    }
  }

  const outPath = path.join(__dirname, '../data/austin-neighborhoods.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2));

  console.log(`\nWritten ${Object.keys(overrides).length} neighborhoods to ${outPath}`);
  console.log('Sample keys:', Object.keys(overrides).sort().slice(0, 10).join(', '));
}

main().catch(err => { console.error(err); process.exit(1); });
