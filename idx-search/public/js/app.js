// Main app — search state, filters, views, map init
let currentView = 'list';
let currentPage = 1;
let currentFilters = {};
let totalResults = 0;
let googleMap = null;
let mapMarkers = [];
let drawingManager = null;
let drawnPolygon = null;
let isDrawing = false;
let drawPath = [];
let drawPolyline = null;
let markerClusterer = null;
let infoWindow = null;
let mapPins = [];
let searchDebounce = null;
let autocompleteDebounce = null;
let mapIdleTimer = null;
let gmapsLoaded = false;
let pendingMapZoom = false;

// ---- Search state persistence ----
function saveSearchState() {
  try {
    const state = {
      filters: currentFilters,
      page: currentPage,
      view: currentView,
      searchInput: document.getElementById('location-search')?.value || ''
    };
    if (googleMap) {
      const center = googleMap.getCenter();
      state.mapCenter = { lat: center.lat(), lng: center.lng() };
      state.mapZoom = googleMap.getZoom();
    }
    localStorage.setItem('searchState', JSON.stringify(state));
  } catch (e) {}
}

function restoreSearchState() {
  try {
    const saved = localStorage.getItem('searchState');
    if (!saved) return;
    const { filters, page, view, searchInput } = JSON.parse(saved);
    if (!filters) return;

    currentFilters = filters;
    currentPage = page || 1;

    if (filters.minPrice) document.getElementById('min-price').value = filters.minPrice;
    if (filters.maxPrice) document.getElementById('max-price').value = filters.maxPrice;
    if (filters.minSqft) document.getElementById('min-sqft').value = filters.minSqft;
    if (filters.maxSqft) document.getElementById('max-sqft').value = filters.maxSqft;
    if (filters.minYear) document.getElementById('min-year').value = filters.minYear;
    if (filters.maxYear) document.getElementById('max-year').value = filters.maxYear;
    if (filters.schoolDistrict) document.getElementById('school-filter').value = filters.schoolDistrict;
    if (filters.pool) document.getElementById('pool-filter').checked = true;
    if (filters.waterfront) document.getElementById('waterfront-filter').checked = true;
    if (filters.newConstruction) document.getElementById('new-construction-filter').checked = true;
    if (filters.sortBy) document.getElementById('sort-select').value = filters.sortBy;
    if (searchInput) document.getElementById('location-search').value = searchInput;

    if (filters.minBeds) {
      document.querySelectorAll('#beds-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.val === String(filters.minBeds));
      });
    }
    if (filters.minBaths) {
      document.querySelectorAll('#baths-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.val === String(filters.minBaths));
      });
    }
    if (filters.subType) {
      const types = filters.subType.split(',');
      document.querySelectorAll('#type-dropdown input[type="checkbox"]').forEach(cb => {
        cb.checked = types.includes(cb.value);
      });
    }
    if (filters.forRent === 'true') {
      document.querySelectorAll('.filter-toggle button').forEach(b => {
        b.classList.toggle('active', b.dataset.type === 'rent');
      });
    }
    if (view === 'map') switchView('map');
  } catch (e) {
    localStorage.removeItem('searchState');
  }
}

// ---- URL param pre-filtering (e.g. /?neighborhood=Barton+Hills from homepage links) ----
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const neighborhood = params.get('neighborhood');
  const zip = params.get('zip');
  const city = params.get('city');
  const q = params.get('q');
  const minPrice = params.get('minPrice');
  const subType = params.get('subType');
  const newConstruction = params.get('newConstruction');
  const forRent = params.get('forRent');

  if (zip) {
    currentFilters.zip = zip;
    delete currentFilters.neighborhood;
    delete currentFilters.city;
    const input = document.getElementById('location-search');
    if (input) input.value = zip.split(',')[0];
    zoomMapToFilter();
  } else if (city) {
    currentFilters.city = city;
    delete currentFilters.neighborhood;
    delete currentFilters.zip;
    const input = document.getElementById('location-search');
    if (input) input.value = city;
    zoomMapToFilter();
  } else if (neighborhood) {
    currentFilters.neighborhood = neighborhood;
    const input = document.getElementById('location-search');
    if (input) input.value = neighborhood;
    zoomMapToFilter();
  }
  if (q) {
    const input = document.getElementById('location-search');
    if (input) input.value = q;
  }
  if (minPrice) {
    currentFilters.minPrice = minPrice;
    const el = document.getElementById('min-price');
    if (el) el.value = minPrice;
  }
  if (subType) {
    currentFilters.subType = subType;
    document.querySelectorAll('#type-dropdown input[type="checkbox"]').forEach(cb => {
      cb.checked = subType.split(',').includes(cb.value);
    });
  }
  if (newConstruction === 'true') {
    currentFilters.newConstruction = true;
    const el = document.getElementById('new-construction-filter');
    if (el) el.checked = true;
  }
  if (forRent === 'true') {
    currentFilters.forRent = 'true';
    document.querySelectorAll('.filter-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'rent');
    });
  } else if (forRent === 'false') {
    currentFilters.forRent = 'false';
    document.querySelectorAll('.filter-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'sale');
    });
  }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  loadGoogleMaps();
  setupAutocomplete();
  restoreSearchState();
  applyUrlParams();   // override with URL params from homepage neighborhood links
  document.getElementById('view-controls').style.display = 'flex';
  applyFilters();
  setupPillListeners();

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.filter-dropdown') && !e.target.closest('.filter-btn')) {
      closeAllDropdowns();
    }
  });
});

