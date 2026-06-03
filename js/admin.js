const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _company = null;
let _employees = [];
let _allScans = [];

async function initAdmin() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  // Load profile and verify admin role
  const { data: profile } = await _supabase
    .from('profiles')
    .select('role, company_id, companies(*)')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    // If profile is simply missing/null (race condition), wait and retry once
    if (!profile) {
      await new Promise(r => setTimeout(r, 1000));
      const { data: retry } = await _supabase.from('profiles').select('role, company_id, companies(*)').eq('id', session.user.id).single();
      if (retry?.role === 'admin') {
        // Profile now exists — reload to re-run initAdmin cleanly
        window.location.reload();
        return;
      }
    }
    alert('Access denied. Admins only.');
    window.location.href = 'dashboard.html';
    return;
  }

  _company = profile.companies;
  const name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = session.user.user_metadata?.avatar_url;
  const avatarEl = document.getElementById('userAvatar');
  if (avatarUrl && avatarEl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else if (avatarEl) {
    avatarEl.textContent = initials;
  }

  document.getElementById('userName').textContent = name;
  document.getElementById('companyLabel').textContent = '🏢 ' + _company.name;
  document.getElementById('codeDisplay').textContent = _company.code;
  document.getElementById('bigCode').textContent = _company.code;

  await loadDashboardData();
}

