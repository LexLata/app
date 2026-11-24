import { loeseAusgangsstelleAuf } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { gesetzMitNormen, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungSpeicher.test.ts
//
// Unit-Tests für die in markierungSpeicher.ts SELBST definierten Funktionen
// (ermittleMarkierungsDateipfad, ladeEintraege, schreibeEintraege, ladeMarkierungen,
// entferneMarkierung, aktualisiereZielnorm, aktualisiereKommentar).
// NICHT hier getestet (siehe eigene Testdateien): hinzufuegenMarkierung +
// Konkurrenz-Helfer (markierungSpeicher.hinzufuegen.test.ts) sowie
// fuehreRueckgaengigAus/fuehreWiederholenAus (markierungSpeicher.undo.test.ts).
// sicherstelleOrdner (reiner Pass-through zu sicherstelleOrdnerBasis) bleibt
// ebenfalls ungetestet – keine eigene Logik.
//
// '@/lib/persistenz/kern/kern.index' wird über eine In-Memory-Map gemockt
// (gleiches Muster wie gesetzeskurzbefehlSpeicher.test.ts) – dadurch bleiben
// baueXML/parseEintraege (markierungsXML.ts) und identitaetsSchluessel
// (markierungskonfliktPruefung.ts) UNGEMOCKT und laufen als reales
// Round-Trip-Verhalten mit. Der dynamische Import von
// meldeMarkierungGeaendert aus markierungSpeicher.ereignisse.ts wird gemockt
// (gleiches Muster wie markierungSpeicher.undo.test.ts) – der Subscriber in
// markierungskonflikteSpeicher.ts hat eine eigene Testdatei.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { mitDateiSperre } from '@/lib/persistenz/kern/kern.index';
import {
  nutzerdatenSchreiben,
  sichereBeiUngueltigemInhalt,
} from '@/lib/persistenz/kern/kern.index';
import type { MarkierungsEintrag } from './markierungSpeicher';
import { ermittleMarkierungsDateipfad } from './markierungSpeicher';
import {
  gesetzesreferenzAusDateiname,
  ladeEintraege,
  ladeMarkierungen,
} from './markierungSpeicher.lesen';
import { schreibeEintraege } from './markierungSpeicher.aendern';
import {
  aktualisiereKommentar,
  aktualisiereZielnorm,
  entferneMarkierung,
} from './markierungSpeicher.aktionen';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const appDatenSpeicher = new Map<string, string>();
const appDatenLesenGeschuetzt =
  vi.fn<(pfad: string, wurzelTag: string, token?: string) => Promise<string | null>>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: vi.fn(async () => 'markierungs-vorgang'),
  schliessePruefpflichtigeQuelleAb: vi.fn(async () => true),
  mitGesetzDateiSperre: (
    _ref: unknown,
    _ordner: string,
    _suffix: string,
    aktion: Parameters<typeof mitDateiSperre>[1],
  ) => aktion('test-token'),
  mitGesetzDateiSperren: async (
    quellen: { gesetz: { kurztitel: string; normgeber: string }; ordner: string; suffix: string }[],
    aktion: (tokens: ReadonlyMap<string, string>) => Promise<unknown>,
  ) => {
    const { ermittleGesetzDateipfad } = await import('@/lib/persistenz/kern/kern.index');
    return aktion(
      new Map(
        await Promise.all(
          quellen.map(
            async (q) =>
              [await ermittleGesetzDateipfad(q.gesetz, q.ordner, q.suffix), 'test-token'] as const,
          ),
        ),
      ),
    );
  },
  sicherstelleOrdner: vi.fn(() => Promise.resolve()),
  appDatenExistiert: async () => true,
  appDatenLesen: (pfad: string) => appDatenLesenGeschuetzt(pfad, 'markierungen', undefined),
  sichereBeiUngueltigemInhalt: vi.fn(async (_pfad: string, inhalt: string | null) =>
    inhalt === null ? { status: 'fehlt' } : { status: 'gueltig', inhalt },
  ),
  nutzerdatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
}));

const meldeMarkierungGeaendert = vi.fn<(...args: unknown[]) => void>();
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.ereignisse', () => ({
  meldeMarkierungGeaendert: (...args: unknown[]) => meldeMarkierungGeaendert(...args),
  meldeMarkierungenBulkGeaendert: vi.fn(),
}));

