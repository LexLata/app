// verweismarkierungAktionen.persistieren.test.ts
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Abhängigkeiten werden über Parameter injiziert (siehe Dateikopf der
// getesteten Datei) – daher reichen Fake-Implementierungen statt vi.mock().

import { bereichPfad, normtextPfad } from '@/test/gesetz/textpfadFabrik';
import {
  baueTextbezugUndElementstand,
  persistiereBearbeiten,
  persistiereNeuenVerweis,
  type TextbezugDomainFns,
} from './verweismarkierungAktionen.persistieren';
import { describe, expect, it, vi } from 'vitest';
import type { VerweismarkierungKontext } from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type { VerweisInhalt } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { HinzufuegenErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';
import { gesetz, norm } from '@/test/markierungen/verweismarkierungAktionenTestAufbau';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const VERWEISINHALT: VerweisInhalt = { verweistext: '§ 1', verweisziele: [] };

describe('baueTextbezugUndElementstand', () => {
  function domainFns(overrides: Partial<TextbezugDomainFns> = {}): TextbezugDomainFns {
    return {
      findeElementZuBezeichnung: vi.fn(() => undefined),
      aktuellerTextAnPfad: vi.fn(() => undefined),
      berechneElementstand: vi.fn(() => ({ titel: undefined, textlaenge: 42 })),
      ...overrides,
    };
  }

  it('liefert bei kontext.auswahl (Neuanlage mit Textbezug) den Textbezug aus der Auswahl', () => {
    const testG = gesetz('TestG', [norm('1')]);
    const kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
      auswahl: {
        textstelle: {
          pfad: normtextPfad({ absatz: '1' }),
          zeichenbereichStart: 5,
          zeichenbereichEnde: 10,
        },
        bezugstext: 'alt',
      },
    };
    const fns = domainFns({
      findeElementZuBezeichnung: vi.fn(() => (testG.elemente[0] as { data: NormDarstellung }).data),
      aktuellerTextAnPfad: vi.fn(() => 'frisch'),
    });

    const ergebnis = baueTextbezugUndElementstand(kontext, true, [testG], fns);

    expect(ergebnis).toEqual({
      neuerTextbezug: {
        textstelle: {
          pfad: normtextPfad({ absatz: '1' }),
          zeichenbereichStart: 5,
          zeichenbereichEnde: 10,
        },
        bezugstext: 'frisch',
      },
      elementstand: undefined,
    });
  });

  it('fällt auf den ursprünglichen bezugstext zurück, wenn die Neuberechnung fehlschlägt', () => {
    const testG = gesetz('TestG', [norm('1')]);
    const kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
      auswahl: {
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: 'alt',
      },
    };
    const fns = domainFns({
      findeElementZuBezeichnung: vi.fn(() => (testG.elemente[0] as { data: NormDarstellung }).data),
      aktuellerTextAnPfad: vi.fn(() => undefined),
    });

    const ergebnis = baueTextbezugUndElementstand(kontext, true, [testG], fns);

    expect(ergebnis.neuerTextbezug.bezugstext).toBe('alt');
  });

  it('setzt elementstand bei allgemeinem Zitat (kein Textbezug), wenn die Ausgangsstelle eine Norm ist', () => {
    const testG = gesetz('TestG', [norm('1')]);
    const kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
    };
    const fns = domainFns({
      findeElementZuBezeichnung: vi.fn(() => (testG.elemente[0] as { data: NormDarstellung }).data),
      berechneElementstand: vi.fn(() => ({ titel: 'Titel', textlaenge: 99 })),
    });

    const ergebnis = baueTextbezugUndElementstand(kontext, false, [testG], fns);

    expect(ergebnis).toEqual({
      neuerTextbezug: { textstelle: undefined, bezugstext: undefined },
      elementstand: { titel: 'Titel', textlaenge: 99 },
    });
  });

  it('lässt elementstand weg, wenn die Ausgangsstelle nicht gefunden wird (z.B. eine Überschrift)', () => {
    const kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ unbekannt'),
    };

    const ergebnis = baueTextbezugUndElementstand(kontext, false, [gesetz('TestG')], domainFns());

    expect(ergebnis.elementstand).toBeUndefined();
  });

  it('nutzt kontext.bearbeiten.textbezug, wenn kein kontext.auswahl vorliegt', () => {
    const testG = gesetz('TestG', [norm('1')]);
    const kontext = {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bearbeiten: {
        zitatText: '§ 1',
        vorher: { elementstand: testElementstand(), verweisinhalt: VERWEISINHALT },
        textbezug: {
          textstelle: {
            pfad: normtextPfad({ satz: 2 }),
            zeichenbereichStart: 1,
            zeichenbereichEnde: 4,
          },
          bezugstext: 'bisher',
        },
      },
    };
    const fns = domainFns({
      findeElementZuBezeichnung: vi.fn(() => (testG.elemente[0] as { data: NormDarstellung }).data),
      aktuellerTextAnPfad: vi.fn(() => 'aktualisiert'),
    });

    const ergebnis = baueTextbezugUndElementstand(kontext, true, [testG], fns);

    expect(ergebnis.neuerTextbezug.textstelle?.pfad).toEqual(normtextPfad({ satz: 2 }));
    expect(ergebnis.neuerTextbezug).toEqual({
      textstelle: {
        pfad: normtextPfad({ satz: 2 }),
        zeichenbereichStart: 1,
        zeichenbereichEnde: 4,
      },
      bezugstext: 'aktualisiert',
    });
  });
});

