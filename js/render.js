import { state } from './state.js';
import { weekLabel, nextWeekKey, weekKeyFromDate, COLS, FLUXO, TRACK_COLS, TRACK_LABEL, PRINT_COLS, minToTime, cardUsaSetor } from './utils.js';
import { getCapMin, getUsedMin, getCardMin, saldoClass, saldoText, capPct, capColor } from './capacity.js';
import { docRef, getDoc } from './firebase.js';
import { saveWeek } from './sync.js';
import { showToast } from './toast.js';

// ─── ORDENAÇÃO ─────────────────────────────────────
export function sortCards(cards) {
  const comOrdem = cards.filter(c => c.ordem !== undefined).sort((a, b) => a.ordem - b.ordem);
  const semOrdem = cards.filter(c => c.ordem === undefined).sort((a, b) => {
    if (a.dataEntrega && b.dataEntrega) return new Date(a.dataEntrega) - new Date(b.dataEntrega);
    if (a.dataEntrega) return -1;
    if (b.dataEntrega) return 1;
    return 0;
  });
  return [...comOrdem, ...semOrdem];
}

export function reorderInColumn(colId, draggedId, targetId, insertBefore) {
  const colCards = sortCards(state.weekData.cards.filter(c => c.col === colId));
  const dragged = colCards.find(c => c.id === draggedId);
  if (!dragged) return;
  const filtered = colCards.filter(c => c.id !== draggedId);
  const targetIdx = filtered.findIndex(c => c.id === targetId);
  if (targetIdx === -1) filtered.push(dragged);
  else if (insertBefore) filtered.splice(targetIdx, 0, dragged);
  else filtered.splice(targetIdx + 1, 0, dragged);
  filtered.forEach((card, i) => { card.ordem = i; });
}

// ─── DRAG & DROP ───────────────────────────────────
// Bloqueia mover um card para um setor sem horas estimadas (volta para a origem).
function podeMoverPara(card, colId) {
  if (cardUsaSetor(card, colId)) return true;
  const lbl = (COLS.find(c => c.id === colId) || {}).label || colId;
  showToast({
    title: 'Setor sem horas estimadas',
    message: `A OS <b>${card.os}</b> não tem horas para o setor <b>${lbl}</b>. O cartão voltou à origem — edite a OS e informe as horas desse setor.`
  });
  return false;
}

export function setupDrop(el, colId) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
    if (state.dragId === null) return;
    const card = state.weekData.cards.find(x => x.id === state.dragId);
    if (!card || card.col === colId) return;
    if (!podeMoverPara(card, colId)) return;
    card.col = colId;
    // Ao mover para nova coluna: vai para o fim (sem sobrescrever ordem manual herdada)
    const maxOrdem = state.weekData.cards.filter(c => c.col === colId && c.id !== card.id && c.ordem !== undefined);
    if (maxOrdem.length > 0) card.ordem = Math.max(...maxOrdem.map(c => c.ordem)) + 1;
    else delete card.ordem;
    await saveWeek();
    render();
  });
}

export function setupCardDrop(el, cardId, colId) {
  el.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation();
    if (state.dragSourceCol !== colId) return; // só reordena dentro da mesma coluna
    const rect = el.getBoundingClientRect();
    el.style.borderTop    = e.clientY < rect.top + rect.height / 2 ? '2px solid #534AB7' : '';
    el.style.borderBottom = e.clientY >= rect.top + rect.height / 2 ? '2px solid #534AB7' : '';
  });
  el.addEventListener('dragleave', () => { el.style.borderTop = ''; el.style.borderBottom = ''; });
  el.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation();
    el.style.borderTop = ''; el.style.borderBottom = '';
    if (state.dragId === null) return;
    const card = state.weekData.cards.find(x => x.id === state.dragId);
    if (!card) return;
    if (state.dragId === cardId) return;
    if (state.dragSourceCol === colId) {
      // Reordenação dentro da mesma coluna
      const rect = el.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      reorderInColumn(colId, state.dragId, cardId, insertBefore);
    } else {
      // Movimento entre colunas — soltar sobre um card também funciona
      if (!podeMoverPara(card, colId)) return;
      card.col = colId;
      const maxOrdem = state.weekData.cards.filter(c => c.col === colId && c.id !== card.id && c.ordem !== undefined);
      if (maxOrdem.length > 0) card.ordem = Math.max(...maxOrdem.map(c => c.ordem)) + 1;
      else delete card.ordem;
    }
    await saveWeek();
    render();
  });
}

