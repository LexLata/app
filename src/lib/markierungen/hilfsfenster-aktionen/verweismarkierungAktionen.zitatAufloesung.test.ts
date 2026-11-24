import { tabFuerTest, holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// verweismarkierungAktionen.zitatAufloesung.test.ts

// Abhängigkeiten werden über Parameter injiziert (siehe Dateikopf der
// getesteten Datei) – daher reichen einfache Fake-Implementierungen statt
// echter Domain-Funktionen oder vi.mock().

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import {
  loeseAmbiguitaeten,
  loeseVerweiszieleAuf,
  loeseZielgesetzAuf,
  type AmbiguitaetenDomainFns,
  type VerweiszieleDomainFns,
} from './verweismarkierungAktionen.zitatAufloesung';
import {
  vollstaendigeBezeichnung,
  pruefeZusatzangabe,
  pruefeZusatzangabeMitKette,
  verweisZuXmlId,
} from '@/lib/domain/norm/norm.index';
import { berechneElementstand, gesetzNormen } from '@/lib/domain/gesetzDarstellungAuswertung';
import type { AmbiguerPunkt, RohNormZitat } from '@/lib/markierungen/zitat/zitat.index';
import { parseZitat } from '@/lib/markierungen/zitat/zitat.index';
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  gesetz,
  normDarstellung as norm,
} from '@/test/markierungen/verweismarkierungAktionenTestAufbau';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

function rohZitat(overrides: Partial<RohNormZitat> = {}): RohNormZitat {
  return {
    normzahlRoh: '1',
    anzeigeText: '§ 1',
    textStart: 0,
    textEnde: 3,
    ...overrides,
  };
}

