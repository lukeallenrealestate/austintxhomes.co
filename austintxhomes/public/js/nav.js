/**
 * AustinTXHomes — shared site navigation
 * Included by every page. Edit this ONE file to update the nav everywhere.
 */
(function () {

  // ─── SEARCH URL ─────────────────────────────────────────────
  // Points to the idx-search app. Change this one line for production.
  const SEARCH_URL = '/search';

  // ─── CSS ────────────────────────────────────────────────────
  const css = `
    #site-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 300;
      height: 80px; background: rgba(15,15,14,.95); backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(184,147,90,.18);
      display: flex; align-items: center; justify-content: space-between; padding: 0 2rem;
      font-family: 'Inter', system-ui, sans-serif;
      box-sizing: border-box;
    }
    #site-nav * { box-sizing: border-box; }
    #site-nav .sn-logo {
      text-decoration: none; display: flex; align-items: center; flex-shrink: 0;
    }
    #site-nav .sn-logo img {
      height: 40px; width: auto;
      filter: brightness(0) invert(1);
      opacity: .92;
      transition: opacity .2s;
    }
    #site-nav .sn-logo:hover img { opacity: 1; }
    #site-nav .sn-links {
      display: flex; align-items: center; gap: 2rem; list-style: none; margin: 0; padding: 0;
    }
    #site-nav .sn-links a {
      font-size: .78rem; letter-spacing: .09em; text-transform: uppercase;
      color: rgba(255,255,255,.75); text-decoration: none; transition: color .2s;
    }
    #site-nav .sn-links a:hover, #site-nav .sn-links a.active { color: #b8935a; }
    #site-nav .sn-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    #site-nav .sn-search {
      display: flex; align-items: center; gap: 6px;
      font-size: .75rem; letter-spacing: .08em; text-transform: uppercase;
      color: rgba(255,255,255,.72); text-decoration: none; transition: all .2s;
      border: 1px solid rgba(255,255,255,.2); border-radius: 4px; padding: 7px 14px;
      white-space: nowrap;
    }
    #site-nav .sn-search svg { flex-shrink: 0; }
    #site-nav .sn-search:hover { color: #b8935a; border-color: rgba(184,147,90,.6); }
    #site-nav .sn-cta {
      background: #b8935a; color: #fff !important;
      font-size: .72rem; letter-spacing: .1em; text-transform: uppercase;
      padding: 9px 20px; border-radius: 4px; text-decoration: none;
      transition: background .2s; white-space: nowrap;
    }
    #site-nav .sn-cta:hover { background: #cda96f; }
    @media (max-width: 960px) {
      #site-nav .sn-links { display: none; }
    }
    @media (max-width: 640px) {
      #site-nav { padding: 0 1rem; }
      #site-nav .sn-search .sn-search-label { display: none; }
      #site-nav .sn-search { padding: 7px 10px; }
      #site-nav .sn-cta { padding: 8px 14px; font-size: .68rem; }
    }
    @media (max-width: 400px) {
      #site-nav .sn-search { display: none; }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── ACTIVE PAGE DETECTION ───────────────────────────────────
  const pathname = window.location.pathname;
  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  // ─── NAV LINKS ───────────────────────────────────────────────
  const links = [
    { href: '/buy',           label: 'Buy' },
    { href: '/sell',          label: 'Sell' },
    { href: '/neighborhoods', label: 'Neighborhoods' },
    { href: '/about',         label: 'About' },
  ];

  // ─── BUILD & INJECT ──────────────────────────────────────────
  const nav = document.createElement('nav');
  nav.id = 'site-nav';
  nav.innerHTML = `
    <a href="/" class="sn-logo"><img src="/images/logo.png" alt="Luke Allen — Austin Marketing + Development Group" /></a>
    <ul class="sn-links">
      ${links.map(l => `<li><a href="${l.href}"${isActive(l.href) ? ' class="active"' : ''}>${l.label}</a></li>`).join('')}
    </ul>
    <div class="sn-right">
      <a href="${SEARCH_URL}" class="sn-search" target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span class="sn-search-label">Search Listings</span>
      </a>
      <a href="/about#contact" class="sn-cta">Talk to Luke</a>
    </div>
  `;

  // Prepend as first child of body so it renders before page content
  document.body.insertBefore(nav, document.body.firstChild);

})();