describe('persistiereBearbeiten', () => {
  function bearbeitenKontext() {
    return {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
      openerLabel: 'opener',
      bearbeiten: {
        zitatText: '§ 1',
        vorher: { elementstand: testElementstand(), verweisinhalt: VERWEISINHALT },
      },
    };
  }

  async function rufeAuf(fakes: {
    aktualisiereZielnorm: Parameters<typeof persistiereBearbeiten>[4];
  }) {
    return persistiereBearbeiten(
      bearbeitenKontext(),
      VERWEISINHALT,
      { textstelle: undefined, bezugstext: undefined },
      undefined,
      fakes.aktualisiereZielnorm,
    );
  }

  it('liefert die gespeicherte Bearbeitungsaktion vor jedem IPC', async () => {
    const aktualisiereZielnorm = vi.fn(async () => 'geaendert' as const);

    const ergebnis = await rufeAuf({ aktualisiereZielnorm });

    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      aktion: { art: 'verweisBearbeiten', gesetz: gesetzesreferenz({ kurztitel: 'TestG' }) },
    });
  });

  it('gibt einen Fehler zurück, wenn die Norm nicht mehr gefunden wird', async () => {
    const aktualisiereZielnorm = vi.fn(async () => 'nichtGefunden' as const);

    const ergebnis = await rufeAuf({ aktualisiereZielnorm });

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [
        {
          art: 'sonst',
          text: 'Dieser Verweis konnte nicht mehr gefunden werden – wurde er zwischenzeitlich entfernt?',
        },
      ],
    });
  });
});

