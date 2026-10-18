#!/usr/bin/env python3
"""One-time, idempotent Royal Bet Lab UI mount for the isolated rebuild branch."""
from pathlib import Path
import sys

p = Path("index.html")
s = p.read_text(encoding="utf-8")
if 'id="royalBetPlayerCard"' in s and 'id="royalBetOperatorSection"' in s and 'js/royal-bet-lab.js' in s:
    print("Royal Bet Lab UI already mounted; no changes.")
    sys.exit(0)

player_anchor = '  <div id="playerDashboard" class="hidden">\n'
player_markup = '''  <div id="playerDashboard" class="hidden">
    <section id="royalBetPlayerCard" class="card" style="margin-bottom:14px;border:1px solid rgba(213,243,106,.32)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><div style="color:#d5f36a;font-weight:900;letter-spacing:.08em">ROYAL BET LAB</div><div class="muted">Crediti virtuali · mercati e pronostici RPL</div></div>
        <button type="button" id="royalBetPlayerToggle" class="primary">🎯 APRI ROYAL BET</button>
      </div>
      <div id="royal-bet-lab" class="hidden" style="margin-top:14px"></div>
    </section>
'''
if player_anchor not in s:
    raise SystemExit("Non trovo il punto di inserimento Area Giocatori; interrotto senza modifiche.")
s = s.replace(player_anchor, player_markup, 1)

tab_anchor = '<button type="button" id="opAccountsTab" onclick="showOperatorSection(\'accounts\')">👥 Account giocatori</button>'
tab_markup = tab_anchor + '\n<button type="button" id="opRoyalBetTab" onclick="showOperatorSection(\'royalbet\')">🎯 Royal Bet Lab</button>'
if tab_anchor not in s:
    raise SystemExit("Non trovo il menu Area Riservata; interrotto senza modifiche.")
s = s.replace(tab_anchor, tab_markup, 1)

section_anchor = '<div id="operatorAccountsSection" class="hidden">'
operator_markup = '''<div id="royalBetOperatorSection" class="hidden">
<div class="card">
  <h2>🎯 Royal Bet Lab · Console operatore</h2>
  <div class="muted">Gestione quote e mercati virtuali. Ogni liquidazione accredita crediti virtuali: controlla l'esito prima di confermare.</div>
  <div id="royal-bet-operator" style="margin-top:12px"></div>
</div>
</div>
''' + section_anchor
if section_anchor not in s:
    raise SystemExit("Non trovo il pannello Account giocatori; interrotto senza modifiche.")
s = s.replace(section_anchor, operator_markup, 1)

old_fn = '''function showOperatorSection(which){
  const m=$("operatorMatchSection"), c=$("operatorCalendarSection"), v=$("operatorVotingSection"), vc=$("operatorVoteConsoleSection"), p=$("operatorConfirmSection"), n=$("operatorNotificationsSection"), a=$("operatorAccountsSection");
  const mt=$("opMatchTab"), ct=$("opCalendarTab"), vt=$("opVotingTab"), vct=$("opVoteConsoleTab"), pt=$("opConfirmTab"), nt=$("opNotifyTab"), at=$("opAccountsTab");
  [m,c,v,vc,p,n,a].forEach(x=>x?.classList.add("hidden"));
  [mt,ct,vt,vct,pt,nt,at].forEach(x=>x?.classList.remove("primary"));
'''
new_fn = '''function showOperatorSection(which){
  const m=$("operatorMatchSection"), c=$("operatorCalendarSection"), v=$("operatorVotingSection"), vc=$("operatorVoteConsoleSection"), p=$("operatorConfirmSection"), n=$("operatorNotificationsSection"), a=$("operatorAccountsSection"), rb=$("royalBetOperatorSection");
  const mt=$("opMatchTab"), ct=$("opCalendarTab"), vt=$("opVotingTab"), vct=$("opVoteConsoleTab"), pt=$("opConfirmTab"), nt=$("opNotifyTab"), at=$("opAccountsTab"), rbt=$("opRoyalBetTab");
  [m,c,v,vc,p,n,a,rb].forEach(x=>x?.classList.add("hidden"));
  [mt,ct,vt,vct,pt,nt,at,rbt].forEach(x=>x?.classList.remove("primary"));
'''
if old_fn not in s:
    raise SystemExit("Non trovo la funzione showOperatorSection attesa; interrotto senza modifiche.")
s = s.replace(old_fn, new_fn, 1)
branch_anchor = '''  else if(which==="accounts"){a?.classList.remove("hidden");at?.classList.add("primary");loadAccountImportTemplate();loadPlayerAccountResetList();}
  else{m?.classList.remove("hidden");mt?.classList.add("primary");}
}'''
branch_replacement = '''  else if(which==="accounts"){a?.classList.remove("hidden");at?.classList.add("primary");loadAccountImportTemplate();loadPlayerAccountResetList();}
  else if(which==="royalbet"){rb?.classList.remove("hidden");rbt?.classList.add("primary");window.mountRoyalBetOperator?.();}
  else{m?.classList.remove("hidden");mt?.classList.add("primary");}
}'''
if branch_anchor not in s:
    raise SystemExit("Non trovo il ramo account della funzione operatore; interrotto senza modifiche.")
s = s.replace(branch_anchor, branch_replacement, 1)

script_anchor = '</body></html>'
bootstrap = '''<script src="./js/royal-bet-lab.js"></script>
<script src="./js/royal-bet-operator.js"></script>
<script>
(function(){
  let playerMounted=false, operatorMounted=false;
  const playerBtn=document.getElementById("royalBetPlayerToggle");
  const playerRoot=document.getElementById("royal-bet-lab");
  if(playerBtn && playerRoot){
    playerBtn.addEventListener("click",async()=>{
      const opening=playerRoot.classList.contains("hidden");
      playerRoot.classList.toggle("hidden",!opening);
      playerBtn.textContent=opening?"CHIUDI ROYAL BET":"🎯 APRI ROYAL BET";
      if(opening && !playerMounted){
        playerRoot.innerHTML='<div class="muted">Caricamento Royal Bet Lab…</div>';
        try{await window.RoyalBetLab.mount(playerRoot);playerMounted=true;}
        catch(e){playerRoot.innerHTML='<div class="msg err"></div>';playerRoot.querySelector('.msg').textContent=e?.message||'Impossibile caricare Royal Bet Lab.';}
      }
    });
  }
  window.mountRoyalBetOperator=async function(){
    const root=document.getElementById("royal-bet-operator");
    if(!root||operatorMounted)return;
    try{await window.RoyalBetOperator.mount(root);operatorMounted=true;}
    catch(e){root.innerHTML='<div class="msg err"></div>';root.querySelector('.msg').textContent=e?.message||'Impossibile caricare la console Royal Bet.';}
  };
})();
</script>
</body></html>'''
if script_anchor not in s:
    raise SystemExit("Non trovo la chiusura HTML attesa; interrotto senza modifiche.")
s = s.replace(script_anchor, bootstrap, 1)

p.write_text(s, encoding="utf-8")
print("Royal Bet Lab montato nell'Area Giocatori e nell'Area Riservata.")
