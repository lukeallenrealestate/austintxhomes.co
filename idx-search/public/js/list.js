// List view rendering
function calcDaysOnMarket(listing) {
  if (listing.days_on_market != null) return listing.days_on_market;
  if (!listing.listing_contract_date) return null;
  const ms = Date.now() - new Date(listing.listing_contract_date).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function formatDaysOnMarket(listing) {
  const dom = calcDaysOnMarket(listing);
  if (dom == null) return null;
  if (dom === 0) return 'Listed today';
  if (dom === 1) return '1 day on market';
  return `${dom} days on market`;
}

function formatPrice(price) {
  if (!price) return 'Price N/A';
  return '$' + price.toLocaleString();
}

function formatSqft(sqft) {
  if (!sqft) return '—';
  return sqft.toLocaleString() + ' sqft';
}

function getStatusClass(status) {
  if (!status) return 'status-active';
  const s = status.toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'pending') return 'status-pending';
  if (s === 'coming soon') return 'status-coming-soon';
  if (s.includes('under contract')) return 'status-under-contract';
  if (s === 'closed') return 'status-closed';
  return 'status-active';
}

function getStatusLabel(status) {
  if (!status) return 'Active';
  const s = status.toLowerCase();
  if (s.includes('under contract')) return 'Under Contract';
  return status;
}

function getFirstPhoto(photos) {
  if (!photos || !photos.length) return null;
  return photos[0];
}

function renderHeartBtn(listingKey) {
  const active = (typeof FavoritesCache !== 'undefined' && FavoritesCache.has(listingKey)) ? 'active' : '';
  return `
    <button class="heart-btn ${active}" data-key="${listingKey}" onclick="toggleFavorite(event, '${listingKey}')">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>`;
}

// Carousel render — at most 5 photos per card to cap network cost. All photos
// after the first get loading="lazy" + data-src so they don't fetch until the
// user actually swipes/clicks to them. Scroll-snap-x makes horizontal swipe
// gestures snap to whole-image positions natively (no JS swipe handler needed).
function renderCardCarousel(listing, photos) {
  if (!photos.length) {
    return `<div class="no-photo">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span>No Photo</span>
    </div>`;
  }
  const capped = photos.slice(0, 5);
  const alt = (listing.unparsed_address || '').replace(/"/g, '&quot;');
  const slides = capped.map((url, i) => {
    if (i === 0) {
      return `<img class="carousel-slide" src="${url}" alt="${alt}" loading="lazy" />`;
    }
    return `<img class="carousel-slide" data-src="${url}" alt="" loading="lazy" />`;
  }).join('');
  const dots = capped.length > 1
    ? `<div class="carousel-dots">${capped.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`
    : '';
  const navButtons = capped.length > 1
    ? `<button class="carousel-prev" aria-label="Previous photo" onclick="carouselNav(event, -1)">&#8249;</button>
       <button class="carousel-next" aria-label="Next photo" onclick="carouselNav(event, 1)">&#8250;</button>`
    : '';
  return `
    <div class="carousel-track" data-photos="${capped.length}" data-total="${photos.length}">${slides}</div>
    ${navButtons}
    ${dots}
  `;
}

function renderPropertyCard(listing) {
  const photos = listing.photos || [];
  const statusClass = getStatusClass(listing.standard_status);
  const tags = [];
  if (listing.new_construction_yn) tags.push('New Construction');
  if (listing.waterfront_yn) tags.push('Waterfront');
  if (listing.pool_features && listing.pool_features.toLowerCase() !== 'none') tags.push('Pool');
  if (listing.association_fee) tags.push('HOA');

  return `
    <article class="property-card" onclick="goToListing('${listing.listing_key}')">
      <div class="card-image card-carousel">
        ${renderCardCarousel(listing, photos)}
        <span class="card-status ${statusClass}">${getStatusLabel(listing.standard_status)}</span>
        ${photos.length > 1 ? `<span class="card-photo-count"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> ${photos.length}</span>` : ''}
        ${renderHeartBtn(listing.listing_key)}
      </div>
      <div class="card-body">
        <div class="card-price">${formatPrice(listing.list_price)}${listing.property_type && (listing.property_type.includes('Lease') || listing.property_type.includes('Rental')) ? '<span style="font-size:14px;font-weight:400;color:var(--text-light)">/mo</span>' : ''}</div>
        <div class="card-beds">
          ${listing.bedrooms_total ? `<span><strong>${listing.bedrooms_total}</strong> bd</span>` : ''}
          ${listing.bathrooms_total ? `<span><strong>${listing.bathrooms_total}</strong> ba</span>` : ''}
          ${listing.living_area ? `<span><strong>${Math.round(listing.living_area).toLocaleString()}</strong> sqft</span>` : ''}
        </div>
        <div class="card-address">${listing.unparsed_address || 'Address not available'}</div>
        <div class="card-city">${[listing.city, listing.postal_code].filter(Boolean).join(', ')}</div>
        ${formatDaysOnMarket(listing) ? `<div class="card-dom">${formatDaysOnMarket(listing)}</div>` : ''}
        ${tags.length ? `<div class="card-tags">${tags.map(t => `<span class="card-tag" data-tag="${t}">${t}</span>`).join('')}</div>` : ''}
      </div>
    </article>`;
}

// Carousel navigation. Stops propagation so clicking arrow doesn't navigate
// to the listing. Lazy-loads next image just-in-time as the user swipes.
function carouselNav(event, dir) {
  event.stopPropagation();
  event.preventDefault();
  const btn = event.currentTarget;
  const track = btn.parentElement.querySelector('.carousel-track');
  if (!track) return;
  track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
}

// Lazy-load adjacent images and keep dots in sync. Called once after cards
// render. Uses scroll event with passive listener so it doesn't block touch.
function attachCarouselListeners(container) {
  const root = container || document;
  root.querySelectorAll('.card-carousel').forEach(carousel => {
    if (carousel.dataset.listenerAttached) return;
    carousel.dataset.listenerAttached = '1';
    const track = carousel.querySelector('.carousel-track');
    const dots = carousel.querySelectorAll('.carousel-dots .dot');
    if (!track) return;

    const loadAdjacent = (idx) => {
      const imgs = track.querySelectorAll('img.carousel-slide');
      [idx, idx + 1, idx - 1].forEach(i => {
        const img = imgs[i];
        if (img && img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
      });
    };

    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      if (dots.length) dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      loadAdjacent(idx);
    }, { passive: true });
  });
}

