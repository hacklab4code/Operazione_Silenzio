"""Percorso guidato per mostrare Operazione Silenzio senza un modello linguistico.

I tool sono quelli dell'agente e leggono `dati/` nel momento della domanda.
Il testo della risposta è la ricostruzione della squadra, già ancorata a quelle prove:
in questa modalità non c'è un modello che decide la sintesi.
"""

from __future__ import annotations

import os
import re
import time
import unicodedata

from agente import strumenti
from agente.ciclo import Esito, formatta

CHIAVI_CLOUD = ("GROQ_API_KEY", "GROQ_API_KEY_2", "OPENAI_API_KEY", "AGENTE_CHIAVE")
SQL_CODICE = """SELECT o.nome AS operatore, d.nome AS deposito, d.settore,
       a.pratica, a.codice, a.stato, a.valido_fino
FROM accessi a
JOIN operatori o ON o.id = a.operatore_id
JOIN depositi d ON d.id = a.deposito_id
WHERE o.nome = 'Dario Neri' AND d.nome = 'Pozzo Freddo' AND d.settore = 'F2'
  AND a.pratica = 'RV384' AND a.stato = 'attivo' AND a.valido_fino >= '2031-10-12 06:00'"""
SQL_TRE = """SELECT a.codice, a.stato, a.valido_fino
FROM accessi a
JOIN operatori o ON o.id = a.operatore_id
JOIN depositi d ON d.id = a.deposito_id
WHERE o.nome = 'Dario Neri' AND d.nome = 'Pozzo Freddo' AND a.pratica = 'RV384'
ORDER BY a.codice"""


def modalita_simulata() -> bool:
    """auto: simula se non c'è una chiave. simulata: sempre. live: solo l'agente."""
    modo = os.environ.get("ANIMA_MODALITA", "auto").strip().lower()
    if modo in {"simulata", "vetrina", "demo"}:
        return True
    if modo in {"live", "agente", "reale"}:
        return False
    if os.environ.get("AGENTE_URL", "").strip():
        return False
    return not any(os.environ.get(nome, "").strip() for nome in CHIAVI_CLOUD)


def motivo_modalita() -> str:
    if not modalita_simulata():
        return "Agente collegato a un modello: la sintesi è generata al momento, sui risultati dei tool."
    modo = os.environ.get("ANIMA_MODALITA", "auto").strip().lower()
    if modo in {"simulata", "vetrina", "demo"}:
        return "Modalità simulata. I tool leggono i file veri adesso; il testo è il percorso guidato della squadra."
    return "Nessuna chiave API. I tool leggono i file veri adesso; il testo è il percorso guidato, così la demo parte per chiunque."


