const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initDashboard() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html?msg=signin';
    return;
  }

  const user = session.user;
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = user.email;

  const avatarUrl = user.user_metadata?.avatar_url;
  const avatarEl = document.getElementById('userAvatar');
  if (avatarUrl && avatarEl) {
    avatarEl.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent='' + initials + ''">';
  } else {
    avatarEl.textContent = initials;
  }

  renderTable();
  renderBarChart();
}

async function logout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

const scans = [
  { subject: 'Urgent: Verify your account', sender: 'admin@secure-login.xyz', type: 'Email', risk: 'HIGH', time: '2m ago' },
  { subject: 'Your package is ready', sender: 'noreply@fedex-track.net', type: 'Email', risk: 'HIGH', time: '5m ago' },
  { subject: 'Invoice_March.pdf', sender: 'billing@corp.com', type: 'File', risk: 'MEDIUM', time: '9m ago' },
  { subject: 'Team standup notes', sender: 'alice@company.com', type: 'Email', risk: 'LOW', time: '14m ago' },
  { subject: 'Reset your password now', sender: 'security@paypa1.com', type: 'Email', risk: 'HIGH', time: '20m ago' },
  { subject: 'Q1 Report.xlsx', sender: 'bob@analytics.io', type: 'File', risk: 'LOW', time: '35m ago' },
  { subject: 'You have won a prize!', sender: 'winner@promo-deals.info', type: 'Email', risk: 'HIGH', time: '48m ago' },
  { subject: 'Meeting invite', sender: 'ceo@realcompany.com', type: 'Email', risk: 'LOW', time: '1h ago' },
];

let activeFilter = 'all';

function setFilter(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = filter;
  renderTable();
}

function renderTable() {
  const filtered = activeFilter === 'all' ? scans : scans.filter(s => s.risk === activeFilter);
  document.getElementById('tableBody').innerHTML = filtered.map(s => `
    <tr>
      <td class="email-cell">${s.subject}</td>
      <td class="sender-cell">${s.sender}</td>
      <td style="color:var(--muted);font-size:0.8rem">${s.type}</td>
      <td><span class="risk-badge badge-${s.risk.toLowerCase()}">${s.risk}</span></td>
      <td style="color:var(--muted);font-size:0.8rem">${s.time}</td>
    </tr>
  `).join('');
}

function renderBarChart() {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const vals = [42,67,55,88,74,39,91];
  const max = Math.max(...vals);
  document.getElementById('barChart').innerHTML = days.map((d,i) => `
    <div class="bar-col">
      <div class="bar" style="height:${(vals[i]/max)*100}px;background:${vals[i]===max?'var(--accent)':'rgba(0,229,255,0.3)'}"></div>
      <div class="bar-label">${d}</div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', initDashboard);
