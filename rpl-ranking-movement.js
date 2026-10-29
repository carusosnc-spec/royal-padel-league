(function(){
'use strict';
var $=function(id){return document.getElementById(id)}, ready=false, busy=false, cache='', old={general:new Map(),partial:new Map(),bonus:new Map()};
function style(){if($('rplRankMoveStyle'))return;var s=document.createElement('style');s.id='rplRankMoveStyle';s.textContent='.rpl-rank-move{display:inline-flex;margin-left:5px;font-size:12px;font-weight:900;vertical-align:middle;white-space:nowrap}.rpl-rank-move.up{color:#39d98a}.rpl-rank-move.down{color:#ff5c66}.rpl-rank-move.same,.rpl-rank-move.first{color:#aeb8c4}';document.head.appendChild(s)}
function annotate(id,map){var body=$(id);if(!ready||!body)return;Array.from(body.rows).forEach(function(row){var im=row.querySelector('[data-player-profile]'),cell=row.cells[0];if(!im||!cell)return;var pid=String(im.getAttribute('data-player-profile')),now=Number((cell.textContent.match(/\d+/)||[])[0]),prev=map.get(pid);if(!now)return;var cls='same',label='=',title='Posizione invariata';if(!prev){cls='first';label='·';title='Nessun confronto disponibile'}else if(now<prev){cls='up';label='▲ '+(prev-now);title='Ha guadagnato '+(prev-now)+' posizioni'}else if(now>prev){cls='down';label='▼ '+(now-prev);title='Ha perso '+(now-prev)+' posizioni'}var b=cell.querySelector('.rpl-rank-move');if(!b){b=document.createElement('span');b.className='rpl-rank-move';cell.appendChild(b)}if(b.className!=='rpl-rank-move '+cls)b.className='rpl-rank-move '+cls;if(b.textContent!==label)b.textContent=label;if(b.title!==title)b.title=title})}
function explainBonus(){var s=$('bonusSummary');if(!s)return;var id='rplBonusCriteria';var n=$(id);if(!n){n=document.createElement('div');n.id=id;n.style.cssText='margin-top:6px;font-size:12px;line-height:1.45;color:#c7d2df';s.insertAdjacentElement('afterend',n)}var t='Criterio: si sommano i punti dei mesi chiusi (1° 100, 2° 72, 3° 60, 4° 48, 5° 40, 6° 32, 7° 24, 8° 16, 9° 8, 10° 4). Per concorrere al bonus mensile bisogna raggiungere il minimo cumulativo di set previsto per quel mese. Il mese corrente è provvisorio.';if(n.textContent!==t)n.textContent=t}
function paint(){style();annotate('ranking',old.general);annotate('partialRanking',old.partial);annotate('bonusRanking',old.bonus);explainBonus()}
async function rows(q){var out=[];for(var n=0;n<30000;n+=750){var r=await q().range(n,n+749);if(r.error)throw r.error;out=out.concat(r.data||[]);if(!r.data||r.data.length<750)break}return out}
function empty(players){return players.filter(function(p){return !p.is_guest}).map(function(p){return{id:Number(p.id),name:p.name,fascia:Number(p.fascia)||4,sets:0,won:0,pt:0,games:0,mvp:0,imb:0}})}
function add(stats,m,mp,sets,aw){var by=new Map(stats.map(function(x){return[x.id,x]})),snap={};mp.filter(function(x){return String(x.match_id)===String(m.id)}).forEach(function(x){snap[String(x.player_id)]=x});sets.filter(function(x){return String(x.match_id)===String(m.id)}).forEach(function(x){var A=[Number(x.pair_a_player_1),Number(x.pair_a_player_2)],B=[Number(x.pair_b_player_1),Number(x.pair_b_player_2)],ga=Number(x.games_a),gb=Number(x.games_b);if(!Number.isFinite(ga)||!Number.isFinite(gb)||ga===gb)return;var win=ga>gb?A:B,lose=ga>gb?B:A,wg=Math.max(ga,gb),lg=Math.min(ga,gb);win.forEach(function(id){var z=by.get(id);if(z){z.sets++;z.won++;z.games+=wg;z.pt+=(Number(snap[lose[0]]&&snap[lose[0]].fascia_value)||0)+(Number(snap[lose[1]]&&snap[lose[1]].fascia_value)||0)}});lose.forEach(function(id){var z=by.get(id);if(z){z.sets++;z.games+=lg}})});aw.filter(function(x){return String(x.match_id)===String(m.id)}).forEach(function(a){var z=by.get(Number(a.player_id)),t=String(a.award_type||'').toUpperCase();if(z&&t==='MVP')z.mvp++;if(z&&t==='IMBATTUTO')z.imb++})}
function rank(stats,kind){var min=typeof window.minSetsRequired==='function'?window.minSetsRequired():null;stats=stats.map(function(s){var base=s.sets?((s.pt+s.games*.30+s.sets*.10)/s.sets)*10:0;return Object.assign({},s,{base:base,total:base+s.mvp*1.5+s.imb,eligible:min===null||s.sets>=min})}).sort(function(a,b){if(kind==='general'&&a.eligible!==b.eligible)return a.eligible?-1:1;return b.total-a.total||b.base-a.base||(kind==='partial'?b.sets-a.sets:0)||a.name.localeCompare(b.name,'it')});return new Map(stats.map(function(s,i){return[String(s.id),i+1]}))}
async function rebuild(force){if(busy)return;busy=true;try{var sb=window.sb,players=window.dbPlayers||[];if(!sb||!players.length)return;var all=await Promise.all([rows(function(){return sb.from('matches').select('id,played_at,approval_status').or('approval_status.eq.confirmed,approval_status.is.null').order('played_at',{ascending:true}).order('id',{ascending:true})}),rows(function(){return sb.from('match_players').select('match_id,player_id,fascia_value')}),rows(function(){return sb.from('sets').select('*').order('set_number')}),rows(function(){return sb.from('match_awards').select('match_id,player_id,award_type')})]);var matches=all[0].filter(function(m){return m.played_at&&['confirmed',null,undefined].includes(m.approval_status)&&String(m.played_at).slice(0,10)>='2026-09-15'}),mp=all[1],sets=all[2],aw=all[3],fromKey=$('partialFrom')&&$('partialFrom').value||'',toKey=$('partialTo')&&$('partialTo').value||'',key=matches.map(function(m){return m.id}).join('|')+'|partial:'+fromKey+':'+toKey;if(!force&&key===cache){ready=true;paint();return}cache=key;
var gs=empty(players);matches.slice(0,-1).forEach(function(m){add(gs,m,mp,sets,aw)});old.general=rank(gs,'general');

// Classifica parziale: baseline immediatamente prima dell'ultima partita nel periodo selezionato.
var from=$('partialFrom')&&$('partialFrom').value,to=$('partialTo')&&$('partialTo').value;old.partial=new Map();
if(from&&to&&from<=to){
 var pm=matches.filter(function(m){var d=String(m.played_at).slice(0,10);return d>=from&&d<=to});
 var ps=empty(players),pb=empty(players);
 pm.forEach(function(m){add(ps,m,mp,sets,aw)});
 pm.slice(0,-1).forEach(function(m){add(pb,m,mp,sets,aw)});
 old.partial=rank(pb,'partial');
}

// Classifica bonus: baseline = cumulativo dell'ultimo mese chiuso, come nella versione di ieri.
var now=new Date(),months=[['2026-09-01','2026-09-30',5],['2026-10-01','2026-10-31',15],['2026-11-01','2026-11-30',25],['2026-12-01','2026-12-31',35],['2027-01-01','2027-01-31',45],['2027-02-01','2027-02-28',55],['2027-03-01','2027-03-31',65]],cum={},bonusTotals={},baselineTotals={};
players.filter(function(p){return !p.is_guest}).forEach(function(p){cum[String(p.id)]=0;bonusTotals[String(p.id)]=0;baselineTotals[String(p.id)]=0});
var pointValues=[100,72,60,48,40,32,24,16,8,4];
months.forEach(function(mo){
 if(now<new Date(mo[0]+'T00:00:00'))return;
 var mm=matches.filter(function(m){var d=String(m.played_at).slice(0,10);return d>=mo[0]&&d<=mo[1]}),st=empty(players);
 mm.forEach(function(m){add(st,m,mp,sets,aw)});
 st.forEach(function(z){z.cumSets=(cum[String(z.id)]||0)+z.sets;z.base=z.sets?((z.pt+z.games*.30+z.sets*.10)/z.sets)*10:0;z.total=z.base+z.mvp*1.5+z.imb});
 var closed=now>=new Date(mo[1]+'T23:59:59.999'),threshold=closed?mo[2]:(typeof window.minSetsRequired==='function'?window.minSetsRequired():5);
 var elig=st.filter(function(z){return z.sets>0&&z.cumSets>=threshold}).sort(function(a,b){return b.total-a.total||b.won-a.won||b.sets-a.sets||b.mvp-a.mvp||b.imb-a.imb||b.games-a.games||a.fascia-b.fascia||a.name.localeCompare(b.name,'it')});
 elig.forEach(function(z,i){if(i<10){bonusTotals[String(z.id)]=(bonusTotals[String(z.id)]||0)+pointValues[i];if(closed)baselineTotals[String(z.id)]=(baselineTotals[String(z.id)]||0)+pointValues[i]}});
 st.forEach(function(z){cum[String(z.id)]=(cum[String(z.id)]||0)+z.sets});
});
old.bonus=new Map(Object.keys(baselineTotals).sort(function(a,b){return baselineTotals[b]-baselineTotals[a]||String((players.find(function(p){return String(p.id)===a})||{}).name||'').localeCompare(String((players.find(function(p){return String(p.id)===b})||{}).name||''),'it')}).map(function(id,i){return[id,i+1]}));

ready=true;paint()
}catch(e){console.warn('[RPL frecce classifica]',e)}finally{busy=false}}
function refresh(){rebuild(false).then(paint)}
document.addEventListener('DOMContentLoaded',function(){refresh();var obs=new MutationObserver(paint);if($('ranking'))obs.observe($('ranking'),{childList:true,subtree:true});['partialFrom','partialTo'].forEach(function(id){if($(id))$(id).addEventListener('change',function(){rebuild(true)})});['partialRanking','bonusRanking'].forEach(function(id){if($(id)){var ob2=new MutationObserver(function(){if(id==='partialRanking')rebuild(false);paint()});ob2.observe($(id),{childList:true,subtree:true})}});var l=window.loadRanking;if(typeof l==='function')window.loadRanking=async function(){var r=await l.apply(this,arguments);await rebuild(true);return r};})
})();