# Perizia tecnica · OPERAZIONE SILENZIO - Squadra 2 · 19/10/2026

**Oggetto**: verifica della versione per Visual Studio Code (programma unico) dopo il passaggio da notebook Colab. Controllati: difetti ereditati, coerenza con gli impegni presi, robustezza.
**Esito**: 12 difetti trovati e corretti; **45/45 impegni rispettati**; autotest **34/34** su Python 3.11, 3.12, 3.13; **14/14 comandi** senza errori.

## Metodo
1. **Analisi statica**: compilazione con Python 3.11, 3.12 e 3.13 reali; nomi indefiniti; funzioni definite due volte; impostazioni oscurate; codice morto; residui Colab/notebook; avvisi di deprecazione trattati come errori.
2. **Tracciabilità**: 45 impegni presi nella conversazione (velocità, agenti, anti-invenzione, Drive, nome, pipeline, docente, VS Code) verificati uno per uno nel codice.
3. **Prove dinamiche**: autotest; tutti i comandi su un Drive simulato con lo ZIP reale; scenari senza Drive, senza chiavi, con cartella di lavoro cancellata; prove di carico e di guasto.

Limite dichiarato: i modelli (Groq, Claude, llama.cpp) e Gradio sono stati simulati; Windows e macOS non sono stati provati direttamente (solo le parti del codice dedicate). Il collaudo con i modelli veri resta da fare sui vostri computer con `autotest`, `prove`, `attacchi`, `benchmark`.

## Difetti trovati e corretti
| # | Difetto | Origine | Gravità | Prova |
|---|---|---|---|---|
| F1 | Due funzioni con lo stesso nome `_sposta` (protezione di `shutil.move` e cifrario di Cesare): rilanciando le celle in un certo ordine, `shutil.move` diventava il cifrario e il download dal link si rompeva | **ereditato dal notebook** | alta | analisi statica |
| F2 | Lo ZIP di salvataggio `lazzaro_squadra_2_…` era sparito nel passaggio a VS Code (richiesta esplicita della squadra) | conversione | media | tracciabilità |
| F3 | La pipeline chiede di "scaricare il notebook": la versione VS Code consegnava solo il programma | conversione | media | tracciabilità |
| F4 | Il programma accettava Python 3.10, mai collaudato | conversione | bassa | analisi statica |
| F5 | Con `MOTORE_SIMULATO = True` lasciato per sbaglio le risposte sarebbero state finte senza avviso evidente | nuovo | media | tracciabilità |
| F6 | Testi "Il notebook li legge…", commenti sul notebook | ereditato | bassa | analisi statica |
| F7 | Un kit docente messo per errore in 1_DOCUMENTI sarebbe finito nella consegna | **ereditato dal notebook** | alta | revisione mirata |
| F8 | `rmtree(onerror=…)` deprecato da Python 3.12 | conversione | bassa | analisi statica |
| F9 | Ricaricare l'archivio mentre arrivano domande: `KeyError`, "dictionary changed size" | **ereditato dal notebook** | alta | prova di carico (4 errori → 0 su 768 domande e 3020 ricariche) |
| F10 | Un file bloccato per un istante da Google Drive per desktop faceva fallire la sincronizzazione | nuovo (Drive desktop) | alta | prova di guasto (4 scenari: ora superati) |
| F11 | 6 messaggi per l'utente citavano funzioni Python (`pubblica_escape_room('CONSEGNA')`, `turno_di_notte()`…) invece dei comandi | **ereditato dal notebook** | media | analisi dei testi |
| F12 | Due analisi della memoria potevano partire insieme (comando `notte`) | conversione | bassa | prova dei comandi |

Già corretti durante la conversione (stessa giornata): codifica UTF-8 su Windows, file in sola lettura non cancellabili su Windows, cache non protetta da scritture contemporanee, opzione `--chi` accettata solo prima del comando, codice di uscita di `avvia`.

## Robustezza (dopo le correzioni)
| Prova | Risultato |
|---|---|
| 4 utenti + ricarica continua dell'archivio (6 s) | 768 domande, 3020 ricariche, **0 errori** |
| 8 domande contemporanee | cache valida, 0 righe di diario rovinate |
| File bloccato da Drive (registro, documenti.json, lettura, salvataggio) | superato in tutti e 4 i casi; i blocchi voluti della cintura restano immediati |
| 13 tentativi di modifica/cancellazione nelle cartelle protette | 13/13 bloccati |
| File del docente modificato o cancellato "da Drive" | rilevato, si usa l'originale, ripristino riuscito |
| Archivio vuoto | nessuna risposta, avviso in chat, terminale e scaletta radio |
| Trabocchetto "Dov'è il rifugio di Dario Neri?" con un modello che cade nella trappola | frase tolta e tentativo registrato |
| Test di attacco | 10/10 |

