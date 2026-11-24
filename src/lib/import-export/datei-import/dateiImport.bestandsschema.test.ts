// @vitest-environment jsdom
// Echte Dateiimporte, Konfliktentscheidungen und Prüfnachläufe mit abweichenden Bestandsversionen.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { beforeEach, expect, it } from 'vitest';
import {
  type DateiImportErgebnis,
  loeseImportKonflikt,
} from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/lib/import-export/datei-import/gesetzDateiImport';
import { appDatenLesen } from '@/lib/persistenz/kern/kern.index';

const favoriten = (version: string) =>
  `<favoriten version="${version}"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>`;
const pfad = 'favoriten/BGB_de-bund-favoriten.xml';
/** Schemahinweis nennt den Dateinamen als Betroffenen, nie den Pfad im Text. */
const schemahinweis = (quelle: string, version: string) =>
  expect.objectContaining({
    grund: 'schemaversionAbweichend',
    betroffen: quelle.split('/').at(-1),
    text: expect.stringContaining(version),
  });
beforeEach(vorbereiten);
function ersterKonflikt(ergebnis: DateiImportErgebnis) {
  const konflikt = ergebnis.konflikte[0];
  if (!konflikt) throw new Error('Der erwartete Importkonflikt fehlt.');
  return konflikt;
}

it('berichtet Bestandsquelle und tatsächliche Schemaversion beim Vergleich und frischen Zusammenführen', async () => {
  io.dateien.set(pfad, favoriten('999'));
  io.dateien.set('/import/BGB.xml', favoriten('1'));
  const ergebnis = await importierePfade(['/import/BGB.xml']);
  expect(ergebnis.konflikte).toHaveLength(1);
  expect(ersterKonflikt(ergebnis).meldungen).toEqual(
    expect.arrayContaining([schemahinweis(pfad, '999')]),
  );
  expect(JSON.stringify(ersterKonflikt(ergebnis).meldungen)).not.toContain(pfad);
  io.dateien.set(pfad, favoriten('998'));
  const bericht = await loeseImportKonflikt(ersterKonflikt(ergebnis), 'zusammenfuehren');
  expect(bericht.meldungen).toEqual(expect.arrayContaining([schemahinweis(pfad, '998')]));
  expect(io.emit).not.toHaveBeenCalledWith('main', 'schemaversion-abweichend');
});

it('behält die Schemaanzeige ohne Importempfänger bei', async () => {
  io.dateien.set(pfad, favoriten('999'));
  await appDatenLesen(pfad);
  expect(io.emit).toHaveBeenCalledWith('main', 'schemaversion-abweichend');
});

it.each([
  [
    'lesezeichen/lesezeichen.xml',
    '<lesezeichen version="1"><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
  ],
  [
    'einstellungen/gesetzeskurzbefehle.xml',
    '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
  ],
  [
    'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml',
    '<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Mein Titel</titel></norm></inhalt></nichtamtlicheTitel>',
  ],
  [
    'markierungen/BGB_de-bund-markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>Kommentar</kommentartext></kommentar></inhalt></markierungen>',
  ],
  [
    'gesetze/BGB_de-bund.xml',
    '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  ],
])(
  'berichtet Bestandsversion bei %s ohne den Eingang als unvollständig zu kennzeichnen',
  async (bestandsPfad, xml) => {
    io.dateien.set(bestandsPfad, xml.replace('version="1"', 'version="999"'));
    io.dateien.set('/import/Datei.xml', xml);
    const ergebnis = await importierePfade(['/import/Datei.xml']);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.konflikte).toHaveLength(1);
    expect(ergebnis.konflikte[0]).not.toHaveProperty('eingangUnvollstaendig', true);
    expect(ergebnis.konflikte[0]?.meldungen).toEqual(
      expect.arrayContaining([schemahinweis(bestandsPfad, '999')]),
    );
    expect(io.emit).not.toHaveBeenCalledWith('main', 'schemaversion-abweichend');
  },
);

it('nimmt Schemahinweise aus Bestandsquellen des echten importbedingten Prüfnachlaufs auf', async () => {
  const { initialisiereMarkierungen } = await import('@/lib/markierungen/markierungen.index');
  initialisiereMarkierungen();
  const gesetzPfad = 'gesetze/BGB_de-bund.xml';
  const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
  io.dateien.set(
    gesetzPfad,
    '<gesetz version="997"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  io.dateien.set(
    titelPfad,
    '<nichtamtlicheTitel version="996"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></nichtamtlicheTitel>',
  );
  io.dateien.set(
    '/import/Markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>Kommentar</kommentartext></kommentar></inhalt></markierungen>',
  );
  const ergebnis = await importierePfade(['/import/Markierungen.xml']);
  expect(ergebnis.fehler).toEqual([]);
  const bericht = ergebnis.berichtEintraege[0];
  expect(bericht?.aktion).toBe('neu');
  expect(bericht?.eingangUnvollstaendig).not.toBe(true);
  for (const [quelle, version] of [
    [gesetzPfad, '997'],
    [titelPfad, '996'],
  ] as const) {
    expect(bericht?.meldungen).toEqual(expect.arrayContaining([schemahinweis(quelle, version)]));
  }
  expect(io.emit).not.toHaveBeenCalledWith('main', 'schemaversion-abweichend');
});

it('berichtet die erst beim geschützten Wiederholungslesen vorhandene Bestandsversion', async () => {
  io.dateien.set(pfad, favoriten('999'));
  io.dateien.set('/import/BGB.xml', favoriten('1'));
  const ergebnis = await importierePfade(['/import/BGB.xml']);
  io.dateien.set(pfad, '<defekt/>');
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Die native Testimplementierung fehlt.');
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'archiviere_beschaedigte_datei' && args.relativerPfad === pfad) {
      io.dateien.set(pfad, favoriten('997'));
      return { status: 'veraendert', sicherungspfad: null };
    }
    return nativ(name, args);
  });
  const bericht = await loeseImportKonflikt(ersterKonflikt(ergebnis), 'zusammenfuehren');
  expect(bericht.meldungen).toEqual(expect.arrayContaining([schemahinweis(pfad, '997')]));
  expect(io.emit).not.toHaveBeenCalledWith('main', 'schemaversion-abweichend');
});
