const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _company = null;
let _employees = [];
let _allScans = [];

async function initAdmin() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  // Check if admin
  const { data: profile } = await _supabase.from('profiles').select('*,companies(*)').eq('id', session.user.id).single();
  if (!profile || profile.role !== 'admin') {
    alert('Access denied. This page is for admins only.');
    window.location.href = 'dashboard.html';
    return;
  }

  _company = profile.companies;
  const name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
  const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);

  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('companyLabel').textContent = '🏢 ' + _company.name;
  document.getElementById('codeDisplay').textContent = _company.code;
  document.getElementById('bigCode').textContent = _company.code;

  await loadDashboardData();
}

async function loadDashboardData() {
  // Load all employees of this company
  const { data: employees } = await _supabase
    .from('profiles')
    .select('*')
    .eq('company_id', _company.id)
    .eq('role', 'employee');
  _employees = employees || [];

  // Load all scan logs for this company
  const { data: scans } = await _supabase
    .from('scan_logs')
    .select('*,profiles(full_name)')
    .eq('company_id', _company.id)
    .order('scanned_at', { ascending: false })
    .limit(200);
  _allScans = scans || [];

  updateStats();
  renderEmployeeTable();
  renderThreatFeed();
  renderFullEmployeeTable();
  renderAllScans(_allScans, 'all');
  renderAlerts();
}

function updateStats() {
  const threats = _allScans.filter(s => s.verdict !== 'allow').length;
  const blocked = _allScans.filter(s => s.verdict === 'block').length;
  document.getElementById('statEmployees').textContent = _employees.length;
  document.getElementById('statScans').textContent = _allScans.length;
  document.getElementById('statThreats').textContent = threats;
  document.getElementById('statBlocked').textContent = blocked;
}

function renderEmployeeTable() {
  const body = document.getElementById('employeeBody');
  if (!_employees.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;">No employees yet. Share your join code!</td></tr>';
    return;
  }
  body.innerHTML = _employees.map(emp => {
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
  if (!threats.length) { feed.innerHTML = '<div style="color:var(--muted);text-align:center;padding:1.5rem;font-size:0.85rem;">No threats detected yet 🎉</div>'; return; }
  feed.innerHTML = threats.map(t => {
    const empName = t.profiles?.full_name || 'Unknown';
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
  document.getElementById('empCount').textContent = _employees.length + ' total';
  const body = document.getElementById('fullEmployeeBody');
  if (!_employees.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No employees yet.</td></tr>'; return; }
  body.innerHTML = _employees.map(emp => {
    const empScans = _allScans.filter(s => s.user_id === emp.id);
    const threats = empScans.filter(s => s.verdict !== 'allow').length;
    const joined = new Date(emp.created_at).toLocaleDateString();
    return `<tr>
      <td>${emp.full_name||'Unknown'}</td>
      <td style="color:var(--muted);font-size:0.8rem;">${emp.id.slice(0,8)}...</td>
      <td>${empScans.length}</td>
      <td style="color:${threats>0?'#ef4444':'#22c55e'};font-weight:700;">${threats}</td>
      <td style="color:var(--muted);font-size:0.8rem;">${joined}</td>
      <td><button onclick="viewEmployee('${emp.id}')" style="background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.2);color:var(--accent);padding:0.25rem 0.7rem;border-radius:6px;cursor:pointer;font-size:0.78rem;">View</button></td>
    </tr>`;
  }).join('');
}

let _allScansFilter = 'all';
function filterScans(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _allScansFilter = filter;
  renderAllScans(_allScans, filter);
}
function renderAllScans(scans, filter) {
  const filtered = filter === 'all' ? scans : scans.filter(s => s.verdict === filter);
  document.getElementById('allScansCount').textContent = filtered.length + ' scans';
  const body = document.getElementById('allScansBody');
  if (!filtered.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No scans found.</td></tr>'; return; }
  const verdictClass = { allow:'badge-low', warn:'badge-med', block:'badge-high' };
  const verdictLabel = { allow:'SAFE', warn:'WARN', block:'BLOCK' };
  body.innerHTML = filtered.slice(0,50).map(s => {
    const empName = s.profiles?.full_name || 'Unknown';
    const target = s.target.length>35 ? s.target.slice(0,35)+'…' : s.target;
    const time = new Date(s.scanned_at).toLocaleString();
    return `<tr>
      <td style="font-size:0.82rem;">${empName}</td>
      <td class="email-cell">${s.type==='url'?'🔗':'📄'} ${target}</td>
      <td style="color:var(--muted);font-size:0.78rem;">${s.type}</td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;color:${s.verdict==='block'?'#ef4444':s.verdict==='warn'?'#f59e0b':'#22c55e'}">${s.score}</td>
      <td><span class="risk-badge ${verdictClass[s.verdict]}">${verdictLabel[s.verdict]}</span></td>
      <td style="color:var(--muted);font-size:0.78rem;">${time}</td>
    </tr>`;
  }).join('');
}

function renderAlerts() {
  const alerts = _allScans.filter(s => s.verdict === 'block');
  const el = document.getElementById('alertsList');
  if (!alerts.length) { el.innerHTML = '<div style="color:#22c55e;text-align:center;padding:2rem;">✅ No dangerous threats detected!</div>'; return; }
  el.innerHTML = alerts.slice(0,20).map(a => {
    const empName = a.profiles?.full_name || 'Unknown Employee';
    const time = new Date(a.scanned_at).toLocaleString();
    return `<div class="alert-card">
      <span style="font-size:1.5rem;">🚨</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:0.9rem;color:#ef4444;margin-bottom:0.2rem;">Dangerous ${a.type} blocked</div>
        <div style="font-size:0.82rem;word-break:break-all;margin-bottom:0.3rem;">${a.target}</div>
        <div style="font-size:0.78rem;color:var(--muted);">Employee: <b style="color:var(--text);">${empName}</b> · Score: ${a.score} · ${time}</div>
      </div>
    </div>`;
  }).join('');
}

function viewEmployee(id) {
  alert('Employee scan detail view coming soon!');
}

function copyCode() {
  if (!_company) return;
  navigator.clipboard.writeText(_company.code).then(() => {
    const el = document.getElementById('codeBadge');
    el.style.borderColor = '#22c55e';
    setTimeout(() => el.style.borderColor = '', 1500);
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
    alert('New code generated: ' + code);
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