// ---- Load Google Maps ----
async function loadGoogleMaps() {
  const res = await fetch('/api/config');
  const config = await res.json();
  if (!config.googleMapsKey) return;

  window.initMap = initMap;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsKey}&libraries=drawing,places,geometry&callback=initMap`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  // Marker Clusterer
  const clusterScript = document.createElement('script');
  clusterScript.src = 'https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
  clusterScript.async = true;
  document.head.appendChild(clusterScript);
}

function initMap() {
  gmapsLoaded = true;
  let _savedMap = null;
  try { _savedMap = JSON.parse(localStorage.getItem('searchState') || 'null'); } catch(e) {}
  googleMap = new google.maps.Map(document.getElementById('map'), {
    center: _savedMap?.mapCenter || { lat: 30.2672, lng: -97.7431 }, // Austin, TX
    zoom: _savedMap?.mapZoom || 11,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }
    ]
  });

  infoWindow = new google.maps.InfoWindow();

  // Drawing Manager
  drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: null,
    drawingControl: false,
    polygonOptions: {
      fillColor: '#1877F2',
      fillOpacity: 0.15,
      strokeWeight: 2,
      strokeColor: '#1877F2',
      editable: false
    }
  });
  drawingManager.setMap(googleMap);

  // Freehand drawing
  const mapDiv = document.getElementById('map');
  let lastDrawX = null, lastDrawY = null;
  const DRAW_THRESHOLD = 6;

  mapDiv.addEventListener('mousedown', e => {
    if (!document.getElementById('draw-btn').classList.contains('active')) return;
    e.preventDefault();
    isDrawing = true;
    drawPath = [];
    lastDrawX = e.clientX; lastDrawY = e.clientY;
    if (drawPolyline) drawPolyline.setMap(null);
    drawPolyline = new google.maps.Polyline({
      path: [], strokeColor: '#1877F2', strokeWeight: 2, map: googleMap
    });
    const pt = mapEventToLatLng(e);
    if (pt) { drawPath.push(pt); drawPolyline.getPath().push(new google.maps.LatLng(pt.lat, pt.lng)); }
  });

  mapDiv.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    const dx = e.clientX - lastDrawX, dy = e.clientY - lastDrawY;
    if (Math.sqrt(dx * dx + dy * dy) < DRAW_THRESHOLD) return;
    lastDrawX = e.clientX; lastDrawY = e.clientY;
    const pt = mapEventToLatLng(e);
    if (pt) { drawPath.push(pt); drawPolyline.getPath().push(new google.maps.LatLng(pt.lat, pt.lng)); }
  });

  function finishFreehandDraw() {
    if (!isDrawing) return;
    isDrawing = false;
    if (drawPolyline) { drawPolyline.setMap(null); drawPolyline = null; }
    const path = [...drawPath]; // capture before cancelDrawMode clears drawPath
    if (path.length < 3) { cancelDrawMode(); return; }

    drawnPolygon = new google.maps.Polygon({
      paths: path, fillColor: '#1877F2', fillOpacity: 0.15,
      strokeWeight: 2, strokeColor: '#1877F2', editable: false, map: googleMap
    });

    cancelDrawMode();
    document.getElementById('clear-draw-btn').style.display = 'flex';

    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    currentFilters.north = bounds.getNorthEast().lat();
    currentFilters.south = bounds.getSouthWest().lat();
    currentFilters.east = bounds.getNorthEast().lng();
    currentFilters.west = bounds.getSouthWest().lng();
    currentFilters.polygon = JSON.stringify(path);
    currentPage = 1;
    loadMapPins();
    loadMapCards();
  }

  mapDiv.addEventListener('mouseup', finishFreehandDraw);
  mapDiv.addEventListener('mouseleave', finishFreehandDraw);

  // Restore drawn polygon from saved state
  if (currentFilters.polygon) {
    try {
      const path = JSON.parse(currentFilters.polygon);
      drawnPolygon = new google.maps.Polygon({
        paths: path,
        fillColor: '#1877F2',
        fillOpacity: 0.15,
        strokeWeight: 2,
        strokeColor: '#1877F2',
        editable: false,
        map: googleMap
      });
      document.getElementById('clear-draw-btn').style.display = 'flex';
    } catch(e) {}
  }

  google.maps.event.addListener(drawingManager, 'polygoncomplete', polygon => {
    drawnPolygon = polygon;
    drawingManager.setDrawingMode(null);
    document.getElementById('draw-btn').classList.remove('active');
    document.getElementById('clear-draw-btn').style.display = 'flex';

    // Get polygon bounds as bounding box for API, then pass polygon for filtering
    const bounds = new google.maps.LatLngBounds();
    polygon.getPath().forEach(p => bounds.extend(p));
    currentFilters.north = bounds.getNorthEast().lat();
    currentFilters.south = bounds.getSouthWest().lat();
    currentFilters.east = bounds.getNorthEast().lng();
    currentFilters.west = bounds.getSouthWest().lng();

    const path = [];
    polygon.getPath().forEach(p => path.push({ lat: p.lat(), lng: p.lng() }));
    currentFilters.polygon = JSON.stringify(path);
    currentPage = 1;
    loadMapPins();
    loadMapCards();
  });

  // Update marker style on zoom
  googleMap.addListener('zoom_changed', () => {
    const zoom = googleMap.getZoom();
    mapMarkers.forEach(m => m.setIcon(markerIcon(m._pin, zoom)));
  });

  // Update on map pan/zoom (debounced 300ms to avoid request storms)
  googleMap.addListener('idle', () => {
    clearTimeout(mapIdleTimer);
    mapIdleTimer = setTimeout(() => {
      if (!drawnPolygon) {
        const bounds = googleMap.getBounds();
        if (!bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        currentFilters.north = ne.lat();
        currentFilters.south = sw.lat();
        currentFilters.east = ne.lng();
        currentFilters.west = sw.lng();
        delete currentFilters.polygon;
        loadMapPins();
        loadMapCards();
      }
    }, 300);
  });

  if (currentView === 'map' && pendingMapZoom) {
    zoomMapToFilter();
  }
  // idle event fires automatically after map creation and handles initial pin/card load
}

// ---- Filters ----
function setListingType(type, btn) {
  document.querySelectorAll('.filter-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilters.forRent = type === 'rent' ? 'true' : 'false';
  currentPage = 1;
  applyFilters();
}

function setupPillListeners() {
  document.querySelectorAll('#beds-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const wasActive = pill.classList.contains('active');
      document.querySelectorAll('#beds-pills .pill').forEach(p => p.classList.remove('active'));
      if (!wasActive) {
        pill.classList.add('active');
        currentFilters.minBeds = pill.dataset.val;
      } else {
        delete currentFilters.minBeds;
      }
      updateFilterBtnLabel('beds-btn', currentFilters.minBeds ? currentFilters.minBeds + '+ Beds' : 'Beds');
      currentPage = 1;
      applyFilters();
    });
  });

  document.querySelectorAll('#baths-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const wasActive = pill.classList.contains('active');
      document.querySelectorAll('#baths-pills .pill').forEach(p => p.classList.remove('active'));
      if (!wasActive) {
        pill.classList.add('active');
        currentFilters.minBaths = pill.dataset.val;
      } else {
        delete currentFilters.minBaths;
      }
      updateFilterBtnLabel('baths-btn', currentFilters.minBaths ? currentFilters.minBaths + '+ Baths' : 'Baths');
      currentPage = 1;
      applyFilters();
    });
  });
}

function applyFilters() {
  // Price
  const minPrice = document.getElementById('min-price')?.value;
  const maxPrice = document.getElementById('max-price')?.value;
  if (minPrice) currentFilters.minPrice = minPrice;
  else delete currentFilters.minPrice;
  if (maxPrice) currentFilters.maxPrice = maxPrice;
  else delete currentFilters.maxPrice;

  // Property sub-type
  const checkedTypes = Array.from(document.querySelectorAll('#type-dropdown input:checked')).map(i => i.value);
  if (checkedTypes.length) currentFilters.subType = checkedTypes.join(',');
  else delete currentFilters.subType;

  // More filters
  const minSqft = document.getElementById('min-sqft')?.value;
  const maxSqft = document.getElementById('max-sqft')?.value;
  const minYear = document.getElementById('min-year')?.value;
  const maxYear = document.getElementById('max-year')?.value;
  const school = document.getElementById('school-filter')?.value;
  const pool = document.getElementById('pool-filter')?.checked;
  const waterfront = document.getElementById('waterfront-filter')?.checked;
  const newConst = document.getElementById('new-construction-filter')?.checked;

  if (minSqft) currentFilters.minSqft = minSqft; else delete currentFilters.minSqft;
  if (maxSqft) currentFilters.maxSqft = maxSqft; else delete currentFilters.maxSqft;
  if (minYear) currentFilters.minYear = minYear; else delete currentFilters.minYear;
  if (maxYear) currentFilters.maxYear = maxYear; else delete currentFilters.maxYear;
  if (school) currentFilters.schoolDistrict = school; else delete currentFilters.schoolDistrict;
  if (pool) currentFilters.pool = 'true'; else delete currentFilters.pool;
  if (waterfront) currentFilters.waterfront = 'true'; else delete currentFilters.waterfront;
  if (newConst) currentFilters.newConstruction = 'true'; else delete currentFilters.newConstruction;

  // Sort
  const sort = document.getElementById('sort-select')?.value;
  if (sort) currentFilters.sortBy = sort;

  updateFilterButtons();
  saveSearchState();

  if (currentView === 'list') {
    loadListings();
  } else if (gmapsLoaded) {
    loadMapPins();
    loadMapCards();
  }
  // else map view: idle event fires after initMap() and loads with correct viewport bounds
}

function updateFilterButtons() {
  const minP = currentFilters.minPrice;
  const maxP = currentFilters.maxPrice;
  if (minP || maxP) {
    const label = [minP ? '$' + Number(minP).toLocaleString() : '', maxP ? '$' + Number(maxP).toLocaleString() : ''].filter(Boolean).join(' – ');
    updateFilterBtnLabel('price-btn', label);
  } else {
    updateFilterBtnLabel('price-btn', 'Price');
  }

  const types = currentFilters.subType?.split(',').length;
  updateFilterBtnLabel('type-btn', types ? `Type (${types})` : 'Type');

  const hasMore = currentFilters.minSqft || currentFilters.maxSqft || currentFilters.schoolDistrict
    || currentFilters.pool || currentFilters.waterfront || currentFilters.newConstruction
    || currentFilters.minYear || currentFilters.maxYear;
  document.getElementById('more-btn')?.classList.toggle('active', !!hasMore);
}

function updateFilterBtnLabel(btnId, label) {
  const btn = document.getElementById(btnId);
  if (btn) {
    const svg = btn.querySelector('svg');
    btn.textContent = label;
    if (svg) btn.appendChild(svg);
    btn.classList.toggle('active', label !== btn.dataset.defaultLabel &&
      !['Type','Price','Beds','Baths','More Filters'].includes(label));
  }
}

function toggleDropdown(id, btn) {
  const dropdown = document.getElementById(id);
  const isOpen = dropdown.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    dropdown.classList.add('open');
    btn.classList.add('active-open');
    // Position dropdown
    const rect = btn.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + 4) + 'px';
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-open'));
}

function clearPriceFilter() {
  document.getElementById('min-price').value = '';
  document.getElementById('max-price').value = '';
  delete currentFilters.minPrice;
  delete currentFilters.maxPrice;
  updateFilterBtnLabel('price-btn', 'Price');
  currentPage = 1;
  applyFilters();
}

function clearFilter(type) {
  if (type === 'beds') {
    document.querySelectorAll('#beds-pills .pill').forEach(p => p.classList.remove('active'));
    delete currentFilters.minBeds;
    updateFilterBtnLabel('beds-btn', 'Beds');
  } else if (type === 'baths') {
    document.querySelectorAll('#baths-pills .pill').forEach(p => p.classList.remove('active'));
    delete currentFilters.minBaths;
    updateFilterBtnLabel('baths-btn', 'Baths');
  }
  currentPage = 1;
  applyFilters();
}

function clearAllFilters() {
  localStorage.removeItem('searchState');
  currentFilters = {};
  document.getElementById('min-price').value = '';
  document.getElementById('max-price').value = '';
  document.getElementById('min-sqft').value = '';
  document.getElementById('max-sqft').value = '';
  document.getElementById('min-year').value = '';
  document.getElementById('max-year').value = '';
  document.getElementById('school-filter').value = '';
  document.getElementById('pool-filter').checked = false;
  document.getElementById('waterfront-filter').checked = false;
  document.getElementById('new-construction-filter').checked = false;
  document.getElementById('location-search').value = '';
  document.querySelectorAll('#beds-pills .pill, #baths-pills .pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#type-dropdown input').forEach(i => i.checked = false);
  updateFilterBtnLabel('price-btn', 'Price');
  updateFilterBtnLabel('beds-btn', 'Beds');
  updateFilterBtnLabel('baths-btn', 'Baths');
  updateFilterBtnLabel('type-btn', 'Type');
  document.getElementById('more-btn')?.classList.remove('active');
  currentPage = 1;
  applyFilters();
  closeAllDropdowns();
}

// ---- Autocomplete ----
function setupAutocomplete() {
  const input = document.getElementById('location-search');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(autocompleteDebounce);
    const q = input.value.trim();
    if (q.length < 2) {
      hideAutocomplete();
      return;
    }
    autocompleteDebounce = setTimeout(() => fetchAutocomplete(q), 250);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      hideAutocomplete();
      const q = input.value.trim();
      if (q) {
        delete currentFilters.keyword;
        delete currentFilters.city;
        delete currentFilters.zip;
        delete currentFilters.neighborhood;
        delete currentFilters.schoolDistrict;
        // Detect zip (5 digits) or city-like input to route to proper filter
        if (/^\d{5}$/.test(q)) {
          currentFilters.zip = q;
        } else {
          currentFilters.keyword = q;
        }
        currentPage = 1;
        applyFilters();
        zoomMapToFilter();
      }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.header-search')) hideAutocomplete();
  });
}

async function fetchAutocomplete(q) {
  try {
    const res = await fetch(`/api/properties/autocomplete?q=${encodeURIComponent(q)}`);
    const items = await res.json();
    showAutocomplete(items, q);
  } catch {}
}

const AC_ICONS = {
  address: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  city:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  zip:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  neighborhood: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4"/><path d="M5 21V11.85M19 21V11.85"/></svg>`,
  school:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
};
const AC_LABELS = { address: 'Address', city: 'City', zip: 'ZIP', neighborhood: 'Neighborhood', school: 'School' };
const AC_ORDER  = ['city', 'zip', 'neighborhood', 'school', 'address'];

