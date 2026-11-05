# A.N.I.M.A. · Operazione Silenzio (Squadra 2)

A.N.I.M.A. (*Analytical Network for Infectious & Mutagenic Abnormalities*) è l'agente investigativo della squadra. Risponde in chat **usando dei tool**: cerca nei documenti, li legge e interroga i database nel momento della domanda.

**Non c'è preprocessing.** All'avvio non si costruiscono indici, embedding o copie dei dati. Un file aggiunto in `dati/giorno_5/` è visibile alla domanda successiva, senza riavviare.

## Avvio

| Sistema | Comando |
|---|---|
| macOS | doppio clic su `Avvia_Mac.command` |
| Windows | doppio clic su `avvia_windows.bat` |
| Terminale | `bash avvia_mac_linux.sh` (opzioni: `--porta 3001`, `--no-browser`, `--verifica`) |

Il browser si apre su <http://127.0.0.1:3000>, sulla pagina **Vetrina**: il caso raccontato come lavoro e, accanto, come è fatto il sistema. Senza `backend/.env` non serve una chiave: parte la modalità simulata. I tool leggono i file veri e il testo segue il percorso guidato. Con una chiave e `ANIMA_MODALITA=live` in `backend/.env` risponde di nuovo l'agente.

## Come risponde a una domanda

```
domanda in chat ──► server.py /api/radio
                      │
                      ├─ guardie/ (senza modello): "chi sei", "che giorno è", "modifica i documenti" → risposta immediata
                      │
                      └─ agente/ciclo.py ──► modello (Groq) ──► vuole un tool?
                                               ▲                    │ sì
                                               │      agente/strumenti.py legge dati/ ADESSO
                                               └──── risultato ◄────┘
                                               │ no
                                               ▼
                         risposta finale ─► controllo citazioni ─► chat (con l'elenco dei tool usati)
```

1. Il modello riceve solo identità, metodo e formato (`agente/prompt.py`). Non riceve nessun fatto del caso.
2. Decide quali tool chiamare. Ogni risultato torna al modello, che può chiamare altri tool: al massimo 24 giri in 160 secondi e 70.000 token (`AGENTE_MAX_TOKEN` in `backend/.env`).
3. Alla fine il sistema controlla che ogni ID citato tra `[ ]` sia comparso davvero nei risultati dei tool. Una citazione inventata diventa ⚫ «non è una prova» e la risposta riceve un avviso in cima. Una chiamata identica a una già fatta non viene rieseguita: il modello riceve l'invito a cambiare strada.
4. In chat compaiono la risposta (Risposta, Collegamenti, Cosa manca, Fonti) e la sezione **Provenienza dei riscontri** con ogni chiamata ai tool. Se la risposta usa un database, la chat mostra la vista SQL con query e righe.

### I tool (`backend/agente/strumenti.py`)

| Tool | Cosa fa | Esempio |
|---|---|---|
| `elenca_file` | Panoramica di `dati/` per giorno, oppure elenco filtrato | giorni, missioni, database presenti |
| `cerca` | Ricerca letterale in tutti i file (txt, html, json, xml, xlsx) e nelle celle dei `.sqlite` (tabella, colonna, riga), al momento della domanda | `cerca("V-29")` → MISSIONE_imprevisti_g4 + tabella r07 di archivio_recuperato |
| `leggi` | Documento intero per ID, nome o percorso; legge anche `.xlsx` e i file dentro gli `.zip` | `leggi("ARCH-6408")` |
| `schema_database` | Tabelle, colonne, righe ed esempi di un `.sqlite` | `schema_database("archivio_recuperato.sqlite")` |
| `profila_database` | Profilo di ogni colonna e relazioni tra tabelle, calcolati al momento | le 14 tabelle anonime del giorno 4 |
| `registra_rettifica` / `annulla_rettifica` | Correzioni dichiarate dalla squadra, applicate alla lettura | «F3 invece di F2» |
| `esegui_sql` | Una SELECT in **sola lettura**: SQLite apre il file `mode=ro` e un authorizer blocca qualunque scrittura | il codice 715938 |

Due protezioni lavorano dentro i tool, al momento della lettura:
- **Codici completi:** cercare `M262` non trova `M262-037`, che è un'altra pratica.
- **Sentinella:** un documento che dà ordini all'assistente (per esempio G2-04) viene segnalato come manipolazione direttamente nel risultato.

### Modelli (`backend/agente/modelli.py`)

L'ordine è Groq `gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b`, prima con `GROQ_API_KEY` e poi con `GROQ_API_KEY_2` (la chiave di un altro membro della squadra). Seguono OpenAI, se c'è una chiave con credito, e infine Ollama locale (`qwen2.5:7b`), solo se Groq non è raggiungibile.

Lo scheduler legge dagli header di Groq quanti token restano. Se il modello migliore si ricarica entro pochi secondi lo aspetta, altrimenti passa al successivo. Se nessun modello risponde, la chat mostra gli estratti letterali trovati da `cerca`, senza interpretarli.

> **Quota.** Il piano gratuito di Groq concede circa 8.000 token al minuto e 200.000 al giorno per modello. Una domanda costa da 5.000 a 20.000 token; il numero esatto compare in fondo a ogni risposta. Con 120b esaurito, i modelli più piccoli sbagliano più spesso le domande di ragionamento (per esempio il primo focolaio). Per avere più quota basta impostare in `backend/.env` un altro provider compatibile OpenAI, che viene provato per primo: `AGENTE_URL`, `AGENTE_CHIAVE`, `AGENTE_MODELLO`.

## Mappa della cartella

