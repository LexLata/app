import {
  alsSuchverzeichniseintraege,
  suchtrefferKopfangaben,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenIndexwechsel.test.ts
// Indexvorbereitung und aktuelle Gesetzesliste haben getrennte Gültigkeiten.
import { expect, it } from 'vitest';
import { berechneTreffer } from './oeffnen.index';
import { bereiteImportindexVor } from './oeffnenVorberechnung';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';

it('verwendet die Suchnamen desselben Indexarrays wieder und bereitet neue Arrays neu vor', () => {
  const { importindex } = erzeugeSuchmessungBestand({ gesetze: 0, bund: 0, bw: 0, eu: 2 });
  const a = bereiteImportindexVor(importindex.eu, 'eu');
  expect(bereiteImportindexVor(importindex.eu, 'eu')).toBe(a);
  expect(bereiteImportindexVor(importindex.eu, 'eu').kandidaten[1]?.namen).toBe(
    a.kandidaten[1]?.namen,
  );
  expect(bereiteImportindexVor([...importindex.eu], 'eu')).not.toBe(a);
});

it('aktualisiert bei unveränderten Indexarrays Import, Löschen und Austausch einschließlich EU-Alternativnamen', () => {
  const { gesetze, importindex } = erzeugeSuchmessungBestand({ gesetze: 1, bund: 0, bw: 0, eu: 2 });
  const vorlage = gesetze[0];
  const angebot = importindex.eu[1];
  if (!vorlage || !angebot) throw new Error('Testbestand unvollständig');
  const gesetz = { ...vorlage, kurztitel: 'VO 2026/2', normgeber: 'eu' };
  importindex['de-bund'].push({ ...angebot, normgeber: 'de-bund' });
  importindex['de-bw'].push({ ...angebot, normgeber: 'de-bw' });
  const suche = (liste: typeof gesetze, text = 'Europäischer Datenschutz 1') =>
    berechneTreffer(text, alsSuchverzeichniseintraege(liste), null, importindex);
  expect(suche([]).map((t) => t.art)).toEqual(['index']);
  expect(suche([gesetz])).toEqual([
    {
      art: 'installiert',
      ...suchtrefferKopfangaben(gesetz),
      gefundenUeber: 'Europäischer Datenschutz 1',
    },
  ]);
  expect(suche([]).map((t) => t.art)).toEqual(['index']);
  const ersatz = { ...gesetz, kurztitel: 'Anderes Gesetz' };
  expect(suche([ersatz]).map((t) => t.art)).toEqual(['index']);
  const kollision = suche([gesetz], 'VO 2026/2');
  expect(
    kollision.map((t) => [
      t.art,
      t.art === 'installiert' ? t.gesetzesreferenz.normgeber : t.eintrag.normgeber,
    ]),
  ).toEqual([
    ['installiert', 'eu'],
    ['index', 'de-bund'],
    ['index', 'de-bw'],
  ]);
  importindex.eu = importindex.eu.map((e) => ({ ...e, alternativen: ['Neue Bezeichnung'] }));
  expect(suche([gesetz])).toEqual([]);
  expect(suche([gesetz], 'Neue Bezeichnung')).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(gesetz), gefundenUeber: 'Neue Bezeichnung' },
  ]);
});
