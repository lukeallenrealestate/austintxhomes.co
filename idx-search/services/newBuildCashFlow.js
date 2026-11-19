/**
 * New-construction cash-flow scanner.
 *
 * For every active for-sale home built in a given year (default 2026):
 *   1. Draw a half-mile radius around it.
 *   2. Collect closed Residential Lease records inside that radius from the
 *      last 12 months, same bedroom count, same kind of home (detached vs
 *      attached). Rent per comp = the lease's final price in the feed.
 *      ACTRIS never sends ClosePrice on leases, so close_price holds the
 *      final asking rent at the time the home leased, not a confirmed
 *      contract rent.
 *   3. Monthly cost = principal + interest (25% down, 30-year fixed at the
 *      supplied rate) + property tax + HOA.
 *      Property tax: the MLS tax figure on new builds is usually land-only,
 *      so we ignore it and apply an effective tax rate to the purchase price.
 *      The rate is the 75th percentile of TaxAnnualAmount / TaxAssessedValue
 *      across that ZIP's resale listings in our own MLS data (upper quartile
 *      leans toward non-homestead bills, which is what an investor pays).
 *   4. It cash flows when the median comp rent beats the monthly cost.
 *
 * Insurance, vacancy, maintenance and management are NOT in the pass/fail
 * test (per Luke's spec), but an insurance-adjusted margin and an investor
 * rate stress test are reported alongside so nobody over-reads a thin pass.
 */
const db = require('../db/database');

const DEFAULTS = {
  yearBuilt: 2026,
  radiusMi: 0.5,
  downPct: 0.25,
  termYears: 30,
  leaseLookbackDays: 365,
  minComps: 3,
  insuranceRate: 0.005,          // est. annual insurance as share of price
  investorRatePremium: 0.75,     // investment-property loans price higher
  fallbackTaxRate: 0.022,
};

const DETACHED = ['Single Family Residence'];
const ATTACHED = ['Townhouse', 'Condominium', 'Duplex'];
function homeGroup(subType) {
  if (DETACHED.includes(subType)) return 'detached';
  if (ATTACHED.includes(subType)) return 'attached';
  return null;
}

