"""Read-only natural-language lookup for the Day 4 access database."""

from __future__ import annotations

import json
import re
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from percorsi import DATI


DATABASE = DATI / "giorno_4" / "database" / "accessi.sqlite"
MISSION_TIME = "2031-10-12 06:00"
QUERY = """SELECT o.nome AS operatore, d.nome AS deposito, d.settore,
       a.pratica, a.codice, a.stato, a.valido_fino
FROM accessi a
JOIN operatori o ON o.id = a.operatore_id
JOIN depositi d ON d.id = a.deposito_id
WHERE o.nome = ? AND d.nome = ? AND d.settore = ? AND a.pratica = ?
  AND a.stato = 'attivo' AND a.valido_fino >= ?"""
READABLE_TABLES = {"operatori", "depositi", "accessi"}
ALLOWED_FUNCTIONS = {"count", "min", "max", "lower", "upper", "length", "coalesce", "sum", "avg"}
SQL_TERMS = ("accesso", "accessi", "autorizzazione", "permesso", "codice")
WRITE_TERMS = re.compile(r"\b(cancell\w*|elimin\w*|aggiorn\w*|modific\w*|inser\w*|scriv\w*|delete|drop|update|insert)\b", re.I)


def _read_only_connection() -> sqlite3.Connection:
    if not DATABASE.is_file():
        raise FileNotFoundError(f"Database del giorno 4 non trovato: {DATABASE}")
    connection = sqlite3.connect(DATABASE.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.execute("PRAGMA query_only=ON")

    def authorize(action, arg1, arg2, _database, _trigger):
        if action == sqlite3.SQLITE_SELECT:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            return sqlite3.SQLITE_OK if arg1 in READABLE_TABLES else sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION:
            return sqlite3.SQLITE_OK if (arg2 or "").lower() in ALLOWED_FUNCTIONS else sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_DENY

    connection.set_authorizer(authorize)
    return connection


def _contains(text: str, candidate: str) -> bool:
    return candidate.casefold() in text.casefold()


def _resolve_clues(question: str, connection: sqlite3.Connection) -> dict[str, str]:
    operators = [row[0] for row in connection.execute("SELECT nome FROM operatori")]
    deposits = [(row[0], row[1]) for row in connection.execute("SELECT nome, settore FROM depositi")]
    practices = [row[0] for row in connection.execute("SELECT DISTINCT pratica FROM accessi")]
    operator = next((name for name in operators if _contains(question, name)), None)
    deposit = next((row for row in deposits if _contains(question, row[0])), None)
    practice = next((value for value in practices if re.search(rf"(?<![A-Z0-9]){re.escape(value)}(?![A-Z0-9])", question, re.I)), None)
    if not practice:
        mentioned = re.search(r"\b(?:pratica|practice)\s+([A-Z0-9-]+)\b", question, re.I)
        practice = mentioned.group(1).upper() if mentioned else None
    sector = None
    if deposit:
        match = re.search(rf"(?<![A-Z0-9]){re.escape(deposit[1])}(?![A-Z0-9])", question, re.I)
        sector = match.group(0).upper() if match else None
    return {"operatore": operator, "deposito": deposit[0] if deposit else None,
            "settore": sector, "pratica": practice}


FIELD_LABELS = {"operatore": "persona", "deposito": "deposito", "settore": "settore", "pratica": "pratica"}
_FOLLOWUP_BLOCK = re.compile(
    r"^\s*(?:dove|chi|cosa|che|quando|perch[eé]|quanti|elenca\w*|mostra|dimmi|qual[ei]?)\b",
    re.I,
)
_DB_WORD = re.compile(r"\b(?:database|sqlite|db)\b", re.I)


def _domanda_anagrafica(question: str) -> str | None:
    """List or count rows when the question is about the access database itself."""
    text = (question or "").casefold()
    if not _DB_WORD.search(text):
        return None
    if re.search(r"\b(?:codice|autorizzaz\w*)\b", text) and not re.search(r"\b(?:quanti|numero|conteggio|elenca\w*|lista)\b", text):
        return None
    people = bool(re.search(r"\b(?:operator\w*|person\w*|anagrafic\w*|nominativ\w*)\b", text))
    deposits = bool(re.search(r"\bdeposit\w*\b", text))
    accesses = bool(re.search(r"\baccessi\b", text))
    counting = bool(re.search(r"\b(?:quanti|numero|conteggio)\b", text))
    listing = bool(re.search(r"\b(?:elenca\w*|lista|tutti|tutte|present\w*|quali|dimmi|nomi)\b", text))
    if counting and people:
        return "conta_operatori"
    if counting and deposits and not people:
        return "conta_depositi"
    if counting and accesses and not people and not deposits:
        return "conta_accessi"
    if listing and people:
        return "elenco_operatori"
    if listing and deposits:
        return "elenco_depositi"
    if people and re.search(r"\bchi\b", text):
        return "elenco_operatori"
    return None


def _rifiuto_scrittura() -> dict:
    return {"query": None, "parameters": [], "columns": [], "rows": [], "source_id": DATABASE.name,
            "answer": "Il tool SQL è di sola lettura: non eseguo richieste di modifica o cancellazione."}


ANAGRAFICA_QUERIES = {
    "conta_operatori": "SELECT COUNT(*) AS operatori FROM operatori",
    "elenco_operatori": "SELECT nome AS operatore FROM operatori ORDER BY nome",
    "conta_depositi": "SELECT COUNT(*) AS depositi FROM depositi",
    "elenco_depositi": "SELECT nome AS deposito, settore FROM depositi ORDER BY nome, settore",
    "conta_accessi": "SELECT COUNT(*) AS accessi FROM accessi",
}


def _rispondi_anagrafica(kind: str) -> dict:
    query = ANAGRAFICA_QUERIES[kind]
    with closing(_read_only_connection()) as connection:
        cursor = connection.execute(query)
        rows = [list(row) for row in cursor.fetchall()]
        columns = [column[0] for column in cursor.description]
    count = rows[0][0] if kind.startswith("conta_") else len(rows)
    if kind in {"conta_operatori", "elenco_operatori"}:
        noun = "operatore" if count == 1 else "operatori"
        if kind == "elenco_operatori":
            noun = "persona" if count == 1 else "persone"
        answer = f"Nel database degli accessi sono registrat{'o' if noun == 'operatore' else 'i' if noun == 'operatori' else 'a' if noun == 'persona' else 'e'} {count} {noun}."
    elif kind in {"conta_depositi", "elenco_depositi"}:
        noun = "deposito" if count == 1 else "depositi"
        answer = f"Nel database degli accessi sono registrat{'o' if count == 1 else 'i'} {count} {noun}."
    else:
        noun = "accesso" if count == 1 else "accessi"
        answer = f"Nel database degli accessi sono registrat{'o' if count == 1 else 'i'} {count} {noun}."
    return {"query": query, "parameters": [], "columns": columns, "rows": rows,
            "answer": answer, "source": str(DATABASE), "source_id": DATABASE.name}


def _turno(turn) -> tuple[str, str]:
    if isinstance(turn, dict):
        return str(turn.get("role") or ""), str(turn.get("text") or "")
    if isinstance(turn, (tuple, list)) and len(turn) >= 2:
        return str(turn[0] or ""), str(turn[1] or "")
    return str(getattr(turn, "role", "") or ""), str(getattr(turn, "text", "") or "")


def _ultimo_scambio_sql(history) -> tuple[str, str]:
    """Only the latest completed exchange can supply SQL follow-up context."""
    turns = list(history or [])
    if len(turns) < 2:
        return "", ""
    role, answer = _turno(turns[-1])
    previous_role, question = _turno(turns[-2])
    if role == "voi" or previous_role != "voi" or not answer.startswith("🔎 TOOL SQL · GIORNO 4"):
        return "", ""
    return question, answer


def _tabella_scambio_sql(answer: str) -> tuple[str, bool] | None:
    """Recognize a simple list/count emitted by this module, never execute history SQL."""
    match = re.search(r"QUERY ESEGUITA:\n(.*?)\nPARAMETRI:", answer, re.S)
    if not match:
        return None
    query = match.group(1).strip()
    context = next(((kind.split("_", 1)[1], kind.startswith("conta_"))
                    for kind, canonical in ANAGRAFICA_QUERIES.items() if query == canonical), None)
    if context is None:
        for table_id in RECOVERED_TABLES:
            if query == f'SELECT COUNT(*) AS righe FROM "{table_id}"':
                context = table_id, True
                break
            if query in (_select_tabella(table_id, False), _select_tabella(table_id, True)):
                context = table_id, False
                break
    if context is None:
        return None
    table, counted = context
    source = RECOVERED_DATABASE.name if table in RECOVERED_TABLES else DATABASE.name
    if f"📌 FONTE: {source} ·" not in answer:
        return None
    return table, counted


def completa_domanda_sql(message: str, history) -> str:
    """Resolve narrowly scoped follow-ups to the immediately preceding SQL answer."""
    original = message or ""
    text = original.strip()
    if not text or len(text) > 80 or _DB_WORD.search(text):
        return original
    previous_user, answer = _ultimo_scambio_sql(history)
    if not answer:
        return original
    if re.fullmatch(r"(?:e\s+)?(?:alle|ore)\s+\d+[:.]\d+\s*\??", text, re.I):
        context = _contesto_sql(history)
        if context:
            prefix = ("Quali persone sono nella squadra con abilitazione valida e non sospese"
                      if "nelle squadre con entrambi i permessi validi." in answer else "Accesso")
            return (f"{prefix} al varco {context['varco']} dell'{context['archivio']} "
                    f"il {context['istante'][:10]} {text}")
    table_context = _tabella_scambio_sql(answer)
    if table_context:
        table, counted = table_context
        if re.fullmatch(r"(?:e\s+)?quant[ei](?:\s+(?:sono|ce\s+ne\s+sono))?\s*\??", text, re.I):
            if table in RECOVERED_TABLES:
                return f"Quante righe contiene la tabella {table} nel database?"
            return f"Quanti {table} ci sono nel database?"
        if re.fullmatch(r"(?:e\s+)?(?:gli\s+)?archivi(?:\s+invece)?\s*\??", text, re.I):
            return "Quanti archivi ci sono nel database?" if counted else "Quali sono gli archivi nel database?"
    if _FOLLOWUP_BLOCK.search(text):
        return original
    if re.search(r"\b(?:autorizzaz\w*|permess\w*)\b", text, re.I):
        return original
    if "autorizzazione servono" not in answer.casefold():
        return original
    return f"{previous_user}\n{text}"


def rispondi_giorno4(question: str, history=None) -> dict | None:
    """Answer an explicit Day 4 question. The recovered archive takes precedence over the first access database."""
    question = completa_domanda_sql(question, history)
    recovered = rispondi_archivio_recuperato(question, history)
    if recovered is not None:
        return recovered
    normalized = (question or "").casefold()
    catalog = _domanda_anagrafica(question or "")
    mentions_sql = any(term in normalized for term in SQL_TERMS)
    if catalog is None and not mentions_sql and not (_DB_WORD.search(normalized) and WRITE_TERMS.search(normalized)):
        return None
    if WRITE_TERMS.search(question or ""):
        return _rifiuto_scrittura()
    if catalog:
        return _rispondi_anagrafica(catalog)

    with closing(_read_only_connection()) as connection:
        clues = _resolve_clues(question, connection)
        missing = [name for name, value in clues.items() if not value]
        if missing:
            missing_labels = [FIELD_LABELS[name] for name in missing]
            return {"query": None, "parameters": [], "columns": [], "rows": [],
                    "source_id": DATABASE.name,
                    "missing_fields": missing_labels,
                    "known_fields": {FIELD_LABELS[name]: clues[name] for name in FIELD_LABELS},
                    "answer": "Per cercare l’autorizzazione servono: " + ", ".join(missing_labels) + "."}
        parameters = [clues["operatore"], clues["deposito"], clues["settore"], clues["pratica"], MISSION_TIME]
        cursor = connection.execute(QUERY, parameters)
        rows = [list(row) for row in cursor.fetchmany(51)]
        columns = [column[0] for column in cursor.description]

    if not rows:
        answer = "Nessuna autorizzazione corrisponde a tutti gli indizi con stato attivo e validità richiesta."
    else:
        answer = f"Il codice di autorizzazione è {rows[0][4]}. Il permesso è {rows[0][5]} fino al {rows[0][6]}."
    return {"query": QUERY, "parameters": parameters, "columns": columns, "rows": rows,
            "answer": answer, "source": str(DATABASE), "source_id": DATABASE.name}


def snapshot_database_day4(table: str = "accessi", search: str = "", offset: int = 0, limit: int = 25) -> dict:
    """Return a paged, read-only view of the Day 4 SQLite database."""
    allowed_tables = {"operatori", "depositi", "accessi"}
    if table not in allowed_tables:
        raise ValueError("Tabella non disponibile")
    offset = max(0, int(offset))
    limit = min(100, max(1, int(limit)))
    search = (search or "").strip()[:120]

    if not DATABASE.is_file():
        raise FileNotFoundError(f"Database del giorno 4 non trovato: {DATABASE}")
    connection = sqlite3.connect(DATABASE.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    try:
        metadata = {}
        for name in ("operatori", "depositi", "accessi"):
            columns = connection.execute(f'PRAGMA table_info("{name}")').fetchall()
            metadata[name] = {
                "name": name,
                "count": connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0],
                "columns": [{"name": row["name"], "type": row["type"], "primary_key": bool(row["pk"])} for row in columns],
            }

        columns = metadata[table]["columns"]
        where = ""
        parameters = []
        if search:
            where = " WHERE " + " OR ".join(f'CAST("{column["name"]}" AS TEXT) LIKE ?' for column in columns)
            parameters = [f"%{search}%"] * len(columns)
        total = connection.execute(f'SELECT COUNT(*) FROM "{table}"{where}', parameters).fetchone()[0]
        rows = connection.execute(
            f'SELECT * FROM "{table}"{where} ORDER BY "id" LIMIT ? OFFSET ?',
            [*parameters, limit, offset],
        ).fetchall()
        return {
            "database": DATABASE.name,
            "read_only": True,
            "tables": list(metadata.values()),
            "selected_table": table,
            "search": search,
            "offset": offset,
            "limit": limit,
            "total": total,
            "rows": [dict(row) for row in rows],
            "relations": [
                {"from_table": "accessi", "from_column": "operatore_id", "to_table": "operatori", "to_column": "id"},
                {"from_table": "accessi", "from_column": "deposito_id", "to_table": "depositi", "to_column": "id"},
            ],
        }
    finally:
        connection.close()


def formatta_risposta_giorno4(result: dict) -> str:
    lines = ["🔎 TOOL SQL · GIORNO 4", "", "✅ RISPOSTA:", result["answer"]]
    if result.get("query"):
        lines.extend(["", "QUERY ESEGUITA:", result["query"],
                      "PARAMETRI:", json.dumps(result["parameters"], ensure_ascii=False),
                      "RIGHE RESTITUITE:", json.dumps({"colonne": result["columns"], "righe": result["rows"]}, ensure_ascii=False)])
    if result.get("missing_fields"):
        lines.extend(["", "CAMPI MANCANTI:", json.dumps({
            "mancanti": result["missing_fields"],
            "noti": result.get("known_fields") or {},
        }, ensure_ascii=False)])
    lines.extend(["", f"📌 FONTE: {result.get('source_id') or 'accessi.sqlite'} · apertura in sola lettura"])
    return "\n".join(lines)


# Archivio recuperato il giorno 4: 14 tabelle senza dizionario.
# Gli intervalli includono l'inizio ed escludono la fine. Una fine NULL non scade.
# Una revoca è efficace dall'istante indicato. Copie e accessi passati non autorizzano.

RECOVERED_DATABASE = DATI / "giorno_4" / "database" / "archivio_recuperato.sqlite"
MISSION_INSTANT = "2026-11-04 12:00"
MISSION_ARCHIVE = "Archivio Stige"
MISSION_GATE = "V-29"
RECOVERED_TABLES = {"e04", "e10", "m05", "m12", "r02", "r03", "r06", "r07", "r08", "r09", "r11", "r13", "r14", "r15"}
RECOVERED_WRITE = re.compile(
    r"\b(cancell\w*|elimin\w*|delete|drop|update|insert|modifica\w*|inserisc\w*|scrivi\w*)\b", re.I)
MONTHS = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}
CATALOG = (
    {"id": "r02", "nome": "archivi", "significato": "Sedi degli archivi, con il codice della sede",
     "colonne": "k0 id, v1 nome, v2 codice", "links": ()},
    {"id": "r03", "nome": "persone", "significato": "Anagrafica degli operatori: nome e codice PX",
     "colonne": "k0 id, v1 nome, v2 codice PX", "links": ()},
    {"id": "r11", "nome": "squadre", "significato": "Nuclei e unità",
     "colonne": "k0 id, v1 nome", "links": ()},
    {"id": "r07", "nome": "varchi", "significato": "Varchi di una sede. V-29 e V-29-B sono varchi distinti",
     "colonne": "k0 id, k1 archivio, v1 codice varco", "links": (("k1", "r02", "archivi"),)},
    {"id": "r09", "nome": "terminali", "significato": "Terminale che controlla un varco, con canale e stato operativo",
     "colonne": "k0 id, k1 varco, v1 canale, v2 stato", "links": (("k1", "r07", "varchi"),)},
    {"id": "m05", "nome": "finestre", "significato": "Finestra di apertura di un terminale",
     "colonne": "k0 id, k1 terminale, ts_a inizio, ts_b fine", "links": (("k1", "r09", "terminali"),)},
    {"id": "r13", "nome": "chiavi", "significato": "Versione della chiave di un terminale. Il codice resta testo",
     "colonne": "k0 id, k1 terminale, v1 codice, ts_a inizio, ts_b fine", "links": (("k1", "r09", "terminali"),)},
    {"id": "m12", "nome": "appartenenze", "significato": "Appartenenza di una persona a una squadra nell'intervallo indicato",
     "colonne": "k0 id, k1 persona, k2 squadra, ts_a inizio, ts_b fine", "links": (("k1", "r03", "persone"), ("k2", "r11", "squadre"))},
    {"id": "r06", "nome": "abilitazioni", "significato": "Abilitazione SANITARIO o SICUREZZA di una persona. Un rinnovo sovrapposto resta la stessa persona",
     "colonne": "k0 id, k1 persona, v1 ruolo, ts_a inizio, ts_b fine", "links": (("k1", "r03", "persone"),)},
    {"id": "e04", "nome": "sospensioni", "significato": "Sospensione di una persona. Una sospensione futura non è ancora attiva",
     "colonne": "k0 id, k1 persona, ts_a inizio, ts_b fine, v1 motivo", "links": (("k1", "r03", "persone"),)},
    {"id": "r08", "nome": "permessi", "significato": "Permesso di una squadra per un varco e un ruolo. Vale se ATTIVO e dentro l'intervallo",
     "colonne": "k0 id, k1 squadra, k2 varco, v1 ruolo, ts_a inizio, ts_b fine, v2 stato",
     "links": (("k1", "r11", "squadre"), ("k2", "r07", "varchi"))},
    {"id": "e10", "nome": "revoche", "significato": "Revoca di un permesso, efficace dall'istante indicato",
     "colonne": "k0 id, k1 permesso, ts_a effetto, v1 motivo", "links": (("k1", "r08", "permessi"),)},
    {"id": "r14", "nome": "copie_registri", "significato": "Copia storica di un permesso, con provenienza e data. Non autorizza l'accesso corrente",
     "colonne": "k0 id, k1 permesso, k2 squadra, k3 varco, v1 ruolo, ts_a, ts_b, v2 stato, ts_c data copia, v3 provenienza",
     "links": (("k1", "r08", "permessi"), ("k2", "r11", "squadre"), ("k3", "r07", "varchi"))},
    {"id": "r15", "nome": "accessi_passati", "significato": "Tentativo di accesso già registrato. Non autorizza l'accesso corrente",
     "colonne": "k0 id, k1 terminale, k2 persona, ts_a istante, v1 esito, v2 chiave usata",
     "links": (("k1", "r09", "terminali"), ("k2", "r03", "persone"))},
)

