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
let mcInstance = null; // marker clusterer instance — renamed to avoid clash with window.markerClusterer library global
let infoWindow = null;
let mapPins = [];
let searchDebounce = null;
let autocompleteDebounce = null;
let mapIdleTimer = null;
let gmapsLoaded = false;
let pendingMapZoom = false;
let pendingPolygonRestore = false;

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

// ---- Sync current filters → URL (makes searches shareable/bookmarkable) ----
function syncUrlFromFilters() {
  const params = new URLSearchParams();
  const f = currentFilters;
  if (f.neighborhood) params.set('neighborhood', f.neighborhood);
  if (f.zip)          params.set('zip', f.zip);
  if (f.city)         params.set('city', f.city);
  if (f.keyword)      params.set('q', f.keyword);
  if (f.minPrice)     params.set('minPrice', f.minPrice);
  if (f.maxPrice)     params.set('maxPrice', f.maxPrice);
  if (f.minBeds)      params.set('minBeds', f.minBeds);
  if (f.minBaths)     params.set('minBaths', f.minBaths);
  if (f.subType)      params.set('subType', f.subType);
  if (f.minSqft)      params.set('minSqft', f.minSqft);
  if (f.maxSqft)      params.set('maxSqft', f.maxSqft);
  if (f.minYear)      params.set('minYear', f.minYear);
  if (f.maxYear)      params.set('maxYear', f.maxYear);
  if (f.schoolDistrict) params.set('schoolDistrict', f.schoolDistrict);
  if (f.pool === 'true')            params.set('pool', 'true');
  if (f.waterfront === 'true')      params.set('waterfront', 'true');
  if (f.newConstruction === 'true') params.set('newConstruction', 'true');
  if (f.forRent)      params.set('forRent', f.forRent);
  if (f.polygon)      params.set('polygon', f.polygon);
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
}

// ---- URL param pre-filtering (e.g. /?neighborhood=Barton+Hills from homepage links) ----
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const neighborhood = params.get('neighborhood');
  const zip = params.get('zip');
  const city = params.get('city');
  const q = params.get('q');
  const minPrice = params.get('minPrice');
  const maxPrice = params.get('maxPrice');
  const minBeds = params.get('minBeds');
  const minBaths = params.get('minBaths');
  const subType = params.get('subType');
  const minSqft = params.get('minSqft');
  const maxSqft = params.get('maxSqft');
  const minYear = params.get('minYear');
  const maxYear = params.get('maxYear');
  const schoolDistrict = params.get('schoolDistrict');
  const pool = params.get('pool');
  const waterfront = params.get('waterfront');
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
  if (minPrice) { currentFilters.minPrice = minPrice; const el = document.getElementById('min-price'); if (el) el.value = minPrice; }
  if (maxPrice) { currentFilters.maxPrice = maxPrice; const el = document.getElementById('max-price'); if (el) el.value = maxPrice; }
  if (minBeds) {
    currentFilters.minBeds = minBeds;
    document.querySelectorAll('#beds-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.val === minBeds));
  }
  if (minBaths) {
    currentFilters.minBaths = minBaths;
    document.querySelectorAll('#baths-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.val === minBaths));
  }
  if (subType) {
    currentFilters.subType = subType;
    document.querySelectorAll('#type-dropdown input[type="checkbox"]').forEach(cb => {
      cb.checked = subType.split(',').includes(cb.value);
    });
  }
  if (minSqft) { currentFilters.minSqft = minSqft; const el = document.getElementById('min-sqft'); if (el) el.value = minSqft; }
  if (maxSqft) { currentFilters.maxSqft = maxSqft; const el = document.getElementById('max-sqft'); if (el) el.value = maxSqft; }
  if (minYear) { currentFilters.minYear = minYear; const el = document.getElementById('min-year'); if (el) el.value = minYear; }
  if (maxYear) { currentFilters.maxYear = maxYear; const el = document.getElementById('max-year'); if (el) el.value = maxYear; }
  if (schoolDistrict) { currentFilters.schoolDistrict = schoolDistrict; const el = document.getElementById('school-filter'); if (el) el.value = schoolDistrict; }
  if (pool === 'true') { currentFilters.pool = 'true'; const el = document.getElementById('pool-filter'); if (el) el.checked = true; }
  if (waterfront === 'true') { currentFilters.waterfront = 'true'; const el = document.getElementById('waterfront-filter'); if (el) el.checked = true; }
  if (newConstruction === 'true') {
    currentFilters.newConstruction = 'true';
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
      b.classList.toggle('active', b.dataset.type === 'buy');
    });
  }

  // Polygon (saved searches with custom map area)
  const polygon = params.get('polygon');
  if (polygon) {
    try {
      const path = JSON.parse(polygon);
      if (Array.isArray(path) && path.length > 2) {
        currentFilters.polygon = polygon;
        // Derive bbox so the server-side bbox pre-filter narrows the SQL query
        let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
        for (const p of path) {
          if (p.lat > north) north = p.lat;
          if (p.lat < south) south = p.lat;
          if (p.lng > east) east = p.lng;
          if (p.lng < west) west = p.lng;
        }
        currentFilters.north = north;
        currentFilters.south = south;
        currentFilters.east = east;
        currentFilters.west = west;
        // Default to map view since the polygon only makes sense visually.
        // Mark for switch in init — actual switchView() happens after init order.
        currentView = 'map';
        pendingPolygonRestore = true;
      }
    } catch {}
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

  // Init mobile map FAB visibility
  const fab = document.getElementById('mobile-map-fab');
  if (fab) fab.style.display = (currentView === 'list' && window.innerWidth <= 640) ? 'flex' : 'none';

  // Make map bottom sheet draggable on mobile
  setupDraggableSheet('.map-sidebar', '.map-sidebar-header');

  // Contact modal: close on outside click + Esc key
  document.getElementById('contact-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('contact-modal')) closeContactModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const cm = document.getElementById('contact-modal');
      if (cm && cm.classList.contains('open')) closeContactModal();
    }
  });

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

  // Marker Clusterer — self-hosted to eliminate CDN latency and 302 redirect
  const clusterScript = document.createElement('script');
  clusterScript.src = '/js/markerclusterer.min.js';
  clusterScript.onload = () => {
    // Re-cluster if map pins are already rendered (cluster script loaded after initMap)
    if (googleMap && mapMarkers.length && !mcInstance && window.markerClusterer?.MarkerClusterer) {
      mcInstance = new window.markerClusterer.MarkerClusterer({ map: googleMap, markers: mapMarkers });
    }
  };
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

  // Restore drawn polygon from saved state (localStorage or URL params)
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

      // Fit map to polygon bounds + ensure view is in map mode
      // (URL-restored polygons need this; localStorage flow already set the view)
      if (pendingPolygonRestore) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach(p => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
        googleMap.fitBounds(bounds, 40);
        pendingPolygonRestore = false;
        // Force switchView to flip DOM visibility (even if currentView already === 'map',
        // the DOM may still show list view because applyUrlParams only set the variable).
        // switchView calls loadMapPins/loadMapCards internally with polygon filter intact
        // since drawnPolygon now exists.
        switchView('map');
      }
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
      // If a polygon is active (drawn or restored from URL/localStorage),
      // panning/zooming the map should NOT clobber the polygon filter.
      // The polygon stays until the user explicitly clicks "Clear Drawing".
      if (drawnPolygon || currentFilters.polygon) return;

      const bounds = googleMap.getBounds();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      currentFilters.north = ne.lat();
      currentFilters.south = sw.lat();
      currentFilters.east = ne.lng();
      currentFilters.west = sw.lng();
      loadMapPins();
      loadMapCards();
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
  syncUrlFromFilters();

  if (currentView === 'list') {
    loadListings();
  } else {
    loadMapPins();
    loadMapCards();
  }
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
  document.querySelectorAll('.filter-dropdown').forEach(d => {
    d.classList.remove('open');
    d.style.left = '';
    d.style.top = '';
  });
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-open'));
}

