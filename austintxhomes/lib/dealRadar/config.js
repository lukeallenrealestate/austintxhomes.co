// Deal Radar — default scoring configuration
// All weights, thresholds, and keywords live here so they can be tuned
// without touching logic. Admin panel overrides are merged on top at runtime.

const DEFAULT_CONFIG = {

  // ── Score weights (max points per category, must total 100) ──────────────
  weights: {
    cashFlow:        20,  // PITI vs rent comps — cash flow analysis
    priceVsComps:    28,  // $/sqft vs comparable active listings
    priceDrops:      12,  // Recent price reduction history
    domAnomaly:       8,  // Days on market vs area median
    rentYield:        8,  // Estimated gross rental yield (quick check)
    valueAddSignals:  8,  // Keywords in public remarks
    lotPotential:    11,  // Lot-to-structure ratio / older build
    assessedDiscount: 5,  // Assessed value vs list price
  },

  // ── Enable / disable individual signals ──────────────────────────────────
  signals: {
    cashFlow:        true,
    priceVsComps:    true,
    priceDrops:      true,
    domAnomaly:      true,
    rentYield:       true,
    valueAddSignals: true,
    lotPotential:    true,
    assessedDiscount: false, // future: CAD data integration
  },

  // ── Cash flow / PITI analysis ─────────────────────────────────────────────
  // Assumes 25% down, 30-yr fixed. Tax/insurance pulled from MLS when available,
  // otherwise estimated from price. HOA from MLS association_fee field.
  cashFlow: {
    downPaymentPct:   0.25,   // 25% down
    loanTermYears:    30,
    interestRate:     7.0,    // annual %, adjustable in admin settings
    insurancePct:     0.007,  // annual homeowner's insurance as % of price
    defaultTaxRate:   0.0197, // Travis County 2025 effective rate; used when MLS tax_annual_amount missing
    vacancyRate:      0.08,   // 8% vacancy allowance on rent
    capexRate:        0.05,   // 5% of rent reserved for CapEx/maintenance
    // Monthly cash flow tiers (rent − PITI − vacancy − capex)
    scoreTiers: [
      { minCashFlow:  400, points: 20 },
      { minCashFlow:  150, points: 15 },
      { minCashFlow:    0, points: 10 },
      { minCashFlow: -150, points:  4 },
    ],
  },

  // ── Price vs comps ────────────────────────────────────────────────────────
  priceComps: {
    minComps:    3,     // minimum qualifying comps to use direct-comp method
    sqftWindow:  0.30,  // ±30% living area range
    bedsWindow:  1,     // ±1 bedroom
    // Discount breakpoints → full-weight points (out of 35)
    discountTiers: [
      { discount: 0.15, points: 35 },
      { discount: 0.10, points: 25 },
      { discount: 0.05, points: 15 },
      { discount: 0.02, points:  5 },
    ],
  },

  // ── Price drop scoring ────────────────────────────────────────────────────
  priceDrops: {
    dropTiers: [
      { pct: 0.10, points: 15 },
      { pct: 0.05, points: 10 },
      { pct: 0.02, points:  5 },
    ],
    recentDayThreshold: 14, // drop within this many days earns recency bonus
    recentBonus: 3,
  },

  // ── DOM anomaly ───────────────────────────────────────────────────────────
  domAnomaly: {
    tiers: [
      { multiplier: 2.0, points: 10 },
      { multiplier: 1.5, points:  7 },
      { multiplier: 1.2, points:  3 },
    ],
    minCityListings: 5,   // require this many city peers to score DOM
    minMedianDom:    7,   // skip DOM scoring if median < 7 (too sparse)
  },

  // ── Estimated Austin rents by price tier (2026, long-term LTR) ───────────
  rentEstimates: [
    { maxPrice:  250000, estimatedRent: 1600 },
    { maxPrice:  350000, estimatedRent: 1850 },
    { maxPrice:  450000, estimatedRent: 2100 },
    { maxPrice:  600000, estimatedRent: 2500 },
    { maxPrice:  800000, estimatedRent: 3000 },
    { maxPrice: 1000000, estimatedRent: 3800 },
    { maxPrice: Infinity,estimatedRent: 5000 },
  ],
  yieldTiers: [
    { yield: 0.060, points: 15 },
    { yield: 0.050, points: 10 },
    { yield: 0.040, points:  5 },
  ],

  // ── Value-add keyword signals ─────────────────────────────────────────────
  valueAddKeywords: [
    { word: 'motivated seller',  points: 3, label: 'Motivated seller language detected' },
    { word: 'bring all offers',  points: 3, label: '"Bring all offers" language detected' },
    { word: 'priced to sell',    points: 2, label: '"Priced to sell" language detected' },
    { word: 'investor special',  points: 3, label: 'Investor-special language detected' },
    { word: 'as-is',             points: 2, label: 'As-is sale indicated' },
    { word: 'as is',             points: 2, label: 'As-is sale indicated' },
    { word: 'fixer',             points: 2, label: 'Fixer-upper language detected' },
    { word: 'reduced',           points: 1, label: 'Price-reduced language in remarks' },
    { word: 'vacant',            points: 1, label: 'Vacant / unoccupied property' },
    { word: 'quick close',       points: 2, label: 'Quick close / seller flexibility' },
    { word: 'needs tlc',         points: 2, label: '"Needs TLC" — cosmetic upside possible' },
    { word: 'handyman',          points: 2, label: 'Handyman special indicated' },
    { word: 'estate sale',       points: 2, label: 'Estate sale — motivated circumstances' },
    { word: 'probate',           points: 3, label: 'Probate listing — motivated seller' },
    { word: 'opportunity',       points: 1, label: 'Opportunity language in remarks' },
    { word: 'cash only',         points: 2, label: 'Cash-only sale — limits buyer pool' },
    { word: 'below market',      points: 2, label: '"Below market" language in remarks' },
  ],
  valueAddMaxPoints: 10, // cap so no single listing dominates

  // ── Lot / redevelopment potential ─────────────────────────────────────────
  lotPotential: {
    ratioTiers: [
      { ratio: 5, points: 10 },
      { ratio: 4, points:  7 },
      { ratio: 3, points:  4 },
      { ratio: 2, points:  2 },
    ],
    oldYearBuilt:    1985, // pre-1985 earns +2 pts for renovation upside
    oldYearBonus:    2,
  },

  // ── General ───────────────────────────────────────────────────────────────
  minScoreToShow:        45,   // hide listings below this score
  maxListingsToProcess: 2000,  // max batch from MLS API
  cacheMinutes:          30,   // cache scored results this long
};

module.exports = DEFAULT_CONFIG;