function monthlyPI(loan, ratePct, years) {
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function hoaMonthly(fee, freq) {
  if (!fee || fee <= 0) return { amount: 0, note: null };
  const f = String(freq || '').toLowerCase();
  if (f.includes('semi')) return { amount: fee / 6, note: null };
  if (f.includes('annual') || f.includes('year')) return { amount: fee / 12, note: null };
  if (f.includes('quarter')) return { amount: fee / 3, note: null };
  if (f.includes('month')) return { amount: fee, note: null };
  if (f.includes('one time')) return { amount: 0, note: 'one-time HOA fee, not monthly' };
  // Blank or "See Remarks": treat as monthly (the conservative read) and flag it.
  return { amount: fee, note: `HOA frequency "${freq || 'blank'}", treated as monthly` };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ZIP and county effective tax rates from our own MLS resale data. */
function buildTaxRates(fallback) {
  const rows = db.prepare(`
    SELECT postal_code AS zip, county,
           CAST(json_extract(raw_data, '$.TaxAnnualAmount') AS REAL) * 1.0
             / CAST(json_extract(raw_data, '$.TaxAssessedValue') AS REAL) AS r
    FROM listings
    WHERE property_type = 'Residential'
      AND (year_built IS NULL OR year_built < 2025)
      AND json_extract(raw_data, '$.TaxYear') >= 2024
      AND json_extract(raw_data, '$.TaxAssessedValue') > 100000
      AND json_extract(raw_data, '$.TaxAnnualAmount') > 500
  `).all().filter(x => x.r >= 0.008 && x.r <= 0.04);
  const byZip = new Map(), byCounty = new Map();
  for (const x of rows) {
    if (x.zip) (byZip.get(x.zip) || byZip.set(x.zip, []).get(x.zip)).push(x.r);
    if (x.county) (byCounty.get(x.county) || byCounty.set(x.county, []).get(x.county)).push(x.r);
  }
  const zip = new Map(), county = new Map();
  for (const [k, v] of byZip) if (v.length >= 15) zip.set(k, { rate: quantile(v, 0.75), n: v.length });
  for (const [k, v] of byCounty) if (v.length >= 30) county.set(k, { rate: quantile(v, 0.75), n: v.length });
  return function rateFor(zipCode, countyName) {
    if (zip.has(zipCode)) return { ...zip.get(zipCode), source: `ZIP ${zipCode}` };
    if (county.has(countyName)) return { ...county.get(countyName), source: `${countyName} County` };
    return { rate: fallback, n: 0, source: 'fallback' };
  };
}

/**
 * Per-ZIP pin sanity check. Some MLS listings carry coordinates from the
 * wrong part of town (e.g. an Easton Park condo pinned in 78721), which
 * would compare it against the wrong neighborhood's leases. A subject is
 * flagged when it sits farther from its ZIP's median point than 98% of
 * that ZIP's other listings (min 2 miles of slack).
 */
function buildZipPinCheck() {
  const rows = db.prepare(`SELECT postal_code AS z, latitude AS lat, longitude AS lng FROM listings
    WHERE postal_code IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL`).all();
  const by = new Map();
  for (const r of rows) (by.get(r.z) || by.set(r.z, []).get(r.z)).push(r);
  const zips = new Map();
  for (const [z, pts] of by) {
    if (pts.length < 20) continue;
    const cLat = median(pts.map(p => p.lat)), cLng = median(pts.map(p => p.lng));
    const d = pts.map(p => haversineMi(cLat, cLng, p.lat, p.lng));
    zips.set(z, { cLat, cLng, limit: Math.max(2, quantile(d, 0.98)) });
  }
  // Second test for far-out pins: a real edge-of-ZIP community still has
  // listings from OTHER subdivisions in the same ZIP within a mile. A
  // mis-pinned one (and its mis-pinned siblings) does not.
  const neighbors = db.prepare(`SELECT COUNT(*) AS n FROM listings
    WHERE postal_code = ? AND COALESCE(subdivision_name, '') != COALESCE(?, '')
      AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`);
  return (zip, lat, lng, subdivision) => {
    const z = zips.get(zip);
    if (!z) return null;
    const d = haversineMi(z.cLat, z.cLng, lat, lng);
    if (d <= z.limit) return null;
    const n = neighbors.get(zip, subdivision, lat - 0.0145, lat + 0.0145, lng - 0.0167, lng + 0.0167).n;
    return n >= 3 ? null : `map pin is ${d.toFixed(1)} mi from the middle of ZIP ${zip} with no other ${zip} listings nearby; comps may be from the wrong area`;
  };
}

// Listings a 25%-down mortgage can't buy (unfinished, cash/construction-loan only).
const FINANCING_RE = /cash only|only cash|not eligible for (conventional|fha|va|financing)|incomplete construction|construction loan only/i;

/**
 * Run the scan. `ratePct` (30-year fixed, percent) is required so callers
 * decide where the rate comes from (live feed, query param, CLI flag).
 */
function scanNewBuildCashFlow(opts = {}) {
  // Drop undefined so an unset option never overwrites its default.
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  if (!(o.ratePct > 0)) throw new Error('ratePct is required');
  const taxRateFor = buildTaxRates(o.fallbackTaxRate);
  const pinCheck = buildZipPinCheck();

  const subjects = db.prepare(`
    SELECT listing_key, listing_id, unparsed_address, city, postal_code, county,
           subdivision_name, builder_name, property_sub_type, bedrooms_total,
           bathrooms_total, living_area, list_price, association_fee,
           association_fee_frequency, latitude, longitude, days_on_market,
           mlg_can_view, public_remarks
    FROM listings
    WHERE standard_status = 'Active'
      AND property_type = 'Residential'
      AND year_built = ?
      AND list_price > 50000
      AND latitude IS NOT NULL AND longitude IS NOT NULL
  `).all(o.yearBuilt).filter(s => homeGroup(s.property_sub_type));

  const cutoff = new Date(Date.now() - o.leaseLookbackDays * 864e5).toISOString();
  const leases = db.prepare(`
    SELECT listing_key, unparsed_address, property_sub_type, bedrooms_total,
           living_area, year_built, close_price AS rent, close_date,
           latitude, longitude
    FROM listings
    WHERE standard_status = 'Closed'
      AND property_type = 'Residential Lease'
      AND close_date >= ?
      AND close_price BETWEEN 500 AND 30000
      AND bedrooms_total IS NOT NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL
  `).all(cutoff);

  // Grid index (~0.7 mi cells) so each subject only checks nearby leases.
  const CELL = 0.01;
  const key = (lat, lng) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
  const grid = new Map();
  for (const l of leases) {
    l.group = homeGroup(l.property_sub_type);
    if (!l.group) continue;
    const k = key(l.latitude, l.longitude);
    (grid.get(k) || grid.set(k, []).get(k)).push(l);
  }

  const results = [];
  for (const s of subjects) {
    const group = homeGroup(s.property_sub_type);
    const ci = Math.floor(s.latitude / CELL), cj = Math.floor(s.longitude / CELL);
    const comps = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const l of grid.get(`${ci + di}:${cj + dj}`) || []) {
        if (l.group !== group || l.bedrooms_total !== s.bedrooms_total) continue;
        const d = haversineMi(s.latitude, s.longitude, l.latitude, l.longitude);
        if (d <= o.radiusMi) comps.push({ ...l, distMi: Math.round(d * 100) / 100 });
      }
    }

    const price = s.list_price;
    const loan = price * (1 - o.downPct);
    const pi = monthlyPI(loan, o.ratePct, o.termYears);
    const tax = taxRateFor(s.postal_code, s.county);
    const taxMo = price * tax.rate / 12;
    const hoa = hoaMonthly(s.association_fee, s.association_fee_frequency);
    const payment = pi + taxMo + hoa.amount;
    const insuranceMo = price * o.insuranceRate / 12;
    const piInvestor = monthlyPI(loan, o.ratePct + o.investorRatePremium, o.termYears);

    const rents = comps.map(c => c.rent);
    const medRent = median(rents);
    const enough = comps.length >= o.minComps;
    const r0 = n => Math.round(n);
    const warnings = [];
    const pinWarn = pinCheck(s.postal_code, s.latitude, s.longitude, s.subdivision_name);
    if (pinWarn) warnings.push(pinWarn);
    if (FINANCING_RE.test(s.public_remarks || '')) warnings.push('remarks say it cannot be bought with a regular mortgage (cash or construction loan only)');
    if (hoa.note) warnings.push(hoa.note);
    const blocked = !!pinWarn || FINANCING_RE.test(s.public_remarks || '');

    results.push({
      listingKey: s.listing_key,
      mlsNumber: s.listing_id,
      address: (s.unparsed_address || '').replace(/\s+None\b/g, '').replace(/\s{2,}/g, ' ').trim(),
      city: s.city,
      zip: s.postal_code,
      subdivision: s.subdivision_name,
      builder: s.builder_name,
      type: s.property_sub_type,
      beds: s.bedrooms_total,
      baths: s.bathrooms_total,
      sqft: s.living_area,
      listPrice: price,
      daysOnMarket: s.days_on_market,
      publicOnIdx: !!s.mlg_can_view,
      downPayment: r0(price * o.downPct),
      loan: r0(loan),
      monthly: {
        principalInterest: r0(pi),
        tax: r0(taxMo),
        hoa: r0(hoa.amount),
        total: r0(payment),
      },
      taxRate: { pct: Math.round(tax.rate * 10000) / 100, source: tax.source, samples: tax.n },
      hoaNote: hoa.note,
      comps: {
        count: comps.length,
        medianRent: medRent == null ? null : r0(medRent),
        lowRent: rents.length ? Math.min(...rents) : null,
        highRent: rents.length ? Math.max(...rents) : null,
        shareAbovePayment: rents.length ? Math.round(100 * rents.filter(r => r > payment).length / rents.length) : null,
        list: comps.sort((a, b) => a.distMi - b.distMi).map(c => ({
          address: (c.unparsed_address || '').replace(/\s+None\b/g, '').replace(/\s{2,}/g, ' ').trim(), rent: c.rent, beds: c.bedrooms_total,
          sqft: c.living_area, yearBuilt: c.year_built, leasedOn: (c.close_date || '').slice(0, 10),
          distMi: c.distMi,
        })),
      },
      warnings,
      verdict: !enough ? 'not enough comps'
        : blocked ? 'excluded (see warnings)'
        : (medRent > payment ? 'cash flows' : 'does not cash flow'),
      cashFlowsAtMedian: enough && !blocked && medRent > payment,
      marginAtMedian: enough ? r0(medRent - payment) : null,
      marginAfterInsurance: enough ? r0(medRent - payment - insuranceMo) : null,
      marginAtInvestorRate: enough ? r0(medRent - (payment - pi + piInvestor)) : null,
    });
  }

  const passing = results.filter(r => r.cashFlowsAtMedian).sort((a, b) => b.marginAtMedian - a.marginAtMedian);
  return {
    generatedAt: new Date().toISOString(),
    assumptions: {
      yearBuilt: o.yearBuilt, radiusMi: o.radiusMi, downPct: o.downPct, termYears: o.termYears,
      ratePct: o.ratePct, investorRatePct: o.ratePct + o.investorRatePremium,
      leaseLookbackDays: o.leaseLookbackDays, minComps: o.minComps,
      insuranceRate: o.insuranceRate,
      rentBasis: 'median final price of closed MLS leases (ACTRIS sends no ClosePrice on leases)',
      compMatch: 'same bedroom count; detached vs detached, attached (townhouse/condo/duplex) vs attached',
    },
    totals: {
      newBuildsScanned: results.length,
      excluded: results.filter(r => r.verdict === 'excluded (see warnings)').length,
      withEnoughComps: results.filter(r => r.verdict !== 'not enough comps').length,
      cashFlowing: passing.length,
      leasePool: leases.length,
    },
    cashFlowing: passing,
    all: results,
  };
}

module.exports = { scanNewBuildCashFlow, DEFAULTS };
