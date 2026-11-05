"""Vista a pagine, in sola lettura, di un database di `dati/` per il pannello Database."""

import sqlite3

from agente.strumenti import _database


def snapshot_database(database: str = "accessi.sqlite", table: str = "", search: str = "",
                      offset: int = 0, limit: int = 25) -> dict:
    percorso = _database(database)
    if percorso is None:
        raise FileNotFoundError(f"Database non trovato: {database}")
    offset, limit, search = max(0, int(offset)), min(100, max(1, int(limit))), (search or "").strip()[:120]
    connection = sqlite3.connect(percorso.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    try:
        names = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        if not names:
            raise ValueError("Il database non contiene tabelle")
        table = table if table in names else names[0]
        metadata = {}
        for name in names:
            columns = connection.execute(f'PRAGMA table_info("{name}")').fetchall()
            metadata[name] = {
                "name": name,
                "count": connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0],
                "columns": [{"name": c["name"], "type": c["type"], "primary_key": bool(c["pk"])} for c in columns],
            }
        columns = metadata[table]["columns"]
        where, parameters = "", []
        if search:
            where = " WHERE " + " OR ".join(f'CAST("{c["name"]}" AS TEXT) LIKE ?' for c in columns)
            parameters = [f"%{search}%"] * len(columns)
        total = connection.execute(f'SELECT COUNT(*) FROM "{table}"{where}', parameters).fetchone()[0]
        rows = connection.execute(f'SELECT * FROM "{table}"{where} ORDER BY 1 LIMIT ? OFFSET ?',
                                  [*parameters, limit, offset]).fetchall()
        # Relazioni per convenzione di nome (operatore_id → operatori.id): solo per il disegno.
        relations = []
        for name, info in metadata.items():
            for column in info["columns"]:
                stem = column["name"][:-3] if column["name"].endswith("_id") else ""
                target = next((t for t in names if stem and t != name and t.startswith(stem[:-1])), None)
                if target:
                    relations.append({"from_table": name, "from_column": column["name"],
                                      "to_table": target, "to_column": "id"})
        return {"database": percorso.name, "read_only": True, "tables": list(metadata.values()),
                "selected_table": table, "search": search, "offset": offset, "limit": limit,
                "total": total, "rows": [dict(row) for row in rows], "relations": relations}
    finally:
        connection.close()
