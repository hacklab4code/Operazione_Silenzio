"""Demo di riserva SENZA modello: gli stessi tool dell'agente, chiamati a mano.

Se Internet o la quota Groq mancano durante la presentazione, questa demo mostra
la catena del giorno 3 → giorno 4 con i tool reali, in sola lettura.

    cd Operazione_Silenzio
    .venv/bin/python demo/demo_riserva.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from agente.strumenti import esegui  # noqa: E402

QUERY = """SELECT o.nome AS operatore, d.nome AS deposito, d.settore,
       a.pratica, a.codice, a.stato, a.valido_fino
FROM accessi a
JOIN operatori o ON o.id = a.operatore_id
JOIN depositi d ON d.id = a.deposito_id
WHERE o.nome = 'Dario Neri' AND d.nome = 'Pozzo Freddo'
  AND d.settore = 'F2' AND a.pratica = 'RV384'
  AND a.stato = 'attivo' AND a.valido_fino >= '2031-10-12 06:00'"""


def passo(titolo, nome, **argomenti):
    print(f"\n=== {titolo}\n→ tool {nome} {argomenti}")
    esito = esegui(nome, argomenti).esito
    print(esito["testo"])
    return esito


def main():
    passo("Giorno 3: chi ha aperto la pratica e dove è finito il materiale", "cerca", testo="RV384")
    passo("Giorno 3: settore del deposito", "cerca", testo="Pozzo Freddo settore")
    passo("Giorno 4: lo schema del database, letto adesso", "schema_database", database="accessi.sqlite")
    codice = passo("Giorno 4: il permesso valido alla data della missione", "esegui_sql", database="accessi.sqlite", query=QUERY)
    assert codice["righe"] and codice["righe"][0][4] == "715938"
    vuota = passo("Prova: pratica inesistente", "esegui_sql", database="accessi.sqlite",
                  query=QUERY.replace("RV384", "PX-INESISTENTE"))
    assert vuota["righe"] == []
    rifiuto = passo("Prova: tentativo di cancellazione", "esegui_sql", database="accessi.sqlite", query="DELETE FROM accessi")
    assert rifiuto.get("errore")
    print("\nTUTTE LE PROVE SUPERATE: codice 715938, nessuna riga inventata, nessuna modifica possibile.")


if __name__ == "__main__":
    main()
