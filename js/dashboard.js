const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ⚠️ Change this to your Render.com URL after deployment
// Local:   'http://127.0.0.1:8000'
// Render:  'https://pdas-engine.onrender.com'
const API_BASE = 'https://pdas-engine.onrender.com';

let _allEvents = [];
let _activeFilter = 'all';

// ── Auth guard ──
async function initDashboard() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  // Block admins from user dashboard
  const { data: profile } = await _supabase.from('profiles').select('role,company_id,status,companies(name,code)').eq('id', session.user.id).single();
  if (profile?.role === 'admin') {
    window.location.href = 'admin-dashboard.html';
    return;
  }

  // Always show company name in topbar
  const companyBadge = document.getElementById('companyBadge');
  if (companyBadge) {
    if (profile?.companies?.name) {
      const statusIcon = profile?.status === 'pending' ? '⏳' : '🏢';
      companyBadge.textContent = statusIcon + ' ' + profile.companies.name;
      companyBadge.style.color = profile?.status === 'pending' ? '#f59e0b' : 'var(--accent)';
      companyBadge.style.borderColor = profile?.status === 'pending' ? 'rgba(245,158,11,0.3)' : 'rgba(0,229,255,0.2)';
      companyBadge.style.background = profile?.status === 'pending' ? 'rgba(245,158,11,0.08)' : 'rgba(0,229,255,0.08)';
    } else {
      companyBadge.textContent = '🏢 No company';
      companyBadge.style.color = 'var(--muted)';
      companyBadge.style.borderColor = 'var(--border)';
      companyBadge.style.background = 'transparent';
    }
  }

  // Show pending approval message
  if (profile?.status === 'pending') {
    document.getElementById('apiStatus').className = 'api-status offline';
    document.getElementById('apiStatusText').textContent = '⏳ Your request to join ' + (profile.companies?.name || 'the company') + ' is pending admin approval.';
  }

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

  await loadAllData();   // Always load from Supabase first
  await checkAPIStatus(); // Then check if engine is available for scanning
}

async function logout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ── API Status (just checks if engine is online for scanning) ──
async function checkAPIStatus() {
  const el = document.getElementById('apiStatus');
  const txt = document.getElementById('apiStatusText');
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      el.className = 'api-status online';
      txt.textContent = '✓ PDAS Engine is online — ready to scan URLs and files';
    } else { throw new Error(); }
  } catch {
    el.className = 'api-status offline';
    txt.textContent = '✗ PDAS Engine offline — scan history still available. Start engine to run new scans.';
  }
}

