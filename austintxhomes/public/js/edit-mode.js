/**
 * Edit Mode — visual click-to-edit overlay for admin users.
 * Loaded on every page but only activates for role=admin.
 * Toggle "Edit" button → hover highlights → click to edit → save.
 */
(function () {
  // Only activate for admin users
  try {
    const u = JSON.parse(localStorage.getItem('idx_user') || '{}');
    if (u.role !== 'admin') return;
  } catch { return; }

  const token = localStorage.getItem('idx_token');
  if (!token) return;

  let editActive = false;
  let currentPopover = null;
  const SLUG = (function () {
    const p = location.pathname.replace(/^\//, '').replace(/\/$/, '');
    return p || 'home';
  })();

  const EDITABLE = 'h1,h2,h3,h4,p,a,button,span,li,td,th,label,figcaption,blockquote';

  // ─── Inject CSS ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* Edit mode toggle button */
    #em-toggle {
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: #b8935a; color: #fff; border: none; cursor: pointer;
      font-family: 'Inter', system-ui, sans-serif; font-size: 12px;
      font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
      padding: 10px 20px; border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0,0,0,.3);
      transition: background .2s, transform .1s;
    }
    #em-toggle:hover { background: #cda96f; }
    #em-toggle.active { background: #e74c3c; }

    /* Hover highlights */
    body.em-active ${EDITABLE} {
      transition: outline .15s, background .15s;
    }
    body.em-active ${EDITABLE}:hover {
      outline: 2px dashed rgba(184,147,90,.5) !important;
      outline-offset: 3px;
      cursor: pointer !important;
    }
    body.em-active a:hover, body.em-active button:hover {
      outline-color: rgba(52,152,219,.6) !important;
    }

    /* Popover */
    .em-popover {
      position: fixed; z-index: 100000;
      background: #1a1918; border: 1px solid rgba(184,147,90,.3);
      border-radius: 8px; padding: 16px; min-width: 340px; max-width: 480px;
      box-shadow: 0 12px 40px rgba(0,0,0,.5);
      font-family: 'Inter', system-ui, sans-serif; color: #fff;
    }
    .em-popover-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; font-size: 11px; letter-spacing: .1em;
      text-transform: uppercase; color: #b8935a;
    }
    .em-popover-close {
      background: none; border: none; color: rgba(255,255,255,.4);
      font-size: 18px; cursor: pointer; padding: 0; line-height: 1;
    }
    .em-popover-close:hover { color: #fff; }
    .em-popover label {
      display: block; font-size: 10px; letter-spacing: .1em;
      text-transform: uppercase; color: rgba(255,255,255,.5);
      margin-bottom: 4px; margin-top: 10px;
    }
    .em-popover textarea, .em-popover input[type="text"] {
      width: 100%; background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.15); border-radius: 4px;
      padding: 8px 10px; color: #fff; font-family: 'Inter', sans-serif;
      font-size: 13px; line-height: 1.5; resize: vertical; outline: none;
      box-sizing: border-box;
    }
    .em-popover textarea { min-height: 60px; }
    .em-popover textarea:focus, .em-popover input:focus {
      border-color: #b8935a;
    }
    .em-popover-actions {
      display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;
    }
    .em-btn {
      border: none; cursor: pointer; font-family: 'Inter', sans-serif;
      font-size: 11px; font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; padding: 8px 16px; border-radius: 4px;
      transition: background .2s;
    }
    .em-btn-save { background: #b8935a; color: #fff; }
    .em-btn-save:hover { background: #cda96f; }
    .em-btn-ai { background: rgba(52,152,219,.2); color: #3498db; border: 1px solid rgba(52,152,219,.3); }
    .em-btn-ai:hover { background: rgba(52,152,219,.3); }
    .em-btn-cancel { background: rgba(255,255,255,.08); color: rgba(255,255,255,.6); }
    .em-btn-cancel:hover { background: rgba(255,255,255,.15); }
    .em-btn:disabled { opacity: .5; cursor: wait; }
    .em-ai-result {
      margin-top: 10px; padding: 10px; background: rgba(52,152,219,.08);
      border: 1px solid rgba(52,152,219,.2); border-radius: 4px;
      font-size: 13px; color: rgba(255,255,255,.85); line-height: 1.5;
    }
    .em-ai-result-actions { display: flex; gap: 6px; margin-top: 8px; }
    .em-toast {
      position: fixed; bottom: 70px; right: 20px; z-index: 100001;
      background: #27ae60; color: #fff; padding: 10px 20px;
      border-radius: 6px; font-family: 'Inter', sans-serif; font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      animation: em-fade-in .3s ease;
    }
    .em-toast.error { background: #e74c3c; }
    @keyframes em-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);

  // ─── Toggle button ──────────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.id = 'em-toggle';
  toggle.textContent = 'Edit';
  document.body.appendChild(toggle);

  toggle.addEventListener('click', () => {
    editActive = !editActive;
    toggle.classList.toggle('active', editActive);
    toggle.textContent = editActive ? 'Exit Edit' : 'Edit';
    document.body.classList.toggle('em-active', editActive);
    if (!editActive) closePopover();
  });

  // ─── Click handler ──────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!editActive) return;
    const el = e.target.closest(EDITABLE);
    if (!el) return;
    if (el.closest('.em-popover') || el.closest('#em-toggle')) return;
    if (el.closest('#site-nav') || el.closest('#site-footer')) return;

    e.preventDefault();
    e.stopPropagation();
    openPopover(el);
  }, true);

  // ─── Popover ────────────────────────────────────────────────
  function closePopover() {
    if (currentPopover) { currentPopover.remove(); currentPopover = null; }
  }

  function openPopover(el) {
    closePopover();

    const tag = el.tagName.toLowerCase();
    const text = el.textContent.trim();
    const href = el.getAttribute('href') || el.getAttribute('onclick') || '';
    const isLink = tag === 'a' || tag === 'button' || !!href;

    const pop = document.createElement('div');
    pop.className = 'em-popover';

    pop.innerHTML = `
      <div class="em-popover-header">
        <span>&lt;${tag}&gt; — ${SLUG}</span>
        <button class="em-popover-close">&times;</button>
      </div>
      <label>Text</label>
      <textarea class="em-text">${escHtml(text)}</textarea>
      ${isLink ? `
        <label>Link URL</label>
        <input type="text" class="em-href" value="${escHtml(href)}" placeholder="/buy, /about, https://..." />
      ` : ''}
      <div class="em-popover-actions">
        <button class="em-btn em-btn-save">Save</button>
        <button class="em-btn em-btn-ai" data-action="rewrite_text">AI Rewrite</button>
        ${isLink ? '<button class="em-btn em-btn-ai" data-action="fix_link">AI Fix Link</button>' : ''}
        <button class="em-btn em-btn-cancel">Cancel</button>
      </div>
      <div class="em-ai-area"></div>
    `;

    // Position near the clicked element
    const rect = el.getBoundingClientRect();
    pop.style.top = Math.min(rect.bottom + 8, window.innerHeight - 350) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - 500) + 'px';

    document.body.appendChild(pop);
    currentPopover = pop;

    // Close
    pop.querySelector('.em-popover-close').onclick = closePopover;
    pop.querySelector('.em-btn-cancel').onclick = closePopover;

    // Save
    pop.querySelector('.em-btn-save').onclick = async () => {
      const newText = pop.querySelector('.em-text').value.trim();
      const newHref = pop.querySelector('.em-href')?.value.trim() || null;
      const btn = pop.querySelector('.em-btn-save');
      btn.disabled = true; btn.textContent = 'Saving…';

      try {
        const r = await apiFetch(`/api/admin-cms/pages/${SLUG}/edit`, {
          method: 'POST',
          body: JSON.stringify({
            tag,
            oldText: text,
            newText: newText,
            oldHref: isLink ? href : null,
            newHref: isLink ? newHref : null
          })
        });
        if (r.ok) {
          el.textContent = newText;
          if (isLink && newHref && el.setAttribute) el.setAttribute('href', newHref);
          closePopover();
          showToast('Saved — change is live');
        } else {
          const d = await r.json().catch(() => ({}));
          showToast(d.error || 'Save failed', true);
          btn.disabled = false; btn.textContent = 'Save';
        }
      } catch (err) {
        showToast('Network error: ' + err.message, true);
        btn.disabled = false; btn.textContent = 'Save';
      }
    };

    // AI buttons
    pop.querySelectorAll('.em-btn-ai').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        btn.disabled = true; btn.textContent = 'Thinking…';
        const aiArea = pop.querySelector('.em-ai-area');

        try {
          const r = await apiFetch('/api/admin-cms/ai', {
            method: 'POST',
            body: JSON.stringify({
              action,
              elementText: pop.querySelector('.em-text').value.trim(),
              elementTag: tag,
              elementHref: pop.querySelector('.em-href')?.value || href,
              pageTitle: document.title,
              pageSlug: SLUG
            })
          });
          const data = await r.json();
          if (data.suggestion) {
            aiArea.innerHTML = `
              <div class="em-ai-result">
                <div>${escHtml(data.suggestion)}</div>
                <div class="em-ai-result-actions">
                  <button class="em-btn em-btn-save em-accept">Accept</button>
                  <button class="em-btn em-btn-cancel em-dismiss">Dismiss</button>
                </div>
              </div>
            `;
            aiArea.querySelector('.em-accept').onclick = () => {
              if (action === 'fix_link') {
                const hrefInput = pop.querySelector('.em-href');
                if (hrefInput) hrefInput.value = data.suggestion;
              } else {
                pop.querySelector('.em-text').value = data.suggestion;
              }
              aiArea.innerHTML = '';
            };
            aiArea.querySelector('.em-dismiss').onclick = () => { aiArea.innerHTML = ''; };
          } else {
            aiArea.innerHTML = '<div class="em-ai-result">No suggestion returned.</div>';
          }
        } catch (err) {
          aiArea.innerHTML = `<div class="em-ai-result">Error: ${err.message}</div>`;
        }
        btn.disabled = false;
        btn.textContent = action === 'fix_link' ? 'AI Fix Link' : 'AI Rewrite';
      };
    });
  }

  // ─── Helpers ────────────────────────────────────────────────
  function apiFetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        ...(opts.headers || {})
      }
    });
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.className = 'em-toast' + (isError ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Close popover on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentPopover) closePopover();
  });
})();
