// Prüft dieselbe vereinbarte Schreibreihenfolge in Markierungs- und Konfliktdateien.
import { expect, it } from 'vitest';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { baueXML, parseEintraege } from './markierungs-xml.index';
import { baueGesetzBlock, parseKonfliktEintraege } from './markierungskonflikteXML';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const eintraege = [
  markierungsEintrag({
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 10' },
  }),
  markierungsEintrag({ ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '002' } }),
  markierungsEintrag({
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 2' },
  }),
  markierungsEintrag({ ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '001002' } }),
  markierungsEintrag({ ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '001' } }),
];
it('schreibt Überschriften nach Gliederungskennzahl vor den numerisch geordneten Normen', () => {
  expect(
    parseEintraege(baueXML(gesetz, eintraege)).eintraege.map((e) =>
      bezeichnungAusgangsstelle(e.ausgangsstelle),
    ),
  ).toEqual(['001', '001002', '002', '§ 2', '§ 10']);
});
it('schreibt auch Konflikte mit Überschriften zuerst und erhält die Eingabereihenfolge', () => {
  const block = baueGesetzBlock({
    gesetz,
    eintraege: eintraege.map((e) => ({
      ausgangsstelle: e.ausgangsstelle,
      markierungstyp: e.typ,
      textstelle: e.bezug.textstelle,
      eigenerKonflikt: 'bezugstextFehltOderUnpassend' as const,
      zielKonflikte: [],
    })),
  });
  expect(
    parseKonfliktEintraege(block).map((e) => bezeichnungAusgangsstelle(e.ausgangsstelle)),
  ).toEqual(['001', '001002', '002', '§ 2', '§ 10']);
  expect(eintraege.at(0)?.ausgangsstelle).toEqual({ typ: 'norm', bezeichnung: '§ 10' });
});
