// kommentarAktionen.test.ts
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// ---------------------------------------------------------------------------
// speichereKommentar – Charakterisierungstests analog zu
// verweismarkierungAktionen.test.ts. Nur die seiteneffektbehafteten Module
// (markierungSpeicher, Tauri-IPC) werden gemockt; aktuellerTextAnPfad läuft
// ECHT gegen ein von Hand aufgebautes NormDarstellung-Fixture (siehe dort:
// Bereich bezeichnung-Zweig braucht keinen Absatz-Baum).

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { schliesseGespeicherteMarkierungsAktionAb } from './markierungsUebertragung';
import type { HinzufuegenErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';
import {
  aktualisiereKommentar,
  hinzufuegenMarkierung,
  zeigeUeberlappungsBanner,
} from '@/lib/markierungen/eintrag/eintrag.index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { speichereKommentar } from './kommentarAktionen';
import type { KommentarKontext } from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { emitTo } from '@tauri-apps/api/event';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  aktualisiereKommentar: vi.fn(),
  hinzufuegenMarkierung: vi.fn(),
  zeigeUeberlappungsBanner: vi.fn(),
}));
vi.mock('./markierungsUebertragung', async (importOriginal) => {
  const original = await importOriginal<typeof import('./markierungsUebertragung')>();
  return {
    ...original,
    schliesseGespeicherteMarkierungsAktionAb: vi.fn(async (aktion) => {
      original.meldeMarkierungsAnzeigeAenderung(aktion.gesetz);
      return { art: 'erfolg' };
    }),
  };
});
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({ ladeAlleGesetze: vi.fn(async () => []) }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
}));

function normDarstellung(bezeichnung: string): NormDarstellung {
  return normaleNorm({ id: 'id-1', xmlId: '1', bezeichnung, absaetze: [] });
}

