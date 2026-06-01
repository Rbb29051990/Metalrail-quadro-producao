import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqL12msSsUnbDkcIuD0o2nHdmsEUTXtH8",
  authDomain: "quadro-producao.firebaseapp.com",
  projectId: "quadro-producao",
  storageBucket: "quadro-producao.firebasestorage.app",
  messagingSenderId: "583907452710",
  appId: "1:583907452710:web:1c1a5ca92b196e93eec3e7",
  measurementId: "G-NRF3L8ZRS4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ─── UTILS TEMPO ──────────────────────────────────
function timeToMin(str){
  if(!str||!str.includes(':'))return 0;
  const [h,m]=str.split(':').map(Number);
  return (h||0)*60+(m||0);
}
function minToTime(min){
  if(!min||min<=0)return '00:00';
  const h=Math.floor(min/60),m=min%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
window.fmtTime=function(input){
  let v=input.value.replace(/[^0-9]/g,'');
  if(v.length>5)v=v.slice(0,5);
  if(v.length>=3){
    const h=parseInt(v.slice(0,v.length-2))||0;
    const m=v.slice(-2);
    input.value=h+':'+m;
  } else if(v.length===2){
    input.value='0:'+v;
  } else {
    input.value=v;
  }
};
window.fmtCap=function(input){
  let v=input.value.replace(/[^0-9]/g,'');
  if(v.length>5)v=v.slice(0,5);
  if(v.length>=3){
    const h=parseInt(v.slice(0,v.length-2))||0;
    const m=v.slice(-2);
    input.value=h+':'+m;
  } else if(v.length===2){
    input.value='0:'+v;
  } else {
    input.value=v;
  }
};

// ─── CONSTANTES ───────────────────────────────────
const COLS=[
  {id:'fila', label:'Fila de espera',color:'#475569',cls:'col-fila', noCap:true},
  {id:'laser',label:'Laser',         color:'#6D28D9',cls:'col-laser'},
  {id:'dobra',label:'Dobra',         color:'#1d4ed8',cls:'col-dobra'},
  {id:'solda',label:'Solda',         color:'#be123c',cls:'col-solda'},
  {id:'acab', label:'Acabamento',    color:'#b45309',cls:'col-acab'},
  {id:'terc', label:'Terceiros',     color:'#7c3aed',cls:'col-terc', noCap:true,noTime:true},
  {id:'insp', label:'Inspeção',      color:'#15803d',cls:'col-insp'},
  {id:'exped',label:'Expedição',     color:'#0369a1',cls:'col-exped'},
  {id:'conc', label:'Concluídos',    color:'#166534',cls:'col-conc', noCap:true},
];
const FLUXO=['fila','laser','dobra','solda','acab','terc','insp','exped','conc'];
const SETOR_IDS=['laser','dobra','solda','acab','insp','exped'];
const TRACK_COLS=COLS.filter(c=>c.id!=='fila'&&c.id!=='conc');
const TRACK_LABEL={laser:'LA',dobra:'DO',solda:'SO',acab:'AC',terc:'TE',insp:'IN',exped:'EX'};
const PRINT_COLS=COLS.filter(c=>!c.noCap);

// ─── SEMANA ────────────────────────────────────────
function weekKeyFromDate(d){
  const jan1=new Date(d.getFullYear(),0,1);
  const wk=Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);
  return `${d.getFullYear()}-W${String(wk).padStart(2,'0')}`;
}
function weekLabel(key){
  const [yr,wn]=key.split('-W');
  const jan1=new Date(Number(yr),0,1);
  const mon=new Date(jan1);
  mon.setDate(jan1.getDate()+(Number(wn)-1)*7-(jan1.getDay()||7)+1);
  const fri=new Date(mon);fri.setDate(mon.getDate()+4);
  const fmt=x=>x.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  return `Semana ${parseInt(wn)} — ${fmt(mon)} a ${fmt(fri)}`;
}
function nextWeekKey(key){
  const [yr,wn]=key.split('-W');
  const d=new Date(Number(yr),0,1+(Number(wn)-1)*7);
  d.setDate(d.getDate()+7);
  return weekKeyFromDate(d);
}
function prevWeekKey(key){
  const [yr,wn]=key.split('-W');
  const d=new Date(Number(yr),0,1+(Number(wn)-1)*7);
  d.setDate(d.getDate()-7);
  return weekKeyFromDate(d);
}

// ─── ESTADO ────────────────────────────────────────
let currentWeek=weekKeyFromDate(new Date());
let weekData={cards:[],caps:{},nextId:1,gerada:false};
let unsubscribeCurrent=null;
let unsubscribeNext=null;
let dragId=null;
let dragSourceCol=null;
let editingId=null;
let isUrgente=false;
let isSaving=false;

// Semana limite de navegação:
// - Se semana atual NÃO foi gerada → limite = próxima semana (atual + 1)
// - Se semana atual FOI gerada → limite = próxima semana (atual + 1)
// O usuário sempre pode ir até currentWeek + 1, nunca além
function getSemanaLimite(){
  return nextWeekKey(currentWeek);
}

async function atualizarBotoesNav(){
  // Regra de navegação:
  // Passado (<=hoje): livre
  // Futuro: só pode avançar se a semana ATUAL for gerada (independente)
  //         Semana espelho (gerada:false) = fim da navegação, não pode ir além

  function aplicarBtn(id,pode){
    const btn=document.getElementById(id);
    if(!btn)return;
    btn.disabled=!pode;
    btn.style.opacity=pode?'1':'0.35';
    btn.style.cursor=pode?'pointer':'not-allowed';
    btn.style.pointerEvents=pode?'auto':'none';
  }

  const hoje=weekKeyFromDate(new Date());

  // ── Quadro ──
  const destinoQ=nextWeekKey(currentWeek);
  let podeQ=false;
  if(destinoQ<=hoje){
    podeQ=true; // passado: livre
  } else if(currentWeek===hoje){
    podeQ=true; // da semana atual sempre pode ver o espelho seguinte
  } else if(weekData.gerada===true){
    podeQ=true; // semana independente: pode ver o espelho da próxima
  }
  // Se gerada===false (espelho): NÃO pode avançar — é o limite
  aplicarBtn('btn-week-next',podeQ);

  // ── Desempenho (independente do Quadro) ──
  const destinoD=nextWeekKey(desempWeek);
  let podeD=false;
  if(destinoD<=hoje){
    podeD=true;
  } else if(desempWeek===hoje){
    podeD=true;
  } else {
    const snapD=await getDoc(docRef(desempWeek));
    if(snapD.exists()&&snapD.data().gerada===true) podeD=true;
    // espelho (gerada:false): NÃO pode avançar
  }
  aplicarBtn('btn-desemp-next',podeD);
}

