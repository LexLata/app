// gesetzeskurzbefehlSpeicher.test.ts
//
// Erste Testrunde (siehe Chatverlauf) deckte nur die ursprünglich gemeldeten
// 7 Survivors ab. Ein erneuter Mutation-Testing-Lauf zeigte danach 90 NEUE
// Survivors: die Round-Trip-Tests sorgten zwar für Code-COVERAGE (jetzt fast
// überall ausgeführt), prüften die Ergebnisse aber nicht präzise genug, um
// einzelne Feld-Vertauschungen, Grenzfälle der Parsing-Regexe oder die exakte
// XML-Struktur zu bemerken. Diese Fassung schließt gezielt jede der 90
// gemeldeten Lücken (siehe Kommentare je Testgruppe, mit "MUTATIONSTEST:"
// markiert, wo der Bezug zu einem konkreten Survivor nicht aus dem
// Testnamen selbst hervorgeht).

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import * as kern from '@/lib/persistenz/kern/kern.index';
import { erzeugeSperreAttrappe } from '@/test/plattform/dateiSperreAttrappe';
const sperreAttrappe = erzeugeSperreAttrappe();
const sperreMock = vi.fn(sperreAttrappe);

const appDatenSpeicher = new Map<string, string>();
const appDatenLesenGeschuetzt =
  vi.fn<(pfad: string, wurzelTag: string, token?: string) => Promise<string | null>>();
let plattform: 'macos' | 'windows' | 'linux' = 'macos';

vi.mock('@/lib/plattform/tauriHelpers', () => ({
  holePlattform: vi.fn(() => Promise.resolve(plattform)),
}));

// Externe Datei- und native Archivierungsgrenzen für den echten Bereinigungsweg.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenLesen: async (pfad: string) => appDatenSpeicher.get(pfad) ?? '',
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
  appDatenLesenOhneHinweis: async (pfad: string) => appDatenSpeicher.get(pfad) ?? '',
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: { relativerPfad: string; erwarteterInhalt: string }) => {
    if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
    if (befehl === 'datei_sperre_freigeben') return;
    if (befehl !== 'archiviere_beschaedigte_datei') throw new Error(befehl);
    appDatenSpeicher.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
    appDatenSpeicher.delete(args.relativerPfad);
    return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
  },
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  meldePersistenzBefund: vi.fn(),
  mitDateiSperre: (...args: Parameters<typeof sperreAttrappe>) => sperreMock(...args),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  sicherstelleOrdner: vi.fn(() => Promise.resolve()),
  appDatenLesenGeschuetzt: (...args: [string, string, string?]) => appDatenLesenGeschuetzt(...args),
  appDatenLesenOderNull: vi.fn((pfad: string) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  ),
  nutzerdatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string) => {
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
}));

import {
  setzeReservierteTastenkuerzel,
  setzeReservierteTastenkuerzelCodes,
  gesetzeskurzbefehlVonEvent,
  gesetzeskurzbefehlAlsText,
  ladeAlleGesetzeskurzbefehle,
  speichereGesetzeskurzbefehl,
  loescheGesetzeskurzbefehl,
  zusammenfuehrenGesetzeskurzbefehle,
  leseGesetzeskurzbefehleRohtext,
  ersetzeGesetzeskurzbefehleDatei,
  findeGesetzFuerEvent,
} from './gesetzeskurzbefehlSpeicher';
import type { Gesetzeskurzbefehl } from './gesetzeskurzbefehlSpeicher';

function kurzbefehl(
  overrides: Partial<Gesetzeskurzbefehl> & { taste: string },
): Gesetzeskurzbefehl {
  return { meta: false, ctrl: false, shift: false, alt: false, ...overrides };
}

beforeEach(() => {
  appDatenSpeicher.clear();
  sperreMock.mockClear();
  vi.mocked(kern.appDatenLoeschen).mockClear();
  vi.mocked(kern.nutzerdatenSchreiben).mockClear();
  appDatenLesenGeschuetzt.mockReset();
  appDatenLesenGeschuetzt.mockImplementation((pfad) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  );
  plattform = 'macos';
  setzeReservierteTastenkuerzel([]);
  setzeReservierteTastenkuerzelCodes([]);
});

// ---------------------------------------------------------------------------
// DATEINAME
// ---------------------------------------------------------------------------

const DATEINAME = 'einstellungen/gesetzeskurzbefehle.xml';
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));

describe('DATEINAME', () => {
  it('MUTATIONSTEST: schreibt unter dem stabilen Pfad "einstellungen/gesetzeskurzbefehle.xml" (Persistenz-Vertrag)', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect([...appDatenSpeicher.keys()]).toEqual(['einstellungen/gesetzeskurzbefehle.xml']);
  });
});

// ---------------------------------------------------------------------------
// findeGesetzFuerEvent
// ---------------------------------------------------------------------------