function kommentarKontext(overrides: Partial<KommentarKontext> = {}): KommentarKontext {
  return {
    openerLabel: 'opener-fenster',
    gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    ausgangsstelle: normAusgangsstelle('§ 1'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(ladeAlleGesetze).mockResolvedValue([
    gesetzDarstellung({
      kurztitel: 'TestG',
      elemente: [
        { typ: 'norm', data: normDarstellung('§ 1') },
        { typ: 'norm', data: { ...normDarstellung('Anhang 1'), xmlId: 'anhang' } },
        {
          typ: 'ueberschrift',
          data: {
            id: 'u',
            xmlId: 'u',
            gliederungskennzahl: '010',
            bezeichnung: 'Abschnitt',
            ebene: 1,
          },
        },
      ],
    }),
  ]);
});

describe('speichereKommentar', () => {
  beforeEach(() => {
    vi.mocked(aktualisiereKommentar).mockReset();
    vi.mocked(hinzufuegenMarkierung).mockReset();
    vi.mocked(zeigeUeberlappungsBanner).mockReset();
    vi.mocked(emitTo).mockClear();
    vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mockClear();
  });

  it.each([false, true])(
    'sendet die gespeicherte Ersetzenaktion genau einmal (Toggle=%s)',
    async (toggle) => {
      const eintrag = markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'kommentar' as const,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'gespeichert',
      });
      const aktion: NonNullable<HinzufuegenErgebnis['aktion']> = {
        art: 'ersetzen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        neu: toggle ? undefined : eintrag,
        rest: [
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
              bezugstext: '',
            },
          }),
        ],
        entfernt: [
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: 0,
                zeichenbereichEnde: 10,
              },
              bezugstext: '',
            },
          }),
        ],
      };
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true, aktion });
      expect(
        await speichereKommentar(
          kommentarKontext(),
          markierungsEinzelzugriffFuerTest,
          'Eingabe',
          false,
        ),
      ).toEqual({
        art: 'erfolg',
      });
      await vi.waitFor(() => expect(emitTo).toHaveBeenCalled());
      expect(vi.mocked(emitTo).mock.calls).toEqual([
        [
          { kind: 'Any' },
          'markierungen-geaendert',
          { gesetz: gesetzesreferenz({ kurztitel: 'TestG' }) },
        ],
      ]);
      expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledExactlyOnceWith(
        aktion,
        'opener-fenster',
        undefined,
      );
      expect(vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mock.calls[0]![0]).toBe(aktion);
      expect(
        vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(emitTo).mock.invocationCallOrder[0]!);
    },
  );

  describe('Neuanlegen (kontext.bearbeiten nicht gesetzt)', () => {
    it('legt einen Kommentar ohne Textbezug an und meldet die Aktion ans Opener-Fenster', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: true,
        aktion: {
          art: 'hinzufuegen',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          eintrag: {} as never,
        },
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereKommentar(
        kommentarKontext(),
        markierungsEinzelzugriffFuerTest,
        'Ein Kommentar',
        false,
      );

      expect(ergebnis).toEqual({ art: 'erfolg' });
      const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
      expect(eintragArg).toMatchObject({
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'Ein Kommentar',
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      });
      expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
        {
          art: 'hinzufuegen',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          eintrag: {},
        },
        'opener-fenster',
        undefined,
      );
    });

    it('übernimmt bei textbezug=true den Textbezug aus kontext.auswahl und aktualisiert bezugstext frisch', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: true,
        aktion: {
          art: 'hinzufuegen',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          eintrag: {} as never,
        },
      } as HinzufuegenErgebnis);

      const kontext = kommentarKontext({
        aktuellesElement: normDarstellung('§ 1 (aktuell)'),
        auswahl: {
          textstelle: {
            pfad: bereichPfad('bezeichnung'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 3,
          },
          bezugstext: '§ 1 (alt)'.slice(0, 3),
        },
      });

      await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Ein Kommentar', true);

      const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
      expect(eintragArg).toMatchObject({
        bezug: {
          textstelle: {
            pfad: { typ: 'bereich' as const, bereich: 'bezeichnung' },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 3,
          },
          bezugstext: '§ 1'.slice(0, 3),
        },

        // frisch aus kontext.aktuellesElement abgeleitet, NICHT der alte Wert:
      });
    });

    it('ignoriert kontext.auswahl, wenn textbezug=false übergeben wird', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: true,
        aktion: {
          art: 'hinzufuegen',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          eintrag: {} as never,
        },
      } as HinzufuegenErgebnis);

      const kontext = kommentarKontext({
        aktuellesElement: normDarstellung('§ 1'),
        auswahl: {
          textstelle: {
            pfad: bereichPfad('bezeichnung'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 3,
          },
          bezugstext: '§ 1',
        },
      });

      await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Ein Kommentar', false);

      const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
      expect(eintragArg).toMatchObject({
        bezug: { typ: 'pauschal', elementstand: { textlaenge: 0 } },
      });
      expect(eintragArg).not.toHaveProperty('bereich');
    });
  });

  describe('Ablehnungsgründe beim Anlegen (hinzufuegenMarkierung.ablehnungsgrund)', () => {
    it('meldet einen Fehler bei einem identischen Duplikat', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
        ablehnungsgrund: 'duplikat',
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereKommentar(
        kommentarKontext(),
        markierungsEinzelzugriffFuerTest,
        'Ein Kommentar',
        false,
      );

      expect(ergebnis).toEqual({
        art: 'fehler',
        text: 'Ein identischer Kommentar existiert bereits.',
      });
      expect(zeigeUeberlappungsBanner).not.toHaveBeenCalled();
      expect(emitTo).not.toHaveBeenCalled();
    });

    it('gibt Überlappung lokal zurück und sendet keine Hauptfenstermeldung', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
        ablehnungsgrund: 'ueberlappung',
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereKommentar(
        kommentarKontext(),
        markierungsEinzelzugriffFuerTest,
        'Ein Kommentar',
        false,
      );

      expect(zeigeUeberlappungsBanner).not.toHaveBeenCalled();
      expect(emitTo).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({
        art: 'fehler',
        text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
      });
    });

    it('bricht ohne Aktion ab, wenn hinzufuegenMarkierung weder erfolgreich noch mit Aktion zurückkommt', async () => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereKommentar(
        kommentarKontext(),
        markierungsEinzelzugriffFuerTest,
        'Ein Kommentar',
        false,
      );

      expect(ergebnis).toEqual({ art: 'keineAktion' });
      // Kein Sync-Event, wenn nichts gespeichert wurde.
      expect(emitTo).not.toHaveBeenCalled();
    });
  });

  describe('Bearbeiten-Modus (kontext.bearbeiten gesetzt)', () => {
    function bearbeitenKontext(overrides: Partial<KommentarKontext> = {}): KommentarKontext {
      return kommentarKontext({
        bearbeiten: {
          kommentarText: 'Alter Text',
          vorher: { elementstand: testElementstand(), kommentarText: 'Alter Text' },
        },
        ...overrides,
      });
    }

    it('aktualisiert einen bestehenden Kommentar und meldet die Aktion ans Opener-Fenster', async () => {
      vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');

      const ergebnis = await speichereKommentar(
        bearbeitenKontext(),
        markierungsEinzelzugriffFuerTest,
        'Neuer Text',
        false,
      );

      expect(ergebnis).toEqual({ art: 'erfolg' });
      expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'kommentarBearbeiten' }),
        'opener-fenster',
        undefined,
      );
      await vi.waitFor(() => expect(emitTo).toHaveBeenCalled());
      expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      });
    });

    it('matched beim Bearbeiten über den URSPRÜNGLICHEN kommentarText (Regressionstest: zwei unterschiedliche allgemeine Kommentare an derselben Norm dürfen sich beim Bearbeiten nicht gegenseitig überschreiben)', async () => {
      vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');

      await speichereKommentar(
        bearbeitenKontext({
          bearbeiten: {
            kommentarText: 'Kommentar A',
            vorher: { elementstand: testElementstand(), kommentarText: 'Kommentar A' },
          },
        }),
        markierungsEinzelzugriffFuerTest,
        'Kommentar A (bearbeitet)',
        false,
      );

      const [, bisherigerEintragArg] = vi.mocked(aktualisiereKommentar).mock.calls[0]!;
      // Der ursprüngliche kommentarText muss Teil des Matching-Schlüssels
      // sein – sonst würde aktualisiereKommentar() den FALSCHEN (ersten)
      // Kommentar an derselben Norm treffen.
      expect(bisherigerEintragArg).toMatchObject({ kommentarText: 'Kommentar A' });
    });

    it('meldet Fehler, wenn der zu bearbeitende Kommentar nicht mehr gefunden wird', async () => {
      vi.mocked(aktualisiereKommentar).mockResolvedValue('nichtGefunden');

      const ergebnis = await speichereKommentar(
        bearbeitenKontext(),
        markierungsEinzelzugriffFuerTest,
        'Neuer Text',
        false,
      );

      expect(ergebnis).toEqual({
        art: 'fehler',
        text: 'Dieser Kommentar wurde zwischenzeitlich verändert oder gelöscht und kann nicht gespeichert werden.',
      });
      expect(emitTo).not.toHaveBeenCalled();
    });

    it('übernimmt beim Bearbeiten den Textbezug aus kontext.bearbeiten.textbezug und aktualisiert bezugstext frisch', async () => {
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetzDarstellung({
          kurztitel: 'TestG',
          langtitel: 'Test',
          hatGliederungsartikel: false,
          elemente: [{ typ: 'norm', data: normDarstellung('§ 1') }],
        }),
      ]);
      vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');

      const kontext = bearbeitenKontext({
        aktuellesElement: normDarstellung('§ 1'),
        bearbeiten: {
          kommentarText: 'Alter Text',
          vorher: { elementstand: testElementstand(), kommentarText: 'Alter Text' },
          textbezug: {
            textstelle: {
              pfad: bereichPfad('bezeichnung'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 1,
            },
            bezugstext: '§ 1 (alt)'.slice(0, 1),
          },
        },
      });

      await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Neuer Text', true);

      const [, , , neuerTextbezugArg] = vi.mocked(aktualisiereKommentar).mock.calls[0]!;
      expect(neuerTextbezugArg).toEqual({
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 1,
        },
        bezugstext: '§ 1'.slice(0, 1),
      });
    });
  });
});

