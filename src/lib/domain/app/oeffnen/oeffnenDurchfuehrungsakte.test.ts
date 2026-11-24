import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenDurchfuehrungsakte.test.ts
// Der Suchfilter betrifft ausschließlich unscharfe EU-Importangebote.
import { expect, it } from 'vitest';
import { berechneTreffer } from './oeffnen.index';
const durchfuehrung = {
  kurztitel: 'VO 2016/679',
  langtitel: 'Datenschutz Durchführung',
  abrufkennung: '32016R0679',
  typ: 'durchfuehrungsverordnung',
};
const kuratiert = {
  kurztitel: 'DSGVO',
  langtitel: 'Datenschutz kuratiert',
  abrufkennung: '32016R0679',
};
const bund = { kurztitel: 'BDSG', langtitel: 'Datenschutz Bund', abrufkennung: 'bdsg' };
const bestand = { eu: [durchfuehrung, kuratiert], 'de-bund': [bund], 'de-bw': [] };
it('blendet nur unscharfe Durchführungsakte standardmäßig aus', () => {
  expect(
    berechneTreffer('datenschutz', alsSuchverzeichniseintraege([]), null, bestand).map(
      (t) => t.art === 'index' && t.eintrag.kurztitel,
    ),
  ).toEqual(['BDSG', 'DSGVO']);
});
it('zeigt bei eingeschalteter Einstellung auch Durchführungsakte', () => {
  expect(
    berechneTreffer('datenschutz', alsSuchverzeichniseintraege([]), null, bestand, true),
  ).toHaveLength(3);
});
it('findet exakte Kurztitel unabhängig von Großschreibung weiterhin', () => {
  expect(berechneTreffer('vo 2016/679', alsSuchverzeichniseintraege([]), null, bestand)).toEqual([
    { art: 'index', eintrag: durchfuehrung, quelle: 'eu' },
  ]);
});
