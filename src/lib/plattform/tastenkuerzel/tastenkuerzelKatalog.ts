// Liest den gemeinsamen Tastenkürzel-Katalog und leitet Accelerator und Reservierung ab.
// JSON: id (eindeutig), bezeichnung, bereich, thema, accelerator (Tauri-Format),
// menue (nativer Accelerator), physisch (e.code), behandlung (J: generisch, A: extern),
// bedingung (optionaler Anzeigetext). Familien verwenden A..Z, 0..9 oder 1..9 als Taste.
// Familien werden vor dem Parsen aufgefächert und niemals als native Accelerator verwendet.
import { formatTastenkuerzel } from '@/lib/plattform/tastenkuerzelFormat';
import katalogDaten from './tastenkuerzelKatalog.json';

interface TastenkuerzelEintrag {
  id: string;
  bezeichnung: string;
  bereich: 'global' | 'gesetztext' | 'overlay' | 'hilfsfenster' | 'system';
  thema: string;
  accelerator: string;
  menue: boolean;
  physisch: boolean;
  behandlung: 'J' | 'A';
  bedingung?: string;
}
interface Tastenkuerzel {
  taste: string;
  primaer: 'CmdOrCtrl' | 'Ctrl' | null;
  shift: boolean;
  alt: boolean;
}
const SONDERTASTEN: Record<string, string> = {
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  Tab: 'tab',
  Enter: 'enter',
  Escape: 'escape',
  Space: ' ',
  Delete: 'delete',
  Backspace: 'backspace',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Home: 'home',
  End: 'end',
};

export function parseTastenkuerzel(accelerator: string): Tastenkuerzel {
  const teile = accelerator.split('+');
  const taste = teile.pop()!;
  const modifier = new Set(teile);
  if (
    !(/^[A-Z0-9.,§]$/.test(taste) || Object.hasOwn(SONDERTASTEN, taste)) ||
    modifier.size !== teile.length ||
    teile.some((teil) => !['CmdOrCtrl', 'Ctrl', 'Shift', 'Alt'].includes(teil)) ||
    (modifier.has('CmdOrCtrl') && modifier.has('Ctrl'))
  ) {
    throw new Error(`Ungültiges Tastenkürzel: ${accelerator}`);
  }
  return {
    taste: SONDERTASTEN[taste] ?? taste.toLowerCase(),
    primaer: modifier.has('CmdOrCtrl') ? 'CmdOrCtrl' : modifier.has('Ctrl') ? 'Ctrl' : null,
    shift: modifier.has('Shift'),
    alt: modifier.has('Alt'),
  };
}

export function tastenkuerzelFamilie(accelerator: string): string[] {
  const familie = accelerator.match(/([A-Z0-9])\.\.([A-Z0-9])$/);
  if (!familie) return [accelerator];
  const start = familie[1]!.charCodeAt(0);
  const ende = familie[2]!.charCodeAt(0);
  if (!['A..Z', '0..9', '1..9'].includes(familie[0]))
    throw new Error(`Ungültige Tastenkürzelfamilie: ${accelerator}`);
  const praefix = accelerator.slice(0, -familie[0].length);
  return Array.from(
    { length: ende - start + 1 },
    (_, i) => praefix + String.fromCharCode(start + i),
  );
}

export const tastenkuerzelKatalog = katalogDaten as readonly TastenkuerzelEintrag[];

function reservierungsVarianten(accelerator: string) {
  const { taste, primaer, shift, alt } = parseTastenkuerzel(accelerator);
  if (!primaer && !shift && !alt) return [];
  const varianten =
    primaer === 'CmdOrCtrl'
      ? [
          { meta: true, ctrl: false },
          { meta: false, ctrl: true },
        ]
      : [{ meta: false, ctrl: primaer === 'Ctrl' }];
  return varianten.map((variante) => ({ taste, ...variante, shift, alt }));
}

function physischerCode(taste: string): string {
  if (!/^[a-z0-9]$/.test(taste))
    throw new Error(`Keine physische Buchstaben-/Zifferntaste: ${taste}`);
  return /^\d$/.test(taste) ? `Digit${taste}` : `Key${taste.toUpperCase()}`;
}

