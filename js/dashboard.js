const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API_BASE = 'http://127.0.0.1:8000'; // Change to your deployed server URL

let _allEvents = [];
let _activeFilter = 'all';

// ── Auth guard ──
async function initDashboard() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  const user = session.user;
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = user.user_metadata?.avatar_url;
  const avatarEl = document.getElementById('userAvatar');
  if (avatarUrl && avatarEl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent='${initials}'">`;
  } else if (avatarEl) {
    avatarEl.textContent = initials;
  }
  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = user.email;

  await checkAPIStatus();
}

async function logout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ── API Status + load data ──
async function checkAPIStatus() {
  const el = document.getElementById('apiStatus');
  const txt = document.getElementById('apiStatusText');
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      el.className = 'api-status online';
      txt.textContent = '✓ PDAS Engine is online — scan history loaded from engine';
      await loadAllData();
    } else { throw new Error(); }
  } catch {
    el.className = 'api-status offline';
    txt.textContent = '✗ PDAS Engine offline — showing placeholder data. Start engine with: uvicorn model_service.app.main:app --port 8000';
    loadPlaceholderData();
  }
}

// ── Load real data from engine ──
async function loadAllData() {
  try {
    const r = await fetch(`${API_BASE}/events?limit=100`);
    const events = await r.json();
    _allEvents = events;

    const now = new Date();
    document.getElementById('lastUpdated').textContent = 'Last updated: ' + now.toLocaleTimeString();

    // Stats
    const total = events.length;
    const allow = events.filter(e => e.verdict === 'allow').length;
    const warn  = events.filter(e => e.verdict === 'warn').length;
    const block = events.filter(e => e.verdict === 'block').length;

    document.getElementById('statTotal').textContent = total.toLocaleString();
    document.getElementById('statAllow').textContent = allow;
    document.getElementById('statWarn').textContent  = warn;
    document.getElementById('statBlock').textContent = block;
    document.getElementById('statTotalSub').textContent = 'From PDAS engine database';
    document.getElementById('statAllowPct').textContent = total ? Math.round(allow/total*100) + '% of total' : '';
    document.getElementById('statWarnPct').textContent  = total ? Math.round(warn/total*100) + '% of total' : '';
    document.getElementById('statBlockPct').textContent = total ? Math.round(block/total*100) + '% of total' : '';

    updateDonut(allow, warn, block, total);
    renderBarChart(events);
    renderTable(events, _activeFilter);
    renderActivity(events);

  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

// ── Donut chart ──
function updateDonut(allow, warn, block, total) {
  const circ = 251;
  if (!total) return;
  const aFrac = allow / total, wFrac = warn / total, bFrac = block / total;

  const aLen = aFrac * circ, wLen = wFrac * circ, bLen = bFrac * circ;

  document.getElementById('donutAllow').setAttribute('stroke-dasharray', `${aLen} ${circ}`);
  document.getElementById('donutAllow').setAttribute('stroke-dashoffset', '-5');
  document.getElementById('donutWarn').setAttribute('stroke-dasharray', `${wLen} ${circ}`);
  document.getElementById('donutWarn').setAttribute('stroke-dashoffset', `-${5 + aLen}`);
  document.getElementById('donutBlock').setAttribute('stroke-dasharray', `${bLen} ${circ}`);
  document.getElementById('donutBlock').setAttribute('stroke-dashoffset', `-${5 + aLen + wLen}`);
  document.getElementById('donutNum').textContent = total;
  document.getElementById('lgAllow').textContent = Math.round(aFrac*100) + '%';
  document.getElementById('lgWarn').textContent  = Math.round(wFrac*100) + '%';
  document.getElementById('lgBlock').textContent = Math.round(bFrac*100) + '%';
  document.getElementById('donutTotal').textContent = total + ' total';
}

// ── Bar chart (last 7 days) ──
function renderBarChart(events) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const counts = [0,0,0,0,0,0,0];
  const today = new Date().getDay();
  events.forEach(e => {
    const d = new Date(e.timestamp).getDay();
    counts[d]++;
  });
  const ordered = [];
  const labels = [];
  for (let i = 1; i <= 7; i++) {
    const idx = (today - 7 + i + 7) % 7;
    ordered.push(counts[idx]);
    labels.push(days[idx]);
  }
  const max = Math.max(...ordered, 1);
  document.getElementById('barChart').innerHTML = ordered.map((v, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max((v/max)*100,4)}px;background:${v===max?'var(--accent)':'rgba(0,229,255,0.3)'}"></div>
      <div class="bar-label">${labels[i]}</div>
    </div>
  `).join('');
}

// ── Table ──
function setFilter(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _activeFilter = filter;
  renderTable(_allEvents, filter);
}

function renderTable(events, filter) {
  const filtered = filter === 'all' ? events : events.filter(e => e.verdict === filter);
  document.getElementById('scanCount').textContent = `${filtered.length} of ${events.length} scans`;
  const icons = { url:'🔗', file:'📄' };
  const body = document.getElementById('tableBody');
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">No scans found.</td></tr>`;
    return;
  }
  body.innerHTML = filtered.slice(0, 20).map(e => {
    const verdictClass = { allow:'badge-low', warn:'badge-med', block:'badge-high' }[e.verdict] || '';
    const verdictLabel = { allow:'SAFE', warn:'WARN', block:'BLOCK' }[e.verdict] || e.verdict.toUpperCase();
    const time = new Date(e.timestamp).toLocaleString();
    const target = e.target.length > 40 ? e.target.slice(0,40) + '…' : e.target;
    return `<tr>
      <td class="email-cell" title="${e.target}">${icons[e.type]||'📋'} ${target}</td>
      <td style="color:var(--muted);font-size:0.8rem;">${e.type}</td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;color:${e.verdict==='block'?'#ef4444':e.verdict==='warn'?'#f59e0b':'#22c55e'}">${e.score}</td>
      <td><span class="risk-badge ${verdictClass}">${verdictLabel}</span></td>
      <td style="color:var(--muted);font-size:0.78rem;">${time}</td>
    </tr>`;
  }).join('');
}

// ── Activity feed ──
function renderActivity(events) {
  const latest = events.slice(0, 8);
  const icons = { allow:'✅', warn:'⚠️', block:'🚨' };
  const classes = { allow:'low', warn:'med', block:'high' };
  const msgs = {
    allow: t => `${t.type === 'url' ? 'URL' : 'File'} <b>${t.target.length>30?t.target.slice(0,30)+'…':t.target}</b> passed all checks`,
    warn:  t => `Suspicious ${t.type} detected: <b>${t.target.length>30?t.target.slice(0,30)+'…':t.target}</b>`,
    block: t => `Dangerous ${t.type} blocked: <b>${t.target.length>30?t.target.slice(0,30)+'…':t.target}</b>`,
  };
  const actEl = document.getElementById('activityList');
  if (!latest.length) { actEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:1rem;font-size:0.85rem;">No activity yet.</div>'; return; }
  actEl.innerHTML = latest.map(e => {
    const ago = timeAgo(new Date(e.timestamp));
    return `<div class="activity-item">
      <div class="act-icon ${classes[e.verdict]}">${icons[e.verdict]}</div>
      <div><div class="act-text">${msgs[e.verdict](e)}</div><div class="act-time">${ago}</div></div>
    </div>`;
  }).join('');
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// ── Placeholder (offline) ──
function loadPlaceholderData() {
  document.getElementById('lastUpdated').textContent = 'Engine offline — showing demo data';
  document.getElementById('statTotal').textContent = '—';
  document.getElementById('statAllow').textContent = '—';
  document.getElementById('statWarn').textContent = '—';
  document.getElementById('statBlock').textContent = '—';
  document.getElementById('statTotalSub').textContent = 'Start PDAS engine to see real data';
  document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">PDAS Engine is offline. Start it to see scan results.</td></tr>`;
  document.getElementById('activityList').innerHTML = `<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:1rem;">No activity — engine offline.</div>`;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const vals = [0,0,0,0,0,0,0];
  document.getElementById('barChart').innerHTML = days.map((d,i) => `
    <div class="bar-col">
      <div class="bar" style="height:4px;background:rgba(0,229,255,0.15)"></div>
      <div class="bar-label">${d}</div>
    </div>
  `).join('');
}

// ── SCAN functions (inline in dashboard) ──
function switchScanTab(tab) {
  document.getElementById('urlPanel').style.display = tab === 'url' ? 'block' : 'none';
  document.getElementById('filePanel').style.display = tab === 'file' ? 'block' : 'none';
  document.getElementById('tabUrl').classList.toggle('active', tab === 'url');
  document.getElementById('tabFile').classList.toggle('active', tab === 'file');
  document.getElementById('scanResult').innerHTML = '';
}

function setUrl(url) { document.getElementById('urlInput').value = url; }

async function scanURL() {
  const url = document.getElementById('urlInput').value.trim();
  const resultEl = document.getElementById('scanResult');
  const btn = document.getElementById('urlScanBtn');
  if (!url) { alert('Please enter a URL.'); return; }
  resultEl.innerHTML = `<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Scanning URL...</div></div>`;
  btn.disabled = true; btn.textContent = 'Scanning...';
  try {
    const r = await fetch(`${API_BASE}/scan/url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!r.ok) throw new Error('Server error ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, url, 'url');
    await loadAllData(); // refresh stats after scan
  } catch (err) { resultEl.innerHTML = buildErrorHTML(err.message); }
  btn.disabled = false; btn.textContent = 'Scan →';
}

function handleDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function handleDragLeave() { document.getElementById('dropZone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) scanFile(file);
}

async function scanFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('File must be under 10MB.'); return; }
  const resultEl = document.getElementById('scanResult');
  resultEl.innerHTML = `<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Scanning ${file.name}...</div></div>`;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const r = await fetch(`${API_BASE}/scan/file`, { method: 'POST', body: formData });
    if (!r.ok) throw new Error('Server error ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, file.name, 'file');
    await loadAllData(); // refresh stats after scan
  } catch (err) { resultEl.innerHTML = buildErrorHTML(err.message); }
}

function buildResultHTML(data, target, type) {
  const v = data.verdict;
  const icons = { allow:'✅', warn:'⚠️', block:'🚫' };
  const labels = { allow:'Safe', warn:'Suspicious', block:'Dangerous' };
  const barColors = { allow:'#22c55e', warn:'#f59e0b', block:'#ef4444' };
  const messages = {
    allow: 'No significant phishing indicators found. This appears safe.',
    warn:  'Some suspicious patterns detected. Proceed with caution.',
    block: 'Clear phishing indicators found. This is dangerous!'
  };
  const rules = data.signals?.rules || {};
  const tags = Object.keys(rules).filter(k => rules[k]).map(k =>
    `<span class="signal-tag bad">${k.replace(/_/g,' ')}</span>`
  ).join('');
  return `<div class="result-card ${v}">
    <div class="result-header">
      <div class="result-icon">${icons[v]}</div>
      <div>
        <div class="result-verdict">${labels[v]}</div>
        <div style="font-size:0.82rem;color:var(--muted);margin-top:0.2rem;">${messages[v]}</div>
      </div>
      <div class="result-score-wrap">
        <div class="result-score-num">${data.score}</div>
        <div class="result-score-label">Risk Score / 100</div>
      </div>
    </div>
    <div class="result-target">${type==='url'?'🔗':'📄'} ${target}</div>
    <div class="score-bar-wrap">
      <div class="score-bar-bg"><div class="score-bar-fill" style="width:${data.score}%;background:${barColors[v]};"></div></div>
    </div>
    ${tags ? `<div style="margin-top:0.75rem;"><div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.4rem;">Detected signals:</div><div class="result-signals">${tags}</div></div>` : ''}
  </div>`;
}

function buildErrorHTML(msg) {
  return `<div style="padding:1rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;color:#ef4444;font-size:0.85rem;">
    ❌ Could not reach PDAS Engine: ${msg}<br>
    <span style="color:var(--muted);">Make sure it's running on <code style="background:var(--bg2);padding:0.1rem 0.3rem;border-radius:4px;">${API_BASE}</code></span>
  </div>`;
}

document.addEventListener('DOMContentLoaded', initDashboard);
