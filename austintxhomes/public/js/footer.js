/**
 * AustinTXHomes — shared site footer
 * Included by every page. Edit this ONE file to update the footer everywhere.
 * Provides rich internal linking for SEO across all pages.
 */
(function () {

  const css = `
    #site-footer {
      background: #0f0f0e;
      font-family: 'Inter', system-ui, sans-serif;
      color: rgba(255,255,255,.38);
      border-top: 1px solid rgba(255,255,255,.07);
    }
    #site-footer * { box-sizing: border-box; }
    #site-footer .sf-main {
      max-width: 1180px; margin: 0 auto;
      padding: 64px 2rem 48px;
      display: grid;
      grid-template-columns: 1.6fr 1fr 1fr 1.4fr;
      gap: 3rem;
    }
    #site-footer .sf-brand-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 1.3rem; font-weight: 400;
      color: #b8935a; letter-spacing: .04em;
      text-decoration: none; display: block; margin-bottom: .75rem;
    }
    #site-footer .sf-brand-tagline {
      font-size: 13px; color: rgba(255,255,255,.45);
      line-height: 1.7; margin-bottom: 1.25rem; max-width: 260px;
    }
    #site-footer .sf-contact-line {
      font-size: 12px; color: rgba(255,255,255,.4);
      line-height: 1.9; text-decoration: none; display: block;
    }
    #site-footer .sf-contact-line:hover { color: #b8935a; }
    #site-footer .sf-col-head {
      font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
      color: rgba(255,255,255,.3); margin-bottom: 1rem; font-weight: 500;
    }
    #site-footer .sf-col-subhead {
      font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
      color: rgba(255,255,255,.18); margin: .9rem 0 .4rem; font-weight: 500;
    }
    #site-footer .sf-links {
      list-style: none; margin: 0; padding: 0;
      display: flex; flex-direction: column; gap: .45rem;
    }
    #site-footer .sf-links a {
      font-size: 13px; color: rgba(255,255,255,.5);
      text-decoration: none; transition: color .2s; line-height: 1.4;
    }
    #site-footer .sf-links a:hover { color: #b8935a; }
    #site-footer .sf-links .sf-badge {
      display: inline-block; font-size: 9px; letter-spacing: .08em;
      text-transform: uppercase; background: rgba(184,147,90,.15);
      color: #b8935a; border: 1px solid rgba(184,147,90,.25);
      border-radius: 3px; padding: 1px 5px; margin-left: 5px;
      vertical-align: middle; line-height: 1.5;
    }
    #site-footer .sf-links .sf-hub-link a {
      color: #b8935a; font-size: 12px;
    }
    #site-footer .sf-bottom {
      border-top: 1px solid rgba(255,255,255,.06);
      padding: 20px 2rem;
    }
    #site-footer .sf-bottom-inner {
      max-width: 1180px; margin: 0 auto;
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: .5rem;
    }
    #site-footer .sf-legal {
      font-size: 11px; color: rgba(255,255,255,.28); line-height: 1.7;
    }
    #site-footer .sf-legal a { color: rgba(255,255,255,.28); text-decoration: none; }
    #site-footer .sf-legal a:hover { color: #b8935a; }
    #site-footer .sf-bottom-links {
      display: flex; gap: 1.5rem; flex-wrap: wrap;
    }
    #site-footer .sf-bottom-links a {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      color: rgba(255,255,255,.28); text-decoration: none; transition: color .2s;
    }
    #site-footer .sf-bottom-links a:hover { color: #b8935a; }
    @media (max-width: 900px) {
      #site-footer .sf-main {
        grid-template-columns: 1fr 1fr;
        gap: 2.5rem;
      }
    }
    @media (max-width: 540px) {
      #site-footer .sf-main {
        grid-template-columns: 1fr;
        padding: 40px 1.25rem 32px;
      }
      #site-footer .sf-bottom-inner { flex-direction: column; align-items: flex-start; }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const year = new Date().getFullYear();

  const footer = document.createElement('footer');
  footer.id = 'site-footer';
  footer.innerHTML = `
    <div class="sf-main">

      <!-- BRAND -->
      <div class="sf-brand">
        <a href="/" class="sf-brand-name">AustinTXHomes</a>
        <p class="sf-brand-tagline">Licensed Austin TX Realtor. Expert buyer &amp; seller representation across all of greater Austin.</p>
        <a href="tel:+12547182567" class="sf-contact-line">(254) 718-2567</a>
        <a href="mailto:Luke@austinmdg.com" class="sf-contact-line">Luke@austinmdg.com</a>
        <span class="sf-contact-line">TREC License #788149</span>
      </div>

      <!-- SERVICES -->
      <div>
        <div class="sf-col-head">Services</div>
        <ul class="sf-links">
          <li><a href="/buy">Buy a Home in Austin</a></li>
          <li><a href="/homes-with-pool-austin">Homes with Pool in Austin</a></li>
          <li><a href="/sell">Sell Your Austin Home</a></li>
          <li><a href="/what-is-my-home-worth">What Is My Home Worth?</a></li>
          <li><a href="/rentals">Austin Rentals</a></li>
          <li><a href="/search" target="_blank" rel="noopener">Search All MLS Listings</a></li>
          <li><a href="/austin-homes-under-400k">Homes Under $400K in Austin</a></li>
          <li><a href="/austin-homes-under-500k">Homes Under $500K in Austin</a></li>
          <li><a href="/austin-homes-under-750k">Homes Under $750K in Austin</a></li>
          <li><a href="/austin-homes-under-1-million">Homes Under $1M in Austin</a></li>
          <li><a href="/austin-homes-big-yard">Austin Homes with Big Yards</a></li>
          <li><a href="/new-construction">New Construction Austin</a></li>
          <li><a href="/luxury-homes">Luxury Homes Austin TX</a></li>
          <li><a href="/investment-properties">Investment Properties</a></li>
          <li><a href="/rental-properties-for-sale-austin">Rental Properties Austin</a></li>
          <li><a href="/austin-tx-realtor">Austin TX Realtor</a></li>
          <li><a href="/commercial-real-estate-austin">Commercial Real Estate</a></li>
          <li><a href="/1031-exchange-austin">1031 Exchange Austin</a></li>
          <li><a href="/brrrr-method-austin">BRRRR Method Austin</a></li>
          <li><a href="/condos">Austin Condos for Sale</a></li>
          <li><a href="/deal-radar">Deal Radar <span class="sf-badge">New</span></a></li>
        </ul>

        <div class="sf-col-subhead">Divorce Real Estate</div>
        <ul class="sf-links">
          <li><a href="/divorce-realtor-austin">Divorce Realtor Austin</a></li>
          <li><a href="/sell-home-during-divorce-austin">Sell Home During Divorce</a></li>
          <li><a href="/buying-home-after-divorce-austin">Buy After Divorce Austin</a></li>
        </ul>

        <div class="sf-col-subhead">Sell by Home Style</div>
        <ul class="sf-links">
          <li><a href="/sell-luxury-home-austin">Sell a Luxury Home</a></li>
          <li><a href="/sell-midcentury-modern-home-austin">Sell a Mid-Century Modern</a></li>
          <li><a href="/sell-ranch-home-austin">Sell a Ranch-Style Home</a></li>
          <li><a href="/sell-contemporary-home-austin">Sell a Contemporary Home</a></li>
          <li><a href="/sell-craftsman-home-austin">Sell a Craftsman Bungalow</a></li>
          <li><a href="/sell-townhome-austin">Sell a Townhome</a></li>
          <li><a href="/sell-condo-austin">Sell a Condo</a></li>
        </ul>
      </div>

      <!-- GUIDES & MOVING -->
      <div>
        <div class="sf-col-head">Austin Guides</div>
        <ul class="sf-links">
          <li><a href="/market-report">Market Report ${year} <span class="sf-badge">Live</span></a></li>
          <li><a href="/moving-to-austin">Moving to Austin Guide</a></li>
          <li><a href="/cost-of-living">Austin Cost of Living ${year}</a></li>
          <li><a href="/first-time-buyers">First-Time Buyer Guide</a></li>
          <li><a href="/about">About Luke Allen</a></li>
          <li><a href="/about#contact">Contact Luke</a></li>
        </ul>

        <div class="sf-col-subhead">City Relocation Guides</div>
        <ul class="sf-links">
          <li class="sf-hub-link"><a href="/moving-to-austin-guides">All City Guides →</a></li>
          <li><a href="/los-angeles-to-austin">From Los Angeles</a></li>
          <li><a href="/new-york-to-austin">From New York</a></li>
          <li><a href="/chicago-to-austin">From Chicago</a></li>
          <li><a href="/sf-to-austin">From San Francisco</a></li>
          <li><a href="/seattle-to-austin">From Seattle</a></li>
          <li><a href="/phoenix-to-austin">From Phoenix &amp; Scottsdale</a></li>
          <li><a href="/denver-to-austin">From Denver</a></li>
          <li><a href="/minneapolis-to-austin">From Minneapolis</a></li>
          <li><a href="/portland-to-austin">From Portland</a></li>
          <li><a href="/boston-to-austin">From Boston</a></li>
          <li><a href="/dc-to-austin">From Washington DC</a></li>
          <li><a href="/atlanta-to-austin">From Atlanta</a></li>
        </ul>

        <div class="sf-col-subhead">Employer Relocation Guides</div>
        <ul class="sf-links">
          <li class="sf-hub-link"><a href="/employer-relocation-austin">All Employer Guides →</a></li>
          <li><a href="/apple-austin-relocation">Apple</a></li>
          <li><a href="/google-austin-relocation">Google</a></li>
          <li><a href="/tesla-austin-relocation">Tesla</a></li>
          <li><a href="/oracle-austin-relocation">Oracle</a></li>
          <li><a href="/dell-austin-relocation">Dell</a></li>
          <li><a href="/samsung-austin-relocation">Samsung</a></li>
          <li><a href="/nvidia-austin-relocation">Nvidia</a></li>
          <li><a href="/meta-austin-relocation">Meta</a></li>
          <li><a href="/amazon-austin-relocation">Amazon</a></li>
          <li><a href="/schwab-austin-relocation">Charles Schwab</a></li>
          <li><a href="/amd-austin-relocation">AMD</a></li>
          <li><a href="/indeed-austin-relocation">Indeed</a></li>
          <li><a href="/ibm-austin-relocation">IBM</a></li>
          <li><a href="/salesforce-austin-relocation">Salesforce</a></li>
        </ul>
      </div>

      <!-- NEIGHBORHOODS -->
      <div>
        <div class="sf-col-head">Neighborhoods</div>
        <ul class="sf-links">
          <li><a href="/neighborhoods/tarrytown">Tarrytown</a></li>
          <li><a href="/neighborhoods/hyde-park">Hyde Park</a></li>
          <li><a href="/neighborhoods/east-austin">East Austin</a></li>
          <li><a href="/neighborhoods/mueller">Mueller</a></li>
          <li><a href="/neighborhoods/bouldin-creek">Bouldin Creek</a></li>
          <li><a href="/neighborhoods/clarksville">Clarksville</a></li>
          <li><a href="/neighborhoods/south-congress">South Congress</a></li>
          <li><a href="/neighborhoods/westlake-hills">Westlake Hills</a></li>
          <li><a href="/neighborhoods/round-rock">Round Rock</a></li>
          <li><a href="/neighborhoods/cedar-park">Cedar Park</a></li>
          <li><a href="/neighborhoods/georgetown">Georgetown</a></li>
          <li><a href="/neighborhoods/pflugerville">Pflugerville</a></li>
          <li><a href="/neighborhoods/kyle">Kyle</a></li>
          <li><a href="/neighborhoods/leander">Leander</a></li>
          <li><a href="/neighborhoods/buda">Buda</a></li>
          <li><a href="/driftwood-tx">Driftwood TX Homes</a></li>
          <li><a href="/lago-vista-tx">Lago Vista TX Homes</a></li>
          <li><a href="/briarcliff-tx">Briarcliff TX Homes</a></li>
          <li><a href="/spicewood-tx">Spicewood TX Homes</a></li>
          <li><a href="/rob-roy-austin">Rob Roy Austin</a></li>
          <li><a href="/steiner-ranch-austin">Steiner Ranch Austin</a></li>
          <li><a href="/lakeway-tx">Lakeway TX Homes</a></li>
          <li><a href="/bee-cave-tx">Bee Cave TX Homes</a></li>
          <li><a href="/neighborhoods">Browse All 40 Neighborhoods →</a></li>
        </ul>
      </div>

    </div>

    <div class="sf-bottom">
      <div class="sf-bottom-inner">
        <p class="sf-legal">
          &copy; ${year} Austin TX Homes &nbsp;·&nbsp; Luke Allen, TREC #788149 &nbsp;·&nbsp; Austin Marketing + Development Group &nbsp;·&nbsp;
          <a href="https://www.trec.texas.gov" target="_blank" rel="noopener">Texas Real Estate Commission</a>
        </p>
        <nav class="sf-bottom-links">
          <a href="/sitemap.xml">Sitemap</a>
          <a href="/about">About</a>
          <a href="/about#contact">Contact</a>
        </nav>
      </div>
    </div>
  `;

  document.body.appendChild(footer);

})();
