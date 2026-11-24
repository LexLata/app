// normKurzform.test.ts
// Reine Kurzformen, Präfixe, Rundlauf und unverändertes Aktivierungsformat.

import { normDarstellung, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, expect, it } from 'vitest';
import {
  ausgangsnormKennung,
  bezeichnungFuerAktivierung,
  vollstaendigeBezeichnung,
  pruefeKurzform,
  loeseLesezeichenOderFavoritAuf,
  verweisZuXmlId,
} from './norm.index';
import { praefixeVonNorm } from './normAufloesung';
import { xmlIdZuBezeichnung } from './normKurzform';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import { ueberschriftAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function norm(
  xmlId: string,
  bezeichnung: string,
  optionen: {
    art?: NormDarstellung['art'];
    ueberschriftartig?: boolean;
    gliederungsEbene?: number;
  } = {},
): DarstellungsElement {
  return {
    typ: 'norm',
    data: normDarstellung({
      id: `id-${xmlId}`,
      xmlId,
      bezeichnung,
      absaetze: [],
      ...(optionen.gliederungsEbene !== undefined
        ? {
            art: 'gliederungsartikel',
            gliederungsEbene: optionen.gliederungsEbene,
            ueberschriftartig: false,
          }
        : { art: 'normal' }),
    }) as NormDarstellung,
  };
}

function ueberschrift(xmlId: string, bezeichnung: string, titel?: string): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: { id: `id-${xmlId}`, xmlId, bezeichnung, titel, ebene: 1, gliederungskennzahl: '0' },
  };
}

function gesetz(elemente: DarstellungsElement[], kurztitel = 'TestG'): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: elemente.some(
      (el) => el.typ === 'norm' && el.data.art === 'gliederungsartikel',
    ),
    elemente,
  });
}

describe('xmlIdZuBezeichnung', () => {
  it('liefert das letzte Token einer normalen §-Norm', () => {
    const elemente = [norm('433', '§ 433')];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[0]!)).toBe('433');
  });

  it('liefert null für eine Überschrift', () => {
    const el = ueberschrift('u1', 'Erster Teil');
    expect(xmlIdZuBezeichnung(gesetz([el]), el)).toBeNull();
  });

  it('baut im Gliederungsartikel-Gesetz (z.B. EGBGB) das Zwei-Token-Format „Artikel Norm"', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', '§ 1'),
    ];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[1]!)).toBe('229 1');
  });

  it('liefert nur das Norm-Token, wenn (noch) kein übergeordneter Artikel gefunden wird', () => {
    // '433a' steht VOR jedem Artikel in der Liste – hatGliederungsartikel ist
    // trotzdem true, weil das Gesetz an anderer Stelle einen Gliederungsartikel hat.
    const elemente = [
      norm('433a', '§ 433'),
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', '§ 1'),
    ];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[0]!)).toBe('433');
  });

  it('MUTATIONSTEST: hatGliederungsartikel=false verhindert das Zwei-Token-Format, auch wenn die Struktur wie EGBGB aussieht', () => {
    // Deckt die Guard-Bedingung in gliederungsartikelToken ab (mutants 24-29,
    // 35): findeUebergeordnetenArtikel würde den Artikel unabhängig von
    // gesetz.hatGliederungsartikel finden – nur der Guard verhindert hier das
    // (fälschliche) Zwei-Token-Format.
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', '§ 1'),
    ];
    const g: GesetzDarstellung = { ...gesetz(elemente), hatGliederungsartikel: false };
    expect(xmlIdZuBezeichnung(g, elemente[1]!)).toBe('1');
  });

  it('MUTATIONSTEST: überflüssiges Leerzeichen am Ende der Bezeichnung ändert das Ergebnis nicht', () => {
    // Deckt das .trim() VOR .split() in letztesToken ab (mutant 18): ohne
    // dieses trim() liefert split(/\s+/) ein leeres letztes Element, ??
    // greift dabei NICHT (leerer String ist nicht null/undefined).
    const elemente = [norm('433', '§ 433  ')];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[0]!)).toBe('433');
  });

  it('gibt für den Gliederungsartikel selbst das einfache Token zurück (kein Zwei-Token-Format)', () => {
    const artikel = norm('229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    });
    const elemente = [artikel, norm('229-1', '§ 1')];
    expect(xmlIdZuBezeichnung(gesetz(elemente), artikel)).toBe('229');
  });

  it('MUTATIONSTEST: nimmt bei DREI Tokens das LETZTE, nicht das zweite', () => {
    // Bei genau zwei Tokens (wie in den Tests oben) fallen .at(-1) und .at(1)
    // zufällig zusammen. Erst ab drei Tokens unterscheiden sie sich – das
    // norm-Token "3 a" hat absichtlich drei Leerzeichen-getrennte Teile.
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-3-a', '§ 3 a'),
    ];
    // letztesToken('§ 3 a') = 'a' (kein Ziffernstart) → kein EGBGB-Format →
    // Fallback auf den unveränderten letzten Token der Norm selbst.
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[1]!)).toBe('a');
  });

  it('MUTATIONSTEST: verweigert das Zwei-Token-Format, wenn der Norm-Token nicht mit einer Ziffer beginnt', () => {
    const elemente = [
      norm('5', 'Art. 5', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('5-anh', '§ Anhang'),
    ];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[1]!)).toBe('Anhang');
  });

  it('MUTATIONSTEST: der Ziffern-Check auf dem Artikel-Token ist verankert (^), nicht "irgendwo im String"', () => {
    // "Xa2" beginnt NICHT mit einer Ziffer, enthält aber eine (an Position 2)
    // – deckt eine fehlende ^-Verankerung im Artikel-Token-Check ab.
    const elemente = [
      norm('x1', 'Art. Xa2', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('x1-3', '§ 3'),
    ];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[1]!)).toBe('3');
  });

  it('MUTATIONSTEST: der Ziffern-Check auf dem Norm-Token ist verankert (^), nicht "irgendwo im String"', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-x', '§ Xb3'),
    ];
    expect(xmlIdZuBezeichnung(gesetz(elemente), elemente[1]!)).toBe('Xb3');
  });
});

