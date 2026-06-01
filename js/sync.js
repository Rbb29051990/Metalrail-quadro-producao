import { db, docRef, getDoc, setDoc, onSnapshot } from './firebase.js';
import { state } from './state.js';
import { nextWeekKey, prevWeekKey, weekKeyFromDate } from './utils.js';

// Injeção de dependência para evitar ciclo sync ↔ render
let _render, _renderGerarBar, _atualizarBotoesNav;
export function initSync(fns) {
  _render = fns.render;
  _renderGerarBar = fns.renderGerarBar;
  _atualizarBotoesNav = fns.atualizarBotoesNav;
}

// ─── SYNC STATUS ───────────────────────────────────
export function setSyncStatus(s) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-txt');
  if (s === 'ok')          { dot.className = 'sync-dot ok';     txt.textContent = 'Sincronizado'; }
  else if (s === 'saving') { dot.className = 'sync-dot saving'; txt.textContent = 'Salvando...'; }
  else if (s === 'err')    { dot.className = 'sync-dot err';    txt.textContent = 'Erro de conexão'; }
  else                     { dot.className = 'sync-dot';        txt.textContent = 'Conectando...'; }
}

// ─── SAVE ──────────────────────────────────────────
export async function saveWeek(propagate = true) {
  if (state.isSaving) return;
  state.isSaving = true;
  setSyncStatus('saving');
  try {
    await setDoc(docRef(state.currentWeek), state.weekData);
    setSyncStatus('ok');
    if (propagate) await syncToNext();
  } catch (e) { setSyncStatus('err'); }
  state.isSaving = false;
}

// ─── SYNC PARA PRÓXIMA ─────────────────────────────
// Regra: SEMPRE sincroniza cartões não-concluídos da semana atual para a próxima
// Se a próxima já foi gerada (independente), apenas adiciona OS novas que ainda não existem lá
// e remove OS que foram concluídas aqui. NÃO move cartões já existentes na próxima.
export async function syncToNext() {
  // Regra: só atualiza a semana seguinte SE ela já existe no Firestore
  // NUNCA cria semanas novas aqui — criação é responsabilidade do syncFromPrev (ao navegar)
  const next = nextWeekKey(state.currentWeek);
  const nextSnap = await getDoc(docRef(next));
  if (!nextSnap.exists()) return;

  const nextData = nextSnap.data();
  const pendentes = state.weekData.cards.filter(c => c.col !== 'conc');
  const concluidosOS = new Set(state.weekData.cards.filter(c => c.col === 'conc').map(c => c.os));

  if (!nextData.gerada) {
    // Semana seguinte é espelho: atualiza preservando posições (col) já movidas
    const osNextMap = {};
    nextData.cards.forEach(c => { osNextMap[c.os] = c; });
    await setDoc(docRef(next), {
      cards: pendentes.map((c, i) => {
        const ex = osNextMap[c.os];
        return {...JSON.parse(JSON.stringify(c)), id: i + 1, col: ex ? ex.col : c.col, carriedFrom: state.currentWeek};
      }),
      caps: nextData.caps || {},
      nextId: pendentes.length + 1,
      gerada: false,
      parentWeek: state.currentWeek
    });
    return;
  }

  // Semana seguinte independente: só adiciona novas e remove concluídas
  let modified = false;
  const antes = nextData.cards.length;
  nextData.cards = nextData.cards.filter(c => !(c.carriedFrom === state.currentWeek && concluidosOS.has(c.os)));
  if (nextData.cards.length < antes) modified = true;
  const osNaProxima = new Set(nextData.cards.map(c => c.os));
  pendentes.forEach(c => {
    if (!osNaProxima.has(c.os)) {
      const cp = JSON.parse(JSON.stringify(c));
      cp.id = nextData.nextId++; cp.carriedFrom = state.currentWeek; delete cp.ordem;
      nextData.cards.push(cp); modified = true;
    }
  });
  if (modified) await setDoc(docRef(next), nextData);
}

