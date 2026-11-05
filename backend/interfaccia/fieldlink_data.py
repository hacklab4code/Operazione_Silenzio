"""Dati per le viste Prove, Archivio, Rapporto e Bacheca dell'interfaccia.

Legge `dati/` con gli stessi lettori dei tool dell'agente, quando la pagina li
chiede. La bacheca conserva gli estratti verificabili del motore originale e aggiunge
paragrafi letterali delle altre fonti. Le etichette non attestano la veridicità.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from agente.strumenti import documenti, FORMATI_TESTO, FORMATI_FOGLIO, RETTIFICHE
from percorsi import FRONTEND_BUILD

FORMATI = FORMATI_TESTO | FORMATI_FOGLIO


@dataclass(frozen=True)
class _Voce:
    id: str
    giorno: int
    formato: str
    nome_file: str
    sha256: str
    testo: str
    percorso: str
    titolo: str
    bytes: int
    updated_at: str


def carica_archivio(cartella):
    voci = [_Voce(d.relativo if d.percorso.suffix.lower() == ".xlsx" else d.id, d.giorno or 0, d.formato, d.percorso.name,
                  hashlib.sha256(d.percorso.read_bytes()).hexdigest(), d.testo,
                  d.relativo, d.titolo or d.percorso.name, d.percorso.stat().st_size,
                  _iso(d.percorso.stat().st_mtime))
            for d in documenti() if d.percorso.suffix.lower() in FORMATI]
    return voci, str(cartella)


CATEGORY_LABELS = {
    "g1": "Documenti del giorno 1",
    "g2": "Documenti del giorno 2",
    "g4": "Documenti del giorno 4",
    "g5": "Documenti del giorno 5",
    "lazzaro": "Imprevisti LAZZARO",
    "dossier": "Documenti ARCH",
    "enciclopedia": "Voci enciclopediche",
    "missioni": "Missioni e consegne",
    "materiali": "Materiali ricevuti",
    "other": "Altri documenti",
}


def _iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp else None


def _signature(path):
    """Invalidate local snapshots when a catalog or any original changes."""
    path = Path(path)
    try:
        if path.is_file():
            stat = path.stat()
            return ((str(path), stat.st_mtime_ns, stat.st_size),)
        return tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size)
                     for p in sorted(path.rglob("*"))
                     if p.is_file() and p.suffix.lower() in FORMATI)
    except OSError:
        return ()


def _category(document):
    # These are catalog group labels, never a filter on retrieval or evidence.
    if "/missioni/" in f"/{document.percorso}":
        return "missioni"
    if "/materiali_ricevuti/" in f"/{document.percorso}":
        return "materiali"
    source_id = document.id.upper()
    if source_id.startswith("WIKI-"):
        return "enciclopedia"
    if source_id.startswith("ARCH-"):
        return "dossier"
    if source_id.startswith("LX"):
        return "lazzaro"
    if source_id.startswith("G1-"):
        return "g1"
    if source_id.startswith("G2-"):
        return "g2"
    if source_id.startswith("G4-"):
        return "g4"
    if source_id.startswith("G5-"):
        return "g5"
    return "other"


@lru_cache(maxsize=4)
def _load_archive(source, signature):
    documents, _description = carica_archivio(source)
    by_day = Counter(document.giorno for document in documents)
    categories = Counter(_category(document) for document in documents)
    imprevisti = Counter(document.giorno for document in documents
                         if _category(document) == "lazzaro")
    formats = Counter(document.formato for document in documents)
    updated = max((entry[1] / 1_000_000_000 for entry in signature), default=None)
    archive = {
        "available": True,
        "total": len(documents),
        "by_day": [{"day": day, "count": count, "imprevisti": imprevisti[day]}
                   for day, count in sorted(by_day.items())],
        "by_category": [{"id": category, "label": CATEGORY_LABELS[category], "count": count}
                        for category, count in sorted(categories.items())],
        "by_format": [{"format": file_format, "count": count}
                      for file_format, count in sorted(formats.items())],
        "imprevisti_count": sum(imprevisti.values()),
        "latest_day": max(by_day, default=0),
        "updated_at": _iso(updated),
    }
    return documents, archive


def _normal(text):
    return " ".join(str(text or "").split()).casefold()


def _values(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def _read_board(path, documents):
    lookup = {document.id: document for document in documents}
    case_ids = {document.id for document in documents if _category(document) != "enciclopedia"}
    board = {"items": [], "total": 0, "covered_documents": 0,
             "case_documents": len(case_ids), "pending_documents": len(case_ids),
             "updated_at": None, "available": False, "status": "unavailable",
             "rejected_items": 0}
    try:
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            rows = []
        board["updated_at"] = _iso(Path(path).stat().st_mtime)
    except (OSError, ValueError):
        rows = []

    items, covered, keys = [], set(), set()
    for row in rows:
        if not isinstance(row, dict):
            board["rejected_items"] += 1
            continue
        source_id, quote = str(row.get("id") or ""), str(row.get("citazione") or "").strip()
        document = lookup.get(source_id)
        # The old board can outlive an import: never expose a stale quotation
        # or a row whose source is absent from the active archive.
        if document is None or not quote or _normal(quote) not in _normal(document.testo):
            board["rejected_items"] += 1
            continue
        key = f"{source_id}:{row.get('n', len(items))}"
        if key in keys:
            continue
        keys.add(key)
        covered.add(source_id)
        items.append({
            "key": key, "source_id": source_id, "day": document.giorno,
            "type": str(row.get("tipo") or "non classificato"),
            "reliability": str(row.get("affidabilita") or "non classificata"),
            "quote": quote, "people": _values(row.get("chi")),
            "places": _values(row.get("luoghi")), "times": _values(row.get("orari")),
        })
    for document in documents:
        if document.id not in case_ids or document.id in covered:
            continue
        # Literal paragraphs, without model interpretation or reliability claims.
        paragraphs = [part.strip() for part in document.testo.split("\n\n") if part.strip()]
        for index, quote in enumerate(paragraphs):
            items.append({"key": f"{document.percorso}:testo:{index}",
                          "source_id": document.id, "day": document.giorno,
                          "type": "testo della fonte", "reliability": "da verificare",
                          "quote": quote, "people": [], "places": [], "times": []})
        if paragraphs:
            covered.add(document.id)
    board["updated_at"] = max([d.updated_at for d in documents] + [board["updated_at"] or ""], default=None)
    missing = len(case_ids - covered)
    board.update(items=items, total=len(items), covered_documents=len(covered),
                 pending_documents=missing, available=True,
                 status="partial" if missing or board["rejected_items"] else "current")
    return board


def _latest_import(path, documents):
    """Publish import metadata only when its listed originals are still present."""
    try:
        manifest = json.loads(Path(path).read_text(encoding="utf-8"))
        listed = manifest.get("files") or {}
        if not isinstance(listed, dict) or not listed:
            return None
        by_name = {document.nome_file: document for document in documents}
        matched = [by_name[name] for name, digest in listed.items()
                   if name in by_name and by_name[name].sha256 == digest]
        return {"date": manifest.get("date"), "day": manifest.get("collection_day"),
                "count": len(matched), "expected_count": len(listed),
                "verified": len(matched) == len(listed)}
    except (OSError, ValueError, TypeError):
        return None


def read_dashboard_data(archive_source, board_path, import_manifest_path=None):
    """Read current local data without starting the RAG index or any model."""
    try:
        documents, archive = _load_archive(str(archive_source),
                                         _signature(archive_source) + _signature(RETTIFICHE))
    except (OSError, ValueError, TypeError):
        return {"archive": {"available": False, "total": 0, "by_day": [],
                            "by_category": [], "by_format": [], "imprevisti_count": 0,
                            "latest_day": 0, "updated_at": None},
                "board": _read_board(board_path, [])}
    archive = dict(archive)
    archive["assets"] = [{"key": p.relative_to(archive_source).as_posix(), "filename": p.name,
                           "format": p.suffix[1:].upper(), "bytes": p.stat().st_size}
                          for p in sorted(Path(archive_source).rglob("*"))
                          if p.is_file() and p.suffix.lower() in {".sqlite", ".sqlite3", ".db", ".zip"}]

    if import_manifest_path:
        latest_import = _latest_import(import_manifest_path, documents)
        if latest_import:
            archive["latest_import"] = latest_import
    return {"archive": archive, "board": _read_board(board_path, documents)}


def read_catalog(archive_source):
    """Live UI catalogue. Reuse map coordinates only for unchanged originals."""
    documents, _ = _load_archive(str(archive_source),
                                 _signature(archive_source) + _signature(RETTIFICHE))
    try:
        snapshot = json.loads((FRONTEND_BUILD / "rag/catalog.json").read_text(encoding="utf-8"))
        old = {(d["day"], d["filename"], d["sha256"]): d for d in snapshot["documents"]}
    except (OSError, ValueError, KeyError, TypeError):
        old = {}
    entries = []
    for doc in documents:
        entry = {"id": doc.id, "key": doc.percorso, "day": doc.giorno,
                 "filename": doc.nome_file, "title": doc.titolo, "content": doc.testo,
                 "format": doc.formato, "bytes": doc.bytes, "sha256": doc.sha256,
                 "category": _category(doc), "updated_at": doc.updated_at,
                 "source": f"Archivio della missione · giorno {doc.giorno} · {doc.percorso}"}
        previous = old.get((doc.giorno, doc.nome_file, doc.sha256), {})
        if previous.get("source"):
            entry["source"] = previous["source"]
        if previous.get("license"):
            entry["license"] = previous["license"]
        if previous.get("embedding"):
            entry["embedding"] = previous["embedding"]
        entries.append(entry)
    return {"version": 3, "documents": entries}
