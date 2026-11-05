"""Mappa delle 14 tabelle dell'archivio recuperato (giorno 4), per la pagina Schema.

È l'ipotesi ragionata dalla squadra per il checkpoint delle 2 ore: nomi, significati
e collegamenti scritti a mano in legacy/day4_sql.py, con conteggi letti dal database.
L'agente NON la riceve: esplora lo schema da solo con i tool.
"""

from legacy.day4_sql import schema_logico_giorno4

__all__ = ["schema_logico_giorno4"]