describe('Kommentar auf Anhang 1', () => {
  it('führt beim Anlegen Präfix, Speicherung und Sync konsistent mit', async () => {
    vi.mocked(hinzufuegenMarkierung).mockImplementation(async (gesetz, eintrag) => ({
      erfolgreich: true,
      aktion: { art: 'hinzufuegen', gesetz, eintrag },
    }));
    await speichereKommentar(
      kommentarKontext({
        ausgangsstelle: normAusgangsstelle('Anhang 1'),
      }),
      markierungsEinzelzugriffFuerTest,
      'Text',
      false,
    );
    const eintrag = vi.mocked(hinzufuegenMarkierung).mock.calls.at(-1)![1];
    expect(bezeichnungAusgangsstelle(eintrag.ausgangsstelle)).toBe('Anhang 1');
    expect(identitaetsSchluessel(eintrag)).not.toBe(
      identitaetsSchluessel(
        markierungsEintrag({
          ...eintrag,
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    );
    expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
      {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag,
      },
      'opener-fenster',
      undefined,
    );
  });

  it('führt beim Bearbeiten Präfix in Suchidentität und Sync-Ziel mit', async () => {
    vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');
    await speichereKommentar(
      kommentarKontext({
        ausgangsstelle: normAusgangsstelle('Anhang 1'),

        bearbeiten: {
          kommentarText: 'Alt',
          vorher: { elementstand: testElementstand(), kommentarText: 'Alt' },
        },
      }),
      markierungsEinzelzugriffFuerTest,
      'Neu',
      false,
    );
    const ziel = vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![1];
    expect(ziel).toMatchObject({
      ausgangsstelle: normAusgangsstelle('Anhang 1'),
      kommentarText: 'Alt',
    });
    expect(identitaetsSchluessel(markierungsEintrag({ ...ziel, typ: 'kommentar' }))).not.toBe(
      identitaetsSchluessel(
        markierungsEintrag({
          ...ziel,
          typ: 'kommentar',
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    );
    expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
      expect.objectContaining({ ziel: { ausgangsstelle: normAusgangsstelle('Anhang 1') } }),
      'opener-fenster',
      undefined,
    );
  });
});

it('erhält Überschriftenkennung beim Anlegen und Bearbeiten im Undo-Ziel', async () => {
  vi.mocked(hinzufuegenMarkierung).mockImplementation(async (gesetz, eintrag) => ({
    erfolgreich: true,
    aktion: { art: 'hinzufuegen', gesetz, eintrag },
  }));
  await speichereKommentar(
    kommentarKontext({ ausgangsstelle: ueberschriftAusgangsstelle('010') }),
    markierungsEinzelzugriffFuerTest,
    'Text',
    false,
  );
  expect(vi.mocked(hinzufuegenMarkierung).mock.calls.at(-1)![1]).toMatchObject({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
  });
  vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');
  await speichereKommentar(
    kommentarKontext({
      ausgangsstelle: ueberschriftAusgangsstelle('010'),

      bearbeiten: {
        kommentarText: 'Alt',
        vorher: { elementstand: testElementstand(), kommentarText: 'Alt' },
      },
    }),
    markierungsEinzelzugriffFuerTest,
    'Neu',
    false,
  );
  expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![1]).toMatchObject({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
  });
  expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ziel: expect.objectContaining({ ausgangsstelle: ueberschriftAusgangsstelle('010') }),
    }),
    'opener-fenster',
    undefined,
  );
});

