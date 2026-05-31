const params = new URLSearchParams(location.search);
const url    = params.get('url') || '';
const score  = parseFloat(params.get('score'));

// Show URL
document.getElementById('urlDisplay').textContent = url || 'Unknown URL';

// Show score
document.getElementById('scoreDisplay').textContent =
  isNaN(score) ? '—' : score.toFixed(1);

// ── Go Back button ──────────────────────────────────────────────────────────
// Strategy: try history.back() first; if there's no history (tab was opened
// directly to this blocked URL), close the tab instead.
document.getElementById('goBackBtn').addEventListener('click', function () {
  if (history.length > 1) {
    history.back();
  } else {
    // No history to go back to — close the tab
    window.close();
  }
});

// ── Proceed Anyway button ───────────────────────────────────────────────────
document.getElementById('proceedBtn').addEventListener('click', function () {
  if (!url) return;
  // Tell background.js to whitelist this URL for one navigation, then go
  chrome.runtime.sendMessage({ type: 'PDAS_ALLOW_ONCE', url }, function () {
    window.location.href = url;
  });
});
