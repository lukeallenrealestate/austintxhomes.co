// Server-side renderer for individual blog post pages
// URL: /blog/:slug
// Returns a complete HTML string for the given post object

module.exports = function renderBlogPost(post) {

  const tagPills = (post.tags || []).map(t =>
    `<span class="tag">${t}</span>`
  ).join('');

  const neighborhoodSidebar = post.neighborhood ? `
    <div class="sidebar-card">
      <div class="sidebar-card-label">Neighborhood</div>
      <div class="sidebar-neighborhood-name">${post.neighborhoodName}</div>
      <div class="sidebar-neighborhood-links">
        <a href="/neighborhoods/${post.neighborhood}">Neighborhood Guide →</a>
        <a href="/neighborhoods/${post.neighborhood}/homes-for-sale">Homes for Sale →</a>
        <a href="/neighborhoods/${post.neighborhood}/best-realtor">Best Realtor →</a>
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${post.title} | Luke Allen Austin TX Realtor</title>
  <meta name="description" content="${post.excerpt}" />
  <link rel="canonical" href="https://austintxhomes.co/blog/${post.slug}" />
  <link rel="icon" href="/favicon.png" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="Austin, Texas" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${post.title} | Luke Allen Austin TX Realtor" />
  <meta property="og:description" content="${post.excerpt}" />
  <meta property="og:url" content="https://austintxhomes.co/blog/${post.slug}" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${post.title}",
    "datePublished": "${post.date}",
    "dateModified": "${post.date}",
    "author": {
      "@type": "Person",
      "name": "Luke Allen",
      "description": "Austin TX Realtor, TREC #788149"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Luke Allen – Austin TX Homes",
      "url": "https://austintxhomes.co"
    },
    "description": "${post.excerpt}",
    "url": "https://austintxhomes.co/blog/${post.slug}"
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "name": "Luke Allen – Austin TX Homes",
    "url": "https://austintxhomes.co",
    "telephone": "+12547182567",
    "email": "Luke@austinmdg.com",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "5.0",
      "reviewCount": "15",
      "bestRating": "5",
      "worstRating": "1"
    },
    "sameAs": [
      "https://share.google/hETte82InqUPvWeNC",
      "https://www.linkedin.com/in/lukeallentx/",
      "https://www.instagram.com/lukeallenrealty/",
      "https://www.tiktok.com/@austintxapartments"
    ]
  }
  </script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://austintxhomes.co/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://austintxhomes.co/blog" },
      { "@type": "ListItem", "position": 3, "name": "${post.title}", "item": "https://austintxhomes.co/blog/${post.slug}" }
    ]
  }
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --gold: #b8935a; --gold-lt: #cda96f; --gold-pale: #f5ede0;
      --ink: #0f0f0e; --text: #1a1918; --mid: #5c5b57; --light: #999690;
      --bg: #ffffff; --warm: #faf8f4; --cream: #f1ece3; --border: #e5dfd4;
      --r: 4px; --w: 1180px;
    }
    body { font-family: 'Inter', sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }

    /* ── HERO STRIP (warm bg) ── */
    .post-hero {
      margin-top: 64px;
      background: var(--warm);
      border-bottom: 1px solid var(--border);
      padding: 56px 32px 48px;
    }
    .post-hero-inner { max-width: 820px; margin: 0 auto; }
    .breadcrumb {
      font-size: 12px; color: var(--light); margin-bottom: 20px;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .breadcrumb a { color: var(--light); text-decoration: none; transition: color .2s; }
    .breadcrumb a:hover { color: var(--gold); }
    .breadcrumb-sep { color: var(--border); }
    .category-pill {
      display: inline-block;
      background: var(--gold); color: #fff;
      font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
      padding: 4px 12px; border-radius: 20px;
      margin-bottom: 18px;
    }
    .post-hero h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(34px, 5vw, 52px);
      font-weight: 400; line-height: 1.15; color: var(--ink);
      margin-bottom: 20px;
    }
    .post-meta {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 12px; color: var(--mid); margin-bottom: 18px;
    }
    .post-meta-sep { color: var(--border); }
    .post-tags { display: flex; gap: 8px; flex-wrap: wrap; }
    .tag {
      font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
      padding: 4px 10px; border-radius: 20px;
      background: var(--cream); color: var(--mid);
      border: 1px solid var(--border);
    }

    /* ── CONTENT LAYOUT ── */
    .post-layout {
      max-width: 820px; margin: 0 auto;
      padding: 56px 32px 80px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 48px;
      align-items: start;
    }

    /* ── MAIN CONTENT ── */
    .post-content p { font-size: 16px; line-height: 1.85; color: var(--text); margin-bottom: 20px; }
    .post-content h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 32px; font-weight: 400;
      margin: 48px 0 16px; color: var(--ink);
    }
    .post-content h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24px; font-weight: 400;
      margin: 32px 0 12px; color: var(--ink);
    }
    .post-content strong { color: var(--ink); }
    .post-content a {
      color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3);
      transition: border-color .2s;
    }
    .post-content a:hover { border-color: var(--gold); }
    .post-content ul,
    .post-content ol { margin: 0 0 20px 24px; font-size: 15px; line-height: 1.8; color: var(--mid); }
    .post-content .data-highlight {
      background: var(--warm);
      border-left: 3px solid var(--gold);
      padding: 20px 24px;
      margin: 28px 0;
      border-radius: 0 var(--r) var(--r) 0;
    }
    .post-content .data-highlight .stat {
      font-family: 'Cormorant Garamond', serif;
      font-size: 36px; color: var(--gold);
      display: block;
    }
    .post-content .data-highlight .stat-label {
      font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
      color: var(--mid);
    }
    .post-content table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
    .post-content th {
      background: var(--ink); color: #fff;
      padding: 10px 14px; text-align: left; font-weight: 500;
    }
    .post-content td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .post-content tr:nth-child(even) td { background: var(--warm); }

    /* ── SIDEBAR ── */
    .post-sidebar { position: sticky; top: 84px; }
    .sidebar-card {
      background: var(--warm);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .sidebar-card-label {
      font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
      color: var(--light); margin-bottom: 12px;
    }
    .sidebar-author-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px; font-weight: 400; color: var(--ink);
      margin-bottom: 4px;
    }
    .sidebar-author-title { font-size: 12px; color: var(--mid); margin-bottom: 8px; line-height: 1.5; }
    .sidebar-author-rating {
      font-size: 12px; color: var(--gold); margin-bottom: 14px;
    }
    .sidebar-author-links { display: flex; flex-direction: column; gap: 8px; }
    .sidebar-author-links a {
      font-size: 12px; color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 2px;
      transition: border-color .2s; display: inline-block;
    }
    .sidebar-author-links a:hover { border-color: var(--gold); }
    .sidebar-btn {
      display: block; width: 100%;
      background: var(--gold); color: #fff; border: none; cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: .1em;
      text-transform: uppercase; padding: 12px 20px; border-radius: var(--r);
      text-decoration: none; text-align: center;
      transition: background .2s; margin-top: 14px;
    }
    .sidebar-btn:hover { background: var(--gold-lt); }
    .sidebar-neighborhood-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 20px; font-weight: 400; color: var(--ink); margin-bottom: 12px;
    }
    .sidebar-neighborhood-links { display: flex; flex-direction: column; gap: 8px; }
    .sidebar-neighborhood-links a {
      font-size: 12px; color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 2px;
      transition: border-color .2s; display: inline-block;
    }
    .sidebar-neighborhood-links a:hover { border-color: var(--gold); }
    .sidebar-cta {
      background: var(--gold);
      border-radius: 6px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .sidebar-cta-label {
      font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
      color: rgba(255,255,255,.7); margin-bottom: 10px;
    }
    .sidebar-cta-heading {
      font-family: 'Cormorant Garamond', serif;
      font-size: 20px; font-weight: 400; color: #fff; line-height: 1.3; margin-bottom: 14px;
    }
    .sidebar-cta-btn {
      display: block; width: 100%;
      background: #fff; color: var(--gold); border: none; cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: .1em;
      text-transform: uppercase; padding: 11px 20px; border-radius: var(--r);
      text-decoration: none; text-align: center;
      transition: opacity .2s;
    }
    .sidebar-cta-btn:hover { opacity: .88; }

    /* ── AUTHOR BIO STRIP ── */
    .author-bio {
      background: var(--warm);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 56px 32px;
    }
    .author-bio-inner {
      max-width: 820px; margin: 0 auto;
      display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: center;
    }
    .author-bio-avatar {
      width: 80px; height: 80px; border-radius: 50%;
      background: var(--cream); border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Cormorant Garamond', serif;
      font-size: 28px; color: var(--gold); flex-shrink: 0;
    }
    .author-bio-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24px; font-weight: 400; color: var(--ink); margin-bottom: 4px;
    }
    .author-bio-title { font-size: 12px; color: var(--mid); margin-bottom: 12px; }
    .author-bio-text { font-size: 14px; color: var(--mid); line-height: 1.75; margin-bottom: 14px; }
    .author-bio-links { display: flex; gap: 20px; flex-wrap: wrap; }
    .author-bio-links a {
      font-size: 12px; color: var(--gold); text-decoration: none;
      border-bottom: 1px solid rgba(184,147,90,.3); padding-bottom: 2px;
      transition: border-color .2s;
    }
    .author-bio-links a:hover { border-color: var(--gold); }

    /* ── CONTACT SECTION (dark) ── */
    .contact-section { padding: 80px 32px; background: var(--ink); }
    .contact-inner {
      max-width: var(--w); margin: 0 auto;
      display: grid; grid-template-columns: 1fr 440px; gap: 80px;
      align-items: start;
    }
    .contact-copy h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(34px, 4vw, 52px); font-weight: 400;
      color: #fff; line-height: 1.15; margin-bottom: 18px;
    }
    .contact-copy h2 em { font-style: italic; color: var(--gold-lt); }
    .contact-copy p { font-size: 14px; color: rgba(255,255,255,.6); line-height: 1.8; margin-bottom: 14px; }
    .contact-badges { display: flex; gap: 10px; flex-wrap: wrap; margin: 28px 0 20px; }
    .contact-badge {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      padding: 6px 14px; border-radius: 24px;
      border: 1px solid rgba(184,147,90,.35); color: var(--gold);
    }
    .contact-reviews-link {
      font-size: 12px; color: rgba(255,255,255,.4);
      text-decoration: none; border-bottom: 1px solid rgba(255,255,255,.15);
      transition: color .2s;
    }
    .contact-reviews-link:hover { color: var(--gold); }
    .contact-form-card {
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px; padding: 36px;
    }
    .contact-form-card h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 26px; color: #fff; margin-bottom: 6px;
    }
    .contact-form-card > p {
      font-size: 13px; color: rgba(255,255,255,.4); margin-bottom: 24px;
    }
    .form-group { margin-bottom: 14px; }
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%; padding: 11px 14px;
      border: 1px solid rgba(255,255,255,.15); border-radius: var(--r);
      font-family: 'Inter', sans-serif; font-size: 13px;
      color: #fff; background: rgba(255,255,255,.08);
      outline: none; transition: border-color .2s; resize: vertical;
    }
    .form-group input::placeholder,
    .form-group textarea::placeholder { color: rgba(255,255,255,.3); }
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus { border-color: var(--gold); }
    .form-group select option { background: #1a1918; }
    .form-submit {
      width: 100%; background: var(--gold); color: #fff; border: none;
      cursor: pointer; font-family: 'Inter', sans-serif; font-size: 11px;
      letter-spacing: .1em; text-transform: uppercase;
      padding: 14px; border-radius: var(--r); transition: background .2s; margin-top: 6px;
    }
    .form-submit:hover { background: var(--gold-lt); }

    /* ── RESPONSIVE ── */
    @media (max-width: 820px) {
      .post-layout { grid-template-columns: 1fr; padding: 40px 24px 64px; }
      .post-sidebar { position: static; }
      .author-bio-inner { grid-template-columns: 1fr; }
      .author-bio-avatar { display: none; }
      .contact-inner { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      .post-hero { padding: 40px 20px 36px; }
      .post-layout { padding: 32px 20px 56px; }
      .author-bio { padding: 40px 20px; }
      .contact-section { padding: 56px 20px; }
    }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

  <!-- ── POST HERO (warm bg) ── -->
  <section class="post-hero">
    <div class="post-hero-inner">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="breadcrumb-sep">/</span>
        <a href="/blog">Blog</a>
        <span class="breadcrumb-sep">/</span>
        <span>${post.category}</span>
      </nav>
      <div class="category-pill">${post.category}</div>
      <h1>${post.title}</h1>
      <div class="post-meta">
        <span>By Luke Allen</span>
        <span class="post-meta-sep">·</span>
        <span>TREC #788149</span>
        <span class="post-meta-sep">·</span>
        <time datetime="${post.date}">${post.dateFormatted}</time>
        <span class="post-meta-sep">·</span>
        <span>${post.readTime}</span>
      </div>
      ${post.tags && post.tags.length ? `<div class="post-tags">${tagPills}</div>` : ''}
    </div>
  </section>

  <!-- ── POST CONTENT + SIDEBAR ── -->
  <div class="post-layout">
    <!-- Main content -->
    <main>
      <div class="post-content">${post.content}</div>
    </main>

    <!-- Sidebar -->
    <aside class="post-sidebar">
      <!-- Author card -->
      <div class="sidebar-card">
        <div class="sidebar-card-label">About the Author</div>
        <div class="sidebar-author-name">Luke Allen</div>
        <div class="sidebar-author-title">Austin TX Realtor · TREC #788149</div>
        <div class="sidebar-author-rating">5.0 ★ on Google · 15 Reviews</div>
        <div class="sidebar-author-links">
          <a href="https://share.google/hETte82InqUPvWeNC" target="_blank" rel="noopener">Read Google Reviews →</a>
        </div>
        <a href="#contact" class="sidebar-btn">Contact Luke →</a>
      </div>

      ${neighborhoodSidebar}

      <!-- Free consultation CTA -->
      <div class="sidebar-cta">
        <div class="sidebar-cta-label">Free Consultation</div>
        <div class="sidebar-cta-heading">Buying or selling in Austin? Talk to Luke Allen.</div>
        <a href="#contact" class="sidebar-cta-btn">Schedule a Call →</a>
      </div>
    </aside>
  </div>

  <!-- ── AUTHOR BIO STRIP ── -->
  <div class="author-bio">
    <div class="author-bio-inner">
      <div class="author-bio-avatar">LA</div>
      <div>
        <div class="author-bio-name">Luke Allen</div>
        <div class="author-bio-title">Austin TX Realtor · TREC #788149 · Austin Marketing + Development Group</div>
        <p class="author-bio-text">Luke Allen is a licensed Austin TX realtor specializing in Central Austin neighborhoods — Tarrytown, Hyde Park, Clarksville, Mueller, and beyond. 5.0 ★ on Google. TREC #788149.</p>
        <div class="author-bio-links">
          <a href="https://share.google/hETte82InqUPvWeNC" target="_blank" rel="noopener">Google Reviews</a>
          <a href="/about">About Luke</a>
          <a href="/austin-tx-realtor">Austin TX Realtor</a>
        </div>
      </div>
    </div>
  </div>

  <!-- ── CONTACT FORM (dark) ── -->
  <section class="contact-section" id="contact">
    <div class="contact-inner">
      <div class="contact-copy">
        <h2>Work With<br><em>Luke Allen</em></h2>
        <p>Whether you're buying, selling, or just starting to explore the Austin market, Luke Allen is ready to help. TREC licensed, 5.0 ★ on Google, and personally hands-on with every client.</p>
        <p>No assistants, no team handoffs — you work directly with Luke Allen from the first conversation through close.</p>
        <div class="contact-badges">
          <span class="contact-badge">5.0 ★ Google</span>
          <span class="contact-badge">TREC #788149</span>
          <span class="contact-badge">Central Austin Specialist</span>
          <span class="contact-badge">15 Five-Star Reviews</span>
        </div>
        <a href="https://share.google/hETte82InqUPvWeNC" target="_blank" rel="noopener" class="contact-reviews-link">Read Luke Allen's 15 five-star Google reviews →</a>
      </div>
      <div class="contact-form-card">
        <h3>Talk to Luke Allen</h3>
        <p>Tell Luke a little about what you're working on.</p>
        <form id="blog-contact-form">
          <input type="hidden" name="source" value="blog-post" />
          <input type="hidden" name="post_slug" value="${post.slug}" />
          <div class="form-group"><input type="text" name="name" placeholder="Your name" required /></div>
          <div class="form-group"><input type="text" name="contact" placeholder="Phone or email" required /></div>
          <div class="form-group">
            <select name="intent">
              <option value="">What are you looking for?</option>
              <option value="buy">Buy a home in Austin</option>
              <option value="sell">Sell my home</option>
              <option value="both">Both</option>
              <option value="questions">Just have questions</option>
            </select>
          </div>
          <div class="form-group">
            <textarea name="notes" placeholder="Notes (optional)" rows="3"></textarea>
          </div>
          <button type="submit" class="form-submit">Talk to Luke Allen →</button>
        </form>
      </div>
    </div>
  </section>

<script src="/js/footer.js"></script>

  <script>
    document.getElementById('blog-contact-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(this));
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          this.innerHTML = '<p style="text-align:center;padding:40px 0;color:var(--gold-lt);font-family:Cormorant Garamond,serif;font-size:22px;line-height:1.5">Got it — Luke Allen will be in touch within 24 hours.</p>';
        } else {
          alert('Something went wrong. Please call or email Luke Allen directly.');
        }
      } catch {
        alert('Something went wrong. Please call (254) 718-2567 or email Luke@austinmdg.com.');
      }
    });
  </script>
</body>
</html>`;
};
