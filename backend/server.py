"""API di A.N.I.M.A.: la chat radio passa le domande all'agente con tool.

All'avvio non si costruisce nulla (nessun indice, nessun embedding, nessuna copia
dei dati). Ogni domanda segue questo percorso:

  1. guardie veloci senza modello: identità, calendario, richieste di modifica;
  2. agente (agente/ciclo.py): il modello sceglie i tool, che leggono dati/ adesso;
  3. se nessun modello risponde: i tool mostrano gli estratti letterali.
"""

import asyncio
import json
import logging
import os
import queue
import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from percorsi import BACKEND, DATI, DIARIO_CHAT, FRONTEND_BUILD, MOTORE_ORIGINALE, REGISTRI

load_dotenv(BACKEND / ".env")

from agente import strumenti  # noqa: E402  (dopo .env: i modelli leggono le chiavi)
from agente.ciclo import ModelliNonDisponibili, rispondi, senza_modello  # noqa: E402
from agente.modelli import catena, stato_groq  # noqa: E402
from vetrina.simulazione import (  # noqa: E402
    catalogo as catalogo_vetrina,
    modalita_simulata,
    motivo_modalita,
    rispondi_vetrina,
)
from guardie.agent_identity import identity_reply  # noqa: E402
from guardie.chat_capabilities import capability_reply  # noqa: E402
from guardie.mission_clock import contesto_missione, risposta_calendario  # noqa: E402
from interfaccia.fieldlink_data import read_dashboard_data, read_catalog  # noqa: E402
from interfaccia.pannello_database import snapshot_database  # noqa: E402
from interfaccia.schema_giorno4 import schema_logico_giorno4  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("anima")
app = FastAPI(title="A.N.I.M.A. · Operazione Silenzio")
api = APIRouter(prefix="/api")
SSE = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
ID_CASO = re.compile(r"^(?:G\d+|LX\d+|ARCH)-\d+", re.I)


class Turn(BaseModel):
    role: Literal["marco", "voi"]
    text: str


class RadioRequest(BaseModel):
    session_id: str
    message: str
    history: List[Turn] = Field(default_factory=list)
    respondent_mode: Literal["auto", "marco", "team"] = "auto"
    processing_mode: Literal["auto", "documentary", "free"] = "auto"
    guided: bool = False


class Domanda(BaseModel):
    domanda: str = Field(min_length=2, max_length=2000)
    modalita: Literal["auto", "documentary", "free"] = "auto"


class RadioLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    question: str
    answer: str
    respondent_mode: Literal["auto", "marco", "team"] = "auto"
    processing_mode: Literal["auto", "documentary", "free"] = "auto"
    resolved_respondent_mode: Literal["marco", "team"] = "marco"
    resolved_processing_mode: Literal["documentary", "free"] = "free"
    source_ids: List[str] = Field(default_factory=list)
    engine: str = ""
    tool_calls: list = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ------------------------------------------------------------------ diario chat

def scrivi_diario(log: RadioLog) -> None:
    REGISTRI.mkdir(exist_ok=True)
    with DIARIO_CHAT.open("a", encoding="utf-8") as diario:
        diario.write(json.dumps(log.model_dump(), ensure_ascii=False) + "\n")


def leggi_diario(limit: Optional[int] = 200) -> list[dict]:
    if not DIARIO_CHAT.exists():
        return []
    records = []
    for riga in DIARIO_CHAT.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(riga)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict) and record.get("question"):
            records.append(record)
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


def documenti_del_caso() -> list[dict]:
    """All readable sources, shared by the catalogue, timeline and source previews."""
    return read_catalog(DATI)["documents"]


# ------------------------------------------------------------------------- API

@api.get("/")
async def root():
    return {"message": "156.8 MHz in ascolto · Operazione Silenzio Squadra 2"}


@api.get("/health")
async def health():
    documenti = await asyncio.to_thread(lambda: sum(1 for _ in strumenti.documenti()))
    return {"status": "ok",
            "backend": {"ready": DATI.is_dir(), "engine": "vetrina_simulata" if modalita_simulata() else "agente_tool",
                        "preprocessing": False,
                        "dati": str(DATI), "documents": documenti,
                        "tools": [d["function"]["name"] for d in strumenti.DEFINIZIONI],
                        "groq": stato_groq(),
                        "models": [m.etichetta for m in catena()]},
            "vetrina": {"simulata": modalita_simulata(), "motivo": motivo_modalita(), "percorso": catalogo_vetrina()},
            "mission": contesto_missione().pubblico()}


