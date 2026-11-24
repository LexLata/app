// menuStruktur.test.ts
//
// HAMBURGER_MENU_STRUKTUR ist reine, von Hand gepflegte Daten (siehe
// Kopfkommentar der Produktionsdatei) – kein fast-check sinnvoll, da es
// keine Eingabe gibt, über die generiert werden könnte. Stattdessen prüfen
// diese Tests die strukturellen Invarianten, auf die sich hamburgerMenu.ts
// beim Rendern verlassen muss (siehe dort: "kinder" rendert als Submenu,
// "trennstrich" als Trennstrich, jeder andere Eintrag löst per ereignis/
// befehl etwas aus) – rekursiv über den gesamten Baum, plus eine gezielte
// Prüfung der bekannten Top-Level-Gliederung.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { leseMenuQuellen } from '@/../scripts/werkzeuge/menuQuellenLesen';
import { HAMBURGER_MENU_STRUKTUR, type MenuKnoten } from './menuStruktur';

function sammleAlleKnoten(knoten: MenuKnoten[]): MenuKnoten[] {
  const ergebnis: MenuKnoten[] = [];
  for (const k of knoten) {
    ergebnis.push(k);
    if (!k.trennstrich && k.kinder) ergebnis.push(...sammleAlleKnoten(k.kinder));
  }
  return ergebnis;
}

describe('HAMBURGER_MENU_STRUKTUR – Struktur-Invarianten', () => {
  it('ist nicht leer', () => {
    expect(HAMBURGER_MENU_STRUKTUR.length).toBeGreaterThan(0);
  });

  it('alle ids sind über den gesamten Baum eindeutig (React-Keys, ID-Abgleich mit menu.rs)', () => {
    const alleIds = sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR).map((k) => k.id);
    const eindeutig = new Set(alleIds);
    expect(eindeutig.size).toBe(alleIds.length);
  });

  it('Trennstriche haben ausschließlich trennstrich+id, keine weiteren Felder', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (!knoten.trennstrich) continue;
      expect(Object.keys(knoten).sort()).toEqual(['id', 'trennstrich']);
    }
  });

  it('normale Einträge haben ein nicht-leeres label', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (knoten.trennstrich) continue;
      expect(knoten.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('normale Einträge haben entweder kinder ODER (ereignis oder befehl), nie beides und nie keins (siehe Kommentar an "kinder" in menuStruktur.ts)', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (knoten.trennstrich) continue;
      const hatKinder = knoten.kinder !== undefined;
      const hatAktion = knoten.ereignis !== undefined || knoten.befehl !== undefined;
      expect(hatKinder !== hatAktion).toBe(true); // genau eines von beidem (XOR)
    }
  });

  it('kein Eintrag hat sowohl ereignis als auch befehl gleichzeitig gesetzt', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (knoten.trennstrich) continue;
      expect(knoten.ereignis !== undefined && knoten.befehl !== undefined).toBe(false);
    }
  });

  it('kinder-Arrays sind nie leer (ein leeres Submenu wäre sinnlos)', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (!knoten.trennstrich && knoten.kinder) {
        expect(knoten.kinder.length).toBeGreaterThan(0);
      }
    }
  });

  it('ein Trennstrich steht nie als erster oder letzter Eintrag innerhalb einer Ebene (sinnlos ohne Nachbarn auf beiden Seiten)', () => {
    function pruefeEbene(knoten: MenuKnoten[]): void {
      if (knoten.length > 0) {
        expect(knoten[0]!.trennstrich).not.toBe(true);
        expect(knoten[knoten.length - 1]!.trennstrich).not.toBe(true);
      }
      for (const k of knoten) {
        if (!k.trennstrich && k.kinder) pruefeEbene(k.kinder);
      }
    }
    pruefeEbene(HAMBURGER_MENU_STRUKTUR);
  });

  it('zwei Trennstriche stehen nie direkt hintereinander innerhalb derselben Ebene', () => {
    function pruefeEbene(knoten: MenuKnoten[]): void {
      for (let i = 1; i < knoten.length; i++) {
        const vorher = knoten[i - 1]!.trennstrich === true;
        const jetzt = knoten[i]!.trennstrich === true;
        expect(vorher && jetzt).toBe(false);
      }
      for (const k of knoten) {
        if (!k.trennstrich && k.kinder) pruefeEbene(k.kinder);
      }
    }
    pruefeEbene(HAMBURGER_MENU_STRUKTUR);
  });

  it('accelerator ist, falls gesetzt, ein nicht-leerer String im "CmdOrCtrl+…"-Format (siehe Kopfkommentar)', () => {
    for (const knoten of sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR)) {
      if (knoten.trennstrich || knoten.accelerator === undefined) continue;
      expect(knoten.accelerator.length).toBeGreaterThan(0);
      expect(knoten.accelerator.startsWith('CmdOrCtrl+')).toBe(true);
    }
  });

  it('die acht bekannten Top-Level-Einträge sind in dieser Reihenfolge vorhanden', () => {
    expect(HAMBURGER_MENU_STRUKTUR.map((k) => k.id)).toEqual([
      'gesetzesuebersicht',
      'einstellungen',
      'fenster',
      'dateien',
      'navigation',
      'lesezeichen-favoriten',
      'markierungen',
      'hilfe',
    ]);
  });
});