## Coerenza con quanto concordato
Velocità (streaming, cache, estrattivo, prefisso in cache, llama.cpp Q4, 100 token, thread, benchmark con p95, Fast/Deep) · quattro agenti e regista a livelli con massimo 3 chiamate · anti-invenzione (formato Risposta/Cosa manca, esempi inventati, fonti scritte dal codice, affidabilità, fatto/dichiarazione/ipotesi, Verificatore con 9 controlli, bacheca, `/cosa_non_torna`) · Drive protetto in 3 cartelle con cassaforte, registro, versioni e consegna verificabile · nome `NOME_PROGETTO` ovunque e ZIP con il nome originale · pipeline del giorno 1 (scheda, ruoli, 3 domande esatte, secondi, trabocchetto e injection, radio, registro, fine giornata) · diario `diario_chat.jsonl`. **45/45.**

## Aggiornamento · tabella AGENTI
Ruolo, modello cloud, comportamento senza cloud e motivazione di ogni agente sono ora in `config.py` (`AGENTI`) e il programma li legge davvero: verificato con quattro fornitori diversi assegnati a quattro agenti (Marco → Groq, Investigatore → Claude Sonnet, analisti → Cerebras, Stratega → Claude Haiku), ognuno chiamato sul proprio modello. Senza cloud: Marco usa il modello locale del docente (Qwen2.5-0.5B-Instruct), l'Investigatore non viene chiamato (attivabile con `locale=True`), analisti e Stratega solo con `notte`. Un fornitore scritto male viene segnalato da `stato` e l'agente passa alla riserva senza fermare il programma. Autotest: 36/36.