function showAutocomplete(items, q) {
  const dropdown = document.getElementById('autocomplete-dropdown');
  if (!items.length) { hideAutocomplete(); return; }

  // Group by type
  const grouped = {};
  items.forEach(item => { (grouped[item.type] = grouped[item.type] || []).push(item); });

  let html = '';
  for (const type of AC_ORDER) {
    const group = grouped[type];
    if (!group) continue;
    html += `<div class="ac-section-header">${AC_LABELS[type] || type}</div>`;
    for (const item of group) {
      const onclick = type === 'address'
        ? `selectAutocomplete('address','${escapeHtml(item.value)}','${item.listing_key}')`
        : `selectAutocomplete('${type}','${escapeHtml(item.value)}')`;
      const sub = type === 'address' && (item.city || item.list_price)
        ? `<div class="ac-item-sub">${[item.city, item.list_price ? '$' + Number(item.list_price).toLocaleString() : null].filter(Boolean).join(' · ')}</div>`
        : '';
      html += `
        <div class="autocomplete-item" onclick="${onclick}">
          <span class="ac-item-icon ac-icon-${type}">${AC_ICONS[type] || ''}</span>
          <span class="ac-item-content"><span>${highlightMatch(item.value, q)}</span>${sub}</span>
          <span class="type-badge badge-${type}">${AC_LABELS[type] || type}</span>
        </div>`;
    }
  }
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function hideAutocomplete() {
  const d = document.getElementById('autocomplete-dropdown');
  if (d) d.style.display = 'none';
}

async function selectAutocomplete(type, value, listingKey) {
  document.getElementById('location-search').value = value;
  hideAutocomplete();

  if (type === 'address' && listingKey) {
    window.location.href = `/property/${listingKey}`;
    return;
  }

  // Clear location filters and previous map bounds
  delete currentFilters.keyword;
  delete currentFilters.city;
  delete currentFilters.zip;
  delete currentFilters.neighborhood;
  delete currentFilters.schoolDistrict;
  delete currentFilters.north;
  delete currentFilters.south;
  delete currentFilters.east;
  delete currentFilters.west;
  delete currentFilters.polygon;

  if (type === 'city') currentFilters.city = value;
  else if (type === 'zip') currentFilters.zip = value;
  else if (type === 'school') currentFilters.schoolDistrict = value;
  else if (type === 'neighborhood') {
    // Try to fetch a real boundary polygon from OpenStreetMap
    const geometry = await fetchNeighborhoodPolygon(value);
    if (geometry && drawNeighborhoodPolygon(geometry)) {
      // Polygon is stored in currentFilters — load results via existing pipeline
      currentPage = 1;
      loadListings();
      loadMapPins();
      loadMapCards();
      return;
    }
    // Fallback: filter by subdivision_name
    currentFilters.neighborhood = value;
  }

  currentPage = 1;
  applyFilters();
  zoomMapToFilter();
}

function highlightMatch(text, q) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + '<strong>' + escapeHtml(text.slice(idx, idx + q.length)) + '</strong>' + escapeHtml(text.slice(idx + q.length));
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Neighborhood boundary polygon (OpenStreetMap / Nominatim) ----
async function fetchNeighborhoodPolygon(name) {
  try {
    const res = await fetch('/api/properties/neighborhood-boundary?q=' + encodeURIComponent(name));
    return await res.json(); // GeoJSON Polygon/MultiPolygon or null
  } catch { return null; }
}

function drawNeighborhoodPolygon(geometry) {
  if (!geometry || !googleMap) return false;

  // Handle MultiPolygon — use the largest outer ring
  let coords;
  if (geometry.type === 'MultiPolygon') {
    coords = geometry.coordinates.reduce((best, poly) =>
      poly[0].length > best.length ? poly[0] : best, []);
  } else {
    coords = geometry.coordinates[0]; // outer ring
  }
  if (!coords || coords.length < 3) return false;

  // GeoJSON is [lng, lat]; Google Maps needs {lat, lng}
  const path = coords.map(([lng, lat]) => ({ lat, lng }));

  // Clear existing polygon without triggering a reload
  if (drawnPolygon) { drawnPolygon.setMap(null); drawnPolygon = null; }
  delete currentFilters.polygon;
  delete currentFilters.north; delete currentFilters.south;
  delete currentFilters.east;  delete currentFilters.west;

  drawnPolygon = new google.maps.Polygon({
    paths: path,
    strokeColor: '#b8935a',
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: '#b8935a',
    fillOpacity: 0.08,
    map: googleMap
  });
  document.getElementById('clear-draw-btn').style.display = 'flex';

  const bounds = new google.maps.LatLngBounds();
  path.forEach(p => bounds.extend(p));
  currentFilters.north   = bounds.getNorthEast().lat();
  currentFilters.south   = bounds.getSouthWest().lat();
  currentFilters.east    = bounds.getNorthEast().lng();
  currentFilters.west    = bounds.getSouthWest().lng();
  currentFilters.polygon = JSON.stringify(path);

  googleMap.fitBounds(bounds, 40);
  return true;
}

// Zoom map to fit all pins matching the current location filter (city/zip/neighborhood)
async function zoomMapToFilter() {
  if (!googleMap || !gmapsLoaded) {
    pendingMapZoom = true;
    return;
  }
  pendingMapZoom = false;

  // Build params without bbox so we get all pins for this location filter
  const params = new URLSearchParams(currentFilters);
  params.delete('north'); params.delete('south');
  params.delete('east'); params.delete('west');
  params.delete('polygon');

  try {
    const res = await fetch(`/api/properties/map-pins?${params}`);
    const pins = await res.json();
    if (!pins.length) return;

    const bounds = new google.maps.LatLngBounds();
    pins.forEach(p => {
      if (p.latitude && p.longitude) bounds.extend({ lat: p.latitude, lng: p.longitude });
    });

    googleMap.fitBounds(bounds, 60);
  } catch (e) {
    console.error('[zoomMapToFilter]', e);
  }
}

// ---- Load Listings (List View) ----
async function loadListings() {
  const container = document.getElementById('listings-container');
  const paginationEl = document.getElementById('pagination');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading listings...</p></div>';

  try {
    const params = new URLSearchParams({
      ...currentFilters,
      page: currentPage,
      limit: 24
    });

    const res = await fetch(`/api/properties/search?${params}`);
    const data = await res.json();
    totalResults = data.total;

    // Update count
    const countEl = document.getElementById('results-count');
    if (countEl) {
      countEl.innerHTML = `<strong>${data.total.toLocaleString()}</strong> homes found`;
    }

    if (!data.listings.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <h3>No homes found</h3>
          <p>Try adjusting your filters or searching a different area.</p>
          <button class="btn btn-outline" onclick="clearAllFilters()">Clear all filters</button>
        </div>`;
      paginationEl.innerHTML = '';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'listings-grid';
    grid.innerHTML = data.listings.map(renderPropertyCard).join('');
    container.innerHTML = '';
    container.appendChild(grid);

    paginationEl.innerHTML = renderPagination(data.page, data.pages, 'goToPage');

    // Scroll to top of results
    document.getElementById('view-controls').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Error loading listings</h3><p>${err.message}</p></div>`;
  }
}

function goToPage(page) {
  currentPage = page;
  if (currentView === 'list') loadListings();
}

// ---- Map View ----
async function loadMapPins() {
  if (!googleMap) return;

  const params = new URLSearchParams({ ...currentFilters });

  const res = await fetch(`/api/properties/map-pins?${params}`);
  mapPins = await res.json();

  renderMapMarkers(mapPins);
}

async function loadMapCards() {
  const params = new URLSearchParams({
    ...currentFilters,
    page: 1,
    limit: 50
  });

  const res = await fetch(`/api/properties/search?${params}`);
  const data = await res.json();

  const countEl = document.getElementById('results-count');
  if (countEl) countEl.innerHTML = `<strong>${data.total.toLocaleString()}</strong> homes found`;

  const mapCount = document.getElementById('map-count');
  if (mapCount) mapCount.textContent = `${data.total.toLocaleString()} homes`;

  const listEl = document.getElementById('map-cards-list');
  if (listEl) listEl.innerHTML = data.listings.map(renderMapCard).join('');
}

function markerIcon(pin, zoom, hovered = false) {
  const fill = hovered ? '#f97316' : (pin.standard_status === 'Active' ? '#1877F2' : '#374151');
  if (zoom >= 14) {
    const price = pin.list_price;
    const label = price >= 1000000
      ? '$' + (price / 1000000).toFixed(1) + 'M'
      : '$' + Math.round(price / 1000) + 'K';
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="26">
          <rect width="72" height="26" rx="13" fill="${fill}"/>
          <text x="36" y="17" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="11" font-weight="bold">${label}</text>
        </svg>`
      )}`,
      scaledSize: new google.maps.Size(72, 26),
      anchor: new google.maps.Point(36, 13)
    };
  } else {
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">
          <circle cx="7" cy="7" r="6" fill="${fill}" stroke="white" stroke-width="1.5"/>
        </svg>`
      )}`,
      scaledSize: new google.maps.Size(14, 14),
      anchor: new google.maps.Point(7, 7)
    };
  }
}

