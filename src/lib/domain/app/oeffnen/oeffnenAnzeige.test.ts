// oeffnenAnzeige.test.ts
// Rangregel und stabile Ordnung installierter Gesetze.
import { expect, it } from 'vitest';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { sortiereNachAnzeige, vergleicheNachAnzeige } from './oeffnenAnzeige';
const a = { normgeber: 'de-bund', kurztitel: 'A' };
const b = { normgeber: 'de-bund', kurztitel: 'B' };
it('ordnet jüngere vor ältere und angezeigte vor nie angezeigte Gesetze', () => {
  const zeitpunkte = new Map([
    [gesetzesreferenzSchluessel(a), 1],
    [gesetzesreferenzSchluessel(b), 2],
  ]);
  expect(sortiereNachAnzeige([a, b], zeitpunkte)).toEqual([b, a]);
  expect(vergleicheNachAnzeige(new Map([[gesetzesreferenzSchluessel(a), 1]]))(a, b)).toBeLessThan(
    0,
  );
  expect(
    vergleicheNachAnzeige(new Map([[gesetzesreferenzSchluessel(a), 1]]))(b, a),
  ).toBeGreaterThan(0);
});
it('erhält bei gleichen oder fehlenden Zeitpunkten die Eingabereihenfolge ohne Mutation', () => {
  const liste = [b, a];
  expect(sortiereNachAnzeige(liste, new Map())).toEqual([b, a]);
  expect(
    sortiereNachAnzeige(
      liste,
      new Map([
        [gesetzesreferenzSchluessel(a), 1],
        [gesetzesreferenzSchluessel(b), 1],
      ]),
    ),
  ).toEqual([b, a]);
  expect(liste).toEqual([b, a]);
});