describe('frischer Elementstand pauschaler Kommentare', () => {
  beforeEach(() => {
    vi.mocked(hinzufuegenMarkierung).mockClear();
    vi.mocked(aktualisiereKommentar).mockClear();
    vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');
    vi.mocked(hinzufuegenMarkierung).mockImplementation(async (gesetz, eintrag) => ({
      erfolgreich: true,
      aktion: { art: 'hinzufuegen', gesetz, eintrag },
    }));
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
  });

  it.each([false, true])(
    'Anlegen/Bearbeiten: verwendet den frisch geladenen amtlichen Titel (Bearbeiten=%s)',
    async (bearbeiten) => {
      const aktuell = { ...normDarstellung('§ 1'), titel: 'Frischer Titel' };
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetzDarstellung({
          kurztitel: 'TestG',
          langtitel: 'Test',
          hatGliederungsartikel: false,
          elemente: [{ typ: 'norm', data: aktuell }],
        }),
      ]);
      const vorher = {
        kommentarText: 'Alt',
        elementstand: { titel: 'Alter Titel', textlaenge: 9 },
      };
      const kontext = kommentarKontext({
        ausgangsstelle: normAusgangsstelle('§ 1'),

        aktuellesElement: { ...aktuell, titel: 'Veralteter Fensterstand' },
        ...(bearbeiten ? { bearbeiten: { kommentarText: 'Alt', vorher } } : {}),
      });
      await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Neu', false);
      const stand = { titel: 'Frischer Titel', textlaenge: 0 };
      if (bearbeiten) {
        expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![3].elementstand).toEqual(stand);
        expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
          expect.objectContaining({
            vorher,
            nachher: expect.objectContaining({ elementstand: stand }),
          }),
          'opener-fenster',
          undefined,
        );
      } else
        expect(vi.mocked(hinzufuegenMarkierung).mock.calls.at(-1)![1].bezug.elementstand).toEqual(
          stand,
        );
    },
  );

  it.each([true, false])(
    'speichert bei nichtamtlichem bzw. fehlendem Titel ausschließlich die Textlänge (%s)',
    async (nichtamtlich) => {
      const n = {
        ...normDarstellung('§ 1'),
        titel: nichtamtlich ? 'Nichtamtlicher Titel' : undefined,
        titelIstNichtamtlich: nichtamtlich ? (true as const) : undefined,
      };
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetzDarstellung({
          kurztitel: 'TestG',
          langtitel: 'Test',
          hatGliederungsartikel: false,
          elemente: [{ typ: 'norm', data: n }],
        }),
      ]);
      await speichereKommentar(
        kommentarKontext({
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
        markierungsEinzelzugriffFuerTest,
        'Neu',
        false,
      );
      expect(vi.mocked(hinzufuegenMarkierung).mock.calls.at(-1)![1].bezug.elementstand).toEqual({
        textlaenge: 0,
      });
    },
  );

  it.each(['fehlend', 'mehrdeutig', 'ueberschrift'] as const)(
    'berechnet nur für eine vorhandene %s einen Elementstand',
    async (art) => {
      const n = normDarstellung('§ 1');
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetzDarstellung({
          kurztitel: 'TestG',
          langtitel: 'Test',
          hatGliederungsartikel: false,
          elemente:
            art === 'mehrdeutig'
              ? [
                  { typ: 'norm', data: n },
                  { typ: 'norm', data: { ...n, xmlId: 'zweiter' } },
                ]
              : art === 'ueberschrift'
                ? [
                    {
                      typ: 'ueberschrift',
                      data: {
                        id: 'u',
                        xmlId: 'u',
                        bezeichnung: 'Abschnitt',
                        gliederungskennzahl: '010',
                        ebene: 1,
                      },
                    },
                  ]
                : [],
        }),
      ]);
      await speichereKommentar(
        kommentarKontext({
          ausgangsstelle:
            art === 'ueberschrift' ? ueberschriftAusgangsstelle('010') : normAusgangsstelle('§ 1'),
        }),
        markierungsEinzelzugriffFuerTest,
        'Neu',
        false,
      );
      if (art === 'ueberschrift') {
        expect(vi.mocked(hinzufuegenMarkierung).mock.calls.at(-1)![1].bezug.elementstand).toEqual({
          textlaenge: 9,
        });
      } else {
        expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
      }
    },
  );

  it('entfernt den bisherigen Stand beim Wechsel zum Textbezug und berechnet ihn beim Wechsel zurück', async () => {
    const n = normDarstellung('§ 1');
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetzDarstellung({
        kurztitel: 'TestG',
        langtitel: 'Test',
        hatGliederungsartikel: false,
        elemente: [{ typ: 'norm', data: n }],
      }),
    ]);
    const kontext = kommentarKontext({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      aktuellesElement: n,
      bearbeiten: {
        kommentarText: 'Alt',
        vorher: { kommentarText: 'Alt', elementstand: { textlaenge: 9 } },
        textbezug: {
          textstelle: {
            pfad: bereichPfad('bezeichnung'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 1,
          },
          bezugstext: '§',
        },
      },
    });
    await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Neu', true);
    expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![3]).toMatchObject({
      textstelle: {
        pfad: { typ: 'bereich' as const, bereich: 'bezeichnung' },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      },
      elementstand: undefined,
    });
    await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Neu', false);
    expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![3]).toMatchObject({
      textstelle: undefined,
      elementstand: testElementstand(),
    });
  });
});

