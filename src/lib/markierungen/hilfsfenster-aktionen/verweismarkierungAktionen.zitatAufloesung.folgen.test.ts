// Verhaltenstests für spätere Gesetzesangaben und Folgenummern unter Gliederungsartikeln.
import { gliederungsartikel, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, expect, it } from 'vitest';
import { parseZitat } from '@/lib/markierungen/zitat/zitat.index';
import {
  verweisZuXmlId,
  vollstaendigeBezeichnung,
  pruefeZusatzangabe,
  pruefeZusatzangabeMitKette,
} from '@/lib/domain/norm/norm.index';
import { gesetzNormen, berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import { gesetz, normDarstellung } from '@/test/markierungen/verweismarkierungAktionenTestAufbau';
import {
  loeseAmbiguitaeten,
  loeseVerweiszieleAuf,
} from './verweismarkierungAktionen.zitatAufloesung';
import type { GesetzDarstellung, DarstellungsElement } from '@/lib/domain/gesetzTypes';

const fns = {
  verweisZuXmlId,

  vollstaendigeBezeichnung,
  pruefeZusatzangabe,
  pruefeZusatzangabeMitKette,
  gesetzNormen,
  berechneElementstand,
};

function artikel(zahl: string, gliederung = false): DarstellungsElement {
  return {
    typ: 'norm',
    data: gliederung
      ? gliederungsartikel({
          ...normDarstellung(zahl),
          art: 'gliederungsartikel',
          bezeichnung: `Art. ${zahl}`,
          gliederungsEbene: 0,
        })
      : { ...normDarstellung(zahl), bezeichnung: `Art. ${zahl}` },
  };
}

function egbgb(binnen: string[] = ['3', '4'], mitArtikel4 = true): GesetzDarstellung {
  return {
    ...gesetz('EGBGB', [
      ...(mitArtikel4 ? [artikel('4')] : []),
      artikel('229', true),
      ...binnen.map((zahl): DarstellungsElement => ({
        typ: 'norm',
        data: { ...normDarstellung(`229-${zahl}`), bezeichnung: `§ ${zahl}` },
      })),
    ]),
    hatGliederungsartikel: true,
  };
}

function aufloesen(text: string, alle = [gesetz('BGB'), egbgb()]) {
  const { zitate, ambiguitaeten } = parseZitat(text);
  const ausgang = gesetzesreferenz({ kurztitel: 'BGB' });
  const aufgeloest = loeseAmbiguitaeten(zitate, ambiguitaeten, alle, ausgang, fns);
  return loeseVerweiszieleAuf(aufgeloest, alle, ausgang, false, new Map(), fns);
}

describe('Folgen unter Gliederungsartikeln', () => {
  it('speichert verfügbare Binnenparagraphen auch ohne Elementstand mit vollständiger Bezeichnung', () => {
    const { zitate } = parseZitat('Art 229 § 3, 4 EGBGB');
    const ergebnis = loeseVerweiszieleAuf(
      zitate,
      [gesetz('BGB'), egbgb()],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      true,
      new Map(),
      fns,
    );
    expect(ergebnis.verweisziele[1]).toMatchObject({
      bezeichnung: 'Art. 229 § 4',
    });
    expect(ergebnis.verweisziele[1]?.elementstand).toBeUndefined();
  });

  it('erhält ein erfolgreich bestimmtes späteres Gesetz auch beim Speichern ohne Elementstand', () => {
    const { zitate } = parseZitat('Art 229 § 3, Art 229 § 4 EGBGB');
    const alle = [gesetz('BGB'), egbgb()];
    const ausgang = gesetzesreferenz({ kurztitel: 'BGB' });
    const auswahl = { kandidaten: alle, gewaehlt: new Map() };
    loeseVerweiszieleAuf(zitate, alle, ausgang, false, new Map(), fns, auswahl);
    const ergebnis = loeseVerweiszieleAuf(zitate, alle, ausgang, true, new Map(), fns, auswahl);
    expect(ergebnis.verweisziele[0]?.gesetz).toEqual(gesetzesreferenz({ kurztitel: 'EGBGB' }));
  });

  it('deutet eine bereits bestimmte spätere Gesetzesreferenz bei fehlender Datei nicht um', () => {
    const { zitate } = parseZitat('Art 229 § 3, Art 229 § 4 EGBGB');
    const ziel = gesetzesreferenz({ kurztitel: 'EGBGB' });
    const alle = [gesetz('BGB')];
    const auswahl = { kandidaten: [ziel], gewaehlt: new Map([['0', ziel]]) };
    const ergebnis = loeseVerweiszieleAuf(
      zitate,
      alle,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      false,
      new Map(),
      fns,
      auswahl,
    );
    expect(ergebnis.fehlerListe).toMatchObject([{ art: 'gesetz', gesetz: ziel }]);
  });
  it.each(['Art 229 § 3, Art 229 § 4 EGBGB', 'Art 229 § 3, 4 EGBGB'])(
    'löst %s zu zwei Binnenparagraphen auf',
    (text) => {
      const ergebnis = aufloesen(text);
      expect(ergebnis.fehlerListe).toEqual([]);
      expect(ergebnis.verweisziele).toMatchObject([
        {
          gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
          bezeichnung: 'Art. 229 § 3',
        },
        {
          gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
          bezeichnung: 'Art. 229 § 4',
        },
      ]);
      expect(ergebnis.verweisziele.map((ziel) => ziel.verweistextZeichenbereich)).toEqual([
        [0, text.indexOf(',') + 2],
        [text.indexOf(',') + 2, text.length],
      ]);
    },
  );

  it('lässt eine führende Semikolongrenze vor beiden Normen zu', () => {
    const ergebnis = aufloesen('; Art 229 § 3, Art 229 § 4 EGBGB');
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele.map((ziel) => ziel.bezeichnung)).toEqual([
      'Art. 229 § 3',
      'Art. 229 § 4',
    ]);
  });

  it('nimmt Art. 4, wenn der Binnenparagraph fehlt', () => {
    const ergebnis = aufloesen('Art 229 § 3, 4 EGBGB', [gesetz('BGB'), egbgb(['3'])]);
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele[1]).toMatchObject({ bezeichnung: 'Art. 4' });
  });

  it('meldet einen Fehler, wenn beide Deutungen fehlen', () => {
    expect(
      aufloesen('Art 229 § 3, 4 EGBGB', [gesetz('BGB'), egbgb(['3'], false)]).fehlerListe,
    ).toMatchObject([{ art: 'norm', text: '4 existiert nicht in EGBGB.' }]);
  });

  it('behält den Gliederungsartikel für weitere bloße Folgenummern', () => {
    const ergebnis = aufloesen('Art 229 § 3, 4, 5 EGBGB', [gesetz('BGB'), egbgb(['3', '4', '5'])]);
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele.map((ziel) => ziel.bezeichnung)).toEqual([
      'Art. 229 § 3',
      'Art. 229 § 4',
      'Art. 229 § 5',
    ]);
  });

  it('beachtet ein ausdrücklich genanntes Artikelpräfix', () => {
    const ergebnis = aufloesen('Art 229 § 3 EGBGB, Art 4 EGBGB');
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele[1]).toMatchObject({ bezeichnung: 'Art. 4' });
  });

  it('beachtet ein ausdrücklich genanntes Paragraphenpräfix', () => {
    expect(aufloesen('Art 229 § 3 EGBGB, § 4 EGBGB').fehlerListe).toMatchObject([
      { art: 'norm', text: '§ 4 existiert nicht in EGBGB.' },
    ]);
  });

  it.each(['Art 229 § 3; Art 229 § 4 EGBGB', 'Art 229 § 3 BGB, Art 229 § 4 EGBGB'])(
    'überbrückt weder Semikolon noch ausdrückliches Gesetz: %s',
    (text) => {
      expect(aufloesen(text).fehlerListe).toMatchObject([
        { art: 'norm', gesetz: gesetzesreferenz({ kurztitel: 'BGB' }) },
      ]);
    },
  );

  it('behält eine vorhandene Norm des Ausgangsgesetzes', () => {
    const ausgang = { ...egbgb(), kurztitel: 'BGB' };
    const ergebnis = aufloesen('Art 229 § 3, Art 229 § 4 EGBGB', [ausgang, egbgb()]);
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele[0]?.gesetz).toBeUndefined();
  });

  it('sucht ausschließlich im nächsten ausdrücklich genannten Gesetz', () => {
    expect(
      aufloesen('Art 229 § 3, Art 9 GG, Art 229 § 4 EGBGB', [gesetz('BGB'), gesetz('GG'), egbgb()])
        .fehlerListe,
    ).toHaveLength(2);
  });

  it('prüft Absatzfortsetzungen am im späteren Gesetz gefundenen Binnenparagraphen', () => {
    const g = egbgb();
    g.elemente[2]!.data = {
      ...normDarstellung('229-3', [
        { id: 'a1', bezeichnung: '1', saetze: [] },
        { id: 'a2', bezeichnung: '2', saetze: [] },
      ]),
      bezeichnung: '§ 3',
    };
    const ergebnis = aufloesen('Art 229 § 3 Abs 1, 2, Art 229 § 4 EGBGB', [gesetz('BGB'), g]);
    expect(ergebnis.fehlerListe).toEqual([]);
    expect(ergebnis.verweisziele.map((ziel) => ziel.bezeichnung)).toEqual([
      'Art. 229 § 3',
      'Art. 229 § 4',
    ]);
  });
});