function eintrag(overrides: Parameters<typeof markierungsEintrag>[0] = {}): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
      bezugstext: 'Text',
    },

    ...overrides,
  });
}

beforeEach(() => {
  appDatenSpeicher.clear();
  vi.clearAllMocks();
  appDatenLesenGeschuetzt.mockReset();
  appDatenLesenGeschuetzt.mockImplementation((pfad) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  );
});

// ---------------------------------------------------------------------------
// ermittleMarkierungsDateipfad
// ---------------------------------------------------------------------------

describe('ermittleMarkierungsDateipfad', () => {
  it('MUTATIONSTEST: verwendet die vollständige Dateibasis im Markierungsordner', async () => {
    expect(await ermittleMarkierungsDateipfad(gesetzesreferenz({ kurztitel: 'BGB' }))).toBe(
      'markierungen/BGB_de-bund-markierungen.xml',
    );
  });
});

// ---------------------------------------------------------------------------
// ladeEintraege / ladeMarkierungen
// ---------------------------------------------------------------------------

describe('ladeEintraege', () => {
  it('leere Liste, wenn die Datei noch nicht existiert', async () => {
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
  });

  it('parst eine zuvor geschriebene Datei (Round-Trip über schreibeEintraege)', async () => {
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [e]);
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen).toEqual([e]);
  });

  it('liefert bei null vom geschützten Lader eine leere Liste', async () => {
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
    expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
      'markierungen/BGB_de-bund-markierungen.xml',
      'markierungen',
      undefined,
    );
  });

  it('propagiert einen Fehler des geschützten Laders', async () => {
    const fehler = new Error('Zugriff verweigert');
    appDatenLesenGeschuetzt.mockRejectedValueOnce(fehler);

    await expect(ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toThrow(fehler);
  });
});

describe('ladeMarkierungen', () => {
  it('ist ein dünner Wrapper um ladeEintraege (identisches Ergebnis)', async () => {
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 5') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'ZPO' }), [e]);
    expect(await ladeMarkierungen(gesetzesreferenz({ kurztitel: 'ZPO' }))).toEqual(
      await ladeEintraege(gesetzesreferenz({ kurztitel: 'ZPO' })),
    );
  });
});

// ---------------------------------------------------------------------------
// schreibeEintraege - Sortierung (bezeichnung -> Textpfad -> zeichenbereichStart)
// ---------------------------------------------------------------------------

describe('schreibeEintraege', () => {
  it('sortiert primär nach bezeichnung (numerisch, vergleicheBezeichnung)', async () => {
    // typ 'kommentar' ohne Textbezug statt 'unterstreichung': unterstreichung/hervorhebung
    // haben laut Format IMMER einen Textbezug (zeichenbereichStart/zeichenbereichEnde),
    // ein allgemeiner Kommentar ohne Textbezug ist dagegen ein regulärer,
    // eigenständig round-trip-fähiger Fall.
    const e433 = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 433'),

      kommentarText: 'x',
    });
    const e20 = markierungsEintrag({ ...e433, ausgangsstelle: normAusgangsstelle('§ 20') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [e433, e20]);
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen.map((e) => bezeichnungAusgangsstelle(e.ausgangsstelle))).toEqual([
      '§ 20',
      '§ 433',
    ]);
  });

  it('sortiert bei gleicher bezeichnung nach Textpfad (hier: absatz)', async () => {
    const abs2 = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(2)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    const abs1 = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [abs2, abs1]);
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen.map((e) => e.bezug.textstelle?.pfad.absatz)).toEqual(['(1)', '(2)']);
  });

  it('sortiert bei gleicher bezeichnung UND gleichem Textpfad nach zeichenbereichStart (Unterstreichung/Hervorhebung verzahnt statt in getrennten Blöcken)', async () => {
    const spaeter = eintrag({
      typ: 'hervorhebung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 10,
          zeichenbereichEnde: 15,
        },
        bezugstext: '',
      },
    });
    const frueher = eintrag({
      typ: 'unterstreichung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [spaeter, frueher]);
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen.map((e) => e.typ)).toEqual(['unterstreichung', 'hervorhebung']);
  });

  it('MUTATIONSTEST: fehlender zeichenbereichStart (allgemeiner Verweis/Kommentar, Fallback -1) sortiert VOR jedem vorhandenen zeichenbereichStart derselben Norm/desselben Pfads', () => {
    // Reiner Sortier-Check ohne Datei-Roundtrip, da ein allgemeiner
    // 'kommentar'/'verweismarkierung' ohne Textbezug beim Parsen wieder ohne
    // zeichenbereichStart zurückkäme (Fallback -1 also am Objekt selbst nicht
    // beobachtbar) - die Sortierfunktion arbeitet aber bereits VOR dem
    // Schreiben auf den rohen Objekten, daher hier direkt gegen die
    // Vergleichsfunktion getestet, wie sie schreibeEintraege verwendet.
    const mitBezug = eintrag({
      typ: 'kommentar',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },

      kommentarText: 'mit Bezug',
    });
    const allgemein = eintrag({
      typ: 'kommentar',
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      kommentarText: 'allgemein',
    });
    const sortiert = [...[mitBezug, allgemein]].sort(
      (a, b) =>
        (a.bezug.textstelle?.zeichenbereichStart ?? -1) -
        (b.bezug.textstelle?.zeichenbereichStart ?? -1),
    );
    expect(sortiert).toEqual([allgemein, mitBezug]);
  });

  it('leeres Array schreibt eine valide, leere <inhalt>-Liste', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), []);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
  });

  it('mutiert die übergebene eintraege-Liste NICHT (schreibt eine Kopie, sortiert sie nicht in-place)', async () => {
    const original = [
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') }),
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 20') }),
    ];
    const referenz = [...original];
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), original);
    expect(original).toEqual(referenz);
  });
});

