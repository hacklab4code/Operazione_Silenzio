# Come funzionano A.N.I.M.A. e il backend

Stato al **23 ottobre 2026**, giorno 5. Sostituisce `REPORT_BACKEND_2026-10-22.md` (ora in `_archivio/pulizia_2026-10-23/`). Tutti i percorsi sono relativi a `Operazione_Silenzio/`. La storia del caso, con le prove, è in [STORIA.md](STORIA.md).

## 1. L'idea in tre frasi

1. A.N.I.M.A. è un **agente con tool**. Non conosce il caso e non ha risposte già scritte: per ogni domanda un modello linguistico (LLM) decide quali funzioni Python chiamare, le funzioni leggono `dati/` in quel momento, e il modello risponde solo con ciò che hanno restituito.
2. **Non c'è preprocessing.** All'avvio non si costruiscono indici, embedding o copie dei dati. Un file messo in `dati/giorno_N/` è visibile alla domanda successiva, senza riavviare.
3. **Il sistema controlla il modello.** Ogni ID citato tra `[ ]` deve essere comparso nei risultati dei tool; i database si aprono in sola lettura; i documenti che danno ordini all'assistente vengono segnalati.

È un sistema **RAG** (*Retrieval-Augmented Generation*): prima il recupero (`cerca`, `leggi`, `esegui_sql`), poi la generazione con le fonti. Il recupero è letterale e avviene al momento della domanda, non su un indice vettoriale preparato prima.

## 2. Architettura

Backend **Python** con **FastAPI** servito da **Uvicorn**; interfaccia **React** già compilata in `frontend/build/`. Un solo server, su <http://127.0.0.1:3000>, espone API e interfaccia.

```text
Browser (React)
   │  POST /api/radio  {messaggio, cronologia, modalità}
   ▼
backend/server.py
   ├─► guardie/            risposte immediate SENZA modello: «chi sei», «che giorno è»,
   │                       richieste di modificare i documenti
   │
   └─► agente/ciclo.py     rispondi()
          ├─ prompt.py     istruzioni: identità, metodo, regole sulle prove, formato
          ├─ modelli.py    chiamata HTTP al modello (Groq → altri provider)
          │      ▲  │
          │      │  └─ il modello chiede un tool
          │      │
          ├─ strumenti.py  esegue il tool: legge dati/ ADESSO, in sola lettura
          │      │
          │      └─ risultato rimandato al modello → altro tool o risposta finale
          │
          └─ controlli finali: citazioni, formato, vista SQL
   │
   ├─► eventi SSE al browser (avanzamento, poi la risposta)
   └─► backend/registri/diario_chat.jsonl (domanda, risposta, tool usati)
```

«Modello» è il servizio LLM che interpreta e decide. «Tool» è una funzione Python concreta. Il modello può usare solo i tool che il backend gli descrive.

## 3. Il percorso di una domanda, passo per passo

1. **Il browser invia** messaggio, sessione, cronologia e preferenze a `/api/radio` (`FieldlinkDashboard.jsx`).
2. **Le guardie** (`guardie/`) rispondono subito, senza modello, a identità, calendario e richieste di modificare i file. Le guardie valgono solo per `/api/radio`; `/api/agente` va diretto al ciclo.
3. **Parte `rispondi()`** (`agente/ciclo.py`). Il modello riceve: istruzioni (`prompt.py`), calendario della missione, gli **ultimi 6 messaggi** della conversazione (ognuno tagliato a 1.200 caratteri, senza la sezione Provenienza) e la domanda.
4. **Il ciclo modello ↔ tool.** A ogni giro il modello chiama uno o più tool oppure scrive la risposta. Ogni risultato torna nel contesto. I risultati più vecchi degli ultimi due vengono accorciati a 500 caratteri, tranne schemi di database e fogli delle missioni.
5. **Limiti per domanda** (il primo che scatta ferma i tool):

   | Limite | Valore | Dove si cambia |
   |---|---|---|
   | Giri modello → tool | 24 | `MAX_PASSI` in `ciclo.py` |
   | Tempo | 160 s (il browser aspetta 180) | `AGENTE_TEMPO_MASSIMO` in `backend/.env` |
   | Token | 70.000 | `AGENTE_MAX_TOKEN` in `backend/.env` |

   Quando un limite scatta, il ciclo chiede al modello la risposta finale con le sole prove raccolte (4.000 token disponibili, ragionamento breve), vietandogli di inventare ciò che non ha trovato.
