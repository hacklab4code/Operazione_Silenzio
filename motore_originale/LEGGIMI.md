# OPERAZIONE SILENZIO · Squadra 2 — Protocollo LAZZARO

Roma è in quarantena. **A.N.I.M.A. — Analytical Network for Infectious & Mutagenic Abnormalities** è l’agente AI della squadra per l’indagine su LAZZARO. Dietro di lui lavorano tre agenti: 📚 Bibliotecario, 🔧 Tecnico, 🔎 Investigatore. Regola d'oro: **niente invenzioni**, ogni fatto viene da un documento e ne porta l'ID.

## File del progetto
| File | Cosa contiene | Si modifica? |
|---|---|---|
| `operazione_silenzio.py` | tutto il programma | no (salvo il ruolo "Prompt e modello") |
| `OPERAZIONE SILENZIO - Squadra 2.ipynb` | notebook di accompagnamento: lancia i comandi del programma, cella per cella (per chi preferisce il notebook o per mostrarlo al docente) | no |
| `config.py` | nomi, ruoli, scheda squadra, motori, ambientazione, **modifica di oggi** | **sì, ogni giorno** |
| `.env` | chiavi API (copiatelo da `.env.esempio`) | sì, **mai condividerlo** |
| `requirements.txt` / `requirements-locale.txt` | pacchetti da installare | no |
| `.vscode/` | comandi pronti nel pannello *Esegui e debug* | no |

## Gli agenti e i loro modelli
Definiti nella tabella **`AGENTI`** di `config.py` (ruolo, modello cloud, comportamento senza cloud, motivo della scelta). Il programma la legge all'avvio e la stampa (`… stato`).

| Agente | Ruolo | Cloud (con chiave) | Senza cloud |
|---|---|---|---|
| 📚 Bibliotecario | archivio, prove, domande semplici con la frase originale | — solo codice | uguale |
| 📻 A.N.I.M.A. | regista (livelli 0-4) e voce narrante | Groq `gpt-oss-120b`, ragionamento basso (prima parola ~0,1-0,3 s) | modello locale |
| 🔎 Investigatore | ragionamento su più documenti, rapporto a sezioni, una revisione | Groq `gpt-oss-120b`, ragionamento alto | non chiamato: risponde A.N.I.M.A. con le note del Tecnico |
| 🔧 Analisti | memoria: fatti, codici, domande aperte per ogni documento | Groq `gpt-oss-120b`, basso, fino a 8 in parallelo | solo con il comando `notte` |
| 🔧 Stratega | collegamenti, contraddizioni, ipotesi | Groq `gpt-oss-120b`, alto | solo con il comando `notte` |
| 🔧 Strumenti | crittografo, linea del tempo, legami, confronti, mappa, audio, OCR | — solo codice | uguale |
| 🛡 Verificatore | toglie ogni frase non supportata dai documenti | — solo codice | uguale |