describe('pruefeKurzform', () => {
  it.each(['§ 1', 'Art. 1', 'Artikel 1'])(
    'bevorzugt %s vor Anlage und Anhang unabhängig von der Reihenfolge',
    (bezeichnung) => {
      const bevorzugt = norm('ziel', bezeichnung);
      const anlage = norm('anlage', 'Anlage 1');
      const anhang = norm('anhang', 'Anhang 1');
      for (const elemente of [
        [bevorzugt, anlage, anhang],
        [anhang, anlage, bevorzugt],
      ]) {
        const g = gesetz(elemente);
        expect(pruefeKurzform(g, bevorzugt)).toEqual({ ok: true, bezeichnung: '1' });
        expect(loeseLesezeichenOderFavoritAuf(g, '1').norm?.xmlId).toBe('ziel');
        expect(pruefeKurzform(g, anlage)).toEqual({
          ok: false,
          grund: 'anderes-element',
          bezeichnung: '1',
          zielBezeichnung: bezeichnung,
        });
      }
    },
  );

  it.each([
    ['§ 1', 'Art. 1', 'Anlage 1'],
    ['§ 1', '§ 1', 'Anlage 1'],
    ['Anlage 1', 'Anhang 1'],
  ])('verweigert mehrdeutige Kurzformen bei %j', (...bezeichnungen) => {
    const elemente = bezeichnungen.map((b, i) => norm(String(i), b));
    const g = gesetz(elemente);
    for (const el of elemente) {
      expect(pruefeKurzform(g, el)).toEqual({
        ok: false,
        grund: 'mehrdeutig',
        bezeichnung: '1',
      });
    }
    expect(loeseLesezeichenOderFavoritAuf(g, '1').norm).toBeUndefined();
  });

  it('erlaubt Anlage 1, wenn keine andere Norm die Nummer 1 hat', () => {
    const anlage = norm('anlage', 'Anlage 1');
    const g = gesetz([norm('p2', '§ 2'), anlage]);
    expect(pruefeKurzform(g, anlage)).toEqual({ ok: true, bezeichnung: '1' });
    expect(loeseLesezeichenOderFavoritAuf(g, '1').norm?.xmlId).toBe('anlage');
  });

  it('erlaubt den Rundlauf eines Gliederungsartikels und seiner untergeordneten Norm', () => {
    const artikel = norm('229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    });
    const unter = norm('229-3', '§ 3');
    const g = gesetz([artikel, unter]);
    expect(pruefeKurzform(g, artikel)).toEqual({ ok: true, bezeichnung: '229' });
    expect(pruefeKurzform(g, unter)).toEqual({ ok: true, bezeichnung: '229 3' });
  });

  it('liefert null für eine Überschrift', () => {
    const el = ueberschrift('u1', 'Abschnitt 1');
    expect(pruefeKurzform(gesetz([el]), el)).toBeNull();
  });

  it('verweigert eine nicht auflösbare Kurzform', () => {
    const el = norm('fehlend', '§ 999');
    expect(pruefeKurzform(gesetz([norm('p1', '§ 1')]), el)).toEqual({
      ok: false,
      grund: 'nicht-aufloesbar',
      bezeichnung: '999',
    });
  });

  it('erlaubt E25 neben Art. 25', () => {
    const el = norm('e25', 'E25');
    if (el.typ === 'norm') el.data.art = 'erwaegungsgrund';
    expect(pruefeKurzform(gesetz([norm('art25', 'Art. 25'), el]), el)).toEqual({
      ok: true,
      bezeichnung: 'E25',
    });
  });
});

describe('ausgangsnormKennung', () => {
  it.each([
    ['§ 433', '433'],
    ['Anhang 1', '1'],
    ['§§ 3 bis 6', '6'],
    ['E25', ''],
    ['', ''],
  ])('ermittelt die Ausgangskennung für %s', (titel, bezeichnung) => {
    const el = norm('n', titel);
    expect(ausgangsnormKennung(gesetz([el]), el)).toEqual(
      bezeichnung ? { typ: 'norm', bezeichnung: titel } : null,
    );
  });

  it('übernimmt beide Präfixe unter einem Gliederungsartikel', () => {
    const artikel = norm('a', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 1,
    });
    const el = norm('p', '§ 3');
    expect(ausgangsnormKennung(gesetz([artikel, el]), el)).toEqual({
      typ: 'norm',
      bezeichnung: 'Art. 229 § 3',
    });
  });

  it('verwendet bei Überschriften nur die Gliederungskennzahl', () => {
    const el = ueberschrift('u', 'Abschnitt 1');
    expect(ausgangsnormKennung(gesetz([el]), el)).toEqual(ueberschriftAusgangsstelle('0'));
    if (el.typ === 'ueberschrift') el.data.gliederungskennzahl = '';
    expect(ausgangsnormKennung(gesetz([el]), el)).toBeNull();
  });

  it('erhält Artikelkontext auch bei nichtnumerischer eigener Bezeichnung', () => {
    const artikel = norm('a', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 1,
    });
    const el = norm('p', '§ x');
    expect(ausgangsnormKennung(gesetz([artikel, el]), el)).toEqual({
      typ: 'norm',
      bezeichnung: 'Art. 229 § x',
    });
  });
});