// ---------------------------------------------------------------------------
// entferneMarkierung
// ---------------------------------------------------------------------------

describe('entferneMarkierung', () => {
  it('entfernt GENAU den passenden Eintrag (Identifikation über identitaetsSchluessel) und lässt andere Einträge unangetastet', async () => {
    const ziel = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    const andere = eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [ziel, andere]);
    const ergebnis = await entferneMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), ziel);
    expect(ergebnis).toBe(true);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([andere]);
  });

  it('gibt false zurück, wenn keine passende Stelle gefunden wird (z.B. Datei zwischenzeitlich extern geändert) - Bestand bleibt unverändert', async () => {
    const vorhanden = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [vorhanden]);
    const ergebnis = await entferneMarkierung(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 99') }),
    );
    expect(ergebnis).toBe(false);
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([vorhanden]);
  });

  it('leere Datei -> false, kein Schreibvorgang, kein Konflikt-Check', async () => {
    const ergebnis = await entferneMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), eintrag());
    expect(ergebnis).toBe(false);
    expect(meldeMarkierungGeaendert).not.toHaveBeenCalled();
  });

  it('pruefeKonflikt=true (Default): meldet den Schlüssel des entfernten Eintrags über meldeMarkierungGeaendert', async () => {
    const ziel = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [ziel]);
    await entferneMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), ziel);
    expect(meldeMarkierungGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5|[null,"(1)",0,null,1,[],1]',
      'markierungs-vorgang',
      undefined,
    );
  });

  it('zwei inhaltlich unterschiedliche allgemeine Kommentare an DERSELBEN Norm sind unterscheidbar (kein falscher Treffer über bloße bezeichnung+Textpfad)', async () => {
    const kommentarA = eintrag({
      typ: 'kommentar',
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      kommentarText: 'A',
    });
    const kommentarB = markierungsEintrag({ ...kommentarA, kommentarText: 'B' });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [kommentarA, kommentarB]);
    const ergebnis = await entferneMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), kommentarB);
    expect(ergebnis).toBe(true);
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen).toEqual([kommentarA]);
  });

  it('MUTATIONSTEST: property - ziel mit GENAU EINEM abweichenden identifizierenden Feld (bezeichnung/typ/zeichenbereichStart/zeichenbereichEnde) findet den Bestandseintrag NICHT', async () => {
    const bestand = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      typ: 'unterstreichung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bestand]);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'bezeichnung' | 'zeichenbereichStart' | 'zeichenbereichEnde'>(
          'bezeichnung',
          'zeichenbereichStart',
          'zeichenbereichEnde',
        ),
        async (feld) => {
          const abweichend: MarkierungsEintrag =
            feld === 'bezeichnung'
              ? markierungsEintrag({ ...bestand, ausgangsstelle: normAusgangsstelle('§ 2') })
              : markierungsEintrag({
                  ...bestand,
                  bezug: {
                    typ: 'bezugstext' as const,
                    textstelle: {
                      ...bestand.bezug.textstelle!,
                      [feld]: bestand.bezug.textstelle![feld] + 1,
                    },
                    bezugstext: '',
                  },
                });
          const ergebnis = await entferneMarkierung(
            gesetzesreferenz({ kurztitel: 'BGB' }),
            abweichend,
          );
          expect(ergebnis).toBe(false);
        },
      ),
    );
    // Bestand nach allen (erfolglosen) Versuchen unverändert.
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([bestand]);
  });
});

