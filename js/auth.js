import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';
import { state } from './state.js';
import { loadWeek } from './sync.js';

const EDITORS = [
  'andre@metalrail.com.br',
  'daniel@metalrail.com.br',
  'eduardo@metalrail.com.br',
  'renan@metalrail.com.br'
];

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = '';
  document.getElementById('tab-quadro').parentElement.style.display = '';
}

function applyAccessMode() {
  if (state.isEditor) {
    document.body.classList.remove('readonly');
  } else {
    document.body.classList.add('readonly');
  }
}

function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  const logoutBtn = document.getElementById('logout-btn');
  if (!badge) return;
  if (state.isVisitor) {
    badge.style.display = 'flex';
    logoutBtn.style.display = '';
    badge.innerHTML = `<div><div class="user-badge-name">Visitante</div><div class="user-badge-role">Somente leitura</div></div>`;
    logoutBtn.textContent = 'Sair';
  } else if (state.currentUser) {
    const name = state.currentUser.email.split('@')[0];
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    badge.style.display = 'flex';
    logoutBtn.style.display = '';
    badge.innerHTML = `<div><div class="user-badge-name">${displayName}</div><div class="user-badge-role">Editor</div></div>`;
  }
}

window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const senha = document.getElementById('login-senha').value;
  const err = document.getElementById('login-err');
  if (!email || !senha) { err.textContent = 'Preencha e-mail e senha.'; return; }
  if (!EDITORS.includes(email)) { err.textContent = 'Acesso de editor não autorizado para este e-mail.'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    err.textContent = '';
  } catch (e) {
    if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
      err.textContent = 'E-mail ou senha incorretos.';
    } else {
      err.textContent = 'Erro ao fazer login. Tente novamente.';
    }
  }
};

window.doVisitor = function() {
  state.currentUser = null;
  state.isEditor = false;
  state.isVisitor = true;
  showApp();
  applyAccessMode();
  updateUserBadge();
  loadWeek(state.currentWeek);
};

window.doLogout = async function() {
  if (state.currentUser) await signOut(auth);
  state.currentUser = null;
  state.isEditor = false;
  state.isVisitor = false;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  document.body.classList.remove('readonly');
  document.getElementById('login-email').value = '';
  document.getElementById('login-senha').value = '';
};

// Inicializa listener de autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    state.currentUser = user;
    state.isEditor = EDITORS.includes(user.email.toLowerCase());
    state.isVisitor = false;
    showApp();
    applyAccessMode();
    updateUserBadge();
    loadWeek(state.currentWeek);
  }
});