@api.get("/agente/strumenti")
async def elenco_strumenti():
    """Le definizioni dei tool esattamente come le riceve il modello."""
    return strumenti.DEFINIZIONI


@api.post("/agente/strumenti/{nome}")
async def usa_strumento(nome: str, argomenti: dict):
    """Esegue un tool a mano, come farebbe l'agente: utile per la demo e per le verifiche."""
    chiamata = await asyncio.to_thread(strumenti.esegui, nome, argomenti)
    return {"tool": nome, "argomenti": argomenti, "ms": round(chiamata.millisecondi, 1), **chiamata.esito}


@api.post("/agente")
async def chiedi_agente(req: Domanda):
    """Risposta completa in JSON, con la traccia delle chiamate ai tool."""
    try:
        if modalita_simulata():
            esito = await asyncio.to_thread(rispondi_vetrina, req.domanda)
        else:
            esito = await asyncio.to_thread(rispondi, req.domanda, None, False, req.modalita)
    except ModelliNonDisponibili as errore:
        esito = await asyncio.to_thread(senza_modello, req.domanda, str(errore))
    return {"risposta": esito.testo, "fonti": esito.fonti, "modelli": esito.modelli,
            "citazioni_non_verificate": esito.citazioni_non_verificate, "secondi": round(esito.secondi, 1),
            "chiamate": [{"tool": c.nome, "argomenti": c.argomenti, "risultato": c.esito.get("testo", "")}
                         for c in esito.chiamate]}


@api.get("/sql/giorno4/database")
async def pannello_database(table: str = "", q: str = "", offset: int = 0, limit: int = 25,
                            database: str = "accessi.sqlite"):
    try:
        return await asyncio.to_thread(snapshot_database, database, table, q, offset, limit)
    except ValueError as errore:
        raise HTTPException(status_code=400, detail=str(errore)) from errore
    except FileNotFoundError as errore:
        raise HTTPException(status_code=503, detail=str(errore)) from errore


@api.get("/sql/giorno4/schema")
async def pagina_schema():
    """Mappa delle 14 tabelle ragionata dalla squadra: solo per l'interfaccia, non per l'agente."""
    try:
        return await asyncio.to_thread(schema_logico_giorno4)
    except FileNotFoundError as errore:
        raise HTTPException(status_code=503, detail="Archivio recuperato non disponibile") from errore


@api.get("/fieldlink/catalog")
async def catalogo_interfaccia():
    return await asyncio.to_thread(read_catalog, DATI)


@api.get("/fieldlink/files/{percorso:path}")
async def originale_interfaccia(percorso: str):
    file = (DATI / percorso).resolve()
    if not file.is_relative_to(DATI.resolve()) or not file.is_file() or any(
            part.startswith(".") for part in file.relative_to(DATI.resolve()).parts):
        raise HTTPException(status_code=404, detail="Originale non disponibile")
    return FileResponse(file, filename=file.name)


@api.get("/fieldlink/data")
async def fieldlink_data():
    """Dati per le viste Prove, Archivio, Rapporto e Bacheca."""
    documenti = await asyncio.to_thread(documenti_del_caso)
    dashboard = await asyncio.to_thread(
        read_dashboard_data, DATI, MOTORE_ORIGINALE / "lavoro_locale" / "bacheca.json",
        REGISTRI / "import_imprevisti_giorno3.json")
    return {"documents": documenti, "radio_logs": leggi_diario(None), **dashboard,
            "mission": contesto_missione().pubblico(), "generated_at": datetime.now(timezone.utc).isoformat()}


def _risposta_immediata(req: RadioRequest) -> Optional[tuple[str, str]]:
    """Guardie che non richiedono modello né dati."""
    if (testo := identity_reply(req.message)) is not None:
        return testo, "agent_identity"
    if (testo := risposta_calendario(req.message)) is not None:
        return testo, "calendario_missione"
    precedente = next((t.text for t in reversed(req.history) if t.role == "voi"), "")
    if (testo := capability_reply(req.message, precedente)) is not None:
        return testo, "limiti_chat"
    return None


