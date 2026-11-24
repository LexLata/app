// @vitest-environment jsdom
// Reale XML-Leser und Pfadimport bis zur nativen Dateigrenze.
import { io, vorbereiten } from './gemischterZipNativeAttrappe';
import { beforeEach, expect, it } from 'vitest';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
const xml = (code: string) =>
  `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>${code}</normgeber></infos><inhalt/></gesetz>`;
beforeEach(() => {
  vorbereiten();
  initialisiereMarkierungen();
  localStorage.setItem('lexlata.nachbereitungBeiImport', 'aus');
});
it.each([' de-bund', 'de-bund ', '\nde-bund', 'de-bund\n'])(
  'weist Randzeichen in %j auch beim tatsächlichen Dateiimport ohne Speicherung zurück',
  async (code) => {
    const inhalt = xml(code);
    io.dateien.set('/import/TestG.xml', inhalt);
    const ergebnis = await importierePfade(['/import/TestG.xml']);
    expect(ergebnis.berichtEintraege).toHaveLength(1);
    expect(ergebnis.berichtEintraege[0]?.aktion).toBe('nichtUebernommen');
    const meldungen = ergebnis.berichtEintraege[0]?.meldungen?.map((m) => m.text).join(' ');
    expect(meldungen).toContain('de-bund');
    expect(meldungen).toContain('höchstens 20');
    expect([...io.dateien.keys()].filter((p) => p.startsWith('gesetze/'))).toEqual([]);
    expect(io.dateien.get('/import/TestG.xml')).toBe(inhalt);
  },
);
it.each([' de-bund', 'de-bund ', '\nde-bund', 'de-bund\n'])(
  'lehnt Rohwert %j in beiden öffentlichen XML-Lesern ab',
  (code) => {
    expect.soft(leseGesetzInfos(xml(code))).toBeNull();
    expect.soft(parseGesetzesXML(xml(code))).toBeNull();
  },
);
it.each(['de-bund', 'at-bund'])(
  'erhält gültiges %s über Leser und tatsächlichen Dateiimport',
  async (code) => {
    const inhalt = xml(code);
    io.dateien.set('/import/TestG.xml', inhalt);
    expect(leseGesetzInfos(inhalt)?.normgeber).toBe(code);
    expect(parseGesetzesXML(inhalt)?.normgeber).toBe(code);
    const bericht = await importierePfade(['/import/TestG.xml']);
    expect(bericht.fehler).toEqual([]);
    expect(io.dateien.get(`gesetze/TestG_${code}.xml`)).toContain(`<normgeber>${code}</normgeber>`);
  },
);
it.each(['aus', 'saetze', 'verweise', 'saetze-und-verweise'])(
  'importiert CIC 1917 mit Normgeber vatikan und Nachbereitung %s',
  async (modus) => {
    localStorage.setItem('lexlata.nachbereitungBeiImport', modus);
    const inhalt = `<?xml version="1.0" encoding="UTF-8"?>
<gesetz>
    <infos>
        <langtitel>Code of Canon Law</langtitel>
        <kurztitel>CIC 1917</kurztitel>
        <normgeber>vatikan</normgeber>
        <stand>1917-05-27</stand>
        <sprache>en</sprache>
        <normpraefix>Canon</normpraefix>
    </infos>
    <inhalt/>
</gesetz>`;
    io.dateien.set('/import/CIC 1917_vatikan.xml', inhalt);
    const bericht = await importierePfade(['/import/CIC 1917_vatikan.xml']);
    expect(bericht.fehler).toEqual([]);
    expect(io.dateien.get('gesetze/CIC 1917_vatikan.xml')).toContain(
      '<normgeber>vatikan</normgeber>',
    );
  },
);
