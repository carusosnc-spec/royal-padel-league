/* Royal Pay module v1.0 — integrated safely without replacing RPL core */
(() => {
  'use strict';
  const PAYPAL_URL = 'https://www.paypal.me/Carusosnc';
  const REVOLUT_URL = 'https://revolut.me/giovan5azf';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const euro = v => Number(v || 0).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
  const css = `
  .rpl-pay-card{border:1px solid rgba(63,196,133,.4);background:linear-gradient(150deg,rgba(12,40,37,.96),rgba(6,18,31,.98));border-radius:14px;padding:15px;margin:12px 0;color:#f5f7fa}
  .rpl-pay-toggle-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0 0 8px}
  .rpl-chat-card{align-self:start!important;height:fit-content!important;min-height:0!important}
  #playerDashboard{align-items:start!important}
  #rplMessagingCard{align-self:start!important;height:fit-content!important;min-height:0!important;grid-row:auto!important;}
  #rplMessagingCard #rplPayPlayerCard{max-height:none;}
  #rplPlayerQuickActions{align-items:start!important;align-self:start!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;}
  #rplChatToggle{font-size:0!important;min-width:0!important;width:100%!important;max-width:100%!important;overflow:hidden!important;position:relative;white-space:nowrap!important;}
  #rplChatToggle *{display:none!important;font-size:0!important;}
  #rplChatToggle::before{content:"💬";display:block;font-size:18px;line-height:1}
  @media(min-width:700px){#rplMessagingCard{height:fit-content!important;align-self:start!important;}#rplPlayerQuickActions{align-self:start!important;}}
  #rplMessagingCard .rpl-chat-heading{display:none!important}
  #rplPayPlayerCard{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:12px 0;align-self:start;height:fit-content!important;min-height:0!important;grid-column:1 / -1}\n  #rplPayPlayerCard.rpl-pay-player-panel.hidden{display:none!important}\n  #rplPlayerQuickActions{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;width:min(100%,340px);margin:0 0 8px!important}\n  #rplPlayerQuickActions #rplChatToggle,#rplPlayerQuickActions #rplPayPlayerToggle{min-width:0!important;width:100%!important;max-width:100%!important}
  .rpl-pay-toggle-row #rplChatToggle,.rpl-pay-open-btn{width:100%!important;min-width:0;min-height:38px!important;padding:8px 6px!important;font-size:11px!important;line-height:1.15!important;white-space:normal}
  .rpl-pay-open-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid #3fc485!important;border-radius:9px!important;background:linear-gradient(135deg,#123c31,#0b2825)!important;color:#d9ffe9!important;font-weight:800;cursor:pointer}
  .rpl-pay-open-btn[aria-expanded="true"]{border-color:#ffd86a!important;color:#ffd86a!important}
  @media(max-width:420px){.rpl-pay-toggle-row{gap:5px}.rpl-pay-toggle-row #rplChatToggle,.rpl-pay-open-btn{font-size:10px!important;padding:8px 4px!important}}
  .rpl-pay-card h2,.rpl-pay-card h3{margin:2px 0 10px;color:#d9ffe9}
  .rpl-pay-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .rpl-pay-card input,.rpl-pay-card select,.rpl-pay-card textarea{width:100%;min-height:40px;border-radius:8px;border:1px solid #47635f;background:#081a20;color:#fff;padding:9px;margin:4px 0 9px}
  .rpl-pay-card button,.rpl-pay-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #3fc485;border-radius:9px;padding:10px 13px;background:#123c31;color:#fff;font-weight:800;text-decoration:none;cursor:pointer;margin:4px 4px 4px 0}
  .rpl-pay-card button:disabled{opacity:.5;cursor:wait}
  .rpl-pay-item{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.1)}
  .rpl-pay-status{display:inline-block;border-radius:99px;padding:3px 8px;font-size:11px;font-weight:800;background:#34404b;color:#fff}
  .rpl-pay-status.paid{background:#155b3b}.rpl-pay-status.pending_verification{background:#705018}.rpl-pay-status.rejected{background:#742d35}
  .rpl-pay-muted{color:#afc0c3;font-size:12px;line-height:1.4}
  .rpl-pay-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:6px;margin:7px 0 12px}
  .rpl-pay-checks label{display:flex;gap:7px;align-items:center;padding:7px;border:1px solid #354a4a;border-radius:8px;font-size:13px}
  .rpl-pay-checks input{width:17px;min-height:17px;margin:0;flex:0 0 auto}
  `;
  function statusLabel(s){return ({unpaid:'DA PAGARE',pending_verification:'IN VERIFICA',paid:'PAGATA',waived:'ESONERATA',rejected:'DA RIPROVARE'})[s]||s;}
  function statusClass(s){return s==='paid'||s==='waived'?'paid':s==='pending_verification'?'pending_verification':s==='rejected'?'rejected':'';}
  function addStyle(){if($('rplPayStyles'))return;const st=document.createElement('style');st.id='rplPayStyles';st.textContent=css;document.head.appendChild(st);}
  function mountPlayer(){
    const host=$('playerDashboard'); if(!host||$('rplPayPlayerCard'))return;
    const section=document.createElement('section');section.id='rplPayPlayerCard';section.className='rpl-pay-card hidden';
    section.innerHTML='<div style="font-size:11px;letter-spacing:.18em;color:#72e5ae;font-weight:900">ROYAL PADEL LEAGUE · PAGAMENTI</div><h2>💳 I MIEI PAGAMENTI</h2><div class="rpl-pay-muted">Quote, contributi e pagamenti da confermare dall’operatore.</div><div id="rplPayWalletSummary" style="margin:12px 0"></div><div id="rplPayPlayerSummary" style="margin:12px 0"></div><div id="rplPayPlayerList">Premi AGGIORNA per caricare le quote.</div><h3>📜 Movimenti del portafoglio</h3><div id="rplPayWalletHistory" class="rpl-pay-muted">I movimenti saranno caricati all’apertura.</div><div class="rpl-pay-muted" style="margin-top:8px">Ricarica: il pagamento deve essere verificato dall’operatore prima dell’accredito.</div><a class="rpl-pay-link" href="'+PAYPAL_URL+'" target="_blank" rel="noopener noreferrer">RICARICA CON PAYPAL</a><a class="rpl-pay-link" href="'+REVOLUT_URL+'" target="_blank" rel="noopener noreferrer">RICARICA CON REVOLUT</a><div class="rpl-pay-muted">Per il bonifico, chiedi all’operatore le coordinate e indica la causale Royal Pay.</div><button type="button" id="rplPayPlayerRefresh">↻ AGGIORNA</button>';
    const messages=$('rplMessagingCard');
    const chatToggle=$('rplChatToggle');
    if(messages&&chatToggle){
      messages.querySelector('.rpl-chat-heading')?.remove();
      chatToggle.setAttribute('aria-label','Apri messaggi');
      chatToggle.setAttribute('title','Apri messaggi');
      chatToggle.innerHTML='<span aria-hidden="true">💬</span>';
      let row=$('rplPlayerQuickActions');
      if(!row){
        row=document.createElement('div');row.id='rplPlayerQuickActions';row.className='rpl-pay-toggle-row';
      }
      /* Keep the two compact controls beside "Le mie partite", not at the bottom of the dashboard. */
      const matchesControl=Array.from(host.querySelectorAll('button,a,[role="button"]')).find(el=>/le mie partite/i.test((el.innerText||el.textContent||'').trim()));
      if(matchesControl && matchesControl!==row && !row.contains(matchesControl)){
        matchesControl.insertAdjacentElement('afterend',row);
      }else if(!row.isConnected){
        chatToggle.insertAdjacentElement('beforebegin',row);
      }
      if(chatToggle.parentElement!==row)row.appendChild(chatToggle);
      const payButton=$('rplPayPlayerToggle')||document.createElement('button');
      payButton.type='button';payButton.id='rplPayPlayerToggle';payButton.className='rpl-pay-open-btn';
      payButton.setAttribute('aria-controls','rplPayPlayerCard');payButton.setAttribute('aria-expanded','false');
      payButton.textContent='💳 ROYAL PAY';
      if(!payButton.parentNode)row.appendChild(payButton);
      payButton.addEventListener('click',()=>{
        const opening=section.classList.contains('hidden');
        section.classList.toggle('hidden',!opening);
        payButton.setAttribute('aria-expanded',String(opening));
        payButton.textContent=opening?'✕ CHIUDI PAY':'💳 ROYAL PAY';
        if(opening)loadPlayer();
      });
      /* Royal Pay is a standalone full-width panel, not a child of the messages/buttons card. */
      section.classList.add("rpl-pay-player-panel");
      section.classList.add("hidden");\n      payButton.setAttribute("aria-expanded","false");\n      payButton.textContent="💳 ROYAL PAY";\n      messages.insertAdjacentElement("afterend",section);
    }else{
      const bet=$('rplRoyalBetCard'); if(bet?.parentNode)bet.insertAdjacentElement('afterend',section);else host.prepend(section);
    }
    $('rplPayPlayerRefresh').addEventListener('click',loadPlayer);
  }
  async function getPlayer(){
    const {data:{user},error}=await window.sb.auth.getUser();if(error||!user)throw new Error('Accedi all’Area Giocatori per consultare i pagamenti.');
    const {data,error:e}=await window.sb.from('player_accounts').select('player_id').eq('user_id',user.id).maybeSingle();
    if(e)throw e;if(!data?.player_id)throw new Error('Account giocatore non associato.');
    return {user,playerId:data.player_id};
  }
  async function loadPlayer(){
    const list=$('rplPayPlayerList');if(!list)return;list.innerHTML='Caricamento quote…';
    try{
      const {playerId}=await getPlayer();
      const wallet=await window.sb.from('rpl_pay_wallets').select('balance_eur,updated_at').eq('player_id',playerId).maybeSingle();
      if(wallet.error)throw wallet.error;
      const bal=Number(wallet.data?.balance_eur||0);
      $('rplPayWalletSummary').innerHTML='<div class="rpl-pay-grid"><div><b>Saldo Royal Pay</b><div style="font-size:27px;font-weight:900;color:'+(bal<0?'#ff7b86':'#72e5ae')+'">'+euro(bal)+'</div></div><div><b>Ultimo aggiornamento</b><div class="rpl-pay-muted">'+(wallet.data?.updated_at?new Date(wallet.data.updated_at).toLocaleString('it-IT'):'Portafoglio pronto')+'</div></div></div>';
      const history=await window.sb.from('rpl_pay_wallet_transactions').select('amount_eur,balance_after_eur,transaction_type,note,created_at').eq('player_id',playerId).order('created_at',{ascending:false}).limit(20);
      if(history.error)throw history.error;
      $('rplPayWalletHistory').innerHTML=(history.data||[]).length?(history.data||[]).map(t=>'<div class="rpl-pay-item">'+new Date(t.created_at).toLocaleString('it-IT')+' · <b style="color:'+(Number(t.amount_eur)<0?'#ff7b86':'#72e5ae')+'">'+(Number(t.amount_eur)>0?'+':'')+euro(t.amount_eur)+'</b> · saldo '+euro(t.balance_after_eur)+'<div>'+esc(t.note||t.transaction_type)+'</div></div>').join(''):'Nessun movimento registrato.';
      const {data,error}=await window.sb.from('rpl_pay_obligations').select('id,amount_eur,status,due_date,note,created_at,charge_id,rpl_pay_charges(title,description,charge_type,club_only,status)').eq('player_id',playerId).order('created_at',{ascending:false});
      if(error)throw error;
      const rows=data||[];const due=rows.filter(x=>['unpaid','rejected','pending_verification'].includes(x.status)).reduce((n,x)=>n+Number(x.amount_eur||0),0);
      const pending=rows.filter(x=>x.status==='pending_verification').length;
      $('rplPayPlayerSummary').innerHTML='<div class="rpl-pay-grid"><div><b>Residuo da saldare</b><div style="font-size:23px;font-weight:900;color:#72e5ae">'+euro(rows.filter(x=>['unpaid','rejected'].includes(x.status)).reduce((n,x)=>n+Number(x.amount_eur||0),0))+'</div></div><div><b>In verifica</b><div style="font-size:23px;font-weight:900">'+pending+'</div></div></div>';
      if(!rows.length){list.innerHTML='<div class="rpl-pay-muted">Non risultano quote assegnate al tuo account.</div>';return;}
      list.innerHTML=rows.map(o=>{const c=o.rpl_pay_charges||{};const open=['unpaid','rejected'].includes(o.status);return '<div class="rpl-pay-item"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><b>'+esc(c.title||'Quota RPL')+'</b><div class="rpl-pay-muted">'+esc(c.description||'')+(o.due_date?' · Scadenza '+esc(o.due_date):'')+'</div></div><div style="text-align:right;white-space:nowrap"><b>'+euro(o.amount_eur)+'</b><br><span class="rpl-pay-status '+statusClass(o.status)+'">'+statusLabel(o.status)+'</span></div></div>'+(o.note?'<div class="rpl-pay-muted">'+esc(o.note)+'</div>':'')+(open?'<div style="margin-top:7px"><a class="rpl-pay-link" href="'+PAYPAL_URL+'" target="_blank" rel="noopener noreferrer">PayPal</a><a class="rpl-pay-link" href="'+REVOLUT_URL+'" target="_blank" rel="noopener noreferrer">Revolut</a><button type="button" data-pay-id="'+o.id+'" data-pay-amount="'+Number(o.amount_eur)+'">HO EFFETTUATO IL PAGAMENTO</button><div id="rplPayMethod'+o.id+'" class="hidden"><label>Metodo utilizzato</label><select id="rplPaySelect'+o.id+'"><option value="paypal">PayPal</option><option value="revolut">Revolut</option><option value="cash">Contanti</option><option value="bank_transfer">Bonifico</option><option value="other">Altro</option></select><button type="button" data-pay-submit="'+o.id+'">CONFERMA SEGNALAZIONE</button></div></div>':o.status==='pending_verification'?'<div class="rpl-pay-muted" style="margin-top:6px">La segnalazione è stata inviata. Attendi la verifica dell’operatore.</div>':'')+'</div>';}).join('');
      list.querySelectorAll('[data-pay-id]').forEach(b=>b.addEventListener('click',()=>{$('rplPayMethod'+b.dataset.payId).classList.toggle('hidden');}));
      list.querySelectorAll('[data-pay-submit]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{const id=Number(b.dataset.paySubmit);const {data,error}=await window.sb.rpc('rpl_pay_report_payment',{p_obligation_id:id,p_amount_eur:Number(list.querySelector('[data-pay-id="'+id+'"]').dataset.payAmount),p_method:$('rplPaySelect'+id).value});if(error)throw error;alert('Pagamento segnalato. È ora in attesa di verifica.');await loadPlayer();}catch(e){alert(e.message||'Errore nella segnalazione.');b.disabled=false;}}));
    }catch(e){list.innerHTML='<div class="rpl-pay-muted">'+esc(e.message||String(e))+'</div>';}
  }
  function mountOperator(){
    const host=$('operatorBox');if(!host||$('rplPayOperatorCard'))return;
    const toggle=document.createElement('button');toggle.type='button';toggle.id='rplPayOperatorToggle';toggle.className='rpl-pay-link';toggle.textContent='💶 Royal Pay';
    toggle.style.cssText='width:100%;min-width:0;min-height:44px;height:44px;box-sizing:border-box;margin:0;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:800;white-space:normal;';
    const section=document.createElement('section');section.id='rplPayOperatorCard';section.className='rpl-pay-card';section.hidden=true;
    toggle.addEventListener('click',()=>{section.hidden=!section.hidden;toggle.textContent=section.hidden?'💶 Royal Pay':'✖ Chiudi Royal Pay';if(!section.hidden)loadOperator();});
    section.innerHTML='<div style="font-size:11px;letter-spacing:.18em;color:#72e5ae;font-weight:900">ROYAL PADEL LEAGUE · CONSOLE</div><h2>💶 ROYAL PAY · GESTIONE QUOTE</h2><div class="rpl-pay-muted">Crea quote, assegna contributi e verifica manualmente i pagamenti. Le partite a Calascibetta applicano €3 ai soci registrati e €6 agli altri partecipanti selezionati.</div><div id="rplPayOpMsg" class="rpl-pay-muted" role="status" style="margin:10px 0"></div><h3>➕ Crea una quota</h3><div class="rpl-pay-grid"><div><label>Descrizione quota</label><input id="rplPayTitle" placeholder="Es. Partita 29/10 ore 21:00"></div><div><label>Tipo</label><select id="rplPayType"><option value="match">Partita</option><option value="season">Iscrizione stagione</option><option value="monthly">Quota mensile</option><option value="bimonthly">Quota bimestrale</option><option value="contribution">Contributo speciale</option><option value="custom">Altro</option></select></div><div><label>Importo per giocatore (€)</label><input id="rplPayAmount" type="number" min="0" step=".50" value="6"></div><div><label>Scadenza</label><input id="rplPayDue" type="date"></div></div><label>Note / causale</label><textarea id="rplPayDescription" rows="2" placeholder="Dettagli facoltativi"></textarea><label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input id="rplPayCalascibetta" type="checkbox" style="width:18px;min-height:18px"> Partita presso Padel Club Calascibetta (socio registrato: €3)</label><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:8px 0">Giocatori da addebitare</h3><div><button type="button" id="rplPaySelectAll">SELEZIONA TUTTI</button><button type="button" id="rplPaySelectNone">NESSUNO</button></div></div><div id="rplPayPlayers" class="rpl-pay-checks">Caricamento giocatori…</div><button type="button" id="rplPayCreateCharge">CREA QUOTA E ASSEGNA</button><hr style="border-color:#354a4a;margin:18px 0"><h3>⏳ Pagamenti in attesa di verifica</h3><div id="rplPayPendingList">Caricamento…</div><button type="button" id="rplPayRefreshPending">↻ AGGIORNA PAGAMENTI</button><hr style="border-color:#354a4a;margin:18px 0"><h3>📊 Riepilogo quote dovute</h3><div id="rplPayBalances">Caricamento…</div><hr style="border-color:#354a4a;margin:18px 0"><h3>💶 Portafogli Royal Pay</h3><div class="rpl-pay-muted">Ricariche e rettifiche sono registrate nello storico in euro.</div><div id="rplPayWalletBalances">Caricamento portafogli…</div>';
    // Put Royal Pay beside the existing console actions when possible.
    // If the action grid cannot be identified, place it at the very top of operatorBox.
    const controls=[...host.querySelectorAll('button,a,[role="button"]')];
    const betButton=controls.find(el=>/console royal bet lab/i.test(el.textContent||''));
    let actionContainer=betButton?.parentElement||null;
    if(actionContainer && actionContainer!==host && actionContainer.children.length<2) actionContainer=actionContainer.parentElement;
    if(actionContainer && betButton && actionContainer.contains(betButton)){
      if(betButton.nextSibling) actionContainer.insertBefore(toggle,betButton.nextSibling);
      else actionContainer.appendChild(toggle);
      section.style.marginTop='12px';
      actionContainer.insertAdjacentElement('afterend',section);
    }else{
      host.insertBefore(toggle,host.firstChild);
      host.insertBefore(section,toggle.nextSibling);
    }
    $('rplPaySelectAll').addEventListener('click',()=>section.querySelectorAll('[data-pay-player]').forEach(x=>x.checked=true));
    $('rplPaySelectNone').addEventListener('click',()=>section.querySelectorAll('[data-pay-player]').forEach(x=>x.checked=false));
    $('rplPayCreateCharge').addEventListener('click',createCharge);
    $('rplPayRefreshPending').addEventListener('click',loadOperator);
    loadOperatorPlayers();loadOperator();
  }
  async function loadOperatorPlayers(){
    const box=$('rplPayPlayers');if(!box)return;
    try{const {data,error}=await window.sb.from('players').select('id,name,nickname,active,is_guest,calascibetta_member').eq('active',true).order('name');if(error)throw error;
      box.innerHTML=(data||[]).filter(p=>!p.is_guest).map(p=>'<label><input type="checkbox" data-pay-player="'+p.id+'" checked><span>'+esc(p.name)+(p.nickname?' <span class="rpl-pay-muted">“'+esc(p.nickname)+'”</span>':'')+(p.calascibetta_member?' <span style="color:#72e5ae">(socio Calascibetta)</span>':'')+'</span></label>').join('');
    }catch(e){box.innerHTML='<div class="rpl-pay-muted">'+esc(e.message||String(e))+'</div>';}
  }
  async function createCharge(){
    const btn=$('rplPayCreateCharge'),msg=$('rplPayOpMsg');btn.disabled=true;
    try{
      const ids=[...document.querySelectorAll('#rplPayPlayers [data-pay-player]:checked')].map(x=>Number(x.dataset.payPlayer));
      if(!ids.length)throw new Error('Seleziona almeno un giocatore.');
      const title=$('rplPayTitle').value.trim();if(!title)throw new Error('Inserisci la descrizione della quota.');
      const amount=Number($('rplPayAmount').value);if(!Number.isFinite(amount)||amount<0)throw new Error('Importo non valido.');
      const params={p_title:title,p_description:$('rplPayDescription').value.trim()||null,p_charge_type:$('rplPayType').value,p_amount_eur:amount,p_due_date:$('rplPayDue').value||null,p_club_only:$('rplPayCalascibetta').checked,p_player_amounts:null,p_match_id:null,p_player_ids:ids};
      const {data,error}=await window.sb.rpc('rpl_pay_create_charge',params);if(error)throw error;
      msg.textContent='Quota creata correttamente (ID '+data+'). Sono state assegnate '+ids.length+' quote.';
      $('rplPayTitle').value='';$('rplPayDescription').value='';await loadOperator();
    }catch(e){msg.textContent=e.message||String(e);}finally{btn.disabled=false;}
  }
  async function loadOperator(){
    const pending=$('rplPayPendingList'),balances=$('rplPayBalances');if(!pending||!balances)return;
    pending.innerHTML='Caricamento…';balances.innerHTML='Caricamento…';
    try{
      const {data,error}=await window.sb.from('rpl_pay_payments').select('id,obligation_id,player_id,amount_eur,method,reported_at,status,operator_note,rpl_pay_obligations(id,charge_id,amount_eur,status,rpl_pay_charges(title))').eq('status','pending_verification').order('reported_at',{ascending:true});if(error)throw error;
      const payments=data||[];let playerNames={};
      if(payments.length){const ids=[...new Set(payments.map(x=>x.player_id))];const q=await window.sb.from('players').select('id,name,nickname').in('id',ids);if(q.error)throw q.error;(q.data||[]).forEach(p=>playerNames[p.id]=p);}
      pending.innerHTML=payments.length?payments.map(p=>'<div class="rpl-pay-item"><b>'+esc(playerNames[p.player_id]?.name||('Giocatore #'+p.player_id))+'</b> · '+euro(p.amount_eur)+'<div class="rpl-pay-muted">'+esc(p.rpl_pay_obligations?.rpl_pay_charges?.title||'Quota')+' · '+esc(p.method)+' · '+new Date(p.reported_at).toLocaleString('it-IT')+'</div><label>Nota operatore (facoltativa)</label><input id="rplPayNote'+p.id+'" placeholder="Nota per lo storico"><button type="button" data-pay-review="'+p.id+'" data-decision="confirm">✅ CONFERMA</button><button type="button" data-pay-review="'+p.id+'" data-decision="reject">❌ RIFIUTA</button></div>').join(''):'<div class="rpl-pay-muted">Nessun pagamento in attesa.</div>';
      pending.querySelectorAll('[data-pay-review]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{const {error}=await window.sb.rpc('rpl_pay_review_payment',{p_payment_id:Number(b.dataset.payReview),p_decision:b.dataset.decision,p_note:$('rplPayNote'+b.dataset.payReview)?.value||null});if(error)throw error;await loadOperator();}catch(e){alert(e.message||String(e));b.disabled=false;}}));
      const walletBox=$('rplPayWalletBalances');
      const [walletRows,playerRows]=await Promise.all([
        window.sb.from('rpl_pay_wallets').select('player_id,balance_eur,updated_at'),
        window.sb.from('players').select('id,name,nickname,active,is_guest').eq('active',true).eq('is_guest',false).order('name')
      ]);
      if(walletRows.error)throw walletRows.error;if(playerRows.error)throw playerRows.error;
      const walletBy={};(walletRows.data||[]).forEach(w=>walletBy[w.player_id]=w);
      walletBox.innerHTML=(playerRows.data||[]).map(p=>{const w=walletBy[p.id],balance=Number(w?.balance_eur||0);return '<div class="rpl-pay-item"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><div><b>'+esc(p.name)+'</b><div class="rpl-pay-muted">'+esc(p.nickname||'')+'</div></div><b style="color:'+(balance<0?'#ff7b86':'#72e5ae')+'">'+euro(balance)+'</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button type="button" data-wallet-recharge="'+p.id+'" data-wallet-name="'+esc(p.name)+'">RICARICA / RETTIFICA</button><button type="button" data-wallet-history="'+p.id+'">MOVIMENTI</button></div><div id="rplPayWalletHistoryOp'+p.id+'" class="rpl-pay-muted"></div></div>';}).join('');
      walletBox.querySelectorAll('[data-wallet-recharge]').forEach(b=>b.addEventListener('click',async()=>{const amountRaw=prompt('Importo in euro per '+b.dataset.walletName+' (positivo = ricarica, negativo = addebito/rettifica):');if(amountRaw===null)return;const amount=Number(amountRaw.replace(',','.'));if(!Number.isFinite(amount)||amount===0){alert('Inserisci un importo diverso da zero.');return;}const note=prompt('Causale da registrare nello storico:','Rettifica manuale Royal Pay')||'Rettifica manuale Royal Pay';const key='manual_'+b.dataset.walletRecharge+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);b.disabled=true;try{const {data,error}=await window.sb.rpc('rpl_pay_wallet_apply',{p_player_id:Number(b.dataset.walletRecharge),p_amount_eur:amount,p_transaction_type:amount>0?'topup':'manual_adjustment',p_idempotency_key:key,p_note:note,p_reference_type:'operator_manual',p_reference_id:null});if(error)throw error;alert('Operazione registrata. Nuovo saldo: '+euro(data));await loadOperator();}catch(e){alert(e.message||String(e));b.disabled=false;}}));
      walletBox.querySelectorAll('[data-wallet-history]').forEach(b=>b.addEventListener('click',async()=>{const box=$('rplPayWalletHistoryOp'+b.dataset.walletHistory);box.textContent='Caricamento…';const {data,error}=await window.sb.from('rpl_pay_wallet_transactions').select('amount_eur,balance_after_eur,transaction_type,note,created_at').eq('player_id',Number(b.dataset.walletHistory)).order('created_at',{ascending:false}).limit(10);if(error){box.textContent=error.message;return;}box.innerHTML=(data||[]).map(t=>new Date(t.created_at).toLocaleString('it-IT')+' · '+(Number(t.amount_eur)>0?'+':'')+euro(t.amount_eur)+' · saldo '+euro(t.balance_after_eur)+' · '+esc(t.note||t.transaction_type)).join('<br>')||'Nessun movimento.';}));
      const ob=await window.sb.from('rpl_pay_obligations').select('player_id,amount_eur,status').in('status',['unpaid','pending_verification','paid','rejected']);if(ob.error)throw ob.error;
      const all=ob.data||[];const pids=[...new Set(all.map(x=>x.player_id))];const names=await window.sb.from('players').select('id,name,nickname').in('id',pids);if(names.error)throw names.error;
      const by={};(names.data||[]).forEach(p=>by[p.id]={p,due:0,paid:0,pending:0});all.forEach(o=>{const r=by[o.player_id];if(!r)return;if(o.status==='paid')r.paid+=Number(o.amount_eur);else if(o.status==='pending_verification')r.pending+=Number(o.amount_eur);else r.due+=Number(o.amount_eur);});
      balances.innerHTML=Object.values(by).sort((a,b)=>b.due-a.due).map(r=>'<div class="rpl-pay-item" style="display:flex;justify-content:space-between;gap:10px"><div><b>'+esc(r.p.name)+'</b><div class="rpl-pay-muted">Pagato '+euro(r.paid)+' · In verifica '+euro(r.pending)+'</div></div><b style="white-space:nowrap;color:'+(r.due?'#ffd36b':'#72e5ae')+'">'+euro(r.due)+' da saldare</b></div>').join('')||'<div class="rpl-pay-muted">Nessun addebito assegnato.</div>';
    }catch(e){pending.innerHTML='<div class="rpl-pay-muted">'+esc(e.message||String(e))+'</div>';balances.innerHTML='';}
  }
  function init(){
    addStyle();
    let attempts=0;
    const boot=()=>{
      attempts++;
      if(!window.sb){
        if(attempts<80)window.setTimeout(boot,250);
        return;
      }
      const attach=()=>{if($('playerDashboard')&&!$('playerDashboard').classList.contains('hidden'))mountPlayer();if($('operatorBox')&&!$('operatorBox').classList.contains('hidden'))mountOperator();};
      attach();
      const observer=new MutationObserver(attach);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
      document.addEventListener('click',e=>{if(e.target.closest('#playerAreaBtn'))setTimeout(attach,250);if(e.target.closest('#adminBtn,#rplTopAdminBtn'))setTimeout(attach,400);});
    };
    boot();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();