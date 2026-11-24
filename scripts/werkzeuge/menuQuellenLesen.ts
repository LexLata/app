// Liest die Rust-Menüquellen für Katalogprüfung und manuellen ID-Abgleich.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Liest menu.rs und alle Dateien in menu/ (Rust-Modulordner). Jedes in menu.rs
// mit `mod x;` deklarierte Submodul muss als menu/x.rs vorliegen.
export function leseMenuQuellen(verzeichnis = 'src-tauri/src'): string {
  // Die Hauptdatei muss auch bei leerem oder unvollständigem Verzeichnis existieren.
  const hauptquelle = readFileSync(join(verzeichnis, 'menu.rs'), 'utf8');
  const unterordner = join(verzeichnis, 'menu');
  const dateien = existsSync(unterordner)
    ? readdirSync(unterordner)
        .filter((name) => name.endsWith('.rs'))
        .sort()
    : [];
  for (const treffer of hauptquelle.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) {
    if (!dateien.includes(`${treffer[1]!}.rs`)) {
      throw new Error(`Menüdatei fehlt: menu/${treffer[1]!}.rs`);
    }
  }
  const quellen = dateien.map((name) => readFileSync(join(unterordner, name), 'utf8'));
  return [hauptquelle, ...quellen].join('\n');
}

export function sammleRustMenuIds(quelle: string): Set<string> {
  return new Set(
    [...quelle.matchAll(/with_id\(\s*handle,\s*(?:\/\/[^\n]*\n\s*)*"([a-z0-9-]+)"/g)].map(
      (treffer) => treffer[1]!,
    ),
  );
}
