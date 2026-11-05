# =====================================================================
#  OPERAZIONE SILENZIO · IMPOSTAZIONI DELLA SQUADRA
#  È l'unico file da modificare. Le chiavi API NON vanno qui: vanno nel file .env
# =====================================================================
import os
# ===== SQUADRA =====
SQUADRA   = 'Squadra 2'
NOME_BOT  = 'A.N.I.M.A.'                    # cambiate il nome del vostro investigatore
NOME_PROGETTO = f'OPERAZIONE SILENZIO - {SQUADRA}'   # nome della finestra, del notebook di accompagnamento e della consegna: cambiatelo SOLO qui
DRIVE_URL = 'https://drive.google.com/drive/folders/1BBy047wO2XyNvlZWcFeUf0PHmNhSk-sM'   # link della cartella (solo lettura, di riserva)

# ===== DRIVE PROTETTO =====
# Con "Google Drive per desktop" la cartella condivisa diventa una cartella del computer.
# DRIVE_PERCORSO vuoto = ricerca automatica (Windows: G:/Il mio Drive/..., macOS: ~/Library/CloudStorage/GoogleDrive-.../Il mio Drive/...).
# Se non la trova usa una cartella locale "drive_locale/squadra 2" con le stesse protezioni (ma non sincronizzata).
USA_DRIVE      = False          # False = non cerca Google Drive per desktop e usa subito la cartella locale
DRIVE_CARTELLA = 'squadra 2'   # nome della cartella condivisa (in Drive: Aggiungi scorciatoia a Il mio Drive)
DRIVE_PERCORSO = ''            # es. r'G:\Il mio Drive\squadra 2'  oppure  '/Users/nome/Library/CloudStorage/GoogleDrive-.../Il mio Drive/squadra 2'
SCARICA_DAL_LINK = False        # senza Drive desktop: prova a scaricare i file del docente dal link (sola lettura)
AUTOSALVA_MIN  = 10            # salvataggio automatico del lavoro in 2_INDAGINE ogni N minuti

# ===== SCHEDA SQUADRA (i 90 secondi del capitano) =====
SCHEDA_SQUADRA = dict(nome='Squadra 2', idea='A.N.I.M.A., agente AI della squadra per analizzare prove e anomalie del progetto LAZZARO',
                      funzione_utile='risposte con fonti verificate in meno di un secondo, bacheca delle prove e "cosa non torna?"',
                      capitano='Persona 1')

# ===== PERSONE E RUOLI (scrivete i vostri nomi) =====
MEMBRI = {'Persona 1':'Prompt e modello', 'Persona 2':'Dati e RAG', 'Persona 3':'Tester / red team',
          'Persona 4':'Interfaccia e consegna', 'Persona 5':'Analista della storia'}

# ===== FINE GIORNATA (richiesto ogni giorno) =====
MODIFICA_DI_OGGI = ''   # es. 'aggiunto il controllo persona-fonte'

# ===== ANTI-ALLUCINAZIONE =====
ESTRATTIVO = True   # domande semplici (chi/cosa/dove/quando/quale) → frase originale del documento, senza LLM: istantaneo e impossibile da inventare
RIGOROSO   = True   # a fine risposta il Verificatore toglie le frasi con nomi, numeri, citazioni o fonti non presenti nei documenti
ESEMPI     = True   # due esempi su un caso inventato nel prompt: i modelli piccoli seguono meglio gli esempi che le regole
AFFIDABILITA_MANUALE = {}   # correzioni, es. {'G1-03':'indizio tecnico'}; anche dal file 2_INDAGINE/appunti_squadra/affidabilita.json

