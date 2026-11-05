
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field

import httpx

GROQ_PREDEFINITI = "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b"
_stato: dict[str, dict] = {}     # etichetta → {"restanti": token, "ricarica": istante, "pausa": istante}
_lock = threading.Lock()
log = logging.getLogger("anima.modelli")


@dataclass
class Modello:
    etichetta: str
    url: str
    modello: str
    chiave: str = ""
    extra: dict = field(default_factory=dict)
    timeout: float = 60.0
    locale: bool = False


class ModelliNonDisponibili(RuntimeError):
    pass


def catena() -> list[Modello]:
    modelli = []
    if os.environ.get("AGENTE_URL", "").strip():   # qualunque API compatibile OpenAI, prima di tutte
        modelli.append(Modello(f"personalizzato:{os.environ.get('AGENTE_MODELLO', '')}", os.environ["AGENTE_URL"].strip(),
                               os.environ.get("AGENTE_MODELLO", "").strip(), os.environ.get("AGENTE_CHIAVE", "").strip()))
    # Una chiave per membro della squadra (GROQ_API_KEY, GROQ_API_KEY_2): prima tutti i modelli della prima.
    chiavi = [os.environ.get(n, "").strip() for n in ("GROQ_API_KEY", "GROQ_API_KEY_2")]
    for numero, groq in enumerate(filter(None, chiavi), 1):
        for nome in filter(None, (m.strip() for m in os.environ.get("AGENTE_MODELLI_GROQ", GROQ_PREDEFINITI).split(","))):
            extra = {"reasoning_effort": os.environ.get("AGENTE_RAGIONAMENTO", "medium")} if "gpt-oss" in nome else {}
            etichetta = f"groq:{nome}" + (f"#{numero}" if numero > 1 else "")
            modelli.append(Modello(etichetta, "https://api.groq.com/openai/v1/chat/completions", nome, groq, extra))
    openai = os.environ.get("OPENAI_API_KEY", "").strip()
    if openai:   # riserva dopo Groq (serve credito sull'account)
        nome = os.environ.get("AGENTE_MODELLO_OPENAI", "gpt-5.4-mini")
        modelli.append(Modello(f"openai:{nome}", "https://api.openai.com/v1/chat/completions", nome, openai,
                                  {"reasoning_effort": "low"} if nome.startswith(("gpt-5", "o")) else {}))
    if os.environ.get("AGENTE_OLLAMA", "true").lower() != "false":
        url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
        nome = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
        modelli.append(Modello(f"ollama:{nome}", f"{url}/v1/chat/completions", nome, timeout=150.0, locale=True))
    return modelli


def _secondi(valore: str) -> float:
    """'51.39s', '1m2.3s', '420ms' → secondi."""
    if not valore:
        return 0.0
    if valore.endswith("ms"):
        return float(valore[:-2]) / 1000
    trovato = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?", valore)
    if not trovato:
        return 0.0
    ore, minuti, secondi = trovato.groups()
    return int(ore or 0) * 3600 + int(minuti or 0) * 60 + float(secondi or 0)


def _aggiorna(etichetta: str, risposta: httpx.Response) -> None:
    adesso = time.monotonic()
    with _lock:
        stato = _stato.setdefault(etichetta, {})
        if risposta.headers.get("x-ratelimit-remaining-tokens"):
            stato["restanti"] = int(float(risposta.headers["x-ratelimit-remaining-tokens"]))
            stato["ricarica"] = adesso + _secondi(risposta.headers.get("x-ratelimit-reset-tokens", ""))
        if risposta.status_code == 200:
            stato.pop("quota_fino", None)
            stato.pop("pausa", None)
        if risposta.status_code == 429 and "insufficient_quota" in risposta.text:
            stato["pausa"] = adesso + 3600   # account senza credito: non riprovare a ogni domanda
        elif risposta.status_code == 429:
            attesa = float(risposta.headers.get("retry-after") or 0) or _secondi(
                (re.search(r"try again in ([\dhms.]+)", risposta.text) or [None, "20s"])[1])
            stato["pausa"] = adesso + attesa + 0.5
        if risposta.status_code == 429:
            stato["quota_fino"] = stato["pausa"]


def _attesa(modello: Modello, stima: int) -> float:
    """Secondi prima che il modello possa ricevere una richiesta di `stima` token."""
    adesso = time.monotonic()
    with _lock:
        stato = _stato.get(modello.etichetta, {})
    attesa = max(0.0, stato.get("pausa", 0) - adesso)
    if stato.get("restanti") is not None and stato["restanti"] < stima and stato.get("ricarica", 0) > adesso:
        attesa = max(attesa, stato["ricarica"] - adesso)
    return attesa


def stato_groq() -> dict:
    """Indica se tutti i modelli Groq configurati sono in attesa di quota."""
    groq = [modello for modello in catena() if modello.url.startswith("https://api.groq.com/")]
    if not groq:
        return {"saturo": False}
    adesso = time.monotonic()
    with _lock:
        stati = [_stato.get(modello.etichetta, {}) for modello in groq]
    attese = [max(0.0, stato.get("quota_fino", 0) - adesso,
                  stato.get("ricarica", 0) - adesso if stato.get("restanti") == 0 else 0)
              for stato in stati]
    if all(attesa > 0 for attesa in attese):
        return {"saturo": True, "secondi_al_ripristino": max(1, round(min(attese)))}
    return {"saturo": False}


