# Prove e archivio — mappa del corpus con embedding

La voce unica «Prove e archivio» include una mappa 3D con rotazione, zoom, selezione dei punti e dei gruppi sovrapposti, ricerca testuale, filtri per giorno, categoria e formato, elenco paginato, lettura dei testi e download degli originali.

Il catalogo statico contiene 1.526 documenti: 3 del giorno 1, 15 del giorno 2 (compresi gli 8 imprevisti), tutti i 1.505 del giorno 3 e i 3 documenti G4 del giorno 4. I formati del giorno 3 sono 752 TXT, 251 HTML, 251 JSON, 251 XML.

## Come è costruita la mappa

Ogni documento ha un **embedding lessicale** calcolato dal catalogo:

1. il titolo (pesato due volte) e il testo vengono tokenizzati in parole italiane, senza accenti e senza parole vuote;
2. si costruisce un vettore TF‑IDF sul vocabolario del corpus (circa 11.600 parole presenti in almeno 3 documenti);
3. le tre componenti principali si estraggono con LSA e power iteration, senza `numpy`, `sentence-transformers` o servizi esterni;
4. le coordinate sono normalizzate e salvate in `embedding` (tre numeri per documento).

La mappa è **una sola proiezione**: ogni punto usa direttamente le tre coordinate dell'embedding, con una traslazione globale (centro della nuvola sull'origine) e un'unica scala costante (250 unità per unità di embedding). Nessun gruppo ha un ancoraggio, una scala o una posizione dedicata: la distanza tra due punti è proporzionale alla distanza dei loro vettori.

I testi della missione possono formare gruppi molto compatti rispetto alla raccolta enciclopedica. La camera si centra e adatta lo zoom ai file visibili: questo rende esplorabili anche i primi giorni senza modificare le coordinate o le distanze del corpus.

## Leggere e usare la mappa

I punti singoli usano **colore = gruppo**, **forma = formato** (TXT cerchio, HTML anello, JSON quadrato, XML rombo), **dimensione = lunghezza del file** (scala logaritmica). I sei gruppi hanno colori distinti: dossier ciano, G1 blu, G2 rosa, G4 verde acqua, Lazzaro ambra e Wikipedia verde. I simboli sono nitidi, senza bagliori additivi; selezione e hover aggiungono un contorno chiaro mantenendo il colore del gruppo.

**Raggruppa vicini** è attivo inizialmente. Dopo la proiezione, i punti vicini sullo schermo vengono raccolti in cerchi numerati che non si sovrappongono. Il numero è il conteggio esatto dei file; se sono presenti più categorie, archi uguali e separati ne mostrano tutti i colori (non le proporzioni). Con lo zoom i raggruppamenti si aggiornano. Le coordinate dei documenti rimangono intatte e il comando può essere disattivato per vedere tutti i singoli punti.

Un clic su un cerchio apre un pannello con **tutti** i suoi documenti: categorie e conteggi, ricerca sul testo completo di tutti i membri, pagine da 20 fonti e accesso diretto al lettore. «Avvicina questo gruppo» inquadra i membri; Esc o il pulsante di chiusura tornano alla mappa. La ricerca non è limitata alla pagina corrente. I raggruppamenti includono solo i file della vista e vengono chiusi quando cambiano filtri o inquadratura.

Interazioni: trascinare ruota la mappa con inerzia, la rotella e il pinch zoomano. Un clic su un punto singolo o sulla sua etichetta apre il documento e centra la camera. Il passaggio del mouse mostra metadati e anteprima; tre linee collegano il documento ai testi più vicini nella proiezione tra quelli della vista. I piccoli insiemi mostrano anche ID e titolo per i punti singoli. Le viste **3D**, **Frontale** e **Dall’alto** cambiano soltanto l’inquadratura. **Inquadra** ripristina lo zoom adatto ai risultati; la rotazione automatica è attivabile e inizialmente spenta. `prefers-reduced-motion` disattiva le animazioni della camera e la rotazione.

La sequenza dei giorni mostra conteggi e contesto. **Solo giorno** seleziona i file acquisiti in quel giorno (3, 15, 1.505). **Fino al giorno** include anche i giorni precedenti (3, 18, 1.523). **Riproduci** passa una volta dal giorno 1 al 3 in modalità cumulativa, con intervalli di 3,5 secondi. Le interazioni con i filtri e la selezione di un documento fermano la sequenza.

Ricerca, giorno, gruppo e formato si combinano e attenuano i punti esclusi. I formati TXT, HTML, JSON e XML si selezionano dai pulsanti nella legenda in basso: un secondo clic sul formato attivo ripristina tutti i formati. La camera adatta l’inquadratura anche quando due ricerche restituiscono lo stesso numero di file. Il riepilogo laterale segue i risultati; offre accesso diretto alle prime fonti della vista. Il lettore include navigazione precedente/successivo, testi vicini nella proiezione, provenienza, integrità e download.

`public/rag/catalog.json` (versione 2) conserva testo, metadati, provenienza, licenze, SHA‑256, `embedding` e `category`. Dal 23/10 l'interfaccia non usa più copie statiche dei file (spostate in `_archivio/pulizia_2026-10-23/`): il catalogo arriva da `/api/fieldlink/catalog`, calcolato sui file di `dati/`, e gli originali da `/api/fieldlink/files/…`. Da `catalog.json` vengono riprese solo le coordinate della mappa dei documenti invariati; i documenti nuovi (giorno 5) compaiono in una posizione di riserva. HTML e XML sono visualizzati come testo estratto, mai eseguiti nel lettore. Il catalogo non modifica né indicizza l'archivio usato dalla chat.

Per rigenerare catalogo ed embedding, dalla cartella frontend:

```sh
python3 scripts/build-rag-catalog.py --day-three '/percorso/giorno 3/archivio'
```

Il comando legge tutti i file supportati della directory indicata e i documenti dei giorni 1–2 e 4 dalla copia locale `Pacchetto_Operazione_Silenzio_PC/dati`. Calcola l'embedding in circa 8 secondi e scrive esclusivamente in `frontend/public/rag/`.

Verifiche:

```sh
CI=true yarn test -- --watchAll=false
CI=true yarn build
```

La vista Elenco offre accesso da tastiera a tutti i documenti. Nella mappa, frecce per ruotare, +/− per lo zoom, Home per ripristinare, Esc per uscire dal gruppo isolato, Pagina su/giù per selezionare i documenti della vista, Invio per aprire il gruppo più numeroso (o quello del documento selezionato). Il tasto / porta alla ricerca. Su touch: trascinamento e pinch per lo zoom.