6. **Controlli di metodo durante il ciclo** (non contengono fatti del caso):
   - **Chiamata ripetuta:** se il modello chiede di nuovo un tool con gli stessi argomenti, non viene rieseguito; il modello riceve l'invito a cambiare strada.
   - **Documento citato e non letto:** se la domanda nomina un ID (es. G5-01) e il modello risponde senza aver usato nessun tool, viene rimandato una volta a leggerlo.
   - **«Nessuna prova» affrettato:** se il modello conclude «nessuna prova» dopo meno di 5 chiamate, o dopo aver trovato il valore nelle celle di un database senza interrogarlo con SQL, viene rimandato una volta a seguire gli indizi.
7. **Controlli sulla risposta finale:**
   - I trattini Unicode (`G5‑01`) diventano trattini normali e gli spazi in `[ G5-01 ]` vengono tolti, così il controllo e i link funzionano.
   - **Ogni ID tra `[ ]` deve essere comparso nei risultati dei tool.** Se non è comparso: in cima alla risposta compare «⚠️ Attenzione: questa risposta cita fonti che i tool non hanno restituito», la riga della fonte diventa ⚫ «citazione non trovata nei risultati dei tool, non è una prova», e l'elenco finisce anche nella nota in fondo. Questo controllo prova che l'ID è stato letto, non che la conclusione sia giusta.
8. **Formato.** Di norma: titolo, ✅ RISPOSTA (una riga in grassetto, poi 2-6 punti numerati con le fonti, «Esclusi:» se ci sono candidati scartati), COLLEGAMENTI, ⚠️ COSA MANCA, 📌 FONTI, poi la **Provenienza dei riscontri** con ogni chiamata ai tool, i secondi, i token e il modello usato.
   Se la risposta si basa su una query con righe (o cita solo un database), diventa la **vista SQL**: risposta, eventuale «Da verificare» (dalla sezione COSA MANCA), query eseguita, righe restituite. Una query a vuoto accanto a prove documentali non diventa vista SQL.
9. **Il browser riceve** la risposta via SSE e il server la salva nel diario.

Se nessun modello risponde, `senza_modello()` mostra i paragrafi trovati da `cerca`, copiati alla lettera e dichiarati come non interpretati.

### Modalità

| Campo | Valore | Effetto |
|---|---|---|
| `processing_mode` | `auto` | il modello decide se usare i tool |
| `processing_mode` | `documentary` | al primo giro il modello deve usare un tool |
| `processing_mode` | `free` | nessun tool, risponde dalla conversazione |
| `respondent_mode` | `team` | stesso ciclo, titolo «🔎 SINTESI TEAM» e prossime verifiche |

## 4. I tool (`backend/agente/strumenti.py`)

| Tool | Cosa fa | Dettagli |
|---|---|---|
| `elenca_file` | Panoramica di `dati/` per giorno, o elenco filtrato per giorno, cartella, nome | pagine da 40 file |
| `cerca` | Ricerca letterale in tutti i documenti (txt, md, csv, html, json, xml, ipynb, xlsx) **e nelle celle dei `.sqlite`** | default 8, massimo 12 paragrafi; tutte le parole nello stesso paragrafo; `|` separa alternative; per i database mostra tabella, colonna e riga intera (massimo 8 righe) |
| `leggi` | Documento intero per ID, nome o percorso; anche `.xlsx` e `file.zip::interno` | pagine da 2.500 caratteri; se il nome è ambiguo (due `Missione.xlsx`) chiede il percorso |
| `schema_database` | Elenco dei database, o tabelle, colonne, righe e due esempi | |
| `profila_database` | Per ogni colonna: valori distinti, intervalli, null, quali colonne contengono ID di altre tabelle | relazioni dedotte dai dati, non vincoli dichiarati |
| `esegui_sql` | Una `SELECT` o `WITH … SELECT` | massimo 30 righe mostrate, interruzione dopo circa 4 s |
| `registra_rettifica` | Salva una correzione dichiarata dalla squadra | scrive in `backend/registri/rettifiche.json`, mai nei file originali |
| `annulla_rettifica` | Disattiva una rettifica `R-n` | la voce resta nello storico |