// ---- Contact Modal ----
function openContactModal() {
  document.getElementById('contact-modal').classList.add('open');
  // Pre-fill name/email if user is logged in
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn?.()) {
    const u = Auth.getUser?.();
    if (u) {
      const n = document.getElementById('contact-name');
      const e = document.getElementById('contact-email');
      const p = document.getElementById('contact-phone');
      if (n && !n.value) n.value = u.name || '';
      if (e && !e.value) e.value = u.email || '';
      if (p && !p.value) p.value = u.phone || '';
    }
  }
  setTimeout(() => document.getElementById('contact-name')?.focus(), 100);
}

function closeContactModal() {
  document.getElementById('contact-modal').classList.remove('open');
  document.getElementById('contact-error').textContent = '';
}

async function submitContactModal() {
  const name = document.getElementById('contact-name').value.trim();
  const email = document.getElementById('contact-email').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const message = document.getElementById('contact-message').value.trim();
  const errEl = document.getElementById('contact-error');
  errEl.textContent = '';

  if (!name) { errEl.textContent = 'Please enter your name'; return; }
  if (!email) { errEl.textContent = 'Please enter your email'; return; }
  if (!message) { errEl.textContent = 'Please enter a message'; return; }

  const btn = document.querySelector('#contact-modal .btn-primary');
  const originalText = btn.textContent;
  btn.textContent = 'Sending...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'idx-search-contact', name, email, phone, message })
    });
    if (!res.ok) throw new Error('Failed');
    // Replace modal contents with success message
    document.querySelector('#contact-modal .modal').innerHTML = `
      <button class="modal-close" onclick="closeContactModal();setTimeout(()=>location.reload(),300)">×</button>
      <h2>Message sent!</h2>
      <p class="modal-subtitle">Thanks ${escHtml(name)} — I'll get back to you within a few hours.</p>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;margin-top:8px;" onclick="closeContactModal();setTimeout(()=>location.reload(),300)">Close</button>
    `;
  } catch {
    errEl.textContent = 'Could not send. Please try again or call (254) 718-2567.';
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- Draggable bottom sheet (mobile only) ----
// Tap the handle to toggle expanded/collapsed, drag down to collapse, drag up to expand.
function setupDraggableSheet(sheetSelector, handleSelector) {
  if (window.innerWidth > 640) return;
  const sheet = document.querySelector(sheetSelector);
  const handle = document.querySelector(handleSelector);
  if (!sheet || !handle) return;

  let startY = 0;
  let currentDelta = 0;
  let dragging = false;
  let moved = false;

  const onStart = (y) => {
    dragging = true;
    moved = false;
    startY = y;
    currentDelta = 0;
    sheet.style.transition = 'none';
  };
  const onMove = (y) => {
    if (!dragging) return;
    currentDelta = y - startY;
    if (Math.abs(currentDelta) > 4) moved = true;
    // Only allow downward drag from expanded, upward drag from collapsed
    const isCollapsed = sheet.classList.contains('collapsed');
    if (!isCollapsed && currentDelta < 0) return; // don't drag above expanded
    if (isCollapsed && currentDelta > 0) return;  // don't drag below collapsed
    sheet.style.transform = isCollapsed
      ? `translateY(calc(100% - 48px + ${currentDelta}px))`
      : `translateY(${Math.max(0, currentDelta)}px)`;
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (!moved) {
      // Treat as tap — toggle
      sheet.classList.toggle('collapsed');
    } else {
      // Snap based on drag distance
      const isCollapsed = sheet.classList.contains('collapsed');
      if (!isCollapsed && currentDelta > 80) sheet.classList.add('collapsed');
      else if (isCollapsed && currentDelta < -80) sheet.classList.remove('collapsed');
    }
  };

  handle.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
  handle.addEventListener('touchmove',  e => onMove(e.touches[0].clientY),  { passive: true });
  handle.addEventListener('touchend',   onEnd);
  handle.addEventListener('touchcancel', onEnd);
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

  // Reset For Sale / For Rent toggle to "For Sale"
  document.querySelectorAll('.filter-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'buy');
  });

  // Clear any drawn polygon and exit draw mode
  if (typeof drawnPolygon !== 'undefined' && drawnPolygon) {
    drawnPolygon.setMap(null);
    drawnPolygon = null;
  }
  if (typeof cancelDrawMode === 'function') cancelDrawMode();
  const clearBtn = document.getElementById('clear-draw-btn');
  if (clearBtn) clearBtn.style.display = 'none';

  // Clear URL params so a refresh starts fresh
  history.replaceState(null, '', window.location.pathname);

  currentPage = 1;
  applyFilters();
  closeAllDropdowns();
}