describe('loeseZielgesetzAuf', () => {
  const testG = gesetz('TestG');
  const alle = [testG, gesetz('GG')];

  it.each([
    ['de-bw', 'de-bw'],
    ['de-bund', 'de-bund'],
    ['eu', 'eu'],
    ['de-sn', 'de-bund'],
    ['unbekannt', 'de-bund'],
  ])('wählt beim Ausgangsnormgeber %s das gleichnamige Ziel %s', (ausgang, erwartet) => {
    const kandidaten = ['eu', 'de-bund', 'de-bw'].map((normgeber) => ({
      kurztitel: 'G',
      normgeber,
    }));
    const ergebnis = loeseZielgesetzAuf(
      { gesetzRoh: 'g' },
      [],
      { kurztitel: 'Ausgang', normgeber: ausgang },
      { kandidaten },
    );
    expect(ergebnis.referenz).toEqual({ kurztitel: 'G', normgeber: erwartet });
    expect(ergebnis.gefunden).toBeUndefined();
  });

  it.each(['de-bund', 'eu', 'de-sn', 'unbekannt'])(
    'meldet mehrere übrige Landesnormgeber für %s als mehrdeutig',
    (normgeber) => {
      const kandidaten = ['de-sn', 'de-by', 'de-bw'].map((normgeber) => ({
        kurztitel: 'LV',
        normgeber,
      }));
      expect(
        loeseZielgesetzAuf(
          { gesetzRoh: 'LV' },
          [],
          { kurztitel: 'Ausgang', normgeber },
          { kandidaten },
        ),
      ).toMatchObject({ referenz: undefined, fehler: 'mehrdeutig' });
    },
  );

  it('deutet ein bereits gewähltes fehlendes Ziel nicht in ein namensgleiches vorhandenes Gesetz um', () => {
    const gespeichert = { kurztitel: 'G', normgeber: 'de-bund' };
    const bw = { ...gesetz('G'), normgeber: 'de-bw' };
    const gewaehlt = new Map([['0', gespeichert]]);
    const ergebnis = loeseZielgesetzAuf(
      { gesetzRoh: 'G', textStart: 0 },
      [bw],
      { kurztitel: 'Ausgang', normgeber: 'de-bw' },
      {
        kandidaten: [bw],
        gewaehlt,
      },
    );
    expect(ergebnis.referenz).toEqual(gespeichert);
    expect(ergebnis.gefunden).toBeUndefined();
  });

  it('löst das manuelle Zitat 5 LV aus einem Bundesgesetz gegen ein Gesetz aus BW auf', () => {
    const ziel = { ...gesetz('LV'), normgeber: 'de-bw' };
    const { zitate } = parseZitat('5 LV', undefined, [ziel]);
    expect(zitate).toHaveLength(1);
    const ausgang = { kurztitel: 'Ausgang', normgeber: 'de-bund' };
    expect(loeseZielgesetzAuf(zitate[0]!, [ziel], ausgang)).toEqual({
      eingabe: 'LV',
      gefunden: ziel,
      referenz: { kurztitel: 'LV', normgeber: 'de-bw' },
    });
  });

  it('löst gesetzRoh case-insensitiv gegen die bekannten Gesetze auf', () => {
    const ergebnis = loeseZielgesetzAuf(
      { gesetzRoh: 'gg' },
      alle,
      gesetzesreferenz({ kurztitel: 'TestG' }),
    );
    expect(ergebnis).toEqual({
      eingabe: 'gg',
      gefunden: alle[1],
      referenz: gesetzesreferenz({ kurztitel: 'GG' }),
    });
  });

  it.each([' ', '\u00a0', '\u202f', '  ', '\t', '\n'])(
    'erhält die Eingabe und vollständige Referenz bei Whitespace %j',
    (abstand) => {
      const ziel = { ...gesetz(`SGB${abstand}IV`), normgeber: 'de-bund' };
      const eingabe = 'sgb iv.';
      const ergebnis = loeseZielgesetzAuf({ gesetzRoh: eingabe }, [ziel], {
        kurztitel: 'TestG',
        normgeber: 'de-bund',
      });
      expect(ergebnis).toEqual({
        eingabe,
        gefunden: ziel,
        referenz: { kurztitel: ziel.kurztitel, normgeber: 'de-bund' },
      });
    },
  );

  it('erhält den gelesenen Schlusspunkt im Parser bis zur bindenden Auswahl', () => {
    const { zitate } = parseZitat('§ 1 BGB.');
    expect(zitate[0]?.gesetzRoh).toBe('BGB.');
    const mit = { ...gesetz('BGB.'), normgeber: 'de-bund' };
    const ohne = { ...gesetz('BGB'), normgeber: 'de-bund' };
    const gewaehlt = new Map([['0', { kurztitel: 'BGB.', normgeber: 'de-bund' }]]);
    expect(
      loeseZielgesetzAuf(zitate[0]!, [ohne, mit], gesetzesreferenz({ kurztitel: 'TestG' }), {
        kandidaten: [ohne],
        gewaehlt,
      }).gefunden,
    ).toBe(mit);
  });

  it('unterscheidet fehlende und mehrdeutige Gesetze ohne eine bindende Auswahl zu setzen', () => {
    const gewaehlt = new Map();
    const kandidaten = [
      { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' },
      { kurztitel: 'SGB\u202fIV', normgeber: 'de-bund' },
    ];
    expect(
      loeseZielgesetzAuf(
        { gesetzRoh: 'SGB IV', textStart: 0 },
        [],
        gesetzesreferenz({ kurztitel: 'TestG' }),
        { kandidaten, gewaehlt },
      ),
    ).toEqual({
      eingabe: 'SGB IV',
      gefunden: undefined,
      referenz: undefined,
      fehler: 'mehrdeutig',
    });
    expect(
      loeseZielgesetzAuf(
        { gesetzRoh: 'Fehlt', textStart: 0 },
        [],
        gesetzesreferenz({ kurztitel: 'TestG' }),
        { kandidaten, gewaehlt },
      ),
    ).toEqual({ eingabe: 'Fehlt', gefunden: undefined, referenz: undefined, fehler: 'fehlend' });
    expect(gewaehlt.size).toBe(0);
  });

  it('fällt ohne gesetzRoh auf das Ausgangsgesetz zurück', () => {
    const ergebnis = loeseZielgesetzAuf(
      { gesetzRoh: undefined },
      alle,
      gesetzesreferenz({ kurztitel: 'TestG' }),
    );
    expect(ergebnis).toEqual({
      eingabe: 'TestG',
      gefunden: testG,
      referenz: gesetzesreferenz({ kurztitel: 'TestG' }),
    });
  });

  it('liefert gefunden: undefined, wenn kein Gesetz passt', () => {
    const ergebnis = loeseZielgesetzAuf(
      { gesetzRoh: 'Unbekannt' },
      alle,
      gesetzesreferenz({ kurztitel: 'TestG' }),
    );
    expect(ergebnis).toEqual({
      eingabe: 'Unbekannt',
      gefunden: undefined,
      referenz: undefined,
      fehler: 'fehlend',
    });
  });
});

describe('loeseAmbiguitaeten', () => {
  function domainFns(overrides: Partial<AmbiguitaetenDomainFns> = {}): AmbiguitaetenDomainFns {
    return {
      verweisZuXmlId: vi.fn(() => '280'),
      gesetzNormen: vi.fn(() => [norm('280')]),
      pruefeZusatzangabe: vi.fn(() => false),
      pruefeZusatzangabeMitKette: vi.fn(() => false),
      ...overrides,
    };
  }

  function ambPunkt(overrides: Partial<AmbiguerPunkt> = {}): AmbiguerPunkt {
    return { index: 1, vorherigerIndex: 0, art: 'absatz', wert: '3', ...overrides };
  }

  it('verwirft den Kandidaten und erweitert den Textbereich des Vorgängers, wenn die Prüfung positiv ausfällt', () => {
    const roh = [rohZitat({ textEnde: 5 }), rohZitat({ textStart: 5, textEnde: 8 })];
    const fns = domainFns({ pruefeZusatzangabe: vi.fn(() => true) });

    const ergebnis = loeseAmbiguitaeten(
      roh,
      [ambPunkt()],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0]).toBe(roh[0]);
    expect(roh[0]!.textEnde).toBe(8);
  });

  it('behält den Kandidaten, wenn die Prüfung negativ ausfällt', () => {
    const roh = [rohZitat(), rohZitat({ normzahlRoh: '3' })];
    const fns = domainFns({ pruefeZusatzangabe: vi.fn(() => false) });

    const ergebnis = loeseAmbiguitaeten(
      roh,
      [ambPunkt()],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(ergebnis).toEqual(roh);
  });

  it('behält den Kandidaten, wenn das Zielgesetz des Vorgängers (noch) nicht gefunden wird', () => {
    const roh = [rohZitat({ gesetzRoh: 'UnbekanntG' }), rohZitat()];
    const fns = domainFns({ pruefeZusatzangabe: vi.fn(() => true) });

    // `alle` enthält "UnbekanntG" absichtlich nicht.
    const ergebnis = loeseAmbiguitaeten(
      roh,
      [ambPunkt()],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(ergebnis).toEqual(roh);
    expect(fns.pruefeZusatzangabe).not.toHaveBeenCalled();
  });

  it('behält den Kandidaten, wenn die Norm des Vorgängers nicht gefunden wird', () => {
    const roh = [rohZitat(), rohZitat()];
    const fns = domainFns({ verweisZuXmlId: vi.fn(() => null) });

    const ergebnis = loeseAmbiguitaeten(
      roh,
      [ambPunkt()],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(ergebnis).toEqual(roh);
  });

  it('nutzt pruefeZusatzangabeMitKette statt pruefeZusatzangabe, wenn eine Verfeinerungskette vorliegt', () => {
    const roh = [rohZitat(), rohZitat()];
    const fns = domainFns({ pruefeZusatzangabeMitKette: vi.fn(() => true) });

    loeseAmbiguitaeten(
      roh,
      [ambPunkt({ verfeinerung: [{ art: 'satz', wert: '2' }] })],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(fns.pruefeZusatzangabeMitKette).toHaveBeenCalledTimes(1);
    expect(fns.pruefeZusatzangabe).not.toHaveBeenCalled();
  });

  it('gibt roh unverändert (dieselbe Referenz) zurück, wenn nichts verworfen wird', () => {
    const roh = [rohZitat(), rohZitat()];
    const fns = domainFns();

    const ergebnis = loeseAmbiguitaeten(
      roh,
      [ambPunkt()],
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      fns,
    );

    expect(ergebnis).toBe(roh);
  });
});

describe('loeseVerweiszieleAuf', () => {
  const KEIN_FEHLGESCHLAGENER_IMPORT: ReadonlyMap<string, string | undefined> = new Map();

  function domainFns(overrides: Partial<VerweiszieleDomainFns> = {}): VerweiszieleDomainFns {
    return {
      verweisZuXmlId: vi.fn(() => '1'),
      gesetzNormen: vi.fn(() => [norm('1')]),

      vollstaendigeBezeichnung: vi.fn(() => '§ 1'),
      berechneElementstand: vi.fn(() => ({ titel: undefined, textlaenge: 42 })),
      ...overrides,
    };
  }

  it('behält das eigene Gesetz bei gleichem Kurztitel verschiedener Normgeber', () => {
    const bund = { ...gesetz('TestG'), normgeber: 'de-bund' };
    const bw = { ...gesetz('TestG'), normgeber: 'de-bw' };
    expect(
      loeseZielgesetzAuf({}, [bund, bw], { kurztitel: 'testg', normgeber: 'de-bw' }).gefunden,
    ).toBe(bw);
    const fns = domainFns();
    const { verweisziele } = loeseVerweiszieleAuf(
      [rohZitat()],
      [bund, bw],
      { kurztitel: 'testg', normgeber: 'de-bw' },
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );
    expect(fns.verweisZuXmlId).toHaveBeenCalledWith(bw, '1');
    expect(verweisziele[0]?.gesetz).toBeUndefined();
  });

  it('trägt den Normgeber eines aufgelösten externen Ziels weiter', () => {
    const ziel = { ...gesetz('GG'), normgeber: 'de-bund' };
    const { verweisziele } = loeseVerweiszieleAuf(
      [rohZitat({ gesetzRoh: 'gg' })],
      [ziel],
      { kurztitel: 'TestG', normgeber: 'de-bw' },
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      domainFns(),
    );
    expect(verweisziele[0]?.gesetz).toEqual({ kurztitel: 'GG', normgeber: 'de-bund' });
  });

  it('legt für ohneZiel-Zitate eine reine Zusatzinformation ohne Zielauflösung an', () => {
    const zitate = [rohZitat({ ohneZiel: true, textStart: 4, textEnde: 10 })];
    const fns = domainFns();

    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(fehlerListe).toEqual([]);
    expect(verweisziele).toEqual([]);
    expect(fns.verweisZuXmlId).not.toHaveBeenCalled();
  });

  it('übernimmt bei ohneElementstand=true die Rohangabe ohne Existenzprüfung', () => {
    const zitate = [rohZitat({ normzahlRoh: '9999' })];
    const fns = domainFns({ verweisZuXmlId });

    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      true,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(fehlerListe).toEqual([]);
    expect(verweisziele).toEqual([
      verweisziel({
        typ: 'zielnormOhneElementstand',
        bezeichnung: '9999',

        verweistextZeichenbereich: [0, 3],
      }),
    ]);
  });

  it('meldet "ist nicht auf dem Gerät", wenn kein Fehlschlag bekannt ist', () => {
    const zitate = [rohZitat({ gesetzRoh: 'UnbekanntG' })];

    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      domainFns(),
      { kandidaten: [gesetzesreferenz({ kurztitel: 'UnbekanntG' })] },
    );

    expect(verweisziele).toEqual([]);
    expect(fehlerListe).toEqual([
      {
        art: 'gesetz',
        text: 'UnbekanntG ist nicht auf dem Gerät.',
        gesetz: gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
      },
    ]);
  });

  it('bevorzugt einen konkreten Fehlertext aus fehlgeschlageneImports', () => {
    const zitate = [rohZitat({ gesetzRoh: 'UnbekanntG' })];
    const fehlgeschlagen = new Map([['["de-bund","unbekanntg"]', 'Keine Internetverbindung.']]);

    const { fehlerListe } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      fehlgeschlagen,
      domainFns(),
      { kandidaten: [gesetzesreferenz({ kurztitel: 'UnbekanntG' })] },
    );

    expect(fehlerListe).toEqual([
      {
        art: 'gesetz',
        text: 'Keine Internetverbindung.',
        gesetz: gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
      },
    ]);
  });

  it('zeigt "konnte nicht importiert werden", wenn ein Fehlschlag ohne konkreten Text bekannt ist', () => {
    const zitate = [rohZitat({ gesetzRoh: 'UnbekanntG' })];
    const fehlgeschlagen = new Map<string, string | undefined>([
      ['["de-bund","unbekanntg"]', undefined],
    ]);

    const { fehlerListe } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      fehlgeschlagen,
      domainFns(),
      { kandidaten: [gesetzesreferenz({ kurztitel: 'UnbekanntG' })] },
    );

    expect(fehlerListe).toEqual([
      {
        art: 'gesetz',
        text: 'UnbekanntG konnte nicht importiert werden.',
        gesetz: gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
      },
    ]);
  });

  it('meldet dasselbe unbekannte Kurztitel innerhalb eines Aufrufs nur einmal', () => {
    const zitate = [
      rohZitat({ gesetzRoh: 'UnbekanntG', normzahlRoh: '434' }),
      rohZitat({ gesetzRoh: 'unbekanntg', normzahlRoh: '90' }),
    ];

    const { fehlerListe } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      domainFns(),
      { kandidaten: [gesetzesreferenz({ kurztitel: 'UnbekanntG' })] },
    );

    expect(fehlerListe).toHaveLength(1);
  });

  it('legt bei Verweisen auf ganze Gesetze kein Normziel an und prüft keine Norm-Existenz', () => {
    const zitate = [rohZitat({ gesetzRoh: 'GG', normzahlRoh: '', ganzesGesetz: true })];
    const fns = domainFns();

    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG'), gesetz('GG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(fehlerListe).toEqual([]);
    expect(verweisziele).toEqual([
      verweisziel({
        typ: 'ganzesGesetz',
        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

        verweistextZeichenbereich: [0, 3],
      }),
    ]);
    expect(fns.verweisZuXmlId).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler, wenn die Norm im gefundenen Gesetz nicht existiert', () => {
    const zitate = [rohZitat({ normzahlRoh: '9999', anzeigeText: '§ 9999' })];
    const fns = domainFns({ verweisZuXmlId: vi.fn(() => null) });

    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(verweisziele).toEqual([]);
    expect(fehlerListe).toEqual([
      {
        art: 'norm',
        text: '§ 9999 existiert nicht in TestG.',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      },
    ]);
  });

  it.each(['§ § 90', '§§ § 90', '§ § 90 BGB', '§§ § 90 BGB'])(
    'löst wiederholte Paragraphenzeichen in %s auf den tatsächlichen Paragraphen auf',
    (text) => {
      const ziel = gesetz('BGB', [{ typ: 'norm', data: norm('90') }]);
      const { zitate } = parseZitat(text);
      const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
        zitate,
        [ziel],
        gesetzesreferenz({ kurztitel: 'BGB' }),
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
        {
          verweisZuXmlId,
          gesetzNormen,

          vollstaendigeBezeichnung,
          berechneElementstand,
        },
      );
      expect(fehlerListe).toEqual([]);
      expect(verweisziele).toHaveLength(1);
      expect(verweisziele[0]).toMatchObject({
        bezeichnung: '§ 90',

        verweistextZeichenbereich: [0, text.length],
      });
    },
  );

  it('nennt den Binnenparagraphen im Fehlertext der nicht vorhandenen Zielnorm', () => {
    const { zitate } = parseZitat('Art. 229 § 2 EGBGB');
    const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('EGBGB')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      domainFns({ verweisZuXmlId: vi.fn(() => null) }),
    );
    expect(verweisziele).toEqual([]);
    expect(fehlerListe).toEqual([
      {
        art: 'norm',
        text: 'Art. 229 § 2 existiert nicht in EGBGB.',
        gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
      },
    ]);
  });

  it('löst eine gefundene Norm vollständig auf (Bezeichnung, Präfix, elementstand)', () => {
    const fns = domainFns({
      vollstaendigeBezeichnung: vi.fn(() => '§ 1'),
      berechneElementstand: vi.fn(() => ({ titel: 'Titel', textlaenge: 123 })),
    });
    const zitate = [rohZitat({ textStart: 0, textEnde: 3 })];

    const { verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(verweisziele).toEqual([
      verweisziel({
        typ: 'zielnorm',
        gesetz: undefined,
        bezeichnung: '§ 1',

        verweistextZeichenbereich: [0, 3],
        elementstand: { titel: 'Titel', textlaenge: 123 },
      }),
    ]);
  });

  it('markiert das Zielgesetz als "gesetz", wenn extern zitiert wird', () => {
    const fns = domainFns();
    const zitate = [rohZitat({ gesetzRoh: 'GG' })];

    const { verweisziele } = loeseVerweiszieleAuf(
      zitate,
      [gesetz('TestG'), gesetz('GG')],
      gesetzesreferenz({ kurztitel: 'TestG' }),
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      fns,
    );

    expect(verweisziele[0]).toMatchObject({ gesetz: gesetzesreferenz({ kurztitel: 'GG' }) });
  });
});