// ─── SYNC STATUS ───────────────────────────────────
function setSyncStatus(s){
  const dot=document.getElementById('sync-dot');
  const txt=document.getElementById('sync-txt');
  if(s==='ok'){dot.className='sync-dot ok';txt.textContent='Sincronizado';}
  else if(s==='saving'){dot.className='sync-dot saving';txt.textContent='Salvando...';}
  else if(s==='err'){dot.className='sync-dot err';txt.textContent='Erro de conexão';}
  else{dot.className='sync-dot';txt.textContent='Conectando...';}
}
function docRef(w){return doc(db,'semanas',w);}

// ─── SAVE ──────────────────────────────────────────
async function saveWeek(propagate=true){
  if(isSaving)return;
  isSaving=true;
  setSyncStatus('saving');
  try{
    await setDoc(docRef(currentWeek),weekData);
    setSyncStatus('ok');
    if(propagate) await syncToNext();
  }catch(e){setSyncStatus('err');}
  isSaving=false;
}

// ─── SYNC PARA PRÓXIMA ─────────────────────────────
// Regra: SEMPRE sincroniza cartões não-concluídos da semana atual para a próxima
// Se a próxima já foi gerada (independente), apenas adiciona OS novas que ainda não existem lá
// e remove OS que foram concluídas aqui. NÃO move cartões já existentes na próxima.
async function syncToNext(){
  // Regra: só atualiza a semana seguinte SE ela já existe no Firestore
  // NUNCA cria semanas novas aqui — criação é responsabilidade do syncFromPrev (ao navegar)
  const next=nextWeekKey(currentWeek);
  const nextSnap=await getDoc(docRef(next));
  if(!nextSnap.exists()) return;

  const nextData=nextSnap.data();
  const pendentes=weekData.cards.filter(c=>c.col!=='conc');
  const concluidosOS=new Set(weekData.cards.filter(c=>c.col==='conc').map(c=>c.os));

  if(!nextData.gerada){
    // Semana seguinte é espelho: atualiza preservando posições (col) já movidas
    const osNextMap={};
    nextData.cards.forEach(c=>{osNextMap[c.os]=c;});
    await setDoc(docRef(next),{
      cards:pendentes.map((c,i)=>{
        const ex=osNextMap[c.os];
        return {...JSON.parse(JSON.stringify(c)),id:i+1,col:ex?ex.col:c.col,carriedFrom:currentWeek};
      }),
      caps:nextData.caps||{},
      nextId:pendentes.length+1,
      gerada:false,
      parentWeek:currentWeek
    });
    return;
  }

  // Semana seguinte independente: só adiciona novas e remove concluídas
  let modified=false;
  const antes=nextData.cards.length;
  nextData.cards=nextData.cards.filter(c=>!(c.carriedFrom===currentWeek&&concluidosOS.has(c.os)));
  if(nextData.cards.length<antes) modified=true;
  const osNaProxima=new Set(nextData.cards.map(c=>c.os));
  pendentes.forEach(c=>{
    if(!osNaProxima.has(c.os)){
      const cp=JSON.parse(JSON.stringify(c));
      cp.id=nextData.nextId++;cp.carriedFrom=currentWeek;delete cp.ordem;
      nextData.cards.push(cp);modified=true;
    }
  });
  if(modified) await setDoc(docRef(next),nextData);
}

// ─── GERAR PRÓXIMA SEMANA ──────────────────────────
window.gerarProximaSemana=async function(){
  if(!confirm('Confirma? As semanas se tornam independentes.')) return;
  const next=nextWeekKey(currentWeek);
  const nextSnap=await getDoc(docRef(next));
  const nextData=nextSnap.exists()?nextSnap.data():{cards:[],caps:{},nextId:1,gerada:false};

  // Pendentes da semana atual
  const pendentes=weekData.cards.filter(c=>c.col!=='conc');
  // Cards adicionados diretamente na próxima (não espelhados da atual)
  const diretos=nextData.cards.filter(c=>c.carriedFrom!==currentWeek);
  const osDirectas=new Set(diretos.map(c=>c.os));
  // Pendentes da atual que ainda não estão diretos na próxima
  const pendentesNovos=pendentes.filter(c=>!osDirectas.has(c.os));

  let nid=1;
  const cardsMesclados=[
    ...diretos.map(c=>({...JSON.parse(JSON.stringify(c)),id:nid++})),
    ...pendentesNovos.map(c=>({...JSON.parse(JSON.stringify(c)),id:nid++,carriedFrom:currentWeek}))
  ];

  // 1. Salva a semana seguinte como INDEPENDENTE (gerada:true)
  await setDoc(docRef(next),{
    cards:cardsMesclados,
    caps:nextData.caps||{},
    nextId:nid,
    gerada:true,
    parentWeek:currentWeek
  });

  // 2. Cria imediatamente o espelho da semana seguinte+1 (lógica infinita)
  const next2=nextWeekKey(next);
  const next2Snap=await getDoc(docRef(next2));
  if(!next2Snap.exists()){
    const pendentesNext=cardsMesclados.filter(c=>c.col!=='conc');
    await setDoc(docRef(next2),{
      cards:pendentesNext.map((c,i)=>({...JSON.parse(JSON.stringify(c)),id:i+1,carriedFrom:next})),
      caps:{},
      nextId:pendentesNext.length+1,
      gerada:false,
      parentWeek:next
    });
  }

  // 3. Marca a semana atual como gerada e salva
  weekData.gerada=true;
  isSaving=false;
  await saveWeek(false);
  renderGerarBar();
  atualizarBotoesNav();
};

