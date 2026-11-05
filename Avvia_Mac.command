#!/usr/bin/env bash
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash "$ROOT/avvia_mac_linux.sh" "$@"
result=$?
if [[ "$result" -ne 0 ]]; then
  read -r -p "Premi Invio per chiudere..." _
fi
exit "$result"