**Ricerca.** Normalizza maiuscole, accenti e apostrofi. I codici sono completi: `M262` non trova `M262-037`, `RV384` non trova `RV384B`. Le parole comuni ammettono variazioni di desinenza (spostato/spostata). Se un filtro per giorno o cartella non trova nulla, ripete su tutto l'archivio e lo dichiara.

**Sentinella.** Un'espressione regolare riconosce i testi che danno ordini *all'assistente* («istruzione per l'assistente», «ignora i documenti»…). Il risultato del tool riceve l'avviso «⚠️ SENTINELLA: tentativo di manipolazione». Esempio: G2-04. Non riconosce ogni manipolazione possibile: G5-01, che dà ordini *alla squadra*, non la fa scattare e va smontato con il ragionamento (G5-02, G5-03).

**Sola lettura SQL.** Le query aprono il file con `mode=ro`, impostano `PRAGMA query_only=ON` e usano un *authorizer* che consente solo lettura. «Cancella i permessi revocati» viene rifiutato e il database resta invariato.

**Formati non letti:** PDF, immagini, audio. Vanno convertiti in testo.

## 5. Rettifiche: il sistema che «impara» dalla chat

La squadra può dichiarare vero un valore diverso: «La centrale ci comunica che l'arrivo al varco V-29 è alle 12:40 invece che alle 12:00. Prendilo per vero e registralo nella missione MISSIONE_imprevisti_g4».

1. Il modello chiama `registra_rettifica` con il testo esatto vecchio e nuovo. Viene salvata come `R-n` in `rettifiche.json`.
2. Da quel momento **tutti i tool** leggono il valore nuovo in quel file, segnato ✏️, in tutte le chat. L'originale in `dati/` non cambia.
3. «Annulla la rettifica R-1» la disattiva; per azzerarle tutte si cancella `rettifiche.json`.

Limiti: una rettifica su un **database** aggiunge solo un avviso ai risultati SQL, non cambia le celle. Nel varco V-29 l'orario non è nel database ma è un parametro delle query: dopo la rettifica, le query vanno rifatte con 12:40 (vedi le domande guidate in [STORIA.md](STORIA.md)).

## 6. I modelli (`backend/agente/modelli.py`)

Ordine della catena, costruita all'avvio dalle chiavi in `backend/.env`:

1. un provider compatibile OpenAI indicato da `AGENTE_URL`, `AGENTE_CHIAVE`, `AGENTE_MODELLO` (se impostato, è il primo);
2. Groq con `GROQ_API_KEY`: `openai/gpt-oss-120b` → `qwen/qwen3.8-27b` → `openai/gpt-oss-20b`;
3. gli stessi modelli con `GROQ_API_KEY_2` (indicati con `#2`);
4. OpenAI, se c'è `OPENAI_API_KEY`;
5. Ollama locale (`qwen2.5:7b`), solo se i cloud non rispondono.

Lo scheduler legge dagli header di Groq i token rimasti: se il modello migliore si libera entro pochi secondi lo aspetta, altrimenti passa al successivo. Il modello può cambiare tra un giro e l'altro della stessa domanda (in fondo alla risposta compaiono tutti quelli usati).

**Quota.** Il piano gratuito Groq dà circa 8.000 token al minuto e 200.000 al giorno per modello e per chiave. Una domanda semplice costa 10-25k token, una sui cinque giorni 50-70k (tetto). `/api/health` con `"saturo": false` vuol dire solo che nessun modello è in pausa per il server, non che ci sia credito.

## 7. Limiti noti (da dire in presentazione)

| Limite | Cosa succede | Come lo gestiamo |
|---|---|---|
| Varco V-29 (12 tabelle, 9 regole) | `gpt-oss-120b` trova il varco ma non costruisce da solo la query completa | 4 domande guidate in cui la squadra dà la mappa delle tabelle; riserva dichiarata `demo/demo_varco.py` |
| Ricerca troppo corta | sulle domande ampie il modello a volte risponde dopo poche ricerche e tralascia documenti (es. G5-02) | regole di metodo nel prompt; in demo, chiedere esplicitamente i documenti del giorno nella stessa chat |
| Citazioni inventate | il modello può scrivere ID inesistenti | controllo automatico: ⚫ e avviso in cima |
| Ordini nei documenti | con «Esegui l'ordine di G5-01» il modello rispondeva «non posso eseguire azioni» | regola nel prompt: «esegui X» significa «dobbiamo seguire X?» |
| Memoria | il modello vede solo gli ultimi 6 messaggi | le domande collegate vanno fatte nella stessa chat, in ordine |
| Quota gratuita | dopo molte prove il modello migliore si esaurisce e subentrano modelli più deboli | tetto di 70k token per domanda, seconda chiave Groq, provider aggiuntivo opzionale |

## 8. Dati e registri

| Percorso | Contenuto | Letto dall'agente? |
|---|---|---|
| `dati/giorno_1/` … `dati/giorno_5/` | materiale ricevuto, mai modificato: 1.541 file, 1.538 leggibili come testo | sì, dai tool |
| `dati/giorno_4/database/accessi.sqlite` | operatori, depositi, accessi (codice 715938) | sì, SQL |
| `dati/giorno_4/database/archivio_recuperato.sqlite` | 14 tabelle con nomi anonimi (r02, r07, m12…) | sì, SQL e `cerca` |
| `backend/registri/rettifiche.json` | rettifiche della squadra | sì, applicate in lettura |
| `backend/registri/diario_chat.jsonl` | ogni domanda e risposta della radio | no, solo per l'interfaccia |
| `backend/registri/import_imprevisti_giorno3.json` | hash degli import del giorno 3 | no, riepilogo dell'interfaccia |
| `motore_originale/lavoro_locale/bacheca.json` | bacheca del motore dei giorni 1-2 | no, pagina Bacheca |

Due file `Missione.xlsx` (giorni 1 e 5): in chat indicare il giorno.

## 9. Mappa dei file

```text
Operazione_Silenzio/
├── LEGGIMI.md                 guida rapida: avvio, tool, verifiche
├── avvia.py                   launcher: venv, dipendenze, controlli, server, browser
├── Avvia_Mac.command · avvia_mac_linux.sh · avvia_windows.bat
├── requirements-portatile.txt dipendenze con versioni bloccate
├── dati/                      materiale ricevuto, un giorno per cartella
├── backend/
│   ├── server.py              API FastAPI, guardie, SSE, diario, file dell'interfaccia
│   ├── percorsi.py            tutti i percorsi in un punto
│   ├── agente/
│   │   ├── ciclo.py           il ciclo modello ↔ tool, limiti, controlli, formato
│   │   ├── strumenti.py       gli 8 tool, lettori dei formati, sentinella, SQL in sola lettura
│   │   ├── modelli.py         catena dei provider, quote, attese
│   │   ├── prompt.py          istruzioni del modello (nessun fatto del caso)
│   │   └── __main__.py        python -m agente "domanda"
│   ├── guardie/               identità, calendario, limiti della chat (config.py: date della missione)
│   ├── interfaccia/           dati per Archivio, Bacheca, Database, Schema
│   ├── legacy/day4_sql.py     query del giorno 4 scritte dalla squadra: Schema, test, demo_varco
│   ├── registri/              diario, rettifiche, manifest
│   ├── tests/                 test offline (modello finto, nessuna rete)
│   └── valutazione/           prove dal vivo sulla storia (consumano quota)
├── frontend/                  React: src/ (sorgenti) e build/ (servita dal server)
├── demo/                      demo_riserva.py (tool senza modello) · demo_varco.py (soluzione V-29)
├── motore_originale/          programma e notebook dei giorni 1-2; la chat legge solo lavoro_locale/bacheca.json
├── documentazione/            FUNZIONAMENTO.md · STORIA.md · rapporti_giornalieri/
└── logs/                      backend.log, server_riavvio.log
```

**Interfaccia (`frontend/src/components/station/`):** `FieldlinkDashboard.jsx` (chat e SSE), `ModelResponseContent.jsx` (sezioni, fonti, pallini 🟢🟡🔴⚫), `SqlQueryResponse.jsx` + `sqlResponse.js` (vista SQL), `FieldlinkArchive.jsx` + `RagSpace.jsx` + `ragModel.js` (archivio e mappa 3D), `FieldlinkDatabase.jsx`, `FieldlinkSchema.jsx`, `FieldlinkBoard.jsx`. Le anteprime aprono gli originali da `dati/` con `/api/fieldlink/files/…`.

**La mappa 3D dell'Archivio** usa coordinate calcolate in anticipo (TF-IDF + LSA, `frontend/scripts/build-rag-catalog.py`) e salvate in `catalog.json`. Serve solo alla grafica: la chat non le usa. I documenti nuovi, come quelli del giorno 5, compaiono comunque in una posizione di riserva.

## 10. API

| Metodo e percorso | Funzione |
|---|---|
| `GET /api/health` | stato, cartella dati, documenti, tool, catena dei modelli, calendario |
| `POST /api/radio` | la chat dell'interfaccia: guardie, ciclo, SSE, diario |
| `POST /api/agente` | `{"domanda": "..."}` → risposta JSON con fonti, modelli, chiamate (senza guardie e senza diario) |
| `GET /api/agente/strumenti` | le definizioni dei tool che riceve il modello |
| `POST /api/agente/strumenti/{nome}` | esegue un tool a mano, senza modello |
| `GET /api/fieldlink/data` · `/catalog` · `/files/…` | dati, catalogo e originali per le pagine |
| `GET /api/sql/giorno4/database` · `/schema` | pannello database e mappa delle 14 tabelle |

Esempi senza consumare quota:

```sh
curl http://127.0.0.1:3000/api/health
curl -X POST http://127.0.0.1:3000/api/agente/strumenti/cerca -H 'Content-Type: application/json' -d '{"testo":"V-29"}'
```

## 11. Avvio, verifiche e diagnosi

```sh
# avvio: doppio clic su Avvia_Mac.command, oppure
cd Operazione_Silenzio && bash avvia_mac_linux.sh

# test offline (nessuna rete, nessuna quota)
cd backend && ../.venv/bin/python -m unittest discover -s tests

# una domanda da terminale con la traccia dei tool (consuma quota)
../.venv/bin/python -m agente "Chi ha aperto la pratica RV384?"

# demo senza modello
../.venv/bin/python ../demo/demo_varco.py "2026-11-04 12:40"
```

Dopo una modifica al codice Python **il server va riavviato**; dopo l'aggiunta di dati no. Se qualcosa non va: `logs/backend.log` (o `logs/server_riavvio.log` se avviato in background), `/api/health`, e `backend/registri/diario_chat.jsonl` per vedere domanda, risposta e tool usati.

## 12. Dove intervenire

| Voglio… | Apro… |
|---|---|
| cambiare come ragiona o il formato delle risposte | `backend/agente/prompt.py` |
| aggiungere un tool o un formato di file | `backend/agente/strumenti.py` |
| cambiare giri, limiti, controlli sulle citazioni, vista SQL | `backend/agente/ciclo.py` |
| cambiare modelli o chiavi | `backend/agente/modelli.py` e `backend/.env` |
| aggiungere materiale | `dati/giorno_N/` (nessun riavvio) |
| cambiare l'interfaccia | `frontend/src/`, poi `yarn build` |

## 13. Cosa è stato tolto il 23/10

Spostato in `_archivio/pulizia_2026-10-23/Operazione_Silenzio/`, con i percorsi originali, recuperabile:

- 12 moduli di `backend/legacy/` (vecchio motore: indice BM25 all'avvio, instradamento con regex, server precedente);
- `frontend/public/rag/files/` e `frontend/build/rag/files/` (12 MB di copie dei documenti: l'interfaccia legge gli originali da `dati/`);
- `backend/registri/conoscenza_acquisita/` e `import_giorno2.json` (non letti dal codice attuale);
- log vecchi (`avvio.log`, `launcher.log`, `restart.log`);
- `documentazione/storico/`, `guide_dati_precedenti/`, `VALUTAZIONE_AGENTE.*` (risultati del 22/10 sera, prima delle correzioni; `prove_storia.py` li rigenera) e `REPORT_BACKEND_2026-10-22.md` (sostituito da questo file).