describe('angelegte Verweise mit kompakten Normbezeichnungen', () => {
  it.each(['§31', 'Artikel31', 'Can.31', 'canon31', 'c.31'])(
    'bleibt von der Eingabe bis zum Klick auf %s auflösbar',
    async (bezeichnung) => {
      const domain = await import('@/lib/domain/norm/norm.index');
      const helfer = await import('@/lib/domain/gesetzDarstellungAuswertung');
      const { useGesetzOeffnen } = await import('@/hooks/tabs/useGesetzOeffnen');
      const { act, createElement } = await import('react');
      const { createRoot } = await import('react-dom/client');
      const { parseHTML } = await import('linkedom');
      const g = gesetz('TestG', [{ typ: 'norm', data: { ...norm('ziel'), bezeichnung } }]);
      const ergebnis = loeseVerweiszieleAuf(parseZitat('31').zitate, [g], g, false, new Map(), {
        ...domain,
        ...helfer,
      });
      expect(ergebnis.fehlerListe).toEqual([]);
      expect(ergebnis.verweisziele).toHaveLength(1);
      expect(ergebnis.verweisziele[0]).toMatchObject({
        bezeichnung,
      });
      const dom = parseHTML('<html><body><main></main></body></html>');
      vi.stubGlobal('window', dom.window);
      vi.stubGlobal('document', dom.document);
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const root = createRoot(document.querySelector('main')!);
      const oeffnen = vi.fn<Parameters<typeof useGesetzOeffnen>[0]['gesetzOeffnen']>(() => 'tab');
      let navigation!: ReturnType<typeof useGesetzOeffnen>;
      const tabsRef: Parameters<typeof useGesetzOeffnen>[0]['tabsRef'] = {
        current: [tabFuerTest({ id: 'tab', gesetz: g })],
      };
      function TestApp() {
        navigation = useGesetzOeffnen({
          holeTabGesetz: holeTabGesetzFuerTest,
          tabs: tabsRef.current,
          tabsRef,
          aktiverTabIdRef: { current: 'tab' },
          gesetzOeffnen: oeffnen,
          erstelleLeerenTab: () => {},
          sprung: vi.fn(),
          verlaufHinzufuegen: vi.fn(),
          verlaufSetzen: vi.fn(),
          verlaufFristStoppen: () => {},
          ladeGesetz: einzelzugriffFuerTest(async () => ({
            liste: [g],
            befunde: [],
            ordnerLesbar: true,
          })),
        });
        return null;
      }
      try {
        await act(async () => root.render(createElement(TestApp)));
        await act(async () =>
          navigation.handleVerweisKlick('start', ergebnis.verweisziele[0]!, false),
        );
        expect(oeffnen).toHaveBeenCalledOnce();
        expect(oeffnen.mock.calls[0]?.slice(0, 2)).toEqual([g, 'ziel']);
      } finally {
        act(() => root.unmount());
        vi.unstubAllGlobals();
      }
    },
  );
});