describe('findeGesetzFuerEvent', () => {
  const alle: Record<string, Gesetzeskurzbefehl> = {
    g1: kurzbefehl({ taste: 'e', meta: true }),
  };

  function event(overrides: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
    return {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent;
  }

  it('findet das Gesetz bei exakt passendem Gesetzeskurzbefehl', () => {
    expect(findeGesetzFuerEvent(event({ key: 'e', metaKey: true }), alle)).toBe('g1');
  });

  it('gibt null zurück, wenn kein Gesetzeskurzbefehl passt', () => {
    expect(findeGesetzFuerEvent(event({ key: 'x' }), alle)).toBeNull();
  });

  it('MUTATIONSTEST: property – weicht GENAU EIN Modifier-Flag vom gespeicherten Gesetzeskurzbefehl ab, gibt es KEIN Match', () => {
    const gespeichert = kurzbefehl({
      taste: 'e',
      meta: true,
      ctrl: false,
      shift: true,
      alt: false,
    });
    const daten: Record<string, Gesetzeskurzbefehl> = { g1: gespeichert };

    fc.assert(
      fc.property(
        fc.constantFrom<'meta' | 'ctrl' | 'shift' | 'alt'>('meta', 'ctrl', 'shift', 'alt'),
        (abweichendesFeld) => {
          const e = event({
            key: 'e',
            metaKey: gespeichert.meta,
            ctrlKey: gespeichert.ctrl,
            shiftKey: gespeichert.shift,
            altKey: gespeichert.alt,
          });
          const feldZuEventKey = {
            meta: 'metaKey',
            ctrl: 'ctrlKey',
            shift: 'shiftKey',
            alt: 'altKey',
          } as const;
          const eventKey = feldZuEventKey[abweichendesFeld];
          const eAbweichend = { ...e, [eventKey]: !e[eventKey] };
          expect(findeGesetzFuerEvent(eAbweichend, daten)).toBeNull();
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// gesetzeskurzbefehlGleich (mutants 19/21/23/25: meta/ctrl/shift/alt-Vergleich -> true).
// Privat, daher indirekt über die "doppelt"-Erkennung von speichereGesetzeskurzbefehl
// geprüft.
// ---------------------------------------------------------------------------

describe('gesetzeskurzbefehlGleich (via speichereGesetzeskurzbefehl "doppelt"-Erkennung)', () => {
  it('gibt "doppelt" zurück, wenn ein ANDERES Gesetz bereits genau diesen Gesetzeskurzbefehl hat', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'ZPO' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect(ergebnis).toBe('doppelt');
  });

  it('erlaubt es, denselben Gesetzeskurzbefehl für DASSELBE Gesetz erneut zu speichern (kein Selbst-Konflikt)', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect(ergebnis).toBe('ok');
  });

  it('MUTATIONSTEST: property – weicht GENAU EIN Feld (taste/meta/ctrl/shift/alt) vom Gesetzeskurzbefehl eines ANDEREN Gesetzes ab, ist es NICHT "doppelt"', async () => {
    const bestehend = kurzbefehl({ taste: 'e', meta: true, ctrl: false, shift: true, alt: false });
    await speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), bestehend);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'taste' | 'meta' | 'ctrl' | 'shift' | 'alt'>(
          'taste',
          'meta',
          'ctrl',
          'shift',
          'alt',
        ),
        async (feld) => {
          const kandidat: Gesetzeskurzbefehl = {
            ...bestehend,
            [feld]: feld === 'taste' ? 'x' : !bestehend[feld],
          } as Gesetzeskurzbefehl;
          const ergebnis = await speichereGesetzeskurzbefehl(
            gesetzesreferenz({ kurztitel: 'ZPO' }),
            kandidat,
          );
          expect(ergebnis).not.toBe('doppelt');
          if (ergebnis === 'ok')
            await loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'ZPO' }));
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// gesetzeskurzbefehlVonEvent - ignorierte reine Modifier-Tasten
// (mutants 33/34/35/36/37: je ein Wort in der Ignorierliste -> "")
// ---------------------------------------------------------------------------

describe('gesetzeskurzbefehlVonEvent - ignoriert reine Modifier-Tasten', () => {
  it.each(['meta', 'control', 'shift', 'alt', 'os', 'super'])(
    'e.key="%s" (bereits über toLowerCase normalisiert) -> null',
    (wort) => {
      expect(
        gesetzeskurzbefehlVonEvent({
          key: wort,
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        }),
      ).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// gesetzeskurzbefehlVonEvent - ⌥-Code-Ableitung: Guard + Regex-Grenzen
// (mutants 51/53/54/56/57/62)
// ---------------------------------------------------------------------------

describe('gesetzeskurzbefehlVonEvent - ⌥-Code-Ableitung (Regex-Grenzen)', () => {
  it('altKey=false: e.code wird NICHT herangezogen, selbst wenn gesetzt', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'x',
      code: 'KeyS',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
    expect(result?.taste).toBe('x');
  });

  it('altKey=true, aber e.code NICHT gesetzt: kein Crash, taste bleibt e.key.toLowerCase()', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'ß',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('ß');
  });

  it('MUTATIONSTEST: altKey=true, e.code passt WEDER auf das Buchstaben- noch auf das Ziffer-Muster -> taste bleibt unverändert (Fallback-Pfad, deckt den ziffer-Guard ab)', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'ArrowUp',
      code: 'ArrowUp',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('arrowup');
  });

  it('MUTATIONSTEST: Buchstaben-Regex ist am ANFANG verankert - "XKeyS" darf nicht matchen', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'ß',
      code: 'XKeyS',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('ß');
  });

  it('MUTATIONSTEST: Buchstaben-Regex ist am ENDE verankert - "KeySX" darf nicht matchen', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'ß',
      code: 'KeySX',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('ß');
  });

  it('MUTATIONSTEST: Ziffer-Regex ist am ANFANG verankert - "XDigit3" darf nicht matchen', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: '§',
      code: 'XDigit3',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('§');
  });

  it('MUTATIONSTEST: Ziffer-Regex ist am ENDE verankert - "Digit3X" darf nicht matchen', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: '§',
      code: 'Digit3X',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('§');
  });

  it('leitet bei ⌥-Kombinationen die physische Taste aus e.code ab (macOS-Sonderzeichen-Problem, z. B. ⌥S -> "ß")', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'ß',
      code: 'KeyS',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('s');
  });

  it('leitet bei ⌥+Ziffer ebenfalls über e.code ab', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: '§',
      code: 'Digit3',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    });
    expect(result?.taste).toBe('3');
  });
});

