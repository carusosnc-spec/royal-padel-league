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
- I moduli player/operator sono montati nell'`index.html` del solo branch `royalbet-rebuild-foundation`: scheda Royal Bet nell'Area Giocatori e voce dedicata nell'Area Riservata protetta. `main` e il sito di produzione non sono stati modificati.
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


## Verifiche tecniche aggiuntive — 18 ottobre 2026

- Confrontate le query del modulo con le colonne reali di `rpl_bet_markets`, `rpl_bet_wagers`, `rpl_bet_wallets`, `rpl_bet_wallet_transactions`, `rpl_bet_predictions`, `player_accounts`, `matches`, `sets`, `match_awards` e `calendar_matches`: i campi usati dal pannello giocatore esistono nello schema corrente.
- Verificati gli argomenti delle RPC chiamate dal pannello e dalla console: `rpl_place_bet(p_market_id, p_selection_key, p_stake, p_idempotency_key)`, `rpl_admin_update_bet_market_odds(p_market_id, p_odds)`, `rpl_admin_set_bet_market_status(p_market_id, p_new_status)`, `rpl_settle_bet_market(p_market_id, p_winning_selection_key)`, `rpl_void_bet_market(p_market_id, p_reason)`.
- La liquidazione è una RPC `SECURITY DEFINER` e verifica che l'utente autenticato appartenga a `operators`. Liquida l'intero gruppo identificato da ambito, tipo, set, partita e stagione, quindi la selezione vincente va confermata con attenzione.
- Le policy attualmente presenti su `rpl_bet_predictions` consentono SELECT a `anon, authenticated` e anche INSERT/UPDATE a tali ruoli. È una superficie di accesso troppo ampia: la migrazione proposta rimuove le policy di scrittura e limita la lettura agli autenticati. La migrazione resta NON applicata.
- Il modulo player aveva un separatore di riga letterale che avrebbe causato errore di sintassi: corretto nel commit `cd607dd`.
- Controllo sintattico JavaScript superato per i tre moduli e il test. Eseguita anche una prova isolata del motore quote con dati sintetici: probabilità complementari, somma delle probabilità pari a 1 e quote superiori a 1. Il test runner Node e i test end-to-end non sono ancora stati eseguiti.


## Verifica dell'integrazione precedente — 18 ottobre 2026

- Ispezionato il pacchetto corrente `RPL_RIMOZIONE_ROYAL_BET_LAB_v9.1.76.zip` e confrontato con `RPL_Royal_Bet_Lab_v9.1.70.zip`. Il pacchetto corrente contiene pagine Royal Bet disattivate e ha rimosso dal `index.html` il collegamento nell'Area Giocatori, la scheda nella console operatore e il bridge di sessione dell'iframe.
- La vecchia versione 9.1.70 includeva un bridge `postMessage` per trasferire la sessione Supabase dalla pagina RPL alle pagine Royal Bet, senza richiedere un nuovo accesso. Il ripristino integrale di quell'`index.html` non è una soluzione sicura: è una versione precedente e può perdere modifiche introdotte dopo la 9.1.70.
- La pagina storica salva inoltre pronostici in `rpl_bet_predictions` dal client; le policy attuali consentono ancora scritture ai ruoli anonimo/autenticato. Non va riattivata alla cieca prima di aver limitato le policy e verificato quali schermate dipendono da tali scritture.
- Decisione: mantenere il ramo di lavoro separato e integrare puntualmente i moduli nella versione corrente, senza ripristinare il vecchio `index.html`. Il montaggio è stato applicato con script idempotente e verificato da GitHub Actions; prima del rilascio servono test con sessioni reali di staging, verifica mobile e controllo di regressione sull'intera RPL.


## Generazione automatica — vincoli confermati dallo schema live

- La tabella calendario contiene quattro giocatori (player_1…player_4) e non memorizza le coppie previste per ciascun set. Poiché la RPL ruota i partner tra i set, non è corretto creare quote per vincitore di set usando una coppia fissa derivata dall'ordine dei quattro giocatori.
- La tabella sets registra le coppie effettive e il punteggio; matches contiene is_confirmed, approval_status e i riferimenti di convalida. Lo storico per il motore quote deve provenire esclusivamente da set associati a match ufficialmente confermati e con punteggio valido.
- I vincoli live confermano che ogni riga mercato deve avere market_scope='match' con calendar_match_id non nullo e season_key nullo, oppure market_scope='season' con season_key non nullo e calendar_match_id nullo. Le quote devono essere > 1; le probabilità teoriche, se presenti, devono essere strettamente tra 0 e 1.
- Il generatore non deve aprire automaticamente mercati né inserire direttamente righe dal browser. Prima fase prevista: pianificatore dry-run che produca proposte deterministiche, controlli di duplicato e motivi di esclusione; solo dopo test e autorizzazione server-side le proposte potranno essere salvate come draft.
- Per mercati match, il generatore deve richiedere coppie per set già definite dal calendario o un input esplicito dell'operatore. In assenza di questa informazione deve fermarsi senza generare mercati di vincitore set. Per i mercati di stagione, la chiave stagione e la definizione ufficiale del vincitore/podio devono essere esplicite e non dedotte da una data presunta.
- La protezione dei pronostici e la generazione automatica sono due attività distinte: la migrazione di hardening resta solo proposta e non è stata applicata a produzione.
