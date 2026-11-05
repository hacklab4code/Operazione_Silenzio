

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from agente import strumenti
from agente.modelli import ModelliNonDisponibili, completa
from agente.prompt import sistema

MAX_PASSI = 24              # giri modello → tool (il varco V-29 collega 12 tabelle)
MAX_TOKEN_DOMANDA = int(os.environ.get("AGENTE_MAX_TOKEN", 70_000))   # oltre, niente più tool: quota giornaliera
TEMPO_MASSIMO = int(os.environ.get("AGENTE_TEMPO_MASSIMO", 160))         # secondi; il browser aspetta al massimo 180
RISULTATI_COMPLETI = 2      # i risultati più vecchi vengono accorciati per restare nella quota
CITAZIONE = re.compile(r"\[([^\[\]\n]{2,80})\]")
TRATTINI = re.compile(r"[‐‑‒−]")   # trattini e meno Unicode; – e — restano separatori
SPAZI = re.compile(r"[\u00a0\u2007\u2009\u202f]")   # spazi stretti o indivisibili: «D.\u202fNeri» → «D. Neri»
PENSIERO = re.compile(r"<think>.*?(?:</think>|$)", re.S)   # ragionamento dei modelli locali, non è la risposta
TOOL_COME_TESTO = re.compile(r"<function=|<tool_call>|^\s*\{\s*\"name\"\s*:", re.M)


@dataclass
class Esito:
    testo: str
    chiamate: list = field(default_factory=list)
    modelli: list = field(default_factory=list)
    fonti: list = field(default_factory=list)
    citazioni_non_verificate: list = field(default_factory=list)
    secondi: float = 0.0
    token: int = 0
    motore: str = "agente_tool"


def _argomenti(grezzi: str) -> dict:
    try:
        valore = json.loads(grezzi or "{}")
        return valore if isinstance(valore, dict) else {}
    except json.JSONDecodeError:
        return {}


def _accorcia_vecchi(messaggi: list[dict]) -> None:
    risultati = [m for m in messaggi if m.get("role") == "tool"]
    for messaggio in risultati[:-RISULTATI_COMPLETI]:
        if messaggio["content"].startswith(("🧭", "🗄")) or "## Foglio" in messaggio["content"]:
            continue   # mappa del database e regole della missione servono fino alla fine
        if len(messaggio["content"]) > 500:
            messaggio["content"] = messaggio["content"][:500] + "\n[…accorciato: richiama il tool se serve di nuovo]"


def _storia(storia: list[tuple[str, str]]) -> list[dict]:
    messaggi = []
    for ruolo, testo in storia[-6:]:
        testo = re.split(r"\n\s*PROVENIENZA DEI RISCONTRI:", testo or "")[0].strip()
        if testo:
            messaggi.append({"role": "assistant" if ruolo == "marco" else "user", "content": testo[:1200]})
    return messaggi


def _in_testo(messaggi: list[dict]) -> list[dict]:
    """Per la risposta finale senza tool: chiamate e risultati diventano testo semplice.
    Alcuni provider rifiutano una richiesta senza tool se la cronologia ne contiene."""
    sistema, *resto = messaggi
    righe = []
    for m in resto:
        if m.get("tool_calls"):
            righe += [f"[chiamata] {c['function']['name']} {c['function'].get('arguments', '')}" for c in m["tool_calls"]]
        elif m["role"] == "tool":
            righe.append(f"[risultato]\n{m['content']}")
        elif m.get("content"):
            righe.append(f"[{'squadra' if m['role'] == 'user' else 'A.N.I.M.A.'}] {m['content']}")
    return [sistema, {"role": "user", "content": "\n\n".join(righe)}]