describe('persistiereNeuenVerweis', () => {
  function kontext(): Pick<
    VerweismarkierungKontext,
    'gesetz' | 'ausgangsstelle' | 'aktuellesElement' | 'openerLabel'
  > {
    return {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      ausgangsstelle: normAusgangsstelle('§ 1'),
      openerLabel: 'opener',
    };
  }

  function ergebnisFake(overrides: Partial<HinzufuegenErgebnis> = {}): HinzufuegenErgebnis {
    return { erfolgreich: true, aktion: { art: 'hinzufuegen' } as never, ...overrides };
  }

  /** Bündelt die für alle Tests hier identischen Argumente (kontext,
   *  verweisinhalt, neuerTextbezug, elementstand) – nur die tatsächlich
   *  variierenden Fakes unterscheiden sich je Test (siehe jscpd: vorher
   *  hier wortgleiche Aufruf-Blöcke). */
  async function rufeAuf(fakes: {
    textstelle?: Textstelle;
    hinzufuegenMarkierung: Parameters<typeof persistiereNeuenVerweis>[4];
  }) {
    return persistiereNeuenVerweis(
      kontext(),
      VERWEISINHALT,
      { textstelle: fakes.textstelle, bezugstext: fakes.textstelle ? 'Text' : undefined },
      fakes.textstelle ? undefined : testElementstand(),
      fakes.hinzufuegenMarkierung,
    );
  }

  it('meldet eine inzwischen uneindeutige Ausgangsstelle als Formularfehler', async () => {
    const ergebnis = await rufeAuf({
      hinzufuegenMarkierung: async () => ({
        erfolgreich: false,
        ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
      }),
    });
    expect(ergebnis).toEqual({
      art: 'fehler',
      ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
      fehler: [
        {
          art: 'sonst',
          text: 'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.',
        },
      ],
    });
  });

  it('liefert die tatsächliche Anlegeaktion ohne IPC', async () => {
    const hinzufuegenMarkierung = vi.fn(async () => ergebnisFake());

    const ergebnis = await rufeAuf({
      textstelle: {
        pfad: normtextPfad({ absatz: '1' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      },
      hinzufuegenMarkierung,
    });

    expect(ergebnis).toEqual({ art: 'erfolg', aktion: { art: 'hinzufuegen' } });
    expect(hinzufuegenMarkierung).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'TestG' }),
      expect.objectContaining({
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: expect.objectContaining({
          textstelle: {
            pfad: { typ: 'normtext' as const, absatz: '1' },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 1,
          },
        }),
      }),
      undefined,
    );
  });

  it.each(['zusammenfuehren', 'split', 'toggle'] as const)(
    'gibt die tatsächliche %s-Aktion unverändert vor jedem IPC zurück',
    async (fall) => {
      const alt = markierungsEintrag({
        typ: 'unterstreichung' as const,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 20 },
          bezugstext: '',
        },
      });
      const aktion: NonNullable<HinzufuegenErgebnis['aktion']> = {
        art: 'ersetzen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        neu:
          fall === 'toggle'
            ? undefined
            : markierungsEintrag({
                ...alt,
                bezug: {
                  typ: 'bezugstext' as const,
                  textstelle: { ...alt.bezug.textstelle, zeichenbereichEnde: 30 },
                  bezugstext: '',
                },
              }),
        rest:
          fall === 'split'
            ? [
                markierungsEintrag({
                  ...alt,
                  bezug: {
                    typ: 'bezugstext' as const,
                    textstelle: { ...alt.bezug.textstelle, zeichenbereichEnde: 5 },
                    bezugstext: '',
                  },
                }),
              ]
            : [],
        entfernt: [alt],
      };
      const ergebnis = await rufeAuf({
        hinzufuegenMarkierung: async () => ({ erfolgreich: true, aktion }),
      });
      expect(ergebnis.art).toBe('erfolg');
      if (ergebnis.art === 'erfolg') expect(ergebnis.aktion).toBe(aktion);
    },
  );

  it('meldet bei einem Duplikat einen Fehler und zeigt KEIN Banner', async () => {
    const hinzufuegenMarkierung = vi.fn(async () =>
      ergebnisFake({ erfolgreich: false, ablehnungsgrund: 'duplikat', aktion: undefined }),
    );

    const ergebnis = await rufeAuf({
      hinzufuegenMarkierung,
    });

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [{ art: 'sonst', text: 'Ein identischer Verweis existiert bereits.' }],
    });
  });

  it('liefert Überlappung als lokalen Formularfehler', async () => {
    const hinzufuegenMarkierung = vi.fn(async () =>
      ergebnisFake({ erfolgreich: false, ablehnungsgrund: 'ueberlappung', aktion: undefined }),
    );

    const ergebnis = await rufeAuf({
      hinzufuegenMarkierung,
    });

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [
        { art: 'sonst', text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.' },
      ],
    });
  });

  it('bricht mit keineAktion ab, wenn weder erfolgreich noch eine Aktion vorliegt', async () => {
    const hinzufuegenMarkierung = vi.fn(async () =>
      ergebnisFake({ erfolgreich: false, aktion: undefined }),
    );

    const ergebnis = await rufeAuf({
      hinzufuegenMarkierung,
    });

    expect(ergebnis).toEqual({ art: 'keineAktion' });
  });
});