# Tutti i varchi con il loro archivio: stessa unione di `varco_scelto` nella query qui sotto.
GATES_QUERY = "SELECT v.v1 AS varco, a.v1 AS archivio FROM r07 AS v JOIN r02 AS a ON a.k0 = v.k1"

SOLUTION_QUERY = """
WITH richiesta AS (
    SELECT ? AS archivio, ? AS varco, ? AS istante
),
varco_scelto AS (
    SELECT v.k0 AS id
    FROM r07 AS v
    JOIN r02 AS a ON a.k0 = v.k1
    WHERE a.v1 = (SELECT archivio FROM richiesta)
      AND v.v1 = (SELECT varco FROM richiesta)
),
permesso_valido AS (
    SELECT p.k1 AS squadra_id, p.v1 AS ruolo
    FROM r08 AS p
    WHERE p.k2 = (SELECT id FROM varco_scelto)
      AND p.v2 = 'ATTIVO'
      AND p.ts_a <= (SELECT istante FROM richiesta)
      AND (p.ts_b IS NULL OR p.ts_b > (SELECT istante FROM richiesta))
      AND NOT EXISTS (
          SELECT 1 FROM e10 AS e
          WHERE e.k1 = p.k0 AND e.ts_a <= (SELECT istante FROM richiesta)
      )
),
squadra_completa AS (
    SELECT squadra_id
    FROM permesso_valido
    GROUP BY squadra_id
    HAVING SUM(ruolo = 'SANITARIO') >= 1 AND SUM(ruolo = 'SICUREZZA') >= 1
),
membro AS (
    SELECT m.k1 AS persona_id, m.k2 AS squadra_id
    FROM m12 AS m
    WHERE m.k2 IN (SELECT squadra_id FROM squadra_completa)
      AND m.ts_a <= (SELECT istante FROM richiesta)
      AND (m.ts_b IS NULL OR m.ts_b > (SELECT istante FROM richiesta))
),
abilitato AS (
    SELECT a.k1 AS persona_id, a.v1 AS ruolo
    FROM r06 AS a
    WHERE a.ts_a <= (SELECT istante FROM richiesta)
      AND (a.ts_b IS NULL OR a.ts_b > (SELECT istante FROM richiesta))
),
sospeso AS (
    SELECT e.k1 AS persona_id
    FROM e04 AS e
    WHERE e.ts_a <= (SELECT istante FROM richiesta)
      AND (e.ts_b IS NULL OR e.ts_b > (SELECT istante FROM richiesta))
),
coppia AS (
    SELECT DISTINCT pe.v1 AS nome_san, pe.v2 AS codice_san, ps.v1 AS nome_sic, ps.v2 AS codice_sic, sq.v1 AS squadra
    FROM membro AS ms
    JOIN membro AS mc ON mc.squadra_id = ms.squadra_id AND mc.persona_id <> ms.persona_id
    JOIN abilitato AS ab ON ab.persona_id = ms.persona_id AND ab.ruolo = 'SANITARIO'
    JOIN abilitato AS ac ON ac.persona_id = mc.persona_id AND ac.ruolo = 'SICUREZZA'
    JOIN r03 AS pe ON pe.k0 = ms.persona_id
    JOIN r03 AS ps ON ps.k0 = mc.persona_id
    JOIN r11 AS sq ON sq.k0 = ms.squadra_id
    WHERE ms.persona_id NOT IN (SELECT persona_id FROM sospeso)
      AND mc.persona_id NOT IN (SELECT persona_id FROM sospeso)
),
soluzione AS (
SELECT 'operatore' AS tipo, 'SANITARIO' AS ruolo, nome_san AS nome, codice_san AS codice_px,
       squadra, NULL AS terminale_id, NULL AS canale, NULL AS chiave
FROM coppia
UNION
SELECT 'operatore', 'SICUREZZA', nome_sic, codice_sic, squadra, NULL, NULL, NULL
FROM coppia
UNION ALL
SELECT DISTINCT 'terminale', NULL, NULL, NULL, NULL,
       CAST(t.k0 AS TEXT), t.v1, k.v1
FROM r09 AS t
JOIN r13 AS k ON k.k1 = t.k0
WHERE t.k1 = (SELECT id FROM varco_scelto)
  AND t.v2 = 'OPERATIVO'
  AND k.ts_a <= (SELECT istante FROM richiesta)
  AND (k.ts_b IS NULL OR k.ts_b > (SELECT istante FROM richiesta))
  AND EXISTS (
      SELECT 1 FROM m05 AS f
      WHERE f.k1 = t.k0
        AND f.ts_a <= (SELECT istante FROM richiesta)
        AND (f.ts_b IS NULL OR f.ts_b > (SELECT istante FROM richiesta))
  )
)
SELECT tipo, ruolo, nome, codice_px, squadra, terminale_id, canale, chiave
FROM soluzione
ORDER BY CASE tipo WHEN 'operatore' THEN 0 ELSE 1 END, ruolo, canale
""".strip()

