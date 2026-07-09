// Deal Radar — individual signal scoring functions
// Each returns: { score, maxScore, reasons[], signals[], confidence, details? }

function fmt$(n) {
  if (!n) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
}

function median(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

// Normalise lot size — MLS may return lot_size_sqft or lot_size_area
function lotSqft(listing) {
  if (listing.lot_size_sqft > 100)  return listing.lot_size_sqft;
  if (listing.lot_size_area > 100)  return listing.lot_size_area;
  if (listing.lot_size_acres > 0)   return Math.round(listing.lot_size_acres * 43560);
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 1: Price per sqft vs comparables  (max weight: 35 pts)
//
// Uses sold comps (close_price) as the primary reference — more reliable than
// active asking prices. Falls back to active comps when sold data is sparse.
// ─────────────────────────────────────────────────────────────────────────────
function scorePriceVsComps(listing, activeListings, soldListings, cfg) {
  const maxScore = cfg.weights.priceVsComps;
  const c        = cfg.priceComps;

  if (!listing.living_area || listing.living_area < 200 || !listing.list_price) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'Insufficient size data' };
  }

  const subjectPpsf = listing.list_price / listing.living_area;

  // ── Sold comps (preferred) ────────────────────────────────────────────────
  const soldPool = (soldListings || []).filter(l => {
    if (l.listing_key === listing.listing_key)                     return false;
    const price = l.close_price || l.list_price;
    if (!price || price < 50000 || !l.living_area || l.living_area < 200) return false;
    if ((l.city || '') !== (listing.city || ''))                   return false;
    const ls = (l.property_sub_type || '').toLowerCase();
    const ms = (listing.property_sub_type || '').toLowerCase();
    if (ls && ms && ls !== ms)                                     return false;
    if (Math.abs((l.bedrooms_total || 3) - (listing.bedrooms_total || 3)) > c.bedsWindow) return false;
    if (Math.abs(l.living_area - listing.living_area) / listing.living_area > c.sqftWindow) return false;
    return true;
  });

  // ── Active comps (fallback) ───────────────────────────────────────────────
  const activePool = (activeListings || []).filter(l => {
    if (l.listing_key === listing.listing_key)                     return false;
    if (!l.list_price || l.list_price < 50000 || !l.living_area || l.living_area < 200) return false;
    if ((l.city || '') !== (listing.city || ''))                   return false;
    const ls = (l.property_sub_type || '').toLowerCase();
    const ms = (listing.property_sub_type || '').toLowerCase();
    if (ls && ms && ls !== ms)                                     return false;
    if (Math.abs((l.bedrooms_total || 3) - (listing.bedrooms_total || 3)) > c.bedsWindow) return false;
    if (Math.abs(l.living_area - listing.living_area) / listing.living_area > c.sqftWindow) return false;
    return true;
  });

  // Prefer sold comps; merge if neither has enough alone
  let compPool, method, usingSold;
  if (soldPool.length >= c.minComps) {
    compPool  = soldPool;  method = 'sold-comps';    usingSold = true;
  } else if (activePool.length >= c.minComps) {
    compPool  = activePool; method = 'active-comps'; usingSold = false;
  } else {
    // Fall back to city-wide active listing average
    const cityPool = (activeListings || []).filter(l =>
      l.listing_key !== listing.listing_key &&
      l.city === listing.city && l.living_area > 200 && l.list_price > 50000
    );
    if (cityPool.length < 3) {
      return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'Not enough comps in area' };
    }
    compPool  = cityPool; method = 'city-wide-active'; usingSold = false;
  }

  // Compute median price per sqft
  const compPpsfs = compPool.map(l => {
    const p = usingSold ? (l.close_price || l.list_price) : l.list_price;
    return p / l.living_area;
  }).sort((a, b) => a - b);

  const medianPpsf = median(compPpsfs);
  const discount   = (medianPpsf - subjectPpsf) / medianPpsf;

  // Score
  let rawPts = 0;
  for (const tier of c.discountTiers) {
    if (discount >= tier.discount) { rawPts = tier.points; break; }
  }
  const score = Math.max(0, Math.round((rawPts / 35) * maxScore));

  const reasons = [];
  const sigs    = [];
  const pct     = Math.round(discount * 100);

  if (discount >= 0.02) {
    reasons.push(`~${pct}% below nearby comparables — ${fmt$(Math.round(subjectPpsf))}/sqft vs ${fmt$(Math.round(medianPpsf))}/sqft median`);
    sigs.push('below_comps');
    if (discount >= 0.10) sigs.push('deep_discount');
  } else if (discount < -0.03) {
    reasons.push(`~${Math.abs(pct)}% above area comparable listings`);
  } else {
    reasons.push(`Priced near comparables in ${listing.city || 'the area'}`);
  }

  const methodLabel = method === 'sold-comps' ? 'sold transactions' : method === 'active-comps' ? 'active listings' : 'city-wide average';

  return {
    score, maxScore, reasons, signals: sigs,
    confidence: compPool.length >= 10 ? 'high' : compPool.length >= 5 ? 'medium' : 'low',
    details: {
      subjectPpsf:    Math.round(subjectPpsf),
      medianCompPpsf: Math.round(medianPpsf),
      discountPct:    Math.round(discount * 100),
      compCount:      compPool.length,
      method,
      note:           `Based on ${compPool.length} ${methodLabel}`,
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 2: Price drop history  (max weight: 15 pts)
// ─────────────────────────────────────────────────────────────────────────────
function scorePriceDrops(listing, cfg) {
  const maxScore = cfg.weights.priceDrops;
  const c        = cfg.priceDrops;

  const orig = listing.original_list_price;
  const curr = listing.list_price;

  if (!orig || !curr) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'Price history not available from MLS' };
  }
  if (orig <= curr) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'high' };
  }

  const dropAmt = orig - curr;
  const dropPct = dropAmt / orig;

  let rawPts = 0;
  for (const tier of c.dropTiers) {
    if (dropPct >= tier.pct) { rawPts = tier.points; break; }
  }

  const dom = listing.days_on_market || 999;
  if (rawPts > 0 && dom <= c.recentDayThreshold) {
    rawPts = Math.min(15, rawPts + c.recentBonus);
  }

  const score   = Math.max(0, Math.min(maxScore, Math.round((rawPts / 15) * maxScore)));
  const reasons = [];
  const sigs    = [];

  if (dropPct >= 0.01) {
    reasons.push(`Price reduced ${fmt$(dropAmt)} (${Math.round(dropPct * 100)}%) from original list of ${fmt$(orig)}`);
    sigs.push('price_drop');
    if (dom <= c.recentDayThreshold) {
      reasons.push(`Recent reduction within the last ${dom} days — seller may be motivated`);
      sigs.push('recent_drop');
    }
  }

  return {
    score, maxScore, reasons, signals: sigs, confidence: 'high',
    details: { originalPrice: orig, currentPrice: curr, dropPct: Math.round(dropPct * 100), dropAmount: dropAmt },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 3: Days on market anomaly  (max weight: 10 pts)
// ─────────────────────────────────────────────────────────────────────────────
function scoreDomAnomaly(listing, allListings, cfg) {
  const maxScore = cfg.weights.domAnomaly;
  const c        = cfg.domAnomaly;

  const dom = listing.days_on_market;
  if (!dom || dom < 1) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low' };
  }

  const peers = (allListings || []).filter(l =>
    l.listing_key !== listing.listing_key &&
    l.city === listing.city && l.days_on_market > 0
  );

  if (peers.length < c.minCityListings) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'Not enough peers for DOM comparison' };
  }

  const sortedDoms = peers.map(l => l.days_on_market).sort((a, b) => a - b);
  const medDom     = median(sortedDoms);

  if (medDom < c.minMedianDom) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low' };
  }

  const mult   = dom / medDom;
  let rawPts   = 0;
  for (const tier of c.tiers) {
    if (mult >= tier.multiplier) { rawPts = tier.points; break; }
  }

  const score   = Math.max(0, Math.round((rawPts / 10) * maxScore));
  const reasons = [];
  const sigs    = [];

  if (mult >= 1.2) {
    reasons.push(`${dom} days on market vs area median of ${Math.round(medDom)} — suggests negotiating leverage`);
    sigs.push('high_dom');
    if (mult >= 2) reasons.push('Extended time on market may indicate motivated seller or pricing flexibility');
  }

  return {
    score, maxScore, reasons, signals: sigs,
    confidence: peers.length >= 20 ? 'high' : 'medium',
    details: { dom, medianDom: Math.round(medDom), multiplier: Math.round(mult * 10) / 10, peerCount: peers.length },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 4: Rental yield estimate  (max weight: 15 pts)
//
// Uses MLS lease comps when available (high confidence).
// Falls back to Austin rent tier estimates (low confidence).
// ─────────────────────────────────────────────────────────────────────────────
function scoreRentYield(listing, cfg, rentCompResult) {
  const maxScore = cfg.weights.rentYield;

  if (!listing.list_price || listing.list_price < 50000) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low' };
  }

  let estimatedRent, confidence, method, compCount;

  // ── Real MLS lease comps ──────────────────────────────────────────────────
  if (rentCompResult && rentCompResult.estimatedRent) {
    estimatedRent = rentCompResult.estimatedRent;
    confidence    = rentCompResult.confidence;
    method        = 'mls-lease-comps';
    compCount     = rentCompResult.compCount;
  } else {
    // ── Estimated tier fallback ─────────────────────────────────────────────
    let baseRent = 2000;
    for (const tier of cfg.rentEstimates) {
      if (listing.list_price <= tier.maxPrice) { baseRent = tier.estimatedRent; break; }
    }
    const beds    = listing.bedrooms_total || 3;
    const bedMult = beds >= 5 ? 1.25 : beds === 4 ? 1.15 : beds === 3 ? 1.0 : beds === 2 ? 0.88 : 0.75;
    estimatedRent = Math.round(baseRent * bedMult);
    confidence    = 'low';
    method        = 'estimated-tier';
    compCount     = 0;
  }

  const grossYield = (estimatedRent * 12) / listing.list_price;
  let rawPts = 0;
  for (const tier of cfg.yieldTiers) {
    if (grossYield >= tier.yield) { rawPts = tier.points; break; }
  }

  const score   = Math.max(0, Math.min(maxScore, Math.round((rawPts / 15) * maxScore)));
  const reasons = [];
  const sigs    = [];

  if (grossYield >= 0.04) {
    const src = method === 'mls-lease-comps'
      ? `(${compCount} MLS lease comps)`
      : '(Austin rent benchmark estimate)';
    reasons.push(`Estimated gross yield ~${(grossYield * 100).toFixed(1)}% at ${fmt$(estimatedRent)}/mo ${src}`);
    sigs.push('yield_potential');
    if (grossYield >= 0.055) sigs.push('strong_yield');
  }

  const isCondo = /condo|townhouse/i.test(listing.property_sub_type || '');
  const noteText = isCondo
    ? 'HOA fees may significantly reduce net yield on condo/townhouse — verify before underwriting'
    : method === 'estimated-tier'
      ? 'Rent is estimated from Austin market benchmarks — verify with actual lease comps'
      : null;

  return {
    score, maxScore, reasons, signals: sigs, confidence,
    estimated: method === 'estimated-tier',
    details: {
      estimatedRent,
      grossYieldPct: Math.round(grossYield * 1000) / 10,
      method,
      compCount,
      note: noteText,
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 5: Value-add language in listing remarks  (max weight: 10 pts)
// ─────────────────────────────────────────────────────────────────────────────
function scoreValueAddSignals(listing, cfg) {
  const maxScore = cfg.weights.valueAddSignals;
  const text = ((listing.public_remarks || '') + ' ' + (listing.private_remarks || '')).toLowerCase();

  if (!text.trim()) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'No remarks available' };
  }

  let rawPts = 0;
  const reasons = [];
  const sigs    = [];
  const seen    = new Set();

  for (const kw of cfg.valueAddKeywords) {
    if (seen.has(kw.label)) continue;
    if (text.includes(kw.word.toLowerCase())) {
      rawPts += kw.points;
      reasons.push(kw.label);
      sigs.push(kw.word.replace(/[\s-]+/g, '_'));
      seen.add(kw.label);
    }
  }

  rawPts      = Math.min(rawPts, cfg.valueAddMaxPoints);
  const score = Math.max(0, Math.round((rawPts / 10) * maxScore));

  return {
    score, maxScore, reasons, signals: sigs,
    confidence: reasons.length > 0 ? 'medium' : 'low',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 6: Lot / redevelopment potential  (max weight: 10 pts)
// ─────────────────────────────────────────────────────────────────────────────
function scoreLotPotential(listing, cfg) {
  const maxScore = cfg.weights.lotPotential;
  const c        = cfg.lotPotential;

  const lot = lotSqft(listing);
  if (!lot || !listing.living_area || listing.living_area < 200) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', note: 'Lot size data not available' };
  }

  const ratio  = lot / listing.living_area;
  let rawPts   = 0;
  for (const tier of c.ratioTiers) {
    if (ratio >= tier.ratio) { rawPts = tier.points; break; }
  }

  const reasons = [];
  const sigs    = [];

  if (rawPts > 0) {
    reasons.push(`Lot-to-structure ratio ${ratio.toFixed(1)}× — possible expansion, ADU, or redevelopment upside`);
    sigs.push('large_lot');
    if (ratio >= 5) reasons.push('Oversized lot for this submarket');
  }

  if (listing.year_built && listing.year_built <= c.oldYearBuilt) {
    rawPts = Math.min(10, rawPts + c.oldYearBonus);
    reasons.push(`Built ${listing.year_built} — renovation / value-add upside possible`);
    sigs.push('older_build');
  }

  const score = Math.max(0, Math.min(maxScore, Math.round((rawPts / 10) * maxScore)));

  return {
    score, maxScore, reasons, signals: sigs, confidence: 'medium',
    details: { lotSqft: Math.round(lot), structureSqft: listing.living_area, ratio: Math.round(ratio * 10) / 10, yearBuilt: listing.year_built },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 7: Assessed value vs list price  (max weight: 5 pts)
//
// Uses CAD appraisal data (from MLS tax_annual_amount or TCAD API).
// A listing priced below appraised value is a strong independent validation
// of potential value, since CAD values lag real market moves.
// ─────────────────────────────────────────────────────────────────────────────
function scoreAssessedDiscount(listing, cfg, cadData) {
  const maxScore = cfg.weights.assessedDiscount;

  if (!cadData || !cadData.appraisedValue || !listing.list_price) {
    return {
      score: 0, maxScore, reasons: [], signals: [], confidence: 'low',
      note: cadData === null
        ? 'CAD appraisal data not available for this property'
        : 'Appraisal data will load on next scoring cycle',
    };
  }

  const appraised = cadData.appraisedValue;
  const list      = listing.list_price;
  const discount  = (appraised - list) / appraised;

  // Score: full points if listing is ≥5% below appraised value
  let rawPts = 0;
  if (discount >= 0.10)     rawPts = 5;
  else if (discount >= 0.05) rawPts = 3;
  else if (discount >= 0.01) rawPts = 1;

  const score   = Math.max(0, Math.round((rawPts / 5) * maxScore));
  const reasons = [];
  const sigs    = [];

  const pct = Math.round(discount * 100);
  if (discount >= 0.01) {
    reasons.push(`Listed ~${pct}% below CAD appraised value of ${fmt$(appraised)} (${cadData.source})`);
    sigs.push('below_assessed');
  } else if (discount < -0.02) {
    reasons.push(`Listed ~${Math.abs(pct)}% above CAD appraised value of ${fmt$(appraised)}`);
  } else {
    reasons.push(`List price near CAD appraised value of ${fmt$(appraised)}`);
  }

  if (cadData.note) reasons.push(`Source: ${cadData.note}`);

  return {
    score, maxScore, reasons, signals: sigs,
    confidence: cadData.confidence || 'medium',
    details: { appraisedValue: appraised, listPrice: list, discountPct: pct, source: cadData.source },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL 8: Cash flow analysis — PITI vs rent comps  (max weight: 20 pts)
//
// Assumptions: 25% down, 30-yr fixed at cfg.cashFlow.interestRate.
// Tax from MLS tax_annual_amount when available; else price × defaultTaxRate.
// Insurance estimated at cfg.cashFlow.insurancePct × price annually.
// HOA from association_fee (monthly). Vacancy + CapEx deducted from rent.
// ─────────────────────────────────────────────────────────────────────────────
function scoreCashFlow(listing, cfg, rentCompResult) {
  const maxScore = cfg.weights.cashFlow;
  const c        = cfg.cashFlow;

  if (!listing.list_price || listing.list_price < 50000) {
    return { score: 0, maxScore, reasons: [], signals: [], confidence: 'low', cashFlowData: null };
  }

  const price        = listing.list_price;
  const downPayment  = price * c.downPaymentPct;
  const loanAmount   = price - downPayment;
  const monthlyRate  = (c.interestRate / 100) / 12;
  const numPayments  = c.loanTermYears * 12;

  // Monthly Principal + Interest
  const piPayment = monthlyRate === 0
    ? loanAmount / numPayments
    : Math.round(loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))
        / (Math.pow(1 + monthlyRate, numPayments) - 1));

  // Monthly taxes — prefer MLS data, fall back to rate estimate
  let monthlyTax, taxSource;
  if (listing.tax_annual_amount && listing.tax_annual_amount > 100) {
    monthlyTax = Math.round(listing.tax_annual_amount / 12);
    taxSource  = 'MLS';
  } else {
    monthlyTax = Math.round(price * c.defaultTaxRate / 12);
    taxSource  = 'estimated';
  }

  // Monthly insurance estimate
  const monthlyInsurance = Math.round(price * c.insurancePct / 12);

  // Monthly HOA — normalise to monthly if frequency is annual/quarterly/etc.
  let monthlyHoa = 0;
  if (listing.association_fee > 0) {
    const freq = (listing.association_fee_frequency || 'Monthly').toLowerCase();
    if (freq.includes('annual') || freq.includes('yearly')) {
      monthlyHoa = Math.round(listing.association_fee / 12);
    } else if (freq.includes('quarter')) {
      monthlyHoa = Math.round(listing.association_fee / 3);
    } else {
      monthlyHoa = Math.round(listing.association_fee);
    }
  }

  const totalPITI = piPayment + monthlyTax + monthlyInsurance + monthlyHoa;

  // Rent estimate
  let estimatedRent, rentConfidence, rentSource, rentCompCount;
  if (rentCompResult && rentCompResult.estimatedRent) {
    estimatedRent  = rentCompResult.estimatedRent;
    rentConfidence = rentCompResult.confidence;
    rentSource     = 'mls-comps';
    rentCompCount  = rentCompResult.compCount;
  } else {
    // Tier estimate fallback
    let baseRent = 2000;
    for (const tier of cfg.rentEstimates) {
      if (price <= tier.maxPrice) { baseRent = tier.estimatedRent; break; }
    }
    const beds    = listing.bedrooms_total || 3;
    const bedMult = beds >= 5 ? 1.25 : beds === 4 ? 1.15 : beds === 3 ? 1.0 : beds === 2 ? 0.88 : 0.75;
    estimatedRent  = Math.round(baseRent * bedMult);
    rentConfidence = 'low';
    rentSource     = 'estimated';
    rentCompCount  = 0;
  }

  // Effective rent after vacancy + capex reserve
  const effectiveRent = Math.round(estimatedRent * (1 - c.vacancyRate - c.capexRate));
  const monthlyCashFlow = effectiveRent - totalPITI;

  // Score
  let rawPts = 0;
  for (const tier of c.scoreTiers) {
    if (monthlyCashFlow >= tier.minCashFlow) { rawPts = tier.points; break; }
  }
  const score = Math.max(0, Math.round((rawPts / 20) * maxScore));

  const reasons = [];
  const sigs    = [];
  const cf$ = n => (n >= 0 ? '+' : '') + '$' + Math.abs(Math.round(n)).toLocaleString();

  if (monthlyCashFlow >= 0) {
    reasons.push(`Est. ${cf$(monthlyCashFlow)}/mo cash flow after PITI, vacancy & CapEx at ${fmt$(estimatedRent)}/mo rent`);
    sigs.push('cash_flow_positive');
    if (monthlyCashFlow >= 400) sigs.push('strong_cash_flow');
  } else {
    reasons.push(`Est. ${cf$(monthlyCashFlow)}/mo cash flow at ${fmt$(estimatedRent)}/mo rent — may not fully cover PITI`);
  }

  if (monthlyHoa > 0) sigs.push('has_hoa');

  // Cash-on-cash return (annual cash flow / down payment)
  const annualCashFlow   = monthlyCashFlow * 12;
  const cashOnCashReturn = annualCashFlow / downPayment;

  const cashFlowData = {
    purchasePrice:    price,
    downPayment:      Math.round(downPayment),
    loanAmount:       Math.round(loanAmount),
    interestRate:     c.interestRate,
    piPayment,
    monthlyTax,
    taxSource,
    monthlyInsurance,
    monthlyHoa,
    totalPITI,
    estimatedRent,
    rentSource,
    rentCompCount,
    rentConfidence,
    vacancyDeduction: Math.round(estimatedRent * c.vacancyRate),
    capexDeduction:   Math.round(estimatedRent * c.capexRate),
    effectiveRent,
    monthlyCashFlow:  Math.round(monthlyCashFlow),
    annualCashFlow:   Math.round(annualCashFlow),
    cashOnCashReturn: Math.round(cashOnCashReturn * 1000) / 10,
  };

  return {
    score, maxScore, reasons, signals: sigs,
    confidence: rentConfidence,
    cashFlowData,
  };
}


module.exports = {
  scorePriceVsComps,
  scorePriceDrops,
  scoreDomAnomaly,
  scoreRentYield,
  scoreValueAddSignals,
  scoreLotPotential,
  scoreAssessedDiscount,
  scoreCashFlow,
};
