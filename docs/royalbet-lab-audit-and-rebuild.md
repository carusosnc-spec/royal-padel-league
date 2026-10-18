# Royal Bet Lab — audit tecnico e piano di ricostruzione

Stato: audit iniziale completato; nessuna modifica al database di produzione.

## Vincoli funzionali confermati
- Solo giocatori ufficiali attivi possono puntare.
- Crediti virtuali, saldo iniziale previsto: 1.000 per giocatore.
- Un giocatore non può puntare su mercati della partita a cui partecipa.
- Le quote vengono bloccate nella puntata; il saldo e i crediti impegnati sono separati.
- Mercati partita e stagione: set winner, punteggio esatto, margine game, MVP, imbattuto, più/meno set vinti; campione regular season, bonus ranking, campione Finals e podio Finals.
- Liquidazione e rimborso devono essere atomici, ripetibili in sicurezza e tracciati nel ledger.
- L'interfaccia deve vivere nell'Area Giocatori già autenticata; la console operatore deve usare i controlli operatore esistenti. Non creare un secondo login.

## Stato del database osservato
- 22 giocatori totali; 18 ufficiali attivi; 18 wallet.
- Tutti i 18 giocatori ufficiali attivi hanno un wallet; nessun wallet risulta appartenere a un inattivo/ospite.
- 224 righe mercato: 52 righe in stato open; nessuna in draft o settled.
- 16 righe in rpl_bet_predictions.
- 0 puntate in rpl_bet_wagers.
- Tabelle Royal Bet esistenti: rpl_bet_markets, rpl_bet_wagers, rpl_bet_wallets, rpl_bet_wallet_transactions, rpl_bet_predictions.
- RPC esistenti: rpl_place_bet, rpl_settle_bet_market, rpl_void_bet_market, rpl_admin_cancel_bet_wager, rpl_admin_create_bet_market_group, rpl_admin_set_bet_market_status, rpl_admin_update_bet_market_odds.

## Rischi verificati nell'audit
1. **RLS troppo permissiva su rpl_bet_predictions**: le policy attuali consentono SELECT e INSERT ai ruoli anon e authenticated; inoltre UPDATE è consentito a entrambi per le righe legate a partite future. Questo permette scrittura anonima dei dati previsionali. Prima di riattivare la funzionalità, restringere l'accesso e spostare le scritture previsionali su RPC/Edge Function con autorizzazione esplicita.
2. **Mercati leggibili da ogni utente autenticato**: la policy di lettura di rpl_bet_markets è aperta a tutti gli autenticati. Verificare che questo sia compatibile con il modello di accesso e che non vengano esposti dati operativi non destinati ai giocatori.
3. **Verifica runtime mancante**: le funzioni sono state lette dal database, ma non sono ancora state testate con utenti giocatore/operatori distinti. Non dichiarare il flusso sicuro solo sulla base del codice.
4. **Automazione dei mercati/quote non dimostrata**: esistono mercati e previsioni, ma non è ancora stato verificato un processo automatico affidabile che generi i mercati dalle partite, aggiorni quote usando lo storico RPL e liquidi i mercati dopo la convalida dei risultati.
5. **Idempotenza da testare**: rpl_place_bet implementa una chiave idempotente e blocca i crediti; settlement/void usano transazioni, ma servono test per doppio invio, concorrenza e incoerenze di saldo.

## Piano di lavoro
1. Conservare questa ricostruzione in un branch separato; non toccare `main` né modificare dati reali durante i test.
2. Recuperare il codice client esistente e mappare autenticazione, associazione `player_accounts`, `operators` e struttura calendario/risultati.
3. Preparare test ripetibili per puntata, doppio invio, giocatore partecipante, saldo insufficiente, quota bloccata, settlement, void/rimborso e autorizzazione operatore.
4. Correggere prima le policy previsionali e verificare i privilegi EXECUTE delle RPC; ogni operazione finanziaria virtuale deve essere validata lato database.
5. Implementare la UI in un modulo isolato, riusando la sessione Supabase già attiva e senza un secondo accesso.
6. Generare quote dai risultati storici con un modello documentato, limiti min/max e probabilità normalizzate; registrare versione e timestamp del modello.
7. Attivare mercati/chiusure/liquidazioni automatiche solo dopo test su ambiente separato e conferma dei risultati ufficiali.
8. Integrare in RPL tramite pull request e pubblicare solo dopo verifica.

## Regole di sicurezza per la ricostruzione
- Nessuna modifica distruttiva o reset delle tabelle esistenti.
- Nessuna puntata reale: solo crediti virtuali.
- Nessuna chiave service-role nel client.
- Le autorizzazioni devono essere verificate lato server/database, non soltanto nascondendo pulsanti.
- Le modifiche alle policy e le migrazioni devono essere versionate e testate prima di applicarle alla produzione.