def _visti(chiamate: list) -> set[str]:
    """Tutto ciò che i tool hanno mostrato: ID, nomi di file e percorsi citabili."""
    visti = set()
    for chiamata in chiamate:
        if chiamata.nome == "elenca_file":
            continue   # un nome in un elenco non è un documento letto: citarlo non è una prova
        testo = chiamata.esito.get("testo", "")
        visti.update(strumenti.ID_DOCUMENTO.findall(testo))
        visti.update(re.findall(r"\bR-\d+\b", testo))   # rettifiche della squadra
        visti.update(re.findall(r"\[([^\[\]\n]+)\]", testo))
        for percorso in re.findall(r"[\w./-]+\.(?:txt|html|json|xml|xlsx|sqlite|zip|ipynb|csv)", testo):
            visti.update({percorso, percorso.rsplit("/", 1)[-1], percorso.rsplit("/", 1)[-1].rsplit(".", 1)[0]})
        if chiamata.nome == "verifica_varco" and not chiamata.esito.get("errore"):
            visti.add("verifica_varco")   # la query della squadra è una fonte dichiarata
        if chiamata.esito.get("database"):
            database = chiamata.esito["database"]
            visti.update({database, database.rsplit("/", 1)[-1]})
    return {v.casefold() for v in visti}


RIPETUTA = ("Chiamata identica a una già eseguita in questa domanda: il risultato è lo stesso di prima. "
            "Non ripeterla: cambia parole o tool (per tabelle dai nomi poco chiari profila_database, poi esegui_sql).")


NEGATIVA = re.compile(r"nessun[ao]? (?:prova|dato|record|riga|document)|non (?:è stat[ao] |sono stat[ie] )?(?:trovat|individuat)"
                      r"|non (?:risult|compar)|dati non (?:presenti|disponibili)", re.I)


ORDINE = re.compile(r"\b(?:esegu|segu|obbedisc|confermal?)\w*\b", re.I)


def _affrettata(domanda: str, finale: str, esito: Esito) -> str | None:
    """Controllo sul metodo, non sul caso: risposta data senza leggere, o «nessuna prova» prima di seguire gli indizi."""
    citati = strumenti.ID_DOCUMENTO.findall(domanda)
    if citati and not esito.chiamate:
        return (f"Hai risposto senza usare i tool. Leggi prima {', '.join(dict.fromkeys(citati))} con leggi, confrontalo "
                "con gli altri documenti e poi rispondi nel formato richiesto, con le fonti.")
    if citati and ORDINE.search(domanda):   # «esegui l'ordine di X»: X non decide quali prove si guardano
        accanto = {i for c in esito.chiamate for i in strumenti.ID_DOCUMENTO.findall(
            c.esito.get("testo", "").split("📂 Stesso fascicolo", 1)[-1]) if "📂 Stesso fascicolo" in c.esito.get("testo", "")}
        accanto -= set(citati)
        if accanto and not accanto & set(strumenti.ID_DOCUMENTO.findall(finale)):
            elenco = ", ".join(sorted(accanto))
            return (f"Prima di decidere confronta {', '.join(dict.fromkeys(citati))} con {elenco}, che i tool ti hanno già "
                    "mostrato nello stesso fascicolo: un documento non può vietarti di guardare le altre prove. Chi dà davvero "
                    "l'ordine e a cosa serve? Prima riga **Seguire** o **Non seguire**, con le prove di tutti i documenti.")
    corpo = re.split(r"\n\s*(?:⚠️\s*)?COSA MANCA", finale, maxsplit=1, flags=re.I)[0]
    if not NEGATIVA.search(corpo):
        return None
    query_con_righe = any(c.nome == "esegui_sql" and c.esito.get("righe") for c in esito.chiamate)
    celle = any("Celle di database:" in c.esito.get("testo", "") for c in esito.chiamate if c.nome == "cerca")
    missioni = any(c.nome == "leggi" and "missioni/" in str(c.argomenti.get("riferimento", "")) for c in esito.chiamate)
    if celle and not query_con_righe:
        return ("Non concludere ancora. Un valore della domanda compare nelle celle di un database, ma non hai interrogato "
                "le tabelle collegate. Leggi la missione del giorno (foglio Regole) se non l'hai letta, chiama "
                "profila_database per capire come si collegano le tabelle, poi risolvi con esegui_sql. "
                "Scrivi «nessuna prova» solo se le query lo confermano.")
    if len(esito.chiamate) < 5:
        return ("Prima di concludere «nessuna prova»: hai seguito ogni nome, codice e luogo trovato? "
                + ("" if missioni else "Leggi la missione del giorno che riguarda la domanda. ")
                + "Se un database è collegato, interrogalo con esegui_sql. Se dopo queste verifiche il dato manca, rispondi così.")
    return None


