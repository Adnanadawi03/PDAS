const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';

if (typeof _supabase === 'undefined') {
  var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function initNavAuth() {
  const { data: { session } } = await _supabase.auth.getSession();
  const signInBtn  = document.getElementById('navSignIn');
  const navUser    = document.getElementById('navUser');
  const navAvatar  = document.getElementById('navUserAvatar');
  const navName    = document.getElementById('navUserName');
  const dropName   = document.getElementById('navDropName');
  const dropEmail  = document.getElementById('navDropEmail');
  const mobileSignIn    = document.getElementById('mobileSignIn');
  const mobileUserSec   = document.getElementById('mobileUserSection');

  if (session) {
    const user  = session.user;
    const name  = user.user_metadata?.full_name || user.email.split('@')[0];
    const email = user.email;
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    if (signInBtn)  signInBtn.style.display  = 'none';
    if (navUser)    navUser.classList.add('visible');
    if (navAvatar)  navAvatar.textContent  = initials;
    if (navName)    navName.textContent    = name;
    if (dropName)   dropName.textContent   = name;
    if (dropEmail)  dropEmail.textContent  = email;

    if (mobileSignIn)  mobileSignIn.style.display = 'none';
    if (mobileUserSec) {
      mobileUserSec.style.display = 'block';
      const mn = mobileUserSec.querySelector('.mobile-user-name');
      const me = mobileUserSec.querySelector('.mobile-user-email');
      if (mn) mn.textContent = name;
      if (me) me.textContent = email;
    }
  } else {
    if (navUser)   navUser.classList.remove('visible');
    if (signInBtn) signInBtn.style.display = '';
    if (mobileSignIn)  mobileSignIn.style.display = '';
    if (mobileUserSec) mobileUserSec.style.display = 'none';
  }

  // Click-toggle dropdown (works on desktop + mobile)
  if (navUser) {
    navUser.addEventListener('click', function(e) {
      e.stopPropagation();
      navUser.classList.toggle('open');
    });
    document.addEventListener('click', function() {
      navUser.classList.remove('open');
    });
  }
}

async function navLogout() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

async function checkAuthNav(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const { data } = await _supabase.auth.getSession();
  window.location.href = data.session ? 'dashboard.html' : 'login.html?msg=signin';
}

document.addEventListener('DOMContentLoaded', initNavAuth);