it.each(['fehlend', 'aehnlich', 'mehrdeutig'] as const)(
  'Kommentar: erhält gespeicherte Ausgangsdaten bei %s statt veralteten Formularkontext abzuleiten',
  async (art) => {
    vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');
    const n = normDarstellung('§ 9');
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetzDarstellung({
        kurztitel: 'TestG',
        langtitel: 'Test',
        hatGliederungsartikel: false,
        elemente:
          art === 'fehlend'
            ? []
            : art === 'aehnlich'
              ? [{ typ: 'norm', data: normDarstellung('§ 90') }]
              : [
                  { typ: 'norm', data: n },
                  { typ: 'norm', data: { ...n, xmlId: 'zweiter' } },
                ],
      }),
    ]);
    const vorher = { kommentarText: 'Alt' };
    await speichereKommentar(
      kommentarKontext({
        ausgangsstelle: normAusgangsstelle('§ 9'),
        aktuellesElement: n,
        bearbeiten: {
          kommentarText: 'Alt',
          vorher,
          textbezug: {
            textstelle: {
              pfad: bereichPfad('bezeichnung'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 3,
            },
            bezugstext: 'alt',
          },
        },
      }),
      markierungsEinzelzugriffFuerTest,
      'Neu',
      false,
    );
    expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![3]).toEqual({
      textstelle: {
        pfad: bereichPfad('bezeichnung'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      },
      bezugstext: 'alt',
      elementstand: undefined,
    });
  },
);

