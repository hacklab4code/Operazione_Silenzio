"""Tutti i percorsi del sistema in un solo punto.

Operazione_Silenzio/
  backend/   ← questo codice
  frontend/  ← interfaccia React (build già pronta)
  dati/      ← materiale ricevuto, giorno per giorno; mai modificato dal sistema
"""

import os
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
PACCHETTO = BACKEND.parent
DATI = Path(os.environ.get("DATI_DIR") or PACCHETTO / "dati").expanduser().resolve()
FRONTEND_BUILD = PACCHETTO / "frontend" / "build"
REGISTRI = BACKEND / "registri"
DIARIO_CHAT = REGISTRI / "diario_chat.jsonl"
MOTORE_ORIGINALE = PACCHETTO / "motore_originale"
