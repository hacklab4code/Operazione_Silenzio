"""The configured AI identity is independent of documentary evidence and providers."""

import re
import unicodedata


NAME = "A.N.I.M.A."
EXPANSION = "Analytical Network for Infectious & Mutagenic Abnormalities"
INTRODUCTION = (
    f"Sono {NAME} — {EXPANSION}, l’agente AI della Squadra 2 per Operazione Silenzio. "
    "Analizzo documenti e dati sull’indagine LAZZARO a Roma, collego gli indizi e distinguo "
    "prove, dichiarazioni e ipotesi."
)


def identity_reply(question):
    """Answer standalone identity/contact questions without swallowing case questions."""
    text = "".join(c for c in unicodedata.normalize("NFKD", question.casefold())
                   if not unicodedata.combining(c))
    text = re.sub(r"a\.?n\.?i\.?m\.?a\.?", "anima", text)
    text = re.sub(r"[?!,;:.]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^(?:ciao |salve )?(?:anima|marco|ferri)\s*", "", text).strip()
    text = re.sub(r"^(chi sei|come stai|(?:ci|mi) senti|ciao|salve|buongiorno|buonasera)"
                  r"\s+(?:anima|marco|ferri)$", r"\1", text).strip()
    if re.fullmatch(r"(?:chi sei(?: e cosa fai)?|chi e anima|cosa fai|come ti chiami|presentati|sei un(?:a)? (?:ai|ia|intelligenza artificiale)|"
                    r"cosa (?:significa|vuol dire) anima|sei marco(?: ferri)?)", text):
        return INTRODUCTION
    if re.fullmatch(r"(?:(?:che )?cosa (?:sai|puoi) fare|come puoi aiutarmi|in cosa puoi aiutarmi)", text):
        return (INTRODUCTION + " Posso cercare nell’archivio, confrontare le fonti, ricostruire "
                "i collegamenti e interrogare i database disponibili in sola lettura. "
                "Se una prova manca o una richiesta è ambigua, lo segnalo.")
    if re.fullmatch(r"dove (?:sei|ti trovi)|qual e la tua posizione", text):
        return (f"Sono {NAME}, un agente AI accessibile da questa console. "
                "La collocazione fisica dei server non è specificata; la mia funzione è "
                "supportare l’indagine della squadra a Roma.")
    if re.fullmatch(r"(?:ciao|salve|buongiorno|buonasera|(?:ci|mi) senti|ci sei|come stai|sei (?:online|attiv[oa]))"
                    r"(?: (?:e )?(?:come stai|(?:ci|mi) senti|ci sei|sei (?:online|attiv[oa])))?", text):
        return f"{NAME} in ascolto. Indicate la domanda o il documento da analizzare."
    return None
