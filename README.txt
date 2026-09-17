ROYAL PADEL LEAGUE — V4 ONLINE

Questa versione collega la pagina a Supabase.

FILE:
- index.html              applicazione web
- supabase_schema_v4.sql  policy RLS per scritture operatori
- README.txt              istruzioni

CONFIGURAZIONE GIÀ INSERITA:
- Supabase URL del progetto
- Supabase publishable key

IMPORTANTE:
La publishable key è destinata al frontend. NON inserire mai una service_role key nel sito.

PRIMA DI PUBBLICARE:
1. In Supabase SQL Editor esegui supabase_schema_v4.sql.
2. Verifica che l'utente operatore sia presente in public.operators.
3. Apri index.html e prova:
   - Classifica pubblica
   - Area operatori
   - login con l'account creato
   - inserimento di una partita di prova
4. Se il test è OK, carica index.html su GitHub Pages.

REGOLE IMPLEMENTATE:
- Fasce fisse fino al 30/10/2026.
- Dal 01/11/2026 la fascia viene calcolata sulla classifica precedente alla partita.
- La fascia viene salvata nello snapshot match_players e non cambia retroattivamente.
- Set vinto: somma dei valori fascia dei due avversari.
- Game vinto: +0,30 per giocatore.
- Set giocato: +0,10 per giocatore.
- Base: ((PT Set + Game*0,30 + Set*0,10) / Set) * 10.
- MVP: +1,50.
- Imbattuto: +1,00.
- X3/X4 non assegnano punti.
- MVP e Imbattuto possono essere multipli.