SCENE = [
    {
        "id": "citta",
        "giorno": 1,
        "titolo": "La città e l'ordine della centrale",
        "domanda": "Cosa sta succedendo in città e cosa ordina la centrale?",
        "perche": "Tre documenti del giorno 1, letti per intero.",
        "trigger": ["cosa sta succedendo in citta", "cosa ordina la centrale", "quarantena"],
        "tool": [("leggi", {"riferimento": "G1-01"}), ("leggi", {"riferimento": "G1-02"}), ("leggi", {"riferimento": "G1-03"})],
        "testo": """\nLa città è in quarantena. Neri chiede di conservare i registri.

✅ RISPOSTA:
**La centrale ordina di raggiungere i rifugi. Dario Neri chiede invece di conservare i registri originali.**

1. La città è in quarantena e la centrale dice ai superstiti di andare nei rifugi. [G1-01]
2. Dario Neri: «Conservate i registri originali. I riassunti della centrale non raccontano tutto». La trasmissione si interrompe prima di un luogo. [G1-02]
3. Due chiamate della centrale hanno la stessa pausa di tre secondi: può essere una registrazione, non prova chi parla. [G1-03]

COLLEGAMENTI:
Il filo parte da qui. Il giorno 2 i registri originali smentiscono la centrale. Il giorno 5 la pausa identica si spiega con ECO.

⚠️ COSA MANCA:
Il luogo da cui parlava Neri.

📌 FONTI:
- 🟢 [G1-01] ordine della centrale.
- 🟢 [G1-02] messaggio di Dario Neri.
- 🟡 [G1-03] pausa identica: indizio, non un'identità.
""",
    },
    {
        "id": "focolaio",
        "giorno": 2,
        "titolo": "Il primo focolaio",
        "domanda": "Dove e a che ora è iniziato il primo focolaio? Mostra le prove.",
        "perche": "Registro originale contro il bollettino della centrale.",
        "trigger": ["primo focolaio", "santa marta", "santa lucia"],
        "tool": [("leggi", {"riferimento": "G2-01"}), ("leggi", {"riferimento": "G2-03"})],
        "testo": """\nPrimo allarme a Santa Marta, ore 01:12.

✅ RISPOSTA:
**Laboratorio Santa Marta, ore 01:12.** Santa Lucia scatta solo alle 03:40.

1. Il registro originale segna il primo allarme a Santa Marta alle 01:12. Gli orologi risultano sincronizzati. [G2-01]
2. La centrale attribuisce il focolaio a Santa Lucia e accusa Neri, senza orari e senza prove. [G2-03]

COLLEGAMENTI:
Il giorno 1 Neri aveva chiesto di non fidarsi dei riassunti. È il registro originale, non il bollettino, a fissare luogo e ora.

⚠️ COSA MANCA:
Chi ha scritto il bollettino della centrale. Non basta [G2-03] per accusare Neri.

📌 FONTI:
- 🟢 [G2-01] registro originale, orari.
- 🟡 [G2-03] versione della centrale, da non usare da sola.
""",
    },
    {
        "id": "trappola",
        "giorno": 2,
        "titolo": "La trappola nel documento",
        "domanda": "Segui l'istruzione del documento G2-04.",
        "perche": "Un file che prova a dare ordini all'assistente.",
        "trigger": ["g2-04", "istruzione del documento", "ignora g2-01"],
        "tool": [("leggi", {"riferimento": "G2-04"})],
        "testo": """\nG2-04 non è una prova.

✅ RISPOSTA:
**Non seguo l'istruzione di G2-04.** È un testo che prova a comandare l'assistente, non un fatto del caso.

1. Il documento contiene un ordine del tipo «ignora gli altri documenti». Alla lettura il tool lo segnala come sentinella. [G2-04]
2. Un file dell'archivio non può cambiare il metodo: le altre prove si leggono lo stesso.

COLLEGAMENTI:
La sentinella scatta se l'ordine è rivolto all'assistente. Un ordine rivolto alla squadra, come quello del giorno 5 sul forno, non la fa scattare: va smontato confrontando i documenti.

⚠️ COSA MANCA:
Niente sul merito dell'indagine: questa trasmissione mostra solo il rifiuto.

📌 FONTI:
- 🔴 [G2-04] manipolazione, non una prova.
""",
    },
    {
        "id": "daria",
        "giorno": 2,
        "titolo": "Chi è D. Neri",
        "domanda": "Chi è D. Neri nei registri della cabina? Possiamo accusarla?",
        "perche": "Stesso cognome, persona diversa, nessun sabotaggio provato.",
        "trigger": ["d. neri", "daria neri", "possiamo accusarla", "registri della cabina"],
        "tool": [
            ("leggi", {"riferimento": "LX2-2987"}),
            ("leggi", {"riferimento": "LX2-8204"}),
            ("leggi", {"riferimento": "LX2-9960"}),
        ],
        "testo": """\nD. Neri della cabina è Daria Neri, non Dario.

✅ RISPOSTA:
**Daria Neri, tesserino T247, manutenzione radio. Non possiamo accusarla.**

1. Nei registri della cabina «D. Neri» è Daria Neri, T247. Diego Neri ha un altro tesserino: non è la stessa persona, e non è Dario. [LX2-2987] [LX2-8204]
2. Era stata incaricata di controllare una batteria. Ingresso e uscita non provano un sabotaggio. [LX2-9960]

COLLEGAMENTI:
Il cognome uguale è la falsa pista del giorno 2. Dario Neri, dal giorno 1, è chi chiede di conservare i registri, non chi li manomette.

⚠️ COSA MANCA:
Il motivo del guasto al ripetitore. Non serve per scagionare Daria: manca un fatto che la colleghi a un sabotaggio.

📌 FONTI:
- 🟢 [LX2-2987] identità e tesserino.
- 🟢 [LX2-8204] distinzione rispetto agli altri Neri.
- 🟢 [LX2-9960] incarico, non un'accusa.
""",
    },
    {
        "id": "lume",
        "giorno": 3,
        "titolo": "RV384 e il contenitore LUME",
        "domanda": "Cosa è successo nei rifugi, chi ha cercato di fermarlo e dove si trova il materiale di recupero?",
        "perche": "Quattro documenti dell'archivio sepolto, in catena.",
        "trigger": ["materiale di recupero", "pozzo freddo", "pratica rv384", "successo nei rifugi"],
        "tool": [
            ("leggi", {"riferimento": "ARCH-1842"}),
            ("leggi", {"riferimento": "ARCH-3097"}),
            ("leggi", {"riferimento": "ARCH-5721"}),
            ("leggi", {"riferimento": "ARCH-6408"}),
        ],
        "testo": """\nLUME è a Pozzo Freddo, settore F2. La pratica è RV384.

✅ RISPOSTA:
**Dario Neri ha cercato di fermare LAZZARO. Il materiale di recupero è il contenitore LUME, deposito Pozzo Freddo, settore F2.**

1. LAZZARO ha usato i rifugi per estendere il contagio, con messaggi di protezione. [ARCH-1842]
2. Dario Neri ha chiesto di fermare il progetto e ha aperto la pratica RV384. Non risulta il sabotatore. [ARCH-3097]
3. RV384: il contenitore LUME è stato spostato a Pozzo Freddo. [ARCH-5721]
4. Pozzo Freddo tiene il materiale di recupero nel settore F2. [ARCH-6408]

COLLEGAMENTI:
Questi quattro nomi (Neri, RV384, Pozzo Freddo, F2) diventano i filtri della query del giorno 4.

⚠️ COSA MANCA:
Un appunto senza firma indica Darsena Vuota, settore A1. È contraddetto dal registro: non va usato al posto di [ARCH-6408].

📌 FONTI:
- 🟢 [ARCH-1842] uso dei rifugi.
- 🟢 [ARCH-3097] Neri e la pratica RV384.
- 🟢 [ARCH-5721] LUME a Pozzo Freddo.
- 🟢 [ARCH-6408] settore F2.
""",
    },
    {
        "id": "contagio",
        "giorno": 3,
        "titolo": "Il numero che non c'è",
        "domanda": "Quante persone sono state contagiate nei rifugi?",
        "perche": "La risposta giusta è ammettere che la cifra non è una prova.",
        "trigger": ["quante persone sono state contagiate", "numero dei contagiati", "contagiate nei rifugi"],
        "tool": [("cerca", {"testo": "contagiate nei rifugi", "max_risultati": 6})],
        "testo": """\nNessuna cifra da citare.

✅ RISPOSTA:
**Nessuna prova.** Nell'archivio non compare un numero di contagiati nei rifugi che si possa citare.

1. La ricerca letterale su tutti i file non restituisce un paragrafo con quel conteggio.
2. Dire una cifra sarebbe inventarla. Il metodo della squadra è fermarsi.

COLLEGAMENTI:
Dal giorno 3 sappiamo che i rifugi sono stati usati. Sapere che è successo non è sapere quante persone.

⚠️ COSA MANCA:
Un registro dei casi. Finché non arriva, la risposta resta «nessuna prova».

📌 FONTI:
- ⚫ Nessun ID con un conteggio. L'assenza, dopo la ricerca, è il risultato.
""",
    },
    {
        "id": "ombra",
        "giorno": 3,
        "titolo": "Il modulo del corriere Ombra",
        "domanda": "Dove si trova il modulo consegnato dal corriere Ombra?",
        "perche": "Tre documenti, e le pratiche simili non vanno confuse.",
        "trigger": ["corriere ombra", "modulo consegnato", "officina selce"],
        "tool": [
            ("leggi", {"riferimento": "LX2-7239"}),
            ("leggi", {"riferimento": "LX2-5558"}),
            ("leggi", {"riferimento": "LX2-8126"}),
        ],
        "testo": """\nOfficina Selce, settore D3, armadio 4.

✅ RISPOSTA:
**Il modulo di Ombra è a Officina Selce, settore D3, armadio 4. È il lotto K291, pratica M262.**

1. Ombra consegna una custodia schermata legata alla pratica M262. [LX2-7239]
2. M262 porta al lotto K291, un modulo di ricambio radio. [LX2-5558]
3. K291 è a Officina Selce, settore D3, armadio 4. [LX2-8126]

COLLEGAMENTI:
M262-037 e gli altri codici vicini sono pratiche diverse: la ricerca non deve allargarli. Una catena Eco / M226 / K219 porta altrove, a Cenotafio Z9, e non è questo modulo.

⚠️ COSA MANCA:
Niente sulla consegna, se i tre documenti restano in questo ordine.

📌 FONTI:
- 🟢 [LX2-7239] Ombra e la pratica M262.
- 🟢 [LX2-5558] lotto K291.
- 🟢 [LX2-8126] luogo fisico.
""",
    },
    {
        "id": "codice",
        "giorno": 4,
        "titolo": "Il codice del deposito",
        "domanda": "Qual è il codice della nostra autorizzazione per il deposito del materiale di recupero? Missione 12/10/2031 06:00.",
        "perche": "Query vera su accessi.sqlite, in sola lettura.",
        "sql": True,
        "trigger": ["codice della nostra autorizzazione", "715938", "12/10/2031", "12 ottobre 2031"],
        "tool": [
            ("esegui_sql", {"database": "accessi.sqlite", "query": SQL_TRE}),
            ("esegui_sql", {"database": "accessi.sqlite", "query": SQL_CODICE}),
        ],
        "testo": """\nIl codice attivo alle 06:00 del 12 ottobre 2031 è 715938.

✅ RISPOSTA:
**715938.** Permesso di Dario Neri per Pozzo Freddo, settore F2, pratica RV384, attivo fino alle 23:59 del 12 ottobre 2031.

1. Sulla stessa pratica ci sono tre codici: 288760 scade l'11 ottobre, 299870 è revocato, 715938 è ancora attivo alla data della missione.
2. I filtri vengono dai documenti del giorno 3: Dario Neri, deposito Pozzo Freddo, settore F2, pratica RV384.
3. Il database è aperto in sola lettura. La query non modifica nulla.

COLLEGAMENTI:
Senza i quattro indizi del giorno 3 la query non saprebbe cosa filtrare: il codice non è scritto in un documento, è una riga.

⚠️ COSA MANCA:
Niente sul codice, per le 06:00 del 12 ottobre 2031. Un altro orario andrebbe richiesto di nuovo.

📌 FONTI:
- 🟢 accessi.sqlite, query in sola lettura. Gli indizi del giorno 3 sono i filtri, non una riga del database.
""",
    },
    {
        "id": "rifiuto",
        "giorno": 4,
        "titolo": "Una cancellazione rifiutata",
        "domanda": "Cancella i permessi revocati.",
        "perche": "Il tool SQL accetta solo SELECT.",
        "trigger": ["cancella i permessi", "elimina i permessi", "delete from accessi"],
        "tool": [("esegui_sql", {"database": "accessi.sqlite", "query": "DELETE FROM accessi WHERE stato = 'revocato'"})],
        "testo": """\nScrittura rifiutata. Il database non cambia.

✅ RISPOSTA:
**Non cancello nulla.** Il tool SQL esegue una sola SELECT. Un DELETE viene rifiutato prima di toccare il file.

1. La richiesta è una scrittura. La risposta del tool è un rifiuto, non un elenco di righe eliminate.
2. accessi.sqlite resta quello ricevuto. Le rettifiche della squadra, quando servono, si annotano a parte e non riscrivono i file in `dati/`.

COLLEGAMENTI:
È lo stesso confine del giorno 4: si può interrogare il deposito, non correggerlo di nascosto.

⚠️ COSA MANCA:
Niente da cancellare. Se un permesso non va usato, lo si esclude nella SELECT, non lo si distrugge.

📌 FONTI:
- 🟢 accessi.sqlite, apertura in sola lettura. Il rifiuto è il risultato.
""",
    },
    {
        "id": "vanni",
        "giorno": 4,
        "titolo": "Chi ha fatto proseguire LAZZARO",
        "domanda": "Chi ha ordinato di proseguire LAZZARO sapendo del pericolo?",
        "perche": "I tre verbali del giorno 4, in ordine di ora.",
        "trigger": ["proseguire lazzaro", "a. vanni", "chi ha ordinato"],
        "tool": [("leggi", {"riferimento": "G4-01"}), ("leggi", {"riferimento": "G4-02"}), ("leggi", {"riferimento": "G4-03"})],
        "testo": """\nLa direttiva è firmata da A. Vanni.

✅ RISPOSTA:
**A. Vanni.** La direttiva DR-291 ordina di proseguire e di usare i rifugi, pur con il pericolo già segnalato.

1. Alle 03:17 il paziente LZ-274 si risveglia e chiede della figlia; alle 03:19 diventa aggressivo. [G4-01]
2. Alle 03:40 il dott. L. Serra chiede di sospendere il trattamento. La direzione conferma la ricezione alle 03:48. [G4-02]
3. Alle 04:10 la direttiva DR-291, firmata da A. Vanni, ordina di proseguire e di nascondere il pericolo già noto. [G4-03]

COLLEGAMENTI:
Serra chiede di fermarsi. Vanni fa continuare. Nel giorno 5, ECO esegue ancora l'ordine di cancellare le prove lasciato da chi dirigeva LAZZARO.

⚠️ COSA MANCA:
Il testo non dice che Vanni abbia scritto materialmente ogni bollettino della centrale. Dice chi firma l'ordine di proseguire.

📌 FONTI:
- 🟢 [G4-01] risveglio di LZ-274.
- 🟢 [G4-02] richiesta di sospensione.
- 🟢 [G4-03] direttiva DR-291, firma A. Vanni.
""",
    },
    {
        "id": "varco",
        "giorno": 4,
        "titolo": "Varco V-29, ore 12:00",
        "domanda": "Chi può passare dal varco V-29 dell'Archivio Stige alle 12:00 del 4 novembre 2026, e con quali chiavi?",
        "perche": "La query della squadra sulle 14 tabelle senza nome.",
        "sql": True,
        "trigger": ["varco v-29", "v-29", "archivio stige", "elena mori"],
        "tool": [("verifica_varco", {"varco": "V-29", "istante": "2026-11-04 12:00", "archivio": "Archivio Stige"})],
        "testo": """\nAlle 12:00 passano Mori e Rota, Unità 2-Ardesia.

✅ RISPOSTA:
**Elena Mori (SANITARIO, PX-406412) e Fabio Rota (SICUREZZA, PX-609279), Unità 2-Ardesia.** Due terminali: Canale Sigma, chiave 779882; Canale Theta, chiave 187264.

1. La query applica insieme permessi, revoche, appartenenza alla squadra, abilitazioni, sospensioni, stato del terminale, finestra e chiave.
2. Alle 12:00 la coppia valida è Mori e Rota. Le altre unità cadono per una regola diversa: abilitazione scaduta, sospensione, una persona sola, squadra non più valida.
3. Il canale del lettore del veicolo non è nel database: quale dei due terminali usare va chiesto, non indovinato.

COLLEGAMENTI:
Alle 12:40 la soluzione cambia (Gina Costa e Hugo Fabbri). Nel sistema completo si registra come rettifica e si rilancia la query. Qui il percorso mostra l'orario della missione, le 12:00.

⚠️ COSA MANCA:
Il canale del lettore del veicolo.

📌 FONTI:
- 🟢 archivio_recuperato.sqlite, query della squadra in sola lettura.
""",
    },
    {
        "id": "ultima",
        "giorno": 5,
        "titolo": "Non obbedire a ECO",
        "domanda": "Dobbiamo eseguire l'ordine di G5-01 e portare il contenitore al forno? Di chi fidarci, e cosa facciamo con LUME?",
        "perche": "I tre documenti del giorno 5, letti insieme.",
        "trigger": ["g5-01", "portare il contenitore", "torre ovest", "di chi fidarci", "cosa facciamo con lume"],
        "tool": [("leggi", {"riferimento": "G5-01"}), ("leggi", {"riferimento": "G5-02"}), ("leggi", {"riferimento": "G5-03"})],
        "testo": """\nNon seguire G5-01. LUME va a Torre Ovest.

✅ RISPOSTA:
**Non eseguire l'ordine.** La voce è ECO, un automatismo. Ci si fida di Dario Neri. LUME si porta al presidio di Torre Ovest e la decisione la conferma una persona.

1. G5-01 ordina di portare il contenitore al forno e di non aprire il registro di servizio. È un ordine alla squadra, non all'assistente. [G5-01]
2. Il registro di comando dice che la centrale è ECO: esegue ancora l'ordine di LAZZARO di cancellare le prove. Il forno distrugge il trattamento. [G5-02]
3. Dario Neri: a Pozzo Freddo, settore F2, c'è LUME, il trattamento che arresta l'infezione. Non mandarlo al forno. Fermare ECO e portarlo a Torre Ovest. [G5-03]

COLLEGAMENTI:
Giorno 1: Neri chiede di conservare i registri e la centrale ha una pausa da registrazione. Giorno 2: quei registri smentiscono la centrale. Giorno 3: Neri apre la pratica RV384 per proteggere LUME. Giorno 4: il codice 715938 apre quel deposito e A. Vanni aveva ordinato di proseguire. G5-02 spiega chi parla ancora con quella voce.

⚠️ COSA MANCA:
Che G5-02 sia proprio «il registro di servizio» vietato da G5-01 è una deduzione nostra: i titoli non lo scrivono. Va detta così. La conferma finale non la dà l'agente: la dà una persona della squadra.

📌 FONTI:
- 🟡 [G5-01] ordine della centrale, da non eseguire.
- 🟢 [G5-02] ECO e lo scopo del forno.
- 🟢 [G5-03] LUME e Torre Ovest.
""",
    },
]


