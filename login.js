const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Redirect if already logged in
_supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = 'dashboard.html';
});

function switchTab(tab) {
  document.getElementById('loginForm').classList.toggle('active', tab === 'login');
  document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

function checkStrength(pw) {
  const segs = ['s1','s2','s3','s4'].map(id => document.getElementById(id));
  const hint = document.getElementById('pwHint');
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['#ef4444','#f59e0b','#22c55e','#00e5ff'];
  const labels = ['Weak','Fair','Good','Strong'];
  segs.forEach((s, i) => { s.style.background = i < score ? colors[score - 1] : 'rgba(255,255,255,0.07)'; });
  if (score > 0) hint.textContent = labels[score - 1] + ' password';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPw').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Signing in...'; btn.disabled = true;
  const { error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message; errEl.style.display = 'block';
    btn.textContent = 'Sign In →'; btn.disabled = false;
  } else {
    window.location.href = 'dashboard.html';
  }
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPw').value;
  const confirm = document.getElementById('signupConfirm').value;
  const errEl = document.getElementById('signupError');
  const sucEl = document.getElementById('signupSuccess');
  const btn = document.getElementById('signupBtn');
  errEl.style.display = 'none'; sucEl.style.display = 'none';
  if (!name || !email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Creating account...'; btn.disabled = true;
  const { error } = await _supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  if (error) {
    errEl.textContent = error.message; errEl.style.display = 'block';
    btn.textContent = 'Create Account →'; btn.disabled = false;
  } else {
    sucEl.textContent = '✓ Account created! Check your email to confirm, then sign in.';
    sucEl.style.display = 'block';
    btn.textContent = 'Create Account →'; btn.disabled = false;
    setTimeout(() => switchTab('login'), 2000);
  }
}

async function forgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  const errEl = document.getElementById('loginError');
  if (!email) { errEl.textContent = 'Enter your email above first.'; errEl.style.display = 'block'; return; }
  const { error } = await _supabase.auth.resetPasswordForEmail(email);
  errEl.style.color = error ? '#ef4444' : '#22c55e';
  errEl.textContent = error ? error.message : '✓ Password reset email sent!';
  errEl.style.display = 'block';
}
