// ─── CONSTANTES ───────────────────────────────────
export const COLS = [
  {id:'fila', label:'Fila de espera', color:'#475569', cls:'col-fila', noCap:true},
  {id:'laser',label:'Laser',          color:'#6D28D9', cls:'col-laser'},
  {id:'dobra',label:'Dobra',          color:'#1d4ed8', cls:'col-dobra'},
  {id:'solda',label:'Solda',          color:'#be123c', cls:'col-solda'},
  {id:'acab', label:'Acabamento',     color:'#b45309', cls:'col-acab'},
  {id:'terc', label:'Terceiros',      color:'#7c3aed', cls:'col-terc', noCap:true, noTime:true},
  {id:'insp', label:'Inspeção',       color:'#15803d', cls:'col-insp'},
  {id:'exped',label:'Expedição',      color:'#0369a1', cls:'col-exped'},
  {id:'conc', label:'Concluídos',     color:'#166534', cls:'col-conc', noCap:true},
];
export const FLUXO = ['fila','laser','dobra','solda','acab','terc','insp','exped','conc'];
export const SETOR_IDS = ['laser','dobra','solda','acab','insp','exped'];

// Um card só "usa" um setor (pode entrar nele / mostra o quadradinho) se tiver
// horas estimadas > 0 para ele. Setores sem horas (terc) e não-setores
// (fila/conc) estão sempre liberados — não exigem tempo estimado.
export function cardUsaSetor(card, setorId) {
  if (!SETOR_IDS.includes(setorId)) return true;
  const min = card && card.min_setor ? parseInt(card.min_setor[setorId]) || 0 : 0;
  return min > 0;
}
export const TRACK_COLS = COLS.filter(c => c.id !== 'fila' && c.id !== 'conc');
export const TRACK_LABEL = {laser:'LA',dobra:'DO',solda:'SO',acab:'AC',terc:'TE',insp:'IN',exped:'EX'};
export const PRINT_COLS = COLS.filter(c => !c.noCap);

// ─── UTILS TEMPO ──────────────────────────────────
export function timeToMin(str) {
  if (!str || !str.includes(':')) return 0;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function minToTime(min) {
  if (!min || min <= 0) return '00:00';
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
window.fmtTime = function(input) {
  let v = input.value.replace(/[^0-9]/g, '');
  if (v.length > 5) v = v.slice(0, 5);
  if (v.length >= 3) {
    const h = parseInt(v.slice(0, v.length - 2)) || 0;
    const m = v.slice(-2);
    input.value = h + ':' + m;
  } else if (v.length === 2) {
    input.value = '0:' + v;
  } else {
    input.value = v;
  }
};
window.fmtCap = function(input) {
  let v = input.value.replace(/[^0-9]/g, '');
  if (v.length > 5) v = v.slice(0, 5);
  if (v.length >= 3) {
    const h = parseInt(v.slice(0, v.length - 2)) || 0;
    const m = v.slice(-2);
    input.value = h + ':' + m;
  } else if (v.length === 2) {
    input.value = '0:' + v;
  } else {
    input.value = v;
  }
};

// ─── UTILS SEMANA ──────────────────────────────────
export function weekKeyFromDate(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}
export function weekLabel(key) {
  const [yr, wn] = key.split('-W');
  const jan1 = new Date(Number(yr), 0, 1);
  const mon = new Date(jan1);
  mon.setDate(jan1.getDate() + (Number(wn) - 1) * 7 - (jan1.getDay() || 7) + 1);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = x => x.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
  return `Semana ${parseInt(wn)} — ${fmt(mon)} a ${fmt(fri)}`;
}
export function nextWeekKey(key) {
  const [yr, wn] = key.split('-W');
  const d = new Date(Number(yr), 0, 1 + (Number(wn) - 1) * 7);
  d.setDate(d.getDate() + 7);
  return weekKeyFromDate(d);
}
export function prevWeekKey(key) {
  const [yr, wn] = key.split('-W');
  const d = new Date(Number(yr), 0, 1 + (Number(wn) - 1) * 7);
  d.setDate(d.getDate() - 7);
  return weekKeyFromDate(d);
}
