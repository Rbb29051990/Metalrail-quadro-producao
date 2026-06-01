import { state } from './state.js';
import { timeToMin, minToTime, SETOR_IDS } from './utils.js';
import { saveWeek } from './sync.js';
import { render } from './render.js';

window.delCard = function(id) {
  if (!confirm('Remover esta OS?')) return;
  state.weekData.cards = state.weekData.cards.filter(x => x.id !== id);
  saveWeek(); render();
};

window.editCard = function(id) {
  const card = state.weekData.cards.find(x => x.id === id); if (!card) return;
  state.editingId = id;
  document.getElementById('modal-title').textContent = 'Editar ordem de serviço';
  document.getElementById('btn-save').textContent = 'Salvar alterações';
  document.getElementById('m-os').value = card.os;
  document.getElementById('m-cli').value = card.cliente;
  document.getElementById('m-dt').value = card.dataEntrega || '';
  state.isUrgente = card.urgente || false;
  document.getElementById('urg-sim').className = state.isUrgente ? 'urg-btn active-nao' : 'urg-btn';
  document.getElementById('urg-nao').className = state.isUrgente ? 'urg-btn' : 'urg-btn selected-nao';
  SETOR_IDS.forEach(s => {
    const min = card.min_setor ? parseInt(card.min_setor[s]) || 0 : 0;
    document.getElementById('h-' + s).value = min ? minToTime(min) : '';
  });
  document.getElementById('m-err').textContent = '';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('m-os').focus(), 50);
};

window.setUrgente = function(val) {
  state.isUrgente = val;
  const sim = document.getElementById('urg-sim'), nao = document.getElementById('urg-nao');
  if (val) { sim.className = 'urg-btn active-nao'; nao.className = 'urg-btn'; }
  else { nao.className = 'urg-btn selected-nao'; sim.className = 'urg-btn'; }
};

window.openModal = function() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = 'Nova ordem de serviço';
  document.getElementById('btn-save').textContent = 'Adicionar OS';
  document.getElementById('m-os').value = '';
  document.getElementById('m-cli').value = '';
  document.getElementById('m-dt').value = '';
  SETOR_IDS.forEach(s => document.getElementById('h-' + s).value = '');
  document.getElementById('m-err').textContent = '';
  state.isUrgente = false;
  document.getElementById('urg-sim').className = 'urg-btn';
  document.getElementById('urg-nao').className = 'urg-btn selected-nao';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('m-os').focus(), 50);
};

window.closeModal = function() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
};

window.saveCard = async function() {
  const os = document.getElementById('m-os').value.trim();
  const cli = document.getElementById('m-cli').value.trim();
  const err = document.getElementById('m-err');
  if (!os || !cli) { err.textContent = 'Preencha OS e Cliente.'; return; }
  const min_setor = {}; let minTotal = 0;
  SETOR_IDS.forEach(s => { const v = timeToMin(document.getElementById('h-' + s).value); min_setor[s] = v; minTotal += v; });
  const dt = document.getElementById('m-dt').value;
  if (state.editingId !== null) {
    if (state.weekData.cards.find(c => c.os === os && c.id !== state.editingId)) { err.textContent = 'Essa OS já existe nesta semana.'; return; }
    const card = state.weekData.cards.find(x => x.id === state.editingId); if (!card) return;
    card.os = os; card.cliente = cli; card.min_setor = min_setor; card.min_total = minTotal;
    card.horas = minTotal / 60; card.urgente = state.isUrgente; card.dataEntrega = dt;
  } else {
    if (state.weekData.cards.find(c => c.os === os)) { err.textContent = 'Essa OS já existe nesta semana.'; return; }
    state.weekData.cards.push({id: state.weekData.nextId++, os, cliente: cli, min_setor, min_total: minTotal,
      horas: minTotal / 60, col: 'fila', urgente: state.isUrgente, dataEntrega: dt});
  }
  await saveWeek();
  window.closeModal(); render();
};
