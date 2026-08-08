import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from './firebase.js';
import { state } from './state.js';
import { loadWeek } from './sync.js';

// QUEM PODE EDITAR NAO E DECIDIDO AQUI.
//
// Ate 2026-08-07 este arquivo trazia um array EDITORS com os cinco e-mails dos
// editores. Como ele e servido publicamente em /js/auth.js, a lista entregava os
// enderecos -- e o dominio da empresa -- a qualquer visitante, o que anulava
// qualquer cuidado na tela de login.
//
// A autorizacao de verdade sempre esteve no `firestore.rules`, que roda no
// servidor, nao e legivel pelo visitante e exige `email_verified == true` alem do
// e-mail estar na lista. O cliente agora ESPELHA a condicao da regra em vez de
// duplicar a lista: autenticado e verificado => interface de edicao. Se alguem
// autenticar fora dos cinco enderecos, a interface abre e a ESCRITA e recusada
// pela regra, que e onde a decisao mora.
//
// Nenhuma permissao foi afrouxada nesta mudanca: o `firestore.rules` segue
// intacto, com os mesmos cinco e-mails.

// Segundos de espera imposta entre dois pedidos de link, para a tela nao virar
// uma metralhadora de e-mails contra um endereco alheio.
const ESPERA_RESET_S = 30;

// A MESMA frase para conta existente e inexistente. Distinguir os dois casos
// transformaria a tela num verificador de e-mails cadastrados -- exatamente o que
// a troca do placeholder queria evitar.
const MSG_RESET = 'Se este e-mail estiver cadastrado, o link chega em instantes. Confira o lixo eletrônico (pasta de SPAM).';

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
  const info = document.getElementById('login-info');
  if (info) info.textContent = '';
  if (!email || !senha) { err.textContent = 'Preencha e-mail e senha.'; return; }
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

window.doReset = async function() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const err = document.getElementById('login-err');
  const info = document.getElementById('login-info');
  const btn = document.getElementById('login-forgot-btn');
  err.textContent = '';
  info.textContent = '';
  if (!email) { err.textContent = 'Digite seu e-mail acima para receber o link.'; return; }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (e) {
    // E-mail mal formado e erro de digitacao, nao vazamento: o texto nem tem
    // forma de endereco, entao avisar nao revela quem esta cadastrado.
    if (e.code === 'auth/invalid-email') { err.textContent = 'E-mail inválido.'; return; }
    // Todo o resto -- inclusive `auth/user-not-found` -- cai na mensagem neutra
    // de proposito. O usuario nao distingue "nao existe" de "enviado", e e assim
    // que tem de ser.
  }

  info.textContent = MSG_RESET;
  aguardarNovoPedido(btn);
};

// Desabilita o link por ESPERA_RESET_S segundos, com contagem regressiva visivel
// para a espera nao parecer travamento.
function aguardarNovoPedido(btn) {
  if (!btn) return;
  const rotulo = btn.textContent;
  let resta = ESPERA_RESET_S;
  btn.disabled = true;
  btn.textContent = `Aguarde ${resta}s…`;
  const t = setInterval(() => {
    resta -= 1;
    if (resta <= 0) {
      clearInterval(t);
      btn.disabled = false;
      btn.textContent = rotulo;
    } else {
      btn.textContent = `Aguarde ${resta}s…`;
    }
  }, 1000);
}

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
  document.getElementById('login-err').textContent = '';
  document.getElementById('login-info').textContent = '';
};

// Inicializa listener de autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    state.currentUser = user;
    // Espelha a condicao do `firestore.rules` (`email_verified == true`). Quem
    // ainda nao definiu a senha pelo link recebido por e-mail entra em modo
    // leitura, que e o mesmo que a regra permitiria a ele.
    state.isEditor = !!user.emailVerified;
    state.isVisitor = false;
    showApp();
    applyAccessMode();
    updateUserBadge();
    loadWeek(state.currentWeek);
  }
});