def _chiave(nome: str, argomenti: dict) -> str:
    pulito = {k: " ".join(str(v).split()).casefold() for k, v in argomenti.items() if v not in (None, "", 0)}
    return nome + json.dumps(pulito, sort_keys=True, ensure_ascii=False)


def _segna_inventate(finale: str, inventate: list[str]) -> str:
    """Una fonte che nessun tool ha restituito non può restare 🟢: l'interfaccia la mostrerebbe verificata."""
    if not inventate:
        return finale
    for citazione in inventate:
        finale = re.sub(rf"(?m)^(\s*[-*]?\s*)(?:🟢|🟡|🔴)?\s*\[{re.escape(citazione)}\](.*)$",
                        rf"\1⚫ [{citazione}]\2 — citazione non trovata nei risultati dei tool, non è una prova", finale)
    elenco = ", ".join(f"[{c}]" for c in inventate)
    nota = f"⚠️ Attenzione: questa risposta cita fonti che i tool non hanno restituito ({elenco}). Non usarla come prova."
    risposta = re.search(r"(?m)^.*RISPOSTA\W*:\s*$", finale)
    if risposta:
        return finale[:risposta.end()] + "\n" + nota + finale[risposta.end():]
    return nota + "\n\n" + finale


def _descrivi(chiamata) -> str:
    a = {k: v for k, v in chiamata.argomenti.items() if v not in (None, "", 0)}
    dettaglio = {
        "cerca": lambda: f"«{a.get('testo', '')}»" + (f" · giorno {a['giorno']}" if a.get("giorno") else "")
                         + (f" · {a['cartella']}" if a.get("cartella") else ""),
        "leggi": lambda: str(a.get("riferimento", "")),
        "elenca_file": lambda: ", ".join(f"{k}={v}" for k, v in a.items()) or "panoramica",
        "schema_database": lambda: a.get("database") or "elenco",
        "profila_database": lambda: a.get("database", ""),
        "registra_rettifica": lambda: f"{a.get('documento', '')}: «{a.get('testo_originale', '')}» → «{a.get('testo_nuovo', '')}»",
        "esegui_sql": lambda: f"{a.get('database', '')}: " + " ".join(str(a.get("query", "")).split())[:140],
        "verifica_varco": lambda: f"query della squadra · {a.get('archivio', '')}, {a.get('varco', '')}, {a.get('istante', '')}",
    }.get(chiamata.nome, lambda: json.dumps(a, ensure_ascii=False))()
    prima_riga = chiamata.esito.get("testo", "").splitlines()[0][:90] if chiamata.esito.get("testo") else ""
    stato = "⚠️ " if chiamata.esito.get("errore") else ""
    return f"- {stato}{chiamata.nome} {dettaglio} → {prima_riga} ({chiamata.millisecondi / 1000:.1f} s)"


def _completa_conteggio_sql(domanda: str, esito: Esito,
                            avviso: Optional[Callable[[str], None]] = None) -> None:
    """Esegue COUNT(*) quando la domanda chiede un conteggio e il modello ha solo letto lo schema."""
    if not re.search(r"\b(numero|quanti|quante|conteggio|conta|count)\b", domanda, re.I):
        return
    if any(c.nome == "esegui_sql" and not c.esito.get("errore") for c in esito.chiamate):
        return

    for schema in reversed(esito.chiamate):
        database = schema.esito.get("database")
        if schema.nome not in {"schema_database", "profila_database"} or not database:
            continue
        righe_schema = schema.esito.get("testo", "").splitlines()
        tabelle = [m.group(1) for riga in righe_schema
                   if (m := re.match(r"^([A-Za-z_][A-Za-z0-9_]*) \(\d+ righe\):", riga))]
        tabella = next((nome for nome in tabelle
                        if re.search(rf"\b{re.escape(nome)}\b", domanda, re.I)), None)
        if not tabella:
            continue
        query = f'SELECT COUNT(*) AS totale FROM "{tabella.replace(chr(34), chr(34) * 2)}"'
        chiamata = strumenti.esegui("esegui_sql", {"database": database, "query": query})
        esito.chiamate.append(chiamata)
        if avviso:
            avviso(_descrivi(chiamata))
        return