_SQUADRE_CON_PERMESSI = """
WITH richiesta AS (
    SELECT ? AS archivio, ? AS varco, ? AS istante
),
varco_scelto AS (
    SELECT v.k0 AS id
    FROM r07 AS v
    JOIN r02 AS a ON a.k0 = v.k1
    WHERE a.v1 = (SELECT archivio FROM richiesta)
      AND v.v1 = (SELECT varco FROM richiesta)
),
permesso_valido AS (
    SELECT p.k1 AS squadra_id, p.v1 AS ruolo
    FROM r08 AS p
    WHERE p.k2 = (SELECT id FROM varco_scelto)
      AND p.v2 = 'ATTIVO'
      AND p.ts_a <= (SELECT istante FROM richiesta)
      AND (p.ts_b IS NULL OR p.ts_b > (SELECT istante FROM richiesta))
      AND NOT EXISTS (
          SELECT 1 FROM e10 AS e
          WHERE e.k1 = p.k0 AND e.ts_a <= (SELECT istante FROM richiesta)
      )
),
squadra_scelta AS (
    SELECT squadra_id
    FROM permesso_valido
    GROUP BY squadra_id
    HAVING SUM(ruolo = 'SANITARIO') >= 1 AND SUM(ruolo = 'SICUREZZA') >= 1
),
presente AS (
    SELECT m.k2 AS squadra_id, m.k1 AS persona_id
    FROM m12 AS m
    WHERE m.k2 IN (SELECT squadra_id FROM squadra_scelta)
      AND m.ts_a <= (SELECT istante FROM richiesta)
      AND (m.ts_b IS NULL OR m.ts_b > (SELECT istante FROM richiesta))
)
"""