// ─── LOAD WEEK ─────────────────────────────────────
// syncFromPrev: sincroniza a semana atual a partir da semana anterior (sua mãe).
// Só age se a semana atual declarar parentWeek === semana anterior.
// Se a semana NÃO foi gerada (espelho), preserva cards adicionados diretamente
// nela (sem carriedFrom) e apenas atualiza os cards espelhados.
async function syncFromPrev(week){
  const prev=prevWeekKey(week);
  const currSnap=await getDoc(docRef(week));
  const currData=currSnap.exists()?currSnap.data():null;

  // Se a semana nao existe ainda, cria como espelho da anterior (primeira navegacao)
  if(!currData){
    const prevSnap2=await getDoc(docRef(prev));
    if(!prevSnap2.exists()) return;
    const prevData2=prevSnap2.data();
    // Mesmo que a mae seja independente (gerada:true), cria espelho da proxima ao navegar
    const pendentes2=prevData2.cards.filter(c=>c.col!=='conc');
    await setDoc(docRef(week),{
      cards:pendentes2.map((c,i)=>({...JSON.parse(JSON.stringify(c)),id:i+1,carriedFrom:prev})),
      caps:{},
      nextId:pendentes2.length+1,
      gerada:false,
      parentWeek:prev
    });
    return;
  }

  // Se existe mas parentWeek nao aponta para a semana anterior, nao mexe
  if(currData.parentWeek!==prev) return;

  const prevSnap=await getDoc(docRef(prev));
  if(!prevSnap.exists()) return;
  const prevData=prevSnap.data();
  const caps=currData.caps||{};

  // OS concluídas na semana mãe
  const conclOS=new Set(prevData.cards.filter(c=>c.col==='conc').map(c=>c.os));
  // Pendentes da semana mãe
  const pendentes=prevData.cards.filter(c=>c.col!=='conc');

  if(currData.gerada){
    // Semana independente: só adiciona novas OS e remove as que foram concluídas na mãe
    let modified=false;
    const antes=currData.cards.length;
    currData.cards=currData.cards.filter(c=>{
      if(c.carriedFrom===prev&&conclOS.has(c.os))return false;
      return true;
    });
    if(currData.cards.length<antes) modified=true;
    const osNaAtual=new Set(currData.cards.map(c=>c.os));
    pendentes.forEach(card=>{
      if(!osNaAtual.has(card.os)){
        const copia=JSON.parse(JSON.stringify(card));
        copia.id=currData.nextId++;
        copia.carriedFrom=prev;
        delete copia.ordem;
        currData.cards.push(copia);
        modified=true;
      }
    });
    if(modified) await setDoc(docRef(week),currData);
    return;
  }

  // Semana NAO gerada (espelho):
  // Cards adicionados diretamente nesta semana (sem carriedFrom da mae)
  const cardsDirectos=currData.cards.filter(c=>!c.carriedFrom||c.carriedFrom!==prev);
  // Mapa de OS ja existentes na filha (espelhados) para preservar col movida
  const osFilhaMap={};
  currData.cards.filter(c=>c.carriedFrom===prev).forEach(c=>{osFilhaMap[c.os]=c;});
  const osDirectas=new Set(cardsDirectos.map(c=>c.os));

  // Para cada pendente da mae: preserva col se ja foi movido na filha
  const espelhadosFiltrados=pendentes
    .filter(c=>!osDirectas.has(c.os))
    .map(card=>{
      const jaExiste=osFilhaMap[card.os];
      if(jaExiste){
        return {
          ...JSON.parse(JSON.stringify(card)),
          col:jaExiste.col,
          carriedFrom:prev
        };
      }
      return {
        ...JSON.parse(JSON.stringify(card)),
        carriedFrom:prev
      };
    });

  // Remonta cards: diretos preservados + espelhados com posicao respeitada
  let nextId=1;
  const cardsMesclados=[
    ...cardsDirectos.map(c=>({...c,id:nextId++})),
    ...espelhadosFiltrados.map(c=>({...c,id:nextId++}))
  ];

  const snapshot={
    cards:cardsMesclados,
    caps,
    nextId,
    gerada:false,
    parentWeek:prev
  };
  await setDoc(docRef(week),snapshot);
}

async function loadWeek(week){
  document.getElementById('loading').style.display='flex';
  document.getElementById('board').style.display='none';
  if(unsubscribeCurrent)unsubscribeCurrent();
  if(unsubscribeNext)unsubscribeNext();

  // Sincroniza a partir da semana anterior ANTES de carregar
  await syncFromPrev(week);

  unsubscribeCurrent=onSnapshot(docRef(week),(snap)=>{
    weekData=snap.exists()?snap.data():{cards:[],caps:{},nextId:1,gerada:false};
    if(!weekData.gerada)weekData.gerada=false;
    document.getElementById('loading').style.display='none';
    document.getElementById('board').style.display='grid';
    setSyncStatus('ok');
    renderGerarBar();
    render();
    atualizarBotoesNav();
    // BUG 2 FIX: syncToNext só roda se esta semana é a MÃE da próxima.
    // Verifica se a semana seguinte tem parentWeek apontando para a atual,
    // ou se ainda não existe (será criada pelo espelho).
    // NUNCA roda quando estamos visualizando uma semana filha/espelho.
    if(!weekData.gerada && !isSaving){
      const next=nextWeekKey(week);
      getDoc(docRef(next)).then(nextSnap=>{
        // Só atualiza se a proxima JA EXISTE e tem parentWeek apontando para esta semana
        // NUNCA cria semana nova aqui — evita propagacao em cascata (22→23→24)
        if(nextSnap.exists() && nextSnap.data().parentWeek===week){
          syncToNext();
        }
      });
    }
  },()=>setSyncStatus('err'));
}

// ─── NAVEGAÇÃO ─────────────────────────────────────
window.changeWeek=async function(dir){
  if(dir>0){
    const hoje=weekKeyFromDate(new Date());
    const destino=nextWeekKey(currentWeek);
    if(destino<=hoje){
      // passado: livre
    } else if(currentWeek===hoje){
      // da semana atual sempre pode ver o espelho
    } else if(weekData.gerada===true){
      // semana independente: pode ver o espelho da proxima
    } else {
      // espelho (gerada:false): bloqueado, nao pode ir alem
      return;
    }
  }
  const [yr,wn]=currentWeek.split('-W');
  const d=new Date(Number(yr),0,1+(Number(wn)-1)*7);
  d.setDate(d.getDate()+dir*7);
  currentWeek=weekKeyFromDate(d);
  document.getElementById('week-lbl').textContent=weekLabel(currentWeek);
  loadWeek(currentWeek);
};