def rispondi(domanda: str, storia: Optional[list[tuple[str, str]]] = None, team: bool = False,
             modalita: str = "auto", avviso: Optional[Callable[[str], None]] = None,
             tempo: float = TEMPO_MASSIMO, sessione: str = "") -> Esito:
    strumenti.SESSIONE.set((sessione, domanda))   # per cronologia_chat
    if modalita != "free" and STORIA_INTERA.search(domanda):
        return _storia_intera(domanda, team, modalita, avviso)
    inizio = time.monotonic()
    scadenza = inizio + tempo
    messaggi = [{"role": "system", "content": sistema(team, modalita)}, *_storia(storia or []),
                {"role": "user", "content": domanda}]
    esito = Esito("")
    strumenti_attivi = None if modalita == "free" else strumenti.DEFINIZIONI
    finale = ""
    gia_fatte: set[str] = set()
    insistito = False
    for passo in range(MAX_PASSI):
        if passo == MAX_PASSI - 1 or time.monotonic() > scadenza - 25 or esito.token > MAX_TOKEN_DOMANDA:
            break   # niente più tool: la risposta finale qui sotto, senza strumenti
        scelta = "required" if passo == 0 and modalita == "documentary" else "auto"
        messaggio, modello = completa(messaggi, strumenti_attivi, scelta, scadenza)
        esito.modelli.append(modello)
        esito.token += messaggio.get("_token", 0)
        richieste = messaggio.get("tool_calls") or []
        if not richieste:
            finale = PENSIERO.sub("", messaggio.get("content") or "").strip()
            if TOOL_COME_TESTO.search(finale):   # alcuni modelli scrivono la chiamata invece di farla
                finale = ""
                messaggi.append({"role": "user", "content": "Usa i tool con una vera chiamata, non scriverla nel testo."})
                continue
            spinta = None if insistito or strumenti_attivi is None or passo > MAX_PASSI - 4 else _affrettata(domanda, finale, esito)
            if spinta:   # una sola volta: il modello ha concluso «nessuna prova» senza seguire gli indizi
                insistito, finale = True, ""
                messaggi += [{"role": "assistant", "content": messaggio.get("content") or ""},
                             {"role": "user", "content": spinta}]
                continue
            break
        messaggi.append({"role": "assistant", "content": PENSIERO.sub("", messaggio.get("content") or "").strip(),
                         "tool_calls": richieste})
        for richiesta in richieste:
            funzione = richiesta.get("function", {})
            nome, argomenti = funzione.get("name", ""), _argomenti(funzione.get("arguments"))
            chiave = _chiave(nome, argomenti)
            if chiave in gia_fatte:   # i modelli ripetono la stessa ricerca e consumano i giri
                messaggi.append({"role": "tool", "tool_call_id": richiesta.get("id", ""), "content": RIPETUTA})
                continue
            chiamata = strumenti.esegui(nome, argomenti)
            esito.chiamate.append(chiamata)
            gia_fatte.add(chiave)
            if nome in {"registra_rettifica", "annulla_rettifica"}:
                gia_fatte.clear()   # con una rettifica le stesse chiamate danno risultati nuovi
            if avviso:
                avviso(_descrivi(chiamata))
            messaggi.append({"role": "tool", "tool_call_id": richiesta.get("id", ""), "content": chiamata.esito.get("testo", "")})
        _accorcia_vecchi(messaggi)
    if not finale:
        messaggi.append({"role": "user", "content": "Tempo dei tool finito. Scrivi ora la risposta finale nel formato richiesto "
                                                    "con le sole prove raccolte; in COSA MANCA elenca le verifiche non completate. "
                                                    "Nomi, codici e righe che non compaiono nei risultati qui sopra non esistono: "
                                                    "se non li hai trovati, scrivi che non li hai trovati."})
        # Con molto contesto il ragionamento può consumare tutti i token: risposta vuota.
        messaggio, modello = completa(_in_testo(messaggi), None, "none", scadenza + 20, max_token=4000, ragionamento="low")
        esito.modelli.append(modello)
        esito.token += messaggio.get("_token", 0)
        finale = TOOL_COME_TESTO.split(PENSIERO.sub("", messaggio.get("content") or "").strip())[0].strip() or \
            "Non sono riuscito a completare la ricerca nel tempo disponibile: riprova o restringi la domanda."

    _completa_conteggio_sql(domanda, esito, avviso)
    return _concludi(finale, esito, inizio)


