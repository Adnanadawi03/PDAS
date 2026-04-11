const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Init ──
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

  // Load avatar if exists
  const avatarUrl = user.user_metadata?.avatar_url;
  if (avatarUrl) {
    showAvatarImage(avatarUrl);
  }

  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) darkToggle.checked = !document.body.classList.contains('light');
  await checkMFAStatus();
}

// ── Helpers ──
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'settings-msg ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function showStep1() {
  document.getElementById('pwStep1').style.display = 'block';
  document.getElementById('pwStep2').style.display = 'none';
  document.getElementById('passwordMsg').style.display = 'none';
}

// ── Profile ──
async function updateProfile() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) { showMsg('profileMsg', 'Name cannot be empty.', 'error'); return; }
  const { error } = await _supabase.auth.updateUser({ data: { full_name: name } });
  if (error) {
    showMsg('profileMsg', error.message, 'error');
  } else {
    showMsg('profileMsg', '✓ Profile updated successfully!', 'success');
    const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('settingsName').textContent = name;
    document.getElementById('settingsAvatar').textContent = initials;
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = initials;
  }
}

// ── Password strength ──
function checkPwStrength(pw) {
  const segs = ['ps1','ps2','ps3','ps4'].map(id => document.getElementById(id));
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['#ef4444','#f59e0b','#22c55e','#00e5ff'];
  segs.forEach((s,i) => { if(s) s.style.background = i < score ? colors[score-1] : 'rgba(255,255,255,0.07)'; });
}

// ── Step 1: Send code ──
async function sendResetCode() {
  const { data: { session } } = await _supabase.auth.getSession();
  const email = session.user.email;
  const { error } = await _supabase.auth.resetPasswordForEmail(email);
  if (error) {
    showMsg('passwordMsg', error.message, 'error');
  } else {
    document.getElementById('resetEmailLabel').textContent = email;
    document.getElementById('pwStep1').style.display = 'none';
    document.getElementById('pwStep2').style.display = 'block';
    showMsg('passwordMsg', '✓ Code sent! Check your email inbox.', 'success');
  }
}

// ── Resend code ──
async function resendCode() {
  const { data: { session } } = await _supabase.auth.getSession();
  const { error } = await _supabase.auth.resetPasswordForEmail(session.user.email);
  showMsg('passwordMsg', error ? error.message : '✓ Code resent to your email.', error ? 'error' : 'success');
}

// ── Step 2: Verify code + update password ──
async function verifyCodeAndUpdate() {
  const code = document.getElementById('resetCode').value.trim();
  const pw   = document.getElementById('newPassword').value;
  const conf = document.getElementById('confirmPassword').value;

  if (!code || code.length < 6) { showMsg('passwordMsg', 'Please enter the 6-digit code from your email.', 'error'); return; }
  if (!pw)        { showMsg('passwordMsg', 'Please enter a new password.', 'error'); return; }
  if (pw !== conf){ showMsg('passwordMsg', 'Passwords do not match.', 'error'); return; }
  if (pw.length < 8){ showMsg('passwordMsg', 'Password must be at least 8 characters.', 'error'); return; }

  const { data: { session } } = await _supabase.auth.getSession();
  const email = session.user.email;

  const { error: otpError } = await _supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (otpError) {
    showMsg('passwordMsg', 'Invalid or expired code. Please try again or resend.', 'error');
    return;
  }

  const { error } = await _supabase.auth.updateUser({ password: pw });
  if (error) {
    showMsg('passwordMsg', error.message, 'error');
  } else {
    showMsg('passwordMsg', '✓ Password updated successfully!', 'success');
    document.getElementById('resetCode').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    setTimeout(showStep1, 2000);
  }
}

// ── Danger zone ──
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

// ── 2FA ──
let _mfaFactorId = null;

async function checkMFAStatus() {
  const { data, error } = await _supabase.auth.mfa.listFactors();
  if (error || !data) return false;
  const totp = data.totp?.find(f => f.status === 'verified');
  if (totp) {
    _mfaFactorId = totp.id;
    document.getElementById('mfaStatusIcon').textContent = '🔒';
    document.getElementById('mfaStatusIcon').style.background = 'rgba(34,197,94,0.1)';
    document.getElementById('mfaStatusText').textContent = '2FA is Enabled';
    document.getElementById('mfaStatusText').style.color = '#22c55e';
    document.getElementById('mfaStatusSub').textContent = 'Your account is protected by authenticator app';
    document.getElementById('mfaToggleBtn').textContent = 'Disable 2FA';
    document.getElementById('mfaToggleBtn').style.background = 'rgba(239,68,68,0.15)';
    document.getElementById('mfaToggleBtn').style.color = '#ef4444';
    document.getElementById('mfaToggleBtn').style.border = '1px solid rgba(239,68,68,0.3)';
    return true;
  }
  return false;
}

async function toggleMFA() {
  const isEnabled = await checkMFAStatus();
  if (isEnabled) {
    document.getElementById('mfaDisable').style.display = 'block';
    document.getElementById('mfaSetup').style.display = 'none';
  } else {
    await startMFASetup();
  }
}

async function startMFASetup() {
  document.getElementById('mfaMsg').style.display = 'none';
  const { data, error } = await _supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PDAS Authenticator' });
  if (error) { showMsg('mfaMsg', error.message, 'error'); return; }

  _mfaFactorId = data.id;
  const secret = data.totp.secret;
  const qrUri  = data.totp.uri;

  document.getElementById('mfaSecret').textContent = secret;
  document.getElementById('mfaQR').innerHTML = '';
  new QRCode(document.getElementById('mfaQR'), { text: qrUri, width: 150, height: 150, colorDark: '#000000', colorLight: '#ffffff' });
  document.getElementById('mfaSetup').style.display = 'block';
  document.getElementById('mfaDisable').style.display = 'none';
}

