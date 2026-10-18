# Royal Bet — quote automatiche senza approvazione operatore

## Requisito vincolante
I mercati Regular Season e vincitore del mese devono essere aggiornati automaticamente. Nessuna approvazione manuale dell'operatore è richiesta per ricalcolare probabilità, aggiornare quote, chiudere un mercato alla scadenza o bloccare una selezione matematicamente decisa. Gli operatori mantengono solo funzioni amministrative esplicite (annullamento motivato, gestione eccezioni e correzione dati).

## Scadenze
- Regular Season: 31 marzo, ore 23:59:59 Europe/Rome.
- Mercato mensile: ultimo giorno del mese, ore 23:59:59 Europe/Rome.
- I timestamp devono essere timezone-aware; non usare il fuso orario del browser.
- Un mercato scaduto non accetta puntate anche se lo stato visualizzato è ancora open.

## Ricalcolo automatico
1. Classifica e punti provengono esclusivamente dalle fonti ufficiali RPL e usano la formula e i filtri della classifica pubblica.
2. I mercati mensili usano solo risultati del mese di riferimento; la Regular Season usa la classifica cumulativa della stagione.
3. Probabilità e quote vengono ricalcolate quando cambiano i risultati/classifica e al momento di visualizzare il mercato.
4. Prima di accettare una puntata, il server ricalcola/valida la quota corrente e lo stato. Il client non è fonte attendibile.
5. La quota accettata viene congelata sulla singola puntata (odds_locked); le puntate già accettate non cambiano retroattivamente.
6. Registrare momento del calcolo e versione dell'algoritmo.

## Mercato matematicamente deciso
- Il vincitore è determinato solo se gli inseguitori non possono raggiungerlo usando il massimo punteggio ancora conquistabile secondo calendario e regole ufficiali.
- Quando il risultato è deciso, chiudere automaticamente il mercato e rifiutare nuove puntate.
- La UI può mostrare quota 0 per una selezione non puntabile; il server deve rifiutare sempre la puntata.
- Se il massimo punteggio residuo non è calcolabile con certezza, non dichiarare il mercato deciso; non accettare puntate finché i dati ufficiali sono incompleti.

## Sicurezza e coerenza
- Il controllo decisivo deve vivere in una funzione server-side/RPC protetta, nella stessa transazione che accetta la puntata.
- Vietare scritture dirette del browser a quote e stato mercati.
- Il ricalcolo automatico non richiede privilegi operatore; deve usare un percorso interno con privilegi minimi, non invocabile liberamente dagli utenti.
- La schedulazione non è l'unica protezione: anche se un job ritarda, la RPC verifica scadenza e quota al momento della puntata.
- Niente nuovi progetti, rami Supabase a pagamento, servizi esterni o infrastruttura a pagamento. Preferire calcolo su richiesta e trigger già disponibili; schedulazione solo se inclusa nel piano gratuito attivo.

## Verifiche obbligatorie
- Scadenze di fine mese e 31 marzo corrette in Europe/Rome.
- Cambi di punti e risultati aggiornano automaticamente le quote.
- Un risultato inserito in ritardo aggiorna il mercato senza intervento operatore.
- Puntata con quota vecchia o alterata nel browser rifiutata lato server.
- Puntata accettata conserva la quota bloccata.
- Mercato scaduto/deciso: puntata rifiutata lato server.
- Test per mercato mensile, Regular Season, parità, punti massimi residui sconosciuti e dati incompleti.
- Nessuna modifica ai saldi o alle puntate reali durante i test.

## Stato
Questo documento definisce il comportamento richiesto; non significa che il ricalcolo automatico sia già collegato alla classifica ufficiale o attivo in produzione. Mantenere WAGERING_ENABLED = false finché implementazione server-side e test end-to-end non sono completati.
