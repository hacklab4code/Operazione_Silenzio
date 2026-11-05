"""A.N.I.M.A.: agente che risponde usando tool di lettura su `dati/`, senza preprocessing.

- strumenti.py  i tool (cerca, leggi, elenca_file, schema_database, esegui_sql)
- modelli.py    i modelli linguistici in catena (Groq → OpenAI → Ollama)
- prompt.py     identità, metodo e formato della risposta
- ciclo.py      il ciclo modello ↔ tool e il formato per la chat
"""
