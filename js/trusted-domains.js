// ── Trusted Domains — Settings Page ──────────────────────────────────────────
// Reads/writes chrome.storage.local via the PDAS extension content bridge.
// Falls back to a "extension not detected" message if the extension isn't installed.

(function () {

  // ── Bridge: ask the extension for storage access ──────────────────────────
  // The extension's content.js must forward these messages to background.js.
  // If the extension isn't present the Promise times out and we show a notice.

  function sendToExtension(msg) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 1500);
      window.addEventListener('message', function handler(e) {
        if (e.data && e.data.__pdas_reply === msg.type) {
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          resolve(e.data.payload);
        }
      });
      window.postMessage({ __pdas: true, ...msg }, '*');
    });
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function showState(state) {
    // state: 'loading' | 'empty' | 'list' | 'unavailable'
    document.getElementById('trustedDomainsLoading').style.display = state === 'loading'      ? '' : 'none';
    document.getElementById('trustedDomainsEmpty').style.display   = state === 'empty'        ? '' : 'none';
    document.getElementById('trustedDomainsList').style.display    = state === 'list'         ? '' : 'none';
  }

  function showMsg(text, type) {
    const el = document.getElementById('trustedDomainsMsg');
    el.textContent  = text;
    el.className    = 'settings-msg ' + type;
    el.style.display = '';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  // ── Render domain rows ────────────────────────────────────────────────────
  function renderDomains(domains) {
    const container = document.getElementById('trustedDomainsRows');
    container.innerHTML = '';

    domains.forEach(function (domain) {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:0.7rem 0.9rem; background:var(--bg2); border-radius:10px;
        margin-bottom:0.5rem; gap:0.75rem;
      `;
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">
          <span style="font-size:1rem;flex-shrink:0;">🌐</span>
          <span style="font-family:monospace;font-size:0.88rem;color:var(--text);
                       white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(domain)}
          </span>
        </div>
        <button
          onclick="removeTrustedDomain('${escapeHtml(domain)}')"
          style="
            background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2);
            color:#ef4444; border-radius:7px; padding:0.35rem 0.75rem;
            font-size:0.8rem; cursor:pointer; white-space:nowrap; flex-shrink:0;
            transition:background 0.2s;
          "
          onmouseover="this.style.background='rgba(239,68,68,0.18)'"
          onmouseout="this.style.background='rgba(239,68,68,0.08)'"
        >🗑 Remove</button>
      `;
      container.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadTrustedDomains() {
    showState('loading');
    const result = await sendToExtension({ type: 'PDAS_GET_TRUSTED_DOMAINS' });

    if (result === null) {
      // Extension not detected — show inline notice instead of error
      showState('empty');
      document.getElementById('trustedDomainsEmpty').innerHTML = `
        <div style="font-size:2rem;margin-bottom:0.5rem;">🔌</div>
        PDAS extension not detected.<br>
        <span style="font-size:0.8rem;">Install the extension and reload this page to manage trusted domains.</span>
      `;
      return;
    }

    const domains = Array.isArray(result) ? result : [];
    if (domains.length === 0) {
      showState('empty');
    } else {
      renderDomains(domains);
      showState('list');
    }
  }

  // ── Remove one ────────────────────────────────────────────────────────────
  window.removeTrustedDomain = async function (domain) {
    const result = await sendToExtension({ type: 'PDAS_REMOVE_TRUSTED_DOMAIN', domain });
    if (result === null) { showMsg('Extension not reachable.', 'error'); return; }
    showMsg('✓ ' + domain + ' removed from trusted domains.', 'success');
    loadTrustedDomains();
  };

  // ── Remove all ────────────────────────────────────────────────────────────
  window.clearAllTrustedDomains = async function () {
    if (!confirm('Remove all trusted domains?\n\nThe extension will start scanning all previously trusted sites again.')) return;
    const result = await sendToExtension({ type: 'PDAS_CLEAR_TRUSTED_DOMAINS' });
    if (result === null) { showMsg('Extension not reachable.', 'error'); return; }
    showMsg('✓ All trusted domains removed.', 'success');
    loadTrustedDomains();
  };

  // ── Init on DOMContentLoaded ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', loadTrustedDomains);

})();
