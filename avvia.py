#!/usr/bin/env python3
"""Installa e avvia A.N.I.M.A. (interfaccia + API con agente a tool) su Windows/macOS/Linux."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import venv
import webbrowser

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
BUILD = ROOT / "frontend/build"
REQUIREMENTS = ROOT / "requirements-portatile.txt"
VENV = ROOT / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
STAMP = VENV / ".dipendenze-installate"
LOG = ROOT / "logs/backend.log"


def install_runtime():
    fingerprint = hashlib.sha256(REQUIREMENTS.read_bytes() + str(sys.version_info[:2]).encode()).hexdigest()
    if not PYTHON.is_file():
        print("Creazione dell'ambiente Python locale...", flush=True)
        venv.EnvBuilder(with_pip=True, symlinks=os.name != "nt").create(VENV)
    if STAMP.is_file() and STAMP.read_text().strip() == fingerprint:
        check = subprocess.run(
            [str(PYTHON), "-c", "import fastapi, uvicorn, dotenv, httpx, openai, anthropic, gdown"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if check.returncode == 0:
            return
    print("Installazione dipendenze. Al primo avvio serve Internet...", flush=True)
    subprocess.run(
        [str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(REQUIREMENTS)],
        cwd=ROOT, check=True,
    )
    STAMP.write_text(fingerprint, encoding="utf-8")


def serve(port):
    # Always use this package even if another bot's paths exist in the host env.
    os.environ["FRONTEND_BUILD_DIR"] = str(BUILD)
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=port, log_level="info")


def read_url(url):
    # Never route local application requests through a corporate/system proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=10) as response:
        return response.read()


def smoke_check(url):
    health = json.loads(read_url(url + "/api/health"))
    engine = health.get("backend", {})
    if not engine.get("ready") or not engine.get("documents"):
        raise RuntimeError("La cartella dati non contiene documenti leggibili dai tool.")
    if Path(engine["dati"]).resolve() != (ROOT / "dati").resolve():
        raise RuntimeError("Il server non legge la cartella dati del pacchetto.")
    json.loads(read_url(url + "/api/fieldlink/data"))
    if '<div id="root"></div>' not in read_url(url + "/").decode("utf-8"):
        raise RuntimeError("La build del frontend non e' disponibile.")
    return engine["documents"]


def stop(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        process.send_signal(signal.CTRL_BREAK_EVENT)
    else:
        process.terminate()
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--porta", type=int, default=3000, help="porta locale, predefinita: 3000")
    parser.add_argument("--no-browser", action="store_true", help="non aprire il browser automaticamente")
    parser.add_argument("--solo-installa", action="store_true", help="prepara le dipendenze senza avviare")
    parser.add_argument("--verifica", action="store_true", help="avvia, verifica frontend/API/archivio e arresta")
    parser.add_argument("--server", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if sys.version_info < (3, 11, 5):
        raise RuntimeError("Serve Python 3.11.5 o successivo. Installa Python 3.12 e riprova.")
    if not 1 <= args.porta <= 65535:
        raise RuntimeError("La porta deve essere compresa tra 1 e 65535.")
    if args.server:
        serve(args.porta)
        return 0
    for path in [BUILD / "index.html", BACKEND / "server.py"]:
        if not path.is_file():
            raise RuntimeError(f"File mancante: {path}. Estrai l'intero ZIP prima di avviare.")
    if not (BACKEND / ".env").is_file():
        print("Nessun backend/.env: parte la vetrina simulata, senza chiave API.", flush=True)
    install_runtime()
    if args.solo_installa:
        print("Dipendenze installate. Il bot e' pronto per l'avvio.")
        return 0
    with socket.socket() as probe:
        if os.name == "nt":
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        else:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", args.porta))
        except OSError as error:
            alternative = args.porta + 1 if args.porta < 65535 else 3000
            raise RuntimeError(f"Porta {args.porta} gia' occupata. Chiudi l'altro avvio oppure usa --porta {alternative}.") from error
    url = f"http://127.0.0.1:{args.porta}"
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("a", encoding="utf-8") as logfile:
        logfile.write("\n=== Avvio Operazione Silenzio ===\n")
        logfile.flush()
        process = subprocess.Popen(
            [str(PYTHON), str(Path(__file__).resolve()), "--server", "--porta", str(args.porta)],
            cwd=ROOT, env=dict(os.environ, PYTHONUTF8="1", PYTHONUNBUFFERED="1"),
            stdout=logfile, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        try:
            print("Avvio di A.N.I.M.A. (nessun indice da preparare)...", flush=True)
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"Avvio del backend non riuscito. Dettagli: {LOG}")
                try:
                    if json.loads(read_url(url + "/api/health")).get("backend", {}).get("ready"):
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.3)
            else:
                raise RuntimeError(f"Backend non pronto dopo 180 secondi. Dettagli: {LOG}")
            count = smoke_check(url)
            print(f"\nA.N.I.M.A. pronta: {count} documenti leggibili dai tool (nessun indice).", flush=True)
            print(f"Interfaccia e backend: {url}", flush=True)
            if args.verifica:
                print("VERIFICA SUPERATA: frontend, API e archivio funzionanti.", flush=True)
                return 0
            print("Lascia aperta questa finestra. Premi Ctrl+C per fermare il bot.", flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return process.wait()
        except KeyboardInterrupt:
            print("\nArresto del bot...", flush=True)
            return 0
        finally:
            stop(process)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"\nERRORE: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
