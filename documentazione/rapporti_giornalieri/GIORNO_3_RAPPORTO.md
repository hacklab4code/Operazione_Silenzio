> Rapporto consegnato a fine giornata, con il sistema di allora (RAG BM25 e query SQL scritte a mano, oggi in `backend/legacy/`). I percorsi citati sono quelli precedenti alla riorganizzazione del 22/10/2026.

# Giorno 3 — L’archivio sepolto · rapporto RAG

Aggiornato il 21 ottobre 2026. Il RAG è attivo nella **schermata chat**: le domande si scrivono nella console radio, non nella sezione «Prove e archivio» (rimasta com’era). L’indice copre **tutti i giorni e tutti i file**: 1.023 documenti dei giorni 1, 2 e 3, senza filtri.

## La scoperta in poche righe

Nei rifugi il progetto **LAZZARO** ha attirato le persone con messaggi di protezione per estendere il contagio. **Dario Neri** ha chiesto di fermare il progetto e, per proteggere il materiale di recupero, ha aperto la **pratica RV384**. Il materiale è stato spostato nel **deposito Pozzo Freddo**, **settore F2**. L’appunto che indica Darsena Vuota/A1 è senza firma e contraddetto dal registro dei trasferimenti.

| Campo richiesto | Valore | Fonte |
|---|---|---|
| Persona | Dario Neri | [ARCH-3097] `documento_0057.html` |
| Pratica | RV384 | [ARCH-3097] `documento_0057.html` · [ARCH-5721] `documento_0389.xml` |
| Deposito | Pozzo Freddo | [ARCH-5721] `documento_0389.xml` · [ARCH-6408] `documento_0421.json` |
| Settore | F2 | [ARCH-6408] `documento_0421.json` |
| Cosa manca | il database degli accessi citato dal registro; nessun documento lo contiene | — |

## I tre collegamenti (e un quarto)

Ogni riga è una citazione letterale del file indicato, non una sintesi.

1. **Dario Neri → pratica RV384** — «Per proteggere il materiale di recupero ha aperto la pratica RV384.» [ARCH-3097] `documento_0057.html`
2. **RV384 → contenitore LUME** — «Pratica RV384. Il contenitore LUME è stato spostato nel deposito Pozzo Freddo.» [ARCH-5721] `documento_0389.xml`
3. **LUME → deposito Pozzo Freddo** — «Il contenitore LUME è stato spostato nel deposito Pozzo Freddo.» [ARCH-5721] `documento_0389.xml`
4. **Pozzo Freddo → settore F2** — «Il deposito Pozzo Freddo usa il settore F2 per il materiale di recupero.» [ARCH-6408] `documento_0421.json`

Il programma trova questi collegamenti anche da solo: la domanda «Collega Dario Neri alla pratica RV384 e al deposito Pozzo Freddo» restituisce i tre documenti `ARCH-3097`, `ARCH-5721`, `ARCH-6408` e la fusione delle classifiche dei singoli giri.

## Le prove chieste dalla missione

**Riformulazione.** Due domande diverse riportano alle stesse fonti.

| Domanda | Fonti recuperate | Estratto usato |
|---|---|---|
| «Dove è stato spostato il contenitore LUME?» | ARCH-5721, ARCH-6408 | «Il contenitore LUME è stato spostato nel deposito Pozzo Freddo.» |
| «In quale deposito è finito il materiale recuperato?» | ARCH-6408, ARCH-5721 | «Il deposito Pozzo Freddo usa il settore F2 per il materiale di recupero.» |

**Domanda senza prova.** «Quante persone sono state contagiate nei rifugi?» → *Risposta parziale: nessun numero compare nei passaggi recuperati*, con gli estratti letterali più vicini. Il programma non trasforma «persone», «contagio» e «rifugi» in un numero inventato. Anche «Chi ha firmato l’appunto sul deposito Darsena Vuota?» resta parziale: il documento dice che l’appunto è senza firma, ma non ne indica l’autore.

**Distrattore.** «Il materiale di recupero si trova a Darsena Vuota?» restituisce sia ARCH-8254 (Darsena Vuota, A1, senza pratica) sia ARCH-6408 (Pozzo Freddo, F2): la contraddizione resta visibile invece di essere appianata.

## Come funziona il recupero

| Fase | Scelta | Perché |
|---|---|---|
| Lettura | Tutti i 1.023 file dei giorni 1–3: 3 G1, 15 G2/LX2 e 1.005 file del Giorno 3 (252 TXT, 251 HTML, 251 JSON, 251 XML). Nel progetto di sviluppo l’indice usa il catalogo del frontend; nel pacchetto portatile legge direttamente `dati/giorno_1`, `dati/giorno_2` e `dati/giorno_3`. | Nessun elenco di file attesi, nessun filtro per prefisso o provenienza. |
| Estrazione | Un lettore per formato; ID, titolo, testo, fonte e SHA-256 conservati. | HTML e XML sono trattati come testo, mai eseguiti. |
| Blocchi | Circa 700 caratteri, tagliati sui confini di frase, con 120 caratteri di sovrapposizione. | Il notebook usa passi fissi da 280/360 caratteri: spezzano frasi e citazioni. Blocchi più lunghi e allineati alle frasi riducono i confini falsi. |
| Indice | BM25 (k1 = 1,4, b = 0,72) sul corpo, più titolo e ID, più bonus per le sequenze esatte. Stemmer italiano leggero e parole vuote rimosse. | La corrispondenza è per parola intera: «LUME» non pesca «volume», «legume» o «costume» (39 falsi positivi nel corpus). |
| Giri successivi | Codici con cifre (`RV384`), ID, nomi di persona e toponimi (`Pozzo Freddo`) emersi dai primi passaggi aprono una seconda ricerca. Le classifiche si fondono con Reciprocal Rank Fusion. | Una sola ricerca non basta per una catena: la pratica RV384 compare in un documento, il deposito in un altro. |
| Risposta | Nessun LLM: le frasi sono copiate dai passaggi, tra virgolette, con ID e nome file accanto. Il verificatore controlla che ogni citazione sia letterale e che ID e numeri esistano nelle fonti. | Una risposta estrattiva non può inventare nomi, luoghi o numeri. |
| Dato mancante | Se il tipo di dato richiesto (persona, luogo, data, numero, codice) non compare nei passaggi, la risposta è **parziale**: mostra gli estratti letterali più vicini e dichiara il dato assente. | La chat risponde comunque sui file che ha, senza inventare il dato mancante. |