// ── Load data from Supabase (persistent storage) ──
async function loadAllData() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) return;

  // Get total count first
  const { count } = await _supabase
    .from('scan_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id);

  // Load all scans in batches if needed
  let allScans = [];
  const batchSize = 1000;
  let from = 0;
  while (true) {
    const { data: batch, error: bErr } = await _supabase
      .from('scan_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('scanned_at', { ascending: false })
      .range(from, from + batchSize - 1);
    if (bErr || !batch || !batch.length) break;
    allScans = allScans.concat(batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }
  const scans = allScans;
  const error = null;

  if (error) {
    console.warn('scan_logs table not found — run SQL setup or use the engine locally:', error.message);
    // Show empty state instead of crashing
    document.getElementById('lastUpdated').textContent = 'No scan history yet — run your first scan!';
    document.getElementById('statTotal').textContent = '0';
    document.getElementById('statAllow').textContent = '0';
    document.getElementById('statWarn').textContent  = '0';
    document.getElementById('statBlock').textContent = '0';
    document.getElementById('statTotalSub').textContent = 'Run a scan below to get started';
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem;">No scans yet. Use the Quick Scan panel below!</td></tr>';
    document.getElementById('activityList').innerHTML = '<div style="color:var(--muted);text-align:center;padding:1rem;font-size:0.85rem;">No activity yet.</div>';
    renderBarChart([]);
    return;
  }

  // Normalize field names to match display code
  const events = (scans || []).map(s => ({
    id: s.id,
    type: s.type,
    target: s.target,
    verdict: s.verdict,
    score: s.score,
    signals: s.signals,
    timestamp: s.scanned_at,
  }));

  _allEvents = events;
  const now = new Date();
  document.getElementById('lastUpdated').textContent = 'Last updated: ' + now.toLocaleTimeString();

  const total = events.length;
  const allow = events.filter(e => e.verdict === 'allow').length;
  const warn  = events.filter(e => e.verdict === 'warn').length;
  const block = events.filter(e => e.verdict === 'block').length;

  document.getElementById('statTotal').textContent = total.toLocaleString();
  document.getElementById('statAllow').textContent = allow;
  document.getElementById('statWarn').textContent  = warn;
  document.getElementById('statBlock').textContent = block;
  document.getElementById('statTotalSub').textContent = total ? 'Saved scan history' : 'No scans yet — run your first scan!';
  document.getElementById('statAllowPct').textContent = total ? Math.round(allow/total*100) + '% of total' : '';
  document.getElementById('statWarnPct').textContent  = total ? Math.round(warn/total*100) + '% of total' : '';
  document.getElementById('statBlockPct').textContent = total ? Math.round(block/total*100) + '% of total' : '';

  updateDonut(allow, warn, block, total);
  renderBarChart(events);
  renderTable(events, _activeFilter);
  renderActivity(events);
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
  // Scroll to scan section
  document.getElementById('scanSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    resultEl.innerHTML = '<div class="scanning-wrap"><div class="spinner"></div><div class="scanning-text">Scanning... (first scan may take 30s to wake the engine)</div></div>';
    const r = await fetch(`${API_BASE}/scan/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error('Server error ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, url, 'url');
    await saveScanToSupabase('url', url, data);
    await loadAllData();
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
    const r = await fetch(`${API_BASE}/scan/file`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error('Server error ' + r.status);
    const data = await r.json();
    resultEl.innerHTML = buildResultHTML(data, file.name, 'file');
    await saveScanToSupabase('file', file.name, data);
    await loadAllData();
  } catch (err) { resultEl.innerHTML = buildErrorHTML(err.message); }
}

function buildResultHTML(data, target, type) {
  // Normalize verdict — engine returns allow/warn/block
  // Map to Low/Medium/High risk levels
  const rawVerdict = (data.verdict || '').toLowerCase();
  const v = rawVerdict === 'block' ? 'block' : rawVerdict === 'warn' ? 'warn' : 'allow';
  const score = parseFloat(data.score) || 0;

  // Risk level labeling
  const riskLevel = score >= 80 ? 'HIGH RISK' : score >= 50 ? 'MEDIUM RISK' : 'LOW RISK';
  const icons     = { allow:'✅', warn:'⚠️', block:'🚫' };
  const labels    = { allow:'Safe', warn:'Suspicious', block:'Dangerous' };
  const barColors = { allow:'#22c55e', warn:'#f59e0b', block:'#ef4444' };
  const messages  = {
    allow: 'No significant phishing indicators found. This appears safe.',
    warn:  'Some suspicious patterns detected. Proceed with caution.',
    block: 'Clear phishing indicators found. This is likely a phishing attack!'
  };
  const levelColors = { allow:'#22c55e', warn:'#f59e0b', block:'#ef4444' };

  const rules = (data.signals && data.signals.rules) ? data.signals.rules : {};
  const tags = Object.keys(rules).filter(k => rules[k] === true).map(k =>
    '<span class="signal-tag bad">' + k.replace(/_/g,' ') + '</span>'
  ).join('');

  const icon   = icons[v]   || '❓';
  const label  = labels[v]  || 'Unknown';
  const msg    = messages[v] || '';
  const color  = barColors[v] || '#7a8499';

  return '<div class="result-card ' + v + '">' +
    '<div class="result-header">' +
      '<div class="result-icon">' + icon + '</div>' +
      '<div>' +
        '<div class="result-verdict">' + label + '</div>' +
        '<div style="font-size:0.75rem;font-family:Syne,sans-serif;font-weight:700;color:' + levelColors[v] + ';letter-spacing:0.08em;margin-top:0.15rem;">' + riskLevel + '</div>' +
        '<div style="font-size:0.82rem;color:var(--muted);margin-top:0.2rem;">' + msg + '</div>' +
      '</div>' +
      '<div class="result-score-wrap">' +
        '<div class="result-score-num">' + score.toFixed(1) + '</div>' +
        '<div class="result-score-label">Risk Score / 100</div>' +
      '</div>' +
    '</div>' +
    '<div class="result-target">' + (type==='url'?'🔗':'📄') + ' ' + target + '</div>' +
    '<div class="score-bar-wrap">' +
      '<div class="score-bar-bg"><div class="score-bar-fill" style="width:' + Math.min(score,100) + '%;background:' + color + ';"></div></div>' +
    '</div>' +
    (tags ? '<div style="margin-top:0.75rem;"><div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.4rem;">Detected signals:</div><div class="result-signals">' + tags + '</div></div>' : '') +
  '</div>';
}

function buildErrorHTML(msg) {
  return `<div style="padding:1rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;color:#ef4444;font-size:0.85rem;">
    ❌ Could not reach PDAS Engine: ${msg}<br>
    <span style="color:var(--muted);">Make sure it's running on <code style="background:var(--bg2);padding:0.1rem 0.3rem;border-radius:4px;">${API_BASE}</code></span>
  </div>`;
}


// ── Save scan result to Supabase (for admin visibility) ──
async function saveScanToSupabase(type, target, data) {
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await _supabase.from('profiles').select('company_id').eq('id', session.user.id).single();
    const { error: insertErr } = await _supabase.from('scan_logs').insert({
      user_id: session.user.id,
      company_id: profile?.company_id || null,
      type, target,
      verdict: data.verdict,
      score: data.score,
      signals: data.signals
    });
    if (insertErr) console.warn('Could not save to scan_logs (run SQL setup):', insertErr.message);
  } catch(e) { console.log('Could not save scan to Supabase:', e); }
}
document.addEventListener('DOMContentLoaded', initDashboard);

// ── Report Modal ──
let _reportDays = 7;

function openReportModal(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById('reportModal');
  modal.style.display = 'flex';
  // Set default dates
  const to   = new Date();
  const from = new Date(Date.now() - 7 * 86400000);
  document.getElementById('reportTo').value   = to.toISOString().split('T')[0];
  document.getElementById('reportFrom').value = from.toISOString().split('T')[0];
  if (window.innerWidth <= 768) { try { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('active'); } catch(e){} }
}

function closeReportModal() {
  document.getElementById('reportModal').style.display = 'none';
}

function setReportPeriod(days, btn) {
  _reportDays = days;
  document.querySelectorAll('.period-btn').forEach(b => {
    b.style.background = 'var(--bg2)';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--muted)';
  });
  btn.style.background   = 'rgba(0,229,255,0.1)';
  btn.style.borderColor  = 'rgba(0,229,255,0.3)';
  btn.style.color        = 'var(--accent)';
  const to   = new Date();
  const from = new Date(Date.now() - days * 86400000);
  document.getElementById('reportTo').value   = to.toISOString().split('T')[0];
  document.getElementById('reportFrom').value = from.toISOString().split('T')[0];
}

async function generateReport() {
  const fromDate = new Date(document.getElementById('reportFrom').value + 'T00:00:00');
  const toDate   = new Date(document.getElementById('reportTo').value   + 'T23:59:59');
  const inclSummary = document.getElementById('rIncludeSummary').checked;
  const inclScans   = document.getElementById('rIncludeScans').checked;
  const inclThreats = document.getElementById('rIncludeThreats').checked;

  const btn = document.querySelector('#reportModal button:last-child');
  btn.textContent = '⏳ Generating...'; btn.disabled = true;

  try {
    // Filter scans by date range
    const filtered = _allEvents.filter(e => {
      const d = new Date(e.timestamp);
      return d >= fromDate && d <= toDate;
    });

    const total  = filtered.length;
    const allow  = filtered.filter(e => e.verdict === 'allow').length;
    const warn   = filtered.filter(e => e.verdict === 'warn').length;
    const block  = filtered.filter(e => e.verdict === 'block').length;
    const threats = filtered.filter(e => e.verdict !== 'allow');

    // Get user info
    const { data: { session } } = await _supabase.auth.getSession();
    const userName = session?.user?.user_metadata?.full_name || session?.user?.email || 'PDAS User';

    // Build HTML report for printing
    const fromStr = fromDate.toLocaleDateString();
    const toStr   = toDate.toLocaleDateString();

    let html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>PDAS Security Report</title>
<style>
  @page { margin: 2cm; }
  body { font-family: Arial, sans-serif; color: #1a1a2e; font-size: 12px; }
  .header { border-bottom: 3px solid #00e5ff; padding-bottom: 1rem; margin-bottom: 1.5rem; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size: 1.8rem; font-weight: 900; color: #00e5ff; letter-spacing: 0.1em; }
  .subtitle { font-size: 0.75rem; color: #666; }
  .report-meta { text-align:right; font-size:0.75rem; color:#666; }
  h2 { font-size: 1rem; color: #1a1a2e; border-left: 4px solid #00e5ff; padding-left: 0.5rem; margin: 1.5rem 0 0.75rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
  .stat-box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.75rem; text-align: center; }
  .stat-num { font-size: 1.8rem; font-weight: 900; }
  .stat-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; }
  .total  .stat-num { color: #00e5ff; }
  .safe   .stat-num { color: #22c55e; }
  .warn   .stat-num { color: #f59e0b; }
  .danger .stat-num { color: #ef4444; }
  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  th { background: #f5f5f5; padding: 0.5rem; text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  td { padding: 0.45rem 0.5rem; border-bottom: 1px solid #f0f0f0; }
  tr:hover td { background: #fafafa; }
  .v-safe   { background: #dcfce7; color: #166534; padding: 0.1rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.68rem; }
  .v-warn   { background: #fef3c7; color: #92400e; padding: 0.1rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.68rem; }
  .v-block  { background: #fee2e2; color: #991b1b; padding: 0.1rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.68rem; }
  .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; font-size: 0.7rem; color: #999; text-align: center; }
  .risk-bar-bg { background: #e0e0e0; border-radius: 4px; height: 6px; width: 80px; display:inline-block; vertical-align:middle; }
  .risk-bar-fill { height: 100%; border-radius: 4px; }
</style>
</head><body>

<div class="header">
  <div>
    <div class="logo">PDAS</div>
    <div class="subtitle">Phishing Detection & Awareness System</div>
    <div class="subtitle">Security Report — ${fromStr} to ${toStr}</div>
  </div>
  <div class="report-meta">
    <div>Generated: ${new Date().toLocaleString()}</div>
    <div>User: ${userName}</div>
    <div>Total Records: ${total}</div>
  </div>
</div>`;

    if (inclSummary) {
      const safeRate  = total ? Math.round(allow/total*100) : 0;
      const warnRate  = total ? Math.round(warn/total*100)  : 0;
      const blockRate = total ? Math.round(block/total*100) : 0;
      const highRisk  = filtered.filter(e => parseFloat(e.score) >= 80).length;
      const avgScore  = total ? (filtered.reduce((s,e) => s + parseFloat(e.score||0), 0) / total).toFixed(1) : 0;
      html += `
<h2>📊 Summary Statistics</h2>
<div class="stats-grid">
  <div class="stat-box total"><div class="stat-num">${total}</div><div class="stat-label">Total Scans</div></div>
  <div class="stat-box safe"><div class="stat-num">${allow}</div><div class="stat-label">Safe (${safeRate}%)</div></div>
  <div class="stat-box warn"><div class="stat-num">${warn}</div><div class="stat-label">Suspicious (${warnRate}%)</div></div>
  <div class="stat-box danger"><div class="stat-num">${block}</div><div class="stat-label">Blocked (${blockRate}%)</div></div>
</div>
<table style="margin-bottom:1.5rem;">
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Average Risk Score</td><td>${avgScore} / 100</td></tr>
  <tr><td>High Risk Scans (≥80)</td><td>${highRisk}</td></tr>
  <tr><td>URL Scans</td><td>${filtered.filter(e=>e.type==='url').length}</td></tr>
  <tr><td>File Scans</td><td>${filtered.filter(e=>e.type==='file').length}</td></tr>
  <tr><td>Report Period</td><td>${fromStr} — ${toStr}</td></tr>
</table>`;
    }

    if (inclThreats && threats.length) {
      html += `<h2>⚠️ Threats Detected (${threats.length})</h2>
<table>
  <tr><th>#</th><th>Target</th><th>Type</th><th>Score</th><th>Risk</th><th>Date</th></tr>
  ${threats.slice(0,50).map((e,i) => {
    const vClass = e.verdict === 'block' ? 'v-block' : 'v-warn';
    const vLabel = e.verdict === 'block' ? 'DANGEROUS' : 'SUSPICIOUS';
    const score = parseFloat(e.score||0);
    const color = e.verdict === 'block' ? '#ef4444' : '#f59e0b';
    const target = e.target.length > 60 ? e.target.slice(0,60)+'...' : e.target;
    return `<tr>
      <td>${i+1}</td>
      <td style="font-family:monospace;font-size:0.7rem;">${target}</td>
      <td>${e.type}</td>
      <td>
        <span style="font-weight:700;">${score.toFixed(1)}</span>
        <div class="risk-bar-bg"><div class="risk-bar-fill" style="width:${score}%;background:${color};"></div></div>
      </td>
      <td><span class="${vClass}">${vLabel}</span></td>
      <td>${new Date(e.timestamp).toLocaleDateString()}</td>
    </tr>`;
  }).join('')}
</table>`;
    }

    if (inclScans && total > 0) {
      const displayScans = inclThreats ? filtered.filter(e => e.verdict === 'allow') : filtered;
      if (displayScans.length) {
        html += `<h2>📋 ${inclThreats ? 'Safe Scans' : 'All Scans'} (${displayScans.length})</h2>
<table>
  <tr><th>#</th><th>Target</th><th>Type</th><th>Score</th><th>Verdict</th><th>Date</th></tr>
  ${displayScans.slice(0,100).map((e,i) => {
    const vClass = {allow:'v-safe',warn:'v-warn',block:'v-block'}[e.verdict]||'v-safe';
    const vLabel = {allow:'SAFE',warn:'WARN',block:'BLOCK'}[e.verdict]||e.verdict;
    const score = parseFloat(e.score||0);
    const target = e.target.length > 55 ? e.target.slice(0,55)+'...' : e.target;
    return `<tr>
      <td>${i+1}</td>
      <td style="font-family:monospace;font-size:0.7rem;">${target}</td>
      <td>${e.type}</td>
      <td>${score.toFixed(1)}</td>
      <td><span class="${vClass}">${vLabel}</span></td>
      <td>${new Date(e.timestamp).toLocaleDateString()}</td>
    </tr>`;
  }).join('')}
  ${displayScans.length > 100 ? `<tr><td colspan="6" style="text-align:center;color:#999;padding:0.5rem;">... and ${displayScans.length - 100} more records</td></tr>` : ''}
</table>`;
      }
    }

    html += `<div class="footer">
      PDAS — Phishing Detection & Awareness System | Report generated on ${new Date().toLocaleString()} | Confidential
    </div></body></html>`;

    // Open print dialog
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);

    closeReportModal();
  } catch(err) {
    alert('Error generating report: ' + err.message);
  }
  btn.textContent = '📄 Download PDF Report'; btn.disabled = false;
}

// ── Go to file scan ──
function goToFileScan(e) {
  if (e) e.preventDefault();
  // Switch to file tab
  switchScanTab('file');
  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    try { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('active'); } catch(err){}
  }
}