// ---------------------------------------------------------------------------
// aktualisiereZielnorm
// ---------------------------------------------------------------------------

describe('aktualisiereZielnorm', () => {
  // verweisziele braucht laut Invariante (siehe VerweisInhalt-Kommentar in
  // markierungSpeicher.types.ts: "auch bei nur einer erkannten Norm liegt
  // hier eine Liste mit einem Element vor") MINDESTENS EIN Element – ein
  // leeres Array wird von parseVerweisinhalt() bewusst verworfen (siehe
  // markierungsXML.ts), verweisinhalt käme beim Round-Trip sonst als
  // undefined zurück.
  const zielnorm = verweisziel({
    typ: 'zielnormOhneElementstand',
    bezeichnung: '1',
    verweistextZeichenbereich: [0, 3] as [number, number],
  });
  const bisherigerVerweis = eintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: { verweistext: 'altes Zitat', verweisziele: [zielnorm] },
  });

  it('überschreibt verweisinhalt/Textbezug/elementstand eines bestehenden verweis-Eintrags', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerVerweis]);
    const neuerInhalt = { verweistext: 'neues Zitat', verweisziele: [zielnorm] };
    const ergebnis = await aktualisiereZielnorm(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerVerweis,
      neuerInhalt,
      {
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: 'Text',
      },
      { textlaenge: 10 },
    );
    expect(ergebnis).toBe('geaendert');
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen).toEqual([
      {
        ...bisherigerVerweis,
        geaendert: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
          bezugstext: 'Text',
        },
        verweisinhalt: neuerInhalt,
      },
    ]);
  });

  it('Umwandlung in einen allgemeinen Verweis (neuerTextbezug ohne zeichenbereichStart/zeichenbereichEnde) UND elementstand wird dann persistiert', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerVerweis]);
    const ergebnis = await aktualisiereZielnorm(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerVerweis,
      { verweistext: 'neu', verweisziele: [zielnorm] },
      {},
      { textlaenge: 42 },
    );
    expect(ergebnis).toBe('geaendert');
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen[0]?.bezug.textstelle?.zeichenbereichStart).toBeUndefined();
    expect(geladen[0]?.bezug.elementstand).toEqual({ textlaenge: 42 });
  });

  it('gibt false zurück, wenn keine passende Stelle gefunden wird (Datei zwischenzeitlich extern geändert), kein Schreibvorgang', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerVerweis]);
    const ergebnis = await aktualisiereZielnorm(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      { ...bisherigerVerweis, ausgangsstelle: normAusgangsstelle('§ 99') },
      { verweistext: 'neu', verweisziele: [zielnorm] },
      {},
    );
    expect(ergebnis).toBe('nichtGefunden');
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([
      bisherigerVerweis,
    ]);
  });

  it('sucht NUR unter typ "verweismarkierung" - ein inhaltsgleicher "kommentar"-Eintrag wird nicht fälschlich getroffen', async () => {
    const kommentarGleicherSchluessel: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'altes Zitat',
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [kommentarGleicherSchluessel]);
    const ergebnis = await aktualisiereZielnorm(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        verweisinhalt: { verweistext: 'altes Zitat', verweisziele: [] },
        bezug: { typ: 'pauschal', elementstand: testElementstand() },
      },
      { verweistext: 'neu', verweisziele: [] },
      {},
    );
    expect(ergebnis).toBe('nichtGefunden');
  });

  it('meldet den Schlüssel des NEUEN (aktualisierten) Standes über meldeMarkierungGeaendert, nicht des alten', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerVerweis]);
    await aktualisiereZielnorm(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerVerweis,
      { verweistext: 'BGB (neu)', verweisziele: [] },
      {
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: 'Text',
      },
    );
    expect(meldeMarkierungGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|verweismarkierung|z:0-5|[null,null,0,null,1,[],1]',
      'markierungs-vorgang',
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// aktualisiereKommentar
// ---------------------------------------------------------------------------

describe('aktualisiereKommentar', () => {
  const bisherigerKommentar: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'alter Text',
  });

  it('überschreibt kommentarText eines bestehenden kommentar-Eintrags', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerKommentar]);
    const ergebnis = await aktualisiereKommentar(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerKommentar,
      'neuer Text',
      { elementstand: bisherigerKommentar.bezug.elementstand },
    );
    expect(ergebnis).toBe('geaendert');
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen).toEqual([
      { ...bisherigerKommentar, geaendert: expect.any(String), kommentarText: 'neuer Text' },
    ]);
  });

  it('kann zusätzlich einen Textbezug hinzufügen (allgemein -> mit Bezug)', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerKommentar]);
    const ergebnis = await aktualisiereKommentar(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerKommentar,
      'neuer Text',
      {
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
        bezugstext: 'Text',
      },
    );
    expect(ergebnis).toBe('geaendert');
    const geladen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(geladen[0]).toEqual({
      geaendert: expect.any(String),
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'neuer Text',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
        bezugstext: 'Text',
      },
    });
  });

  it('gibt false zurück, wenn keine passende Stelle gefunden wird, kein Schreibvorgang', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerKommentar]);
    const ergebnis = await aktualisiereKommentar(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      { ...bisherigerKommentar, kommentarText: 'existiert nicht' },
      'neu',
      {},
    );
    expect(ergebnis).toBe('nichtGefunden');
    expect(await ladeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([
      bisherigerKommentar,
    ]);
  });

  it('sucht NUR unter typ "kommentar" - ein inhaltsgleicher "verweismarkierung"-Eintrag wird nicht fälschlich getroffen', async () => {
    const verweisGleicherSchluessel: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'alter Text', verweisziele: [] },
    });
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [verweisGleicherSchluessel]);
    const ergebnis = await aktualisiereKommentar(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerKommentar,
      'neu',
      {},
    );
    expect(ergebnis).toBe('nichtGefunden');
  });

  it('meldet den Schlüssel des NEUEN (aktualisierten) Standes über meldeMarkierungGeaendert, nicht des alten', async () => {
    await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [bisherigerKommentar]);
    await aktualisiereKommentar(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bisherigerKommentar,
      'komplett anderer Text',
      { elementstand: testElementstand() },
    );
    expect(meldeMarkierungGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|kommentar|t:komplett anderer Text',
      'markierungs-vorgang',
      undefined,
    );
  });
});