describe('gesetzeskurzbefehlVonEvent - Grundverhalten', () => {
  it('erzeugt einen Gesetzeskurzbefehl aus einem einfachen ⌘-Gesetzeskurzbefehl', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'E',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
    expect(result).toEqual({ taste: 'e', meta: true, ctrl: false, shift: false, alt: false });
  });

  it('gibt null zurück, wenn KEIN Modifier gedrückt ist (reine Tastatureingabe)', () => {
    const result = gesetzeskurzbefehlVonEvent({
      key: 'e',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// gesetzeskurzbefehlAlsText (mutants 67/80-87/95-132: Modifier-Präfix + jede Sondertaste)
// ---------------------------------------------------------------------------

describe('gesetzeskurzbefehlAlsText', () => {
  it('baut das Symbol-Präfix in fester Reihenfolge ⌘⌃⌥⇧ vor der Taste', () => {
    expect(
      gesetzeskurzbefehlAlsText(
        kurzbefehl({ taste: 'e', meta: true, ctrl: true, shift: true, alt: true }),
      ),
    ).toBe('⌘⌃⌥⇧E');
  });

  it('MUTATIONSTEST: fügt KEIN ⌘-Symbol hinzu, wenn meta=false', () => {
    expect(gesetzeskurzbefehlAlsText(kurzbefehl({ taste: 'e', meta: false }))).toBe('E');
  });

  it.each([
    [' ', 'Space'],
    ['\u00a0', 'Space'],
    ['tab', 'Tab'],
    ['escape', 'Esc'],
    ['enter', '↵'],
    ['backspace', '⌫'],
    ['delete', '⌦'],
    ['arrowup', '↑'],
    ['arrowdown', '↓'],
    ['arrowleft', '←'],
    ['arrowright', '→'],
  ])('MUTATIONSTEST: taste=%j -> Symbol %s', (taste, erwartet) => {
    expect(gesetzeskurzbefehlAlsText(kurzbefehl({ taste, meta: true }))).toBe(`⌘${erwartet}`);
  });
});

// ---------------------------------------------------------------------------
// istTastenkuerzelReserviert / code-basierte Zusatzliste (mutants 142/145/147-164)
// ---------------------------------------------------------------------------

describe('istTastenkuerzelReserviert - code-basierte Zusatzliste (via speichereGesetzeskurzbefehl)', () => {
  it('gibt "reserviert" zurück, wenn der Gesetzeskurzbefehl nur über die code-basierte Zusatzliste (⌥-Tastenkürzel) reserviert ist', async () => {
    setzeReservierteTastenkuerzelCodes([
      { code: 'KeyS', meta: false, ctrl: false, shift: false, alt: true },
    ]);
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 's', alt: true }),
      'KeyS',
    );
    expect(ergebnis).toBe('reserviert');
  });

  it('MUTATIONSTEST: leere code-Liste + gesetzter code-Parameter -> NICHT reserviert (kein Vacuous-Truth-Bug bei .some vs .every auf leerem Array)', async () => {
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 's', alt: true }),
      'KeyS',
    );
    expect(ergebnis).toBe('ok');
  });

  it('MUTATIONSTEST: code-Parameter ist leerer String (falsy) -> code-Liste wird gar nicht erst geprüft, selbst wenn ein (unrealistischer) Eintrag mit code="" vorhanden wäre', async () => {
    setzeReservierteTastenkuerzelCodes([
      { code: '', meta: false, ctrl: false, shift: false, alt: false },
    ]);
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e' }),
      '',
    );
    expect(ergebnis).toBe('ok');
  });

  it('MUTATIONSTEST: property – weicht GENAU EIN Feld (code/meta/ctrl/shift/alt) von einem Eintrag der code-Liste ab, ist es NICHT reserviert', async () => {
    const reserviert = { code: 'KeyS', meta: false, ctrl: false, shift: false, alt: true };
    setzeReservierteTastenkuerzelCodes([reserviert]);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'code' | 'meta' | 'ctrl' | 'shift' | 'alt'>(
          'code',
          'meta',
          'ctrl',
          'shift',
          'alt',
        ),
        async (feld) => {
          const angefragt = {
            ...reserviert,
            [feld]:
              feld === 'code' ? 'KeyX' : !reserviert[feld as 'meta' | 'ctrl' | 'shift' | 'alt'],
          };
          const k = kurzbefehl({
            taste: 's',
            meta: angefragt.meta,
            ctrl: angefragt.ctrl,
            shift: angefragt.shift,
            alt: angefragt.alt,
          });
          const ergebnis = await speichereGesetzeskurzbefehl(
            gesetzesreferenz({ kurztitel: 'BGB' }),
            k,
            angefragt.code,
          );
          expect(ergebnis).not.toBe('reserviert');
          if (ergebnis === 'ok')
            await loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
        },
      ),
    );
  });
});