async function loadDashboardData() {
  // Load ALL employees including pending
  const { data: employees, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('company_id', _company.id)
    .neq('role', 'admin');

  if (error) { console.error('Error loading employees:', error); }
  _employees = employees || [];

  // Load scan logs — no limit so stats are accurate
  const { data: scans } = await _supabase
    .from('scan_logs')
    .select('*')
    .eq('company_id', _company.id)
    .order('scanned_at', { ascending: false });
  _allScans = scans || [];

  updateStats();
  renderEmployeeTable();
  renderPendingRequests();
  renderThreatFeed();
  renderFullEmployeeTable();
  populateEmpFilterSelect();
  applyFiltersAndRender();
  renderAlerts();
}

function updateStats() {
  const active = _employees.filter(e => e.status === 'active').length;
  const pending = _employees.filter(e => e.status === 'pending').length;
  const threats = _allScans.filter(s => s.verdict === 'warn').length;
  const blocked = _allScans.filter(s => s.verdict === 'block').length;

  document.getElementById('statEmployees').textContent = active;
  document.getElementById('statScans').textContent = _allScans.length;
  document.getElementById('statThreats').textContent = threats;
  document.getElementById('statBlocked').textContent = blocked;

  // Show pending badge
  const pendingBadge = document.getElementById('pendingBadge');
  if (pendingBadge) {
    pendingBadge.textContent = pending > 0 ? pending : '';
    pendingBadge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
}

// ── Pending approval requests ──
function renderPendingRequests() {
  const pending = _employees.filter(e => e.status === 'pending');
  const container = document.getElementById('pendingSection');
  if (!container) return;

  if (!pending.length) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="card" style="border-color:rgba(245,158,11,0.3);margin-bottom:1.5rem;">
      <div class="card-title" style="color:#f59e0b;">⏳ Pending Join Requests <span>${pending.length} waiting</span></div>
      ${pending.map(emp => `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.85rem 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
          <div class="employee-avatar">${(emp.full_name||'?')[0].toUpperCase()}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9rem;">${emp.full_name || 'Unknown'}</div>
            <div style="font-size:0.78rem;color:var(--muted);">${emp.email || ''}</div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="approveEmployee('${emp.id}')" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:0.4rem 1rem;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;">✓ Approve</button>
            <button onclick="rejectEmployee('${emp.id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:0.4rem 1rem;border-radius:8px;cursor:pointer;font-size:0.82rem;">✗ Reject</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

async function approveEmployee(userId) {
  const { error } = await _supabase
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', userId);
  if (!error) await loadDashboardData();
  else alert('Error: ' + error.message);
}

async function rejectEmployee(userId) {
  if (!confirm('Reject and remove this employee from your company?')) return;
  const { error } = await _supabase
    .from('profiles')
    .update({ company_id: null, status: 'active' })
    .eq('id', userId);
  if (!error) await loadDashboardData();
  else alert('Error: ' + error.message);
}

async function removeEmployee(userId) {
  if (!confirm('Remove this employee from your company?')) return;
  const { error } = await _supabase
    .from('profiles')
    .update({ company_id: null, status: 'active' })
    .eq('id', userId);
  if (!error) await loadDashboardData();
  else alert('Error: ' + error.message);
}

function renderEmployeeTable() {
  const active = _employees.filter(e => e.status === 'active');
  const body = document.getElementById('employeeBody');
  if (!body) return;
  if (!active.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;">No active employees yet.</td></tr>';
    return;
  }
  body.innerHTML = active.map(emp => {
    const empScans = _allScans.filter(s => s.user_id === emp.id);
    const threats = empScans.filter(s => s.verdict !== 'allow').length;
    const pct = empScans.length ? threats / empScans.length : 0;
    const riskClass = pct > 0.3 ? 'high' : pct > 0.1 ? 'med' : 'low';
    const riskLabel = pct > 0.3 ? '🔴 High' : pct > 0.1 ? '🟡 Medium' : '🟢 Low';
    const lastScan = empScans[0] ? new Date(empScans[0].scanned_at).toLocaleDateString() : 'Never';
    const initials = (emp.full_name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:0.5rem;"><div class="employee-avatar">${initials}</div>${emp.full_name||'Unknown'}</div></td>
      <td style="color:var(--muted);font-size:0.8rem;">${empScans.length}</td>
      <td style="color:${threats>0?'#ef4444':'#22c55e'};font-weight:700;">${threats}</td>
      <td><span class="risk-level risk-${riskClass}">${riskLabel}</span></td>
      <td style="color:var(--muted);font-size:0.8rem;">${lastScan}</td>
    </tr>`;
  }).join('');
}

function renderThreatFeed() {
  const threats = _allScans.filter(s => s.verdict !== 'allow').slice(0, 8);
  const feed = document.getElementById('threatFeed');
  if (!feed) return;
  if (!threats.length) { feed.innerHTML = '<div style="color:var(--muted);text-align:center;padding:1.5rem;font-size:0.85rem;">No threats detected yet 🎉</div>'; return; }

  // Get employee names
  const empMap = {};
  _employees.forEach(e => empMap[e.id] = e.full_name || 'Unknown');

  feed.innerHTML = threats.map(t => {
    const empName = empMap[t.user_id] || 'Unknown';
    const target = t.target.length > 35 ? t.target.slice(0,35)+'…' : t.target;
    const icon = t.verdict === 'block' ? '🚨' : '⚠️';
    const ago = timeAgo(new Date(t.scanned_at));
    return `<div class="threat-item">
      <div class="threat-icon ${t.verdict}">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div class="threat-user">${empName}</div>
        <div class="threat-target">${target}</div>
        <div class="threat-time">${ago} · Score: ${t.score}</div>
      </div>
    </div>`;
  }).join('');
}

function renderFullEmployeeTable() {
  const body = document.getElementById('fullEmployeeBody');
  if (!body) return;
  document.getElementById('empCount').textContent = _employees.length + ' total';
  if (!_employees.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No employees yet.</td></tr>'; return; }
  const statusColors = { active:'#22c55e', pending:'#f59e0b', rejected:'#ef4444' };
  const statusLabels = { active:'Active', pending:'Pending', rejected:'Rejected' };
  body.innerHTML = _employees.map(emp => {
    const empScans = _allScans.filter(s => s.user_id === emp.id);
    const threats = empScans.filter(s => s.verdict !== 'allow').length;
    const joined = new Date(emp.created_at).toLocaleDateString();
    return `<tr>
      <td>${emp.full_name||'Unknown'}</td>
      <td style="color:var(--muted);font-size:0.8rem;">${emp.email||'—'}</td>
      <td>${empScans.length}</td>
      <td style="color:${threats>0?'#ef4444':'#22c55e'};font-weight:700;">${threats}</td>
      <td><span style="color:${statusColors[emp.status]};font-size:0.8rem;font-weight:600;">${statusLabels[emp.status]||emp.status}</span></td>
      <td style="display:flex;gap:0.4rem;">
        ${emp.status==='pending' ? `<button onclick="approveEmployee('${emp.id}')" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:0.25rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;">Approve</button>` : ''}
        <button onclick="removeEmployee('${emp.id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:0.25rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

let _scansFilter = 'all';
let _empFilter = 'all';

// Populate employee dropdown after data loads
function populateEmpFilterSelect() {
  const sel = document.getElementById('empFilterSelect');
  if (!sel) return;
  // Keep first "All Employees" option, rebuild the rest
  sel.innerHTML = '<option value="all">👥 All Employees</option>';
  _employees.filter(e => e.status === 'active').forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.full_name || e.email || 'Unknown';
    sel.appendChild(opt);
  });
}

function applyEmployeeFilter() {
  const sel = document.getElementById('empFilterSelect');
  _empFilter = sel ? sel.value : 'all';
  applyFiltersAndRender();
}

function filterScans(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _scansFilter = filter;
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  let scans = _allScans;
  if (_empFilter !== 'all') scans = scans.filter(s => s.user_id === _empFilter);
  if (_scansFilter !== 'all') scans = scans.filter(s => s.verdict === _scansFilter);
  renderAllScans(scans);
}

function renderAllScans(scans) {
  const count = document.getElementById('allScansCount');
  if (count) count.textContent = scans.length + ' scans';
  const body = document.getElementById('allScansBody');
  if (!body) return;
  const empMap = {};
  _employees.forEach(e => empMap[e.id] = e.full_name || 'Unknown');
  const verdictClass = { allow:'badge-low', warn:'badge-med', block:'badge-high' };
  const verdictLabel = { allow:'SAFE', warn:'WARN', block:'BLOCK' };
  if (!scans.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">No scans found.</td></tr>'; return; }
  body.innerHTML = scans.slice(0, 100).map(s => {
    const target = s.target.length > 40 ? s.target.slice(0, 40) + '…' : s.target;
    const time = new Date(s.scanned_at).toLocaleString();
    const rules = (s.signals && s.signals.rules) ? s.signals.rules : {};
    const reasonTags = Object.keys(rules).filter(k => rules[k] === true)
      .map(k => `<span style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;white-space:nowrap;">${k.replace(/_/g,' ')}</span>`).join(' ');
    const reasonCell = reasonTags || `<span style="color:var(--muted);font-size:0.75rem;">—</span>`;
    return `<tr>
      <td style="font-size:0.82rem;">${empMap[s.user_id] || 'Unknown'}</td>
      <td class="email-cell">${s.type === 'url' ? '🔗' : '📄'} ${target}</td>
      <td style="color:var(--muted);font-size:0.78rem;">${s.type}</td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;color:${s.verdict==='block'?'#ef4444':s.verdict==='warn'?'#f59e0b':'#22c55e'}">${s.score}</td>
      <td><span class="risk-badge ${verdictClass[s.verdict] || ''}">${verdictLabel[s.verdict] || s.verdict}</span></td>
      <td style="max-width:200px;line-height:1.6;">${reasonCell}</td>
      <td style="color:var(--muted);font-size:0.78rem;">${time}</td>
    </tr>`;
  }).join('');
}

function downloadScansReport() {
  if (!_company) return;

  const empMap = {};
  _employees.forEach(e => empMap[e.id] = e.full_name || e.email || 'Unknown');

  let scans = _allScans;
  let empLabel = 'All Employees';
  if (_empFilter !== 'all') {
    scans = scans.filter(s => s.user_id === _empFilter);
    const emp = _employees.find(e => e.id === _empFilter);
    empLabel = emp ? (emp.full_name || emp.email || 'Unknown') : 'Unknown';
  }
  if (_scansFilter !== 'all') scans = scans.filter(s => s.verdict === _scansFilter);

  const totalScans = scans.length;
  const safe       = scans.filter(s => s.verdict === 'allow').length;
  const suspicious = scans.filter(s => s.verdict === 'warn').length;
  const blocked    = scans.filter(s => s.verdict === 'block').length;
  const avgScore   = totalScans ? (scans.reduce((a,s) => a + (s.score||0), 0) / totalScans).toFixed(1) : 0;
  const highRisk   = scans.filter(s => s.score >= 80).length;
  const urlScans   = scans.filter(s => s.type === 'url').length;
  const fileScans  = scans.filter(s => s.type === 'file').length;
  const now        = new Date().toLocaleString();
  const dateStr    = new Date().toISOString().slice(0, 10);

  // Build scan rows
  const rows = scans.map(s => {
    const emp    = empMap[s.user_id] || 'Unknown';
    const target = (s.target || '').length > 55 ? s.target.slice(0,55)+'…' : (s.target||'');
    const time   = new Date(s.scanned_at).toLocaleString();
    const rules  = (s.signals && s.signals.rules) ? s.signals.rules : {};
    const reasons = Object.keys(rules).filter(k => rules[k] === true).map(k => k.replace(/_/g,' ')).join(', ') || '—';
    const vColor = s.verdict==='block' ? '#ef4444' : s.verdict==='warn' ? '#f59e0b' : '#22c55e';
    const vLabel = s.verdict==='block' ? 'BLOCK' : s.verdict==='warn' ? 'WARN' : 'SAFE';
    return `<tr>
      <td>${emp}</td>
      <td style="word-break:break-all;">${s.type==='url'?'🔗':'📄'} ${target}</td>
      <td style="text-align:center;">${s.type}</td>
      <td style="text-align:center;font-weight:700;color:${vColor};">${s.score}</td>
      <td style="text-align:center;"><span style="background:${s.verdict==='block'?'rgba(239,68,68,0.12)':s.verdict==='warn'?'rgba(245,158,11,0.12)':'rgba(34,197,94,0.12)'};color:${vColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;">${vLabel}</span></td>
      <td style="font-size:9px;color:#666;">${reasons}</td>
      <td style="font-size:9px;color:#666;">${time}</td>
    </tr>`;
  }).join('');

  const safeP = totalScans ? Math.round(safe/totalScans*100) : 0;
  const warnP = totalScans ? Math.round(suspicious/totalScans*100) : 0;
  const blkP  = totalScans ? Math.round(blocked/totalScans*100) : 0;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>PDAS Security Report</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#fff; color:#1a1a2e; padding:32px; font-size:12px; }
  .header { text-align:center; margin-bottom:28px; }
  .logo { font-size:28px; font-weight:900; color:#00e5ff; letter-spacing:0.12em; }
  .logo span { color:#1a1a2e; }
  .subtitle { font-size:12px; color:#666; margin-top:4px; letter-spacing:0.05em; }
  .report-title { font-size:16px; font-weight:700; color:#1a1a2e; margin-top:10px; }
  .meta { font-size:11px; color:#888; margin-top:4px; }
  .divider { border:none; border-top:2px solid #00e5ff; margin:18px 0; }
  .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px; }
  .stat-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; text-align:center; }
  .stat-num { font-size:26px; font-weight:900; color:#1a1a2e; line-height:1; }
  .stat-num.safe  { color:#22c55e; }
  .stat-num.warn  { color:#f59e0b; }
  .stat-num.block { color:#ef4444; }
  .stat-label { font-size:10px; color:#888; margin-top:5px; text-transform:uppercase; letter-spacing:0.06em; }
  .section-title { font-size:13px; font-weight:700; color:#1a1a2e; margin-bottom:10px; padding-left:8px; border-left:3px solid #00e5ff; }
  .metrics-table { width:100%; border-collapse:collapse; margin-bottom:22px; }
  .metrics-table td { padding:7px 12px; border-bottom:1px solid #f0f0f0; font-size:11px; }
  .metrics-table td:first-child { color:#888; }
  .metrics-table td:last-child { font-weight:600; text-align:right; }
  .scan-table { width:100%; border-collapse:collapse; margin-bottom:22px; font-size:10px; }
  .scan-table th { background:#1a1a2e; color:#fff; padding:7px 8px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:0.05em; }
  .scan-table th:first-child { border-radius:6px 0 0 6px; }
  .scan-table th:last-child { border-radius:0 6px 6px 0; }
  .scan-table td { padding:6px 8px; border-bottom:1px solid #f4f4f8; vertical-align:middle; }
  .scan-table tr:nth-child(even) td { background:#fafafa; }
  .footer { text-align:center; font-size:9px; color:#aaa; margin-top:16px; padding-top:12px; border-top:1px solid #eee; }
  @media print { body { padding:20px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">PDAS<span style="color:#00e5ff;font-size:14px;font-weight:400;display:block;letter-spacing:0.06em;">Phishing Detection &amp; Awareness System</span></div>
    <div class="report-title">Security Report</div>
    <div class="meta">Employee: ${empLabel} &nbsp;|&nbsp; Generated: ${now} &nbsp;|&nbsp; Company: ${_company.name}</div>
    <div class="meta">Total Records: ${totalScans}</div>
  </div>
  <hr class="divider">

  <div class="section-title">📊 Summary Statistics</div>
  <div class="stats-grid">
    <div class="stat-box"><div class="stat-num">${totalScans}</div><div class="stat-label">Total Scans</div></div>
    <div class="stat-box"><div class="stat-num safe">${safe}</div><div class="stat-label">Safe (${safeP}%)</div></div>
    <div class="stat-box"><div class="stat-num warn">${suspicious}</div><div class="stat-label">Suspicious (${warnP}%)</div></div>
    <div class="stat-box"><div class="stat-num block">${blocked}</div><div class="stat-label">Blocked (${blkP}%)</div></div>
  </div>

  <table class="metrics-table">
    <tr><td>METRIC</td><td>VALUE</td></tr>
    <tr><td>Average Risk Score</td><td>${avgScore} / 100</td></tr>
    <tr><td>High Risk Scans (≥80)</td><td>${highRisk}</td></tr>
    <tr><td>URL Scans</td><td>${urlScans}</td></tr>
    <tr><td>File Scans</td><td>${fileScans}</td></tr>
  </table>

  ${totalScans > 0 ? `
  <div class="section-title">🔍 Scan Details</div>
  <table class="scan-table">
    <thead><tr>
      <th>Employee</th><th>Target</th><th>Type</th><th>Score</th><th>Verdict</th><th>Reasons</th><th>Time</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>` : '<div style="text-align:center;color:#aaa;padding:2rem;">No scan records for this period.</div>'}

  <div class="footer">PDAS — Phishing Detection &amp; Awareness System &nbsp;|&nbsp; Report generated on ${now} &nbsp;|&nbsp; Confidential</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function renderAlerts() {
  const alerts = _allScans.filter(s => s.verdict === 'block');
  const el = document.getElementById('alertsList');
  if (!el) return;
  const empMap = {};
  _employees.forEach(e => empMap[e.id] = e.full_name || 'Unknown');
  if (!alerts.length) { el.innerHTML = '<div style="color:#22c55e;text-align:center;padding:2rem;">✅ No dangerous threats detected!</div>'; return; }
  el.innerHTML = alerts.slice(0,20).map(a => {
    const time = new Date(a.scanned_at).toLocaleString();
    return `<div class="alert-card">
      <span style="font-size:1.5rem;">🚨</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:0.9rem;color:#ef4444;margin-bottom:0.2rem;">Dangerous ${a.type} blocked</div>
        <div style="font-size:0.82rem;word-break:break-all;margin-bottom:0.3rem;">${a.target}</div>
        <div style="font-size:0.78rem;color:var(--muted);">Employee: <b style="color:var(--text);">${empMap[a.user_id]||'Unknown'}</b> · Score: ${a.score} · ${time}</div>
      </div>
    </div>`;
  }).join('');
}

function copyCode() {
  if (!_company) return;
  navigator.clipboard.writeText(_company.code).then(() => {
    const el = document.getElementById('codeBadge');
    if (el) { el.style.borderColor = '#22c55e'; setTimeout(() => el.style.borderColor = '', 1500); }
  });
}

async function regenerateCode() {
  if (!confirm('Generate a new code? The old code will stop working.')) return;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const { error } = await _supabase.from('companies').update({ code }).eq('id', _company.id);
  if (!error) {
    _company.code = code;
    document.getElementById('codeDisplay').textContent = code;
    document.getElementById('bigCode').textContent = code;
    alert('New code: ' + code);
  }
}

async function doLogout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

document.addEventListener('DOMContentLoaded', initAdmin);