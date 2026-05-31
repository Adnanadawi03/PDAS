const API_BASE = 'https://pdas-engine.onrender.com';

// URLs the user chose to visit once despite the warning
const allowedOnce = new Set();

// ── Message handler: whitelist a URL for one navigation ────────────────────
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'PDAS_ALLOW_ONCE' && msg.url) {
    allowedOnce.add(msg.url);
  }
  sendResponse({});
});

// ── Navigation interceptor ─────────────────────────────────────────────────
chrome.webNavigation.onBeforeNavigate.addListener(function (details) {
  if (details.frameId !== 0) return; // main frame only

  const url = details.url;

  // Never scan the blocked page itself (would cause infinite loop)
  if (url.includes(chrome.runtime.id)) return;

  // Skip URLs the user already approved once
  if (allowedOnce.has(url)) {
    allowedOnce.delete(url);
    return;
  }

  fetch(`${API_BASE}/scan/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
    .then(r => r.json())
    .then(data => {
      if (data.verdict === 'block') {
        const blockPage = chrome.runtime.getURL('blocked.html')
          + '?url='   + encodeURIComponent(url)
          + '&score=' + encodeURIComponent(data.score ?? '');
        chrome.tabs.update(details.tabId, { url: blockPage });
      }
    })
    .catch(err => console.error('[PDAS][ERR]', err));

}, { url: [{ schemes: ['http', 'https'] }] });

// ── Download interceptor ───────────────────────────────────────────────────
chrome.downloads.onCreated.addListener(function (item) {
  fetch(`${API_BASE}/scan/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: item.url })
  })
    .then(r => r.json())
    .then(data => {
      if (data.verdict === 'block') {
        chrome.downloads.cancel(item.id);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'PDAS Web Guard',
          message: 'Blocked a suspicious download!'
        });
      }
    })
    .catch(err => console.error('[PDAS][ERR]', err));
});
