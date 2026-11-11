'use strict';
/**
 * Map a page URL to the live-market area it is about, so server.js can inject
 * the live snapshot widget (templates/market-widget.js) on every neighborhood,
 * ZIP, and school-district page without hand-editing each file.
 *
 *   /tarrytown-realtor, /neighborhoods/tarrytown, /living-in-zilker-austin,
 *   /sell-home-mueller-austin, /hyde-park-market-report, /zilker-homes-for-sale
 *       -> { scope: 'nbhd=<slug>', name }
 *   /best-realtor-78704-austin, /sell-house-78704-austin -> { scope: 'zip=78704' }
 *   /eanes-isd-homes-for-sale, /best-realtor-eanes-isd   -> { scope: 'isd=Eanes ISD' }
 *
 * Returns null when the URL is not an area page. Only slugs that resolve to a
 * boundary polygon or a data/neighborhoods.js record are used.
 */
const live = require('./liveStats');

let NBHD = null;
function nbhdRecords() {
  if (NBHD) return NBHD;
  try { NBHD = require('../data/neighborhoods'); } catch { NBHD = {}; }
  return NBHD;
}

const ISD = {
  'eanes': 'Eanes ISD', 'austin': 'Austin ISD', 'leander': 'Leander ISD', 'round-rock': 'Round Rock ISD',
  'lake-travis': 'Lake Travis ISD', 'hays': 'Hays', 'pflugerville': 'Pflugerville ISD',
  'dripping-springs': 'Dripping Springs ISD', 'georgetown': 'Georgetown ISD', 'del-valle': 'Del Valle ISD',
  'manor': 'Manor ISD', 'hutto': 'Hutto ISD', 'liberty-hill': 'Liberty Hill ISD',
};

// Paths that look like area pages but are not about one place's housing market.
// /spicewood-realtor is about the town of Spicewood; the 'spicewood' boundary is the
// Spicewood Springs area of Austin, so it must not map.
const EXCLUDE = new Set(['/austin-tx-realtor', '/neighborhoods', '/spicewood-realtor']);

function titleCase(slug) {
  return slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

function nbhdArea(slug) {
  if (!slug) return null;
  const rec = nbhdRecords()[slug];
  if (live.polygonsForSlug(slug) || rec) {
    return { scope: 'nbhd=' + slug, name: (rec && rec.name) || titleCase(slug) };
  }
  return null;
}

function areaForPath(p) {
  if (!p || EXCLUDE.has(p)) return null;
  let m;
  // Already-live market pages render their own numbers.
  if (/^\/homes-for-sale-in-\d{5}$/.test(p)) return null;

  if ((m = p.match(/^\/(?:best-realtor-)?([a-z-]+)-isd(?:-homes-for-sale)?$/)) && ISD[m[1]]) {
    return { scope: 'isd=' + ISD[m[1]], name: ISD[m[1]] };
  }
  if ((m = p.match(/(?:^|[-/])(78[67]\d{2})(?:[-/]|$)/))) {
    return { scope: 'zip=' + m[1], name: 'ZIP ' + m[1] };
  }
  const patterns = [
    /^\/neighborhoods\/([a-z0-9-]+)$/,
    /^\/([a-z0-9-]+)-realtor$/,
    /^\/([a-z0-9-]+)-homes-for-sale$/,
    /^\/living-in-([a-z0-9-]+)-austin$/,
    /^\/sell-home-([a-z0-9-]+)-austin$/,
    /^\/([a-z0-9-]+)-market-report$/,
  ];
  for (const re of patterns) {
    if ((m = p.match(re))) return nbhdArea(m[1]);
  }
  return null;
}

module.exports = { areaForPath };