// ─── BARRA GERAR SEMANA ────────────────────────────
async function renderGerarBar(){
  // Lógica infinita:
  // Mostra botão "Gerar semana X" sempre que a próxima ainda não foi gerada
  // e a semana atual é a semana do calendário OU já foi gerada (independente)
  const wrap=document.getElementById('gerar-semana-bar-wrap');
  if(!wrap)return;
  const next=nextWeekKey(currentWeek);
  const nextLbl=weekLabel(next).replace('Semana ','Sem. ');

  const nextSnap=await getDoc(docRef(next));
  const proximaJaGerada=nextSnap.exists()&&nextSnap.data().gerada===true;

  // Próxima já é independente → sem botão (ela já tem o próprio botão para a seguinte)
  if(proximaJaGerada){wrap.innerHTML='';setTimeout(atualizarBotoesNav,50);return;}

  // Mostra botão se esta semana é a atual do calendário OU já foi gerada
  const hoje=weekKeyFromDate(new Date());
  const podeGerar = currentWeek===hoje || weekData.gerada===true;

  wrap.innerHTML=podeGerar
    ?`<button class="btn-gerar" onclick="gerarProximaSemana()" style="white-space:nowrap">📅 Gerar ${nextLbl}</button>`
    :'';
  setTimeout(atualizarBotoesNav,50);
}

// ─── CAPACIDADE ────────────────────────────────────
function getCardMin(card){
  const col=card.col;
  if(card.min_setor&&card.min_setor[col]!==undefined)return parseInt(card.min_setor[col])||0;
  if(card.horas_setor&&card.horas_setor[col])return Math.round((parseFloat(card.horas_setor[col])||0)*60);
  return Math.round((parseFloat(card.horas)||0)*60);
}
function getCapMin(col){return parseInt(weekData.caps[col])||0;}
function getUsedMin(col){
  // Conta horas do setor para TODOS os cards exceto os na fila de espera
  return weekData.cards
    .filter(c=>c.col!=='fila')
    .reduce((a,card)=>{
      const min=card.min_setor?parseInt(card.min_setor[col])||0:0;
      return a+min;
    },0);
}
function getSaldoMin(col){const cap=getCapMin(col);if(!cap)return null;return cap-getUsedMin(col);}
function saldoClass(col){
  const cap=getCapMin(col);if(!cap)return 'neu';
  const s=getSaldoMin(col);
  if(s===null)return 'neu';
  if(s<0)return 'over';   // negativo = vermelho
  return 'ok';             // positivo ou zero = verde
}
function saldoText(col){
  const s=getSaldoMin(col);const used=getUsedMin(col);
  if(s===null)return used?`${minToTime(used)} em uso`:'—';
  if(s<0)return `−${minToTime(Math.abs(s))} (extra)`;
  if(s===0)return '00:00 livre';
  return `+${minToTime(s)} livre`;
}
function capPct(col){const cap=getCapMin(col);if(!cap)return 0;return Math.min(110,Math.round(getUsedMin(col)/cap*100));}
function capColor(col){
  const cap=getCapMin(col);if(!cap)return '#CBD5E1';
  const s=getSaldoMin(col);
  if(s===null)return '#CBD5E1';
  if(s<0)return '#ef4444';   // extra = vermelho
  return '#22c55e';           // livre = verde
}
window.setCap=function(col,val){weekData.caps[col]=timeToMin(val);saveWeek();render();};

// ─── ORDENAÇÃO ─────────────────────────────────────
// Ordem manual (campo 'ordem') tem prioridade.
// Sem ordem manual: ordena por data de entrega.
// Ao mover entre colunas: mantém ordem manual herdada da semana anterior.
// Ao reordenar manualmente dentro da coluna: define nova ordem.
function sortCards(cards){
  const comOrdem=cards.filter(c=>c.ordem!==undefined).sort((a,b)=>a.ordem-b.ordem);
  const semOrdem=cards.filter(c=>c.ordem===undefined).sort((a,b)=>{
    if(a.dataEntrega&&b.dataEntrega)return new Date(a.dataEntrega)-new Date(b.dataEntrega);
    if(a.dataEntrega)return -1;
    if(b.dataEntrega)return 1;
    return 0;
  });
  return [...comOrdem,...semOrdem];
}

function reorderInColumn(colId,draggedId,targetId,insertBefore){
  const colCards=sortCards(weekData.cards.filter(c=>c.col===colId));
  const dragged=colCards.find(c=>c.id===draggedId);
  if(!dragged)return;
  const filtered=colCards.filter(c=>c.id!==draggedId);
  const targetIdx=filtered.findIndex(c=>c.id===targetId);
  if(targetIdx===-1)filtered.push(dragged);
  else if(insertBefore)filtered.splice(targetIdx,0,dragged);
  else filtered.splice(targetIdx+1,0,dragged);
  filtered.forEach((card,i)=>{card.ordem=i;});
}

// ─── DRAG & DROP ───────────────────────────────────
function setupDrop(el,colId){
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over');});
  el.addEventListener('dragleave',()=>el.classList.remove('over'));
  el.addEventListener('drop',async e=>{
    e.preventDefault();e.stopPropagation();el.classList.remove('over');
    if(dragId===null)return;
    const card=weekData.cards.find(x=>x.id===dragId);
    if(!card||card.col===colId)return;
    card.col=colId;
    // Ao mover para nova coluna: vai para o fim (sem sobrescrever ordem manual herdada)
    const maxOrdem=weekData.cards.filter(c=>c.col===colId&&c.id!==card.id&&c.ordem!==undefined);
    if(maxOrdem.length>0) card.ordem=Math.max(...maxOrdem.map(c=>c.ordem))+1;
    else delete card.ordem;
    await saveWeek();
    render();
  });
}

function setupCardDrop(el,cardId,colId){
  el.addEventListener('dragover',e=>{
    e.preventDefault();e.stopPropagation();
    if(dragSourceCol!==colId)return; // só reordena dentro da mesma coluna
    const rect=el.getBoundingClientRect();
    el.style.borderTop=e.clientY<rect.top+rect.height/2?'2px solid #534AB7':'';
    el.style.borderBottom=e.clientY>=rect.top+rect.height/2?'2px solid #534AB7':'';
  });
  el.addEventListener('dragleave',()=>{el.style.borderTop='';el.style.borderBottom='';});
  el.addEventListener('drop',async e=>{
    e.preventDefault();e.stopPropagation();
    el.style.borderTop='';el.style.borderBottom='';
    if(dragId===null)return;
    const card=weekData.cards.find(x=>x.id===dragId);
    if(!card)return;
    if(dragId===cardId)return;
    if(dragSourceCol===colId){
      // Reordenação dentro da mesma coluna
      const rect=el.getBoundingClientRect();
      const insertBefore=e.clientY<rect.top+rect.height/2;
      reorderInColumn(colId,dragId,cardId,insertBefore);
    } else {
      // Movimento entre colunas — soltar sobre um card também funciona
      card.col=colId;
      const maxOrdem=weekData.cards.filter(c=>c.col===colId&&c.id!==card.id&&c.ordem!==undefined);
      if(maxOrdem.length>0) card.ordem=Math.max(...maxOrdem.map(c=>c.ordem))+1;
      else delete card.ordem;
    }
    await saveWeek();
    render();
  });
}

