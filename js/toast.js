// ─── TOAST ─────────────────────────────────────────
// Aviso flutuante no canto superior direito. Não bloqueia a tela,
// some sozinho (~4s, com barra de progresso), empilha e fecha no ✕ ou Esc.
let _container = null;

function ensureContainer() {
  if (_container && document.body.contains(_container)) return _container;
  _container = document.createElement('div');
  _container.className = 'toast-container';
  _container.id = 'toast-container';
  document.body.appendChild(_container);
  return _container;
}

// Fecha o toast mais recente ao pressionar Esc (registrado uma única vez).
let _escBound = false;
function bindEsc() {
  if (_escBound) return;
  _escBound = true;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_container) return;
    const ultimo = _container.lastElementChild;
    if (ultimo && ultimo._dismiss) ultimo._dismiss();
  });
}

// showToast({ title, message, icon, duration })
// message aceita HTML (mesma convenção do restante do app, ex.: <b>…</b>).
export function showToast({ title = 'Aviso', message = '', icon = '⚠️', duration = 4000 } = {}) {
  const cont = ensureContainer();
  bindEsc();

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="toast-bar"></div>
    <div class="toast-body">
      <button class="toast-x" type="button" aria-label="Fechar">✕</button>
      <div class="toast-head"><span class="toast-ic">${icon}</span>${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
      <div class="toast-prog"><i style="animation-duration:${duration}ms"></i></div>
    </div>`;

  let timer;
  const dismiss = () => {
    if (el._dismissed) return;
    el._dismissed = true;
    clearTimeout(timer);
    el.classList.add('toast-out');
    const done = () => el.remove();
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400); // fallback caso a animação não dispare
  };
  el._dismiss = dismiss;

  el.querySelector('.toast-x').addEventListener('click', dismiss);
  // Pausa o autofechamento enquanto o mouse está sobre o toast (lê com calma).
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1500); });
  timer = setTimeout(dismiss, duration);

  cont.appendChild(el);
  return dismiss;
}

window.showToast = showToast;
