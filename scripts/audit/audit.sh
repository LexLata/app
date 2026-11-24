#!/usr/bin/env bash
# scripts/audit/audit.sh
#
# Periodische Bestandsaufnahme über den GESAMTEN Code (nicht Teil des
# Pre-Commit-Hooks – dafür zu langsam / zu viele erwartbare Fehlalarme).
#
# Beim ersten Mal ausführbar machen: chmod +x scripts/audit/audit.sh
#
# Aufruf: npm run audit
#
# Terminal bleibt kompakt: eine Zeile pro Check (✅ sauber / ⚠️ Funde in
# Datei X / ⏭️ übersprungen). Funde selbst landen als einzelne, flache
# Dateien unter .reports/ (siehe .gitignore – nicht getrackt, wird
# bei jedem Lauf komplett neu geschrieben, nie mehrere Stände parallel).

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

AUDIT_DIR=".reports"
mkdir -p "$AUDIT_DIR"
find "$AUDIT_DIR" -maxdepth 1 -type f -delete

# Schreibt eine Ergebniszeile. $1=Label $2=Dateiname(ohne Pfad) $3=Inhalt
# (leer = sauber, kein Dateischreiben).
zeile() {
  local label="$1" datei="$2" inhalt="$3"
  if [ -z "$inhalt" ]; then
    echo "✅ $label"
  else
    printf '%s\n' "$inhalt" >"$AUDIT_DIR/$datei"
    local n
    n=$(printf '%s\n' "$inhalt" | wc -l | tr -d ' ')
    echo "⚠️  $label — Funde in $AUDIT_DIR/$datei ($n Zeilen)"
  fi
}

# Portable Timeout-Hilfe für netzwerkabhängige Befehle (npm audit/outdated,
# semgrep-Regel-Download) – bewusst ohne 'timeout'/'gtimeout', da auf
# Standard-macOS ohne Homebrew coreutils nicht vorhanden. Gibt Exit-Code
# per 'return' zurück (NICHT über eine globale Variable, die die durch
# $(...) erzeugte Subshell nicht überleben würde).
mit_timeout() {
  local sekunden="$1"; shift
  local tmpfile; tmpfile=$(mktemp)
  ("$@" >"$tmpfile" 2>&1) &
  local pid=$!
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    i=$((i + 1))
    if [ "$i" -ge "$sekunden" ]; then
      kill "$pid" 2>/dev/null
      echo "(Abgebrochen nach ${sekunden}s Timeout – vermutlich Netzwerk/Registry langsam oder nicht erreichbar)" >>"$tmpfile"
      break
    fi
  done
  wait "$pid" 2>/dev/null
  local ec=$?
  cat "$tmpfile"
  rm -f "$tmpfile"
  return "$ec"
}

echo "Bestandsaufnahme läuft (bei neuen Tools vorher 'npm install' nicht vergessen!)"
echo "— Details bei Funden unter $AUDIT_DIR/ …"
echo ""

# 1) tsc: exit code ist hier zuverlässig (0 = keine Typfehler)
out=$(npx --yes tsc --noEmit 2>&1); ec=$?
zeile "tsc --noEmit" "tsc.txt" "$([ $ec -ne 0 ] && echo "$out")"

# 2) ESLint: vollständiger Bestand; Startfehler und Warnungen im Bericht.
bash scripts/audit/audit-eslint.sh
eslint_status=$?
# Code 3 bezeichnet sonstige ESLint-Befunde; im Bestandsaudit weiter beratend.
if [ "$eslint_status" -eq 3 ]; then eslint_status=0; fi

# 2b) Vitest + Coverage: eigener Lauf (nicht der schon oben über ESLint
#     mitlaufende Code), da wir --coverage brauchen. Testfehlschläge zählen
#     als echter Fund; die Coverage-Zahl selbst ist rein informativ (kein
#     Gate), s. scripts/audit/coverage-zusammenfassung.mjs.
out=$(npx --yes vitest run --coverage 2>&1); ec=$?
if [ $ec -ne 0 ]; then
  zeile "Vitest (Tests)" "vitest.txt" "$out"
else
  echo "✅ Vitest (Tests)"
  node scripts/audit/coverage-zusammenfassung.mjs "$AUDIT_DIR/coverage.txt"
fi

# 3) dependency-cruiser: Architektur + Zyklen. Auch hier auf Inhalt prüfen
#    (unsere no-circular-Regel steht nun auf error, exit bleibt 0)
out=$(npx --yes dependency-cruiser src scripts --config scripts/automatisch/dependency-cruiser.cjs --output-type err 2>&1)
fund=$(echo "$out" | grep -v "no dependency violations found" | grep -i "violation" || true)
zeile "dependency-cruiser" "dependency-cruiser.txt" "$fund"