MEMBERS_QUERY = (_SQUADRE_CON_PERMESSI + """
SELECT sq.v1 AS squadra, pe.v1 AS nome, pe.v2 AS codice_px,
       (SELECT GROUP_CONCAT(ruolo, ',')
        FROM (
            SELECT DISTINCT a.v1 AS ruolo
            FROM r06 AS a
            WHERE a.k1 = pe.k0
              AND a.ts_a <= (SELECT istante FROM richiesta)
              AND (a.ts_b IS NULL OR a.ts_b > (SELECT istante FROM richiesta))
            ORDER BY ruolo
        )) AS abilitazione
FROM presente AS p
JOIN r11 AS sq ON sq.k0 = p.squadra_id
JOIN r03 AS pe ON pe.k0 = p.persona_id
WHERE EXISTS (
    SELECT 1 FROM r06 AS a
    WHERE a.k1 = pe.k0
      AND a.ts_a <= (SELECT istante FROM richiesta)
      AND (a.ts_b IS NULL OR a.ts_b > (SELECT istante FROM richiesta))
)
AND NOT EXISTS (
    SELECT 1 FROM e04 AS e
    WHERE e.k1 = pe.k0
      AND e.ts_a <= (SELECT istante FROM richiesta)
      AND (e.ts_b IS NULL OR e.ts_b > (SELECT istante FROM richiesta))
)
ORDER BY squadra, nome
""").strip()

EXCLUDED_MEMBERS_QUERY = (_SQUADRE_CON_PERMESSI + """
SELECT sq.v1 AS squadra, pe.v1 AS nome,
       CASE
           WHEN EXISTS (
               SELECT 1 FROM e04 AS e
               WHERE e.k1 = pe.k0
                 AND e.ts_a <= (SELECT istante FROM richiesta)
                 AND (e.ts_b IS NULL OR e.ts_b > (SELECT istante FROM richiesta))
           ) THEN 'sospensione attiva'
           ELSE 'nessuna abilitazione valida'
       END AS motivo
FROM presente AS p
JOIN r11 AS sq ON sq.k0 = p.squadra_id
JOIN r03 AS pe ON pe.k0 = p.persona_id
WHERE EXISTS (
    SELECT 1 FROM e04 AS e
    WHERE e.k1 = pe.k0
      AND e.ts_a <= (SELECT istante FROM richiesta)
      AND (e.ts_b IS NULL OR e.ts_b > (SELECT istante FROM richiesta))
)
OR NOT EXISTS (
    SELECT 1 FROM r06 AS a
    WHERE a.k1 = pe.k0
      AND a.ts_a <= (SELECT istante FROM richiesta)
      AND (a.ts_b IS NULL OR a.ts_b > (SELECT istante FROM richiesta))
)
ORDER BY squadra, nome
""").strip()