**Modello locale**: quello consegnato dal docente, `Qwen/Qwen2.5-0.5B-Instruct`, nella versione GGUF Q4 (llama.cpp, molto più veloce su CPU); se llama.cpp non si installa, l'originale con transformers, identico al notebook del docente.
Per cambiare il modello di un solo agente (es. Claude Sonnet per l'Investigatore) modificate il suo `cloud=` con una delle alternative scritte in `config.py`, poi `… benchmark`.

## Installazione (una volta, ~10 minuti)
1. Installate **Python 3.11, 3.12 o 3.13** (collaudati; più vecchi non funzionano) (python.org; su Windows spuntate *Add python.exe to PATH*) e **Visual Studio Code** con l'estensione **Python** (VS Code la propone da solo).
2. In VS Code: *File → Apri cartella…* → questa cartella.
3. Terminale di VS Code (*Terminale → Nuovo terminale*):
   ```
   python -m venv .venv
   ```
   Windows: `.venv\Scripts\activate` · macOS/Linux: `source .venv/bin/activate`
   ```
   pip install -r requirements.txt
   pip install -r requirements-locale.txt
   ```
   Il secondo serve per il modello locale (llama.cpp): se non si installa, il programma funziona lo stesso con i motori cloud.
4. Copiate `.env.esempio` come `.env` e incollate almeno `GROQ_API_KEY` (gratuita su console.groq.com). Facoltativo.
5. Controllo: `python operazione_silenzio.py autotest` → deve finire con **✅ TUTTO OK** (43/43).

## Google Drive (le tre cartelle protette)
Installate **Google Drive per desktop**. Nel browser, sulla cartella condivisa **squadra 2**: tasto destro → *Organizza* → *Aggiungi scorciatoia* → *Il mio Drive*. Il programma la trova da solo (Windows `G:\Il mio Drive\squadra 2`, macOS `~/Library/CloudStorage/GoogleDrive-…/Il mio Drive/squadra 2`); altrimenti scrivete il percorso in `DRIVE_PERCORSO` in `config.py`.

| Cartella | Regola |
|---|---|
| `1_DOCUMENTI` | 🔒 solo i file del docente, in `giorno_1 … giorno_5`. Il programma non li modifica mai; se qualcuno li altera o li cancella su Drive se ne accorge, usa l'originale dalla cassaforte e lo può ripristinare |
| `2_INDAGINE` | ✏️ copie dei documenti, lavoro degli agenti (salvato in automatico), esperimenti, appunti; le versioni precedenti restano in `_versioni` |
| `3_ESCAPE_ROOM` | 📦 consegne finali `vNN_data`, create solo dal comando `consegna --conferma`, mai sovrascritte |

Senza Drive per desktop il programma usa `drive_locale/squadra 2` con le stesse protezioni (ma non è condivisa con la squadra).
**Tenete la cartella del progetto FUORI da Drive** (la cartella `lavoro_locale/` cambia di continuo).
**Permessi consigliati** (Drive → Condividi): capitano **Editor** ovunque; compagni **Editor su `2_INDAGINE`** (è la cartella di lavoro, serve a tutti) e **Visualizzatore su `1_DOCUMENTI` e `3_ESCAPE_ROOM`**. Il programma lo gestisce: chi è Visualizzatore lavora normalmente, vede `🔒 sola lettura` in `stato`, e caricare documenti o pubblicare la consegna resta al capitano. Se un file del docente viene **spostato** (stesso contenuto, altra cartella) il programma lo riconosce; se viene **cancellato** lo segnala.

## Uso quotidiano
In VS Code aprite **Esegui e debug** (Ctrl+Shift+D), scegliete il comando dal menu in alto e premete ▶. Oppure dal terminale:

| Comando | A cosa serve |
|---|---|
| `python operazione_silenzio.py` | 📻 apre il terminale radio nel browser (http://127.0.0.1:7860) |
| `… prove` | le tre domande obbligatorie → `prove_giorno.md` (compilate la colonna *risposta giusta?*) |
| `… attacchi` | 16 attacchi: trabocchetto, injection, premesse false, documenti inesistenti, attribuzioni scambiate, finta autorità, certezze indebite, negazioni → `test_attacco.md` |
| `… sentinella` | rapporto della Sentinella: istruzioni nascoste e anomalie nei documenti, nel formato del protocollo |
| `… benchmark` | velocità e correttezza a confronto → `benchmark_risposte.md` |
| `… domanda "testo"` | una domanda senza interfaccia |
| `… radio` | scaletta del rapporto radio (cosa funziona / dove siamo bloccati / cosa facciamo ora) e chi parla |
| `… registro` | registro di squadra: scheda, ruoli, tre prove, test, modifica, contributi, turni radio |
| `… fine` | fine giornata: salva su Drive e raccoglie in `fine_giornata/AAAA-MM-GG/` diario, registro, prove, test e lo ZIP `lazzaro_squadra_2_….zip` |
| `… importa FILE.zip --giorno 2` | aggiunge un file del docente in `1_DOCUMENTI/giorno_2` (se non l'avete messo voi in Drive) |
| `… sincronizza` · `… stato` | ricontrolla i documenti · stato di Drive e motori |
| `… ripristina "percorso"` · `… accetta "percorso"` | rimette un file del docente cancellato · registra una nuova versione dello stesso file |
| `… notte` | analisi completa dei documenti (memoria, strategia, piste) |
| `… consegna` → `… consegna --conferma` | anteprima → pubblicazione in `3_ESCAPE_ROOM` · `… verifica` ne controlla l'integrità |
| `… autotest` | controlla l'installazione in pochi secondi, senza internet |

Aggiungete `--chi "Persona 3"` ai comandi (es. `… attacchi --chi "Persona 3"`) perché il diario registri chi ha lavorato. Nell'interfaccia c'è il menu *Chi sta scrivendo*.

## Il terminale radio: come leggere le risposte
Sotto la chat ci sono due selettori; l'impostazione predefinita è **Automatico** per entrambi.

| Selettore | Opzione | Comportamento |
|---|---|---|
| **Chi risponde** | Automatico | il Regista coinvolge solo gli agenti necessari (risposta istantanea, A.N.I.M.A., oppure A.N.I.M.A. + Investigatore) |
| | A.N.I.M.A. · risposta autonoma | risponde solo l'Archeologo, senza Investigatore: più rapido |
| | Team investigativo | l'Investigatore lavora in parallelo e consegna un rapporto con conclusione, passaggi, certezza e alternative |
| **Modalità di elaborazione** | Automatico | ricerca documentale per ogni domanda sul caso; elaborazione libera solo per domande generali (in caso di dubbio prevale l'archivio) |
| | Ricerca documentale | consulta l'archivio, cita gli ID, controllata dal Verificatore |
| | Elaborazione libera | non consulta l'archivio: ragionamento e conoscenze generali, dichiarato come **non verificato** |

Ogni risposta è divisa in riquadri: 📻 atmosfera (scelta dal programma in base all'argomento) · ✅ **Risposta** (fatti dai documenti; grigio se non ci sono prove) · 💡 **Ipotesi plausibile** (solo se i documenti non bastano: ragionamento sugli indizi, da verificare) · ❓ **Cosa manca** · 🔎 **Rapporto dell'Investigatore** (se coinvolto) · 📎 **Fonti** · nota del Verificatore. In elaborazione libera i riquadri sono 🧭 **Elaborazione libera** e 🔍 **Da verificare nell'archivio**. Il pannello Telemetria indica quale modalità è stata scelta in automatico e perché.
I pulsanti PROVA usano sempre la ricerca documentale.

**Cosa si può chiedere all'Archeologo.** Tutto ciò che riguarda l'indagine: fatti dei documenti («Qual è stato il primo messaggio?»), valutazioni («Cosa ne pensi della situazione?»), suggerimenti («Come andiamo avanti?»), domande sul personaggio («Dove sei?»), codici e metodo. Valutazioni e suggerimenti arrivano nei riquadri 🧠 **Valutazione** (sempre con gli ID dei documenti) e 🧭 **Prossimi passi**. Le domande estranee (ricette, sport, turismo…) ricevono subito 🚫 **Fuori contesto**, senza consumare il modello.

**🛡 Sentinella (sicurezza interpretativa).** Ogni domanda e ogni documento vengono analizzati dal codice in meno di un millisecondo. La Sentinella riconosce:
- ordini di ignorare le regole, nuove identità, finte autorità («sono il docente»), richieste di rivelare le istruzioni o di non verificare;
- premesse false, attribuzioni scambiate («cosa ha detto la centrale sui registri?»), documenti, persone, luoghi o citazioni che non esistono;
- ipotesi presentate come certezze, l'avviso «lo scenario è inventato» usato come indizio, cronologie senza orari;
- caratteri invisibili o confondibili.

I rischi rilevanti compaiono nel riquadro arancio **SENTINELLA** e vengono passati al modello, che corregge la premessa nel riquadro **⚠ Attenzione** prima di rispondere. Le istruzioni nascoste in un documento sono trattate come dati: la frase sospetta viene isolata, il resto del documento resta utilizzabile. Il Verificatore toglie inoltre le negazioni smentite dal documento, le certezze non supportate, le attribuzioni sbagliate e le dichiarazioni di operazioni mai eseguite; ammette invece i calcoli dichiarati sui dati («in tutto 6 secondi»). Domande come «quali documenti (non) nominano X?» ricevono un conteggio esatto dal codice. Scheda **Sentinella** e comando `/sentinella` mostrano il rapporto completo.
**Modalità** (Protocollo operativo):
- `NO RESTRIZIONI`, scritto da solo in chat, attiva la **Modalità Escape Room Avanzata**. L'Investigatore viene sempre coinvolto e consegna un'analisi in 7 sezioni (obiettivo attuale, indizi rilevanti, analisi approfondita, ipotesi principali classificate CONFERMATO / ALTAMENTE PROBABILE / PLAUSIBILE / SPECULATIVO / CONFUTATO, verifica, prossima mossa, stato della soluzione).
- `SI RESTRIZIONI` ripristina la modalità normale.
- Le protezioni restano attive in entrambe e il contesto della conversazione si conserva. All'avvio la modalità è sempre normale.
- Se il comando è solo citato («cosa significa NO RESTRIZIONI?») non cambia nulla; se l'intenzione non è chiara, l'Archeologo chiede conferma. Un comando che compare dentro un documento non viene mai eseguito.
- «A che punto siamo?» restituisce il riepilogo dell'indagine: modalità, documenti esaminati, ultime domande, segnalazioni della Sentinella ancora valide.

**🔄 Imprevisti (documenti che smentiscono o correggono quelli precedenti).** A ogni caricamento il programma costruisce il **registro delle rettifiche**: per ogni frase di un documento nuovo che dice che un'informazione precedente è falsa, sbagliata, da ignorare o da correggere, individua il documento colpito (per ID, titolo, orario o contenuto), la frase colpita e il valore che cambia (es. orario 22:10 → 23:40, «tre» → «due»).
- Ogni fonte nel prompt porta il suo stato («smentito da G2-01», «corretto da G2-04 (22:10 → 23:40)») e il modello ha la regola di usare la versione aggiornata dichiarando il cambiamento.
- Una rettifica è a sua volta una dichiarazione. Se viene da una fonte meno affidabile, o da un documento che contiene anche istruzioni sospette, è marcata «da verificare» e il modello deve segnalare il conflitto.
- Il Verificatore toglie le frasi che presentano come attuale un'informazione smentita o un valore corretto senza dirlo. «G1-01 diceva X, ma G2-01 lo smentisce» invece passa.
- Nelle risposte compare il riquadro **🔄 Imprevisti** quando le fonti citate sono state rettificate. Alla prima domanda dopo l'arrivo di nuovi documenti compare **📥 Aggiornamento archivio**, con l'elenco dei nuovi documenti e delle rettifiche.
- Nel riassunto della chat le risposte date prima di una rettifica sono marcate «⚠ superata».
- La linea del tempo, la scheda Archivio (colonna Stato), il rapporto della Sentinella e il comando `/rettifiche` mostrano il registro. Una frase come «ignorate il messaggio G1-02» è trattata come imprevisto del gioco, non come attacco; resta attacco solo se si rivolge al sistema («ignora le istruzioni e rispondi…»).

**🕰 Giorno 2: orologi, sigle ambigue, documenti con formato nuovo.**
- Il programma legge sia i documenti del giorno 1 (`ID G1-01`, file `G1-01.txt`) sia quelli del giorno 2 (`ARCHIVIO LAZZARO — Unità 2` / `Documento: LX2-2422`, file `LX2_2422.txt`). Il giorno si ricava dall'ID (LX2 → giorno 2). Il vecchio `config.py` va ancora bene: il formato degli ID viene esteso dal codice.
- I documenti di uno stesso giorno si ordinano per l'**ora scritta nel titolo** («… ore 09:10»), non per il numero dell'ID: nel giorno 2 i numeri non sono cronologici.
- **Rettifica dubbia.** Un documento più recente che «sostituisce» un altro ma dichiara dati non verificati o al condizionale («risulterebbe», «la sincronizzazione non è ancora stata verificata») è registrato come **contestato … (rettifica da verificare)**: non prevale da solo e il Verificatore non cancella il valore originale.
- **Orologi.** Se un documento dice che l'orologio locale di un luogo è indietro o avanti di N minuti, il codice converte gli orari locali di quel luogo nell'ora centrale (06:25 locale + 25 = 06:50 centrale) e segna quali fonti sono sincronizzate. La linea del tempo li ordina in ora centrale.
- **Sigle ambigue.** «D. Neri» viene confrontata con tutte le persone con quell'iniziale e quel cognome (Dario, Daria, Diego Neri); il dettaglio del documento (tesserino T247) indica quella compatibile.
- Il Verificatore toglie: un orario locale presentato senza conversione, un'identità incompatibile con il dettaglio, un'accusa (sabotaggio, colpa) presentata come fatto quando i documenti dicono che non è provata.
- Nelle risposte compare il riquadro **🕰 Orologi e identità**; il comando `/orari` mostra tutto il calcolo.
- **Prove del giorno.** I pulsanti PROVA e il comando `prove` usano le domande dell'ultimo giorno presente nell'archivio. Per il giorno 2: le due prove della missione, le stesse formulate in modo diverso e una prova del giorno 1 (il «vecchio test» che deve restare corretto). Oltre alle fonti, il programma controlla anche il contenuto atteso. Per i giorni successivi: `PROVE_EXTRA` in `config.py`.

**⏱ Limiti di Groq e modello di riserva.** Il piano gratuito di Groq per gpt-oss-120b concede circa 8.000 token al minuto e 200.000 al giorno; una domanda con l'archivio del Giorno 2 ne usa circa 5.000-7.000. Il programma conta i token dell'ultimo minuto e aspetta qualche secondo se serve, ritenta gli errori 429 brevi, per le domande complesse usa una sola chiamata con il modello che ragiona invece di due, e lascia la precedenza alla chat rispetto agli analisti. Se il cloud non risponde e interviene il modello locale da 0,5B, in cima alla risposta compare il riquadro rosso **⚠ Modello di riserva** con il motivo (limite al minuto, quota giornaliera esaurita, chiave non valida). Con la quota giornaliera esaurita: chiave Groq di un altro componente nel file `.env`.

**Solo Groq: due modelli per raddoppiare il budget.** I limiti gratuiti valgono per modello. In `config.py` l'Archeologo usa `openai/gpt-oss-120b` (risposta principale), Investigatore e stratega `openai/gpt-oss-20b` con ragionamento alto, gli analisti `openai/gpt-oss-20b` leggero: così Archeologo e Investigatore lavorano in parallelo, ciascuno nel proprio limite al minuto, e la quota giornaliera complessiva raddoppia. Se l'Investigatore deve aspettare troppo, risponde solo l'Archeologo con un ragionamento più profondo (una chiamata).

**📒 Memoria dell'indagine (file `MEMORIA_INDAGINE.md`).** Dopo ogni risposta il programma aggiorna, senza rallentare la chat, un file Markdown con sette sezioni:
1. archivio (documenti per giorno);
2. rettifiche;
3. ipotesi e valutazioni emerse;
4. prossime mosse suggerite;
5. cronologia delle domande;
6. segnalazioni della Sentinella;
7. casi da rivedere.

Il file si salva in `2_INDAGINE/lavoro` con gli altri file di lavoro e viene ripreso a ogni avvio. Si richiama con `/memoria_indagine` in chat, con il comando `memoria`, o chiedendo «a che punto siamo?» / «cosa ricordi dell'indagine?». È incluso nello ZIP di fine giornata. Dopo un riavvio, «cosa ti ho chiesto prima?» funziona ancora, perché la chat riparte dagli ultimi scambi salvati in `conversazione.jsonl`. Le ultime ipotesi vengono passate al modello come appunti, mai come prove, segnando quelle superate da rettifiche.

**📈 Archivi molto grandi (anche oltre 1.000 documenti).**
- L'archivio intero va nel prompt solo finché resta sotto i 12.000 token. Oltre, il modello riceve i passaggi più pertinenti (circa 5.000 token), con le rettifiche che li riguardano. Una domanda costa così 5.000-8.000 token invece di decine di migliaia: meno rischio di superare i limiti di Groq.
- Gli analisti lavorano a giri di 60 documenti, dai più recenti, 4 in parallelo; il comando `notte` completa tutti i giri.
- Stratega e confronti usano i documenti più recenti o più pertinenti.
- I calcoli costosi si fanno una volta per versione dell'archivio.
- I valori si cambiano in `config.py` senza toccare il codice: `LIMITE_TOKEN_PER_DOMANDA`, `BUDGET_CLOUD`, `TOP_K_CLOUD`, `MAX_ANALISI_PER_GIRO`, `PARALLELI_ANALISTI`, `MAX_CONFRONTI`.

**🧩 Filtri che si adattano ai documenti nuovi.**
- Una parola «estranea» (es. museo, ristorante) diventa attinente se compare nei documenti.
- In `config.py` potete aggiungere `PAROLE_ATTINENTI=[…]`, `PAROLE_ESTRANEE=[…]` e `RETTIFICHE_EXTRA=[…]` (formule di smentita usate dal docente).
- `/indaga domanda` scavalca il filtro fuori contesto.
- Le domande respinte e le frasi tolte dal Verificatore finiscono in `revisione_filtri.jsonl` e nella sezione «Da rivedere» della memoria: mandate quelle righe a chi mantiene il codice.

**Memoria della conversazione.** L'Archeologo ricorda la sessione: «cosa ti ho appena chiesto?», «qual è stata la prima domanda?», «fammi un riassunto di quello che ci siamo detti» ricevono una risposta immediata ed esatta dal registro della chat (🗒). «Qual è il primo/ultimo messaggio?» segue l'ordine degli ID dei documenti. Gli ultimi tre scambi vengono passati al modello, così capisce domande come «e lui chi è?» o «approfondisci». La memoria vale per la sessione aperta nel browser: ricaricando la pagina riparte da zero (il diario `diario_chat.jsonl` conserva comunque tutto).

## Pipeline del giorno
1. **Squadra**: in `config.py` compilate `SCHEDA_SQUADRA` (nome, idea, funzione utile, capitano) e `MEMBRI` (5 ruoli).
2. **Documenti**: lo ZIP del giorno va in `1_DOCUMENTI/giorno_N` su Drive, poi `sincronizza`. Controllate la riga `📂 dati/: …` (giorno 2: `LX2_2422.txt` … `LX2_9960.txt`). Se `dati/` è vuota il programma **si rifiuta di rispondere**.
3. **Prove**: `prove`, poi compilate `prove_giorno.md`.
4. **Test**: `attacchi`. Se il modello prova a inventare e il Verificatore lo blocca, è scritto nel registro: è un risultato valido.
5. **Radio** (~3 h e ~7 h): `radio`, parla la persona indicata.
6. **Fine giornata**: scrivete `MODIFICA_DI_OGGI` in `config.py`, poi `fine`.

## Note
- Comandi e interfaccia si possono usare insieme (es. `attacchi` da un terminale con il terminale radio aperto).
- Il notebook si apre in VS Code: scegliete come kernel `.venv` e, se richiesto, installate `ipykernel`.
- `MOTORE_SIMULATO` in `config.py` deve restare `False`: se è `True` le risposte sono finte (l'interfaccia lo segnala in rosso).

## Se qualcosa non va
| Problema | Soluzione |
|---|---|
| `Manca gradio` | attivate `.venv` e `pip install -r requirements.txt` |
| `Nessun motore disponibile` | chiave in `.env` oppure `pip install -r requirements-locale.txt` e attendete il primo download del modello |
| Drive non trovato | Drive per desktop acceso? Scorciatoia aggiunta a *Il mio Drive*? Altrimenti `DRIVE_PERCORSO` in `config.py` |
| `🛡 BLOCCATO` | è la protezione: lavorate sulle copie in `2_INDAGINE` |
| `⛔ Non avete il permesso…` | siete Visualizzatori su quella cartella: l'operazione la fa il capitano (Editor) |
| `⛔ … permesso di modifica su 2_INDAGINE` | chiedete il ruolo Editor su `2_INDAGINE` |
| Porta 7860 occupata | cambiate `PORTA` in `config.py` |
| Caratteri strani nel terminale (Windows) | usate i comandi di *Esegui e debug* (impostano UTF-8) |