describe('exakte Auflösung mit echten Domain-Funktionen', () => {
  const fns = {
    verweisZuXmlId,
    gesetzNormen,

    vollstaendigeBezeichnung,
    berechneElementstand,
    pruefeZusatzangabe,
    pruefeZusatzangabeMitKette,
  };
  it.each([
    {
      text: '§ 5 Abs. 1, 7, 2',
      absaetze: ['2'],
      normzahlen: ['5', '7'],
      bereiche: [
        [0, 12],
        [12, 16],
      ],
    },
    {
      text: '§ 5 Abs. 1, 7, 2, 3',
      absaetze: ['2', '3'],
      normzahlen: ['5', '7'],
      bereiche: [
        [0, 12],
        [12, 19],
      ],
    },
    { text: '§ 5 Abs. 1, 2, 3', absaetze: ['2', '3'], normzahlen: ['5'], bereiche: [[0, 16]] },
    {
      text: '§ 5 Abs. 1, 7, 2',
      absaetze: [],
      normzahlen: ['5', '7', '2'],
      bereiche: [
        [0, 12],
        [12, 15],
        [15, 16],
      ],
    },
  ])(
    'kachelt nach Auflösung von $text mit Absätzen $absaetze',
    ({ text, absaetze, normzahlen, bereiche }) => {
      const g = gesetz('TestG', [
        {
          typ: 'norm',
          data: norm(
            '5',
            absaetze.map((name) => ({ id: `abs${name}`, bezeichnung: name, saetze: [] })),
          ),
        },
      ]);
      const { zitate, ambiguitaeten } = parseZitat(text);
      const ergebnis = loeseAmbiguitaeten(zitate, ambiguitaeten, [g], g, fns);
      expect(ergebnis.map(({ textStart, textEnde }) => [textStart, textEnde])).toEqual(bereiche);
      if (absaetze.length === 0) expect(ergebnis).toBe(zitate);
      expect(ergebnis.map(({ normzahlRoh }) => normzahlRoh)).toEqual(normzahlen);
    },
  );

  it('erhält Text und Arrayreferenz ohne verfügbares Zielgesetz', () => {
    const text = '§ 5 Abs. 1, 7, 2';
    const { zitate, ambiguitaeten } = parseZitat(text);
    const vorher = structuredClone(zitate);
    expect(
      loeseAmbiguitaeten(zitate, ambiguitaeten, [], gesetzesreferenz({ kurztitel: 'TestG' }), fns),
    ).toBe(zitate);
    expect(zitate).toEqual(vorher);
  });

  it('kachelt nach jedem zulässigen Auflösungsverlauf und prüft stets am fachlichen Anker', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (verwerfen) => {
        const zahlen = verwerfen.map((_, index) => String(index + 2));
        const text = `§ 5 Abs. 1, ${zahlen.join(', ')}`;
        const { zitate, ambiguitaeten } = parseZitat(text);
        expect(ambiguitaeten).toHaveLength(verwerfen.length);
        expect(ambiguitaeten.every(({ vorherigerIndex }) => vorherigerIndex === 0)).toBe(true);
        const g = gesetz('TestG');
        const norm5 = norm('5');
        const pruefen = vi.fn<AmbiguitaetenDomainFns['pruefeZusatzangabe']>(
          (_norm, _art, wert) => verwerfen[zahlen.indexOf(wert)]!,
        );
        const nachschlagen = vi.fn<AmbiguitaetenDomainFns['verweisZuXmlId']>(() => '5');
        const ergebnis = loeseAmbiguitaeten(zitate, ambiguitaeten, [g], g, {
          ...fns,
          verweisZuXmlId: nachschlagen,
          gesetzNormen: () => [norm5],
          pruefeZusatzangabe: pruefen,
        });
        expect(pruefen.mock.calls.map(([n, art, wert]) => [n, art, wert])).toEqual(
          zahlen.map((wert) => [norm5, 'absatz', wert]),
        );
        expect(nachschlagen.mock.calls).toEqual(zahlen.map(() => [g, '§ 5']));
        expect(ergebnis.map(({ normzahlRoh }) => normzahlRoh)).toEqual([
          '5',
          ...zahlen.filter((_, index) => !verwerfen[index]),
        ]);
        expect(ergebnis[0]!.textStart).toBe(0);
        expect(ergebnis.at(-1)!.textEnde).toBe(text.length);
        for (const [index, zitat] of ergebnis.entries()) {
          expect(zitat.textEnde).toBeGreaterThanOrEqual(zitat.textStart);
          if (index > 0) expect(zitat.textStart).toBe(ergebnis[index - 1]!.textEnde);
        }
        if (!verwerfen.some(Boolean)) expect(ergebnis).toBe(zitate);
      }),
      { seed: 987654321, numRuns: 1000 },
    );
  });
  it.each(['§', 'Art.', 'Can.'])('speichert kein Teilstring-Ziel für %s 9', (praefix) => {
    const g = gesetz('TestG', [
      { typ: 'norm', data: { ...norm('90'), bezeichnung: `${praefix} 90` } },
    ]);
    const ergebnis = loeseVerweiszieleAuf(
      [rohZitat({ normzahlRoh: '9', praefix: [praefix] })],
      [g],
      g,
      false,
      new Map(),
      fns,
    );
    expect(ergebnis.verweisziele).toEqual([]);
    expect(ergebnis.fehlerListe).toEqual([expect.objectContaining({ art: 'norm' })]);
  });
  it('erhält den Vorrang von Einzelnormen und ausdrücklich genannten weggefallenen Sammelnormen', () => {
    const gesammelt = {
      ...norm('sammel'),
      bezeichnung: '§§ 3 bis 6',
      status: 'weggefallen' as const,
    };
    const g = gesetz('TestG', [
      { typ: 'norm', data: gesammelt },
      { typ: 'norm', data: norm('3') },
    ]);
    const roh = [3, 4, 6].map((zahl) => rohZitat({ normzahlRoh: String(zahl), praefix: ['§'] }));
    const ergebnis = loeseVerweiszieleAuf(roh, [g], g, false, new Map(), fns);
    expect(ergebnis.fehlerListe).toEqual([expect.objectContaining({ art: 'norm' })]);
    expect(ergebnis.verweisziele).toEqual([
      expect.objectContaining({ bezeichnung: '§ 3' }),
      expect.objectContaining({ bezeichnung: '§§ 3 bis 6' }),
    ]);
  });

  it('behält in einem gemischten Gesetz die Art.-Familie für Zahlenketten', () => {
    const elemente = [5, 7].flatMap((zahl) => [
      { typ: 'norm' as const, data: norm(String(zahl)) },
      { typ: 'norm' as const, data: { ...norm(`a${zahl}`), bezeichnung: `Art. ${zahl}` } },
    ]);
    const g = gesetz('TestG', elemente);
    const ergebnis = loeseVerweiszieleAuf(
      parseZitat('Artt. 5, 7').zitate,
      [g],
      g,
      false,
      new Map(),
      fns,
    );
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele).toEqual(
      [5, 7].map((zahl) => expect.objectContaining({ bezeichnung: 'Art. ' + String(zahl) })),
    );
  });

  it('behält den Komma-Kandidaten, wenn die vorherige Norm nur als Teilstring existiert', () => {
    const g = gesetz('TestG', [
      { typ: 'norm', data: norm('90', [{ id: 'abs2', bezeichnung: '2', saetze: [] }]) },
    ]);
    const { zitate, ambiguitaeten } = parseZitat('§ 9 Abs. 1, 2');
    expect(loeseAmbiguitaeten(zitate, ambiguitaeten, [g], g, fns)).toHaveLength(2);
  });
  it('weist symbolfreie Mehrdeutigkeit zurück und erhält explizite Präfixe ohne Elementstand', () => {
    const g = gesetz('TestG', [
      { typ: 'norm', data: norm('8') },
      { typ: 'norm', data: { ...norm('c8'), bezeichnung: 'Can. 8' } },
    ]);
    expect(
      loeseVerweiszieleAuf([rohZitat({ normzahlRoh: '8' })], [g], g, false, new Map(), fns)
        .fehlerListe[0]!.art,
    ).toBe('norm');
    expect(
      loeseVerweiszieleAuf(
        [rohZitat({ normzahlRoh: '9', praefix: ['Can.'] })],
        [g],
        g,
        true,
        new Map(),
        fns,
      ).verweisziele[0],
    ).toMatchObject({ bezeichnung: 'Can. 9' });
  });
});

