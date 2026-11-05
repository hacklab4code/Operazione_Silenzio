#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "$ROOT/.venv/bin/python" ]] && "$ROOT/.venv/bin/python" -c 'import sys; sys.exit(sys.version_info < (3, 11, 5))' 2>/dev/null; then
  exec "$ROOT/.venv/bin/python" "$ROOT/avvia.py" "$@"
fi
for candidate in python3.12 python3.13 python3.11 python3.14 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11, 5))' 2>/dev/null; then
    exec "$candidate" "$ROOT/avvia.py" "$@"
  fi
done
echo "Serve Python 3.11.5 o successivo. Installa Python 3.12 e riprova."
echo "Su Linux, se manca venv, installa anche il pacchetto python3-venv."
exit 1
