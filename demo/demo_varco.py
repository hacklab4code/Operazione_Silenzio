"""Soluzione di riferimento del varco V-29 (giorno 4, imprevisti), eseguita dal tool SQL.

La query è quella scritta dalla squadra in backend/legacy/day4_sql.py: serve come
confronto per le risposte dell'agente, che invece esplora le 14 tabelle da solo.

    cd Operazione_Silenzio
    .venv/bin/python demo/demo_varco.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from agente.strumenti import esegui_sql  # noqa: E402
from legacy.day4_sql import MISSION_ARCHIVE, MISSION_GATE, MISSION_INSTANT, SOLUTION_QUERY  # noqa: E402


def main(istante=MISSION_INSTANT):
    query = SOLUTION_QUERY.replace("SELECT ? AS archivio, ? AS varco, ? AS istante",
                                   f"SELECT '{MISSION_ARCHIVE}' AS archivio, '{MISSION_GATE}' AS varco, '{istante}' AS istante")
    esito = esegui_sql("archivio_recuperato.sqlite", query)
    print(f"Archivio Stige · varco V-29 · istante {istante}\n")
    print(esito["testo"])
    return esito


if __name__ == "__main__":
    risultato = main(*sys.argv[1:2])
    if len(sys.argv) == 1:
        nomi = {riga[2] for riga in risultato["righe"] if riga[0] == "operatore"}
        assert nomi == {"Elena Mori", "Fabio Rota"}, nomi
