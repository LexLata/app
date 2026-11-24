// Umfassende Gliederungsartikel anhand der öffentlichen Hierarchieschnittstelle.
import { expect, it } from 'vitest';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { ermittleUmfassendenGliederungsartikel } from './gesetzHierarchie';
it.each(['246a-3', '246a', 'unterhalb'])('ordnet %s dem umfassenden Artikel zu', (id) => {
  expect(ermittleUmfassendenGliederungsartikel(artikelkontextGesetz().elemente, id)?.xmlId).toBe(
    '246a',
  );
});
it.each(['gleichrangig', 'hoeherrangig', 'unbekannt', null])(
  'hat für %s keinen Artikelkontext',
  (id) => {
    expect(ermittleUmfassendenGliederungsartikel(artikelkontextGesetz().elemente, id)).toBeNull();
  },
);
it('hat ohne Gliederungsartikel keinen Kontext', () => {
  expect(
    ermittleUmfassendenGliederungsartikel([{ typ: 'norm', data: normaleNorm() }], 'n1'),
  ).toBeNull();
});
