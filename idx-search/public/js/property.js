let currentListing = null;
let currentPhotoIndex = 0;
let googleMap = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Support both new clean URLs (/property/KEY) and legacy (?id=KEY)
  const listingKey = window.__LISTING_KEY__ || new URLSearchParams(window.location.search).get('id');
  if (!listingKey) { showError(); return; }

  await loadListing(listingKey);
  loadGoogleMaps();
});

async function loadListing(listingKey) {
  try {
    const res = await fetch(`/api/properties/${listingKey}`);
    if (!res.ok) { showError(); return; }
    currentListing = await res.json();
    renderDetail(currentListing);
    loadSimilar(listingKey);

    // Update page title
    document.title = `${currentListing.unparsed_address || 'Property'} — Austin TX Homes`;

    // Set heart state
    await FavoritesCache.load();
    const heartBtn = document.getElementById('detail-heart');
    if (heartBtn && FavoritesCache.has(listingKey)) {
      heartBtn.classList.add('active');
    }
  } catch (err) {
    showError();
    console.error(err);
  }
}

function renderDetail(listing) {
  // Gallery
  renderGallery(listing.photos || []);

  // Price
  document.getElementById('detail-price').textContent = listing.list_price
    ? '$' + Number(listing.list_price).toLocaleString() : 'Price N/A';
  document.getElementById('sidebar-price').textContent = listing.list_price
    ? '$' + Number(listing.list_price).toLocaleString() : '';

  // Monthly payment estimate (assuming 20% down, 7% rate, 30yr)
  if (listing.list_price) {
    const principal = listing.list_price * 0.8;
    const rate = 0.07 / 12;
    const n = 360;
    const payment = principal * rate / (1 - Math.pow(1 + rate, -n));
    document.getElementById('sidebar-payment').textContent = `Est. $${Math.round(payment).toLocaleString()}/mo`;
  }

  // Status
  const statusEl = document.getElementById('detail-status');
  statusEl.textContent = listing.standard_status || 'Active';
  statusEl.className = `card-status ${getStatusClass(listing.standard_status)}`;

  // DOM
  const domEl = document.getElementById('detail-dom');
  const domDays = listing.days_on_market != null ? listing.days_on_market
    : listing.listing_contract_date ? Math.max(0, Math.floor((Date.now() - new Date(listing.listing_contract_date).getTime()) / 86400000))
    : null;
  if (domDays != null) {
    domEl.textContent = domDays === 0 ? 'Listed today' : `${domDays} days on market`;
  }

  // Address
  const addr = [
    listing.unparsed_address,
    listing.city,
    listing.state_or_province,
    listing.postal_code
  ].filter(Boolean).join(', ');
  document.getElementById('detail-address').textContent = addr;

  // Stats bar
  const stats = [];
  if (listing.bedrooms_total) stats.push({ value: listing.bedrooms_total, label: 'Beds' });
  if (listing.bathrooms_full) stats.push({ value: listing.bathrooms_full + (listing.bathrooms_half ? ` / ${listing.bathrooms_half}` : ''), label: 'Full / Half Baths' });
  if (listing.living_area) stats.push({ value: Math.round(listing.living_area).toLocaleString(), label: 'Sqft' });
  if (listing.lot_size_acres) stats.push({ value: listing.lot_size_acres.toFixed(2), label: 'Acres' });
  if (domDays != null) stats.push({ value: domDays === 0 ? 'Today' : domDays, label: domDays === 0 ? 'Listed' : 'Days on Market' });

  document.getElementById('detail-stats').innerHTML = stats.map(s =>
    `<div class="detail-stat"><div class="value">${s.value}</div><div class="label">${s.label}</div></div>`
  ).join('');

  // Description
  const descEl = document.getElementById('detail-description');
  if (listing.public_remarks) {
    descEl.textContent = listing.public_remarks;
    document.getElementById('show-more-btn').style.display =
      listing.public_remarks.length > 300 ? 'block' : 'none';
  } else {
    descEl.textContent = 'No description available.';
    document.getElementById('show-more-btn').style.display = 'none';
  }

  // Property facts
  const facts = [
    { label: 'Property Type', value: listing.property_type },
    { label: 'Style', value: listing.property_sub_type },
    { label: 'Year Built', value: listing.year_built },
    { label: 'Garage Spaces', value: listing.garage_spaces },
    { label: 'Stories', value: listing.stories },
    { label: 'Parking Total', value: listing.parking_total },
    { label: 'Lot Size', value: listing.lot_size_sqft ? Math.round(listing.lot_size_sqft).toLocaleString() + ' sqft' : listing.lot_size_acres ? listing.lot_size_acres.toFixed(3) + ' acres' : null },
    { label: 'Subdivision', value: listing.subdivision_name },
    { label: 'County', value: listing.county },
    { label: 'HOA Fee', value: listing.association_fee ? `$${listing.association_fee.toLocaleString()}/${listing.association_fee_frequency || 'mo'}` : null },
    { label: 'Annual Tax', value: listing.tax_annual_amount ? `$${Math.round(listing.tax_annual_amount).toLocaleString()}` : null },
    { label: 'Pool', value: listing.pool_features && listing.pool_features.toLowerCase() !== 'none' ? listing.pool_features : null },
    { label: 'Waterfront', value: listing.waterfront_yn ? 'Yes' : null },
    { label: 'New Construction', value: listing.new_construction_yn ? 'Yes' : null },
    { label: 'MLS #', value: listing.listing_id },
  ].filter(f => f.value);

  document.getElementById('detail-facts').innerHTML = facts.map(f =>
    `<div class="fact-item"><div class="fact-label">${f.label}</div><div class="fact-value">${f.value}</div></div>`
  ).join('');

  // Schools
  const schools = [
    { label: 'Elementary', value: listing.elementary_school },
    { label: 'Middle School', value: listing.middle_school },
    { label: 'High School', value: listing.high_school },
    { label: 'District', value: listing.school_district },
  ].filter(s => s.value);

  if (schools.length) {
    document.getElementById('schools-section').style.display = '';
    document.getElementById('detail-schools').innerHTML = schools.map(s =>
      `<div class="fact-item"><div class="fact-label">${s.label}</div><div class="fact-value">${s.value}</div></div>`
    ).join('');
  }

  // Agent info
  const agentName = listing.list_agent_full_name || 'Austin TX Homes';
  document.getElementById('agent-avatar').textContent = agentName.charAt(0).toUpperCase();
  document.getElementById('agent-name').textContent = agentName;
  document.getElementById('agent-office').textContent = listing.list_office_name || '';

  // Show content
  document.getElementById('detail-content').style.display = 'grid';
}