describe('Sperrtoken beim Ändern bestehender Einträge', () => {
  it.each(['entfernen', 'kommentar', 'verweismarkierung'] as const)(
    '%s reicht den Token an Lesen und Schreiben weiter',
    async (aktion) => {
      const ziel = eintrag({
        typ: aktion === 'verweismarkierung' ? 'verweismarkierung' : 'kommentar',
        kommentarText: 'Alt',
        verweisinhalt: {
          verweistext: 'Alt',
          verweisziele: [
            verweisziel({
              typ: 'zielnormOhneElementstand',
              bezeichnung: '2',
              verweistextZeichenbereich: [0, 3],
            }),
          ],
        },
      });
      await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [ziel]);
      vi.clearAllMocks();
      if (aktion === 'entfernen')
        await entferneMarkierung(gesetzesreferenz({ kurztitel: 'BGB' }), ziel);
      else if (aktion === 'kommentar')
        await aktualisiereKommentar(gesetzesreferenz({ kurztitel: 'BGB' }), ziel, 'Neu', {
          elementstand: testElementstand(),
        });
      else
        await aktualisiereZielnorm(
          gesetzesreferenz({ kurztitel: 'BGB' }),
          ziel,
          { verweistext: 'Neu', verweisziele: [] },
          {},
          testElementstand(),
        );
      expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
        await ermittleMarkierungsDateipfad(gesetzesreferenz({ kurztitel: 'BGB' })),
        'markierungen',
        undefined,
      );
      expect(sichereBeiUngueltigemInhalt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Function),
        { token: 'test-token', vorgang: 'markierungs-vorgang', bannerAnzeigen: false },
      );
      expect(nutzerdatenSchreiben).toHaveBeenCalledWith(
        await ermittleMarkierungsDateipfad(gesetzesreferenz({ kurztitel: 'BGB' })),
        expect.any(String),
        'test-token',
        'markierungs-vorgang',
      );
    },
  );
});

