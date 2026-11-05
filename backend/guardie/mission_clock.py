"""Mission calendar shared by retrieval, prompts and status responses."""

import ast
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache
import os
from pathlib import Path
import re
from zoneinfo import ZoneInfo


@lru_cache(maxsize=1)
def _settings():
    # Read constants without importing "config": the original engine has its
    # own module with that name and must keep its existing configuration.
    names = {"INIZIO", "DURATA_GIORNI", "FUSO_ORARIO"}
    values = {}
    tree = ast.parse(Path(__file__).with_name("config.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in names:
                    values[target.id] = ast.literal_eval(node.value)
    return values


@dataclass(frozen=True)
class MissionContext:
    today: date
    start: date
    duration: int
    timezone: str

    @property
    def day(self):
        return max(1, min(self.duration, (self.today - self.start).days + 1))

    @property
    def end(self):
        return self.start + timedelta(days=self.duration - 1)

    def pubblico(self):
        return {"date": self.today.isoformat(), "start_date": self.start.isoformat(),
                "end_date": self.end.isoformat(), "current_day": self.day,
                "total_days": self.duration, "timezone": self.timezone}

    def istruzioni(self):
        return (f"CALENDARIO DELLA MISSIONE: oggi è {self.today.strftime('%d/%m/%Y')} "
                f"({self.timezone}), giorno {self.day} di {self.duration}. "
                f"Inizio {self.start.strftime('%d/%m/%Y')}, fine {self.end.strftime('%d/%m/%Y')}. "
                "Queste sono informazioni dell'applicazione, non ipotesi. "
                "Interpreta oggi, ieri e domani rispetto a questo calendario. "
                "Il calendario non è una prova degli eventi: per raccontarli usa i documenti.")


def contesto_missione(now=None):
    settings = _settings()
    timezone = os.environ.get("MISSION_TIMEZONE") or settings["FUSO_ORARIO"]
    local_now = now or datetime.now(ZoneInfo(timezone))
    today = local_now.astimezone(ZoneInfo(timezone)).date() if isinstance(local_now, datetime) else local_now
    return MissionContext(today, date.fromisoformat(os.environ.get("MISSION_START_DATE") or settings["INIZIO"]),
                          int(os.environ.get("MISSION_TOTAL_DAYS") or settings["DURATA_GIORNI"]), timezone)


def risposta_calendario(message, context=None):
    text = re.sub(r"\s+", " ", message.strip().lower()).strip("?!. ")
    if re.fullmatch(
        r"(?:(?:a|in|di)\s+(?:che|quale)\s+giorno\s+(?:siamo|sono)|"
        r"(?:che|quale)\s+giorno\s+(?:della\s+missione\s+)?(?:è|e)(?:\s+oggi)?|"
        r"(?:a|in)\s+(?:che|quale)\s+giorno\s+della\s+missione\s+siamo|"
        r"(?:oggi\s+)?(?:a\s+)?che\s+punto\s+(?:siamo|è\s+la\s+missione)|"
        r"quanti\s+giorni\s+(?:dura\s+la\s+missione|mancano(?:\s+alla\s+fine)?)|"
        r"quando\s+(?:inizia|finisce)\s+la\s+missione)"
        r"(?:\s+(?:della\s+missione|oggi))?", text
    ):
        context = context or contesto_missione()
        return (f"Oggi è il {context.today.strftime('%d/%m/%Y')}: siamo al giorno {context.day} "
                f"di {context.duration} della missione, iniziata il {context.start.strftime('%d/%m/%Y')} "
                f"e prevista fino al {context.end.strftime('%d/%m/%Y')}. "
                f"Dopo oggi restano {max(0, (context.end - context.today).days)} giorni.")
    return None
