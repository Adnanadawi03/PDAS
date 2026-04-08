const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// If already logged in → go straight to dashboard
_supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = 'dashboard.html';
});

// Show message if redirected from dashboard
document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('msg') === 'signin') {
    const banner = document.getElementById('authBanner');
    if (banner) {
      banner.textContent = '🔒 Please sign in or create an account to access the dashboard.';
      banner.style.display = 'block';
    }
  }
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
  segs.forEach((s,i) => { s.style.background = i < score ? colors[score-1] : 'rgba(255,255,255,0.07)'; });
  if (score > 0) hint.textContent = labels[score-1] + ' password';
}

let _mfaChallengeId = null;
let _mfaFactorId = null;

function showLoginForm() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('mfaForm').style.display = 'none';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPw').value;
  const rememberMe = document.getElementById('rememberMe').checked;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Signing in...'; btn.disabled = true;

  const { data, error } = await _supabase.auth.signInWithPassword({
    email, password,
    options: { persistSession: rememberMe }
  });

  if (error) {
    errEl.textContent = error.message; errEl.style.display = 'block';
    btn.textContent = 'Sign In →'; btn.disabled = false;
    return;
  }

  // Check if 2FA is required
  const { data: mfaData } = await _supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaData?.nextLevel === 'aal2' && mfaData.nextLevel !== mfaData.currentLevel) {
    // 2FA required — show challenge
    const { data: factors } = await _supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (totp) {
      _mfaFactorId = totp.id;
      const { data: challenge, error: challengeErr } = await _supabase.auth.mfa.challenge({ factorId: _mfaFactorId });
      if (challengeErr) { errEl.textContent = challengeErr.message; errEl.style.display = 'block'; btn.textContent = 'Sign In →'; btn.disabled = false; return; }
      _mfaChallengeId = challenge.id;
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('mfaForm').style.display = 'block';
      btn.textContent = 'Sign In →'; btn.disabled = false;
      return;
    }
  }

  window.location.href = 'dashboard.html';
}

async function handleMFAChallenge() {
  const code = document.getElementById('mfaCode').value.trim();
  const errEl = document.getElementById('mfaError');
  const btn = document.getElementById('mfaBtn');
  errEl.style.display = 'none';
  if (!code || code.length < 6) { errEl.textContent = 'Please enter the 6-digit code.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Verifying...'; btn.disabled = true;

  const { error } = await _supabase.auth.mfa.verify({ factorId: _mfaFactorId, challengeId: _mfaChallengeId, code });
  if (error) {
    errEl.textContent = 'Invalid code. Please try again.'; errEl.style.display = 'block';
    btn.textContent = 'Verify →'; btn.disabled = false;
  } else {
    window.location.href = 'dashboard.html';
  }
}

let _pendingEmail = '';

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPw').value;
  const confirm = document.getElementById('signupConfirm').value;
  const errEl = document.getElementById('signupError');
  const btn = document.getElementById('signupBtn');
  errEl.style.display = 'none';
  if (!name || !email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Creating account...'; btn.disabled = true;
  const { error } = await _supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  if (error) {
    errEl.textContent = error.message; errEl.style.display = 'block';
    btn.textContent = 'Create Account →'; btn.disabled = false;
  } else {
    _pendingEmail = email;
    document.getElementById('verifyEmailLabel').textContent = email;
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'block';
    btn.textContent = 'Create Account →'; btn.disabled = false;
  }
}

function backToSignup() {
  document.getElementById('verifyForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
}

async function resendSignupCode() {
  if (!_pendingEmail) return;
  const { error } = await _supabase.auth.resend({ type: 'signup', email: _pendingEmail });
  const el = document.getElementById('verifySuccess');
  el.textContent = error ? error.message : '✓ Code resent to your email.';
  el.style.color = error ? '#ef4444' : '#22c55e';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function handleVerify() {
  const code = document.getElementById('verifyCode').value.trim();
  const errEl = document.getElementById('verifyError');
  const sucEl = document.getElementById('verifySuccess');
  const btn = document.getElementById('verifyBtn');
  errEl.style.display = 'none'; sucEl.style.display = 'none';
  if (!code || code.length < 6) { errEl.textContent = 'Please enter the 6-digit code.'; errEl.style.display = 'block'; return; }
  btn.textContent = 'Verifying...'; btn.disabled = true;
  const { error } = await _supabase.auth.verifyOtp({ email: _pendingEmail, token: code, type: 'signup' });
  if (error) {
    errEl.textContent = 'Invalid or expired code. Please try again.'; errEl.style.display = 'block';
    btn.textContent = 'Confirm Account →'; btn.disabled = false;
  } else {
    sucEl.textContent = '✓ Account confirmed! Redirecting...'; sucEl.style.display = 'block';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
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