function mapEventToLatLng(e) {
  const rect = document.getElementById('map').getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const bounds = googleMap.getBounds();
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return {
    lat: sw.lat() + (ne.lat() - sw.lat()) * (1 - y / rect.height),
    lng: sw.lng() + (ne.lng() - sw.lng()) * (x / rect.width)
  };
}

function renderMapMarkers(pins) {
  // Clear existing
  mapMarkers.forEach(m => m.setMap(null));
  mapMarkers = [];
  if (markerClusterer) { markerClusterer.clearMarkers(); }

  if (!pins.length) return;

  const zoom = googleMap.getZoom();

  pins.forEach(pin => {
    if (!pin.latitude || !pin.longitude) return;

    const marker = new google.maps.Marker({
      position: { lat: pin.latitude, lng: pin.longitude },
      map: googleMap,
      title: pin.unparsed_address,
      icon: markerIcon(pin, zoom)
    });

    marker._pin = pin;
    marker.addListener('click', () => showMarkerInfo(pin, marker));
    mapMarkers.push(marker);
  });

  // Cluster markers
  if (window.markerClusterer && typeof markerClusterer?.MarkerClusterer !== 'undefined') {
    // Clusterer loaded
  }
  // Use native clusterer if available
  if (window.MarkerClusterer) {
    if (markerClusterer) markerClusterer.clearMarkers();
    markerClusterer = new window.MarkerClusterer({ map: googleMap, markers: mapMarkers });
  }
}