// ─── RENDER ────────────────────────────────────────
function render(){
  document.getElementById('week-lbl').textContent=weekLabel(currentWeek);
  const board=document.getElementById('board');
  board.innerHTML='';

  COLS.forEach(col=>{
    const cards=sortCards(weekData.cards.filter(c=>c.col===col.id));
    const sc=saldoClass(col.id);
    const isOver=sc==='over';
    const hasCap=!col.noCap;
    const capMin=getCapMin(col.id);

    const colEl=document.createElement('div');
    colEl.className=`col ${col.cls}`;

    let capHTML='';
    if(hasCap){
      capHTML=`<div class="cap-box">
        <div class="cap-row">
          <input class="cap-input" placeholder="000:00" maxlength="6"
            value="${capMin?minToTime(capMin):''}"
            title="Capacidade da semana"
            oninput="fmtCap(this)"
            onchange="setCap('${col.id}',this.value)" />
          <span class="cap-label">horas/<br>semana</span>
        </div>
        <div class="saldo ${sc}">${saldoText(col.id)}</div>
        ${isOver?'<div class="extra-pill">⚠ Necessita de hora extra</div>':''}
        <div class="cap-bar"><div class="cap-fill" style="width:${capPct(col.id)}%;background:${capColor(col.id)}"></div></div>
      </div>`;
    }else{
      capHTML='<div class="no-cap-spacer"></div>';
    }

    colEl.innerHTML=`
      <div class="col-title">
        <div class="col-dot" style="background:${col.color}"></div>
        <span style="color:${col.color}">${col.label}</span>
        <span class="col-count" style="color:${col.color}">${cards.length}</span>
      </div>
      ${capHTML}
      <div class="cards-list" id="list-${col.id}"></div>
    `;
    board.appendChild(colEl);

    const list=colEl.querySelector('.cards-list');

    if(cards.length===0){
      const dz=document.createElement('div');
      dz.className='drop-zone';
      dz.innerHTML='<span class="drop-hint">Arraste aqui</span>';
      setupDrop(dz,col.id);
      list.appendChild(dz);
    }else{
      cards.forEach(card=>{
        const isCarried=!!card.carriedFrom;
        const mAtual=getCardMin(card);
        const showH=!['fila','conc'].includes(card.col)&&mAtual>0;
        const dtFmt=card.dataEntrega?new Date(card.dataEntrega+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
        const idxAtual=FLUXO.indexOf(card.col);
        const trackHTML=TRACK_COLS.map(tc=>{
          const idxTc=FLUXO.indexOf(tc.id);
          const passed=idxAtual>idxTc;
          const current=card.col===tc.id;
          const cls=passed?'passed':current?'current':'';
          return `<div class="track-sq ${cls}" style="background:${tc.color}" title="${tc.label}"><span style="color:#fff">${TRACK_LABEL[tc.id]}</span></div>`;
        }).join('');

        const el=document.createElement('div');
        el.className='card'+(isCarried?' carried':'')+(card.urgente?' urgente':'');
        el.draggable=true;
        el.dataset.id=card.id;
        el.innerHTML=`
          ${card.urgente?'<div class="urgente-badge">🚨 Urgente</div>':''}
          ${isCarried?'<div class="carried-tag">↗ Semana anterior</div>':''}
          <div class="card-os">${card.os}</div>
          <div class="card-cli">${card.cliente}</div>
          ${dtFmt?`<div style="font-size:10px;font-weight:600;color:#64748b;margin-top:2px">📅 ${dtFmt}</div>`:''}
          <div class="card-track">${trackHTML}</div>
          <div class="card-footer">
            <span class="card-h">⏱ ${showH?minToTime(mAtual):(card.min_total?minToTime(card.min_total):'—')}</span>
            <div class="card-btns">
              <button class="ib edit" onclick="editCard(${card.id})" title="Editar OS">✏</button>
              <button class="ib del" onclick="delCard(${card.id})" title="Remover OS">🗑</button>
            </div>
          </div>
        `;
        el.addEventListener('dragstart',()=>{dragId=card.id;dragSourceCol=card.col;el.classList.add('dragging');});
        el.addEventListener('dragend',()=>{
          dragId=null;dragSourceCol=null;
          el.classList.remove('dragging');
          document.querySelectorAll('.drop-zone,.card').forEach(z=>{
            z.classList.remove('over');z.style.borderTop='';z.style.borderBottom='';
          });
        });
        setupCardDrop(el,card.id,col.id);
        list.appendChild(el);
      });
      const dz=document.createElement('div');
      dz.className='drop-zone';dz.style.marginTop='6px';
      dz.innerHTML='<span class="drop-hint">+ soltar aqui</span>';
      setupDrop(dz,col.id);
      list.appendChild(dz);
    }
    setupDrop(colEl,col.id);
  });
}

// ─── AÇÕES CARTÃO ──────────────────────────────────
window.delCard=function(id){
  if(!confirm('Remover esta OS?'))return;
  weekData.cards=weekData.cards.filter(x=>x.id!==id);
  saveWeek();render();
};
window.editCard=function(id){
  const card=weekData.cards.find(x=>x.id===id);if(!card)return;
  editingId=id;
  document.getElementById('modal-title').textContent='Editar ordem de serviço';
  document.getElementById('btn-save').textContent='Salvar alterações';
  document.getElementById('m-os').value=card.os;
  document.getElementById('m-cli').value=card.cliente;
  document.getElementById('m-dt').value=card.dataEntrega||'';
  isUrgente=card.urgente||false;
  document.getElementById('urg-sim').className=isUrgente?'urg-btn active-nao':'urg-btn';
  document.getElementById('urg-nao').className=isUrgente?'urg-btn':'urg-btn selected-nao';
  SETOR_IDS.forEach(s=>{
    const min=card.min_setor?parseInt(card.min_setor[s])||0:0;
    document.getElementById('h-'+s).value=min?minToTime(min):'';
  });
  document.getElementById('m-err').textContent='';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('m-os').focus(),50);
};