// Neue Trenner verwenden dieselbe Existenzprüfung am Absatzanker.
it.each(['und', '/', '-', 'bis', ', und /'])(
  'Absatzfortsetzung mit %s wird nur bei vorhandenem Zusatz verworfen',
  (trenner) => {
    for (const vorhanden of [true, false]) {
      const text = `§ 5 Abs. 1 ${trenner} 3 BGB`;
      const { zitate, ambiguitaeten } = parseZitat(text);
      const pruefung = vi.fn(() => vorhanden);
      const ergebnis = loeseAmbiguitaeten(
        zitate,
        ambiguitaeten,
        [gesetz('BGB')],
        gesetzesreferenz({ kurztitel: 'TestG' }),
        {
          verweisZuXmlId: () => '5',
          gesetzNormen: () => [norm('5')],
          pruefeZusatzangabe: pruefung,
          pruefeZusatzangabeMitKette: () => false,
        },
      );
      expect(ambiguitaeten).toHaveLength(1);
      expect(pruefung).toHaveBeenCalledTimes(1);
      expect(ergebnis.map((z) => z.normzahlRoh)).toEqual(vorhanden ? ['5'] : ['5', '3']);
      expect(ergebnis[0]!.textStart).toBe(0);
      expect(ergebnis.at(-1)!.textEnde).toBe(text.length);
      if (!vorhanden) expect(ergebnis[0]!.textEnde).toBe(ergebnis[1]!.textStart);
      const fehlendesGesetz = loeseAmbiguitaeten(
        zitate,
        ambiguitaeten,
        [],
        gesetzesreferenz({ kurztitel: 'TestG' }),
        {
          verweisZuXmlId: () => '5',
          gesetzNormen: () => [norm('5')],
          pruefeZusatzangabe: () => true,
          pruefeZusatzangabeMitKette: () => true,
        },
      );
      expect(fehlendesGesetz).toBe(zitate);
    }
  },
);