function showMarkerInfo(pin, marker) {
  const photo = pin.photos?.[0] || '';
  const beds = pin.bedrooms_total ? pin.bedrooms_total + ' bd' : '';
  const baths = pin.bathrooms_total ? pin.bathrooms_total + ' ba' : '';
  const sqft = pin.living_area ? Math.round(pin.living_area).toLocaleString() + ' sqft' : '';

  const content = `
    <div class="map-info-window">
      ${photo ? `<img src="${photo}" alt="" style="width:100%;height:130px;object-fit:cover;" />` : ''}
      <div class="map-info-body">
        <div class="map-info-price">$${Number(pin.list_price).toLocaleString()}</div>
        <div class="map-info-details">${[beds, baths, sqft].filter(Boolean).join(' · ')}</div>
        <div class="map-info-address">${pin.unparsed_address || ''}</div>
        <div class="map-info-address" style="color:var(--text-light);font-size:11px;">${pin.city || ''}</div>
        <a class="map-info-link" href="/property/${pin.listing_key}" target="_blank">View Details</a>
      </div>
    </div>`;

  infoWindow.setContent(content);
  infoWindow.open(googleMap, marker);

  // Highlight sidebar card
  document.querySelectorAll('.map-card').forEach(c => c.classList.remove('highlighted'));
  const card = document.querySelector(`.map-card[data-key="${pin.listing_key}"]`);
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function highlightFromCard(listingKey) {
  document.querySelectorAll('.map-card').forEach(c => c.classList.remove('highlighted'));
  document.querySelector(`.map-card[data-key="${listingKey}"]`)?.classList.add('highlighted');

  const marker = mapMarkers.find(m => {
    const pin = mapPins.find(p => p.listing_key === listingKey);
    return pin && m.getPosition().lat() === pin.latitude && m.getPosition().lng() === pin.longitude;
  });
  if (marker) google.maps.event.trigger(marker, 'click');

  window.open(`/property/${listingKey}`, '_blank');
}

function hoverMarker(listingKey) {
  const marker = mapMarkers.find(m => m._pin?.listing_key === listingKey);
  if (marker) {
    marker.setIcon(markerIcon(marker._pin, googleMap.getZoom(), true));
    marker.setZIndex(999);
  }
}

function unhoverMarker(listingKey) {
  const marker = mapMarkers.find(m => m._pin?.listing_key === listingKey);
  if (marker) {
    marker.setIcon(markerIcon(marker._pin, googleMap.getZoom(), false));
    marker.setZIndex(null);
  }
}

// ---- Drawing ----
function toggleDrawMode() {
  const btn = document.getElementById('draw-btn');
  if (btn.classList.contains('active')) {
    cancelDrawMode();
  } else {
    if (drawnPolygon) clearDrawing();
    btn.classList.add('active');
    googleMap.setOptions({ draggable: false, gestureHandling: 'none' });
    document.getElementById('map').style.cursor = 'crosshair';
  }
}

function cancelDrawMode() {
  document.getElementById('draw-btn').classList.remove('active');
  googleMap.setOptions({ draggable: true, gestureHandling: 'auto' });
  document.getElementById('map').style.cursor = '';
  isDrawing = false;
  drawPath = [];
  if (drawPolyline) { drawPolyline.setMap(null); drawPolyline = null; }
}

function clearDrawing() {
  if (drawnPolygon) { drawnPolygon.setMap(null); drawnPolygon = null; }
  cancelDrawMode();
  document.getElementById('clear-draw-btn').style.display = 'none';
  delete currentFilters.polygon;
  delete currentFilters.north;
  delete currentFilters.south;
  delete currentFilters.east;
  delete currentFilters.west;
  loadMapPins();
  loadMapCards();
}

// ---- View Switch ----
function switchView(view) {
  currentView = view;
  document.getElementById('list-view').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('map-view').style.display = view === 'map' ? 'flex' : 'none';
  document.getElementById('list-view-btn').classList.toggle('active', view === 'list');
  document.getElementById('map-view-btn').classList.toggle('active', view === 'map');

  if (view === 'map') {
    document.getElementById('map-view').style.display = 'flex';
    document.getElementById('map-view').style.position = 'relative';
    if (gmapsLoaded && googleMap) {
      google.maps.event.trigger(googleMap, 'resize');
      if (pendingMapZoom) {
        zoomMapToFilter();
      } else {
        loadMapPins();
        loadMapCards();
      }
    }
  } else {
    loadListings();
  }
}

// ---- Save Search ----
function saveSearch() {
  if (!Auth.isLoggedIn()) {
    openAuthModal('signup');
    return;
  }
  document.getElementById('save-search-modal').classList.add('open');
}

async function confirmSaveSearch() {
  const name = document.getElementById('search-name-input').value.trim();
  if (!name) { showToast('Please enter a search name', 'error'); return; }

  const alert_enabled = document.getElementById('alert-enabled-input')?.checked || false;

  try {
    const res = await Auth.apiFetch('/api/searches', {
      method: 'POST',
      body: JSON.stringify({ name, filters: currentFilters, alert_enabled })
    });
    if (res?.ok) {
      document.getElementById('save-search-modal').classList.remove('open');
      document.getElementById('search-name-input').value = '';
      if (document.getElementById('alert-enabled-input')) document.getElementById('alert-enabled-input').checked = false;
      showToast(alert_enabled ? 'Search saved! You\'ll get email alerts for new listings.' : 'Search saved!', 'success');
    }
  } catch {
    showToast('Failed to save search', 'error');
  }
}
