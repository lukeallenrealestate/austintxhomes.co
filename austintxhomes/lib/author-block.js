'use strict';

/**
 * Shared "About the Author" block for site-wide E-E-A-T signals.
 *
 * Google's Search Quality Evaluator Guidelines (the human-rater rubric that
 * ranking systems are tuned to correlate with) flag YMYL pages that don't
 * clearly identify their author and their credentials. Real estate is YMYL.
 * Most of the site already carries author info in JSON-LD schema, but SQEG
 * raters score what a human sees on the page, not what's buried in structured
 * data. This block puts the author identity, credentials, reputation, and
 * contact into the visible page render.
 *
 * The block is injected into every static HTML page via the sendFile-wrapper
 * middleware in server.js, and rendered directly by dynamic templates. Uses
 * inline styles so it works without page-specific CSS.
 *
 * MARKER: Every rendered instance includes the sentinel comment
 *   <!-- atx-author-block v1 -->
 * so the middleware can detect an already-injected page and skip. Prevents
 * stacked injections when a template already renders the block itself.
 */

// Absolute URLs so external tooling (email clients, GBP previews) render
// the same asset. Relative would break in those contexts.
const HEADSHOT_URL   = 'https://austintxhomes.co/images/luke-allen.jpg';
const REVIEWS_URL    = 'https://share.google/hETte82InqUPvWeNC';
const ABOUT_URL      = 'https://austintxhomes.co/luke-allen';
const PHONE          = '(254) 718-2567';
const PHONE_HREF     = 'tel:+12547182567';
const EMAIL          = 'Luke@austinmdg.com';
const EMAIL_HREF     = 'mailto:Luke@austinmdg.com';

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * The full author block HTML. Returned as a string ready to inject.
 *
 * @param {object} [opts]
 * @param {Date|string|number} [opts.lastUpdated] Anything Date can parse.
 *   Falsy → no updated line rendered. Callers with real freshness data
 *   (file mtime, published date) should pass it in. The middleware passes
 *   the static file's mtime; dynamic templates pass their own date.
 * @param {string} [opts.pageLabel] Short label for the "About this page"
 *   heading. Defaults to "About the Author". Set to "About the Author of
 *   this Market Report" or similar for context.
 */
function authorBlockHTML(opts = {}) {
  const dateStr = opts.lastUpdated ? fmtDate(opts.lastUpdated) : null;
  const label = opts.pageLabel || 'About the Author';

  return `<!-- atx-author-block v1 -->
<section class="atx-author-block" itemscope itemtype="https://schema.org/RealEstateAgent" aria-labelledby="atx-ab-heading" style="background:#faf8f4;border-top:1px solid #e5dfd4;border-bottom:1px solid #e5dfd4;padding:40px 24px;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:900px;margin:0 auto;">
    <div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#b8935a;font-weight:700;margin-bottom:14px;" id="atx-ab-heading">${label}</div>
    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
      <img src="${HEADSHOT_URL}" alt="Luke Allen, Austin TX Realtor, TREC #788149" itemprop="image" width="96" height="96" loading="lazy" style="width:96px;height:96px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #e5dfd4;background:#fff;" />
      <div style="flex:1;min-width:240px;">
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#0f0f0e;line-height:1.15;margin-bottom:4px;">
          <span itemprop="name">Luke Allen</span>
        </div>
        <div style="font-size:13px;color:#5c5b57;margin-bottom:8px;line-height:1.5;">
          Licensed Austin TX Realtor &middot; <span itemprop="identifier">TREC #788149</span> &middot; Full-time since 2019
        </div>
        <div style="font-size:13px;color:#b8935a;font-weight:600;margin-bottom:12px;" itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
          <span style="letter-spacing:.5px;">&starf;&starf;&starf;&starf;&starf;</span>
          <span itemprop="ratingValue">5.0</span> on Google &middot;
          <a href="${REVIEWS_URL}" target="_blank" rel="noopener" style="color:#b8935a;text-decoration:underline;text-decoration-color:rgba(184,147,90,.4);"><span itemprop="reviewCount">30</span> Reviews</a>
        </div>
        <p style="font-size:14px;color:#1a1918;line-height:1.7;margin:0 0 14px;" itemprop="description">
          Luke Allen is a full-time Austin TX Realtor with the Austin Marketing + Development Group brokerage. He works with buyers, sellers, and investors across every Austin ISD and the surrounding neighborhoods, from Downtown and East Austin to Round Rock, Cedar Park, and the Hill Country. Every page on this site is written and maintained by Luke.${dateStr ? ` <em style="color:#5c5b57;font-style:normal;">This page was last updated on ${dateStr}.</em>` : ''}
        </p>
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;">
          <a href="${PHONE_HREF}" itemprop="telephone" style="color:#b8935a;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(184,147,90,.4);padding-bottom:1px;">&#128222; ${PHONE}</a>
          <a href="${EMAIL_HREF}" itemprop="email" style="color:#b8935a;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(184,147,90,.4);padding-bottom:1px;">${EMAIL}</a>
          <a href="${ABOUT_URL}" style="color:#b8935a;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(184,147,90,.4);padding-bottom:1px;">More about Luke &rarr;</a>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

/**
 * Short data-source attribution strip for pages that display MLS data
 * (market reports, sold-comp pages, listing tables). SQEG values visible
 * source citations on YMYL claims. Renders as a single-line strip.
 *
 * @param {object} opts
 * @param {string} [opts.source='ACTRIS MLS'] Data source name.
 * @param {Date|string|number} [opts.refreshedAt] When the data snapshot was
 *   taken. Defaults to now.
 * @param {number} [opts.listingCount] Optional listing-count context, e.g.
 *   'aggregated from 22,145 active Austin listings'.
 * @param {string} [opts.methodology] Optional short methodology line.
 */
function dataSourceStripHTML(opts = {}) {
  const source = opts.source || 'ACTRIS MLS';
  const dateStr = fmtDate(opts.refreshedAt || new Date());
  const count = opts.listingCount ? Number(opts.listingCount).toLocaleString('en-US') : null;
  return `<!-- atx-data-source-strip v1 -->
<div class="atx-data-source" role="note" style="background:#f5ede0;border-left:3px solid #b8935a;padding:12px 18px;font-family:'Inter',system-ui,sans-serif;font-size:12.5px;color:#5c5b57;line-height:1.55;max-width:900px;margin:24px auto;border-radius:2px;">
  <strong style="color:#0f0f0e;">Data source:</strong> ${source}${dateStr ? ` &middot; refreshed ${dateStr}` : ''}${count ? ` &middot; ${count} active listings analyzed` : ''}${opts.methodology ? ` &middot; ${opts.methodology}` : ''}. Analysis by Luke Allen, TREC #788149.
</div>`;
}

/** Marker string the middleware / templates check to avoid double-injection. */
const AUTHOR_BLOCK_MARKER = '<!-- atx-author-block v1 -->';
const DATA_STRIP_MARKER   = '<!-- atx-data-source-strip v1 -->';

module.exports = {
  authorBlockHTML,
  dataSourceStripHTML,
  AUTHOR_BLOCK_MARKER,
  DATA_STRIP_MARKER,
  fmtDate,
};
