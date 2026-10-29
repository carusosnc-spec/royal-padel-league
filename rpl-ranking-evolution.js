/* Royal Padel League · Ranking Evolution · 2026-10-28
   Calcolo client-side dai risultati ufficiali; nessuna modifica a Supabase. */
(function(){
'use strict';
const START='2026-09-15';
const COLORS=['#ffd166','#35d6a0','#64b5ff','#ff7fa4'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={data:null,promise:null,primary:null,selected:[],expanded:false,point:null};
function threshold(date){const m=date.getMonth(),y=date.getFullYear();if(y!==2026&&y!==2027)return null;if(y===2026){if(m===9)return 5;if(m===10)return 15;if(m===11)return 25;return null;}if(m===0)return 35;if(m===1)return 45;if(m===2)return 55;if(m>=3)return 65;return null;}
async function allRows(query,pageSize=750){let out=[];for(let offset=0;offset<30000;offset+=pageSize){const {data,error}=await query().range(offset,offset+pageSize-1);if(error)throw error;out.push(...(data||[]));if(!data||data.length<pageSize)break;}return out;}
async function getData(force=false){
 if(state.data&&!force)return state.data;if(state.promise&&!force)return state.promise;
 state.promise=(async()=>{
  const sb=window.sb;if(!sb)throw Error('Connessione al database non disponibile.');
  const [players,matches]=await Promise.all([
   allRows(()=>sb.from('players').select('id,name,nickname,is_guest').order('id',{ascending:true})),
   allRows(()=>sb.from('matches').select('id,played_at,approval_status').or('approval_status.eq.confirmed,approval_status.is.null').gte('played_at',START+'T00:00:00').order('played_at',{ascending:true}).order('id',{ascending:true}))
  ]);
  const roster=players.filter(p=>!p.is_guest).map(p=>({...p,id:Number(p.id)}));
  const validMatches=matches.filter(m=>m.played_at&&['confirmed',null,undefined].includes(m.approval_status));
  if(!validMatches.length)return {roster,events:[],byId:new Map()};
  const ids=validMatches.map(m=>m.id),groups=[];for(let i=0;i<ids.length;i+=120)groups.push(ids.slice(i,i+120));
  const read=async(table)=>{const batches=await Promise.all(groups.map(group=>allRows(()=>sb.from(table).select('*').in('match_id',group))));return batches.flat()};
  const [sets,mp,aw]=await Promise.all([read('sets'),read('match_players'),read('match_awards')]);
  const setMap=new Map(),awardMap=new Map(),snap=new Map();
  sets.forEach(s=>{const k=String(s.match_id);if(!setMap.has(k))setMap.set(k,[]);setMap.get(k).push(s)});
  aw.forEach(a=>{const k=String(a.match_id);if(!awardMap.has(k))awardMap.set(k,[]);awardMap.get(k).push(a)});
  mp.forEach(p=>snap.set(String(p.match_id)+'/'+String(p.player_id),Number(p.fascia_value)||0));
  const st=new Map(roster.map(p=>[p.id,{sets:0,pt:0,games:0,mvp:0,imb:0}]));
  const events=[];
  validMatches.forEach((m,i)=>{
   const matchSets=setMap.get(String(m.id))||[];
   matchSets.forEach(s=>{
    const a=[Number(s.pair_a_player_1),Number(s.pair_a_player_2)],b=[Number(s.pair_b_player_1),Number(s.pair_b_player_2)];
    const ga=Number(s.games_a),gb=Number(s.games_b);if(!Number.isFinite(ga)||!Number.isFinite(gb)||ga===gb)return;
    const win=ga>gb?a:b,lose=ga>gb?b:a,wg=Math.max(ga,gb),lg=Math.min(ga,gb);
    win.forEach(pid=>{const z=st.get(pid);if(z){z.sets++;z.games+=wg;z.pt+=(snap.get(String(m.id)+'/'+lose[0])||0)+(snap.get(String(m.id)+'/'+lose[1])||0);}});
    lose.forEach(pid=>{const z=st.get(pid);if(z){z.sets++;z.games+=lg;}});
   });
   (awardMap.get(String(m.id))||[]).forEach(a=>{const z=st.get(Number(a.player_id));if(!z)return;if(a.award_type==='MVP')z.mvp++;else if(a.award_type==='IMBATTUTO')z.imb++;});
   const date=new Date(m.played_at),min=threshold(date);
   const sorted=roster.map(p=>{const z=st.get(p.id),base=z.sets?((z.pt+z.games*.30+z.sets*.10)/z.sets)*10:0;return {id:p.id,name:p.name,sets:z.sets,base,total:base+z.mvp*1.5+z.imb,eligible:min===null||z.sets>=min};}).sort((a,b)=>(a.eligible===b.eligible?0:(a.eligible?-1:1))||b.total-a.total||b.base-a.base||a.name.localeCompare(b.name,'it'));
   const positions={};sorted.forEach((p,j)=>{positions[p.id]=j+1});
   events.push({id:m.id,date:m.played_at,index:i+1,positions,setsPlayed:Object.fromEntries(sorted.map(p=>[p.id,p.sets]))});
  });
  return {roster,events,byId:new Map(roster.map(p=>[p.id,p]))};
 })();
 try{state.data=await state.promise;return state.data}finally{state.promise=null;}
}
function style(){if($('rplEvolutionStyle'))return;const el=document.createElement('style');el.id='rplEvolutionStyle';el.textContent=`
.rpl-evo-open{width:100%;margin:12px 0 2px;padding:13px;border:1px solid #e7b94e;border-radius:12px;background:linear-gradient(90deg,#1d3550,#0b2034);color:#ffe09a;font-weight:900;cursor:pointer;touch-action:manipulation}
#rplEvolutionOverlay{position:fixed;inset:0;z-index:190000;background:rgba(1,8,17,.94);display:none;overflow:auto;padding:12px;overscroll-behavior:contain}#rplEvolutionOverlay.open{display:block}
.rpl-evo-card{max-width:1050px;margin:8px auto 30px;background:#071827;color:#eef5fc;border:1px solid #b78e42;border-radius:16px;padding:15px;box-shadow:0 16px 50px #0009}
.rpl-evo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.rpl-evo-head h2{margin:0;color:#ffd166;font-size:20px}.rpl-evo-sub{font-size:12px;color:#b9c9d8;margin:5px 0 10px}.rpl-evo-close{background:#1d3147;color:white;border:1px solid #61758c;border-radius:9px;padding:7px 12px;font-size:20px;cursor:pointer}
.rpl-evo-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}.rpl-evo-controls select,.rpl-evo-controls button{background:#112c44;color:#fff;border:1px solid #53718a;border-radius:8px;padding:9px;font-size:13px;max-width:100%}.rpl-evo-controls button{cursor:pointer}
.rpl-evo-legend{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.rpl-evo-chip{border:1px solid #38536d;border-radius:8px;padding:6px 8px;background:#11283c;color:#fff;font-size:11px;cursor:pointer}.rpl-evo-chip.primary{border-color:#ffd166}
.rpl-evo-hint{color:#b5c7d8;font-size:11px;line-height:1.5}.rpl-evo-rotate{border:1px dashed #577b99;padding:8px;border-radius:8px;margin:8px 0;color:#ffd166;font-size:12px;text-align:center}
.rpl-evo-graph{width:100%;overflow-x:auto;touch-action:pan-x pan-y}.rpl-evo-graph svg{display:block;width:100%;height:auto;min-width:310px}.rpl-evo-detail{border:1px solid #3b5b78;background:#10293f;border-radius:10px;padding:10px;margin-top:10px;font-size:12px;line-height:1.7}.rpl-evo-detail strong{color:#ffd166}
.rpl-evo-graph circle[data-evo-point]{cursor:pointer;stroke:#071827;stroke-width:1.5}.rpl-evo-graph circle[data-evo-point]:focus{outline:none;stroke:#fff;stroke-width:3}
@media(max-width:700px) and (orientation:portrait){.rpl-evo-graph svg{min-width:340px}.rpl-evo-card{padding:10px}.rpl-evo-head h2{font-size:17px}}
@media(orientation:landscape) and (max-height:550px){#rplEvolutionOverlay{padding:4px}.rpl-evo-card{max-width:none;margin:0}.rpl-evo-rotate{display:none}.rpl-evo-graph svg{max-height:65vh}}
`;document.head.appendChild(el);}
function ensure(){style();if($('rplEvolutionOverlay'))return;const el=document.createElement('div');el.id='rplEvolutionOverlay';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Royal Ranking Evolution');el.innerHTML=`<div class="rpl-evo-card"><div class="rpl-evo-head"><div><h2>📈 ROYAL RANKING EVOLUTION</h2><div class="rpl-evo-sub">Evoluzione della classifica generale · Stagione 2026/27</div></div><button class="rpl-evo-close" type="button" id="rplEvoClose" aria-label="Chiudi grafico">×</button></div><div id="rplEvoContent" aria-live="polite"></div></div>`;document.body.appendChild(el);$('rplEvoClose').onclick=close;el.addEventListener('click',e=>{if(e.target===el)close()});}
function close(){const el=$('rplEvolutionOverlay');if(el)el.classList.remove('open');}
function fmtDate(s){return new Date(s).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});}
function render(){const host=$('rplEvoContent');if(!host)return;const data=state.data;if(!data){host.innerHTML='Caricamento…';return;}
 const primary=data.byId.get(state.primary),others=data.roster.filter(p=>p.id!==state.primary&&!state.selected.includes(p.id));
 if(!data.events.length){host.innerHTML='<div class="rpl-evo-detail">Non ci sono ancora partite ufficiali confermate per questa stagione.</div>';return;}
 const last=data.events.at(-1),first=data.events[0],rank=last.positions[state.primary];
 const series=[state.primary,...state.selected];const count=data.roster.length,events=data.events;
 const W=900,H=420,left=51,right=20,top=24,bottom=55,plotW=W-left-right,plotH=H-top-bottom;
 const X=i=>left+(events.length===1?plotW/2:i/(events.length-1)*plotW),Y=pos=>top+(pos-1)/Math.max(1,count-1)*plotH;
 const ticks=[...new Set([1,Math.ceil(count/4),Math.ceil(count/2),Math.ceil(count*3/4),count])].filter(v=>v>=1&&v<=count).sort((a,b)=>a-b);
 const grids=ticks.map(n=>`<line x1="${left}" x2="${W-right}" y1="${Y(n)}" y2="${Y(n)}" stroke="#385068" stroke-dasharray="4 5"/><text x="${left-8}" y="${Y(n)+4}" text-anchor="end" fill="#b5c7d8" font-size="13">${n}°</text>`).join('');
 const dateLabels=[...new Set([0,Math.floor((events.length-1)/3),Math.floor((events.length-1)*2/3),events.length-1])].map(i=>`<text x="${X(i)}" y="${H-23}" text-anchor="middle" font-size="12" fill="#bdc9d7">${fmtDate(events[i].date).replace(/ 2026| 2027/,'')}</text>`).join('');
 const paths=series.map((pid,k)=>{const color=COLORS[k],path=events.map((e,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(e.positions[pid]).toFixed(1)}`).join(' ');return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${k===0?4:2.6}" stroke-linejoin="round" stroke-linecap="round"/>`}).join('');
 const circles=series.map((pid,k)=>events.map((e,i)=>`<circle data-evo-point="${i}" data-evo-player="${pid}" tabindex="0" role="button" aria-label="${esc(data.byId.get(pid)?.name)} ${fmtDate(e.date)} posizione ${e.positions[pid]}" cx="${X(i).toFixed(1)}" cy="${Y(e.positions[pid]).toFixed(1)}" r="${k===0?4.7:3.5}" fill="${COLORS[k]}"/>`).join('')).join('');
 const selected=state.point&&series.includes(state.point.pid)?state.point:{pid:state.primary,index:events.length-1};state.point=selected;
 const ev=events[selected.index],previous=events[selected.index-1],current=ev.positions[selected.pid],delta=previous?previous.positions[selected.pid]-current:null;
 const deltaText=delta===null?'Prima partita':delta>0?`▲ ${delta} posizioni guadagnate`:delta<0?`▼ ${Math.abs(delta)} posizioni perse`:'= Posizione invariata';
 const selectOptions=others.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 host.innerHTML=`<div class="rpl-evo-controls"><strong>${esc(primary?.name||'Giocatore')} · ${rank}° posto attuale</strong><select id="rplEvoAdd" aria-label="Scegli giocatore da confrontare"><option value="">+ Confronta con un giocatore</option>${selectOptions}</select><button type="button" id="rplEvoRefresh">↻ Aggiorna</button></div><div class="rpl-evo-legend">${series.map((pid,k)=>`<button type="button" class="rpl-evo-chip ${k===0?'primary':''}" data-evo-remove="${pid}" style="border-left:5px solid ${COLORS[k]}">${esc(data.byId.get(pid)?.name||'Giocatore')}${k?' ×':''}</button>`).join('')}</div><div class="rpl-evo-rotate">📱 Ruota lo smartphone in orizzontale per vedere il grafico più grande.</div><div class="rpl-evo-hint">Il numero 1 è in alto: più la linea sale, migliore è la posizione. Tocca un punto per i dettagli. Massimo 4 giocatori.</div><div class="rpl-evo-graph"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento della posizione in classifica dopo ogni partita confermata"><text x="${left}" y="15" fill="#b5c7d8" font-size="12">POSIZIONE</text>${grids}${dateLabels}${paths}${circles}<text x="${W/2}" y="${H-2}" fill="#b5c7d8" font-size="12" text-anchor="middle">DATA PARTITA</text></svg></div><div class="rpl-evo-detail"><strong>${esc(data.byId.get(selected.pid)?.name)} · ${current}° posto</strong><div>📅 ${fmtDate(ev.date)} · Partita n. ${ev.index} della stagione</div><div>${deltaText} rispetto alla partita precedente</div><div>Set giocati fino a questa partita: ${ev.setsPlayed[selected.pid]||0}</div></div><div class="rpl-evo-hint">Dati ricostruiti dai risultati ufficiali della stagione dal 15 settembre 2026, aggiornati all'apertura del grafico. Le soglie minime dei set vengono applicate alla data di ciascuna partita.</div>`;
 $('rplEvoAdd').onchange=e=>{const id=Number(e.target.value);if(!id)return;if(state.selected.length>=3){alert('Puoi confrontare al massimo 4 giocatori. Rimuovine uno per aggiungerne un altro.');return;}state.selected.push(id);state.point=null;render()};
 $('rplEvoRefresh').onclick=async()=>{host.innerHTML='Aggiornamento risultati…';try{await getData(true);render()}catch(e){host.innerHTML='<div class="rpl-evo-detail">Errore aggiornamento: '+esc(e.message)+'</div>'}};
 host.querySelectorAll('[data-evo-remove]').forEach(btn=>btn.onclick=()=>{const id=Number(btn.dataset.evoRemove);if(id===state.primary)return;state.selected=state.selected.filter(p=>p!==id);state.point=null;render()});
 host.querySelectorAll('[data-evo-point]').forEach(c=>{const action=()=>{state.point={index:Number(c.dataset.evoPoint),pid:Number(c.dataset.evoPlayer)};render()};c.onclick=action;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action()}}});
}
async function open(id){ensure();state.primary=Number(id);state.selected=[];state.point=null;state.data=null;$('rplEvolutionOverlay').classList.add('open');$('rplEvoContent').innerHTML='<div class="rpl-evo-detail">⏳ Ricostruzione della classifica partita per partita…</div>';try{await getData(true);if(!$('rplEvolutionOverlay').classList.contains('open'))return;render()}catch(e){$('rplEvoContent').innerHTML='<div class="rpl-evo-detail">Impossibile caricare lo storico: '+esc(e.message||e)+'</div>';console.error('Royal Ranking Evolution',e)}}
window.openRplRankingEvolution=open;window.closeRplRankingEvolution=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
})();