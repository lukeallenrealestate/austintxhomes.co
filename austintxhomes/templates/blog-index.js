// Server-side renderer for the blog index page
// URL: /blog
// Returns a complete HTML string
// posts — array of post objects (published: true, sorted newest first)
// options — { category: string|null, page: number, totalPages: number }

module.exports = function renderBlogIndex(posts, options) {
  const { category = null, page = 1, totalPages = 1 } = options || {};

  const categories = ['Market Update', 'Neighborhood Guide', 'Buyer Tips', 'Seller Tips', 'Austin Life'];

  const categoryFilterPills = categories.map(cat => {
    const slug = cat.toLowerCase().replace(/\s+/g, '-');
    const isActive = category === cat;
    return `<a href="/blog${cat ? '?category=' + encodeURIComponent(cat) : ''}"
        class="cat-pill${isActive ? ' cat-pill--active' : ''}">${cat}</a>`;
  }).join('');

  const allPill = `<a href="/blog" class="cat-pill${!category ? ' cat-pill--active' : ''}">All</a>`;

  const postCards = posts.map(post => {
    const isMarketUpdate = post.category === 'Market Update';
    const categoryPillClass = isMarketUpdate ? 'post-card-cat post-card-cat--gold' : 'post-card-cat';
    const tagPills = (post.tags || []).slice(0, 3).map(t =>
      `<span class="post-card-tag">${t}</span>`
    ).join('');
    const neighborhoodBadge = post.neighborhoodName
      ? `<span class="post-card-neighborhood">${post.neighborhoodName}</span>`
      : '';

    return `
    <a href="/blog/${post.slug}" class="post-card">
      <div class="post-card-header">
        <span class="${categoryPillClass}">${post.category}</span>
        ${neighborhoodBadge}
      </div>
      <h2 class="post-card-title">${post.title}</h2>
      <div class="post-card-meta">
        <time datetime="${post.date}">${post.dateFormatted}</time>
        <span class="post-card-meta-sep">·</span>
        <span>${post.readTime}</span>
      </div>
      <p class="post-card-excerpt">${post.excerpt}</p>
      ${tagPills ? `<div class="post-card-tags">${tagPills}</div>` : ''}
      <span class="post-card-read-more">Read More →</span>
    </a>`;
  }).join('');

  const emptyState = posts.length === 0 ? `
    <div class="posts-empty">
      <p>No posts found${category ? ` in "${category}"` : ''}.</p>
      <a href="/blog">← View all posts</a>
    </div>` : '';

  // Pagination
  let paginationHtml = '';
  if (totalPages > 1) {
    const prevBtn = `<button class="page-btn" onclick="window.location='/blog?page=${page - 1}${category ? '&category=' + encodeURIComponent(category) : ''}'" ${page <= 1 ? 'disabled' : ''}>← Prev</button>`;
    const nextBtn = `<button class="page-btn" onclick="window.location='/blog?page=${page + 1}${category ? '&category=' + encodeURIComponent(category) : ''}'" ${page >= totalPages ? 'disabled' : ''}>Next →</button>`;

    let pageNumbers = '';
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        pageNumbers += `<button class="page-btn${i === page ? ' active' : ''}" onclick="window.location='/blog?page=${i}${category ? '&category=' + encodeURIComponent(category) : ''}'">  ${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        pageNumbers += `<span class="page-ellipsis">…</span>`;
      }
    }

    paginationHtml = `
    <div class="pagination">
      ${prevBtn}
      ${pageNumbers}
      ${nextBtn}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Austin TX Real Estate Blog | Market Updates &amp; Neighborhood Guides | Luke Allen</title>
  <meta name="description" content="Austin TX real estate insights from Luke Allen — neighborhood market updates, buyer tips, seller guides, and local Austin coverage. Updated weekly." />
  <link rel="canonical" href="https://austintxhomes.co/blog" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/favicon-96.png" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="geo.region" content="US-TX" />
  <meta name="geo.placename" content="Austin, Texas" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Austin TX Real Estate Blog | Market Updates &amp; Neighborhood Guides | Luke Allen" />
  <meta property="og:description" content="Austin TX real estate insights from Luke Allen — neighborhood market updates, buyer tips, seller guides, and local Austin coverage. Updated weekly." />
  <meta property="og:url" content="https://austintxhomes.co/blog" />
  <meta property="og:image" content="https://austintxhomes.co/images/luke-allen.jpg" />
  <meta name="twitter:card" content="summary_large_image" />

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
    "@type": "Blog",
    "name": "Austin TX Real Estate Blog by Luke Allen",
    "url": "https://austintxhomes.co/blog",
    "author": {
      "@type": "Person",
      "name": "Luke Allen"
    }
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

    /* ── HERO (dark --ink with gold glow) ── */
    .blog-hero {
      margin-top: 64px;
      background: var(--ink);
      background-image: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(184,147,90,.18) 0%, transparent 70%);
      padding: 80px 32px 72px;
      text-align: center;
    }
    .blog-hero-eyebrow {
      font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--gold); margin-bottom: 16px;
    }
    .blog-hero h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(44px, 7vw, 72px);
      font-weight: 400; line-height: 1.1; color: #fff;
      margin-bottom: 20px;
    }
    .blog-hero h1 em { font-style: italic; color: var(--gold-lt); }
    .blog-hero-sub {
      font-size: 15px; color: rgba(255,255,255,.6);
      max-width: 560px; margin: 0 auto 40px; line-height: 1.75;
    }

    /* ── CATEGORY FILTER PILLS ── */
    .cat-filters {
      display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
    }
    .cat-pill {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      padding: 7px 16px; border-radius: 24px;
      border: 1px solid rgba(255,255,255,.18); color: rgba(255,255,255,.7);
      text-decoration: none; transition: all .2s;
    }
    .cat-pill:hover { border-color: var(--gold); color: var(--gold-lt); }
    .cat-pill--active { background: var(--gold); border-color: var(--gold); color: #fff; }

    /* ── POSTS SECTION ── */
    .posts-section { padding: 72px 32px 80px; }
    .posts-inner { max-width: var(--w); margin: 0 auto; }
    .posts-heading-row {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 40px; gap: 16px; flex-wrap: wrap;
    }
    .posts-heading {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(28px, 4vw, 40px); font-weight: 400; color: var(--ink);
    }
    .posts-count { font-size: 13px; color: var(--light); }

    /* ── POST CARDS GRID ── */
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .post-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 28px 24px 24px;
      text-decoration: none;
      color: var(--text);
      display: flex; flex-direction: column;
      transition: box-shadow .25s, transform .25s;
      position: relative;
    }
    .post-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,.08); transform: translateY(-2px); }
    .post-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px; gap: 8px;
    }
    .post-card-cat {
      font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 20px;
      background: var(--cream); color: var(--mid);
      border: 1px solid var(--border);
      white-space: nowrap;
    }
    .post-card-cat--gold { background: var(--gold); color: #fff; border-color: var(--gold); }
    .post-card-neighborhood {
      font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
      padding: 3px 9px; border-radius: 20px;
      background: transparent; color: var(--gold);
      border: 1px solid rgba(184,147,90,.4);
      white-space: nowrap;
    }
    .post-card-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 22px; font-weight: 400; line-height: 1.25;
      color: var(--ink); margin-bottom: 10px;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .post-card:hover .post-card-title { color: var(--gold); }
    .post-card-meta {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; color: var(--light); margin-bottom: 12px;
    }
    .post-card-meta-sep { color: var(--border); }
    .post-card-excerpt {
      font-size: 13px; line-height: 1.7; color: var(--mid);
      margin-bottom: 14px; flex: 1;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .post-card-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .post-card-tag {
      font-size: 9px; letter-spacing: .08em; text-transform: uppercase;
      padding: 2px 8px; border-radius: 10px;
      background: var(--warm); color: var(--light);
    }
    .post-card-read-more {
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
      color: var(--gold); font-weight: 500; margin-top: auto;
    }

    /* ── EMPTY STATE ── */
    .posts-empty {
      grid-column: 1 / -1; text-align: center;
      padding: 64px 32px; color: var(--mid); font-size: 14px; line-height: 1.8;
    }
    .posts-empty a { color: var(--gold); text-decoration: none; }
    .posts-empty a:hover { text-decoration: underline; }

    /* ── PAGINATION ── */
    .pagination {
      display: flex; gap: 8px; align-items: center;
      justify-content: center; margin-top: 56px; flex-wrap: wrap;
    }
    .page-btn {
      padding: 8px 14px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text);
      font-family: 'Inter', sans-serif; font-size: 13px;
      border-radius: var(--r); cursor: pointer; transition: all .2s;
    }
    .page-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
    .page-btn.active { background: var(--gold); color: #fff; border-color: var(--gold); }
    .page-btn:disabled { opacity: .4; cursor: not-allowed; }
    .page-ellipsis { color: var(--light); padding: 0 4px; }

    /* ── CTA STRIP (warm bg) ── */
    .blog-cta {
      background: var(--warm);
      border-top: 1px solid var(--border);
      padding: 72px 32px;
      text-align: center;
    }
    .blog-cta-eyebrow {
      font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--gold); margin-bottom: 12px;
    }
    .blog-cta h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(28px, 4vw, 40px); font-weight: 400;
      color: var(--ink); margin-bottom: 10px; line-height: 1.2;
    }
    .blog-cta-sub {
      font-size: 14px; color: var(--mid); margin-bottom: 32px; max-width: 440px; margin-left: auto; margin-right: auto;
      line-height: 1.7;
    }
    .blog-subscribe-form {
      display: flex; gap: 10px; justify-content: center;
      flex-wrap: wrap; max-width: 480px; margin: 0 auto;
    }
    .blog-subscribe-form input {
      flex: 1; min-width: 180px; padding: 12px 16px;
      border: 1px solid var(--border); border-radius: var(--r);
      font-family: 'Inter', sans-serif; font-size: 13px; color: var(--text);
      background: var(--bg); outline: none; transition: border-color .2s;
    }
    .blog-subscribe-form input::placeholder { color: var(--light); }
    .blog-subscribe-form input:focus { border-color: var(--gold); }
    .blog-subscribe-btn {
      background: var(--gold); color: #fff; border: none;
      cursor: pointer; font-family: 'Inter', sans-serif;
      font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
      padding: 12px 24px; border-radius: var(--r); transition: background .2s;
      white-space: nowrap;
    }
    .blog-subscribe-btn:hover { background: var(--gold-lt); }
    .blog-subscribe-note {
      font-size: 11px; color: var(--light); margin-top: 12px;
    }

    /* ── RESPONSIVE ── */
    @media (max-width: 900px) {
      .posts-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .posts-grid { grid-template-columns: 1fr; }
      .blog-hero { padding: 60px 20px 56px; }
      .posts-section { padding: 48px 20px 64px; }
      .blog-cta { padding: 56px 20px; }
      .blog-subscribe-form { flex-direction: column; }
      .blog-subscribe-btn { width: 100%; }
    }
  </style>