// Alias used by the filter bar Reset button
function resetSearch() { clearAllFilters(); }

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
      const dropdown = document.getElementById('autocomplete-dropdown');
      const dropdownVisible = dropdown && dropdown.style.display !== 'none' && lastAutocompleteItems.length;
      // If autocomplete is showing, select its top result (same as clicking it)
      if (dropdownVisible) {
        e.preventDefault();
        // Sort by AC_ORDER to find the top-priority item
        const sorted = [...lastAutocompleteItems].sort((a, b) => AC_ORDER.indexOf(a.type) - AC_ORDER.indexOf(b.type));
        const top = sorted[0];
        selectAutocomplete(top.type, top.value, top.listing_key);
        return;
      }
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

let lastAutocompleteItems = [];

async function fetchAutocomplete(q) {
  try {
    const res = await fetch(`/api/properties/autocomplete?q=${encodeURIComponent(q)}`);
    const items = await res.json();
    lastAutocompleteItems = items;
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
  lastAutocompleteItems = [];
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
  if (mcInstance) { mcInstance.clearMarkers(); }

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

  // Cluster markers — library exports to window.markerClusterer.MarkerClusterer (lowercase namespace)
  if (window.markerClusterer?.MarkerClusterer) {
    if (mcInstance) { mcInstance.clearMarkers(); mcInstance = null; }
    mcInstance = new window.markerClusterer.MarkerClusterer({ map: googleMap, markers: mapMarkers });
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

  // Show/hide floating map FAB on mobile
  const fab = document.getElementById('mobile-map-fab');
  if (fab) fab.style.display = (view === 'list' && window.innerWidth <= 640) ? 'flex' : 'none';

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
  const btn = document.querySelector('#save-search-modal .btn-primary');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await Auth.apiFetch('/api/searches', {
      method: 'POST',
      body: JSON.stringify({ name, filters: currentFilters, alert_enabled })
    });
    if (!res) {
      showToast('Your session expired — please log in again', 'error');
      return;
    }
    if (!res.ok) {
      let msg = `Failed to save search (${res.status})`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      console.error('[saveSearch]', res.status, msg);
      showToast(msg, 'error');
      return;
    }
    document.getElementById('save-search-modal').classList.remove('open');
    document.getElementById('search-name-input').value = '';
    if (document.getElementById('alert-enabled-input')) document.getElementById('alert-enabled-input').checked = false;
    showToast(alert_enabled ? 'Search saved! You\'ll get email alerts for new listings.' : 'Search saved!', 'success');
  } catch (err) {
    console.error('[saveSearch] exception', err);
    showToast('Failed to save search: ' + (err?.message || 'network error'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}