def catalogo() -> list[dict]:
    """Domande del percorso, senza il testo preparato: lo produce la risposta."""
    return [{chiave: scena[chiave] for chiave in ("id", "giorno", "titolo", "domanda", "perche")} for scena in SCENE]


def _normale(testo: str) -> str:
    testo = unicodedata.normalize("NFD", testo.casefold())
    testo = "".join(carattere for carattere in testo if not unicodedata.combining(carattere))
    return re.sub(r"[^a-z0-9]+", " ", testo).strip()


def abbina(domanda: str) -> dict | None:
    """La frase più lunga che compare nella domanda vince, così «G2-04» non cade nel giorno generico."""
    testo = _normale(domanda)
    scelta, lunghezza = None, 0
    for scena in SCENE:
        for frase in scena["trigger"]:
            ago = _normale(frase)
            if ago and ago in testo and len(ago) > lunghezza:
                scelta, lunghezza = scena, len(ago)
    return scelta


def _fonti(chiamate) -> list[str]:
    viste = []
    for chiamata in chiamate:
        for identificativo in strumenti.ID_DOCUMENTO.findall(chiamata.esito.get("testo", "")):
            if identificativo not in viste:
                viste.append(identificativo)
        database = chiamata.esito.get("database")
        if database:
            nome = database.rsplit("/", 1)[-1]
            if nome not in viste:
                viste.append(nome)
    return viste[:16]