describe('istTastenkuerzelReserviert - e.key-basierte Liste + Plattform-Übersetzung + Löschen (Grundfunktionen)', () => {
  it('liefert bei null vom geschützten Lader ein leeres Objekt', async () => {
    expect(await ladeAlleGesetzeskurzbefehle()).toEqual({});
    expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
      DATEINAME,
      'gesetzeskurzbefehle',
      undefined,
    );
  });

  it('propagiert einen Fehler des geschützten Laders', async () => {
    const fehler = new Error('Datei nicht lesbar');
    appDatenLesenGeschuetzt.mockRejectedValueOnce(fehler);

    await expect(ladeAlleGesetzeskurzbefehle()).rejects.toThrow(fehler);
  });

  it('liest xmlOverride beim Zusammenführen ohne geschützten Lader', async () => {
    await zusammenfuehrenGesetzeskurzbefehle(kurzbefehlDateiRoh('BGB', 'b'));

    expect(appDatenLesenGeschuetzt).toHaveBeenCalledTimes(1);
  });

  it('speichert ⌘E auf macOS und liest es auf Windows/Linux korrekt als Strg+E zurück (primaer/sekundaer-Mapping)', async () => {
    plattform = 'macos';
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect(ergebnis).toBe('ok');

    plattform = 'windows';
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]).toEqual({
      taste: 'e',
      meta: false,
      ctrl: true,
      shift: false,
      alt: false,
    });
  });

  it('speichert Strg+E auf Windows und liest es auf macOS korrekt als ⌘E zurück', async () => {
    plattform = 'windows';
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', ctrl: true }),
    );
    expect(ergebnis).toBe('ok');

    plattform = 'macos';
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]).toEqual({
      taste: 'e',
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });

  it('gibt "reserviert" zurück und speichert NICHT, wenn der Gesetzeskurzbefehl in der App reserviert ist', async () => {
    setzeReservierteTastenkuerzel([kurzbefehl({ taste: 'e', meta: true })]);
    const ergebnis = await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect(ergebnis).toBe('reserviert');
    expect(await ladeAlleGesetzeskurzbefehle()).toEqual({});
  });

  it('loescheGesetzeskurzbefehl entfernt genau den Eintrag des übergebenen Gesetzes', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'ZPO' }),
      kurzbefehl({ taste: 'z', meta: true }),
    );
    await loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(Object.keys(alle)).toEqual([
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' })),
    ]);
  });

  it('MUTATIONSTEST: löscht die Datei (statt leerer XML), wenn der letzte Kurzbefehl entfernt wird', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    );
    expect(appDatenSpeicher.has(DATEINAME)).toBe(true);
    await loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(appDatenSpeicher.has(DATEINAME)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// baueXML - exakte Roh-XML-Struktur (mutants 182/183/185-193 sowie 1/2 für
// jetzt()/geaendert, da hier miterfasst)
// ---------------------------------------------------------------------------

describe('baueXML (Roh-XML-Struktur, über den nutzerdatenSchreiben-Mock beobachtet)', () => {
  it('MUTATIONSTEST: schreibt die vollständige, exakt erwartete XML-Struktur inkl. Tags, Einrückung und Zeilenumbrüchen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T10:00:00.000Z'));
    try {
      await speichereGesetzeskurzbefehl(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        kurzbefehl({ taste: 'e', meta: true }),
      );
    } finally {
      vi.useRealTimers();
    }
    const geschrieben = appDatenSpeicher.get(DATEINAME);
    expect(geschrieben).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gesetzeskurzbefehle version="1">',
        '    <infos>',
        '        <verarbeitungszeit>2026-05-19T10:00:00Z</verarbeitungszeit>',
        '    </infos>',
        '    <inhalt>',
        '        <gesetzeskurzbefehl>',
        '            <gesetz normgeber="de-bund">BGB</gesetz>',
        '            <taste primaer="true">e</taste>',
        '        </gesetzeskurzbefehl>',
        '    </inhalt>',
        '</gesetzeskurzbefehle>',
      ].join('\n'),
    );
  });

  it('MUTATIONSTEST: trennt ZWEI <gesetzeskurzbefehl>-Blöcke korrekt durch einen Zeilenumbruch (äußerer join zwischen den Einträgen)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T10:00:00.000Z'));
    try {
      await speichereGesetzeskurzbefehl(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        kurzbefehl({ taste: 'e', meta: true }),
      );
      await speichereGesetzeskurzbefehl(
        gesetzesreferenz({ kurztitel: 'ZPO' }),
        kurzbefehl({ taste: 'z', meta: true }),
      );
    } finally {
      vi.useRealTimers();
    }
    const geschrieben = appDatenSpeicher.get(DATEINAME);
    expect(geschrieben).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gesetzeskurzbefehle version="1">',
        '    <infos>',
        '        <verarbeitungszeit>2026-05-19T10:00:00Z</verarbeitungszeit>',
        '    </infos>',
        '    <inhalt>',
        '        <gesetzeskurzbefehl>',
        '            <gesetz normgeber="de-bund">BGB</gesetz>',
        '            <taste primaer="true">e</taste>',
        '        </gesetzeskurzbefehl>',
        '        <gesetzeskurzbefehl>',
        '            <gesetz normgeber="de-bund">ZPO</gesetz>',
        '            <taste primaer="true">z</taste>',
        '        </gesetzeskurzbefehl>',
        '    </inhalt>',
        '</gesetzeskurzbefehle>',
      ].join('\n'),
    );
  });
});

