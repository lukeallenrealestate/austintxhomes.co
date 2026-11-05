// Realtor-OS CRM wrapper. Server-to-server over REALTOR_OS_URL +
// REALTOR_OS_INTERNAL_KEY (mirrors the pattern Realtor-OS already uses to
// call idx-search's /api/internal routes). All three functions fail
// soft: if the env isn't configured or the remote is unreachable, they
// return null/empty and the caller falls back to manual entry. Nothing
// in the admin flow should hard-error because Realtor-OS is down.
//
// Expected Realtor-OS endpoints (set via env if different):
//   GET  {REALTOR_OS_URL}/api/internal/contacts?q=<text>&limit=20
//        -> [{id, name, email, phone}, ...]
//   POST {REALTOR_OS_URL}/api/internal/contacts
//        body: {name, email, phone, source, note}
//        -> {id, name, email, phone}
//   GET  {REALTOR_OS_URL}/api/internal/contacts/:id
//        -> {id, name, email, phone}
//
// Auth header: X-Internal-API-Key: <REALTOR_OS_INTERNAL_KEY>
const fetch = require('node-fetch');

function isConfigured() {
  return !!(process.env.REALTOR_OS_URL && process.env.REALTOR_OS_INTERNAL_KEY);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.REALTOR_OS_INTERNAL_KEY
  };
}

function baseUrl() {
  return String(process.env.REALTOR_OS_URL || '').replace(/\/+$/, '');
}

async function searchContacts(query) {
  if (!isConfigured()) return { configured: false, contacts: [] };
  try {
    const url = `${baseUrl()}/api/internal/contacts?q=${encodeURIComponent(query || '')}&limit=20`;
    const res = await fetch(url, { headers: headers(), timeout: 5000 });
    if (!res.ok) {
      console.warn('[CRM] searchContacts non-200:', res.status);
      return { configured: true, contacts: [], error: `Realtor-OS returned ${res.status}` };
    }
    const data = await res.json();
    const contacts = Array.isArray(data) ? data : (data.contacts || []);
    return { configured: true, contacts };
  } catch (err) {
    console.warn('[CRM] searchContacts failed:', err.message);
    return { configured: true, contacts: [], error: err.message };
  }
}

async function getContact(id) {
  if (!isConfigured() || !id) return null;
  try {
    const res = await fetch(`${baseUrl()}/api/internal/contacts/${encodeURIComponent(id)}`, {
      headers: headers(),
      timeout: 5000
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[CRM] getContact failed:', err.message);
    return null;
  }
}

// Push a brand-new client to Realtor-OS. Returns the CRM contact_id so
// the idx-search users row can be linked (users.crm_contact_id). If the
// mirror fails, we still want the local user created — Luke's workflow
// shouldn't be blocked by a CRM outage.
async function createContact({ name, email, phone, source, note }) {
  if (!isConfigured()) return { ok: false, id: null, reason: 'not_configured' };
  try {
    const res = await fetch(`${baseUrl()}/api/internal/contacts`, {
      method: 'POST',
      headers: headers(),
      timeout: 8000,
      body: JSON.stringify({ name, email, phone, source: source || 'austintxhomes.co', note })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[CRM] createContact non-200:', res.status, txt);
      return { ok: false, id: null, reason: `realtor_os_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, id: data.id || data.contact_id || null, data };
  } catch (err) {
    console.warn('[CRM] createContact failed:', err.message);
    return { ok: false, id: null, reason: err.message };
  }
}

module.exports = { isConfigured, searchContacts, getContact, createContact };