async function verifyAndEnableMFA() {
  const code = document.getElementById('mfaVerifyCode').value.trim();
  if (!code || code.length < 6) { showMsg('mfaMsg', 'Please enter the 6-digit code from your app.', 'error'); return; }

  const { data: challengeData, error: challengeErr } = await _supabase.auth.mfa.challenge({ factorId: _mfaFactorId });
  if (challengeErr) { showMsg('mfaMsg', challengeErr.message, 'error'); return; }

  const { error } = await _supabase.auth.mfa.verify({ factorId: _mfaFactorId, challengeId: challengeData.id, code });
  if (error) {
    showMsg('mfaMsg', 'Invalid code. Please check your authenticator app and try again.', 'error');
  } else {
    document.getElementById('mfaSetup').style.display = 'none';
    document.getElementById('mfaVerifyCode').value = '';
    await checkMFAStatus();
    showMsg('mfaMsg', '✓ 2FA enabled successfully! Your account is now more secure.', 'success');
  }
}

function cancelMFASetup() {
  document.getElementById('mfaSetup').style.display = 'none';
  document.getElementById('mfaVerifyCode').value = '';
  if (_mfaFactorId) _supabase.auth.mfa.unenroll({ factorId: _mfaFactorId });
}

async function disableMFA() {
  const code = document.getElementById('mfaDisableCode').value.trim();
  if (!code || code.length < 6) { showMsg('mfaMsg', 'Please enter the 6-digit code from your app.', 'error'); return; }

  const { data: challengeData, error: challengeErr } = await _supabase.auth.mfa.challenge({ factorId: _mfaFactorId });
  if (challengeErr) { showMsg('mfaMsg', challengeErr.message, 'error'); return; }

  const { error: verifyErr } = await _supabase.auth.mfa.verify({ factorId: _mfaFactorId, challengeId: challengeData.id, code });
  if (verifyErr) { showMsg('mfaMsg', 'Invalid code. Please try again.', 'error'); return; }

  const { error } = await _supabase.auth.mfa.unenroll({ factorId: _mfaFactorId });
  if (error) {
    showMsg('mfaMsg', error.message, 'error');
  } else {
    _mfaFactorId = null;
    document.getElementById('mfaDisable').style.display = 'none';
    document.getElementById('mfaDisableCode').value = '';
    document.getElementById('mfaStatusIcon').textContent = '🔓';
    document.getElementById('mfaStatusIcon').style.background = 'rgba(239,68,68,0.1)';
    document.getElementById('mfaStatusText').textContent = '2FA is Disabled';
    document.getElementById('mfaStatusText').style.color = 'var(--text)';
    document.getElementById('mfaStatusSub').textContent = 'Your account is protected by password only';
    document.getElementById('mfaToggleBtn').textContent = 'Enable 2FA';
    document.getElementById('mfaToggleBtn').style.background = '';
    document.getElementById('mfaToggleBtn').style.color = '';
    document.getElementById('mfaToggleBtn').style.border = '';
    showMsg('mfaMsg', '2FA has been disabled.', 'success');
  }
}

function cancelDisableMFA() {
  document.getElementById('mfaDisable').style.display = 'none';
  document.getElementById('mfaDisableCode').value = '';
}

// ── Avatar ──
function showAvatarImage(url) {
  const img = document.getElementById('settingsAvatarImg');
  const initDiv = document.getElementById('settingsAvatar');
  const navAvatar = document.getElementById('userAvatar');
  if (img && initDiv) {
    img.src = url;
    img.style.display = 'block';
    initDiv.style.display = 'none';
  }
  // Also update sidebar avatar
  if (navAvatar) {
    navAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent='?'">`;
  }
}

function compressImage(file, maxSizePx, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSizePx || h > maxSizePx) {
          if (w > h) { h = Math.round(h * maxSizePx / w); w = maxSizePx; }
          else       { w = Math.round(w * maxSizePx / h); h = maxSizePx; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    document.getElementById('avatarMsg').textContent = '⚠️ Please select an image file.';
    document.getElementById('avatarMsg').style.color = '#ef4444';
    return;
  }

  document.getElementById('avatarMsg').textContent = 'Processing...';
  document.getElementById('avatarMsg').style.color = 'var(--muted)';

  // Auto-compress to max 400px and 0.85 quality
  const compressed = await compressImage(file, 400, 0.85);

  const { data: { session } } = await _supabase.auth.getSession();
  const userId = session.user.id;
  const filePath = userId + "/avatar.jpg";

  // Upload to Supabase Storage
  document.getElementById('avatarMsg').textContent = 'Uploading...';
  const { error: uploadError } = await _supabase.storage
    .from('avatars')
    .upload(filePath, compressed, { upsert: true, contentType: 'image/jpeg' });

  if (uploadError) {
    document.getElementById('avatarMsg').textContent = '⚠️ ' + uploadError.message;
    document.getElementById('avatarMsg').style.color = '#ef4444';
    return;
  }

  // Get public URL
  const { data: urlData } = _supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // cache bust

  // Save URL to user metadata
  const { error: updateError } = await _supabase.auth.updateUser({
    data: { avatar_url: publicUrl }
  });

  if (updateError) {
    document.getElementById('avatarMsg').textContent = '⚠️ ' + updateError.message;
    document.getElementById('avatarMsg').style.color = '#ef4444';
    return;
  }

  showAvatarImage(publicUrl);
  document.getElementById('avatarMsg').textContent = '✓ Photo updated!';
  document.getElementById('avatarMsg').style.color = '#22c55e';
  setTimeout(() => { document.getElementById('avatarMsg').textContent = ''; }, 3000);
}