// ─── GERAR PRÓXIMA SEMANA ──────────────────────────
window.gerarProximaSemana = async function() {
  if (!confirm('Confirma? As semanas se tornam independentes.')) return;
  const next = nextWeekKey(state.currentWeek);
  const nextSnap = await getDoc(docRef(next));
  const nextData = nextSnap.exists() ? nextSnap.data() : {cards: [], caps: {}, nextId: 1, gerada: false};

  const pendentes = state.weekData.cards.filter(c => c.col !== 'conc');
  const diretos = nextData.cards.filter(c => c.carriedFrom !== state.currentWeek);
  const osDirectas = new Set(diretos.map(c => c.os));
  const pendentesNovos = pendentes.filter(c => !osDirectas.has(c.os));

  let nid = 1;
  const cardsMesclados = [
    ...diretos.map(c => ({...JSON.parse(JSON.stringify(c)), id: nid++})),
    ...pendentesNovos.map(c => ({...JSON.parse(JSON.stringify(c)), id: nid++, carriedFrom: state.currentWeek}))
  ];

  // 1. Salva a semana seguinte como INDEPENDENTE (gerada:true)
  await setDoc(docRef(next), {
    cards: cardsMesclados,
    caps: nextData.caps || {},
    nextId: nid,
    gerada: true,
    parentWeek: state.currentWeek
  });

  // 2. Cria imediatamente o espelho da semana seguinte+1 (lógica infinita)
  const next2 = nextWeekKey(next);
  const next2Snap = await getDoc(docRef(next2));
  if (!next2Snap.exists()) {
    const pendentesNext = cardsMesclados.filter(c => c.col !== 'conc');
    await setDoc(docRef(next2), {
      cards: pendentesNext.map((c, i) => ({...JSON.parse(JSON.stringify(c)), id: i + 1, carriedFrom: next})),
      caps: {},
      nextId: pendentesNext.length + 1,
      gerada: false,
      parentWeek: next
    });
  }

  // 3. Marca a semana atual como gerada e salva
  state.weekData.gerada = true;
  state.isSaving = false;
  await saveWeek(false);
  _renderGerarBar();
  _atualizarBotoesNav();
};