it('bietet Tastenkürzel, Datenschutz, Über LexLata und die Updateprüfung nach der Einführung im Hilfemenü an', () => {
  const hilfe = HAMBURGER_MENU_STRUKTUR.find((k) => k.id === 'hilfe');
  expect(hilfe && !hilfe.trennstrich ? hilfe.kinder : undefined).toEqual([
    {
      id: 'einfuehrung-neu-starten',
      label: 'Einführung erneut durchführen',
      ereignis: 'einfuehrung-neu-starten-anfrage',
    },
    { id: 'tastenkuerzel', label: 'Tastenkürzel', ereignis: 'tastenkuerzel-oeffnen' },
    { id: 'datenschutz', label: 'Datenschutz', ereignis: 'datenschutz-oeffnen' },
    { id: 'ueber', label: 'Über LexLata', ereignis: 'ueber-oeffnen' },
    {
      id: 'nach-updates-suchen',
      label: 'Nach Updates suchen…',
      ereignis: 'nach-updates-suchen-anfrage',
    },
  ]);
  // Die macOS-Menüdefinition wird unter Linux nicht kompiliert: ihre Anbindung
  // zusätzlich prüfen; reale AppKit-Bedienung bleibt der Plattformabnahme vorbehalten.
  const rust = leseMenuQuellen();
  // Natives Menü gibt es nur unter macOS: dort steht „Über LexLata“ im App-Menü
  // statt im Hilfe-Menü (Windows/Linux: nur das Hamburger-Menü oben).
  expect(rust).toMatch(
    /"Hilfe",\s*true,\s*&\[\s*&einfuehrung_neu_starten_item,\s*&tastenkuerzel_item,\s*&datenschutz_item,\s*\]/,
  );
  expect(rust).toMatch(/"LexLata",\s*true,\s*&\[\s*&ueber_item,\s*&nach_updates_suchen_item,/);
  expect(rust).toMatch(
    /"nach-updates-suchen",\s*"Nach Updates suchen…",\s*true,\s*Some\(icon\("nach-updates-suchen"/,
  );
  expect(rust).toContain(
    'menu_item_registry.insert("nach-updates-suchen", nach_updates_suchen_item)',
  );
  expect(rust).toMatch(
    /"nach-updates-suchen" => \{\s*sende_an_menue_hauptfenster\(app_handle, "nach-updates-suchen-anfrage", \(\)\)/,
  );
  expect(rust).toContain('menu_item_registry.insert("ueber", ueber_item)');
  expect(rust).toContain('menu_item_registry.insert("datenschutz", datenschutz_item)');
  expect(rust).toMatch(
    /"datenschutz" => \{\s*sende_an_menue_hauptfenster\(app_handle, "datenschutz-oeffnen", \(\)\)/,
  );
});

it('zeigt die beschlossenen 24 Menü-Kürzel', () => {
  const kuerzel = Object.fromEntries(
    sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR).flatMap((k) =>
      !k.trennstrich && k.accelerator ? [[k.id, k.accelerator]] : [],
    ),
  );
  expect(kuerzel).toEqual({
    gesetzesuebersicht: 'CmdOrCtrl+Shift+O',
    einstellungen: 'CmdOrCtrl+,',
    'neues-fenster': 'CmdOrCtrl+N',
    'neuer-tab': 'CmdOrCtrl+T',
    'letzter-tab': 'CmdOrCtrl+Shift+T',
    'schliessen-tab': 'CmdOrCtrl+W',
    'fenster-schliessen': 'CmdOrCtrl+Shift+W',
    'gesetz-info': 'CmdOrCtrl+I',
    'dateien-importieren': 'CmdOrCtrl+Shift+I',
    'gesetze-aktualisieren': 'CmdOrCtrl+R',
    export: 'CmdOrCtrl+E',
    oeffnen: 'CmdOrCtrl+O',
    'volltext-suche': 'CmdOrCtrl+F',
    'volltext-alle': 'CmdOrCtrl+Shift+F',
    'verlauf-anzeigen': 'CmdOrCtrl+Y',
    'favorit-speichern': 'CmdOrCtrl+Shift+D',
    'lesezeichen-speichern': 'CmdOrCtrl+D',
    'alle-lesezeichen-entfernen': 'CmdOrCtrl+Shift+Alt+D',
    unterstreichen: 'CmdOrCtrl+U',
    hervorheben: 'CmdOrCtrl+Shift+U',
    verweismarkierung: 'CmdOrCtrl+K',
    kommentar: 'CmdOrCtrl+Shift+K',
    'markierung-rueckgaengig': 'CmdOrCtrl+Z',
    'markierung-wiederholen': 'CmdOrCtrl+Shift+Z',
  });
});

it('bindet die Tastenkürzel nativ an Hauptfenster und das Öffnungsereignis', () => {
  const rust = leseMenuQuellen();
  expect(rust).toContain('menu_item_registry.insert("tastenkuerzel", tastenkuerzel_item)');
  expect(rust).toMatch(
    /"tastenkuerzel" => \{\s*sende_an_menue_hauptfenster\(app_handle, "tastenkuerzel-oeffnen", \(\)\)/,
  );
  const sync = readFileSync('src-tauri/src/fenster/menu_sync.rs', 'utf8');
  expect(sync).toMatch(/const HAUPTFENSTER_ABHAENGIGE_IDS[^;]*"tastenkuerzel"/s);
});

it('behält Öffnen und Dateiimport ohne eigenständigen Internetimport', () => {
  const eintraege = sammleAlleKnoten(HAMBURGER_MENU_STRUKTUR).filter((k) => !k.trennstrich);
  expect(eintraege.map((k) => k.label)).not.toContain('Gesetze aus dem Internet laden');
  expect(eintraege).toContainEqual(expect.objectContaining({ id: 'oeffnen' }));
  expect(eintraege).toContainEqual(
    expect.objectContaining({ id: 'dateien-importieren', ereignis: 'dateien-importieren-anfrage' }),
  );
  const rust = leseMenuQuellen();
  expect(rust).not.toContain('Gesetze aus dem Internet laden');
  expect(rust).toContain('Dateien importieren…');
  expect(rust).toMatch(
    /"dateien-importieren" => \{\s*sende_an_menue_hauptfenster\(app_handle, "dateien-importieren-anfrage", \(\)\)/,
  );
  expect(readFileSync('src-tauri/src/fenster/menu_sync.rs', 'utf8')).toContain(
    '"dateien-importieren"',
  );
});