describe('bezeichnungFuerAktivierung', () => {
  it('erhält die vollständige Bezeichnung einer gewöhnlichen Norm', () => {
    const el = norm('433', '§ 433');
    expect(bezeichnungFuerAktivierung(gesetz([el]), el)).toBe('§ 433');
  });
  it('erhält die zwei Tokens unter einem Gliederungsartikel', () => {
    const artikel = norm('229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    });
    const el = norm('229-3', '§ 3');
    expect(bezeichnungFuerAktivierung(gesetz([artikel, el]), el)).toBe('229 3');
  });
  it('liefert für Überschriften null', () => {
    const el = ueberschrift('u1', 'Erster Teil');
    expect(bezeichnungFuerAktivierung(gesetz([el]), el)).toBeNull();
  });
});

// Kurzform und Präfix müssen gemeinsam ein gültiges konkretes Verweisziel bilden.
describe('kompakte Normbezeichnungen', () => {
  it.each([
    ['§ 3 a', 'a', '§ 3'],
    ['Art. Xa2', 'Xa2', 'Art.'],
    ['§ Xb3', 'Xb3', '§'],
    ['E25', 'E25', ''],
    ['§§ 3 bis 6', '6', '§§ 3 bis'],
    ['§§3 bis 6', '6', '§§ 3 bis'],
  ])('erhält bestehende Kurzform und Präfix für %s', (bezeichnung, kurzform, praefix) => {
    const el = norm('ziel', bezeichnung);
    if (el.typ !== 'norm') throw new Error('Norm erwartet');
    const g = gesetz([el]);
    expect(xmlIdZuBezeichnung(g, el)).toBe(kurzform);
    expect(praefixeVonNorm(g, el.data)).toEqual([praefix]);
  });

  it.each(['§31', 'Art.31', 'Art31', 'Artikel31'])(
    'löst erzeugte Angaben für %s wieder zur selben Norm auf',
    (bezeichnung) => {
      const el = norm('ziel', bezeichnung);
      if (el.typ !== 'norm') throw new Error('Norm erwartet');
      const g = gesetz([el]);
      expect(xmlIdZuBezeichnung(g, el)).toBe('31');
      expect(praefixeVonNorm(g, el.data)).toEqual([bezeichnung.replace('31', '')]);
      expect(verweisZuXmlId(g, vollstaendigeBezeichnung(g, el.data.xmlId)!)).toBe('ziel');
    },
  );
  it('erhält den Gliederungsartikelkontext auch ohne Leerzeichen', () => {
    const artikel = norm('artikel', 'Artikel229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 1,
    });
    const el = norm('ziel', '§3');
    if (el.typ !== 'norm') throw new Error('Norm erwartet');
    const g = gesetz([artikel, el]);
    expect(xmlIdZuBezeichnung(g, el)).toBe('229 3');
    expect(praefixeVonNorm(g, el.data)).toEqual(['Artikel', '§']);
    expect(verweisZuXmlId(g, vollstaendigeBezeichnung(g, el.data.xmlId)!)).toBe('ziel');
  });
});