// ─── LOAD WEEK ─────────────────────────────────────
// syncFromPrev: sincroniza a semana atual a partir da semana anterior (sua mãe).
// Só age se a semana atual declarar parentWeek === semana anterior.
// Se a semana NÃO foi gerada (espelho), preserva cards adicionados diretamente
// nela (sem carriedFrom) e apenas atualiza os cards espelhados.
export async function syncFromPrev(week) {
  const prev = prevWeekKey(week);
  const currSnap = await getDoc(docRef(week));
  const currData = currSnap.exists() ? currSnap.data() : null;

  // Se a semana nao existe ainda, cria como espelho da anterior (primeira navegacao)
  if (!currData) {
    const prevSnap2 = await getDoc(docRef(prev));
    if (!prevSnap2.exists()) return;
    const prevData2 = prevSnap2.data();
    // Mesmo que a mae seja independente (gerada:true), cria espelho da proxima ao navegar
    const pendentes2 = prevData2.cards.filter(c => c.col !== 'conc');
    await setDoc(docRef(week), {
      cards: pendentes2.map((c, i) => ({...JSON.parse(JSON.stringify(c)), id: i + 1, carriedFrom: prev})),
      caps: {},
      nextId: pendentes2.length + 1,
      gerada: false,
      parentWeek: prev
    });
    return;
  }

  // Se existe mas parentWeek nao aponta para a semana anterior, nao mexe
  if (currData.parentWeek !== prev) return;

  const prevSnap = await getDoc(docRef(prev));
  if (!prevSnap.exists()) return;
  const prevData = prevSnap.data();
  const caps = currData.caps || {};

  // OS concluídas na semana mãe
  const conclOS = new Set(prevData.cards.filter(c => c.col === 'conc').map(c => c.os));
  // Pendentes da semana mãe
  const pendentes = prevData.cards.filter(c => c.col !== 'conc');

  if (currData.gerada) {
    // Semana independente: só adiciona novas OS e remove as que foram concluídas na mãe
    let modified = false;
    const antes = currData.cards.length;
    currData.cards = currData.cards.filter(c => {
      if (c.carriedFrom === prev && conclOS.has(c.os)) return false;
      return true;
    });
    if (currData.cards.length < antes) modified = true;
    const osNaAtual = new Set(currData.cards.map(c => c.os));
    pendentes.forEach(card => {
      if (!osNaAtual.has(card.os)) {
        const copia = JSON.parse(JSON.stringify(card));
        copia.id = currData.nextId++;
        copia.carriedFrom = prev;
        delete copia.ordem;
        currData.cards.push(copia);
        modified = true;
      }
    });
    if (modified) await setDoc(docRef(week), currData);
    return;
  }

  // Semana NAO gerada (espelho):
  // Cards adicionados diretamente nesta semana (sem carriedFrom da mae)
  const cardsDirectos = currData.cards.filter(c => !c.carriedFrom || c.carriedFrom !== prev);
  // Mapa de OS ja existentes na filha (espelhados) para preservar col movida
  const osFilhaMap = {};
  currData.cards.filter(c => c.carriedFrom === prev).forEach(c => { osFilhaMap[c.os] = c; });
  const osDirectas = new Set(cardsDirectos.map(c => c.os));

  // Para cada pendente da mae: preserva col se ja foi movido na filha
  const espelhadosFiltrados = pendentes
    .filter(c => !osDirectas.has(c.os))
    .map(card => {
      const jaExiste = osFilhaMap[card.os];
      if (jaExiste) {
        return {...JSON.parse(JSON.stringify(card)), col: jaExiste.col, carriedFrom: prev};
      }
      return {...JSON.parse(JSON.stringify(card)), carriedFrom: prev};
    });

  // Remonta cards: diretos preservados + espelhados com posicao respeitada
  let nextId = 1;
  const cardsMesclados = [
    ...cardsDirectos.map(c => ({...c, id: nextId++})),
    ...espelhadosFiltrados.map(c => ({...c, id: nextId++}))
  ];

  await setDoc(docRef(week), {cards: cardsMesclados, caps, nextId, gerada: false, parentWeek: prev});
}

export async function loadWeek(week) {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('board').style.display = 'none';
  if (state.unsubscribeCurrent) state.unsubscribeCurrent();
  if (state.unsubscribeNext) state.unsubscribeNext();

  // Sincroniza a partir da semana anterior ANTES de carregar
  await syncFromPrev(week);

  state.unsubscribeCurrent = onSnapshot(docRef(week), (snap) => {
    state.weekData = snap.exists() ? snap.data() : {cards: [], caps: {}, nextId: 1, gerada: false};
    if (!state.weekData.gerada) state.weekData.gerada = false;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('board').style.display = 'grid';
    setSyncStatus('ok');
    _renderGerarBar();
    _render();
    _atualizarBotoesNav();
    // BUG 2 FIX: syncToNext só roda se esta semana é a MÃE da próxima.
    // Verifica se a semana seguinte tem parentWeek apontando para a atual,
    // ou se ainda não existe (será criada pelo espelho).
    // NUNCA roda quando estamos visualizando uma semana filha/espelho.
    if (!state.weekData.gerada && !state.isSaving) {
      const next = nextWeekKey(week);
      getDoc(docRef(next)).then(nextSnap => {
        // Só atualiza se a proxima JA EXISTE e tem parentWeek apontando para esta semana
        // NUNCA cria semana nova aqui — evita propagacao em cascata (22→23→24)
        if (nextSnap.exists() && nextSnap.data().parentWeek === week) {
          syncToNext();
        }
      });
    }
  }, () => setSyncStatus('err'));
}
