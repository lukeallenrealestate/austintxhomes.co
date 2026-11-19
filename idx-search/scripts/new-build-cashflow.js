#!/usr/bin/env node
// CLI: node scripts/new-build-cashflow.js [--rate 6.25] [--year 2026] [--csv out.csv]
// Prints the new-construction cash-flow scan (services/newBuildCashFlow.js).
// Without --rate it pulls the live 30-year rate the site already uses.
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

(async () => {
  const { scanNewBuildCashFlow } = require('../services/newBuildCashFlow');
  const ratePct = args.rate ? Number(args.rate) : await require('../routes/properties').fetchLiveMortgageRate();
  const out = scanNewBuildCashFlow({ ratePct, yearBuilt: args.year ? Number(args.year) : undefined });
  const $ = n => n == null ? '' : '$' + Math.round(n).toLocaleString();
  console.log(`Rate ${ratePct}% | scanned ${out.totals.newBuildsScanned} new builds | ${out.totals.withEnoughComps} with 3+ comps | ${out.totals.cashFlowing} cash flow | lease pool ${out.totals.leasePool}`);
  for (const r of out.cashFlowing) {
    console.log(`${r.address} | ${r.type} ${r.beds}bd ${r.sqft || '?'}sf | ${$(r.listPrice)} | pay ${$(r.monthly.total)} (PI ${$(r.monthly.principalInterest)} tax ${$(r.monthly.tax)} @${r.taxRate.pct}% hoa ${$(r.monthly.hoa)}) | median rent ${$(r.comps.medianRent)} of ${r.comps.count} | +${$(r.marginAtMedian)} | after ins ${$(r.marginAfterInsurance)} | investor rate ${$(r.marginAtInvestorRate)}`);
  }
  if (args.csv) {
    const cols = ['address','city','zip','subdivision','builder','type','beds','baths','sqft','listPrice','pi','tax','taxRatePct','hoa','payment','compCount','medianRent','lowRent','highRent','shareAbovePct','margin','marginAfterIns','marginInvestorRate','verdict','mlsNumber'];
    const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const rows = out.all.map(r => [r.address, r.city, r.zip, r.subdivision, r.builder, r.type, r.beds, r.baths, r.sqft, r.listPrice,
      r.monthly.principalInterest, r.monthly.tax, r.taxRate.pct, r.monthly.hoa, r.monthly.total, r.comps.count, r.comps.medianRent,
      r.comps.lowRent, r.comps.highRent, r.comps.shareAbovePayment, r.marginAtMedian, r.marginAfterInsurance, r.marginAtInvestorRate,
      r.verdict, r.mlsNumber].map(esc).join(','));
    require('fs').writeFileSync(args.csv, [cols.join(','), ...rows].join('\n'));
    console.log('CSV written to', args.csv);
  }
  require('fs').writeFileSync(args.json || '/dev/null', JSON.stringify(out, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