// ---------------------------------------------------------------------------
// ladeDateiEintraege - Guard (mutants 214-224) + Regex-Quantor (204) +
// trim()/Boolean-Vergleich (226-247). Guard-Tests laufen über
// zusammenfuehrenGesetzeskurzbefehle (nimmt rohes XML direkt entgegen).
// ---------------------------------------------------------------------------

type PflichtFeld = 'gesetz' | 'taste';

function kurzbefehlBlock(gesetzAngabe: string, fehlendesFeld?: PflichtFeld): string {
  const tags: Record<PflichtFeld, string> = {
    gesetz: `<gesetz normgeber="de-bund">${gesetzAngabe}</gesetz>`,
    taste: '<taste primaer="true">z</taste>',
  };
  const inhalt = (Object.keys(tags) as PflichtFeld[])
    .filter((feld) => feld !== fehlendesFeld)
    .map((feld) => tags[feld])
    .join('');
  return `<gesetzeskurzbefehl>${inhalt}</gesetzeskurzbefehl>`;
}

describe('ladeDateiEintraege - Guard: fehlendes Pflicht-Tag darf nachfolgende Blöcke NICHT mit sich reißen', () => {
  const pflichtFelder: PflichtFeld[] = ['gesetz', 'taste'];

  it.each(pflichtFelder)(
    'MUTATIONSTEST: ein Block ohne <%s>-Tag wird übersprungen, ein nachfolgender wohlgeformter Block bleibt erhalten',
    async (fehlendesFeld) => {
      const kaputterBlock = kurzbefehlBlock('MALFORMED', fehlendesFeld);
      const gutBlock = kurzbefehlBlock('ZPO');
      await zusammenfuehrenGesetzeskurzbefehle(
        `<gesetzeskurzbefehle><inhalt>${kaputterBlock + gutBlock}</inhalt></gesetzeskurzbefehle>`,
      );
      expect(appDatenSpeicher.get(DATEINAME)).toContain('ZPO');
      expect(appDatenSpeicher.get(DATEINAME)).not.toContain('MALFORMED');
    },
  );
});

describe('ladeDateiEintraege - Regex-Quantor auf <taste> ([^<]* statt [^<])', () => {
  it('MUTATIONSTEST: rundet auch mehrzeichige taste-Werte (z. B. "tab") korrekt, nicht nur Einzelzeichen', async () => {
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'tab', meta: true }),
    );
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]?.taste).toBe(
      'tab',
    );
  });
});

describe('ladeDateiEintraege - trim() und Boolean-Vergleich je Feld', () => {
  it('MUTATIONSTEST: trimmt Whitespace um gesetz und liest alle vier wahren Modifier-Attribute', async () => {
    appDatenSpeicher.set(
      DATEINAME,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gesetzeskurzbefehle><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt>',
        '<gesetzeskurzbefehl>',
        '<gesetz normgeber="de-bund"> BGB </gesetz>',
        '<taste primaer="true" sekundaer="true" shift="true" alt="true">e</taste>',
        '</gesetzeskurzbefehl>',
        '</inhalt></gesetzeskurzbefehle>',
      ].join('\n'),
    );
    plattform = 'macos';
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(Object.keys(alle)).toEqual([
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
    ]);
    // macOS: meta=primaer, ctrl=sekundaer. Alle vier Felder auf true geprüft,
    // damit keiner der vier "immer false"-Mutanten unbemerkt bleibt.
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]).toEqual({
      taste: 'e',
      meta: true,
      ctrl: true,
      shift: true,
      alt: true,
    });
  });

  it('MUTATIONSTEST: interpretiert "false" korrekt als false (nicht "immer true", speziell für primaer)', async () => {
    appDatenSpeicher.set(
      DATEINAME,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gesetzeskurzbefehle><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt>',
        '<gesetzeskurzbefehl>',
        '<gesetz normgeber="de-bund">ZPO</gesetz>',
        '<taste>z</taste>',
        '</gesetzeskurzbefehl>',
        '</inhalt></gesetzeskurzbefehle>',
      ].join('\n'),
    );
    plattform = 'macos';
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' }))]).toEqual({
      taste: 'z',
      meta: false,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });
});

