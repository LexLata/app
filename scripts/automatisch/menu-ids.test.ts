// menu-ids.test.ts
// Sichert dieselben Menüpunkte und die vollständige Einordnung nativer Aktivierungsregeln.
import { readFileSync } from 'node:fs';
import { assert, expect, it } from 'vitest';
import { HAMBURGER_MENU_STRUKTUR, type MenuKnoten } from '@/lib/plattform/menu/menu.index';
import { leseMenuQuellen, sammleRustMenuIds } from '@/../scripts/werkzeuge/menuQuellenLesen';

function blattIds(knoten: MenuKnoten[]): string[] {
  return knoten.flatMap((eintrag) =>
    eintrag.trennstrich ? [] : eintrag.kinder ? blattIds(eintrag.kinder) : [eintrag.id],
  );
}
const regelquelle = readFileSync('src-tauri/src/fenster/menu_sync.rs', 'utf8');
function gruppe(name: string): string[] {
  const inhalt = regelquelle.match(
    new RegExp(`const ${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`),
  )?.[1];
  assert(inhalt, `Aktivierungsgruppe ${name} vorhanden`);
  return [...inhalt.replace(/\/\/[^\n]*/g, '').matchAll(/"([a-z0-9-]+)"/g)].map((m) => {
    assert(m[1]);
    return m[1];
  });
}
it('hält native und Hamburger-Menüpunkte identisch', () => {
  // Keine Ausnahmen: plattformeigene Standardpunkte haben keine eigenen App-IDs.
  expect([...sammleRustMenuIds(leseMenuQuellen())].sort()).toEqual(
    blattIds(HAMBURGER_MENU_STRUKTUR).sort(),
  );
});
it('definiert jeden nativen Punkt genau einmal, damit Titel und Registry eindeutig bleiben', () => {
  // Das native Menü (nur macOS) führt „Über LexLata“ im App-Menü, das Hamburger-
  // Menü im Hilfe-Untermenü; die ID-Menge bleibt dieselbe, Doppelungen sind ausgeschlossen.
  const ids = [
    ...leseMenuQuellen().matchAll(/with_id\(\s*handle,\s*(?:\/\/[^\n]*\n\s*)*"([a-z0-9-]+)"/g),
  ].map((m) => m[1]);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  expect(ids).toContain('ueber');
});
it('ordnet jeden nativen Punkt genau einer Aktivierungsgruppe zu', () => {
  const gruppen = [
    gruppe('HAUPTFENSTER_ABHAENGIGE_IDS'),
    gruppe('FENSTERLOKALE_IDS'),
    ['schliessen-tab', 'fenster-schliessen'], // Aktives bedienbares Fenster.
    ['letzter-tab'], // Gemeinsamer persistierter Stapel, gesonderte Synchronisierung.
    ['einstellungen', 'neues-fenster', 'neuer-tab', 'markierungskonflikte'], // Immer erreichbar; Einführungssperre bleibt separat.
  ];
  const eingeordnet = gruppen.flat();
  expect(new Set(eingeordnet).size).toBe(eingeordnet.length);
  expect(eingeordnet.sort()).toEqual([...sammleRustMenuIds(leseMenuQuellen())].sort());
});