// ─── MODAL ─────────────────────────────────────────
window.setUrgente=function(val){
  isUrgente=val;
  const sim=document.getElementById('urg-sim'),nao=document.getElementById('urg-nao');
  if(val){sim.className='urg-btn active-nao';nao.className='urg-btn';}
  else{nao.className='urg-btn selected-nao';sim.className='urg-btn';}
};
window.openModal=function(){
  editingId=null;
  document.getElementById('modal-title').textContent='Nova ordem de serviço';
  document.getElementById('btn-save').textContent='Adicionar OS';
  document.getElementById('m-os').value='';
  document.getElementById('m-cli').value='';
  document.getElementById('m-dt').value='';
  SETOR_IDS.forEach(s=>document.getElementById('h-'+s).value='');
  document.getElementById('m-err').textContent='';
  isUrgente=false;
  document.getElementById('urg-sim').className='urg-btn';
  document.getElementById('urg-nao').className='urg-btn selected-nao';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('m-os').focus(),50);
};
window.closeModal=function(){document.getElementById('modal-overlay').classList.remove('open');editingId=null;};

window.saveCard=async function(){
  const os=document.getElementById('m-os').value.trim();
  const cli=document.getElementById('m-cli').value.trim();
  const err=document.getElementById('m-err');
  if(!os||!cli){err.textContent='Preencha OS e Cliente.';return;}
  const min_setor={};let minTotal=0;
  SETOR_IDS.forEach(s=>{const v=timeToMin(document.getElementById('h-'+s).value);min_setor[s]=v;minTotal+=v;});
  const dt=document.getElementById('m-dt').value;
  if(editingId!==null){
    if(weekData.cards.find(c=>c.os===os&&c.id!==editingId)){err.textContent='Essa OS já existe nesta semana.';return;}
    const card=weekData.cards.find(x=>x.id===editingId);if(!card)return;
    card.os=os;card.cliente=cli;card.min_setor=min_setor;card.min_total=minTotal;
    card.horas=minTotal/60;card.urgente=isUrgente;card.dataEntrega=dt;
  }else{
    if(weekData.cards.find(c=>c.os===os)){err.textContent='Essa OS já existe nesta semana.';return;}
    weekData.cards.push({id:weekData.nextId++,os,cliente:cli,min_setor,min_total:minTotal,
      horas:minTotal/60,col:'fila',urgente:isUrgente,dataEntrega:dt});
  }
  await saveWeek();
  closeModal();render();
};

