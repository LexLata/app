import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenCharakterisierung.test.ts
// Eingefrorene Trefferfolgen vor dem Umbau der Indexdurchläufe.
import { expect, it } from 'vitest';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';
import { berechneTreffer } from './oeffnen.index';

it('bewahrt die Trefferfolgen für Namen, Normen, EU-Namen und Normgeberkollisionen', () => {
  const { gesetze, importindex } = erzeugeSuchmessungBestand();
  for (const normgeber of ['de-bund', 'de-bw', 'eu'] as const) {
    importindex[normgeber].push({
      kurztitel: 'EUV',
      langtitel: 'Kollision',
      abrufkennung: 'kollision',
      normgeber,
    });
  }
  const eingaben = [
    '',
    '23',
    '2301',
    '23a',
    'bgb',
    '23 bgb',
    'datenschutz',
    '229 3',
    'e25',
    'Europäischer Datenschutz 1',
    'VO 2026/1',
    'Europäischer Datenschutz 0',
    'EUV',
    '23 EUV',
    'PKHB 2012',
  ];
  const folgen = eingaben.map((eingabe) => ({
    eingabe,
    treffer: berechneTreffer(
      eingabe,
      alsSuchverzeichniseintraege(gesetze),
      gesetze[5] ?? null,
      importindex,
    ).map((t) =>
      t.art === 'installiert'
        ? [t.gesetzesreferenz.normgeber, t.gesetzesreferenz.kurztitel, t.art, t.gefundenUeber]
        : [t.eintrag.normgeber ?? t.quelle, t.eintrag.kurztitel, t.art, t.gefundenUeber],
    ),
  }));
  expect(folgen).toMatchSnapshot();
});