it('erzeugt Erwägungsgrund und Gliederungsartikel als verschiedene Ausgangsstellen', () => {
  const erwaegung = norm('e25', 'E25');
  if (erwaegung.typ === 'norm') erwaegung.data.art = 'erwaegungsgrund';
  const artikel = norm('a', 'Artikel I', {
    art: 'gliederungsartikel',
    ueberschriftartig: false,
    gliederungsEbene: 1,
  });
  const unter = norm('p', '§ 3');
  const g = gesetz([erwaegung, artikel, unter]);
  expect(ausgangsnormKennung(g, erwaegung)).toEqual({ typ: 'erwaegungsgrund', bezeichnung: 'E25' });
  expect(ausgangsnormKennung(g, artikel)).toEqual({ typ: 'norm', bezeichnung: 'Artikel I' });
  expect(ausgangsnormKennung(g, unter)).toEqual({ typ: 'norm', bezeichnung: 'Artikel I § 3' });
});

it('löst gespeicherte volle Bezeichnungen bei gleicher Kurzform unabhängig voneinander auf', () => {
  const g = gesetz([norm('p1', '§ 1'), norm('anhang', 'Anhang 1')]);
  expect(loeseLesezeichenOderFavoritAuf(g, '§ 1').norm?.xmlId).toBe('p1');
  expect(loeseLesezeichenOderFavoritAuf(g, 'Anhang 1').norm?.xmlId).toBe('anhang');
});
