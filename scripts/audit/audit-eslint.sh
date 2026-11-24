#!/usr/bin/env bash
# Ein ESLint-Bestandsbericht einschließlich aller Textanzeige-Ausnahmen und Startfehler.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

bericht=".reports/eslint.txt"
mkdir -p .reports || exit 1
out=$(node scripts/audit/audit-eslint.mjs 2>&1); ec=$?
# Reservierter Befundstatus darf einen stummen Startabbruch nicht verdecken.
if [ "$ec" -eq 3 ] && ! printf '%s\n' "$out" | grep -Fxq 'Sonstige ESLint-Befunde bleiben beratend.'; then
  out="${out:-ESLint hat keine Konsolenausgabe erzeugt.}
ESLint hat Exit-Code 3 ohne Befundnachweis erzeugt."
  ec=2
fi
{
  printf 'ESLint Exit-Code %s\n\n' "$ec"
  printf '%s\n' "${out:-ESLint hat keine Konsolenausgabe erzeugt.}"
} >"$bericht" || exit 1
if [ "$ec" -ne 0 ]; then
  echo "⚠️  ESLint — Funde oder Prüfungsfehler in $bericht"
else
  echo "✅ ESLint — Ausnahmenbericht in $bericht"
fi
exit "$ec"
