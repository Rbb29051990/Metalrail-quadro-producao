import { state } from './state.js';
import { minToTime } from './utils.js';

export function getCardMin(card) {
  const col = card.col;
  if (card.min_setor && card.min_setor[col] !== undefined) return parseInt(card.min_setor[col]) || 0;
  if (card.horas_setor && card.horas_setor[col]) return Math.round((parseFloat(card.horas_setor[col]) || 0) * 60);
  return Math.round((parseFloat(card.horas) || 0) * 60);
}
export function getCapMin(col) { return parseInt(state.weekData.caps[col]) || 0; }
export function getUsedMin(col) {
  // Conta horas do setor para TODOS os cards exceto os na fila de espera
  return state.weekData.cards
    .filter(c => c.col !== 'fila')
    .reduce((a, card) => {
      const min = card.min_setor ? parseInt(card.min_setor[col]) || 0 : 0;
      return a + min;
    }, 0);
}
export function getSaldoMin(col) {
  const cap = getCapMin(col);
  if (!cap) return null;
  return cap - getUsedMin(col);
}
export function saldoClass(col) {
  const cap = getCapMin(col); if (!cap) return 'neu';
  const s = getSaldoMin(col);
  if (s === null) return 'neu';
  if (s < 0) return 'over';   // negativo = vermelho
  return 'ok';                 // positivo ou zero = verde
}
export function saldoText(col) {
  const s = getSaldoMin(col); const used = getUsedMin(col);
  if (s === null) return used ? `${minToTime(used)} em uso` : '—';
  if (s < 0) return `−${minToTime(Math.abs(s))} (extra)`;
  if (s === 0) return '00:00 livre';
  return `+${minToTime(s)} livre`;
}
export function capPct(col) {
  const cap = getCapMin(col);
  if (!cap) return 0;
  return Math.min(110, Math.round(getUsedMin(col) / cap * 100));
}
export function capColor(col) {
  const cap = getCapMin(col); if (!cap) return '#CBD5E1';
  const s = getSaldoMin(col);
  if (s === null) return '#CBD5E1';
  if (s < 0) return '#ef4444';   // extra = vermelho
  return '#22c55e';               // livre = verde
}