@api.get("/vetrina")
async def vetrina():
    """Percorso pubblico: stesse domande dei pulsanti, senza il testo preparato."""
    return {"simulata": modalita_simulata(), "motivo": motivo_modalita(), "percorso": catalogo_vetrina()}


@api.post("/radio")
async def radio(req: RadioRequest):
    team = req.respondent_mode == "team"
    respondent = "team" if team else "marco"

    async def eventi():
        immediata = _risposta_immediata(req)
        if immediata:
            testo, motore = immediata
            meta = {"respondent_mode": respondent, "processing_mode": "free", "engine": motore, "source_ids": []}
            yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'t': testo}, ensure_ascii=False)}\n\n"
            scrivi_diario(RadioLog(session_id=req.session_id, question=req.message, answer=testo,
                                   respondent_mode=req.respondent_mode, processing_mode=req.processing_mode,
                                   resolved_respondent_mode=respondent, engine=motore))
            yield "data: [END]\n\n"
            return

        if req.guided or modalita_simulata():
            yield ": vetrina simulata, i tool leggono i file adesso\n\n"
            esito = await asyncio.to_thread(rispondi_vetrina, req.message)
            meta = {"respondent_mode": respondent, "processing_mode": "documentary",
                    "engine": esito.motore, "source_ids": esito.fonti, "models": esito.modelli,
                    "tool_calls": len(esito.chiamate)}
            yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
            for inizio in range(0, len(esito.testo), 220):
                pezzo = esito.testo[inizio:inizio + 220]
                yield f"data: {json.dumps({'t': pezzo}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.012)
            scrivi_diario(RadioLog(
                session_id=req.session_id, question=req.message, answer=esito.testo,
                respondent_mode=req.respondent_mode, processing_mode=req.processing_mode,
                resolved_respondent_mode=respondent, resolved_processing_mode="documentary",
                source_ids=esito.fonti, engine=esito.motore,
                tool_calls=[{"tool": c.nome, "argomenti": c.argomenti} for c in esito.chiamate]))
            yield "data: [END]\n\n"
            return

        avanzamento: "queue.Queue[str]" = queue.Queue()
        storia = [(t.role, t.text) for t in req.history[-6:]]
        lavoro = asyncio.create_task(asyncio.to_thread(
            rispondi, req.message, storia, team, req.processing_mode, avanzamento.put, sessione=req.session_id))
        yield ": A.N.I.M.A. consulta i tool\n\n"
        while True:
            finito = lavoro.done()
            while not avanzamento.empty():   # commenti SSE: tengono viva la connessione
                yield f": {avanzamento.get_nowait()[:200]}\n\n"
            if finito:
                break
            await asyncio.sleep(0.4)
        try:
            esito = lavoro.result()
        except ModelliNonDisponibili as errore:
            logger.warning("Modelli non disponibili: %s", errore)
            esito = await asyncio.to_thread(senza_modello, req.message, str(errore))
        except Exception:
            logger.exception("Errore dell'agente")
            yield f"data: {json.dumps({'error': 'Trasmissione interrotta dal backend. Controllare logs/backend.log.'})}\n\n"
            yield "data: [END]\n\n"
            return
        meta = {"respondent_mode": respondent,
                "processing_mode": "free" if req.processing_mode == "free" else "documentary",
                "engine": esito.motore, "source_ids": esito.fonti, "models": esito.modelli,
                "tool_calls": len(esito.chiamate)}
        yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'t': esito.testo}, ensure_ascii=False)}\n\n"
        scrivi_diario(RadioLog(
            session_id=req.session_id, question=req.message, answer=esito.testo,
            respondent_mode=req.respondent_mode, processing_mode=req.processing_mode,
            resolved_respondent_mode=respondent, resolved_processing_mode=meta["processing_mode"],
            source_ids=esito.fonti, engine=esito.motore,
            tool_calls=[{"tool": c.nome, "argomenti": c.argomenti} for c in esito.chiamate]))
        yield "data: [END]\n\n"

    return StreamingResponse(eventi(), media_type="text/event-stream", headers=SSE)


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","))

# La build del frontend è servita dallo stesso server: un solo programma da avviare.
_build = os.environ.get("FRONTEND_BUILD_DIR") or str(FRONTEND_BUILD)
if os.path.isdir(_build):
    app.mount("/", StaticFiles(directory=_build, html=True), name="frontend")
