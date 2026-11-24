// Prüft das einzige unterstützte Referenzformat an der JSON-Grenze.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { expect, it } from 'vitest';
import { pruefeFensterZustand, pruefeGeschlosseneTabs } from './fensterDatenPruefung';

// Rekonstruiert den historischen Feldnamen ausschließlich für Altformatproben.
const altesKennungsfeld = ['gesetz', 'Id'].join('');

it.each([{ kurztitel: 'BGB', normgeber: 'de-bund' }, gesetzesreferenz({ kurztitel: 'BGB' })])(
  'liest Fenster mit Referenz %j und ordnet gemischte Tabs neu zu',
  (gesetzesreferenz) => {
    expect(
      pruefeFensterZustand({
        tabs: [{ [altesKennungsfeld]: 'BGB_de-bund' }],
        aktiverIndex: 0,
      }),
    ).toBeNull();
    expect(
      pruefeFensterZustand({
        tabs: [{ [altesKennungsfeld]: 'BGB_de-bund' }, { gesetzesreferenz }],
        aktiverIndex: 1,
      }),
    ).toEqual({ tabs: [{ gesetzesreferenz }], aktiverIndex: 0 });
  },
);

it('erhält referenzbasierte geschlossene Tabs und verwirft ausschließlich Altformen', () => {
  const gesetzesreferenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const verlauf = { eintraege: [{ gesetzesreferenz, xmlId: 'p1' }], position: 0 };
  expect(
    pruefeGeschlosseneTabs([
      { [altesKennungsfeld]: 'BGB_de-bund', verlauf },
      { gesetzesreferenz, verlauf },
      {
        gesetzesreferenz,
        verlauf: {
          eintraege: [{ [altesKennungsfeld]: 'BGB_de-bund', xmlId: 'p1' }],
          position: 0,
        },
      },
    ]),
  ).toEqual([
    { gesetzesreferenz, verlauf },
    { gesetzesreferenz, verlauf: { eintraege: [], position: 0 } },
  ]);
});
