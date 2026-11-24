import { istGleichesGesetz, gesetzesreferenzSchluessel } from './gesetzesreferenz';
// kurztitelVergleich.test.ts
// Gemeinsame Vergleichsformen für gelesene Eingaben, ohne Änderungen am Originaltext.
import { describe, expect, it } from 'vitest';
import {
  kurztitelSuchformen,
  vergleicheNachKurztitelUndNormgeber,
  normalisiereKurztitelSuchform,
  vergleicheKurztitel,
} from './kurztitelVergleich';

describe('Kurztitelvergleich', () => {
  it('unterscheidet exakte Schreibweise, Whitespace und fehlenden Treffer', () => {
    expect(vergleicheKurztitel('sGb IV', 'SGB IV')).toBe('exakt');
    expect(vergleicheKurztitel('SGB\tIV', 'sgb\u00a0iv')).toBe('whitespace');
    expect(vergleicheKurztitel(' SGB IV ', 'sgb iv')).toBe('whitespace');
    expect(vergleicheKurztitel('SGBIV', 'SGB IV')).toBeUndefined();
    expect(vergleicheKurztitel('BGB.', 'BGB')).toBeUndefined();
  });
  it.each<[string, string[]]>([
    ['BGB', ['BGB']],
    ['BGB.', ['BGB.', 'BGB']],
    ['BGB..', ['BGB..', 'BGB.']],
    ['SGB\u00a0IV.', ['SGB\u00a0IV.', 'SGB\u00a0IV']],
    ['A.B', ['A.B']],
  ])('sucht %j unverändert und höchstens danach ohne einen Schlusspunkt', (eingabe, erwartet) => {
    expect(kurztitelSuchformen(eingabe)).toEqual(erwartet);
  });
});

it.each(['AÜG', 'ÄApprO', 'ß', 'BGB'])(
  'vergleicht %s unabhängig von der Unicode-Schreibweise',
  (titel) => {
    expect(vergleicheKurztitel(titel.normalize('NFD'), titel)).toBe('exakt');
    expect(normalisiereKurztitelSuchform(titel.normalize('NFD'))).toBe(titel.toLowerCase());
  },
);

it('erhält Groß-/Kleinschreibung, Leerraum und ß als bisherige Vergleichsregeln', () => {
  expect(vergleicheKurztitel('ÄApprO', 'äapprO')).toBe('exakt');
  expect(vergleicheKurztitel('ß', 'ss')).toBeUndefined();
  expect(normalisiereKurztitelSuchform(' AÜG\t X ')).toBe('aüg x');
});

it('vereinheitlicht die Gesetzesidentität ohne den Normgeber zu verlieren', () => {
  const a = { kurztitel: 'AÜG', normgeber: 'de-bund' };
  const b = { ...a, kurztitel: a.kurztitel.normalize('NFD') };
  expect(istGleichesGesetz(a, b)).toBe(true);
  expect(gesetzesreferenzSchluessel(a)).toBe(gesetzesreferenzSchluessel(b));
  expect(istGleichesGesetz(a, { ...b, normgeber: 'de-bw' })).toBe(false);
});

describe('Sortierung nach Kurztitel und Normgeber', () => {
  const sortiert = (gesetze: { kurztitel: string; normgeber: string }[]) =>
    [...gesetze]
      .sort(vergleicheNachKurztitelUndNormgeber)
      .map((g) => `${g.kurztitel}/${g.normgeber}`);
  it('ordnet alphabetisch, ohne Beachtung der Groß-/Kleinschreibung und mit deutschen Umlauten', () => {
    expect(
      sortiert([
        { kurztitel: 'Zeta', normgeber: 'de-bund' },
        { kurztitel: 'ärzte', normgeber: 'de-bund' },
        { kurztitel: 'beta', normgeber: 'de-bund' },
        { kurztitel: 'Alpha', normgeber: 'de-bund' },
        { kurztitel: 'Ozon', normgeber: 'de-bund' },
      ]),
    ).toEqual(['Alpha/de-bund', 'ärzte/de-bund', 'beta/de-bund', 'Ozon/de-bund', 'Zeta/de-bund']);
  });
  it('ordnet bei gleichem Kurztitel nach angezeigtem Normgeber', () => {
    expect(
      sortiert([
        { kurztitel: 'DSGVO', normgeber: 'eu' },
        { kurztitel: 'DSGVO', normgeber: 'de-bw' },
        { kurztitel: 'DSGVO', normgeber: 'de-bund' },
      ]),
    ).toEqual(['DSGVO/de-bw', 'DSGVO/de-bund', 'DSGVO/eu']);
  });
});