describe('Verweis auf Anhang 1', () => {
  const kontext = {
    gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    ausgangsstelle: normAusgangsstelle('Anhang 1'),

    openerLabel: 'opener',
  };

  it('führt beim Anlegen Präfix in Speicherung und Sync mit', async () => {
    const speichern: Parameters<typeof persistiereNeuenVerweis>[4] = vi.fn(
      async (gesetz, eintrag) => ({
        erfolgreich: true,
        aktion: { art: 'hinzufuegen' as const, gesetz, eintrag },
      }),
    );
    const ergebnis = await persistiereNeuenVerweis(
      kontext,
      VERWEISINHALT,
      {},
      testElementstand(),
      speichern,
    );
    const eintrag = vi.mocked(speichern).mock.calls[0]![1];
    expect(bezeichnungAusgangsstelle(eintrag.ausgangsstelle)).toBe('Anhang 1');
    expect(identitaetsSchluessel(eintrag)).not.toBe(
      identitaetsSchluessel(
        markierungsEintrag({
          ...eintrag,
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    );
    expect(ergebnis).toEqual({
      art: 'erfolg',
      aktion: {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag,
      },
    });
  });

  it('führt beim Bearbeiten Präfix in Suchidentität und Sync-Ziel mit', async () => {
    const speichern: Parameters<typeof persistiereBearbeiten>[4] = vi.fn(
      async () => 'geaendert' as const,
    );
    const ergebnis = await persistiereBearbeiten(
      {
        ...kontext,
        bearbeiten: {
          zitatText: 'Alt',
          vorher: { elementstand: testElementstand(), verweisinhalt: VERWEISINHALT },
        },
      },
      VERWEISINHALT,
      {},
      testElementstand(),
      speichern,
    );
    const ziel = vi.mocked(speichern).mock.calls[0]![1];
    expect(ziel).toMatchObject({ ausgangsstelle: normAusgangsstelle('Anhang 1') });
    expect(
      identitaetsSchluessel(markierungsEintrag({ ...ziel, typ: 'verweismarkierung' })),
    ).not.toBe(
      identitaetsSchluessel(
        markierungsEintrag({
          ...ziel,
          typ: 'verweismarkierung',
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    );
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      aktion: { ziel: { ausgangsstelle: normAusgangsstelle('Anhang 1') } },
    });
  });
});

it('erhält Überschriftenkennung beim Anlegen und Bearbeiten im Undo-Ziel', async () => {
  const kontext = {
    gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    ausgangsstelle: (true as const)
      ? ueberschriftAusgangsstelle('010')
      : normAusgangsstelle('§ 010'),

    openerLabel: 'opener',
  };
  const neu: Parameters<typeof persistiereNeuenVerweis>[4] = vi.fn(async (gesetz, eintrag) => ({
    erfolgreich: true,
    aktion: { art: 'hinzufuegen' as const, gesetz, eintrag },
  }));
  await persistiereNeuenVerweis(kontext, VERWEISINHALT, {}, testElementstand(), neu);
  expect(vi.mocked(neu).mock.calls[0]![1]).toMatchObject({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
  });
  const bearbeiten: Parameters<typeof persistiereBearbeiten>[4] = vi.fn(
    async () => 'geaendert' as const,
  );
  const ergebnis = await persistiereBearbeiten(
    {
      ...kontext,
      bearbeiten: {
        zitatText: 'Alt',
        vorher: { elementstand: testElementstand(), verweisinhalt: VERWEISINHALT },
      },
    },
    VERWEISINHALT,
    {},
    undefined,
    bearbeiten,
  );
  expect(vi.mocked(bearbeiten).mock.calls[0]![1]).toMatchObject({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
  });
  expect(ergebnis).toMatchObject({
    aktion: { ziel: { ausgangsstelle: ueberschriftAusgangsstelle('010') } },
  });
});

it.each([
  { status: 'leer' as const, dateiBasis: 'bGb_de-bund' },
  { status: 'unlesbar' as const, dateiBasis: 'bGb_de-bund', fehler: 'Lesefehler' },
  { status: 'ordner_unlesbar' as const, fehler: 'Ordnerfehler' },
])('verhindert Schreiben bei benötigtem Ausgangsbefund $status', async (befund) => {
  const gesetzModul = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const { ladeGesetzeMitGepruefterAusgangsquelle } =
    await import('./verweismarkierungAktionen.persistieren');
  const laden = vi.spyOn(gesetzModul, 'ladeAlleGesetze').mockImplementation(async (melde) => {
    await melde?.([befund]);
    return [];
  });
  try {
    await expect(
      ladeGesetzeMitGepruefterAusgangsquelle(
        { kurztitel: 'BGB', normgeber: 'de-bund' },
        markierungsEinzelzugriffFuerTest,
      ),
    ).rejects.toThrow('Ausgangsquelle');
  } finally {
    laden.mockRestore();
  }
});

it.each([
  { status: 'fehlt' as const, dateiBasis: 'BGB_de-bund' },
  { status: 'unlesbar' as const, dateiBasis: 'BGB_Bayern', fehler: 'anderer Normgeber' },
])('lässt tatsächliche Abwesenheit und unbeteiligte Quellen zu: $dateiBasis', async (befund) => {
  const gesetzModul = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const { ladeGesetzeMitGepruefterAusgangsquelle } =
    await import('./verweismarkierungAktionen.persistieren');
  const laden = vi.spyOn(gesetzModul, 'ladeAlleGesetze').mockImplementation(async (melde) => {
    await melde?.([befund]);
    return [];
  });
  try {
    await expect(
      ladeGesetzeMitGepruefterAusgangsquelle(
        { kurztitel: 'BGB', normgeber: 'de-bund' },
        markierungsEinzelzugriffFuerTest,
      ),
    ).resolves.toEqual([]);
  } finally {
    laden.mockRestore();
  }
});

describe('Ausgangsdaten ohne eindeutig zuordenbare Ausgangsstelle', () => {
  it.each(['fehlend', 'aehnlich', 'mehrdeutig'] as const)(
    'erhält beim Bearbeiten %s alle gespeicherten Ausgangsdaten auch bei abgewähltem Textbezug',
    async (art) => {
      const { findeElementZuBezeichnung } =
        await import('@/lib/markierungen/gemeinsam/gemeinsam.index');
      const { aktuellerTextAnPfad } = await import('@/lib/domain/textpfad/textpfad.index');
      const { berechneElementstand } = await import('@/lib/domain/gesetzDarstellungAuswertung');
      const vorher = {
        verweisinhalt: VERWEISINHALT,
        elementstand: { titel: 'Gespeichert', textlaenge: 77 },
      };
      const pfad = bereichPfad('bezeichnung' as const);
      const kontext = {
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        ausgangsstelle: normAusgangsstelle('§ 9'),
        bearbeiten: {
          zitatText: '§ 1',
          vorher,
          textbezug: {
            textstelle: { pfad, zeichenbereichStart: 1, zeichenbereichEnde: 3 },
            bezugstext: 'alt',
          },
        },
      };
      const elemente =
        art === 'fehlend' ? [] : art === 'aehnlich' ? [norm('90')] : [norm('9'), norm('9')];
      const ergebnis = baueTextbezugUndElementstand(kontext, false, [gesetz('TestG', elemente)], {
        findeElementZuBezeichnung,
        aktuellerTextAnPfad,
        berechneElementstand,
      });
      expect(ergebnis).toEqual({
        neuerTextbezug: {
          textstelle: { pfad, zeichenbereichStart: 1, zeichenbereichEnde: 3 },
          bezugstext: 'alt',
        },
        elementstand: vorher.elementstand,
      });
    },
  );
});

it.each([false, true])(
  'erhält pauschalen Ausgangs-Elementstand bei fehlender Stelle (Bezug angefordert=%s)',
  async (angefordert) => {
    const { findeElementZuBezeichnung } =
      await import('@/lib/markierungen/gemeinsam/gemeinsam.index');
    const { aktuellerTextAnPfad } = await import('@/lib/domain/textpfad/textpfad.index');
    const { berechneElementstand } = await import('@/lib/domain/gesetzDarstellungAuswertung');
    const elementstand = { titel: 'Alt', textlaenge: 77 };
    const ergebnis = baueTextbezugUndElementstand(
      {
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        ausgangsstelle: normAusgangsstelle('§ 9'),
        bearbeiten: {
          zitatText: '§ 1',
          vorher: { verweisinhalt: VERWEISINHALT, elementstand },
        },
      },
      angefordert,
      [gesetz('TestG', [norm('90')])],
      {
        findeElementZuBezeichnung,
        aktuellerTextAnPfad,
        berechneElementstand,
      },
    );
    expect(ergebnis.elementstand).toEqual(elementstand);
    expect(ergebnis.neuerTextbezug).toEqual({
      textstelle: undefined,
      bezugstext: undefined,
    });
  },
);
