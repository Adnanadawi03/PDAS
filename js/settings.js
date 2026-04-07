const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function initSettings() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) { window.location.href = 'login.html?msg=signin'; return; }

  const user = session.user;
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = name;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('settingsAvatar').textContent = initials;
  document.getElementById('settingsName').textContent = name;
  document.getElementById('settingsEmail').textContent = user.email;
  document.getElementById('inputName').value = name;
  document.getElementById('inputEmail').value = user.email;

  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) darkToggle.checked = !document.body.classList.contains('light');
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'settings-msg ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function updateProfile() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) { showMsg('profileMsg', 'Name cannot be empty.', 'error'); return; }
  const { error } = await _supabase.auth.updateUser({ data: { full_name: name } });
  if (error) {
    showMsg('profileMsg', error.message, 'error');
  } else {
    showMsg('profileMsg', '✓ Profile updated successfully!', 'success');
    document.getElementById('settingsName').textContent = name;
    document.getElementById('settingsAvatar').textContent = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  }
}

function checkPwStrength(pw) {
  const segs = ['ps1','ps2','ps3','ps4'].map(id => document.getElementById(id));
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['#ef4444','#f59e0b','#22c55e','#00e5ff'];
  segs.forEach((s,i) => { s.style.background = i < score ? colors[score-1] : 'rgba(255,255,255,0.07)'; });
}

async function updatePassword() {
  const pw = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  if (!pw) { showMsg('passwordMsg', 'Please enter a new password.', 'error'); return; }
  if (pw !== confirm) { showMsg('passwordMsg', 'Passwords do not match.', 'error'); return; }
  if (pw.length < 8) { showMsg('passwordMsg', 'Password must be at least 8 characters.', 'error'); return; }
  const { error } = await _supabase.auth.updateUser({ password: pw });
  if (error) {
    showMsg('passwordMsg', error.message, 'error');
  } else {
    showMsg('passwordMsg', '✓ Password updated successfully!', 'success');
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  }
}

async function sendResetEmail() {
  const { data: { session } } = await _supabase.auth.getSession();
  const { error } = await _supabase.auth.resetPasswordForEmail(session.user.email);
  showMsg('passwordMsg', error ? error.message : '✓ Reset email sent to ' + session.user.email, error ? 'error' : 'success');
}

async function signOutAll() {
  await _supabase.auth.signOut({ scope: 'global' });
  window.location.href = 'login.html';
}

async function doLogout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

function confirmDelete() {
  if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
    showMsg('profileMsg', '⚠️ Please contact support to delete your account.', 'error');
    document.querySelector('.settings-grid').scrollIntoView({ behavior: 'smooth' });
  }
}

document.addEventListener('DOMContentLoaded', initSettings);
