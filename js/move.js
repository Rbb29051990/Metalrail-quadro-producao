// ─── DIÁLOGO MOVER OS (setor + posição) ────────────
// Alternativa ao arrastar, pensada para tablet/celular: clicar no card abre
// um diálogo em 2 passos — escolher o setor e a posição dentro dele.
import { state } from './state.js';
import { COLS, cardUsaSetor } from './utils.js';
import { sortCards, render } from './render.js';
import { saveWeek } from './sync.js';
import { showToast } from './toast.js';

let _cardId = null;
let _destCol = null;

function overlay() {
  let ov = document.getElementById('move-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'move-overlay';
  ov.innerHTML = `
    <div class="modal move-modal">
      <div class="modal-title" id="move-title">Mover OS</div>
      <div class="move-step">1 · Para qual setor?</div>
      <div class="move-sectors" id="move-sectors"></div>
      <div class="move-step" id="move-step2" style="display:none">2 · Em qual posição?</div>
      <div class="move-positions" id="move-positions"></div>
      <div class="modal-actions"><button class="btn-cancel" id="move-cancel">Cancelar</button></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) window.closeMoveModal(); });
  ov.querySelector('#move-cancel').addEventListener('click', () => window.closeMoveModal());
  return ov;
}

window.openMoveModal = function(cardId) {
  const card = state.weekData.cards.find(c => c.id === cardId);
  if (!card) return;
  if (document.body.classList.contains('readonly')) return;
  _cardId = cardId;
  _destCol = null;

  const ov = overlay();
  ov.querySelector('#move-title').textContent = `Mover OS ${card.os}`;

  const sec = ov.querySelector('#move-sectors');
  sec.innerHTML = '';
  COLS.forEach(col => {
    const usa = cardUsaSetor(card, col.id);
    const btn = document.createElement('button');
    btn.className = 'move-opt' + (col.id === card.col ? ' atual' : '');
    btn.dataset.col = col.id;
    btn.disabled = !usa;
    const tag = col.id === card.col ? ' <small>(atual)</small>' : (!usa ? ' <small>(sem horas)</small>' : '');
    btn.innerHTML = `<span class="move-dot" style="background:${col.color}"></span>${col.label}${tag}`;
    btn.addEventListener('click', () => selecionarSetor(col.id));
    sec.appendChild(btn);
  });

  ov.querySelector('#move-step2').style.display = 'none';
  ov.querySelector('#move-positions').innerHTML = '';
  ov.classList.add('open');
};

function selecionarSetor(colId) {
  _destCol = colId;
  const ov = document.getElementById('move-overlay');
  ov.querySelectorAll('#move-sectors .move-opt').forEach(b => b.classList.toggle('sel', b.dataset.col === colId));

  const col = COLS.find(c => c.id === colId);
  const step2 = ov.querySelector('#move-step2');
  step2.style.display = '';
  step2.textContent = `2 · Posição em ${col.label}`;

  const posWrap = ov.querySelector('#move-positions');
  posWrap.innerHTML = '';
  const destCards = sortCards(state.weekData.cards.filter(c => c.col === colId && c.id !== _cardId));

  const addPos = (label, index) => {
    const b = document.createElement('button');
    b.className = 'move-pos';
    b.innerHTML = label;
    b.addEventListener('click', () => aplicarMove(index));
    posWrap.appendChild(b);
  };

  if (destCards.length === 0) {
    addPos('Colocar neste setor', 0);
  } else {
    addPos('▲ Primeira posição', 0);
    destCards.forEach((c, i) => addPos(`Depois de <b>${c.os}</b> — ${c.cliente}`, i + 1));
  }
}

function aplicarMove(index) {
  const card = state.weekData.cards.find(c => c.id === _cardId);
  if (!card || !_destCol) return;
  // Defensivo: setores sem horas já vêm desabilitados, mas garante a regra.
  if (!cardUsaSetor(card, _destCol)) {
    const col = COLS.find(c => c.id === _destCol);
    showToast({ title: 'Setor sem horas estimadas', message: `A OS <b>${card.os}</b> não tem horas para o setor <b>${col ? col.label : _destCol}</b>.` });
    return;
  }
  card.col = _destCol;
  const destCards = sortCards(state.weekData.cards.filter(c => c.col === _destCol && c.id !== card.id));
  destCards.splice(index, 0, card);
  destCards.forEach((c, i) => { c.ordem = i; });
  saveWeek();
  render();
  window.closeMoveModal();
}

window.closeMoveModal = function() {
  const ov = document.getElementById('move-overlay');
  if (ov) ov.classList.remove('open');
  _cardId = null;
  _destCol = null;
};

document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeMoveModal(); });
