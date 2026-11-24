// Gesetz mit Gliederungsartikeln und Überschriften für die Artikelkontext-Abnahme.
import { gesetzDarstellung, gliederungsartikel, normaleNorm } from './gesetzFabriken';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
const artikel = (nummer: string): DarstellungsElement => ({
  typ: 'norm',
  data: gliederungsartikel({
    id: nummer,
    xmlId: nummer,
    bezeichnung: `Art. ${nummer}`,
    gliederungsEbene: 2,
    ueberschriftartig: true,
  }),
});
const norm = (id: string, nummer: string): DarstellungsElement => ({
  typ: 'norm',
  data: normaleNorm({ id, xmlId: id, bezeichnung: `§ ${nummer}` }),
});
const ueberschrift = (id: string, ebene: number): DarstellungsElement => ({
  typ: 'ueberschrift',
  data: { id, xmlId: id, bezeichnung: id, ebene, gliederungskennzahl: id },
});
export const artikelkontextGesetz = () =>
  gesetzDarstellung({
    kurztitel: 'EG',
    langtitel: 'Einführungsgesetz',
    hatGliederungsartikel: true,
    elemente: [
      artikel('3'),
      artikel('4'),
      artikel('229'),
      norm('229-3', '3'),
      artikel('246a'),
      ueberschrift('unterhalb', 3),
      norm('246a-3', '3'),
      norm('246a-4', '4'),
      ueberschrift('gleichrangig', 2),
      ueberschrift('hoeherrangig', 1),
    ],
  });
