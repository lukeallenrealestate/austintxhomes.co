document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
    document.getElementById('not-admin').style.display = 'block';
    return;
  }

  const user = Auth.getUser();
  document.getElementById('admin-main').style.display = 'block';
  document.getElementById('admin-greeting').textContent = user.name;

  loadStats();
  loadActivity();
  loadUsers();
});

async function loadStats() {
  try {
    const res = await Auth.apiFetch('/api/admin/stats');
    const data = await res.json();

    document.getElementById('stat-listings').textContent = data.activeListings?.toLocaleString() || '—';
    document.getElementById('stat-users').textContent = data.totalUsers?.toLocaleString() || '—';
    document.getElementById('stat-favorites').textContent = data.totalFavorites?.toLocaleString() || '—';
    document.getElementById('stat-searches').textContent = data.totalSearches?.toLocaleString() || '—';

    const syncText = document.getElementById('sync-status-text');
    if (data.syncState?.last_sync_at) {
      const ago = timeSince(new Date(data.syncState.last_sync_at));
      syncText.textContent = `Last synced ${ago}`;
    } else {
      syncText.textContent = 'Never synced';
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadActivity() {
  try {
    const res = await Auth.apiFetch('/api/admin/activity');
    const data = await res.json();

    const feed = document.getElementById('activity-feed');
    const items = [];

    data.newUsers?.forEach(u => {
      items.push({
        text: `<strong>${esc(u.name)}</strong> (${esc(u.email)}) created an account`,
        time: u.created_at
      });
    });

    data.recentFavorites?.forEach(f => {
      items.push({
        text: `<strong>${esc(f.name)}</strong> saved <em>${esc(f.unparsed_address)}</em> ($${Number(f.list_price).toLocaleString()})`,
        time: f.created_at
      });
    });

    // Sort by time descending
    items.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!items.length) {
      feed.innerHTML = '<div style="padding:24px;color:var(--text-light);text-align:center;">No recent activity</div>';
      return;
    }

    feed.innerHTML = items.slice(0, 20).map(item => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div style="flex:1;">
          <div>${item.text}</div>
          <div class="activity-time">${timeSince(new Date(item.time))}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadUsers() {
  try {
    const res = await Auth.apiFetch('/api/admin/users');
    const users = await res.json();

    document.getElementById('users-loading').style.display = 'none';
    const table = document.getElementById('users-table');
    table.style.display = 'table';

    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:24px;">No users yet</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <strong>${esc(u.name)}</strong>
          ${u.status === 'pending' ? '<span class="status-pending-badge">Pending</span>' : ''}
        </td>
        <td>${esc(u.email)}</td>
        <td>${u.phone ? esc(u.phone) : '—'}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>${u.last_login ? formatDate(u.last_login) : 'Never'}</td>
        <td style="text-align:center;">${u.favorite_count}</td>
        <td style="text-align:center;">${u.search_count}</td>
        <td>
          ${u.status === 'pending' ? `
            <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;margin-right:4px;" onclick="resendInvite(${u.id})">Resend invite</button>
            <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;margin-right:4px;" onclick="copyActivationLink('${esc(u.activationUrl || '')}')">Copy link</button>
          ` : ''}
          <button class="btn btn-outline" style="font-size:12px;padding:4px 10px;" onclick="buildForExistingClient(${u.id}, ${JSON.stringify(u.name).replace(/"/g,'&quot;')})">Build search</button>
          <button class="expand-user-btn" onclick="toggleUserDetail(${u.id}, this)">View ▾</button>
        </td>
      </tr>
      <tr id="user-detail-${u.id}" style="display:none;">
        <td colspan="8" style="padding:0;">
          <div class="user-detail-panel open" id="user-panel-${u.id}">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
              <div>
                <h4 style="margin-bottom:12px;font-size:14px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Saved Homes (${u.favorite_count})</h4>
                <div id="user-favs-${u.id}"><div class="spinner" style="width:24px;height:24px;border-width:2px;"></div></div>
              </div>
              <div>
                <h4 style="margin-bottom:12px;font-size:14px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Saved Searches (${u.search_count})</h4>
                <div id="user-searches-${u.id}"><div class="spinner" style="width:24px;height:24px;border-width:2px;"></div></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

const loadedUsers = new Set();

async function toggleUserDetail(userId, btn) {
  const row = document.getElementById(`user-detail-${userId}`);
  const isVisible = row.style.display !== 'none';

  if (isVisible) {
    row.style.display = 'none';
    btn.textContent = 'View ▾';
    return;
  }

  row.style.display = 'table-row';
  btn.textContent = 'Close ▴';

  if (loadedUsers.has(userId)) return;
  loadedUsers.add(userId);

  // Load favorites
  try {
    const res = await Auth.apiFetch(`/api/admin/users/${userId}/favorites`);
    const favs = await res.json();
    const favsEl = document.getElementById(`user-favs-${userId}`);
    if (!favs.length) {
      favsEl.innerHTML = '<p style="font-size:13px;color:var(--text-light);">No saved homes</p>';
    } else {
      favsEl.innerHTML = favs.map(f => `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
          ${f.photos?.[0] ? `<img src="${f.photos[0]}" style="width:60px;height:45px;object-fit:cover;border-radius:6px;flex-shrink:0;" />` : ''}
          <div style="min-width:0;">
            <a href="/property.html?id=${f.listing_key}" target="_blank" style="font-size:13px;font-weight:600;color:var(--blue);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.unparsed_address || '')}</a>
            <div style="font-size:12px;color:var(--text-light);">$${Number(f.list_price).toLocaleString()} · Saved ${formatDate(f.saved_at)}</div>
          </div>
        </div>
      `).join('');
    }
  } catch {}

  // Load saved searches
  try {
    const res = await Auth.apiFetch(`/api/admin/users/${userId}/searches`);
    const searches = await res.json();
    const searchEl = document.getElementById(`user-searches-${userId}`);
    if (!searches.length) {
      searchEl.innerHTML = '<p style="font-size:13px;color:var(--text-light);">No saved searches</p>';
    } else {
      searchEl.innerHTML = searches.map(s => `
        <div style="background:var(--bg);border-radius:var(--radius);padding:10px;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:600;">${esc(s.name)}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:4px;">${descFilters(s.filters)}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:4px;">${formatDate(s.created_at)}</div>
        </div>
      `).join('');
    }
  } catch {}
}

async function triggerSync() {
  try {
    const res = await Auth.apiFetch('/api/admin/sync', { method: 'POST' });
    if (res?.ok) {
      showToast('Sync started! This may take several minutes.', 'success');
    }
  } catch {
    showToast('Failed to trigger sync', 'error');
  }
}

function descFilters(filters) {
  if (typeof filters === 'string') try { filters = JSON.parse(filters); } catch { return ''; }
  const parts = [];
  if (filters.city) parts.push(filters.city);
  if (filters.zip) parts.push('ZIP ' + filters.zip);
  if (filters.minPrice || filters.maxPrice) {
    parts.push([
      filters.minPrice ? '$' + Number(filters.minPrice).toLocaleString() : '',
      filters.maxPrice ? '$' + Number(filters.maxPrice).toLocaleString() : ''
    ].filter(Boolean).join(' – '));
  }
  if (filters.minBeds) parts.push(filters.minBeds + '+ beds');
  if (filters.subType) parts.push(filters.subType);
  return parts.join(' · ') || 'All homes';
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Build-for-client modal ────────────────────────────────────
let bfcTab = 'crm';
let bfcSelected = null;      // { id, name, email, phone } from CRM pick
let bfcCrmConfigured = null; // null=unknown, true=CRM online, false=not configured
let bfcQueryDebounce = null;

function openBuildForClientModal() {
  bfcSelected = null;
  document.getElementById('bfc-error').style.display = 'none';
  document.getElementById('bfc-crm-query').value = '';
  document.getElementById('bfc-crm-results').innerHTML = '';
  document.getElementById('bfc-new-name').value = '';
  document.getElementById('bfc-new-email').value = '';
  document.getElementById('bfc-new-phone').value = '';
  document.getElementById('bfc-new-sendinvite').checked = true;
  switchBfcTab('crm');
  document.getElementById('build-for-client-modal').classList.add('open');
  // Initial load — empty query returns a short list of recent contacts
  // (or triggers the "not configured" message if the env isn't set).
  loadBfcCrmResults('');
  setTimeout(() => document.getElementById('bfc-crm-query')?.focus(), 50);
}

function closeBuildForClientModal() {
  document.getElementById('build-for-client-modal').classList.remove('open');
}

function switchBfcTab(tab) {
  bfcTab = tab;
  document.getElementById('bfc-tab-crm').classList.toggle('active', tab === 'crm');
  document.getElementById('bfc-tab-new').classList.toggle('active', tab === 'new');
  document.getElementById('bfc-crm-panel').style.display = tab === 'crm' ? '' : 'none';
  document.getElementById('bfc-new-panel').style.display = tab === 'new' ? '' : 'none';
  document.getElementById('bfc-error').style.display = 'none';
}

async function loadBfcCrmResults(query) {
  const statusEl = document.getElementById('bfc-crm-status');
  const resultsEl = document.getElementById('bfc-crm-results');
  statusEl.textContent = 'Searching...';
  resultsEl.innerHTML = '';
  try {
    const res = await Auth.apiFetch('/api/admin/crm/contacts?q=' + encodeURIComponent(query));
    if (!res?.ok) { statusEl.textContent = 'Could not reach Realtor-OS.'; return; }
    const data = await res.json();
    bfcCrmConfigured = !!data.configured;

    if (!data.configured) {
      statusEl.innerHTML = 'Realtor-OS isn\'t connected yet. Switch to <a href="#" onclick="switchBfcTab(\'new\');return false;" style="color:var(--blue);">Create new</a> to enter a client manually.';
      return;
    }
    if (data.error) {
      statusEl.textContent = 'Realtor-OS error: ' + data.error;
      return;
    }
    if (!data.contacts.length) {
      statusEl.textContent = query ? 'No contacts match that search.' : 'No contacts yet in Realtor-OS.';
      return;
    }
    statusEl.textContent = `${data.contacts.length} contact${data.contacts.length !== 1 ? 's' : ''}`;
    resultsEl.innerHTML = data.contacts.map(c => `
      <div class="bfc-crm-result" data-id="${esc(c.id)}" data-name="${esc(c.name || '')}" data-email="${esc(c.email || '')}" data-phone="${esc(c.phone || '')}"
           onclick="selectBfcCrmResult(this)">
        <div style="flex:1;min-width:0;">
          <div class="bfc-name">${esc(c.name || '(no name)')}</div>
          <div class="bfc-meta">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    statusEl.textContent = 'Something went wrong: ' + err.message;
  }
}

function selectBfcCrmResult(el) {
  document.querySelectorAll('.bfc-crm-result.selected').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  bfcSelected = {
    id: el.dataset.id,
    name: el.dataset.name,
    email: el.dataset.email,
    phone: el.dataset.phone
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const q = document.getElementById('bfc-crm-query');
  q?.addEventListener('input', () => {
    clearTimeout(bfcQueryDebounce);
    bfcQueryDebounce = setTimeout(() => loadBfcCrmResults(q.value.trim()), 220);
  });
  document.getElementById('build-for-client-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('build-for-client-modal')) closeBuildForClientModal();
  });
});

async function submitBuildForClient() {
  const errEl = document.getElementById('bfc-error');
  errEl.style.display = 'none';

  let payload;
  if (bfcTab === 'crm') {
    if (!bfcSelected) { errEl.textContent = 'Pick a contact first, or switch to Create new.'; errEl.style.display = 'block'; return; }
    if (!bfcSelected.email) { errEl.textContent = 'This Realtor-OS contact has no email on file. Add one in CRM first.'; errEl.style.display = 'block'; return; }
    payload = {
      name: bfcSelected.name || 'Client',
      email: bfcSelected.email,
      phone: bfcSelected.phone || null,
      crmContactId: bfcSelected.id,
      sendInvite: true
    };
  } else {
    const name = document.getElementById('bfc-new-name').value.trim();
    const email = document.getElementById('bfc-new-email').value.trim();
    const phone = document.getElementById('bfc-new-phone').value.trim();
    const sendInvite = document.getElementById('bfc-new-sendinvite').checked;
    if (!name || !email) { errEl.textContent = 'Name and email are required.'; errEl.style.display = 'block'; return; }
    payload = { name, email, phone, sendInvite };
  }

  const btn = document.getElementById('bfc-submit');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const res = await Auth.apiFetch('/api/admin/clients', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!res?.ok) {
      const j = await res.json().catch(() => ({}));
      errEl.textContent = j.error || `Failed (${res?.status || 'network'})`;
      errEl.style.display = 'block';
      return;
    }
    const data = await res.json();
    // Hand off to the search page in build-for-client mode. The banner
    // over there reads these params and the Save Search button posts to
    // /api/admin/clients/:userId/searches instead of the normal path.
    const params = new URLSearchParams({
      building_for: String(data.user.id),
      client_name: data.user.name || '',
      client_email: data.user.email || ''
    });
    window.location.href = '/?' + params.toString();
  } catch (err) {
    errEl.textContent = 'Something went wrong: ' + err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}

async function resendInvite(userId) {
  try {
    const res = await Auth.apiFetch(`/api/admin/clients/${userId}/resend-invite`, { method: 'POST' });
    if (!res?.ok) {
      const j = await res.json().catch(() => ({}));
      showToast(j.error || 'Failed to resend', 'error');
      return;
    }
    const data = await res.json();
    showToast(data.sent ? 'Invite resent' : 'Link regenerated (email not configured)', 'success');
    loadUsers();
  } catch {
    showToast('Failed to resend', 'error');
  }
}

function copyActivationLink(url) {
  if (!url) { showToast('No activation link available', 'error'); return; }
  navigator.clipboard?.writeText(url);
  showToast('Activation link copied', 'success');
}

function buildForExistingClient(userId, clientName) {
  const params = new URLSearchParams({
    building_for: String(userId),
    client_name: clientName || ''
  });
  window.location.href = '/?' + params.toString();
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type || ''} visible`;
  setTimeout(() => t.classList.remove('visible'), 3000);
}

window.openBuildForClientModal = openBuildForClientModal;
window.closeBuildForClientModal = closeBuildForClientModal;
window.switchBfcTab = switchBfcTab;
window.selectBfcCrmResult = selectBfcCrmResult;
window.submitBuildForClient = submitBuildForClient;
window.resendInvite = resendInvite;
window.copyActivationLink = copyActivationLink;
window.buildForExistingClient = buildForExistingClient;