def _connessione_recuperata() -> sqlite3.Connection:
    if not RECOVERED_DATABASE.is_file():
        raise FileNotFoundError(f"Archivio recuperato non trovato: {RECOVERED_DATABASE}")
    connection = sqlite3.connect(RECOVERED_DATABASE.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.execute("PRAGMA query_only=ON")
    recovered_functions = ALLOWED_FUNCTIONS | {"group_concat"}

    def authorize(action, arg1, arg2, _database, _trigger):
        if action == sqlite3.SQLITE_SELECT:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ:
            return sqlite3.SQLITE_OK if arg1 in RECOVERED_TABLES or arg1 is None else sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION:
            return sqlite3.SQLITE_OK if (arg2 or "").lower() in recovered_functions else sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_DENY

    connection.set_authorizer(authorize)
    return connection


SCHEMA_GROUPS = (
    {"id": "sedi", "label": "Sedi e varchi", "tables": ("r02", "r07", "r09", "m05", "r13")},
    {"id": "persone", "label": "Persone", "tables": ("r03", "r06", "e04")},
    {"id": "squadre", "label": "Squadre e permessi", "tables": ("r11", "m12", "r08", "e10")},
    {"id": "registri", "label": "Registri", "tables": ("r15", "r14")},
)


def _etichette_colonne(spec: str) -> dict[str, str]:
    labels = {}
    for piece in spec.split(","):
        piece = piece.strip()
        if not piece:
            continue
        name, _, label = piece.partition(" ")
        labels[name] = label or name
    return labels


def schema_logico_giorno4() -> dict:
    """Read-only logical schema of the recovered archive: every table, column, and link."""
    group_of = {table_id: group["id"] for group in SCHEMA_GROUPS for table_id in group["tables"]}
    catalog_ids = {table["id"] for table in CATALOG}
    if catalog_ids != set(group_of) or catalog_ids != RECOVERED_TABLES:
        raise RuntimeError("Lo schema logico non copre tutte le tabelle dell'archivio recuperato")
    names = {table["id"]: table["nome"] for table in CATALOG}

    if not RECOVERED_DATABASE.is_file():
        raise FileNotFoundError(f"Archivio recuperato non trovato: {RECOVERED_DATABASE}")
    connection = sqlite3.connect(RECOVERED_DATABASE.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.execute("PRAGMA query_only=ON")
    with closing(connection):
        tables = []
        relations = []
        total_rows = 0
        for table in CATALOG:
            labels = _etichette_colonne(table["colonne"])
            links = {column: (target, label) for column, target, label in table["links"]}
            count = connection.execute(f'SELECT COUNT(*) FROM "{table["id"]}"').fetchone()[0]
            total_rows += count
            columns = []
            for row in connection.execute(f'PRAGMA table_info("{table["id"]}")'):
                name = row[1]
                linked = links.get(name)
                if row[5]:
                    role = "pk"
                elif linked:
                    role = "fk"
                elif str(name).startswith("ts_"):
                    role = "tempo"
                else:
                    role = "valore"
                columns.append({
                    "name": name,
                    "type": row[2],
                    "label": labels.get(name, name),
                    "role": role,
                    "references": linked[0] if linked else None,
                })
            for column, target, label in table["links"]:
                matched = connection.execute(
                    f'SELECT COUNT(DISTINCT s."{column}") FROM "{table["id"]}" AS s '
                    f'JOIN "{target}" AS t ON t.k0 = s."{column}"'
                ).fetchone()[0]
                distinct = connection.execute(
                    f'SELECT COUNT(DISTINCT "{column}") FROM "{table["id"]}"'
                ).fetchone()[0]
                relations.append({
                    "id": f"{table['id']}.{column}->{target}",
                    "from_table": table["id"],
                    "from_column": column,
                    "from_label": labels.get(column, label),
                    "to_table": target,
                    "to_column": "k0",
                    "to_name": names[target],
                    "cardinality": "N:1",
                    "matched": matched,
                    "distinct": distinct,
                })
            tables.append({
                "id": table["id"],
                "name": table["nome"],
                "meaning": table["significato"],
                "group": group_of[table["id"]],
                "count": count,
                "columns": columns,
            })

    return {
        "database": RECOVERED_DATABASE.name,
        "read_only": True,
        "tables": tables,
        "relations": relations,
        "groups": [{"id": group["id"], "label": group["label"], "tables": list(group["tables"])} for group in SCHEMA_GROUPS],
        "table_count": len(tables),
        "relation_count": len(relations),
        "row_count": total_rows,
    }


def _domanda_inventario(text: str) -> str | None:
    """Count tables or rows when the question is about the recovered database itself."""
    about_database = bool(_DB_WORD.search(text) or "archivio recuperato" in text or "archivio_recuperato" in text)
    if not about_database:
        return None
    if re.search(r"\b(?:operator\w*|person\w*|anagrafic\w*|nominativ\w*|deposit\w*|accessi|autorizzaz\w*|permess\w*)\b", text):
        return None
    tables = bool(re.search(r"\btabell\w*", text))
    rows = bool(re.search(r"\b(?:righe|riga|record)\b", text))
    if tables and rows:
        return "inventario"
    if tables and re.search(r"\b(?:quante|quanti|numero|conteggio|conta)\b", text):
        return "inventario_tabelle"
    if rows and re.search(r"\b(?:quante|quanti|numero|conteggio|conta)\b", text):
        return "inventario_righe"
    return None


_TABLE_ID = re.compile(r"\b(e04|e10|m05|m12|r02|r03|r06|r07|r08|r09|r11|r13|r14|r15)\b", re.I)


def _domanda_tabella(text: str) -> str | None:
    """A named recovered table, asked as a database lookup rather than a gate check."""
    if not (_DB_WORD.search(text) or re.search(r"\btabell\w*", text)):
        return None
    match = _TABLE_ID.search(text)
    if match:
        return match.group(1).lower()
    if _DB_WORD.search(text) and re.search(r"\barchivi\b", text):
        return "r02"
    for table in CATALOG:
        if re.search(rf"\btabell\w*\s+{re.escape(table['nome'])}\b", text):
            return table["id"]
    return None


def _domanda_membri(text: str) -> bool:
    """People on the referenced teams, with a valid qualification and no active suspension."""
    people = re.search(r"\b(?:person\w*|membri|membro)\b", text)
    team = re.search(r"\bsquadr\w*\b", text)
    return bool(people and team and "abilitaz" in text and "sospes" in text)


def _tipo_domanda_recuperata(question: str) -> str | None:
    text = (question or "").casefold()
    if not text.strip():
        return None
    if _domanda_membri(text):
        return "membri"
    varco = any(marker in text for marker in ("varco", "v-29", "stige", "archivio recuperato", "archivio_recuperato", "operazione varco"))
    roles = "sanitario" in text and "sicurezza" in text
    access = varco and any(marker in text for marker in ("autorizz", "operatore", "terminale", "chiave", "permesso", "access"))
    map_ask = bool(re.search(r"\b(mappa|dizionario|schema)\b", text)) and "tabell" in text
    if map_ask and not access and not roles:
        return "mappa"
    table = _domanda_tabella(text)
    if table and not access and not roles:
        return f"tabella:{table}"
    inventory = _domanda_inventario(text)
    if inventory and not access and not roles:
        return inventory
    if varco or roles or "lettore del veicolo" in text:
        return "soluzione"
    return None


def _parse_instant(question: str) -> str | None:
    iso = re.search(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d+):(\d+))?(?!\d)", question)
    written = re.search(
        r"\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\b",
        question, re.I)
    clock = re.search(r"\b(?:ore|alle)\s+(\d+)[:.](\d+)\b", question, re.I)
    if clock is None:
        found = re.findall(r"(?<!\d)(\d+):(\d+)(?!\d)", question)
        clock_parts = found[0] if len(found) == 1 else None
    else:
        clock_parts = (clock.group(1), clock.group(2))
    hour = f"{int(clock_parts[0]):02d}:{int(clock_parts[1]):02d}" if clock_parts else None
    if iso and iso.group(4):
        instant = f"{int(iso.group(1)):04d}-{int(iso.group(2)):02d}-{int(iso.group(3)):02d} {int(iso.group(4)):02d}:{int(iso.group(5)):02d}"
    elif written:
        month = MONTHS[written.group(2).casefold()]
        instant = f"{int(written.group(3)):04d}-{month:02d}-{int(written.group(1)):02d} {hour or '12:00'}"
    elif iso:
        instant = f"{int(iso.group(1)):04d}-{int(iso.group(2)):02d}-{int(iso.group(3)):02d} {hour or MISSION_INSTANT[11:]}"
    elif hour:
        instant = f"{MISSION_INSTANT[:10]} {hour}"
    else:
        return None
    try:
        datetime.strptime(instant, "%Y-%m-%d %H:%M")
    except ValueError as error:
        raise ValueError(f"Data o ora non valida: {instant}. Usa una data esistente e un orario tra 00:00 e 23:59.") from error
    return instant


def _parametri_missione(question: str, connection: sqlite3.Connection) -> tuple[str, str, str, list[str]]:
    archives = [row[0] for row in connection.execute("SELECT v1 FROM r02 ORDER BY length(v1) DESC")]
    gates = [row[0] for row in connection.execute("SELECT v1 FROM r07 ORDER BY length(v1) DESC")]
    archive = next((name for name in archives if re.search(
        rf"(?<![\w-]){re.escape(name)}(?![\w-])", question, re.I)), None)
    if archive is None and re.search(
        r"\barchivio\s+(?!(?:recuperato|alle|ore|il|al|per|con|di|del|della|e)\b)\S+", question, re.I
    ):
        raise ValueError("Il nome dell'archivio indicato non è riconosciuto. Specifica una sede presente nella tabella r02.")
    gate = next((name for name in gates if re.search(rf"(?<![A-Z0-9-]){re.escape(name)}(?![A-Z0-9-])", question, re.I)), None)
    mentioned_gates = {code.upper() for code in re.findall(r"\bV-[A-Z0-9]+(?:-[A-Z0-9]+)*\b", question, re.I)}
    if len(mentioned_gates) > 1:
        raise ValueError("Sono indicati più varchi: specifica un solo varco per il controllo.")
    if mentioned_gates and next(iter(mentioned_gates)) not in {name.upper() for name in gates}:
        raise ValueError(f"Il varco {next(iter(mentioned_gates))} non è presente nell'archivio recuperato.")
    instant = _parse_instant(question)
    defaults = []
    if archive is None:
        archive, defaults = MISSION_ARCHIVE, defaults + ["archivio Archivio Stige"]
    if gate is None:
        gate, defaults = MISSION_GATE, defaults + ["varco V-29"]
    if instant is None:
        instant, defaults = MISSION_INSTANT, defaults + ["istante 2026-11-04 12:00"]
    return archive, gate, instant, defaults


def _coverage_sql(table_id: str, links: tuple) -> str:
    if not links:
        return "'—'"
    pieces = []
    for column, target, label in links:
        pieces.append(
            f"'{column}->{label} ' || "
            f"(SELECT COUNT(DISTINCT s.\"{column}\") FROM \"{table_id}\" AS s "
            f"JOIN \"{target}\" AS t ON t.k0 = s.\"{column}\") || '/' || "
            f"(SELECT COUNT(DISTINCT \"{column}\") FROM \"{table_id}\")"
        )
    return " || '; ' || ".join(pieces)


def _query_inventario(kind: str = "inventario") -> str:
    branches = [f'SELECT COUNT(*) AS n FROM "{table["id"]}"' for table in CATALOG]
    totals = ("SELECT COUNT(*) AS tabelle, COALESCE(SUM(n), 0) AS righe FROM ("
              + " UNION ALL ".join(branches) + ")")
    if kind == "inventario_tabelle":
        return f"SELECT tabelle FROM ({totals})"
    if kind == "inventario_righe":
        return f"SELECT righe FROM ({totals})"
    return totals


def _risposta_inventario(kind: str, table_count: int, row_count: int) -> str:
    tables_label = "tabella" if table_count == 1 else "tabelle"
    rows_label = "riga" if row_count == 1 else "righe"
    if kind == "inventario_tabelle":
        return f"L'archivio recuperato contiene {table_count} {tables_label}."
    if kind == "inventario_righe":
        return f"L'archivio recuperato contiene {row_count} {rows_label}."
    return f"L'archivio recuperato contiene {table_count} {tables_label} e {row_count} {rows_label}."


def _query_mappa() -> str:
    branches = []
    for index, table in enumerate(CATALOG, start=1):
        branches.append(
            "SELECT {index} AS ordine, '{tid}' AS tabella, '{nome}' AS nome, '{significato}' AS significato, "
            "COUNT(*) AS righe, '{colonne}' AS colonne, {copertura} AS copertura FROM \"{tid}\"".format(
                index=index, tid=table["id"], nome=table["nome"],
                significato=table["significato"].replace("'", "''"),
                colonne=table["colonne"].replace("'", "''"),
                copertura=_coverage_sql(table["id"], table["links"]),
            )
        )
    return ("SELECT tabella, nome, significato, righe, colonne, copertura FROM ("
            + " UNION ALL ".join(branches) + ") ORDER BY ordine")


def _righe(cursor: sqlite3.Cursor) -> tuple[list[str], list[list]]:
    columns = [column[0] for column in cursor.description]
    return columns, [list(row) for row in cursor.fetchall()]


def _esclusioni(connection: sqlite3.Connection, archive: str, gate: str, instant: str, squadre_valide: set[str]) -> list[str]:
    permits = connection.execute(
        """SELECT s.v1, p.v1, p.v2, p.ts_a, p.ts_b, e.ts_a, e.v1
           FROM r08 AS p
           JOIN r11 AS s ON s.k0 = p.k1
           JOIN r07 AS v ON v.k0 = p.k2
           JOIN r02 AS a ON a.k0 = v.k1
           LEFT JOIN e10 AS e ON e.k1 = p.k0
           WHERE a.v1 = ? AND v.v1 = ?
           ORDER BY s.v1, p.v1""",
        (archive, gate),
    ).fetchall()
    by_squad: dict[str, list[tuple]] = {}
    for row in permits:
        by_squad.setdefault(row[0], []).append(row)

    reasons = []
    for squad, rows in by_squad.items():
        if squad in squadre_valide:
            continue
        satisfied = set()
        details = []
        for _squad, role, state, start, end, revoked_at, motive in rows:
            if state == "ATTIVO" and start <= instant and (end is None or end > instant) and not (revoked_at and revoked_at <= instant):
                satisfied.add(role)
                continue
            if revoked_at and revoked_at <= instant:
                details.append(f"permesso {role} revocato dalle {revoked_at} ({motive})")
            elif state != "ATTIVO":
                details.append(f"permesso {role} in stato {state}")
            elif start > instant:
                details.append(f"permesso {role} valido dalle {start}")
            elif end is not None and end <= instant:
                details.append(f"permesso {role} scaduto alle {end}")
        missing = {"SANITARIO", "SICUREZZA"} - {row[1] for row in rows}
        if missing:
            details.append("manca il permesso " + " e ".join(sorted(missing)))
        if satisfied == {"SANITARIO", "SICUREZZA"}:
            details.append(_motivo_membri(connection, squad, instant))
        if details:
            reasons.append(f"{squad}: " + "; ".join(dict.fromkeys(details)))

    terminals = connection.execute(
        """SELECT CAST(t.k0 AS TEXT), t.v1, t.v2,
                  EXISTS (
                      SELECT 1 FROM r13 AS k
                      WHERE k.k1 = t.k0 AND k.ts_a <= ? AND (k.ts_b IS NULL OR k.ts_b > ?)
                  ),
                  EXISTS (
                      SELECT 1 FROM m05 AS f
                      WHERE f.k1 = t.k0 AND f.ts_a <= ? AND (f.ts_b IS NULL OR f.ts_b > ?)
                  )
           FROM r09 AS t
           JOIN r07 AS v ON v.k0 = t.k1
           JOIN r02 AS a ON a.k0 = v.k1
           WHERE a.v1 = ? AND v.v1 = ?""",
        (instant, instant, instant, instant, archive, gate),
    ).fetchall()
    for terminal_id, channel, state, has_key, has_window in terminals:
        if state == "OPERATIVO" and has_key and has_window:
            continue
        if state != "OPERATIVO":
            reasons.append(f"terminale {terminal_id}, {channel}: stato {state}")
        elif not has_window:
            reasons.append(f"terminale {terminal_id}, {channel}: nessuna finestra aperta alle {instant}")
        elif not has_key:
            reasons.append(f"terminale {terminal_id}, {channel}: nessuna chiave valida alle {instant}")
    return reasons


def _motivo_membri(connection: sqlite3.Connection, squad: str, instant: str) -> str:
    members = connection.execute(
        """SELECT pe.v1,
                  EXISTS (
                      SELECT 1 FROM e04 AS e
                      WHERE e.k1 = pe.k0 AND e.ts_a <= ? AND (e.ts_b IS NULL OR e.ts_b > ?)
                  ),
                  (SELECT GROUP_CONCAT(DISTINCT a.v1)
                   FROM r06 AS a
                   WHERE a.k1 = pe.k0 AND a.ts_a <= ? AND (a.ts_b IS NULL OR a.ts_b > ?))
           FROM m12 AS m
           JOIN r11 AS s ON s.k0 = m.k2
           JOIN r03 AS pe ON pe.k0 = m.k1
           WHERE s.v1 = ? AND m.ts_a <= ? AND (m.ts_b IS NULL OR m.ts_b > ?)""",
        (instant, instant, instant, instant, squad, instant, instant),
    ).fetchall()
    if not members:
        return "nessun membro appartiene alla squadra in quell'istante"
    if len(members) == 1:
        name, suspended, roles = members[0]
        if roles and "SANITARIO" in roles and "SICUREZZA" in roles:
            return f"{name} ha entrambe le abilitazioni, ma i due ruoli richiedono due persone"
        return f"in squadra c'è solo {name}"
    notes = []
    for name, suspended, roles in members:
        if suspended:
            notes.append(f"{name} ha una sospensione attiva")
        elif not roles:
            notes.append(f"{name} non ha un'abilitazione valida")
    roles_present = {
        role
        for _name, suspended, roles in members
        if roles and not suspended
        for role in roles.split(",")
    }
    if "SANITARIO" not in roles_present or "SICUREZZA" not in roles_present:
        return "; ".join(notes) if notes else "manca un ruolo tra le persone presenti"
    return "; ".join(notes) if notes else "nessuna coppia resta valida dopo sospensioni e abilitazioni"


def _risposta_testo(archive: str, gate: str, instant: str, defaults: list[str], rows: list[list], exclusions: list[str]) -> str:
    operators = [row for row in rows if row[0] == "operatore"]
    terminals = [row for row in rows if row[0] == "terminale"]
    lines = [f"Controllo alle {instant}, {archive}, varco {gate}."]
    if defaults:
        lines.append("Parametri presi dalla missione perché la domanda non li indica: " + ", ".join(defaults) + ".")
    if not operators:
        lines.append("Nessuna coppia SANITARIO e SICUREZZA soddisfa insieme squadra, abilitazione, permesso attivo, revoche e sospensioni.")
    else:
        people = [f"{row[2]} ({row[1]}, {row[3]}, {row[4]})" for row in operators]
        lines.append("Operatori autorizzati: " + "; ".join(people) + ".")
        lines.append("Un rinnovo sovrapposto della stessa persona conta una sola volta. I due ruoli restano di due persone diverse.")
    if not terminals:
        lines.append("Nessun terminale del varco è operativo con una finestra aperta e una chiave valida in quell'istante.")
    elif len({row[7] for row in terminals}) == 1 and len({row[5] for row in terminals}) == 1:
        terminal = terminals[0]
        lines.append(f"Terminale {terminal[5]}, {terminal[6]}, chiave {terminal[7]}.")
    else:
        listed = "; ".join(f"terminale {row[5]}, {row[6]}, chiave {row[7]}" for row in terminals)
        lines.append("Terminali con finestra aperta e chiave valida: " + listed + ".")
        lines.append("Il canale del lettore del veicolo non è nell'archivio recuperato: i terminali restano tutti candidati.")
    if exclusions:
        lines.append("Candidati esclusi: " + " | ".join(exclusions) + ".")
    lines.append("L'autorizzazione usa permessi, abilitazioni, squadra, sospensioni, revoche, terminale, finestra e chiave. Copie dei registri e accessi passati restano fonti storiche.")
    return " ".join(lines)


_CONTROLLO_PRECEDENTE = re.compile(
    r"(?:Controllo alle|Alle) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}), (.+?), varco ([^.,]+)[.,]"
)


def _contesto_sql(history) -> dict:
    """Archive, gate and instant already used by the latest SQL answer."""
    _question, body = _ultimo_scambio_sql(history)
    match = _CONTROLLO_PRECEDENTE.search(body)
    if match:
        return {"istante": match.group(1), "archivio": match.group(2), "varco": match.group(3)}
    return {}


def _parametri_membri(question: str, connection: sqlite3.Connection, history) -> tuple[str, str, str, str]:
    archive, gate, instant, defaults = _parametri_missione(question, connection)
    inherited = _contesto_sql(history)
    ripresi = []

    def take(prefix: str, key: str, current: str) -> str:
        nonlocal defaults
        if any(item.startswith(prefix) for item in defaults) and inherited.get(key):
            defaults = [item for item in defaults if not item.startswith(prefix)]
            ripresi.append(f"{key} {inherited[key]}")
            return inherited[key]
        return current

    archive = take("archivio ", "archivio", archive)
    gate = take("varco ", "varco", gate)
    instant = take("istante ", "istante", instant)
    if ripresi:
        note = "Parametri ripresi dal controllo precedente: " + ", ".join(ripresi) + "."
    elif defaults:
        note = "Parametri presi dalla missione perché la domanda non li indica: " + ", ".join(defaults) + "."
    else:
        note = ""
    return archive, gate, instant, note


def _ruoli_ordinati(value) -> str | None:
    if not value:
        return value
    return ",".join(sorted({part.strip() for part in str(value).split(",") if part.strip()}))


def _risposta_membri(archive: str, gate: str, instant: str, note: str, rows: list[list], excluded: list[list]) -> str:
    lines = [f"Alle {instant}, {archive}, varco {gate}, nelle squadre con entrambi i permessi validi."]
    if note:
        lines.append(note)
    clock = instant[11:]
    if not rows:
        lines.append(f"Nessuna persona è in squadra alle {clock} con un'abilitazione valida e senza sospensione.")
    else:
        people = [f"{nome} ({abilitazione}, {codice}, {squadra})" for squadra, nome, codice, abilitazione in rows]
        lines.append(
            f"Persone in squadra alle {clock}, con abilitazione valida e senza sospensione: "
            + "; ".join(people) + "."
        )
    if excluded:
        listed = [f"{nome} ({motivo}, {squadra})" for squadra, nome, motivo in excluded]
        lines.append("Nella squadra ma escluse: " + "; ".join(listed) + ".")
    return " ".join(lines)


def _rispondi_membri(connection: sqlite3.Connection, question: str, history) -> dict:
    archive, gate, instant, note = _parametri_membri(question, connection, history)
    parameters = [archive, gate, instant]
    columns, rows = _righe(connection.execute(MEMBERS_QUERY, parameters))
    rows = [[squadra, nome, codice, _ruoli_ordinati(ruoli)] for squadra, nome, codice, ruoli in rows]
    _excluded_columns, excluded = _righe(connection.execute(EXCLUDED_MEMBERS_QUERY, parameters))
    return {
        "query": MEMBERS_QUERY, "parameters": parameters, "columns": columns, "rows": rows,
        "source": str(RECOVERED_DATABASE), "source_id": RECOVERED_DATABASE.name,
        "answer": _risposta_membri(archive, gate, instant, note, rows, excluded),
    }


def _catalogo(table_id: str) -> dict:
    return next(item for item in CATALOG if item["id"] == table_id)


def _select_tabella(table_id: str, names_only: bool) -> str:
    """Columns come from the local catalog. The table id is already whitelisted."""
    meta = _catalogo(table_id)
    pairs = []
    for piece in meta["colonne"].split(","):
        parts = piece.strip().split()
        if len(parts) < 2:
            continue
        source = parts[0]
        words = [part.casefold() for part in parts[1:]]
        if words == ["codice", "px"]:
            alias = "codice_px"
        elif words == ["codice"]:
            alias = f"codice_{meta['nome']}"
        else:
            alias = "_".join(words)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", source) and re.fullmatch(r"[a-z_][a-z0-9_]*", alias):
            pairs.append((source, alias))
    if names_only and any(alias == "nome" for _source, alias in pairs):
        pairs = [(source, alias) for source, alias in pairs if alias == "nome" or alias.startswith("codice")]
    chosen = ", ".join(f'"{source}" AS {alias}' for source, alias in pairs)
    return f'SELECT {chosen} FROM "{table_id}" ORDER BY k0'


def _risposta_tabella(table_id: str, question: str, count: int) -> str:
    meta = _catalogo(table_id)
    noun = "riga" if count == 1 else "righe"
    people = bool(re.search(r"\bperson\w*\b", question or "", re.I))
    if people and table_id != "r03":
        return (
            f"La tabella {table_id} non contiene persone. "
            f"È {meta['nome']}: {meta['significato'][0].lower()}{meta['significato'][1:]}. "
            f"Contiene {count} {noun}. "
            "I nomi delle persone sono nella tabella r03."
        )
    return f"La tabella {table_id} ({meta['nome']}) contiene {count} {noun}. {meta['significato']}."


def _rispondi_tabella(connection: sqlite3.Connection, table_id: str, question: str) -> dict:
    names_only = bool(re.search(r"\b(?:nomi|nome|person\w*)\b", question or "", re.I))
    counting = bool(re.search(r"\b(?:quant[ei]|numero|conteggio|conta)\b", question or "", re.I))
    query = f'SELECT COUNT(*) AS righe FROM "{table_id}"' if counting else _select_tabella(table_id, names_only)
    columns, rows = _righe(connection.execute(query))
    count = rows[0][0] if counting else len(rows)
    return {
        "query": query, "parameters": [], "columns": columns, "rows": rows,
        "source": str(RECOVERED_DATABASE), "source_id": RECOVERED_DATABASE.name,
        "answer": _risposta_tabella(table_id, question, count),
    }


def _errore_parametri(error: ValueError) -> dict:
    return {"query": None, "parameters": [], "columns": [], "rows": [],
            "source_id": RECOVERED_DATABASE.name,
            "answer": "Non eseguo il controllo. " + str(error)}


def rispondi_archivio_recuperato(question: str, history=None) -> dict | None:
    """Read-only answer for the damaged Day 4 archive. User values stay bound parameters."""
    kind = _tipo_domanda_recuperata(question or "")
    if kind is None:
        return None
    if RECOVERED_WRITE.search(question or ""):
        return {"query": None, "parameters": [], "columns": [], "rows": [], "source_id": RECOVERED_DATABASE.name,
                "answer": "Il tool SQL è di sola lettura: non eseguo richieste di modifica o cancellazione."}
    if not RECOVERED_DATABASE.is_file():
        return {"query": None, "parameters": [], "columns": [], "rows": [], "source_id": RECOVERED_DATABASE.name,
                "answer": "L'archivio recuperato non è disponibile in sola lettura."}

    with closing(_connessione_recuperata()) as connection:
        if kind == "mappa":
            cursor = connection.execute(_query_mappa())
            columns, rows = _righe(cursor)
            return {
                "query": _query_mappa(), "parameters": [], "columns": columns, "rows": rows,
                "source": str(RECOVERED_DATABASE), "source_id": RECOVERED_DATABASE.name,
                "answer": "Mappa delle 14 tabelle ricostruita sui riferimenti dell'intero archivio. La copertura è il numero di valori distinti che trovano la riga collegata, sul totale dei valori distinti.",
            }
        if kind in {"inventario", "inventario_tabelle", "inventario_righe"}:
            query = _query_inventario(kind)
            cursor = connection.execute(query)
            columns, rows = _righe(cursor)
            table_count = int(rows[0][columns.index("tabelle")]) if "tabelle" in columns else 0
            row_count = int(rows[0][columns.index("righe")]) if "righe" in columns else 0
            answer = _risposta_inventario(kind, table_count, row_count)
            return {
                "query": query, "parameters": [], "columns": columns, "rows": rows,
                "source": str(RECOVERED_DATABASE), "source_id": RECOVERED_DATABASE.name,
                "answer": answer,
            }
        if kind == "membri":
            try:
                return _rispondi_membri(connection, question, history)
            except ValueError as error:
                return _errore_parametri(error)
        if kind.startswith("tabella:"):
            table_id = kind.split(":", 1)[1]
            if table_id not in RECOVERED_TABLES:
                return None
            return _rispondi_tabella(connection, table_id, question)
        try:
            archive, gate, instant, defaults = _parametri_missione(question, connection)
        except ValueError as error:
            return _errore_parametri(error)
        parameters = [archive, gate, instant]
        cursor = connection.execute(SOLUTION_QUERY, parameters)
        columns, rows = _righe(cursor)
        valid = {row[4] for row in rows if row[0] == "operatore" and row[4]}
        exclusions = _esclusioni(connection, archive, gate, instant, valid)
    return {
        "query": SOLUTION_QUERY, "parameters": parameters, "columns": columns, "rows": rows,
        "source": str(RECOVERED_DATABASE), "source_id": RECOVERED_DATABASE.name,
        "answer": _risposta_testo(archive, gate, instant, defaults, rows, exclusions),
    }