// Dateigrenze im Rundlauf ersetzt; Auflösung, Speicher und XML bleiben echt.
const rundlaufDatei = vi.hoisted(() => ({ xml: '' }));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'rundlauf',
  schliessePruefpflichtigeQuelleAb: async () => true,
  mitGesetzDateiSperre: (
    _gesetz: unknown,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => aktion('rundlauf'),
  sicherstelleOrdner: async () => {},
  ermittleGesetzDateipfad: async () => 'rundlauf.xml',
  appDatenLesen: async () => null,
  sichereBeiUngueltigemInhalt: async () => ({ status: 'fehlt' }),
  nutzerdatenSchreiben: async (_pfad: string, xml: string) => {
    rundlaufDatei.xml = xml;
  },
}));

async function speichereUndLiesRundlauf(
  ausgang: Parameters<typeof loeseVerweiszieleAuf>[2],
  eintrag: import('@/lib/markierungen/gemeinsam/gemeinsam.index').MarkierungsEintrag,
) {
  const { aendereEintraege } = await import('@/lib/markierungen/eintrag/eintrag.index');
  const { parseEintraege } =
    await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  rundlaufDatei.xml = '';
  await aendereEintraege(ausgang, () => ({
    art: 'geaendert',
    eintraege: [eintrag],
    ergebnis: undefined,
  }));
  expect(rundlaufDatei.xml).toContain('<markierungen');
  return parseEintraege(rundlaufDatei.xml, ausgang).eintraege[0]!;
}

