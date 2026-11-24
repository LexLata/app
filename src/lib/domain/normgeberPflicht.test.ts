// normgeberPflicht.test.ts
// Pflicht-Normgeber: Identität, öffentliche Links und eingelesene Gesetze.
import fc from 'fast-check';
import { expect, it } from 'vitest';
import {
  istGleichesGesetz,
  gesetzesreferenzSchluessel,
  istGueltigerNormgeber,
} from './gesetzesreferenz';
import { parseTiefenLink } from './app/tiefenLink';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { dateiBasis, referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';

it('unterscheidet Normgeber bei beliebigen Kurztiteln und ignoriert nur Kurztitelschreibweisen', () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.constantFrom('de-bund', 'de-bw', 'eu', 'unbekannt'),
      (kurztitel, normgeber) => {
        const ref = { kurztitel, normgeber };
        const gleich = { kurztitel: kurztitel.toLowerCase(), normgeber };
        expect(istGleichesGesetz(ref, gleich)).toBe(true);
        expect(gesetzesreferenzSchluessel(ref)).toBe(gesetzesreferenzSchluessel(gleich));
        for (const anderer of ['de-bund', 'de-bw', 'eu', 'unbekannt'].filter(
          (n) => n !== normgeber,
        )) {
          expect(istGleichesGesetz(ref, { kurztitel, normgeber: anderer })).toBe(false);
          expect(gesetzesreferenzSchluessel(ref)).not.toBe(
            gesetzesreferenzSchluessel({ kurztitel, normgeber: anderer }),
          );
        }
      },
    ),
  );
});
it('behandelt unbekannt in Gesetz, Dateiname und Tiefenlink als normalen Normgeber', () => {
  const ref = { kurztitel: 'BGB', normgeber: 'unbekannt' };
  expect(istGueltigerNormgeber(ref.normgeber)).toBe(true);
  expect(referenzAusDateiBasis(dateiBasis(ref))).toEqual(ref);
  expect(parseTiefenLink('lexlata://unbekannt/BGB')).toMatchObject(ref);
  expect(
    parseGesetzesXML(
      '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>unbekannt</normgeber></infos><inhalt/></gesetz>',
    ),
  ).toMatchObject(ref);
});
it('lehnt Gesetze und Tiefenlinks ohne Normgeber ab', () => {
  expect(parseTiefenLink('lexlata:///BGB')).toBeNull();
  expect(parseTiefenLink('lexlata:///Bund/BGB')).toBeNull();
  expect(
    parseGesetzesXML('<gesetz><infos><kurztitel>BGB</kurztitel></infos><inhalt/></gesetz>'),
  ).toBeNull();
});

it('erhält Verweistext ohne Normgeber und übernimmt nur vollständige fremde Verweise', () => {
  const xml =
    '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text>Siehe <verweis gesetz="GG" norm="Art. 1">GG alt</verweis> und <verweis gesetz="GG" normgeber="de-bund" norm="Art. 2">GG neu</verweis>.</text></norm></inhalt></gesetz>';
  const gesetz = parseGesetzesXML(xml);
  const norm = gesetz?.elemente[0];
  expect(norm?.typ).toBe('norm');
  if (norm?.typ !== 'norm') throw new Error('Testnorm fehlt');
  expect(JSON.stringify(norm.data.absaetze)).toContain('GG alt');
  expect(norm.data.getaggteVerweise).toHaveLength(1);
});

it('weist eine unvollständige rohe Referenz auch an der Dateinamengrenze zurück', () => {
  expect(() => Reflect.apply(dateiBasis, undefined, [{ kurztitel: 'BGB' }])).toThrow('Normgeber');
});
