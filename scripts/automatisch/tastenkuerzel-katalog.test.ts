// Sichert den gemeinsamen Katalog und seine Menü- und Handler-Verbraucher.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { leseMenuQuellen, sammleRustMenuIds } from '@/../scripts/werkzeuge/menuQuellenLesen';
import { HAMBURGER_MENU_STRUKTUR, type MenuKnoten } from '@/lib/plattform/menu/menu.index';
import {
  parseTastenkuerzel,
  reservierteTastenkuerzel,
  tastenkuerzelFamilie,
  tastenkuerzelKatalog,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';

// Nur die Anzeigeeinträge haben voneinander getrennte lokale Geltungsbereiche.
function lokaleKontexte(eintrag: (typeof tastenkuerzelKatalog)[number]): string[] {
  if (eintrag.bereich === 'hilfsfenster') return [eintrag.thema];
  if (eintrag.bereich !== 'overlay') return [''];
  if (eintrag.thema !== 'Alle Overlays') return [eintrag.thema];
  return [
    ...new Set(tastenkuerzelKatalog.filter((e) => e.bereich === 'overlay').map((e) => e.thema)),
  ];
}

it('enthält eindeutige IDs, parsebare Formate und keine Doppelbelegung im selben Bereich', () => {
  const ids = new Set<string>();
  const belegungen = new Set<string>();
  for (const eintrag of tastenkuerzelKatalog) {
    expect(ids.has(eintrag.id), eintrag.id).toBe(false);
    ids.add(eintrag.id);
    for (const accelerator of tastenkuerzelFamilie(eintrag.accelerator)) {
      const parsed = parseTastenkuerzel(accelerator);
      const kontexte = lokaleKontexte(eintrag);
      for (const kontext of kontexte) {
        const schluessel = `${eintrag.bereich}:${kontext}:${JSON.stringify(parsed)}`;
        expect(belegungen.has(schluessel), schluessel).toBe(false);
        belegungen.add(schluessel);
      }
    }
  }
  for (const taste of ['X', 'C', 'V', 'A', 'M', 'Q', 'H']) {
    expect(
      tastenkuerzelKatalog.some(
        (e) => e.bereich === 'system' && e.accelerator === `CmdOrCtrl+${taste}`,
      ),
    ).toBe(true);
  }
  // Z/Shift+Z sind bereits durch die Markierungsaktionen reserviert.
  expect(
    tastenkuerzelKatalog.filter((e) => /CmdOrCtrl\+(Shift\+)?Z$/.test(e.accelerator)),
  ).toHaveLength(2);
});

it('verknüpft alle nativen Menü-Kürzel mit dem Katalog ohne Accelerator-Literale', () => {
  const rust = leseMenuQuellen();
  expect(rust).not.toMatch(/Some\("CmdOrCtrl\+/);
  const menueEintraege = [
    ...rust.matchAll(/with_id\(\s*handle,\s*(?:\/\/[^\n]*\n\s*)*"([a-z0-9-]+)"([\s\S]*?)\)\?;/g),
  ];
  for (const eintrag of tastenkuerzelKatalog.filter((e) => e.menue)) {
    const menueEintrag = menueEintraege.find((treffer) => treffer[1] === eintrag.id);
    expect(menueEintrag, eintrag.id).toBeDefined();
    expect(menueEintrag![2], eintrag.id).toContain(`accelerator("${eintrag.id}")`);
  }
});

it('findet auch native Menü-IDs ohne Tastenkürzel vollständig im Dropdown-Menü', () => {
  function blattIds(knoten: MenuKnoten[]): string[] {
    return knoten.flatMap((eintrag) => {
      if (eintrag.trennstrich) return [];
      return eintrag.kinder ? blattIds(eintrag.kinder) : [eintrag.id];
    });
  }
  expect([...sammleRustMenuIds(leseMenuQuellen())].sort()).toEqual(
    blattIds(HAMBURGER_MENU_STRUKTUR).sort(),
  );
});

it('bezieht jedes Windows/Linux-Menü-Kürzel ohne Literale aus dem Katalog', () => {
  const quelle = readFileSync('src/lib/plattform/menu/menuStruktur.ts', 'utf8');
  expect(quelle).not.toMatch(/accelerator:\s*['"]/);
  function pruefe(knoten: MenuKnoten[]) {
    for (const eintrag of knoten) {
      if (eintrag.trennstrich) continue;
      if (eintrag.kinder) pruefe(eintrag.kinder);
      if (eintrag.accelerator) {
        const katalogEintrag = tastenkuerzelKatalog.find((e) => e.id === eintrag.id);
        expect(katalogEintrag, eintrag.id).toBeDefined();
        expect(eintrag.accelerator, eintrag.id).toBe(katalogEintrag!.accelerator);
      }
    }
  }
  pruefe(HAMBURGER_MENU_STRUKTUR);
});

it('belegt bekannte Systemtasten ausschließlich im Systembereich', () => {
  const systemtasten = new Set(['x', 'c', 'v', 'a', 'm', 'q', 'h']);
  for (const eintrag of tastenkuerzelKatalog.filter((e) => e.bereich !== 'system')) {
    for (const accelerator of tastenkuerzelFamilie(eintrag.accelerator)) {
      const parsed = parseTastenkuerzel(accelerator);
      const kollidiert =
        parsed.primaer === 'CmdOrCtrl' &&
        !parsed.shift &&
        !parsed.alt &&
        systemtasten.has(parsed.taste);
      expect(kollidiert, eintrag.id).toBe(false);
    }
  }
});

it('ordnet jedem J-Eintrag genau eine Aktion und jeder Aktion einen J-Eintrag zu', () => {
  const handler = readFileSync('src/hooks/eingabe/useTastenkuerzel.ts', 'utf8');
  const zuordnung = handler.match(
    /const tastenkuerzelAktionen[\s\S]*?= \{([\s\S]*?)\n {4}\};/,
  )![1]!;
  const aktionsIds = [...zuordnung.matchAll(/^ {6}'?([a-z-]+)'?:/gm)].map((m) => m[1]);
  // Neues Fenster ist J; der Handler schließt macOS und unbekannte Plattformen aus.
  const ausnahmen: string[] = [];
  expect(new Set(aktionsIds).size).toBe(aktionsIds.length);
  expect(aktionsIds.sort()).toEqual(
    tastenkuerzelKatalog
      .filter((e) => e.behandlung === 'J' && !ausnahmen.includes(e.id))
      .map((e) => e.id)
      .sort(),
  );
  expect(handler).not.toMatch(/match:|e\.key|e\.code/);
});

it('bestimmt die Einführungs-Erlaubnis über Katalog-IDs', () => {
  const helper = readFileSync('src/hooks/eingabe/useTastenkuerzel.helpers.ts', 'utf8');
  const erlaubnis = helper.slice(
    helper.indexOf('export function istTastenkuerzelWaehrendEinfuehrungErlaubt'),
    helper.indexOf('// Speziellere Tastenkürzel'),
  );
  expect(erlaubnis).toContain('findeTastenkuerzel');
  expect(erlaubnis).not.toMatch(/toLowerCase\(\) === '[gs]'/);
});

it('führt die Navigation im Gesetztext einschließlich aller neuen Pfeilbelegungen', () => {
  const erwarteteTasten = [
    'ArrowUp',
    'ArrowDown',
    'Alt+ArrowUp',
    'Alt+ArrowDown',
    'CmdOrCtrl+ArrowUp',
    'CmdOrCtrl+ArrowDown',
    'ArrowLeft',
    'Shift+ArrowLeft',
    'ArrowRight',
    'Shift+ArrowRight',
    'CmdOrCtrl+ArrowLeft',
    'CmdOrCtrl+ArrowRight',
  ];
  for (const accelerator of erwarteteTasten) {
    expect(
      tastenkuerzelKatalog.find((e) => e.bereich === 'gesetztext' && e.accelerator === accelerator),
    ).toMatchObject({ behandlung: 'A', menue: false });
  }
});

it('reserviert die Navigationsmodifier einschließlich Verlauf auf beiden Plattformen', () => {
  const { tasten } = reservierteTastenkuerzel();
  for (const taste of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright']) {
    for (const modifier of ['alt', 'meta', 'ctrl'] as const) {
      expect(tasten).toContainEqual({
        taste,
        meta: modifier === 'meta',
        ctrl: modifier === 'ctrl',
        alt: modifier === 'alt',
        shift: false,
      });
    }
  }
  for (const taste of ['arrowleft', 'arrowright']) {
    expect(tasten).toContainEqual({ taste, meta: false, ctrl: false, alt: false, shift: true });
  }
});

it('führt Overlay- und Hilfsfensterkürzel nur als Anzeige und reserviert sie nicht', () => {
  const { tasten, codes } = reservierteTastenkuerzel();
  for (const eintrag of tastenkuerzelKatalog.filter((e) =>
    ['overlay', 'hilfsfenster'].includes(e.bereich),
  )) {
    expect(eintrag).toMatchObject({ behandlung: 'A', menue: false, physisch: false });
  }
  for (const taste of ['enter', ' ']) {
    expect(tasten.some((e) => e.taste === taste)).toBe(false);
  }
  expect(codes.some((e) => ['Enter', 'Space'].includes(e.code))).toBe(false);
});

it('zeigt jedes native Katalog-Menükürzel auch im Windows/Linux-Menü', () => {
  function sammle(knoten: MenuKnoten[]): MenuKnoten[] {
    return knoten.flatMap((eintrag) =>
      !eintrag.trennstrich && eintrag.kinder ? [eintrag, ...sammle(eintrag.kinder)] : [eintrag],
    );
  }
  const menue = sammle(HAMBURGER_MENU_STRUKTUR);
  for (const eintrag of tastenkuerzelKatalog.filter((e) => e.menue)) {
    expect(
      menue.find((e) => e.id === eintrag.id),
      eintrag.id,
    ).toMatchObject({
      accelerator: eintrag.accelerator,
    });
  }
});

it.each(tastenkuerzelKatalog.filter((e) => ['global', 'gesetztext', 'system'].includes(e.bereich)))(
  'reserviert sämtliche Kombinationen mit Modifier von $id',
  (eintrag) => {
    const { tasten, codes } = reservierteTastenkuerzel();
    for (const accelerator of tastenkuerzelFamilie(eintrag.accelerator)) {
      const { taste, primaer, shift, alt } = parseTastenkuerzel(accelerator);
      if (![primaer, shift, alt].some(Boolean)) continue;
      const primaerVarianten = primaer === 'CmdOrCtrl' ? ['meta', 'Ctrl'] : [primaer];
      for (const variante of primaerVarianten) {
        const modifier = {
          meta: variante === 'meta',
          ctrl: variante === 'Ctrl',
          shift,
          alt,
        };
        if (eintrag.physisch) {
          const code = /^\d$/.test(taste) ? `Digit${taste}` : `Key${taste.toUpperCase()}`;
          expect(codes, accelerator).toContainEqual({ code, ...modifier });
        } else {
          expect(tasten, accelerator).toContainEqual({ taste, ...modifier });
        }
      }
    }
  },
);