MULTIPLA = re.compile(r"\[([^\[\]\n]{2,160}?(?:;|,|→)[^\[\]\n]{1,160}?)\]")   # «[A ; B]», «[A → B]»


def _separa(dentro: str) -> str:
    """«A ; B → C» tra quadre diventa «[A] [B] → [C]»: ogni fonte si verifica da sola."""
    pezzi = [p for p in re.split(r"\s*(→|;|,)\s*", dentro.strip()) if p and p not in {";", ","}]
    if not all(p == "→" or re.fullmatch(r"[\w./:-]+", p) for p in pezzi):
        return f"[{dentro}]"   # testo libero tra quadre, non un elenco di fonti
    return " ".join("→" if p == "→" else f"[{p}]" for p in pezzi)


def _concludi(finale: str, esito: Esito, inizio: float, vista_sql: bool = True) -> Esito:
    """Controllo delle citazioni sui risultati dei tool e formato per la chat."""
    visti = _visti(esito.chiamate)
    # I modelli scrivono spesso G5‑01 con un trattino Unicode: per il controllo e per i link vale come G5-01.
    finale = re.sub(r"\[[ \t]+([^\[\]\n]{2,80}?)[ \t]+\]", r"[\1]", SPAZI.sub(" ", TRATTINI.sub("-", finale)))   # «[ G5-01 ]» → «[G5-01]»
    finale = MULTIPLA.sub(lambda m: _separa(m.group(1)), finale)
    citate = list(dict.fromkeys(c.strip() for c in CITAZIONE.findall(finale)))
    esito.fonti = [c for c in citate if c.casefold() in visti]
    esito.citazioni_non_verificate = [c for c in citate if c.casefold() not in visti and not c.startswith("…")]
    finale = _segna_inventate(finale, esito.citazioni_non_verificate)
    esito.secondi = time.monotonic() - inizio
    esito.testo = formatta(finale, esito, vista_sql)
    return esito


STORIA_INTERA = re.compile(r"\bdal giorno \d+ al giorno \d+|\btutta la storia\b|\btutti i giorni\b|"
                           r"\briassum\w* (?:la|l'intera) storia\b|\bgiorno per giorno\b", re.I)
COMPITO = re.compile(r"(?m)^Oggi\s*\|\s*(.+)$")   # la riga «Oggi | …» del foglio Missione: la domanda del giorno
TEMPO_GIORNO = 45   # secondi al massimo per ogni sotto-indagine
TEMPO_STORIA = 140  # secondi per tutte le sotto-indagini: il browser aspetta al massimo 180


def _compiti_dei_giorni() -> list[tuple[int, str]]:
    """Per ogni giorno presente in dati/, il compito scritto nella sua missione principale, letto adesso."""
    compiti = []
    for giorno in sorted(strumenti._giorni_presenti()):
        missioni = sorted(p for p in (strumenti.DATI / f"giorno_{giorno}" / "missioni").glob("*.xlsx")
                          if "imprevist" not in p.name.casefold()) if (strumenti.DATI / f"giorno_{giorno}" / "missioni").is_dir() else []
        righe = [r.strip() for p in missioni for r in COMPITO.findall(strumenti.estrai_testo(p))]
        compiti.append((giorno, righe[0] if righe else ""))
    return compiti