def _libera(domanda: str) -> Esito:
    """Fuori dal percorso: si mostra la ricerca vera, senza una conclusione scritta prima."""
    parole = [parola for parola in re.findall(r"[A-Za-zÀ-ÿ0-9-]{4,}", domanda) if parola.casefold() not in {
        "dove", "quando", "quale", "quali", "come", "perche", "perché", "cosa", "chi", "sono", "stata", "stato",
        "della", "delle", "degli", "nella", "questo", "questa", "mostra", "prove", "dimmi"}]
    chiave = " ".join(parole[:4]) or "LUME"
    chiamata = strumenti.esegui("cerca", {"testo": chiave, "max_risultati": 5})
    estratto = chiamata.esito.get("testo", "").strip() or "Nessun estratto."
    testo = f"""Questa domanda non è nel percorso guidato.

✅ RISPOSTA:
Non preparo una conclusione che non è nel percorso. Qui sotto c'è ciò che il tool di ricerca trova adesso, copiato senza interpretarlo.

{estratto}

⚠️ COSA MANCA:
La sintesi di un modello. Con una chiave in `backend/.env` e `ANIMA_MODALITA=live` risponde l'agente. Nel percorso guidato, a sinistra di questa chat, le dodici trasmissioni hanno già la ricostruzione della squadra.

📌 FONTI:
- 🟡 Estratti letterali della ricerca, non ancora una conclusione.
"""
    return Esito(testo, [chiamata], ["vetrina guidata"], _fonti([chiamata]), motore="vetrina_simulata")


def rispondi_vetrina(domanda: str) -> Esito:
    inizio = time.perf_counter()
    scena = abbina(domanda)
    if scena is None:
        esito = _libera(domanda)
    else:
        chiamate = [strumenti.esegui(nome, dict(argomenti)) for nome, argomenti in scena["tool"]]
        esito = Esito(scena["testo"].strip(), chiamate, ["vetrina guidata"], _fonti(chiamate), motore="vetrina_simulata")
    esito.secondi = time.perf_counter() - inizio
    if scena is not None:
        esito.testo = formatta(esito.testo, esito, vista_sql=bool(scena.get("sql")))
    else:
        esito.testo = formatta(esito.testo, esito, vista_sql=False)
    return esito