function renderGallery(photos) {
  const galleryEl = document.getElementById('gallery');
  if (!photos.length) {
    galleryEl.innerHTML = `<div class="gallery-empty">No photos available</div>`;
    return;
  }

  const grid = photos.slice(1, 5);
  const showBtn = photos.length > 1
    ? `<button class="gallery-show-all" onclick="openPhotoModal(0)">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
         Show all ${photos.length} photos
       </button>`
    : '';

  galleryEl.innerHTML = `
    <div class="gallery-grid${grid.length === 0 ? ' gallery-single' : ''}">
      <div class="gallery-main" onclick="openPhotoModal(0)">
        <img src="${photos[0]}" alt="Property photo" onerror="this.outerHTML='<div class=\\'gallery-no-photo\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'48\\' height=\\'48\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg><span>No Photo Available</span></div>'" />
      </div>
      ${grid.length > 0 ? `
        <div class="gallery-thumbs-grid">
          ${grid.map((p, i) => `
            <div class="gallery-thumb-cell" onclick="openPhotoModal(${i + 1})">
              <img src="${p}" alt="" loading="lazy" onerror="this.style.display='none'" />
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
    ${showBtn}
  `;
}

// ---- Full-screen photo modal ----
function openPhotoModal(startIdx) {
  const photos = currentListing?.photos;
  if (!photos?.length) return;
  currentPhotoIndex = startIdx;

  let modal = document.getElementById('photo-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'photo-modal';
    modal.className = 'photo-modal';
    modal.innerHTML = `
      <div class="photo-modal-overlay" onclick="closePhotoModal()"></div>
      <button class="photo-modal-close" onclick="closePhotoModal()">✕</button>
      <button class="photo-modal-prev" onclick="modalPrev()">‹</button>
      <button class="photo-modal-next" onclick="modalNext()">›</button>
      <div class="photo-modal-inner">
        <img id="modal-img" src="" alt="" />
        <div class="photo-modal-counter" id="modal-counter"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  updateModal();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function updateModal() {
  const photos = currentListing?.photos;
  if (!photos) return;
  document.getElementById('modal-img').src = photos[currentPhotoIndex];
  document.getElementById('modal-counter').textContent = `${currentPhotoIndex + 1} / ${photos.length}`;
}

function modalPrev() {
  const photos = currentListing?.photos;
  if (!photos) return;
  currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
  updateModal();
}

function modalNext() {
  const photos = currentListing?.photos;
  if (!photos) return;
  currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
  updateModal();
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  const modal = document.getElementById('photo-modal');
  if (!modal?.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') modalPrev();
  if (e.key === 'ArrowRight') modalNext();
  if (e.key === 'Escape') closePhotoModal();
});

function toggleDesc() {
  const desc = document.getElementById('detail-description');
  const btn = document.getElementById('show-more-btn');
  const isCollapsed = desc.classList.contains('desc-truncated');
  desc.classList.toggle('desc-truncated', !isCollapsed);
  btn.textContent = isCollapsed ? 'Show less ▲' : 'Show more ▼';
}

async function loadSimilar(listingKey) {
  try {
    const res = await fetch(`/api/properties/${listingKey}/similar`);
    const similar = await res.json();
    const grid = document.getElementById('similar-listings');
    if (similar.length) {
      grid.innerHTML = similar.map(renderPropertyCard).join('');
    } else {
      document.getElementById('similar-section').style.display = 'none';
    }
  } catch {}
}

async function toggleDetailFavorite() {
  const btn = document.getElementById('detail-heart');
  const key = currentListing?.listing_key;
  if (!key) return;

  const saved = await FavoritesCache.toggle(key);
  if (saved === false && !Auth.isLoggedIn()) return;
  btn.classList.toggle('active', saved);
  showToast(saved ? 'Saved to favorites ❤' : 'Removed from favorites', saved ? 'success' : '');
}

function showError() {
  document.getElementById('gallery').style.display = 'none';
  document.getElementById('detail-error').style.display = 'block';
}

async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  data.listing = currentListing?.unparsed_address || 'Unknown';
  data.listingKey = currentListing?.listing_key;
  data.listPrice = currentListing?.list_price;

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      showToast('Message sent! We\'ll be in touch shortly.', 'success');
      form.reset();
    } else {
      showToast('Failed to send. Please try again.', 'error');
    }
  } catch {
    showToast('Failed to send. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Request Info';
  }
}

// Google Maps for detail page
async function loadGoogleMaps() {
  const res = await fetch('/api/config');
  const config = await res.json();
  if (!config.googleMapsKey) return;

  window.initDetailMap = initDetailMap;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsKey}&callback=initDetailMap`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function initDetailMap() {
  if (!currentListing?.latitude || !currentListing?.longitude) return;

  const mapEl = document.getElementById('detail-map');
  const map = new google.maps.Map(mapEl, {
    center: { lat: currentListing.latitude, lng: currentListing.longitude },
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: true,
    fullscreenControl: false
  });

  new google.maps.Marker({
    position: { lat: currentListing.latitude, lng: currentListing.longitude },
    map,
    title: currentListing.unparsed_address
  });
}