// ---------------------------------------------------------------------------
// zusammenfuehrenGesetzeskurzbefehle - Merge-Logik, Default-Parameter, No-Op
// (mutants 279/281/282/284/291; ergänzend leseGesetzeskurzbefehleRohtext/
// ersetzeGesetzeskurzbefehleDatei, bisher ganz ohne Coverage)
// ---------------------------------------------------------------------------

async function schreibeRohXML(gesetzAngabe: string, taste: string) {
  appDatenSpeicher.set(
    DATEINAME,
    `<gesetzeskurzbefehle><inhalt>${kurzbefehlBlockRoh(gesetzAngabe, taste)}</inhalt></gesetzeskurzbefehle>`,
  );
}

function kurzbefehlBlockRoh(gesetzAngabe: string, taste: string): string {
  return [
    '<gesetzeskurzbefehl>',
    `<gesetz normgeber="de-bund">${gesetzAngabe}</gesetz>`,
    `<taste primaer="true">${taste}</taste>`,
    '</gesetzeskurzbefehl>',
  ].join('');
}

describe('zusammenfuehrenGesetzeskurzbefehle', () => {
  it('MUTATIONSTEST: übernimmt einen im Bestand noch fehlenden Gesetz-Eintrag (bestehende Einträge bleiben dabei erhalten)', async () => {
    await schreibeRohXML('BGB', 'e');
    await zusammenfuehrenGesetzeskurzbefehle(kurzbefehlDateiRoh('ZPO', 'z'));
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(Object.keys(alle).sort()).toEqual([
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' })),
    ]);
  });

  it('MUTATIONSTEST: bei Konflikt bleibt standardmäßig (ohne dritten Parameter) der BESTEHENDE Eintrag erhalten (Default von behalteBestehendeBeiKonflikt ist true)', async () => {
    await schreibeRohXML('BGB', 'e');
    await zusammenfuehrenGesetzeskurzbefehle(kurzbefehlDateiRoh('BGB', 'x'));
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]?.taste).toBe(
      'e',
    );
  });

  it('bei Konflikt mit behalteBestehendeBeiKonflikt=false gewinnt der IMPORTIERTE Eintrag', async () => {
    await schreibeRohXML('BGB', 'e');
    await zusammenfuehrenGesetzeskurzbefehle(kurzbefehlDateiRoh('BGB', 'x'), false);
    const alle = await ladeAlleGesetzeskurzbefehle();
    expect(alle[gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]?.taste).toBe(
      'x',
    );
  });

  it('MUTATIONSTEST: ändert sich nichts (Import bringt nur bereits vorhandene Einträge, die per Default erhalten bleiben), wird NICHT geschrieben', async () => {
    await schreibeRohXML('BGB', 'e');
    const schreibAufrufeVorher = appDatenSpeicher.get(DATEINAME);
    await zusammenfuehrenGesetzeskurzbefehle(kurzbefehlDateiRoh('BGB', 'x')); // Default: bestehende gewinnt -> kein echter Change
    expect(appDatenSpeicher.get(DATEINAME)).toBe(schreibAufrufeVorher);
  });
});

describe('leseGesetzeskurzbefehleRohtext', () => {
  it('gibt den rohen XML-Text zurück, wenn die Datei existiert', async () => {
    appDatenSpeicher.set(DATEINAME, '<gesetzeskurzbefehle>roh</gesetzeskurzbefehle>');
    expect(await leseGesetzeskurzbefehleRohtext()).toBe(
      '<gesetzeskurzbefehle>roh</gesetzeskurzbefehle>',
    );
  });

  it('gibt null zurück, wenn keine Datei existiert', async () => {
    expect(await leseGesetzeskurzbefehleRohtext()).toBeNull();
  });
});

describe('ersetzeGesetzeskurzbefehleDatei', () => {
  it('schreibt importiertesXML unverändert (Datei-Import "Ersetzen")', async () => {
    await ersetzeGesetzeskurzbefehleDatei('<gesetzeskurzbefehle>ersetzt</gesetzeskurzbefehle>');
    expect(appDatenSpeicher.get(DATEINAME)).toBe(
      '<gesetzeskurzbefehle>ersetzt</gesetzeskurzbefehle>',
    );
  });
});

it('erhält beide gleichzeitig gestarteten Änderungen', async () => {
  appDatenLesenGeschuetzt.mockImplementation(async (pfad) => {
    const stand = appDatenSpeicher.get(pfad) ?? null;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return stand;
  });
  await Promise.all([
    speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      kurzbefehl({ taste: 'e', meta: true }),
    ),
    speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'ZPO' }),
      kurzbefehl({ taste: 'z', meta: true }),
    ),
  ]);
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle()).sort()).toEqual([
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' })),
  ]);
});

