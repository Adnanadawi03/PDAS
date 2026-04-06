function toggleTheme() {
  const isDark = !document.body.classList.contains('light');
  document.body.classList.toggle('light', isDark);
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('pdas-theme', isDark ? 'light' : 'dark');
}

(function () {
  if (localStorage.getItem('pdas-theme') === 'light') {
    document.body.classList.add('light');
    document.addEventListener('DOMContentLoaded', function () {
      const btn = document.getElementById('themeBtn');
      if (btn) btn.textContent = '☀️';
    });
  }
})();
