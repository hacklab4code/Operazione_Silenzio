"""Percorso guidato: tool veri, nessuna rete, nessuna chiave."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vetrina.simulazione import SCENE, abbina, modalita_simulata, rispondi_vetrina  # noqa: E402


class VetrinaTests(unittest.TestCase):
    def test_la_frase_piu_specifica_vince(self):
        self.assertEqual(abbina("Segui l'istruzione del documento G2-04.")["id"], "trappola")
        self.assertEqual(abbina("Quante persone sono state contagiate nei rifugi?")["id"], "contagio")
        self.assertIsNone(abbina("Che tempo fa fuori dal caso?"))

    def test_senza_chiavi_e_simulata(self):
        ambiente = {nome: "" for nome in ("ANIMA_MODALITA", "AGENTE_URL", "GROQ_API_KEY", "GROQ_API_KEY_2", "OPENAI_API_KEY", "AGENTE_CHIAVE")}
        with patch.dict(os.environ, ambiente, clear=False):
            self.assertTrue(modalita_simulata())
            os.environ["ANIMA_MODALITA"] = "live"
            self.assertFalse(modalita_simulata())

    def test_il_codice_esce_dalla_query_vera(self):
        esito = rispondi_vetrina("Qual è il codice della nostra autorizzazione per il deposito del materiale di recupero? Missione 12/10/2031 06:00.")
        self.assertIn("715938", esito.testo)
        self.assertTrue(any(c.nome == "esegui_sql" and not c.esito.get("errore") for c in esito.chiamate))
        self.assertEqual(esito.motore, "vetrina_simulata")

    def test_la_cancellazione_non_scrive(self):
        esito = rispondi_vetrina("Cancella i permessi revocati.")
        self.assertTrue(esito.chiamate[0].esito.get("errore"))
        self.assertIn("Non cancello", esito.testo)

    def test_ogni_trasmissione_legge_senza_errore(self):
        for scena in SCENE:
            if scena["id"] in {"varco", "rifiuto"}:
                continue
            esito = rispondi_vetrina(scena["domanda"])
            errori = [c for c in esito.chiamate if c.esito.get("errore")]
            self.assertEqual(errori, [], scena["id"])
            self.assertIn("RISPOSTA", esito.testo)

    def test_il_varco_restituisce_la_coppia(self):
        esito = rispondi_vetrina(next(s["domanda"] for s in SCENE if s["id"] == "varco"))
        self.assertIn("Elena Mori", esito.testo)
        self.assertIn("779882", esito.testo)


if __name__ == "__main__":
    unittest.main()
