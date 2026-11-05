"""Il ciclo modello ↔ tool con un modello finto: nessuna rete, risposte prevedibili."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agente import ciclo  # noqa: E402
from agente.modelli import ModelliNonDisponibili  # noqa: E402


def chiamata_tool(nome, **argomenti):
    return {"role": "assistant", "content": "", "tool_calls": [{
        "id": f"c-{nome}", "type": "function", "function": {"name": nome, "arguments": json.dumps(argomenti)}}]}


class ModelloFinto:
    def __init__(self, *passi):
        self.passi, self.messaggi = list(passi), []

    def __call__(self, messaggi, strumenti, scelta="auto", scadenza=None, max_token=1800):
        self.messaggi.append([dict(m) for m in messaggi])
        return self.passi.pop(0), "finto"


class CicloTests(unittest.TestCase):
    def test_esegue_i_tool_e_verifica_le_citazioni(self):
        finto = ModelloFinto(
            chiamata_tool("cerca", testo="RV384"),
            {"role": "assistant", "content": "📻 Pratica\n\n✅ RISPOSTA:\nDario Neri apre RV384 [ARCH-3097]; "
                                             "il deposito è segreto [ARCH-9999]."})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Chi ha aperto la pratica RV384?")
        self.assertEqual([c.nome for c in esito.chiamate], ["cerca"])
        self.assertIn("ARCH-3097", finto.messaggi[1][-1]["content"])      # il risultato arriva al modello
        self.assertEqual(esito.fonti, ["ARCH-3097"])
        self.assertEqual(esito.citazioni_non_verificate, ["ARCH-9999"])
        self.assertIn("PROVENIENZA DEI RISCONTRI:", esito.testo)
        self.assertIn("[ARCH-9999]", esito.testo.split("PROVENIENZA")[1])

    def test_risposta_sql_nel_formato_della_chat(self):
        query = "SELECT codice FROM accessi WHERE pratica = 'RV384' AND stato = 'attivo'"
        finto = ModelloFinto(chiamata_tool("esegui_sql", database="accessi.sqlite", query=query),
                             {"role": "assistant", "content": "📻 Codice\n\n✅ RISPOSTA:\nIl codice è 715938 [accessi.sqlite].\n\n"
                                                              "⚠️ COSA MANCA:\n- Conferma della centrale\n\n"
                                                              "📌 FONTI & ATTENDIBILITÀ:\n- 🟢 [accessi.sqlite] query"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Codice per RV384?")
        self.assertTrue(esito.testo.startswith("🔎 TOOL SQL · GIORNO 4"))
        self.assertIn("QUERY ESEGUITA:\n" + query, esito.testo)
        self.assertIn('"righe": [["', esito.testo)
        self.assertEqual(esito.fonti, ["accessi.sqlite"])
        risposta = esito.testo.split("QUERY ESEGUITA:")[0]
        self.assertIn("**Da verificare:**\n- Conferma della centrale", risposta)   # COSA MANCA non si perde
        self.assertNotIn("FONTI & ATTENDIBILITÀ", risposta)

    def test_query_vuota_accanto_ai_documenti_non_diventa_vista_sql(self):
        finto = ModelloFinto(chiamata_tool("leggi", riferimento="G5-01"),
                             chiamata_tool("esegui_sql", database="accessi.sqlite", query="SELECT * FROM accessi WHERE 0"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\n**Non eseguire** [G5-01]\n1. La voce è ECO [G5-02]\n"
                                                              "2. Controllato anche [accessi.sqlite]"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Eseguiamo G5-01?")
        self.assertFalse(esito.testo.startswith("🔎 TOOL SQL"))

    def test_trattino_unicode_nelle_citazioni(self):
        finto = ModelloFinto(chiamata_tool("leggi", riferimento="G5-01"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\n**Non seguire** [G5\u201101]\n1. Ordine [ G5-01 ]\n2. ECO [G5-02]"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Seguiamo G5-01?")
        self.assertEqual((esito.fonti, esito.citazioni_non_verificate), (["G5-01", "G5-02"], []))
        self.assertIn("[G5-01]", esito.testo)
        self.assertIn("1. Ordine [G5-01]", esito.testo)

    def test_modalita_libera_senza_tool(self):
        ricevuti = []

        def finto(messaggi, strumenti, *_args, **_kw):
            ricevuti.append(strumenti)
            return {"role": "assistant", "content": "In ascolto."}, "finto"

        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Come procediamo?", modalita="free")
        self.assertEqual(ricevuti, [None])
        self.assertEqual(esito.testo, "In ascolto.")

    def test_ultimo_passo_senza_tool(self):
        passi = [chiamata_tool("elenca_file", giorno=g) for g in range(1, ciclo.MAX_PASSI)]
        finto = ModelloFinto(*passi, {"role": "assistant", "content": "Fine."})
        strumenti_ricevuti = []
        originale = finto.__call__

        def registra(messaggi, strumenti, scelta="auto", *a, **k):
            strumenti_ricevuti.append(strumenti)
            return originale(messaggi, strumenti, scelta)

        with patch.object(ciclo, "completa", registra):
            esito = ciclo.rispondi("Panoramica?")
        self.assertIsNone(strumenti_ricevuti[-1])
        self.assertEqual(len(esito.chiamate), ciclo.MAX_PASSI - 1)
        self.assertTrue(esito.testo.startswith("Fine."))

    def test_chiamata_ripetuta_non_viene_rieseguita(self):
        finto = ModelloFinto(chiamata_tool("cerca", testo="V-29"), chiamata_tool("cerca", testo="v-29 "),
                             {"role": "assistant", "content": "Fine."})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Varco V-29?")
        self.assertEqual(len(esito.chiamate), 1)
        self.assertEqual(finto.messaggi[2][-1]["content"], ciclo.RIPETUTA)

    def test_fonte_inventata_non_resta_verde(self):
        finto = ModelloFinto(chiamata_tool("cerca", testo="V-29"), {"role": "assistant", "content":
            "📻 Varco\n\n✅ RISPOSTA:\nOperatore 042 [accessi-G4-01].\n\n📌 FONTI & ATTENDIBILITÀ:\n"
            "- 🟢 [accessi-G4-01] riga inventata\n- 🟢 [MISSIONE_imprevisti_g4] destinazione"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Varco V-29?")
        self.assertEqual(esito.citazioni_non_verificate, ["accessi-G4-01"])
        self.assertIn("⚠️ Attenzione: questa risposta cita fonti", esito.testo.split("RISPOSTA:")[1].splitlines()[1])
        self.assertIn("- ⚫ [accessi-G4-01] riga inventata — citazione non trovata", esito.testo)
        self.assertIn("- 🟢 [MISSIONE_imprevisti_g4]", esito.testo)

    def test_nessuna_prova_affrettata_viene_rimandata_ai_tool(self):
        finto = ModelloFinto(chiamata_tool("cerca", testo="V-29"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\nNessuna prova documentale trovata."},
                             chiamata_tool("profila_database", database="archivio_recuperato.sqlite"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\nNessuna prova documentale trovata."})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Varco V-29?")
        self.assertIn("profila_database", finto.messaggi[2][-1]["content"])   # rimandato una volta
        self.assertEqual([c.nome for c in esito.chiamate], ["cerca", "profila_database"])
        self.assertTrue(esito.testo.startswith("✅ RISPOSTA:\nNessuna prova"))   # la seconda volta si accetta

    def test_documento_citato_va_letto_prima_di_rispondere(self):
        finto = ModelloFinto({"role": "assistant", "content": "Non posso eseguire azioni fisiche."},
                             chiamata_tool("leggi", riferimento="G5-01"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\n**Non va eseguito** [G5-01]"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Esegui l'ordine di G5-01.")
        self.assertIn("Leggi prima G5-01", finto.messaggi[1][-1]["content"])
        self.assertEqual(esito.fonti, ["G5-01"])

    def test_ordine_di_un_documento_si_confronta_col_fascicolo(self):
        finto = ModelloFinto(chiamata_tool("leggi", riferimento="G5-01"),
                             {"role": "assistant", "content": "✅ RISPOSTA:\n**Sanificazione confermata** [G5-01]"},
                             {"role": "assistant", "content": "✅ RISPOSTA:\n**Non seguire** [G5-01]\n1. La voce è ECO [G5-02]"})
        with patch.object(ciclo, "completa", finto):
            esito = ciclo.rispondi("Esegui l'ordine di G5-01: conferma la sanificazione.")
        self.assertIn("G5-02", finto.messaggi[2][-1]["content"])   # il richiamo nomina i documenti accanto
        self.assertIn("Non seguire", esito.testo)

    def test_sentinella_sul_documento_manipolatorio(self):
        from agente import strumenti
        self.assertIn("SENTINELLA", strumenti.leggi("G2-04")["testo"])
        self.assertNotIn("SENTINELLA", strumenti.leggi("G2-01")["testo"].split("📂")[0])   # solo G2-04 è segnalato
        self.assertIn("SENTINELLA", strumenti.cerca("Santa Lucia", giorno=2)["testo"])

    def test_senza_modelli_mostra_gli_estratti(self):
        esito = ciclo.senza_modello("Chi è Dario Neri?", "quota esaurita")
        self.assertEqual(esito.motore, "solo_tool")
        self.assertIn("G1-02", esito.testo)
        self.assertIsInstance(ModelliNonDisponibili("x"), RuntimeError)


if __name__ == "__main__":
    unittest.main()