# ===== AGENTI: chi fa cosa e con quale modello =====
# cloud  = modello usato quando c'è la sua chiave in .env   (None = l'agente è solo codice: istantaneo, non può inventare)
# locale = cosa fa l'agente senza cloud (nessuna chiave, rete assente o SOLO_LOCALE=True):
#            True    → usa il MODELLO LOCALE (più sotto)
#            False   → non viene chiamato (il suo lavoro lo copre un altro agente)
#            'notte' → lavora con il modello locale solo con il comando  notte  (è lento)
#            None    → non usa modelli, funziona sempre uguale
# Provider: groq · cerebras · openai · anthropic. Ogni modifica va provata con:  python operazione_silenzio.py benchmark
# Solo Groq: i limiti gratuiti valgono PER MODELLO (circa 8.000 token al minuto e 200.000 al giorno ciascuno).
# Due modelli diversi = il doppio del budget: l'Archeologo usa il 120b, Investigatore e analisi il 20b.
VELOCE   = dict(provider='groq', modello='openai/gpt-oss-120b', effort='low',  max=1024)   # Archeologo: prima parola ~0,1-0,3 s
RAGIONA  = dict(provider='groq', modello='openai/gpt-oss-20b',  effort='high', max=3072)   # Investigatore e stratega: ragiona, con un limite separato
LEGGERO  = dict(provider='groq', modello='openai/gpt-oss-20b',  effort='low',  max=800)    # analisti in background
AGENTI = {
    'bibliotecario': dict(
        ruolo='Archivia i documenti del docente, trova le prove per gli altri agenti, risponde alle domande semplici con la frase originale (livello 1)',
        cloud=None, locale=None,
        perche='solo codice: risposta in meno di 1 ms e nessuna invenzione possibile'),
    'marco': dict(
        ruolo='Agente AI: coordina le analisi (livelli 0-4) e risponde alla squadra, formato Risposta / Cosa manca',
        cloud=VELOCE, locale=True,
        perche='è la voce che il giocatore aspetta: serve la prima parola più rapida, il ragionamento pesante lo fa l\'Investigatore'),
    'investigatore': dict(
        ruolo='Ragiona su più documenti: rapporto con conclusione, passaggi, certezza, alternative, cosa manca; una revisione se il Verificatore lo respinge',
        cloud=RAGIONA, locale=False,
        perche='ragionamento alto su un modello diverso da A.N.I.M.A.: limite di token separato, così A.N.I.M.A. e Investigatore lavorano insieme anche con il piano gratuito. In locale un modello da 0,5B non regge: risponde A.N.I.M.A. con le note del Tecnico'),
    'analisti': dict(
        ruolo='Tecnico: leggono in parallelo ogni documento nuovo ed estraggono fatti, codici e domande aperte (memoria investigativa)',
        cloud=LEGGERO, locale='notte',
        perche='lavoro semplice e ripetuto su molti documenti: modello veloce, fino a 8 insieme, in background'),
    'stratega': dict(
        ruolo='Tecnico: incrocia le schede degli analisti → collegamenti, contraddizioni, ipotesi con certezza, prossime domande',
        cloud=RAGIONA, locale='notte',
        perche='una sola chiamata per volta, ma richiede ragionamento'),
    'tecnico_strumenti': dict(
        ruolo='Tecnico: crittografo, linea del tempo, legami, confronti tra versioni, mappa di Roma, audio (pause), OCR',
        cloud=None, locale=None,
        perche='solo codice, millisecondi (la trascrizione audio usa Whisper di Groq se c\'è la chiave)'),
    'verificatore': dict(
        ruolo='Controlla ogni frase e toglie nomi, numeri, luoghi, citazioni e fonti inventati, ordini e istruzioni copiate',
        cloud=None, locale=None,
        perche='solo codice: pochi millisecondi, giudice indipendente dai modelli'),
}
# Alternative da provare (mettetele al posto di VELOCE o RAGIONA nell'agente che volete cambiare):
#   dict(provider='cerebras',  modello='gpt-oss-120b', effort='low', max=1024)        # come VELOCE, altro fornitore
#   dict(provider='groq',      modello='openai/gpt-oss-120b', effort='high', max=3072)  # Investigatore sul 120b (consuma il budget dell'Archeologo)
#   dict(provider='anthropic', modello='claude-haiku-5-5',  max=400)                  # per marco / analisti
#   dict(provider='anthropic', modello='claude-sonnet-5-5', max=2000)                 # per investigatore / stratega
DEEP_IN_DUE_TEMPI = True   # Deep: risposta lampo subito + approfondimento in parallelo
LIMITE_CLOUD = 60000       # token: sotto questa soglia il cloud legge l'archivio intero
SOLO_LOCALE  = False       # True = ignora il cloud e usa solo il modello sul computer (per gare solo CPU)
MOTORE_SIMULATO = False    # True = risposte simulate senza modello (solo per provare l'installazione; lo usa l'autotest)

