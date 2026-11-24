// oeffnenMehrfachAbrufkennung.test.ts
// Fassungen mit gemeinsamer Abrufkennung sind noch nicht gezielt importierbar und
// werden deshalb nicht als Importangebot geführt; Listenschlüssel bleiben eindeutig.
import { expect, it } from 'vitest';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { berechneTreffer, trefferSchluessel, type SucheTreffer } from './oeffnen.index';

const bw = [
  {
    kurztitel: 'VDSRVtrG',
    langtitel: 'Gesetz zu dem Vertrag mit dem Verband Deutscher Sinti und Roma e.V.',
    abrufkennung: 'VDSRVtrG',
  },
  {
    kurztitel: 'VDSRVtrG',
    langtitel: 'Gesetz zu dem Vertrag mit dem Verband Deutscher Sinti und Roma e. V.',
    abrufkennung: 'VDSRVtrG',
  },
  {
    kurztitel: 'VersAbgVO',
    langtitel: 'Versorgungsabgabeverordnung',
    abrufkennung: 'VersAbgVO',
  },
];
const index = { [NORMGEBER_DE_BUND]: [], [NORMGEBER_DE_BW]: bw, [NORMGEBER_EU]: [] };

function kurztitel(treffer: SucheTreffer[]) {
  return treffer.map((t) =>
    t.art === 'index' ? t.eintrag.kurztitel : t.gesetzesreferenz.kurztitel,
  );
}

it('führt Fassungen mit gemeinsamer Abrufkennung nicht als Importangebot', () => {
  expect(
    kurztitel(berechneTreffer('vdsrvtrg', alsSuchverzeichniseintraege([]), null, index)),
  ).toEqual([]);
  expect(kurztitel(berechneTreffer('vers', alsSuchverzeichniseintraege([]), null, index))).toEqual([
    'VersAbgVO',
  ]);
});

it('vergibt auch für gleiche Treffer eindeutige Listenschlüssel', () => {
  const eintrag = {
    kurztitel: 'VersAbgVO',
    langtitel: 'Versorgungsabgabeverordnung',
    abrufkennung: 'VersAbgVO',
  };
  const t: SucheTreffer = { art: 'index', eintrag, quelle: NORMGEBER_DE_BW };
  const schluessel = trefferSchluessel([t, { ...t }, { ...t }]);
  expect(new Set(schluessel).size).toBe(3);
});
