import { state } from './state.js';
import { weekKeyFromDate, weekLabel, nextWeekKey, prevWeekKey, timeToMin, COLS } from './utils.js';
import { initSync, loadWeek, saveWeek, setSyncStatus } from './sync.js';
import { render, renderGerarBar, renderDesempenho, atualizarBotoesNav } from './render.js';
import { docRef, getDoc } from './firebase.js';
import './card.js';
import './auth.js';

// ─── INJEÇÃO DE DEPENDÊNCIA ────────────────────────
initSync({ render, renderGerarBar, atualizarBotoesNav });

// ─── INICIALIZAÇÃO DE ESTADO ───────────────────────
state.currentWeek = weekKeyFromDate(new Date());
state.desempWeek  = weekKeyFromDate(new Date());

// ─── WINDOW.SETCAP ─────────────────────────────────
// Definido aqui pois precisa de saveWeek (sync.js) e render (render.js)
window.setCap = function(col, val) {
  state.weekData.caps[col] = timeToMin(val);
  saveWeek();
  render();
};

// ─── NAVEGAÇÃO ─────────────────────────────────────
window.changeWeek = async function(dir) {
  if (dir > 0) {
    const hoje = weekKeyFromDate(new Date());
    const destino = nextWeekKey(state.currentWeek);
    if (destino <= hoje) {
      // passado: livre
    } else if (state.currentWeek === hoje) {
      // da semana atual sempre pode ver o espelho
    } else if (state.weekData.gerada === true) {
      // semana independente: pode ver o espelho da proxima
    } else {
      // espelho (gerada:false): bloqueado, nao pode ir alem
      return;
    }
  }
  const [yr, wn] = state.currentWeek.split('-W');
  const d = new Date(Number(yr), 0, 1 + (Number(wn) - 1) * 7);
  d.setDate(d.getDate() + dir * 7);
  state.currentWeek = weekKeyFromDate(d);
  document.getElementById('week-lbl').textContent = weekLabel(state.currentWeek);
  loadWeek(state.currentWeek);
};

window.switchTab = function(tab) {
  document.getElementById('tab-quadro').classList.toggle('active', tab === 'quadro');
  document.getElementById('tab-desempenho').classList.toggle('active', tab === 'desempenho');
  document.getElementById('main-quadro').style.display = tab === 'quadro' ? '' : 'none';
  document.getElementById('main-desempenho').style.display = tab === 'desempenho' ? '' : 'none';
  if (tab === 'desempenho') {
    // Só inicializa desempWeek na primeira vez que abre a aba
    // Nas demais, preserva a posição de semana que o usuário estava navegando
    if (!state.desempInicializado) { state.desempWeek = state.currentWeek; state.desempInicializado = true; }
    renderDesempenho();
    atualizarBotoesNav();
  }
};

window.changeDesempWeek = async function(dir) {
  if (dir > 0) {
    const hoje = weekKeyFromDate(new Date());
    const destino = nextWeekKey(state.desempWeek);
    let podeAvancar = false;
    if (destino <= hoje) {
      podeAvancar = true;
    } else if (state.desempWeek === hoje) {
      podeAvancar = true;
    } else {
      const prev = prevWeekKey(state.desempWeek);
      const prevSnap = await getDoc(docRef(prev));
      if (prevSnap.exists() && prevSnap.data().gerada === true) podeAvancar = true;
    }
    if (!podeAvancar) return;
  }
  const [yr, wn] = state.desempWeek.split('-W');
  const d = new Date(Number(yr), 0, 1 + (Number(wn) - 1) * 7);
  d.setDate(d.getDate() + dir * 7);
  state.desempWeek = weekKeyFromDate(d);
  renderDesempenho();
  atualizarBotoesNav();
};

// ─── BUSCA DE OS ───────────────────────────────────
window.searchOS = async function(query) {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  query = query.trim().toLowerCase();
  if (query.length < 2) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }

  resultsEl.style.display = '';
  resultsEl.innerHTML = '<div class="search-empty">🔍 Buscando...</div>';

  // Busca apenas em semanas passadas + semana atual (NUNCA futuras)
  // Evita duplicatas de cards espelhados em semanas futuras
  const results = [];
  const promises = [];
  for (let offset = -12; offset <= 0; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset * 7);
    const wk = weekKeyFromDate(d);
    if (wk > state.currentWeek) continue;
    promises.push(
      getDoc(docRef(wk)).then(snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        (data.cards || []).forEach(card => {
          const osMatch  = card.os.toLowerCase().includes(query);
          const cliMatch = card.cliente.toLowerCase().includes(query);
          if (osMatch || cliMatch) {
            const col = COLS.find(c => c.id === card.col);
            results.push({
              os: card.os,
              cliente: card.cliente,
              setor: col ? col.label : '—',
              setorColor: col ? col.color : '#94a3b8',
              semana: weekLabel(wk),
              semanaKey: wk,
              urgente: card.urgente,
              dataEntrega: card.dataEntrega
            });
          }
        });
      }).catch(() => {})
    );
  }
  await Promise.all(promises);

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-results"><div class="search-empty">Nenhuma OS encontrada</div></div>';
    return;
  }

  results.sort((a, b) => a.semanaKey.localeCompare(b.semanaKey));

  const html = results.map(r => {
    const dtFmt = r.dataEntrega ? new Date(r.dataEntrega + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '';
    return `<div class="search-result-item">
      ${r.urgente ? '<span style="font-size:12px">🚨</span>' : ''}
      <span class="search-result-os">${r.os}</span>
      <span class="search-result-cli">${r.cliente}${dtFmt ? ' · 📅 ' + dtFmt : ''}</span>
      <span class="search-result-loc" style="background:${r.setorColor}20;color:${r.setorColor}">${r.setor}</span>
      <span class="search-result-week">${r.semana}</span>
    </div>`;
  }).join('');

  resultsEl.innerHTML = `<div class="search-results">${html}</div>`;
};

// ─── EVENT LISTENERS GLOBAIS ───────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    window.closeModal();
    const sr = document.getElementById('search-results');
    if (sr) sr.style.display = 'none';
  }
});

window.addEventListener('click', function(e) {
  const sr = document.getElementById('search-results');
  const si = document.getElementById('search-input');
  if (sr && si && !sr.contains(e.target) && e.target !== si) {
    sr.style.display = 'none';
  }
});

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) window.closeModal();
});

document.addEventListener('DOMContentLoaded', () => {
  const senhaInput = document.getElementById('login-senha');
  if (senhaInput) senhaInput.addEventListener('keydown', e => { if (e.key === 'Enter') window.doLogin(); });
  const emailInput = document.getElementById('login-email');
  if (emailInput) emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-senha').focus(); });
});

// ─── INIT ──────────────────────────────────────────
setSyncStatus('connecting');
document.getElementById('week-lbl').textContent = weekLabel(state.currentWeek);
// loadWeek é chamado pelo onAuthStateChanged (auth.js) ou doVisitor