it.each([
  [
    'speichern',
    () =>
      speichereGesetzeskurzbefehl(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        kurzbefehl({ taste: 'e', meta: true }),
      ),
    true,
  ],
  ['löschen', () => loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' })), true],
  [
    'zusammenführen',
    () =>
      zusammenfuehrenGesetzeskurzbefehle(
        '<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste>e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
      ),
    true,
  ],
  ['ersetzen', () => ersetzeGesetzeskurzbefehleDatei('<gesetzeskurzbefehle/>'), false],
] as const)(
  'reicht beim %s den Token an alle Dateioperationen weiter',
  async (_name, aktion, liest) => {
    await aktion();
    expect(sperreMock).toHaveBeenCalledExactlyOnceWith(DATEINAME, expect.any(Function));
    if (liest)
      expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
        DATEINAME,
        expect.any(String),
        expect.stringMatching(/^test-token-/),
      );
    for (const aufruf of vi.mocked(kern.nutzerdatenSchreiben).mock.calls)
      expect(aufruf[2]).toMatch(/^test-token-/);
    for (const aufruf of vi.mocked(kern.appDatenLoeschen).mock.calls)
      expect(aufruf[1]).toMatch(/^test-token-/);
  },
);

it('reicht Fehler einer tokengebundenen Löschung durch', async () => {
  await speichereGesetzeskurzbefehl(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    kurzbefehl({ taste: 'e', meta: true }),
  );
  const fehler = new Error('Token ungültig');
  vi.mocked(kern.appDatenLoeschen).mockRejectedValueOnce(fehler);
  await expect(loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toBe(
    fehler,
  );
});

it('schreibt wohlgeformtes XML mit UTC-Verarbeitungszeit ohne Millisekunden', async () => {
  await speichereGesetzeskurzbefehl(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    kurzbefehl({ taste: 'e', meta: true }),
  );
  const xml = appDatenSpeicher.get(DATEINAME)!;
  pruefeXmlWohlgeformtheit(xml);
  expect(xml).toMatch(
    /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
  );
  expect(xml).not.toContain('<geaendert>');
});

it('erhält Sonderzeichen und wörtliche Entities beim Schreiben und Laden', async () => {
  const text = `&<>"' &amp; &lt;`;
  const wert = kurzbefehl({ taste: text, meta: true });
  expect(await speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: text }), wert)).toBe('ok');
  expect(() => pruefeXmlWohlgeformtheit(appDatenSpeicher.get(DATEINAME)!)).not.toThrow();
  expect(await ladeAlleGesetzeskurzbefehle()).toEqual({
    [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: text }))]: wert,
  });
});

it('liest nur direkte Einträge trotz Erweiterungen und Kommentaren', async () => {
  appDatenSpeicher.set(
    'einstellungen/gesetzeskurzbefehle.xml',
    '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl extra="ja"><gesetz x="y" normgeber="de-bund">BGB</gesetz><taste x="y" primaer="true">b</taste><neu/></gesetzeskurzbefehl><neu><gesetzeskurzbefehl><gesetz normgeber="de-bund">X</gesetz><taste primaer="true">x</taste></gesetzeskurzbefehl></neu><!-- <gesetzeskurzbefehl/> --></inhalt></gesetzeskurzbefehle>',
  );
  expect(await ladeAlleGesetzeskurzbefehle()).toEqual({
    [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]: {
      taste: 'b',
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    },
  });
});

function kurzbefehlDateiRoh(gesetzAngabe: string, taste: string) {
  return `<gesetzeskurzbefehle><inhalt>${kurzbefehlBlockRoh(gesetzAngabe, taste)}</inhalt></gesetzeskurzbefehle>`;
}

it('lehnt beschädigte XML vor dem Schreiben ab', async () => {
  await expect(
    zusammenfuehrenGesetzeskurzbefehle('<gesetzeskurzbefehle><inhalt></gesetzeskurzbefehle>'),
  ).rejects.toThrow('Datei ungültig');
  expect(kern.nutzerdatenSchreiben).not.toHaveBeenCalled();
});

it('verwendet vollständige normalisierte Gesetzesschlüssel beim Laden', async () => {
  await speichereGesetzeskurzbefehl(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    kurzbefehl({ taste: 'e', meta: true }),
  );
  expect(
    await speichereGesetzeskurzbefehl(
      gesetzesreferenz({ kurztitel: 'bgb' }),
      kurzbefehl({ taste: 'e', meta: true }),
    ),
  ).toBe('ok');
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual([
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'bgb' })),
  ]);
});

it('erhält namensgleiche Gesetzeskurzbefehle verschiedener Normgeber im XML-Rundlauf', async () => {
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'e', meta: true }),
  );
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bw' },
    kurzbefehl({ taste: 'z', meta: true }),
  );
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toHaveLength(2);
  expect(appDatenSpeicher.get('einstellungen/gesetzeskurzbefehle.xml')).toContain(
    '<gesetz normgeber="de-bund">BGB</gesetz>',
  );
});

