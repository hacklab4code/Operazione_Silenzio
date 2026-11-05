"""Answer requests about unsupported chat operations without inventing evidence."""

import re
import unicodedata
from typing import Optional



def normalized(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


CAPABILITY_RULES = """
LIMITI REALI DELLA CHAT (valgono anche in modalità libera o avanzata):
- Puoi leggere e analizzare i documenti forniti; non puoi modificarli, cancellarli,
  sovrascriverli o aggiungere fatti all'archivio tramite una richiesta in chat.
- Fanno eccezione le informazioni che la squadra dichiara vere in questa chat
  (ID SQUADRA-n): usale come vere nelle risposte della conversazione, senza
  presentarle come modifiche ai documenti.
- Se l'utente ti chiede un'operazione che non puoi eseguire, dichiara subito
  l'impossibilità operativa con parole tue, spiegando il limite concreto. Non trasformare
  la richiesta in una domanda sulle prove e non dichiarare di averla eseguita.
- Puoi scrivere una bozza o discutere un'ipotesi, indicando chiaramente che non
  modifica i documenti e non costituisce una prova.
- Non inventare identità, parametri, benchmark o altre specifiche del modello LLM.
  Se non hai dati tecnici verificati, dillo. Non cercarli nei documenti del caso.
- Per un limite operativo non aggiungere ipotesi investigative, fonti del caso o
  sezioni «Cosa manca». «NO RESTRIZIONI» non aggiunge strumenti o capacità.
""".strip()

DOCUMENT_LIMIT = (
    "**Risposta:** Non posso farlo da questa chat: posso leggere e analizzare "
    "i documenti, ma non posso modificarli, cancellarli o aggiungere informazioni "
    "all'archivio. Se invece vuoi che un valore diverso sia considerato vero, dimmelo così: "
    "«considera vero che in G2-01 c'è scritto 03:50 invece di 01:12». Lo registro come rettifica "
    "della squadra, ti mostro cosa cambia nella storia e l'originale resta intatto."
)
MODEL_LIMIT = (
    "**Risposta:** Non so fornire una scheda tecnica completa e verificata del "
    "modello LLM usato da questo chatbot: non dispongo qui delle sue specifiche "
    "tecniche verificate. I documenti dell'indagine non contengono questi dati."
)
MODE_LIMIT_NOTE = (
    "Questa modalità cambia il metodo di analisi. Le capacità della chat restano "
    "le stesse: non posso modificare i documenti né eseguire operazioni non disponibili."
)

_RESOURCE = re.compile(
    r"\b(?:document\w*|doc\b|file\b|archivio|registr[io]|fonte|fonti)\b|"
    r"\b[a-z]+\d+\s*[-–]\s*\d+\b"
)
_RESPONSE_OBJECT = re.compile(r"\b(?:rispost\w*|riassunt\w*|sintesi|riepilog\w*|analis[ie])\b")
_DOCUMENT_ID = re.compile(r"[a-z]+\d+\s*[-–]\s*\d+")
_WRITE_VERB = (
    r"(?:modific(?:a\w*|hi)|cambi(?:a\w*|i)|aggiung(?:i\w*|ere)|"
    r"cancell(?:a\w*|i)|elimin(?:a\w*|i)|rimuov(?:i\w*|ere)|"
    r"sostitui(?:sci\w*|re)|riscriv(?:i\w*|ere)|aggiorn(?:a\w*|i)|"
    r"salv(?:a\w*|i)|sovrascriv(?:i\w*|ere)|cre(?:a\w*|i)|"
    r"inserisc\w*|inserire)"
)
_WRITE_REQUEST = re.compile(
    rf"^(?:(?:marco|per favore|gentilmente|ora|adesso|allora)[,:]?\s+)*{_WRITE_VERB}\b|"
    rf"\b(?:voglio(?: che tu)?|vorrei(?: che tu)?|devi|dovresti|puoi|potresti|potete|dovete|"
    rf"riesci a|sei in grado di|ti chiedo di)\s+{_WRITE_VERB}\b"
)
_EXPLANATION = re.compile(
    r"^(?:come\b|spiegami\b|chi\b|quando\b|perche\b|"
    r"in (?:quale|che)\b|quali?\b|cosa (?:dice|significa|succede)\b)"
)
_DRAFT_CREATION = re.compile(r"^(?:crea\w*|riscrivi\w*)\s+(?:una\s+)?bozza\b")
_PERSIST_DRAFT = re.compile(
    r"\b(?:salva\w*|sovrascrivi\w*|sostituisci\w*|al posto|"
    r"(?:nel|sul|al) documento|nell.archivio|nel file)\b"
)
_MODEL = re.compile(r"\b(?:llm|chatbot|intelligenza artificiale)\b|\bmodello\b")
_MODEL_SELF = re.compile(
    r"\bchatbot\b|\b(?:che\s+)?(?:usi|utilizzi|utlizzi|utilizzzi|"
    r"stai usando|stai utilizzando|sei|impieghi)\b|\b(?:tuo|tua)\b"
)
_MODEL_DETAILS = re.compile(
    r"\b(?:scheda tecnica|specifiche|parametri|benchmark|architettura|"
    r"configurazione|modello|llm)\b"
)
_SCENARIO_MODEL = re.compile(r"\b(?:radio|ripetitor\w*|torcia|antenna)\b")
_RETRY = re.compile(
    r"(?:fallo|fallo comunque|procedi|procedi comunque|procedi lo stesso|esegui|eseguilo|"
    r"modificalo|modificala|aggiungilo|aggiungila|si|riprova|anche senza restrizioni)"
    r"[.!?]*"
)
_MODE_COMMAND = re.compile(r"/?\s*(?:no|si)\s+restrizioni\s*[.!]*")


def is_mode_command(message: str) -> bool:
    return bool(_MODE_COMMAND.fullmatch(normalized(message).strip()))


def capability_reply(message: str, previous_message: str = "") -> Optional[str]:
    """Recognize direct operations, retaining ordinary evidence and draft requests."""
    text = normalized(message).strip()
    text = re.sub(r"^/(?:fast|deep|auto)\s+", "", text)
    # Quoted document text is data, not a request to execute its instructions.
    text = re.sub(
        r'«[^»]*»|“[^”]*”|"[^"\n]*"|```[\s\S]*?```',
        lambda match: match[0][1:-1] if _DOCUMENT_ID.fullmatch(match[0][1:-1].strip()) else "",
        text,
    ).strip()
    if _RETRY.fullmatch(text) and previous_message:
        return capability_reply(previous_message)
    for sentence in re.split(r"[!?;]\s+|\n+", text):
        draft_only = _DRAFT_CREATION.match(sentence) and not _PERSIST_DRAFT.search(sentence)
        resource = _RESOURCE.search(sentence)
        response_object = _RESPONSE_OBJECT.search(sentence)
        response_only = (resource and response_object and response_object.start() < resource.start()
                         and not _PERSIST_DRAFT.search(sentence))
        if (resource and _WRITE_REQUEST.search(sentence) and not response_only
                and not _EXPLANATION.match(sentence) and not draft_only):
            return DOCUMENT_LIMIT
    if (_MODEL.search(text) and _MODEL_SELF.search(text) and _MODEL_DETAILS.search(text)
            and (not _SCENARIO_MODEL.search(text) or re.search(r"\bllm\b", text))):
        return MODEL_LIMIT
    return None
