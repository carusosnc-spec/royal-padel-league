# Royal Bet Lab — integrazione e stato

## Moduli preparati
- `js/royal-bet-lab.js`: pannello giocatore con portafoglio, mercati aperti e ultime puntate.
- `js/royal-bet-operator.js`: console operatore per stato dei mercati, quote, liquidazione e annullamento/rimborso.
- `supabase/migrations/202610180001_royalbet_hardening.sql`: proposta di hardening, da applicare soltanto in staging dopo test.

## Montaggio previsto
I moduli non creano un client Supabase né un secondo login. Si aspettano che la pagina RPL abbia già inizializzato il client condiviso come `window.sb` oppure `window.supabaseClient`.

Area Giocatori, nel punto in cui la sessione del giocatore è già valida:

```html
<div id="royal-bet-lab"></div>
<script src="./js/royal-bet-lab.js"></script>
<script>
  window.RoyalBetLab.mount(document.getElementById('royal-bet-lab'));
</script>
```

Area Riservata, dentro il pannello già protetto per operatori:

```html
<div id="royal-bet-operator"></div>
<script src="./js/royal-bet-operator.js"></script>
<script>
  window.RoyalBetOperator.mount(document.getElementById('royal-bet-operator'));
</script>
```

Non aggiungere questi script finché non è stata verificata la variabile globale usata dal client reale della pagina. Se il client RPL ha un nome diverso, adattare il bridge nel modulo; non inizializzare un client separato.

## Funzioni e autorizzazioni verificate a livello di definizione
Le RPC attuali usano `SECURITY DEFINER`. Le definizioni ispezionate controllano `auth.uid()` e la presenza dell'utente nella tabella `operators` per:
- creare gruppi di mercati;
- aprire/chiudere mercati;
- modificare quote;
- liquidare mercati;
- annullare e rimborsare mercati/puntate.

`rpl_place_bet` controlla giocatore ufficiale attivo, mercato aperto, finestra temporale, selezione, divieto di puntare sulla propria partita, saldo e chiave idempotente. Le quote sono copiate nella puntata al momento della giocata.

## Limiti attuali
- I moduli sono preparati ma non ancora montati nell'HTML principale.
- Non è stata eseguita alcuna puntata di prova e non è stata liquidata alcuna puntata.
- La migrazione SQL non è stata eseguita.
- Non è ancora implementato il processo automatico che genera mercati e quote dallo storico, né l'attivazione automatica della liquidazione dopo la convalida dei risultati.
- La console mostra un gruppo di mercati come righe distinte; la liquidazione usa la chiave dell'esito e interessa il gruppo identificato dalla RPC esistente. L'operatore deve verificare attentamente l'esito prima di confermare.
- Il client usa i permessi del database come fonte autorevole: nascondere la console non sostituisce i controlli RPC.

## Sequenza sicura
1. Confermare il nome del client condiviso nell'HTML RPL e montare i moduli nel ramo di lavoro.
2. Eseguire test con utenti di staging (giocatore, non giocatore, operatore) e saldi fittizi.
3. Applicare la migrazione solo su staging e ripetere i test.
4. Implementare il generatore idempotente di mercati e quote basate sullo storico RPL.
5. Implementare il trigger/processo di liquidazione solo dopo la convalida ufficiale dei risultati.
6. Aprire una pull request; non unire a `main` prima della verifica funzionale e mobile.