// ─── RENDER ────────────────────────────────────────
export function render() {
  document.getElementById('week-lbl').textContent = weekLabel(state.currentWeek);
  const board = document.getElementById('board');
  board.innerHTML = '';

  COLS.forEach(col => {
    const cards = sortCards(state.weekData.cards.filter(c => c.col === col.id));
    const sc = saldoClass(col.id);
    const isOver = sc === 'over';
    const hasCap = !col.noCap;
    const capMin = getCapMin(col.id);

    const colEl = document.createElement('div');
    colEl.className = `col ${col.cls}`;

    let capHTML = '';
    if (hasCap) {
      capHTML = `<div class="cap-box">
        <div class="cap-row">
          <input class="cap-input" placeholder="000:00" maxlength="6"
            value="${capMin ? minToTime(capMin) : ''}"
            title="Capacidade da semana"
            oninput="fmtCap(this)"
            onchange="setCap('${col.id}',this.value)" />
          <span class="cap-label">horas/<br>semana</span>
        </div>
        <div class="saldo ${sc}">${saldoText(col.id)}</div>
        ${isOver ? '<div class="extra-pill">⚠ Necessita de hora extra</div>' : ''}
        <div class="cap-bar"><div class="cap-fill" style="width:${capPct(col.id)}%;background:${capColor(col.id)}"></div></div>
      </div>`;
    } else {
      capHTML = '<div class="no-cap-spacer"></div>';
    }

    colEl.innerHTML = `
      <div class="col-title">
        <div class="col-dot" style="background:${col.color}"></div>
        <span style="color:${col.color}">${col.label}</span>
        <span class="col-count" style="color:${col.color}">${cards.length}</span>
      </div>
      ${capHTML}
      <div class="cards-list" id="list-${col.id}"></div>
    `;
    board.appendChild(colEl);

    const list = colEl.querySelector('.cards-list');

    if (cards.length === 0) {
      const dz = document.createElement('div');
      dz.className = 'drop-zone';
      dz.innerHTML = '<span class="drop-hint">Arraste aqui</span>';
      setupDrop(dz, col.id);
      list.appendChild(dz);
    } else {
      cards.forEach(card => {
        const isCarried = !!card.carriedFrom;
        const mAtual = getCardMin(card);
        const showH = !['fila','conc'].includes(card.col) && mAtual > 0;
        const dtFmt = card.dataEntrega ? new Date(card.dataEntrega + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '';
        const idxAtual = FLUXO.indexOf(card.col);
        const trackHTML = TRACK_COLS.filter(tc => cardUsaSetor(card, tc.id)).map(tc => {
          const idxTc = FLUXO.indexOf(tc.id);
          const passed = idxAtual > idxTc;
          const current = card.col === tc.id;
          const cls = passed ? 'passed' : current ? 'current' : '';
          return `<div class="track-sq ${cls}" style="background:${tc.color}" title="${tc.label}"><span style="color:#fff">${TRACK_LABEL[tc.id]}</span></div>`;
        }).join('');

        const el = document.createElement('div');
        el.className = 'card' + (isCarried ? ' carried' : '') + (card.urgente ? ' urgente' : '');
        el.draggable = true;
        el.dataset.id = card.id;
        el.innerHTML = `
          ${card.urgente ? '<div class="urgente-badge">🚨 Urgente</div>' : ''}
          ${isCarried ? '<div class="carried-tag">↗ Semana anterior</div>' : ''}
          <div class="card-os">${card.os}</div>
          <div class="card-cli">${card.cliente}</div>
          ${dtFmt ? `<div style="font-size:10px;font-weight:600;color:#64748b;margin-top:2px">📅 ${dtFmt}</div>` : ''}
          <div class="card-track">${trackHTML}</div>
          <div class="card-footer">
            <span class="card-h">⏱ ${showH ? minToTime(mAtual) : (card.min_total ? minToTime(card.min_total) : '—')}</span>
            <div class="card-btns">
              <button class="ib edit" onclick="editCard(${card.id})" title="Editar OS">✏</button>
              <button class="ib del" onclick="delCard(${card.id})" title="Remover OS">🗑</button>
            </div>
          </div>
        `;
        el.addEventListener('dragstart', () => { state.dragId = card.id; state.dragSourceCol = card.col; el.classList.add('dragging'); });
        el.addEventListener('dragend', () => {
          state.dragId = null; state.dragSourceCol = null;
          el.classList.remove('dragging');
          document.querySelectorAll('.drop-zone,.card').forEach(z => {
            z.classList.remove('over'); z.style.borderTop = ''; z.style.borderBottom = '';
          });
        });
        setupCardDrop(el, card.id, col.id);
        list.appendChild(el);
      });
      const dz = document.createElement('div');
      dz.className = 'drop-zone'; dz.style.marginTop = '6px';
      dz.innerHTML = '<span class="drop-hint">+ soltar aqui</span>';
      setupDrop(dz, col.id);
      list.appendChild(dz);
    }
    setupDrop(colEl, col.id);
  });
}

// ─── BARRA GERAR SEMANA ────────────────────────────
export async function renderGerarBar() {
  // Lógica infinita:
  // Mostra botão "Gerar semana X" sempre que a próxima ainda não foi gerada
  // e a semana atual é a semana do calendário OU já foi gerada (independente)
  const wrap = document.getElementById('gerar-semana-bar-wrap');
  if (!wrap) return;
  const next = nextWeekKey(state.currentWeek);
  const nextLbl = weekLabel(next).replace('Semana ', 'Sem. ');

  const nextSnap = await getDoc(docRef(next));
  const proximaJaGerada = nextSnap.exists() && nextSnap.data().gerada === true;

  // Próxima já é independente → sem botão (ela já tem o próprio botão para a seguinte)
  if (proximaJaGerada) { wrap.innerHTML = ''; setTimeout(atualizarBotoesNav, 50); return; }

  // Mostra botão se esta semana é a atual do calendário OU já foi gerada
  const hoje = weekKeyFromDate(new Date());
  const podeGerar = state.currentWeek === hoje || state.weekData.gerada === true;

  wrap.innerHTML = podeGerar
    ? `<button class="btn-gerar" onclick="gerarProximaSemana()" style="white-space:nowrap">📅 Gerar ${nextLbl}</button>`
    : '';
  setTimeout(atualizarBotoesNav, 50);
}

// ─── NAVEGAÇÃO — BOTÕES ────────────────────────────
export async function atualizarBotoesNav() {
  // Regra de navegação:
  // Passado (<=hoje): livre
  // Futuro: só pode avançar se a semana ATUAL for gerada (independente)
  //         Semana espelho (gerada:false) = fim da navegação, não pode ir além
  function aplicarBtn(id, pode) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !pode;
    btn.style.opacity = pode ? '1' : '0.35';
    btn.style.cursor = pode ? 'pointer' : 'not-allowed';
    btn.style.pointerEvents = pode ? 'auto' : 'none';
  }

  const hoje = weekKeyFromDate(new Date());

  // ── Quadro ──
  const destinoQ = nextWeekKey(state.currentWeek);
  let podeQ = false;
  if (destinoQ <= hoje) {
    podeQ = true; // passado: livre
  } else if (state.currentWeek === hoje) {
    podeQ = true; // da semana atual sempre pode ver o espelho seguinte
  } else if (state.weekData.gerada === true) {
    podeQ = true; // semana independente: pode ver o espelho da próxima
  }
  // Se gerada===false (espelho): NÃO pode avançar — é o limite
  aplicarBtn('btn-week-next', podeQ);

  // ── Desempenho (independente do Quadro) ──
  const destinoD = nextWeekKey(state.desempWeek);
  let podeD = false;
  if (destinoD <= hoje) {
    podeD = true;
  } else if (state.desempWeek === hoje) {
    podeD = true;
  } else {
    const snapD = await getDoc(docRef(state.desempWeek));
    if (snapD.exists() && snapD.data().gerada === true) podeD = true;
    // espelho (gerada:false): NÃO pode avançar
  }
  aplicarBtn('btn-desemp-next', podeD);
}