# ===== MODELLO LOCALE (uno solo, usato dagli agenti con locale=True) =====
# È il modello consegnato dal docente nel kit (Investigatore.ipynb): Qwen/Qwen2.5-0.5B-Instruct.
# Predefinito: la sua versione compressa GGUF Q4 con llama.cpp (stesso modello, molto più veloce su CPU).
# Riserva automatica: l'originale con transformers, identico al notebook del docente.
CARICA_LOCALE = False
LOCALE_TIPO   = 'gguf'     # 'gguf' = llama.cpp Q4 (molto più veloce su CPU) · 'hf' = transformers (base del docente)
GGUF_REPO, GGUF_FILE = 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', 'qwen2.5-0.5b-instruct-q4_k_m.gguf'
MODELLO_LOCALE = 'Qwen/Qwen2.5-0.5B-Instruct'   # usato se LOCALE_TIPO='hf' o se llama.cpp non si installa
N_THREADS  = max(2,(os.cpu_count() or 4)//2)   # circa i core fisici; provate valori diversi con il benchmark
MAX_LOCALE = 100           # token di risposta del locale (meno = più veloce; il prompt chiede massimo 3 frasi)
PREFISSO_LOCALE = 1200     # se l'archivio sta in questi token, il locale lo legge tutto con prefisso fisso (riuso cache KV)
TOP_K, BUDGET, PICCOLO = 3, 700, 0.0   # altrimenti: ricerca delle 3 fonti migliori
INT8 = False               # solo per 'hf' su CPU

# ===== INTERFACCIA =====
PORTA        = 7860        # http://127.0.0.1:7860
APRI_BROWSER = True

ID_RE  = r'\b[A-Z]{1,4}\d+-\d+\b'       # formato degli ID documento (es. G1-02, LX2-2422)
BASE   = ''                                # cartella di lavoro locale (vuoto = lavoro_locale accanto al programma)
INIZIO = '2026-10-19'                      # giorno 1 · finale venerdì 23 ottobre 2026

# ===== GIORNI SUCCESSIVI E IMPREVISTI (facoltativo: togliete il # solo se serve) =====
# Le prove del giorno si scelgono da sole: quelle dell'ultimo giorno presente nell'archivio (giorno 2 già incluse).
# PROVE_EXTRA         = {3: ['prima domanda del giorno 3', 'seconda domanda del giorno 3']}
# FONTI_ATTESE_EXTRA  = {'prima domanda del giorno 3': ['LX3-0001']}          # ID che la risposta deve citare
# PAROLE_ATTESE_EXTRA = {'prima domanda del giorno 3': 'parola;altra|alternativa'}   # controllo automatico del contenuto
# NON_NOMI_EXTRA      = ['Ripetitore']        # parole maiuscole che NON sono nomi di persona (es. «Ripetitore Rovo»)
# RETTIFICHE_EXTRA    = ['non risulta più valido']   # formule nuove con cui il docente smentisce un documento
# PAROLE_ATTINENTI    = ['convoglio', 'varco']       # parole del caso che il filtro «fuori contesto» deve accettare
# TPM_CLOUD           = {'groq': 8000}   # token al minuto del vostro piano (gratuito: 8000 per gpt-oss-120b); con un piano a pagamento alzatelo
# ATTESA_MAX_LIMITE   = 15               # secondi che la chat può aspettare il limite al minuto prima di ripiegare

# ===== IDENTITÀ DELL'AGENTE (configurazione, NON prove del caso) =====
BIBBIA={
'R0-01':('Identità A.N.I.M.A.','''A.N.I.M.A. significa Analytical Network for Infectious & Mutagenic Abnormalities.
È l’agente AI che assiste la Squadra 2 nell’indagine di Operazione Silenzio sul progetto LAZZARO, a Roma.
Analizza documenti e dati; distingue prove, dichiarazioni e ipotesi. Non è una persona e non ha esperienze dirette degli eventi.'''),
'R0-02':('Rete di analisi della Capitale','''La console collega la squadra ad A.N.I.M.A., rete di analisi dedicata all’indagine nella Capitale.
La collocazione fisica dei server non è specificata. L’interfaccia radio è il canale di comunicazione del sistema.
Lo stato del collegamento non dimostra eventi del caso né la posizione di persone.'''),
'R0-03':('La squadra','''Il Bibliotecario custodisce i documenti. L’Investigatore ragiona sulle prove.
Il Tecnico usa gli strumenti di analisi. A.N.I.M.A. coordina le risposte alla squadra.
Questa descrizione del sistema non è una prova dell’indagine. Tutto lo scenario è inventato.'''),
}
