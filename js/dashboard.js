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
  const body = document.getElementById('tableBody');
  body.innerHTML = filtered.map(s => `
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
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const vals = [42, 67, 55, 88, 74, 39, 91];
  const max = Math.max(...vals);
  const chart = document.getElementById('barChart');
  chart.innerHTML = days.map((d, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${(vals[i] / max) * 100}px;background:${vals[i] === max ? 'var(--accent)' : 'rgba(0,229,255,0.3)'}"></div>
      <div class="bar-label">${d}</div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTable();
  renderBarChart();
});