def _storia_intera(domanda: str, team: bool, modalita: str, avviso: Optional[Callable[[str], None]]) -> Esito:
    """Domanda su tutta la storia: una sotto-indagine con i tool per ogni giorno, poi una sintesi delle sole prove trovate."""
    inizio = time.monotonic()
    domande = [(g, f"Giorno {g}." + (f" Compito della missione: «{c}»." if c else "")
                + f" Leggi i documenti e la missione del giorno {g} e rispondi con la scoperta principale del giorno "
                  f"{g} (persone, luoghi, codici, decisioni) e la sua prova. Solo il giorno {g}.") for g, c in _compiti_dei_giorni()]
    if avviso:
        avviso(f"- piano: {len(domande)} sotto-indagini, una per giorno ({', '.join(f'giorno {g}' for g, _ in domande)})")
    parziali, scoperte = [], []   # la storia è cumulativa: ogni giorno riceve le scoperte dei giorni prima
    for numero, (giorno, testo) in enumerate(domande):
        restante = inizio + TEMPO_STORIA - time.monotonic()
        tempo = max(30, min(TEMPO_GIORNO, restante / (len(domande) - numero)))
        if scoperte:
            testo += " Scoperte dei giorni precedenti, già verificate con i tool: " + " · ".join(scoperte)
        parziale = _sotto_indagine(testo, modalita, avviso, tempo)
        parziali.append(parziale)
        riga = next((r.strip("* ") for r in parziale.testo.splitlines() if r.startswith("**")), "")
        if riga:
            scoperte.append(f"giorno {giorno}: {riga[:220]}")
    esito = Esito("")
    sintesi = []
    for (giorno, _), parziale in zip(domande, parziali):
        esito.chiamate += parziale.chiamate
        esito.modelli += parziale.modelli
        esito.token += parziale.token
        testo = re.split(r"\n\s*(?:PROVENIENZA DEI RISCONTRI:|QUERY ESEGUITA:)", parziale.testo)[0].strip()
        sintesi.append(f"### Giorno {giorno}\n{testo}")
    richiesta = (f"Domanda della squadra: {domanda}\n\nLe sotto-indagini qui sotto sono state fatte ora con i tool, una per "
                 "giorno. Scrivi la risposta finale nel formato richiesto usando solo questi risultati: per ogni giorno la "
                 "prova principale con il suo ID e con nomi, codici e numeri esatti trovati dalla sotto-indagine (non riassumerli via), "
                 "poi come i giorni si collegano. Cita solo ID che compaiono qui sotto; ignora "
                 "le citazioni segnate come non trovate.\n\n" + "\n\n".join(sintesi))
    try:
        messaggio, modello = completa([{"role": "system", "content": sistema(team, modalita)},
                                       {"role": "user", "content": richiesta}], None, "none",
                                      time.monotonic() + 60, max_token=4000, ragionamento="low")
        esito.modelli.append(modello)
        esito.token += messaggio.get("_token", 0)
        finale = PENSIERO.sub("", messaggio.get("content") or "").strip()
    except ModelliNonDisponibili:
        finale = ""
    return _concludi(finale or "\n\n".join(sintesi), esito, inizio, vista_sql=False)   # un riassunto, non una query


def _sotto_indagine(domanda: str, modalita: str, avviso: Optional[Callable[[str], None]], tempo: float) -> Esito:
    try:
        return rispondi(domanda, modalita=modalita, avviso=avviso, tempo=tempo)
    except ModelliNonDisponibili as errore:
        return Esito(f"Sotto-indagine non completata: {errore}")


def _corpo(finale: str) -> str:
    """Il testo del modello senza titolo e senza l'etichetta della risposta."""
    righe = finale.strip().splitlines()
    if righe and not re.search(r"RISPOSTA|COSA MANCA|FONTI", righe[0], re.I) and len(righe[0]) < 90:
        righe = righe[1:]
    testo = "\n".join(righe).strip()
    testo = re.sub(r"^\W*RISPOSTA\W*:\s*", "", testo, flags=re.I)
    return re.split(SEZIONE, testo, maxsplit=1, flags=re.I)[0].strip()


SEZIONE = r"\n\s*\W*(?:COLLEGAMENTI(?: TRA DOCUMENTI)?|COSA MANCA|FONTI(?: & ATTENDIBILITÀ| & ATTENDIBILITA| CITATE| RECUPERATE)?)\W*:"


def _cosa_manca(finale: str) -> str:
    """La sezione COSA MANCA, che la vista SQL altrimenti perderebbe (es. il dato da chiedere alla centrale)."""
    parti = re.split(r"\n\s*\W*COSA MANCA\W*:", "\n" + finale, maxsplit=1, flags=re.I)
    return re.split(SEZIONE, "\n" + parti[1], maxsplit=1, flags=re.I)[0].strip() if len(parti) == 2 else ""