# 4) jscpd: Produktionscode und Tests getrennt auswerten, weil für beide
#    unterschiedliche Duplikationsmaßstäbe gelten. Die Statistik wird aus dem
#    JSON-Bericht gelesen statt aus der formatierten Konsolenausgabe. Scheitert
#    jscpd oder fehlt ein gültiger Bericht, darf das nicht als „keine Klone“
#    erscheinen – dann wird die Konsolenausgabe als Fehlerbericht abgelegt.
jscpd_lauf() {
  local label="$1" ziel_datei="$2"; shift 2
  local report="$AUDIT_DIR/jscpd-report.json"
  local fehler_datei="${ziel_datei%.json}-fehler.txt"
  local konsole ec statistik

  rm -f "$report"
  konsole=$(npx --yes jscpd src "$@" --min-lines 10 --min-tokens 50 \
    --reporters console,json --output "$AUDIT_DIR" --no-colors 2>&1)
  ec=$?

  if [ "$ec" -ne 0 ] || [ ! -f "$report" ]; then
    zeile "$label" "$fehler_datei" "${konsole:-jscpd hat keinen JSON-Bericht erzeugt.}"
    rm -f "$report"
    return
  fi

  statistik=$(node -e '
    const fs = require("node:fs");
    const bericht = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const gesamt = bericht?.statistics?.total;
    if (!gesamt || !Number.isFinite(gesamt.clones) || !Number.isFinite(gesamt.duplicatedLines) || !Number.isFinite(gesamt.percentage)) {
      process.exit(1);
    }
    process.stdout.write(`${gesamt.clones}|${gesamt.duplicatedLines}|${gesamt.percentage.toFixed(2)}`);
  ' "$report" 2>/dev/null)
  ec=$?

  if [ "$ec" -ne 0 ] || [ -z "$statistik" ]; then
    zeile "$label" "$fehler_datei" "jscpd hat einen unlesbaren JSON-Bericht erzeugt.\n\n$konsole"
    rm -f "$report"
    return
  fi

  local anzahl duplizierte_zeilen prozent
  IFS='|' read -r anzahl duplizierte_zeilen prozent <<<"$statistik"
  if [ "$anzahl" -gt 0 ]; then
    mv "$report" "$AUDIT_DIR/$ziel_datei"
    echo "⚠️  $label — $anzahl Klon(e), $duplizierte_zeilen Zeilen ($prozent %) in $AUDIT_DIR/$ziel_datei"
  else
    rm -f "$report"
    echo "✅ $label"
  fi
}

jscpd_lauf "jscpd (Produktionscode)" "jscpd-prod.json" --ignore "**/*.test.ts"
if [ -f "$AUDIT_DIR/jscpd-prod.json" ]; then
  out=$(node scripts/automatisch/jscpd-baseline.mjs "$AUDIT_DIR/jscpd-prod.json" 2>&1); ec=$?
  zeile "jscpd-Baseline (Produktionscode)" "jscpd-baseline-fehler.txt" "$([ $ec -ne 0 ] && echo "$out")"
else
  zeile "jscpd-Baseline (Produktionscode)" "jscpd-baseline-fehler.txt" "Kein Produktionsbericht zum Baseline-Abgleich vorhanden."
fi
jscpd_lauf "jscpd (Tests)" "jscpd-tests.json" --pattern "**/*.test.ts"

# 4b) modul-analyse: Deep-Modules-Bericht (schreibt selbst nach
#     .reports/modul-analyse.txt, per Default). Kein Vorab-Check auf
#     python3 – fehlt es, schlägt der Aufruf hart durch und landet wie jeder
#     andere Fund in $AUDIT_DIR, statt still übersprungen zu werden.
out=$(python3 scripts/audit/modul-analyse.py 2>&1); ec=$?
if [ $ec -ne 0 ]; then
  zeile "modul-analyse" "modul-analyse-fehler.txt" "$out"
else
  echo "✅ modul-analyse — Bericht in $AUDIT_DIR/modul-analyse.txt"
fi

# 5) knip: exit code zuverlässig (0 = keine Funde)
out=$(npx --yes knip --reporter compact 2>&1); ec=$?
zeile "knip" "knip.txt" "$([ $ec -ne 0 ] && echo "$out")"

# 5b) doppelte-dateinamen: exit code zuverlässig (0 = keine Funde). Rein
#     lokal (kein git-Netzwerkzugriff), daher hier statt bei den
#     Registry-Checks weiter unten.
out=$(node scripts/automatisch/doppelte-dateinamen.mjs 2>&1); ec=$?
zeile "doppelte-dateinamen" "doppelte-dateinamen.txt" "$([ $ec -ne 0 ] && echo "$out")"

# 6) npm audit: exit code zuverlässig (0 = keine bekannten Schwachstellen).
#    Netzwerkabhängig (Registry-Abfrage) → mit Timeout absichern.
echo "→ npm audit (Registry-Abfrage, kann etwas dauern)…"
out=$(mit_timeout 45 npm audit --json); ec=$?
zeile "npm audit" "npm-audit.json" "$([ $ec -ne 0 ] && echo "$out")"

# 7) npm outdated: exit code zuverlässig (1 = es gibt veraltete Pakete).
#    TypeScript 5.9.3 wird bis zur Kompatibilität der ESLint-Anbindung
#    mit TypeScript 7 bewusst auf diesem Stand gehalten.
#    Der Check gilt nur dann als sauber, wenn ausschließlich genau dieses
#    bekannte TypeScript-Update vorhanden ist.
echo "→ npm outdated (Registry-Abfrage für alle Pakete, kann spürbar dauern)…"
out=$(mit_timeout 45 env LC_ALL=C npm --no-color outdated)
ec=$?

if [ "$ec" -eq 0 ]; then
  zeile "npm outdated" "npm-outdated.txt" ""
elif printf '%s\n' "$out" | awk '
  # Header überspringen
  /^Package[[:space:]]+Current[[:space:]]+Wanted[[:space:]]+Latest[[:space:]]+Location[[:space:]]+Depended by[[:space:]]*$/ {
    header = 1
    next
  }

  # Genau der bekannte TypeScript-Zustand
  header &&
  $1 == "typescript" &&
  $2 == "5.9.3" &&
  $3 == "5.9.3" &&
  $4 ~ /^7\./ &&
  $5 == "node_modules/typescript" &&
  ($6 == "LexLata" || $6 == "workspace") {
    typescript_found++
    next
  }

  # Jede andere nichtleere Paketzeile macht den Sonderfall ungültig.
  header && NF > 0 {
    other_package_found++
  }

  END {
    exit !(header && typescript_found == 1 && other_package_found == 0)
  }
'; then
  echo "✅ npm outdated — TypeScript 5.9.3 bis zur ESLint-Kompatibilität bewusst zurückgehalten"
else
  zeile "npm outdated" "npm-outdated.txt" "$out"
  echo "   → vor Updates einzeln 'npm view <paket>' prüfen (Alter/Downloads/Maintainer)"
fi

# 7b) lockfile-lint: exit code zuverlässig
out=$(npx --yes lockfile-lint --path package-lock.json --type npm --validate-https --allowed-hosts npm --validate-integrity 2>&1); ec=$?
zeile "lockfile-lint" "lockfile-lint.txt" "$([ $ec -ne 0 ] && echo "$out")"

# 8) semgrep: nur falls lokal installiert (brew install semgrep).
#    Lädt Regeln von semgrep.dev nach → mit Timeout absichern.
if command -v semgrep >/dev/null 2>&1; then
  echo "→ semgrep (lädt Regeln nach, kann etwas dauern)…"
  out=$(mit_timeout 60 semgrep --config p/typescript --config p/react --error --metrics off src); ec=$?
  zeile "semgrep" "semgrep.txt" "$([ $ec -ne 0 ] && echo "$out")"
else
  echo "⏭️  semgrep — nicht installiert (brew install semgrep), übersprungen"
fi

# 9) Rust-AppData-Guard: exit code zuverlässig
out=$(bash scripts/automatisch/rust-appdata-guard.sh 2>&1); ec=$?
zeile "Rust-AppData-Guard" "rust-appdata-guard.txt" "$([ $ec -ne 0 ] && echo "$out")"

# 10) Rust: Tests + clippy + audit, nur falls cargo vorhanden
if command -v cargo >/dev/null 2>&1; then
  out=$(cd src-tauri && cargo test 2>&1); ec=$?
  zeile "cargo test" "cargo-test.txt" "$([ $ec -ne 0 ] && echo "$out")"

  out=$(cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1); ec=$?
  zeile "cargo clippy" "cargo-clippy.txt" "$([ $ec -ne 0 ] && echo "$out")"

  if command -v cargo-audit >/dev/null 2>&1; then
    out=$(cd src-tauri && cargo audit 2>&1); ec=$?
    zeile "cargo audit" "cargo-audit.txt" "$([ $ec -ne 0 ] && echo "$out")"
  else
    echo "⏭️  cargo audit — nicht installiert (cargo install cargo-audit), übersprungen"
  fi
else
  echo "⏭️  cargo nicht gefunden — Rust-Checks übersprungen (lokal nachholen)"
fi

# Absolute Projektpfade in allen Audit-Reports verkürzen. Portabler
# In-Place-Edit ohne '-i ""'/'-i.bak'-Unterschied zwischen BSD-sed (macOS,
# Backup-Suffix zwingend als eigenes Argument) und GNU-sed (Linux, Suffix
# muss direkt an -i angehängt sein) – Backup-Datei wird sofort wieder
# gelöscht, sodass sich beide Varianten identisch verhalten.
PROJEKT_ROOT="$(pwd)/"

find "$AUDIT_DIR" -maxdepth 1 -type f -print0 | while IFS= read -r -d '' datei; do
  sed -i.bak "s|$PROJEKT_ROOT||g" "$datei"
  rm -f "$datei.bak"
done

echo ""
echo "Nicht CLI-automatisiert, bei Bedarf manuell ergänzen: SonarQube/SonarLint-Lauf,"
echo "falls eingerichtet."

# Schutz-/Ausnahme-/Konfigurationsfehler des gemeinsamen ESLint-Audits durchreichen.
exit "$eslint_status"