function renderMapCard(listing) {
  // Re-use the full property card; replace its onclick so clicking highlights the map marker,
  // and add data-key for highlight tracking. Card still navigates on click via goToListing.
  const card = renderPropertyCard(listing);
  return card.replace(
    `<article class="property-card" onclick="goToListing('${listing.listing_key}')">`,
    `<article class="property-card" data-key="${listing.listing_key}" onclick="highlightFromCard('${listing.listing_key}')" onmouseenter="hoverMarker('${listing.listing_key}')" onmouseleave="unhoverMarker('${listing.listing_key}')">`
  );
}

function renderPagination(currentPage, totalPages, onPageClick) {
  if (totalPages <= 1) return '';

  const chevronL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const chevronR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  let html = '';
  html += `<button class="page-btn page-nav" onclick="${onPageClick}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>${chevronL} Prev</button>`;

  const maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  if (start > 1) {
    html += `<button class="page-btn" onclick="${onPageClick}(1)">1</button>`;
    if (start > 2) html += `<span class="page-ellipsis">···</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageClick}(${i})">${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span class="page-ellipsis">···</span>`;
    html += `<button class="page-btn" onclick="${onPageClick}(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="page-btn page-nav" onclick="${onPageClick}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next ${chevronR}</button>`;

  return html;
}

async function toggleFavorite(event, listingKey) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const saved = await FavoritesCache.toggle(listingKey);
  if (saved === false && !Auth.isLoggedIn()) return;
  btn.classList.toggle('active', saved);
  showToast(saved ? 'Saved to favorites ❤' : 'Removed from favorites', saved ? 'success' : '');
}

function goToListing(listingKey) {
  // /property/* 301-redirects to /homes/*. Linking directly to /homes/
  // avoids the redirect hop for users AND stops feeding Google duplicate
  // URL shapes (root cause of the May 2026 organic traffic drop).
  window.open(`/homes/${listingKey}`, '_blank');
}