// ─── ABA DESEMPENHO ────────────────────────────────
export async function renderDesempenho() {
  document.getElementById('desemp-week-lbl').textContent = weekLabel(state.desempWeek);
  const snap = await getDoc(docRef(state.desempWeek));
  const data = snap.exists() ? snap.data() : {cards: [], caps: {}};
  const cards = data.cards || [], caps = data.caps || {};
  const SP = COLS.filter(c => !c.noCap);
  const conc = cards.filter(c => c.col === 'conc'), naof = cards.filter(c => c.col !== 'conc');
  let totR = 0, totC = 0;
  SP.forEach(col => {
    totC += parseInt(caps[col.id]) || 0;
    // Total realizado = soma de horas do setor para todas OS fora da fila de espera
    cards.forEach(card => {
      if (card.col !== 'fila')
        totR += (card.min_setor ? parseInt(card.min_setor[col.id]) || 0 : 0);
    });
  });
  const totO = totC > 0 ? Math.round(totR / totC * 100) : 0;
  document.getElementById('summary-bar').innerHTML = `
    <div class="summary-card"><div class="summary-icon" style="background:#EDE9FE">✅</div><div><div class="summary-val">${conc.length}</div><div class="summary-lbl">OS concluídas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#FEF3C7">⚙</div><div><div class="summary-val" style="color:${naof.length > 0 ? '#b45309' : '#15803d'}">${naof.length}</div><div class="summary-lbl">OS não finalizadas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#D1FAE5">⏱</div><div><div class="summary-val">${minToTime(totR)}</div><div class="summary-lbl">Horas realizadas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#DBEAFE">📈</div><div><div class="summary-val" style="color:${totO <= 69 ? '#dc2626' : totO <= 89 ? '#b45309' : totO <= 120 ? '#15803d' : '#dc2626'}">${totC ? totO + '%' : '—'}</div><div class="summary-lbl">Ocupação geral</div></div></div>`;
  const grid = document.getElementById('desemp-grid');
  if (!cards.length) { grid.innerHTML = '<div class="no-data" style="grid-column:1/-1"><div class="no-data-icon">📈</div>Nenhuma OS registrada nesta semana</div>'; return; }
  grid.innerHTML = SP.map(col => {
    const capMin = parseInt(caps[col.id]) || 0; let passM = 0;
    cards.forEach(card => {
      // Conta horas do setor para TODAS as OS exceto as que estão na fila de espera
      if (card.col !== 'fila')
        passM += (card.min_setor ? parseInt(card.min_setor[col.id]) || 0 : 0);
    });
    const pct = capMin > 0 ? Math.min(999, Math.round(passM / capMin * 100)) : 0;
    // 0-69%=vermelho, 70-89%=amarelo, 90-120%=verde, 121%+=vermelho
    const pc = !capMin ? 'gray' : pct <= 69 ? 'red' : pct <= 89 ? 'yellow' : pct <= 120 ? 'green' : 'red';
    const bc = !capMin ? '#E2E8F0' : pct <= 69 ? '#ef4444' : pct <= 89 ? '#f59e0b' : pct <= 120 ? '#22c55e' : '#ef4444';
    const osp = cards.filter(c => FLUXO.indexOf(c.col) > FLUXO.indexOf(col.id)).length;
    const osPend = cards.filter(c => FLUXO.indexOf(c.col) < FLUXO.indexOf(col.id) && c.col !== 'conc').length;
    return `<div class="desemp-card">
      <div class="desemp-header"><div class="desemp-dot" style="background:${col.color}"></div><span class="desemp-setor" style="color:${col.color}">${col.label}</span></div>
      <div class="desemp-label">Taxa de ocupação</div>
      <div class="desemp-metric-row"><div class="desemp-pct ${pc}">${capMin ? pct + '%' : '—'}</div></div>
      <div class="desemp-bar-bg"><div class="desemp-bar-fill" style="width:${Math.min(100, pct)}%;background:${bc}"></div></div>
      <div class="desemp-hours">
        <div class="desemp-h-item"><div class="desemp-h-val">${minToTime(passM)}</div><div class="desemp-h-lbl">Realizado</div></div>
        <div class="desemp-divider"></div>
        <div class="desemp-h-item"><div class="desemp-h-val">${capMin ? minToTime(capMin) : '—'}</div><div class="desemp-h-lbl">Capacidade</div></div>
      </div>
      <div class="desemp-stats">
        <div class="desemp-stat"><div class="desemp-stat-val">${osp}</div><div class="desemp-stat-lbl">OS processadas</div></div>
        <div class="desemp-stat ${osPend > 0 ? 'warn' : ''}"><div class="desemp-stat-val">${osPend}</div><div class="desemp-stat-lbl">OS pendentes</div></div>
      </div>
    </div>`;
  }).join('');
}

