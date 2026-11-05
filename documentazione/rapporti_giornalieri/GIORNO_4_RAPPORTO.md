> Rapporto consegnato a fine giornata, con il sistema di allora (RAG BM25 e query SQL scritte a mano, oggi in `backend/legacy/`). I percorsi citati sono quelli precedenti alla riorganizzazione del 22/10/2026.

# Giorno 4 — Il cancello nero · rapporto SQL

Aggiornato il 22 ottobre 2026. La missione richiede di collegare gli indizi raccolti al Giorno 3 con il database degli accessi e di mostrare domanda, query e righe restituite.

## Esito

Il codice dell’autorizzazione di **Dario Neri** per la pratica **RV384**, presso **Pozzo Freddo**, settore **F2**, è **715938**. La riga è attiva e valida fino alle **23:59 del 12 ottobre 2031**, quindi copre l’orario della missione (**06:00**).

## Domanda alla chat

> Qual è il codice di autorizzazione di Dario Neri per il deposito Pozzo Freddo, settore F2, pratica RV384? Usa il database degli accessi e mostra la query e le righe restituite. Considera validi solo permessi attivi e validi almeno fino al 12 ottobre 2031 alle 06:00.

## Query e risultato del tool

```sql
SELECT o.nome AS operatore, d.nome AS deposito, d.settore,
       a.pratica, a.codice, a.stato, a.valido_fino
FROM accessi a
JOIN operatori o ON o.id = a.operatore_id
JOIN depositi d ON d.id = a.deposito_id
WHERE o.nome = 'Dario Neri' AND d.nome = 'Pozzo Freddo'
  AND d.settore = 'F2' AND a.pratica = 'RV384'
  AND a.stato = 'attivo' AND a.valido_fino >= '2031-10-12 06:00';
```

| operatore | deposito | settore | pratica | codice | stato | valido_fino |
|---|---|---|---|---|---|---|
| Dario Neri | Pozzo Freddo | F2 | RV384 | 715938 | attivo | 2031-10-12 23:59 |

Il codice è stato mantenuto come testo; in questa riga non ha zeri iniziali.

## Codice e demo

- [Investigatore.ipynb](Investigatore.ipynb) include il tool SQL dopo la funzione `genera`, richiama il tool con la domanda in linguaggio naturale e mostra query, righe e spiegazione.
- Il backend locale usa [day4_sql.py](app_files/backend/day4_sql.py) e la route `/api/sql/giorno4`; le domande sul codice di accesso dalla chat radio passano allo stesso tool SQL e mostrano query e righe. SQLite resta una sorgente interrogata al bisogno, non un documento dell’indice RAG.
- [demo_riserva.py](dati/giorno_4/demo_riserva.py) è una demo offline da terminale che stampa domanda, query e risultato.
- [accessi.sqlite](dati/giorno_4/accessi.sqlite) è la copia locale del database ricevuto.
- Il file missione e il notebook SQL originale ricevuto sono conservati in `dati/giorno_4/`.

## Verifiche

- Query mirata: una sola riga, codice `715938`.
- Pratica `PX-INESISTENTE`: zero righe.
- `DELETE FROM accessi`: rifiutata da SQLite con `not authorized`; conteggio delle righe invariato (504).
- Le celle Python del notebook sono state controllate sintatticamente e le prove SQL sono state eseguite sul database in sola lettura.
- Il backend è stato riavviato: `/api/health` risponde `status: ok`; la route SQL restituisce il codice corretto e `/api/radio` mostra query e righe. Il frontend non è stato modificato.

## Provenienza degli indizi

Dal rapporto del Giorno 3: [ARCH-3097] collega Dario Neri alla pratica RV384; [ARCH-5721] collega RV384 e il contenitore LUME al deposito Pozzo Freddo; [ARCH-6408] associa Pozzo Freddo al settore F2. Il database risolve il codice e lo stato dell’autorizzazione: le prove narrative da sole non dimostravano la validità del permesso.

## Traccia per i due rapporti radio

Le chiamate previste dalla missione sono momenti della squadra e non risultano registrate in questi file. Per completarle, annotare ora e nome di chi parla; alternare la persona tra le due chiamate.

- **Prima chiamata (~3 ore):** «Funziona il collegamento tra dossier, pratica e deposito; il tool SQL legge il database e restituisce il permesso. Blocco attuale: nessuno sul codice. Ora mostriamo la query e salviamo la demo.»
- **Seconda chiamata (~7 ore):** «La query ha trovato il codice 715938, la pratica inesistente non restituisce righe e la cancellazione è negata. Blocco attuale: nessuno sul database. Ora chiudiamo il rapporto e conserviamo il pacchetto del giorno 4.»

Nel registro finale della squadra aggiungere i nomi effettivi e il contributo di ciascun partecipante; non li deduco dai file disponibili.