async function oeffneRundlaufZiel(
  alle: Parameters<typeof loeseVerweiszieleAuf>[1],
  zielnorm: import('@/lib/markierungen/gemeinsam/gemeinsam.index').Verweisziel,
  erwartet: Parameters<typeof loeseVerweiszieleAuf>[1][number],
  xmlId: string | undefined,
) {
  const { useGesetzOeffnen } = await import('@/hooks/tabs/useGesetzOeffnen');
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { parseHTML } = await import('linkedom');
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.querySelector('main')!);
  const oeffnen = vi.fn<Parameters<typeof useGesetzOeffnen>[0]['gesetzOeffnen']>(() => 'tab');
  let navigation!: ReturnType<typeof useGesetzOeffnen>;
  const tabsRef: Parameters<typeof useGesetzOeffnen>[0]['tabsRef'] = {
    current: [tabFuerTest({ id: 'tab', gesetz: alle[0] })],
  };
  function TestApp() {
    navigation = useGesetzOeffnen({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabs: tabsRef.current,
      tabsRef,
      aktiverTabIdRef: { current: 'tab' },
      gesetzOeffnen: oeffnen,
      erstelleLeerenTab: () => {},
      sprung: vi.fn(),
      verlaufHinzufuegen: vi.fn(),
      verlaufSetzen: vi.fn(),
      verlaufFristStoppen: () => {},
      ladeGesetz: einzelzugriffFuerTest(async () => ({
        liste: alle,
        befunde: [],
        ordnerLesbar: true,
      })),
    });
    return null;
  }
  try {
    await act(async () => root.render(createElement(TestApp)));
    await act(async () => navigation.handleVerweisKlick('start', zielnorm, false));
    expect(oeffnen).toHaveBeenCalledOnce();
    expect(oeffnen.mock.calls[0]?.slice(0, 2)).toEqual([erwartet, xmlId]);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
}
describe('Zitat → Zielauflösung → MarkierungsXML → Öffnung', () => {
  const domainFns = {
    verweisZuXmlId,

    vollstaendigeBezeichnung,
    gesetzNormen,
    berechneElementstand,
  };
  it('erhält beim gemischten Verweis genau die Norm und das ganze Gesetz', async () => {
    const ausgang = gesetz('TestG');
    const egbgb = gesetz('EGBGB', [{ typ: 'norm', data: norm('6') }]);
    const gg = gesetz('GG');
    const alle = [ausgang, egbgb, gg];
    const text = '§ 6 EGBGB, Abs. 3 und GG';
    const { zitate } = parseZitat(text, undefined, alle);
    const ergebnis = loeseVerweiszieleAuf(zitate, alle, ausgang, false, new Map(), domainFns);
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele).toHaveLength(2);
    expect(ergebnis.verweisziele.map((z) => z.typ)).toEqual(['zielnorm', 'ganzesGesetz']);
    const gelesen = await speichereUndLiesRundlauf(
      ausgang,
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        verweisinhalt: { verweistext: text, verweisziele: ergebnis.verweisziele },
      }),
    );
    expect(gelesen.verweisinhalt?.verweistext).toBe(text);
    expect(gelesen.verweisinhalt?.verweisziele).toEqual(ergebnis.verweisziele);
    const [normziel, gesetzZiel] = ergebnis.verweisziele;
    if (!normziel || !gesetzZiel) throw new Error('Beide Verweisziele werden erwartet.');
    await oeffneRundlaufZiel(alle, normziel, egbgb, '6');
    await oeffneRundlaufZiel(alle, gesetzZiel, gg, undefined);
  });
  const faelle = [false, true].flatMap((ohneElementstand) =>
    [false, true].flatMap((mitBezugstext) =>
      ['Ausgangsgesetz', 'externes Gesetz'].map((art) => ({
        art,
        mitBezugstext,
        ohneElementstand,
      })),
    ),
  );
  it.each(faelle)(
    'öffnet das ganze $art (Bezugstext=$mitBezugstext, Trotzdem=$ohneElementstand)',
    async ({ art, mitBezugstext, ohneElementstand }) => {
      const ausgang = {
        ...gesetz('TestG', [{ typ: 'norm', data: norm('1') }]),
        normgeber: 'de-bund',
      };
      const ziel =
        art === 'Ausgangsgesetz'
          ? ausgang
          : {
              ...gesetz('ZielG', [{ typ: 'norm', data: norm('90') }]),
              normgeber: 'de-bw',
              kurztitel: 'ZielG',
            };
      const alle = ziel === ausgang ? [ausgang] : [ausgang, ziel];
      const text = ziel.kurztitel;
      const { zitate } = parseZitat(text, undefined, alle);
      const aufloesung = loeseVerweiszieleAuf(
        zitate,
        ohneElementstand ? [] : alle,
        ausgang,
        ohneElementstand,
        new Map(),
        domainFns,
        { kandidaten: alle },
      );
      expect(aufloesung.fehlerListe).toEqual([]);
      const gelesen = await speichereUndLiesRundlauf(
        ausgang,
        markierungsEintrag({
          typ: 'verweismarkierung',
          ausgangsstelle: normAusgangsstelle('§ 1'),

          ...(mitBezugstext
            ? {
                bezug: {
                  typ: 'bezugstext' as const,
                  textstelle: {
                    pfad: normtextPfad({}),
                    zeichenbereichStart: 0,
                    zeichenbereichEnde: text.length,
                  },
                  bezugstext: text,
                },
              }
            : { bezug: { typ: 'pauschal' as const, elementstand: testElementstand() } }),
          verweisinhalt: { verweistext: text, verweisziele: aufloesung.verweisziele },
        }),
      );
      expect(rundlaufDatei.xml).toContain(
        `<gesetz normgeber="${ziel.normgeber}">${ziel.kurztitel}</gesetz>`,
      );
      expect(gelesen.bezug.bezugstext).toBe(mitBezugstext ? text : undefined);
      const zielnorm = gelesen.verweisinhalt!.verweisziele[0]!;
      expect(zielnorm).toMatchObject(
        verweisziel({
          typ: 'ganzesGesetz',
          gesetz: { kurztitel: ziel.kurztitel, normgeber: ziel.normgeber },

          verweistextZeichenbereich: [0, text.length],
        }),
      );
      expect(zielnorm.elementstand).toBeUndefined();
      await oeffneRundlaufZiel(alle, zielnorm, ziel, undefined);
    },
  );
  it.each([false, true])(
    'erhält konkrete Ausgangsnormen und reine Zusatzinformation (Trotzdem=%s)',
    async (ohneElementstand) => {
      const ausgang = {
        ...gesetz('TestG', [{ typ: 'norm', data: norm('1') }]),
        normgeber: 'de-bund',
      };
      for (const text of ['§ 1', 'Abs. 3']) {
        const { zitate } = parseZitat(text);
        const aufloesung = loeseVerweiszieleAuf(
          zitate,
          [ausgang],
          ausgang,
          ohneElementstand,
          new Map(),
          domainFns,
        );
        expect(aufloesung.fehlerListe).toEqual([]);
        const gelesen = await speichereUndLiesRundlauf(
          ausgang,
          markierungsEintrag({
            bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
            typ: 'verweismarkierung',
            ausgangsstelle: normAusgangsstelle('§ 1'),

            verweisinhalt: { verweistext: text, verweisziele: aufloesung.verweisziele },
          }),
        );
        if (text === 'Abs. 3') {
          expect(gelesen.verweisinhalt!.verweisziele).toEqual([]);
        } else {
          const ziel = gelesen.verweisinhalt!.verweisziele[0]!;
          expect(ziel.gesetz).toBeUndefined();
          expect(ziel.bezeichnung).toBe('§ 1');
          expect(Boolean(ziel.elementstand)).toBe(!ohneElementstand);
          await oeffneRundlaufZiel([ausgang], ziel, ausgang, '1');
        }
      }
    },
  );
});