def _per_gemini(messaggi: list[dict]) -> list[dict]:
    """Gemini vuole una thought_signature su ogni tool call: quelle fatte da altri modelli
    (Groq) non ce l'hanno, e Google prevede questo valore per saltare il controllo."""
    copia = []
    for messaggio in messaggi:
        if messaggio.get("tool_calls"):
            chiamate = [c if c.get("extra_content") else
                        {**c, "extra_content": {"google": {"thought_signature": "skip_thought_signature_validator"}}}
                        for c in messaggio["tool_calls"]]
            messaggio = {**messaggio, "tool_calls": chiamate}
        copia.append({k: v for k, v in messaggio.items() if k != "_token"})
    return copia


def completa(messaggi: list[dict], strumenti: list[dict] | None, scelta: str = "auto",
             scadenza: float | None = None, max_token: int = 1500,
             ragionamento: str | None = None) -> tuple[dict, str]:
    """Un passo del modello: restituisce il messaggio assistant e l'etichetta del modello usato.
    `ragionamento` sostituisce reasoning_effort dove il modello lo prevede."""
    stima = len(json.dumps([messaggi, strumenti or []], ensure_ascii=False)) // 3 + max_token // 2
    errori = []
    modelli = catena()
    remoti = [m for m in modelli if not m.locale]
    while remoti:
        migliore = _attesa(remoti[0], stima)
        if 0 < migliore <= 8 and (scadenza is None or time.monotonic() + migliore + 15 < scadenza):
            time.sleep(migliore)   # pochi secondi valgono più di un modello più debole
        pronti = [m for m in remoti if _attesa(m, stima) == 0]
        senza_rete = 0
        for modello in pronti:
            corpo = {"model": modello.modello, "messages": _per_gemini(messaggi) if "generativelanguage" in modello.url
                     else messaggi, "temperature": 0.2, "max_tokens": max_token, **modello.extra}
            if ragionamento and "reasoning_effort" in corpo:
                corpo["reasoning_effort"] = ragionamento
            if "api.openai.com" in modello.url and modello.modello.startswith(("gpt-5", "o")):
                corpo.pop("temperature")   # i modelli di ragionamento OpenAI accettano solo i valori predefiniti
                corpo["max_completion_tokens"] = corpo.pop("max_tokens") + 2000
            if strumenti:
                corpo.update(tools=strumenti, tool_choice=scelta)
            restante = (scadenza - time.monotonic()) if scadenza else modello.timeout
            if restante < 4:
                raise ModelliNonDisponibili("tempo esaurito: " + "; ".join(errori[-3:]))
            try:
                for _ in range(3):   # una tool call malformata è casuale: si riprova lo stesso modello
                    risposta = httpx.post(modello.url, json=corpo, timeout=min(modello.timeout, restante),
                                          headers={"Authorization": f"Bearer {modello.chiave}"})
                    if risposta.status_code != 400 or "tool_use_failed" not in risposta.text:
                        break
                    log.info("%s: tool call malformata, nuovo tentativo", modello.etichetta)
            except httpx.HTTPError as errore:
                errori.append(f"{modello.etichetta}: {type(errore).__name__}")
                senza_rete += 1
                continue
            _aggiorna(modello.etichetta, risposta)
            if risposta.status_code == 200:
                dati = risposta.json()
                return {**dati["choices"][0]["message"], "_token": dati.get("usage", {}).get("total_tokens", 0)}, modello.etichetta
            errori.append(f"{modello.etichetta}: HTTP {risposta.status_code} {risposta.text[:120]}")
            log.warning("%s → HTTP %s %s", modello.etichetta, risposta.status_code, risposta.text[:300])
            if risposta.status_code in (401, 403):   # chiave revocata o senza permessi: inutile riprovare
                with _lock:
                    stato = _stato.setdefault(modello.etichetta, {})
                    stato["pausa"] = time.monotonic() + 3600
                    stato["quota_fino"] = stato["pausa"]
            elif risposta.status_code == 413:   # richiesta più grande della quota al minuto: inutile riprovare subito
                with _lock:
                    _stato.setdefault(modello.etichetta, {})["pausa"] = time.monotonic() + 120
            elif risposta.status_code not in (429, 498, 500, 502, 503) and _attesa(modello, stima) == 0:
                with _lock:   # errore del modello (es. tool call malformata): prova il successivo
                    _stato.setdefault(modello.etichetta, {})["pausa"] = time.monotonic() + 5
        if pronti and senza_rete == len(pronti):
            break   # Groq non raggiungibile: riserva locale
        # La quota al minuto si ricarica in pochi secondi: meglio aspettare Groq che il modello locale (lento).
        # Si passa al locale solo se tutti i modelli cloud sono fermi a lungo (quota giornaliera, chiave non valida).
        attesa = min(_attesa(m, stima) for m in remoti) + 0.2
        if attesa > 65:
            log.warning("Quote cloud esaurite; passo subito al modello locale")
            break
        if scadenza is not None and time.monotonic() + attesa + 8 > scadenza:
            log.warning("Quote cloud esaurite nella finestra della richiesta; provo il modello locale")
            break
        time.sleep(min(attesa, 65))

    for modello in (m for m in modelli if m.locale):   # riserva locale senza rete, chiave o quota cloud utile
        corpo = {"model": modello.modello, "messages": messaggi, "temperature": 0.2, "max_tokens": max_token}
        if strumenti:
            corpo.update(tools=strumenti, tool_choice="none" if scelta == "none" else "auto")
        try:
            risposta = httpx.post(modello.url, json=corpo, timeout=modello.timeout)
            if risposta.status_code == 200:
                return risposta.json()["choices"][0]["message"], modello.etichetta
            errori.append(f"{modello.etichetta}: HTTP {risposta.status_code}")
        except httpx.HTTPError as errore:
            errori.append(f"{modello.etichetta}: {type(errore).__name__}")
    raise ModelliNonDisponibili("; ".join(errori) or "nessun modello configurato")