// Seitenleisten-Kürzel bleiben auch bei ausgeschalteter Einstellung reserviert,
// damit das spätere Einschalten keine Kollision mit Gesetzeskurzbefehlen erzeugt.
export function reservierteTastenkuerzel() {
  const tasten: Array<{
    taste: string;
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
  }> = [];
  const codes: Array<{ code: string; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> =
    [];
  for (const eintrag of tastenkuerzelKatalog) {
    if (!['global', 'gesetztext', 'system'].includes(eintrag.bereich)) continue;
    const varianten = tastenkuerzelFamilie(eintrag.accelerator).flatMap(reservierungsVarianten);
    for (const variante of varianten) {
      // Die bisherige Primär+Alt-Reservierung gilt auch ohne gelieferten e.code.
      if (!eintrag.physisch || variante.meta || variante.ctrl) tasten.push(variante);
      if (eintrag.physisch) {
        const { taste, ...modifier } = variante;
        codes.push({ code: physischerCode(taste), ...modifier });
      }
    }
  }
  return { tasten, codes };
}

type TastenkuerzelEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>;

// Einmal aus derselben Quelle abgeleitet; keine zusätzliche Zustandsquelle.
const katalogKombinationen = tastenkuerzelKatalog.flatMap((eintrag) =>
  tastenkuerzelFamilie(eintrag.accelerator).map((accelerator) => ({
    eintrag,
    kombination: parseTastenkuerzel(accelerator),
  })),
);

/** Liefert den ersten passenden Eintrag, bei Bedarf beschränkt auf bestimmte IDs. */
export function findeTastenkuerzel(e: TastenkuerzelEvent, ids?: readonly string[]) {
  return katalogKombinationen.find(({ eintrag, kombination }) => {
    if (ids && !ids.includes(eintrag.id)) return false;
    const primaerPasst =
      kombination.primaer === 'CmdOrCtrl'
        ? e.metaKey !== e.ctrlKey
        : kombination.primaer === 'Ctrl'
          ? e.ctrlKey && !e.metaKey
          : !e.metaKey && !e.ctrlKey;
    return (
      primaerPasst &&
      e.shiftKey === kombination.shift &&
      e.altKey === kombination.alt &&
      (eintrag.physisch
        ? e.code === physischerCode(kombination.taste)
        : e.key.toLowerCase() === kombination.taste)
    );
  })?.eintrag;
}

const ANZEIGE_SONDERTASTEN: Record<string, [string, string]> = {
  arrowup: ['↑', '↑'],
  arrowdown: ['↓', '↓'],
  arrowleft: ['←', '←'],
  arrowright: ['→', '→'],
  tab: ['Tab', 'Tab'],
  enter: ['↩', 'Enter'],
  escape: ['Esc', 'Esc'],
  ' ': ['Leertaste', 'Leertaste'],
  delete: ['⌦', 'Entf'],
  backspace: ['⌫', 'Rücktaste'],
  pageup: ['⇞', 'Bild↑'],
  pagedown: ['⇟', 'Bild↓'],
  home: ['↖', 'Pos1'],
  end: ['↘', 'Ende'],
};

/** Anzeige aus derselben Belegung; Familienindex entspricht der Reihenfolge im Accelerator. */
export function tastenkuerzelAnzeige(id: string, istMac: boolean, index?: number): string {
  const eintrag = tastenkuerzelKatalog.find((kandidat) => kandidat.id === id);
  if (!eintrag) throw new Error(`Unbekannte Tastenkürzel-ID: ${id}`);
  const familie = tastenkuerzelFamilie(eintrag.accelerator);
  const accelerator = familie[index ?? 0];
  if (!accelerator) throw new Error(`Ungültiger Familienindex für ${id}: ${index}`);
  const { taste, primaer, alt, shift } = parseTastenkuerzel(accelerator);
  const istFamilie = familie.length > 1;
  const kern = ANZEIGE_SONDERTASTEN[taste] ?? [
    istFamilie ? taste : taste.toUpperCase(),
    taste.toUpperCase(),
  ];
  let bereich =
    istFamilie && index === undefined
      ? eintrag.accelerator.split('+').at(-1)!.replace('..', '–')
      : undefined;
  if (!primaer && !alt && !shift) bereich = bereich?.toLowerCase();
  return formatTastenkuerzel(istMac, {
    meta: primaer === 'CmdOrCtrl',
    ctrl: primaer === 'Ctrl',
    alt,
    shift,
    taste: bereich ?? kern[0],
    tasteWinLinux: bereich ?? (istFamilie ? taste : kern[1]),
  });
}