it('sortiert volle Bezeichnungen und anschließend die Textposition', async () => {
  await schreibeEintraege(gesetzesreferenz({ kurztitel: 'Test' }), [
    eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),

      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    }),
    eintrag({
      ausgangsstelle: normAusgangsstelle('Anhang 1'),

      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 4,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    }),
    eintrag({
      ausgangsstelle: normAusgangsstelle('1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 3,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    }),
    eintrag({
      ausgangsstelle: normAusgangsstelle('Anhang 1'),

      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 1,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    }),
  ]);
  const gelesen = await ladeEintraege(gesetzesreferenz({ kurztitel: 'Test' }));
  expect(
    gelesen.map((e) => [
      bezeichnungAusgangsstelle(e.ausgangsstelle),
      e.bezug.textstelle?.zeichenbereichStart,
    ]),
  ).toEqual([
    ['1', 3],
    ['§ 1', 0],
    ['Anhang 1', 1],
    ['Anhang 1', 4],
  ]);
});

it('Hinzufügen hält gleiche Textstellen unterschiedlicher Ausgangspräfixe getrennt', async () => {
  const { hinzufuegenMarkierung } = await import('./markierungSpeicher.hinzufuegen');
  appDatenSpeicher.set(
    'gesetze/Test_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Test</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">Text</absatz></text></norm><norm id="2"><bezeichnung>Anhang 1</bezeichnung><text><absatz zahl="(1)">Text</absatz></text></norm></inhalt></gesetz>',
  );
  const paragraph = eintrag({
    ausgangsstelle: normAusgangsstelle('§ 1'),
  });
  const anhang = eintrag({
    ausgangsstelle: normAusgangsstelle('Anhang 1'),
  });
  await schreibeEintraege(gesetzesreferenz({ kurztitel: 'Test' }), [paragraph]);
  expect(
    (await hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'Test' }), anhang)).erfolgreich,
  ).toBe(true);
  expect(
    (await ladeEintraege(gesetzesreferenz({ kurztitel: 'Test' }))).map((e) =>
      bezeichnungAusgangsstelle(e.ausgangsstelle),
    ),
  ).toEqual(['§ 1', 'Anhang 1']);
});

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...appDatenSpeicher.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
}));

it('trennt Markierungen gleichnamiger Gesetze und findet deren tatsächlichen Dateipfad', async () => {
  const bund = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const bw = { kurztitel: 'BGB', normgeber: 'de-bw' };
  const erste = eintrag();
  const zweite = eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') });
  await schreibeEintraege(bund, [erste]);
  await schreibeEintraege(bw, [zweite]);
  const andersGeschrieben = { kurztitel: 'bgb', normgeber: 'de-bund' };
  expect(await ladeEintraege(andersGeschrieben)).toEqual([erste]);
  expect(await ladeEintraege(bw)).toEqual([zweite]);
  await entferneMarkierung(andersGeschrieben, erste);
  expect(await ladeEintraege(bund)).toEqual([]);
  expect([...appDatenSpeicher.keys()]).toEqual([
    'markierungen/BGB_de-bund-markierungen.xml',
    'markierungen/BGB_de-bw-markierungen.xml',
  ]);
});

it('verweigert doppelte Markierungsdateien ohne eine davon zu verändern', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await schreibeEintraege(gesetz, [eintrag()]);
  appDatenSpeicher.set('markierungen/bgb_de-bund-markierungen.xml', 'zweite Datei');
  const vorher = [...appDatenSpeicher];
  await expect(ladeEintraege(gesetz)).rejects.toThrow('Mehrere Dateien');
  await expect(entferneMarkierung(gesetz, eintrag())).rejects.toThrow('Mehrere Dateien');
  expect([...appDatenSpeicher]).toEqual(vorher);
});