</head>
<body>
<script src="/js/nav.js"></script>

  <!-- ── HERO ── -->
  <section class="blog-hero">
    <p class="blog-hero-eyebrow">Austin TX Real Estate</p>
    <h1>Austin TX Real Estate<br><em>Blog</em></h1>
    <p class="blog-hero-sub">Market updates, neighborhood guides, and local Austin insights from Luke Allen — TREC #788149.</p>
    <nav class="cat-filters" aria-label="Category filter">
      ${allPill}
      ${categoryFilterPills}
    </nav>
  </section>

  <!-- ── POSTS GRID ── */
  <section class="posts-section">
    <div class="posts-inner">
      <div class="posts-heading-row">
        <h2 class="posts-heading">${category ? category : 'All Posts'}</h2>
        <span class="posts-count">${posts.length} article${posts.length !== 1 ? 's' : ''}${page > 1 ? ` · Page ${page}` : ''}</span>
      </div>
      <div class="posts-grid">
        ${posts.length ? postCards : emptyState}
      </div>
      ${paginationHtml}
    </div>
  </section>

  <!-- ── EMAIL CTA STRIP ── -->
  <section class="blog-cta">
    <p class="blog-cta-eyebrow">Stay Informed</p>
    <h2>Get weekly Austin market updates<br>in your inbox</h2>
    <p class="blog-cta-sub">Luke Allen sends a short weekly note on Austin real estate — prices, inventory, neighborhood trends. No spam, unsubscribe anytime.</p>
    <form class="blog-subscribe-form" id="blog-subscribe-form">
      <input type="hidden" name="source" value="blog-subscribe" />
      <input type="text" name="name" placeholder="Your name" required />
      <input type="email" name="email" placeholder="Your email" required />
      <button type="submit" class="blog-subscribe-btn">Subscribe →</button>
    </form>
    <p class="blog-subscribe-note">From Luke Allen · TREC #788149 · Austin TX Realtor</p>
  </section>

<script src="/js/footer.js"></script>

  <script>
    document.getElementById('blog-subscribe-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(this));
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          this.innerHTML = '<p style="text-align:center;padding:20px 0;color:var(--gold);font-family:Cormorant Garamond,serif;font-size:22px;line-height:1.5">You\'re subscribed — Luke Allen will be in touch.</p>';
        } else {
          alert('Something went wrong. Please try again or email Luke@austinmdg.com.');
        }
      } catch {
        alert('Something went wrong. Please email Luke@austinmdg.com to subscribe.');
      }
    });
  </script>
</body>
</html>`;
};
