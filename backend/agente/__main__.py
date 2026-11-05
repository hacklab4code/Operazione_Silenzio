
import sys

from dotenv import load_dotenv

from percorsi import BACKEND
from agente.ciclo import rispondi

load_dotenv(BACKEND / ".env")
esito = rispondi(" ".join(sys.argv[1:]) or "Che cosa contiene l'archivio?", avviso=lambda riga: print(riga, flush=True))
print("\n" + esito.testo)