// ─── IMPRESSÃO ─────────────────────────────────────
window.printBoard = function() {
  const wl = weekLabel(state.currentWeek);
  let html = `<html><head><meta charset="utf-8"><title>Quadro — ${wl}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',Arial,sans-serif}body{padding:24px;color:#1a1a2e}.page{page-break-after:always}.page:last-child{page-break-after:avoid}.ph{margin-bottom:16px;border-bottom:3px solid currentColor;padding-bottom:10px}.pt{font-size:22px;font-weight:800}.ps{font-size:13px;color:#64748b;margin-top:3px}.ci{margin-top:8px;font-size:13px;font-weight:600}.ok{color:#15803d}.over{color:#dc2626}.warn{color:#b45309}.cards{margin-top:12px;display:flex;flex-direction:column;gap:10px}.card{border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px}.card.urg{border-left:4px solid #dc2626;background:#FFF5F5}.cos{font-size:15px;font-weight:800}.ccl{font-size:13px;color:#64748b;margin-top:3px}.ch{font-size:12px;color:#94a3b8;margin-top:6px;font-weight:700}.ct{font-size:10px;color:#7C3AED;font-weight:700;margin-bottom:4px}.empty{font-size:13px;color:#94a3b8;margin-top:10px}.extra{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:#FEE2E2;color:#dc2626;margin-top:6px}</style></head><body>`;
  PRINT_COLS.forEach(col => {
    const cards = sortCards(state.weekData.cards.filter(c => c.col === col.id));
    const capMin = getCapMin(col.id), usedMin = getUsedMin(col.id);
    const saldoMin = capMin ? capMin - usedMin : null;
    const isOv = saldoMin !== null && saldoMin < 0, isWa = saldoMin !== null && saldoMin >= 0 && capMin && saldoMin < capMin * 0.2;
    let capLine = '';
    if (capMin) {
      const cls = isOv ? 'over' : isWa ? 'warn' : 'ok';
      const txt = isOv ? `Necessita de hora extra: −${minToTime(Math.abs(saldoMin))}` : saldoMin === 0 ? '00:00 livre' : `+${minToTime(saldoMin)} livre`;
      capLine = `<div class="ci">Capacidade: ${minToTime(capMin)} | Em uso: ${minToTime(usedMin)} | <span class="${cls}">${txt}</span></div>`;
      if (isOv) capLine += `<div style="margin-top:6px"><span class="extra">⚠ Necessita de hora extra</span></div>`;
    } else capLine = `<div class="ci" style="color:#94a3b8">Capacidade não informada — ${minToTime(usedMin)} em uso</div>`;
    const cardsHtml = cards.length === 0 ? '<div class="empty">Nenhuma OS neste setor</div>' : cards.map(c => {
      const dtF = c.dataEntrega ? new Date(c.dataEntrega + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '';
      return `<div class="card${c.urgente ? ' urg' : ''}">${c.urgente ? '<div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:4px">🚨 URGENTE</div>' : ''}${c.carriedFrom ? '<div class="ct">↗ Semana anterior</div>' : ''}<div class="cos">${c.os}</div><div class="ccl">${c.cliente}</div>${dtF ? `<div style="font-size:11px;color:#64748b;margin-top:2px">📅 Entrega: ${dtF}</div>` : ''}<div class="ch">⏱ ${minToTime(getCardMin(c))} neste setor</div></div>`;
    }).join('');
    html += `<div class="page"><div class="ph" style="color:${col.color}"><div class="pt">${col.label}</div><div class="ps" style="color:#64748b">Controle de Produção — Metalrail — ${wl}</div>${capLine}</div><div class="cards">${cardsHtml}</div></div>`;
  });
  html += '</body></html>';
  const win = window.open('', '_blank');
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 500);
};