Nella chat il RAG entra per qualunque domanda su un file della missione (ARCH-…, G1/G2, LX2), anche senza parole chiave: se c’è una prova o una risposta parziale su un documento dell’indagine, risponde il RAG; le domande narrative su Marco restano al motore originale. Le risposte compaiono con le sezioni che la chat già conosce: **Risposta**, **Cosa manca**, **Fonti e attendibilità**. I documenti della missione hanno la precedenza sulle voci enciclopediche che usano le stesse parole.

## Misure

Macchina: MacBook locale, Python 3.12, indice in memoria. Comando: `python rag_giorno3.py valuta`. Le misure seguono l’indice da 1.023 documenti del progetto di sviluppo; nel pacchetto portatile l’indice legge i 1.005 originali del Giorno 3 e si costruisce in 2,9 s.

| Misura | Valore |
|---|---|
| Documenti indicizzati | 1.023 (3 + 15 + 1.005) |
| Blocchi | 6.755 |
| Costruzione dell’indice | 2,5 s nel progetto · 3,2 s nel pacchetto |
| Casi di valutazione superati | 11 / 11 |
| Recupero mediano | 87 ms |
| Recupero p95 | 112 ms |
| Risposta in chat (misurata nell’interfaccia) | 0,07–0,09 s |

I casi coprono: contenuto dei rifugi, responsabile dell’opposizione, pratica, contenitore LUME, settore, riformulazione, contagio, distrattore Darsena Vuota, due domande senza prove e la catena completa. I dettagli, con i file recuperati per ogni domanda, sono in [giorno3_rag_valutazione.json](giorno3_rag_valutazione.json); la ricostruzione per persona/pratica/deposito/settore è in [giorno3_rag_dossier.json](giorno3_rag_dossier.json).

**Cosa non è stato misurato.** Il confronto diretto con la ricerca vettoriale del notebook non è stato eseguito: `sentence-transformers` e `numpy` non sono installati nell’ambiente del progetto e il notebook non contiene risultati salvati. Il piano prevedeva di provare prima BM25 e poi, solo se necessario, la ricerca vettoriale o ibrida. Con 11/11 casi superati e tempi sotto il quarto di secondo, questa seconda variante non è servita per la demo; resta il passo successivo se si vuole confrontare la copertura su domande più vaghe.

## Verifiche eseguite

```sh
# backend: 42 test (15 sul RAG, 12 sul ponte con la chat, 15 già esistenti)
cd app_files/backend
../../Pacchetto_Operazione_Silenzio_PC/.venv/bin/python -m unittest discover -s tests -p 'test_*.py'

# frontend: test invariati e build di produzione
cd app_files/frontend
CI=true yarn test -- --watchAll=false --runInBand
CI=true yarn build
```

Esito: 42 test backend superati, 14 test frontend superati, build compilata. La demo è stata provata nella chat del browser e via API con domande sui tre giorni: «Cosa dice il registro veicoli?» → [G2-05], «Chi ha lasciato un messaggio dal quartiere?» → [G1-02], «Quale settore del deposito Pozzo Freddo…» → [ARCH-6408], «Chi ha firmato l’appunto…» → risposta parziale con [ARCH-8254]. Indice del backend: 1.023 documenti, 2,5 s.

## File

- [rag_giorno3.py](app_files/backend/rag_giorno3.py) — lettore, indice, catena, risposta e verificatore.
- [test_rag_giorno3.py](app_files/backend/tests/test_rag_giorno3.py) — formati, recupero, catena, rifiuto, citazioni.
- [test_rag_chat.py](app_files/backend/tests/test_rag_chat.py) — instradamento e formato delle risposte in chat.
- [server.py](app_files/backend/server.py) — endpoint `/api/rag/*` e ponte con `/api/radio`.
- [PIANO_AZIONE_GIORNO_3.md](PIANO_AZIONE_GIORNO_3.md) — piano e alternative valutate.

## Limiti

- La ricerca è lessicale: non capisce sinonimi lontani («dove è finito» trova «spostato» grazie alla radice, ma «nascondiglio» non troverebbe «deposito»). Per questo la riformulazione è stata provata e documentata.
- Le 1.000 voci enciclopediche contengono le stesse parole dei documenti utili («rifugio», «deposito», «materiale»). La precedenza ai documenti della missione e il filtro di copertura le tengono fuori dagli estratti, ma restano visibili fra i passaggi recuperati e vengono dichiarate come non usate.
- Il database degli accessi non è nell’archivio: RV384 non dimostra da sola un’autorizzazione valida.
- Il RAG non modifica i documenti e non li reindicizza da solo: se l’archivio cambia va rigenerato il catalogo del frontend o impostata `RAG_ARCHIVIO` sulla cartella degli originali.