it('liest Kurzbefehlreferenzen mit Erweiterungen und sichert ungültige Normgeber', async () => {
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'e', meta: true }),
  );
  const pfad = 'einstellungen/gesetzeskurzbefehle.xml';
  appDatenSpeicher.set(
    pfad,
    appDatenSpeicher
      .get(pfad)!
      .replace(
        '<gesetz normgeber="de-bund">BGB',
        '<gesetz extra="ja" normgeber="de-bund"><!--neu-->BGB',
      ),
  );
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual([
    gesetzesreferenzSchluessel({ kurztitel: 'BGB', normgeber: 'de-bund' }),
  ]);
  appDatenSpeicher.set(
    pfad,
    appDatenSpeicher.get(pfad)!.replace('normgeber="de-bund"', 'normgeber="A_B"'),
  );
  expect(await ladeAlleGesetzeskurzbefehle()).toEqual({});
  expect(appDatenSpeicher.get(pfad + '.bak')).toContain('A_B');
});

it('schreibt Modifier ausschließlich als wahre Attribute an taste', async () => {
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'b', meta: true, shift: true }),
  );
  const xml = appDatenSpeicher.get(DATEINAME)!;
  expect(xml).toContain('<taste primaer="true" shift="true">');
  expect(xml).not.toMatch(/<(primaer|sekundaer|shift|alt)>|="false"/);
});

it('liest Attribute und ignoriert alte Modifier-Tags sowie verschachtelte Einträge', async () => {
  appDatenSpeicher.set(
    DATEINAME,
    '<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl extra="x"><gesetz normgeber="de-sn">BGB</gesetz><taste primaer="true" alt="true" extra="x">e</taste><sekundaer>true</sekundaer><shift>true</shift></gesetzeskurzbefehl><neu><gesetzeskurzbefehl><gesetz normgeber="de-bund">X</gesetz><taste primaer="true">x</taste></gesetzeskurzbefehl></neu></inhalt></gesetzeskurzbefehle>',
  );
  expect(await ladeAlleGesetzeskurzbefehle()).toEqual({
    [gesetzesreferenzSchluessel({ kurztitel: 'BGB', normgeber: 'de-sn' })]: kurzbefehl({
      taste: 'e',
      meta: true,
      alt: true,
    }),
  });
});

it.each(['primaer', 'sekundaer', 'shift', 'alt'] as const)(
  'liest nur den exakten Attributwert true für %s',
  async (modifier) => {
    for (const wert of ['false', 'TRUE', ' true ', '1', '']) {
      appDatenSpeicher.set(
        DATEINAME,
        `<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste ${modifier}="${wert}">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>`,
      );
      expect(await ladeAlleGesetzeskurzbefehle()).toEqual({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]: kurzbefehl({
          taste: 'e',
        }),
      });
    }
  },
);

it('lädt gespeicherte Gesetzeskurzbefehle trotz neuer Katalogkollision unverändert', async () => {
  const gespeichert = kurzbefehl({ taste: 'd', meta: true });
  await speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), gespeichert);
  const { reservierteTastenkuerzel } =
    await import('@/lib/plattform/tastenkuerzel/tastenkuerzel.index');
  const reservierung = reservierteTastenkuerzel();
  setzeReservierteTastenkuerzel(reservierung.tasten);
  setzeReservierteTastenkuerzelCodes(reservierung.codes);
  expect(Object.values(await ladeAlleGesetzeskurzbefehle())).toContainEqual(gespeichert);
});

it('bereinigt Gesetzeskurzbefehle ohne Normgeber nach Vollsicherung', async () => {
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'b', meta: true }),
  );
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'GG', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'g', meta: true }),
  );
  const xml = appDatenSpeicher
    .get(DATEINAME)!
    .replace('<gesetz normgeber="de-bund">BGB', '<gesetz>BGB');
  appDatenSpeicher.set(DATEINAME, xml);
  const melden = vi.spyOn(kern, 'meldePersistenzBefund');
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual([
    gesetzesreferenzSchluessel({ kurztitel: 'GG', normgeber: 'de-bund' }),
  ]);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME)).not.toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
  melden.mockRestore();
});

// Gezielter Negativfall: alter Normgeberwert im gespeicherten Dokument.
it('sichert und entfernt den alten Normgeber Bund in Gesetzeskurzbefehlen', async () => {
  await speichereGesetzeskurzbefehl(
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    kurzbefehl({ taste: 'b', meta: true }),
  );
  const gespeichert = appDatenSpeicher.get(DATEINAME);
  expect(gespeichert).toBeDefined();
  if (gespeichert === undefined) throw new Error('Testdatei fehlt');
  const xml = gespeichert.replace('normgeber="de-bund"', 'normgeber="Bund"'); // normgeber-negativ: gezielte Ablehnung des alten Codeformats.
  appDatenSpeicher.set(DATEINAME, xml);
  expect(await ladeAlleGesetzeskurzbefehle()).toEqual({});
  expect(appDatenSpeicher.get(DATEINAME)).not.toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
});
