// @vitest-environment jsdom
// Alte Normgeberdaten über echte Dateilader; nur native Dateisystemgrenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
import { ladePruefstand } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import { ladeNichtamtlicheTitelFuerPruefung } from '@/lib/persistenz/gesetz/gesetz.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

const ref = { kurztitel: 'BGB', normgeber: 'de-bund' };
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
});
it('lehnt Markierungskonflikte mit altem Normgeber beim Lesen ab', async () => {
  const xml =
    '<markierungskonflikte><gesetz normgeber="Bund" kurztitel="BGB"/></markierungskonflikte>'; // normgeber-negativ: alter Code im Konfliktbestand.
  io.dateien.set('markierungskonflikte.xml', xml);
  await expect(ladePruefstand()).rejects.toThrow('de-bund');
  expect(io.dateien.get('markierungskonflikte.xml')).toBe(xml);
});
it('meldet einen alten Normgeber in der nichtamtlichen Titeldatei als beschädigt', async () => {
  const pfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
  const xml =
    '<nichtamtlicheTitel><infos><gesetz normgeber="Bund">BGB</gesetz></infos><inhalt/></nichtamtlicheTitel>'; // normgeber-negativ: alter Code in Titeldatei.
  io.dateien.set(pfad, xml);
  const empfangen = vi.fn();
  await expect(ladeNichtamtlicheTitelFuerPruefung(ref, empfangen)).rejects.toThrow('beschaedigt');
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ art: 'fehler', anlass: 'lesen' }),
  );
  expect(io.dateien.get(pfad)).toBe(xml);
});
it('lädt einen alten Dateinamen nicht und öffnet daneben das gültige Gesetz ohne Absturz', async () => {
  const xml =
    '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>';
  io.dateien.set(
    'gesetze/BGB_Bund.xml' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
    xml,
  );
  io.dateien.set('gesetze/BGB_de-bund.xml', xml);
  const bestand = await ladeAlleGesetze();
  expect(bestand).toHaveLength(1);
  expect(bestand[0]).toMatchObject(ref);
});

it.each([' de-bund ', '&#10;de-bund&#10;'])(
  'lehnt Randzeichen im Konflikt- und Titelattribut %s ab und bewahrt die Originaldateien',
  async (code) => {
    const konflikt = `<markierungskonflikte><gesetz normgeber="${code}" kurztitel="BGB"/></markierungskonflikte>`;
    const titel = `<nichtamtlicheTitel><infos><gesetz normgeber="${code}">BGB</gesetz></infos><inhalt/></nichtamtlicheTitel>`;
    const pfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
    io.dateien.set('markierungskonflikte.xml', konflikt);
    io.dateien.set(pfad, titel);
    await expect(ladePruefstand()).rejects.toThrow('de-bund');
    await expect(ladeNichtamtlicheTitelFuerPruefung(ref, () => {})).rejects.toThrow('beschaedigt');
    expect(io.dateien.get('markierungskonflikte.xml')).toBe(konflikt);
    expect(io.dateien.get(pfad)).toBe(titel);
  },
);