def formatta(finale: str, esito: Esito, vista_sql: bool = True) -> str:
    traccia = [_descrivi(c) for c in esito.chiamate]
    modelli = ", ".join(dict.fromkeys(esito.modelli))
    nota = f"{len(esito.chiamate)} chiamate ai tool in {esito.secondi:.0f} s · ≈{esito.token} token · modello {modelli}."
    if esito.citazioni_non_verificate:
        nota += (" ⚠️ Citazioni non trovate nei risultati dei tool, da non considerare prove: "
                 + ", ".join(f"[{c}]" for c in esito.citazioni_non_verificate) + ".")
    query = [c for c in esito.chiamate if vista_sql and c.nome in {"esegui_sql", "verifica_varco"} and not c.esito.get("errore") and c.esito.get("colonne")]
    # Vista SQL solo se la risposta usa davvero un database come fonte.
    citati = {f.casefold().rsplit("/", 1)[-1] for f in esito.fonti}
    query = [c for c in query if c.esito["database"].rsplit("/", 1)[-1].casefold() in citati
             or any(str(v) in finale for riga in c.esito["righe"][:5] for v in riga if v is not None and len(str(v)) >= 4)]
    documenti = [f for f in esito.fonti if not f.casefold().endswith(tuple(strumenti.FORMATI_DATABASE))]
    if documenti and not any(c.esito.get("righe") for c in query):
        query = []   # una query a vuoto accanto a prove documentali: la vista SQL coprirebbe la risposta
    if query:
        decisiva = next((c for c in reversed(query) if c.esito.get("righe")), query[-1])
        giorno = re.search(r"giorno_(\d+)", decisiva.esito.get("database", ""))
        righe = {"colonne": decisiva.esito["colonne"], "righe": decisiva.esito["righe"]}
        return "\n".join([
            f"🔎 TOOL SQL · GIORNO {giorno.group(1) if giorno else '?'}", "",
            "✅ RISPOSTA:", _corpo(finale), *(["", "**Da verificare:**", manca] if (manca := _cosa_manca(finale)) else []), "",
            "QUERY ESEGUITA:", decisiva.esito["query"],
            "PARAMETRI:", "[]",
            "RIGHE RESTITUITE:", json.dumps(righe, ensure_ascii=False, default=str), "",
            f"📌 FONTE: {decisiva.esito['database'].rsplit('/', 1)[-1]} · apertura in sola lettura · "
            f"{len(query)} query su {len(esito.chiamate)} chiamate ai tool · {modelli}",
        ])
    if not esito.chiamate:
        return finale + (f"\n\n{nota}" if esito.citazioni_non_verificate else "")
    return f"{finale}\n\nPROVENIENZA DEI RISCONTRI:\n" + "\n".join(traccia) + f"\n{nota}"


def senza_modello(domanda: str, motivo: str) -> Esito:
    """Riserva senza LLM: mostra cosa trovano i tool, senza interpretare."""
    interrogative = {"chi", "cosa", "che", "dove", "quando", "quale", "quali", "qual", "come", "perché", "perche",
                     "il", "la", "lo", "gli", "le", "un", "una", "nel", "nella", "di", "del", "della", "in", "e"}
    nomi = [p for p in re.findall(r"\b(?:[A-Z][A-Za-zÀ-ÿ]+|[A-Z0-9]{2,}-?\d+[A-Z0-9]*)\b", domanda)
            if p.casefold() not in interrogative]
    chiave = " ".join(dict.fromkeys(nomi)) or " ".join(
        [w for w in re.findall(r"\w{5,}", domanda) if w.casefold() not in interrogative][:3])
    chiamata = strumenti.esegui("cerca", {"testo": chiave, "max_risultati": 6})
    testo = "\n".join([
        "📻 RAPPORTO A.N.I.M.A. · MODELLI NON RAGGIUNGIBILI", "",
        "✅ RISPOSTA:",
        "Non posso ragionare sulle prove senza un modello linguistico. Ecco i paragrafi che il tool di "
        "ricerca trova adesso, copiati alla lettera:", chiamata.esito.get("testo", ""), "",
        "⚠️ COSA MANCA:", f"L'interpretazione dei documenti. Causa: {motivo}. Riprova tra un minuto.", "",
        "📌 FONTI & ATTENDIBILITÀ:", "- 🟡 Estratti letterali, non ancora valutati.",
    ])
    return Esito(testo, [chiamata], [], chiamata.esito.get("risultati", []), motore="solo_tool")


__all__ = ["rispondi", "senza_modello", "Esito", "ModelliNonDisponibili"]
