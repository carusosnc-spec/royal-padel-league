# Royal Bet Lab — stima quote dallo storico RPL

Il modulo `js/royal-bet-odds.js` è una libreria di calcolo senza scritture DB. Non apre mercati e non modifica quote automaticamente.

## Input
Passare soltanto set di partite con risultato confermato/approvato, con:
- `pair_a_player_1`, `pair_a_player_2`
- `pair_b_player_1`, `pair_b_player_2`
- `games_a`, `games_b`

Questi campi corrispondono allo schema della tabella `sets`. Il chiamante deve filtrare i set tramite `matches.is_confirmed = true` e/o `approval_status` coerentemente con il flusso ufficiale RPL.

## Esempio
```html
<script src="./js/royal-bet-odds.js"></script>
<script>
  const history = window.RoyalBetOdds.buildHistory(confirmedSetRows);
  const estimate = window.RoyalBetOdds.estimatePairWin(history, [12, 18], [4, 9]);
  const selections = window.RoyalBetOdds.marketSelections([
    {selection_key:'pair_a', selection_label:'Coppia A', probability:estimate.probabilityA},
    {selection_key:'pair_b', selection_label:'Coppia B', probability:estimate.probabilityB}
  ], 0.08);
</script>
```

## Metodo e limiti
- Usa vittorie/sconfitte individuali, differenziale game e risultati storici della stessa coppia.
- Applica smoothing ai campioni piccoli e riduce la forza della sinergia coppia se le partite giocate insieme sono poche.
- Riporta le probabilità a una somma pari a 1 e applica un margine configurabile alle quote.
- Non include ancora ranking Elo, fasce aggiornate, contesto del campo, affaticamento, condizioni meteo o dati specifici per MVP/imbattuto.
- Le stime sono euristiche, non probabilità validate statisticamente. Devono essere confrontate con lo storico reale prima di pubblicarle.

## Passaggio successivo necessario
Il servizio di generazione deve leggere set approvati, costruire le selezioni ammissibili per il tipo di mercato, calcolare le quote, chiamare la RPC amministrativa di creazione gruppo e rendere l'operazione idempotente. La pubblicazione automatica resta disattivata fino al collaudo in staging.
