// menuIdsAbgleichen.ts
//
// MANUELL aufzurufen (kein automatischer CI-/tsc-Schritt, siehe Absprache):
//
//   npx tsx scripts/werkzeuge/menuIdsAbgleichen.ts
//
// Prüft NUR die ID-MENGE (nicht Labels/Tastenkürzel/Reihenfolge!) zwischen den
// beiden separat gegliederten Menü-Definitionen:
//   - src/lib/plattform/menu/menuStruktur.ts (Dropdown, Windows/Linux + Mac-Test)
//   - src-tauri/src/menu.rs und menu/*.rs (native macOS-Menübar)
// Die Menügliederung und Labels werden von Hand gepflegt. Tastenkürzel
// lesen beide Menüs aus dem gemeinsamen Katalog; dessen Konsistenz wird
// automatisch in scripts/automatisch/tastenkuerzel-katalog.test.ts geprüft.
//
// Rust wird hier NICHT geparst (kein Rust-Parser vorhanden/nötig) – nur
// simpler Text-Abgleich der with_id(handle, "…")-Literale. Das erkennt
// zuverlässig HINZUGEFÜGTE/ENTFERNTE/UMBENANNTE IDs, prüft aber nicht, ob
// Labels inhaltlich übereinstimmen – das bleibt Handarbeit.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseMenuQuellen, sammleRustMenuIds } from './menuQuellenLesen';
import { HAMBURGER_MENU_STRUKTUR, type MenuKnoten } from '@/lib/plattform/menu/menu.index';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sammleLeafIds(knoten: MenuKnoten[], ziel: Set<string>): void {
  for (const eintrag of knoten) {
    if (eintrag.trennstrich) continue;
    if (eintrag.kinder) {
      sammleLeafIds(eintrag.kinder, ziel);
      continue;
    }
    ziel.add(eintrag.id);
  }
}

const dropdownIds = new Set<string>();
sammleLeafIds(HAMBURGER_MENU_STRUKTUR, dropdownIds);
const rustIds = sammleRustMenuIds(leseMenuQuellen(join(__dirname, '..', '..', 'src-tauri', 'src')));

const nurImDropdown = [...dropdownIds].filter((id) => !rustIds.has(id)).sort();
const nurInRust = [...rustIds].filter((id) => !dropdownIds.has(id)).sort();

if (nurImDropdown.length === 0 && nurInRust.length === 0) {
  console.log(`✔ ${dropdownIds.size} IDs stimmen zwischen menuStruktur.ts und menu.rs überein.`);
  process.exit(0);
}

if (nurImDropdown.length > 0) {
  console.error('IDs nur in menuStruktur.ts (fehlen in menu.rs):');
  for (const id of nurImDropdown) console.error(`  - ${id}`);
}
if (nurInRust.length > 0) {
  console.error('IDs nur in menu.rs (fehlen in menuStruktur.ts):');
  for (const id of nurInRust) console.error(`  - ${id}`);
}
process.exit(1);
