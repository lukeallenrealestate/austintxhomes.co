// Activation page logic. Reads ?token=... from the URL, looks it up,
// renders the "Luke has set you up" copy with the client's name + the
// saved search Luke built, and handles the password submit that flips
// the account from 'pending' to 'active'.
(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  function showState(id) {
    ['state-loading', 'state-error', 'state-ready', 'state-done']
      .forEach(x => document.getElementById(x).classList.remove('on'));
    document.getElementById(id).classList.add('on');
  }

  function describeFilters(f) {
    if (!f || typeof f !== 'object') return '';
    const parts = [];
    if (f.city) parts.push(f.city);
    if (f.zip) parts.push('ZIP ' + f.zip);
    if (f.neighborhood) parts.push(f.neighborhood);
    if (f.schoolDistrict) parts.push(f.schoolDistrict);
    if (f.minPrice || f.maxPrice) {
      parts.push([
        f.minPrice ? '$' + Number(f.minPrice).toLocaleString() : '',
        f.maxPrice ? '$' + Number(f.maxPrice).toLocaleString() : ''
      ].filter(Boolean).join(' to '));
    }
    if (f.minBeds) parts.push(f.minBeds + '+ bd');
    if (f.minBaths) parts.push(f.minBaths + '+ ba');
    if (f.subType) parts.push(f.subType);
    if (f.pool === 'true' || f.pool === true) parts.push('pool');
    if (f.waterfront === 'true' || f.waterfront === true) parts.push('waterfront');
    if (f.newConstruction === 'true' || f.newConstruction === true) parts.push('new construction');
    return parts.join(' . ');
  }

  async function load() {
    if (!token) { renderError('No activation token in URL.'); return; }
    try {
      const res = await fetch('/api/auth/activate/' + encodeURIComponent(token));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { renderError(data.error || 'Invalid activation link.'); return; }

      // Populate the ready state
      const first = (data.name || 'Luke').split(' ')[0];
      const headerName = (data.invitedBy || 'Luke').split(' ')[0];
      document.getElementById('hdr').textContent = `Welcome, ${first}`;
      document.getElementById('greet-name').textContent = data.invitedBy || 'Luke Allen';

      const latest = data.searches && data.searches[0];
      if (latest) {
        document.getElementById('search-preview').style.display = 'block';
        document.getElementById('search-name').textContent = latest.name;
        document.getElementById('search-filters').textContent = describeFilters(latest.filters);
      }

      showState('state-ready');
    } catch (err) {
      renderError('Could not load this invite: ' + err.message);
    }
  }

  function renderError(msg) {
    document.getElementById('error-msg').textContent = msg;
    showState('state-error');
  }

  async function submit(e) {
    e.preventDefault();
    const pw = document.getElementById('pw').value;
    const pw2 = document.getElementById('pw2').value;
    const phone = document.getElementById('phone').value.trim();
    const errEl = document.getElementById('err');
    errEl.textContent = '';

    if (pw.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw !== pw2) { errEl.textContent = 'Passwords don\'t match.'; return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Creating your account...';

    try {
      const res = await fetch('/api/auth/activate/' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, phone })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || 'Something went wrong.';
        btn.disabled = false; btn.textContent = 'Create password & view my search';
        return;
      }

      // Log them in via the shared Auth module so every other page sees it
      Auth.saveAuth(data.token, data.user);
      showState('state-done');

      // Drop them on their saved search if we have one; otherwise /account
      setTimeout(() => {
        if (data.savedSearchId) {
          window.location.href = '/account.html#search=' + data.savedSearchId;
        } else {
          window.location.href = '/account.html';
        }
      }, 900);
    } catch (err) {
      errEl.textContent = 'Network error: ' + err.message;
      btn.disabled = false; btn.textContent = 'Create password & view my search';
    }
  }

  window.submitActivation = submit;
  document.addEventListener('DOMContentLoaded', load);
})();
