document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn()) {
    document.getElementById('not-logged-in').style.display = 'block';
    return;
  }

  const user = Auth.getUser();
  document.getElementById('account-main').style.display = 'block';
  document.getElementById('user-greeting').textContent = `Hi, ${user.name.split(' ')[0]}`;
  document.getElementById('profile-name').value = user.name;
  document.getElementById('profile-email').value = user.email;
  document.getElementById('profile-phone').value = user.phone || '';

  await FavoritesCache.load();
  loadFavorites();
  loadSavedSearches();
});

function switchTab(tab, btn) {
  document.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.account-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

async function loadFavorites() {
  try {
    const res = await Auth.apiFetch('/api/favorites');
    const listings = await res.json();

    document.getElementById('favorites-loading').style.display = 'none';

    if (!listings.length) {
      document.getElementById('favorites-empty').style.display = 'block';
      return;
    }

    const grid = document.getElementById('favorites-grid');
    grid.style.display = 'grid';
    grid.innerHTML = listings.map(renderPropertyCard).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadSavedSearches() {
  try {
    const res = await Auth.apiFetch('/api/searches');
    const searches = await res.json();

    document.getElementById('searches-loading').style.display = 'none';

    if (!searches.length) {
      document.getElementById('searches-empty').style.display = 'block';
      return;
    }

    const list = document.getElementById('searches-list');
    list.style.display = 'flex';
    list.innerHTML = searches.map(s => {
      const filterDesc = describeFilters(s.filters);
      const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const alertOn = s.alert_enabled === 1;
      return `
        <div class="saved-search-item">
          <div style="flex:1;">
            <a href="/search?${filtersToQuery(s.filters)}" class="search-name">${escHtml(s.name)}</a>
            <div class="search-filters">${filterDesc}</div>
            <div class="search-date">Saved ${date}</div>
            <label class="alert-toggle-row alert-toggle-row--inline" title="${alertOn ? 'Email alerts on' : 'Email alerts off'}">
              <span style="font-size:12px;color:var(--text-light);">Email alerts</span>
              <input type="checkbox" class="alert-toggle-checkbox" ${alertOn ? 'checked' : ''} onchange="toggleSearchAlert(${s.id}, this)" />
              <span class="alert-toggle-track"></span>
            </label>
          </div>
          <button class="delete-search-btn" onclick="deleteSavedSearch(${s.id}, this)" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function toggleSearchAlert(id, checkbox) {
  try {
    await Auth.apiFetch(`/api/searches/${id}/alert`, {
      method: 'PATCH',
      body: JSON.stringify({ alert_enabled: checkbox.checked })
    });
    showToast(checkbox.checked ? 'Email alerts enabled' : 'Email alerts disabled', 'success');
  } catch {
    checkbox.checked = !checkbox.checked; // revert
    showToast('Failed to update alert', 'error');
  }
}

async function deleteSavedSearch(id, btn) {
  if (!confirm('Delete this saved search?')) return;
  try {
    await Auth.apiFetch(`/api/searches/${id}`, { method: 'DELETE' });
    btn.closest('.saved-search-item').remove();
    showToast('Search deleted', '');
  } catch {
    showToast('Failed to delete', 'error');
  }
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  try {
    const res = await Auth.apiFetch('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ name, phone })
    });
    if (res?.ok) {
      const user = await res.json();
      Auth.saveAuth(Auth.getToken(), user);
      showToast('Profile updated!', 'success');
    }
  } catch {
    showToast('Failed to update profile', 'error');
  }
}

async function changePassword() {
  const cur = document.getElementById('cur-pass').value;
  const next = document.getElementById('new-pass').value;
  const errEl = document.getElementById('pass-error');
  errEl.textContent = '';

  if (!cur || !next) { errEl.textContent = 'Please fill in both fields'; return; }

  try {
    const res = await Auth.apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: cur, newPassword: next })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    showToast('Password updated!', 'success');
    document.getElementById('cur-pass').value = '';
    document.getElementById('new-pass').value = '';
  } catch {
    errEl.textContent = 'Something went wrong';
  }
}

function describeFilters(filters) {
  const parts = [];
  if (filters.forRent === 'true') parts.push('For Rent');
  if (filters.city) parts.push(filters.city);
  if (filters.zip) parts.push('ZIP ' + filters.zip);
  if (filters.neighborhood) parts.push(filters.neighborhood);
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? '$' + Number(filters.minPrice).toLocaleString() : '';
    const max = filters.maxPrice ? '$' + Number(filters.maxPrice).toLocaleString() : '';
    parts.push([min, max].filter(Boolean).join(' – '));
  }
  if (filters.minBeds) parts.push(filters.minBeds + '+ beds');
  if (filters.minBaths) parts.push(filters.minBaths + '+ baths');
  if (filters.subType) parts.push(filters.subType);
  if (filters.schoolDistrict) parts.push(filters.schoolDistrict);
  if (filters.polygon) parts.push('📍 Custom map area');
  return parts.length ? parts.join(' · ') : 'All Austin area homes';
}

function filtersToQuery(filters) {
  return new URLSearchParams(Object.fromEntries(
    Object.entries(filters).filter(([,v]) => v !== null && v !== undefined && v !== '')
  )).toString();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
