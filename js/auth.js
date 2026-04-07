const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';

if (typeof _supabase === 'undefined') {
  var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function initNavAuth() {
  const { data: { session } } = await _supabase.auth.getSession();
  const signInBtn = document.getElementById('navSignIn');
  const navUser = document.getElementById('navUser');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navUserName = document.getElementById('navUserName');
  const mobileSignIn = document.getElementById('mobileSignIn');
  const mobileUserSection = document.getElementById('mobileUserSection');

  if (session) {
    const user = session.user;
    const name = user.user_metadata?.full_name || user.email.split('@')[0];
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

    if (signInBtn) signInBtn.style.display = 'none';
    if (navUser) { navUser.classList.add('visible'); }
    if (navUserAvatar) navUserAvatar.textContent = initials;
    if (navUserName) navUserName.textContent = name;

    if (mobileSignIn) mobileSignIn.style.display = 'none';
    if (mobileUserSection) {
      mobileUserSection.style.display = 'block';
      mobileUserSection.querySelector('.mobile-user-name').textContent = name;
      mobileUserSection.querySelector('.mobile-user-email').textContent = user.email;
    }
  } else {
    if (navUser) navUser.classList.remove('visible');
    if (signInBtn) signInBtn.style.display = '';
    if (mobileSignIn) mobileSignIn.style.display = '';
    if (mobileUserSection) mobileUserSection.style.display = 'none';
  }
}

async function navLogout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

async function checkAuthNav(e) {
  e.preventDefault();
  const { data } = await _supabase.auth.getSession();
  window.location.href = data.session ? 'dashboard.html' : 'login.html?msg=signin';
}

document.addEventListener('DOMContentLoaded', initNavAuth);
