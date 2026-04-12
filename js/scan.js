const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ⚠️ Change this to your FastAPI server URL when deployed
const API_BASE = 'http://127.0.0.1:8000';

// ── Auth guard ──
async function initScan() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  const user = session.user;
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  const avatarUrl = user.user_metadata?.avatar_url;
  const avatarEl = document.getElementById('userAvatar');
  if (avatarUrl && avatarEl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else if (avatarEl) {
    avatarEl.textContent = initials;
  }
  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = user.email;

  checkAPIStatus();
}

async function doLogout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ── API Status ──
async function checkAPIStatus() {
  const el = document.getElementById('apiStatus');
  const txt = document.getElementById('apiStatusText');
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      el.className = 'api-status online';
      txt.textContent = '✓ PDAS Engine is online and ready to scan';
    } else { throw new Error(); }
  } catch {
    el.className = 'api-status offline';
    txt.innerHTML = '✗ PDAS Engine is offline — <a href="#" onclick="showSetupGuide()" style="color:inherit;font-weight:600;">How to start it?</a>';
  }
}

function showSetupGuide() {
  alert('To start the PDAS Engine:\n\n1. Open terminal in your PDAS2-main folder\n2. Run: uvicorn model_service.app.main:app --reload --port 8000\n3. Refresh this page');
}

// ── Tab switching ──
function switchScanTab(tab) {
  ['url','file','history'].forEach(t => {
    document.getElementById(t + 'Panel').style.display = t === tab ? 'block' : 'none';
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
  });
  if (tab === 'history') loadHistory();
}

// ── URL Scan ──
function setUrl(url) { document.getElementById('urlInput').value = url; }

async function scanURL() {
  const url = document.getElementById('urlInput').value.trim();
  const resultEl = document.getElementById('urlResult');
  const btn = document.getElementById('urlScanBtn');

  if (!url) { alert('Please enter a URL to scan.'); return; }

  resultEl.style.display = 'block';
  resultEl.innerHTML = `<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Scanning URL...</div></div>`;
  btn.disabled = true; btn.textContent = 'Scanning...';

  try {
    const r = await fetch(`${API_BASE}/scan/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!r.ok) throw new Error('Server error: ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, url, 'url');
  } catch (err) {
    resultEl.innerHTML = buildErrorHTML(err.message);
  }
  btn.disabled = false; btn.textContent = 'Scan →';
}

// ── File Scan ──
function handleDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('dropZone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) scanFile(file);
}

async function scanFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('File must be under 10MB.'); return; }

  const info = document.getElementById('fileSelected');
  info.style.display = 'flex';
  document.getElementById('fileSelectedName').textContent = file.name;
  document.getElementById('fileSelectedSize').textContent = ' · ' + (file.size / 1024).toFixed(1) + ' KB';

  const resultEl = document.getElementById('fileResult');
  resultEl.style.display = 'block';
  resultEl.innerHTML = `<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Scanning ${file.name}...</div></div>`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const r = await fetch(`${API_BASE}/scan/file`, { method: 'POST', body: formData });
    if (!r.ok) throw new Error('Server error: ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, file.name, 'file');
  } catch (err) {
    resultEl.innerHTML = buildErrorHTML(err.message);
  }
}

// ── Result Builder ──
function buildResultHTML(data, target, type) {
  const verdict = data.verdict;
  const score = data.score;
  const icons = { allow: '✅', warn: '⚠️', block: '🚫' };
  const labels = { allow: 'Safe', warn: 'Suspicious', block: 'Dangerous' };
  const barColors = { allow: '#22c55e', warn: '#f59e0b', block: '#ef4444' };
  const messages = {
    allow: 'No significant phishing indicators found.',
    warn:  'Some suspicious patterns detected. Proceed with caution.',
    block: 'Clear phishing indicators found. This is likely dangerous!'
  };

  const signals = data.signals || {};
  const rules = signals.rules || {};
  const signalTags = Object.keys(rules).filter(k => rules[k]).map(k =>
    `<span class="signal-tag bad">${k.replace(/_/g,' ')}</span>`
  ).join('');

  return `
    <div class="result-card ${verdict}">
      <div class="result-header">
        <div class="result-icon">${icons[verdict]}</div>
        <div>
          <div class="result-verdict">${labels[verdict]}</div>
          <div style="font-size:0.85rem;color:var(--muted);margin-top:0.2rem;">${messages[verdict]}</div>
        </div>
        <div class="result-score-wrap">
          <div class="result-score-num">${score}</div>
          <div class="result-score-label">Risk Score / 100</div>
        </div>
      </div>
      <div class="result-target">${type === 'url' ? '🔗' : '📄'} ${target}</div>
      <div class="score-bar-wrap">
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${score}%;background:${barColors[verdict]};"></div>
        </div>
      </div>
      ${signalTags ? `<div style="margin-top:0.5rem;font-size:0.8rem;color:var(--muted);margin-bottom:0.4rem;">Detected signals:</div><div class="result-signals">${signalTags}</div>` : ''}
    </div>`;
}

function buildErrorHTML(msg) {
  return `<div class="result-card" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2);">
    <div style="display:flex;align-items:center;gap:0.75rem;">
      <span style="font-size:1.5rem;">❌</span>
      <div>
        <div style="font-weight:700;color:#ef4444;">Could not connect to PDAS Engine</div>
        <div style="font-size:0.82rem;color:var(--muted);margin-top:0.2rem;">${msg}</div>
        <div style="font-size:0.82rem;color:var(--muted);margin-top:0.4rem;">Make sure the FastAPI server is running on <code style="background:var(--bg2);padding:0.1rem 0.4rem;border-radius:4px;">${API_BASE}</code></div>
      </div>
    </div>
  </div>`;
}

// ── History ──
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = `<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Loading...</div></div>`;
  try {
    const r = await fetch(`${API_BASE}/events?limit=30`);
    if (!r.ok) throw new Error();
    const events = await r.json();
    if (!events.length) {
      list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem;">No scans yet.</div>';
      return;
    }
    const typeIcons = { url: '🔗', file: '📄' };
    list.innerHTML = events.map(e => {
      const d = new Date(e.timestamp);
      const timeStr = d.toLocaleString();
      return `<div class="history-item">
        <div class="history-type">${typeIcons[e.type] || '📋'}</div>
        <div class="history-target" title="${e.target}">${e.target}</div>
        <span class="verdict-pill verdict-${e.verdict}">${e.verdict.toUpperCase()}</span>
        <div style="font-family:'Syne',sans-serif;font-size:0.85rem;font-weight:700;color:${e.verdict==='block'?'#ef4444':e.verdict==='warn'?'#f59e0b':'#22c55e'}">${e.score}</div>
        <div class="history-time">${timeStr}</div>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = `<div style="color:#ef4444;text-align:center;padding:2rem;">Cannot load history — PDAS Engine offline.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', initScan);
