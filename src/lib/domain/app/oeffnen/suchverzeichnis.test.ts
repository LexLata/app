import {
  alsSuchverzeichniseintraege,
  alsSuchverzeichniseintrag,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// suchverzeichnis.test.ts
// Öffentlicher Suchvertrag bei wiederverwendeten und erneuerten Elementlisten.
import { expect, it } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { normaleNorm, gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { berechneTreffer, loeseNormzielAuf, parseSuchanfrage } from './oeffnen.index';

function gesetz(): GesetzDarstellung {
  return {
    kurztitel: 'TEST',
    langtitel: 'Testgesetz',
    normgeber: 'de-bund',
    hatGliederungsartikel: true,
    elemente: [
      { typ: 'norm', data: gliederungsartikel({ xmlId: '229', bezeichnung: 'Art. 229' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: '229-3', bezeichnung: '§ 3' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: '229-20', bezeichnung: '§§ 20 bis 25' }) },
    ],
  };
}

it.each([false, true])(
  'liest nach dem Erstaufbau bei 60 Suchanfragen und Zielauflösungen keine ursprünglichen Normdaten mehr (Gliederungsartikel: %s)',
  (hatGliederungsartikel) => {
    const original = { ...gesetz(), hatGliederungsartikel };
    let zugriffe = 0;
    const ueberwache = <T extends object>(objekt: T): T =>
      new Proxy(objekt, {
        get(ziel, feld, empfaenger) {
          zugriffe++;
          const wert: unknown = Reflect.get(ziel, feld, empfaenger);
          return wert && typeof wert === 'object' ? ueberwache(wert) : wert;
        },
      });
    const elemente = ueberwache(original.elemente);
    const bestand = alsSuchverzeichniseintrag({ ...original, elemente });
    berechneTreffer('3', [bestand], null, null);
    zugriffe = 0;
    for (let i = 0; i < 60; i++) {
      const eingabe = `${i + 1} TEST`;
      berechneTreffer(eingabe, [bestand], null, null);
      loeseNormzielAuf(parseSuchanfrage(eingabe), bestand);
    }
    expect(zugriffe).toBe(0);
    const patch = { ...bestand, langtitel: 'Geänderter Titel' };
    expect(loeseNormzielAuf(parseSuchanfrage('3'), patch)?.xmlId).toBe('229-3');
    expect(zugriffe).toBe(0);
  },
);

it('erkennt neue Elementlisten und bewahrt Einzelzahl, Artikelbereich und Live-Tippen', () => {
  const alt = gesetz();
  for (const [eingabe, xmlId] of [
    ['229', '229'],
    ['229 3', '229-3'],
    ['229 23', '229-20'],
    ['229 2', '229-20'],
  ] as const) {
    expect(loeseNormzielAuf(parseSuchanfrage(eingabe), alsSuchverzeichniseintrag(alt))?.xmlId).toBe(
      xmlId,
    );
  }
  const neu = {
    ...alt,
    elemente: [{ typ: 'norm' as const, data: normaleNorm({ xmlId: '77', bezeichnung: '§ 77' }) }],
  };
  expect(berechneTreffer('3', alsSuchverzeichniseintraege([neu]), null, null)).toEqual([]);
  expect(loeseNormzielAuf(parseSuchanfrage('77'), alsSuchverzeichniseintrag(neu))?.xmlId).toBe(
    '77',
  );
});