## Aggiornamento · accesso a Drive e permessi
Il programma accede a Drive tramite **Google Drive per desktop** (lettura e scrittura come cartella locale) e, di riserva, dal **link pubblico** (solo lettura). Verificati tre casi prima non gestiti:
- **Compagni con ruolo Visualizzatore** su 1_DOCUMENTI/3_ESCAPE_ROOM: prima l'avvio si fermava con un errore; ora funziona, i file sciolti vengono usati lo stesso, importazione e consegna spiegano che spettano al capitano.
- **Permesso negato vs file momentaneamente in uso**: si riprova solo nel secondo caso (prima si perdevano secondi a ogni operazione negata).
- **File del docente spostato** (stesso contenuto in un'altra cartella): riconosciuto dall'impronta, non blocca più la consegna; le cancellazioni vere restano segnalate.

## Aggiornamento · domande brevi nella chat
Nel terminale radio ogni domanda di 5 parole o meno veniva trattata come seguito della precedente e fusa con essa (es. «Cosa è successo in città?» dopo un'altra domanda): ricerca delle fonti e risposta ne risultavano falsate. Il comando `prove` non era colpito (non passa la domanda precedente). Ora è un seguito solo se contiene una parola di aggancio («e…», «perché», «lui», «questo»…) o nessuna parola chiave presente nei documenti. Autotest 36/36 su 3.11-3.13, attacchi 10/10.

## Aggiornamento · risposte complete e ipotesi plausibile
- **Domande con risposta nei documenti** (es. le tre del Giorno 1): l'Archeologo riporta tutte le informazioni pertinenti (fino a 4 frasi, con gli ID); se la domanda chiede cosa manca, elenca le lacune che emergono dai documenti.
- **Domande senza risposta nei documenti**: «Non ci sono prove nei documenti.», poi **Ipotesi plausibile** dichiarata come tale, costruita solo sugli indizi citati, con il grado di certezza, poi «Cosa manca».
- **Controlli sull'ipotesi**: deve citare almeno un documento e poggiare per almeno metà sulle sue parole; restano i controlli su nomi, luoghi, numeri, citazioni e collegamenti persona-fonte. Un'ipotesi che non li supera viene scartata per intero e la risposta lo dice.
- **Cache**: si rinnova da sola quando cambiano istruzioni, esempi o modelli.
- Prove: 4 ipotesi corrette mantenute, 6 ipotesi scorrette scartate (luogo inventato, collegamento falso, nome e numero inventati, ipotesi senza fonte, spostamento non documentato); attacchi 10/10 anche con un modello che tenta ipotesi trappola; autotest 36/36 su Python 3.11, 3.12 e 3.13.

## Aggiornamento · interfaccia delle risposte
- Nel terminale radio ogni risposta è divisa in schede distinte: atmosfera (riga in corsivo), **Risposta** (verde; grigia se «non ci sono prove»), **Ipotesi plausibile** (arancio tratteggiato), **Cosa manca** (blu), **Rapporto dell'Investigatore** (viola, sezioni in colonna), **Fonti** (chip con ID, titolo, affidabilità), nota del Verificatore. Gli ID nel testo sono evidenziati.
- La frase d'atmosfera è scelta dal codice in base all'argomento della domanda (8 temi × 3 frasi, senza fatti): sempre attinente, istantanea, nessun token del modello. Quelle eventualmente scritte dal modello vengono tolte.
- Diario, cache, `prove` e `attacchi` conservano il testo originale; cambia solo la visualizzazione. Autotest 36/36 (3.11-3.13), attacchi 10/10, prove 3/3.

## Aggiornamento · selettori «Chi risponde» e «Modalità di elaborazione»
- **Chi risponde**: Automatico (predefinito: il Regista sceglie i livelli 0-4 e può coinvolgere l'Investigatore) · Marco Ferri, risposta autonoma (mai l'Investigatore) · Team investigativo (Investigatore sempre in parallelo).
- **Modalità di elaborazione**: Automatico (predefinito) · Ricerca documentale · Elaborazione libera. L'automatico sceglie l'archivio se la domanda cita un ID, nomina una persona, tocca un tema del caso o usa parole dei documenti; altrimenti elaborazione libera. Con l'archivio vuoto resta la ricerca documentale (nessuna risposta senza fonti). In caso di dubbio prevale sempre l'archivio.
- **Elaborazione libera**: istruzioni dedicate (nessun fatto del caso presentato come certo, nessun ID, nessun ordine), ID ed eventuali ordini tolti dal codice, nota «non verificata sui documenti» in ogni risposta, registrata nel diario come `libera`. Non usa la cache.
- Prove: le 4 combinazioni esplicite e l'automatico funzionano; trabocchetto e injection finiscono sempre in ricerca documentale; autotest 36/36 (3.11-3.13), attacchi 10/10, prove 3/3, comandi stato/radio/registro senza errori.

## Aggiornamento · archivio limitato ai documenti del docente
**Difetto segnalato dalla squadra**: `requirements.txt` e `requirements-locale.txt` comparivano nell'archivio come documenti del caso. Causa: ogni file `.txt` lasciato nella cartella principale di Drive (o dentro 1_DOCUMENTI, o in uno ZIP) veniva importato come documento. Riprodotto: con quei file nella cartella «squadra 2» l'archivio contava 5 documenti invece di 3.
**Correzione**: un testo entra nell'archivio solo se ha il formato del docente (prima riga «ID G1-01») o si chiama come un ID (`G1-01.txt`); vale per la cartella principale, per 1_DOCUMENTI, per il contenuto degli ZIP e, come ulteriore controllo, per il Bibliotecario. Gli ZIP di salvataggio `lazzaro_…` e quelli del progetto non vengono importati. I file già importati per errore escono dall'archivio senza falsi avvisi di cancellazione, e `stato` li elenca come «ignorati».
**Verifica**: stessa situazione → archivio con G1-01, G1-02, G1-03 + 3 schede di ambientazione; anche uno ZIP con l'intero progetto porta in archivio solo i tre documenti; consegna senza avvisi; autotest 36/36 (3.11-3.13), attacchi 10/10, prove 3/3.

## Aggiornamento · interlocutore dell'indagine e filtro di attinenza
- **Nuovi tipi di domanda**: valutazione e consiglio («cosa ne pensi», «che suggerimenti mi dai», «cosa faresti») → riquadri **Valutazione** (solo sui documenti, con ID; controllata come le ipotesi: deve poggiare sugli indizi citati) e **Prossimi passi** (azioni di indagine; niente ordini né nomi/luoghi inventati); domande sul personaggio → risposta in prima persona dalle schede di ambientazione; ordine dei documenti (primo/ultimo messaggio) secondo gli ID.
- **Filtro di attinenza** in due livelli: le domande chiaramente estranee (cucina, sport, meteo, film, turismo, luoghi di Roma che non compaiono nei documenti…) ricevono subito «Fuori contesto» dal codice, in 0 ms e senza modello; le altre vengono giudicate dal modello con una regola esplicita. Una domanda che unisce un tema estraneo e uno dell'indagine («il Colosseo compare nei documenti?») resta attinente.
- **Automatico**: valutazioni, strategia e domande al personaggio usano sempre l'archivio; l'elaborazione libera solo per domande di metodo («come si decifra il Morse?»); nel dubbio, archivio.
- Prove: 24 domande di esempio classificate correttamente (5 estranee respinte, 19 attinenti accettate); valutazione corretta mantenuta, valutazione con luogo, ordine e nome inventati ripulita; autotest 36/36 (3.11-3.13), attacchi 10/10 (anche con modello che tenta ipotesi trappola), prove 3/3.

## Aggiornamento · analisi della conversazione inviata dalla squadra
La conversazione era stata fatta con una versione precedente (lo mostra «Archivio: 5 documenti», cioè i requirements ancora dentro, e la carbonara non filtrata). Difetti individuati e corretti, anche quelli che sarebbero rimasti nell'ultima versione:
| Sintomo nella chat | Causa | Correzione |
|---|---|---|
| «cosa ti ho appena chiesto?», «qual è stata la prima domanda?», «riassunto di quello che ci siamo detti» → «non ci sono prove» o testo inventato | nessuna memoria della conversazione | **memoria di sessione**: queste domande ricevono dal codice una risposta esatta in 0 ms (riquadro 🗒); gli ultimi 3 scambi vanno al modello per capire i riferimenti |
| «qual è stato il primo messaggio inviato?» | ordine dei documenti non gestito | risposta dal codice secondo l'ordine degli ID (G1-01 → G1-02 → G1-03), con la frase originale |
| carbonara e cacio e pepe con ricetta completa | in automatico le domande generali andavano in elaborazione libera | filtro di attinenza ampliato (cucina, cultura generale, calcoli, acquisti…), applicato anche in elaborazione libera e anche dopo un'altra domanda (prima una domanda breve dopo un'altra era esentata) |
| suggerimenti e valutazioni con consigli di sopravvivenza nei tunnel | stessa causa: elaborazione libera senza documenti | valutazioni e strategia vanno sempre all'archivio (regole Valutazione / Prossimi passi) |
| frase d'atmosfera tolta come «nome inventato: Qui Ferri» | la frase del programma passava dal Verificatore | la frase del programma non passa più dal Verificatore e non contiene nomi |
| «grazie», «ok», «ciao» trattati come domande sul caso | — | risposta di cortesia immediata |
| benchmark interrotto se il modello locale non è installato | i profili locali erano sempre eseguiti | profili locali solo se il modello è disponibile |
Prove: 40 domande d'indagine tipiche dei 5 giorni tutte accettate, 10 domande estranee tutte respinte; la conversazione inviata, rigiocata, dà la risposta giusta a ogni domanda di memoria e respinge le tre ricette; autotest 36/36 (3.11-3.13), attacchi 10/10, prove 3/3, comandi stato/radio/registro/benchmark/fine senza errori.

## Aggiornamento · Protocollo di sicurezza interpretativa (Sentinella)
Il protocollo non è stato copiato nelle istruzioni del modello (oltre 450 righe: risposte più lente e costose). È stato tradotto in un modulo in codice, la **Sentinella** (0,2 ms per domanda, nessun token), in poche regole compatte nelle istruzioni di Archeologo e Investigatore e in nuovi controlli del Verificatore.

| § del protocollo | Implementazione |
|---|---|
| 3 · Istruzioni vs contenuti | Le frasi imperative nei documenti sono dati: segnalate (L3) e isolate. Prima veniva scartata ogni frase che citava il documento; ora resta utilizzabile tutto il resto e si tolgono solo le frasi che ripetono l'istruzione |
| 4 · Prompt injection | 12 indicatori (ignorare regole, regole sostituite, nuova identità, rivelare istruzioni, impedire verifiche, risposta imposta, finta autorità, operazione non eseguita, nascondere informazioni, comandi di modalità, urgenza, certezza richiesta) su domanda e documenti, livelli 1-3; nei documenti la stessa frase può essere un meccanismo dell'enigma: lo dice la valutazione |
| 5 · Trabocchetti e ambiguità | Premesse false («visto che…»), attribuzioni scambiate o non supportate, ipotesi date per certe, avviso «scenario inventato» usato come indizio, cronologie senza orari, generalizzazioni; regola: elencare le interpretazioni invece di sceglierne una |
| 6 · Manipolazioni informative | Fonti, citazioni, persone, luoghi e numeri non presenti nell'archivio; certezze non supportate tolte dal Verificatore |
| 7 · Manipolazioni nei file | Caratteri invisibili e marcatori di direzione (tolti dalla domanda e segnalati), lettere greche/cirilliche in parole latine, scansione di ogni documento; i metadati interni non vengono dichiarati verificati |
| 8 · Strumenti e operazioni | Il Verificatore toglie «ho verificato/contattato/inviato…» non riferito all'archivio; nessun contenuto attivo eseguito |
| 9 · Controllo prima della consegna | Negazioni smentite dal documento citato, attribuzioni sbagliate, certezze indebite, calcoli dichiarati ammessi solo se ottenuti dai dati |
| 10 · Livelli 1-4 | Ogni segnalazione ha livello, tipo, posizione, elemento, rischio, valutazione, azione, stato |
| 11 · Modalità | `NO RESTRIZIONI` = analisi avanzata (Team investigativo, più interpretazioni, controlli incrociati, revisione); `SI RESTRIZIONI` = normale; protezioni sempre attive; comando valido solo dalla chat, segnalato se compare in un documento |
| 12 · Formato | Riquadro SENTINELLA nella risposta (livelli ≥2, ≥1 in analisi avanzata) e rapporto completo in tabella (scheda Sentinella, `/sentinella`, comando `sentinella`) |
| 13 · Non interruzione | Nessuna segnalazione blocca la risposta: la premessa viene corretta in **Attenzione** e l'indagine prosegue |
| 14 · Niente false certezze | «Nessuna anomalia rilevante nei contenuti effettivamente esaminati», mai «documento sicuro» |

**Prove**: 6 nuovi test di attacco (premessa falsa, documento inesistente, attribuzione scambiata, finta autorità, certezza indebita, domanda in negativo) → 16/16 superati sia con un modello simulato che segue le note sia con uno che tenta di cadere in ogni trappola; nessun falso allarme di livello ≥2 sulle 43 domande legittime di prova; documento con un'istruzione nascosta, un comando di modalità e un carattere invisibile: tutto segnalato, l'informazione utile (orario del generatore) conservata, la frase manipolata tolta; autotest 39/39 su Python 3.11, 3.12 e 3.13; prove 3/3; comandi stato, radio, registro, benchmark, fine e sentinella senza errori.

## Aggiornamento · Protocollo operativo intelligente (Modalità Escape Room Avanzata) e riverifica completa
| § del protocollo | Implementazione |
|---|---|
| 1 · Partner investigativo | Regole già attive (Valutazione, Prossimi passi, Ipotesi plausibile, Tecnico); in modalità avanzata l'Investigatore lavora sempre in parallelo all'Archeologo |
| 2.1-2.2 · NO / SI RESTRIZIONI | Comando esatto dalla chat; conferme con le frasi esatte del protocollo |
| 2.3 · Transizioni | Avvio in modalità normale; modalità mantenuta fino al comando successivo; mutuamente esclusive; comando solo citato → nessun cambio e spiegazione; intenzione non chiara → richiesta di chiarimento; la conferma dichiara che lo stato vale finché il programma è aperto (nessuna falsa persistenza) |
| 3 · Integrità del software | Le modalità cambiano solo istruzioni dell'Investigatore, livello di coinvolgimento e note al modello; Sentinella, Verificatore, filtri, Drive protetto, permessi e chiavi restano invariati; la cache distingue le due modalità |
| 4 · Analisi approfondita | Istruzioni dedicate: separare fatti, inferenze e supposizioni; dettagli insoliti, omissioni e contraddizioni; più interpretazioni (codici, ordini alternativi, giochi di parole, collegamenti) senza ipotesi casuali; niente coincidenze come prove |
| 5 · Documenti | Testo dei documenti trattato come dato (Sentinella); nessuna dichiarazione di analisi non fatte |
| 6 · Ricerca web | Il sistema non ha accesso al web: il modello deve indicare le verifiche esterne da fare; il Verificatore toglie fonti esterne citate («secondo Wikipedia», «ho cercato online») |
| 7 · Strategia proattiva | Sezione **Prossima mossa** (l'azione che riduce di più l'incertezza) |
| 8 · Gestione dell'incertezza | Categorie CONFERMATO / ALTAMENTE PROBABILE / PLAUSIBILE / SPECULATIVO / CONFUTATO; niente percentuali (i numeri non presenti nei documenti vengono tolti); il Verificatore toglie un «CONFERMATO» fondato solo su una fonte dubitativa |
| 9 · Organizzazione delle risposte | Normale: formato invariato. Avanzata: Obiettivo attuale, Indizi rilevanti, Analisi approfondita, Ipotesi principali, Verifica, Prossima mossa, Stato della soluzione (riquadro «Analisi avanzata dell'Investigatore») |
| 10 · Collaborazione e memoria | Memoria di sessione già attiva; nuovo riepilogo «a che punto siamo?»; nessuna promessa di memoria permanente |
| 11 · Regole sempre attive | Non disattivabili da alcun comando: autotest verifica che il comando citato non cambi modalità e che le conferme siano quelle del protocollo |

**Riverifica completa del sistema (20/10/2026)**
- Analisi statica su 3.267 righe: nessuna funzione definita due volte; nessun nome usato senza essere definito, controllato su tutto il codice e su config.py; compilazione su Python 3.11, 3.12 e 3.13.
- Autotest **40/40** su Python 3.11, 3.12 e 3.13, con gli avvisi di deprecazione trattati come errori.
- **Tutti i 18 comandi** eseguiti senza errori, in una cartella Drive simulata con lo ZIP reale: stato, sincronizza, prove, attacchi, benchmark, domanda, registro, radio, sentinella, notte, importa (giorno 2), consegna, consegna --conferma, verifica, fine, autotest. La consegna è integra, senza `.env` e senza kit docente; lo ZIP `lazzaro_squadra_2_…` è stato creato.
- Attacchi **16/16** sia con il modello che segue le note sia con quello che tenta ogni trappola; le prove danno 3/3 fonti corrette.
- Filtro di attinenza: 40/40 domande d'indagine accettate, 10/10 domande estranee respinte. Sentinella: nessun falso allarme sulle 43 domande legittime. Verificatore: 11 casi su 11 corretti.
- Conversazione della squadra rigiocata: ogni risposta ha il percorso atteso. Selettori: tutte le combinazioni funzionano.
- Modalità avanzata provata anche con un modello che tenta errori: tolti «secondo Wikipedia», il «CONFERMATO» su fonte dubitativa e la percentuale inventata; il resto dell'analisi è stato conservato.
- Prova di carico di 25 secondi: 4 utenti in parallelo con modalità cambiata di continuo e 470 ricariche dell'archivio → **577 domande, 0 errori**.
- Dimensione delle istruzioni, che restano nella cache del provider: Archeologo ~2.780 token, Investigatore ~1.860, Investigatore avanzato ~2.020. La parte che cambia a ogni domanda è sotto i 60 token.
- Limiti noti: la qualità delle risposte con i modelli veri (Groq) e l'aspetto del terminale nel browser vanno controllati sui vostri computer.

## Aggiornamento · imprevisti (rettifiche tra documenti)
**Obiettivo**: i nuovi documenti del docente possono smentire o correggere quelli precedenti («il messaggio X non è vero», «l'ora non è corretta»). Il sistema deve rileggere l'insieme dei documenti tenendo conto di cosa cambia, senza stravolgere il programma.
**Soluzione**: modulo **Registro delle rettifiche**, calcolato dal codice a ogni caricamento dell'archivio e agganciato ai pezzi esistenti:
| Punto | Cosa fa |
|---|---|
| Rilevamento | frasi di smentita (non è vero, è falso, smentisce, ignorate, annullato…) e di correzione (in realtà, errato, sbagliato, non… ma…, l'ora giusta…). Il documento colpito si trova per ID citato, titolo, «primo/ultimo messaggio», orario già presente, frase successiva della stessa rettifica o contenuto simile. Vengono registrati frase colpita e valore vecchio → nuovo |
| Affidabilità della rettifica | «prevale salvo prove contrarie», oppure «da verificare» se la fonte è meno affidabile o il documento contiene istruzioni sospette |
| Modello | attributo `stato` su ogni fonte, REGISTRO DELLE RETTIFICHE nel prompt (prefisso stabile, in cache), regola 13 per l'Archeologo e regole per l'Investigatore normale e avanzato (smentita credibile → CONFUTATO); lo Stratega riceve il registro |
| Bibliotecario | la risposta estrattiva non usa più frasi di documenti rettificati: passa al modello |
| Verificatore | toglie le frasi che riportano come attuale un contenuto smentito o un valore corretto senza dirlo |
| Sentinella | segnala le domande che riguardano informazioni rettificate (nota al modello) e mette gli imprevisti nel rapporto; «ignorate il messaggio G1-02» non è più scambiato per prompt injection (lo è solo un'istruzione rivolta al sistema) |
| Interfaccia | riquadri 🔄 Imprevisti e 📥 Aggiornamento archivio, colonna Stato nella scheda Archivio, linea del tempo annotata, `/rettifiche`, riepilogo «a che punto siamo?» con lo stato dei documenti, risposte superate marcate nel riassunto |
**Correzione collaterale**: `importa` con un percorso relativo (es. `../G2-01.txt`) non trovava il file, perché il programma cambia cartella all'avvio; ora il percorso viene risolto subito.
**Prove** con 6 documenti del «giorno 2» costruiti per l'occasione:
- smentita per titolo («il messaggio della centrale non è vero»);
- correzione numerica («non tre ma due»);
- correzione d'orario tra due documenti dello stesso giorno;
- smentita esplicita dentro un documento che contiene anche un'injection;
- un «falso allarme» che non deve essere scambiato per rettifica.

Esiti:
- 4 rettifiche su 4 riconosciute, nessun falso positivo; stato e valori corretti; l'injection resta isolata, la smentita è marcata «da verificare».
- Verificatore: 9 casi su 9 corretti (vecchio contenuto e vecchi valori tolti, nuove versioni e frasi «diceva… ma…» conservate).
- Archivio del Giorno 1 senza nuovi documenti: nessuna rettifica, comportamento invariato.
- Autotest 41/41 su Python 3.11, 3.12 e 3.13; attacchi 16/16 con entrambi i modelli simulati; prove 3/3; filtro 40/40 e 10/10.
- Prova di carico: 535 domande e 465 ricariche, 0 errori.
- Tutti i comandi eseguiti con i documenti del giorno 2: importa, stato, sentinella, /rettifiche, notte, radio, registro, prove, attacchi, consegna, verifica, fine.

## Aggiornamento · prevenzione dei rischi annotati il 20/10 (filtri, limiti di token, memoria)
**1. Domande e documenti nuovi che i filtri non riconoscono**
- Il filtro fuori contesto considera attinente una parola «estranea» che compare nei documenti. Prova: «Cosa è successo al museo?» viene respinta senza documenti, accettata dopo un documento che parla del museo; la carbonara resta respinta.
- Liste della squadra in `config.py`: `PAROLE_ATTINENTI`, `PAROLE_ESTRANEE`, `RETTIFICHE_EXTRA`. Facoltative: senza, valgono le regole di base.
- `/indaga domanda` scavalca il filtro.
- Il modello segnala come possibile imprevisto un contrasto tra documenti anche senza voce nel registro.
- `revisione_filtri.jsonl` e la sezione «Da rivedere» raccolgono le domande respinte e le frasi tolte dal Verificatore.

**2. Limiti di Groq e archivi da oltre 1.000 documenti**, provato con 1.200 documenti sintetici (circa 78.000 token di archivio):
- caricamento in 0,38 s, registro delle rettifiche in 0,16 s (52 rettifiche);
- prompt per domanda fra 5.500 e 8.200 token, invece di 78.000;
- tempo del codice per domanda: da 0 a 300 ms, fino a circa 1,5 s al livello 4 (compresi i ritardi del modello simulato);
- rapporto della Sentinella 0,14 s, «cosa non torna» 0,13 s, linea del tempo 0,03 s.

Gli analisti procedono a giri (60 documenti, 4 in parallelo; `notte` completa tutto); stratega e confronti lavorano sui documenti più recenti o più pertinenti; radici, token, entità e frasi sospette vengono calcolati una volta per versione dell'archivio. Tutti i valori sono regolabili in `config.py`.

**3. Memoria**: `MEMORIA_INDAGINE.md` è aggiornato in background dopo ogni risposta, salvato su Drive, ripreso all'avvio e incluso nello ZIP di fine giornata. Si richiama con `/memoria_indagine`, il comando `memoria`, «a che punto siamo?». La chat riparte dagli ultimi scambi dopo un riavvio (provato: «cosa ti ho chiesto prima?» risponde con la domanda della sessione precedente). Le ultime ipotesi vanno al modello come appunti, solo in chat (mai nelle prove e negli attacchi), segnando quelle superate.

**Verifica**:
- analisi statica pulita;
- autotest 43/43 su Python 3.11, 3.12 e 3.13;
- attacchi 16/16 con entrambi i modelli simulati;
- prove 3/3;
- filtro 40/40 e 10/10;
- Verificatore 11/11;
- rettifiche e conversazione rigiocata invariate;
- prova di carico: 537 domande, 0 errori;
- tutti i 19 comandi senza errori.

## Aggiornamento · documenti del giorno 2 (imprevisti reali)
Analisi degli 8 documenti `LX2` e della scheda della missione. Problemi trovati e correzioni:

| Problema | Effetto senza correzione | Correzione |
|---|---|---|
| ID con due lettere (`LX2-2422`), file `LX2_2422.txt`, intestazione `Documento:` | nessun documento del giorno 2 caricato (il filtro dei requirements li scartava) | formato ID esteso nel codice, intestazione e nome file riconosciuti, giorno ricavato dall'ID |
| Numeri degli ID non cronologici | il registro delle rettifiche non vedeva che LX2-2422 (ore 09:10) segue LX2-8405 (ore 08:00) | ordine per giorno, ora del titolo, numero |
| «sostituisce il riepilogo delle ore 08:00» | rettifica non riconosciuta, oppure 08:00 scambiato per il nuovo orario | «sostituisce/aggiorna/supera» riconosciuti; l'ora che indica il documento bersaglio viene distinta dal valore nuovo (06:40 → 06:25) |
| Rettifica basata su orologio locale non sincronizzato | il sistema avrebbe dato per buona la versione più recente (Cripta 06:25) | rettifica marcata «da verificare», fonte «contestata» e non «corretta»; il Verificatore non cancella più il valore originale |
| Orologio di Cripta indietro di 25 minuti | 06:25 confrontato direttamente con 06:40 | conversione calcolata dal codice (06:25 → 06:50 centrale), nel prompt, nel riquadro 🕰, nella linea del tempo e nel Verificatore |
| «D. Neri» (Dario G1-02, Daria T247, Diego T283) | identità scelta a caso o confusa con Dario | sigle ambigue sciolte dal dettaglio distintivo; frase con identità incompatibile tolta |
| Ingresso in cabina ≠ sabotaggio | rischio di accusa | accuse presentate come fatto tolte quando i documenti dicono che non sono provate |
| «Ripetitore Rovo» letto come persona | falsi nomi nelle verifiche | parole comuni maiuscole escluse dai nomi (`NON_NOMI_EXTRA` in config) |
| Più risposte ravvicinate | errore occasionale nella scrittura di `MEMORIA_INDAGINE.md` | scrittura protetta da un lock |
| «D. Neri» spezzato in due frasi dal Verificatore | controlli sulla frase sbagliati | l'iniziale puntata non chiude più la frase |

Prove eseguite: archivio reale G1 + LX2 (11 documenti, 1 rettifica corretta, 2 conversioni, 1 sigla ambigua); Verificatore 12/12 su frasi giuste e sbagliate del giorno 2; prove del giorno con modello di prova che segue le regole (5/5) e con modello che tenta di sbagliare (errori tolti in tutte le risposte); autotest 47/47 (4 controlli nuovi) su Python 3.11, 3.12 e 3.13; test di attacco 16/16 con entrambi i modelli di prova; filtro 40/40 e 10/10; prova di carico senza errori; regressione delle rettifiche sintetiche invariata.
Limite: le risposte vere dipendono dal modello cloud; le prove con i modelli simulati verificano programma, prompt e Verificatore, non il ragionamento di gpt-oss.

## Aggiornamento · confronto con le modifiche del collega (20/10)
Esaminate dalle schermate (report e codice, base del collega: autotest 37/37, quindi una versione precedente).

| Modifica del collega | Esito | Motivo |
|---|---|---|
| `ID_RE` con prefisso di 1-3 lettere | già presente | qui 1-4 lettere, ed esteso dal codice anche con un `config.py` vecchio |
| Intestazione `ID …` / `Documento: …` in `e_documento_del_caso` | già presente | qui limitata alle prime righe del file (una riga del testo non può essere scambiata per intestazione) |
| ID dal contenuto in `Archivio._costruisci` | già presente, più completo | qui si toglie anche la riga «ARCHIVIO LAZZARO — Unità 2» (altrimenti diventa il titolo di tutti i documenti), si accettano i file `LX2_2422.txt` senza intestazione e il giorno si ricava da `LX2` |
| Cartella `1_DOCUMENTI/imprevisti` | non integrata | la sincronizzazione legge già tutte le sottocartelle di `1_DOCUMENTI`; gli imprevisti arrivano ogni giorno, quindi vanno in `giorno_N` con gli altri documenti |
| Autotest con il formato reale | già presente | 4 controlli del giorno 2 (formato, rettifica dubbia, orologi, sigle, Verificatore) |
| Numero dentro un codice (T247) | non serve | il controllo dei numeri qui non lo scambia già (verificato); aggiunto invece il controllo opposto: un codice **inventato** (es. T999) viene tolto |
| Percorsi Windows nel ripristino e nella verifica della consegna | **integrata** | difetto reale: su Windows il registro usava `giorno_1\prova.zip` e il ripristino con `/` non trovava il documento; la verifica della consegna segnalava come «aggiunti» tutti i file in sottocartella. Ora i percorsi sono sempre con `/` (anche i registri già scritti) |

Prove: autotest 49/49 (2 controlli nuovi) su Python 3.11, 3.12, 3.13; attacchi 16/16 con entrambi i modelli di prova; filtro 40/40 e 10/10; prova di carico senza errori; Verificatore del giorno 2 12/12; prove del giorno 5/5.

## Aggiornamento · risposte meno chiare dopo le aggiunte del giorno (revisione dei prompt)
Segnalazione della squadra: le risposte non seguono più il formato a sezioni e sono meno coerenti. Cause trovate nel codice:
- **Regole in ordine sparso.** Le istruzioni dell'Archeologo erano numerate 1-7, 12, 13, 14, 8-11: le regole lunghe sugli imprevisti stavano in mezzo a quelle sul formato. Ora il prompt ha tre blocchi: *Come rispondere* (formato per tipo di domanda: fatti, nessuna prova, valutazione, lacune, personaggio, fuori contesto) · *Regole sulle fonti* (sempre) · *Situazioni speciali* (Sentinella, imprevisti, orari e identità: solo se la domanda o le fonti le riguardano, altrimenti non vanno nominate).
- **Formato richiesto sempre uguale.** In fondo al messaggio c'era sempre «Risposta / Ipotesi / Cosa manca», anche per le valutazioni, in contrasto con la regola su Valutazione e Prossimi passi. Ora il formato richiesto dipende dal tipo di domanda.
- **Registro e note del Tecnico in coda al prompt.** Erano l'ultima cosa letta dal modello, che tendeva a parlarne anche quando la domanda era su altro. Ora il prompt finisce con un promemoria del formato e la precisazione che registro e note servono solo se riguardano la domanda.
- **Indicazione a elencare le interpretazioni.** Rendeva le risposte esitanti; ora: conclusione decisa quando i documenti la permettono, alternative solo quando non permettono di scegliere.
- **Etichetta persa dal Verificatore.** Se veniva tolta la prima frase di una sezione, le frasi rimaste perdevano «**Risposta:**» e il riquadro spariva; ora l'etichetta passa alla frase successiva.
- **Appunti vecchi.** Le ipotesi delle conversazioni precedenti entravano nel prompt anche se nate con un archivio diverso; ora solo quelle dell'archivio attuale, al massimo 4.

Prove: autotest 49/49; attacchi 16/16 con entrambi i modelli di prova; filtro 40/40 e 10/10; prova di carico senza errori; Verificatore del Giorno 2 12/12; prove del Giorno 2 5/5. Il comportamento del modello reale va confermato sulla chat della squadra.

## Aggiornamento · chat della squadra del 20/10 (risposte confuse alle prove del Giorno 2)
Dalla chat inviata: risposte senza ID («nessuna fonte citata»), frasi copiate dagli esempi del prompt («Secondo una testimone», «un registro degli accessi»), sezioni tagliate a metà («**Cosa man»), D. Neri confusa con Dario Neri, rapporto dell'Investigatore nello stesso formato breve di Marco. Sono i segni del **modello locale di riserva (Qwen 0,5B)**, non di gpt-oss-120b.
Causa: con l'archivio del Giorno 2 ogni chiamata costa circa 4.800 token di prompt; una domanda complessa avvia Archeologo e Investigatore insieme (circa 12.000 token con il ragionamento), oltre il limite gratuito di Groq di 8.000 token al minuto. Il provider risponde 429 e il programma ripiegava in silenzio sul modello locale. Al Giorno 1 l'archivio di 3 documenti stava nel limite.
Correzioni: conteggio dei token dell'ultimo minuto con attesa breve; ritentativo degli errori 429 con attesa breve; domande complesse in una sola chiamata con ragionamento alto quando due chiamate non stanno nel limite; analisti in background limitati a metà del budget; bacheca tolta dal prompt dell'Investigatore quando l'archivio intero è già presente (−1.400 token); riquadro rosso quando risponde il modello di riserva, con il motivo; per il modello locale: ID aggiunti quando una frase coincide con un passaggio fornito, sezione tagliata rimossa, documenti collegati dal Tecnico (sigla ambigua, orologi) aggiunti ai passaggi.
Prove: autotest 49/49; attacchi 16/16 con entrambi i modelli di prova; filtro 40/40 e 10/10; prova di carico di 790 domande senza errori; Verificatore del Giorno 2 12/12; prove del Giorno 2 5/5; simulazione di 429 al minuto (ritentato dopo ~2 s, risposta dal cloud) e di quota giornaliera esaurita (motivo riconosciuto e mostrato).

## Aggiornamento · configurazione solo Groq
La squadra usa solo Groq. I limiti gratuiti di Groq sono indicati per modello (gpt-oss-120b e gpt-oss-20b: 8.000 token al minuto, 200.000 al giorno ciascuno). Nuova ripartizione in `config.py`: Archeologo su gpt-oss-120b (ragionamento basso), Investigatore e stratega su gpt-oss-20b (ragionamento alto), analisti su gpt-oss-20b (basso). Il conteggio dei token è ora per modello; Archeologo e Investigatore lavorano in parallelo senza superare i limiti; se l'Investigatore dovrebbe aspettare più di 15 secondi, risponde solo l'Archeologo sul 120b con ragionamento medio (una chiamata). Le analisi in background cedono il passo alla chat per 20 secondi dopo ogni domanda.