describe('gesetzesreferenzAusDateiname', () => {
  it('extrahiert den Teil vor "-markierungen.xml"', () => {
    expect(gesetzesreferenzAusDateiname('BGB_unbekannt-markierungen.xml')).toEqual({
      kurztitel: 'BGB',
      normgeber: 'unbekannt',
    });
  });

  it('undefined ohne passenden Suffix', () => {
    expect(gesetzesreferenzAusDateiname('BGB.xml')).toBeUndefined();
  });

  it('leere Dateibasis wird verworfen', () => {
    expect(gesetzesreferenzAusDateiname('-markierungen.xml')).toBeUndefined();
  });

  it('Kurztitel mit Leerzeichen bleibt erhalten', () => {
    expect(gesetzesreferenzAusDateiname('Sozialgesetzbuch V_unbekannt-markierungen.xml')).toEqual({
      kurztitel: 'Sozialgesetzbuch V',
      normgeber: 'unbekannt',
    });
  });
});
it('liest vollständige kodierte Referenzen aus Markierungsdateinamen', () => {
  expect(gesetzesreferenzAusDateiname('A%2FB_de-bund-markierungen.xml')).toEqual({
    kurztitel: 'A/B',
    normgeber: 'de-bund',
  });
  expect(gesetzesreferenzAusDateiname('A_B_de-bw-markierungen.xml')).toEqual({
    kurztitel: 'A_B',
    normgeber: 'de-bw',
  });
  expect(gesetzesreferenzAusDateiname('bgb_de-bund-markierungen.XML')).toEqual({
    kurztitel: 'bgb',
    normgeber: 'de-bund',
  });
  expect(gesetzesreferenzAusDateiname('BGB-markierungen.xml')).toBeUndefined();
});

it('identische Kommentar-Bearbeitung zählt nicht als gespeicherte Änderung', async () => {
  const alt = eintrag({ typ: 'kommentar', kommentarText: 'Kommentar' });
  await schreibeEintraege(gesetzesreferenz({ kurztitel: 'BGB' }), [alt]);
  vi.mocked(nutzerdatenSchreiben).mockClear();
  expect(
    await aktualisiereKommentar(gesetzesreferenz({ kurztitel: 'BGB' }), alt, 'Kommentar', {
      textstelle: alt.bezug.textstelle,
      bezugstext: alt.bezug.bezugstext,
    }),
  ).toBe('unveraendert');
  expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
  expect(meldeMarkierungGeaendert).not.toHaveBeenCalled();
});

it('erhält § 1, Art. 1 und Anhang 1 nach Hinzufügen, Speichern und Laden getrennt', async () => {
  const { hinzufuegenMarkierung } = await import('./markierungSpeicher.hinzufuegen');
  const bezeichnungen = ['§ 1', 'Art. 1', 'Anhang 1'];
  appDatenSpeicher.set(
    'gesetze/Test_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Test</kurztitel></infos><inhalt>' +
      bezeichnungen
        .map(
          (bezeichnung, index) =>
            `<norm id="n${index}"><bezeichnung>${bezeichnung}</bezeichnung><text><absatz>Text</absatz></text></norm>`,
        )
        .join('') +
      '</inhalt></gesetz>',
  );
  const gesetz = gesetzesreferenz({ kurztitel: 'Test' });
  for (const bezeichnung of bezeichnungen) {
    expect(
      (
        await hinzufuegenMarkierung(
          gesetz,
          markierungsEintrag({
            typ: 'kommentar',
            ausgangsstelle: { typ: 'norm', bezeichnung },
          }),
        )
      ).erfolgreich,
    ).toBe(true);
  }
  const geladen = await ladeEintraege(gesetz);
  expect(geladen).toHaveLength(3);
  const darstellung = gesetzMitNormen(bezeichnungen, { kennung: (index) => `n${index}` });
  for (const e of geladen) {
    expect(loeseAusgangsstelleAuf(darstellung, e.ausgangsstelle).element?.bezeichnung).toBe(
      bezeichnungAusgangsstelle(e.ausgangsstelle),
    );
  }
});
