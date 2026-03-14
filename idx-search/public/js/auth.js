// Auth module — shared across all pages
const Auth = (() => {
  const TOKEN_KEY = 'idx_token';
  const USER_KEY = 'idx_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }
  function isLoggedIn() { return !!getToken(); }
  function isAdmin() { return getUser()?.role === 'admin'; }

  function saveAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('idx_favorites');
    window.location.href = '/';
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) { logout(); return null; }
    return res;
  }

  function updateHeaderUI() {
    const user = getUser();
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const accountLink = document.getElementById('account-link');
    const adminLink = document.getElementById('admin-link');
    const nameDisplay = document.getElementById('user-name-display');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';
      if (accountLink) { accountLink.style.display = 'flex'; }
      if (nameDisplay) nameDisplay.textContent = user.name.split(' ')[0];
      if (adminLink && user.role === 'admin') adminLink.style.display = 'flex';
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (signupBtn) signupBtn.style.display = '';
      if (accountLink) accountLink.style.display = 'none';
      if (adminLink) adminLink.style.display = 'none';
    }
  }

  return { getToken, getUser, isLoggedIn, isAdmin, saveAuth, logout, apiFetch, updateHeaderUI };
})();

// Favorites cache
const FavoritesCache = (() => {
  let keys = new Set();
  let loaded = false;

  async function load() {
    if (!Auth.isLoggedIn()) { loaded = true; return; }
    try {
      const res = await Auth.apiFetch('/api/favorites/keys');
      if (res && res.ok) {
        const data = await res.json();
        keys = new Set(data);
      }
    } catch {}
    loaded = true;
  }

  function has(key) { return keys.has(key); }

  async function toggle(key) {
    if (!Auth.isLoggedIn()) {
      openAuthModal('login');
      return false;
    }
    if (keys.has(key)) {
      await Auth.apiFetch(`/api/favorites/${key}`, { method: 'DELETE' });
      keys.delete(key);
      return false;
    } else {
      await Auth.apiFetch(`/api/favorites/${key}`, { method: 'POST' });
      keys.add(key);
      return true;
    }
  }

  return { load, has, toggle };
})();

// ---- Auth Modal ----
function openAuthModal(mode = 'login') {
  document.getElementById('auth-modal').classList.add('open');
  if (mode === 'login') showLogin();
  else showSignup();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('open');
}

function showLogin() {
  document.getElementById('login-form').style.display = '';
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('login-error').textContent = '';
}

function showSignup() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('signup-form').style.display = '';
  document.getElementById('signup-error').textContent = '';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  if (!email || !password) { errEl.textContent = 'Please fill in all fields'; return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    Auth.saveAuth(data.token, data.user);
    closeAuthModal();
    Auth.updateHeaderUI();
    FavoritesCache.load();
    showToast('Welcome back, ' + data.user.name.split(' ')[0] + '!', 'success');
    // Refresh hearts on page
    document.querySelectorAll('.heart-btn').forEach(btn => {
      const key = btn.dataset.key;
      if (FavoritesCache.has(key)) btn.classList.add('active');
    });
  } catch {
    errEl.textContent = 'Something went wrong. Please try again.';
  }
}

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');

  if (!name || !email || !password) { errEl.textContent = 'Please fill in all required fields'; return; }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    Auth.saveAuth(data.token, data.user);
    closeAuthModal();
    Auth.updateHeaderUI();
    FavoritesCache.load();
    showToast('Account created! Welcome, ' + data.user.name.split(' ')[0] + '!', 'success');
  } catch {
    errEl.textContent = 'Something went wrong. Please try again.';
  }
}

// ---- Toast ----
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} visible`;
  setTimeout(() => t.classList.remove('visible'), 3000);
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('auth-modal')) closeAuthModal();
  });
  document.getElementById('save-search-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('save-search-modal'))
      document.getElementById('save-search-modal').classList.remove('open');
  });

  // Enter key on login
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  Auth.updateHeaderUI();
  FavoritesCache.load();

  // Wire up header buttons
  document.getElementById('login-btn')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('signup-btn')?.addEventListener('click', () => openAuthModal('signup'));
});