// ─── IMPRESSÃO ─────────────────────────────────────
window.printBoard=function(){
  const wl=weekLabel(currentWeek);
  let html=`<html><head><meta charset="utf-8"><title>Quadro — ${wl}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',Arial,sans-serif}body{padding:24px;color:#1a1a2e}.page{page-break-after:always}.page:last-child{page-break-after:avoid}.ph{margin-bottom:16px;border-bottom:3px solid currentColor;padding-bottom:10px}.pt{font-size:22px;font-weight:800}.ps{font-size:13px;color:#64748b;margin-top:3px}.ci{margin-top:8px;font-size:13px;font-weight:600}.ok{color:#15803d}.over{color:#dc2626}.warn{color:#b45309}.cards{margin-top:12px;display:flex;flex-direction:column;gap:10px}.card{border:1.5px solid #E2E8F0;border-radius:10px;padding:12px 16px}.card.urg{border-left:4px solid #dc2626;background:#FFF5F5}.cos{font-size:15px;font-weight:800}.ccl{font-size:13px;color:#64748b;margin-top:3px}.ch{font-size:12px;color:#94a3b8;margin-top:6px;font-weight:700}.ct{font-size:10px;color:#7C3AED;font-weight:700;margin-bottom:4px}.empty{font-size:13px;color:#94a3b8;margin-top:10px}.extra{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;background:#FEE2E2;color:#dc2626;margin-top:6px}</style></head><body>`;
  PRINT_COLS.forEach(col=>{
    const cards=sortCards(weekData.cards.filter(c=>c.col===col.id));
    const capMin=getCapMin(col.id),usedMin=getUsedMin(col.id);
    const saldoMin=capMin?capMin-usedMin:null;
    const isOv=saldoMin!==null&&saldoMin<0,isWa=saldoMin!==null&&saldoMin>=0&&capMin&&saldoMin<capMin*0.2;
    let capLine='';
    if(capMin){
      const cls=isOv?'over':isWa?'warn':'ok';
      const txt=isOv?`Necessita de hora extra: −${minToTime(Math.abs(saldoMin))}`:saldoMin===0?'00:00 livre':`+${minToTime(saldoMin)} livre`;
      capLine=`<div class="ci">Capacidade: ${minToTime(capMin)} | Em uso: ${minToTime(usedMin)} | <span class="${cls}">${txt}</span></div>`;
      if(isOv)capLine+=`<div style="margin-top:6px"><span class="extra">⚠ Necessita de hora extra</span></div>`;
    }else capLine=`<div class="ci" style="color:#94a3b8">Capacidade não informada — ${minToTime(usedMin)} em uso</div>`;
    const cardsHtml=cards.length===0?'<div class="empty">Nenhuma OS neste setor</div>':cards.map(c=>{
      const dtF=c.dataEntrega?new Date(c.dataEntrega+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
      return `<div class="card${c.urgente?' urg':''}">${c.urgente?'<div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:4px">🚨 URGENTE</div>':''}${c.carriedFrom?'<div class="ct">↗ Semana anterior</div>':''}<div class="cos">${c.os}</div><div class="ccl">${c.cliente}</div>${dtF?`<div style="font-size:11px;color:#64748b;margin-top:2px">📅 Entrega: ${dtF}</div>`:''}<div class="ch">⏱ ${minToTime(getCardMin(c))} neste setor</div></div>`;
    }).join('');
    html+=`<div class="page"><div class="ph" style="color:${col.color}"><div class="pt">${col.label}</div><div class="ps" style="color:#64748b">Controle de Produção — Metalrail — ${wl}</div>${capLine}</div><div class="cards">${cardsHtml}</div></div>`;
  });
  html+='</body></html>';
  const win=window.open('','_blank');
  win.document.write(html);win.document.close();win.focus();
  setTimeout(()=>win.print(),500);
};

// ─── ABA DESEMPENHO ────────────────────────────────
let desempWeek=weekKeyFromDate(new Date());
let desempInicializado=false;
window.switchTab=function(tab){
  document.getElementById('tab-quadro').classList.toggle('active',tab==='quadro');
  document.getElementById('tab-desempenho').classList.toggle('active',tab==='desempenho');
  document.getElementById('main-quadro').style.display=tab==='quadro'?'':'none';
  document.getElementById('main-desempenho').style.display=tab==='desempenho'?'':'none';
  if(tab==='desempenho'){
    // Só inicializa desempWeek na primeira vez que abre a aba
    // Nas demais, preserva a posição de semana que o usuário estava navegando
    if(!desempInicializado){desempWeek=currentWeek;desempInicializado=true;}
    renderDesempenho();
    atualizarBotoesNav();
  }
};
window.changeDesempWeek=async function(dir){
  if(dir>0){
    const hoje=weekKeyFromDate(new Date());
    const destino=nextWeekKey(desempWeek);
    let podeAvancar=false;
    if(destino<=hoje){
      podeAvancar=true;
    } else if(desempWeek===hoje){
      podeAvancar=true;
    } else {
      const prev=prevWeekKey(desempWeek);
      const prevSnap=await getDoc(docRef(prev));
      if(prevSnap.exists()&&prevSnap.data().gerada===true) podeAvancar=true;
    }
    if(!podeAvancar) return;
  }
  const [yr,wn]=desempWeek.split('-W');
  const d=new Date(Number(yr),0,1+(Number(wn)-1)*7);
  d.setDate(d.getDate()+dir*7);desempWeek=weekKeyFromDate(d);
  renderDesempenho();
  atualizarBotoesNav();
};
async function renderDesempenho(){
  document.getElementById('desemp-week-lbl').textContent=weekLabel(desempWeek);
  const snap=await getDoc(docRef(desempWeek));
  const data=snap.exists()?snap.data():{cards:[],caps:{}};
  const cards=data.cards||[],caps=data.caps||{};
  const SP=COLS.filter(c=>!c.noCap);
  const conc=cards.filter(c=>c.col==='conc'),naof=cards.filter(c=>c.col!=='conc');
  let totR=0,totC=0;
  SP.forEach(col=>{
    totC+=parseInt(caps[col.id])||0;
    // Total realizado = soma de horas do setor para todas OS fora da fila de espera
    cards.forEach(card=>{
      if(card.col!=='fila')
        totR+=(card.min_setor?parseInt(card.min_setor[col.id])||0:0);
    });
  });
  const totO=totC>0?Math.round(totR/totC*100):0;
  document.getElementById('summary-bar').innerHTML=`
    <div class="summary-card"><div class="summary-icon" style="background:#EDE9FE">✅</div><div><div class="summary-val">${conc.length}</div><div class="summary-lbl">OS concluídas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#FEF3C7">⚙</div><div><div class="summary-val" style="color:${naof.length>0?'#b45309':'#15803d'}">${naof.length}</div><div class="summary-lbl">OS não finalizadas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#D1FAE5">⏱</div><div><div class="summary-val">${minToTime(totR)}</div><div class="summary-lbl">Horas realizadas</div></div></div>
    <div class="summary-card"><div class="summary-icon" style="background:#DBEAFE">📈</div><div><div class="summary-val" style="color:${totO<=69?'#dc2626':totO<=89?'#b45309':totO<=120?'#15803d':'#dc2626'}">${totC?totO+'%':'—'}</div><div class="summary-lbl">Ocupação geral</div></div></div>`;
  const grid=document.getElementById('desemp-grid');
  if(!cards.length){grid.innerHTML='<div class="no-data" style="grid-column:1/-1"><div class="no-data-icon">📈</div>Nenhuma OS registrada nesta semana</div>';return;}
  grid.innerHTML=SP.map(col=>{
    const capMin=parseInt(caps[col.id])||0;let passM=0;
    cards.forEach(card=>{
      // Conta horas do setor para TODAS as OS exceto as que estão na fila de espera
      if(card.col!=='fila')
        passM+=(card.min_setor?parseInt(card.min_setor[col.id])||0:0);
    });
    const pct=capMin>0?Math.min(999,Math.round(passM/capMin*100)):0;
    // 0-69%=vermelho, 70-89%=amarelo, 90-120%=verde, 121%+=vermelho
    const pc=!capMin?'gray':pct<=69?'red':pct<=89?'yellow':pct<=120?'green':'red';
    const bc=!capMin?'#E2E8F0':pct<=69?'#ef4444':pct<=89?'#f59e0b':pct<=120?'#22c55e':'#ef4444';
    // OS processadas = já passaram pelo setor (foram além)
    const osp=cards.filter(c=>FLUXO.indexOf(c.col)>FLUXO.indexOf(col.id)).length;
    // OS pendentes = ainda não chegaram ao setor
    const osPend=cards.filter(c=>FLUXO.indexOf(c.col)<FLUXO.indexOf(col.id)&&c.col!=='conc').length;
    return `<div class="desemp-card">
      <div class="desemp-header"><div class="desemp-dot" style="background:${col.color}"></div><span class="desemp-setor" style="color:${col.color}">${col.label}</span></div>
      <div class="desemp-label">Taxa de ocupação</div>
      <div class="desemp-metric-row"><div class="desemp-pct ${pc}">${capMin?pct+'%':'—'}</div></div>
      <div class="desemp-bar-bg"><div class="desemp-bar-fill" style="width:${Math.min(100,pct)}%;background:${bc}"></div></div>
      <div class="desemp-hours">
        <div class="desemp-h-item"><div class="desemp-h-val">${minToTime(passM)}</div><div class="desemp-h-lbl">Realizado</div></div>
        <div class="desemp-divider"></div>
        <div class="desemp-h-item"><div class="desemp-h-val">${capMin?minToTime(capMin):'—'}</div><div class="desemp-h-lbl">Capacidade</div></div>
      </div>
      <div class="desemp-stats">
        <div class="desemp-stat"><div class="desemp-stat-val">${osp}</div><div class="desemp-stat-lbl">OS processadas</div></div>
        <div class="desemp-stat ${osPend>0?'warn':''}"><div class="desemp-stat-val">${osPend}</div><div class="desemp-stat-lbl">OS pendentes</div></div>
      </div>
    </div>`;
  }).join('');
}

// ─── INIT ──────────────────────────────────────────
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();const sr=document.getElementById('search-results');if(sr)sr.style.display='none';}});

