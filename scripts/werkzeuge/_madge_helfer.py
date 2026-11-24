"""
_madge_helfer.py

Gemeinsam genutzter madge-Wrapper für die Analyse-Skripte
(architektur-analyse.py, modul-analyse.py). Liefert den rohen
Datei->Abhängigkeiten-Graphen als dict (Pfade relativ zum analysierten
--src-Wurzelverzeichnis).
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path


def run_madge_json(src: str, extensions: str, ts_config: str) -> dict:
    # Wichtig: NICHT stdout ueber eine Pipe einsammeln (capture_output=True).
    # Manche npx/madge-Versionen mischen Fortschritts- oder Install-Meldungen
    # mit \r-Steuerzeichen in stdout -- das kann den JSON-Text zerreissen.
    # Stattdessen wie bei `... --json > datei` in eine echte Datei schreiben.
    cmd = [
        "npx", "--yes", "madge", src,
        "--extensions", extensions,
        "--ts-config", ts_config,
        "--json",
    ]
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        result = subprocess.run(cmd, stdout=tmp, stderr=subprocess.PIPE, text=True)

    raw = tmp_path.read_text(errors="replace")
    tmp_path.unlink(missing_ok=True)

    if result.returncode != 0 and not raw.strip():
        print("madge (json) fehlgeschlagen:", result.stderr, file=sys.stderr)
        sys.exit(1)

    # Robust parsen: falls doch noch Text vor/nach dem eigentlichen JSON steht
    # (z.B. npm-Hinweise), ab der ersten '{' decodieren und den Rest ignorieren.
    start = raw.find("{")
    if start == -1:
        print("Konnte kein JSON in der madge-Ausgabe finden. Rohausgabe:", file=sys.stderr)
        print(raw[:2000], file=sys.stderr)
        sys.exit(1)
    try:
        data, _ = json.JSONDecoder().raw_decode(raw[start:])
    except json.JSONDecodeError as e:
        debug_path = Path("madge-debug-output.json")
        debug_path.write_text(raw)
        print(f"madge-JSON konnte nicht geparst werden ({e}).", file=sys.stderr)
        print(f"Rohausgabe wurde zur Fehlersuche gespeichert unter: {debug_path}", file=sys.stderr)
        sys.exit(1)
    return data


def run_madge_circular(src: str, extensions: str, ts_config: str) -> str:
    cmd = [
        "npx", "--yes", "madge", src,
        "--extensions", extensions,
        "--ts-config", ts_config,
        "--circular",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # madge gibt exit code 1 zurueck, wenn es Zyklen findet -- das ist kein Fehler hier
    return result.stdout or result.stderr
