"""Le API usate dall'interfaccia, con l'agente sostituito da un esito fisso."""

import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from agente.ciclo import Esito  # noqa: E402


def eventi(risposta):
    return [json.loads(riga[6:]) for riga in risposta.text.split("\n\n") if riga.startswith("data: {")]


class ServerTests(unittest.TestCase):
    def setUp(self):
        cartella = TemporaryDirectory()
        self.addCleanup(cartella.cleanup)
        diario = Path(cartella.name) / "diario.jsonl"
        for nome in ("DIARIO_CHAT",):
            patcher = patch.object(server, nome, diario)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(server.app)

    def test_health_senza_preprocessing(self):
        backend = self.client.get("/api/health").json()["backend"]
        self.assertFalse(backend["preprocessing"])
        self.assertIn("esegui_sql", backend["tools"])
        self.assertGreater(backend["documents"], 1500)

    def test_radio_identita_senza_modello(self):
        with patch.object(server, "rispondi", side_effect=AssertionError("non deve chiamare l'agente")):
            dati = eventi(self.client.post("/api/radio", json={"session_id": "s", "message": "Chi sei?"}))
        self.assertEqual(dati[0]["meta"]["engine"], "agent_identity")

    def test_radio_passa_la_domanda_all_agente(self):
        ricevuti = {}

        def finto(domanda, storia, team, modalita, avviso, sessione=""):
            ricevuti.update(domanda=domanda, storia=storia, team=team, sessione=sessione)
            avviso("- cerca «RV384» → 2 paragrafi")
            return Esito("📻 Ok\n\n✅ RISPOSTA:\nTrovato [ARCH-3097].", fonti=["ARCH-3097"], modelli=["finto"])

        with patch.object(server, "modalita_simulata", return_value=False), patch.object(server, "rispondi", finto):
            risposta = self.client.post("/api/radio", json={
                "session_id": "s", "message": "Chi ha aperto RV384?", "respondent_mode": "team",
                "history": [{"role": "voi", "text": "Ciao"}, {"role": "marco", "text": "In ascolto."}]})
        dati = eventi(risposta)
        self.assertEqual(dati[0]["meta"]["source_ids"], ["ARCH-3097"])
        self.assertIn("Trovato", dati[1]["t"])
        self.assertIn(": - cerca «RV384»", risposta.text)
        self.assertTrue(ricevuti["team"])
        self.assertEqual(ricevuti["storia"], [("voi", "Ciao"), ("marco", "In ascolto.")])
        self.assertEqual(ricevuti["sessione"], "s")
        self.assertEqual(len(self.client.get("/api/fieldlink/data").json()["radio_logs"]), 1)

    def test_radio_guidata_non_chiama_il_modello(self):
        with patch.object(server, "modalita_simulata", return_value=False), \
             patch.object(server, "rispondi", side_effect=AssertionError("non deve chiamare il modello")), \
             patch.object(server, "rispondi_vetrina", return_value=Esito("Percorso guidato", motore="vetrina_simulata")):
            dati = eventi(self.client.post("/api/radio", json={
                "session_id": "s", "message": "Mostra il percorso", "guided": True}))
        self.assertEqual(dati[0]["meta"]["engine"], "vetrina_simulata")
        self.assertIn("Percorso guidato", dati[1]["t"])

    def test_tool_eseguibile_a_mano(self):
        esito = self.client.post("/api/agente/strumenti/esegui_sql",
                                 json={"database": "accessi.sqlite", "query": "DELETE FROM accessi"}).json()
        self.assertTrue(esito["errore"])

    def test_viste_dell_interfaccia(self):
        dati = self.client.get("/api/fieldlink/data").json()
        self.assertEqual(dati["archive"]["total"], 1539)   # con LX2-7390 del giorno 5
        self.assertEqual(dati["archive"]["latest_day"], 5)
        self.assertEqual(dati["board"]["pending_documents"], 0)
        self.assertTrue(any(i["source_id"] == "G5-03" for i in dati["board"]["items"]))
        self.assertTrue(any(d["id"] == "G4-03" for d in dati["documents"]))
        pannello = self.client.get("/api/sql/giorno4/database?table=accessi").json()
        self.assertEqual({t["name"] for t in pannello["tables"]}, {"operatori", "depositi", "accessi"})
        self.assertEqual(len(pannello["relations"]), 2)

    def test_catalogo_condiviso_con_tutte_le_fonti_e_download(self):
        catalogue = self.client.get("/api/fieldlink/catalog").json()["documents"]
        donnees = self.client.get("/api/fieldlink/data").json()
        self.assertEqual(len(catalogue), donnees["archive"]["total"])
        self.assertEqual({d["key"] for d in catalogue}, {d["key"] for d in donnees["documents"]})
        self.assertEqual(len({d["key"] for d in catalogue}), len(catalogue))
        self.assertEqual(len({d["id"] for d in catalogue}), len(catalogue))
        g5 = [d for d in catalogue if d["day"] == 5]
        self.assertEqual(len(g5), 5)
        self.assertEqual({d["id"] for d in g5 if d["format"] == "TXT"}, {"G5-01", "G5-02", "G5-03", "LX2-7390"})
        mission = next(d for d in g5 if d["format"] == "XLSX")
        self.assertIn("Foglio", mission["content"])
        for doc in g5:
            original = self.client.get("/api/fieldlink/files/" + doc["key"])
            self.assertEqual(original.status_code, 200)
            self.assertEqual(len(original.content), doc["bytes"])
        self.assertEqual(self.client.get("/api/fieldlink/files/%2E%2E/backend/server.py").status_code, 404)

    def test_nuovo_documento_visibile_senza_riavvio(self):
        from agente import strumenti
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "giorno_5/documenti/G5-04.txt"
            source.parent.mkdir(parents=True)
            with patch.object(server, "DATI", root), patch.object(strumenti, "DATI", root):
                before = self.client.get("/api/fieldlink/catalog").json()["documents"]
                self.assertEqual(before, [])
                source.write_text("ID G5-04\nNuova fonte\n\nTesto appena ricevuto.")
                after = self.client.get("/api/fieldlink/catalog").json()["documents"]
                self.assertEqual([d["id"] for d in after], ["G5-04"])
                dashboard = self.client.get("/api/fieldlink/data").json()
                self.assertEqual(dashboard["archive"]["total"], 1)
                self.assertTrue(any("Testo appena ricevuto." in i["quote"] for i in dashboard["board"]["items"]))
                source.write_text("ID G5-04\nNuova fonte\n\nTesto aggiornato e completo.")
                updated = self.client.get("/api/fieldlink/catalog").json()["documents"]
                self.assertIn("Testo aggiornato e completo.", updated[0]["content"])


if __name__ == "__main__":
    unittest.main()