window.addEventListener('click', function(e){
  const sr = document.getElementById('search-results');
  const si = document.getElementById('search-input');
  if(sr && si && !sr.contains(e.target) && e.target !== si){
    sr.style.display='none';
  }
});

document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this)closeModal();});
setSyncStatus('connecting');
document.getElementById('week-lbl').textContent=weekLabel(currentWeek);
// loadWeek é chamado pelo onAuthStateChanged ou doVisitor


// ─── AUTENTICAÇÃO ─────────────────────────────────

// E-mails autorizados como editores
const EDITORS = [
  'andre@metalrail.com.br',
  'daniel@metalrail.com.br',
  'eduardo@metalrail.com.br',
  'renan@metalrail.com.br'
];

let currentUser = null;
let isEditor = false;
let isVisitor = false;

function showApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='';
  document.getElementById('tab-quadro').parentElement.style.display='';
}

function applyAccessMode(){
  const app = document.querySelector('.board')?.closest('.main')?.parentElement || document.body;
  if(isEditor){
    document.body.classList.remove('readonly');
  } else {
    document.body.classList.add('readonly');
  }
}

function updateUserBadge(){
  const badge = document.getElementById('user-badge');
  const logoutBtn = document.getElementById('logout-btn');
  if(!badge) return;
  if(isVisitor){
    badge.style.display='flex';
    logoutBtn.style.display='';
    badge.innerHTML=`<div><div class="user-badge-name">Visitante</div><div class="user-badge-role">Somente leitura</div></div>`;
    logoutBtn.textContent='Sair';
  } else if(currentUser){
    const name = currentUser.email.split('@')[0];
    const displayName = name.charAt(0).toUpperCase()+name.slice(1);
    badge.style.display='flex';
    logoutBtn.style.display='';
    badge.innerHTML=`<div><div class="user-badge-name">${displayName}</div><div class="user-badge-role">Editor</div></div>`;
  }
}

window.doLogin = async function(){
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const senha = document.getElementById('login-senha').value;
  const err = document.getElementById('login-err');
  if(!email||!senha){err.textContent='Preencha e-mail e senha.';return;}
  if(!EDITORS.includes(email)){err.textContent='Acesso de editor não autorizado para este e-mail.';return;}
  try{
    await signInWithEmailAndPassword(auth, email, senha);
    err.textContent='';
  }catch(e){
    if(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found'){
      err.textContent='E-mail ou senha incorretos.';
    } else {
      err.textContent='Erro ao fazer login. Tente novamente.';
    }
  }
};

window.doVisitor = function(){
  currentUser = null;
  isEditor = false;
  isVisitor = true;
  showApp();
  applyAccessMode();
  updateUserBadge();
  loadWeek(currentWeek);
};

window.doLogout = async function(){
  if(currentUser) await signOut(auth);
  currentUser = null;
  isEditor = false;
  isVisitor = false;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('main-app').style.display='none';
  document.body.classList.remove('readonly');
  document.getElementById('login-email').value='';
  document.getElementById('login-senha').value='';
};

onAuthStateChanged(auth, (user)=>{
  if(user){
    currentUser = user;
    isEditor = EDITORS.includes(user.email.toLowerCase());
    isVisitor = false;
    showApp();
    applyAccessMode();
    updateUserBadge();
    loadWeek(currentWeek);
  }
});

// Enter no campo de senha faz login
document.addEventListener('DOMContentLoaded',()=>{
  const senhaInput = document.getElementById('login-senha');
  if(senhaInput) senhaInput.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  const emailInput = document.getElementById('login-email');
  if(emailInput) emailInput.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('login-senha').focus();});
});

// ─── BUSCA DE OS ──────────────────────────────────
window.searchOS = async function(query){
  const resultsEl = document.getElementById('search-results');
  if(!resultsEl) return;
  query = query.trim().toLowerCase();
  if(query.length < 2){
    resultsEl.style.display='none';
    resultsEl.innerHTML='';
    return;
  }

  resultsEl.style.display='';
  resultsEl.innerHTML='<div class="search-empty">🔍 Buscando...</div>';

  // Busca apenas em semanas passadas + semana atual (NUNCA futuras)
  // Evita duplicatas de cards espelhados em semanas futuras
  const results = [];
  const promises = [];
  for(let offset=-12; offset<=0; offset++){
    const d = new Date();
    d.setDate(d.getDate()+offset*7);
    const wk = weekKeyFromDate(d);
    // Não busca além da semana atual
    if(wk>currentWeek) continue;
    promises.push(
      getDoc(docRef(wk)).then(snap=>{
        if(!snap.exists()) return;
        const data = snap.data();
        (data.cards||[]).forEach(card=>{
          const osMatch = card.os.toLowerCase().includes(query);
          const cliMatch = card.cliente.toLowerCase().includes(query);
          if(osMatch||cliMatch){
            const col = COLS.find(c=>c.id===card.col);
            results.push({
              os: card.os,
              cliente: card.cliente,
              setor: col?col.label:'—',
              setorColor: col?col.color:'#94a3b8',
              semana: weekLabel(wk),
              semanaKey: wk,
              urgente: card.urgente,
              dataEntrega: card.dataEntrega
            });
          }
        });
      }).catch(()=>{})
    );
  }
  await Promise.all(promises);

  if(results.length===0){
    resultsEl.innerHTML='<div class="search-results"><div class="search-empty">Nenhuma OS encontrada</div></div>';
    return;
  }

  // Ordena por semana
  results.sort((a,b)=>a.semanaKey.localeCompare(b.semanaKey));

  const html = results.map(r=>{
    const dtFmt = r.dataEntrega ? new Date(r.dataEntrega+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '';
    return `<div class="search-result-item">
      ${r.urgente?'<span style="font-size:12px">🚨</span>':''}
      <span class="search-result-os">${r.os}</span>
      <span class="search-result-cli">${r.cliente}${dtFmt?' · 📅 '+dtFmt:''}</span>
      <span class="search-result-loc" style="background:${r.setorColor}20;color:${r.setorColor}">${r.setor}</span>
      <span class="search-result-week">${r.semana}</span>
    </div>`;
  }).join('');

  resultsEl.innerHTML=`<div class="search-results">${html}</div>`;
};