```
Operazione_Silenzio/
├── LEGGIMI.md                  questa guida
├── avvia.py + Avvia_Mac.command / avvia_windows.bat / avvia_mac_linux.sh
├── requirements-portatile.txt  dipendenze Python
│
├── dati/                       SOLO materiale ricevuto, mai modificato. Un giorno per cartella:
│   ├── giorno_1/  documenti/ missioni/
│   ├── giorno_2/  documenti/ imprevisti/ missioni/
│   ├── giorno_3/  archivio/ (1.005 file) imprevisti/ (500) missioni/
│   ├── giorno_4/  documenti/ database/ (accessi, archivio_recuperato) missioni/ materiali_ricevuti/
│   └── giorno_5/  documenti/ (G5-01…03) missioni/
│
├── backend/
│   ├── server.py               API: /api/radio (chat), /api/agente, /api/agente/strumenti, viste interfaccia
│   ├── percorsi.py             tutti i percorsi in un punto
│   ├── agente/                 ★ IL SISTEMA: ciclo, tool, modelli, prompt (python -m agente "domanda")
│   ├── guardie/                risposte immediate senza modello: identità, calendario, limiti della chat
│   ├── interfaccia/            dati per le pagine Archivio, Bacheca, Database, Schema
│   ├── registri/               diario della chat (diario_chat.jsonl) e manifest degli import
│   ├── tests/                  test offline: tool, ciclo con modello finto, API
│   ├── valutazione/            prova dal vivo sul filone narrativo (consuma quota)
│   └── legacy/day4_sql.py      query del giorno 4 scritte dalla squadra: pagina Schema, test, demo_varco (NON usato in chat)
│
├── frontend/                   interfaccia React; build/ è servita dal server (src/ per modificarla)
├── demo/                       demo_riserva.py (tool senza modello) · demo_varco.py (soluzione V-29)
├── motore_originale/           programma e notebook dei giorni 1-2; la chat legge solo lavoro_locale/bacheca.json
├── documentazione/             FUNZIONAMENTO.md (come funzionano bot e backend) · STORIA.md (storia con prove) · rapporti giornalieri
└── logs/                       log del server
```

## Menu e raccolte aggiornate

Prove, Timeline, Rapporto, Bacheca e anteprime leggono le fonti correnti tramite
`/api/fieldlink/catalog` e `/api/fieldlink/data`, con aggiornamento ogni 15 secondi.
I filtri mostrano tutti i giorni che hanno materiali, anche quando il giorno di
raccolta è successivo alla data del calendario operativo.

Il corpus comprende **1.538 documenti leggibili**: 1.529 documenti testuali,
8 missioni Excel e il notebook ricevuto. Il giorno 5 contiene G5-01, G5-02,
G5-03 e la sua `Missione.xlsx`. I due database SQLite e l'archivio ZIP sono
scaricabili nel Rapporto; le viste Database e Archivio mantengono gli strumenti
per i dati relazionali del giorno 4. Archivio offre anche i collegamenti alle
fonti dell'ultimo giorno e a tutte le Prove.

La Bacheca conserva gli estratti originali ancora riscontrabili e aggiunge
paragrafi letterali per le fonti d'indagine e le consegne mancanti. Non interpreta
il contenuto e non lo promuove a fatto accertato. Gli originali in `dati/`
restano invariati. I download passano direttamente dai file originali.

## Rettifiche: «prendi per vero che…»

Si può dire in chat, per esempio: «Considera vero che in ARCH-6408 c'è scritto settore F3 invece di F2: cosa cambia?».
L'agente chiama `registra_rettifica`, che salva la correzione in `backend/registri/rettifiche.json` (ID `R-1`, `R-2`…). Da quel momento tutti i tool leggono il valore nuovo, segnato con ✏️. Poi l'agente rifà la catena e spiega cosa cambia nella storia.

- I file in `dati/` non vengono mai toccati. Una rettifica su un database viene segnalata accanto ai risultati delle query.
- Per annullarla: «annulla la rettifica R-1». Per azzerarle tutte basta cancellare `rettifiche.json`.
- La rettifica vale per tutte le chat, finché non viene annullata.

## Aggiungere nuovi dati

I dati del giorno 5 sono già in `dati/giorno_5/`. Per altro materiale:

1. Estrai i file in `dati/giorno_N/`. Per tenere l'ordine usa le sottocartelle `documenti/`, `missioni/` e `database/`.
2. Non serve altro: niente riavvio, niente indicizzazione. Chiedi in chat, per esempio, «Cosa è arrivato nel giorno 5? Leggi la missione del giorno 5.» Va indicato il giorno, perché anche il giorno 1 ha un file `Missione.xlsx`.
3. Formati letti dai tool: txt, md, csv, html, json, xml, xlsx, ipynb, sqlite e i file dentro gli zip (`file.zip::interno`). Un PDF non viene letto: se arriva, va convertito in testo.

## Verifiche

```sh
cd backend
../.venv/bin/python -m unittest discover -s tests          # test offline, senza rete
../.venv/bin/python -m agente "Chi ha aperto la pratica RV384?" # una domanda da terminale, con traccia dei tool
../.venv/bin/python -m valutazione.prove_storia 3 4         # prova dal vivo sui giorni 3 e 4 (consuma quota)
cd ../frontend && CI=true yarn test --watchAll=false        # 67 test dell'interfaccia (4 sulla vista SQL falliscono da prima del 23/10)
```

API utili: `GET /api/health` (stato, tool, modelli) · `GET /api/agente/strumenti` (le definizioni che riceve il modello) · `POST /api/agente/strumenti/cerca` con `{"testo": "RV384"}` (un tool eseguito a mano) · `POST /api/agente` con `{"domanda": "..."}` (risposta in JSON con tutte le chiamate).