it('Kommentar: bezieht frischen Bezugstext aus derselben aktuell geprüften Ausgangsnorm', async () => {
  vi.mocked(aktualisiereKommentar).mockResolvedValue('geaendert');
  const n = { ...normDarstellung('§ 9'), titel: 'Frischer Titel' };
  vi.mocked(ladeAlleGesetze).mockResolvedValue([
    gesetzDarstellung({
      kurztitel: 'TestG',
      langtitel: 'Test',
      hatGliederungsartikel: false,
      elemente: [{ typ: 'norm', data: n }],
    }),
  ]);
  const vorher = { kommentarText: 'Alt' };
  await speichereKommentar(
    kommentarKontext({
      ausgangsstelle: normAusgangsstelle('§ 9'),
      aktuellesElement: { ...n, titel: 'Veralteter Titel' },
      bearbeiten: {
        kommentarText: 'Alt',
        vorher,
        textbezug: {
          textstelle: {
            pfad: bereichPfad('amtlicherTitel'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 8,
          },
          bezugstext: 'Alter Ti',
        },
      },
    }),
    markierungsEinzelzugriffFuerTest,
    'Neu',
    true,
  );
  expect(vi.mocked(aktualisiereKommentar).mock.calls.at(-1)![3].bezugstext).toBe('Frischer');
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(async () => []),
}));
