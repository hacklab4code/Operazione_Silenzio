# A.N.I.M.A. · Operazione Silenzio

School project by Squadra 2 at ITS Lazio Digital Academy. A tool-using investigative agent works a fictional five-day case. The public demo needs no API key: the tools read the real files, and the answers follow a guided reconstruction of the case.

La demo si apre nel browser, senza clone e senza chiave: [progettosilenzio.hacklab.digital](https://progettosilenzio.hacklab.digital).

Da questo repository, per avviarla sul proprio computer:

```sh
git clone https://github.com/hacklab4code/Operazione_Silenzio.git
cd Operazione_Silenzio
python3 avvia.py
```

Si apre <http://127.0.0.1:3000>. Senza `backend/.env` parte la vetrina simulata.

A.N.I.M.A. è l'agente della Squadra 2. A ogni domanda non conosce il caso. Può cercare nei documenti, leggerli e interrogare i database in quel momento, e la risposta deve citare solo ciò che quegli strumenti hanno mostrato.

Il caso, Operazione Silenzio, è inventato. Una città in quarantena, registri che contraddicono la centrale, un archivio sepolto, un database senza nomi di tabella, un ultimo ordine da non eseguire.

## Il lavoro

Per cinque giorni la consegna aggiungeva materiale e una missione. Il compito non era scrivere la soluzione in un documento: era costruire un sistema che la ritrovasse dalle fonti.

| Giorno | Cosa arriva | Cosa si scopre |
|---|---|---|
| 1 | Tre messaggi | Dario Neri chiede di conservare i registri originali |
| 2 | Registri e una falsa pista | Il primo focolaio è a Santa Marta, ore 01:12. Un file prova a dare ordini all'assistente |
| 3 | 1.005 voci d'archivio | La pratica RV384 porta il contenitore LUME a Pozzo Freddo, settore F2 |
| 4 | Due database e i verbali | Il codice 715938 apre il deposito. A. Vanni ha ordinato di proseguire. Il varco V-29 ha una coppia valida |
| 5 | Tre ultimi messaggi | La centrale è ECO, un automatismo. LUME va a Torre Ovest, deciso da una persona |

La competenza che il progetto mostra è questa: recupero al momento della domanda, SQL in sola lettura, un rifiuto quando un documento prova a comandare il modello, e il coraggio di rispondere «nessuna prova» se il numero non c'è.

Squadra 2: Simone, Alessio, Lorenzo, Valerio, Matteo.

## Come è fatto

```text
domanda in chat
    │
    ├─ guardie, senza modello: «chi sei», «che giorno è», «modifica i file»
    │
    └─ ciclo agente
          il modello sceglie un tool
          il tool legge dati/ adesso
          il risultato torna al modello
          alla fine ogni ID citato deve essere comparso nei risultati
```

Non c'è un indice costruito all'avvio. Un file messo in `dati/giorno_N/` è visibile alla domanda successiva.

| Pezzo | Dove |
|---|---|
| Server e chat | `backend/server.py` |
| Ciclo modello ↔ tool | `backend/agente/ciclo.py` |
| Tool, sentinella, SQL in sola lettura | `backend/agente/strumenti.py` |
| Percorso guidato della vetrina | `backend/vetrina/simulazione.py` |
| Interfaccia | `frontend/src` |
| Caso, giorno per giorno | `documentazione/STORIA.md` |
| Architettura per esteso | `documentazione/FUNZIONAMENTO.md` |

Il varco V-29 incrocia dodici tabelle anonime. Da solo, con la quota gratuita, il modello trova il varco e non chiude tutte le regole. La trasmissione della vetrina lancia `verifica_varco`, la query scritta dalla squadra.

## Avvio

Serve Python 3.11 o successivo. La prima volta lo script crea l'ambiente e installa le dipendenze.

```sh
python3 avvia.py
```

Si apre <http://127.0.0.1:3000> sulla vetrina. Da lì le trasmissioni fanno le domande in console.

Senza `backend/.env` tutta la chat è simulata: nessun modello, nessuna chiave. I tool sono quelli veri. Il testo della risposta è la ricostruzione della squadra sulle stesse prove, non una generazione nuova. I pulsanti della vetrina restano su questo percorso anche se una chiave è presente. La casella di testo, con una chiave e `ANIMA_MODALITA=live` oppure `auto`, chiama l'agente.

Per l'agente che scrive da solo: copia `backend/.env.example` in `backend/.env`, metti una chiave e imposta `ANIMA_MODALITA=live`. Il file `.env` non va messo su GitHub.

## Verifiche

```sh
cd backend
python3 -m unittest discover -s tests
```

I test della vetrina non usano la rete. Leggono i documenti del caso e la query che produce il codice 715938.
