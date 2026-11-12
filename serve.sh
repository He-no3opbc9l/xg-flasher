#!/bin/sh
# Web Serial needs a secure context: serve over http://localhost (not file://).
# Release files (fw/) are added by the Pages workflow; to have them locally run once
#   python3 -I tools/pages_releases.py .     (creates ./fw, ignored by git)
cd "$(dirname "$0")" && exec python3 -m http.server "${1:-8000}" --bind 127.0.0.1
