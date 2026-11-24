#!/usr/bin/env bash
# scripts/automatisch/rust-appdata-guard.sh
#
# Pendant zur TS-Regel "tauri-path-nur-in-pfadhelfern" in
# scripts/automatisch/dependency-cruiser.cjs, nur für die Rust-Seite: local_data_dir(),
# app_data_dir() und BaseDirectory::AppData dürfen ausschließlich innerhalb
# von app_daten_basis_pfad() in lib.rs verwendet werden (siehe Kommentar dort
# – app_data_dir() würde den Ordner nach dem Identifier "org.lexlata" statt
# "LexLata" benennen).
#
# dependency-cruiser selbst kann das nicht prüfen (nur JS/TS) – daher ein
# einfacher, grep-basierter Guard statt eines vollen Rust-Lint-Tools.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

TREFFER=$(grep -rn --include="*.rs" -E "app_data_dir\(|BaseDirectory::AppData|\.local_data_dir\(" src-tauri/src 2>/dev/null \
  | grep -v "^src-tauri/src/lib\.rs:")

if [ -n "$TREFFER" ]; then
  echo "❌ AppData-Pfadauflösung außerhalb von app_daten_basis_pfad() in lib.rs gefunden:"
  echo "$TREFFER"
  echo ""
  echo "   Bitte stattdessen app_daten_basis_pfad(&app) aus lib.rs verwenden/erweitern,"
  echo "   statt lokal erneut lokal_data_dir()/app_data_dir()/BaseDirectory::AppData aufzurufen."
  exit 1
fi

echo "✅ AppData-Pfadauflösung (Rust): nur in lib.rs (Wrapper)."
exit 0
